import {
  AreaDoProcedimento,
  ClinicProfile,
  PaymentMethod,
  Procedure,
  ProdutoDeEstoque,
  Professional,
  QuoteClinicSnapshot,
  QuoteItem,
  QuoteItemDetail,
  QuotePayment,
  QuotePaymentOption,
} from "../types";
import { QUOTE_DEFAULTS } from "./quoteCalc";

const novoId = (prefixo: string) =>
  `${prefixo}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/**
 * Detalhes que o item nasce mostrando. Os quatro campos que já existem no cadastro
 * do procedimento entram automaticamente; `quoteDetails` traz o que só faz sentido
 * em orçamento (produto, unidades, duração do efeito). A ordem segue o design:
 * áreas tratadas, campos próprios do procedimento, e por fim tempo e recuperação.
 */
export const montarDetalhesDoProcedimento = (procedure: Procedure): QuoteItemDetail[] => {
  const detalhes: QuoteItemDetail[] = [];

  const push = (titulo: string, valor?: string) => {
    const limpo = (valor || "").trim();
    if (limpo) detalhes.push({ id: novoId("qd"), titulo, valor: limpo });
  };

  push("Áreas tratadas", procedure.areasTreated?.join(", "));

  (procedure.quoteDetails || []).forEach((d) => push(d.titulo, d.valor));

  push("Tempo em clínica", procedure.duration);
  push("Recuperação", procedure.recoveryTime);
  push("Sessões", procedure.sessionsRecommended);

  return detalhes;
};

/** Sessões que o valor do procedimento cobre. 1 quando o cadastro não marcou "Mais de 1 sessão". */
export const sessoesDoProcedimento = (procedure: Pick<Procedure, "sessoesInclusas">): number => {
  const n = procedure.sessoesInclusas;
  return typeof n === "number" && isFinite(n) && n >= 2 ? Math.floor(n) : 1;
};

/**
 * Item de orçamento pré-preenchido a partir do catálogo. Tudo continua editável.
 * A profissional vem só da atribuição do próprio procedimento no catálogo
 * (`assignedDoctorIds`) — não existe mais uma "responsável pelo orçamento" padrão;
 * cada item nasce sem profissional quando o catálogo não define uma, e quem emite
 * escolhe na hora, item a item.
 */
export const montarItemDoProcedimento = (
  procedure: Procedure,
  professionals: Professional[] = []
): QuoteItem => {
  const professionalId = procedure.assignedDoctorIds?.find((id) =>
    professionals.some((p) => p.id === id)
  );
  const profissional = professionals.find((p) => p.id === professionalId);
  const sessoes = sessoesDoProcedimento(procedure);

  return {
    id: novoId("qi"),
    procedureId: procedure.id,
    categoria: procedure.category,
    titulo: procedure.title,
    professionalId,
    profissionalNome: profissional?.name,
    // O "a partir de" do catálogo não vale em orçamento: aqui o valor é firme
    valorTabela:
      procedure.promotionalPrice && procedure.promotionalPrice > 0
        ? procedure.promotionalPrice
        : procedure.price,
    temDesconto: false,
    maisDeUmaSessao: sessoes > 1,
    sessoes,
    detalhes: montarDetalhesDoProcedimento(procedure),
  };
};

/**
 * Item de uma área de um procedimento que exige seleção de área — "Depilação a Laser — Axilas".
 *
 * Preço, sessões e duração vêm da área; profissional e detalhes, do procedimento. "Áreas tratadas"
 * fica de fora: a área já está no título, e repeti-la num detalhe seria dizer a mesma coisa duas
 * vezes no PDF.
 */
export const montarItemDaArea = (
  procedure: Procedure,
  area: AreaDoProcedimento,
  professionals: Professional[] = []
): QuoteItem => {
  const base = montarItemDoProcedimento(procedure, professionals);
  const sessoes = sessoesDoProcedimento(area);
  return {
    ...base,
    areaId: area.id,
    titulo: `${procedure.title} — ${area.nome}`,
    valorTabela:
      area.promotionalPrice && area.promotionalPrice > 0 ? area.promotionalPrice : area.price,
    maisDeUmaSessao: sessoes > 1,
    sessoes,
    detalhes: montarDetalhesDoProcedimento({
      ...procedure,
      areasTreated: undefined,
      duration: area.duration || procedure.duration,
    }),
  };
};

/** Item em branco, para um procedimento que não está no catálogo. Sem profissional — quem emite escolhe. */
export const montarItemAvulso = (): QuoteItem => ({
  id: novoId("qi"),
  categoria: "",
  titulo: "",
  valorTabela: 0,
  temDesconto: false,
  maisDeUmaSessao: false,
  sessoes: 1,
  detalhes: [],
});

/** A categoria com que o item de produto sai no PDF, no lugar da do procedimento. */
export const CATEGORIA_DO_PRODUTO = "Produto";

const centavos = (valor: number): number => Math.round((valor + Number.EPSILON) * 100) / 100;

const positivo = (valor: unknown): number =>
  typeof valor === "number" && isFinite(valor) && valor > 0 ? valor : 0;

/**
 * Item de orçamento a partir de um produto do estoque: o nome, uma unidade e o valor repassado à
 * cliente. Tudo editável. Só o preço de venda entra — o custo do produto fica no estoque, porque
 * este documento é lido sem login pelo link.
 */
export const montarItemDoProduto = (
  produto: Pick<ProdutoDeEstoque, "id" | "nome" | "unidade" | "valorCliente">
): QuoteItem => {
  const unitario = positivo(produto.valorCliente);
  return {
    id: novoId("qi"),
    produtoId: produto.id,
    categoria: CATEGORIA_DO_PRODUTO,
    titulo: produto.nome,
    unidade: (produto.unidade || "un").trim(),
    quantidade: 1,
    valorUnitario: unitario,
    valorTabela: centavos(unitario),
    temDesconto: false,
    maisDeUmaSessao: false,
    sessoes: 1,
    detalhes: [],
  };
};

/**
 * O item de produto com outra quantidade ou outro valor unitário — o total da linha
 * (`valorTabela`) é refeito na mesma hora, e o desconto do item continua valendo sobre ele.
 */
export const ajustarItemDoProduto = (
  item: QuoteItem,
  mudanca: { quantidade?: number; valorUnitario?: number }
): QuoteItem => {
  const quantidade = mudanca.quantidade ?? item.quantidade ?? 1;
  const valorUnitario = mudanca.valorUnitario ?? item.valorUnitario ?? 0;
  return {
    ...item,
    quantidade,
    valorUnitario,
    valorTabela: centavos(positivo(quantidade) * positivo(valorUnitario)),
  };
};

/** Nova linha de forma de pagamento, com os valores padrão do design (sem juros em todas as parcelas). */
export const criarOpcaoPagamento = (forma: PaymentMethod = "pix"): QuotePaymentOption => ({
  id: novoId("pg"),
  forma,
  parcelas: forma === "cartao" ? 1 : undefined,
  parcelasSemJuros: forma === "cartao" ? 12 : undefined,
  temDesconto: false,
});

/**
 * Normaliza `pagamento` na leitura: documentos criados antes da seção virar uma
 * lista de opções guardavam um único objeto (`{forma, parcelas, ...}`, sem
 * `opcoes`). Envolve esse formato antigo numa lista de 1 item, para que o resto do
 * app nunca precise saber que essa migração existe.
 */
export const normalizarPagamento = (raw: unknown): QuotePayment => {
  const bruto = (raw ?? {}) as Partial<QuotePayment> & {
    forma?: PaymentMethod;
    parcelas?: number;
    temDesconto?: boolean;
    descontoPercentual?: number;
  };

  if (Array.isArray(bruto.opcoes)) {
    return { opcoes: bruto.opcoes, negociacao: bruto.negociacao };
  }

  if (bruto.forma) {
    const legado: QuotePaymentOption = {
      id: novoId("pg"),
      forma: bruto.forma,
      parcelas: bruto.parcelas,
      // Documentos antigos assumiam sempre sem juros, então o limite acompanha as parcelas escolhidas
      parcelasSemJuros: bruto.forma === "cartao" ? bruto.parcelas ?? 12 : undefined,
      temDesconto: !!bruto.temDesconto,
      descontoPercentual: bruto.descontoPercentual,
    };
    return { opcoes: [legado], negociacao: bruto.negociacao };
  }

  return { opcoes: [criarOpcaoPagamento("pix")], negociacao: bruto.negociacao };
};

/** Último recurso para orçamentos antigos abertos pela página pública, que não lê clinic_settings. */
export const SNAPSHOT_CLINICA_PADRAO: QuoteClinicSnapshot = {
  name: "La Vie Clinique",
  legalNotice: QUOTE_DEFAULTS.legalNotice,
};

/** Congela os dados da clínica que o documento precisa mostrar, hoje e daqui a um ano. */
export const montarSnapshotClinica = (clinic: ClinicProfile): QuoteClinicSnapshot => ({
  name: clinic.name,
  tagline: clinic.tagline || undefined,
  cityState: clinic.cityState || undefined,
  phone: clinic.phone || undefined,
  email: clinic.email || undefined,
  instagram: clinic.instagram || undefined,
  legalNotice: clinic.quoteLegalNotice?.trim() || QUOTE_DEFAULTS.legalNotice,
});

/**
 * Ponto único de migração: aplicado a todo `Quote` vindo do Firestore, para que o
 * resto do app sempre veja o formato atual de `pagamento` e de `status`, não importa a
 * idade do documento.
 *
 * O status `aceito` deixou de existir — virou `pago` (ver `QuoteStoredStatus`). O documento
 * antigo não é regravado: é lido como pago, com a data de aceite no lugar da de pagamento, e
 * só troca de fato no banco quando alguém mexer no status dele de novo.
 */
export const normalizarQuote = <
  T extends { pagamento?: unknown; status?: string; pagoEm?: string; aceitoEm?: string },
>(
  quote: T
): T & { pagamento: QuotePayment } =>
  ({
    ...quote,
    ...(quote.status === "aceito"
      ? { status: "pago", pagoEm: quote.pagoEm || quote.aceitoEm }
      : {}),
    pagamento: normalizarPagamento(quote.pagamento),
  }) as T & { pagamento: QuotePayment };

/** Cópia profunda de itens com IDs novos — usada ao duplicar ou substituir um orçamento. */
export const clonarItens = (itens: QuoteItem[]): QuoteItem[] =>
  itens.map((item) => ({
    ...item,
    id: novoId("qi"),
    detalhes: item.detalhes.map((d) => ({ ...d, id: novoId("qd") })),
  }));

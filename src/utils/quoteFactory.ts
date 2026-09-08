import {
  ClinicProfile,
  PaymentMethod,
  Procedure,
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
    maisDeUmaSessao: false,
    sessoes: 1,
    detalhes: montarDetalhesDoProcedimento(procedure),
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
 * resto do app sempre veja o formato atual de `pagamento`, não importa a idade do
 * documento.
 */
export const normalizarQuote = <T extends { pagamento?: unknown }>(
  quote: T
): T & { pagamento: QuotePayment } => ({
  ...quote,
  pagamento: normalizarPagamento(quote.pagamento),
});

/** Cópia profunda de itens com IDs novos — usada ao duplicar ou substituir um orçamento. */
export const clonarItens = (itens: QuoteItem[]): QuoteItem[] =>
  itens.map((item) => ({
    ...item,
    id: novoId("qi"),
    detalhes: item.detalhes.map((d) => ({ ...d, id: novoId("qd") })),
  }));

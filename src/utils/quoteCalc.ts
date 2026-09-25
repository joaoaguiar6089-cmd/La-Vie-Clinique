import {
  ClinicProfile,
  PaymentMethod,
  Quote,
  QuoteItem,
  QuotePayment,
  QuoteStatus,
} from "../types";
import { isLaserCategory } from "./templateMatching";

/** Padrões do módulo quando a clínica ainda não configurou nada. */
export const QUOTE_DEFAULTS = {
  validityDays: 30,
  combinedDiscountPerItem: 2, // % sugerido por procedimento
  combinedDiscountCap: 10, // teto do desconto de plano combinado, em %
  legalNotice:
    "Este orçamento é uma estimativa baseada na avaliação presencial e pode ser ajustado após a anamnese completa. Valores sujeitos a alteração após a data de validade. Não substitui prescrição ou avaliação médica.",
  openingTemplate:
    "{primeiroNome}, abaixo está o plano que desenhamos para você. Conte com a gente para alcançar sua melhor versão ✨",
} as const;

const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

const isPositive = (value: number | undefined | null): value is number =>
  typeof value === "number" && isFinite(value) && value > 0;

/**
 * Valor cobrado pelo item. O desconto só vale quando o novo valor é um número
 * válido e realmente menor que o de tabela — assim um campo pela metade ou um
 * "desconto" maior que o preço nunca vira um percentual negativo no PDF.
 */
export const itemValorFinal = (item: QuoteItem): number => {
  const tabela = isPositive(item.valorTabela) ? item.valorTabela : 0;
  if (!item.temDesconto) return round2(tabela);
  const comDesconto = item.valorComDesconto;
  if (typeof comDesconto !== "number" || !isFinite(comDesconto)) return round2(tabela);
  if (comDesconto < 0 || comDesconto >= tabela) return round2(tabela);
  return round2(comDesconto);
};

/** Percentual de desconto do item, derivado dos valores — nunca é digitado. */
export const itemDescontoPercentual = (item: QuoteItem): number => {
  const tabela = isPositive(item.valorTabela) ? item.valorTabela : 0;
  if (tabela === 0) return 0;
  const final = itemValorFinal(item);
  if (final >= tabela) return 0;
  return round2(((tabela - final) / tabela) * 100);
};

/** True quando o item tem um desconto válido para exibir (valor riscado + "desconto de X%"). */
export const itemTemDescontoVisivel = (item: QuoteItem): boolean =>
  item.temDesconto && itemValorFinal(item) < item.valorTabela;

/** Quantidade de sessões a exibir; só aparece no PDF quando for mais de 1. */
export const itemSessoes = (item: QuoteItem): number =>
  item.maisDeUmaSessao && isPositive(item.sessoes) ? Math.floor(item.sessoes) : 1;

/** Nome de exibição de cada forma — usado no formulário, no PDF e na página pública. */
export const NOME_FORMA_PAGAMENTO: Record<PaymentMethod, string> = {
  pix: "Pix",
  cartao: "Cartão de crédito",
  dinheiro: "Dinheiro",
};

export interface QuotePaymentOptionResult {
  id: string;
  forma: PaymentMethod;
  /** totalBruto já com o desconto desta opção aplicado — o que essa forma efetivamente cobra. */
  valorFinal: number;
  descontoValor: number;
  parcelas: number; // 1 quando não é cartão ou não foi parcelado
  parcela: number | null; // valorFinal / parcelas, só quando parcelas > 1
  /**
   * Primeira parcela que pode carregar juros da operadora, ou null quando todas as
   * parcelas escolhidas estão dentro do limite sem juros. O valor da parcela continua
   * sendo nominal (valorFinal/parcelas): sem a taxa da maquininha não há como calcular
   * o valor real com juros, então o PDF apenas avisa a partir de qual parcela isso pode entrar.
   */
  parcelasComJurosAPartir: number | null;
}

export interface QuoteTotals {
  /** Soma dos valores já com o desconto de cada item. */
  subtotal: number;
  descontoCombinadoValor: number;
  /** Subtotal menos o desconto de plano combinado — base de cálculo de toda forma de pagamento. */
  totalBruto: number;
  /** Uma linha por forma de pagamento aceita, na ordem cadastrada. */
  opcoesPagamento: QuotePaymentOptionResult[];
  /** O número grande do bloco preto — valor da primeira forma de pagamento (a principal). */
  total: number;
  /** Quanto o total representa de abatimento sobre a soma dos valores de tabela, em %. */
  descontoEfetivoPercentual: number;
}

/** Subconjunto do Quote necessário para calcular — o formulário chama antes de existir um Quote completo. */
export interface QuoteCalcInput {
  itens: QuoteItem[];
  temDescontoCombinado: boolean;
  descontoCombinadoPercentual?: number;
  pagamento: QuotePayment;
}

const percentualValido = (value: number | undefined): number => {
  if (typeof value !== "number" || !isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 100);
};

/**
 * Cada forma de pagamento aceita é uma linha independente, com seu próprio desconto —
 * a primeira da lista é a "principal" e dá o número grande do bloco preto; as demais
 * aparecem como alternativas logo abaixo, no mesmo espírito da linha "se preferir
 * Pix à vista" do design original, agora generalizada para N formas.
 */
export const calcularOrcamento = (input: QuoteCalcInput): QuoteTotals => {
  const itens = input.itens ?? [];

  const somaTabela = round2(
    itens.reduce((acc, item) => acc + (isPositive(item.valorTabela) ? item.valorTabela : 0), 0)
  );
  const subtotal = round2(itens.reduce((acc, item) => acc + itemValorFinal(item), 0));

  const pctCombinado = input.temDescontoCombinado
    ? percentualValido(input.descontoCombinadoPercentual)
    : 0;
  const descontoCombinadoValor = round2((subtotal * pctCombinado) / 100);
  const totalBruto = round2(subtotal - descontoCombinadoValor);

  const opcoesPagamento: QuotePaymentOptionResult[] = (input.pagamento?.opcoes ?? []).map(
    (opcao) => {
      const pct = opcao.temDesconto ? percentualValido(opcao.descontoPercentual) : 0;
      const descontoValor = round2((totalBruto * pct) / 100);
      const valorFinal = round2(totalBruto - descontoValor);
      const parcelas = opcao.forma === "cartao" ? Math.max(1, Math.round(opcao.parcelas ?? 1)) : 1;
      const parcela = parcelas > 1 ? round2(valorFinal / parcelas) : null;
      const semJuros = opcao.parcelasSemJuros;
      const parcelasComJurosAPartir =
        opcao.forma === "cartao" && typeof semJuros === "number" && parcelas > semJuros
          ? semJuros + 1
          : null;

      return { id: opcao.id, forma: opcao.forma, valorFinal, descontoValor, parcelas, parcela, parcelasComJurosAPartir };
    }
  );

  const total = opcoesPagamento[0]?.valorFinal ?? totalBruto;

  const descontoEfetivoPercentual =
    somaTabela > 0 ? round2(((somaTabela - total) / somaTabela) * 100) : 0;

  return {
    subtotal,
    descontoCombinadoValor,
    totalBruto,
    opcoesPagamento,
    total,
    descontoEfetivoPercentual,
  };
};

/**
 * Quantos "procedimentos" um conjunto de itens representa para efeito do desconto de plano
 * combinado — **todas as áreas de laser contam como uma só**.
 *
 * Cinco itens num orçamento normal são mesmo um plano combinado: botox, preenchimento,
 * bioestimulador, fio e skinbooster. Cinco áreas de depilação a laser são uma venda só, e o mapa
 * corporal torna trivial marcar cinco. Sem esta contagem, todo orçamento de laser nasceria com a
 * sugestão no teto de 10% — um desconto que ninguém decidiu dar, aceito por quem estivesse com
 * pressa. Num orçamento misto, laser + botox continuam valendo 2.
 */
export const contarProcedimentosParaDesconto = (itens: Pick<QuoteItem, "categoria">[]): number => {
  let naoLaser = 0;
  let temLaser = false;
  for (const item of itens) {
    if (isLaserCategory(item.categoria)) temLaser = true;
    else naoLaser += 1;
  }
  return naoLaser + (temLaser ? 1 : 0);
};

/** Sugestão do desconto de plano combinado: % por procedimento, limitado ao teto. Editável depois. */
export const sugerirDescontoCombinado = (
  quantidadeItens: number,
  clinic?: Pick<ClinicProfile, "quoteCombinedDiscountPerItem" | "quoteCombinedDiscountCap">
): number => {
  if (quantidadeItens < 2) return 0;
  const porItem = clinic?.quoteCombinedDiscountPerItem ?? QUOTE_DEFAULTS.combinedDiscountPerItem;
  const teto = clinic?.quoteCombinedDiscountCap ?? QUOTE_DEFAULTS.combinedDiscountCap;
  return round2(Math.min(quantidadeItens * porItem, teto));
};

/** Data de validade padrão a partir da emissão. Datas em ISO. */
export const calcularDataValidade = (
  dataEmissaoISO: string,
  clinic?: Pick<ClinicProfile, "quoteValidityDays">
): string => {
  const dias = clinic?.quoteValidityDays ?? QUOTE_DEFAULTS.validityDays;
  const base = new Date(dataEmissaoISO);
  if (isNaN(base.getTime())) return dataEmissaoISO;
  base.setDate(base.getDate() + dias);
  return base.toISOString();
};

/**
 * Status para exibição. `expirado` nunca é gravado no banco: é derivado aqui,
 * então nunca fica desatualizado e não depende de rotina agendada.
 */
export const resolveQuoteStatus = (
  quote: Pick<Quote, "status" | "dataValidade">,
  agora: Date = new Date()
): QuoteStatus => {
  // Pago, recusado e cancelado são estados finais; rascunho nunca "vence" porque nem saiu daqui
  if (quote.status !== "enviado") return quote.status;
  const validade = new Date(quote.dataValidade);
  if (isNaN(validade.getTime())) return quote.status;
  return validade < agora ? "expirado" : quote.status;
};

/** Depois de enviado o orçamento trava: ajuste vira substituição, com número novo. */
export const isQuoteEditavel = (quote: Pick<Quote, "status">): boolean =>
  quote.status === "rascunho";

/**
 * Se o orçamento pode ser substituído por um novo, com número próprio.
 *
 * Só depois de enviado (antes disso, edita-se o rascunho), só se ninguém o substituiu ainda, e
 * nunca cancelado ou pago — pago não se substitui: o dinheiro entrou por este, com este número.
 * Mora aqui porque a tela de Orçamentos, a página da paciente e a linha do tempo da tela Hoje
 * oferecem o mesmo botão.
 */
export const podeSubstituir = (
  quote: Pick<Quote, "status" | "dataValidade" | "substituidoPor">
): boolean => {
  const status = resolveQuoteStatus(quote);
  return (
    !isQuoteEditavel(quote) && !quote.substituidoPor && status !== "cancelado" && status !== "pago"
  );
};

/**
 * Se a profissional ainda pode dizer como terminou: a cliente pagou ou recusou.
 *
 * Vale para rascunho e enviado — inclusive o enviado que passou da validade, porque um Pix que
 * chega atrasado continua sendo dinheiro recebido. Orçamento substituído não entra: quem vale
 * agora é o novo, e é nele que o pagamento deve ser registrado.
 */
export const podeRegistrarDesfecho = (
  quote: Pick<Quote, "status" | "substituidoPor">
): boolean =>
  (quote.status === "rascunho" || quote.status === "enviado") && !quote.substituidoPor;

/**
 * Para onde volta um orçamento cujo desfecho foi desfeito: enviado, se o link já tinha saído;
 * rascunho, se foi marcado direto, sem nunca ter sido compartilhado.
 */
export const statusAntesDoDesfecho = (
  quote: Pick<Quote, "enviadoEm">
): "rascunho" | "enviado" => (quote.enviadoEm ? "enviado" : "rascunho");

/** Mensagem de abertura sugerida, com o primeiro nome da paciente aplicado ao template. */
export const montarTextoApresentacao = (
  pacienteNome: string,
  clinic?: Pick<ClinicProfile, "quoteOpeningTemplate">
): string => {
  const template = clinic?.quoteOpeningTemplate?.trim() || QUOTE_DEFAULTS.openingTemplate;
  const primeiroNome = pacienteNome.trim().split(/\s+/)[0] ?? "";
  return template.replace(/\{primeiroNome\}/g, primeiroNome);
};

/** Formata o número do orçamento a partir do ano e da sequência: 2026-0148. */
export const formatQuoteNumber = (ano: number, sequencia: number): string =>
  `${ano}-${String(sequencia).padStart(4, "0")}`;

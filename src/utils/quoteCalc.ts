import { Quote, QuoteItem, QuotePayment, QuoteStatus, ClinicProfile } from "../types";

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

export interface QuoteTotals {
  /** Soma dos valores já com o desconto de cada item. */
  subtotal: number;
  descontoCombinadoValor: number;
  /** Subtotal menos o desconto de plano combinado. */
  totalBruto: number;
  /** Valor do desconto de pagamento — abatido do total (Pix/dinheiro) ou apenas ofertado (cartão). */
  descontoPagamentoValor: number;
  /** O número grande do bloco preto. */
  total: number;
  /** `total / parcelas`, somente em cartão parcelado em 2× ou mais. Sem juros. */
  parcela: number | null;
  /** Valor da linha "se preferir Pix ou dinheiro à vista" — só existe em cartão com desconto. */
  alternativaAVista: number | null;
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
 * Regra híbrida do desconto de pagamento, que é o que faz o design fechar:
 * em Pix ou dinheiro o desconto entra no total; em cartão o total continua sendo
 * o valor do cartão e o desconto vira a alternativa à vista logo abaixo.
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

  const pagamento = input.pagamento;
  const pctPagamento = pagamento?.temDesconto ? percentualValido(pagamento.descontoPercentual) : 0;
  const descontoPagamentoValor = round2((totalBruto * pctPagamento) / 100);
  const ehCartao = pagamento?.forma === "cartao";

  const total = ehCartao ? totalBruto : round2(totalBruto - descontoPagamentoValor);
  const alternativaAVista =
    ehCartao && pctPagamento > 0 ? round2(totalBruto - descontoPagamentoValor) : null;

  const parcelas = pagamento?.parcelas ?? 1;
  const parcela = ehCartao && parcelas > 1 ? round2(total / parcelas) : null;

  const descontoEfetivoPercentual =
    somaTabela > 0 ? round2(((somaTabela - total) / somaTabela) * 100) : 0;

  return {
    subtotal,
    descontoCombinadoValor,
    totalBruto,
    descontoPagamentoValor,
    total,
    parcela,
    alternativaAVista,
    descontoEfetivoPercentual,
  };
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
  // Cancelado e aceito são estados finais; rascunho nunca "vence" porque nem saiu daqui
  if (
    quote.status === "aceito" ||
    quote.status === "rascunho" ||
    quote.status === "cancelado"
  ) {
    return quote.status;
  }
  const validade = new Date(quote.dataValidade);
  if (isNaN(validade.getTime())) return quote.status;
  return validade < agora ? "expirado" : quote.status;
};

/** Depois de enviado o orçamento trava: ajuste vira substituição, com número novo. */
export const isQuoteEditavel = (quote: Pick<Quote, "status">): boolean =>
  quote.status === "rascunho";

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

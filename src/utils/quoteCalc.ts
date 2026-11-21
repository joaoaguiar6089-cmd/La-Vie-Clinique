import {
  ClinicProfile,
  PaymentMethod,
  Quote,
  QuoteItem,
  QuoteParcelamento,
  QuotePayment,
  QuoteRecebimento,
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

/** Item de produto do estoque, e não de procedimento. Ver `QuoteItem.produtoId`. */
export const itemEhProduto = (item: Pick<QuoteItem, "produtoId">): boolean => !!item.produtoId;

/** Quantas unidades o item de produto leva — nunca zero, para o valor unitário poder ser derivado. */
export const itemQuantidade = (item: Pick<QuoteItem, "quantidade">): number =>
  isPositive(item.quantidade) ? item.quantidade : 1;

/**
 * Valor de uma unidade do item de produto: o gravado, ou — num item sem ele — o total da linha
 * dividido pela quantidade. Quatro casas, como o preço por unidade do estoque.
 */
export const itemValorUnitario = (
  item: Pick<QuoteItem, "valorTabela" | "quantidade" | "valorUnitario">
): number => {
  if (isPositive(item.valorUnitario)) return item.valorUnitario;
  const tabela = isPositive(item.valorTabela) ? item.valorTabela : 0;
  return Math.round((tabela / itemQuantidade(item)) * 10000) / 10000;
};

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
 * combinado — **as áreas de um mesmo procedimento contam como um só**.
 *
 * Cinco itens num orçamento normal são mesmo um plano combinado: botox, preenchimento,
 * bioestimulador, fio e skinbooster. Cinco áreas de depilação a laser são uma venda só, e o mapa
 * torna trivial marcar cinco. Sem esta contagem, todo orçamento de laser nasceria com a sugestão
 * no teto de 10% — um desconto que ninguém decidiu dar, aceito por quem estivesse com pressa. Num
 * orçamento misto, laser + botox continuam valendo 2.
 *
 * Itens de laser de antes do mapa morar no procedimento (cada área era um procedimento, sem
 * `areaId`) seguem contando juntos como um.
 *
 * Produto do estoque não conta: o protetor solar vendido junto não faz do botox um plano combinado.
 */
export const contarProcedimentosParaDesconto = (
  itens: Pick<QuoteItem, "categoria" | "produtoId" | "procedureId" | "areaId">[]
): number => {
  let avulsos = 0;
  const grupos = new Set<string>();
  for (const item of itens) {
    if (itemEhProduto(item)) continue;
    if (item.areaId) grupos.add(`areas:${item.procedureId || ""}`);
    else if (isLaserCategory(item.categoria)) grupos.add("laser-antigo");
    else avulsos += 1;
  }
  return avulsos + grupos.size;
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

// ==========================================
// PARCELADO SEM CARTÃO
// ==========================================

/** Até quantas parcelas a negociação direta aceita, depois da entrada. */
export const PARCELAS_SEM_CARTAO_MAX = 24;

export interface ParcelamentoCalculado {
  /** O valor negociado — o total do orçamento. */
  total: number;
  /** 0 quando não há entrada. */
  entrada: number;
  parcelas: number;
  /** (total − entrada) ÷ parcelas, em centavos. A última absorve o arredondamento. */
  valorParcela: number;
  /** Quantos pagamentos ao todo: a entrada, se houver, mais as parcelas. */
  pagamentos: number;
}

/** O plano do parcelado sem cartão sobre um total, ou `null` quando o orçamento não é parcelado. */
export const calcularParcelamento = (
  total: number,
  parcelamento?: QuoteParcelamento | null
): ParcelamentoCalculado | null => {
  if (!parcelamento) return null;
  const base = isPositive(total) ? round2(total) : 0;
  const parcelas = Math.min(
    PARCELAS_SEM_CARTAO_MAX,
    Math.max(1, Math.round(Number(parcelamento.parcelas) || 1))
  );
  const entrada = isPositive(parcelamento.entrada) ? Math.min(round2(parcelamento.entrada), base) : 0;
  const valorParcela = round2((base - entrada) / parcelas);
  return { total: base, entrada, parcelas, valorParcela, pagamentos: parcelas + (entrada > 0 ? 1 : 0) };
};

/** O orçamento é pago parcelado sem cartão — a negociação direta, acompanhada pelos recibos. */
export const ehParcelado = (quote: Pick<Quote, "pagamento">): boolean => !!quote.pagamento?.parcelamento;

/** "Entrada de R$ 5.000,00 + 5× de R$ 1.040,00", ou "6× de R$ 1.700,00" sem entrada. */
export const resumoDoParcelamento = (
  plano: ParcelamentoCalculado,
  formatar: (valor: number) => string
): string =>
  plano.entrada > 0
    ? `Entrada de ${formatar(plano.entrada)} + ${plano.parcelas}× de ${formatar(plano.valorParcela)}`
    : `${plano.parcelas}× de ${formatar(plano.valorParcela)}`;

const brl = (valor: number): string =>
  valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * "R$ 5.000,00 + 5 × R$ 1.040,00" — o valor da linha do parcelado no PDF e no link. Num texto só:
 * o html2canvas posiciona cada pedaço de texto à parte e encavalava o "+" entre dois deles.
 */
export const valorDoParcelado = (plano: ParcelamentoCalculado): string =>
  // Espaços inseparáveis em "5 × R$ 1.040,00": na tela estreita, a quebra fica depois do "+"
  `${plano.entrada > 0 ? `${brl(plano.entrada)} + ` : ""}${plano.parcelas}\u00a0×\u00a0${brl(plano.valorParcela)}`;

/** "Recebido R$ 5.000,00 de R$ 10.200,00 · falta R$ 5.200,00" (ou "· quitado"). Num texto só, idem. */
export const recebidoDoParcelado = (p: ProgressoDoParcelamento): string =>
  `Recebido ${brl(p.recebido)} de ${brl(p.plano.total)} · ${p.completo ? "quitado" : `falta ${brl(p.pendente)}`}`;

/** O nome do pagamento de número `ordem` (1 = o primeiro): "Entrada", "Parcela 2 de 5". */
export const rotuloDoPagamento = (plano: ParcelamentoCalculado, ordem: number): string => {
  if (plano.entrada > 0 && ordem === 1) return "Entrada";
  if (ordem > plano.pagamentos) return "Saldo restante";
  const parcela = plano.entrada > 0 ? ordem - 1 : ordem;
  return `Parcela ${parcela} de ${plano.parcelas}`;
};

export interface ProgressoDoParcelamento {
  plano: ParcelamentoCalculado;
  recebimentos: QuoteRecebimento[];
  recebido: number;
  /** O que falta — nunca negativo. */
  pendente: number;
  /** 0 a 100. */
  percentual: number;
  completo: boolean;
  /** O número do próximo pagamento (1 = o primeiro). */
  proximaOrdem: number;
  /** "Entrada", "Parcela 2 de 5", "Saldo restante". */
  proximoRotulo: string;
  /**
   * Quanto o próximo pagamento deve ser: a entrada, enquanto ela não veio; depois, a parcela. Nunca
   * passa do que falta — e o último pagamento do plano é sempre o que falta, para o arredondamento
   * da parcela não deixar um centavo pendente.
   */
  proximoValor: number;
}

/**
 * Quanto já entrou de um orçamento parcelado sem cartão e o que vem em seguida, ou `null` quando
 * ele não é parcelado. Lê os recebimentos gravados no orçamento — ou os que quem chama passar (o
 * formulário do recibo, que sabe dos recibos antes da sincronização).
 */
export const progressoDoParcelamento = (
  quote: Pick<Quote, "pagamento" | "total" | "recebimentos">,
  recebimentos: QuoteRecebimento[] = quote.recebimentos || []
): ProgressoDoParcelamento | null => {
  const plano = calcularParcelamento(quote.total, quote.pagamento?.parcelamento);
  if (!plano) return null;
  const recebido = round2(recebimentos.reduce((s, r) => s + (isPositive(r.valor) ? r.valor : 0), 0));
  const pendente = Math.max(0, round2(plano.total - recebido));
  const completo = recebimentos.length > 0 && pendente < 0.01;
  const proximaOrdem = recebimentos.length + 1;
  const esperado =
    plano.entrada > 0 && proximaOrdem === 1
      ? plano.entrada
      : proximaOrdem >= plano.pagamentos
      ? pendente
      : plano.valorParcela;
  return {
    plano,
    recebimentos,
    recebido,
    pendente,
    percentual: plano.total > 0 ? Math.min(100, Math.round((recebido / plano.total) * 100)) : 0,
    completo,
    proximaOrdem,
    proximoRotulo: rotuloDoPagamento(plano, proximaOrdem),
    proximoValor: round2(Math.min(esperado, pendente)),
  };
};

/**
 * Orçamento parcelado com algum pagamento recebido e ainda não quitado — "em negociação". Não é um
 * status gravado: o gravado continua `enviado`, e a interface troca só o rótulo.
 */
export const estaEmNegociacao = (quote: Pick<Quote, "status" | "pagamento" | "recebimentos">): boolean =>
  ehParcelado(quote) &&
  (quote.recebimentos?.length ?? 0) > 0 &&
  quote.status !== "pago" &&
  quote.status !== "cancelado";

/**
 * Status para exibição. `expirado` nunca é gravado no banco: é derivado aqui,
 * então nunca fica desatualizado e não depende de rotina agendada.
 */
export const resolveQuoteStatus = (
  quote: Pick<Quote, "status" | "dataValidade"> & Partial<Pick<Quote, "recebimentos">>,
  agora: Date = new Date()
): QuoteStatus => {
  // Pago, recusado e cancelado são estados finais; rascunho nunca "vence" porque nem saiu daqui
  if (quote.status !== "enviado") return quote.status;
  // Parcelado que já começou a ser pago não vence: a cliente está pagando, a validade era da proposta
  if ((quote.recebimentos?.length ?? 0) > 0) return quote.status;
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
  quote: Pick<Quote, "status" | "dataValidade" | "substituidoPor"> & Partial<Pick<Quote, "recebimentos">>
): boolean => {
  const status = resolveQuoteStatus(quote);
  return (
    !isQuoteEditavel(quote) &&
    !quote.substituidoPor &&
    status !== "cancelado" &&
    status !== "pago" &&
    // Parcelado em andamento também não: já entrou dinheiro por este número
    !(quote.recebimentos?.length)
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

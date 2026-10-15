import { ClinicProfile, FormaDoRecibo, Quote, Recibo, ReciboClinica } from '../types';
import { formatBRL, formatCpf } from './formatters';
import { calcularOrcamento } from './quoteCalc';

/**
 * As regras da nota de recibo que não dependem de tela nem de banco: os nomes das formas de
 * pagamento, o valor por extenso, a frase de quitação e o que o recibo herda de um orçamento.
 */

export const NOME_FORMA_DO_RECIBO: Record<FormaDoRecibo, string> = {
  pix: 'Pix',
  debito: 'Cartão de débito',
  credito: 'Cartão de crédito',
  dinheiro: 'Dinheiro',
};

/** O rótulo curto das pílulas da lista: "Pix", "Débito", "Crédito 3×". */
export const NOME_CURTO_DA_FORMA: Record<FormaDoRecibo, string> = {
  pix: 'Pix',
  debito: 'Débito',
  credito: 'Crédito',
  dinheiro: 'Dinheiro',
};

export const PARCELAS_MAXIMAS = 12;

/** Quantas vezes, já saneado: só o crédito parcela, e nunca menos de 1. */
export const parcelasDoRecibo = (r: Pick<Recibo, 'forma' | 'parcelas'>): number =>
  r.forma === 'credito' ? Math.min(PARCELAS_MAXIMAS, Math.max(1, Math.round(r.parcelas || 1))) : 1;

/** "Crédito 3×", "Crédito à vista", "Pix". */
export const rotuloCurtoDoPagamento = (r: Pick<Recibo, 'forma' | 'parcelas'>): string => {
  if (r.forma !== 'credito') return NOME_CURTO_DA_FORMA[r.forma];
  const n = parcelasDoRecibo(r);
  return n > 1 ? `Crédito ${n}×` : 'Crédito à vista';
};

/** "À vista" ou "Parcelado em 3× de R$ 500,00". */
export const condicaoDoPagamento = (r: Pick<Recibo, 'forma' | 'parcelas' | 'valor'>): string => {
  const n = parcelasDoRecibo(r);
  return n > 1 ? `Parcelado em ${n}× de ${formatBRL(r.valor / n)}` : 'À vista';
};

// ==========================================
// VALOR POR EXTENSO
// ==========================================

const UNIDADES = [
  'zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove',
  'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove',
];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = [
  '', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos',
  'seiscentos', 'setecentos', 'oitocentos', 'novecentos',
];

/** De 1 a 999: "cento e vinte e três". */
const ateMil = (n: number): string => {
  if (n === 100) return 'cem';
  const partes: string[] = [];
  const c = Math.floor(n / 100);
  const resto = n % 100;
  if (c > 0) partes.push(CENTENAS[c]);
  if (resto > 0) {
    if (resto < 20) partes.push(UNIDADES[resto]);
    else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      partes.push(u > 0 ? `${DEZENAS[d]} e ${UNIDADES[u]}` : DEZENAS[d]);
    }
  }
  return partes.join(' e ');
};

const GRUPOS: [string, string][] = [
  ['', ''],
  ['mil', 'mil'],
  ['milhão', 'milhões'],
  ['bilhão', 'bilhões'],
];

/** Um número inteiro por extenso, como se lê num cheque: "mil e quinhentos", "dois mil trezentos". */
export const inteiroPorExtenso = (n: number): string => {
  if (n === 0) return 'zero';
  const grupos: number[] = [];
  let resto = n;
  while (resto > 0) {
    grupos.push(resto % 1000);
    resto = Math.floor(resto / 1000);
  }

  // Do grupo mais alto para o mais baixo, pulando os zerados
  const lidos: { valor: number; texto: string }[] = [];
  for (let i = grupos.length - 1; i >= 0; i--) {
    const g = grupos[i];
    if (g === 0) continue;
    const [singular, plural] = GRUPOS[i] || ['', ''];
    // "mil", nunca "um mil"
    const numero = i === 1 && g === 1 ? '' : ateMil(g);
    const escala = i === 0 ? '' : g === 1 ? singular : plural;
    lidos.push({ valor: g, texto: [numero, escala].filter(Boolean).join(' ') });
  }

  // O "e" entre grupos só entra antes do último, e só quando ele é menor que cem ou uma centena
  // redonda: "mil e cem", "mil e cinquenta", mas "mil duzentos e trinta".
  return lidos
    .map((l, i) => {
      if (i === 0) return l.texto;
      const ultimo = i === lidos.length - 1;
      return ultimo && (l.valor < 100 || l.valor % 100 === 0) ? `e ${l.texto}` : l.texto;
    })
    .join(' ');
};

/** "mil e quinhentos reais e cinquenta centavos". É o que vai entre parênteses no recibo. */
export const valorPorExtenso = (valor: number): string => {
  const totalCentavos = Math.round(Math.abs(valor || 0) * 100);
  const reais = Math.floor(totalCentavos / 100);
  const centavos = totalCentavos % 100;

  const partes: string[] = [];
  if (reais > 0) {
    // "um milhão de reais", mas "um milhão e quinhentos mil reais"
    const de = reais >= 1_000_000 && reais % 1_000_000 === 0 ? ' de' : '';
    partes.push(`${inteiroPorExtenso(reais)}${de} ${reais === 1 ? 'real' : 'reais'}`);
  }
  if (centavos > 0) {
    partes.push(`${inteiroPorExtenso(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`);
  }
  return partes.length > 0 ? partes.join(' e ') : 'zero real';
};

// ==========================================
// DATAS
// ==========================================

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/** "2026-10-15" (ou ISO) → "15 de outubro de 2026". Para a linha de local e data do recibo. */
export const dataPorExtenso = (valor?: string): string => {
  if (!valor) return '';
  const d = valor.length === 10 ? new Date(`${valor}T12:00:00`) : new Date(valor);
  if (isNaN(d.getTime())) return '';
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
};

/** ISO → "2026-10-15" no fuso de quem usa — o valor de um campo de data. */
export const isoParaDia = (iso?: string): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// ==========================================
// TEXTO DO RECIBO
// ==========================================

/** "123.456.789-01", ou nada quando não há os 11 dígitos. */
export const cpfLegivel = (cpf?: string): string => {
  const digitos = (cpf || '').replace(/\D/g, '');
  return digitos.length === 11 ? formatCpf(digitos) : '';
};

/** "12345678000190" → "12.345.678/0001-90". Progressivo: serve também ao campo enquanto se digita. */
export const formatCnpj = (raw?: string): string =>
  (raw || '')
    .replace(/\D/g, '')
    .slice(0, 14)
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');

/**
 * A declaração do recibo em partes, para a página poder destacar o nome e o valor sem montar a
 * frase duas vezes: "Recebemos de [nome], CPF …, a importância de [R$ …] (por extenso), referente
 * a …. Para clareza, firmamos o presente, dando quitação do valor recebido."
 */
export const declaracaoDoRecibo = (
  r: Pick<Recibo, 'pacienteNome' | 'pacienteCpf' | 'valor' | 'referente' | 'quoteNumero'>
) => {
  const cpf = cpfLegivel(r.pacienteCpf);
  const referente = (r.referente || '').trim().replace(/[.\s]+$/, '');
  const doOrcamento = r.quoteNumero && !referente.includes(r.quoteNumero)
    ? `, conforme o orçamento Nº\u00A0${r.quoteNumero}`
    : '';
  return {
    antesDoNome: 'Recebemos de ',
    nome: r.pacienteNome,
    depoisDoNome: `${cpf ? `, CPF ${cpf},` : ''} a importância de `,
    valor: formatBRL(r.valor),
    extenso: `(${valorPorExtenso(r.valor)})`,
    fim:
      `${referente ? `, referente a ${referente}` : ''}${doOrcamento}. ` +
      'Para clareza, firmamos o presente, dando quitação do valor recebido.',
  };
};

/** Congela os dados da clínica que o recibo mostra. */
export const montarClinicaDoRecibo = (clinic: ClinicProfile): ReciboClinica => ({
  name: clinic.name,
  tagline: clinic.tagline || undefined,
  cityState: clinic.cityState || undefined,
  address: clinic.address || undefined,
  phone: clinic.phone || undefined,
  email: clinic.email || undefined,
  instagram: clinic.instagram || undefined,
  cnpj: clinic.cnpj?.replace(/\D/g, '') || clinic.cnpj?.trim() || undefined,
});

// ==========================================
// O QUE O RECIBO HERDA DO ORÇAMENTO
// ==========================================

/** "Botox — terço superior, Preenchimento labial". */
export const referenteDoOrcamento = (quote: Pick<Quote, 'itens'>): string =>
  quote.itens
    .map((i) => i.titulo.trim())
    .filter(Boolean)
    .join(', ');

/** Uma forma de pagamento aceita pelo orçamento, já como o recibo a registraria. */
export interface PagamentoSugerido {
  id: string;
  rotulo: string;
  forma: FormaDoRecibo;
  parcelas: number;
  valor: number;
}

/**
 * As formas que o orçamento aceitava, cada uma com o valor que ela cobra — o atalho "como a
 * cliente pagou?" do formulário. A primeira é a principal, que é também o total do orçamento.
 *
 * Cartão do orçamento vira crédito: o orçamento não distingue débito, e é o crédito que parcela.
 */
export const pagamentosSugeridos = (quote: Quote): PagamentoSugerido[] => {
  const totais = calcularOrcamento(quote);
  return totais.opcoesPagamento.map((o) => {
    const forma: FormaDoRecibo = o.forma === 'cartao' ? 'credito' : o.forma;
    const parcelas = forma === 'credito' ? o.parcelas : 1;
    return {
      id: o.id,
      forma,
      parcelas,
      valor: o.valorFinal,
      rotulo: `${rotuloCurtoDoPagamento({ forma, parcelas })} · ${formatBRL(o.valorFinal)}`,
    };
  });
};

// ==========================================
// LISTAS
// ==========================================

/** Os recibos de um orçamento, do mais antigo para o mais novo — a ordem em que entram no PDF. */
export const recibosDoOrcamento = (recibos: Recibo[], quoteId: string): Recibo[] =>
  recibos
    .filter((r) => r.quoteId === quoteId)
    .sort((a, b) => (a.dataPagamento + a.createdAt).localeCompare(b.dataPagamento + b.createdAt));

/** "Camila Albuquerque - Recibo 2026-0007.pdf" — sem os caracteres que o sistema de arquivos rejeita. */
export const nomeDoArquivoDoRecibo = (r: Pick<Recibo, 'pacienteNome' | 'numero'>): string => {
  const nome = r.pacienteNome.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
  return `${nome || 'Cliente'} - Recibo ${r.numero}.pdf`;
};

/**
 * Põe um recibo lido do banco numa forma em que as telas confiem — número e textos como texto,
 * valor como número. Um documento torto não pode derrubar a lista inteira.
 */
export const normalizarRecibo = (bruto: Partial<Recibo> & { id: string }): Recibo => ({
  ...(bruto as Recibo),
  numero: String(bruto.numero || ''),
  ano: Number(bruto.ano) || 0,
  sequencia: Number(bruto.sequencia) || 0,
  dataPagamento: String(bruto.dataPagamento || '').slice(0, 10),
  valor: Number(bruto.valor) || 0,
  forma: (['pix', 'debito', 'credito', 'dinheiro'] as const).includes(bruto.forma as FormaDoRecibo)
    ? (bruto.forma as FormaDoRecibo)
    : 'pix',
  pacienteNome: String(bruto.pacienteNome || ''),
  clinica: bruto.clinica && typeof bruto.clinica === 'object' ? bruto.clinica : { name: 'La Vie Clinique' },
  createdAt: String(bruto.createdAt || ''),
});

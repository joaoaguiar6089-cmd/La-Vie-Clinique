import { Attendance, Procedure, Quote } from '../types';
import { DataISO, hojeISO, instanteDoAtendimento } from './attendances';
import { minutosDoHHMM } from './agenda';
import { itemValorFinal, resolveQuoteStatus } from './quoteCalc';

/**
 * Os números que a tela Hoje e o painel financeiro mostram.
 *
 * Tudo aqui é **derivado das coleções que já vivem em memória** — atendimentos, orçamentos e
 * catálogo, assinados uma vez por sessão no App. Nenhuma função deste arquivo lê o Firestore, e
 * é por isso que trocar o filtro de período no painel financeiro não custa leitura nenhuma.
 *
 * Fonte do dinheiro: **o orçamento aceito**. É a única fonte que o sistema guarda com valor
 * fechado e data — o atendimento não tem preço, e puxar o preço do catálogo na leitura faria o
 * faturamento de março mudar quando a tabela de preços subisse em abril. Ver `valorDoOrcamento`.
 */

// ==========================================
// DATAS E PERÍODOS
// ==========================================

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

const DIAS = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
];

/** "segunda-feira, 22 de setembro" — o cabeçalho da tela Hoje. */
export const dataPorExtenso = (data: DataISO): string => {
  const d = new Date(`${data}T12:00:00`);
  return `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
};

/** "Bom dia" / "Boa tarde" / "Boa noite" pelo relógio de quem está usando. */
export const saudacaoDaHora = (agora: Date = new Date()): string => {
  const h = agora.getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
};

/** O mês de uma data ISO, como "2026-09". É a chave de agrupamento do faturamento. */
export type MesISO = string;

export const mesDe = (iso: string): MesISO => (iso || '').slice(0, 7);

export const mesAtual = (hoje: DataISO = hojeISO()): MesISO => mesDe(hoje);

/** O mês anterior a este. "2026-01" devolve "2025-12". */
export const mesAnteriorA = (mes: MesISO): MesISO => {
  const [ano, m] = mes.split('-').map(Number);
  const d = new Date(ano, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** "setembro de 2026" — o rótulo de um mês. */
export const nomeDoMes = (mes: MesISO): string => {
  const [ano, m] = mes.split('-').map(Number);
  return `${MESES[m - 1]} de ${ano}`;
};

/** A data de N dias atrás, em ISO. */
export const diasAntesDeHoje = (dias: number, hoje: DataISO = hojeISO()): DataISO => {
  const d = new Date(`${hoje}T12:00:00`);
  d.setDate(d.getDate() - dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
};

// ==========================================
// ORÇAMENTOS
// ==========================================

/**
 * Quando o orçamento foi aceito, em ISO.
 *
 * `aceitoEm` é o campo certo; `updatedAt` é o fallback para os orçamentos aceitos antes de ele
 * existir, e `dataEmissao` é o último recurso. Sem o fallback, todo faturamento anterior a esta
 * versão desapareceria do painel — o que pareceria um bug de cálculo, não um campo novo.
 */
export const dataDeAceite = (q: Quote): string =>
  q.aceitoEm || q.updatedAt || q.dataEmissao || q.createdAt;

/**
 * Quanto este orçamento vale.
 *
 * `quote.total` é o retrato gravado no salvamento e é o que vale: recalcular a partir dos itens
 * na leitura faria o faturamento de um mês fechado mudar sozinho se a regra de desconto mudasse.
 * A soma dos itens só entra quando o retrato não existe (orçamento antigo).
 */
export const valorDoOrcamento = (q: Quote): number =>
  typeof q.total === 'number' && q.total > 0
    ? q.total
    : (q.itens || []).reduce((soma, item) => soma + itemValorFinal(item), 0);

export const orcamentosAceitos = (quotes: Quote[]): Quote[] =>
  quotes.filter((q) => q.status === 'aceito');

/** Aceitos dentro do mês, pela data de aceite. */
export const aceitosNoMes = (quotes: Quote[], mes: MesISO): Quote[] =>
  orcamentosAceitos(quotes).filter((q) => mesDe(dataDeAceite(q)) === mes);

export const faturamentoDoMes = (quotes: Quote[], mes: MesISO): number =>
  aceitosNoMes(quotes, mes).reduce((soma, q) => soma + valorDoOrcamento(q), 0);

/**
 * Orçamentos enviados e ainda dentro da validade — o que está em aberto agora.
 *
 * `resolveQuoteStatus` já derruba para "expirado" o que passou da validade, então isto é
 * exatamente "a paciente recebeu e ainda pode aceitar".
 */
export const orcamentosAbertos = (quotes: Quote[]): Quote[] =>
  quotes.filter((q) => resolveQuoteStatus(q) === 'enviado');

export interface Conversao {
  /** Orçamentos que saíram da clínica na janela — a base da conta. */
  enviados: number;
  aceitos: number;
  /** 0–100. `null` quando não houve nenhum envio: 0% ali seria uma acusação falsa. */
  percentual: number | null;
}

/**
 * Conversão dos orçamentos **emitidos** nos últimos N dias.
 *
 * Pela emissão, e não pelo aceite: a pergunta é "de tudo o que mandamos, quanto fechou", e
 * contar pelo aceite daria 100% sempre. Rascunho fica de fora — nunca chegou à paciente —, e
 * cancelado também, porque cancelar é apagar um orçamento já enviado, não perdê-lo.
 */
export const conversaoDeOrcamentos = (
  quotes: Quote[],
  dias = 30,
  hoje: DataISO = hojeISO()
): Conversao => {
  const desde = diasAntesDeHoje(dias, hoje);
  const naJanela = quotes.filter(
    (q) => q.status !== 'rascunho' && q.status !== 'cancelado' && (q.dataEmissao || '') >= desde
  );
  const aceitos = naJanela.filter((q) => q.status === 'aceito').length;
  return {
    enviados: naJanela.length,
    aceitos,
    percentual: naJanela.length === 0 ? null : Math.round((aceitos / naJanela.length) * 100),
  };
};

export interface TicketMedio {
  valor: number;
  /** Quantos orçamentos entraram na média — sem isto, "R$ 1.200" de um único aceite engana. */
  base: number;
}

export const ticketMedioDoMes = (quotes: Quote[], mes: MesISO): TicketMedio => {
  const aceitos = aceitosNoMes(quotes, mes);
  if (aceitos.length === 0) return { valor: 0, base: 0 };
  const soma = aceitos.reduce((s, q) => s + valorDoOrcamento(q), 0);
  return { valor: soma / aceitos.length, base: aceitos.length };
};

export interface FaturamentoPorProcedimento {
  nome: string;
  valor: number;
  /** Quantas vezes o procedimento apareceu nos orçamentos aceitos da janela. */
  vezes: number;
}

/**
 * Os procedimentos que mais faturam, do maior para o menor.
 *
 * A soma é por **item** do orçamento aceito, com o valor do item já com desconto. O desconto de
 * plano combinado, que é do orçamento inteiro, fica de fora desta divisão de propósito: ratear
 * um abatimento global entre os itens inventaria uma precisão que o dado não tem, e aqui o que
 * interessa é a ordem, não o centavo.
 */
export const faturamentoPorProcedimento = (
  aceitos: Quote[],
  limite = 5
): FaturamentoPorProcedimento[] => {
  const mapa = new Map<string, FaturamentoPorProcedimento>();
  aceitos.forEach((q) => {
    (q.itens || []).forEach((item) => {
      const nome = (item.titulo || item.categoria || 'Sem nome').trim();
      const atual = mapa.get(nome) || { nome, valor: 0, vezes: 0 };
      atual.valor += itemValorFinal(item);
      atual.vezes += 1;
      mapa.set(nome, atual);
    });
  });
  return [...mapa.values()].sort((a, b) => b.valor - a.valor).slice(0, limite);
};

// ==========================================
// PERÍODO DO PAINEL FINANCEIRO
// ==========================================

export interface Periodo {
  /** ISO inclusivo. */
  de: DataISO;
  /** ISO inclusivo. */
  ate: DataISO;
  rotulo: string;
}

/** O mês inteiro, de 01 ao último dia. */
export const periodoDoMes = (mes: MesISO): Periodo => {
  const [ano, m] = mes.split('-').map(Number);
  const ultimo = new Date(ano, m, 0).getDate();
  return {
    de: `${mes}-01`,
    ate: `${mes}-${String(ultimo).padStart(2, '0')}`,
    rotulo: nomeDoMes(mes),
  };
};

/** Os últimos N dias, terminando hoje. */
export const periodoDeDias = (dias: number, hoje: DataISO = hojeISO()): Periodo => ({
  de: diasAntesDeHoje(dias - 1, hoje),
  ate: hoje,
  rotulo: `Últimos ${dias} dias`,
});

/** O ano inteiro. */
export const periodoDoAno = (ano: number): Periodo => ({
  de: `${ano}-01-01`,
  ate: `${ano}-12-31`,
  rotulo: String(ano),
});

/** O mesmo comprimento de período, imediatamente antes — a base da comparação. */
export const periodoAnterior = (periodo: Periodo): Periodo => {
  const de = new Date(`${periodo.de}T12:00:00`);
  const ate = new Date(`${periodo.ate}T12:00:00`);
  const dias = Math.round((ate.getTime() - de.getTime()) / 86400000) + 1;
  const novoAte = new Date(de);
  novoAte.setDate(novoAte.getDate() - 1);
  const novoDe = new Date(novoAte);
  novoDe.setDate(novoDe.getDate() - (dias - 1));
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
  return { de: iso(novoDe), ate: iso(novoAte), rotulo: 'Período anterior' };
};

/**
 * Os orçamentos aceitos dentro do período, opcionalmente de uma profissional só.
 *
 * O filtro por profissional olha os **itens**: cada procedimento do orçamento tem a sua
 * (`QuoteItem.professionalId`), porque nem sempre é a mesma pessoa que faz tudo. Um orçamento
 * com dois itens de profissionais diferentes aparece nos dois filtros — e é por isso que a soma
 * dos filtros pode passar do total, o que o painel diz em letra pequena em vez de esconder.
 */
export const aceitosNoPeriodo = (
  quotes: Quote[],
  periodo: Periodo,
  professionalId?: string
): Quote[] =>
  orcamentosAceitos(quotes).filter((q) => {
    const data = dataDeAceite(q).slice(0, 10);
    if (data < periodo.de || data > periodo.ate) return false;
    if (!professionalId) return true;
    return (q.itens || []).some((i) => i.professionalId === professionalId);
  });

export interface ResumoFinanceiro {
  faturamento: number;
  /** Faturamento do período anterior de mesmo comprimento. */
  faturamentoAnterior: number;
  /** Variação percentual arredondada. `null` quando o anterior foi zero — não há divisão. */
  variacao: number | null;
  ticket: TicketMedio;
  conversao: Conversao;
  porProcedimento: FaturamentoPorProcedimento[];
  /** Faturamento de cada mês do período, para o gráfico. */
  porMes: { mes: MesISO; valor: number }[];
}

/**
 * Tudo o que o painel financeiro mostra, num cálculo só.
 *
 * **Fonte do dinheiro: o orçamento aceito.** É a única no sistema com valor fechado e data — o
 * atendimento não guarda preço nenhum e o catálogo guarda só o preço de hoje, o que faria o
 * faturamento de março mudar sozinho num reajuste de abril.
 */
export const resumoFinanceiro = (
  quotes: Quote[],
  periodo: Periodo,
  professionalId?: string,
  hoje: DataISO = hojeISO()
): ResumoFinanceiro => {
  const aceitos = aceitosNoPeriodo(quotes, periodo, professionalId);
  const anteriores = aceitosNoPeriodo(quotes, periodoAnterior(periodo), professionalId);

  const faturamento = aceitos.reduce((s, q) => s + valorDoOrcamento(q), 0);
  const faturamentoAnterior = anteriores.reduce((s, q) => s + valorDoOrcamento(q), 0);

  /**
   * Os meses que o período toca, na ordem.
   *
   * Anda **do dia 1 de cada mês**, e não da data inicial: partindo de 24/06, um `setMonth(+1)`
   * chega a 24/09 e para antes de 22/09 — e setembro, o mês que interessa, sumia do gráfico.
   * O limite é o mês final, não o dia final, pela mesma razão.
   */
  const meses: MesISO[] = [];
  const inicio = new Date(`${periodo.de}T12:00:00`);
  const fimMes = mesDe(periodo.ate);
  for (
    let cursor = new Date(inicio.getFullYear(), inicio.getMonth(), 1, 12);
    meses.length < 24;
    cursor.setMonth(cursor.getMonth() + 1)
  ) {
    const mes = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
    meses.push(mes);
    if (mes >= fimMes) break;
  }

  return {
    faturamento,
    faturamentoAnterior,
    variacao:
      faturamentoAnterior === 0
        ? null
        : Math.round(((faturamento - faturamentoAnterior) / faturamentoAnterior) * 100),
    ticket:
      aceitos.length === 0
        ? { valor: 0, base: 0 }
        : { valor: faturamento / aceitos.length, base: aceitos.length },
    conversao: conversaoNoPeriodo(quotes, periodo, professionalId),
    porProcedimento: faturamentoPorProcedimento(aceitos, 6),
    porMes: meses.map((mes) => ({
      mes,
      valor: aceitos
        .filter((q) => mesDe(dataDeAceite(q)) === mes)
        .reduce((s, q) => s + valorDoOrcamento(q), 0),
    })),
  };
};

/** Conversão dos orçamentos **emitidos** dentro do período. Ver `conversaoDeOrcamentos`. */
export const conversaoNoPeriodo = (
  quotes: Quote[],
  periodo: Periodo,
  professionalId?: string
): Conversao => {
  const naJanela = quotes.filter((q) => {
    if (q.status === 'rascunho' || q.status === 'cancelado') return false;
    const data = (q.dataEmissao || '').slice(0, 10);
    if (data < periodo.de || data > periodo.ate) return false;
    if (!professionalId) return true;
    return (q.itens || []).some((i) => i.professionalId === professionalId);
  });
  const aceitos = naJanela.filter((q) => q.status === 'aceito').length;
  return {
    enviados: naJanela.length,
    aceitos,
    percentual: naJanela.length === 0 ? null : Math.round((aceitos / naJanela.length) * 100),
  };
};

// ==========================================
// O DIA
// ==========================================

/** O que está marcado para hoje. Remarcado fica de fora: aquele horário foi devolvido. */
export const atendimentosDeHoje = (
  atendimentos: Attendance[],
  hoje: DataISO = hojeISO()
): Attendance[] =>
  atendimentos
    .filter((a) => a.data === hoje && a.status !== 'remarcado')
    .sort((a, b) => instanteDoAtendimento(a) - instanteDoAtendimento(b));

/**
 * O que ainda vem hoje, **de agora em diante**.
 *
 * Quem já foi atendido ou já faltou sai da lista mesmo que o horário ainda não tenha chegado: o
 * desfecho é mais recente que o relógio. Visita sem hora fica, porque não dá para afirmar que
 * passou.
 */
export const proximosDeHoje = (
  atendimentos: Attendance[],
  hoje: DataISO = hojeISO(),
  agora: Date = new Date()
): Attendance[] => {
  const minutosAgora = agora.getHours() * 60 + agora.getMinutes();
  return atendimentosDeHoje(atendimentos, hoje).filter((a) => {
    if (a.status && a.status !== 'agendado') return false;
    const inicio = minutosDoHHMM(a.hora);
    return inicio === null || inicio >= minutosAgora - 15;
  });
};

/**
 * Duração total do dia em minutos, para o card de "atendimentos hoje" dizer se o dia está cheio.
 * Reaproveita a mesma leitura de duração da agenda.
 */
export const procedimentoDoCatalogo = (
  a: Pick<Attendance, 'procedureId'>,
  catalogo: Procedure[]
): Procedure | undefined =>
  a.procedureId ? catalogo.find((p) => p.id === a.procedureId) : undefined;

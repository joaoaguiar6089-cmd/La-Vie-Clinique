import { AnamnesisRecord, Attendance, EvaluationRecord, Quote } from '../types';
import { DataISO, ehRealizado, hojeISO, instanteDoAtendimento } from './attendances';
import { dataPorExtenso, diasAntesDeHoje, periodoDeDias } from './indicadores';
import { ETAPA_DA_JORNADA, ItemDaLinha, linhaDoTempo } from './pacienteResumo';
import { chaveDeNome } from './templateMatching';

/**
 * A linha do tempo da clínica inteira — a da tela Hoje.
 *
 * É a mesma linha da aba Resumo da paciente (`linhaDoTempo`), atravessando todas as pacientes e
 * recortada por período. Tudo aqui é derivado do que a tela já tem em mãos; nenhuma função lê o
 * banco, e é o que permite `scripts/verificar-linha-do-tempo.ts` conferir as regras sem Firebase.
 */

export type TipoNaLinha = ItemDaLinha['tipo'];

/** Os períodos oferecidos. "Hoje" é o período de um dia. */
export const PERIODOS_DA_LINHA: { dias: number; rotulo: string }[] = [
  { dias: 1, rotulo: 'Hoje' },
  { dias: 7, rotulo: '7 dias' },
  { dias: 15, rotulo: '15 dias' },
  { dias: 30, rotulo: '30 dias' },
];

/** O maior período — é o que as consultas de anamnese e avaliação trazem de uma vez só. */
export const MAIOR_PERIODO_DA_LINHA = 30;

/** O corte das consultas: trocar o filtro entre Hoje e 30 dias não gera leitura nova. */
export const corteDaLinha = (hoje: DataISO = hojeISO()): DataISO =>
  diasAntesDeHoje(MAIOR_PERIODO_DA_LINHA - 1, hoje);

export const TIPOS_DA_LINHA: { tipo: TipoNaLinha; rotulo: string }[] = [
  { tipo: 'atendimento', rotulo: 'Atendimentos' },
  { tipo: 'orcamento', rotulo: 'Orçamentos' },
  { tipo: 'anamnese', rotulo: 'Anamneses' },
  { tipo: 'avaliacao', rotulo: 'Avaliações' },
];

/**
 * Entra na linha? — para o atendimento, a pergunta é se ele **aconteceu** (ou faltou).
 *
 * O agendamento ainda em aberto fica de fora: ele já está em Próximos, na Agenda e, se venceu, nas
 * Pendências — repetir aqui misturaria o que aconteceu com o que está marcado. O remarcado também:
 * quem conta a história é o agendamento novo. A falta entra, com o selo, porque é um fato do dia.
 */
export const atendimentoEntraNaLinha = (a: Attendance, hoje: DataISO = hojeISO()): boolean =>
  !!a.data && a.data <= hoje && (ehRealizado(a) || a.status === 'faltou');

/** O instante, para ordenar dentro do mesmo dia. Sem hora conhecida, meio-dia. */
const instanteDoItem = (item: ItemDaLinha): number => {
  const meioDia = Date.parse(`${item.data}T12:00:00`) || 0;
  if (item.tipo === 'atendimento') return instanteDoAtendimento(item.ref);
  const iso =
    item.tipo === 'orcamento' ? item.ref.dataEmissao || item.ref.createdAt : item.ref.createdAt;
  // A hora só vale se for do mesmo dia da data exibida: a ficha criada ontem e datada de hoje
  // não pode ir para o fim do dia de hoje por causa de um horário de outro dia.
  const t = Date.parse(iso || '');
  if (!t) return meioDia;
  const d = new Date(t);
  const doDia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
  return doDia === item.data ? t : meioDia;
};

/** O texto em que a busca procura: paciente, procedimento, profissional e, no orçamento, número e itens. */
const textoBuscavel = (item: ItemDaLinha): string => {
  const partes: (string | undefined)[] = [item.ref.pacienteNome, item.titulo, item.profissional];
  if (item.tipo === 'orcamento') {
    partes.push(item.ref.numero, ...(item.ref.itens || []).map((i) => i.titulo));
    partes.push(...(item.ref.itens || []).map((i) => i.profissionalNome));
  }
  return chaveDeNome(partes.filter(Boolean).join(' '));
};

export interface FiltroDaLinha {
  /** 1 = hoje. */
  dias: number;
  busca?: string;
  /** Vazio = todos os tipos. */
  tipos?: TipoNaLinha[];
}

/**
 * A linha da clínica: tudo dentro do período, do mais recente para o mais antigo.
 *
 * A data de cada item é a mesma da linha da paciente — a do atendimento, a da emissão do
 * orçamento, a da anamnese e a da avaliação. No mesmo dia, o horário ordena; sem horário, a
 * etapa da jornada desempata.
 */
export const linhaDaClinica = (
  dados: {
    atendimentos: Attendance[];
    anamneses: AnamnesisRecord[];
    orcamentos: Quote[];
    avaliacoes: EvaluationRecord[];
  },
  filtro: FiltroDaLinha,
  hoje: DataISO = hojeISO()
): ItemDaLinha[] => {
  const periodo = periodoDeDias(Math.max(1, filtro.dias), hoje);
  const termo = chaveDeNome(filtro.busca || '').trim();
  const tipos = filtro.tipos && filtro.tipos.length > 0 ? new Set(filtro.tipos) : null;

  return linhaDoTempo(
    (dados.atendimentos || []).filter((a) => atendimentoEntraNaLinha(a, hoje)),
    dados.anamneses || [],
    dados.orcamentos || [],
    dados.avaliacoes || []
  )
    .filter((item) => item.data >= periodo.de && item.data <= periodo.ate)
    .filter((item) => !tipos || tipos.has(item.tipo))
    .filter((item) => !termo || textoBuscavel(item).includes(termo))
    .map((item) => ({ item, instante: instanteDoItem(item) }))
    .sort(
      (a, b) =>
        b.item.data.localeCompare(a.item.data) ||
        b.instante - a.instante ||
        ETAPA_DA_JORNADA[b.item.tipo] - ETAPA_DA_JORNADA[a.item.tipo]
    )
    .map(({ item }) => item);
};

export interface DiaDaLinha {
  data: DataISO;
  /** "Hoje", "Ontem" ou "terça-feira, 23 de setembro". */
  rotulo: string;
  itens: ItemDaLinha[];
}

/** Agrupa a linha já ordenada por dia, mantendo a ordem. */
export const agruparPorDia = (itens: ItemDaLinha[], hoje: DataISO = hojeISO()): DiaDaLinha[] => {
  const ontem = diasAntesDeHoje(1, hoje);
  const dias: DiaDaLinha[] = [];
  itens.forEach((item) => {
    let dia = dias[dias.length - 1];
    if (!dia || dia.data !== item.data) {
      const rotulo =
        item.data === hoje ? 'Hoje' : item.data === ontem ? 'Ontem' : dataPorExtenso(item.data);
      dia = { data: item.data, rotulo, itens: [] };
      dias.push(dia);
    }
    dia.itens.push(item);
  });
  return dias;
};

/** Quantos itens de cada tipo, para os botões de filtro. */
export const contarPorTipo = (itens: ItemDaLinha[]): Record<TipoNaLinha, number> => {
  const contagem: Record<TipoNaLinha, number> = {
    atendimento: 0,
    orcamento: 0,
    anamnese: 0,
    avaliacao: 0,
  };
  itens.forEach((i) => {
    contagem[i.tipo] += 1;
  });
  return contagem;
};

import { Attendance, Procedure } from '../types';
import { duracaoDoProcedimento, hhmmDeMinutos, minutosDoHHMM } from './agenda';
import { instanteDoAtendimento } from './attendances';
import { focosDe } from './procedimentoAvaliacao';

/**
 * A visita: os atendimentos agendados juntos, num formulário só.
 *
 * "Harmonização Glútea + Botox" no mesmo horário vira **um atendimento por procedimento**, um
 * depois do outro, cada um com o seu relatório e os seus materiais — e todos com o mesmo
 * `grupoId`. O que a visita divide é o que é da cliente e da recepção: o link e a mensagem (o
 * mesmo `linkToken`), a resposta dela, e na agenda o Compareceu, o Faltou, o Remarcar e o Editar.
 *
 * Os atendimentos de antes do grupo, com os demais procedimentos em `procedimentosAdicionais`,
 * ficam como estão: são uma visita de um atendimento só.
 */

/** Um id novo de visita. */
export const novoGrupoId = (): string =>
  `vis-${
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 13)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  }`;

/** A ordem da visita: pelo horário, e — sem horário — pela ordem em que foram criados. */
const naOrdemDaVisita = (a: Attendance, b: Attendance): number =>
  instanteDoAtendimento(a) - instanteDoAtendimento(b) ||
  (a.createdAt || '').localeCompare(b.createdAt || '') ||
  a.id.localeCompare(b.id);

/**
 * Os atendimentos da visita de `a`, na ordem dela, tirados de uma lista que já está em memória.
 *
 * Atendimento sem grupo é uma visita de um só. Os remarcados não se misturam com os vivos: a visita
 * que caiu e a que nasceu no lugar dela são grupos diferentes, e um remarcado só tem por companhia
 * os outros remarcados da mesma visita.
 */
export const membrosDaVisita = (a: Attendance, lista: Attendance[]): Attendance[] => {
  if (!a.grupoId) return [a];
  const remarcado = a.status === 'remarcado';
  const membros = (lista || []).filter(
    (x) => x.grupoId === a.grupoId && (x.status === 'remarcado') === remarcado
  );
  const comEle = membros.some((x) => x.id === a.id) ? membros : [...membros, a];
  return [...comEle].sort(naOrdemDaVisita);
};

/**
 * A visita como um atendimento só — o primeiro, com os demais em `procedimentosAdicionais` e a
 * duração somada. É o formato que o link da cliente, a mensagem do WhatsApp e o formulário já
 * sabem mostrar ("Harmonização Glútea + Botox", às 14:00, 60 min).
 */
export const visitaComoUmAtendimento = (membros: Attendance[]): Attendance => {
  const [primeiro, ...demais] = [...membros].sort(naOrdemDaVisita);
  if (demais.length === 0) return primeiro;
  const duracoes = [primeiro, ...demais].map((m) => m.duracaoMin);
  return {
    ...primeiro,
    procedimentosAdicionais: [
      ...(primeiro.procedimentosAdicionais || []),
      ...demais.flatMap((m) => [
        {
          procedureId: m.procedureId,
          procedimentoNome: m.procedimentoNome,
          planoId: m.planoId,
          ...(focosDe(m).length > 0 ? { focos: focosDe(m) } : {}),
        },
        ...(m.procedimentosAdicionais || []),
      ]),
    ],
    duracaoMin: duracoes.every((d) => typeof d === 'number' && d > 0)
      ? duracoes.reduce((soma, d) => soma + (d as number), 0)
      : primeiro.duracaoMin,
  };
};

/**
 * Os horários de cada procedimento da visita, um depois do outro: o primeiro na hora marcada, e
 * cada seguinte quando o anterior acaba. Sem hora, todos ficam sem hora.
 */
export const horariosEmSequencia = (hora: string | undefined, duracoes: number[]): (string | undefined)[] => {
  const inicio = minutosDoHHMM(hora);
  if (inicio === null) return duracoes.map(() => undefined);
  let atual = inicio;
  return duracoes.map((d) => {
    const esta = hhmmDeMinutos(atual);
    atual += d;
    return esta;
  });
};

/** Uma hora deslocada em minutos — para remarcar a visita inteira mantendo a sequência. */
export const deslocarHora = (hora: string | undefined, minutos: number): string | undefined => {
  const m = minutosDoHHMM(hora);
  return m === null ? hora : hhmmDeMinutos(m + minutos);
};

/**
 * Uma linha por visita — para as listas da recepção (a confirmar, pendências, respostas da
 * cliente): a cliente recebe uma mensagem só pela visita, e resolver um resolve todos. Fica o
 * primeiro atendimento de cada visita, como representante dela.
 */
export const umPorVisita = (lista: Attendance[]): Attendance[] => {
  const chave = (a: Attendance) => `${a.grupoId}|${a.status === 'remarcado'}`;
  const primeiro = new Map<string, Attendance>();
  (lista || []).forEach((a) => {
    if (!a.grupoId) return;
    const atual = primeiro.get(chave(a));
    if (!atual || naOrdemDaVisita(a, atual) < 0) primeiro.set(chave(a), a);
  });
  // Na ordem em que a lista veio: só sai quem não representa a sua visita.
  return (lista || []).filter((a) => !a.grupoId || primeiro.get(chave(a)) === a);
};

/**
 * A duração de cada atendimento da visita, somando a duração da visita: a gravada (na edição) ou
 * a do catálogo de cada procedimento; o que nenhum dos dois sabe divide o que sobra da duração da
 * visita. Se a soma não fecha com a duração da visita (alguém a digitou), o último absorve a
 * diferença — é ele que termina na hora que a duração diz.
 */
export const duracoesDasLinhas = (
  linhas: { procedureId?: string; duracaoMin?: number }[],
  total: number | undefined,
  catalogo: Procedure[]
): (number | undefined)[] => {
  if (linhas.length === 1) return [total];
  const base = linhas.map(
    (l) =>
      l.duracaoMin ||
      (l.procedureId ? duracaoDoProcedimento(catalogo.find((c) => c.id === l.procedureId)?.duration) : undefined)
  );
  if (!total) return base;
  const conhecidas = base.filter((d): d is number => typeof d === 'number');
  const semDuracao = base.length - conhecidas.length;
  const sobra = total - conhecidas.reduce((soma, d) => soma + d, 0);
  const cada = semDuracao > 0 ? Math.max(15, Math.round(sobra / semDuracao)) : 0;
  const duracoes = base.map((d) => d ?? cada);
  const diferenca = total - duracoes.reduce((soma, d) => soma + d, 0);
  duracoes[duracoes.length - 1] = Math.max(5, duracoes[duracoes.length - 1] + diferenca);
  return duracoes;
};


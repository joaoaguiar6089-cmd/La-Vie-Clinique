import { Attendance, AttendanceStatus, Procedure, SessionPlan } from '../types';

/**
 * As regras do diário de atendimentos: o que é agendamento, o que conta como sessão feita, e
 * como as visitas se agrupam em planos na hora de listar.
 *
 * Tudo aqui é **derivado**. O número da sessão não é gravado em documento nenhum — é a posição
 * da visita entre as realizadas do mesmo plano, contada na leitura. É o que faz excluir a 3ª
 * sessão renumerar as outras sozinha, sem nenhum conserto e sem chance de a base guardar duas
 * sessões com o mesmo número.
 */

/** "17/09/2026" para o olho; "2026-09-17" para a base. Este é o formato gravado. */
export type DataISO = string;

// ==========================================
// DATA E HORA
// ==========================================

/** Hoje em "YYYY-MM-DD", no fuso de quem está usando (e não em UTC, que vira ontem à noite). */
export const hojeISO = (): DataISO => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const agoraHHMM = (): string => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * Instante da visita, para ordenar. Sem hora, meio-dia — assim uma visita sem horário não cai
 * antes de uma das 9h nem depois de uma das 18h do mesmo dia, que seriam as duas mentiras
 * possíveis de um padrão em 00:00 ou 23:59.
 */
export const instanteDoAtendimento = (a: Attendance): number => {
  const t = new Date(`${a.data}T${a.hora || '12:00'}:00`).getTime();
  return isNaN(t) ? 0 : t;
};

/**
 * Marcado para depois de hoje. É isto — e não o instante exato — que decide se um registro nasce
 * agendamento.
 *
 * Comparar por **dia** e não por hora evita a armadilha do "hoje às 18h" lançado às 9h da manhã:
 * pela hora ele seria um agendamento e ganharia status; pelo dia ele é o que a recepção quer que
 * seja, o registro da visita de hoje. Comparação de string funciona porque "YYYY-MM-DD" ordena
 * como texto.
 */
export const ehDataFutura = (data: DataISO): boolean => !!data && data > hojeISO();

// ==========================================
// NATUREZA DO REGISTRO
// ==========================================

/**
 * Nasceu agendamento. A marca é a **presença** de `status`, e não a data ser futura: passada a
 * quinta-feira, o agendamento de quinta continua sendo um agendamento a resolver — se a regra
 * olhasse a data, o seletor de status sumiria justamente no dia em que ele importa.
 */
export const ehAgendamento = (a: Attendance): boolean => !!a.status;

/**
 * Consumiu uma sessão do plano. Falta e remarcação não consomem: quem faltou duas vezes num
 * plano de 10 veria "10/10" tendo feito 8, e o plano encerraria devendo tratamento.
 */
export const ehRealizado = (a: Attendance): boolean => !a.status || a.status === 'compareceu';

/** Marcado e ainda sem desfecho. */
export const ehPendente = (a: Attendance): boolean => a.status === 'agendado';

/** Agendamento cuja data já passou e ninguém resolveu — merece um aviso na lista. */
export const ehPendenteAtrasado = (a: Attendance): boolean =>
  ehPendente(a) && a.data < hojeISO();

export const ROTULO_DO_STATUS: Record<AttendanceStatus, string> = {
  agendado: 'Agendado',
  compareceu: 'Compareceu',
  faltou: 'Faltou',
  remarcado: 'Remarcado',
};

// ==========================================
// IDENTIDADE DO PROCEDIMENTO
// ==========================================

/**
 * Normaliza o nome do procedimento para comparar o que veio do catálogo com o que foi digitado
 * à mão. Mesmo espírito do `chaveDoNome` da lista de clientes.
 */
export const chaveDoProcedimento = (nome: string): string =>
  (nome || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');

/**
 * O mesmo tratamento? O id do catálogo decide quando os dois lados têm um; se algum for texto
 * livre, sobra o nome normalizado.
 *
 * Não acerta todo apelido digitado à mão ("laser axila" ≠ "Depilação a Laser - Axilas") — e é
 * por isso que o vínculo sugerido no formulário é sempre visível e desmarcável, nunca silencioso.
 */
export const mesmoProcedimento = (
  a: { procedureId?: string; procedimentoNome: string },
  b: { procedureId?: string; procedimentoNome: string }
): boolean => {
  if (a.procedureId && b.procedureId) return a.procedureId === b.procedureId;
  return chaveDoProcedimento(a.procedimentoNome) === chaveDoProcedimento(b.procedimentoNome);
};

// ==========================================
// PLANOS
// ==========================================

export interface ProgressoDoPlano {
  /** Sessões que aconteceram de verdade. É este o numerador do "3/10". */
  realizadas: number;
  /** Marcadas e ainda sem desfecho — aparecem na lista, fora da conta. */
  agendadas: number;
  faltas: number;
  total: number;
  /** A 11ª de um plano de 10: permitido, mas assinalado. */
  estourado: boolean;
  encerrado: boolean;
}

export const progressoDoPlano = (
  plano: SessionPlan,
  atendimentosDoPlano: Attendance[]
): ProgressoDoPlano => {
  const realizadas = atendimentosDoPlano.filter(ehRealizado).length;
  return {
    realizadas,
    agendadas: atendimentosDoPlano.filter(ehPendente).length,
    faltas: atendimentosDoPlano.filter((a) => a.status === 'faltou').length,
    total: plano.totalSessoes,
    estourado: realizadas > plano.totalSessoes,
    encerrado: !!plano.encerradoEm,
  };
};

/**
 * Qual é a enésima sessão realizada deste atendimento dentro do plano — ou `undefined` se ele
 * não consumiu sessão (falta, remarcação). A ordem é cronológica, não de cadastro: quem registra
 * hoje uma sessão do mês passado espera vê-la no lugar dela.
 */
export const numeroDaSessao = (
  atendimento: Attendance,
  atendimentosDoPlano: Attendance[]
): number | undefined => {
  if (!ehRealizado(atendimento)) return undefined;
  const realizadas = atendimentosDoPlano
    .filter(ehRealizado)
    .sort((a, b) => instanteDoAtendimento(a) - instanteDoAtendimento(b));
  const indice = realizadas.findIndex((a) => a.id === atendimento.id);
  return indice >= 0 ? indice + 1 : undefined;
};

/**
 * O plano aberto deste paciente para este procedimento, se houver — é ele que o formulário
 * oferece como vínculo automático. Encerrado não conta: encerrar existe justamente para parar
 * de receber sessões novas.
 */
export const planoAbertoPara = (
  planos: SessionPlan[],
  procedimento: { procedureId?: string; procedimentoNome: string }
): SessionPlan | undefined =>
  planos.find((p) => !p.encerradoEm && mesmoProcedimento(p, procedimento));

// ==========================================
// A LISTA
// ==========================================

/** Uma linha da aba: ou uma visita solta, ou um plano com as visitas dele dentro. */
export type LinhaDoHistorico =
  | { tipo: 'avulso'; chave: string; instante: number; atendimento: Attendance }
  | {
      tipo: 'plano';
      chave: string;
      instante: number;
      plano: SessionPlan;
      progresso: ProgressoDoPlano;
      /** Do mais recente para o mais antigo, como a lista expandida mostra. */
      atendimentos: Attendance[];
    };

/**
 * Monta a lista da aba: visitas avulsas e planos, tudo em ordem de data decrescente — o que está
 * marcado para o futuro cai naturalmente no topo, sem precisar de um bloco "Próximos" à parte.
 *
 * O plano ordena pela **sessão mais recente** (inclusive a agendada), então ele sobe na lista a
 * cada visita em vez de ficar parado na data em que nasceu.
 */
export const montarHistorico = (
  atendimentos: Attendance[],
  planos: SessionPlan[]
): LinhaDoHistorico[] => {
  const porPlano = new Map<string, Attendance[]>();
  const avulsos: Attendance[] = [];

  const planosPorId = new Map(planos.map((p) => [p.id, p]));

  atendimentos.forEach((a) => {
    // Vínculo apontando para plano que não existe mais vale como avulso — é o que a exclusão de
    // plano produz se um lote falhar no meio, e some da tela em vez de sumir da vida.
    if (a.planoId && planosPorId.has(a.planoId)) {
      const lista = porPlano.get(a.planoId) || [];
      lista.push(a);
      porPlano.set(a.planoId, lista);
    } else {
      avulsos.push(a);
    }
  });

  const linhas: LinhaDoHistorico[] = avulsos.map((a) => ({
    tipo: 'avulso',
    chave: a.id,
    instante: instanteDoAtendimento(a),
    atendimento: a,
  }));

  planos.forEach((plano) => {
    const doPlano = (porPlano.get(plano.id) || []).sort(
      (a, b) => instanteDoAtendimento(b) - instanteDoAtendimento(a)
    );
    // Plano recém-criado ainda sem sessão nenhuma ordena pela data de criação.
    const instante = doPlano.length > 0 ? instanteDoAtendimento(doPlano[0]) : Date.parse(plano.createdAt) || 0;
    linhas.push({
      tipo: 'plano',
      chave: plano.id,
      instante,
      plano,
      progresso: progressoDoPlano(plano, doPlano),
      atendimentos: doPlano,
    });
  });

  return linhas.sort((a, b) => b.instante - a.instante);
};

// ==========================================
// PRÉ-PREENCHIMENTO DO PROCEDIMENTO
// ==========================================

export interface ProcedimentoEscolhido {
  procedureId?: string;
  procedimentoNome: string;
}

/**
 * O palpite do formulário: o procedimento do último atendimento; na falta de qualquer
 * atendimento, o da última anamnese.
 *
 * A ordem é essa porque quem acabou de fazer a 3ª sessão vai fazer a 4ª do mesmo procedimento —
 * a anamnese só é o melhor palpite para quem ainda não tem visita nenhuma registrada.
 */
export const procedimentoSugerido = (
  atendimentos: Attendance[],
  ultimaAnamnese?: { procedimentoId?: string; procedimentoNome: string },
  catalogo: Procedure[] = []
): ProcedimentoEscolhido | undefined => {
  const maisRecente = [...atendimentos].sort(
    (a, b) => instanteDoAtendimento(b) - instanteDoAtendimento(a)
  )[0];

  if (maisRecente) {
    return {
      procedureId: maisRecente.procedureId,
      procedimentoNome: maisRecente.procedimentoNome,
    };
  }

  if (!ultimaAnamnese?.procedimentoNome) return undefined;

  // A ficha guarda `procedimentoId`, que pode apontar para uma ficha-modelo e não para o
  // catálogo — só aproveito o id quando ele existe mesmo entre os procedimentos.
  const doCatalogo = ultimaAnamnese.procedimentoId
    ? catalogo.find((p) => p.id === ultimaAnamnese.procedimentoId)
    : undefined;

  return {
    procedureId: doCatalogo?.id,
    procedimentoNome: doCatalogo?.title || ultimaAnamnese.procedimentoNome,
  };
};

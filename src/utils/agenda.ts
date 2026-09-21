import {
  AgendaExpedienteDia,
  Attendance,
  ClinicProfile,
  Patient,
  Procedure,
  Professional,
} from '../types';
import { DataISO, ehRealizado, hojeISO } from './attendances';

/**
 * As regras da grade da agenda: quanto tempo cada visita ocupa, que horas a clínica abre, e como
 * atendimentos que se cruzam dividem a largura da coluna.
 *
 * Como em `utils/attendances.ts`, **tudo aqui é derivado**. A única coisa que a agenda acrescentou
 * ao banco foi `Attendance.duracaoMin`; posição, altura, coluna, conflito e cor saem de cálculo na
 * leitura, e por isso mudar a granularidade da grade ou o expediente não pede migração nenhuma.
 */

// ==========================================
// PADRÕES
// ==========================================

/** Expediente inicial: seg–sex o dia inteiro, sábado até o começo da tarde, domingo fechado. */
const EXPEDIENTE_PADRAO: AgendaExpedienteDia[] = [
  { diaSemana: 0 },
  { diaSemana: 1, abre: '09:00', fecha: '19:00' },
  { diaSemana: 2, abre: '09:00', fecha: '19:00' },
  { diaSemana: 3, abre: '09:00', fecha: '19:00' },
  { diaSemana: 4, abre: '09:00', fecha: '19:00' },
  { diaSemana: 5, abre: '09:00', fecha: '19:00' },
  { diaSemana: 6, abre: '09:00', fecha: '13:00' },
];

export const AGENDA_DEFAULTS = {
  /** Quando nem o registro nem o catálogo sabem dizer quanto dura. */
  duracaoMin: 60,
  /** Altura de uma linha da grade, em minutos. */
  intervaloMin: 30,
  expediente: EXPEDIENTE_PADRAO,
  confirmacaoTemplate:
    'Oi {primeiroNome}! Confirmando seu horário na {clinica}: {data} às {hora} — {procedimento}. Pode confirmar pra gente? 💛',
  /** Grade de um dia sem expediente configurado. */
  gradeInicioMin: 8 * 60,
  gradeFimMin: 20 * 60,
} as const;

export const INTERVALOS_DISPONIVEIS = [15, 30, 60] as const;

export type AgendaVisao = 'dia' | 'semana' | 'mes';

/** Preferência de visão, por navegador. Não vai para o banco: é gosto de quem está usando. */
export const AGENDA_VISAO_STORAGE_KEY = 'lavie.agenda.visao';

// ==========================================
// HORA ↔ MINUTOS
// ==========================================

const pad = (n: number) => String(n).padStart(2, '0');

/** "14:30" para 870. `null` quando não dá para ler — nunca um 0 disfarçado de meia-noite. */
export const minutosDoHHMM = (hora?: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hora || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
};

/** 870 para "14:30". Fora de 00:00–23:59, gruda na borda em vez de dar a volta no relógio. */
export const hhmmDeMinutos = (minutos: number): string => {
  const total = Math.max(0, Math.min(23 * 60 + 59, Math.round(minutos)));
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
};

// ==========================================
// DATAS
// ==========================================

const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DIAS_LONGOS = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
];
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

/**
 * A data como `Date`, ancorada ao **meio-dia local**.
 *
 * Mesma trava de fuso do `formatDateOnly`: somar dias a partir de 00:00 atravessa o horário de
 * verão e devolve o dia anterior; do meio-dia, um deslocamento de uma hora não muda o dia.
 */
const aoMeioDia = (data: DataISO): Date => new Date(`${data}T12:00:00`);

const paraISO = (d: Date): DataISO =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const diaDaSemanaDe = (data: DataISO): number => aoMeioDia(data).getDay();

export const deslocarDias = (data: DataISO, dias: number): DataISO => {
  const d = aoMeioDia(data);
  d.setDate(d.getDate() + dias);
  return paraISO(d);
};

/** Avança meses mantendo o dia quando ele existe — 31/01 mais um mês vira 28/02, não 03/03. */
export const deslocarMeses = (data: DataISO, meses: number): DataISO => {
  const d = aoMeioDia(data);
  const diaOriginal = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + meses);
  const ultimoDia = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(diaOriginal, ultimoDia));
  return paraISO(d);
};

/** O domingo da semana desta data — o calendário brasileiro começa no domingo. */
export const inicioDaSemana = (data: DataISO): DataISO =>
  deslocarDias(data, -diaDaSemanaDe(data));

/** Os sete dias da semana desta data. */
export const diasDaSemanaDe = (data: DataISO): DataISO[] => {
  const domingo = inicioDaSemana(data);
  return Array.from({ length: 7 }, (_, i) => deslocarDias(domingo, i));
};

/**
 * As semanas inteiras que cobrem o mês desta data — 35 ou 42 dias, sempre de domingo a sábado,
 * para o calendário fechar em linhas completas.
 */
export const diasDoMesDe = (data: DataISO): DataISO[] => {
  const d = aoMeioDia(data);
  const primeiro = paraISO(new Date(d.getFullYear(), d.getMonth(), 1, 12));
  const ultimo = paraISO(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12));
  const inicio = inicioDaSemana(primeiro);
  const fim = deslocarDias(ultimo, 6 - diaDaSemanaDe(ultimo));

  const dias: DataISO[] = [];
  for (let cursor = inicio; cursor <= fim; cursor = deslocarDias(cursor, 1)) {
    dias.push(cursor);
  }
  return dias;
};

export const ehDoMesDe = (data: DataISO, referencia: DataISO): boolean =>
  data.slice(0, 7) === referencia.slice(0, 7);

export const nomeCurtoDoDia = (data: DataISO): string => DIAS_CURTOS[diaDaSemanaDe(data)];
export const nomeLongoDoDia = (data: DataISO): string => DIAS_LONGOS[diaDaSemanaDe(data)];

/** "21/09" — o rótulo do cabeçalho de coluna. */
export const dataCurta = (data: DataISO): string => {
  const d = aoMeioDia(data);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
};

/** "sexta-feira, 21/09" — o que vai na mensagem de confirmação. */
export const dataExtensa = (data: DataISO): string =>
  `${nomeLongoDoDia(data)}, ${dataCurta(data)}`;

/** O título da barra de navegação, conforme a visão. */
export const rotuloDoPeriodo = (visao: AgendaVisao, data: DataISO): string => {
  const d = aoMeioDia(data);
  if (visao === 'mes') return `${MESES[d.getMonth()]} de ${d.getFullYear()}`;
  if (visao === 'dia') {
    return `${nomeLongoDoDia(data)}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
  }
  const dias = diasDaSemanaDe(data);
  const inicio = aoMeioDia(dias[0]);
  const fim = aoMeioDia(dias[6]);
  return inicio.getMonth() === fim.getMonth()
    ? `${inicio.getDate()} a ${fim.getDate()} de ${MESES[inicio.getMonth()]}`
    : `${inicio.getDate()} de ${MESES[inicio.getMonth()]} a ${fim.getDate()} de ${MESES[fim.getMonth()]}`;
};

// ==========================================
// DURAÇÃO
// ==========================================

const DURACAO_MIN_ACEITAVEL = 5;
const DURACAO_MAX_ACEITAVEL = 8 * 60;

/**
 * Lê o `duration` do catálogo, que é texto livre — "60 min", "60 a 90 min", "1h 30min".
 *
 * Numa faixa vale o **limite superior**: reservar a mais devolve o horário assim que a sessão
 * acaba, enquanto reservar a menos atrasa todo mundo que vem depois. `undefined` quando não dá
 * para ler, para quem chama decidir o padrão em vez de receber um número inventado.
 */
export const duracaoDoProcedimento = (duration?: string): number | undefined => {
  const texto = (duration || '').toLowerCase().trim();
  if (!texto) return undefined;

  let minutos: number | undefined;

  // "1h", "1h30", "2h a 3h" — a última hora citada é o teto da faixa.
  const horas = [...texto.matchAll(/(\d+)\s*h/g)];
  if (horas.length > 0) {
    const ultima = horas[horas.length - 1];
    const depoisDoH = texto.slice((ultima.index ?? 0) + ultima[0].length);
    const minutosSoltos = /^\s*(\d+)/.exec(depoisDoH);
    minutos = Number(ultima[1]) * 60 + (minutosSoltos ? Number(minutosSoltos[1]) : 0);
  } else {
    const numeros = [...texto.matchAll(/\d+/g)];
    if (numeros.length > 0) minutos = Number(numeros[numeros.length - 1][0]);
  }

  if (!minutos || !Number.isFinite(minutos)) return undefined;
  if (minutos < DURACAO_MIN_ACEITAVEL || minutos > DURACAO_MAX_ACEITAVEL) return undefined;
  return minutos;
};

/** O que o registro diz; na falta, o que o catálogo diz; na falta, o padrão. */
export const duracaoDoAtendimento = (
  a: Pick<Attendance, 'duracaoMin' | 'procedureId'>,
  catalogo: Procedure[]
): number => {
  if (a.duracaoMin && a.duracaoMin >= DURACAO_MIN_ACEITAVEL) return a.duracaoMin;
  const doCatalogo = a.procedureId
    ? duracaoDoProcedimento(catalogo.find((p) => p.id === a.procedureId)?.duration)
    : undefined;
  return doCatalogo ?? AGENDA_DEFAULTS.duracaoMin;
};

export interface IntervaloNoDia {
  inicioMin: number;
  fimMin: number;
}

/** Onde a visita começa e termina no dia. `null` para quem não tem hora — não vai para a grade. */
export const intervaloDoAtendimento = (
  a: Pick<Attendance, 'hora' | 'duracaoMin' | 'procedureId'>,
  catalogo: Procedure[]
): IntervaloNoDia | null => {
  const inicioMin = minutosDoHHMM(a.hora);
  if (inicioMin === null) return null;
  return { inicioMin, fimMin: inicioMin + duracaoDoAtendimento(a, catalogo) };
};

// ==========================================
// EXPEDIENTE
// ==========================================

export interface ExpedienteDoDia {
  abreMin: number;
  fechaMin: number;
}

/**
 * O expediente daquele dia, ou `null` se a clínica não abre.
 *
 * Isto **não bloqueia nada**: encaixe fora do horário continua sendo gravável, só nasce pintado de
 * cinza. Quem decide abrir uma exceção é a clínica, não a grade.
 */
export const expedienteDoDia = (
  clinic: Pick<ClinicProfile, 'agendaExpediente'>,
  data: DataISO
): ExpedienteDoDia | null => {
  const tabela =
    clinic.agendaExpediente && clinic.agendaExpediente.length > 0
      ? clinic.agendaExpediente
      : AGENDA_DEFAULTS.expediente;

  const dia = tabela.find((d) => d.diaSemana === diaDaSemanaDe(data));
  const abreMin = minutosDoHHMM(dia?.abre);
  const fechaMin = minutosDoHHMM(dia?.fecha);
  if (abreMin === null || fechaMin === null || fechaMin <= abreMin) return null;
  return { abreMin, fechaMin };
};

export const intervaloDaGrade = (clinic: Pick<ClinicProfile, 'agendaIntervaloMin'>): number => {
  const valor = clinic.agendaIntervaloMin;
  return valor && (INTERVALOS_DISPONIVEIS as readonly number[]).includes(valor)
    ? valor
    : AGENDA_DEFAULTS.intervaloMin;
};

// ==========================================
// O QUE ENTRA NA GRADE
// ==========================================

/**
 * Ocupa espaço na grade?
 *
 * `remarcado` **não** desenha: aquele horário foi devolvido e pintá-lo faria a agenda mentir que
 * está cheia. O rastro da remarcação continua inteiro na aba do paciente, que é onde ele importa.
 * Sem hora também não desenha — ver `semHorario`.
 */
export const ocupaAGrade = (a: Attendance): boolean => !!a.hora && a.status !== 'remarcado';

/**
 * Visita do dia que não tem hora. Só lançamento retroativo cai aqui (agendamento exige horário), e
 * forçá-la a um horário seria inventar dado — então vai para uma faixa acima da grade.
 */
export const semHorario = (a: Attendance): boolean => !a.hora && a.status !== 'remarcado';

/**
 * Ordena visitas dentro de um mesmo dia. Sem hora, meio-dia — o mesmo critério de
 * `instanteDoAtendimento`: uma visita sem horário não cai antes de uma das 9h nem depois de uma das
 * 18h, que seriam as duas mentiras possíveis de um padrão em 00:00 ou 23:59.
 */
export const instanteNoDia = (a: Pick<Attendance, 'hora'>): number =>
  minutosDoHHMM(a.hora) ?? 12 * 60;

export const atendimentosDoDia = (
  atendimentos: Attendance[],
  data: DataISO,
  professionalId?: string
): Attendance[] =>
  atendimentos.filter(
    (a) => a.data === data && (!professionalId || a.professionalId === professionalId)
  );

/**
 * A faixa de horas que a grade desenha: o expediente dos dias visíveis, **esticado para caber
 * qualquer encaixe fora dele**. Um atendimento marcado às 7h não pode ficar invisível só porque a
 * clínica abre às 9h.
 */
export const faixaDaGrade = (
  dias: DataISO[],
  atendimentos: Attendance[],
  clinic: Pick<ClinicProfile, 'agendaExpediente'>,
  catalogo: Procedure[]
): IntervaloNoDia => {
  let inicio: number | undefined;
  let fim: number | undefined;

  const considerar = (a: number, b: number) => {
    inicio = inicio === undefined ? a : Math.min(inicio, a);
    fim = fim === undefined ? b : Math.max(fim, b);
  };

  dias.forEach((dia) => {
    const exp = expedienteDoDia(clinic, dia);
    if (exp) considerar(exp.abreMin, exp.fechaMin);
  });

  const diasVisiveis = new Set(dias);
  atendimentos.forEach((a) => {
    if (!diasVisiveis.has(a.data) || !ocupaAGrade(a)) return;
    const intervalo = intervaloDoAtendimento(a, catalogo);
    if (intervalo) considerar(intervalo.inicioMin, intervalo.fimMin);
  });

  if (inicio === undefined || fim === undefined) {
    inicio = AGENDA_DEFAULTS.gradeInicioMin;
    fim = AGENDA_DEFAULTS.gradeFimMin;
  }

  // Hora cheia nas duas pontas, e no mínimo quatro horas de altura para a grade não virar um risco.
  const inicioMin = Math.max(0, Math.floor(inicio / 60) * 60);
  const fimMin = Math.min(24 * 60, Math.max(Math.ceil(fim / 60) * 60, inicioMin + 4 * 60));
  return { inicioMin, fimMin };
};

/**
 * Esconde da semana os dias em que a clínica não abre **e** nada está marcado. Domingo vazio só
 * rouba largura das colunas que interessam; domingo com um encaixe continua aparecendo.
 */
export const diasVisiveisDaSemana = (
  dias: DataISO[],
  atendimentos: Attendance[],
  clinic: Pick<ClinicProfile, 'agendaExpediente'>
): DataISO[] => {
  const comAlgo = new Set(atendimentos.filter((a) => a.status !== 'remarcado').map((a) => a.data));
  const visiveis = dias.filter((d) => !!expedienteDoDia(clinic, d) || comAlgo.has(d));
  return visiveis.length > 0 ? visiveis : dias;
};

// ==========================================
// SOBREPOSIÇÃO
// ==========================================

export interface EventoDaGrade {
  id: string;
  inicioMin: number;
  fimMin: number;
}

export interface PosicaoNaGrade {
  coluna: number;
  colunas: number;
}

/**
 * Divide a largura entre atendimentos que se cruzam.
 *
 * Os eventos são agrupados em blocos que se tocam; dentro do bloco, cada um entra na primeira
 * coluna cujo último evento já terminou. Todos do mesmo bloco recebem o mesmo `colunas`, senão dois
 * cartões vizinhos teriam larguras diferentes e pareceriam desalinhados.
 */
export const distribuirEmColunas = (eventos: EventoDaGrade[]): Map<string, PosicaoNaGrade> => {
  const posicoes = new Map<string, PosicaoNaGrade>();
  // Começando junto, o **mais longo vai para a esquerda** — a convenção de todo calendário, e a
  // que evita o cartão comprido ficar espremido na ponta direita da coluna.
  const ordenados = [...eventos].sort(
    (a, b) => a.inicioMin - b.inicioMin || b.fimMin - a.fimMin || a.id.localeCompare(b.id)
  );

  let grupo: { evento: EventoDaGrade; coluna: number }[] = [];
  let fimDoGrupo = -Infinity;
  let fimPorColuna: number[] = [];

  const fecharGrupo = () => {
    const colunas = Math.max(1, fimPorColuna.length);
    grupo.forEach(({ evento, coluna }) => posicoes.set(evento.id, { coluna, colunas }));
    grupo = [];
    fimPorColuna = [];
    fimDoGrupo = -Infinity;
  };

  ordenados.forEach((evento) => {
    if (evento.inicioMin >= fimDoGrupo) fecharGrupo();

    let coluna = fimPorColuna.findIndex((fim) => fim <= evento.inicioMin);
    if (coluna === -1) {
      coluna = fimPorColuna.length;
      fimPorColuna.push(evento.fimMin);
    } else {
      fimPorColuna[coluna] = evento.fimMin;
    }

    grupo.push({ evento, coluna });
    fimDoGrupo = Math.max(fimDoGrupo, evento.fimMin);
  });

  fecharGrupo();
  return posicoes;
};

// ==========================================
// CONFLITO DE HORÁRIO
// ==========================================

export interface CandidatoDeHorario {
  /** Ausente em registro novo; presente na edição, para ele não conflitar consigo mesmo. */
  id?: string;
  data: DataISO;
  hora?: string;
  duracaoMin?: number;
  procedureId?: string;
  professionalId?: string;
}

/**
 * Os atendimentos da mesma profissional que se cruzam com este horário.
 *
 * Alimenta um **aviso**, nunca um erro de validação: encaixe é decisão da clínica, e um formulário
 * que se recusa a salvar acaba contornado por fora, com o horário anotado no papel. Faltas e
 * remarcações não contam — aquele horário voltou a estar livre.
 */
export const conflitosDe = (
  candidato: CandidatoDeHorario,
  atendimentos: Attendance[],
  catalogo: Procedure[]
): Attendance[] => {
  if (!candidato.professionalId) return [];
  const meu = intervaloDoAtendimento(candidato, catalogo);
  if (!meu) return [];

  return atendimentos.filter((a) => {
    if (a.id === candidato.id) return false;
    if (a.data !== candidato.data) return false;
    if (a.professionalId !== candidato.professionalId) return false;
    if (a.status === 'faltou' || a.status === 'remarcado') return false;
    const outro = intervaloDoAtendimento(a, catalogo);
    if (!outro) return false;
    return meu.inicioMin < outro.fimMin && outro.inicioMin < meu.fimMin;
  });
};

// ==========================================
// PENDÊNCIAS
// ==========================================

/**
 * Agendamentos que já passaram e ninguém resolveu — o mesmo `ehPendenteAtrasado` de
 * `utils/attendances.ts`, aqui ordenado do mais antigo para o mais novo: quem está esperando
 * desfecho há mais tempo é quem a recepção precisa ver primeiro.
 */
export const agendamentosAtrasados = (atendimentos: Attendance[]): Attendance[] =>
  atendimentos
    .filter((a) => a.status === 'agendado' && a.data < hojeISO())
    .sort((a, b) => a.data.localeCompare(b.data) || (a.hora || '').localeCompare(b.hora || ''));

// ==========================================
// COR DA PROFISSIONAL
// ==========================================

/**
 * Seis tons que convivem com o bronze da casa. Servem à **tarja lateral** do cartão; o
 * preenchimento continua sendo do status, senão as duas informações brigariam pelo mesmo pixel.
 */
export const CORES_DE_PROFISSIONAL = [
  '#A67C52',
  '#7C8B6F',
  '#8A7CA6',
  '#A6707C',
  '#6F8BA6',
  '#A69352',
];

/**
 * Cor estável a partir do id — sem campo novo no `Professional` e sem cadastro para a equipe
 * manter. Duas profissionais podem cair no mesmo tom; com uma equipe desse tamanho é aceitável, e
 * o nome continua escrito no cartão.
 */
export const corDaProfissional = (professionalId?: string): string => {
  if (!professionalId) return '#C3BDB2';
  let hash = 0;
  for (let i = 0; i < professionalId.length; i++) {
    hash = (hash * 31 + professionalId.charCodeAt(i)) >>> 0;
  }
  return CORES_DE_PROFISSIONAL[hash % CORES_DE_PROFISSIONAL.length];
};

// ==========================================
// CONFIRMAÇÃO NO WHATSAPP
// ==========================================

const primeiroNomeDe = (nome: string): string => (nome || '').trim().split(/\s+/)[0] || '';

/**
 * Monta a mensagem de confirmação a partir do template da clínica.
 *
 * Marcador desconhecido fica como está, para um erro de digitação no template aparecer na hora em
 * vez de sumir calado; marcador conhecido e vazio vira string vazia. De todo jeito quem envia revê
 * a mensagem no WhatsApp antes de mandar.
 */
export const mensagemDeConfirmacao = (
  clinic: Pick<ClinicProfile, 'name' | 'agendaConfirmacaoTemplate'>,
  atendimento: Attendance
): string => {
  const template = clinic.agendaConfirmacaoTemplate?.trim() || AGENDA_DEFAULTS.confirmacaoTemplate;
  const valores: Record<string, string> = {
    primeiroNome: primeiroNomeDe(atendimento.pacienteNome),
    data: dataExtensa(atendimento.data),
    hora: atendimento.hora || '',
    procedimento: atendimento.procedimentoNome || '',
    profissional: atendimento.profissionalNome || '',
    clinica: clinic.name || '',
  };
  return template.replace(/\{(\w+)\}/g, (inteiro, chave: string) =>
    chave in valores ? valores[chave] : inteiro
  );
};

/** O telefone que a confirmação usa. Paciente sem cadastro não tem contato — o botão desliga. */
export const contatoDoAtendimento = (
  atendimento: Attendance,
  pacientes: Patient[]
): string | undefined => pacientes.find((p) => p.id === atendimento.pacienteId)?.contato;

// ==========================================
// RESUMO DO DIA
// ==========================================

export interface ResumoDoDia {
  agendados: number;
  realizados: number;
  faltas: number;
  /** Minutos ocupados — o que responde "o dia está cheio?" sem precisar contar cartão. */
  minutosOcupados: number;
}

export const resumoDoDia = (atendimentos: Attendance[], catalogo: Procedure[]): ResumoDoDia => {
  let minutosOcupados = 0;
  atendimentos.forEach((a) => {
    if (ocupaAGrade(a) && a.status !== 'faltou') {
      minutosOcupados += duracaoDoAtendimento(a, catalogo);
    }
  });
  return {
    agendados: atendimentos.filter((a) => a.status === 'agendado').length,
    realizados: atendimentos.filter((a) => a.status !== 'remarcado' && ehRealizado(a)).length,
    faltas: atendimentos.filter((a) => a.status === 'faltou').length,
    minutosOcupados,
  };
};

/** Nome curto para caber no cartão: "Dra. Karoline F.". */
export const nomeCurtoDaProfissional = (
  professionalId: string | undefined,
  professionals: Professional[]
): string | undefined => {
  const nome = professionals.find((p) => p.id === professionalId)?.name;
  if (!nome) return undefined;
  const partes = nome.trim().split(/\s+/);
  if (partes.length <= 2) return nome;
  return `${partes.slice(0, 2).join(' ')} ${partes[partes.length - 1][0]}.`;
};

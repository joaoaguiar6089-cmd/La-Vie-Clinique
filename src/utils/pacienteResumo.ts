import {
  AnamnesisQuestion,
  AnamnesisRecord,
  Attendance,
  EvaluationRecord,
  Patient,
  Procedure,
  Quote,
  SessionPlan,
} from '../types';
import { DataISO, ehRealizado, hojeISO, instanteDoAtendimento, progressoDoPlano } from './attendances';

/**
 * O que a aba Resumo da ficha da paciente precisa saber.
 *
 * Tudo derivado dos documentos que a página já tem em mãos — cadastro, anamneses, atendimentos,
 * planos e orçamentos. Nenhuma leitura nova, nenhum campo novo no banco além do intervalo entre
 * sessões, que é do catálogo.
 */

// ==========================================
// IDENTIFICAÇÃO
// ==========================================

/** "AL" para "Ana Lúcia", "J" para "José". Duas letras no máximo. */
export const iniciaisDe = (nome: string): string => {
  const partes = (nome || '')
    .trim()
    .split(/\s+/)
    // Preposição não é nome: "Maria da Silva" é MS, não MD.
    .filter((p) => p.length > 2 || /^[A-ZÀ-Ý]/.test(p[0] || ''))
    .filter((p) => !['de', 'da', 'do', 'das', 'dos', 'e'].includes(p.toLowerCase()));
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0][0].toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
};

/**
 * Idade em anos a partir de `dataNascimento` (YYYY-MM-DD).
 *
 * `undefined` quando não há data ou ela não faz sentido. Nada de "0 anos" para quem não informou
 * o nascimento: um zero na ficha parece dado, e dado errado é pior que dado ausente.
 */
export const idadeDe = (dataNascimento?: string, hoje: DataISO = hojeISO()): number | undefined => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataNascimento || '')) return undefined;
  const [an, mn, dn] = (dataNascimento as string).split('-').map(Number);
  const [ah, mh, dh] = hoje.split('-').map(Number);
  let idade = ah - an;
  if (mh < mn || (mh === mn && dh < dn)) idade -= 1;
  return idade >= 0 && idade < 130 ? idade : undefined;
};

/**
 * Desde quando ela é paciente da casa.
 *
 * O primeiro atendimento **realizado** vale mais que a data de cadastro: quem foi cadastrada hoje
 * para lançar uma visita de dois anos atrás é paciente desde aquela visita. Sem atendimento
 * nenhum, cai no cadastro.
 */
export const pacienteDesde = (patient: Patient, atendimentos: Attendance[]): string | undefined => {
  const realizados = atendimentos.filter(ehRealizado).map((a) => a.data).filter(Boolean);
  const primeiro = realizados.sort()[0];
  return primeiro || patient.createdAt?.slice(0, 10) || undefined;
};

// ==========================================
// ALERTA DA ANAMNESE
// ==========================================

export interface AlertaDaAnamnese {
  /** A ficha de onde tudo isto saiu. */
  fichaId: string;
  data: string;
  procedimentoNome: string;
  /** Contraindicações do procedimento, vindas do catálogo. */
  contraindicacoes?: string;
  /** Perguntas de sim/não que a paciente respondeu "sim". */
  respostasDeRisco: string[];
}

const ehSim = (valor: unknown): boolean =>
  valor === true ||
  valor === 'sim' ||
  valor === 'Sim' ||
  valor === 'SIM' ||
  (typeof valor === 'string' && valor.trim().toLowerCase() === 'sim');

const riscoNas = (
  perguntas: AnamnesisQuestion[] = [],
  respostas: Record<string, any> = {}
): string[] =>
  perguntas
    .filter((q) => q.tipo_campo === 'sim_nao' && ehSim(respostas[q.id]))
    .map((q) => q.texto);

/**
 * O que precisa estar na frente dos olhos antes de qualquer outra coisa da ficha.
 *
 * Duas fontes, as duas da **anamnese mais recente**: as contraindicações do procedimento (texto
 * do catálogo) e as perguntas de sim/não que ela respondeu "sim".
 *
 * A heurística do sim é deliberada e não pretende ser clínica: numa ficha de anamnese, pergunta
 * de sim/não existe para separar quem tem de quem não tem — alergia, gestação, uso de
 * anticoagulante, marca-passo. Mostrar os "sim" é repetir o que a ficha já diz, em lugar visível.
 * Quem lê continua sendo a profissional.
 *
 * `null` quando não há ficha nenhuma ou quando a mais recente não levantou nada.
 */
export const alertaDaAnamnese = (
  records: AnamnesisRecord[],
  catalogo: Procedure[]
): AlertaDaAnamnese | null => {
  const maisRecente = [...records].sort((a, b) =>
    (b.dataAtendimento || b.createdAt || '').localeCompare(a.dataAtendimento || a.createdAt || '')
  )[0];
  if (!maisRecente) return null;

  const procedimento = maisRecente.procedimentoId
    ? catalogo.find((p) => p.id === maisRecente.procedimentoId)
    : undefined;

  const respostasDeRisco = [
    ...riscoNas(maisRecente.perguntasSnapshot?.gerais, maisRecente.respostasGerais),
    ...riscoNas(maisRecente.perguntasSnapshot?.especificas, maisRecente.respostasEspecificas),
  ];
  const contraindicacoes = procedimento?.contraindications?.trim() || undefined;

  if (!contraindicacoes && respostasDeRisco.length === 0) return null;

  return {
    fichaId: maisRecente.id,
    data: maisRecente.dataAtendimento || maisRecente.createdAt,
    procedimentoNome: maisRecente.procedimentoNome,
    contraindicacoes,
    respostasDeRisco,
  };
};

// ==========================================
// PROGRESSO DOS PLANOS
// ==========================================

/** Quando não há intervalo cadastrado no procedimento. Trinta dias é o mais comum na casa. */
export const INTERVALO_PADRAO_DIAS = 30;

export interface ProgressoParaExibir {
  plano: SessionPlan;
  realizadas: number;
  total: number;
  /** 0–100, limitado a 100: a 11ª sessão de um plano de 10 acontece e não estoura a barra. */
  percentual: number;
  /** Data sugerida para a próxima, em ISO. Ausente quando não há sessão anterior de onde contar. */
  proximaSugerida?: DataISO;
  /** Já existe agendamento futuro deste plano — então não há o que sugerir. */
  jaAgendada: boolean;
}

const somarDias = (data: DataISO, dias: number): DataISO => {
  const d = new Date(`${data}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
};

/**
 * Os planos abertos da paciente, com o quanto já andaram e quando seria a próxima sessão.
 *
 * A sugestão é a **última sessão realizada + o intervalo do procedimento**, e some quando já
 * existe agendamento futuro daquele plano: sugerir uma data para quem já tem horário marcado é
 * ruído, e pior, ruído que contradiz a agenda.
 */
export const progressoDosPlanos = (
  planos: SessionPlan[],
  atendimentos: Attendance[],
  catalogo: Procedure[],
  hoje: DataISO = hojeISO()
): ProgressoParaExibir[] =>
  planos
    .filter((p) => !p.encerradoEm)
    .map((plano) => {
      const doPlano = atendimentos.filter((a) => a.planoId === plano.id);
      const { realizadas } = progressoDoPlano(plano, doPlano);
      const realizados = doPlano
        .filter(ehRealizado)
        .sort((a, b) => instanteDoAtendimento(b) - instanteDoAtendimento(a));
      const ultima = realizados[0]?.data;
      const jaAgendada = doPlano.some((a) => a.status === 'agendado' && a.data >= hoje);

      const intervalo =
        (plano.procedureId
          ? catalogo.find((p) => p.id === plano.procedureId)?.intervaloEntreSessoesDias
          : undefined) || INTERVALO_PADRAO_DIAS;

      return {
        plano,
        realizadas,
        total: plano.totalSessoes,
        percentual: Math.min(100, Math.round((realizadas / Math.max(1, plano.totalSessoes)) * 100)),
        proximaSugerida:
          jaAgendada || !ultima || realizadas >= plano.totalSessoes
            ? undefined
            : somarDias(ultima, intervalo),
        jaAgendada,
      };
    });

// ==========================================
// FOTOS
// ==========================================

export interface FotoDaPaciente {
  url: string;
  /** Data do atendimento da ficha de onde a foto veio. */
  data: string;
  procedimentoNome: string;
  fichaId: string;
}

/**
 * As fotos da paciente, da mais antiga para a mais nova — a ordem de uma evolução.
 *
 * A versão anotada não entra: o comparador serve para ver a pele, e a seta desenhada por cima
 * atrapalha justamente a comparação. Ela continua na ficha e no PDF, que é onde a anotação
 * existe para ser lida.
 */
export const fotosDaPaciente = (records: AnamnesisRecord[]): FotoDaPaciente[] =>
  records
    .map((r) => ({
      url: r.fotoPacienteUrl || r.fotoUrl || '',
      data: r.dataAtendimento || r.createdAt,
      procedimentoNome: r.procedimentoNome,
      fichaId: r.id,
    }))
    .filter((f) => !!f.url)
    .sort((a, b) => (a.data || '').localeCompare(b.data || ''));

// ==========================================
// LINHA DO TEMPO
// ==========================================

export type ItemDaLinha =
  | { tipo: 'atendimento'; id: string; data: string; titulo: string; profissional?: string; ref: Attendance }
  | { tipo: 'anamnese'; id: string; data: string; titulo: string; profissional?: string; ref: AnamnesisRecord }
  | { tipo: 'avaliacao'; id: string; data: string; titulo: string; profissional?: string; ref: EvaluationRecord }
  | { tipo: 'orcamento'; id: string; data: string; titulo: string; profissional?: string; ref: Quote };

/**
 * Tudo o que aconteceu com esta paciente, do mais recente para o mais antigo.
 *
 * Uma linha só, e não quatro listas: a pergunta que a profissional faz ao abrir a ficha é "o que
 * andou acontecendo aqui", e a resposta atravessa os tipos de documento da jornada — orçamento,
 * anamnese, avaliação e atendimento. As abas continuam existindo para quando a pergunta é sobre um
 * tipo específico.
 */
export const linhaDoTempo = (
  atendimentos: Attendance[],
  records: AnamnesisRecord[],
  quotes: Quote[],
  avaliacoes: EvaluationRecord[] = []
): ItemDaLinha[] => {
  const itens: ItemDaLinha[] = [
    ...atendimentos.map((a) => ({
      tipo: 'atendimento' as const,
      id: a.id,
      data: a.data,
      titulo: a.procedimentoNome,
      profissional: a.profissionalNome,
      ref: a,
    })),
    ...records.map((r) => ({
      tipo: 'anamnese' as const,
      id: r.id,
      data: (r.dataAtendimento || r.createdAt || '').slice(0, 10),
      titulo: r.procedimentoNome,
      profissional: r.profissionalNome,
      ref: r,
    })),
    ...avaliacoes.map((r) => ({
      tipo: 'avaliacao' as const,
      id: r.id,
      data: (r.dataAtendimento || r.createdAt || '').slice(0, 10),
      titulo: r.procedimentoNome,
      profissional: r.profissionalNome,
      ref: r,
    })),
    ...quotes.map((q) => ({
      tipo: 'orcamento' as const,
      id: q.id,
      data: (q.dataEmissao || q.createdAt || '').slice(0, 10),
      titulo: `Orçamento ${q.numero}`,
      profissional: undefined,
      ref: q,
    })),
  ];

  return itens
    .filter((i) => !!i.data)
    .sort(
      (a, b) =>
        b.data.localeCompare(a.data) || ETAPA_DA_JORNADA[b.tipo] - ETAPA_DA_JORNADA[a.tipo]
    );
};

/**
 * A ordem da jornada da paciente: Orçamento → Anamnese → Avaliação → Atendimento. É ela que
 * desempata o mesmo dia — a linha vai do mais recente para o mais antigo, então a etapa mais
 * adiantada da jornada fica em cima.
 */
export const ETAPA_DA_JORNADA: Record<ItemDaLinha['tipo'], number> = {
  orcamento: 0,
  anamnese: 1,
  avaliacao: 2,
  atendimento: 3,
};

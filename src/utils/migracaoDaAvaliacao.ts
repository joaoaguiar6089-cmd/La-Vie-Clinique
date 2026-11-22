import {
  AnamnesisQuestion,
  Attendance,
  EvaluationRecord,
  EvaluationTemplate,
  Procedure,
} from '../types';
import { ehRealizado, mesmoProcedimento } from './attendances';
import { fichaDeAvaliacaoPara } from './evaluations';
import {
  PROCEDIMENTO_AVALIACAO_ID,
  ehAvaliacao,
  focosDoProcedimento,
  mesmoFoco,
} from './procedimentoAvaliacao';
import { chaveDeNome } from './templateMatching';

/**
 * A migração que acaba com a ficha de avaliação: cada avaliação preenchida vira o relatório de um
 * atendimento, e cada ficha-modelo de avaliação vira uma ficha-modelo de relatório da Avaliação.
 *
 * Existe porque a avaliação passou a ser um atendimento como outro qualquer — o do procedimento
 * fixo Avaliação (`utils/procedimentoAvaliacao.ts`) —, com o foco no que a cliente quer avaliar.
 * Com a ficha de avaliação ao lado do relatório, a mesma visita ficava com dois documentos para
 * preencher.
 *
 * Tudo aqui é a **decisão**, sem banco nenhum: `databaseService` só traduz o plano em gravações, e
 * `scripts/verificar-avaliacao-vira-relatorio.ts` confere o plano sem Firebase. Uma migração que
 * roda uma vez por clínica e apaga as fichas antigas não estreia sem ninguém ver o que ela faz.
 */

/** Marca gravada em `clinic_settings/migrations` e nas fichas-modelo convertidas. */
export const MIGRACAO_AVALIACAO_VIRA_RELATORIO = 'avaliacao-vira-relatorio-v1';

/** O prefixo do "Avaliação — Harmonização Glútea" — o nome das fichas-modelo de avaliação. */
const PREFIXO_DO_NOME = /^\s*avalia[cç][aã]o\s*[—–-]\s*/i;

/** Ids que o Firestore aceita como documento: sem barra. */
const idSeguro = (id: string): string => id.replace(/\//g, '_');

/** O id do atendimento criado para levar o relatório de uma avaliação — fixo, para a migração poder rodar duas vezes. */
export const idDoAtendimentoDaAvaliacao = (registroId: string): string => `atd-aval-${idSeguro(registroId)}`;

// ==========================================
// AS FICHAS-MODELO
// ==========================================

/**
 * Os focos de uma ficha-modelo de avaliação: o nome de cada procedimento ligado a ela e o de cada
 * categoria inteira — "Harmonização Glútea", "Depilação a Laser". É o que a cliente quer avaliar.
 *
 * Procedimento que não está no catálogo não vira foco: não há nome confiável para ele.
 */
export const focosDaFichaDeAvaliacao = (ficha: EvaluationTemplate, catalogo: Procedure[]): string[] => {
  const nomes = [
    ...(ficha.procedureIds || [])
      .map((id) => (catalogo || []).find((p) => p.id === id && !ehAvaliacao(p))?.title)
      .filter((t): t is string => !!t && !!t.trim()),
    ...(ficha.categorias || []).filter((c) => !!c && !!c.trim()),
  ];
  return focosDoProcedimento({ focos: nomes });
};

/**
 * A ficha vale para alguma coisa que a clínica tem? Um procedimento ligado que está no catálogo,
 * ou uma categoria com procedimento no catálogo.
 */
const fichaComAlvoNoCatalogo = (ficha: EvaluationTemplate, catalogo: Procedure[]): boolean => {
  const ids = new Set((catalogo || []).map((p) => p.id));
  const categorias = new Set((catalogo || []).map((p) => chaveDeNome(p.category)).filter(Boolean));
  return (
    (ficha.procedureIds || []).some((id) => ids.has(id)) ||
    (ficha.categorias || []).some((c) => categorias.has(chaveDeNome(c)))
  );
};

/** Junta as perguntas sem repetir id — a geral que a ficha já tenha não entra duas vezes. */
const juntarPerguntas = (...listas: AnamnesisQuestion[][]): AnamnesisQuestion[] => {
  const vistos = new Set<string>();
  const saida: AnamnesisQuestion[] = [];
  listas.flat().forEach((q) => {
    if (!q || !q.id || vistos.has(q.id)) return;
    vistos.add(q.id);
    saida.push(q);
  });
  return saida.map((q, i) => ({ ...q, ordem: i + 1 }));
};

// ==========================================
// O PLANO
// ==========================================

export interface EntradaDaMigracao {
  /** As fichas-modelo de avaliação (`evaluation_templates`). */
  fichasDeAvaliacao: EvaluationTemplate[];
  /** As perguntas gerais de avaliação, que entravam em toda avaliação. */
  geraisDeAvaliacao: AnamnesisQuestion[];
  /** As fichas-modelo de relatório que já existem — para não sobrescrever nenhuma. */
  fichasDeRelatorio: EvaluationTemplate[];
  /** As avaliações preenchidas (`evaluation_records`), inclusive as que estão no arquivo. */
  registros: EvaluationRecord[];
  /** Todos os atendimentos da clínica. */
  atendimentos: Attendance[];
  catalogo: Procedure[];
  /** A Avaliação como está agora — o nome e os focos dela. */
  avaliacao: Procedure;
  /** ISO — o instante da migração. */
  agora: string;
}

/** Um relatório a gravar, e o atendimento que o leva. */
export interface RelatorioDaMigracao {
  /** O registro de avaliação de origem — apagado depois que o relatório é gravado. */
  origemId: string;
  /** O relatório, já com o id do atendimento. */
  relatorio: EvaluationRecord;
  /**
   * O atendimento novo, do procedimento Avaliação, quando a avaliação não tinha visita. Ausente =
   * o relatório vai para um atendimento que já existe (`relatorio.atendimentoId`).
   */
  atendimentoNovo?: Attendance;
  /** Num atendimento de Avaliação que já existe e não tinha foco: o foco a gravar nele. */
  focoNoAtendimentoExistente?: string;
}

export interface PlanoDaMigracaoDaAvaliacao {
  /** As fichas-modelo de relatório a criar. */
  fichas: EvaluationTemplate[];
  /** A lista de focos da Avaliação depois da migração (a de antes, mais os novos). */
  focosDaAvaliacao: string[];
  relatorios: RelatorioDaMigracao[];
}

/**
 * O foco de uma avaliação preenchida: o que foi avaliado, na grafia das fichas-modelo.
 *
 * Se a ficha-modelo dela vale para uma categoria inteira ("Depilação a Laser"), o foco é a
 * categoria — é o foco da ficha de relatório que ela vira, e assim a avaliação reaberta continua
 * achando as mesmas perguntas. Na falta, o nome do procedimento. A personalizada não tem foco.
 */
export const focoDaAvaliacaoPreenchida = (
  r: EvaluationRecord,
  fichasDeAvaliacao: EvaluationTemplate[],
  catalogo: Procedure[]
): string | undefined => {
  if (r.personalizada) return undefined;
  const proc = r.procedureId ? (catalogo || []).find((p) => p.id === r.procedureId) : undefined;
  const nome = (proc?.title || r.procedimentoNome || '').trim();
  const ficha =
    (r.templateId && (fichasDeAvaliacao || []).find((f) => f.id === r.templateId)) ||
    fichaDeAvaliacaoPara(
      { procedureId: r.procedureId, procedimentoNome: r.procedimentoNome },
      fichasDeAvaliacao || [],
      catalogo || []
    );
  if (ficha) {
    const focos = focosDaFichaDeAvaliacao(ficha, catalogo);
    const peloNome = focos.find((f) => mesmoFoco(f, nome));
    if (peloNome) return peloNome;
    const pelaCategoria = proc?.category ? focos.find((f) => mesmoFoco(f, proc.category)) : undefined;
    if (pelaCategoria) return pelaCategoria;
    if (focos.length === 1) return focos[0];
  }
  return nome || undefined;
};

/**
 * O plano inteiro. Três decisões, cada uma com o seu porquê:
 *
 * 1. **Fichas-modelo.** Cada ficha de avaliação vira uma ficha de relatório ligada à Avaliação, só
 *    para os focos dela — "Avaliação — Harmonização Glútea" vale no relatório da Avaliação com foco
 *    em Harmonização Glútea. As perguntas gerais de avaliação entram em cada uma (no relatório,
 *    as gerais valem para todo atendimento, e estas eram só da avaliação) e, havendo alguma, numa
 *    ficha "Avaliação" sem foco, para a avaliação de qualquer outro procedimento. A ficha que não
 *    tem alvo no catálogo e que nenhuma avaliação usou fica para trás: é ficha padrão de
 *    procedimento que a clínica não tem, e viraria só um foco a mais na lista. O id é mantido
 *    (as avaliações preenchidas apontam para ele), salvo se já existir ficha de relatório com ele.
 *
 * 2. **Onde cada avaliação preenchida vai parar.** No atendimento dela, se a avaliação era de uma
 *    visita (as antigas, uma por atendimento) ou se há, no mesmo dia, um atendimento realizado
 *    dela — da Avaliação ou do mesmo procedimento — ainda sem relatório: é a mesma visita, e ela
 *    passa a ter um documento só. Sem isso, um atendimento novo da Avaliação, no dia da avaliação,
 *    sem hora, com o foco no que foi avaliado. Atendimento que já tem relatório nunca recebe
 *    outro por cima.
 *
 * 3. **Os focos da Avaliação.** Os que ela já tinha, mais os das fichas e os das avaliações —
 *    assim toda avaliação migrada aparece com o foco escolhido na lista.
 */
export const planejarMigracaoDaAvaliacao = (entrada: EntradaDaMigracao): PlanoDaMigracaoDaAvaliacao => {
  const catalogo = (entrada.catalogo || []).filter((p) => !ehAvaliacao(p));
  const fichasDeAvaliacao = entrada.fichasDeAvaliacao || [];
  const gerais = entrada.geraisDeAvaliacao || [];
  const registros = entrada.registros || [];
  const idsDeRelatorio = new Set((entrada.fichasDeRelatorio || []).map((f) => f.id));

  // ---- 1. fichas-modelo ----
  const usadas = new Set(registros.map((r) => r.templateId).filter(Boolean) as string[]);
  const novoIdDaFicha = new Map<string, string>();
  const fichas: EvaluationTemplate[] = [];
  const focosNovos: string[] = [];

  fichasDeAvaliacao.forEach((f) => {
    if (!fichaComAlvoNoCatalogo(f, catalogo) && !usadas.has(f.id)) return;
    const focos = focosDaFichaDeAvaliacao(f, catalogo);
    const id = idsDeRelatorio.has(f.id) ? `rel-${f.id}` : f.id;
    novoIdDaFicha.set(f.id, id);
    focosNovos.push(...focos);
    fichas.push({
      id,
      nome: f.nome || `Avaliação — ${focos[0] || 'sem foco'}`,
      descricao: f.descricao,
      procedureIds: focos.length > 0 ? [PROCEDIMENTO_AVALIACAO_ID] : [],
      categorias: [],
      focosPorProcedimento: focos.length > 0 ? { [PROCEDIMENTO_AVALIACAO_ID]: focos } : undefined,
      perguntas: juntarPerguntas(gerais, f.perguntas || []),
      temFotoSessao: true,
      fotoModeloUrl: f.fotoModeloUrl,
      fotoModeloFemininoUrl: f.fotoModeloFemininoUrl,
      fotoModeloMasculinoUrl: f.fotoModeloMasculinoUrl,
      migracoesAplicadas: Array.from(
        new Set([...(f.migracoesAplicadas || []), MIGRACAO_AVALIACAO_VIRA_RELATORIO])
      ),
    });
  });

  if (gerais.length > 0) {
    const id = idsDeRelatorio.has('aval-geral') ? 'rel-aval-geral' : 'aval-geral';
    fichas.push({
      id,
      nome: 'Avaliação',
      descricao: 'As perguntas gerais da antiga ficha de avaliação — para a avaliação de qualquer procedimento.',
      procedureIds: [PROCEDIMENTO_AVALIACAO_ID],
      categorias: [],
      perguntas: juntarPerguntas(gerais),
      temFotoSessao: true,
      migracoesAplicadas: [MIGRACAO_AVALIACAO_VIRA_RELATORIO],
    });
  }

  // ---- 2. as avaliações preenchidas ----
  const atendimentos = entrada.atendimentos || [];
  const porId = new Map(atendimentos.map((a) => [a.id, a]));
  /** Atendimentos que já têm (ou vão ganhar nesta migração) relatório. */
  const comRelatorio = new Set(atendimentos.filter((a) => !!a.acompanhamentoPreenchidoEm).map((a) => a.id));
  const nomeDaAvaliacao = (entrada.avaliacao?.title || '').trim() || 'Avaliação';

  const relatorios: RelatorioDaMigracao[] = [...registros]
    .sort((a, b) => (a.dataAtendimento || '').localeCompare(b.dataAtendimento || '') || a.id.localeCompare(b.id))
    .map((r): RelatorioDaMigracao => {
      const dia = (r.dataAtendimento || r.createdAt || entrada.agora).slice(0, 10);
      const foco = focoDaAvaliacaoPreenchida(r, fichasDeAvaliacao, catalogo);
      if (foco) focosNovos.push(foco);

      const livre = (a: Attendance | undefined): a is Attendance => !!a && !comRelatorio.has(a.id);
      const daVisita = r.atendimentoId ? porId.get(r.atendimentoId) : undefined;
      const doMesmoDia = atendimentos.find(
        (a) =>
          a.pacienteId === r.pacienteId &&
          a.data === dia &&
          ehRealizado(a) &&
          livre(a) &&
          (ehAvaliacao(a) ||
            mesmoProcedimento(
              { procedureId: a.procedureId, procedimentoNome: a.procedimentoNome },
              { procedureId: r.procedureId, procedimentoNome: r.procedimentoNome }
            ))
      );
      const existente = livre(daVisita) ? daVisita : doMesmoDia;

      const templateId = r.templateId ? novoIdDaFicha.get(r.templateId) || r.templateId : undefined;
      const base: EvaluationRecord = {
        ...r,
        templateId,
        personalizada: r.personalizada || undefined,
        updatedAt: entrada.agora,
      };

      if (existente) {
        comRelatorio.add(existente.id);
        return {
          origemId: r.id,
          relatorio: {
            ...base,
            id: existente.id,
            atendimentoId: existente.id,
            procedureId: existente.procedureId,
            procedimentoNome: existente.procedimentoNome,
            foco: existente.foco || (ehAvaliacao(existente) ? foco : undefined),
          },
          focoNoAtendimentoExistente: ehAvaliacao(existente) && !existente.foco ? foco : undefined,
        };
      }

      const id = idDoAtendimentoDaAvaliacao(r.id);
      comRelatorio.add(id);
      const atendimentoNovo: Attendance = {
        id,
        pacienteId: r.pacienteId,
        pacienteNome: r.pacienteNome,
        data: dia,
        procedureId: PROCEDIMENTO_AVALIACAO_ID,
        procedimentoNome: nomeDaAvaliacao,
        foco,
        professionalId: r.professionalId,
        profissionalNome: r.profissionalNome,
        acompanhamentoPreenchidoEm: r.preenchidoEm || r.createdAt || entrada.agora,
        // Com a paciente no arquivo, a visita vai junto — e aparece só na página dela, lá dentro.
        arquivadoEm: r.arquivadoEm,
        arquivoDe: r.arquivoDe,
        createdAt: r.createdAt || entrada.agora,
        updatedAt: entrada.agora,
      };
      return {
        origemId: r.id,
        atendimentoNovo,
        relatorio: {
          ...base,
          id,
          atendimentoId: id,
          procedureId: PROCEDIMENTO_AVALIACAO_ID,
          procedimentoNome: nomeDaAvaliacao,
          foco,
        },
      };
    });

  // ---- 3. os focos da Avaliação ----
  const focosDaAvaliacao = focosDoProcedimento({
    focos: [...focosDoProcedimento(entrada.avaliacao), ...focosNovos],
  });

  return { fichas, focosDaAvaliacao, relatorios };
};

/**
 * O relatório de uma avaliação que ia para um atendimento existente, refeito para um atendimento
 * novo — quando, na hora de gravar, o atendimento escolhido já tinha relatório (outro aparelho
 * gravou entre a leitura e a gravação). Nunca se grava um relatório por cima de outro.
 */
export const paraAtendimentoNovo = (
  item: RelatorioDaMigracao,
  original: EvaluationRecord,
  avaliacao: Procedure,
  agora: string
): RelatorioDaMigracao => {
  const id = idDoAtendimentoDaAvaliacao(original.id);
  const nome = (avaliacao?.title || '').trim() || 'Avaliação';
  const foco = item.relatorio.foco || item.focoNoAtendimentoExistente;
  return {
    origemId: item.origemId,
    atendimentoNovo: {
      id,
      pacienteId: original.pacienteId,
      pacienteNome: original.pacienteNome,
      data: (original.dataAtendimento || original.createdAt || agora).slice(0, 10),
      procedureId: PROCEDIMENTO_AVALIACAO_ID,
      procedimentoNome: nome,
      foco,
      professionalId: original.professionalId,
      profissionalNome: original.profissionalNome,
      acompanhamentoPreenchidoEm: original.preenchidoEm || original.createdAt || agora,
      arquivadoEm: original.arquivadoEm,
      arquivoDe: original.arquivoDe,
      createdAt: original.createdAt || agora,
      updatedAt: agora,
    },
    relatorio: {
      ...item.relatorio,
      id,
      atendimentoId: id,
      procedureId: PROCEDIMENTO_AVALIACAO_ID,
      procedimentoNome: nome,
      foco,
    },
  };
};

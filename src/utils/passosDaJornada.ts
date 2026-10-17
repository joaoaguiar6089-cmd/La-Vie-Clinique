import { AnamnesisRecord, AnamnesisTemplate, Attendance, EvaluationRecord, Procedure, Quote } from '../types';
import { chaveDoProcedimento, ehPendente, hojeISO, instanteDoAtendimento, mesmoProcedimento } from './attendances';
import { acompanhamentoComRegistro, atendimentoAconteceu } from './fichasClinicas';
import { mapearTemplatesPorProcedimento } from './templateMatching';

/**
 * O passo seguinte de cada documento da jornada — o que o painel do evento da linha do tempo
 * mostra abaixo do documento.
 *
 * A ordem é Orçamento → Anamnese → Avaliação → Atendimento → Acompanhamento. O painel não manda
 * a equipe procurar o formulário: mostra o passo seguinte já feito (com a data e o "Ver") ou por
 * fazer (com o botão que faz). As regras moram aqui, longe da tela, para a linha da clínica e a
 * da paciente nunca discordarem sobre o que já aconteceu.
 */

/** Um procedimento, do catálogo ou digitado à mão. */
export interface Tratamento {
  procedureId?: string;
  procedimentoNome: string;
  /**
   * A ficha de **anamnese** gravada no registro, quando o tratamento vem de uma anamnese. Fichas
   * antigas guardam o id da ficha no lugar do procedimento, e só por ela o vínculo aparece.
   */
  templateId?: string;
}

/** O que o painel precisa saber da paciente, além do próprio evento. */
export interface ContextoDaJornada {
  atendimentos: Attendance[];
  anamneses: AnamnesisRecord[];
  avaliacoes: EvaluationRecord[];
  catalogo: Procedure[];
  templatesAnamnese: AnamnesisTemplate[];
}

/** O dia de um registro: a data dele quando existe, a de criação quando não. */
export const diaDoRegistro = (r: { dataAtendimento?: string; createdAt?: string }): string =>
  (r.dataAtendimento || r.createdAt || '').slice(0, 10);

/**
 * O mesmo tratamento? O mesmo procedimento (pelo id ou pelo nome) — ou dois procedimentos que
 * usam a **mesma ficha de anamnese**. É o segundo caso que junta as áreas do laser: a anamnese de
 * "Axilas" responde pelo orçamento de "Buço", porque a ficha é uma só para as treze regiões.
 *
 * O nome conta mesmo quando os ids diferem: anamneses antigas gravaram o id da ficha no campo do
 * procedimento, e sem isto a "Harmonização Glútea" da anamnese não reconheceria a da avaliação.
 */
export const mesmoTratamento = (
  a: Tratamento,
  b: Tratamento,
  fichaPorProcedimento: Map<string, AnamnesisTemplate>
): boolean => {
  if (mesmoProcedimento(a, b)) return true;
  const nomeA = chaveDoProcedimento(a.procedimentoNome);
  if (nomeA && nomeA === chaveDoProcedimento(b.procedimentoNome)) return true;
  const fichaDe = (t: Tratamento) =>
    t.templateId || (t.procedureId ? fichaPorProcedimento.get(t.procedureId)?.id : undefined);
  const fichaA = fichaDe(a);
  return !!fichaA && fichaA === fichaDe(b);
};

/** O tratamento de um registro de anamnese — com a ficha dele. */
const tratamentoDaAnamnese = (r: AnamnesisRecord): Tratamento => ({
  procedureId: r.procedimentoId,
  procedimentoNome: r.procedimentoNome,
  templateId: r.templateId,
});

/** O tratamento de uma avaliação ou atendimento. O `templateId` da avaliação é de outra ficha, e fica de fora. */
const tratamentoDe = (x: { procedureId?: string; procedimentoNome: string }): Tratamento => ({
  procedureId: x.procedureId,
  procedimentoNome: x.procedimentoNome,
});

export const fichasDeAnamnesePorProcedimento = (
  contexto: Pick<ContextoDaJornada, 'templatesAnamnese' | 'catalogo'>
): Map<string, AnamnesisTemplate> =>
  mapearTemplatesPorProcedimento(contexto.templatesAnamnese, contexto.catalogo);

/** O mais recente primeiro — o passo "já feito" mostra o último. */
const maisRecente = <T extends { dataAtendimento?: string; createdAt?: string }>(lista: T[]): T | undefined =>
  [...lista].sort((x, y) => diaDoRegistro(y).localeCompare(diaDoRegistro(x)))[0];

// ==========================================
// AGENDAMENTOS
// ==========================================

/**
 * Os próximos agendamentos da paciente, do mais próximo ao mais distante, de qualquer
 * procedimento — a pergunta da recepção é "quando ela volta?", não "quando volta para isto".
 *
 * Só o que ainda está marcado: falta e remarcação já tiveram desfecho. `excetoId` tira o próprio
 * atendimento do painel, que já está no topo dele.
 */
export const proximosAgendamentos = (
  atendimentos: Attendance[],
  pacienteId: string | undefined,
  excetoId?: string
): Attendance[] => {
  if (!pacienteId) return [];
  const hoje = hojeISO();
  return atendimentos
    .filter((a) => a.pacienteId === pacienteId && a.id !== excetoId && ehPendente(a) && a.data >= hoje)
    .sort((a, b) => instanteDoAtendimento(a) - instanteDoAtendimento(b));
};

// ==========================================
// ORÇAMENTO → ANAMNESE
// ==========================================

/** Uma ficha de anamnese que o orçamento pede — uma por ficha diferente, não por procedimento. */
export interface AnamneseDoOrcamento {
  chave: string;
  /** O nome da ficha, ou do procedimento quando ele não tem ficha. */
  rotulo: string;
  templateId?: string;
  /** O primeiro procedimento do grupo — é ele que vai semeado para a anamnese nova. */
  tratamento: Tratamento;
  /** A anamnese preenchida desde o orçamento, quando já existe. */
  feita?: AnamnesisRecord;
}

/**
 * As anamneses que o orçamento pede, uma por ficha diferente: laser e botox são duas linhas, e as
 * treze áreas do laser são uma só. Conta como feita a anamnese da paciente com data a partir do
 * orçamento e do mesmo tratamento — senão uma anamnese de botox apareceria como a do laser.
 */
export const anamnesesDoOrcamento = (q: Quote, contexto: ContextoDaJornada): AnamneseDoOrcamento[] => {
  const fichaPorProcedimento = fichasDeAnamnesePorProcedimento(contexto);
  const diaDoOrcamento = (q.dataEmissao || q.createdAt || '').slice(0, 10);
  const daPaciente = q.pacienteId
    ? contexto.anamneses.filter((r) => r.pacienteId === q.pacienteId && diaDoRegistro(r) >= diaDoOrcamento)
    : [];

  const grupos: AnamneseDoOrcamento[] = [];
  const doGrupo = new Map<string, Tratamento[]>();
  (q.itens || []).forEach((item) => {
    const ficha = item.procedureId ? fichaPorProcedimento.get(item.procedureId) : undefined;
    const tratamento: Tratamento = { procedureId: item.procedureId, procedimentoNome: item.titulo, templateId: ficha?.id };
    const chave = ficha ? `ficha:${ficha.id}` : `proc:${item.procedureId || item.titulo}`;
    if (!doGrupo.has(chave)) {
      doGrupo.set(chave, []);
      grupos.push({
        chave,
        rotulo: ficha?.procedimentoNome || item.titulo,
        templateId: ficha?.id,
        tratamento,
      });
    }
    doGrupo.get(chave)!.push(tratamento);
  });

  return grupos.map((g) => {
    const tratamentos = doGrupo.get(g.chave) || [];
    const feita = maisRecente(
      daPaciente.filter(
        (r) =>
          (!!g.templateId && r.templateId === g.templateId) ||
          tratamentos.some((t) => mesmoTratamento(t, tratamentoDaAnamnese(r), fichaPorProcedimento))
      )
    );
    return { ...g, feita };
  });
};

// ==========================================
// ANAMNESE → AVALIAÇÃO
// ==========================================

/** A avaliação feita depois da anamnese, do mesmo tratamento — a resposta a ela. */
export const avaliacaoDaAnamnese = (
  r: AnamnesisRecord,
  contexto: ContextoDaJornada
): EvaluationRecord | undefined => {
  const fichaPorProcedimento = fichasDeAnamnesePorProcedimento(contexto);
  const dia = diaDoRegistro(r);
  const tratamento = tratamentoDaAnamnese(r);
  return maisRecente(
    contexto.avaliacoes.filter(
      (av) =>
        av.pacienteId === r.pacienteId &&
        diaDoRegistro(av) >= dia &&
        mesmoTratamento(tratamento, tratamentoDe(av), fichaPorProcedimento)
    )
  );
};

// ==========================================
// AVALIAÇÃO → ACOMPANHAMENTO
// ==========================================

/**
 * Os atendimentos que podem levar o acompanhamento da avaliação: os da paciente que já
 * aconteceram (ou já têm registro) a partir do dia da avaliação. Os do mesmo tratamento vêm
 * primeiro; dentro de cada grupo, o mais recente no topo.
 */
export const atendimentosDaAvaliacao = (av: EvaluationRecord, contexto: ContextoDaJornada): Attendance[] => {
  const fichaPorProcedimento = fichasDeAnamnesePorProcedimento(contexto);
  const dia = diaDoRegistro(av);
  const candidatos = contexto.atendimentos.filter(
    (a) =>
      a.pacienteId === av.pacienteId &&
      a.data >= dia &&
      (atendimentoAconteceu(a) || acompanhamentoComRegistro(a))
  );
  const peso = (a: Attendance) => (mesmoTratamento(tratamentoDe(av), tratamentoDe(a), fichaPorProcedimento) ? 0 : 1);
  return candidatos.sort(
    (a, b) => peso(a) - peso(b) || instanteDoAtendimento(b) - instanteDoAtendimento(a)
  );
};

// ==========================================
// SEMENTES DO FORMULÁRIO DE ATENDIMENTO
// ==========================================

/**
 * O agendamento novo pedido pelo painel: a paciente e o procedimento do evento, a data em branco.
 *
 * Vai como `atendimento` no modo `novo` do formulário — a mesma semente que a remarcação usa —, e
 * o formulário não reaproveita o id dela. Sem `linkToken`: um agendamento novo ganha o seu.
 */
export const sementeDoAgendamento = (alvo: {
  pacienteId?: string;
  pacienteNome: string;
  tratamento?: Tratamento;
  professionalId?: string;
}): Attendance => ({
  id: '',
  pacienteId: alvo.pacienteId || '',
  pacienteNome: alvo.pacienteNome,
  data: '',
  procedureId: alvo.tratamento?.procedureId,
  procedimentoNome: alvo.tratamento?.procedimentoNome || '',
  professionalId: alvo.professionalId,
  createdAt: '',
});

/**
 * A visita que o acompanhamento da avaliação precisa: o procedimento e a profissional da
 * avaliação, a data de hoje e a hora por preencher (o formulário a exige neste caso).
 */
export const sementeDaVisita = (av: EvaluationRecord): Attendance => ({
  ...sementeDoAgendamento({
    pacienteId: av.pacienteId,
    pacienteNome: av.pacienteNome,
    tratamento: tratamentoDe(av),
    professionalId: av.professionalId,
  }),
  data: hojeISO(),
});

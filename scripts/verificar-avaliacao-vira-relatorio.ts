/**
 * Confere a migração que acaba com a ficha de avaliação (`utils/migracaoDaAvaliacao.ts`) e a
 * escolha da ficha-modelo do relatório pelo foco (`fichaDeAvaliacaoPara`). Sem Firebase.
 *
 *   npx tsx scripts/verificar-avaliacao-vira-relatorio.ts
 */
import { AnamnesisQuestion, Attendance, EvaluationRecord, EvaluationTemplate, Procedure } from '../src/types';
import {
  MIGRACAO_AVALIACAO_VIRA_RELATORIO,
  focoDaAvaliacaoPreenchida,
  idDoAtendimentoDaAvaliacao,
  paraAtendimentoNovo,
  planejarMigracaoDaAvaliacao,
} from '../src/utils/migracaoDaAvaliacao';
import { fichaDeAvaliacaoPara } from '../src/utils/evaluations';
import {
  PROCEDIMENTO_AVALIACAO_ID,
  alvoDoQueFoiAvaliado,
  focosDoProcedimento,
  limparCamposDaAvaliacao,
  nomeComFoco,
  procedimentoAvaliacaoPadrao,
} from '../src/utils/procedimentoAvaliacao';
import { nomeDosProcedimentos } from '../src/utils/attendances';

let falhas = 0;
const ok = (nome: string, condicao: boolean, extra = '') => {
  console.log(`${condicao ? '  ok  ' : ' FALHA'}  ${nome}${extra ? `  — ${extra}` : ''}`);
  if (!condicao) falhas++;
};

const pergunta = (id: string, texto = id): AnamnesisQuestion => ({
  id,
  texto,
  tipo_campo: 'texto_curto',
  obrigatoria: false,
  ordem: 1,
});

const proc = (id: string, title: string, category: string): Procedure => ({
  id,
  title,
  category,
  description: '',
  price: 100,
  images: [],
  benefits: [],
  order: 1,
  createdAt: '2026-01-01',
});

const catalogo: Procedure[] = [
  proc('proc-gluteo', 'Harmonização Glútea', 'Corporal'),
  proc('proc-axilas', 'Axilas', 'Depilação a Laser'),
  proc('proc-buco', 'Buço', 'Depilação a Laser'),
  proc('proc-botox', 'Botox', 'Injetáveis'),
];

const ficha = (id: string, extra: Partial<EvaluationTemplate>): EvaluationTemplate => ({
  id,
  nome: `Avaliação — ${id}`,
  procedureIds: [],
  categorias: [],
  perguntas: [pergunta(`${id}-q1`)],
  temFotoSessao: true,
  ...extra,
});

const fichasDeAvaliacao: EvaluationTemplate[] = [
  ficha('aval-gluteo', { nome: 'Avaliação — Harmonização Glútea', procedureIds: ['proc-gluteo'] }),
  ficha('aval-laser', { nome: 'Avaliação — Depilação a Laser', categorias: ['Depilação a Laser'] }),
  // Ficha padrão de procedimento que a clínica não tem, e que ninguém usou: fica para trás.
  ficha('aval-soroterapia', { procedureIds: ['proc-soroterapia'] }),
  // Sem alvo no catálogo, mas usada por uma avaliação: vai, sem vínculo.
  ficha('aval-antiga', { procedureIds: ['proc-que-saiu'] }),
  // O id já existe entre as fichas de relatório.
  ficha('acomp-repetido', { procedureIds: ['proc-botox'] }),
];

const registro = (id: string, extra: Partial<EvaluationRecord>): EvaluationRecord => ({
  id,
  pacienteId: 'p1',
  pacienteNome: 'Ana',
  procedimentoNome: 'Harmonização Glútea',
  procedureId: 'proc-gluteo',
  dataAtendimento: '2026-11-10',
  professionalId: 'karol',
  profissionalNome: 'Dra. Karoline',
  respostas: { q: 'x' },
  perguntasSnapshot: [pergunta('q')],
  preenchidoEm: '2026-11-10T14:00:00.000Z',
  createdAt: '2026-11-10T14:00:00.000Z',
  ...extra,
});

const atd = (id: string, extra: Partial<Attendance>): Attendance => ({
  id,
  pacienteId: 'p1',
  pacienteNome: 'Ana',
  data: '2026-11-10',
  procedureId: 'proc-gluteo',
  procedimentoNome: 'Harmonização Glútea',
  createdAt: '2026-11-10T10:00:00.000Z',
  ...extra,
});

const registros: EvaluationRecord[] = [
  // Sem visita nenhuma no dia: ganha um atendimento da Avaliação.
  registro('aval-sozinha', { dataAtendimento: '2026-11-01', templateId: 'aval-gluteo', orcamentoId: 'q-1' }),
  // Do tempo em que era uma por visita: vai para o relatório da própria visita.
  registro('atd-antiga', { atendimentoId: 'atd-antiga', dataAtendimento: '2026-10-01', procedureId: 'proc-botox', procedimentoNome: 'Botox' }),
  // Visita no mesmo dia, do mesmo procedimento, sem relatório: é a mesma visita.
  registro('aval-mesmo-dia', { templateId: 'aval-gluteo' }),
  // Segunda avaliação no mesmo dia: a visita já foi tomada pela primeira.
  registro('aval-mesmo-dia-2', { createdAt: '2026-11-10T15:00:00.000Z' }),
  // Visita no mesmo dia, mas já com relatório: ganha atendimento próprio.
  registro('aval-ja-tem-relatorio', { pacienteId: 'p2', pacienteNome: 'Bia' }),
  // Laser, pela categoria.
  registro('aval-laser', { procedureId: 'proc-axilas', procedimentoNome: 'Axilas', templateId: 'aval-laser', dataAtendimento: '2026-11-05' }),
  // Personalizada: sem foco.
  registro('aval-pers', { personalizada: true, procedureId: undefined, procedimentoNome: 'Avaliação personalizada', dataAtendimento: '2026-11-06' }),
  // Ficha que saiu do catálogo.
  registro('aval-velha', { templateId: 'aval-antiga', procedureId: 'proc-que-saiu', procedimentoNome: 'Peeling', dataAtendimento: '2026-09-01' }),
  // Arquivada: a visita nova vai para o arquivo junto.
  registro('aval-arquivada', { pacienteId: 'p3', pacienteNome: 'Cris', arquivadoEm: '2026-11-11T00:00:00.000Z', arquivoDe: 'p3', dataAtendimento: '2026-08-01' }),
];

const atendimentos: Attendance[] = [
  atd('atd-antiga', { data: '2026-10-01', procedureId: 'proc-botox', procedimentoNome: 'Botox', avaliacaoPreenchidaEm: '2026-10-01' }),
  atd('sessao-gluteo', { status: 'compareceu' }),
  atd('outra-paciente', { pacienteId: 'p2', pacienteNome: 'Bia', acompanhamentoPreenchidoEm: '2026-11-10T16:00:00.000Z' }),
  atd('botox-mesmo-dia', { procedureId: 'proc-botox', procedimentoNome: 'Botox' }),
];

const avaliacao = { ...procedimentoAvaliacaoPadrao(), focos: ['harmonização glútea', 'Microagulhamento'] };
const gerais = [pergunta('avg-1', 'Queixa principal')];

const plano = planejarMigracaoDaAvaliacao({
  fichasDeAvaliacao,
  geraisDeAvaliacao: gerais,
  fichasDeRelatorio: [ficha('acomp-repetido', {})],
  registros,
  atendimentos,
  catalogo,
  avaliacao,
  agora: '2026-11-22T12:00:00.000Z',
});

const fichaDe = (id: string) => plano.fichas.find((f) => f.id === id);
const relatorioDe = (origem: string) => plano.relatorios.find((r) => r.origemId === origem);

console.log('== fichas-modelo');
const gluteo = fichaDe('aval-gluteo');
ok('glúteo vira ficha de relatório da Avaliação', !!gluteo && gluteo.procedureIds?.join() === PROCEDIMENTO_AVALIACAO_ID);
ok('só para o foco Harmonização Glútea', gluteo?.focosPorProcedimento?.[PROCEDIMENTO_AVALIACAO_ID]?.join() === 'Harmonização Glútea');
ok('sem categoria', (gluteo?.categorias || []).length === 0);
ok('as gerais de avaliação vêm antes das da ficha', gluteo?.perguntas.map((q) => q.id).join() === 'avg-1,aval-gluteo-q1');
ok('com a marca da migração', !!gluteo?.migracoesAplicadas?.includes(MIGRACAO_AVALIACAO_VIRA_RELATORIO));
ok('laser vale para o foco da categoria', fichaDe('aval-laser')?.focosPorProcedimento?.[PROCEDIMENTO_AVALIACAO_ID]?.join() === 'Depilação a Laser');
ok('ficha padrão sem alvo e sem uso fica para trás', !plano.fichas.some((f) => f.id.includes('soroterapia')));
const antiga = fichaDe('aval-antiga');
ok('ficha sem alvo, mas usada, vai sem vínculo', !!antiga && (antiga.procedureIds || []).length === 0);
ok('id repetido ganha outro', !!fichaDe('rel-acomp-repetido') && !fichaDe('acomp-repetido'));
const geral = fichaDe('aval-geral');
ok('as gerais viram a ficha "Avaliação", sem foco', !!geral && geral.procedureIds?.join() === PROCEDIMENTO_AVALIACAO_ID && !geral.focosPorProcedimento);

console.log('== para onde vai cada avaliação');
const sozinha = relatorioDe('aval-sozinha')!;
ok('sem visita: atendimento novo da Avaliação', sozinha.atendimentoNovo?.procedureId === PROCEDIMENTO_AVALIACAO_ID);
ok('com id fixo', sozinha.atendimentoNovo?.id === idDoAtendimentoDaAvaliacao('aval-sozinha'));
ok('no dia da avaliação, sem hora, realizado', sozinha.atendimentoNovo?.data === '2026-11-01' && !sozinha.atendimentoNovo?.hora && !sozinha.atendimentoNovo?.status);
ok('com o foco no que foi avaliado', sozinha.atendimentoNovo?.foco === 'Harmonização Glútea');
ok('com a profissional', sozinha.atendimentoNovo?.professionalId === 'karol');
ok('o atendimento já nasce com o relatório marcado', !!sozinha.atendimentoNovo?.acompanhamentoPreenchidoEm);
ok('o relatório tem o id do atendimento', sozinha.relatorio.id === sozinha.atendimentoNovo?.id && sozinha.relatorio.atendimentoId === sozinha.relatorio.id);
ok('o relatório é da Avaliação, com o foco', sozinha.relatorio.procedureId === PROCEDIMENTO_AVALIACAO_ID && sozinha.relatorio.foco === 'Harmonização Glútea');
ok('respostas, perguntas e orçamento vêm junto', sozinha.relatorio.respostas.q === 'x' && sozinha.relatorio.perguntasSnapshot.length === 1 && sozinha.relatorio.orcamentoId === 'q-1');
ok('a ficha-modelo continua a mesma', sozinha.relatorio.templateId === 'aval-gluteo');

const antigaDaVisita = relatorioDe('atd-antiga')!;
ok('a da visita vai para a própria visita', !antigaDaVisita.atendimentoNovo && antigaDaVisita.relatorio.id === 'atd-antiga');
ok('e vira o relatório do procedimento da visita', antigaDaVisita.relatorio.procedimentoNome === 'Botox');

const mesmoDia = relatorioDe('aval-mesmo-dia')!;
ok('mesmo dia, mesmo procedimento, sem relatório: a mesma visita', !mesmoDia.atendimentoNovo && mesmoDia.relatorio.id === 'sessao-gluteo');
const mesmoDia2 = relatorioDe('aval-mesmo-dia-2')!;
ok('a segunda do dia não toma a visita da primeira', !!mesmoDia2.atendimentoNovo);
ok('visita de outro procedimento no mesmo dia não é tomada', mesmoDia2.relatorio.id !== 'botox-mesmo-dia');
const jaTem = relatorioDe('aval-ja-tem-relatorio')!;
ok('visita que já tem relatório não recebe outro', !!jaTem.atendimentoNovo && jaTem.relatorio.id !== 'outra-paciente');

const laser = relatorioDe('aval-laser')!;
ok('laser: o foco é a categoria da ficha', laser.relatorio.foco === 'Depilação a Laser');
const pers = relatorioDe('aval-pers')!;
ok('personalizada: sem foco, continua personalizada', !pers.relatorio.foco && pers.relatorio.personalizada === true);
const velha = relatorioDe('aval-velha')!;
ok('procedimento que saiu do catálogo: o foco é o nome gravado', velha.relatorio.foco === 'Peeling');
const arquivada = relatorioDe('aval-arquivada')!;
ok('arquivada: a visita nova vai para o arquivo junto', arquivada.atendimentoNovo?.arquivadoEm === '2026-11-11T00:00:00.000Z' && arquivada.atendimentoNovo?.arquivoDe === 'p3');
ok('toda avaliação tem destino', plano.relatorios.length === registros.length);

console.log('== focos da Avaliação');
ok(
  'os de antes, mais os novos, sem repetir',
  plano.focosDaAvaliacao.join() === 'harmonização glútea,Microagulhamento,Depilação a Laser,Botox,Peeling',
  plano.focosDaAvaliacao.join()
);

console.log('== conflito na hora de gravar');
const refeito = paraAtendimentoNovo(mesmoDia, registros.find((r) => r.id === 'aval-mesmo-dia')!, avaliacao, '2026-11-22T12:00:00.000Z');
ok('vira atendimento novo da Avaliação', refeito.atendimentoNovo?.id === idDoAtendimentoDaAvaliacao('aval-mesmo-dia') && refeito.relatorio.id === refeito.atendimentoNovo?.id);

console.log('== a ficha-modelo do relatório pelo foco');
const fichasDeRelatorio = plano.fichas;
const catalogoComAvaliacao = [avaliacao, ...catalogo];
const paraAvaliacao = (foco?: string) =>
  fichaDeAvaliacaoPara({ procedureId: PROCEDIMENTO_AVALIACAO_ID, procedimentoNome: 'Avaliação', foco }, fichasDeRelatorio, catalogoComAvaliacao)?.id;
ok('Avaliação · Harmonização Glútea usa a do glúteo', paraAvaliacao('harmonização glútea') === 'aval-gluteo');
ok('Avaliação · Depilação a Laser usa a do laser', paraAvaliacao('Depilação a Laser') === 'aval-laser');
ok('Avaliação de outro foco usa a geral', paraAvaliacao('Microagulhamento') === 'aval-geral');
ok('Avaliação sem foco usa a geral', paraAvaliacao(undefined) === 'aval-geral');

const fichasDoGluteo: EvaluationTemplate[] = [
  ficha('rel-gluteo', { procedureIds: ['proc-gluteo'] }),
  ficha('rel-trocanter', { procedureIds: ['proc-gluteo'], focosPorProcedimento: { 'proc-gluteo': ['Trocanter'] } }),
  ficha('rel-corporal', { categorias: ['Corporal'] }),
];
const doGluteo = (foco?: string) =>
  fichaDeAvaliacaoPara({ procedureId: 'proc-gluteo', procedimentoNome: 'Harmonização Glútea', foco }, fichasDoGluteo, catalogo)?.id;
ok('o foco vence a ficha sem foco', doGluteo('Trocanter') === 'rel-trocanter');
ok('outro foco cai na ficha sem foco', doGluteo('Celulite') === 'rel-gluteo');
ok('sem foco, a ficha sem foco', doGluteo() === 'rel-gluteo');
ok(
  'ficha só de um foco não vale sem ele — cai na categoria',
  fichaDeAvaliacaoPara({ procedureId: 'proc-gluteo', procedimentoNome: 'Harmonização Glútea' }, [fichasDoGluteo[1], fichasDoGluteo[2]], catalogo)?.id === 'rel-corporal'
);

console.log('== o procedimento Avaliação');
ok('não tem categoria nem os campos de fora', (() => {
  const p = limparCamposDaAvaliacao({ ...avaliacao, category: 'X', benefits: ['a'], areasTreated: ['b'], sessionsRecommended: 'c', sessoesInclusas: 3, orientacoesPreProcedimento: 'd' });
  return p.category === '' && p.benefits.length === 0 && !p.areasTreated && !p.sessionsRecommended && !p.sessoesInclusas && !p.orientacoesPreProcedimento;
})());
ok('focos sem repetir nem vazios', focosDoProcedimento({ focos: ['Trocanter', ' trocanter ', '', 'Volume'] }).join() === 'Trocanter,Volume');
ok('o nome leva o foco', nomeComFoco('Harmonização Glútea', 'Trocanter') === 'Harmonização Glútea · Trocanter');
ok(
  'a visita mostra o foco',
  nomeDosProcedimentos({ procedimentoNome: 'Avaliação', foco: 'Botox', procedimentosAdicionais: [{ procedimentoNome: 'Laser', foco: 'Axilas' }] } as Attendance) ===
    'Avaliação · Botox + Laser · Axilas'
);
const avaliado = alvoDoQueFoiAvaliado({ procedureId: PROCEDIMENTO_AVALIACAO_ID, procedimentoNome: 'Avaliação', foco: 'botox' }, catalogoComAvaliacao);
ok('o orçamento da Avaliação é do procedimento avaliado', avaliado.procedureId === 'proc-botox' && avaliado.procedimentoNome === 'Botox');
ok(
  'foco fora do catálogo vira item avulso',
  alvoDoQueFoiAvaliado({ procedimentoNome: 'Avaliação', foco: 'Lipo enzimática' }, catalogo).procedimentoNome === 'Lipo enzimática'
);
ok(
  'sem foco, orçamento sem item',
  !!alvoDoQueFoiAvaliado<{ procedimentoNome: string; foco?: string; personalizada?: boolean }>(
    { procedimentoNome: 'Avaliação' },
    catalogo
  ).personalizada
);
ok(
  'foco da avaliação preenchida sem ficha: o nome do procedimento',
  focoDaAvaliacaoPreenchida(registro('x', { procedureId: 'proc-botox', procedimentoNome: 'Botox' }), [], catalogo) === 'Botox'
);

console.log(falhas === 0 ? '\nTUDO OK' : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);

/**
 * Confere a migração que tira as perguntas da profissional da ficha de anamnese e as instala como
 * ficha de avaliação.
 *
 * Roda sem Firebase: `planejarMigracaoDaFicha` é a decisão inteira — o que vira ficha nova, com
 * que vínculo, e o que sobra na anamnese — e o `databaseService` só a traduz em gravações.
 *
 * Existe porque esta migração roda **uma vez por clínica**, apaga perguntas do documento de
 * origem e não tem botão de desfazer. Estrear direto em produção significaria descobrir um erro
 * quando ele já fosse irreversível.
 *
 *   npx tsx scripts/verificar-migracao-avaliacao.ts
 */
import { AnamnesisQuestion, AnamnesisTemplate, Procedure } from '../src/types';
import {
  MIGRACAO_AVALIACAO,
  categoriasDeLaserDoCatalogo,
  planejarMigracao,
  planejarMigracaoDaFicha,
} from '../src/utils/evaluations';
import {
  ALL_LASER_PROCEDURE_QUESTIONS,
  LASER_PROFESSIONAL_QUESTIONS,
  PERGUNTAS_PROFISSIONAL_GLUTEO,
  DEFAULT_PROCEDURE_TEMPLATES,
} from '../src/data/anamnesisInitialData';
import { SAMPLE_PROCEDURES } from '../src/data/initialData';

let falhas = 0;
const ok = (nome: string, condicao: boolean, extra = '') => {
  console.log(`${condicao ? '  ok  ' : ' FALHA'}  ${nome}${extra ? `  — ${extra}` : ''}`);
  if (!condicao) falhas++;
};

const catalogo = SAMPLE_PROCEDURES as Procedure[];
const categoriasLaser = categoriasDeLaserDoCatalogo(catalogo);

/**
 * As fichas como estão **hoje no Firestore da clínica**, isto é, antes da separação: o seed atual
 * já saiu limpo, então reconstituímos a forma antiga acrescentando de volta os blocos da
 * profissional. É contra isto que a migração vai rodar de verdade.
 */
const fichaDeLaserAntiga: AnamnesisTemplate = {
  ...(DEFAULT_PROCEDURE_TEMPLATES.find((t) => t.id === 'tpl-epilacao-laser') as AnamnesisTemplate),
  perguntasEspecificas: [...ALL_LASER_PROCEDURE_QUESTIONS, ...LASER_PROFESSIONAL_QUESTIONS],
};

const fichaDeGluteoAntiga: AnamnesisTemplate = {
  ...(DEFAULT_PROCEDURE_TEMPLATES.find(
    (t) => t.id === 'tpl-harmonizacao-glutea'
  ) as AnamnesisTemplate),
  perguntasEspecificas: [
    ...((
      DEFAULT_PROCEDURE_TEMPLATES.find((t) => t.id === 'tpl-harmonizacao-glutea') as AnamnesisTemplate
    ).perguntasEspecificas || []),
    ...PERGUNTAS_PROFISSIONAL_GLUTEO,
  ].map((q, i) => ({ ...q, ordem: i + 1 })),
  // A clínica cadastrou os dois mapas anatômicos; a migração precisa levá-los junto.
  fotoModeloFemininoUrl: 'https://storage.example/gluteo-f.jpg',
  fotoModeloMasculinoUrl: 'https://storage.example/gluteo-m.jpg',
};

console.log('== laser: uma ficha de avaliação para as treze áreas');
const planoLaser = planejarMigracaoDaFicha(fichaDeLaserAntiga, catalogo, categoriasLaser);
ok('tem o que migrar', !!planoLaser);
ok('a ficha nova ganha id derivado da origem', planoLaser?.ficha.id === 'aval-tpl-epilacao-laser');
ok(
  'leva as 6 perguntas da profissional',
  planoLaser?.ficha.perguntas.length === 6,
  String(planoLaser?.ficha.perguntas.length)
);
ok(
  'renumeradas de 1 a 6',
  (planoLaser?.ficha.perguntas || []).every((q, i) => q.ordem === i + 1)
);
ok(
  'vincula por CATEGORIA, não pelas treze áreas',
  (planoLaser?.ficha.categorias || []).length > 0 &&
    (planoLaser?.ficha.procedureIds || []).length === 0,
  JSON.stringify(planoLaser?.ficha.categorias)
);
ok(
  'a anamnese fica com as 21 da paciente',
  planoLaser?.perguntasQueFicam.length === 21,
  String(planoLaser?.perguntasQueFicam.length)
);
ok(
  'nenhuma pergunta de profissional sobra na anamnese',
  (planoLaser?.perguntasQueFicam || []).every((q) => (q.publicoAlvo || 'paciente') !== 'medico')
);
ok(
  'a numeração do que fica é sequencial',
  (planoLaser?.perguntasQueFicam || []).every((q, i) => q.ordem === i + 1)
);

console.log('\n== glúteo: vínculo por procedimento e as fotos junto');
const planoGluteo = planejarMigracaoDaFicha(fichaDeGluteoAntiga, catalogo, categoriasLaser);
ok('tem o que migrar', !!planoGluteo);
ok(
  'vincula ao procedimento do catálogo, não à categoria',
  (planoGluteo?.ficha.procedureIds || []).includes('proc-harmonizacao-glutea') &&
    (planoGluteo?.ficha.categorias || []).length === 0,
  JSON.stringify(planoGluteo?.ficha.procedureIds)
);
// A ficha está em "Corporal & Injetáveis" e o procedimento em "Corporal & Bem-Estar": ligar pela
// categoria arrastaria drenagem, massagem e tudo o mais que mora lá.
ok(
  'leva todas as perguntas do bloco do glúteo',
  planoGluteo?.ficha.perguntas.length === PERGUNTAS_PROFISSIONAL_GLUTEO.length,
  String(planoGluteo?.ficha.perguntas.length)
);
ok(
  'leva as duas versões do mapa anatômico',
  planoGluteo?.ficha.fotoModeloFemininoUrl === 'https://storage.example/gluteo-f.jpg' &&
    planoGluteo?.ficha.fotoModeloMasculinoUrl === 'https://storage.example/gluteo-m.jpg'
);
ok('pede a foto da sessão', planoGluteo?.ficha.temFotoSessao === true);
ok(
  'a anamnese fica com as 5 perguntas da paciente',
  planoGluteo?.perguntasQueFicam.length === 5,
  String(planoGluteo?.perguntasQueFicam.length)
);
ok(
  'as respostas já gravadas continuam alcançáveis: nenhum ID muda',
  (planoGluteo?.ficha.perguntas || []).every(
    (q, i) => q.id === PERGUNTAS_PROFISSIONAL_GLUTEO[i].id
  )
);

console.log('\n== fichas que não têm nada a mover');
const semProfissional = DEFAULT_PROCEDURE_TEMPLATES.filter(
  (t) => !(t.perguntasEspecificas || []).some((q) => (q.publicoAlvo || 'paciente') === 'medico')
);
ok(
  'o seed atual já está limpo — nenhuma ficha dele migra',
  semProfissional.length === DEFAULT_PROCEDURE_TEMPLATES.length,
  `${semProfissional.length}/${DEFAULT_PROCEDURE_TEMPLATES.length}`
);
ok(
  'ficha sem pergunta de profissional devolve null (não cria ficha vazia)',
  planejarMigracaoDaFicha(
    DEFAULT_PROCEDURE_TEMPLATES.find((t) => t.id === 'tpl-botox') as AnamnesisTemplate,
    catalogo,
    categoriasLaser
  ) === null
);

console.log('\n== casos torcidos');
const orfa: AnamnesisTemplate = {
  id: 'tpl-inventado',
  procedimentoNome: 'Procedimento Que Saiu Do Catálogo',
  tem_foto: false,
  perguntasEspecificas: [
    { id: 'x1', texto: 'Só do profissional', tipo_campo: 'texto_curto', obrigatoria: false, ordem: 1, publicoAlvo: 'medico' },
  ] as AnamnesisQuestion[],
};
const planoOrfa = planejarMigracaoDaFicha(orfa, catalogo, categoriasLaser);
ok('ficha sem procedimento no catálogo ainda migra', !!planoOrfa);
ok(
  'mas nasce SEM vínculo, para a equipe ligar à mão',
  (planoOrfa?.ficha.procedureIds || []).length === 0 &&
    (planoOrfa?.ficha.categorias || []).length === 0
);
ok(
  'a anamnese fica sem pergunta nenhuma, e isso é aceitável',
  planoOrfa?.perguntasQueFicam.length === 0
);

const soPaciente: AnamnesisTemplate = { ...orfa, perguntasEspecificas: [] };
ok('ficha sem perguntas devolve null', planejarMigracaoDaFicha(soPaciente, catalogo) === null);

ok(
  'a ficha nova já nasce marcada com a migração',
  (planoLaser?.ficha.migracoesAplicadas || []).includes(MIGRACAO_AVALIACAO)
);

console.log('\n== o laser colapsa numa ficha só (o caso real da clínica)');
/**
 * Reproduz o banco de produção, que é mais torto do que o seed sugere: a ficha guarda-chuva do
 * laser **não** tem perguntas da profissional, e o `perguntasEspecificas` dela está gravado como
 * mapa de chaves numéricas. Quem tem as perguntas é uma ficha **por área** — aposentada, e com
 * quatro perguntas cadastradas à mão pela equipe (ids `esp-…`).
 *
 * Processar só as fichas visíveis deixaria esse trabalho para trás e o laser sem avaliação.
 */
const guardaChuvaComoMapa = {
  id: 'tpl-epilacao-laser',
  procedimentoNome: 'Epilação a Laser',
  categoria: 'Laser & Alta Tecnologia',
  tem_foto: false,
  perguntasEspecificas: {
    0: ALL_LASER_PROCEDURE_QUESTIONS[0],
    1: ALL_LASER_PROCEDURE_QUESTIONS[1],
  },
} as unknown as AnamnesisTemplate;

const porArea = (id: string): AnamnesisTemplate => ({
  id,
  procedimentoNome: `Depilação a Laser - ${id.replace('tpl-laser-', '')}`,
  categoria: 'Depilação a Laser',
  tem_foto: false,
  perguntasEspecificas: [...ALL_LASER_PROCEDURE_QUESTIONS, ...LASER_PROFESSIONAL_QUESTIONS],
});

const planoColecao = planejarMigracao(
  [
    guardaChuvaComoMapa,
    porArea('tpl-laser-buco'),
    porArea('tpl-laser-axilas'),
    fichaDeGluteoAntiga,
  ],
  catalogo
);

ok(
  'mapa de chaves numéricas não derruba a migração',
  planoColecao.fichas.length > 0,
  'o campo volta como {0:…,1:…} em banco reimportado'
);
const avalLaser = planoColecao.fichas.find((f) => f.id === 'aval-epilacao-laser');
ok('nasce UMA ficha de avaliação de laser', !!avalLaser);
ok(
  'e apenas uma, mesmo com duas áreas trazendo o mesmo bloco',
  planoColecao.fichas.filter((f) => (f.categorias || []).length > 0).length === 1,
  String(planoColecao.fichas.filter((f) => (f.categorias || []).length > 0).length)
);
ok(
  'sem repetir pergunta — o fototipo não é perguntado duas vezes',
  new Set((avalLaser?.perguntas || []).map((q) => q.id)).size ===
    (avalLaser?.perguntas || []).length,
  `${avalLaser?.perguntas.length} perguntas`
);
ok(
  'as perguntas vêm da ficha por área, que é onde a clínica as cadastrou',
  (avalLaser?.perguntas || []).length === LASER_PROFESSIONAL_QUESTIONS.length
);
ok(
  'vinculada à categoria, não às áreas',
  (avalLaser?.categorias || []).length > 0 && (avalLaser?.procedureIds || []).length === 0
);
ok(
  'as duas áreas perdem as perguntas da profissional',
  ['tpl-laser-buco', 'tpl-laser-axilas'].every((id) => {
    const a = planoColecao.anamneses.find((x) => x.id === id);
    return !!a && a.perguntasQueFicam.every((q) => (q.publicoAlvo || 'paciente') !== 'medico');
  })
);
ok(
  'o glúteo continua saindo à parte, por procedimento',
  planoColecao.fichas.some((f) => (f.procedureIds || []).includes('proc-harmonizacao-glutea'))
);

console.log(falhas === 0 ? '\nTUDO OK' : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);

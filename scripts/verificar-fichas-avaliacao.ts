/**
 * Confere as fichas de avaliação padrão e a instalação delas na clínica que já está rodando.
 *
 * As duas perguntas que este script responde:
 *
 * 1. **Sobrou procedimento sem ficha?** É o pedido literal — todo procedimento do catálogo, e não
 *    só os que vieram da anamnese, precisa abrir a avaliação com perguntas. Um procedimento
 *    esquecido aqui não dá erro nenhum: a tela simplesmente abre com o campo de observações, e
 *    ninguém descobre até alguém reparar meses depois que aquela ficha nunca tem nada escrito.
 * 2. **A instalação duplica alguma coisa?** Ela roda uma vez por clínica e não tem desfazer. Duas
 *    fichas disputando o mesmo procedimento fazem `fichaDeAvaliacaoPara` escolher pela ordem do
 *    array — quer dizer, por sorte.
 *
 *   npx tsx scripts/verificar-fichas-avaliacao.ts
 */
import { AnamnesisQuestion, EvaluationTemplate, Procedure } from '../src/types';
import {
  MIGRACAO_FICHAS_PADRAO,
  fichaDeAvaliacaoPara,
  planejarInstalacaoDeFichasPadrao,
  procedimentosAtendidosPor,
} from '../src/utils/evaluations';
import {
  DEFAULT_EVALUATION_TEMPLATES,
  FICHAS_AVALIACAO_DEMAIS_PROCEDIMENTOS,
} from '../src/data/anamnesisInitialData';
import { SAMPLE_PROCEDURES } from '../src/data/initialData';

let falhas = 0;
const ok = (nome: string, condicao: boolean, extra = '') => {
  console.log(`${condicao ? '  ok  ' : ' FALHA'}  ${nome}${extra ? `  — ${extra}` : ''}`);
  if (!condicao) falhas++;
};

const catalogo = SAMPLE_PROCEDURES as Procedure[];

console.log('== cobertura: nenhum procedimento do catálogo fica sem ficha');
const semFicha = catalogo.filter(
  (p) =>
    !fichaDeAvaliacaoPara(
      { procedureId: p.id, procedimentoNome: p.title },
      DEFAULT_EVALUATION_TEMPLATES,
      catalogo
    )
);
ok(
  `os ${catalogo.length} procedimentos do catálogo resolvem uma ficha`,
  semFicha.length === 0,
  semFicha.map((p) => p.id).join(', ')
);

// O laser e o glúteo já tinham as suas; o que este trabalho acrescentou é o resto.
const jaTinham = ['proc-harmonizacao-glutea'];
const demais = catalogo.filter(
  (p) => p.category !== 'Depilação a Laser' && !jaTinham.includes(p.id)
);
ok(
  `os ${demais.length} procedimentos que faltavam caem nas fichas novas`,
  demais.every((p) => {
    const f = fichaDeAvaliacaoPara(
      { procedureId: p.id, procedimentoNome: p.title },
      DEFAULT_EVALUATION_TEMPLATES,
      catalogo
    );
    return !!f && FICHAS_AVALIACAO_DEMAIS_PROCEDIMENTOS.some((n) => n.id === f.id);
  })
);
ok(
  'e o laser continua caindo na ficha do laser',
  catalogo
    .filter((p) => p.category === 'Depilação a Laser')
    .every(
      (p) =>
        fichaDeAvaliacaoPara(
          { procedureId: p.id, procedimentoNome: p.title },
          DEFAULT_EVALUATION_TEMPLATES,
          catalogo
        )?.id === 'aval-epilacao-laser'
    )
);
ok(
  'o glúteo continua na ficha dele',
  fichaDeAvaliacaoPara(
    { procedureId: 'proc-harmonizacao-glutea', procedimentoNome: 'Harmonização Glútea' },
    DEFAULT_EVALUATION_TEMPLATES,
    catalogo
  )?.id === 'aval-harmonizacao-glutea'
);

console.log('\n== forma das fichas novas');
const ids = FICHAS_AVALIACAO_DEMAIS_PROCEDIMENTOS.map((f) => f.id);
ok('ids únicos', new Set(ids).size === ids.length);
ok(
  'nenhuma colide com as duas que já existiam',
  !ids.includes('aval-epilacao-laser') && !ids.includes('aval-harmonizacao-glutea')
);
ok(
  'toda ficha atende ao menos um procedimento do catálogo',
  FICHAS_AVALIACAO_DEMAIS_PROCEDIMENTOS.every(
    (f) => procedimentosAtendidosPor(f, catalogo).length > 0
  ),
  FICHAS_AVALIACAO_DEMAIS_PROCEDIMENTOS.filter(
    (f) => procedimentosAtendidosPor(f, catalogo).length === 0
  )
    .map((f) => f.id)
    .join(', ')
);
ok(
  'nenhum procedimento é atendido por duas fichas novas ao mesmo tempo',
  catalogo.every(
    (p) =>
      FICHAS_AVALIACAO_DEMAIS_PROCEDIMENTOS.filter((f) =>
        procedimentosAtendidosPor(f, catalogo).some((x) => x.id === p.id)
      ).length <= 1
  )
);

console.log('\n== forma das perguntas');
const problemas: string[] = [];
const idsGlobais = new Map<string, string>();

FICHAS_AVALIACAO_DEMAIS_PROCEDIMENTOS.forEach((f) => {
  const qs = f.perguntas as AnamnesisQuestion[];
  // O teto de 10 foi pedido, e o piso de 3 é o que separa uma ficha de um campo de observações
  // com enfeite.
  if (qs.length < 3 || qs.length > 10) problemas.push(`${f.id}: ${qs.length} perguntas`);
  if (new Set(qs.map((q) => q.id)).size !== qs.length) problemas.push(`${f.id}: id repetido`);
  qs.forEach((q, i) => {
    if (q.ordem !== i + 1) problemas.push(`${f.id}/${q.id}: ordem ${q.ordem} ≠ ${i + 1}`);
    if (!q.texto?.trim()) problemas.push(`${f.id}/${q.id}: sem texto`);
    if (
      (q.tipo_campo === 'unica_escolha' || q.tipo_campo === 'multipla_escolha') &&
      (q.opcoes || []).length < 2
    ) {
      problemas.push(`${f.id}/${q.id}: escolha com menos de 2 opções`);
    }
    if (q.tipo_campo === 'escala' && !q.escalaMax) problemas.push(`${f.id}/${q.id}: escala sem máximo`);
    // Numa ficha de avaliação, quem responde é sempre a profissional. O campo só existe na
    // anamnese, para separar o que vai ao link da paciente — aqui ele não teria sentido.
    if (q.publicoAlvo) problemas.push(`${f.id}/${q.id}: publicoAlvo não pertence à avaliação`);
    const dono = idsGlobais.get(q.id);
    if (dono) problemas.push(`${q.id}: id repetido entre ${dono} e ${f.id}`);
    idsGlobais.set(q.id, f.id);
  });
});
ok('entre 3 e 10 perguntas, ordem sequencial, opções e escalas completas', problemas.length === 0,
  problemas.join(' | '));

console.log('\n== instalação na clínica que já roda');
/** O estado depois da migração das perguntas da profissional: laser e glúteo, com id derivado. */
const depoisDaMigracao: EvaluationTemplate[] = [
  {
    id: 'aval-tpl-epilacao-laser',
    nome: 'Avaliação — Depilação a Laser',
    categorias: ['Depilação a Laser'],
    procedureIds: [],
    perguntas: [],
    temFotoSessao: true,
  },
  {
    id: 'aval-tpl-harmonizacao-glutea',
    nome: 'Avaliação — Harmonização Glútea',
    categorias: [],
    procedureIds: ['proc-harmonizacao-glutea'],
    perguntas: [],
    temFotoSessao: true,
  },
];

const primeira = planejarInstalacaoDeFichasPadrao(
  FICHAS_AVALIACAO_DEMAIS_PROCEDIMENTOS,
  depoisDaMigracao,
  catalogo
);
ok(
  `instala as ${FICHAS_AVALIACAO_DEMAIS_PROCEDIMENTOS.length} fichas novas`,
  primeira.length === FICHAS_AVALIACAO_DEMAIS_PROCEDIMENTOS.length,
  String(primeira.length)
);
ok(
  'e nenhuma de laser ou glúteo — a migração já cuidou disso',
  !primeira.some((f) => (f.categorias || []).includes('Depilação a Laser')) &&
    !primeira.some((f) => (f.procedureIds || []).includes('proc-harmonizacao-glutea'))
);
ok('as instaladas nascem marcadas', primeira.every((f) => (f.migracoesAplicadas || []).includes(MIGRACAO_FICHAS_PADRAO)));

const segunda = planejarInstalacaoDeFichasPadrao(
  FICHAS_AVALIACAO_DEMAIS_PROCEDIMENTOS,
  [...depoisDaMigracao, ...primeira],
  catalogo
);
ok('rodar de novo não instala nada', segunda.length === 0, String(segunda.length));

console.log('\n== casos torcidos');
const fichaDaEquipe: EvaluationTemplate = {
  id: 'aval-feita-a-mao',
  nome: 'Ozônio do jeito da casa',
  procedureIds: ['proc-ozonioterapia'],
  categorias: [],
  perguntas: [],
  temFotoSessao: false,
};
const comFichaDaEquipe = planejarInstalacaoDeFichasPadrao(
  FICHAS_AVALIACAO_DEMAIS_PROCEDIMENTOS,
  [...depoisDaMigracao, fichaDaEquipe],
  catalogo
);
ok(
  'ficha que a equipe criou à mão não é atropelada',
  !comFichaDaEquipe.some((f) => f.id === 'aval-ozonioterapia'),
  comFichaDaEquipe.map((f) => f.id).join(', ')
);

/**
 * A equipe cobriu **um** dos oito procedimentos de microfocado facial. Os outros sete continuam
 * descobertos, então a ficha de categoria ainda tem serventia — e não briga com a da equipe, que
 * vence por ser vínculo específico.
 */
const soUmaArea: EvaluationTemplate = {
  id: 'aval-papada-da-casa',
  nome: 'Papada do jeito da casa',
  procedureIds: ['proc-us-papada'],
  categorias: [],
  perguntas: [],
  temFotoSessao: false,
};
const comUmaArea = planejarInstalacaoDeFichasPadrao(
  FICHAS_AVALIACAO_DEMAIS_PROCEDIMENTOS,
  [...depoisDaMigracao, soUmaArea],
  catalogo
);
ok(
  'cobrir um procedimento não cancela a ficha da categoria inteira',
  comUmaArea.some((f) => f.id === 'aval-us-facial')
);
ok(
  'e o procedimento coberto continua resolvendo a ficha da equipe',
  fichaDeAvaliacaoPara(
    { procedureId: 'proc-us-papada', procedimentoNome: 'Ultrassom Microfocado HTM - Papada' },
    [...depoisDaMigracao, soUmaArea, ...comUmaArea],
    catalogo
  )?.id === 'aval-papada-da-casa'
);

ok(
  'catálogo sem o procedimento não ganha ficha pendurada',
  !planejarInstalacaoDeFichasPadrao(
    FICHAS_AVALIACAO_DEMAIS_PROCEDIMENTOS,
    depoisDaMigracao,
    catalogo.filter((p) => p.id !== 'proc-soroterapia')
  ).some((f) => f.id === 'aval-soroterapia')
);
ok(
  'catálogo vazio não instala nada',
  planejarInstalacaoDeFichasPadrao(FICHAS_AVALIACAO_DEMAIS_PROCEDIMENTOS, [], []).length === 0
);

console.log(falhas === 0 ? '\nTUDO OK' : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);

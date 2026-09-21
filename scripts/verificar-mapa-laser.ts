/**
 * Verificação da geometria do mapa corporal do laser.
 *
 * Roda com: npx tsx scripts/verificar-mapa-laser.ts
 *
 * São funções puras e sem DOM, mas com consequências que só aparecem tarde: um polígono
 * simplificado demais deforma a área, um teste de ponto invertido faz a paciente selecionar a
 * região errada, e um anel mal distribuído empilha treze botões em cima do mesmo lugar. Checar
 * aqui é mais barato do que descobrir depois de desenhar as treze áreas à mão.
 */
import {
  areaDaForma,
  areaNoPonto,
  centroDaArea,
  centroDaForma,
  criarFormaAPartirDoTraco,
  espelharForma,
  nomeCurtoDaArea,
  posicionarBotoesDoAnel,
  LASER_MAX_PONTOS_POR_FORMA,
  serializarAreas,
  desserializarAreas,
} from '../src/utils/laserAreas';
import {
  ehTemplateDeLaser,
  fichasParaEscolher,
  mapearTemplatesPorProcedimento,
} from '../src/utils/templateMatching';
import { paraArray } from '../src/utils/firestoreShapes';
import {
  ALL_LASER_PROCEDURE_QUESTIONS as PERGUNTAS_PACIENTE,
  LASER_PROFESSIONAL_QUESTIONS as PERGUNTAS_PROFISSIONAL,
  DEFAULT_EVALUATION_TEMPLATES,
} from '../src/data/anamnesisInitialData';
import { AnamnesisTemplate, LaserArea } from '../src/types';

let falhas = 0;
const ok = (nome: string, condicao: boolean, extra = '') => {
  console.log(`${condicao ? '  ok  ' : ' FALHA'}  ${nome}${extra ? `  — ${extra}` : ''}`);
  if (!condicao) falhas++;
};

console.log('\n== nomeCurtoDaArea');
ok('corta o prefixo', nomeCurtoDaArea('Depilação a Laser - Virilha Completa') === 'Virilha Completa');
ok('corta sem acento', nomeCurtoDaArea('Depilacao a Laser - Axilas') === 'Axilas');
ok('corta "Epilação"', nomeCurtoDaArea('Epilação a Laser – Buço') === 'Buço');
ok(
  'não esvazia quando o título É o prefixo',
  nomeCurtoDaArea('Depilação a Laser') === 'Depilação a Laser',
  nomeCurtoDaArea('Depilação a Laser')
);
ok('deixa outro procedimento em paz', nomeCurtoDaArea('Botox (Toxina)') === 'Botox (Toxina)');

console.log('\n== criarFormaAPartirDoTraco');
ok('rejeita clique trêmulo', criarFormaAPartirDoTraco([10, 10, 11, 11], 100, 200) === null);
ok('rejeita sem medidas', criarFormaAPartirDoTraco([0, 0, 50, 0, 50, 50], 0, 0) === null);

const quadradoPx = [10, 20, 90, 20, 90, 180, 10, 180];
const quadrado = criarFormaAPartirDoTraco(quadradoPx, 100, 200)!;
ok('normaliza para 0–1', quadrado.every((v) => v >= 0 && v <= 1), JSON.stringify(quadrado));
ok('arredonda em 3 casas', quadrado.every((v) => String(v).split('.')[1]?.length ?? 0) , JSON.stringify(quadrado));
ok('x do 1º ponto = 10/100', quadrado[0] === 0.1, String(quadrado[0]));
ok('y do 1º ponto = 20/200', quadrado[1] === 0.1, String(quadrado[1]));

// Um círculo de 400 pontos precisa sair simplificado abaixo do teto.
const circulo: number[] = [];
for (let i = 0; i < 400; i++) {
  const a = (i / 400) * Math.PI * 2;
  circulo.push(500 + 300 * Math.cos(a), 500 + 300 * Math.sin(a));
}
const simplificado = criarFormaAPartirDoTraco(circulo, 1000, 1000)!;
ok(
  `simplifica 400 pontos para <= ${LASER_MAX_PONTOS_POR_FORMA}`,
  simplificado.length / 2 <= LASER_MAX_PONTOS_POR_FORMA,
  `ficou com ${simplificado.length / 2}`
);
ok(
  'mas preserva a forma (área ~= πr² = 0.283)',
  Math.abs(areaDaForma(simplificado) - Math.PI * 0.3 * 0.3) < 0.02,
  `área = ${areaDaForma(simplificado).toFixed(4)}`
);

console.log('\n== espelharForma');
const espelhado = espelharForma([0.1, 0.5, 0.3, 0.5, 0.3, 0.8]);
ok('x vira 1-x', espelhado[0] === 0.9 && espelhado[2] === 0.7, JSON.stringify(espelhado));
ok('y não muda', espelhado[1] === 0.5 && espelhado[5] === 0.8);

console.log('\n== centroDaArea (duas manchas simétricas, tipo Axilas)');
const axilas: LaserArea = {
  id: 'a',
  vista: 'frente',
  formas: [
    [0.2, 0.3, 0.3, 0.3, 0.3, 0.4, 0.2, 0.4],
    [0.7, 0.3, 0.8, 0.3, 0.8, 0.4, 0.7, 0.4],
  ],
};
const centro = centroDaArea(axilas);
ok('centro cai no meio das duas', Math.abs(centro.x - 0.5) < 0.001, `x = ${centro.x.toFixed(3)}`);
ok('altura é a das manchas', Math.abs(centro.y - 0.35) < 0.001, `y = ${centro.y.toFixed(3)}`);

console.log('\n== areaNoPonto (a menor vence)');
const grande: LaserArea = { id: 'g', vista: 'frente', formas: [[0.1, 0.1, 0.9, 0.1, 0.9, 0.9, 0.1, 0.9]] };
const pequena: LaserArea = { id: 'p', vista: 'frente', formas: [[0.4, 0.4, 0.6, 0.4, 0.6, 0.6, 0.4, 0.6]] };
const candidatas = [
  { area: grande, procedureId: 'perna-completa' },
  { area: pequena, procedureId: 'meia-perna' },
];
ok('ponto na sobreposição → a menor', areaNoPonto(candidatas, 0.5, 0.5)?.procedureId === 'meia-perna');
ok('ponto só na grande → a grande', areaNoPonto(candidatas, 0.15, 0.15)?.procedureId === 'perna-completa');
ok('ponto fora de tudo → nada', areaNoPonto(candidatas, 0.95, 0.95) === undefined);

console.log('\n== posicionarBotoesDoAnel (manequim alto e estreito)');
// 11 áreas empilhadas verticalmente perto do eixo central — o caso que quebra o ângulo cru.
const entradas = Array.from({ length: 11 }, (_, i) => {
  const y = 0.06 + i * 0.085;
  const x = i % 2 === 0 ? 0.42 : 0.58;
  return {
    chave: `a${i}`,
    area: { id: `a${i}`, vista: 'frente' as const, formas: [[x, y, x + 0.04, y, x + 0.04, y + 0.04, x, y + 0.04]] },
  };
});
const posicoes = posicionarBotoesDoAnel(entradas);
ok('devolve uma posição por área', posicoes.length === 11);

const esq = posicoes.filter((p) => p.lado === 'esquerda');
const dir = posicoes.filter((p) => p.lado === 'direita');
ok('reparte entre os dois lados', Math.abs(esq.length - dir.length) <= 1, `${esq.length} / ${dir.length}`);
ok('nenhum botão sobre o eixo central', posicoes.every((p) => Math.abs(p.x - 0.5) > 0.05));
ok('esquerda fica à esquerda', esq.every((p) => p.x < 0.5));
ok('direita fica à direita', dir.every((p) => p.x > 0.5));

const separacaoMinima = (grupo: typeof posicoes) => {
  const ys = grupo.map((p) => p.y).sort((a, b) => a - b);
  let menor = Infinity;
  for (let i = 1; i < ys.length; i++) menor = Math.min(menor, ys[i] - ys[i - 1]);
  return menor;
};
ok(
  'botões não se encavalam à esquerda',
  separacaoMinima(esq) >= 0.07,
  `menor gap = ${separacaoMinima(esq).toFixed(3)}`
);
ok(
  'botões não se encavalam à direita',
  separacaoMinima(dir) >= 0.07,
  `menor gap = ${separacaoMinima(dir).toFixed(3)}`
);
ok(
  'tudo dentro do contêiner',
  posicoes.every((p) => p.y >= -0.02 && p.y <= 1.02 && p.x >= 0 && p.x <= 1),
  JSON.stringify(posicoes.map((p) => [+p.x.toFixed(2), +p.y.toFixed(2)]))
);

console.log('\n== o anel contorna a figura, não passa por cima dela');
// Regressão encontrada no navegador: sem piso horizontal, o topo e a base da elipse se fechavam
// sobre o manequim e os botões de buço, queixo e maçã do rosto pousavam em cima do corpo.
const meiaLarguraDaFigura = 0.134; // figura de 282px num contêiner de 1052px
const comPiso = posicionarBotoesDoAnel(entradas, { raioMinimoX: meiaLarguraDaFigura + 0.035 });
const maisProximo = Math.min(...comPiso.map((p) => Math.abs(p.x - 0.5)));
ok(
  'nenhum botão invade a faixa da figura',
  maisProximo >= meiaLarguraDaFigura,
  `mais próximo = ${maisProximo.toFixed(3)} vs meia-largura ${meiaLarguraDaFigura}`
);
ok(
  'e ainda sobra respiro',
  maisProximo - meiaLarguraDaFigura >= 0.03,
  `folga = ${(maisProximo - meiaLarguraDaFigura).toFixed(3)}`
);

console.log('\n== ida e volta do banco (o Firestore não aceita array dentro de array)');
const areaOriginal: LaserArea = {
  id: 'a1',
  vista: 'costas',
  formas: [
    [0.1, 0.2, 0.3, 0.2, 0.3, 0.4],
    [0.7, 0.2, 0.9, 0.2, 0.9, 0.4],
  ],
  botao: { x: 0.12, y: 0.34 },
};

const gravavel = serializarAreas([areaOriginal])!;
ok('grava cada polígono como texto', typeof gravavel[0].formas[0] === 'string', gravavel[0].formas[0]);
ok(
  'nenhum array dentro de array no que vai para o banco',
  gravavel.every((a) => a.formas.every((f) => !Array.isArray(f)))
);

const voltou = desserializarAreas(gravavel)!;
ok('volta com as duas formas', voltou[0].formas.length === 2);
ok('volta idêntica', JSON.stringify(voltou[0].formas) === JSON.stringify(areaOriginal.formas));
ok('preserva a vista', voltou[0].vista === 'costas');
ok('preserva o botão ajustado', voltou[0].botao?.x === 0.12 && voltou[0].botao?.y === 0.34);
ok('área sem forma não vira área', serializarAreas([{ ...areaOriginal, formas: [] }]) === undefined);

// O estrago real: `cleanForFirestore` achatava cada polígono em `{0: x, 1: y, ...}`. Quem
// desenhou antes da correção tem isso gravado, e precisa continuar conseguindo ver o desenho.
const achatadaPeloBugAntigo = [
  {
    id: 'a1',
    vista: 'frente',
    formas: [{ 0: 0.1, 1: 0.2, 2: 0.3, 3: 0.2, 4: 0.3, 5: 0.4 }],
  },
];
const recuperada = desserializarAreas(achatadaPeloBugAntigo);
ok(
  'recupera o formato achatado pelo bug antigo',
  JSON.stringify(recuperada?.[0].formas[0]) === JSON.stringify([0.1, 0.2, 0.3, 0.2, 0.3, 0.4]),
  JSON.stringify(recuperada?.[0].formas[0])
);
ok(
  'e o formato numérico cru também (rascunho local)',
  desserializarAreas([{ id: 'x', vista: 'frente', formas: [[0.1, 0.2, 0.3, 0.2, 0.3, 0.4]] }])?.[0]
    .formas[0].length === 6
);
ok('lixo não vira área', desserializarAreas([{ id: 'x', vista: 'frente', formas: [null, 'ab'] }]) === undefined);

console.log('\n== o seletor de ficha mostra UMA depilação a laser');
// O caso real: fichas por área criadas pela própria equipe nascem com `tpl-<timestamp>`, não com
// os IDs do seed. A regra precisa olhar o conteúdo, senão elas voltam a aparecer no seletor.
const fichas = [
  { id: 'tpl-epilacao-laser', procedimentoNome: 'Depilação a Laser', categoria: 'Depilação a Laser', tem_foto: false, perguntasEspecificas: [] },
  { id: 'tpl-laser-meia-perna', procedimentoId: 'proc-1', procedimentoNome: 'Depilação a Laser - ½ Perna', categoria: 'Depilação a Laser', tem_foto: false, perguntasEspecificas: [] },
  { id: 'tpl-1758000000000', procedimentoId: 'proc-2', procedimentoNome: 'Depilação a Laser - Axilas', categoria: 'Depilação a Laser', tem_foto: false, perguntasEspecificas: [] },
  { id: 'tpl-botox', procedimentoNome: 'Botox (Toxina Botulínica)', categoria: 'Injetáveis & Face', tem_foto: false, perguntasEspecificas: [] },
  { id: 'tpl-gluteo', procedimentoNome: 'Harmonização Glútea', categoria: 'Corporal & Injetáveis', tem_foto: false, perguntasEspecificas: [] },
] as AnamnesisTemplate[];

const oferecidas = fichasParaEscolher(fichas);
const nomesOferecidos = oferecidas.map((t) => t.procedimentoNome);
ok(
  'só uma ficha de laser sobra',
  nomesOferecidos.filter((n) => n.toLowerCase().includes('laser')).length === 1,
  JSON.stringify(nomesOferecidos)
);
ok('e ela se chama "Depilação a Laser"', nomesOferecidos.includes('Depilação a Laser'));
ok('a de ½ Perna sai do seletor', !nomesOferecidos.some((n) => n.includes('½ Perna')));
ok(
  'a de Axilas com ID de timestamp também sai',
  !nomesOferecidos.some((n) => n.includes('Axilas'))
);
ok('as fichas de outras categorias ficam', nomesOferecidos.length === 3, String(nomesOferecidos.length));

const mapa = mapearTemplatesPorProcedimento(fichas, [
  { id: 'proc-1', title: 'Depilação a Laser - ½ Perna', category: 'Depilação a Laser' } as any,
  { id: 'proc-2', title: 'Depilação a Laser - Axilas', category: 'Depilação a Laser' } as any,
]);
ok(
  'todo procedimento de laser aponta para a ficha única',
  mapa.get('proc-1')?.id === 'tpl-epilacao-laser' && mapa.get('proc-2')?.id === 'tpl-epilacao-laser',
  `${mapa.get('proc-1')?.id} / ${mapa.get('proc-2')?.id}`
);

console.log('\n== dado torto não pode apagar a tela');
// Tela branca de verdade, encontrada em uso: uma ficha sem `procedimentoNome` fazia
// `chaveDeNome` lançar em pleno render, e o app inteiro sumia. O dado vem do Firestore, onde um
// campo pode simplesmente não existir — então a tolerância é obrigação, não gentileza.
const sobrevive = (nome: string, fn: () => unknown) => {
  try {
    fn();
    ok(nome, true);
  } catch (e) {
    ok(nome, false, (e as Error).message);
  }
};

sobrevive('ficha sem procedimentoNome', () =>
  fichasParaEscolher([{ id: 'a', categoria: 'Botox' } as unknown as AnamnesisTemplate])
);
sobrevive('ficha com procedimentoNome nulo', () =>
  fichasParaEscolher([
    { id: 'a', procedimentoNome: null, categoria: 'x' } as unknown as AnamnesisTemplate,
  ])
);
sobrevive('item nulo no meio da lista', () =>
  fichasParaEscolher([
    null as unknown as AnamnesisTemplate,
    { id: 'b', procedimentoNome: 'Botox', categoria: 'y' } as AnamnesisTemplate,
  ])
);
sobrevive('lista vazia', () => fichasParaEscolher([]));
sobrevive('mapear com ficha sem nome', () =>
  mapearTemplatesPorProcedimento([{ id: 'a', categoria: 'x' } as unknown as AnamnesisTemplate], [])
);

console.log('\n== campo que volta do banco como mapa em vez de array');
// A tela branca relatada: `perguntasEspecificas` gravada como `{0: …, 1: …}`. O engano é duplo —
// `.length` é `undefined`, então a checagem de lista vazia passa direto, e o `.map` logo abaixo
// derruba tudo. O TypeScript não ajuda: o tipo continua dizendo que é um array.
const comoMapa = { 0: { id: 'q1' }, 1: { id: 'q2' }, 2: { id: 'q3' } };
ok(
  'a forma de mapa realmente engana a checagem de vazio',
  (comoMapa as unknown as unknown[]).length === undefined
);
const recuperadas = paraArray<{ id: string }>(comoMapa);
ok('vira array de verdade', Array.isArray(recuperadas));
ok('preserva a ordem das chaves', recuperadas.map((q) => q.id).join(',') === 'q1,q2,q3');
ok('array normal passa intacto', paraArray([{ id: 'z' }]).length === 1);
ok('ausente vira lista vazia', paraArray(undefined).length === 0);
ok('nulo vira lista vazia', paraArray(null).length === 0);
ok('objeto sem chave numérica vira lista vazia', paraArray({ a: 1 }).length === 0);

console.log('\n== o gatilho do manequim reconhece a ficha guarda-chuva');
// O manequim sumiu da anamnese porque a ficha única nasceu no seed com a categoria
// "Laser & Alta Tecnologia", que `isLaserCategory` (feita para "Depilação a Laser") não reconhece.
// Uma migração renomeia — mas depender dela é o que já falhou duas vezes.
const tpl = (o: Partial<AnamnesisTemplate>) => ehTemplateDeLaser(o as AnamnesisTemplate);
ok(
  'guarda-chuva com a categoria do seed',
  tpl({ id: 'tpl-epilacao-laser', procedimentoNome: 'Epilação a Laser', categoria: 'Laser & Alta Tecnologia' })
);
ok(
  'guarda-chuva já renomeado pela migração',
  tpl({ id: 'tpl-epilacao-laser', procedimentoNome: 'Depilação a Laser', categoria: 'Depilação a Laser' })
);
ok(
  'ficha por área também dispara o mapa',
  tpl({ id: 'tpl-x', procedimentoNome: 'Depilação a Laser - Axilas', categoria: 'Depilação a Laser' })
);
ok('botox não dispara', !tpl({ id: 'tpl-botox', procedimentoNome: 'Botox', categoria: 'Injetáveis & Face' }));
ok('ficha sem nome não quebra', !tpl({ id: 'tpl-y', categoria: 'Facial' }));
ok('nulo não quebra', !ehTemplateDeLaser(null));

console.log('\n== questionário de laser (protocolo de 27 perguntas)');
// A lista é clínica: uma pergunta que suma, mude de dono ou perca alternativas altera o que a
// profissional vê antes de disparar o laser. Fixar aqui torna qualquer alteração deliberada.
//
// As 27 vivem hoje em **duas** listas, e a divisão também é protegida abaixo: as 21 da paciente
// ficam na ficha de anamnese (uma por caso) e as 6 da profissional na ficha de avaliação (uma por
// sessão). Antes da separação, avaliar a 4ª sessão de um plano exigia criar uma anamnese nova ou
// sobrescrever a avaliação da 3ª.
const PERGUNTAS_LASER = [...PERGUNTAS_PACIENTE, ...PERGUNTAS_PROFISSIONAL];

ok('são 27 perguntas no total', PERGUNTAS_LASER.length === 27, String(PERGUNTAS_LASER.length));
ok(
  '21 na anamnese (paciente) e 6 na avaliação (profissional)',
  PERGUNTAS_PACIENTE.length === 21 && PERGUNTAS_PROFISSIONAL.length === 6,
  `${PERGUNTAS_PACIENTE.length} + ${PERGUNTAS_PROFISSIONAL.length}`
);
ok(
  'nenhuma pergunta de profissional sobrou na ficha de anamnese',
  PERGUNTAS_PACIENTE.every((q) => (q.publicoAlvo || 'paciente') === 'paciente')
);
ok('nenhum ID repetido', new Set(PERGUNTAS_LASER.map((q) => q.id)).size === 27);
ok('ordem sequencial de 1 a 27', PERGUNTAS_LASER.every((q, i) => q.ordem === i + 1));
ok(
  'toda pergunta de escolha tem alternativas',
  PERGUNTAS_LASER.filter((q) => q.tipo_campo.includes('escolha')).every(
    (q) => (q.opcoes?.length || 0) > 0
  )
);
ok(
  'as contagens de alternativas batem com o protocolo',
  JSON.stringify(
    PERGUNTAS_LASER.filter((q) => q.opcoes).map((q) => [q.ordem, q.opcoes!.length])
  ) === JSON.stringify([[16, 5], [22, 6], [23, 6], [24, 6], [25, 3], [26, 3], [27, 10]]),
  JSON.stringify(PERGUNTAS_LASER.filter((q) => q.opcoes).map((q) => [q.ordem, q.opcoes!.length]))
);
ok(
  'só a 17 (ácidos) e a 26 (densidade) são opcionais',
  JSON.stringify(PERGUNTAS_LASER.filter((q) => !q.obrigatoria).map((q) => q.ordem)) ===
    JSON.stringify([17, 26])
);
ok(
  'gravidez e contraindicações continuam obrigatórias e na ficha da paciente',
  ['laser-gravidez', 'laser-anticoagulantes', 'laser-q17-roacutan'].every((id) => {
    const q = PERGUNTAS_PACIENTE.find((x) => x.id === id);
    return q?.obrigatoria === true && (q.publicoAlvo || 'paciente') === 'paciente';
  })
);
ok(
  'o fototipo é da profissional — está na avaliação, não na anamnese',
  PERGUNTAS_PROFISSIONAL.some((q) => q.id === 'laser-q15-fototipo') &&
    !PERGUNTAS_PACIENTE.some((q) => q.id === 'laser-q15-fototipo')
);
ok(
  'a pergunta de tatuagem saiu',
  !PERGUNTAS_LASER.some((q) => q.id.includes('tatuagem'))
);

console.log('\n== ficha de avaliação do laser');
const avalLaser = DEFAULT_EVALUATION_TEMPLATES.find((f) => f.id === 'aval-epilacao-laser');
ok('existe a ficha de avaliação do laser', !!avalLaser);
// Treze áreas no catálogo compartilham as mesmas 6 perguntas: fototipo, cor e espessura do pelo
// não mudam de buço para axila. Ligar por procedimento exigiria treze cópias em sincronia — que é
// o problema que aposentar as treze fichas de anamnese resolveu.
ok(
  'vale para a categoria inteira, não por área',
  (avalLaser?.categorias || []).includes('Depilação a Laser') &&
    (avalLaser?.procedureIds || []).length === 0,
  JSON.stringify(avalLaser?.categorias)
);
ok('leva as 6 perguntas da profissional', (avalLaser?.perguntas || []).length === 6);
ok(
  'renumeradas de 1 a 6 dentro da ficha',
  (avalLaser?.perguntas || []).every((q, i) => q.ordem === i + 1)
);
ok('pede a foto da sessão', avalLaser?.temFotoSessao === true);

console.log('\n== numeração impressa cai dentro da própria mancha');
// Na ficha em branco cada área ganha um número, e a legenda ao lado diz o nome. O centro **da
// área** é ponderado entre as formas: numa região simétrica ele cai exatamente entre as duas
// manchas, sobre o corpo nu — o número flutuava no esterno e nenhuma axila ficava marcada.
const dentroDaForma = (x: number, y: number, f: number[]): boolean => {
  const n = f.length / 2;
  let dentro = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = f[i * 2];
    const yi = f[i * 2 + 1];
    const xj = f[j * 2];
    const yj = f[j * 2 + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
};

const retangulo = (x1: number, y1: number, x2: number, y2: number) => [x1, y1, x2, y1, x2, y2, x1, y2];
const areaSimetrica: LaserArea = {
  id: 'axilas',
  vista: 'frente',
  formas: [retangulo(0.29, 0.225, 0.36, 0.27), retangulo(0.64, 0.225, 0.71, 0.27)],
};

const centroPonderado = centroDaArea(areaSimetrica);
ok(
  'o centro da ÁREA de fato cai fora das manchas (é o defeito que motivou a mudança)',
  !areaSimetrica.formas.some((f) => dentroDaForma(centroPonderado.x, centroPonderado.y, f)),
  `(${centroPonderado.x.toFixed(2)}, ${centroPonderado.y.toFixed(2)})`
);
ok(
  'o centro de cada FORMA cai dentro dela',
  areaSimetrica.formas.every((f) => {
    const c = centroDaForma(f);
    return dentroDaForma(c.x, c.y, f);
  })
);
ok(
  'uma área de duas manchas rende dois marcadores',
  areaSimetrica.formas.length === 2
);

console.log('\n== posição arrastada à mão vence a automática');
const comBotaoFixo = [
  { chave: 'fixo', area: { id: 'f', vista: 'frente' as const, formas: [[0.4, 0.4, 0.5, 0.4, 0.5, 0.5]], botao: { x: 0.05, y: 0.9 } } },
];
const [pFixo] = posicionarBotoesDoAnel(comBotaoFixo);
ok('usa a posição gravada', pFixo.x === 0.05 && pFixo.y === 0.9);

console.log(`\n${falhas === 0 ? 'TUDO OK' : `${falhas} FALHA(S)`}\n`);
process.exit(falhas === 0 ? 0 : 1);

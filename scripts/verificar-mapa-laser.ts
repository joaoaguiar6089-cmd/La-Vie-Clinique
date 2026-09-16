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
  criarFormaAPartirDoTraco,
  espelharForma,
  nomeCurtoDaArea,
  posicionarBotoesDoAnel,
  LASER_MAX_PONTOS_POR_FORMA,
} from '../src/utils/laserAreas';
import { LaserArea } from '../src/types';

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

console.log('\n== posição arrastada à mão vence a automática');
const comBotaoFixo = [
  { chave: 'fixo', area: { id: 'f', vista: 'frente' as const, formas: [[0.4, 0.4, 0.5, 0.4, 0.5, 0.5]], botao: { x: 0.05, y: 0.9 } } },
];
const [pFixo] = posicionarBotoesDoAnel(comBotaoFixo);
ok('usa a posição gravada', pFixo.x === 0.05 && pFixo.y === 0.9);

console.log(`\n${falhas === 0 ? 'TUDO OK' : `${falhas} FALHA(S)`}\n`);
process.exit(falhas === 0 ? 0 : 1);

/**
 * Confere as contas do estoque: custo de cada linha, totais, o consumo padrão virando linhas e o
 * preço congelado no registro.
 *
 * Existe porque um erro aqui não aparece em lugar nenhum: o custo errado de um atendimento só
 * vira problema no fim do mês, somado no Financeiro, quando já não se sabe de onde ele veio.
 *
 *   npx tsx scripts/verificar-custos.ts
 */
import { ConsumoPadrao, Procedure, ProdutoDeEstoque } from '../src/types';
import {
  arredondar,
  linhaDoProduto,
  linhasParaGravar,
  margemUnitaria,
  materiaisSugeridos,
  precoPorUnidade,
  produtoEmUso,
  totaisDoConsumoPadrao,
  totaisDosMateriais,
} from '../src/utils/estoque';

let falhas = 0;
const ok = (nome: string, condicao: boolean, extra = '') => {
  console.log(`${condicao ? '  ok  ' : ' FALHA'}  ${nome}${extra ? `  — ${extra}` : ''}`);
  if (!condicao) falhas++;
};

const produto = (id: string, custo: number, cliente: number, unidade = 'un'): ProdutoDeEstoque => ({
  id,
  nome: id,
  unidade,
  custoUnitario: custo,
  valorCliente: cliente,
  createdAt: '2026-01-01',
});

const toxina = produto('toxina', 12, 25, 'U');
const agulha = produto('agulha', 0.35, 0);
const gel = produto('gel', 0.0035, 0.01, 'ml');
const produtos = [toxina, agulha, gel];

const proc = (id: string, title: string): Procedure =>
  ({ id, title, category: 'Injetáveis', description: '', price: 1000, images: [], benefits: [], order: 1, createdAt: '' }) as Procedure;
const catalogo = [proc('botox', 'Botox'), proc('laser-axila', 'Depilação a Laser - Axilas')];

const consumos: ConsumoPadrao[] = [
  {
    id: 'botox',
    procedureId: 'botox',
    itens: [
      { produtoId: 'toxina', quantidade: 20 },
      { produtoId: 'agulha', quantidade: 2 },
    ],
  },
  { id: 'laser-axila', procedureId: 'laser-axila', itens: [{ produtoId: 'gel', quantidade: 30 }] },
];

console.log('== contas');
ok('0,1 + 0,2 fecha em centavos', arredondar(0.1 + 0.2) === 0.3);
ok('frasco de 100 U por R$ 1.200 dá R$ 12 por U', precoPorUnidade(1200, 100) === 12);
ok('ml de gel barato não vira zero', precoPorUnidade(35, 10000) === 0.0035);
ok('margem por unidade', margemUnitaria(toxina)?.valor === 13 && margemUnitaria(toxina)?.percentual === 52);
ok('sem valor repassado não há margem', margemUnitaria(agulha) === null);

console.log('== consumo padrão → linhas');
const botox = materiaisSugeridos({ procedureId: 'botox', procedimentoNome: 'Botox' }, consumos, produtos, catalogo);
ok('botox vem com as duas linhas', botox.length === 2);
const tBotox = totaisDosMateriais(botox);
ok('custo do botox = 20 × 12 + 2 × 0,35', tBotox.custo === 240.7, String(tBotox.custo));
ok('valor para a cliente do botox = 20 × 25', tBotox.valorCliente === 500, String(tBotox.valorCliente));
ok(
  'atendimento digitado à mão acha o procedimento pelo nome',
  materiaisSugeridos({ procedimentoNome: 'botox' }, consumos, produtos, catalogo).length === 2
);
ok(
  'procedimento sem consumo abre vazio',
  materiaisSugeridos({ procedimentoNome: 'Peeling' }, consumos, produtos, catalogo).length === 0
);
const dezSessoes = materiaisSugeridos(
  { procedureId: 'laser-axila', procedimentoNome: 'Depilação a Laser - Axilas' },
  consumos,
  produtos,
  catalogo,
  10
);
ok('pacote de 10 sessões consome 10 vezes', dezSessoes[0]?.quantidade === 300, String(dezSessoes[0]?.quantidade));
ok('produto excluído some da sugestão', materiaisSugeridos({ procedureId: 'botox', procedimentoNome: 'Botox' }, consumos, [toxina], catalogo).length === 1);
ok('custo por sessão do consumo padrão', totaisDoConsumoPadrao(consumos[0], produtos).custo === 240.7);

console.log('== preço congelado');
const linha = linhaDoProduto(toxina, 20);
toxina.custoUnitario = 15; // o produto sobe de preço depois
ok('a linha guardou o preço do dia', linha.custoUnitario === 12);
toxina.custoUnitario = 12;

console.log('== gravação');
const gravadas = linhasParaGravar([
  { ...linhaDoProduto(toxina, 20) },
  { nome: '  ', unidade: 'un', quantidade: 1, custoUnitario: 1, valorCliente: 0 }, // sem nome
  { ...linhaDoProduto(agulha, 0) }, // sem quantidade
  { nome: 'Fio PDO', unidade: 'fio', quantidade: 4, custoUnitario: 30, valorCliente: 60, cadastrarNoEstoque: true },
]);
ok('linhas vazias saem', gravadas.length === 2, String(gravadas.length));
ok('a marca de edição não vai para o banco', gravadas.every((g) => !('cadastrarNoEstoque' in g)));
ok('produto em uso não pode ser excluído', produtoEmUso('toxina', consumos) && !produtoEmUso('fio', consumos));

console.log(falhas === 0 ? '\nTUDO OK' : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);

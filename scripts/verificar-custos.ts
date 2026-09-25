/**
 * Confere as contas do estoque: custo de cada linha, totais, o consumo padrão virando linhas e o
 * preço congelado no registro.
 *
 * Existe porque um erro aqui não aparece em lugar nenhum: o custo errado de um atendimento só
 * vira problema no fim do mês, somado no Financeiro, quando já não se sabe de onde ele veio.
 *
 *   npx tsx scripts/verificar-custos.ts
 */
import { Attendance, ConsumoPadrao, Procedure, ProdutoDeEstoque, QuoteItem } from '../src/types';
import { clonarItens } from '../src/utils/quoteFactory';
import { custoDeMaterialNoPeriodo, margemDoPeriodo, periodoDoMes } from '../src/utils/indicadores';
import {
  arredondar,
  linhaDoProduto,
  linhasParaGravar,
  margemUnitaria,
  materiaisDoItem,
  materiaisSugeridos,
  montarCustoDoOrcamento,
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

console.log('== orçamento');
const item = (id: string, procedureId: string, titulo: string, sessoes = 1): QuoteItem => ({
  id,
  procedureId,
  categoria: 'Injetáveis',
  titulo,
  valorTabela: 1000,
  temDesconto: false,
  maisDeUmaSessao: sessoes > 1,
  sessoes,
  detalhes: [],
});
const itens = [item('i1', 'botox', 'Botox'), item('i2', 'laser-axila', 'Depilação a Laser - Axilas', 10)];
ok('item de 10 sessões multiplica o consumo', materiaisDoItem(itens[1], consumos, produtos, catalogo)[0]?.quantidade === 300);
const linhas = {
  i1: materiaisDoItem(itens[0], consumos, produtos, catalogo),
  i2: materiaisDoItem(itens[1], consumos, produtos, catalogo),
};
// Substituir clona os itens com ids novos, na mesma ordem — é pela posição que o custo acha o item.
const clonados = clonarItens(itens);
const custo = montarCustoDoOrcamento({ id: 'q-novo', itens: clonados }, { itens, linhas });
ok('ids novos depois de clonar', clonados[0].id !== 'i1' && clonados[1].id !== 'i2');
ok(
  'custo ligado aos itens novos pela posição',
  custo.itens[0].quoteItemId === clonados[0].id && custo.itens[1].quoteItemId === clonados[1].id
);
ok('total do custo do orçamento', custo.custoTotal === arredondar(240.7 + 300 * 0.0035), String(custo.custoTotal));
ok('custo guarda o id do orçamento', custo.quoteId === 'q-novo' && custo.id === 'q-novo');
const semLinhas = montarCustoDoOrcamento({ id: 'q2', itens: [item('x', 'peeling', 'Peeling')] }, { itens: [{ id: 'x' }], linhas: {} });
ok('orçamento sem material não grava item vazio', semLinhas.itens.length === 0 && semLinhas.custoTotal === 0);

console.log('== financeiro');
const at = (id: string, data: string, extra: Partial<Attendance> = {}): Attendance => ({
  id, pacienteId: 'p', pacienteNome: 'P', data, procedimentoNome: 'Botox', createdAt: data, ...extra,
});
const periodo = periodoDoMes('2026-09');
const material = custoDeMaterialNoPeriodo(
  [
    at('a', '2026-09-02', { materiaisRegistradosEm: 'x', custoMateriais: 240.7, professionalId: 'k' }),
    at('b', '2026-09-10', { materiaisRegistradosEm: 'x', custoMateriais: 1.05 }),
    at('c', '2026-09-12'), // realizado sem materiais
    at('d', '2026-09-15', { status: 'faltou', materiaisRegistradosEm: 'x', custoMateriais: 99 }), // falta não conta
    at('e', '2026-08-30', { materiaisRegistradosEm: 'x', custoMateriais: 50 }), // fora do mês
  ],
  periodo
);
ok('custo do mês soma só os realizados do mês', material.custo === 241.75, String(material.custo));
ok('cobertura: 2 de 3 realizados com materiais', material.comMateriais === 2 && material.realizados === 3);
ok(
  'filtro por profissional',
  custoDeMaterialNoPeriodo([at('a', '2026-09-02', { materiaisRegistradosEm: 'x', custoMateriais: 10, professionalId: 'k' }), at('b', '2026-09-03', { materiaisRegistradosEm: 'x', custoMateriais: 5 })], periodo, 'k').custo === 10
);
ok('margem = faturamento − custo', margemDoPeriodo(1000, 241.75).valor === 758.25 && margemDoPeriodo(1000, 241.75).percentual === 76);
ok('sem faturamento a margem não vira percentual', margemDoPeriodo(0, 50).percentual === null);

console.log(falhas === 0 ? '\nTUDO OK' : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);

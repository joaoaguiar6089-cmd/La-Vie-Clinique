/**
 * Confere as contas do estoque: custo de cada linha, totais, o consumo padrão virando linhas, a
 * caixa dividida por unidade e o preço congelado no registro — e o "Uso de material?" do
 * acompanhamento: o que ele grava ou apaga, e a lista do Financeiro que mostra o custo.
 *
 * Existe porque um erro aqui não aparece em lugar nenhum: o custo errado de um atendimento só
 * vira problema no fim do mês, somado no Financeiro, quando já não se sabe de onde ele veio.
 *
 *   npx tsx scripts/verificar-custos.ts
 */
import {
  AnamnesisQuestion,
  Attendance,
  ConsumoPadrao,
  FotoDaSessao,
  Procedure,
  ProdutoDeEstoque,
  QuoteItem,
} from '../src/types';
import { clonarItens } from '../src/utils/quoteFactory';
import {
  atendimentosComMateriaisNoPeriodo,
  custoDeMaterialNoPeriodo,
  margemDoPeriodo,
  periodoDoMes,
} from '../src/utils/indicadores';
import { acompanhamentoComRegistro, acompanhamentoVisivel } from '../src/utils/fichasClinicas';
import { fichaTemConteudo, fotosDaSessao } from '../src/utils/evaluations';
import {
  aplicarConsumoNoItem,
  arredondar,
  caixaLida,
  custoDaLinha,
  linhaDoProduto,
  linhasParaGravar,
  linhasSemValor,
  margemUnitaria,
  materiaisDoItem,
  materiaisSugeridos,
  montarCustoDoOrcamento,
  montarMateriaisDoAtendimento,
  nomesDosProdutos,
  planoDosMateriais,
  precoPorUnidade,
  produtoEmUso,
  quantidadeComUnidade,
  tirarConsumoDoItem,
  totaisDosMateriais,
  valoresPorUnidadeDaCaixa,
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
ok('quantidade com unidade', quantidadeComUnidade(2.5, 'ml') === '2,5 ml' && quantidadeComUnidade(20, 'U') === '20 U');
ok('unidade que começa com número ganha o ×', quantidadeComUnidade(1, '10 ml') === '1 × 10 ml', quantidadeComUnidade(1, '10 ml'));
ok('sem unidade, só o número', quantidadeComUnidade(5, '') === '5');

console.log('== caixa com unidades');
const caixa = valoresPorUnidadeDaCaixa({ unidades: 5, custo: 500, valorCliente: 750 });
ok('caixa de 5 por R$ 500 dá R$ 100 por frasco', caixa.custoUnitario === 100, String(caixa.custoUnitario));
ok('repasse da caixa também sai por frasco', caixa.valorCliente === 150, String(caixa.valorCliente));
ok(
  'caixa sem repasse não inventa valor',
  valoresPorUnidadeDaCaixa({ unidades: 5, custo: 500, valorCliente: 0 }).valorCliente === 0
);
ok(
  'caixa sem unidades não divide',
  valoresPorUnidadeDaCaixa({ unidades: 0, custo: 500, valorCliente: 750 }).custoUnitario === 0
);
const frasco: ProdutoDeEstoque = {
  ...produto('frasco', 0, 0, 'frasco'),
  ...valoresPorUnidadeDaCaixa({ unidades: 3, custo: 500, valorCliente: 0 }),
};
ok('divisão quebrada guarda quatro casas', frasco.custoUnitario === 166.6667, String(frasco.custoUnitario));
ok('a caixa inteira gasta volta a fechar em R$ 500', custoDaLinha(linhaDoProduto(frasco, 3)) === 500);
ok('um frasco na sessão custa a divisão', custoDaLinha(linhaDoProduto(frasco, 1)) === 166.67);
ok('caixa lida do banco', JSON.stringify(caixaLida({ unidades: '5', custo: 500 })) === JSON.stringify({ unidades: 5, custo: 500, valorCliente: 0 }));
ok('caixa sem unidades no banco é caixa nenhuma', caixaLida({ unidades: 0, custo: 500 }) === undefined);
ok('produto sem caixa', caixaLida(undefined) === undefined && caixaLida(null) === undefined && caixaLida('x') === undefined);

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

// ---- "Calcular por consumo de produto" ----
const porConsumo = aplicarConsumoNoItem(itens[0], linhas.i1);
ok('por consumo: valor = soma do repassado à cliente', porConsumo.valorTabela === 500, String(porConsumo.valorTabela));
ok('por consumo: marca o item', porConsumo.calculadoPorConsumo === true);
ok(
  'por consumo: documento leva só os nomes dos produtos',
  (porConsumo.produtosDoConsumo || []).join(',') === 'toxina,agulha'
);
{
  // O item é lido sem login pelo link: nada de quantidade nem de preço dentro dele.
  const texto = JSON.stringify(porConsumo);
  ok(
    'por consumo: nada de quantidade nem de valor do produto vaza para o item',
    !texto.includes('quantidade') && !texto.includes('custoUnitario') && !texto.includes('valorCliente')
  );
}
ok(
  'nomes sem repetir, sem linha em branco nem sem quantidade',
  nomesDosProdutos([
    linhaDoProduto(toxina, 10),
    linhaDoProduto(toxina, 5),
    { ...linhaDoProduto(gel, 0) },
    { nome: '  ', unidade: 'un', quantidade: 1, custoUnitario: 0, valorCliente: 0 },
  ]).join(',') === 'toxina'
);
ok('por consumo sem produto: valor zero e sem lista de nomes', (() => {
  const vazio = aplicarConsumoNoItem(itens[0], []);
  return vazio.valorTabela === 0 && vazio.produtosDoConsumo === undefined;
})());
{
  const desligado = tirarConsumoDoItem(porConsumo, [{ ...catalogo[0], promotionalPrice: 900 } as Procedure]);
  ok(
    'desligar o consumo volta ao preço do catálogo (promocional quando há)',
    desligado.valorTabela === 900 && !desligado.calculadoPorConsumo && !desligado.produtosDoConsumo
  );
  const avulso = tirarConsumoDoItem({ ...porConsumo, procedureId: undefined, valorTabela: 321 }, catalogo);
  ok('item fora do catálogo mantém o valor ao desligar', avulso.valorTabela === 321);
}
ok(
  'clonar mantém o consumo marcado e os nomes',
  clonarItens([porConsumo])[0].calculadoPorConsumo === true &&
    (clonarItens([porConsumo])[0].produtosDoConsumo || []).length === 2
);

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

console.log('== lista do Financeiro');
const lista = atendimentosComMateriaisNoPeriodo(
  [
    at('a', '2026-09-02', { hora: '09:00', materiaisRegistradosEm: 'x', custoMateriais: 10, professionalId: 'k' }),
    at('b', '2026-09-10', { hora: '14:00', materiaisRegistradosEm: 'x', custoMateriais: 5 }),
    at('b2', '2026-09-10', { hora: '16:00', materiaisRegistradosEm: 'x', custoMateriais: 7 }),
    at('c', '2026-09-12'), // sem materiais
    at('d', '2026-09-15', { status: 'faltou', materiaisRegistradosEm: 'x', custoMateriais: 99 }),
    at('e', '2026-08-30', { materiaisRegistradosEm: 'x', custoMateriais: 50 }), // fora do mês
  ],
  periodo
);
ok('só os realizados do mês com materiais', lista.map((a) => a.id).join() === 'b2,b,a', lista.map((a) => a.id).join());
ok(
  'a lista soma o mesmo que o cartão de custo',
  lista.reduce((s, a) => s + (a.custoMateriais || 0), 0) ===
    custoDeMaterialNoPeriodo([...lista, at('c', '2026-09-12')], periodo).custo
);
ok(
  'filtro por profissional na lista',
  atendimentosComMateriaisNoPeriodo(lista, periodo, 'k').map((a) => a.id).join() === 'a'
);

console.log('== uso de material no acompanhamento');
const linhaBotox = linhaDoProduto(toxina, 20);
const avulsa = { nome: 'Fio PDO', unidade: 'fio', quantidade: 4, custoUnitario: 0, valorCliente: 0 };
const vazia = { nome: '', unidade: 'un', quantidade: 1, custoUnitario: 0, valorCliente: 0 };
const plano = (usou: boolean, linhas: typeof avulsa[], existia: boolean, pronto = true) =>
  planoDosMateriais({ usou, linhas, existia, pronto });
const gravar = plano(true, [linhaBotox, avulsa], false);
ok('marcado com linhas grava', gravar.acao === 'gravar' && gravar.itens.length === 2);
ok('desmarcado com registro apaga', plano(false, [linhaBotox], true).acao === 'apagar');
ok('desmarcado sem registro não faz nada', plano(false, [linhaBotox], false).acao === 'manter');
ok('marcado só com linha vazia apaga o que existia', plano(true, [vazia], true).acao === 'apagar');
ok('marcado só com linha vazia, sem registro, não grava', plano(true, [vazia], false).acao === 'manter');
ok(
  'registro que não foi lido nunca é gravado nem apagado',
  plano(true, [linhaBotox], true, false).acao === 'manter' && plano(false, [], true, false).acao === 'manter'
);
ok('material digitado à mão fica sem valor', linhasSemValor([linhaBotox, avulsa]) === 1);
ok('produto com preço não falta valor', linhasSemValor([linhaBotox]) === 0);

const alvoDoTeste = {
  atendimentoId: 'atd-1',
  pacienteId: 'p',
  pacienteNome: 'P',
  procedureId: 'botox',
  procedimentoNome: 'Botox',
  data: '2026-09-02',
};
const materiaisGravados = montarMateriaisDoAtendimento(alvoDoTeste, [linhaBotox, avulsa], null, '2026-09-02T10:00:00Z');
ok('o registro tem o id do atendimento', materiaisGravados.id === 'atd-1' && materiaisGravados.atendimentoId === 'atd-1');
ok('o registro soma o custo das linhas', materiaisGravados.custoTotal === 240, String(materiaisGravados.custoTotal));
const corrigido = montarMateriaisDoAtendimento(alvoDoTeste, [linhaBotox], materiaisGravados, '2026-09-20T10:00:00Z');
ok('corrigir depois mantém a data do primeiro registro', corrigido.createdAt === '2026-09-02T10:00:00Z');

const passado = '2020-01-10';
const futuro = '2999-01-10';
ok('visita que aconteceu mostra o caderno', acompanhamentoVisivel(at('v1', passado)));
ok('falta sem registro não mostra', !acompanhamentoVisivel(at('v2', passado, { status: 'faltou' })));
ok(
  'materiais gravados mantêm o caderno à vista mesmo com a data no futuro',
  acompanhamentoVisivel(at('v3', futuro, { materiaisRegistradosEm: 'x' }))
);
ok(
  'caderno verde com acompanhamento ou com materiais',
  acompanhamentoComRegistro(at('v4', passado, { materiaisRegistradosEm: 'x' })) &&
    acompanhamentoComRegistro(at('v5', passado, { acompanhamentoPreenchidoEm: 'x' })) &&
    !acompanhamentoComRegistro(at('v6', passado))
);

const pergunta = { id: 'q1', texto: 'Resposta do tecido', tipo_campo: 'texto_curto', obrigatoria: false, ordem: 1 } as AnamnesisQuestion;
const ficha = (extra: Partial<Parameters<typeof fichaTemConteudo>[0]>) =>
  fichaTemConteudo({ perguntas: [pergunta], respostas: {}, ...extra });
ok('ficha em branco não tem conteúdo', !ficha({}) && !ficha({ respostas: { q1: '   ' }, observacoes: '  ' }));
ok('resposta é conteúdo', ficha({ respostas: { q1: 'boa' } }));
ok('observação é conteúdo', ficha({ observacoes: 'retorno em 15 dias' }));
ok('foto é conteúdo', ficha({ fotosSessao: [{ url: 'https://x/foto.jpg' }] }));
ok('lista de fotos vazia não é conteúdo', !ficha({ fotosSessao: [] }));

// ---- Várias fotos por ficha, lendo também as fichas de antes da lista ----
ok('ficha sem foto nenhuma → lista vazia', fotosDaSessao({}).length === 0 && fotosDaSessao(null).length === 0);
{
  const antiga = fotosDaSessao({
    fotoSessaoUrl: 'https://x/a.jpg',
    fotoSessaoAnotadaUrl: 'https://x/a-anotada.jpg',
    fotoSessaoAnotacoesJson: '{}',
  });
  ok(
    'ficha antiga (foto única) vira lista de uma, com a anotação',
    antiga.length === 1 &&
      antiga[0].url === 'https://x/a.jpg' &&
      antiga[0].anotadaUrl === 'https://x/a-anotada.jpg' &&
      antiga[0].anotacoesJson === '{}'
  );
}
ok(
  'lista presente manda sobre o legado — mesmo vazia (a última foto foi removida)',
  fotosDaSessao({ fotosSessao: [], fotoSessaoUrl: 'https://x/a.jpg' }).length === 0
);
ok(
  'várias fotos, na ordem, sem entradas quebradas',
  fotosDaSessao({
    fotosSessao: [{ url: 'https://x/1.jpg' }, { url: '' }, { url: 'https://x/2.jpg' }],
  })
    .map((f) => f.url)
    .join(',') === 'https://x/1.jpg,https://x/2.jpg'
);
ok(
  'lista gravada como mapa de chaves numéricas continua sendo lida',
  fotosDaSessao({
    fotosSessao: { 0: { url: 'https://x/1.jpg' }, 1: { url: 'https://x/2.jpg' } } as unknown as FotoDaSessao[],
  }).length === 2
);

console.log(falhas === 0 ? '\nTUDO OK' : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);

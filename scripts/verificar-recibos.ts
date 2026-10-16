/**
 * Confere o que a nota de recibo herda do orçamento — os itens com o valor de cada um e o desconto
 * de cada forma de pagamento —, a coluna Qtd. dos produtos e a leitura do desconto gravado.
 *
 * Existe porque a conta tem de fechar no centavo: os itens do recibo menos o desconto precisam
 * dar o valor da forma que a cliente escolheu, senão o formulário abre avisando de uma diferença
 * que ninguém criou.
 *
 *   npx tsx scripts/verificar-recibos.ts
 */
import { Quote, QuoteItem, Recibo } from '../src/types';
import { calcularOrcamento } from '../src/utils/quoteCalc';
import { ajustarItemDoProduto, montarItemDoProduto } from '../src/utils/quoteFactory';
import {
  itensDoOrcamento,
  normalizarRecibo,
  pagamentosSugeridos,
  quantidadeLegivel,
  subtotalDoRecibo,
} from '../src/utils/recibos';

let falhas = 0;
const ok = (nome: string, condicao: boolean, extra = '') => {
  console.log(`${condicao ? '  ok  ' : ' FALHA'}  ${nome}${extra ? `  — ${extra}` : ''}`);
  if (!condicao) falhas++;
};

const procedimento = (id: string, titulo: string, valor: number, extra: Partial<QuoteItem> = {}): QuoteItem => ({
  id,
  procedureId: id,
  categoria: 'Injetáveis',
  titulo,
  valorTabela: valor,
  temDesconto: false,
  maisDeUmaSessao: false,
  sessoes: 1,
  detalhes: [],
  ...extra,
});

const protetor = ajustarItemDoProduto(
  montarItemDoProduto({ id: 'protetor', nome: 'Protetor solar', unidade: 'un', valorCliente: 89.9 }),
  { quantidade: 2 }
);

const orcamento = {
  id: 'q1',
  numero: '2026-0010',
  status: 'pago',
  itens: [
    procedimento('botox', 'Botox', 1500, { temDesconto: true, valorComDesconto: 1200 }),
    procedimento('laser', 'Laser — 10 sessões', 1333.33, { maisDeUmaSessao: true, sessoes: 10 }),
    protetor,
  ],
  temDescontoCombinado: true,
  descontoCombinadoPercentual: 7,
  pagamento: {
    opcoes: [
      { id: 'cartao', forma: 'cartao', parcelas: 3, temDesconto: false },
      { id: 'pix', forma: 'pix', temDesconto: true, descontoPercentual: 10 },
      { id: 'dinheiro', forma: 'dinheiro', temDesconto: true, descontoPercentual: 3.5 },
    ],
  },
} as unknown as Quote;

console.log('== itens herdados do orçamento');
const itens = itensDoOrcamento(orcamento);
ok('um item por item do orçamento', itens.length === 3);
ok('o item com desconto vem com o valor já descontado', itens[0].valor === 1200, String(itens[0].valor));
ok('as sessões do procedimento vêm junto', itens[1].sessoes === 10 && !itens[1].produtoId);
ok(
  'o produto vem com quantidade, unidade e o total da linha',
  itens[2].produtoId === 'protetor' && itens[2].quantidade === 2 && itens[2].unidade === 'un' && itens[2].valor === 179.8,
  JSON.stringify(itens[2])
);

console.log('== desconto de cada forma de pagamento');
const totais = calcularOrcamento(orcamento);
const sugestoes = pagamentosSugeridos(orcamento);
const subtotal = subtotalDoRecibo(itens);
ok('o subtotal dos itens é o subtotal do orçamento', subtotal === totais.subtotal, `${subtotal} / ${totais.subtotal}`);
sugestoes.forEach((s) => {
  ok(
    `${s.rotulo}: itens − desconto = valor da forma`,
    subtotal !== null && Math.abs(subtotal - s.desconto - s.valor) < 0.001,
    `${subtotal} − ${s.desconto} = ${s.valor}`
  );
});
ok('a forma sem desconto próprio abate só o plano combinado', sugestoes[0].desconto === totais.descontoCombinadoValor);
ok('o Pix com 10% abate mais que o cartão', sugestoes[1].desconto > sugestoes[0].desconto);
{
  const semDesconto = pagamentosSugeridos({
    ...orcamento,
    temDescontoCombinado: false,
    pagamento: { opcoes: [{ id: 'pix', forma: 'pix', temDesconto: false }] },
  } as Quote);
  ok('orçamento sem desconto nenhum dá desconto zero', semDesconto[0].desconto === 0);
}

console.log('== subtotal e quantidade');
ok('subtotal sem itens é nulo', subtotalDoRecibo([]) === null);
ok('item sem valor deixa o subtotal nulo', subtotalDoRecibo([{ valor: 100 }, {}]) === null);
ok('subtotal fecha em centavos', subtotalDoRecibo([{ valor: 0.1 }, { valor: 0.2 }]) === 0.3);
ok('produto na coluna Qtd., no plural', quantidadeLegivel({ id: 'a', titulo: 'x', produtoId: 'p', unidade: 'frasco', quantidade: 2 }) === '2 frascos');
ok('uma unidade fica no singular', quantidadeLegivel({ id: 'a', titulo: 'x', produtoId: 'p', unidade: 'seringa', quantidade: 1 }) === '1 seringa');
ok('símbolo não vai para o plural', quantidadeLegivel({ id: 'a', titulo: 'x', produtoId: 'p', unidade: 'U', quantidade: 50 }) === '50 U');
ok('"un" não vira "uns"', quantidadeLegivel({ id: 'a', titulo: 'x', produtoId: 'p', unidade: 'un', quantidade: 3 }) === '3 un');
ok('par → pares', quantidadeLegivel({ id: 'a', titulo: 'x', produtoId: 'p', unidade: 'par', quantidade: 2 }) === '2 pares');
ok('produto de unidade fracionada', quantidadeLegivel({ id: 'a', titulo: 'x', produtoId: 'p', unidade: 'ml', quantidade: 2.5 }) === '2,5 ml');
ok('procedimento continua em sessões', quantidadeLegivel({ id: 'a', titulo: 'x', sessoes: 5 }) === '5 sessões');
ok('procedimento sem sessões é uma', quantidadeLegivel({ id: 'a', titulo: 'x' }) === '1 sessão');

console.log('== leitura do recibo gravado');
const base = { id: 'r1', numero: '2026-0001', valor: 1000, pacienteNome: 'Ana' } as Partial<Recibo> & { id: string };
ok('desconto gravado é lido', normalizarRecibo({ ...base, desconto: 150 }).desconto === 150);
ok('desconto zero some', normalizarRecibo({ ...base, desconto: 0 }).desconto === undefined);
ok('desconto torto some', normalizarRecibo({ ...base, desconto: 'x' as unknown as number }).desconto === undefined);
ok('recibo antigo, sem desconto, continua sem', normalizarRecibo(base).desconto === undefined);
{
  const lido = normalizarRecibo({
    ...base,
    itens: [{ id: 'i', titulo: 'Protetor', produtoId: 'p', unidade: 'un', quantidade: '3' as unknown as number, valor: 270 }],
  });
  ok(
    'a linha de produto é lida com quantidade numérica e unidade',
    lido.itens?.[0].quantidade === 3 && lido.itens?.[0].unidade === 'un' && lido.itens?.[0].produtoId === 'p'
  );
}

console.log(falhas === 0 ? '\nTUDO OK' : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);

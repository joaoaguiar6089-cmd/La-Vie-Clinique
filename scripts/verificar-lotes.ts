/**
 * Confere as contas do estoque com lotes: a compra virando lote, a baixa do material usado (o lote
 * que vence primeiro sai primeiro, e corrigir não troca o lote de lugar), a devolução, a validade,
 * o resumo por tipo, a leitura da planilha e o casamento de um nome lido com o cadastro.
 *
 * Existe porque um saldo errado não grita: ele só aparece no dia em que falta o produto na
 * prateleira, ou em que a lista diz que tem e não tem.
 *
 *   npx tsx scripts/verificar-lotes.ts
 */
import { LoteDeEstoque, MaterialUsado, ProdutoDeEstoque } from '../src/types';
import {
  casarProduto,
  custoPorUnidadeDeUso,
  dataBrasileira,
  lerPlanilha,
  loteDoItem,
  modeloDaPlanilha,
  numeroBrasileiro,
  pareceEmbalagem,
  pedidoPodeSerExcluido,
  planejarBaixa,
  produtoComCustoDaCompra,
  resumoDosTipos,
  situacaoDaValidade,
  tiposUsados,
  totaisLegiveis,
  totalDoPedido,
  unidadesDeUso,
} from '../src/utils/lotes';

let falhas = 0;
const ok = (nome: string, condicao: boolean, extra = '') => {
  console.log(`${condicao ? '  ok  ' : ' FALHA'}  ${nome}${extra ? `  — ${extra}` : ''}`);
  if (!condicao) falhas++;
};

const produto = (id: string, nome: string, unidade: string, extra: Partial<ProdutoDeEstoque> = {}): ProdutoDeEstoque => ({
  id,
  nome,
  unidade,
  custoUnitario: 10,
  valorCliente: 0,
  createdAt: '2026-01-01',
  ...extra,
});
const voluma = produto('voluma', 'Juvéderm Voluma 1 ml', 'seringa', { marca: 'Allergan', tipo: 'Ácido hialurônico' });
const restylane = produto('restylane', 'Restylane Lyft', 'seringa', { marca: 'Galderma', tipo: 'acido hialuronico' });
const botox = produto('botox', 'Botox 100U', 'U', { marca: 'Allergan', tipo: 'Toxina botulínica', caixa: { unidades: 100, custo: 1200, valorCliente: 0 } });
const gaze = produto('gaze', 'Gaze estéril', 'un');
const produtos = [voluma, restylane, botox, gaze];

const lote = (id: string, produtoId: string, saldo: number, validade?: string, extra: Partial<LoteDeEstoque> = {}): LoteDeEstoque => ({
  id,
  produtoId,
  produtoNome: produtoId,
  quantidade: saldo,
  saldo,
  custoUnitario: 1,
  validade,
  dataCompra: '2026-11-01',
  createdAt: '2026-11-01T10:00:00Z',
  ...extra,
});

console.log('== da compra ao lote');
ok('2 caixas de 100 U são 200 U', unidadesDeUso(2, true, 100) === 200);
ok('por unidade, a quantidade fica', unidadesDeUso(3, false, 100) === 3);
ok('caixa de R$ 1.200 com 100 U dá R$ 12 o U', custoPorUnidadeDeUso(1200, true, 100) === 12);
ok('gel barato não vira zero', custoPorUnidadeDeUso(35, true, 10000) === 0.0035);
ok('total do pedido', totalDoPedido([{ quantidade: 2, valorUnitario: 890 }, { quantidade: 3, valorUnitario: 0.35 }]) === 1781.05);
const novoLote = loteDoItem(
  { produtoId: 'botox', nome: 'Botox 100U', quantidade: 2, porEmbalagem: true, unidadesPorEmbalagem: 100, valorUnitario: 1100, lote: ' C123 ', validade: '2027-05-31', loteId: 'l1' },
  { id: 'ped1', dataCompra: '2026-11-14', fornecedor: 'Distribuidora X' },
  '2026-11-14T10:00:00Z'
);
ok('a linha vira lote em unidades de uso, com saldo cheio', novoLote.quantidade === 200 && novoLote.saldo === 200);
ok('com o custo por U desta compra', novoLote.custoUnitario === 11);
ok('com lote aparado, validade, fornecedor e o pedido', novoLote.lote === 'C123' && novoLote.validade === '2027-05-31' && novoLote.fornecedor === 'Distribuidora X' && novoLote.pedidoId === 'ped1');
const botoxNovoCusto = produtoComCustoDaCompra(botox, 11);
ok('o produto passa a custar o desta compra', botoxNovoCusto.custoUnitario === 11);
ok('e a caixa acompanha (100 × 11)', botoxNovoCusto.caixa?.custo === 1100);
ok('custo zero não apaga o custo antigo', produtoComCustoDaCompra(botox, 0).custoUnitario === 10);

console.log('== a baixa');
const lotes = [
  lote('A', 'voluma', 2, '2027-06-30'),
  lote('B', 'voluma', 5, '2027-01-31'),
  lote('C', 'voluma', 4),
  lote('T', 'botox', 100, '2027-03-31'),
];
const usado = (produtoId: string | undefined, quantidade: number, extra: Partial<MaterialUsado> = {}): MaterialUsado => ({
  produtoId,
  nome: produtoId || 'avulso',
  unidade: 'un',
  quantidade,
  custoUnitario: 1,
  valorCliente: 0,
  ...extra,
});
const p1 = planejarBaixa({ anteriores: [], novas: [usado('voluma', 3), usado('botox', 20), usado(undefined, 1)], lotes });
ok('tira do lote que vence primeiro (B)', p1.linhas[0].lotes?.length === 1 && p1.linhas[0].lotes[0].loteId === 'B' && p1.saldos.B === 2);
ok('botox sai do T', p1.saldos.T === 80);
ok('material digitado à mão não tem lote', !p1.linhas[2].lotes);
ok('lote intocado fica fora dos saldos', !('A' in p1.saldos) && !('C' in p1.saldos));
ok('a saída leva o código e a validade do lote', p1.linhas[1].lotes?.[0].validade === '2027-03-31');

const p2 = planejarBaixa({ anteriores: [], novas: [usado('voluma', 8)], lotes });
const saidas2 = p2.linhas[0].lotes || [];
ok('linha que esvazia um lote continua no próximo (B → A → C)', saidas2.map((s) => `${s.loteId}${s.quantidade}`).join(',') === 'B5,A2,C1', saidas2.map((s) => `${s.loteId}${s.quantidade}`).join(','));
const p3 = planejarBaixa({ anteriores: [], novas: [usado('voluma', 20)], lotes });
ok('sem saldo bastante, tira o que há e não fica negativo', Object.values(p3.saldos).every((s) => s === 0) && (p3.linhas[0].lotes || []).reduce((s, x) => s + x.quantidade, 0) === 11);

// Gravou 3 do B. Agora o estoque registra o B com 2 (o que sobrou) e alguém corrige para 4.
const depois1 = lotes.map((l) => (p1.saldos[l.id] !== undefined ? { ...l, saldo: p1.saldos[l.id] } : l));
const correcao = planejarBaixa({ anteriores: p1.linhas, novas: [{ ...p1.linhas[0], quantidade: 4 }, p1.linhas[1]], lotes: depois1 });
ok('corrigir a quantidade devolve e tira de novo: B fica com 1', correcao.saldos.B === 1 && (correcao.linhas[0].lotes || [])[0].loteId === 'B');
ok('a linha que não mudou não mexe no saldo', !('T' in correcao.saldos));

// Um lote novo, que vence antes, chega depois da gravação: a linha antiga não muda de lote.
const comLoteNovo = [...depois1, lote('D', 'voluma', 10, '2026-12-31')];
const regravado = planejarBaixa({ anteriores: p1.linhas, novas: p1.linhas, lotes: comLoteNovo });
ok('regravar não troca o lote de quem já tinha', (regravado.linhas[0].lotes || [])[0].loteId === 'B' && Object.keys(regravado.saldos).length === 0);

// Alguém escolhe o lote C no detalhe dos materiais.
const escolhido = planejarBaixa({
  anteriores: p1.linhas,
  novas: [{ ...p1.linhas[0], lotes: [{ loteId: 'C', quantidade: 3 }] }],
  lotes: depois1,
});
ok('o lote escolhido vale', (escolhido.linhas[0].lotes || []).map((s) => s.loteId).join() === 'C' && escolhido.saldos.C === 1 && escolhido.saldos.B === 5);
const devolucao = planejarBaixa({ anteriores: p1.linhas, novas: [], lotes: depois1 });
ok('apagar devolve tudo', devolucao.saldos.B === 5 && devolucao.saldos.T === 100 && devolucao.linhas.length === 0);
const loteApagado = planejarBaixa({ anteriores: [usado('voluma', 2, { lotes: [{ loteId: 'X', quantidade: 2 }] })], novas: [], lotes });
ok('devolver a um lote que não existe mais não quebra', Object.keys(loteApagado.saldos).length === 0);
const fracionado = planejarBaixa({ anteriores: [], novas: [usado('voluma', 0.1), usado('voluma', 0.2)], lotes: [lote('F', 'voluma', 1)] });
ok('frações não acumulam erro (1 − 0,1 − 0,2 = 0,7)', fracionado.saldos.F === 0.7, String(fracionado.saldos.F));

console.log('== validade');
ok('vencido', situacaoDaValidade('2026-11-13', '2026-11-14')?.situacao === 'vencido');
ok('vence hoje ainda não venceu', situacaoDaValidade('2026-11-14', '2026-11-14')?.situacao === 'vencendo');
ok('em 30 dias, vencendo', situacaoDaValidade('2026-12-14', '2026-11-14')?.situacao === 'vencendo');
ok('em 31 dias, em dia', situacaoDaValidade('2026-12-15', '2026-11-14')?.situacao === 'ok');
ok('sem validade, nada', situacaoDaValidade(undefined, '2026-11-14') === null);

console.log('== por tipo');
const resumo = resumoDosTipos(
  produtos,
  [lote('A', 'voluma', 2, '2026-11-20'), lote('R', 'restylane', 3, '2026-10-01'), lote('T', 'botox', 150), lote('Z', 'voluma', 0, '2026-01-01')],
  [{ id: 'acido-hialuronico', nome: 'Ácido hialurônico', minimo: 6, unidade: 'seringa' }],
  '2026-11-14'
);
const ah = resumo.find((r) => r.chave === 'acido-hialuronico');
ok('"Ácido hialurônico" e "acido hialuronico" são o mesmo tipo', !!ah && ah.produtos.length === 2);
ok('o total soma as seringas dos dois produtos', ah?.totais[0]?.saldo === 5 && totaisLegiveis(ah!.totais) === '5 seringas', ah ? totaisLegiveis(ah.totais) : '');
ok('abaixo do mínimo (5 < 6)', ah?.abaixoDoMinimo === true);
ok('conta o vencido e o vencendo, só com saldo', ah?.vencidos === 1 && ah?.vencendo === 1);
ok('lote zerado continua na lista, depois dos com saldo', ah?.lotes[ah.lotes.length - 1].id === 'Z');
ok('produto sem tipo vai para "Sem tipo", por último', resumo[resumo.length - 1].nome === 'Sem tipo' && resumo[resumo.length - 1].produtos[0].id === 'gaze');
ok('sem mínimo, nunca está abaixo', resumo.find((r) => r.nome === 'Toxina botulínica')?.abaixoDoMinimo === false);
ok('tipos para sugerir, sem repetir', tiposUsados(produtos).length === 2);

console.log('== planilha');
ok('número com milhar e centavos', numeroBrasileiro('R$ 1.234,56') === 1234.56);
ok('vírgula decimal', numeroBrasileiro('12,5') === 12.5);
ok('ponto de milhar sozinho', numeroBrasileiro('1.000') === 1000);
ok('ponto decimal', numeroBrasileiro('0.35') === 0.35);
ok('data dd/mm/aaaa', dataBrasileira('31/03/2027') === '2027-03-31');
ok('data dd/mm/aa', dataBrasileira('31/03/27') === '2027-03-31');
ok('validade mm/aaaa vale até o fim do mês', dataBrasileira('02/2028') === '2028-02-29');
ok('data ISO', dataBrasileira('2027-03-31') === '2027-03-31');
ok('data errada', dataBrasileira('31/13/2027') === undefined);

const colado = 'Produto\tMarca\tQuantidade\tUnidade\tValor unitário\tLote\tValidade\nJuvéderm Voluma\tAllergan\t2\tseringa\t890,00\tAB12\t03/2027\nGaze\t\t10\tun\t0,35\t\t\n\t\t\t\t\t\t';
const lido = lerPlanilha(colado);
ok('lê o que foi colado do Excel (tabulação, com cabeçalho)', lido.linhas.length === 2 && lido.linhas[0].valorUnitario === 890 && lido.linhas[0].validade === '2027-03-31');
ok('linha em branco não vira aviso', lido.avisos.length === 0, lido.avisos.join(' | '));
const csv = lerPlanilha('Juvéderm Voluma;Allergan;Ácido hialurônico;2;seringa;890,00;AB12;31/03/2027\nSem quantidade;;;;;10;;');
ok('CSV com ponto e vírgula, sem cabeçalho, na ordem do modelo', csv.linhas.length === 1 && csv.linhas[0].tipo === 'Ácido hialurônico' && csv.linhas[0].lote === 'AB12');
ok('avisa da linha sem quantidade', csv.avisos.length === 1 && /Linha 2/.test(csv.avisos[0]));
const comTotal = lerPlanilha('Descrição,Qtd,Valor total\n"Seringa 1,0 ml",4,"10,00"');
ok('cabeçalho em outra ordem, aspas e valor total viram unitário', comTotal.linhas[0]?.produto === 'Seringa 1,0 ml' && comTotal.linhas[0]?.valorUnitario === 2.5, JSON.stringify(comTotal.linhas[0]));
ok('o modelo tem as 8 colunas', modeloDaPlanilha().split('\n')[0].split(';').length === 8);
ok('a planilha do modelo é lida de volta', lerPlanilha(modeloDaPlanilha()).linhas.length === 1);

console.log('== casar o nome lido');
ok('nome igual', casarProduto('juvederm voluma 1 ml', undefined, produtos)?.id === 'voluma');
ok('nome curto dentro do longo', casarProduto('Voluma', 'Allergan', produtos)?.id === 'voluma');
ok('a marca desempata', casarProduto('Botox', 'Allergan', produtos)?.id === 'botox');
ok('nada parecido, nada sugerido', casarProduto('Luva nitrílica', undefined, produtos) === null);
ok('produto arquivado não é sugerido', casarProduto('Gaze estéril', undefined, [{ ...gaze, arquivado: true }]) === null);
ok('"caixa" com produto em caixa é embalagem', pareceEmbalagem('caixa', botox) === true);
ok('a unidade de uso não é embalagem', pareceEmbalagem('U', botox) === false);
ok('sem caixa cadastrada, nunca é embalagem', pareceEmbalagem('caixa', gaze) === false);

console.log('== excluir pedido');
ok('pedido intocado pode sair', pedidoPodeSerExcluido({ itens: [{ loteId: 'A' } as never] }, [lote('A', 'voluma', 2)]));
ok('pedido com lote usado, não', !pedidoPodeSerExcluido({ itens: [{ loteId: 'A' } as never] }, [lote('A', 'voluma', 1, undefined, { quantidade: 2 })]));
ok('pedido com lote ajustado, não', !pedidoPodeSerExcluido({ itens: [{ loteId: 'A' } as never] }, [lote('A', 'voluma', 2, undefined, { ajustes: [{ em: 'x', de: 2, para: 2, motivo: 'contagem' }] })]));

console.log(falhas === 0 ? '\nTUDO OK' : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);

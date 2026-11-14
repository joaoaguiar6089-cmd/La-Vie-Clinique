/**
 * Confere a leitura do pedido de compra por IA sem gastar cota: a limpeza do que o modelo devolve
 * e a chamada ao Gemini contra um servidor falso, local, que responde como a API — o pedido sai com
 * a foto, as instruções e a lista de produtos; a resposta volta limpa.
 *
 *   npx tsx scripts/verificar-leitura-de-pedido.ts
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { instrucoesDaLeitura, normalizarLeitura, produtosParaLeitura } from '../src/utils/leituraDePedido';
import { lerPedidoComGemini } from '../server/leituraDePedido';
import { ProdutoDeEstoque } from '../src/types';

let falhas = 0;
const ok = (nome: string, condicao: boolean, extra = '') => {
  console.log(`${condicao ? '  ok  ' : ' FALHA'}  ${nome}${extra ? `  — ${extra}` : ''}`);
  if (!condicao) falhas++;
};

const produtos: ProdutoDeEstoque[] = [
  { id: 'voluma', nome: 'Juvéderm Voluma 1 ml', unidade: 'seringa', marca: 'Allergan', tipo: 'Ácido hialurônico', custoUnitario: 900, valorCliente: 0, createdAt: '' },
  { id: 'velho', nome: 'Produto arquivado', unidade: 'un', custoUnitario: 1, valorCliente: 0, createdAt: '', arquivado: true },
];

console.log('== o que vai para o modelo');
const lista = produtosParaLeitura(produtos);
ok('produto arquivado não vai', lista.length === 1 && lista[0].id === 'voluma');
const instrucoes = instrucoesDaLeitura(lista);
ok('as instruções levam o id, o nome, a marca e o tipo', /id: voluma \| Juvéderm Voluma 1 ml \| marca: Allergan \| tipo: Ácido hialurônico/.test(instrucoes));
ok('e pedem para não inventar', /Não invente/.test(instrucoes));
ok('sem produtos, diz que não há', /nenhum produto cadastrado/.test(instrucoesDaLeitura([])));

console.log('== a resposta, limpa');
const ids = new Set(['voluma']);
const leitura = normalizarLeitura(
  {
    fornecedor: '  Distribuidora   Bela ',
    numero: 'NF 123',
    dataCompra: '14/11/2026',
    itens: [
      { produto: 'Voluma 1ml', marca: 'Allergan', quantidade: 2, unidade: 'seringa', valorUnitario: 880, lote: 'V2', validade: '03/2027', produtoId: 'voluma' },
      { produto: 'Luva', quantidade: '1', unidade: 'caixa', valorTotal: '45,00', produtoId: 'inventado' },
      { produto: '', quantidade: 3 },
      { produto: 'Sem quantidade', quantidade: 0 },
      'lixo',
    ],
  },
  ids
);
ok('fornecedor aparado, número e data em AAAA-MM-DD', leitura.fornecedor === 'Distribuidora Bela' && leitura.numero === 'NF 123' && leitura.dataCompra === '2026-11-14');
ok('só os itens com nome e quantidade', leitura.itens.length === 2);
ok('o produto reconhecido fica', leitura.itens[0].produtoId === 'voluma');
ok('validade mm/aaaa vira o fim do mês', leitura.itens[0].validade === '2027-03-31');
ok('id inventado sai', leitura.itens[1].produtoId === undefined);
ok('quantidade em texto e unitário do total', leitura.itens[1].quantidade === 1 && leitura.itens[1].valorUnitario === 45);
ok('resposta torta não derruba', normalizarLeitura(null, ids).itens.length === 0 && normalizarLeitura({ itens: 'x' }, ids).itens.length === 0);

console.log('== a chamada ao Gemini (servidor falso)');
let recebido: { url?: string; chave?: string; corpo?: any } = {};
let responder = (_res: http.ServerResponse) => {};
const falso = http.createServer((req, res) => {
  let dados = '';
  req.on('data', (c) => (dados += c));
  req.on('end', () => {
    recebido = { url: req.url, chave: String(req.headers['x-goog-api-key'] || ''), corpo: JSON.parse(dados || '{}') };
    responder(res);
  });
});
await new Promise<void>((r) => falso.listen(0, '127.0.0.1', () => r()));
const baseUrl = `http://127.0.0.1:${(falso.address() as AddressInfo).port}`;
const comoGemini = (texto: string) => (res: http.ServerResponse) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: texto }] }, finishReason: 'STOP' }] }));
};

responder = comoGemini(JSON.stringify({ fornecedor: 'Bela', itens: [{ produto: 'Voluma', quantidade: 2, valorUnitario: 880, produtoId: 'voluma' }] }));
const lido = await lerPedidoComGemini({ arquivo: 'QUJD', tipo: 'image/png', produtos: lista }, { chave: 'chave-de-teste', baseUrl });
ok('chama o modelo padrão, no generateContent', /models\/gemini-2\.5-flash:generateContent/.test(recebido.url || ''), recebido.url);
ok('com a chave no cabeçalho', recebido.chave === 'chave-de-teste');
const partes = recebido.corpo?.contents?.[0]?.parts || [];
ok('manda a foto como inlineData', partes[0]?.inlineData?.mimeType === 'image/png' && partes[0]?.inlineData?.data === 'QUJD');
ok('e as instruções com a lista de produtos', /id: voluma/.test(partes[1]?.text || ''));
ok('pede JSON no formato do esquema', recebido.corpo?.generationConfig?.responseMimeType === 'application/json' && !!recebido.corpo?.generationConfig?.responseSchema);
ok('devolve a leitura limpa', lido.fornecedor === 'Bela' && lido.itens[0]?.produtoId === 'voluma' && lido.itens[0]?.valorUnitario === 880);

await lerPedidoComGemini({ arquivo: 'QUJD', tipo: 'application/pdf', produtos: lista }, { chave: 'x', baseUrl, modelo: 'outro-modelo' });
ok('GEMINI_MODELO troca o modelo', /models\/outro-modelo:generateContent/.test(recebido.url || ''));

responder = comoGemini('isto não é JSON');
let erro = '';
try {
  await lerPedidoComGemini({ arquivo: 'QUJD', tipo: 'image/png', produtos: lista }, { chave: 'x', baseUrl });
} catch (e) {
  erro = (e as Error).message;
}
ok('resposta fora do formato vira erro legível', /fora do formato/.test(erro), erro);

falso.close();
console.log(falhas === 0 ? '\nTUDO OK' : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);

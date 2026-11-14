import { auth } from '../lib/firebase';
import { ProdutoDeEstoque } from '../types';
import { LeituraDoPedido, produtosParaLeitura } from '../utils/leituraDePedido';
import { prepararArquivo } from './comprovantes';

/**
 * A leitura de um pedido de compra pela IA, pelo servidor (`/api/leitura-de-pedido`, ver
 * `server/leituraDePedido.ts`). A foto grande é reduzida antes, como no anexo; o PDF vai como está.
 */

const MENSAGENS: Record<string, string> = {
  login: 'Entre de novo no sistema para usar a leitura.',
  arquivo: 'A leitura aceita foto ou PDF.',
  'nao-configurada': 'A leitura por IA ainda não está ligada neste servidor. Use a planilha por enquanto.',
  'muitas-leituras': 'Muitas leituras em pouco tempo. Espere alguns minutos e tente de novo.',
  'leitura-falhou': 'A IA não conseguiu ler este arquivo. Tente uma foto mais nítida, ou use a planilha.',
};

const paraBase64 = (corpo: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result).split(',')[1] || '');
    leitor.onerror = () => reject(new Error('não foi possível abrir o arquivo'));
    leitor.readAsDataURL(corpo);
  });

export async function lerPedidoComIa(arquivo: File, produtos: ProdutoDeEstoque[]): Promise<LeituraDoPedido> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error(MENSAGENS.login);
  const { corpo, tipo } = await prepararArquivo(arquivo);
  const resposta = await fetch('/api/leitura-de-pedido', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ arquivo: await paraBase64(corpo), tipo, produtos: produtosParaLeitura(produtos) }),
  });
  const json: any = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    if (resposta.status === 413) throw new Error('O arquivo é grande demais para a leitura. Envie uma foto.');
    throw new Error(MENSAGENS[json?.erro] || `A leitura falhou (${resposta.status}).`);
  }
  return json as LeituraDoPedido;
}

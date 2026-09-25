import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { app } from '../lib/firebase';
import { QuoteComprovante } from '../types';
import { downscaleImage } from '../utils/imageCompressor';

/**
 * Comprovantes de pagamento dos orçamentos, no Firebase Storage.
 *
 * Diferente de `imageStorage`, aqui a falha **não** cai para base64 dentro do documento: um PDF
 * de comprovante passa fácil do teto de 1 MB do Firestore, e o orçamento é lido inteiro pela
 * página pública. Se o Storage recusar, quem enviou precisa saber — a tela mostra o motivo e o
 * pagamento pode ser registrado sem o arquivo.
 *
 * Caminho: `orcamentos/<id do orçamento>/comprovantes/<aleatório>`. Ver `storage.rules`.
 */

const storage = getStorage(app);

export const COMPROVANTE_TAMANHO_MAXIMO = 10 * 1024 * 1024;

/** Valor do `accept` do campo de arquivo. */
export const COMPROVANTE_TIPOS_ACEITOS = 'image/*,application/pdf';

/** Acima disto a foto é reduzida antes de subir — foto de celular chega a 8 MB à toa. */
const REDUZIR_FOTO_ACIMA_DE = 1.5 * 1024 * 1024;

export const comprovanteEhPdf = (c: Pick<QuoteComprovante, 'tipo'>): boolean =>
  c.tipo === 'application/pdf';

/** O que há de errado com o arquivo escolhido, ou `null` quando ele serve. */
export function problemaNoArquivoDeComprovante(arquivo: File): string | null {
  const ehImagem = arquivo.type.startsWith('image/');
  if (!ehImagem && arquivo.type !== 'application/pdf') {
    return 'Envie uma foto ou um PDF do comprovante.';
  }
  // Foto grande é reduzida antes de subir; PDF não tem como.
  if (!ehImagem && arquivo.size > COMPROVANTE_TAMANHO_MAXIMO) {
    return 'O PDF passa de 10 MB. Exporte de novo ou envie uma captura de tela.';
  }
  return null;
}

/**
 * Foto grande vira JPEG de até 2000px: continua legível (é um recibo, com letra miúda) e cabe no
 * limite. Se o navegador não conseguir abrir a imagem (HEIC fora do Safari, por exemplo), sobe o
 * arquivo original.
 */
async function prepararArquivo(arquivo: File): Promise<{ corpo: Blob; tipo: string }> {
  if (!arquivo.type.startsWith('image/') || arquivo.size <= REDUZIR_FOTO_ACIMA_DE) {
    return { corpo: arquivo, tipo: arquivo.type };
  }
  try {
    const dataUrl = await downscaleImage(arquivo, 2000, 0.85);
    const corpo = await (await fetch(dataUrl)).blob();
    return { corpo, tipo: 'image/jpeg' };
  } catch {
    return { corpo: arquivo, tipo: arquivo.type };
  }
}

const EXTENSAO: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

/** Sobe o comprovante e devolve o registro a gravar no orçamento. Lança com mensagem legível. */
export async function enviarComprovante(quoteId: string, arquivo: File): Promise<QuoteComprovante> {
  const problema = problemaNoArquivoDeComprovante(arquivo);
  if (problema) throw new Error(problema);

  const { corpo, tipo } = await prepararArquivo(arquivo);
  if (corpo.size > COMPROVANTE_TAMANHO_MAXIMO) {
    throw new Error('O arquivo passa de 10 MB. Envie uma captura de tela do comprovante.');
  }

  const extensao = EXTENSAO[tipo] || (tipo.startsWith('image/') ? 'jpg' : 'bin');
  const objeto = ref(storage, `orcamentos/${quoteId}/comprovantes/${crypto.randomUUID()}.${extensao}`);

  try {
    await uploadBytes(objeto, corpo, { contentType: tipo });
    const url = await getDownloadURL(objeto);
    return {
      url,
      nome: arquivo.name || `comprovante.${extensao}`,
      tipo,
      enviadoEm: new Date().toISOString(),
    };
  } catch (err) {
    const codigo = (err as { code?: string })?.code;
    if (codigo === 'storage/unauthorized') {
      throw new Error(
        'O Firebase Storage recusou o arquivo. As regras de storage.rules com o caminho ' +
          '"orcamentos/" precisam estar publicadas no Firebase.'
      );
    }
    throw new Error(`Não foi possível enviar o comprovante: ${(err as Error).message}`);
  }
}

/**
 * Apaga do Storage um comprovante que saiu do orçamento (trocado, removido ou pagamento
 * desfeito). Silencioso: arquivo já removido ou sem permissão não é problema da tela.
 */
export async function apagarComprovante(comprovante?: Pick<QuoteComprovante, 'url'> | null): Promise<void> {
  if (!comprovante?.url) return;
  try {
    await deleteObject(ref(storage, comprovante.url));
  } catch {
    // Já não existe, ou as regras recusaram — ignorar.
  }
}

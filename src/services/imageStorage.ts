import { getStorage, ref, uploadString, getDownloadURL, deleteObject } from 'firebase/storage';
import { app } from '../lib/firebase';

/**
 * Envio de imagens para o Firebase Storage, em vez de guardá-las em base64 dentro do documento.
 *
 * Por que isto existe: cada foto virava uma string base64 de algumas centenas de KB gravada dentro
 * do próprio documento do Firestore. Isso custava caro de três formas — o teto de 1 MB por
 * documento era atingido com três imagens, toda leitura da ficha baixava as fotos junto (mesmo
 * numa listagem que só mostra o nome do paciente), e a coleção inteira sendo lida no início da
 * sessão virava dezenas de megabytes de tráfego. No Storage a imagem vira uma URL curta: o
 * documento volta a ser texto, e a foto só é baixada quando alguém abre a ficha.
 *
 * Tudo aqui é tolerante a falha por decisão de projeto. Se o Storage não estiver habilitado no
 * projeto, se as regras recusarem ou se a rede cair, `subirImagem` devolve a própria base64 — o
 * comportamento antigo, que funciona. Assim, ativar o Storage é um ganho, e não ativá-lo não
 * quebra nada.
 */

const storage = getStorage(app);

/** Resultado do envio, para quem quiser saber se a imagem foi mesmo parar no Storage. */
export interface ResultadoUpload {
  /** URL do Storage, ou a própria base64 quando o envio não foi possível. */
  url: string;
  /** true quando a imagem está no Storage; false quando caiu no base64 embutido. */
  noStorage: boolean;
}

/** Uma URL do Storage (ou qualquer http), por oposição a uma imagem embutida em base64. */
export function ehUrlExterna(url?: string): boolean {
  return !!url && !url.startsWith('data:');
}

function nomeUnico(extensao = 'jpg'): string {
  const aleatorio =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${aleatorio}.${extensao}`;
}

/**
 * Sobe uma imagem (data URL vinda do `downscaleImage`) para `pasta` e devolve a URL pública.
 *
 * Nunca lança: qualquer falha vira o retorno da própria `dataUrl`, com `noStorage: false`.
 */
export async function subirImagem(dataUrl: string, pasta: string): Promise<ResultadoUpload> {
  // Já é uma URL (imagem colada por link, ou uma que já subiu antes): nada a fazer.
  if (ehUrlExterna(dataUrl)) return { url: dataUrl, noStorage: true };
  if (!dataUrl) return { url: dataUrl, noStorage: false };

  try {
    const extensao = dataUrl.startsWith('data:image/png') ? 'png' : 'jpg';
    const caminho = `${pasta.replace(/\/+$/, '')}/${nomeUnico(extensao)}`;
    const objeto = ref(storage, caminho);
    await uploadString(objeto, dataUrl, 'data_url');
    const url = await getDownloadURL(objeto);
    return { url, noStorage: true };
  } catch (err) {
    console.warn(
      'Não foi possível enviar a imagem para o Firebase Storage; ela será guardada dentro do ' +
        'documento como antes. Verifique se o Storage está habilitado e se as regras de storage.rules ' +
        'foram publicadas.',
      err
    );
    return { url: dataUrl, noStorage: false };
  }
}

/** Atalho para quem só quer a URL e não se importa com o caminho que ela tomou. */
export async function subirImagemOuManter(dataUrl: string, pasta: string): Promise<string> {
  const { url } = await subirImagem(dataUrl, pasta);
  return url;
}

/**
 * Apaga do Storage uma imagem que não é mais usada. Silencioso de propósito: se o arquivo já não
 * existe, ou é base64 embutida, ou as regras recusam, não há nada que a tela deva fazer a respeito.
 */
export async function apagarImagemDoStorage(url?: string): Promise<void> {
  if (!ehUrlExterna(url)) return;
  try {
    await deleteObject(ref(storage, url));
  } catch {
    // Arquivo já removido, URL de outra origem (link colado) ou sem permissão — ignorar.
  }
}

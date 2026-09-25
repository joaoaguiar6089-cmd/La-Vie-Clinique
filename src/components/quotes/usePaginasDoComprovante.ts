import { useEffect, useState } from 'react';
import { QuoteComprovante } from '../../types';
import { comprovanteEhPdf } from '../../services/comprovantes';

/** Uma folha do comprovante já pronta para desenhar: data URL e o tamanho natural, em pixels. */
export interface PaginaDoComprovante {
  src: string;
  largura: number;
  altura: number;
}

export type EstadoDoComprovante =
  | { estado: 'ausente' }
  | { estado: 'carregando' }
  | { estado: 'pronto'; paginas: PaginaDoComprovante[]; paginasOmitidas: number }
  | { estado: 'erro'; mensagem: string };

/** Comprovante bancário tem uma folha; um PDF de 40 páginas foi anexado por engano. */
const MAXIMO_DE_PAGINAS = 6;

/**
 * Largura, em pixels, em que cada folha de um PDF é desenhada. O dobro da área útil do A4 do
 * orçamento — a mesma escala 2 com que o exportElementAsPDF captura a página inteira.
 */
const LARGURA_RENDERIZACAO = 1400;

const lerComoDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(leitor.result as string);
    leitor.onerror = () => reject(leitor.error);
    leitor.readAsDataURL(blob);
  });

const medirImagem = (src: string): Promise<{ largura: number; altura: number }> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ largura: img.naturalWidth, altura: img.naturalHeight });
    img.onerror = () => reject(new Error('o navegador não abre este formato de imagem'));
    img.src = src;
  });

async function paginasDaImagem(arquivo: Blob): Promise<PaginaDoComprovante[]> {
  const src = await lerComoDataUrl(arquivo);
  const { largura, altura } = await medirImagem(src);
  return [{ src, largura, altura }];
}

/**
 * Cada folha do PDF vira uma imagem. Não dá para pôr o PDF original "dentro" do orçamento: o
 * orçamento é HTML capturado pelo html2canvas, e é essa mesma captura que o visualizador mostra —
 * então a folha precisa existir como imagem na tela para sair igual no arquivo.
 *
 * O pdf.js só é carregado aqui, sob demanda: ele pesa mais que o resto da tela de orçamentos, e
 * a maioria dos orçamentos abertos não tem comprovante em PDF. Build `legacy` porque a página
 * pública abre em qualquer celular da cliente, inclusive iPhone sem atualização.
 *
 * O worker entra pelo `?worker` do Vite, e não por `workerSrc` com a URL do `.mjs`: assim ele sai
 * no build como `.js` comum, sem depender de o servidor publicar `.mjs` com o tipo JavaScript.
 * Criado uma vez só: o pdf.js não encerra um worker que recebeu pronto, e ele serve aos próximos.
 */
async function paginasDoPdf(
  arquivo: Blob
): Promise<{ paginas: PaginaDoComprovante[]; paginasOmitidas: number }> {
  const [pdfjs, { default: WorkerDoPdf }] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker'),
  ]);
  if (!pdfjs.GlobalWorkerOptions.workerPort) pdfjs.GlobalWorkerOptions.workerPort = new WorkerDoPdf();

  const tarefa = pdfjs.getDocument({ data: new Uint8Array(await arquivo.arrayBuffer()) });
  try {
    // A mensagem do pdf.js vem em inglês ("Invalid PDF structure"), e quem lê é a clínica
    const documento = await tarefa.promise.catch(() => {
      throw new Error('o arquivo está corrompido ou não é um PDF');
    });
    const total = Math.min(documento.numPages, MAXIMO_DE_PAGINAS);
    const paginas: PaginaDoComprovante[] = [];
    for (let n = 1; n <= total; n++) {
      const pagina = await documento.getPage(n);
      const escala = LARGURA_RENDERIZACAO / pagina.getViewport({ scale: 1 }).width;
      const viewport = pagina.getViewport({ scale: escala });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await pagina.render({ canvas, viewport, background: '#FFFFFF' }).promise;
      paginas.push({
        src: canvas.toDataURL('image/jpeg', 0.9),
        largura: canvas.width,
        altura: canvas.height,
      });
      pagina.cleanup();
    }
    return { paginas, paginasOmitidas: documento.numPages - total };
  } finally {
    // Libera o documento; o worker continua, para o próximo comprovante
    tarefa.destroy();
  }
}

/**
 * Baixa o comprovante do orçamento e o prepara para entrar como folhas no fim do PDF.
 *
 * Tudo vira data URL já aqui, e não na exportação: o exportElementAsPDF troca imagem que não
 * consegue ler por um retângulo cinza, sem avisar. Baixando antes, uma falha (CORS do bucket,
 * arquivo apagado, HEIC fora do Safari) aparece no visualizador com o motivo, em vez de sair um
 * PDF com um buraco no lugar do comprovante.
 */
export function usePaginasDoComprovante(
  comprovante: QuoteComprovante | undefined | null
): EstadoDoComprovante {
  const [estado, setEstado] = useState<EstadoDoComprovante>({ estado: 'ausente' });
  const url = comprovante?.url;
  const ehPdf = comprovante ? comprovanteEhPdf(comprovante) : false;

  useEffect(() => {
    if (!url) {
      setEstado({ estado: 'ausente' });
      return;
    }
    let cancelado = false;
    setEstado({ estado: 'carregando' });

    (async () => {
      try {
        const resposta = await fetch(url).catch(() => {
          throw new Error('não foi possível baixar o arquivo — confira a conexão');
        });
        if (!resposta.ok) throw new Error(`o arquivo não foi encontrado (${resposta.status})`);
        const arquivo = await resposta.blob();
        const resultado = ehPdf
          ? await paginasDoPdf(arquivo)
          : { paginas: await paginasDaImagem(arquivo), paginasOmitidas: 0 };
        if (!cancelado) setEstado({ estado: 'pronto', ...resultado });
      } catch (e) {
        if (!cancelado) setEstado({ estado: 'erro', mensagem: (e as Error).message });
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [url, ehPdf]);

  return estado;
}

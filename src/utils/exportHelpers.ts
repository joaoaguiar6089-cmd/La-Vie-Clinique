import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import { Procedure, ClinicProfile } from '../types';
import { formatBRL } from './formatters';
import { getCatalogPrice, formatDiscountPercent } from './catalogPricing';

/**
 * Safely converts an image URL into a base64 Data URL with timeout protection.
 * If CORS or network fails, returns null without throwing or blocking execution.
 */
async function safeGetImageBase64(src: string): Promise<string | null> {
  if (!src) return null;
  if (src.startsWith('data:')) return src;

  return new Promise<string | null>((resolve) => {
    const timer = setTimeout(() => {
      resolve(null);
    }, 8000);

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      clearTimeout(timer);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width || 300;
        canvas.height = img.naturalHeight || img.height || 300;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        resolve(dataUrl);
      } catch {
        resolve(null);
      }
    };

    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };

    // A mesma foto já foi baixada para aparecer na tela, e lá sem `crossOrigin` — o navegador
    // guardou aquela resposta como opaca. Reaproveitá-la aqui faria a leitura dos pixels falhar
    // mesmo com o CORS do bucket configurado, então este parâmetro força um download próprio.
    img.src = src + (src.includes('?') ? '&' : '?') + '__cors=1';
  });
}

/**
 * Renders a solid-color placeholder as a data URL, used when a source image
 * can't be fetched/converted — keeps the element free of cross-origin <img>
 * sources that would otherwise taint the export canvas.
 */
function createPlaceholderDataUrl(width: number, height: number, color = '#E8E6DE'): string {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  return canvas.toDataURL('image/png');
}

/**
 * Pre-inlines all images inside an element to prevent tainted canvas issues.
 * Any image that fails to load/convert (broken URL, CORS block, timeout) is
 * swapped for a local placeholder — leaving the original cross-origin src in
 * place is what taints the canvas and makes canvas.toDataURL() throw later.
 *
 * Isto reescreve o `src` dos elementos que estão na tela, então devolve uma função que desfaz a
 * troca. Sem ela, uma foto que não pôde ser convertida (bucket sem CORS, rede lenta) ficava como
 * um retângulo cinza na pré-visualização depois da exportação — a tela passava a mostrar um
 * problema do PDF como se fosse do catálogo.
 */
async function prepareImagesForExport(element: HTMLElement): Promise<() => void> {
  const images = Array.from(element.querySelectorAll('img'));
  const originais: { img: HTMLImageElement; src: string }[] = [];

  await Promise.all(
    images.map(async (img) => {
      if (!img.src || img.src.startsWith('data:')) return;
      const fallbackWidth = img.naturalWidth || img.width || 300;
      const fallbackHeight = img.naturalHeight || img.height || 300;
      const srcOriginal = img.src;
      try {
        const base64 = await safeGetImageBase64(img.src);
        originais.push({ img, src: srcOriginal });
        img.src = base64 || createPlaceholderDataUrl(fallbackWidth, fallbackHeight);
      } catch {
        originais.push({ img, src: srcOriginal });
        img.src = createPlaceholderDataUrl(fallbackWidth, fallbackHeight);
      }
    })
  );

  return () => {
    for (const { img, src } of originais) img.src = src;
  };
}

const CAPTURE_SCALE = 2;

/**
 * Largura em que as fichas são desenhadas para virar PDF: a folha A4 a 96dpi, a mesma métrica de
 * `documentos/estiloA4.ts`. Fixa, e não a largura da tela: no celular a ficha tem ~360px, e uma
 * folha inteira cabia só ~500px de conteúdo — letra enorme, muitas páginas e um PDF diferente
 * para cada aparelho.
 */
const LARGURA_DA_FOLHA_PX = 794;

/** Margem de baixo de toda folha e de cima a partir da 2ª. Na 1ª, o respiro é o padding da ficha. */
const MARGEM_DA_FOLHA_MM = 10;

/**
 * Até quanto espaço vazio, em px de tela, é descartado no topo de uma folha. É a sobra da margem
 * entre dois blocos (o `mb-6`, o `mt-8`) que o corte deixou para a folha seguinte.
 */
const MAX_VAZIO_NO_TOPO_PX = 48;

/** Faixa vertical, em px do canvas capturado, que um corte de página não pode atravessar. */
interface Faixa {
  top: number;
  bottom: number;
}

interface FullHeightCapture {
  canvas: HTMLCanvasElement;
  faixasInteiras: Faixa[];
}

/** Espera as imagens do documento clonado terem tamanho — sem isso a medição sai com altura zero. */
async function aguardarImagens(raiz: HTMLElement): Promise<void> {
  const imagens = Array.from(raiz.querySelectorAll('img')).filter((img) => !img.complete);
  await Promise.all(
    imagens.map(
      (img) =>
        new Promise<void>((resolve) => {
          const pronto = () => resolve();
          img.addEventListener('load', pronto, { once: true });
          img.addEventListener('error', pronto, { once: true });
          setTimeout(pronto, 5000);
        })
    )
  );
}

/**
 * O que não pode ser cortado ao meio na troca de folha, em px do canvas:
 *
 * - cada linha de texto — é o que garante que uma resposta longa, maior que uma folha, quebre
 *   entre duas linhas e não no meio delas;
 * - cada imagem, ilustração e ícone;
 * - todo bloco marcado com `page-break-inside-avoid` / `print:break-inside-avoid` (as mesmas
 *   classes que seguram o bloco na impressão do navegador);
 * - cada título junto com a primeira linha do que vem embaixo dele, para não sobrar título
 *   sozinho no pé da folha.
 */
function medirFaixasInteiras(raiz: HTMLElement): Faixa[] {
  const topoDaRaiz = raiz.getBoundingClientRect().top;
  const emPixels = (r: DOMRect): Faixa => ({
    top: (r.top - topoDaRaiz) * CAPTURE_SCALE,
    bottom: (r.bottom - topoDaRaiz) * CAPTURE_SCALE,
  });
  const doc = raiz.ownerDocument;

  const conteudo: Faixa[] = [];
  const percurso = doc.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  const trecho = doc.createRange();
  for (let no = percurso.nextNode(); no; no = percurso.nextNode()) {
    if (!no.textContent?.trim()) continue;
    trecho.selectNodeContents(no);
    for (const linha of Array.from(trecho.getClientRects())) {
      if (linha.height > 0) conteudo.push(emPixels(linha));
    }
  }
  raiz.querySelectorAll('img, svg, canvas, video').forEach((midia) => {
    const r = midia.getBoundingClientRect();
    if (r.height > 0) conteudo.push(emPixels(r));
  });
  conteudo.sort((a, b) => a.top - b.top);

  const blocos = Array.from(raiz.querySelectorAll('[class*="break-inside-avoid"]'), (bloco) =>
    emPixels(bloco.getBoundingClientRect())
  );

  // Do topo do título até o fim da primeira linha abaixo dele — o filete que enfeita o título fica
  // no meio, protegido junto. Quando o que vem embaixo é mais alto que uma folha (uma imagem
  // grande), essa faixa é descartada no corte; a segunda, até o começo dele, ainda impede que o
  // título fique sozinho no pé da folha.
  const titulos: Faixa[] = [];
  raiz.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((titulo) => {
    const faixa = emPixels(titulo.getBoundingClientRect());
    const primeiraLinhaAbaixo = conteudo.find((c) => c.top >= faixa.bottom - 1);
    if (!primeiraLinhaAbaixo) return;
    titulos.push({ top: faixa.top, bottom: primeiraLinhaAbaixo.bottom });
    titulos.push({ top: faixa.top, bottom: primeiraLinhaAbaixo.top + 1 });
  });

  return [...conteudo, ...blocos, ...titulos];
}

/**
 * Onde terminar a folha que começa em `inicio`, sem passar de `limite`: sobe o corte para antes de
 * toda faixa que ele atravessaria. Repete porque, ao subir, o corte pode cair dentro de outra faixa
 * (um cartão dentro de uma seção, o título acima do cartão).
 *
 * Faixa mais alta que uma folha inteira fica de fora: empurrá-la só deixaria a folha em branco, e
 * ela seria cortada do mesmo jeito na seguinte. Quem a protege são as faixas de dentro dela — no
 * mínimo, as linhas de texto.
 */
function escolherCorte(inicio: number, limite: number, faixas: Faixa[], alturaDaFolha: number): number {
  let corte = limite;
  let subiu = true;
  while (subiu) {
    subiu = false;
    for (const f of faixas) {
      // `inicio + 1`: o que começa colado no topo da folha (fração de pixel abaixo) já está no
      // melhor lugar possível — empurrá-lo deixaria a folha vazia.
      if (f.top > inicio + 1 && f.top < corte && f.bottom > corte && f.bottom - f.top <= alturaDaFolha) {
        corte = f.top;
        subiu = true;
      }
    }
  }
  const inteiro = Math.floor(corte);
  return inteiro > inicio ? inteiro : Math.floor(limite);
}

/**
 * Renders a full, unclipped snapshot of `element` via html2canvas, with the bands a page break
 * must not cross (see `medirFaixasInteiras`).
 *
 * html2canvas paints an element as CSS would lay it out given its ancestors, so an element
 * that's scrollable (`overflow-y-auto`) inside a viewport-height-capped, `position: fixed`
 * modal — exactly how every printable sheet in this app is structured — gets rasterized only
 * down to whatever fit in that clipped box, not its full scrollHeight. Cloning the element into
 * an off-screen container with no scroll/height constraints sidesteps that entirely: the clone
 * inherits the same global stylesheet (so Tailwind classes render identically) but has nothing
 * left to clip it.
 *
 * As faixas são medidas no `onclone`, dentro do documento que o html2canvas de fato desenha, e
 * depois de as imagens carregarem. Medidas fora dele, saíam de outro layout: a imagem orientativa
 * ainda sem altura deslocava todos os cortes abaixo dela, e o PDF ganhava folha em branco e foto
 * partida ao meio. E é lá que vale a largura da folha também para os `sm:` do Tailwind, que olham
 * a janela e não o elemento.
 */
async function captureElementFullHeight(element: HTMLElement): Promise<FullHeightCapture> {
  const clone = element.cloneNode(true) as HTMLElement;
  // Botões e avisos de tela ("Anotar", "Registro histórico") não fazem parte do documento.
  clone.querySelectorAll('[class*="print:hidden"], .no-export').forEach((node) => node.remove());
  clone.style.overflow = 'visible';
  clone.style.maxHeight = 'none';
  clone.style.height = 'auto';
  clone.style.width = `${LARGURA_DA_FOLHA_PX}px`;

  const wrapper = document.createElement('div');
  wrapper.style.position = 'fixed';
  wrapper.style.top = '0';
  wrapper.style.left = '-99999px';
  wrapper.style.width = `${LARGURA_DA_FOLHA_PX}px`;
  wrapper.style.zIndex = '-1';
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);

  try {
    let faixasInteiras: Faixa[] = [];
    const canvas = await html2canvas(clone, {
      scale: CAPTURE_SCALE,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#F8F7F4',
      logging: false,
      windowWidth: LARGURA_DA_FOLHA_PX,
      onclone: async (_documento, alvo) => {
        await aguardarImagens(alvo);
        faixasInteiras = medirFaixasInteiras(alvo);
      },
    });
    return { canvas, faixasInteiras };
  } finally {
    document.body.removeChild(wrapper);
  }
}

/**
 * Robust export to high-resolution PNG image (matches screen preview exactly).
 */
export async function exportElementAsImage(
  element: HTMLElement,
  filename: string = 'Catalogo La Vie.png'
): Promise<string> {
  try {
    if (document.fonts) {
      await document.fonts.ready;
    }
    const restaurarImagens = await prepareImagesForExport(element);

    try {
      const targetElement = element.querySelector<HTMLElement>('[data-pdf-page="1"]') || element;

      const canvas = await html2canvas(targetElement, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#F8F7F4',
        logging: false,
        scrollX: 0,
        scrollY: 0,
        windowWidth: 1200,
        ignoreElements: (node) => {
          if (node instanceof HTMLElement && node.classList?.contains('no-export')) {
            return true;
          }
          return false;
        },
      });

      const dataUrl = canvas.toDataURL('image/png');

      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return dataUrl;
    } finally {
      restaurarImagens();
    }
  } catch (error) {
    console.error('Error generating image:', error);
    throw error;
  }
}

/**
 * Export multi-page A4 PDF using html2canvas-pro (with full support for Tailwind CSS modern oklab/oklch colors).
 * Includes interactive clickable Sumário links and discrete page boundaries without splitting cards.
 */
export async function exportElementAsPDF(
  element: HTMLElement,
  filename: string = 'Catalogo La Vie.pdf'
): Promise<void> {
  try {
    const pdf = await montarPdf(element);

    // Direct Blob download trigger for maximum browser compatibility
    try {
      baixarArquivo(pdf.output('blob'), filename);
    } catch {
      // Secondary fallback
      pdf.save(filename);
    }
  } catch (error) {
    console.error('Error generating interactive PDF with html2canvas-pro:', error);
    throw error;
  }
}

/**
 * O mesmo PDF do `exportElementAsPDF`, devolvido como arquivo em vez de baixado — para entregar
 * ao compartilhamento do celular (`navigator.share`), que manda o PDF direto para o WhatsApp.
 */
export async function gerarPdfDoElemento(element: HTMLElement): Promise<Blob> {
  const pdf = await montarPdf(element);
  return pdf.output('blob');
}

/** Dispara o download de um arquivo já gerado. */
export function baixarArquivo(blob: Blob, filename: string): void {
  const blobUrl = URL.createObjectURL(blob);
  const downloadLink = document.createElement('a');
  downloadLink.href = blobUrl;
  downloadLink.download = filename;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
}

async function montarPdf(element: HTMLElement): Promise<jsPDF> {
  // 1. Ensure fonts are fully ready
  if (document.fonts) {
    await document.fonts.ready;
  }

  // 2. Pre-process images into data URLs
  const restaurarImagens = await prepareImagesForExport(element);

  try {
    // 3. Query discrete page containers
    const pageElements = Array.from(element.querySelectorAll<HTMLElement>('[data-pdf-page]'));

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    const pdfWidth = pdf.internal.pageSize.getWidth(); // 210 mm
    const pdfHeight = pdf.internal.pageSize.getHeight(); // 297 mm

    if (pageElements.length > 0) {
      for (let i = 0; i < pageElements.length; i++) {
        const pageEl = pageElements[i];

        if (i > 0) {
          pdf.addPage();
        }

        // Render current discrete page
        const canvas = await html2canvas(pageEl, {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#F8F7F4',
          logging: false,
          scrollX: 0,
          scrollY: 0,
          windowWidth: 1200,
        });

        const pageImgData = canvas.toDataURL('image/jpeg', 0.95);

        // Add exact full-bleed page to A4 PDF
        pdf.addImage(pageImgData, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');

        // Add Interactive PDF Clickable Links (Table of Contents & Navigation)
        const pageRect = pageEl.getBoundingClientRect();
        const linkNodes = Array.from(pageEl.querySelectorAll<HTMLElement>('[data-link-page]'));

        linkNodes.forEach((linkNode) => {
          const linkRect = linkNode.getBoundingClientRect();
          const targetPageNum = parseInt(linkNode.getAttribute('data-link-page') || '1', 10);

          if (targetPageNum && pageRect.width > 0 && pageRect.height > 0) {
            const relX = ((linkRect.left - pageRect.left) / pageRect.width) * pdfWidth;
            const relY = ((linkRect.top - pageRect.top) / pageRect.height) * pdfHeight;
            const relW = (linkRect.width / pageRect.width) * pdfWidth;
            const relH = (linkRect.height / pageRect.height) * pdfHeight;

            try {
              pdf.link(relX, relY, relW, relH, { pageNumber: targetPageNum });
            } catch (linkErr) {
              console.warn('Could not register pdf link annotation:', linkErr);
            }
          }
        });

        // Add Interactive External URL Clickable Links (WhatsApp, Web, etc.)
        const urlNodes = Array.from(pageEl.querySelectorAll<HTMLElement>('[data-link-url]'));

        urlNodes.forEach((urlNode) => {
          const linkRect = urlNode.getBoundingClientRect();
          const targetUrl = urlNode.getAttribute('data-link-url');

          if (targetUrl && pageRect.width > 0 && pageRect.height > 0) {
            const relX = ((linkRect.left - pageRect.left) / pageRect.width) * pdfWidth;
            const relY = ((linkRect.top - pageRect.top) / pageRect.height) * pdfHeight;
            const relW = (linkRect.width / pageRect.width) * pdfWidth;
            const relH = (linkRect.height / pageRect.height) * pdfHeight;

            try {
              pdf.link(relX, relY, relW, relH, { url: targetUrl });
            } catch (linkErr) {
              console.warn('Could not register pdf url link annotation:', linkErr);
            }
          }
        });
      }
    } else {
      // Fallback for single container elements without [data-pdf-page] — these are typically
      // scrollable content living inside a fixed-position modal, so capture via an off-screen
      // clone rather than html2canvas(element) directly (see captureElementFullHeight).
      const { canvas, faixasInteiras } = await captureElementFullHeight(element);
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      // Canvas pixels per output mm — derived from width, since the whole image (and every page
      // slice cut from it) is scaled to exactly pdfWidth wide, preserving aspect ratio.
      const pxPerMm = imgWidth / pdfWidth;
      const margemPx = MARGEM_DA_FOLHA_MM * pxPerMm;
      const folhaPx = pdfHeight * pxPerMm;
      // Da 2ª folha em diante, que é para onde vai um bloco empurrado.
      const alturaUtilPx = folhaPx - 2 * margemPx;
      // O padding de baixo da ficha não ganha folha própria.
      const fimDoConteudo = faixasInteiras.reduce((fim, f) => Math.max(fim, f.bottom), 0) || imgHeight;

      let sliceTop = 0;
      let pagina = 0;
      while (sliceTop < Math.min(fimDoConteudo, imgHeight)) {
        const margemDeCimaPx = pagina === 0 ? 0 : margemPx;

        if (pagina > 0) {
          const proximoConteudo = faixasInteiras.reduce(
            (topo, f) => (f.top >= sliceTop && f.top < topo ? f.top : topo),
            Infinity
          );
          if (proximoConteudo - sliceTop <= MAX_VAZIO_NO_TOPO_PX * CAPTURE_SCALE) {
            sliceTop = Math.floor(proximoConteudo);
          }
        }

        const limite = sliceTop + folhaPx - margemDeCimaPx - margemPx;
        const sliceBottom =
          limite >= imgHeight ? imgHeight : escolherCorte(sliceTop, limite, faixasInteiras, alturaUtilPx);

        const sliceHeightPx = sliceBottom - sliceTop;
        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = imgWidth;
        sliceCanvas.height = sliceHeightPx;
        sliceCanvas
          .getContext('2d')!
          .drawImage(canvas, 0, sliceTop, imgWidth, sliceHeightPx, 0, 0, imgWidth, sliceHeightPx);

        if (pagina > 0) pdf.addPage();
        pdf.addImage(
          sliceCanvas.toDataURL('image/jpeg', 0.95),
          'JPEG',
          0,
          margemDeCimaPx / pxPerMm,
          pdfWidth,
          sliceHeightPx / pxPerMm,
          undefined,
          'FAST'
        );

        pagina++;
        sliceTop = sliceBottom;
      }
    }

    return pdf;
  } finally {
    restaurarImagens();
  }
}

export function buildWhatsAppCatalogShareUrl(
  procedures: Procedure[],
  clinic: ClinicProfile,
  /** Desconto promocional aplicado a todos os procedimentos, em % (dias especiais). */
  discountPercent: number = 0
): string {
  let message = `✨ *${clinic.name.toUpperCase()}* ✨\n`;
  message += `_${clinic.tagline}_\n`;
  message += `👤 *${clinic.professionalName}* (${clinic.professionalTitle})\n\n`;
  if (discountPercent > 0) {
    message += `🎁 *PROMOÇÃO ESPECIAL: ${formatDiscountPercent(discountPercent)}% DE DESCONTO EM TODOS OS PROCEDIMENTOS!*\n`;
    message += `_Os valores abaixo já estão com o desconto aplicado._\n\n`;
  }

  message += `📋 *CATÁLOGO DE PROCEDIMENTOS EXCLUSIVOS:*\n\n`;

  procedures.forEach((p, idx) => {
    const prefix = p.isStartingPrice ? 'a partir de ' : '';
    const { strikePrice, finalPrice } = getCatalogPrice(p, discountPercent);
    const priceText = strikePrice !== null
      ? `${prefix}~${formatBRL(strikePrice)}~ por *${formatBRL(finalPrice)}*`
      : `${prefix}*${formatBRL(finalPrice)}*`;
    
    message += `${idx + 1}. *${p.title.toUpperCase()}*\n`;
    if (p.subtitle) message += `   _${p.subtitle}_\n`;
    message += `   💰 Investimento: ${priceText} ${p.priceNote ? `(${p.priceNote})` : ''}\n`;
    if (p.duration) message += `   ⏱️ Duração: ${p.duration}\n`;
    if (p.benefits && p.benefits.length > 0) {
      message += `   ✦ Benefícios: ${p.benefits.slice(0, 2).join(' • ')}\n`;
    }
    message += `\n`;
  });

  message += `📍 *Local de Atendimento:* ${clinic.address} - ${clinic.cityState}\n`;
  message += `📱 *Agendamentos:* ${clinic.phone}\n`;
  message += `📸 *Instagram:* ${clinic.instagram}\n\n`;
  message += `_Valores sujeitos a avaliação personalizada._`;

  const cleanPhone = clinic.phone.replace(/\D/g, '');
  const encodedText = encodeURIComponent(message);
  
  if (cleanPhone.length >= 10) {
    return `https://wa.me/55${cleanPhone}?text=${encodedText}`;
  }
  return `https://api.whatsapp.com/send?text=${encodedText}`;
}

export function buildSingleProcedureWhatsAppUrl(
  procedure: Procedure,
  clinic: ClinicProfile,
  /** Desconto promocional aplicado a todos os procedimentos, em % (dias especiais). */
  discountPercent: number = 0,
  /** Falso quando o card saiu sem valores: a mensagem pronta também não cita o preço. */
  showPrice: boolean = true
): string {
  const prefix = procedure.isStartingPrice ? 'a partir de ' : '';
  const { strikePrice, finalPrice } = getCatalogPrice(procedure, discountPercent);
  const priceText = strikePrice !== null
    ? `${prefix}~${formatBRL(strikePrice)}~ por *${formatBRL(finalPrice)}*`
    : `${prefix}*${formatBRL(finalPrice)}*`;

  let message = `Olá! Gostaria de agendar ou tirar dúvidas sobre o procedimento:\n\n`;
  message += `✨ *${procedure.title.toUpperCase()}*\n`;
  if (procedure.subtitle) message += `_${procedure.subtitle}_\n\n`;
  if (showPrice) {
    message += `💰 Investimento: ${priceText} ${procedure.priceNote ? `(${procedure.priceNote})` : ''}\n`;
  }
  if (procedure.duration) message += `⏱️ Duração: ${procedure.duration}\n`;
  if (procedure.recoveryTime) message += `🌿 Recuperação: ${procedure.recoveryTime}\n\n`;
  message += `Poderia me informar as datas e horários disponíveis na *${clinic.name}*?`;

  const cleanPhone = clinic.phone.replace(/\D/g, '');
  const encodedText = encodeURIComponent(message);

  if (cleanPhone.length >= 10) {
    return `https://wa.me/55${cleanPhone}?text=${encodedText}`;
  }
  return `https://api.whatsapp.com/send?text=${encodedText}`;
}

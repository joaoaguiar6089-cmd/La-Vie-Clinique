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
    }, 2500);

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

    img.src = src;
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
 */
async function prepareImagesForExport(element: HTMLElement): Promise<void> {
  const images = Array.from(element.querySelectorAll('img'));
  await Promise.all(
    images.map(async (img) => {
      if (!img.src || img.src.startsWith('data:')) return;
      const fallbackWidth = img.naturalWidth || img.width || 300;
      const fallbackHeight = img.naturalHeight || img.height || 300;
      try {
        const base64 = await safeGetImageBase64(img.src);
        img.src = base64 || createPlaceholderDataUrl(fallbackWidth, fallbackHeight);
      } catch {
        img.src = createPlaceholderDataUrl(fallbackWidth, fallbackHeight);
      }
    })
  );
}

const CAPTURE_SCALE = 2;

interface FullHeightCapture {
  canvas: HTMLCanvasElement;
  /** Y-ranges, in captured-canvas pixels, that a page break must not fall inside. */
  avoidBreakRanges: { top: number; bottom: number }[];
}

/**
 * Renders a full, unclipped snapshot of `element` via html2canvas, along with the pixel ranges
 * of any descendant marked `.page-break-inside-avoid` / `print:break-inside-avoid` (both classes
 * already used throughout this app's printable sheets to keep a card or signature block from
 * being split across a page in the browser's native print dialog).
 *
 * html2canvas paints an element as CSS would lay it out given its ancestors, so an element
 * that's scrollable (`overflow-y-auto`) inside a viewport-height-capped, `position: fixed`
 * modal — exactly how every printable sheet in this app is structured — gets rasterized only
 * down to whatever fit in that clipped box, not its full scrollHeight. Cloning the element into
 * an off-screen container with no scroll/height constraints sidesteps that entirely: the clone
 * inherits the same global stylesheet (so Tailwind classes render identically) but has nothing
 * left to clip it.
 */
async function captureElementFullHeight(element: HTMLElement): Promise<FullHeightCapture> {
  const widthPx = element.clientWidth || 1200;
  const clone = element.cloneNode(true) as HTMLElement;
  clone.style.overflow = 'visible';
  clone.style.maxHeight = 'none';
  clone.style.height = 'auto';
  clone.style.width = `${widthPx}px`;

  const wrapper = document.createElement('div');
  wrapper.style.position = 'fixed';
  wrapper.style.top = '0';
  wrapper.style.left = '-99999px';
  wrapper.style.width = `${widthPx}px`;
  wrapper.style.zIndex = '-1';
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);

  try {
    const cloneTop = clone.getBoundingClientRect().top;
    const avoidBreakRanges = Array.from(clone.querySelectorAll<HTMLElement>('[class*="break-inside-avoid"]'))
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          top: (rect.top - cloneTop) * CAPTURE_SCALE,
          bottom: (rect.bottom - cloneTop) * CAPTURE_SCALE,
        };
      })
      .sort((a, b) => a.top - b.top);

    const canvas = await html2canvas(clone, {
      scale: CAPTURE_SCALE,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#F8F7F4',
      logging: false,
      windowWidth: widthPx,
    });
    return { canvas, avoidBreakRanges };
  } finally {
    document.body.removeChild(wrapper);
  }
}

/**
 * Robust export to high-resolution PNG image (matches screen preview exactly).
 */
export async function exportElementAsImage(
  element: HTMLElement,
  filename: string = 'catalogo-estetica.png'
): Promise<string> {
  try {
    if (document.fonts) {
      await document.fonts.ready;
    }
    await prepareImagesForExport(element);

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
  filename: string = 'catalogo-estetica.pdf'
): Promise<void> {
  try {
    // 1. Ensure fonts are fully ready
    if (document.fonts) {
      await document.fonts.ready;
    }

    // 2. Pre-process images into data URLs
    await prepareImagesForExport(element);

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
      }
    } else {
      // Fallback for single container elements without [data-pdf-page] — these are typically
      // scrollable content living inside a fixed-position modal, so capture via an off-screen
      // clone rather than html2canvas(element) directly (see captureElementFullHeight).
      const { canvas, avoidBreakRanges } = await captureElementFullHeight(element);
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      // Canvas pixels per output mm — derived from width, since the whole image (and every page
      // slice cut from it) is scaled to exactly pdfWidth wide, preserving aspect ratio.
      const pxPerMm = imgWidth / pdfWidth;
      const pageHeightPx = pdfHeight * pxPerMm;

      let sliceTop = 0;
      let isFirstPage = true;
      while (sliceTop < imgHeight) {
        let sliceBottom = Math.min(imgHeight, sliceTop + pageHeightPx);

        // If this natural page break would land inside a card/section marked to stay whole
        // (page-break-inside-avoid / print:break-inside-avoid), end the page right before it
        // instead — the element starts fresh on the next page rather than being split. Falls
        // through to the natural cut if the element alone is taller than a full page.
        const conflict = avoidBreakRanges.find(
          (r) => r.top > sliceTop && r.top < sliceBottom && r.bottom > sliceBottom
        );
        if (conflict && conflict.top > sliceTop) {
          sliceBottom = conflict.top;
        }

        const sliceHeightPx = sliceBottom - sliceTop;
        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = imgWidth;
        sliceCanvas.height = sliceHeightPx;
        sliceCanvas
          .getContext('2d')!
          .drawImage(canvas, 0, sliceTop, imgWidth, sliceHeightPx, 0, 0, imgWidth, sliceHeightPx);

        if (!isFirstPage) pdf.addPage();
        pdf.addImage(sliceCanvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, pdfWidth, sliceHeightPx / pxPerMm, undefined, 'FAST');

        isFirstPage = false;
        sliceTop = sliceBottom;
      }
    }

    // Direct Blob download trigger for maximum browser compatibility
    try {
      const blob = pdf.output('blob');
      const blobUrl = URL.createObjectURL(blob);
      const downloadLink = document.createElement('a');
      downloadLink.href = blobUrl;
      downloadLink.download = filename;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    } catch {
      // Secondary fallback
      pdf.save(filename);
    }
  } catch (error) {
    console.error('Error generating interactive PDF with html2canvas-pro:', error);
    throw error;
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
  discountPercent: number = 0
): string {
  const prefix = procedure.isStartingPrice ? 'a partir de ' : '';
  const { strikePrice, finalPrice } = getCatalogPrice(procedure, discountPercent);
  const priceText = strikePrice !== null
    ? `${prefix}~${formatBRL(strikePrice)}~ por *${formatBRL(finalPrice)}*`
    : `${prefix}*${formatBRL(finalPrice)}*`;

  let message = `Olá! Gostaria de agendar ou tirar dúvidas sobre o procedimento:\n\n`;
  message += `✨ *${procedure.title.toUpperCase()}*\n`;
  if (procedure.subtitle) message += `_${procedure.subtitle}_\n\n`;
  message += `💰 Investimento: ${priceText} ${procedure.priceNote ? `(${procedure.priceNote})` : ''}\n`;
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

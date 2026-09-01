import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import { Procedure, ClinicProfile } from '../types';
import { formatBRL } from './formatters';

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
 * Pre-inlines all images inside an element to prevent tainted canvas issues.
 */
async function prepareImagesForExport(element: HTMLElement): Promise<void> {
  const images = Array.from(element.querySelectorAll('img'));
  await Promise.all(
    images.map(async (img) => {
      if (!img.src || img.src.startsWith('data:')) return;
      try {
        const base64 = await safeGetImageBase64(img.src);
        if (base64) {
          img.src = base64;
        }
      } catch {
        // Proceed without breaking
      }
    })
  );
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
      // Fallback for single container elements without [data-pdf-page]
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#F8F7F4',
        logging: false,
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = imgWidth / imgHeight;
      const renderedPdfHeight = pdfWidth / ratio;

      let heightLeft = renderedPdfHeight;
      let position = 0;

      pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, renderedPdfHeight, undefined, 'FAST');
      heightLeft -= pdfHeight;

      while (heightLeft > 0) {
        position = heightLeft - renderedPdfHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, renderedPdfHeight, undefined, 'FAST');
        heightLeft -= pdfHeight;
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
  clinic: ClinicProfile
): string {
  let message = `✨ *${clinic.name.toUpperCase()}* ✨\n`;
  message += `_${clinic.tagline}_\n`;
  message += `👤 *${clinic.professionalName}* (${clinic.professionalTitle})\n\n`;
  message += `📋 *CATÁLOGO DE PROCEDIMENTOS EXCLUSIVOS:*\n\n`;

  procedures.forEach((p, idx) => {
    const priceText = p.promotionalPrice 
      ? `~${formatBRL(p.price)}~ por *${formatBRL(p.promotionalPrice)}*`
      : `*${formatBRL(p.price)}*`;
    
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
  clinic: ClinicProfile
): string {
  const priceText = procedure.promotionalPrice 
    ? `~${formatBRL(procedure.price)}~ por *${formatBRL(procedure.promotionalPrice)}*`
    : `*${formatBRL(procedure.price)}*`;

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

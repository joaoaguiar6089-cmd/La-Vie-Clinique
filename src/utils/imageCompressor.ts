/**
 * Utility to downscale images client-side before persisting to Firestore.
 * Keeps documents well within Firestore's 1MB limit while preserving crisp resolution.
 */
export function downscaleImage(file: File, maxDim = 1200, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(event.target?.result as string);
          return;
        }

        // Smooth downsampling
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedBase64);
      };
      img.onerror = () => reject(new Error('Falha ao processar arquivo de imagem.'));
    };
    reader.onerror = () => reject(new Error('Falha ao ler arquivo.'));
  });
}

/**
 * Firestore rejects any document over 1MB (measured on the serialized document, not the JSON
 * string), and base64 photos stored inline are by far the biggest thing we write. Estimating the
 * size *before* the write lets the UI say "essa foto é grande demais" instead of letting the
 * write fail in the background — which looks like the change saved (the optimistic UI already
 * showed it) until the snapshot listener re-syncs and the old value comes back.
 */
export function estimateFirestoreDocBytes(obj: unknown): number {
  try {
    // UTF-8 byte length, not string length: base64 is ASCII so the two match, but accented
    // Portuguese text in descriptions is 2 bytes per character.
    return new TextEncoder().encode(JSON.stringify(obj)).length;
  } catch {
    return 0;
  }
}

/** Limite prático abaixo do teto de 1MB do Firestore, com folga para metadados do documento. */
export const FIRESTORE_DOC_SAFE_BYTES = 900 * 1024;

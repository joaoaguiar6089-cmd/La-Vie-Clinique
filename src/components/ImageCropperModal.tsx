import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, RotateCw, ZoomIn, ZoomOut, Check, Loader2, AlertCircle, Move, Maximize2 } from 'lucide-react';

export interface AspectOption {
  id: string;
  label: string;
  /** largura / altura do frame. `null` mantém a proporção original da foto. */
  ratio: number | null;
}

interface ImageCropperModalProps {
  isOpen: boolean;
  /** Arquivo recém-escolhido no input OU a foto já salva (dataURL / link) para reajustar. */
  source: File | string | null;
  title?: string;
  /** Frase curta explicando onde a foto vai aparecer. */
  description?: string;
  /** Proporções oferecidas. A primeira é a inicial; com apenas uma, os botões somem. */
  aspectOptions?: AspectOption[];
  /** Desenha o círculo do avatar por cima do frame (a foto também aparece redonda em algum lugar). */
  circleGuide?: boolean;
  /** Maior lado do JPEG gerado — segura o tamanho do documento no Firestore. */
  maxOutputDim?: number;
  quality?: number;
  confirmLabel?: string;
  /** Ex.: "Foto 2 de 5" quando o usuário selecionou várias de uma vez. */
  progressLabel?: string;
  onCancel: () => void;
  onConfirm: (dataUrl: string) => void;
}

/**
 * Fotos de celular chegam com 3000–4000px. Redesenhar isso a cada frame de arraste engasga em
 * aparelho modesto, e o recorte final nunca passa de ~1400px — então a foto é reduzida uma vez,
 * na abertura, e todo o resto (preview e exportação) trabalha em cima da versão reduzida.
 */
const MAX_WORK_DIM = 2000;
const MAX_ZOOM = 6;

const DEFAULT_ASPECTS: AspectOption[] = [{ id: 'square', label: 'Quadrado', ratio: 1 }];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Falha ao ler arquivo.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string, crossOrigin?: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = crossOrigin;
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Falha ao carregar imagem.'));
    img.src = src;
  });
}

interface WorkSource {
  el: HTMLImageElement | HTMLCanvasElement;
  /** O que o <img> do preview mostra (o CSS faz zoom/arraste, não o canvas). */
  url: string;
  w: number;
  h: number;
}

function prepareWorkSource(img: HTMLImageElement): WorkSource {
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  const biggest = Math.max(width, height);
  if (biggest <= MAX_WORK_DIM) {
    return { el: img, url: img.src, w: width, h: height };
  }

  const scale = MAX_WORK_DIM / biggest;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return { el: img, url: img.src, w: width, h: height };
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { el: canvas, url: canvas.toDataURL('image/jpeg', 0.92), w: canvas.width, h: canvas.height };
}

export const ImageCropperModal: React.FC<ImageCropperModalProps> = ({
  isOpen,
  source,
  title = 'Ajustar foto',
  description,
  aspectOptions,
  circleGuide = false,
  maxOutputDim = 1400,
  quality = 0.85,
  confirmLabel = 'Aplicar recorte',
  progressLabel,
  onCancel,
  onConfirm,
}) => {
  const options = useMemo(
    () => (aspectOptions && aspectOptions.length > 0 ? aspectOptions : DEFAULT_ASPECTS),
    [aspectOptions]
  );

  const [work, setWork] = useState<WorkSource | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  /** Link externo que não libera CORS: dá para ver, não dá para recortar (o canvas fica "sujo"). */
  const [isTainted, setIsTainted] = useState(false);
  const [aspectId, setAspectId] = useState(options[0].id);
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });

  const frameRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ dist: number; mid: { x: number; y: number } } | null>(null);

  const [wrapWidth, setWrapWidth] = useState(340);
  const [maxFrameHeight, setMaxFrameHeight] = useState(380);

  // ---- carregamento da imagem ----
  useEffect(() => {
    if (!isOpen || !source) {
      setWork(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setErrorMessage('');
    setIsTainted(false);
    setWork(null);
    setView({ zoom: 1, x: 0, y: 0 });
    setAspectId(options[0].id);

    (async () => {
      try {
        let img: HTMLImageElement;
        let tainted = false;

        if (typeof source === 'string') {
          if (/^https?:/i.test(source)) {
            // Sem CORS o canvas não deixa exportar; tentamos primeiro o modo que permite recortar.
            try {
              img = await loadImage(source, 'anonymous');
            } catch {
              img = await loadImage(source);
              tainted = true;
            }
          } else {
            img = await loadImage(source);
          }
        } else {
          img = await loadImage(await readFileAsDataUrl(source));
        }

        if (cancelled) return;
        setIsTainted(tainted);
        setWork(
          tainted
            ? { el: img, url: img.src, w: img.naturalWidth || img.width, h: img.naturalHeight || img.height }
            : prepareWorkSource(img)
        );
      } catch {
        if (!cancelled) setErrorMessage('Não foi possível abrir esta imagem. Tente outro arquivo.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // `options` é recriado a cada render do pai; por isso entra só via options[0], na abertura.
  }, [isOpen, source]);

  // ---- medidas do frame ----
  useEffect(() => {
    if (!isOpen) return;
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWrapWidth(el.clientWidth || 340);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const update = () => setMaxFrameHeight(Math.min(400, Math.max(220, window.innerHeight * 0.42)));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onCancel]);

  const activeAspect = options.find((o) => o.id === aspectId) ?? options[0];
  const aspect = activeAspect.ratio ?? (work ? work.w / work.h : 1);

  const frame = useMemo(() => {
    const availableWidth = Math.max(200, wrapWidth);
    let w = availableWidth;
    let h = w / aspect;
    if (h > maxFrameHeight) {
      h = maxFrameHeight;
      w = h * aspect;
    }
    return { w: Math.round(w), h: Math.round(h) };
  }, [wrapWidth, maxFrameHeight, aspect]);

  /** Escala que faz a foto cobrir o frame inteiro no zoom 1 (mesma regra do object-cover). */
  const baseScale = work ? Math.max(frame.w / work.w, frame.h / work.h) : 1;

  const clampOffset = useCallback(
    (x: number, y: number, scale: number) => {
      if (!work) return { x: 0, y: 0 };
      const limitX = Math.max(0, (work.w * scale - frame.w) / 2);
      const limitY = Math.max(0, (work.h * scale - frame.h) / 2);
      return { x: clamp(x, -limitX, limitX), y: clamp(y, -limitY, limitY) };
    },
    [work, frame.w, frame.h]
  );

  // Reenquadra ao trocar de proporção ou girar: o offset antigo pode cair fora dos limites novos.
  useEffect(() => {
    setView((prev) => {
      const next = clampOffset(prev.x, prev.y, baseScale * prev.zoom);
      return next.x === prev.x && next.y === prev.y ? prev : { ...prev, ...next };
    });
  }, [clampOffset, baseScale]);

  const zoomTo = useCallback(
    (nextZoomRaw: number, focus?: { x: number; y: number }) => {
      setView((prev) => {
        const nextZoom = clamp(nextZoomRaw, 1, MAX_ZOOM);
        if (nextZoom === prev.zoom) return prev;
        const ratio = nextZoom / prev.zoom;
        const fx = focus?.x ?? 0;
        const fy = focus?.y ?? 0;
        // Mantém sob o cursor (ou no centro) o mesmo ponto da foto depois do zoom.
        const x = fx - (fx - prev.x) * ratio;
        const y = fy - (fy - prev.y) * ratio;
        return { zoom: nextZoom, ...clampOffset(x, y, baseScale * nextZoom) };
      });
    },
    [clampOffset, baseScale]
  );

  const panBy = useCallback(
    (dx: number, dy: number) => {
      setView((prev) => ({ ...prev, ...clampOffset(prev.x + dx, prev.y + dy, baseScale * prev.zoom) }));
    },
    [clampOffset, baseScale]
  );

  // Wheel precisa de listener não-passivo para poder cancelar a rolagem da página.
  useEffect(() => {
    const el = frameRef.current;
    if (!el || !work) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const focus = {
        x: e.clientX - (rect.left + rect.width / 2),
        y: e.clientY - (rect.top + rect.height / 2),
      };
      setView((prev) => {
        const nextZoom = clamp(prev.zoom * Math.exp(-e.deltaY * 0.0018), 1, MAX_ZOOM);
        const ratio = nextZoom / prev.zoom;
        const x = focus.x - (focus.x - prev.x) * ratio;
        const y = focus.y - (focus.y - prev.y) * ratio;
        return { zoom: nextZoom, ...clampOffset(x, y, baseScale * nextZoom) };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [work, clampOffset, baseScale]);

  const readPinch = () => {
    const points: { x: number; y: number }[] = [];
    pointers.current.forEach((point) => points.push(point));
    const [a, b] = points;
    return {
      dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!work) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) pinchRef.current = readPinch();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const previous = pointers.current.get(e.pointerId);
    if (!previous || !work) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 1) {
      panBy(e.clientX - previous.x, e.clientY - previous.y);
      return;
    }

    if (pointers.current.size === 2 && pinchRef.current) {
      const next = readPinch();
      const rect = e.currentTarget.getBoundingClientRect();
      const focus = {
        x: next.mid.x - (rect.left + rect.width / 2),
        y: next.mid.y - (rect.top + rect.height / 2),
      };
      const ratio = next.dist / pinchRef.current.dist;
      const midDx = next.mid.x - pinchRef.current.mid.x;
      const midDy = next.mid.y - pinchRef.current.mid.y;
      setView((prev) => {
        const nextZoom = clamp(prev.zoom * ratio, 1, MAX_ZOOM);
        const zoomRatio = nextZoom / prev.zoom;
        const x = focus.x - (focus.x - prev.x) * zoomRatio + midDx;
        const y = focus.y - (focus.y - prev.y) * zoomRatio + midDy;
        return { zoom: nextZoom, ...clampOffset(x, y, baseScale * nextZoom) };
      });
      pinchRef.current = next;
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchRef.current = null;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 24 : 8;
    if (e.key === 'ArrowLeft') { e.preventDefault(); panBy(step, 0); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); panBy(-step, 0); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); panBy(0, step); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); panBy(0, -step); }
    else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomTo(view.zoom * 1.15); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomTo(view.zoom / 1.15); }
  };

  const handleRotate = () => {
    if (!work) return;
    if (isTainted) {
      setErrorMessage('Esta imagem vem de um link externo que não permite edição. Baixe a foto e envie o arquivo.');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = work.h;
    canvas.height = work.w;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(work.el, -work.w / 2, -work.h / 2, work.w, work.h);
    setWork({ el: canvas, url: canvas.toDataURL('image/jpeg', 0.92), w: canvas.width, h: canvas.height });
    setView({ zoom: 1, x: 0, y: 0 });
  };

  const handleConfirm = () => {
    if (!work) return;
    if (isTainted) {
      setErrorMessage('Esta imagem vem de um link externo que não permite recorte. Baixe a foto e envie o arquivo.');
      return;
    }

    const scale = baseScale * view.zoom;
    const cropW = frame.w / scale;
    const cropH = frame.h / scale;
    // Canto superior esquerdo do frame convertido para as coordenadas da foto.
    const sx = clamp(work.w / 2 - (view.x + frame.w / 2) / scale, 0, Math.max(0, work.w - cropW));
    const sy = clamp(work.h / 2 - (view.y + frame.h / 2) / scale, 0, Math.max(0, work.h - cropH));

    // Nunca ampliar: o arquivo final tem, no máximo, os pixels que o recorte realmente tem.
    const outScale = Math.min(1, maxOutputDim / Math.max(cropW, cropH));
    const outW = Math.max(1, Math.round(cropW * outScale));
    const outH = Math.max(1, Math.round(cropH * outScale));

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setErrorMessage('Não foi possível gerar o recorte neste navegador.');
      return;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(work.el, sx, sy, cropW, cropH, 0, 0, outW, outH);

    try {
      onConfirm(canvas.toDataURL('image/jpeg', quality));
    } catch {
      setErrorMessage('Esta imagem não pôde ser recortada. Baixe a foto e envie o arquivo.');
    }
  };

  if (!isOpen || !source) return null;

  const displayW = work ? work.w * baseScale * view.zoom : 0;
  const displayH = work ? work.h * baseScale * view.zoom : 0;

  return (
    <div className="fixed inset-0 z-70 overflow-y-auto bg-black/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-fadeIn">
      <div className="w-full max-w-lg bg-[#F9F8F6] rounded-sm border border-white/60 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-black/5 bg-white/70">
          <div className="min-w-0">
            <h3 className="text-xs font-bold uppercase tracking-widest text-[#1A1A1A]">{title}</h3>
            {description && <p className="text-[11px] text-gray-500 mt-0.5">{description}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {progressLabel && (
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#A67C52] bg-[#A67C52]/10 px-2 py-1 rounded-xs">
                {progressLabel}
              </span>
            )}
            <button
              type="button"
              onClick={onCancel}
              className="p-1.5 rounded-xs text-gray-400 hover:text-[#1A1A1A] hover:bg-black/5 transition-colors"
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Área de recorte */}
        <div className="p-4 space-y-3">
          <div ref={wrapRef} className="w-full flex justify-center">
            {isLoading || !work ? (
              <div
                className="w-full flex flex-col items-center justify-center gap-2 bg-[#EFEDE7] rounded-xs text-gray-500"
                style={{ height: Math.min(maxFrameHeight, 280) }}
              >
                {errorMessage ? (
                  <>
                    <AlertCircle className="w-5 h-5 text-red-500" />
                    <span className="text-xs text-red-600 px-6 text-center">{errorMessage}</span>
                  </>
                ) : (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-xs">Carregando foto...</span>
                  </>
                )}
              </div>
            ) : (
              <div
                ref={frameRef}
                tabIndex={0}
                role="application"
                aria-label="Arraste para posicionar a foto dentro do frame"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onKeyDown={handleKeyDown}
                className="relative overflow-hidden rounded-xs bg-[#1A1A1A] cursor-grab active:cursor-grabbing select-none outline-hidden focus-visible:ring-2 focus-visible:ring-[#A67C52]"
                style={{ width: frame.w, height: frame.h, touchAction: 'none' }}
              >
                <img
                  src={work.url}
                  alt=""
                  draggable={false}
                  className="absolute left-1/2 top-1/2 pointer-events-none"
                  style={{
                    width: displayW,
                    height: displayH,
                    maxWidth: 'none',
                    transform: `translate(calc(-50% + ${view.x}px), calc(-50% + ${view.y}px))`,
                  }}
                />

                {/* Guias: terços + (quando a foto também vira avatar redondo) o círculo do avatar. */}
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute inset-y-0 left-1/3 w-px bg-white/25" />
                  <div className="absolute inset-y-0 left-2/3 w-px bg-white/25" />
                  <div className="absolute inset-x-0 top-1/3 h-px bg-white/25" />
                  <div className="absolute inset-x-0 top-2/3 h-px bg-white/25" />
                  <div className="absolute inset-0 ring-1 ring-inset ring-white/40" />
                  {circleGuide && (
                    <div
                      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-white/70"
                      style={{ width: frame.w, height: frame.w }}
                    />
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Controles */}
          {work && (
            <>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => zoomTo(view.zoom / 1.2)}
                  disabled={view.zoom <= 1}
                  className="p-1.5 rounded-xs bg-white border border-gray-200 text-[#1A1A1A] hover:border-[#A67C52] disabled:opacity-40 transition-colors"
                  aria-label="Diminuir zoom"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <input
                  type="range"
                  min={1}
                  max={MAX_ZOOM}
                  step={0.01}
                  value={view.zoom}
                  onChange={(e) => zoomTo(parseFloat(e.target.value))}
                  className="flex-1 accent-[#A67C52]"
                  aria-label="Zoom"
                />
                <button
                  type="button"
                  onClick={() => zoomTo(view.zoom * 1.2)}
                  disabled={view.zoom >= MAX_ZOOM}
                  className="p-1.5 rounded-xs bg-white border border-gray-200 text-[#1A1A1A] hover:border-[#A67C52] disabled:opacity-40 transition-colors"
                  aria-label="Aumentar zoom"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleRotate}
                  className="p-1.5 rounded-xs bg-white border border-gray-200 text-[#1A1A1A] hover:border-[#A67C52] transition-colors"
                  aria-label="Girar 90 graus"
                  title="Girar 90°"
                >
                  <RotateCw className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setView({ zoom: 1, x: 0, y: 0 })}
                  className="p-1.5 rounded-xs bg-white border border-gray-200 text-[#1A1A1A] hover:border-[#A67C52] transition-colors"
                  aria-label="Reiniciar enquadramento"
                  title="Reiniciar enquadramento"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              </div>

              {options.length > 1 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mr-0.5">
                    Formato
                  </span>
                  {options.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        setAspectId(option.id);
                        setView({ zoom: 1, x: 0, y: 0 });
                      }}
                      className={`px-2.5 py-1 rounded-xs text-[11px] font-medium border transition-colors ${
                        option.id === aspectId
                          ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]'
                          : 'bg-white text-[#1A1A1A] border-gray-200 hover:border-[#A67C52]'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}

              <p className="flex items-center gap-1.5 text-[11px] text-gray-500">
                <Move className="w-3.5 h-3.5 shrink-0 text-gray-400" />
                Arraste a foto para posicionar · role o mouse (ou use dois dedos) para dar zoom.
              </p>

              {errorMessage && (
                <p className="flex items-start gap-1.5 text-[11px] text-red-600">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
                  {errorMessage}
                </p>
              )}
              {isTainted && !errorMessage && (
                <p className="flex items-start gap-1.5 text-[11px] text-amber-700">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
                  Esta foto vem de um link externo que não libera edição. Para recortar, baixe o arquivo e envie por upload.
                </p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-black/5 bg-white/70 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-sm border border-gray-200 bg-white text-[11px] font-semibold uppercase tracking-wider text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!work || isTainted}
            className="px-5 py-2 rounded-sm bg-[#A67C52] text-white text-[11px] font-semibold uppercase tracking-wider shadow-xs hover:bg-[#8e6945] active:scale-95 transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
          >
            <Check className="w-3.5 h-3.5" />
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

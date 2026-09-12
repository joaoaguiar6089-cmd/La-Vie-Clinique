import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Canvas, IText, Line, PencilBrush, FabricImage, FabricObject, Point } from 'fabric';
import {
  X,
  MousePointer2,
  Type,
  Pencil,
  Minus,
  Trash2,
  Undo2,
  Redo2,
  Save,
  Loader2,
  ZoomIn,
  ZoomOut,
  SlidersHorizontal,
  Copy,
} from 'lucide-react';

interface PhotoAnnotationEditorProps {
  imageUrl: string;
  initialAnnotationsJson?: string;
  title?: string;
  onSave: (flattenedDataUrl: string, annotationsJson: string) => Promise<void> | void;
  onClose: () => void;
}

type Tool = 'select' | 'text' | 'draw' | 'line';

const COLORS = ['#E11D48', '#1A1A1A', '#2563EB', '#16A34A', '#F59E0B', '#FFFFFF'];
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 6;
const ZOOM_STEP = 1.25;

const isTextObject = (obj: FabricObject | undefined | null) =>
  !!obj && (obj.type === 'i-text' || obj.type === 'itext' || obj.type === 'textbox');

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/** Canvas display size that comfortably fits the current viewport (desktop or mobile). */
function computeDisplaySize() {
  if (typeof window === 'undefined') return { width: 600, height: 400 };
  // Mobile stacks a two-row bottom toolbar (colors + tools) under the canvas instead of the
  // single top toolbar row tablet/desktop use, so it needs a taller reserved chrome height.
  const isMobile = window.innerWidth < 640;
  const chrome = isMobile ? 260 : 230;
  const width = Math.max(280, Math.min(window.innerWidth - 32, 1000));
  const height = Math.max(280, Math.min(window.innerHeight - chrome, 900));
  return { width, height };
}

/**
 * Older saved annotation JSON can carry a background image with Fabric's default
 * `originX/originY: 'center'` (a version of this editor never pinned it to 'left'/'top' before
 * saving), which straddles the image across scene coordinate (0,0) instead of starting there —
 * the exact mismatch that made saved exports render as a small crop of the top-left quadrant.
 * Re-anchors the background to top-left at (0,0) and carries every other object along by the same
 * delta, so their positions relative to the photo don't shift.
 */
function normalizeBackgroundOrigin(canvas: Canvas, bg: FabricImage | undefined) {
  if (!bg || (bg.originX === 'left' && bg.originY === 'top')) return;
  const w = (bg.width || 0) * (bg.scaleX || 1);
  const h = (bg.height || 0) * (bg.scaleY || 1);
  const dx = bg.originX === 'center' ? w / 2 - (bg.left || 0) : -(bg.left || 0);
  const dy = bg.originY === 'center' ? h / 2 - (bg.top || 0) : -(bg.top || 0);
  if (dx || dy) {
    canvas._objects.forEach((obj) => {
      obj.set({ left: (obj.left || 0) + dx, top: (obj.top || 0) + dy });
      obj.setCoords();
    });
  }
  bg.set({ originX: 'left', originY: 'top', left: 0, top: 0 });
}

export const PhotoAnnotationEditor: React.FC<PhotoAnnotationEditorProps> = ({
  imageUrl,
  initialAnnotationsJson,
  title,
  onSave,
  onClose,
}) => {
  // Plain host div that React renders and owns; the actual <canvas> elements are created and
  // destroyed imperatively inside it (see bootstrap effect below). Fabric.js rewrites the DOM
  // around whatever canvas element it's given (wraps it, adds a sibling "upper canvas" for
  // interaction, and unwraps it again on dispose) — if React directly owned that <canvas> as a
  // JSX child, React's own unmount would try to remove a node Fabric has since relocated,
  // throwing "Failed to execute 'removeChild' ... not a child of this node". Keeping the node
  // React tracks (this div) untouched by Fabric side-steps that entirely.
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const fabricCanvasRef = useRef<Canvas | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // The photo's own natural pixel size — annotation objects live in this coordinate space
  // regardless of the current on-screen zoom, so exports are always full resolution.
  const imageDimsRef = useRef({ width: 0, height: 0 });
  const pinchRef = useRef<{ startDistance: number; startZoom: number } | null>(null);

  const [tool, setTool] = useState<Tool>('select');
  const [color, setColor] = useState('#E11D48');
  const [strokeWidth, setStrokeWidth] = useState(8);
  const [fontSize, setFontSize] = useState(60);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [isReady, setIsReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // Guarda o que está selecionado, não só "se" há seleção: a barra contextual precisa saber o
  // tipo para oferecer espessura (traço/linha) ou tamanho de fonte (texto).
  const [selectionInfo, setSelectionInfo] = useState<{ count: number; isText: boolean } | null>(null);
  const hasSelection = !!selectionInfo;
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);

  // A ferramenta corrente lida por callbacks que vivem fora do efeito de ferramentas (undo/redo,
  // por exemplo) — sem isto eles enxergariam sempre o valor da primeira renderização.
  const toolRef = useRef<Tool>('select');
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);
  const suppressHistoryRef = useRef(false);
  // Fabric's Canvas#dispose() is async. React 19 StrictMode mounts effects twice in dev
  // (mount → cleanup → mount), and creating a new Canvas on the same <canvas> element before
  // the previous instance finished disposing corrupts Fabric's internal DOM wrapper. Gating the
  // next setup on the prior disposal promise avoids that race.
  const pendingDisposalRef = useRef<Promise<unknown>>(Promise.resolve());
  const historyDebounceRef = useRef<number | null>(null);

  /**
   * Só a ferramenta "Mover" deixa os objetos clicáveis — nas outras o clique pertence à própria
   * ferramenta. Precisa ser reaplicado depois de qualquer `loadFromJSON` (desfazer/refazer), que
   * restaura `selectable`/`evented` como estavam no momento em que o estado foi serializado: um
   * objeto desenhado com a ferramenta de traço era salvo como não-selecionável e, depois de um
   * desfazer, nunca mais podia ser selecionado nem apagado.
   */
  const applySelectability = useCallback((canvas: Canvas) => {
    const interativo = toolRef.current === 'select';
    canvas.forEachObject((obj) => {
      if (obj === canvas.backgroundImage) return;
      obj.selectable = interativo;
      obj.evented = interativo;
    });
  }, []);

  /** Espelha na barra contextual o tipo e os parâmetros atuais do que está selecionado. */
  const syncSelection = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    const ativos = canvas.getActiveObjects();
    if (ativos.length === 0) {
      setSelectionInfo(null);
      return;
    }

    const principal = ativos[0] as any;
    const isText = isTextObject(principal);
    setSelectionInfo({ count: ativos.length, isText });

    // Os controles passam a refletir o objeto selecionado, e não o último valor usado para
    // desenhar — é o que permite "editar os parâmetros" de algo já anotado.
    const corAtual = isText ? principal.fill : principal.stroke;
    if (typeof corAtual === 'string' && corAtual) setColor(corAtual);
    if (isText && typeof principal.fontSize === 'number') {
      setFontSize(Math.round(principal.fontSize));
    } else if (!isText && typeof principal.strokeWidth === 'number') {
      setStrokeWidth(Math.round(principal.strokeWidth));
    }
  }, []);

  const refreshHistoryButtons = useCallback(() => {
    setHistoryState({
      canUndo: historyIndexRef.current > 0,
      canRedo: historyIndexRef.current < historyRef.current.length - 1,
    });
  }, []);

  const pushHistory = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || suppressHistoryRef.current) return;
    const json = JSON.stringify(canvas.toJSON());
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    historyRef.current.push(json);
    historyIndexRef.current = historyRef.current.length - 1;
    refreshHistoryButtons();
  }, [refreshHistoryButtons]);

  /**
   * Arrastar um controle deslizante dispara uma mudança por pixel percorrido. Empilhar um estado
   * de histórico em cada uma delas enche a pilha com dezenas de passos intermediários e faz
   * "desfazer" parecer travado — coalescer o arrasto inteiro em um único passo é o que mantém o
   * desfazer utilizável agora que espessura e tamanho ficaram à mão na barra da seleção.
   */
  const pushHistoryDebounced = useCallback(() => {
    if (historyDebounceRef.current !== null) window.clearTimeout(historyDebounceRef.current);
    historyDebounceRef.current = window.setTimeout(() => {
      historyDebounceRef.current = null;
      pushHistory();
    }, 400);
  }, [pushHistory]);

  useEffect(() => {
    return () => {
      if (historyDebounceRef.current !== null) window.clearTimeout(historyDebounceRef.current);
    };
  }, []);


  /** Scales + centers the image so it's fully visible in the current canvas viewport. */
  const fitToScreen = useCallback((canvas: Canvas, imgW: number, imgH: number) => {
    if (!imgW || !imgH) return;
    const cw = canvas.width || 1;
    const ch = canvas.height || 1;
    const fitZoom = clampZoom(Math.min(cw / imgW, ch / imgH) || 1);
    canvas.setZoom(fitZoom);
    const vpt = canvas.viewportTransform;
    if (vpt) {
      vpt[4] = (cw - imgW * fitZoom) / 2;
      vpt[5] = (ch - imgH * fitZoom) / 2;
      canvas.setViewportTransform(vpt);
    }
    canvas.requestRenderAll();
    setZoomPercent(Math.round(fitZoom * 100));
  }, []);

  const applyZoom = useCallback((canvas: Canvas, newZoom: number, center?: Point) => {
    const clamped = clampZoom(newZoom);
    const point = center || new Point((canvas.width || 0) / 2, (canvas.height || 0) / 2);
    canvas.zoomToPoint(point, clamped);
    canvas.requestRenderAll();
    setZoomPercent(Math.round(clamped * 100));
  }, []);

  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);

  // ============ Canvas bootstrap (once) ============
  useEffect(() => {
    if (!canvasHostRef.current) return;
    const hostEl = canvasHostRef.current;
    let cancelled = false;

    async function setup() {
      // Wait out any still-in-flight disposal from a prior StrictMode mount before creating a
      // new canvas in this host.
      await pendingDisposalRef.current;
      if (cancelled) return;

      const canvasEl = document.createElement('canvas');
      hostEl.appendChild(canvasEl);

      const canvas = new Canvas(canvasEl, {
        selection: false,
        preserveObjectStacking: true,
      });
      fabricCanvasRef.current = canvas;

      const displaySize = computeDisplaySize();
      canvas.setDimensions(displaySize);

      suppressHistoryRef.current = true;
      try {
        let imgW = 0;
        let imgH = 0;
        if (initialAnnotationsJson) {
          await canvas.loadFromJSON(JSON.parse(initialAnnotationsJson));
          if (cancelled) return;
          const bg = canvas.backgroundImage as FabricImage | undefined;
          imgW = (bg?.width || 0) * (bg?.scaleX || 1);
          imgH = (bg?.height || 0) * (bg?.scaleY || 1);
          normalizeBackgroundOrigin(canvas, bg);
        } else {
          const img = await FabricImage.fromURL(imageUrl, { crossOrigin: 'anonymous' });
          if (cancelled) return;
          imgW = img.width || 1000;
          imgH = img.height || 1000;
          // Keep the image at its native pixel size in scene space, anchored top-left at the
          // scene origin — never shrink it to fit the display here. Fitting the *view* is handled
          // separately below via zoom, so annotation coordinates and the final export always stay
          // at full resolution. originX/Y must be pinned explicitly: Fabric's own default origin
          // is 'center', which would place the image straddling (0,0) instead of starting there,
          // silently breaking the top-left-anchored math fitToScreen/handleSave rely on.
          img.set({ scaleX: 1, scaleY: 1, left: 0, top: 0, originX: 'left', originY: 'top', selectable: false, evented: false });
          canvas.backgroundImage = img;
        }
        imageDimsRef.current = { width: imgW, height: imgH };
        fitToScreen(canvas, imgW, imgH);
        canvas.renderAll();
      } finally {
        suppressHistoryRef.current = false;
        if (!cancelled) {
          pushHistory();
          setIsReady(true);
        }
      }

      const onAdded = () => pushHistory();
      const onModified = () => pushHistory();
      const onRemoved = () => pushHistory();
      const onPathCreated = () => pushHistory();
      const onSelection = () => syncSelection();
      const onSelectionCleared = () => setSelectionInfo(null);

      canvas.on('object:added', onAdded);
      canvas.on('object:modified', onModified);
      canvas.on('object:removed', onRemoved);
      canvas.on('path:created', onPathCreated);
      canvas.on('selection:created', onSelection);
      canvas.on('selection:updated', onSelection);
      canvas.on('selection:cleared', onSelectionCleared);
    }

    setup();

    return () => {
      cancelled = true;
      const canvas = fabricCanvasRef.current;
      fabricCanvasRef.current = null;
      setIsReady(false);
      if (canvas) {
        // Fabric's dispose() restores/unwraps the DOM synchronously before it returns (the promise
        // it returns is only for the async object-teardown that follows) — safe to empty the host
        // right away so it's ready for a future setup(), without waiting on that promise.
        pendingDisposalRef.current = canvas.dispose().catch(() => {});
        hostEl.innerHTML = '';
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ============ Keep the canvas viewport sized to the screen (rotation, resize) ============
  useEffect(() => {
    if (!isReady) return;
    const handleResize = () => {
      const canvas = fabricCanvasRef.current;
      if (!canvas) return;
      canvas.setDimensions(computeDisplaySize());
      fitToScreen(canvas, imageDimsRef.current.width, imageDimsRef.current.height);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isReady, fitToScreen]);

  // ============ Mouse wheel zoom (desktop) ============
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !isReady) return;

    const handleWheel = (opt: any) => {
      const delta = opt.e.deltaY;
      const zoom = clampZoom(canvas.getZoom() * 0.999 ** delta);
      applyZoom(canvas, zoom, new Point(opt.e.offsetX, opt.e.offsetY));
      opt.e.preventDefault();
      opt.e.stopPropagation();
    };

    canvas.on('mouse:wheel', handleWheel);
    return () => canvas.off('mouse:wheel', handleWheel);
  }, [isReady, applyZoom]);

  // ============ Pinch-to-zoom (touch) ============
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    const hostEl = canvasHostRef.current;
    if (!canvas || !hostEl || !isReady) return;

    const distance = (touches: TouchList) =>
      Math.hypot(touches[1].clientX - touches[0].clientX, touches[1].clientY - touches[0].clientY);
    const midpoint = (touches: TouchList) => ({
      clientX: (touches[0].clientX + touches[1].clientX) / 2,
      clientY: (touches[0].clientY + touches[1].clientY) / 2,
    });

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        pinchRef.current = { startDistance: distance(e.touches), startZoom: canvas.getZoom() };
      }
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault();
        const scale = distance(e.touches) / pinchRef.current.startDistance;
        const zoom = clampZoom(pinchRef.current.startZoom * scale);
        const mid = midpoint(e.touches);
        const rect = hostEl.getBoundingClientRect();
        applyZoom(canvas, zoom, new Point(mid.clientX - rect.left, mid.clientY - rect.top));
      }
    };
    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinchRef.current = null;
    };

    hostEl.addEventListener('touchstart', handleTouchStart, { passive: false });
    hostEl.addEventListener('touchmove', handleTouchMove, { passive: false });
    hostEl.addEventListener('touchend', handleTouchEnd);
    hostEl.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      hostEl.removeEventListener('touchstart', handleTouchStart);
      hostEl.removeEventListener('touchmove', handleTouchMove);
      hostEl.removeEventListener('touchend', handleTouchEnd);
      hostEl.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [isReady, applyZoom]);

  // ============ Tool behavior wiring ============
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !isReady) return;

    canvas.isDrawingMode = tool === 'draw';
    canvas.defaultCursor = tool === 'select' ? 'grab' : 'crosshair';
    applySelectability(canvas);

    if (tool === 'draw') {
      const brush = new PencilBrush(canvas);
      brush.color = color;
      brush.width = strokeWidth;
      canvas.freeDrawingBrush = brush;
    }

    let draftLine: Line | null = null;
    let isDraggingLine = false;
    let isPanning = false;
    let lastPanPoint: Point | null = null;

    const handleMouseDown = (opt: any) => {
      if (tool === 'select' && !opt.target) {
        // Drag on empty canvas pans the view instead of Fabric's default rubber-band select —
        // more useful here, and essential once the image no longer fits 1:1 on screen.
        isPanning = true;
        lastPanPoint = canvas.getViewportPoint(opt.e);
        canvas.defaultCursor = 'grabbing';
        return;
      }
      if (tool === 'text') {
        if (opt.target) return;
        const pointer = canvas.getScenePoint(opt.e);
        const text = new IText('Digite aqui', {
          left: pointer.x,
          top: pointer.y,
          fontSize,
          fill: color,
          fontFamily: 'Arial, sans-serif',
        });
        canvas.add(text);
        canvas.setActiveObject(text);
        text.enterEditing();
        text.selectAll();
        canvas.requestRenderAll();
        setTool('select');
      } else if (tool === 'line') {
        const pointer = canvas.getScenePoint(opt.e);
        draftLine = new Line([pointer.x, pointer.y, pointer.x, pointer.y], {
          stroke: color,
          strokeWidth,
          selectable: false,
          evented: false,
          strokeLineCap: 'round',
        });
        suppressHistoryRef.current = true;
        canvas.add(draftLine);
        isDraggingLine = true;
      }
    };

    const handleMouseMove = (opt: any) => {
      if (isPanning && lastPanPoint) {
        const p = canvas.getViewportPoint(opt.e);
        canvas.relativePan(new Point(p.x - lastPanPoint.x, p.y - lastPanPoint.y));
        lastPanPoint = p;
        return;
      }
      if (!isDraggingLine || !draftLine) return;
      const pointer = canvas.getScenePoint(opt.e);
      draftLine.set({ x2: pointer.x, y2: pointer.y });
      canvas.requestRenderAll();
    };

    const handleMouseUp = () => {
      if (isPanning) {
        isPanning = false;
        lastPanPoint = null;
        canvas.defaultCursor = 'grab';
        return;
      }
      if (!isDraggingLine || !draftLine) return;
      isDraggingLine = false;
      suppressHistoryRef.current = false;
      draftLine.set({ selectable: true, evented: true });
      draftLine.setCoords();
      canvas.setActiveObject(draftLine);
      canvas.requestRenderAll();
      draftLine = null;
      pushHistory();
      setTool('select');
    };

    canvas.on('mouse:down', handleMouseDown);
    canvas.on('mouse:move', handleMouseMove);
    canvas.on('mouse:up', handleMouseUp);

    return () => {
      canvas.off('mouse:down', handleMouseDown);
      canvas.off('mouse:move', handleMouseMove);
      canvas.off('mouse:up', handleMouseUp);
    };
  }, [tool, color, strokeWidth, fontSize, isReady, pushHistory, applySelectability]);

  // ============ Keyboard delete ============
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const canvas = fabricCanvasRef.current;
      if (!canvas) return;
      const active = canvas.getActiveObject() as any;
      if (active?.isEditing) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (canvas.getActiveObjects().length === 0) return;
        e.preventDefault();
        deleteSelected();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleteSelected = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    canvas.getActiveObjects().forEach((obj) => canvas.remove(obj));
    canvas.discardActiveObject();
    setSelectionInfo(null);
    canvas.requestRenderAll();
  };

  /** Duplica o que está selecionado, deslocado para não ficar exatamente por cima do original. */
  const duplicateSelected = async () => {
    const canvas = fabricCanvasRef.current;
    const ativo = canvas?.getActiveObject();
    if (!canvas || !ativo) return;
    const copia = await ativo.clone();
    copia.set({
      left: (ativo.left || 0) + 24,
      top: (ativo.top || 0) + 24,
      selectable: true,
      evented: true,
    });
    canvas.add(copia);
    canvas.setActiveObject(copia);
    canvas.requestRenderAll();
    syncSelection();
  };

  /** Entra no modo de edição do texto selecionado (equivalente ao duplo clique). */
  const editSelectedText = () => {
    const canvas = fabricCanvasRef.current;
    const ativo = canvas?.getActiveObject() as any;
    if (!canvas || !ativo || !isTextObject(ativo)) return;
    ativo.enterEditing?.();
    ativo.selectAll?.();
    canvas.requestRenderAll();
  };

  const applyColor = (newColor: string) => {
    setColor(newColor);
    const canvas = fabricCanvasRef.current;
    const active = canvas?.getActiveObject();
    if (active) {
      active.set(isTextObject(active) ? 'fill' : 'stroke', newColor);
      canvas?.requestRenderAll();
      pushHistoryDebounced();
    }
  };

  const applyStrokeWidth = (value: number) => {
    setStrokeWidth(value);
    const canvas = fabricCanvasRef.current;
    const active = canvas?.getActiveObject();
    if (active && !isTextObject(active)) {
      active.set('strokeWidth', value);
      active.setCoords();
      canvas?.requestRenderAll();
      pushHistoryDebounced();
    }
  };

  const applyFontSize = (value: number) => {
    setFontSize(value);
    const canvas = fabricCanvasRef.current;
    const active = canvas?.getActiveObject();
    if (active && isTextObject(active)) {
      active.set('fontSize', value);
      active.setCoords();
      canvas?.requestRenderAll();
      pushHistoryDebounced();
    }
  };

  const restoreFromHistory = async (idx: number) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    suppressHistoryRef.current = true;
    await canvas.loadFromJSON(JSON.parse(historyRef.current[idx]));
    // loadFromJSON recria todos os objetos: a seleção anterior aponta para objetos que já não
    // existem, e a interatividade volta como estava serializada.
    canvas.discardActiveObject();
    setSelectionInfo(null);
    applySelectability(canvas);
    canvas.renderAll();
    suppressHistoryRef.current = false;
    refreshHistoryButtons();
  };

  const handleUndo = () => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    restoreFromHistory(historyIndexRef.current);
  };

  const handleRedo = () => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    restoreFromHistory(historyIndexRef.current);
  };

  const handleZoomIn = () => {
    const canvas = fabricCanvasRef.current;
    if (canvas) applyZoom(canvas, canvas.getZoom() * ZOOM_STEP);
  };

  const handleZoomOut = () => {
    const canvas = fabricCanvasRef.current;
    if (canvas) applyZoom(canvas, canvas.getZoom() / ZOOM_STEP);
  };

  const handleZoomFit = () => {
    const canvas = fabricCanvasRef.current;
    if (canvas) fitToScreen(canvas, imageDimsRef.current.width, imageDimsRef.current.height);
  };

  const handleSave = async () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    canvas.discardActiveObject();

    const { width: imgW, height: imgH } = imageDimsRef.current;
    const prevVpt = canvas.viewportTransform ? ([...canvas.viewportTransform] as typeof canvas.viewportTransform) : undefined;
    const prevDims = { width: canvas.width, height: canvas.height };
    const prevBackgroundColor = canvas.backgroundColor;

    setIsSaving(true);
    try {
      // Nothing stops an annotation (a wide text box, a line dragged past the edge) from landing
      // partly or fully outside the photo's own rectangle — exporting a fixed (0,0,imgW,imgH) region
      // silently clipped whatever fell outside it. Union the photo's rect with every object's own
      // bounding box (in absolute scene coordinates, ignoring the current pan/zoom) so the export
      // always covers everything actually drawn, not just the original photo.
      let minX = 0;
      let minY = 0;
      let maxX = imgW;
      let maxY = imgH;
      canvas.forEachObject((obj) => {
        const r = obj.getBoundingRect(true, true);
        minX = Math.min(minX, r.left);
        minY = Math.min(minY, r.top);
        maxX = Math.max(maxX, r.left + r.width);
        maxY = Math.max(maxY, r.top + r.height);
      });
      const PAD = 4; // safety margin against stroke-width/anti-aliasing rounding at the edges
      minX -= PAD;
      minY -= PAD;
      maxX += PAD;
      maxY += PAD;
      const exportW = maxX - minX;
      const exportH = maxY - minY;

      // Render the full union region for export, regardless of the current on-screen zoom/pan —
      // shifting the viewport so (minX, minY) lands at the canvas origin.
      if (exportW && exportH) {
        canvas.setViewportTransform([1, 0, 0, 1, -minX, -minY]);
        canvas.setDimensions({ width: exportW, height: exportH });
        // JPEG has no transparency channel — an uncovered pixel would otherwise export black.
        // The background photo covers most of the canvas already; this only matters for the thin
        // padding strip (or any area annotations pushed the bounds into) beyond the photo's edge.
        canvas.backgroundColor = '#FFFFFF';
        canvas.renderAll();
      }
      // JPEG, not PNG: this data URL is stored inline in the Firestore record (see onSave), which
      // rejects documents over 1MB. A single anamnesis record can carry up to two of these flattened
      // exports (reference photo + patient's own photo) alongside their un-annotated originals, so
      // each one needs to leave real headroom rather than using the whole 1MB budget on its own.
      // Capping the longest side keeps a source photo of any resolution (up to ~2000px) well inside that shared budget.
      const MAX_EXPORT_DIM = 1400;
      const largestDim = Math.max(exportW || 0, exportH || 0);
      const exportMultiplier = largestDim > MAX_EXPORT_DIM ? MAX_EXPORT_DIM / largestDim : 1;
      const dataUrl = canvas.toDataURL({ format: 'jpeg', quality: 0.78, multiplier: exportMultiplier });
      const json = JSON.stringify(canvas.toJSON());
      await onSave(dataUrl, json);
    } finally {
      // Restore the editor's current view in case saving failed and editing continues.
      canvas.setDimensions(prevDims as { width: number; height: number });
      if (prevVpt) canvas.setViewportTransform(prevVpt);
      canvas.backgroundColor = prevBackgroundColor;
      canvas.renderAll();
      setIsSaving(false);
    }
  };

  const toolMeta: Record<Tool, { label: string; icon: React.ReactNode }> = {
    select: { label: 'Mover', icon: <MousePointer2 className="w-[18px] h-[18px]" /> },
    draw: { label: 'Desenho', icon: <Pencil className="w-[18px] h-[18px]" /> },
    line: { label: 'Linha', icon: <Minus className="w-[18px] h-[18px]" /> },
    text: { label: 'Texto', icon: <Type className="w-[18px] h-[18px]" /> },
  };
  const tabletToolOrder: Tool[] = ['select', 'draw', 'line', 'text'];
  const mobileToolOrder: Tool[] = ['draw', 'line', 'text', 'select'];

  const placeholderSize = computeDisplaySize();

  const sliderThumbClass =
    '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#A67C52] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-[#A67C52]';

  return (
    <div className="fixed inset-0 z-[80] bg-black/85 backdrop-blur-xs flex flex-col animate-fadeIn">
      {/* ============ Header ============ */}
      <div className="relative px-4 sm:px-6 h-14 sm:h-auto sm:py-3.5 bg-[#1A1A1A] text-white flex items-center justify-between gap-3 shrink-0 shadow-lg">
        {/* Mobile: close (44px) + centered title + Salvar */}
        <button
          type="button"
          onClick={onClose}
          className="sm:hidden w-11 h-11 -ml-2 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors shrink-0"
        >
          <X className="w-5 h-5" />
        </button>
        <span className="sm:hidden absolute left-1/2 -translate-x-1/2 font-serif-luxury text-[15px] truncate max-w-[55%]">
          {title || 'Anotar foto'}
        </span>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || !isReady}
          className="sm:hidden flex items-center gap-1.5 h-10 px-4 rounded-xl bg-[#A67C52] text-white text-[14px] font-semibold disabled:opacity-60"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {isSaving ? 'Salvando' : 'Salvar'}
        </button>

        {/* Tablet/desktop: bronze dot + title + patient name, Cancelar / Salvar anotações */}
        <div className="hidden sm:flex items-center gap-2.5 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full bg-[#C49B74] shrink-0" />
          <span className="font-serif-luxury text-[21px] tracking-wide truncate">
            {title || 'Anotar foto'}
          </span>
        </div>
        <div className="hidden sm:flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="h-11 px-4 rounded-xl border border-white/20 text-white/80 hover:text-white hover:bg-white/10 text-[14px] font-semibold transition-colors whitespace-nowrap"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !isReady}
            className="flex items-center gap-2 h-11 px-5 rounded-xl bg-[#A67C52] text-white text-[14px] font-semibold hover:bg-[#8E653D] transition-all disabled:opacity-60 whitespace-nowrap"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Save className="w-4 h-4 shrink-0" />}
            {isSaving ? 'Salvando...' : 'Salvar anotações'}
          </button>
        </div>
      </div>

      {/* ============ Toolbar — tablet/desktop (sm+) ============ */}
      <div className="hidden sm:flex px-4 sm:px-6 py-2.5 bg-[#232323] border-b border-white/10 items-center gap-3 sm:gap-4 flex-wrap shrink-0">
        <div className="flex items-center gap-1 bg-black/35 p-1 rounded-xl">
          {tabletToolOrder.map((id) => (
            <button
              key={id}
              type="button"
              title={toolMeta[id].label}
              onClick={() => setTool(id)}
              className={`flex items-center gap-1.5 h-11 px-3 rounded-lg text-[13px] font-medium transition-all ${
                tool === id ? 'bg-[#A67C52] text-white' : 'text-gray-300 hover:bg-white/10'
              }`}
            >
              {toolMeta[id].icon}
              <span>{toolMeta[id].label}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 bg-black/35 p-1 rounded-xl">
          <button type="button" title="Diminuir zoom" onClick={handleZoomOut} className="p-2 rounded-lg text-gray-300 hover:bg-white/10 transition-colors">
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            type="button"
            title="Ajustar à tela"
            onClick={handleZoomFit}
            className="px-2 py-1 rounded-lg text-gray-300 hover:bg-white/10 text-[12px] font-semibold min-w-[3.25rem] text-center transition-colors"
            style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}
          >
            {zoomPercent}%
          </button>
          <button type="button" title="Aumentar zoom" onClick={handleZoomIn} className="p-2 rounded-lg text-gray-300 hover:bg-white/10 transition-colors">
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              title={c}
              onClick={() => applyColor(c)}
              className={`w-[30px] h-[30px] rounded-full border-2 transition-all ${
                color === c ? 'border-[#C49B74] scale-110' : 'border-white/30'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
          <input
            type="color"
            value={color}
            onChange={(e) => applyColor(e.target.value)}
            title="Cor personalizada"
            className="w-[30px] h-[30px] rounded-full border-2 border-white/30 bg-transparent cursor-pointer"
          />
        </div>

        <div className="flex items-center gap-2 text-gray-300 text-[12px]">
          <span>Espessura</span>
          <input
            type="range"
            min={2}
            max={40}
            value={strokeWidth}
            onChange={(e) => applyStrokeWidth(Number(e.target.value))}
            className={`w-20 h-1.5 rounded-full bg-white/20 accent-[#A67C52] ${sliderThumbClass} [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:h-6`}
          />
          <span style={{ fontFamily: 'ui-monospace, Menlo, monospace' }} className="w-6">{strokeWidth}</span>
        </div>

        <div className="flex items-center gap-2 text-gray-300 text-[12px]">
          <span>Texto</span>
          <input
            type="range"
            min={20}
            max={200}
            value={fontSize}
            onChange={(e) => applyFontSize(Number(e.target.value))}
            className={`w-20 h-1.5 rounded-full bg-white/20 accent-[#A67C52] ${sliderThumbClass} [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:h-6`}
          />
          <span style={{ fontFamily: 'ui-monospace, Menlo, monospace' }} className="w-8">{fontSize}</span>
        </div>

        <div className="flex items-center gap-1 ml-auto">
          <button type="button" title="Desfazer" onClick={handleUndo} disabled={!historyState.canUndo} className="p-2.5 rounded-lg text-gray-300 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
            <Undo2 className="w-4 h-4" />
          </button>
          <button type="button" title="Refazer" onClick={handleRedo} disabled={!historyState.canRedo} className="p-2.5 rounded-lg text-gray-300 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
            <Redo2 className="w-4 h-4" />
          </button>
          <button type="button" title="Excluir selecionado (ou tecla Delete)" onClick={deleteSelected} disabled={!hasSelection} className="p-2.5 rounded-lg text-[#E11D48] hover:bg-[#E11D48]/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ============ Canvas area ============ */}
      <div ref={containerRef} className="flex-1 overflow-auto flex items-center justify-center p-4 sm:p-8 bg-[#111] sm:bg-[#0f0f0f] touch-none relative">
        <div className="relative bg-white rounded-sm shadow-2xl overflow-hidden">
          {/* Fabric.js creates/owns its <canvas> element(s) inside this div directly via the DOM —
              never render one here as JSX (see canvasHostRef above for why). */}
          <div ref={canvasHostRef} />
          {!isReady && (
            <div
              className="absolute inset-0 flex items-center justify-center bg-white"
              style={{ width: placeholderSize.width, height: placeholderSize.height }}
            >
              <Loader2 className="w-8 h-8 text-[#A67C52] animate-spin" />
            </div>
          )}
        </div>

        {/* ===== Barra contextual da seleção =====
            Antes, a única forma de apagar uma anotação era a lixeira no canto da barra superior
            (escondida atrás de "Ajustes" no celular) ou a tecla Delete — nada disso aparecia ao
            selecionar o objeto. Esta barra surge junto com a seleção, com excluir à mão e os
            parâmetros do próprio objeto já carregados para edição. */}
        {selectionInfo && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 w-[calc(100%-1.5rem)] max-w-2xl">
            <div className="bg-[rgba(26,26,26,.93)] backdrop-blur-md rounded-2xl shadow-2xl border border-white/10 px-3 py-2.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-2.5">
              <span className="text-[11px] font-semibold text-[#C49B74] uppercase tracking-wider whitespace-nowrap">
                {selectionInfo.count > 1
                  ? `${selectionInfo.count} itens`
                  : selectionInfo.isText
                  ? 'Texto'
                  : 'Desenho'}
              </span>

              <span className="w-px h-6 bg-white/15" aria-hidden />

              {/* Cor */}
              <div className="flex items-center gap-1.5">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    title={`Mudar a cor para ${c}`}
                    onClick={() => applyColor(c)}
                    className={`w-7 h-7 rounded-full border-2 transition-all ${
                      color === c ? 'border-[#C49B74] scale-110' : 'border-white/30'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>

              <span className="w-px h-6 bg-white/15" aria-hidden />

              {/* Parâmetro do tipo selecionado */}
              {selectionInfo.isText ? (
                <div className="flex items-center gap-2 text-gray-300 text-[11px]">
                  <span className="whitespace-nowrap">Tamanho</span>
                  <input
                    type="range"
                    min={20}
                    max={200}
                    value={fontSize}
                    onChange={(e) => applyFontSize(Number(e.target.value))}
                    className={`w-24 h-1.5 rounded-full bg-white/20 accent-[#A67C52] ${sliderThumbClass} [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:h-6`}
                  />
                  <span style={{ fontFamily: 'ui-monospace, Menlo, monospace' }} className="w-7">
                    {fontSize}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-gray-300 text-[11px]">
                  <span className="whitespace-nowrap">Espessura</span>
                  <input
                    type="range"
                    min={2}
                    max={40}
                    value={strokeWidth}
                    onChange={(e) => applyStrokeWidth(Number(e.target.value))}
                    className={`w-24 h-1.5 rounded-full bg-white/20 accent-[#A67C52] ${sliderThumbClass} [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:h-6`}
                  />
                  <span style={{ fontFamily: 'ui-monospace, Menlo, monospace' }} className="w-6">
                    {strokeWidth}
                  </span>
                </div>
              )}

              <span className="w-px h-6 bg-white/15" aria-hidden />

              <div className="flex items-center gap-1">
                {selectionInfo.isText && selectionInfo.count === 1 && (
                  <button
                    type="button"
                    onClick={editSelectedText}
                    title="Editar o texto"
                    className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-gray-200 hover:bg-white/10 text-[12px] font-medium transition-colors"
                  >
                    <Type className="w-4 h-4" />
                    Editar
                  </button>
                )}
                {selectionInfo.count === 1 && (
                  <button
                    type="button"
                    onClick={duplicateSelected}
                    title="Duplicar"
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-200 hover:bg-white/10 transition-colors"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={deleteSelected}
                  title="Excluir seleção (ou tecla Delete)"
                  className="flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[#E11D48]/15 text-[#FF8095] hover:bg-[#E11D48]/30 text-[12px] font-semibold transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Excluir
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Mobile floating controls */}
        <div className="sm:hidden absolute top-3 right-3 flex items-center gap-1 bg-[rgba(0,0,0,.55)] backdrop-blur-md rounded-full px-1 py-1">
          <button type="button" onClick={handleZoomOut} className="w-9 h-9 rounded-full flex items-center justify-center text-white/90">
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleZoomFit}
            className="px-1.5 text-[11px] text-white/90 font-semibold min-w-[2.75rem] text-center"
            style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}
          >
            {zoomPercent}%
          </button>
          <button type="button" onClick={handleZoomIn} className="w-9 h-9 rounded-full flex items-center justify-center text-white/90">
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>
        <div className="sm:hidden absolute top-3 left-3 flex items-center gap-1 bg-[rgba(0,0,0,.55)] backdrop-blur-md rounded-full px-1 py-1">
          <button type="button" onClick={handleUndo} disabled={!historyState.canUndo} className="w-9 h-9 rounded-full flex items-center justify-center text-white/90 disabled:opacity-30">
            <Undo2 className="w-4 h-4" />
          </button>
          <button type="button" onClick={handleRedo} disabled={!historyState.canRedo} className="w-9 h-9 rounded-full flex items-center justify-center text-white/90 disabled:opacity-30">
            <Redo2 className="w-4 h-4" />
          </button>
        </div>
        {!selectionInfo && (
          <p className="sm:hidden absolute bottom-3 left-1/2 -translate-x-1/2 text-[12px] text-white/70 bg-[rgba(0,0,0,.55)] backdrop-blur-md px-3 py-1.5 rounded-full whitespace-nowrap">
            Pinça para dar zoom · dois dedos para mover
          </p>
        )}
      </div>

      {/* ============ Toolbar — mobile (<640px) ============ */}
      <div className="sm:hidden bg-[#1A1A1A] shrink-0">
        <div className="flex items-center justify-center gap-2.5 py-2.5 border-b border-white/10">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => applyColor(c)}
              className={`w-9 h-9 rounded-full border-2 transition-all ${
                color === c ? 'border-[#C49B74] scale-110' : 'border-white/25'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <div className="grid grid-cols-5">
          {mobileToolOrder.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setTool(id)}
              className={`h-[60px] flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                tool === id ? 'text-[#A67C52]' : 'text-gray-300'
              }`}
            >
              {toolMeta[id].icon}
              {toolMeta[id].label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setIsAdjustOpen(true)}
            className="h-[60px] flex flex-col items-center justify-center gap-1 text-[11px] font-medium text-gray-300"
          >
            <SlidersHorizontal className="w-[18px] h-[18px]" />
            Ajustes
          </button>
        </div>
      </div>

      {/* Mobile "Ajustes" bottom sheet */}
      {isAdjustOpen && (
        <>
          <div className="sm:hidden fixed inset-0 z-10 bg-black/40" onClick={() => setIsAdjustOpen(false)} />
          <div className="sm:hidden fixed left-0 right-0 bottom-0 z-20 bg-[#1A1A1A] rounded-t-[22px] pb-[max(20px,env(safe-area-inset-bottom))]">
            <div className="w-11 h-1 bg-white/20 rounded-full mx-auto mt-3 mb-4" />
            <div className="px-5 space-y-5">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[14px] font-semibold text-white">Espessura</span>
                  <span className="text-[14px] text-[#C49B74]" style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>{strokeWidth}</span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={40}
                  value={strokeWidth}
                  onChange={(e) => applyStrokeWidth(Number(e.target.value))}
                  className={`w-full h-1.5 rounded-full bg-white/20 accent-[#A67C52] ${sliderThumbClass} [&::-webkit-slider-thumb]:w-[34px] [&::-webkit-slider-thumb]:h-[34px] [&::-moz-range-thumb]:w-[34px] [&::-moz-range-thumb]:h-[34px]`}
                  style={{ padding: '10px 0' }}
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[14px] font-semibold text-white">Tamanho do texto</span>
                  <span className="text-[14px] text-[#C49B74]" style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>{fontSize}</span>
                </div>
                <input
                  type="range"
                  min={20}
                  max={200}
                  value={fontSize}
                  onChange={(e) => applyFontSize(Number(e.target.value))}
                  className={`w-full h-1.5 rounded-full bg-white/20 accent-[#A67C52] ${sliderThumbClass} [&::-webkit-slider-thumb]:w-[34px] [&::-webkit-slider-thumb]:h-[34px] [&::-moz-range-thumb]:w-[34px] [&::-moz-range-thumb]:h-[34px]`}
                  style={{ padding: '10px 0' }}
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  deleteSelected();
                  setIsAdjustOpen(false);
                }}
                disabled={!hasSelection}
                className="w-full h-12 rounded-xl bg-[#E11D48]/10 text-[#E11D48] text-[15px] font-semibold flex items-center justify-center gap-2 disabled:opacity-30"
              >
                <Trash2 className="w-4 h-4" />
                Excluir seleção
              </button>
              <button
                type="button"
                onClick={() => setIsAdjustOpen(false)}
                className="w-full h-[52px] rounded-2xl bg-[#A67C52] text-white text-[16px] font-semibold"
              >
                Pronto
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

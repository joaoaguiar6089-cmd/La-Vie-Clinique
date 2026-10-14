import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Check, Loader2, AlertCircle, Move, ZoomIn, ZoomOut, Maximize2, Crop, Info } from 'lucide-react';
import { EnquadramentoDaFoto, EnquadramentosDaFoto, VisualizacaoDaFoto } from '../types';
import {
  VISUALIZACOES_DA_FOTO,
  ZOOM_MAXIMO_DA_FOTO,
  compactarEnquadramentos,
  ehEnquadramentoPadrao,
  normalizarEnquadramento,
} from '../utils/enquadramentoDaFoto';
import { FotoEnquadrada } from './FotoEnquadrada';

interface AjusteDaFotoModalProps {
  isOpen: boolean;
  /** A foto como está no formulário (dataURL recém-enviado ou link já salvo). */
  src: string | null;
  /** Ajustes já salvos desta foto. */
  enquadramentos?: EnquadramentosDaFoto | null;
  /** É a capa — a foto que o menu, o catálogo e o cartão mostram. */
  ehCapa: boolean;
  onCancel: () => void;
  /** `null` quando as três visualizações ficaram centralizadas. */
  onApply: (enquadramentos: EnquadramentosDaFoto | null) => void;
  /** Recortar ou girar o próprio arquivo. A foto muda, então os ajustes dela recomeçam do centro. */
  onRecortar?: () => void;
}

type Ajustes = Record<VisualizacaoDaFoto, EnquadramentoDaFoto>;

const lerAjustes = (enquadramentos?: EnquadramentosDaFoto | null): Ajustes => ({
  menu: normalizarEnquadramento(enquadramentos?.menu),
  catalogo: normalizarEnquadramento(enquadramentos?.catalogo),
  cartao: normalizarEnquadramento(enquadramentos?.cartao),
});

const limitar = (valor: number, min: number, max: number) => Math.min(max, Math.max(min, valor));

/** Altura das miniaturas das três visualizações, embaixo do editor. */
const ALTURA_DA_PREVIA = 48;

/**
 * Ajuste da foto do procedimento em cada lugar onde ela aparece — menu, catálogo e cartão.
 *
 * Diferente do recorte (`ImageCropperModal`), aqui nada é cortado: a foto continua inteira e cada
 * visualização guarda só a posição e o zoom (`EnquadramentoDaFoto`). É isso que permite a mesma foto
 * ficar bem na faixa larga do menu e na coluna em retrato do catálogo ao mesmo tempo.
 *
 * O frame de cada aba tem o formato da visualização real e é desenhado pelo mesmo `FotoEnquadrada`
 * que as telas e as exportações usam — o que se vê aqui é o que sai lá.
 */
export const AjusteDaFotoModal: React.FC<AjusteDaFotoModalProps> = ({
  isOpen,
  src,
  enquadramentos,
  ehCapa,
  onCancel,
  onApply,
  onRecortar,
}) => {
  const [ativa, setAtiva] = useState<VisualizacaoDaFoto>('menu');
  const [ajustes, setAjustes] = useState<Ajustes>(() => lerAjustes(enquadramentos));
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [erro, setErro] = useState('');

  const wrapRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ dist: number; mid: { x: number; y: number } } | null>(null);

  const [larguraDisponivel, setLarguraDisponivel] = useState(340);
  const [alturaMaxima, setAlturaMaxima] = useState(340);

  // Cada abertura recomeça do que está salvo para a foto. `enquadramentos` é recriado a cada render
  // do pai; por isso entra só aqui, na abertura (ou na troca de foto).
  useEffect(() => {
    if (!isOpen) return;
    setAjustes(lerAjustes(enquadramentos));
    setAtiva('menu');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, src]);

  // O tamanho natural da foto é o que diz quanto ela sobra para cada lado em cada frame.
  useEffect(() => {
    if (!isOpen || !src) {
      setNatural(null);
      return;
    }
    let cancelado = false;
    setNatural(null);
    setErro('');
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.onload = () => {
      if (!cancelado) setNatural({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
    };
    img.onerror = () => {
      if (!cancelado) setErro('Não foi possível abrir esta foto.');
    };
    img.src = src;
    return () => {
      cancelado = true;
    };
  }, [isOpen, src]);

  useEffect(() => {
    if (!isOpen) return;
    const el = wrapRef.current;
    if (!el) return;
    const atualizar = () => setLarguraDisponivel(el.clientWidth || 340);
    atualizar();
    const observer = new ResizeObserver(atualizar);
    observer.observe(el);
    return () => observer.disconnect();
  }, [isOpen]);

  // O resto do modal (abas, controles, miniaturas, rodapé) ocupa ~520px; o frame fica com o que
  // sobra da tela, para o "Aplicar" aparecer sem rolar sempre que der.
  useEffect(() => {
    if (!isOpen) return;
    const atualizar = () => setAlturaMaxima(limitar(window.innerHeight - 520, 180, 340));
    atualizar();
    window.addEventListener('resize', atualizar);
    return () => window.removeEventListener('resize', atualizar);
  }, [isOpen]);

  // Na captura e sem propagar: o Esc fecha só o ajuste, não o painel do procedimento por baixo.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onCancel();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen, onCancel]);

  const info = VISUALIZACOES_DA_FOTO.find((v) => v.id === ativa) ?? VISUALIZACOES_DA_FOTO[0];
  const atual = ajustes[ativa];

  const frame = useMemo(() => {
    let w = Math.max(160, larguraDisponivel);
    let h = w / info.proporcao;
    if (h > alturaMaxima) {
      h = alturaMaxima;
      w = h * info.proporcao;
    }
    return { w: Math.round(w), h: Math.round(h) };
  }, [larguraDisponivel, alturaMaxima, info.proporcao]);

  /** Tamanho da foto no zoom 1 — cobrindo o frame, como o `object-fit: cover`. */
  const conteudo = useMemo(() => {
    if (!natural) return { w: frame.w, h: frame.h };
    const escala = Math.max(frame.w / natural.w, frame.h / natural.h);
    return { w: natural.w * escala, h: natural.h * escala };
  }, [natural, frame.w, frame.h]);

  /** Quanto a foto passa do frame, em px, em cada eixo — o curso disponível para arrastar. */
  const sobra = useCallback(
    (zoom: number) => ({ x: zoom * conteudo.w - frame.w, y: zoom * conteudo.h - frame.h }),
    [conteudo.w, conteudo.h, frame.w, frame.h]
  );

  const atualizarAtiva = useCallback(
    (fn: (anterior: EnquadramentoDaFoto) => EnquadramentoDaFoto) => {
      setAjustes((prev) => ({ ...prev, [ativa]: normalizarEnquadramento(fn(prev[ativa])) }));
    },
    [ativa]
  );

  /** Arrastar a foto `dx`/`dy` px: a posição anda na proporção do quanto ela sobra no frame. */
  const moverPor = useCallback(
    (dx: number, dy: number) => {
      atualizarAtiva((anterior) => {
        const s = sobra(anterior.zoom);
        return {
          ...anterior,
          x: s.x > 0.5 ? anterior.x - (dx / s.x) * 100 : anterior.x,
          y: s.y > 0.5 ? anterior.y - (dy / s.y) * 100 : anterior.y,
        };
      });
    },
    [atualizarAtiva, sobra]
  );

  /**
   * Zoom mantendo parado o ponto da foto sob `foco` (px a partir do canto do frame; padrão: centro).
   * Recebe o cálculo, e não o valor, para que vários eventos de pinça entre dois renders se somem.
   */
  const aplicarZoom = useCallback(
    (calcular: (zoomAnterior: number) => number, foco?: { x: number; y: number }) => {
      atualizarAtiva((anterior) => {
        const zoom = limitar(calcular(anterior.zoom), 1, ZOOM_MAXIMO_DA_FOTO);
        const antes = sobra(anterior.zoom);
        const depois = sobra(zoom);
        const eixo = (posicao: number, focoNoEixo: number, sobraAntes: number, sobraDepois: number) => {
          if (sobraDepois <= 0.5) return posicao;
          const bordaAntes = -(posicao / 100) * Math.max(0, sobraAntes);
          const pontoDaFoto = (focoNoEixo - bordaAntes) / anterior.zoom;
          const bordaDepois = focoNoEixo - pontoDaFoto * zoom;
          return (-bordaDepois / sobraDepois) * 100;
        };
        return {
          zoom,
          x: eixo(anterior.x, foco?.x ?? frame.w / 2, antes.x, depois.x),
          y: eixo(anterior.y, foco?.y ?? frame.h / 2, antes.y, depois.y),
        };
      });
    },
    [atualizarAtiva, sobra, frame.w, frame.h]
  );

  const zoomPara = (zoom: number) => aplicarZoom(() => zoom);

  // Wheel precisa de listener não-passivo para poder cancelar a rolagem da página.
  useEffect(() => {
    const el = frameRef.current;
    if (!el || !natural) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const fator = Math.exp(-e.deltaY * 0.0018);
      aplicarZoom((z) => z * fator, { x: e.clientX - rect.left, y: e.clientY - rect.top });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [natural, aplicarZoom]);

  const lerPinca = () => {
    const pontos: { x: number; y: number }[] = [];
    pointers.current.forEach((p) => pontos.push(p));
    const [a, b] = pontos;
    return {
      dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!natural) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) pinchRef.current = lerPinca();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const anterior = pointers.current.get(e.pointerId);
    if (!anterior || !natural) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 1) {
      moverPor(e.clientX - anterior.x, e.clientY - anterior.y);
      return;
    }

    if (pointers.current.size === 2 && pinchRef.current) {
      const agora = lerPinca();
      const rect = e.currentTarget.getBoundingClientRect();
      const fator = agora.dist / pinchRef.current.dist;
      aplicarZoom((z) => z * fator, { x: agora.mid.x - rect.left, y: agora.mid.y - rect.top });
      moverPor(agora.mid.x - pinchRef.current.mid.x, agora.mid.y - pinchRef.current.mid.y);
      pinchRef.current = agora;
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchRef.current = null;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const passo = e.shiftKey ? 24 : 8;
    if (e.key === 'ArrowLeft') { e.preventDefault(); moverPor(passo, 0); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); moverPor(-passo, 0); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moverPor(0, passo); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); moverPor(0, -passo); }
    else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomPara(atual.zoom * 1.15); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomPara(atual.zoom / 1.15); }
  };

  const centralizar = () => setAjustes((prev) => ({ ...prev, [ativa]: normalizarEnquadramento(null) }));

  if (!isOpen || !src) return null;

  return (
    /* `my-auto` em vez de `items-center`: num celular baixo o modal passa da tela, e centralizado
       pelo flex o topo ficaria fora do alcance da rolagem. */
    <div className="fixed inset-0 z-70 overflow-y-auto bg-black/70 flex items-start justify-center p-3 sm:p-6 animate-fadeIn">
      <div className="my-auto w-full max-w-lg bg-surface rounded-sm border border-white/60 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-black/5 bg-white/70">
          <div className="min-w-0">
            <h3 className="text-xs font-bold uppercase tracking-widest text-ink">Ajustar foto por visualização</h3>
            <p className="text-body text-gray-500 mt-0.5">
              Posicione a foto em cada lugar onde ela aparece. A foto original continua inteira.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-xs text-gray-400 hover:text-ink hover:bg-black/5 transition-colors shrink-0"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {/* Abas: uma por visualização */}
          <div role="tablist" aria-label="Visualização" className="grid grid-cols-3 gap-1 p-1 bg-line-soft rounded-sm">
            {VISUALIZACOES_DA_FOTO.map((v) => {
              const selecionada = v.id === ativa;
              return (
                <button
                  key={v.id}
                  type="button"
                  role="tab"
                  aria-selected={selecionada}
                  onClick={() => setAtiva(v.id)}
                  className={`relative px-2 py-1.5 rounded-xs text-body font-semibold transition-colors ${
                    selecionada ? 'bg-ink text-white shadow-xs' : 'text-ink-soft hover:text-ink hover:bg-white/70'
                  }`}
                >
                  {v.rotulo}
                  {!ehEnquadramentoPadrao(ajustes[v.id]) && (
                    <span
                      className={`absolute top-1 right-1.5 w-1.5 h-1.5 rounded-full ${selecionada ? 'bg-brand-light' : 'bg-brand'}`}
                      title="Posição ajustada"
                    />
                  )}
                </button>
              );
            })}
          </div>
          <p className="text-body text-gray-500 -mt-1">{info.onde}</p>

          {/* Frame no formato da visualização */}
          <div ref={wrapRef} className="w-full flex justify-center">
            {erro || !natural ? (
              <div
                className="w-full flex flex-col items-center justify-center gap-2 bg-line-soft rounded-xs text-gray-500"
                style={{ height: Math.min(alturaMaxima, 220) }}
              >
                {erro ? (
                  <>
                    <AlertCircle className="w-5 h-5 text-red-500" />
                    <span className="text-xs text-red-600 px-6 text-center">{erro}</span>
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
                aria-label={`Arraste para posicionar a foto no ${info.rotulo.toLowerCase()}`}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onKeyDown={handleKeyDown}
                className="relative overflow-hidden rounded-xs bg-ink cursor-grab active:cursor-grabbing select-none outline-hidden focus-visible:ring-2 focus-visible:ring-brand"
                style={{ width: frame.w, height: frame.h, touchAction: 'none' }}
              >
                <FotoEnquadrada src={src} enquadramento={atual} className="w-full h-full pointer-events-none" />

                {/* Guias de terços */}
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute inset-y-0 left-1/3 w-px bg-white/25" />
                  <div className="absolute inset-y-0 left-2/3 w-px bg-white/25" />
                  <div className="absolute inset-x-0 top-1/3 h-px bg-white/25" />
                  <div className="absolute inset-x-0 top-2/3 h-px bg-white/25" />
                  <div className="absolute inset-0 ring-1 ring-inset ring-white/40" />
                </div>
              </div>
            )}
          </div>

          {natural && !erro && (
            <>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => zoomPara(atual.zoom / 1.2)}
                  disabled={atual.zoom <= 1}
                  className="p-1.5 rounded-xs bg-white border border-gray-200 text-ink hover:border-brand disabled:opacity-40 transition-colors"
                  aria-label="Diminuir zoom"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <input
                  type="range"
                  min={1}
                  max={ZOOM_MAXIMO_DA_FOTO}
                  step={0.01}
                  value={atual.zoom}
                  onChange={(e) => zoomPara(parseFloat(e.target.value))}
                  className="flex-1 accent-brand"
                  aria-label="Zoom"
                />
                <button
                  type="button"
                  onClick={() => zoomPara(atual.zoom * 1.2)}
                  disabled={atual.zoom >= ZOOM_MAXIMO_DA_FOTO}
                  className="p-1.5 rounded-xs bg-white border border-gray-200 text-ink hover:border-brand disabled:opacity-40 transition-colors"
                  aria-label="Aumentar zoom"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={centralizar}
                  className="p-1.5 rounded-xs bg-white border border-gray-200 text-ink hover:border-brand transition-colors"
                  aria-label={`Centralizar a foto no ${info.rotulo.toLowerCase()}`}
                  title="Centralizar"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              </div>

              <p className="flex items-center gap-1.5 text-body text-gray-500">
                <Move className="w-3.5 h-3.5 shrink-0 text-gray-400" />
                Arraste para posicionar · role o mouse ou use dois dedos para o zoom.
              </p>

              {/* As três de uma vez — tocar numa miniatura abre a aba dela */}
              <div className="flex items-end justify-center gap-3 pt-1">
                {VISUALIZACOES_DA_FOTO.map((v) => {
                  const selecionada = v.id === ativa;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setAtiva(v.id)}
                      className="flex flex-col items-center gap-1 group"
                      aria-label={`Ver ajuste do ${v.rotulo.toLowerCase()}`}
                    >
                      <FotoEnquadrada
                        src={src}
                        enquadramento={ajustes[v.id]}
                        style={{ height: ALTURA_DA_PREVIA, width: Math.round(ALTURA_DA_PREVIA * v.proporcao) }}
                        className={`rounded-xs bg-line-soft ring-2 transition-all ${
                          selecionada ? 'ring-brand' : 'ring-transparent group-hover:ring-brand/40'
                        }`}
                      />
                      <span
                        className={`text-label font-semibold uppercase tracking-wider ${
                          selecionada ? 'text-brand' : 'text-gray-400'
                        }`}
                      >
                        {v.rotulo}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {onRecortar && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={onRecortar}
                className="px-2.5 py-1.5 rounded-xs text-body font-medium text-gray-500 hover:text-ink hover:bg-black/5 transition-colors flex items-center gap-1.5"
                title="Corta o próprio arquivo da foto — os ajustes desta foto voltam ao centro"
              >
                <Crop className="w-3.5 h-3.5" />
                Recortar ou girar a foto original
              </button>
            </div>
          )}

          {!ehCapa && (
            <p className="flex items-start gap-1.5 text-body text-gray-500 bg-line-soft rounded-xs px-2.5 py-2">
              <Info className="w-3.5 h-3.5 shrink-0 mt-px text-brand" />
              O menu, o catálogo e o cartão mostram a capa (a primeira foto). O ajuste desta foto passa a
              valer quando ela virar a capa — e já vale na tela de detalhes, no formato do cartão.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-black/5 bg-white/70 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-sm border border-gray-200 bg-white text-label font-semibold uppercase tracking-wider text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onApply(compactarEnquadramentos(ajustes))}
            disabled={!natural || !!erro}
            className="px-5 py-2 rounded-sm bg-brand text-white text-label font-semibold uppercase tracking-wider shadow-xs hover:bg-brand-hover active:scale-95 transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
          >
            <Check className="w-3.5 h-3.5" />
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
};

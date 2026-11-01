import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Loader2, AlertCircle, ZoomIn, ZoomOut, Maximize2, Crop, Info, Move } from 'lucide-react';
import { EnquadramentoDaFoto, EnquadramentosDaFoto, VisualizacaoDaFoto } from '../types';
import {
  InfoDaVisualizacao,
  RecorteDaFoto,
  TamanhoDaFoto,
  VISUALIZACOES_DA_FOTO,
  ZOOM_MAXIMO_DA_FOTO,
  compactarEnquadramentos,
  ehEnquadramentoPadrao,
  enquadramentoDoRecorte,
  limitarRecorte,
  normalizarEnquadramento,
  recorteDoEnquadramento,
  recorteMaximo,
} from '../utils/enquadramentoDaFoto';
import { FotoEnquadrada } from './FotoEnquadrada';

interface AjusteDaFotoModalProps {
  isOpen: boolean;
  /** A foto como está no formulário (dataURL recém-enviado ou link já salvo). */
  src: string | null;
  /** Recortes já salvos desta foto. */
  enquadramentos?: EnquadramentosDaFoto | null;
  /** É a capa — a foto que a lista de procedimentos, o catálogo e o card individual mostram. */
  ehCapa: boolean;
  /** Nome e categoria do procedimento, para a prévia de cada lugar parecer o lugar de verdade. */
  titulo?: string;
  categoria?: string;
  onCancel: () => void;
  /** `null` quando os três lugares ficaram com a foto inteira, centralizada. */
  onApply: (enquadramentos: EnquadramentosDaFoto | null) => void;
  /** Girar ou cortar o próprio arquivo. A foto muda, então os recortes dela recomeçam. */
  onRecortar?: () => void;
}

type Ajustes = Record<VisualizacaoDaFoto, EnquadramentoDaFoto>;

const lerAjustes = (enquadramentos?: EnquadramentosDaFoto | null): Ajustes => ({
  menu: normalizarEnquadramento(enquadramentos?.menu),
  catalogo: normalizarEnquadramento(enquadramentos?.catalogo),
  cartao: normalizarEnquadramento(enquadramentos?.cartao),
});

const limitar = (valor: number, min: number, max: number) => Math.min(max, Math.max(min, valor));

type Canto = 'nw' | 'ne' | 'sw' | 'se';

type Gesto =
  | { tipo: 'mover'; inicio: { x: number; y: number }; recorte: RecorteDaFoto }
  | { tipo: 'canto'; canto: Canto; inicio: { x: number; y: number }; recorte: RecorteDaFoto }
  | { tipo: 'pinca'; distancia: number; recorte: RecorteDaFoto };

const CANTOS: { canto: Canto; classe: string; cursor: string }[] = [
  { canto: 'nw', classe: '-left-4 -top-4', cursor: 'nwse-resize' },
  { canto: 'ne', classe: '-right-4 -top-4', cursor: 'nesw-resize' },
  { canto: 'sw', classe: '-left-4 -bottom-4', cursor: 'nesw-resize' },
  { canto: 'se', classe: '-right-4 -bottom-4', cursor: 'nwse-resize' },
];

/**
 * Recorte da foto do procedimento para cada lugar onde ela aparece — a lista de procedimentos, o
 * catálogo e o card individual.
 *
 * Cada lugar tem um formato, e um corte só nunca fica bom nos três. Aqui a foto aparece inteira, com
 * uma moldura no formato exato do lugar escolhido: arrastar move a moldura, puxar os cantos aumenta
 * ou diminui, a roda do mouse (ou os dois dedos) aproxima. O que fica dentro dela é o que aparece
 * lá — ao lado, a prévia mostra o lugar de verdade.
 *
 * Nada é cortado do arquivo: cada lugar grava só a posição e o zoom (`EnquadramentoDaFoto`), e as
 * telas e as exportações desenham com o mesmo `FotoEnquadrada`. Girar ou cortar a foto em si é o
 * `ImageCropperModal`, pelo botão do rodapé.
 *
 * Vai para o `body` por portal: dentro do painel lateral (que tem `transform`), um `fixed` ficaria
 * preso à largura do painel, e o editor precisa da tela.
 */
export const AjusteDaFotoModal: React.FC<AjusteDaFotoModalProps> = ({
  isOpen,
  src,
  enquadramentos,
  ehCapa,
  titulo,
  categoria,
  onCancel,
  onApply,
  onRecortar,
}) => {
  const [ativa, setAtiva] = useState<VisualizacaoDaFoto>('menu');
  const [ajustes, setAjustes] = useState<Ajustes>(() => lerAjustes(enquadramentos));
  const [foto, setFoto] = useState<TamanhoDaFoto | null>(null);
  const [erro, setErro] = useState('');

  // Cada abertura recomeça do que está salvo para a foto. `enquadramentos` é recriado a cada render
  // do pai; por isso entra só aqui, na abertura (ou na troca de foto).
  useEffect(() => {
    if (!isOpen) return;
    setAjustes(lerAjustes(enquadramentos));
    setAtiva('menu');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, src]);

  // O tamanho natural da foto é a régua do recorte: tudo é guardado em pixels dela.
  useEffect(() => {
    if (!isOpen || !src) {
      setFoto(null);
      return;
    }
    let cancelado = false;
    setFoto(null);
    setErro('');
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.onload = () => {
      if (!cancelado) setFoto({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
    };
    img.onerror = () => {
      if (!cancelado) setErro('Não foi possível abrir esta foto.');
    };
    img.src = src;
    return () => {
      cancelado = true;
    };
  }, [isOpen, src]);

  // Na captura e sem propagar: o Esc fecha só o recorte, não o painel do procedimento por baixo.
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

  const definirAtual = useCallback(
    (enquadramento: EnquadramentoDaFoto) => setAjustes((prev) => ({ ...prev, [ativa]: enquadramento })),
    [ativa]
  );

  const zoomPara = (zoom: number) => {
    if (!foto) return;
    // Aproxima mantendo o centro do recorte no lugar.
    const r = recorteDoEnquadramento(atual, foto, info.proporcao);
    const largura = recorteMaximo(foto, info.proporcao).largura / limitar(zoom, 1, ZOOM_MAXIMO_DA_FOTO);
    const altura = largura / info.proporcao;
    const novo = limitarRecorte(
      {
        largura,
        altura,
        left: r.left + r.largura / 2 - largura / 2,
        top: r.top + r.altura / 2 - altura / 2,
      },
      foto,
      info.proporcao
    );
    definirAtual(enquadramentoDoRecorte(novo, foto, info.proporcao));
  };

  if (!isOpen || !src) return null;

  const ajustados = VISUALIZACOES_DA_FOTO.filter((v) => !ehEnquadramentoPadrao(ajustes[v.id])).length;

  return createPortal(
    <div className="fixed inset-0 z-70 bg-black/75 flex items-stretch justify-center sm:p-5 animate-fadeIn">
      <div className="w-full max-w-6xl h-full sm:max-h-[920px] sm:my-auto bg-surface sm:rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Cabeçalho */}
        <div className="shrink-0 flex items-start justify-between gap-3 px-4 sm:px-5 py-3 border-b border-black/5 bg-white/70">
          <div className="min-w-0">
            <h3 className="font-serif-luxury text-[22px] font-semibold text-ink leading-tight">
              Recortar a foto para cada lugar
            </h3>
            <p className="text-body text-gray-500 mt-0.5">
              Cada lugar tem um formato. Escolha o pedaço da foto que aparece em cada um — o arquivo
              original continua inteiro.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-gray-400 hover:text-ink hover:bg-black/5 transition-colors"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Abas: um lugar por aba, com a miniatura do recorte dele */}
        <div role="tablist" aria-label="Lugar" className="shrink-0 grid grid-cols-3 gap-1.5 sm:gap-2 px-3 sm:px-5 pt-3">
          {VISUALIZACOES_DA_FOTO.map((v) => {
            const selecionada = v.id === ativa;
            const ajustada = !ehEnquadramentoPadrao(ajustes[v.id]);
            const alturaMiniatura = 34;
            return (
              <button
                key={v.id}
                type="button"
                role="tab"
                aria-selected={selecionada}
                onClick={() => setAtiva(v.id)}
                className={`relative flex flex-col sm:flex-row items-center sm:items-center gap-1.5 sm:gap-2.5 px-2 sm:px-3 py-2 rounded-lg border text-left transition-colors ${
                  selecionada
                    ? 'bg-ink border-ink text-white shadow-sm'
                    : 'bg-white border-black/8 text-ink hover:border-brand/60'
                }`}
              >
                <FotoEnquadrada
                  src={src}
                  enquadramento={ajustes[v.id]}
                  className="shrink-0 rounded-sm bg-line-soft"
                  style={{ height: alturaMiniatura, width: Math.min(96, Math.round(alturaMiniatura * v.proporcao)) }}
                />
                <span className="min-w-0 text-center sm:text-left">
                  <span className="block text-[13px] font-semibold leading-tight">{v.rotulo}</span>
                  <span className={`hidden sm:block text-label ${selecionada ? 'text-cream/70' : 'text-muted'}`}>
                    {v.formato}
                  </span>
                </span>
                {ajustada && (
                  <span
                    className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full ${selecionada ? 'bg-brand-light' : 'bg-brand'}`}
                    title="Recorte ajustado"
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Editor + prévia */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-4 px-3 sm:px-5 py-3">
          <div className="flex-1 min-w-0 min-h-0 flex flex-col gap-2.5">
            {erro || !foto ? (
              <div className="flex-1 min-h-[220px] flex flex-col items-center justify-center gap-2 bg-line-soft rounded-lg text-gray-500">
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
              <EditorDeRecorte
                key={ativa}
                src={src}
                foto={foto}
                visualizacao={info}
                enquadramento={atual}
                onChange={definirAtual}
              />
            )}

            {foto && !erro && (
              <div className="shrink-0 space-y-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => zoomPara(atual.zoom / 1.2)}
                    disabled={atual.zoom <= 1}
                    className="w-9 h-9 shrink-0 rounded-lg bg-white border border-black/10 text-ink flex items-center justify-center hover:border-brand disabled:opacity-40 transition-colors"
                    aria-label="Mostrar mais da foto"
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
                    aria-label={`Aproximar a foto no ${info.rotulo.toLowerCase()}`}
                  />
                  <button
                    type="button"
                    onClick={() => zoomPara(atual.zoom * 1.2)}
                    disabled={atual.zoom >= ZOOM_MAXIMO_DA_FOTO}
                    className="w-9 h-9 shrink-0 rounded-lg bg-white border border-black/10 text-ink flex items-center justify-center hover:border-brand disabled:opacity-40 transition-colors"
                    aria-label="Aproximar"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => definirAtual(normalizarEnquadramento(null))}
                    className="h-9 shrink-0 px-3 rounded-lg bg-white border border-black/10 text-body font-medium text-ink flex items-center gap-1.5 hover:border-brand transition-colors"
                    title="Volta ao maior recorte possível, centralizado"
                  >
                    <Maximize2 className="w-4 h-4" />
                    <span className="hidden sm:inline">Mostrar o máximo</span>
                  </button>
                </div>
                <p className="flex items-start gap-1.5 text-body text-gray-500 leading-snug">
                  <Move className="w-3.5 h-3.5 shrink-0 mt-0.5 text-gray-400" />
                  <span>
                    Arraste a moldura para mover · puxe os cantos para aumentar ou diminuir · role o
                    mouse ou use dois dedos para aproximar.
                    {info.variacao && (
                      <>
                        {' '}
                        <strong className="font-semibold text-ink-soft">
                          {info.variacao.rotulo}, aparece só o trecho tracejado.
                        </strong>
                      </>
                    )}
                  </span>
                </p>
              </div>
            )}
          </div>

          {/* Como fica: o lugar de verdade, só no computador — no celular as miniaturas das abas
              já mostram o resultado. */}
          <aside className="hidden lg:flex w-[300px] shrink-0 flex-col gap-3 overflow-y-auto">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-brand">
              Como fica · {info.rotulo}
            </p>
            <PreviaNoLugar
              visualizacao={info}
              src={src}
              enquadramento={atual}
              titulo={titulo}
              categoria={categoria}
            />
            {info.variacao && (
              <div className="space-y-1.5">
                <p className="text-label font-semibold uppercase tracking-wider text-muted">{info.variacao.rotulo}</p>
                <FotoEnquadrada
                  src={src}
                  enquadramento={atual}
                  className="w-full rounded-lg bg-line-soft"
                  style={{ aspectRatio: String(info.variacao.proporcao) }}
                />
              </div>
            )}
            <p className="text-body text-gray-500 leading-snug">{info.onde}.</p>
            {!ehCapa && (
              <p className="flex items-start gap-1.5 text-body text-gray-500 bg-line-soft rounded-lg px-2.5 py-2 leading-snug">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-brand" />
                A lista, o catálogo e o card mostram a capa (a primeira foto). O recorte desta foto vale
                quando ela virar a capa — e já vale na tela de detalhes, no formato do card individual.
              </p>
            )}
          </aside>
        </div>

        {/* Rodapé */}
        <div className="shrink-0 px-3 sm:px-5 py-3 border-t border-black/5 bg-white/70 flex items-center gap-2">
          {onRecortar && (
            <button
              type="button"
              onClick={onRecortar}
              className="shrink-0 h-10 px-2.5 sm:px-3 rounded-lg text-body font-medium text-gray-600 hover:text-ink hover:bg-black/5 transition-colors flex items-center gap-1.5"
              title="Gira ou corta o próprio arquivo — os recortes desta foto recomeçam"
            >
              <Crop className="w-4 h-4" />
              <span className="hidden sm:inline">Girar ou cortar a foto original</span>
              <span className="sm:hidden">Girar</span>
            </button>
          )}
          <p className="flex-1 min-w-0 text-right pr-2 text-body text-muted truncate">
            <span className="hidden md:inline">
              {ajustados === 0
                ? 'Os três lugares estão com a foto centralizada.'
                : `${ajustados} de 3 lugares com recorte próprio.`}
            </span>
          </p>
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 h-10 px-4 rounded-lg border border-black/10 bg-white text-label font-semibold uppercase tracking-wider text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onApply(compactarEnquadramentos(ajustes))}
            disabled={!foto || !!erro}
            className="shrink-0 h-10 px-5 rounded-lg bg-brand text-white text-label font-semibold uppercase tracking-wider shadow-xs hover:bg-brand-hover active:scale-95 transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
          >
            <Check className="w-4 h-4" />
            Aplicar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

interface EditorDeRecorteProps {
  src: string;
  foto: TamanhoDaFoto;
  visualizacao: InfoDaVisualizacao;
  enquadramento: EnquadramentoDaFoto;
  onChange: (enquadramento: EnquadramentoDaFoto) => void;
}

/**
 * A foto inteira, encaixada no espaço, com a moldura do recorte por cima. Tudo é calculado em
 * pixels da foto original e só convertido para a tela na hora de desenhar e de ler o ponteiro.
 */
const EditorDeRecorte: React.FC<EditorDeRecorteProps> = ({
  src,
  foto,
  visualizacao,
  enquadramento,
  onChange,
}) => {
  const { proporcao } = visualizacao;
  const areaRef = useRef<HTMLDivElement>(null);
  const fotoRef = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState({ w: 0, h: 0 });
  const ponteiros = useRef(new Map<number, { x: number; y: number }>());
  const gestoRef = useRef<Gesto | null>(null);

  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const medir = () => setArea({ w: el.clientWidth, h: el.clientHeight });
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  // A foto inteira cabendo no espaço, com uma margem para as alças dos cantos não saírem dele.
  const MARGEM = 20;
  const escala =
    area.w > MARGEM * 2 && area.h > MARGEM * 2
      ? Math.min((area.w - MARGEM * 2) / foto.w, (area.h - MARGEM * 2) / foto.h, 4)
      : 0;
  const tela = { w: foto.w * escala, h: foto.h * escala };

  const recorte = recorteDoEnquadramento(enquadramento, foto, proporcao);
  const variacao = visualizacao.variacao
    ? recorteDoEnquadramento(enquadramento, foto, visualizacao.variacao.proporcao)
    : null;

  const aplicar = useCallback(
    (novo: RecorteDaFoto) => onChange(enquadramentoDoRecorte(limitarRecorte(novo, foto, proporcao), foto, proporcao)),
    [onChange, foto, proporcao]
  );

  /** Muda o tamanho do recorte deixando parado o ponto `px`/`py` da foto. */
  const redimensionarEm = useCallback(
    (base: RecorteDaFoto, largura: number, px: number, py: number) => {
      const maximo = recorteMaximo(foto, proporcao).largura;
      const nova = limitar(largura, maximo / ZOOM_MAXIMO_DA_FOTO, maximo);
      const relX = (px - base.left) / base.largura;
      const relY = (py - base.top) / base.altura;
      const altura = nova / proporcao;
      aplicar({ largura: nova, altura, left: px - relX * nova, top: py - relY * altura });
    },
    [aplicar, foto, proporcao]
  );

  // Roda do mouse: listener não-passivo, para poder cancelar a rolagem da página.
  useEffect(() => {
    const el = fotoRef.current;
    if (!el || escala <= 0) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = (e.clientX - rect.left) / escala;
      const py = (e.clientY - rect.top) / escala;
      const atual = recorteDoEnquadramento(enquadramento, foto, proporcao);
      redimensionarEm(atual, atual.largura * Math.exp(e.deltaY * 0.0018), px, py);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [escala, enquadramento, foto, proporcao, redimensionarEm]);

  /** Os ponteiros na tela agora, na ordem em que encostaram. */
  const pontos = () => {
    const lista: { x: number; y: number }[] = [];
    ponteiros.current.forEach((p) => lista.push(p));
    return lista;
  };

  const distanciaDaPinca = () => {
    const [a, b] = pontos();
    return Math.hypot(a.x - b.x, a.y - b.y) || 1;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (escala <= 0) return;
    e.preventDefault();
    // Sem o `preventDefault` acima a página tentaria selecionar e arrastar a imagem; o foco vem à
    // mão, para as setas do teclado funcionarem logo depois de um clique.
    e.currentTarget.focus({ preventScroll: true });
    e.currentTarget.setPointerCapture(e.pointerId);
    ponteiros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const atual = recorteDoEnquadramento(enquadramento, foto, proporcao);
    if (ponteiros.current.size === 2) {
      gestoRef.current = { tipo: 'pinca', distancia: distanciaDaPinca(), recorte: atual };
      return;
    }
    const canto = (e.target as HTMLElement).closest<HTMLElement>('[data-canto]')?.dataset.canto as Canto | undefined;
    const inicio = { x: e.clientX, y: e.clientY };
    gestoRef.current = canto
      ? { tipo: 'canto', canto, inicio, recorte: atual }
      : { tipo: 'mover', inicio, recorte: atual };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!ponteiros.current.has(e.pointerId)) return;
    ponteiros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const gesto = gestoRef.current;
    if (!gesto || escala <= 0) return;

    if (gesto.tipo === 'pinca') {
      if (ponteiros.current.size < 2) return;
      const r = gesto.recorte;
      // Abrir os dedos aproxima: o recorte encolhe em volta do centro dele.
      redimensionarEm(r, (r.largura * gesto.distancia) / distanciaDaPinca(), r.left + r.largura / 2, r.top + r.altura / 2);
      return;
    }

    const dx = (e.clientX - gesto.inicio.x) / escala;
    const dy = (e.clientY - gesto.inicio.y) / escala;
    const r = gesto.recorte;

    if (gesto.tipo === 'mover') {
      aplicar({ ...r, left: r.left + dx, top: r.top + dy });
      return;
    }

    // Canto: o canto oposto fica parado, e o tamanho segue o eixo em que o ponteiro andou mais.
    const sx = gesto.canto === 'ne' || gesto.canto === 'se' ? 1 : -1;
    const sy = gesto.canto === 'sw' || gesto.canto === 'se' ? 1 : -1;
    const ancoraX = sx > 0 ? r.left : r.left + r.largura;
    const ancoraY = sy > 0 ? r.top : r.top + r.altura;
    const porX = r.largura + sx * dx;
    const porY = (r.altura + sy * dy) * proporcao;
    let largura = Math.abs(porX - r.largura) >= Math.abs(porY - r.largura) ? porX : porY;
    const maximo = recorteMaximo(foto, proporcao).largura;
    const livreX = sx > 0 ? foto.w - ancoraX : ancoraX;
    const livreY = (sy > 0 ? foto.h - ancoraY : ancoraY) * proporcao;
    largura = limitar(largura, maximo / ZOOM_MAXIMO_DA_FOTO, Math.min(maximo, livreX, livreY));
    const altura = largura / proporcao;
    aplicar({
      largura,
      altura,
      left: sx > 0 ? ancoraX : ancoraX - largura,
      top: sy > 0 ? ancoraY : ancoraY - altura,
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    ponteiros.current.delete(e.pointerId);
    const restante = pontos()[0];
    // Tirando um dedo da pinça, o outro continua arrastando de onde está.
    gestoRef.current = restante
      ? { tipo: 'mover', inicio: restante, recorte: recorteDoEnquadramento(enquadramento, foto, proporcao) }
      : null;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const passo = (e.shiftKey ? 0.08 : 0.02) * Math.max(foto.w, foto.h);
    const r = recorte;
    const mover = (dx: number, dy: number) => {
      e.preventDefault();
      aplicar({ ...r, left: r.left + dx, top: r.top + dy });
    };
    if (e.key === 'ArrowLeft') mover(-passo, 0);
    else if (e.key === 'ArrowRight') mover(passo, 0);
    else if (e.key === 'ArrowUp') mover(0, -passo);
    else if (e.key === 'ArrowDown') mover(0, passo);
    else if (e.key === '+' || e.key === '=' || e.key === '-' || e.key === '_') {
      e.preventDefault();
      const fator = e.key === '+' || e.key === '=' ? 1 / 1.15 : 1.15;
      redimensionarEm(r, r.largura * fator, r.left + r.largura / 2, r.top + r.altura / 2);
    }
  };

  const naTela = (r: RecorteDaFoto) => ({
    left: r.left * escala,
    top: r.top * escala,
    width: r.largura * escala,
    height: r.altura * escala,
  });

  return (
    <div ref={areaRef} className="flex-1 min-h-[240px] relative rounded-lg bg-[#141414] overflow-hidden">
      {escala > 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            ref={fotoRef}
            tabIndex={0}
            role="application"
            aria-label={`Recorte da foto para ${visualizacao.rotulo}. Arraste para mover, setas do teclado para ajustar, mais e menos para aproximar.`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onKeyDown={handleKeyDown}
            className="relative select-none outline-hidden focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-4 focus-visible:ring-offset-[#141414] cursor-move"
            style={{ width: tela.w, height: tela.h, touchAction: 'none' }}
          >
            {/* Só a foto e o escurecido são cortados na borda dela; as alças, logo abaixo, não. */}
            <div className="absolute inset-0 overflow-hidden">
            <img
              src={src}
              alt=""
              draggable={false}
              referrerPolicy="no-referrer"
              className="absolute inset-0 w-full h-full pointer-events-none"
            />

            {/* A moldura: o que está fora dela escurece (a sombra enorme), o que está dentro é o
                que aparece no lugar. */}
            <div
              className="absolute pointer-events-none"
              style={{
                ...naTela(recorte),
                boxShadow: '0 0 0 9999px rgba(10,10,10,0.62)',
                outline: '2px solid #FFFFFF',
              }}
            >
              <div className="absolute inset-y-0 left-1/3 w-px bg-white/35" />
              <div className="absolute inset-y-0 left-2/3 w-px bg-white/35" />
              <div className="absolute inset-x-0 top-1/3 h-px bg-white/35" />
              <div className="absolute inset-x-0 top-2/3 h-px bg-white/35" />
            </div>

            {variacao && (
              <div
                className="absolute pointer-events-none border-2 border-dashed border-brand-light"
                style={naTela(variacao)}
              >
                <span className="absolute left-1 bottom-1 px-1.5 py-0.5 rounded-sm bg-black/65 text-[10px] font-semibold text-white whitespace-nowrap">
                  {visualizacao.variacao!.rotulo}
                </span>
              </div>
            )}
            </div>

            {/* Cantos: alça visível pequena, área de toque de 32px. */}
            <div className="absolute pointer-events-none" style={naTela(recorte)}>
              {CANTOS.map(({ canto, classe, cursor }) => (
                <div
                  key={canto}
                  data-canto={canto}
                  className={`absolute w-8 h-8 flex items-center justify-center pointer-events-auto ${classe}`}
                  style={{ cursor }}
                >
                  <span className="w-3.5 h-3.5 rounded-full bg-white border-2 border-brand shadow-md" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface PreviaNoLugarProps {
  visualizacao: InfoDaVisualizacao;
  src: string;
  enquadramento: EnquadramentoDaFoto;
  titulo?: string;
  categoria?: string;
}

const linhas = (larguras: string[], classe = 'bg-line-soft') =>
  larguras.map((w, i) => <div key={i} className={`h-1.5 rounded-full ${classe}`} style={{ width: w }} />);

/** O lugar de verdade, em miniatura: a foto no formato dele e o que fica em volta (e por cima). */
const PreviaNoLugar: React.FC<PreviaNoLugarProps> = ({ visualizacao, src, enquadramento, titulo, categoria }) => {
  const nome = titulo?.trim() || 'Nome do procedimento';
  const grupo = categoria?.trim() || 'Categoria';
  const foto = (classe = '') => (
    <FotoEnquadrada
      src={src}
      enquadramento={enquadramento}
      className={`w-full bg-line-soft ${classe}`}
      style={{ aspectRatio: String(visualizacao.proporcao) }}
    />
  );

  if (visualizacao.id === 'menu') {
    return (
      <div className="bg-white rounded-2xl border border-black/7 shadow-sm overflow-hidden">
        {foto()}
        <div className="p-3 space-y-1.5">
          <p className="text-label font-semibold uppercase tracking-wider text-brand truncate">{grupo}</p>
          <p className="font-serif-luxury text-[17px] font-semibold text-ink leading-tight line-clamp-2">{nome}</p>
          <div className="pt-1 space-y-1.5">{linhas(['60%', '40%'])}</div>
        </div>
      </div>
    );
  }

  if (visualizacao.id === 'catalogo') {
    // Na página do catálogo a categoria fica numa etiqueta escura por cima da foto.
    return (
      <div className="flex bg-white rounded-lg border border-black/7 shadow-sm overflow-hidden">
        <div className="relative w-[44%] shrink-0">
          {foto()}
          <span className="absolute top-1.5 left-1.5 max-w-[85%] truncate px-1.5 py-0.5 rounded-xs bg-ink/90 text-brand-light text-[7px] font-bold uppercase tracking-wider">
            {grupo}
          </span>
        </div>
        <div className="flex-1 min-w-0 p-3 flex flex-col gap-1.5">
          <p className="font-serif-luxury text-[14px] font-semibold text-ink leading-tight line-clamp-3">{nome}</p>
          <div className="space-y-1.5 pt-1">{linhas(['90%', '80%', '85%', '60%'])}</div>
          <div className="mt-auto h-6 rounded-sm bg-ink" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-lg border border-black/7 shadow-sm overflow-hidden">
      <div className="bg-ink px-2.5 py-1.5">
        <p className="text-[8px] font-semibold uppercase tracking-wider text-brand-light truncate">{grupo}</p>
      </div>
      <div className="flex gap-2.5 p-2.5">
        <div className="w-[48%] shrink-0 space-y-2">
          {foto('rounded-lg')}
          <div className="bg-white rounded-md p-1.5 space-y-1">{linhas(['80%', '70%', '75%'])}</div>
        </div>
        <div className="flex-1 min-w-0 space-y-1.5 pt-0.5">
          <p className="font-serif-luxury text-[13px] font-semibold text-ink leading-tight line-clamp-3">{nome}</p>
          <div className="space-y-1.5">{linhas(['95%', '85%', '90%', '70%', '80%'])}</div>
        </div>
      </div>
    </div>
  );
};

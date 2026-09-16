import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { LaserArea } from '../../types';
import {
  areaParaPath,
  areaNoPonto,
  formaParaPath,
  posicionarBotoesDoAnel,
} from '../../utils/laserAreas';
import { formatBRL } from '../../utils/formatters';

/**
 * O manequim com as áreas desenhadas por cima — a peça visual que o cadastro, a anamnese e o
 * orçamento reaproveitam.
 *
 * Um componente só, e não um por tela, porque a linguagem visual precisa ser a mesma nos três
 * lugares: a paciente escolhe "Virilha Completa" na ficha e reconhece a mesma mancha no orçamento
 * que recebe depois. Três implementações divergiriam na primeira semana.
 *
 * Duas montagens, decididas pela largura disponível e não pelo dispositivo (a paciente pode abrir
 * o link da ficha no computador):
 *
 * - **Anel** — botões em elipse ao redor do manequim, com linha guia até o centro da área.
 * - **Chips** — grade compacta de duas colunas **acima** do manequim, para o corpo ainda caber na
 *   primeira tela do celular; tocar num chip rola até a figura e pulsa a área.
 */

/** Abaixo desta largura o anel não cabe e a montagem vira chips. */
const LARGURA_MINIMA_ANEL = 760;

/** Quanto da largura do contêiner o anel reserva para os botões, de cada lado. */
const FOLGA_LATERAL_DO_ANEL = 0.3;

/** Respiro entre a borda da figura e o botão mais próximo, em fração da largura do contêiner. */
const FOLGA_ENTRE_BOTAO_E_FIGURA = 0.035;

export interface AreaExibida {
  /** Identidade estável da área na tela — na prática o `procedureId`. */
  chave: string;
  nomeCurto: string;
  area: LaserArea;
  /** Só preenchido no orçamento. Na anamnese o preço nunca aparece. */
  preco?: number;
}

interface LaserBodyMapViewProps {
  imagemUrl?: string;
  areas: AreaExibida[];
  selecionadas: Set<string>;
  onToggle?: (chave: string) => void;

  /** Autoria: a área sendo editada sai em vermelho e as demais em cinza, para não se confundirem. */
  modoAutoria?: boolean;
  chaveEmEdicao?: string;
  /** Formas ainda não aplicadas, desenhadas agora. Em coordenadas 0–1. */
  rascunho?: number[][];
  /** Recebe o traço cru em pixels do manequim, mais as medidas para normalizar. */
  onLacoConcluido?: (tracoEmPixels: number[], largura: number, altura: number) => void;

  mostrarPreco?: boolean;
  /** Altura do manequim em pixels. O cadastro pede grande; a ficha impressa, menor. */
  alturaManequim?: number;
  vazioMensagem?: string;
}

interface Medidas {
  largura: number;
  altura: number;
  /** Retângulo da figura dentro do contêiner externo, em fração de 0–1. */
  esquerda: number;
  topo: number;
  fracaoLargura: number;
  fracaoAltura: number;
}

export const LaserBodyMapView: React.FC<LaserBodyMapViewProps> = ({
  imagemUrl,
  areas,
  selecionadas,
  onToggle,
  modoAutoria = false,
  chaveEmEdicao,
  rascunho,
  onLacoConcluido,
  mostrarPreco = false,
  alturaManequim = 560,
  vazioMensagem,
}) => {
  const externoRef = useRef<HTMLDivElement>(null);
  const figuraRef = useRef<HTMLDivElement>(null);

  const [medidas, setMedidas] = useState<Medidas | null>(null);
  const [larguraExterna, setLarguraExterna] = useState(0);
  /**
   * Proporção natural do manequim (largura / altura), lida quando a imagem carrega.
   *
   * A caixa da figura é calculada a partir dela em vez de deixar o CSS resolver. Um `<img>` dentro
   * de um item flex estreito é espremido pelo `flex-shrink`, e aí a caixa deixa de ser a imagem: a
   * sobreposição de SVG, que é dimensionada pela caixa, passa a desenhar as áreas esticadas em
   * relação ao corpo. Fixando largura e altura na proporção certa, caixa e imagem são sempre a
   * mesma coisa — que é a premissa de todas as coordenadas 0–1.
   */
  const [proporcao, setProporcao] = useState<number | null>(null);
  const [emFoco, setEmFoco] = useState<string | null>(null);
  const [pulsando, setPulsando] = useState<string | null>(null);
  const [traco, setTraco] = useState<number[]>([]);

  /**
   * Antes da primeira medição não dá para saber qual montagem cabe — e chutar tem custo visível:
   * assumir "estreito" faz a grade de chips do celular piscar em cima de toda tela larga antes de
   * o anel assumir. Enquanto não há medida, os botões simplesmente não são desenhados; o manequim
   * aparece na hora, que é o que está sendo medido.
   */
  const medido = larguraExterna > 0;
  const usarAnel = medido && larguraExterna >= LARGURA_MINIMA_ANEL;
  const usarChips = medido && !usarAnel;

  /**
   * As coordenadas são relativas (0–1), mas o SVG precisa de pixels para que a espessura do traço
   * não estique junto com a imagem. Daí a medição: o `viewBox` acompanha o tamanho real da figura.
   */
  useLayoutEffect(() => {
    const externo = externoRef.current;
    const figura = figuraRef.current;
    if (!externo || !figura) return;

    const medir = () => {
      const rExterno = externo.getBoundingClientRect();
      const rFigura = figura.getBoundingClientRect();
      if (!rFigura.width || !rFigura.height || !rExterno.width) return;
      setLarguraExterna(rExterno.width);
      setMedidas({
        largura: rFigura.width,
        altura: rFigura.height,
        esquerda: (rFigura.left - rExterno.left) / rExterno.width,
        topo: (rFigura.top - rExterno.top) / rExterno.height,
        fracaoLargura: rFigura.width / rExterno.width,
        fracaoAltura: rFigura.height / rExterno.height,
      });
    };

    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(externo);
    observador.observe(figura);
    return () => observador.disconnect();
  }, [imagemUrl, alturaManequim, areas.length, proporcao, usarAnel]);

  /** Do espaço da imagem (0–1) para o do contêiner externo — onde as linhas guia são desenhadas. */
  const paraExterno = useCallback(
    (x: number, y: number) =>
      medidas
        ? {
            x: medidas.esquerda + x * medidas.fracaoLargura,
            y: medidas.topo + y * medidas.fracaoAltura,
          }
        : { x, y },
    [medidas]
  );

  const destacar = (chave: string) => {
    setPulsando(chave);
    if (usarChips) {
      figuraRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    window.setTimeout(() => setPulsando((atual) => (atual === chave ? null : atual)), 900);
  };

  // ==========================================
  // LAÇO (só na autoria)
  // ==========================================

  const pontoNaFigura = (e: React.PointerEvent): [number, number] | null => {
    const figura = figuraRef.current;
    if (!figura) return null;
    const r = figura.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  const iniciarLaco = (e: React.PointerEvent) => {
    if (!onLacoConcluido) return;
    const ponto = pontoNaFigura(e);
    if (!ponto) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setTraco(ponto);
  };

  const continuarLaco = (e: React.PointerEvent) => {
    if (!onLacoConcluido || traco.length === 0) return;
    const ponto = pontoNaFigura(e);
    if (!ponto) return;
    setTraco((atual) => [...atual, ...ponto]);
  };

  const encerrarLaco = () => {
    if (!onLacoConcluido || traco.length === 0) return;
    const figura = figuraRef.current;
    if (figura) {
      const r = figura.getBoundingClientRect();
      onLacoConcluido(traco, r.width, r.height);
    }
    setTraco([]);
  };

  /**
   * Clicar na anatomia também seleciona — no celular é o gesto natural, e no desktop é o mais
   * direto quando a pessoa já está olhando para a figura. O botão continua sendo o caminho
   * garantido para quem não acerta o alvo.
   */
  const cliqueNaFigura = (e: React.MouseEvent) => {
    if (modoAutoria || !onToggle || !medidas) return;
    const r = figuraRef.current?.getBoundingClientRect();
    if (!r) return;
    const alvo = areaNoPonto(
      areas.map((a) => ({ area: a.area, procedureId: a.chave })),
      (e.clientX - r.left) / r.width,
      (e.clientY - r.top) / r.height
    );
    if (alvo) onToggle(alvo.procedureId);
  };

  // ==========================================
  // RENDER
  // ==========================================

  const posicoes =
    usarAnel && medidas
      ? posicionarBotoesDoAnel(
          areas.map((a) => ({ chave: a.chave, area: a.area })),
          {
            raioX: 0.5 - FOLGA_LATERAL_DO_ANEL / 2,
            // O piso sai da largura medida da figura: o anel contorna o manequim em vez de passar
            // por cima dele nas pontas, que é justo onde ficam buço, queixo e maçã do rosto.
            raioMinimoX: medidas.fracaoLargura / 2 + FOLGA_ENTRE_BOTAO_E_FIGURA,
          }
        )
      : [];

  const corDaArea = (chave: string) => {
    if (modoAutoria && chaveEmEdicao && chave !== chaveEmEdicao) return 'alheia';
    if (selecionadas.has(chave)) return 'selecionada';
    return 'disponivel';
  };

  const larguraSvg = medidas?.largura || 1;
  const alturaSvg = medidas?.altura || 1;

  /**
   * Caixa da figura: parte da altura pedida e encolhe se a largura resultante não couber.
   *
   * No anel, a figura divide o contêiner com os botões dos dois lados; nos chips, ela pode ocupar
   * quase tudo. Sem a proporção ainda (primeira pintura), só a altura é fixada — a imagem se
   * encarrega da largura até o `onLoad` chegar.
   */
  const caixaDaFigura: React.CSSProperties = (() => {
    if (!proporcao) return { height: alturaManequim };
    const disponivel = larguraExterna
      ? larguraExterna * (usarAnel ? 1 - FOLGA_LATERAL_DO_ANEL * 2 : 1)
      : Infinity;
    const largura = Math.min(alturaManequim * proporcao, disponivel);
    return { width: largura, height: largura / proporcao };
  })();

  /**
   * Chips de uma linha só, com o preço ao lado e não embaixo.
   *
   * São até treze áreas em duas colunas; cada linha a mais de altura no chip empurra o manequim
   * para fora da primeira tela do celular — e um mapa que ninguém vê sem rolar não é um mapa. Com
   * uma linha, a figura começa ainda acima da dobra mesmo com a lista cheia.
   */
  const chips = (
    <div className="grid grid-cols-2 gap-1 mb-2.5">
      {areas.map((a) => {
        const ativa = selecionadas.has(a.chave);
        return (
          <button
            key={a.chave}
            type="button"
            onClick={() => {
              destacar(a.chave);
              onToggle?.(a.chave);
            }}
            className={`px-2 py-1.5 rounded-xs text-[11.5px] leading-tight text-left transition-colors border flex items-baseline justify-between gap-1.5 ${
              ativa
                ? 'bg-[#FCE4EF] border-[#D6317F] text-[#8E1A54] font-semibold'
                : 'bg-white border-gray-200 text-[#1A1A1A]'
            }`}
          >
            <span className="truncate">{a.nomeCurto}</span>
            {mostrarPreco && typeof a.preco === 'number' && (
              <span className="text-[10px] text-gray-400 tabular-nums shrink-0">
                {formatBRL(a.preco)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  return (
    <div ref={externoRef} className="relative w-full select-none">
      {usarChips && areas.length > 0 && chips}

      <div className="flex justify-center">
        <div
          ref={figuraRef}
          className="relative shrink-0"
          style={caixaDaFigura}
          onClick={cliqueNaFigura}
        >
          {imagemUrl ? (
            <img
              src={imagemUrl}
              alt="Manequim para seleção de áreas"
              draggable={false}
              onLoad={(e) => {
                const img = e.currentTarget;
                if (img.naturalHeight > 0) setProporcao(img.naturalWidth / img.naturalHeight);
              }}
              className="w-full h-full block pointer-events-none"
            />
          ) : (
            <div
              className="h-full flex items-center justify-center px-8 text-center bg-[#F9F8F6] border border-dashed border-[#d8d2c8] rounded-sm"
              style={{ width: alturaManequim * 0.42 }}
            >
              <p className="text-[13px] text-[#8a8578]">
                {vazioMensagem || 'Manequim ainda não enviado.'}
              </p>
            </div>
          )}

          <svg
            className={`absolute inset-0 w-full h-full ${
              onLacoConcluido ? 'cursor-crosshair touch-none' : ''
            } ${!modoAutoria && onToggle ? 'cursor-pointer' : ''}`}
            viewBox={`0 0 ${larguraSvg} ${alturaSvg}`}
            onPointerDown={iniciarLaco}
            onPointerMove={continuarLaco}
            onPointerUp={encerrarLaco}
            onPointerCancel={encerrarLaco}
            style={{ pointerEvents: onLacoConcluido ? 'auto' : 'none' }}
          >
            <defs>
              {/* O "sublinhado hachurado": diagonais finas que dão textura de marca-texto sem
                  fechar a área, deixando o manequim visível por baixo. */}
              <pattern
                id="hachura-laser-vermelha"
                width="7"
                height="7"
                patternTransform="rotate(45)"
                patternUnits="userSpaceOnUse"
              >
                <line x1="0" y1="0" x2="0" y2="7" stroke="#C0392B" strokeWidth="2.2" opacity="0.5" />
              </pattern>
              <pattern
                id="hachura-laser-rosa"
                width="7"
                height="7"
                patternTransform="rotate(45)"
                patternUnits="userSpaceOnUse"
              >
                <line x1="0" y1="0" x2="0" y2="7" stroke="#D6317F" strokeWidth="2.4" opacity="0.6" />
              </pattern>
            </defs>

            {areas.map((a) => {
              const estado = corDaArea(a.chave);
              const realcada = emFoco === a.chave || pulsando === a.chave;
              const d = areaParaPath(a.area, larguraSvg, alturaSvg);
              if (!d) return null;

              const cor =
                estado === 'selecionada'
                  ? { base: 'rgba(233,78,156,.30)', hachura: 'url(#hachura-laser-rosa)', traco: '#D6317F' }
                  : estado === 'alheia'
                    ? { base: 'rgba(120,120,120,.16)', hachura: 'none', traco: '#A9A9A9' }
                    : { base: 'rgba(214,69,69,.20)', hachura: 'url(#hachura-laser-vermelha)', traco: '#C0392B' };

              return (
                <g
                  key={a.chave}
                  onMouseEnter={() => setEmFoco(a.chave)}
                  onMouseLeave={() => setEmFoco((atual) => (atual === a.chave ? null : atual))}
                  style={{ pointerEvents: onLacoConcluido ? 'none' : 'auto' }}
                >
                  <path d={d} fill={cor.base} />
                  {cor.hachura !== 'none' && <path d={d} fill={cor.hachura} />}
                  <path
                    d={d}
                    fill="none"
                    stroke={cor.traco}
                    strokeWidth={realcada || estado === 'selecionada' ? 2.6 : 1.6}
                    strokeDasharray={estado === 'selecionada' ? 'none' : '5 3'}
                    strokeLinejoin="round"
                  />
                </g>
              );
            })}

            {/* Formas já desenhadas nesta sessão, ainda não aplicadas. */}
            {(rascunho || []).map((forma, i) => (
              <path
                key={`rascunho-${i}`}
                d={formaParaPath(forma, larguraSvg, alturaSvg)}
                fill="rgba(214,69,69,.24)"
                stroke="#C0392B"
                strokeWidth={2.4}
                strokeDasharray="5 3"
              />
            ))}

            {/* O traço em andamento, enquanto o dedo/mouse não solta. */}
            {traco.length >= 4 && (
              <polyline
                points={traco.reduce<string[]>((acc, v, i) => {
                  if (i % 2 === 0) acc.push(`${v},${traco[i + 1]}`);
                  return acc;
                }, []).join(' ')}
                fill="rgba(214,69,69,.14)"
                stroke="#C0392B"
                strokeWidth={2}
                strokeLinejoin="round"
              />
            )}
          </svg>
        </div>
      </div>

      {/*
        Linhas guia — acima da figura, abaixo dos botões.
        Atrás da figura elas sumiriam no trecho que mais importa: a ponta que pousa na área. O
        traço é fino e claro justamente para poder cruzar o manequim sem competir com ele.
      */}
      {usarAnel && medidas && (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none z-1"
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
        >
          {posicoes.map((p) => {
            const ancora = paraExterno(p.ancora.x, p.ancora.y);
            const ativa = selecionadas.has(p.chave) || emFoco === p.chave;
            return (
              <line
                key={p.chave}
                x1={p.x}
                y1={p.y}
                x2={ancora.x}
                y2={ancora.y}
                stroke={ativa ? '#D6317F' : '#C9C0B2'}
                // Com `non-scaling-stroke` a espessura é lida em pixels da viewport, e não nas
                // unidades do viewBox 0–1 — um valor fracionário aqui desenharia uma linha de
                // 0,002 pixel, ou seja, nada.
                strokeWidth={ativa ? 1.6 : 1}
                strokeDasharray={ativa ? 'none' : '3 3'}
                vectorEffect="non-scaling-stroke"
                opacity={ativa ? 0.9 : 0.65}
              />
            );
          })}
        </svg>
      )}

      {/* Botões do anel, por cima de tudo. */}
      {usarAnel &&
        medidas &&
        posicoes.map((p) => {
          const info = areas.find((a) => a.chave === p.chave);
          if (!info) return null;
          const ativa = selecionadas.has(p.chave);
          return (
            <button
              key={p.chave}
              type="button"
              onMouseEnter={() => setEmFoco(p.chave)}
              onMouseLeave={() => setEmFoco((atual) => (atual === p.chave ? null : atual))}
              onClick={() => onToggle?.(p.chave)}
              className={`absolute z-10 px-2.5 py-1.5 rounded-sm border text-[12px] leading-tight max-w-[150px] transition-colors shadow-[0_1px_4px_rgba(0,0,0,.06)] ${
                ativa
                  ? 'bg-[#FCE4EF] border-[#D6317F] text-[#8E1A54] font-semibold'
                  : 'bg-white border-gray-200 text-[#1A1A1A] hover:border-[#C0392B]'
              }`}
              style={{
                left: `${p.x * 100}%`,
                top: `${p.y * 100}%`,
                transform: `translate(${p.lado === 'esquerda' ? '-100%' : '0'}, -50%)`,
              }}
            >
              {info.nomeCurto}
              {mostrarPreco && typeof info.preco === 'number' && (
                <span className="block text-[10px] text-gray-400 tabular-nums">
                  {formatBRL(info.preco)}
                </span>
              )}
            </button>
          );
        })}
    </div>
  );
};

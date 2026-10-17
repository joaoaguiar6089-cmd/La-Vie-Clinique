import React, { useCallback, useRef, useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { FotoAntesDepois } from '../../types';
import { formatDateOnly } from '../../utils/formatters';

/**
 * Antes e depois com divisor arrastável.
 *
 * Duas fotos empilhadas no mesmo quadro, a de cima recortada por `clip-path` até a posição do
 * divisor. Não é um efeito: é a única forma de comparar pele com pele — lado a lado, a diferença
 * de enquadramento entre duas fotos tiradas com meses de distância come a diferença que
 * interessa.
 *
 * O arrasto responde a mouse e a toque pelos eventos de ponteiro, que cobrem os dois com um
 * código só. As setas do teclado movem 2% por toque, para quem não usa ponteiro nenhum.
 *
 * As duas fotos chegam escolhidas — quem decide o par é a equipe, em `AntesEDepois`.
 */

interface BeforeAfterCompareProps {
  antes: FotoAntesDepois;
  depois: FotoAntesDepois;
  /** O ângulo, para o texto alternativo das fotos. */
  angulo: string;
}

/** A data chega em YYYY-MM-DD ou ISO completo; vazia some sem deixar etiqueta em branco. */
export const dataDaFoto = (data?: string): string =>
  data ? formatDateOnly(data.slice(0, 10)) : '';

export const BeforeAfterCompare: React.FC<BeforeAfterCompareProps> = ({ antes, depois, angulo }) => {
  const [posicao, setPosicao] = useState(50);
  const quadroRef = useRef<HTMLDivElement>(null);

  const mover = useCallback((clientX: number) => {
    const caixa = quadroRef.current?.getBoundingClientRect();
    if (!caixa || caixa.width === 0) return;
    const pct = ((clientX - caixa.left) / caixa.width) * 100;
    setPosicao(Math.max(0, Math.min(100, pct)));
  }, []);

  return (
    // No desktop o quadro 4:5 na largura inteira da página passaria de mil pixels de altura —
    // a foto não ganha nada com isso, e o divisor sai da tela.
    <div
      ref={quadroRef}
      className="relative w-full sm:max-w-md sm:mx-auto overflow-hidden rounded-card border border-line bg-ink select-none touch-none"
      style={{ aspectRatio: '4 / 5' }}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        mover(e.clientX);
      }}
      onPointerMove={(e) => {
        // `buttons` é 0 quando o ponteiro só passa por cima — arrastar exige pressão.
        if (e.buttons !== 0) mover(e.clientX);
      }}
    >
      <img
        src={depois.url}
        alt={`Depois — ${angulo}`}
        className="absolute inset-0 w-full h-full object-contain"
        draggable={false}
      />
      <img
        src={antes.url}
        alt={`Antes — ${angulo}`}
        className="absolute inset-0 w-full h-full object-contain"
        style={{ clipPath: `inset(0 ${100 - posicao}% 0 0)` }}
        draggable={false}
      />

      {/* O divisor. O input range invisível por cima é o que dá teclado e leitor de tela de
          graça — a alça desenhada é só a parte visível dele. */}
      <div
        aria-hidden
        className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,.25)] pointer-events-none"
        style={{ left: `${posicao}%` }}
      >
        <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white shadow-lg flex items-center justify-center">
          <ArrowLeftRight className="w-4 h-4 text-ink" />
        </span>
      </div>

      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={posicao}
        onChange={(e) => setPosicao(Number(e.target.value))}
        aria-label="Posição do divisor entre antes e depois"
        className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize"
      />

      <span className="absolute bottom-2 left-2 px-2 py-1 rounded-md bg-black/60 text-white text-label font-semibold">
        Antes{dataDaFoto(antes.data) && ` · ${dataDaFoto(antes.data)}`}
      </span>
      <span className="absolute bottom-2 right-2 px-2 py-1 rounded-md bg-black/60 text-white text-label font-semibold">
        Depois{dataDaFoto(depois.data) && ` · ${dataDaFoto(depois.data)}`}
      </span>
    </div>
  );
};

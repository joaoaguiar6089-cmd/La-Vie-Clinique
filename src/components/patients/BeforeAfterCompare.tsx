import React, { useCallback, useRef, useState } from 'react';
import { ArrowLeftRight, ImageOff } from 'lucide-react';
import { FotoDaPaciente } from '../../utils/pacienteResumo';
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
 */

interface BeforeAfterCompareProps {
  fotos: FotoDaPaciente[];
}

export const BeforeAfterCompare: React.FC<BeforeAfterCompareProps> = ({ fotos }) => {
  // O par padrão é a mais antiga contra a mais nova: é a comparação que quase sempre se quer.
  const [idxAntes, setIdxAntes] = useState(0);
  const [idxDepois, setIdxDepois] = useState(Math.max(0, fotos.length - 1));
  const [posicao, setPosicao] = useState(50);
  const quadroRef = useRef<HTMLDivElement>(null);

  const mover = useCallback((clientX: number) => {
    const caixa = quadroRef.current?.getBoundingClientRect();
    if (!caixa || caixa.width === 0) return;
    const pct = ((clientX - caixa.left) / caixa.width) * 100;
    setPosicao(Math.max(0, Math.min(100, pct)));
  }, []);

  if (fotos.length < 2) {
    return (
      <div className="glass-card p-6 text-center">
        <ImageOff className="w-7 h-7 text-muted mx-auto mb-2" />
        <p className="text-body-lg font-medium text-ink">
          {fotos.length === 0 ? 'Nenhuma foto nas fichas' : 'Só há uma foto'}
        </p>
        <p className="text-body text-muted mt-1">
          O comparador precisa de duas. As fotos vêm das fichas de anamnese desta paciente.
        </p>
      </div>
    );
  }

  const antes = fotos[Math.min(idxAntes, fotos.length - 1)];
  const depois = fotos[Math.min(idxDepois, fotos.length - 1)];

  const seletor = (
    rotulo: string,
    valor: number,
    onChange: (v: number) => void,
    id: string
  ) => (
    <div className="flex-1 min-w-0">
      <label htmlFor={id} className="block text-label uppercase tracking-wider font-semibold text-muted mb-1">
        {rotulo}
      </label>
      <select
        id={id}
        value={valor}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full glass-input px-3 py-2 rounded-lg text-body text-ink focus:outline-hidden"
      >
        {fotos.map((f, i) => (
          <option key={f.fichaId + i} value={i}>
            {formatDateOnly(f.data.slice(0, 10))} · {f.procedimentoNome}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-3">
        {seletor('Antes', idxAntes, setIdxAntes, 'foto-antes')}
        <button
          type="button"
          onClick={() => {
            setIdxAntes(idxDepois);
            setIdxDepois(idxAntes);
          }}
          aria-label="Trocar as duas fotos de lado"
          title="Trocar de lado"
          className="w-11 h-11 shrink-0 rounded-lg flex items-center justify-center text-muted hover:text-brand hover:bg-surface-2 transition-colors"
        >
          <ArrowLeftRight className="w-[18px] h-[18px]" />
        </button>
        {seletor('Depois', idxDepois, setIdxDepois, 'foto-depois')}
      </div>

      <div
        ref={quadroRef}
        className="relative w-full overflow-hidden rounded-card border border-line bg-ink select-none touch-none"
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
          alt={`Depois — ${depois.procedimentoNome}`}
          className="absolute inset-0 w-full h-full object-contain"
          draggable={false}
        />
        <img
          src={antes.url}
          alt={`Antes — ${antes.procedimentoNome}`}
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
          {formatDateOnly(antes.data.slice(0, 10))}
        </span>
        <span className="absolute bottom-2 right-2 px-2 py-1 rounded-md bg-black/60 text-white text-label font-semibold">
          {formatDateOnly(depois.data.slice(0, 10))}
        </span>
      </div>
    </div>
  );
};

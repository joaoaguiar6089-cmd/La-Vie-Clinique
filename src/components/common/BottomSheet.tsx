import React, { useEffect, useRef } from 'react';
import { useTravarRolagem, useVoltarFecha } from '../../hooks/useVoltarFecha';

/**
 * Painel que sobe do rodapé — o modal curto do celular.
 *
 * No celular, um diálogo centralizado nasce longe do polegar e no meio do caminho do teclado. A
 * folha sobe da borda de baixo, onde a mão já está, e fecha com o mesmo gesto com que subiu.
 *
 * Fecha por quatro caminhos, todos equivalentes: o véu, o Esc, o arrasto para baixo e o botão
 * voltar do celular (ver `useVoltarFecha`). Nenhum deles salva nada — quem tem formulário com
 * alteração pendente passa o `onTentarFechar` e decide.
 */

interface BottomSheetProps {
  aberto: boolean;
  onFechar: () => void;
  /** Título da folha. Ausente = folha sem cabeçalho (só as ações). */
  titulo?: string;
  descricao?: string;
  children: React.ReactNode;
  /** Classe extra do painel — altura máxima, por exemplo. */
  className?: string;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  aberto,
  onFechar,
  titulo,
  descricao,
  children,
  className = '',
}) => {
  const painelRef = useRef<HTMLDivElement>(null);
  const arrastoInicio = useRef<number | null>(null);

  useVoltarFecha(aberto, onFechar);
  useTravarRolagem(aberto);

  useEffect(() => {
    if (!aberto) return;
    const noTeclado = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar();
    };
    document.addEventListener('keydown', noTeclado);
    return () => document.removeEventListener('keydown', noTeclado);
  }, [aberto, onFechar]);

  // O foco entra no painel para o leitor de tela e o teclado seguirem para dentro dele.
  useEffect(() => {
    if (aberto) painelRef.current?.focus();
  }, [aberto]);

  if (!aberto) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onFechar();
      }}
    >
      <div
        ref={painelRef}
        tabIndex={-1}
        className={`w-full sm:max-w-md bg-card rounded-t-2xl sm:rounded-b-2xl sm:mb-6 shadow-2xl flex flex-col max-h-[85vh] focus:outline-none animate-slideUpSheet ${className}`}
        /* Arrastar a alça para baixo fecha — o gesto que todo app de celular tem. 60px é o
           limite acima do qual o movimento deixa de ser um toque trêmulo. */
        onTouchStart={(e) => {
          arrastoInicio.current = e.touches[0].clientY;
        }}
        onTouchEnd={(e) => {
          const inicio = arrastoInicio.current;
          arrastoInicio.current = null;
          if (inicio !== null && e.changedTouches[0].clientY - inicio > 60) onFechar();
        }}
      >
        {/* Alça. Decorativa, mas é ela que anuncia que a folha se arrasta. */}
        <div className="pt-2.5 pb-1 shrink-0 flex justify-center">
          <span aria-hidden className="w-10 h-1 rounded-full bg-line" />
        </div>

        {titulo && (
          <div className="px-5 pb-3 shrink-0">
            <h2 className="font-serif-luxury text-title text-ink">{titulo}</h2>
            {descricao && <p className="text-body text-muted mt-0.5">{descricao}</p>}
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 pb-2">{children}</div>

        {/* A faixa do gesto do iPhone. Sem isto, a última linha fica embaixo dela. */}
        <div className="pb-area-segura shrink-0" />
      </div>
    </div>
  );
};

/**
 * Uma linha de ação dentro da folha. Altura de 52px — acima do mínimo de 44px para o dedo, e o
 * suficiente para caber um rótulo e uma explicação de uma linha.
 */
export const ItemDaFolha: React.FC<{
  icone: React.ElementType;
  rotulo: string;
  descricao?: string;
  contador?: number;
  tom?: 'normal' | 'perigo';
  onClick: () => void;
}> = ({ icone: Icone, rotulo, descricao, contador, tom = 'normal', onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`w-full flex items-center gap-3.5 min-h-[52px] px-3 rounded-xl text-left transition-colors ${
      tom === 'perigo' ? 'text-danger hover:bg-danger-bg' : 'text-ink hover:bg-surface-2'
    }`}
  >
    <Icone
      className={`w-5 h-5 shrink-0 ${tom === 'perigo' ? 'text-danger' : 'text-brand'}`}
    />
    <span className="min-w-0 flex-1">
      <span className="block text-body-lg font-medium truncate">{rotulo}</span>
      {descricao && <span className="block text-body text-muted truncate">{descricao}</span>}
    </span>
    {!!contador && (
      <span className="shrink-0 min-w-[22px] h-[22px] px-1.5 rounded-full bg-brand text-white text-label font-semibold flex items-center justify-center tabular-nums">
        {contador > 99 ? '99+' : contador}
      </span>
    )}
  </button>
);

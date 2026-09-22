import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

export interface ConfirmRequest {
  titulo: string;
  mensagem: string;
  textoConfirmar: string;
  /** `perigo` pinta o botão de vermelho — use para o que não tem volta. */
  tom?: 'perigo' | 'neutro';
  onConfirmar: () => void;
}

interface ConfirmDialogProps {
  pedido: ConfirmRequest | null;
  onFechar: () => void;
}

/**
 * Confirmação dentro do app, em vez de `window.confirm`. A caixa nativa é suprimida
 * em contextos embutidos (iframe sem `allow-modals`, webviews, PWA) — e quando isso
 * acontece ela devolve um valor sozinha, sem mostrar nada: ou a ação nunca roda, ou
 * roda sem perguntar. Nenhum dos dois é aceitável para exclusão.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ pedido, onFechar }) => {
  if (!pedido) return null;

  const perigo = pedido.tom !== 'neutro';

  const confirmar = () => {
    pedido.onConfirmar();
    onFechar();
  };

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4 animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-titulo"
      onClick={(e) => {
        if (e.target === e.currentTarget) onFechar();
      }}
    >
      <div className="w-full max-w-sm bg-surface rounded-sm overflow-hidden shadow-2xl border border-white/60">
        <div className="px-6 pt-6 pb-5">
          <div className="flex items-start gap-3">
            <div
              className={`w-9 h-9 rounded-sm flex items-center justify-center shrink-0 ${
                perigo ? 'bg-red-50 text-red-600' : 'bg-brand/10 text-brand'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2
                id="confirm-dialog-titulo"
                className="font-serif-luxury text-xl text-ink leading-tight"
              >
                {pedido.titulo}
              </h2>
              <p className="text-xs text-gray-600 leading-relaxed mt-2 whitespace-pre-line">
                {pedido.mensagem}
              </p>
            </div>
            <button
              type="button"
              onClick={onFechar}
              aria-label="Fechar"
              className="ml-auto text-gray-400 hover:text-gray-600 transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-6 py-4 bg-white/50 border-t border-white/70 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onFechar}
            className="px-4 py-2.5 text-xs font-semibold uppercase tracking-widest text-gray-500 hover:text-gray-700 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            autoFocus
            onClick={confirmar}
            className={`px-5 py-2.5 text-white text-xs font-semibold uppercase tracking-widest rounded-sm transition-colors ${
              perigo ? 'bg-red-600 hover:bg-red-700' : 'bg-brand hover:bg-brand-hover'
            }`}
          >
            {pedido.textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
};

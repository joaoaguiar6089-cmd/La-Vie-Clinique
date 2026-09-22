import React, { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useTravarRolagem } from '../hooks/useVoltarFecha';

export interface ConfirmRequest {
  titulo: string;
  mensagem: string;
  textoConfirmar: string;
  /** Rótulo do botão que não confirma. O padrão é "Cancelar". */
  textoCancelar?: string;
  /** `perigo` pinta o botão de vermelho — use para o que não tem volta. */
  tom?: 'perigo' | 'neutro';
  onConfirmar: () => void;
  /** Ação do botão de cancelar, quando ela não é só "fechar". */
  onCancelar?: () => void;
  /**
   * Aviso, não pergunta: um botão só.
   *
   * É o que substitui os `window.alert` do projeto. A caixa nativa tem o mesmo problema do
   * `window.confirm` — some em contexto embutido — e, quando aparece, congela a aba inteira até
   * alguém clicar, o que num aviso de "falha ao gerar o PDF" é um preço alto.
   */
  somenteOk?: boolean;
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
 *
 * No celular ela sobe do rodapé, como toda folha do sistema: a caixa centralizada nasce longe
 * do polegar e o botão de confirmar acaba no meio da tela, onde a mão não chega sem trocar a
 * pegada do aparelho.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ pedido, onFechar }) => {
  useTravarRolagem(!!pedido);

  useEffect(() => {
    if (!pedido) return;
    const noTeclado = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar();
    };
    document.addEventListener('keydown', noTeclado);
    return () => document.removeEventListener('keydown', noTeclado);
  }, [pedido, onFechar]);

  if (!pedido) return null;

  const perigo = pedido.tom !== 'neutro';

  const confirmar = () => {
    pedido.onConfirmar();
    onFechar();
  };

  const cancelar = () => {
    pedido.onCancelar?.();
    onFechar();
  };

  return (
    <div
      /* z acima do SidePanel e do BottomSheet: é sempre a pergunta *sobre* o que está aberto. */
      className="fixed inset-0 z-[80] bg-black/60 flex items-end sm:items-center justify-center sm:p-4 animate-fadeIn"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-titulo"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onFechar();
      }}
    >
      <div className="w-full sm:max-w-sm bg-card rounded-t-2xl sm:rounded-card overflow-hidden shadow-2xl border-line sm:border animate-slideUpSheet sm:animate-none">
        <div className="px-5 pt-5 pb-4 sm:px-6 sm:pt-6 sm:pb-5">
          <div className="flex items-start gap-3">
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                perigo ? 'bg-danger-bg text-danger' : 'bg-brand-bg text-brand'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2
                id="confirm-dialog-titulo"
                className="font-serif-luxury text-title text-ink leading-tight"
              >
                {pedido.titulo}
              </h2>
              <p className="text-body text-ink-soft leading-relaxed mt-2 whitespace-pre-line">
                {pedido.mensagem}
              </p>
            </div>
            <button
              type="button"
              onClick={onFechar}
              aria-label="Fechar"
              className="ml-auto -mr-2 -mt-2 w-11 h-11 shrink-0 flex items-center justify-center text-muted hover:text-ink transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* No celular os botões viram bloco e o de confirmar vem em cima: é ele que o polegar
            encontra primeiro subindo da borda. */}
        <div className="px-5 pb-5 sm:px-6 sm:py-4 bg-card sm:bg-surface sm:border-t sm:border-line flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 sm:gap-3 pb-area-segura sm:pb-4">
          {!pedido.somenteOk && (
            <button
              type="button"
              onClick={cancelar}
              className="min-h-[48px] sm:min-h-0 px-4 py-2.5 rounded-xl sm:rounded-sm text-body font-semibold uppercase tracking-widest text-muted hover:text-ink hover:bg-surface-2 sm:hover:bg-transparent transition-colors"
            >
              {pedido.textoCancelar || 'Cancelar'}
            </button>
          )}
          <button
            type="button"
            autoFocus
            onClick={confirmar}
            className={`min-h-[48px] sm:min-h-0 px-5 py-2.5 text-white text-body font-semibold uppercase tracking-widest rounded-xl sm:rounded-sm transition-colors ${
              perigo ? 'bg-danger hover:brightness-90' : 'bg-brand'
            }`}
          >
            {pedido.textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
};

/** Um aviso de uma linha só, no lugar do `window.alert`. */
export const aviso = (
  titulo: string,
  mensagem: string,
  tom: 'perigo' | 'neutro' = 'neutro'
): ConfirmRequest => ({
  titulo,
  mensagem,
  textoConfirmar: 'Entendi',
  tom,
  somenteOk: true,
  onConfirmar: () => {},
});

/**
 * O pedido padrão de "você tem alterações não salvas".
 *
 * Fica aqui e não em cada formulário para o texto ser um só: cinco formulários escrevendo a
 * própria versão da mesma pergunta é como se ensina a equipe a não ler o aviso.
 */
export const pedidoDeDescarte = (aoDescartar: () => void): ConfirmRequest => ({
  titulo: 'Descartar as alterações?',
  mensagem:
    'Você mexeu neste formulário e ainda não salvou. Fechar agora perde o que foi digitado.',
  textoConfirmar: 'Descartar',
  textoCancelar: 'Continuar editando',
  tom: 'perigo',
  onConfirmar: aoDescartar,
});

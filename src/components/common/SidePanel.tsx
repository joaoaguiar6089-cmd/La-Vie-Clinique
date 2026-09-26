import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { useTravarRolagem, useVoltarFecha } from '../../hooks/useVoltarFecha';
import { ConfirmDialog, ConfirmRequest, pedidoDeDescarte } from '../ConfirmDialog';

/**
 * O lugar de um formulário longo.
 *
 * Um diálogo centralizado é bom para uma pergunta de uma linha. Para um formulário de vinte
 * campos ele é o pior dos dois mundos: no celular abre numa caixa menor que a tela, com o
 * conteúdo rolando dentro de um retângulo que também rola; no desktop cobre o meio da tela e
 * esconde justamente a lista de onde a pessoa veio.
 *
 * Aqui: **tela cheia no celular** (é um formulário, ele merece a tela toda) e **painel lateral
 * de 560px no desktop**, encostado à direita, com a lista continuando visível ao lado.
 *
 * Fecha por Esc, pelo X, pelo véu e pelo botão voltar do celular — e, se o formulário foi
 * mexido, pergunta antes. Quem fecha o painel **por dentro** (o botão Salvar do formulário,
 * chamando `onFechar` direto) não passa por essa pergunta, que é justamente o certo: salvar já
 * respondeu a ela.
 */

interface SidePanelProps {
  aberto: boolean;
  /** Fechar de verdade. Chamado depois de a pergunta de descarte, quando houve, ser respondida. */
  onFechar: () => void;
  titulo: string;
  /** Linha pequena acima do título — o nome da paciente, o número do orçamento. */
  sobretitulo?: string;
  /** Barra de ações fixa no rodapé do painel. */
  rodape?: React.ReactNode;
  /** Largura do painel no desktop. O padrão de 560px é o da maioria dos formulários. */
  largura?: 'padrao' | 'larga';
  /**
   * Alteração que o painel não consegue enxergar sozinho — um item adicionado por botão, uma
   * foto anexada. O painel já detecta digitação e troca de campo; isto é para o resto.
   */
  alterado?: boolean;
  /** Enquanto salva, fechar é ignorado: a gravação está em voo. */
  bloqueado?: boolean;
  children: React.ReactNode;
}

export const SidePanel: React.FC<SidePanelProps> = ({
  aberto,
  onFechar,
  titulo,
  sobretitulo,
  rodape,
  largura = 'padrao',
  alterado,
  bloqueado,
  children,
}) => {
  const painelRef = useRef<HTMLDivElement>(null);
  /**
   * "A pessoa mexeu no formulário."
   *
   * Vem dos eventos `input` e `change` que sobem do corpo do painel — é o que cobre digitar,
   * escolher numa lista, marcar uma caixa e anexar um arquivo, sem que nenhum dos cinco
   * formulários precise informar campo por campo. O que passa por fora disso (um item
   * adicionado por botão) entra pela prop `alterado`.
   */
  const [mexido, setMexido] = useState(false);
  const [confirmacao, setConfirmacao] = useState<ConfirmRequest | null>(null);

  useVoltarFecha(aberto, tentarFechar);
  useTravarRolagem(aberto);

  // Cada abertura começa limpa — o estado da edição anterior não é alteração desta.
  useEffect(() => {
    if (aberto) {
      setMexido(false);
      setConfirmacao(null);
    }
  }, [aberto]);

  function tentarFechar() {
    if (bloqueado) return;
    if (!mexido && !alterado) {
      onFechar();
      return;
    }
    setConfirmacao(
      pedidoDeDescarte(() => {
        setMexido(false);
        onFechar();
      })
    );
  }

  useEffect(() => {
    if (!aberto) return;
    const noTeclado = (e: KeyboardEvent) => {
      // Enquanto a pergunta de descarte está na tela, o Esc é dela.
      if (e.key === 'Escape' && !confirmacao) tentarFechar();
    };
    document.addEventListener('keydown', noTeclado);
    return () => document.removeEventListener('keydown', noTeclado);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, confirmacao, mexido, alterado, bloqueado]);

  useEffect(() => {
    if (aberto) painelRef.current?.focus();
  }, [aberto]);

  if (!aberto) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex justify-end sm:bg-black/45 sm:animate-fadeIn"
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) tentarFechar();
        }}
      >
        <div
          ref={painelRef}
          tabIndex={-1}
          className={`bg-surface w-full h-full flex flex-col shadow-2xl focus:outline-none sm:border-l sm:border-line sm:animate-slideInRight ${
            largura === 'larga' ? 'sm:max-w-[760px]' : 'sm:max-w-[560px]'
          }`}
        >
          {/* Cabeçalho fixo. No celular a seta de voltar vem primeiro, que é o gesto que a pessoa
              procura; no desktop o X à direita, que é onde ele sempre esteve. */}
          <header className="shrink-0 bg-ink px-3 sm:px-5 py-3 flex items-center gap-2.5">
            <button
              type="button"
              onClick={tentarFechar}
              disabled={bloqueado}
              aria-label="Voltar"
              className="sm:hidden w-11 h-11 -ml-1 shrink-0 rounded-xl flex items-center justify-center text-cream hover:bg-white/10 transition-colors disabled:opacity-40"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <div className="min-w-0 flex-1">
              {sobretitulo && (
                <p className="text-label font-semibold uppercase tracking-widest text-brand truncate">
                  {sobretitulo}
                </p>
              )}
              <h2 className="font-serif-luxury text-title text-white truncate leading-tight">
                {titulo}
              </h2>
            </div>

            <button
              type="button"
              onClick={tentarFechar}
              disabled={bloqueado}
              aria-label="Fechar"
              className="hidden sm:flex w-10 h-10 shrink-0 rounded-lg items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40"
            >
              <X className="w-5 h-5" />
            </button>
          </header>

          {/* `overscroll-contain`: chegar ao fim do formulário não passa o arrasto para a página
              de trás — no tablet, era o que fazia o painel "travar" e a lista atrás se mexer. */}
          <div
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
            onInput={() => setMexido(true)}
            onChange={() => setMexido(true)}
          >
            {children}
          </div>

          {rodape && (
            <footer className="shrink-0 border-t border-line bg-card px-4 sm:px-5 py-3 pb-area-segura">
              {rodape}
            </footer>
          )}
        </div>
      </div>

      <ConfirmDialog pedido={confirmacao} onFechar={() => setConfirmacao(null)} />
    </>
  );
};

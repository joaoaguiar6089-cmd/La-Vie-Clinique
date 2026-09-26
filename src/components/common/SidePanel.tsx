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
 * No redesign ("Tinta") o cabeçalho é preto, com o título grande em serifa e, logo abaixo, o que
 * dá contexto ao formulário — a paciente escolhida, a margem calculada, as etapas. A barra do X
 * fica presa no topo; o título rola junto com o formulário, para não roubar a tela quando o
 * teclado sobe. O botão principal fica fixo embaixo, dizendo o que vai acontecer.
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
  /** Palavra pequena em bronze, à direita do X — a seção de onde o formulário veio. */
  sobretitulo?: string;
  /** Uma frase sob o título — o que é obrigatório, o que acontece ao salvar. */
  subtitulo?: string;
  /** O que mora no cabeçalho preto, abaixo do título: a paciente, a margem, as etapas. */
  cabecalho?: React.ReactNode;
  /**
   * Com isto, o botão do canto vira seta e volta um passo em vez de fechar — as etapas do
   * orçamento. O Esc e o voltar do celular continuam fechando o painel.
   */
  onVoltar?: () => void;
  /** Barra de ações fixa no rodapé do painel. */
  rodape?: React.ReactNode;
  /** `escuro` é a barra preta com o total — a do orçamento. */
  rodapeTom?: 'claro' | 'escuro';
  /** Largura do painel no desktop. O padrão de 560px é o da maioria dos formulários. */
  largura?: 'padrao' | 'larga';
  /**
   * Alteração que o painel não consegue enxergar sozinho — um item adicionado por botão, uma
   * foto anexada. O painel já detecta digitação e troca de campo; isto é para o resto.
   */
  alterado?: boolean;
  /** Enquanto salva, fechar é ignorado: a gravação está em voo. */
  bloqueado?: boolean;
  /** Muda a cada etapa de um formulário em etapas — a rolagem volta ao topo. */
  etapa?: string | number;
  children: React.ReactNode;
}

export const SidePanel: React.FC<SidePanelProps> = ({
  aberto,
  onFechar,
  titulo,
  sobretitulo,
  subtitulo,
  cabecalho,
  onVoltar,
  rodape,
  rodapeTom = 'claro',
  largura = 'padrao',
  alterado,
  bloqueado,
  etapa,
  children,
}) => {
  const painelRef = useRef<HTMLDivElement>(null);
  const rolagemRef = useRef<HTMLDivElement>(null);
  /**
   * "A pessoa mexeu no formulário."
   *
   * Vem dos eventos `input` e `change` que sobem do corpo do painel — é o que cobre digitar,
   * escolher numa lista, marcar uma caixa e anexar um arquivo, sem que nenhum dos formulários
   * precise informar campo por campo. O que passa por fora disso (um item adicionado por botão)
   * entra pela prop `alterado`.
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

  // Trocar de etapa volta a rolagem ao topo — a etapa nova começa do começo.
  useEffect(() => {
    if (aberto) rolagemRef.current?.scrollTo({ top: 0 });
  }, [aberto, etapa]);

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
          className={`bg-surface w-full h-full flex flex-col shadow-2xl focus:outline-none sm:animate-slideInRight ${
            largura === 'larga' ? 'sm:max-w-[760px]' : 'sm:max-w-[560px]'
          }`}
        >
          {/* A barra do X: presa no topo, preta como o cabeçalho que rola por baixo dela. */}
          <header className="shrink-0 bg-ink text-cream pt-[env(safe-area-inset-top)]">
            <div className="h-14 px-2.5 sm:px-3.5 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={onVoltar || tentarFechar}
                disabled={bloqueado}
                aria-label={onVoltar ? 'Voltar uma etapa' : 'Fechar'}
                title={onVoltar ? 'Voltar uma etapa' : 'Fechar'}
                className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-cream hover:bg-white/10 transition-colors disabled:opacity-40"
              >
                {onVoltar ? <ArrowLeft className="w-[22px] h-[22px]" /> : <X className="w-[22px] h-[22px]" />}
              </button>
              {sobretitulo && (
                <p className="min-w-0 truncate pr-2.5 text-[13px] font-semibold text-brand-light">
                  {sobretitulo}
                </p>
              )}
            </div>
          </header>

          {/* `overscroll-contain`: chegar ao fim do formulário não passa o arrasto para a página
              de trás — no tablet, era o que fazia o painel "travar" e a lista atrás se mexer. */}
          <div
            ref={rolagemRef}
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
            onInput={() => setMexido(true)}
            onChange={() => setMexido(true)}
          >
            <div className="bg-ink text-cream px-5 sm:px-6 pb-5">
              <h2 className="font-serif-luxury text-[32px] font-semibold leading-[1.1] text-white break-words">
                {titulo}
              </h2>
              {subtitulo && <p className="mt-1 text-[14px] leading-normal text-cream/80">{subtitulo}</p>}
              {cabecalho && <div className="mt-3.5">{cabecalho}</div>}
            </div>
            {children}
          </div>

          {rodape && (
            <footer
              className={`shrink-0 px-5 sm:px-6 pt-3 pb-[max(14px,env(safe-area-inset-bottom))] ${
                rodapeTom === 'escuro'
                  ? 'bg-ink text-cream rounded-t-[24px] pt-3.5'
                  : 'bg-surface border-t border-ink/6'
              }`}
            >
              {rodape}
            </footer>
          )}
        </div>
      </div>

      <ConfirmDialog pedido={confirmacao} onFechar={() => setConfirmacao(null)} />
    </>
  );
};

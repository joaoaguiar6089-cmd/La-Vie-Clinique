import React, { useId, useRef, useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { avisarMudanca, EscolhaNaJanela, OpcaoDaLista } from './JanelaDeEscolha';

export type { OpcaoDaLista } from './JanelaDeEscolha';
export { opcaoCombina } from './JanelaDeEscolha';

/**
 * A lista suspensa do sistema, no lugar do `<select>` nativo.
 *
 * O nativo mostrava as opções numa lista cinza e miúda, sem busca: achar "Restylane" entre trinta
 * produtos era rolar e ler um por um. Esta abre uma lista clara — o nome em negrito, o detalhe
 * (marca, saldo, preço) embaixo, o escolhido com o visto — e, quando a lista é longa, um campo de
 * busca por palavra, que ignora acento e maiúscula e acha cada palavra em qualquer ordem
 * ("hialu sofi" acha "Ácido hialurônico — Sofiderm").
 *
 * A lista abre na janela de escolha, no meio da tela (ver `JanelaDeEscolha`) — no computador e no
 * celular. Teclado: setas no campo abrem; na janela, setas, Enter e Esc.
 *
 * Opção com `acao` (o "+ Cadastrar produto novo", o "Outro material…") fica sempre no fim, mesmo
 * buscando — é a saída quando o que se procura não está na lista.
 */

interface ListaSuspensaProps {
  valor: string;
  onMudar: (valor: string) => void;
  opcoes: OpcaoDaLista[];
  /** O nome do campo. Com ele, o campo é o preenchido de 56px, com o rótulo dentro (`CampoTinta`). */
  rotulo?: string;
  /** Com `rotulo`, o texto quando nada foi escolhido. */
  placeholder?: string;
  /**
   * `campo`: 56px, rótulo dentro. `compacta`: 44px, para as linhas de material. `adicionar`: o
   * botão tracejado com "+" que acrescenta à lista ("+ Adicionar material") — mostra sempre o
   * `placeholder`, porque escolher é acrescentar, não guardar um valor. `pilula`: a pílula clara
   * sobre o bloco preto (a profissional do Financeiro).
   */
  variante?: 'campo' | 'compacta' | 'adicionar' | 'pilula';
  /** Mostra a busca. Padrão: mais de 7 opções. */
  buscavel?: boolean;
  placeholderDaBusca?: string;
  /** O que dizer quando a busca não acha nada. */
  vazio?: string;
  id?: string;
  erro?: string;
  className?: string;
  /** Nome para o leitor de tela quando não há `rotulo` visível. */
  rotuloAcessivel?: string;
  /** O título da janela, quando o rótulo do campo sozinho não diz o que se escolhe ("Em"). */
  tituloDaJanela?: string;
  disabled?: boolean;
}

export const ListaSuspensa: React.FC<ListaSuspensaProps> = ({
  valor,
  onMudar,
  opcoes,
  rotulo,
  placeholder = 'Escolha…',
  variante = rotulo ? 'campo' : 'compacta',
  buscavel,
  placeholderDaBusca = 'Buscar por palavra…',
  vazio = 'Nada encontrado.',
  id,
  erro,
  className = '',
  rotuloAcessivel,
  tituloDaJanela,
  disabled,
}) => {
  const idInterno = useId();
  const idBase = id || `lista-${idInterno}`;
  const gatilhoRef = useRef<HTMLButtonElement>(null);
  const [aberta, setAberta] = useState(false);

  // Uma ação também pode ser o valor (o "produto novo" do pedido) — aí o campo mostra o nome dela.
  const escolhida = opcoes.find((o) => o.valor === valor && !o.acao) || (valor ? opcoes.find((o) => o.valor === valor) : undefined);

  const abrir = () => {
    if (!disabled) setAberta(true);
  };

  const escolher = (o: OpcaoDaLista) => {
    onMudar(o.valor);
    // O `<select>` avisava o formulário em volta que algo mudou (o painel pergunta se descarta ao
    // fechar); esta avisa do mesmo jeito.
    if (o.valor !== valor) avisarMudanca(gatilhoRef.current);
  };

  const textoDoValor = escolhida && variante !== 'adicionar' ? escolhida.rotulo : placeholder;
  const detalheDoValor = escolhida?.detalhe;

  return (
    <div className={className}>
      <button
        ref={gatilhoRef}
        id={idBase}
        type="button"
        disabled={disabled}
        onClick={abrir}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            abrir();
          }
        }}
        data-valor={valor}
        aria-haspopup="dialog"
        aria-expanded={aberta}
        aria-label={rotulo ? undefined : rotuloAcessivel}
        aria-labelledby={rotulo ? `${idBase}-rotulo ${idBase}` : undefined}
        className={
          variante === 'adicionar'
            ? `inline-flex w-full sm:w-auto min-h-[44px] items-center gap-2 px-4 rounded-xl border border-dashed text-[14px] font-semibold text-ink transition-colors disabled:opacity-50 ${
                aberta ? 'border-ink bg-card' : 'border-ink/25 bg-card hover:border-ink/50'
              } focus:outline-none focus-visible:ring-2 focus-visible:ring-ink`
            : variante === 'pilula'
            ? `h-9 max-w-[190px] pl-3.5 pr-2.5 rounded-full bg-cream/10 text-cream text-[13px] font-semibold inline-flex items-center gap-1.5 transition-colors hover:bg-cream/15 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-light`
            : variante === 'campo'
            ? `w-full min-h-[56px] rounded-[14px] px-4 pt-2 pb-2.5 text-left flex items-center gap-2 transition-colors disabled:opacity-50 ${
                erro ? 'bg-danger-bg ring-2 ring-danger' : aberta ? 'bg-card ring-2 ring-ink' : 'bg-line-soft hover:bg-[#E9E6DF]'
              } focus:outline-none focus-visible:ring-2 focus-visible:ring-ink`
            : `w-full h-11 rounded-xl px-3 text-left flex items-center gap-2 transition-colors disabled:opacity-50 ${
                aberta ? 'bg-card ring-2 ring-ink' : 'bg-line-soft hover:bg-[#E9E6DF]'
              } focus:outline-none focus-visible:ring-2 focus-visible:ring-ink`
        }
      >
        {variante === 'adicionar' ? (
          <>
            <Plus className="w-4 h-4 shrink-0" aria-hidden />
            <span className="truncate">{placeholder}</span>
          </>
        ) : variante === 'pilula' ? (
          <span className="min-w-0 truncate">{textoDoValor}</span>
        ) : (
          <span className="min-w-0 flex-1">
            {variante === 'campo' && rotulo && (
              <span id={`${idBase}-rotulo`} className="block text-[12px] font-semibold text-ink-soft leading-tight mb-0.5">
                {rotulo}
              </span>
            )}
            <span className={`block truncate ${variante === 'campo' ? 'text-[16px]' : 'text-[15px]'} ${escolhida ? 'font-semibold text-ink' : 'font-medium text-muted'}`}>
              {textoDoValor}
              {detalheDoValor && variante === 'compacta' && <span className="font-medium text-ink-soft"> · {detalheDoValor}</span>}
            </span>
            {detalheDoValor && variante === 'campo' && <span className="block truncate text-[13px] text-ink-soft">{detalheDoValor}</span>}
          </span>
        )}
        {variante !== 'adicionar' && (
          <ChevronDown
            className={`shrink-0 ${variante === 'pilula' ? 'w-3.5 h-3.5 text-cream' : 'w-[18px] h-[18px] text-ink'}`}
            aria-hidden
          />
        )}
      </button>
      {erro && <p className="mt-1 px-1 text-[13px] font-medium text-danger">{erro}</p>}

      {aberta && (
        <EscolhaNaJanela
          idBase={idBase}
          titulo={tituloDaJanela || rotulo || rotuloAcessivel || placeholder}
          opcoes={opcoes}
          valor={variante === 'adicionar' ? undefined : valor}
          onEscolher={escolher}
          onFechar={() => setAberta(false)}
          buscavel={buscavel}
          placeholderDaBusca={placeholderDaBusca}
          vazio={vazio}
          origem={gatilhoRef}
        />
      )}
    </div>
  );
};

import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Plus, Search, X } from 'lucide-react';
import { BottomSheet } from './BottomSheet';
import { chaveDeNome } from '../../utils/templateMatching';

/**
 * A lista suspensa do sistema, no lugar do `<select>` nativo.
 *
 * O nativo mostrava as opções numa lista cinza e miúda, sem busca: achar "Restylane" entre trinta
 * produtos era rolar e ler um por um. Esta abre uma lista clara — o nome em negrito, o detalhe
 * (marca, saldo, preço) embaixo, o escolhido com o visto — e, quando a lista é longa, um campo de
 * busca por palavra, que ignora acento e maiúscula e acha cada palavra em qualquer ordem
 * ("hialu sofi" acha "Ácido hialurônico — Sofiderm").
 *
 * No computador, abre colada ao campo e acompanha a rolagem do formulário; no celular, sobe do
 * rodapé como as outras folhas do sistema, com a busca no topo. Teclado: setas, Enter e Esc.
 *
 * Opção com `acao` (o "+ Cadastrar produto novo", o "Outro material…") fica sempre no fim, mesmo
 * buscando — é a saída quando o que se procura não está na lista.
 */

export interface OpcaoDaLista {
  valor: string;
  rotulo: string;
  /** A segunda linha: marca, saldo, preço — o que ajuda a escolher. */
  detalhe?: string;
  /** Cabeçalho do grupo (categoria, tipo). Opções do mesmo grupo vêm juntas. */
  grupo?: string;
  /** Uma ação, e não um valor: fica no fim, com o "+", e não some na busca. */
  acao?: boolean;
  desabilitada?: boolean;
}

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
   * `placeholder`, porque escolher é acrescentar, não guardar um valor.
   */
  variante?: 'campo' | 'compacta' | 'adicionar';
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
  disabled?: boolean;
}

/** Cada palavra da busca precisa aparecer no nome, no detalhe ou no grupo — em qualquer ordem. */
export const opcaoCombina = (o: OpcaoDaLista, busca: string): boolean => {
  const palavras = chaveDeNome(busca).split(' ').filter(Boolean);
  if (palavras.length === 0) return true;
  const alvo = chaveDeNome(`${o.rotulo} ${o.detalhe || ''} ${o.grupo || ''}`);
  return palavras.every((p) => alvo.includes(p));
};

const LIMITE_SEM_BUSCA = 7;

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
  disabled,
}) => {
  const idInterno = useId();
  const idBase = id || `lista-${idInterno}`;
  const gatilhoRef = useRef<HTMLButtonElement>(null);
  const janelaRef = useRef<HTMLDivElement>(null);
  const buscaRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLUListElement>(null);
  const [aberta, setAberta] = useState(false);
  const [busca, setBusca] = useState('');
  const [realce, setRealce] = useState(0);
  const [ehCelular, setEhCelular] = useState(false);
  const [posicao, setPosicao] = useState<{ top: number; left: number; width: number; maxHeight: number; acima: boolean } | null>(null);

  const comBusca = buscavel ?? opcoes.filter((o) => !o.acao).length > LIMITE_SEM_BUSCA;
  // Uma ação também pode ser o valor (o "produto novo" do pedido) — aí o campo mostra o nome dela.
  const escolhida = opcoes.find((o) => o.valor === valor && !o.acao) || (valor ? opcoes.find((o) => o.valor === valor) : undefined);

  const visiveis = useMemo(() => {
    const valores = opcoes.filter((o) => !o.acao && (!comBusca || opcaoCombina(o, busca)));
    // Agrupadas na ordem em que o primeiro de cada grupo aparece.
    const ordemDosGrupos: string[] = [];
    valores.forEach((o) => {
      const g = o.grupo || '';
      if (!ordemDosGrupos.includes(g)) ordemDosGrupos.push(g);
    });
    const agrupadas = ordemDosGrupos.flatMap((g) => valores.filter((o) => (o.grupo || '') === g));
    return [...agrupadas, ...opcoes.filter((o) => o.acao)];
  }, [opcoes, busca, comBusca]);
  const escolhiveis = visiveis.filter((o) => !o.desabilitada);

  const posicionar = () => {
    const gatilho = gatilhoRef.current;
    if (!gatilho) return;
    const r = gatilho.getBoundingClientRect();
    const largura = Math.min(Math.max(r.width, 300), window.innerWidth - 16);
    const abaixo = window.innerHeight - r.bottom - 12;
    const acimaEspaco = r.top - 12;
    const acima = abaixo < 260 && acimaEspaco > abaixo;
    const maxHeight = Math.max(180, Math.min(420, acima ? acimaEspaco : abaixo));
    setPosicao({
      top: acima ? r.top - 6 : r.bottom + 6,
      left: Math.max(8, Math.min(r.left, window.innerWidth - largura - 8)),
      width: largura,
      maxHeight,
      acima,
    });
  };

  const abrir = () => {
    if (disabled) return;
    const celular = window.innerWidth < 640;
    setEhCelular(celular);
    setBusca('');
    const indice = escolhida && !escolhida.acao ? opcoes.filter((o) => !o.acao && !o.desabilitada).indexOf(escolhida) : 0;
    setRealce(Math.max(0, indice));
    if (!celular) posicionar();
    setAberta(true);
  };

  const fechar = (devolverFoco = true) => {
    setAberta(false);
    if (devolverFoco) gatilhoRef.current?.focus();
  };

  const escolher = (o: OpcaoDaLista) => {
    if (o.desabilitada) return;
    onMudar(o.valor);
    // O `<select>` avisava o formulário em volta que algo mudou (o painel pergunta se descarta ao
    // fechar); esta avisa do mesmo jeito — um `input` que sobe do campo.
    if (o.valor !== valor) gatilhoRef.current?.dispatchEvent(new Event('input', { bubbles: true }));
    fechar();
  };

  // A janela acompanha o campo enquanto o formulário rola, e fecha com clique fora.
  useEffect(() => {
    if (!aberta || ehCelular) return;
    let quadro = 0;
    const acompanhar = () => {
      cancelAnimationFrame(quadro);
      quadro = requestAnimationFrame(posicionar);
    };
    const fora = (e: MouseEvent) => {
      const alvo = e.target as Node;
      if (janelaRef.current?.contains(alvo) || gatilhoRef.current?.contains(alvo)) return;
      fechar(false);
    };
    window.addEventListener('scroll', acompanhar, true);
    window.addEventListener('resize', acompanhar);
    document.addEventListener('mousedown', fora);
    return () => {
      cancelAnimationFrame(quadro);
      window.removeEventListener('scroll', acompanhar, true);
      window.removeEventListener('resize', acompanhar);
      document.removeEventListener('mousedown', fora);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberta, ehCelular]);

  // Ao abrir no computador: o foco vai para a busca (ou para a lista) na hora — um Esc logo depois do
  // clique já é da lista. No celular o foco fica na gaveta, sem abrir o teclado por cima das opções;
  // a busca está no alto, a um toque. Nos dois, a opção escolhida aparece na tela.
  useLayoutEffect(() => {
    if (!aberta) return;
    if (!ehCelular) {
      if (comBusca) buscaRef.current?.focus({ preventScroll: true });
      else listaRef.current?.focus({ preventScroll: true });
    }
    listaRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [aberta, comBusca, ehCelular]);

  useEffect(() => {
    if (!aberta) return;
    listaRef.current?.querySelector<HTMLElement>(`[data-indice="${realce}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [realce, aberta]);

  const noTeclado = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setRealce((i) => Math.min(escolhiveis.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setRealce((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const o = escolhiveis[realce];
      if (o) escolher(o);
    } else if (e.key === 'Escape') {
      // O Esc é desta lista — não do formulário em volta, que perguntaria se descarta.
      e.preventDefault();
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      fechar();
    } else if (e.key === 'Tab') {
      fechar(false);
    }
  };

  const idDaLista = `${idBase}-opcoes`;

  const conteudo = (
    <div
      className="flex flex-col min-h-0"
      onKeyDown={noTeclado}
      // Digitar na busca não é mexer no formulário: o evento para aqui (no React, ele subiria do
      // portal até o painel e contaria como alteração).
      onInput={(e) => e.stopPropagation()}
      onChange={(e) => e.stopPropagation()}
    >
      {comBusca && (
        <div className="p-2 border-b border-ink/8 shrink-0">
          <label className="flex items-center gap-2 h-11 px-3 rounded-xl bg-line-soft focus-within:bg-card focus-within:ring-2 focus-within:ring-ink">
            <Search className="w-4 h-4 text-ink-soft shrink-0" aria-hidden />
            <span className="sr-only">Buscar</span>
            <input
              ref={buscaRef}
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setRealce(0);
              }}
              placeholder={placeholderDaBusca}
              autoComplete="off"
              aria-controls={idDaLista}
              aria-activedescendant={escolhiveis[realce] ? `${idBase}-op-${realce}` : undefined}
              className="w-full min-w-0 bg-transparent border-0 p-0 text-[15px] font-medium text-ink placeholder:text-muted focus:outline-none"
            />
            {busca && (
              <button
                type="button"
                onClick={() => {
                  setBusca('');
                  buscaRef.current?.focus();
                }}
                aria-label="Limpar a busca"
                className="w-7 h-7 -mr-1 rounded-full flex items-center justify-center text-ink-soft hover:bg-ink/5"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </label>
        </div>
      )}
      <ul
        ref={listaRef}
        id={idDaLista}
        role="listbox"
        tabIndex={comBusca ? -1 : 0}
        aria-label={rotulo || rotuloAcessivel}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1.5 focus:outline-none"
      >
        {visiveis.filter((o) => !o.acao).length === 0 && (
          <li className="px-4 py-3 text-[14px] text-ink-soft">{vazio}</li>
        )}
        {visiveis.map((o, i) => {
          const indice = escolhiveis.indexOf(o);
          const realcada = indice === realce && indice >= 0;
          const selecionada = !o.acao && o.valor === valor;
          const grupoNovo = !o.acao && o.grupo && (i === 0 || visiveis[i - 1].grupo !== o.grupo);
          return (
            <React.Fragment key={`${o.acao ? 'acao' : 'op'}-${o.valor}`}>
              {grupoNovo && (
                <li role="presentation" className="px-4 pt-2.5 pb-1 text-[12px] font-semibold text-ink-soft">
                  {o.grupo}
                </li>
              )}
              {o.acao && i > 0 && !visiveis[i - 1].acao && <li role="presentation" className="my-1 border-t border-ink/8" />}
              <li
                id={indice >= 0 ? `${idBase}-op-${indice}` : undefined}
                data-indice={indice}
                role="option"
                aria-selected={selecionada}
                aria-disabled={o.desabilitada || undefined}
                onMouseEnter={() => indice >= 0 && setRealce(indice)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => escolher(o)}
                className={`mx-1.5 px-3 py-2.5 rounded-xl flex items-center gap-3 cursor-pointer select-none ${
                  o.desabilitada ? 'opacity-40 cursor-not-allowed' : realcada ? 'bg-line-soft' : ''
                }`}
              >
                {o.acao ? (
                  <Plus className="w-4 h-4 shrink-0 text-ink" aria-hidden />
                ) : (
                  <Check className={`w-4 h-4 shrink-0 ${selecionada ? 'text-ink' : 'text-transparent'}`} aria-hidden />
                )}
                <span className="min-w-0 flex-1">
                  <span className={`block text-[15px] leading-snug ${o.acao ? 'font-semibold text-ink underline underline-offset-2' : 'font-semibold text-ink'}`}>
                    {o.rotulo}
                  </span>
                  {o.detalhe && <span className="block text-[13px] leading-snug text-ink-soft">{o.detalhe}</span>}
                </span>
              </li>
            </React.Fragment>
          );
        })}
      </ul>
    </div>
  );

  const textoDoValor = escolhida && variante !== 'adicionar' ? escolhida.rotulo : placeholder;
  const detalheDoValor = escolhida?.detalhe;

  return (
    <div className={className}>
      <button
        ref={gatilhoRef}
        id={idBase}
        type="button"
        disabled={disabled}
        onClick={() => (aberta ? fechar() : abrir())}
        onKeyDown={(e) => {
          // Aberta, as teclas valem como na lista — inclusive o Esc, que não pode chegar ao formulário.
          if (aberta) noTeclado(e);
          else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            abrir();
          }
        }}
        role="combobox"
        data-valor={valor}
        aria-haspopup="listbox"
        aria-expanded={aberta}
        aria-controls={aberta ? idDaLista : undefined}
        aria-label={rotulo ? undefined : rotuloAcessivel}
        aria-labelledby={rotulo ? `${idBase}-rotulo ${idBase}` : undefined}
        className={
          variante === 'adicionar'
            ? `inline-flex w-full sm:w-auto min-h-[44px] items-center gap-2 px-4 rounded-xl border border-dashed text-[14px] font-semibold text-ink transition-colors disabled:opacity-50 ${
                aberta ? 'border-ink bg-card' : 'border-ink/25 bg-card hover:border-ink/50'
              } focus:outline-none focus-visible:ring-2 focus-visible:ring-ink`
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
          <ChevronDown className={`w-[18px] h-[18px] shrink-0 text-ink transition-transform ${aberta ? 'rotate-180' : ''}`} aria-hidden />
        )}
      </button>
      {erro && <p className="mt-1 px-1 text-[13px] font-medium text-danger">{erro}</p>}

      {aberta && ehCelular && (
        <BottomSheet aberto onFechar={() => fechar()} titulo={rotulo || rotuloAcessivel || 'Escolha'} className="max-h-[85vh] flex flex-col">
          <div className="flex flex-col min-h-0 max-h-[70vh]">{conteudo}</div>
        </BottomSheet>
      )}

      {aberta &&
        !ehCelular &&
        posicao &&
        createPortal(
          <div
            ref={janelaRef}
            className="fixed z-[70] flex flex-col rounded-2xl bg-card border border-ink/10 shadow-[0_14px_36px_rgba(26,26,26,.18)] overflow-hidden animate-fadeIn"
            style={{
              left: posicao.left,
              width: posicao.width,
              maxHeight: posicao.maxHeight,
              ...(posicao.acima ? { bottom: window.innerHeight - posicao.top } : { top: posicao.top }),
            }}
          >
            {conteudo}
          </div>,
          document.body
        )}
    </div>
  );
};

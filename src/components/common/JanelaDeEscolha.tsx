import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, CornerDownLeft, Plus, Search, X } from 'lucide-react';
import { useTravarRolagem, useVoltarFecha } from '../../hooks/useVoltarFecha';
import { chaveDeNome } from '../../utils/templateMatching';

/**
 * A janela de escolha do sistema: toda lista de onde se escolhe alguma coisa — o procedimento do
 * catálogo, a paciente, o produto do estoque, a profissional, o tipo de produto — abre aqui.
 *
 * Antes, cada lista abria colada embaixo do campo, dentro do formulário que rola. No painel do
 * atendimento, o "3º procedimento" mostrava um ou dois itens do catálogo e o resto ficava para
 * baixo, cortado pela borda do painel: era preciso rolar o formulário para ler a lista. Agora a
 * lista abre numa janela pequena no meio da tela, por cima de tudo — morando no `body`, fora do
 * painel que a chamou, para nenhum `overflow` cortá-la —, com a busca no topo e a lista rolando
 * dentro dela. É igual no computador e no celular.
 *
 * Fecha pelo X, pelo Esc, pelo toque fora e pelo voltar do celular; nenhum desses caminhos mexe no
 * campo. Com o teclado do celular aberto, a janela cabe na parte da tela que ficou visível.
 *
 * Dois níveis:
 * - `JanelaDeEscolha`: só a janela (véu, título, X, busca, corpo que rola, rodapé). Para quem
 *   monta a própria lista — a escolha de vários procedimentos, com as caixas de marcar.
 * - `EscolhaNaJanela`: a janela já com a lista de opções, a busca por palavra, o teclado (setas e
 *   Enter) e, quando o campo aceita, o "usar o que eu digitei".
 *
 * As duas existem enquanto montadas: quem chama renderiza `{aberta && <EscolhaNaJanela … />}`.
 */

// ==========================================
// A JANELA
// ==========================================

/**
 * A parte da tela que está de fato à vista. No celular, o teclado cobre o rodapé sem encolher a
 * página (`fixed inset-0` continua indo até embaixo dele); a janela centralizada ficaria com a
 * metade de baixo atrás do teclado. O `visualViewport` diz o que sobrou acima dele.
 */
function useAreaVisivel(): { top: number; altura: number } | null {
  const [area, setArea] = useState<{ top: number; altura: number } | null>(null);
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return;
    const medir = () => setArea({ top: vv.offsetTop, altura: vv.height });
    medir();
    vv.addEventListener('resize', medir);
    vv.addEventListener('scroll', medir);
    return () => {
      vv.removeEventListener('resize', medir);
      vv.removeEventListener('scroll', medir);
    };
  }, []);
  return area;
}

export interface BuscaDaJanela {
  valor: string;
  onMudar: (valor: string) => void;
  placeholder?: string;
  /** O `id` da lista que a busca filtra, e o da opção realçada — para o leitor de tela. */
  controla?: string;
  ativo?: string;
}

interface JanelaDeEscolhaProps {
  /** Fechar sem escolher. */
  onFechar: () => void;
  titulo: string;
  descricao?: string;
  /** O campo de busca no topo, com o foco já nele. Ausente = janela sem busca. */
  busca?: BuscaDaJanela;
  /** O que fica preso entre a busca e a lista, fora da rolagem — filtros por categoria. */
  topo?: React.ReactNode;
  /** As teclas da lista (setas, Enter). O Esc é da janela e não chega aqui. */
  onTeclado?: (e: React.KeyboardEvent) => void;
  /** Quem recebe o foco quando não há busca. Sem isto, a própria janela. */
  focoInicial?: React.RefObject<HTMLElement | null>;
  /** O campo que abriu a janela: o foco volta para ele ao fechar. */
  origem?: React.RefObject<HTMLElement | null>;
  /** Preso embaixo, fora da rolagem. */
  rodape?: React.ReactNode;
  children: React.ReactNode;
}

export const JanelaDeEscolha: React.FC<JanelaDeEscolhaProps> = ({
  onFechar,
  titulo,
  descricao,
  busca,
  topo,
  onTeclado,
  focoInicial,
  origem,
  rodape,
  children,
}) => {
  const idTitulo = useId();
  const painelRef = useRef<HTMLDivElement>(null);
  const buscaRef = useRef<HTMLInputElement>(null);
  const area = useAreaVisivel();

  // `onFechar` costuma ser uma função nova a cada render; os ouvintes abaixo vivem a janela toda.
  const fecharRef = useRef(onFechar);
  fecharRef.current = onFechar;
  const fechar = () => fecharRef.current();

  useVoltarFecha(true, () => fecharRef.current());
  useTravarRolagem(true);

  // O Esc é desta janela, onde quer que esteja o foco: sem isto, ele chegaria ao formulário de
  // trás, que fecha (ou pergunta se descarta). Na captura, antes de qualquer outro ouvinte.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      fecharRef.current();
    };
    window.addEventListener('keydown', tecla, true);
    return () => window.removeEventListener('keydown', tecla, true);
  }, []);

  // O foco entra na hora: na busca, para já digitar; sem busca, na lista (as setas funcionam).
  useLayoutEffect(() => {
    const alvo = busca ? buscaRef.current : focoInicial?.current || painelRef.current;
    alvo?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ao fechar, o foco volta ao campo — o Tab continua dali, e não do começo da página.
  useEffect(() => {
    const voltar = origem?.current;
    return () => voltar?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pararAqui = (e: React.SyntheticEvent) => e.stopPropagation();

  return createPortal(
    <div
      className="fixed inset-x-0 z-[75] flex items-center justify-center p-4 bg-black/45 animate-fadeIn"
      style={area ? { top: area.top, height: area.altura } : { top: 0, bottom: 0 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) fechar();
        e.stopPropagation();
      }}
      // No React, os eventos sobem do portal até quem renderizou a janela — o formulário. Digitar
      // na busca não é mexer no formulário (o painel perguntaria se descarta), um Enter aqui não é
      // o Enter do formulário, e um clique aqui não é um clique no cartão de trás.
      onInput={pararAqui}
      onChange={pararAqui}
      onClick={pararAqui}
      onKeyDown={(e) => {
        onTeclado?.(e);
        e.stopPropagation();
      }}
    >
      <div
        ref={painelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        tabIndex={-1}
        className="w-full max-w-[440px] max-h-[min(640px,100%)] flex flex-col bg-card rounded-[22px] shadow-[0_24px_60px_rgba(26,26,26,.28)] overflow-hidden focus:outline-none animate-surgirNoCentro"
      >
        <div className="shrink-0 flex items-center gap-2 pl-5 pr-2 pt-2 pb-1">
          <div className="min-w-0 flex-1 py-1">
            <h2 id={idTitulo} className="truncate text-[17px] font-semibold text-ink leading-snug">
              {titulo}
            </h2>
            {descricao && <p className="truncate text-[13px] text-ink-soft leading-snug">{descricao}</p>}
          </div>
          <button
            type="button"
            onClick={fechar}
            aria-label="Fechar"
            title="Fechar"
            className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-ink hover:bg-ink/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {busca && (
          <div className="shrink-0 px-3 pb-2.5">
            <label className="flex items-center gap-2 h-12 px-3.5 rounded-[14px] bg-line-soft focus-within:bg-card focus-within:ring-2 focus-within:ring-ink">
              <Search className="w-[18px] h-[18px] text-ink-soft shrink-0" aria-hidden />
              <span className="sr-only">Buscar</span>
              <input
                ref={buscaRef}
                value={busca.valor}
                onChange={(e) => busca.onMudar(e.target.value)}
                placeholder={busca.placeholder || 'Buscar por palavra…'}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="go"
                role="combobox"
                aria-expanded="true"
                aria-controls={busca.controla}
                aria-activedescendant={busca.ativo}
                className="w-full min-w-0 bg-transparent border-0 p-0 text-[16px] font-medium text-ink placeholder:text-muted focus:outline-none"
              />
              {busca.valor && (
                <button
                  type="button"
                  onClick={() => {
                    busca.onMudar('');
                    buscaRef.current?.focus();
                  }}
                  aria-label="Limpar a busca"
                  className="w-8 h-8 -mr-1.5 shrink-0 rounded-full flex items-center justify-center text-ink-soft hover:bg-ink/5"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </label>
          </div>
        )}

        {topo && <div className="shrink-0">{topo}</div>}

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain border-t border-ink/8">{children}</div>

        {rodape && <div className="shrink-0 border-t border-ink/8">{rodape}</div>}
      </div>
    </div>,
    document.body
  );
};

// ==========================================
// A LISTA DE OPÇÕES
// ==========================================

export interface OpcaoDaLista {
  valor: string;
  rotulo: string;
  /** A segunda linha: marca, saldo, categoria — o que ajuda a escolher. */
  detalhe?: string;
  /** Texto curto à direita, na mesma linha do nome: o preço, o telefone. */
  lateral?: string;
  /** Cabeçalho do grupo (categoria, tipo). Opções do mesmo grupo vêm juntas. */
  grupo?: string;
  /** Uma ação, e não um valor: fica no fim, com o "+", e não some na busca. */
  acao?: boolean;
  desabilitada?: boolean;
  /** Ícone no lugar do visto — o "+" de quem acrescenta, o mapa de áreas. */
  icone?: React.ElementType;
  /** Recuada sob a opção de cima — a área do laser sob o procedimento dela. */
  recuo?: boolean;
}

/** Cada palavra da busca precisa aparecer no nome, no detalhe ou no grupo — em qualquer ordem. */
export const opcaoCombina = (o: Pick<OpcaoDaLista, 'rotulo' | 'detalhe' | 'grupo'>, busca: string): boolean => {
  const palavras = chaveDeNome(busca).split(' ').filter(Boolean);
  if (palavras.length === 0) return true;
  const alvo = chaveDeNome(`${o.rotulo} ${o.detalhe || ''} ${o.grupo || ''}`);
  return palavras.every((p) => alvo.includes(p));
};

/**
 * O formulário em volta fica sabendo que o campo mudou. Os painéis perguntam se descartam ao fechar
 * quando algo foi mexido, e o que eles escutam é o `input` que sobe dos campos — um `<input>`
 * avisava sozinho; um botão que abre a janela precisa avisar assim.
 */
export const avisarMudanca = (campo: HTMLElement | null | undefined) => {
  campo?.dispatchEvent(new Event('input', { bubbles: true }));
};

/** Com mais opções do que isto, a lista ganha a busca. */
const LIMITE_SEM_BUSCA = 7;

interface TextoLivre {
  /** O que a linha diz: "Registrar “Avaliação” como digitado". */
  rotulo: (texto: string) => string;
  detalhe?: string;
  onUsar: (texto: string) => void;
}

interface EscolhaNaJanelaProps {
  onFechar: () => void;
  titulo: string;
  descricao?: string;
  /**
   * As opções. Uma função recebe a busca e devolve a lista já filtrada — para quem procura de um
   * jeito próprio (o telefone da paciente, a área do laser pelo nome).
   */
  opcoes: OpcaoDaLista[] | ((busca: string) => OpcaoDaLista[]);
  /** O valor escolhido hoje, que aparece com o visto. Ausente = lista de acrescentar, sem visto. */
  valor?: string;
  /** Escolher fecha a janela. */
  onEscolher: (o: OpcaoDaLista) => void;
  /** Mostra a busca. Padrão: mais de 7 opções, opções por função ou texto livre. */
  buscavel?: boolean;
  /** O texto com que a busca abre — o nome digitado da última vez, para corrigir. */
  buscaInicial?: string;
  placeholderDaBusca?: string;
  /** O que dizer quando a busca não acha nada. */
  vazio?: string;
  /**
   * O campo aceita o que não está na lista (o procedimento "Retorno", a paciente sem cadastro). Com
   * algo digitado, aparece embaixo a linha de usar o texto como está.
   */
  textoLivre?: TextoLivre;
  /** O campo que abriu a janela — o foco volta para ele. */
  origem?: React.RefObject<HTMLElement | null>;
  /** Quantas opções desenhar de uma vez. As demais aparecem buscando. */
  limite?: number;
  /** Base dos `id`s das opções. */
  idBase?: string;
}

export const EscolhaNaJanela: React.FC<EscolhaNaJanelaProps> = ({
  onFechar,
  titulo,
  descricao,
  opcoes,
  valor,
  onEscolher,
  buscavel,
  buscaInicial = '',
  placeholderDaBusca = 'Buscar por palavra…',
  vazio = 'Nada encontrado.',
  textoLivre,
  origem,
  limite = 200,
  idBase: idBaseDado,
}) => {
  const idInterno = useId();
  const idBase = idBaseDado || `escolha-${idInterno}`;
  const idDaLista = `${idBase}-opcoes`;
  const listaRef = useRef<HTMLUListElement>(null);
  const [busca, setBusca] = useState(buscaInicial);

  const porFuncao = typeof opcoes === 'function';
  const comBusca =
    buscavel ?? (porFuncao || !!textoLivre || (opcoes as OpcaoDaLista[]).filter((o) => !o.acao).length > LIMITE_SEM_BUSCA);

  const { visiveis, escondidas } = useMemo(() => {
    const lista =
      typeof opcoes === 'function'
        ? opcoes(busca)
        : opcoes.filter((o) => o.acao || !comBusca || opcaoCombina(o, busca));
    const valores = lista.filter((o) => !o.acao);
    // Agrupadas na ordem em que o primeiro de cada grupo aparece.
    const ordemDosGrupos: string[] = [];
    valores.forEach((o) => {
      const g = o.grupo || '';
      if (!ordemDosGrupos.includes(g)) ordemDosGrupos.push(g);
    });
    const agrupadas = ordemDosGrupos.flatMap((g) => valores.filter((o) => (o.grupo || '') === g));
    return {
      visiveis: [...agrupadas.slice(0, limite), ...lista.filter((o) => o.acao)],
      escondidas: Math.max(0, agrupadas.length - limite),
    };
  }, [opcoes, busca, comBusca, limite]);

  const escolhiveis = visiveis.filter((o) => !o.desabilitada);
  const semResultado = visiveis.every((o) => o.acao);

  // O texto livre só aparece quando o digitado não é, ele mesmo, uma das opções.
  const digitado = busca.trim();
  const livre =
    textoLivre && digitado && !visiveis.some((o) => !o.acao && chaveDeNome(o.rotulo) === chaveDeNome(digitado))
      ? digitado
      : '';

  const [realce, setRealce] = useState(() => {
    const i = escolhiveis.findIndex((o) => !o.acao && valor !== undefined && o.valor === valor);
    return Math.max(0, i);
  });

  // A opção escolhida aparece na tela ao abrir, mesmo no meio de uma lista longa.
  useLayoutEffect(() => {
    listaRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'center' });
  }, []);

  useEffect(() => {
    listaRef.current?.querySelector<HTMLElement>(`[data-indice="${realce}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [realce]);

  const escolher = (o: OpcaoDaLista) => {
    if (o.desabilitada) return;
    onEscolher(o);
    onFechar();
  };

  const usarLivre = () => {
    if (!textoLivre || !livre) return;
    textoLivre.onUsar(livre);
    onFechar();
  };

  const noTeclado = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setRealce((i) => Math.min(escolhiveis.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setRealce((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      // O Enter de um botão (o X, o "usar o digitado") é do botão.
      if ((e.target as HTMLElement).tagName === 'BUTTON') return;
      e.preventDefault();
      // Nada na lista e algo digitado: o Enter registra o digitado. Com opções, escolhe a realçada —
      // o catálogo vem antes do texto solto.
      if (semResultado && livre) usarLivre();
      else if (escolhiveis[realce]) escolher(escolhiveis[realce]);
    }
  };

  const marcaEscolha = valor !== undefined;

  return (
    <JanelaDeEscolha
      onFechar={onFechar}
      titulo={titulo}
      descricao={descricao}
      origem={origem}
      focoInicial={listaRef}
      onTeclado={noTeclado}
      busca={
        comBusca
          ? {
              valor: busca,
              onMudar: (v) => {
                setBusca(v);
                setRealce(0);
              },
              placeholder: placeholderDaBusca,
              controla: idDaLista,
              ativo: escolhiveis[realce] ? `${idBase}-op-${realce}` : undefined,
            }
          : undefined
      }
      rodape={
        livre ? (
          <div className="p-1.5">
            <button
              type="button"
              onClick={usarLivre}
              className={`w-full min-h-[52px] px-3 py-2 rounded-xl flex items-center gap-3 text-left transition-colors hover:bg-line-soft ${
                semResultado ? 'bg-line-soft' : ''
              }`}
            >
              <CornerDownLeft className="w-4 h-4 shrink-0 text-ink" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] leading-snug font-semibold text-ink break-words">
                  {textoLivre!.rotulo(livre)}
                </span>
                {textoLivre!.detalhe && (
                  <span className="block text-[13px] leading-snug text-ink-soft">{textoLivre!.detalhe}</span>
                )}
              </span>
            </button>
          </div>
        ) : undefined
      }
    >
      <ul
        ref={listaRef}
        id={idDaLista}
        role="listbox"
        tabIndex={comBusca ? -1 : 0}
        aria-label={titulo}
        aria-activedescendant={!comBusca && escolhiveis[realce] ? `${idBase}-op-${realce}` : undefined}
        className="py-1.5 focus:outline-none"
      >
        {semResultado && <li className="px-5 py-3 text-[14px] text-ink-soft">{vazio}</li>}
        {visiveis.map((o, i) => {
          const indice = escolhiveis.indexOf(o);
          const realcada = indice === realce && indice >= 0;
          const selecionada = marcaEscolha && !o.acao && o.valor === valor;
          const grupoNovo = !o.acao && o.grupo && (i === 0 || visiveis[i - 1].grupo !== o.grupo);
          const Icone = o.acao ? Plus : o.icone;
          return (
            <React.Fragment key={`${o.acao ? 'acao' : 'op'}-${o.valor}`}>
              {grupoNovo && (
                <li
                  role="presentation"
                  className="sticky top-0 z-[1] bg-card px-5 pt-2.5 pb-1 text-[12px] font-semibold text-ink-soft"
                >
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
                onMouseMove={() => indice >= 0 && indice !== realce && setRealce(indice)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => escolher(o)}
                className={`mx-1.5 min-h-[48px] px-3 py-2 rounded-xl flex items-center gap-3 cursor-pointer select-none ${
                  o.recuo ? 'pl-9' : ''
                } ${o.desabilitada ? 'opacity-40 cursor-not-allowed' : realcada ? 'bg-line-soft' : ''}`}
              >
                {Icone ? (
                  <Icone className="w-4 h-4 shrink-0 text-ink" aria-hidden />
                ) : marcaEscolha ? (
                  <Check className={`w-4 h-4 shrink-0 ${selecionada ? 'text-ink' : 'text-transparent'}`} aria-hidden />
                ) : null}
                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-[15px] leading-snug font-semibold text-ink break-words ${
                      o.acao ? 'underline underline-offset-2' : ''
                    }`}
                  >
                    {o.rotulo}
                  </span>
                  {o.detalhe && <span className="block text-[13px] leading-snug text-ink-soft">{o.detalhe}</span>}
                </span>
                {o.lateral && (
                  <span className="shrink-0 max-w-[40%] truncate text-right text-[13px] text-ink-soft tabular-nums">
                    {o.lateral}
                  </span>
                )}
              </li>
            </React.Fragment>
          );
        })}
        {escondidas > 0 && (
          <li role="presentation" className="px-5 py-3 text-[13px] text-ink-soft">
            E mais {escondidas} — digite para achar.
          </li>
        )}
      </ul>
    </JanelaDeEscolha>
  );
};

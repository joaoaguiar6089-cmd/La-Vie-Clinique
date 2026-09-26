import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, MoreHorizontal, Search, X } from 'lucide-react';
import { formatBRL } from '../../utils/formatters';
import { BottomSheet, ItemDaFolha } from './BottomSheet';

/**
 * As peças da direção "Tinta" do redesign — mesma paleta de sempre, mais contraste e hierarquia.
 *
 * Moram juntas porque são uma gramática só, e é isso que o redesign pede: um título de tela, um
 * estilo de aba, um de filtro, um de busca, um botão principal por linha. Antes cada tela desenhava
 * o seu, e a mesma função aparecia com quatro caras diferentes (o chip de período da Hoje, o do
 * Financeiro, o de status dos Orçamentos e o de janela das fichas).
 *
 * Regras que atravessam todas elas:
 * - o preto (`ink`) é a cor da ação e da seleção; o bronze claro só aparece sobre o preto;
 * - texto secundário é `ink-soft` ou `muted`, nunca mais claro — tudo passa de 4,5:1;
 * - alvo de toque de 44px no mínimo; campo de formulário de 52px.
 */

// ==========================================
// TÍTULO DA TELA
// ==========================================

interface TituloDaTelaProps {
  titulo: React.ReactNode;
  /** Linha pequena acima do título — a data, na Hoje. */
  sobre?: React.ReactNode;
  /** Linha abaixo do título — uma contagem, um período. */
  sub?: React.ReactNode;
  /** O que fica à direita: a pílula preta de criar, a lupa. */
  acao?: React.ReactNode;
  className?: string;
}

/**
 * O título grande no topo de cada tela. Substitui o cabeçalho do celular que repetia o nome da
 * clínica cortado ao meio: quem está na tela quer saber **onde** está, e o nome da clínica não
 * muda de uma tela para outra.
 */
export const TituloDaTela: React.FC<TituloDaTelaProps> = ({ titulo, sobre, sub, acao, className = '' }) => (
  <header className={`flex items-center justify-between gap-3 ${className}`}>
    <div className="min-w-0">
      {sobre && (
        <p className="text-[13px] lg:text-[14px] font-semibold text-muted first-letter:uppercase">
          {sobre}
        </p>
      )}
      <h1 className="font-serif-luxury text-[34px] lg:text-[42px] font-semibold leading-[1.1] text-ink break-words">
        {titulo}
      </h1>
      {sub && <p className="text-[13px] font-medium text-ink-soft mt-1">{sub}</p>}
    </div>
    {acao && <div className="shrink-0 flex items-center gap-2">{acao}</div>}
  </header>
);

// ==========================================
// BOTÕES
// ==========================================

interface BotaoPilulaProps {
  children: React.ReactNode;
  onClick?: () => void;
  icone?: React.ElementType;
  /** `preto` é a ação principal; `contorno` a secundária; `ouro` só sobre fundo preto. */
  tom?: 'preto' | 'contorno' | 'ouro' | 'contorno-escuro';
  type?: 'button' | 'submit';
  form?: string;
  disabled?: boolean;
  title?: string;
  className?: string;
}

const TOM_DA_PILULA: Record<NonNullable<BotaoPilulaProps['tom']>, string> = {
  preto: 'bg-ink text-white hover:bg-black',
  contorno: 'border border-ink/15 text-ink hover:border-ink/40 bg-transparent',
  ouro: 'bg-brand-light text-ink hover:bg-[#B88E67]',
  'contorno-escuro': 'border border-cream/25 text-cream hover:border-cream/50',
};

/** A pílula de 44px — "Nova", "Novo", "Produto", "Enviar". */
export const BotaoPilula: React.FC<BotaoPilulaProps> = ({
  children,
  onClick,
  icone: Icone,
  tom = 'preto',
  type = 'button',
  form,
  disabled,
  title,
  className = '',
}) => (
  <button
    type={type}
    form={form}
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`inline-flex items-center justify-center gap-2 h-11 px-4 rounded-full text-[14px] font-semibold whitespace-nowrap transition-colors active:scale-[.97] disabled:opacity-50 disabled:cursor-not-allowed ${TOM_DA_PILULA[tom]} ${className}`}
  >
    {Icone && <Icone className="w-[18px] h-[18px] shrink-0" />}
    {children}
  </button>
);

/**
 * O botão principal de um formulário: preto, 56px, largura toda, dizendo o que vai acontecer —
 * "Agendar · ter, 29/09 às 10:00", e não "Salvar".
 */
export const BotaoPrincipal: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  form?: string;
  disabled?: boolean;
  icone?: React.ElementType;
  className?: string;
}> = ({ children, onClick, type = 'button', form, disabled, icone: Icone, className = '' }) => (
  <button
    type={type}
    form={form}
    onClick={onClick}
    disabled={disabled}
    className={`w-full min-h-[56px] px-5 rounded-full bg-ink text-white text-[16px] font-bold flex items-center justify-center gap-2 text-center leading-tight transition-colors hover:bg-black active:scale-[.99] disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
  >
    {Icone && <Icone className="w-[18px] h-[18px] shrink-0" />}
    {children}
  </button>
);

/** O botão redondo de 44px com borda — a lupa da Hoje, o "+" de um horário livre. */
export const BotaoRedondo: React.FC<{
  icone: React.ElementType;
  rotulo: string;
  onClick?: () => void;
  tamanho?: 36 | 40 | 44;
  tom?: 'contorno' | 'preto' | 'escuro';
  className?: string;
}> = ({ icone: Icone, rotulo, onClick, tamanho = 44, tom = 'contorno', className = '' }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={rotulo}
    title={rotulo}
    className={`shrink-0 rounded-full flex items-center justify-center transition-colors active:scale-95 ${
      tom === 'preto'
        ? 'bg-ink text-white hover:bg-black'
        : tom === 'escuro'
        ? 'bg-cream/10 text-cream hover:bg-cream/20'
        : 'border border-ink/15 text-ink hover:border-ink/40 hover:bg-card'
    } ${className}`}
    style={{ width: tamanho, height: tamanho }}
  >
    <Icone className={tamanho === 36 ? 'w-4 h-4' : 'w-5 h-5'} />
  </button>
);

// ==========================================
// BUSCA, ABAS, SEGMENTADO, CHIP
// ==========================================

interface CampoDeBuscaProps {
  valor: string;
  onMudar: (valor: string) => void;
  placeholder: string;
  /** `preenchido` é o campo das listas; `pilula` o da Hoje e de Pacientes, branco e com sombra. */
  variante?: 'preenchido' | 'pilula';
  className?: string;
  autoFocus?: boolean;
  rotulo?: string;
}

export const CampoDeBusca: React.FC<CampoDeBuscaProps> = ({
  valor,
  onMudar,
  placeholder,
  variante = 'preenchido',
  className = '',
  autoFocus,
  rotulo,
}) => (
  <label
    className={`flex items-center gap-2.5 transition-colors ${
      variante === 'pilula'
        ? 'h-[54px] px-5 rounded-full bg-card border border-ink/12 shadow-[0_4px_14px_rgba(26,26,26,.06)] focus-within:border-ink'
        : 'h-12 px-4 rounded-[14px] bg-line-soft focus-within:bg-card focus-within:ring-2 focus-within:ring-ink'
    } ${className}`}
  >
    <Search className="w-[18px] h-[18px] text-ink-soft shrink-0" aria-hidden />
    <input
      type="search"
      value={valor}
      onChange={(e) => onMudar(e.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
      aria-label={rotulo || placeholder}
      className="flex-1 min-w-0 bg-transparent border-0 p-0 text-[15px] text-ink placeholder:text-ink-soft focus:outline-none [&::-webkit-search-cancel-button]:hidden"
    />
    {valor && (
      <button
        type="button"
        onClick={() => onMudar('')}
        aria-label="Limpar a busca"
        className="w-8 h-8 -mr-2 shrink-0 rounded-full flex items-center justify-center text-ink-soft hover:text-ink hover:bg-black/5"
      >
        <X className="w-4 h-4" />
      </button>
    )}
  </label>
);

/** Falso campo de busca: um botão com cara de campo, que abre a busca global. */
export const GatilhoDeBusca: React.FC<{
  onClick: () => void;
  texto: string;
  className?: string;
}> = ({ onClick, texto, className = '' }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex items-center gap-2.5 h-[52px] px-5 rounded-full bg-card border border-ink/12 shadow-[0_4px_14px_rgba(26,26,26,.06)] text-left text-[15px] text-muted hover:border-ink/40 transition-colors ${className}`}
  >
    <Search className="w-[18px] h-[18px] shrink-0 text-ink-soft" aria-hidden />
    <span className="flex-1 min-w-0 truncate">{texto}</span>
    <kbd className="hidden lg:inline text-[12px] font-sans font-semibold text-ink-soft px-1.5 py-0.5 rounded-md bg-line-soft">
      ⌘K
    </kbd>
  </button>
);

export interface AbaTinta<T extends string> {
  id: T;
  rotulo: string;
  contagem?: number;
}

/**
 * As abas de uma tela — "Todos 7 · Rascunho · Enviados". Sublinhado preto de 2px na ativa; é o
 * único desenho de aba do sistema.
 */
export function AbasSublinhadas<T extends string>({
  abas,
  ativa,
  onSelecionar,
  className = '',
}: {
  abas: AbaTinta<T>[];
  ativa: T;
  onSelecionar: (id: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={`flex gap-[22px] border-b border-ink/10 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      {abas.map((aba) => {
        const ehAtiva = aba.id === ativa;
        return (
          <button
            key={aba.id}
            type="button"
            role="tab"
            aria-selected={ehAtiva}
            onClick={() => onSelecionar(aba.id)}
            className={`shrink-0 whitespace-nowrap pt-1 pb-2.5 -mb-px border-b-2 text-[15px] font-semibold transition-colors ${
              ehAtiva ? 'text-ink border-ink' : 'text-muted border-transparent hover:text-ink'
            }`}
          >
            {aba.rotulo}
            {aba.contagem !== undefined && <span className="ml-1.5 tabular-nums">{aba.contagem}</span>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * O controle segmentado — para **trocar de vista** (dia/semana/mês, por unidade/por caixa). Filtro
 * é chip; vista é segmentado. Dois desenhos, duas funções.
 */
export function Segmentado<T extends string>({
  opcoes,
  valor,
  onMudar,
  tom = 'claro',
  cheio = false,
  rotulo,
  className = '',
}: {
  opcoes: { id: T; rotulo: string }[];
  valor: T;
  onMudar: (id: T) => void;
  tom?: 'claro' | 'escuro';
  /** Ocupa a largura toda, em colunas iguais — o "Por unidade · Por caixa" do formulário. */
  cheio?: boolean;
  rotulo?: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={rotulo}
      className={`${cheio ? 'grid' : 'inline-flex'} gap-1 p-1 rounded-xl ${
        tom === 'escuro' ? 'bg-cream/10' : 'bg-line-soft'
      } ${className}`}
      style={cheio ? { gridTemplateColumns: `repeat(${opcoes.length}, minmax(0, 1fr))` } : undefined}
    >
      {opcoes.map((o) => {
        const ativo = o.id === valor;
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={ativo}
            onClick={() => onMudar(o.id)}
            className={`${cheio ? 'h-10' : 'h-8'} px-3 rounded-[9px] text-[13px] font-semibold whitespace-nowrap transition-colors ${
              tom === 'escuro'
                ? ativo
                  ? 'bg-cream text-ink'
                  : 'text-cream/80 hover:text-white'
                : ativo
                ? 'bg-card text-ink shadow-[0_1px_2px_rgba(26,26,26,.08)]'
                : 'text-ink-soft hover:text-ink'
            }`}
          >
            {o.rotulo}
          </button>
        );
      })}
    </div>
  );
}

/** O chip de filtro. Aceso = preto. Com `cor`, leva o ponto da profissional. */
export const Chip: React.FC<{
  ativo: boolean;
  onClick: () => void;
  cor?: string;
  tom?: 'claro' | 'escuro';
  children: React.ReactNode;
  title?: string;
}> = ({ ativo, onClick, cor, tom = 'claro', children, title }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={ativo}
    title={title}
    className={`inline-flex items-center gap-2 h-9 px-3.5 rounded-full border text-[14px] font-semibold whitespace-nowrap transition-colors ${
      tom === 'escuro'
        ? ativo
          ? 'bg-cream text-ink border-cream'
          : 'border-cream/25 text-cream hover:border-cream/50'
        : ativo
        ? 'bg-ink text-white border-ink'
        : 'border-ink/15 text-ink hover:border-ink/40'
    }`}
  >
    {cor && <span aria-hidden className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cor }} />}
    {children}
  </button>
);

// ==========================================
// AVATAR, VALOR
// ==========================================

/** "Dra. Karoline Ferreira" → "KF"; com `letras = 1`, "K". O título profissional não conta. */
export const iniciaisDe = (nome: string, letras: number = 1): string => {
  const palavras = (nome || '')
    .replace(/^(Dra?\.?|Dr\.?)\s+/i, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (palavras.length === 0) return '?';
  const primeira = palavras[0][0];
  if (letras === 1 || palavras.length === 1) return primeira.toUpperCase();
  return `${primeira}${palavras[palavras.length - 1][0]}`.toUpperCase();
};

/** O círculo com a inicial — preto com a letra bronze, ou bronze com a letra preta. */
export const Avatar: React.FC<{
  nome: string;
  tamanho?: number;
  tom?: 'escuro' | 'ouro';
  letras?: 1 | 2;
  className?: string;
}> = ({ nome, tamanho = 46, tom = 'escuro', letras = 1, className = '' }) => (
  <span
    aria-hidden
    className={`shrink-0 rounded-full flex items-center justify-center font-serif-luxury font-semibold ${
      tom === 'ouro' ? 'bg-brand-light text-ink' : 'bg-ink text-brand-pale'
    } ${className}`}
    style={{ width: tamanho, height: tamanho, fontSize: Math.round(tamanho * 0.4) }}
  >
    {iniciaisDe(nome, letras)}
  </span>
);

/**
 * Valor em reais com os centavos menores — "R$ 2.085" grande e ",00" num degrau abaixo. O número
 * que importa é o inteiro; os centavos continuam lá, porque dinheiro não se abrevia.
 */
export const ValorEmReais: React.FC<{ valor: number; className?: string; centavosClassName?: string }> = ({
  valor,
  className = '',
  centavosClassName = '',
}) => {
  const texto = formatBRL(valor);
  const virgula = texto.lastIndexOf(',');
  return (
    <span className={`tabular-nums ${className}`}>
      {virgula > 0 ? (
        <>
          {texto.slice(0, virgula)}
          <span className={centavosClassName}>{texto.slice(virgula)}</span>
        </>
      ) : (
        texto
      )}
    </span>
  );
};

/** Selo de status em pílula — "Rascunho", "Pago". */
export const Selo: React.FC<{ className?: string; children: React.ReactNode }> = ({
  className = '',
  children,
}) => (
  <span
    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-bold whitespace-nowrap ${className}`}
  >
    {children}
  </span>
);

// ==========================================
// MENU "…"
// ==========================================

export interface AcaoDoMenu {
  rotulo: string;
  onClick: () => void;
  icone?: React.ElementType;
  tom?: 'normal' | 'perigo';
  descricao?: string;
}

/**
 * O "…" de uma linha: tudo o que não é a ação principal dela.
 *
 * No celular vira folha que sobe do rodapé (onde o polegar está); no desktop, um menu solto
 * encostado no botão. O menu mora no `body` — a lista pode estar dentro de um card com
 * `overflow-hidden` ou de um painel com animação, e os dois cortariam ou prenderiam o menu.
 */
export const MenuDeAcoes: React.FC<{
  acoes: AcaoDoMenu[];
  rotulo: string;
  titulo?: string;
  tom?: 'contorno' | 'escuro' | 'discreto';
  /** Com texto, o gatilho vira a pílula preta — o "Criar" da Hoje no desktop. */
  gatilho?: { texto: string; icone?: React.ElementType };
  className?: string;
}> = ({ acoes, rotulo, titulo, tom = 'contorno', gatilho, className = '' }) => {
  const botaoRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [aberto, setAberto] = useState(false);
  const [posicao, setPosicao] = useState<{ top: number; left: number } | null>(null);
  const [ehCelular, setEhCelular] = useState(false);

  const fechar = () => setAberto(false);

  const abrir = () => {
    const celular = window.innerWidth < 640;
    setEhCelular(celular);
    if (!celular && botaoRef.current) {
      const r = botaoRef.current.getBoundingClientRect();
      const largura = 248;
      const alturaEstimada = acoes.length * 44 + 12;
      const cabeAbaixo = r.bottom + 6 + alturaEstimada < window.innerHeight;
      setPosicao({
        top: cabeAbaixo ? r.bottom + 6 : Math.max(8, r.top - 6 - alturaEstimada),
        left: Math.max(8, Math.min(r.right - largura, window.innerWidth - largura - 8)),
      });
    }
    setAberto(true);
  };

  useEffect(() => {
    if (!aberto || ehCelular) return;
    const fora = (e: MouseEvent) => {
      const alvo = e.target as Node;
      if (menuRef.current?.contains(alvo) || botaoRef.current?.contains(alvo)) return;
      fechar();
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fechar();
    };
    // Rolar a página com o menu aberto deixaria o menu solto no ar, longe do botão.
    const rolou = () => fechar();
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', tecla);
    window.addEventListener('scroll', rolou, true);
    window.addEventListener('resize', rolou);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', tecla);
      window.removeEventListener('scroll', rolou, true);
      window.removeEventListener('resize', rolou);
    };
  }, [aberto, ehCelular]);

  if (acoes.length === 0) return null;

  const executar = (acao: AcaoDoMenu) => {
    fechar();
    acao.onClick();
  };

  const IconeDoGatilho = gatilho?.icone;

  return (
    <>
      {gatilho ? (
        <button
          ref={botaoRef}
          type="button"
          onClick={() => (aberto ? fechar() : abrir())}
          aria-haspopup="menu"
          aria-expanded={aberto}
          title={rotulo}
          className={`inline-flex items-center justify-center gap-2 h-[52px] px-[22px] rounded-full bg-ink text-white text-[15px] font-semibold whitespace-nowrap hover:bg-black active:scale-[.97] transition-colors ${className}`}
        >
          {IconeDoGatilho && <IconeDoGatilho className="w-[18px] h-[18px] shrink-0" />}
          {gatilho.texto}
        </button>
      ) : (
        <button
          ref={botaoRef}
          type="button"
          onClick={() => (aberto ? fechar() : abrir())}
          aria-label={rotulo}
          title={rotulo}
          aria-haspopup="menu"
          aria-expanded={aberto}
          className={`shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-colors ${
            tom === 'escuro'
              ? 'border border-cream/25 text-cream hover:border-cream/50'
              : tom === 'discreto'
              ? 'text-ink-soft hover:text-ink hover:bg-black/5'
              : 'border border-ink/15 text-ink hover:border-ink/40'
          } ${className}`}
        >
          <MoreHorizontal className="w-[18px] h-[18px]" />
        </button>
      )}

      {aberto && ehCelular && (
        <BottomSheet aberto onFechar={fechar} titulo={titulo}>
          {acoes.map((acao) => (
            <ItemDaFolha
              key={acao.rotulo}
              icone={acao.icone || MoreHorizontal}
              rotulo={acao.rotulo}
              descricao={acao.descricao}
              tom={acao.tom === 'perigo' ? 'perigo' : 'normal'}
              onClick={() => executar(acao)}
            />
          ))}
        </BottomSheet>
      )}

      {aberto &&
        !ehCelular &&
        posicao &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="fixed z-[70] w-[248px] py-1.5 rounded-2xl bg-card border border-ink/10 shadow-[0_12px_30px_rgba(26,26,26,.16)] animate-fadeIn"
            style={{ top: posicao.top, left: posicao.left }}
          >
            {acoes.map((acao) => {
              const Icone = acao.icone;
              return (
                <button
                  key={acao.rotulo}
                  type="button"
                  role="menuitem"
                  onClick={() => executar(acao)}
                  className={`w-full min-h-[44px] px-3.5 flex items-center gap-3 text-left text-[14px] font-semibold transition-colors ${
                    acao.tom === 'perigo'
                      ? 'text-danger hover:bg-danger-bg'
                      : 'text-ink hover:bg-line-soft'
                  }`}
                >
                  {Icone && <Icone className="w-[18px] h-[18px] shrink-0" />}
                  <span className="min-w-0 flex-1 truncate">{acao.rotulo}</span>
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
};

// ==========================================
// FORMULÁRIOS
// ==========================================

/** O campo em si, sem moldura: a moldura é o `CampoTinta`. */
export const INPUT_TINTA =
  'w-full min-w-0 bg-transparent border-0 p-0 text-[16px] font-semibold text-ink placeholder:text-muted placeholder:font-medium focus:outline-none';

/**
 * O campo preenchido, sem contorno, com o rótulo **dentro** — o desenho da Nova paciente. Em foco
 * ele clareia para o branco e ganha o contorno preto de 2px: fica óbvio onde se está digitando.
 */
export const CampoTinta: React.FC<{
  rotulo: string;
  htmlFor?: string;
  erro?: string;
  ajuda?: React.ReactNode;
  prefixo?: React.ReactNode;
  sufixo?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}> = ({ rotulo, htmlFor, erro, ajuda, prefixo, sufixo, className = '', children }) => (
  <div className={className}>
    <label
      htmlFor={htmlFor}
      className={`block rounded-[14px] px-4 pt-2 pb-2.5 min-h-[56px] cursor-text transition-colors focus-within:bg-card focus-within:ring-2 focus-within:ring-ink ${
        erro ? 'bg-danger-bg ring-2 ring-danger' : 'bg-line-soft'
      }`}
    >
      <span className="block text-[12px] font-semibold text-ink-soft leading-tight mb-0.5">{rotulo}</span>
      <span className="flex items-center gap-2">
        {prefixo}
        {children}
        {sufixo}
      </span>
    </label>
    {erro ? (
      <p className="mt-1 px-1 text-[13px] font-medium text-danger">{erro}</p>
    ) : ajuda ? (
      <p className="mt-1 px-1 text-[13px] text-ink-soft leading-snug">{ajuda}</p>
    ) : null}
  </div>
);

/** A seta do `select` dentro de um `CampoTinta` — o nativo some com `appearance-none`. */
export const SetaDoSelect: React.FC = () => (
  <ChevronDown className="w-[18px] h-[18px] shrink-0 text-ink pointer-events-none" aria-hidden />
);

/** Rótulo acima de um grupo de escolhas — 13px, escuro. */
export const RotuloTinta: React.FC<{ children: React.ReactNode; htmlFor?: string; className?: string }> = ({
  children,
  htmlFor,
  className = '',
}) =>
  htmlFor ? (
    <label htmlFor={htmlFor} className={`block text-[13px] font-semibold text-ink mb-1.5 ${className}`}>
      {children}
    </label>
  ) : (
    <p className={`text-[13px] font-semibold text-ink mb-1.5 ${className}`}>{children}</p>
  );

/**
 * Escolha curta em pílulas tocáveis, no lugar de uma lista suspensa — profissional, gênero,
 * unidade. Com `permiteDesmarcar`, tocar na acesa apaga a escolha.
 */
export function PilulasDeEscolha<T extends string>({
  opcoes,
  valor,
  onMudar,
  permiteDesmarcar = false,
  rotulo,
  erro,
  compacta = false,
}: {
  opcoes: { id: T; rotulo: string; cor?: string }[];
  valor: T | '';
  onMudar: (id: T | '') => void;
  permiteDesmarcar?: boolean;
  rotulo?: string;
  erro?: string;
  compacta?: boolean;
}) {
  return (
    <div>
      <div role="group" aria-label={rotulo} className="flex flex-wrap gap-2">
        {opcoes.map((o) => {
          const ativo = o.id === valor;
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={ativo}
              onClick={() => onMudar(ativo && permiteDesmarcar ? '' : o.id)}
              className={`inline-flex items-center gap-2 ${
                compacta ? 'h-10 px-4' : 'h-11 px-4'
              } rounded-full text-[14px] font-semibold transition-colors ${
                ativo ? 'bg-ink text-white' : 'bg-line-soft text-ink hover:bg-[#E6E2DA]'
              } ${erro && !valor ? 'ring-2 ring-danger' : ''}`}
            >
              {o.cor && (
                <span aria-hidden className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: o.cor }} />
              )}
              {o.rotulo}
            </button>
          );
        })}
      </div>
      {erro && <p className="mt-1 px-1 text-[13px] font-medium text-danger">{erro}</p>}
    </div>
  );
}

/** O interruptor — "Enviar confirmação no WhatsApp". */
export const Interruptor: React.FC<{
  ligado: boolean;
  onMudar: (ligado: boolean) => void;
  rotulo: React.ReactNode;
  descricao?: React.ReactNode;
  disabled?: boolean;
}> = ({ ligado, onMudar, rotulo, descricao, disabled }) => (
  <label className={`flex items-center gap-3 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
    <span className="flex-1 min-w-0">
      <span className="block text-[14px] font-semibold text-ink">{rotulo}</span>
      {descricao && <span className="block text-[13px] text-ink-soft leading-snug">{descricao}</span>}
    </span>
    <input
      type="checkbox"
      className="sr-only peer"
      checked={ligado}
      disabled={disabled}
      onChange={(e) => onMudar(e.target.checked)}
    />
    <span
      aria-hidden
      className={`relative w-12 h-7 shrink-0 rounded-full transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-brand peer-focus-visible:outline-offset-2 ${
        ligado ? 'bg-ink' : 'bg-[#D6D3CC]'
      }`}
    >
      <span
        className={`absolute top-[3px] w-[22px] h-[22px] rounded-full transition-all ${
          ligado ? 'left-[23px] bg-brand-light' : 'left-[3px] bg-card'
        }`}
      />
    </span>
  </label>
);

/** Aviso dentro de formulário — erro, alerta ou informação, no mesmo desenho. */
export const AvisoTinta: React.FC<{
  tom?: 'erro' | 'alerta' | 'info';
  icone?: React.ElementType;
  children: React.ReactNode;
  className?: string;
}> = ({ tom = 'info', icone: Icone, children, className = '' }) => (
  <div
    className={`flex items-start gap-2.5 rounded-[14px] px-4 py-3 text-[14px] leading-snug ${
      tom === 'erro'
        ? 'bg-danger-bg text-danger'
        : tom === 'alerta'
        ? 'bg-warn-bg text-warn'
        : 'bg-line-soft text-ink'
    } ${className}`}
  >
    {Icone && <Icone className="w-[18px] h-[18px] shrink-0 mt-px" />}
    <div className="min-w-0 flex-1">{children}</div>
  </div>
);

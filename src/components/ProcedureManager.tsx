import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Plus,
  Star,
  Clock,
  MoreHorizontal,
  Copy,
  Share2,
  Trash2,
  ClipboardList,
  Image as ImageIcon,
} from 'lucide-react';
import { Procedure, ClinicProfile, AnamnesisTemplate } from '../types';
import { formatBRL } from '../utils/formatters';

interface ProcedureManagerProps {
  procedures: Procedure[];
  clinic: ClinicProfile;
  categories: string[];
  /** procedimentoId -> ficha-modelo de anamnese. Vazio enquanto `templatesCarregando`. */
  templatesPorProcedimento: Map<string, AnamnesisTemplate>;
  /**
   * As fichas chegam do Firestore depois da primeira pintura. Enquanto não chegam, o botão
   * "Anamnese" nasce habilitado: abrir o formulário com o seletor vazio é recuperável, mas achar
   * que um procedimento não tem ficha leva a cadastrar uma ficha duplicada.
   */
  templatesCarregando: boolean;
  onOpenNewProcedure: () => void;
  onEditProcedure: (procedure: Procedure) => void;
  onDeleteProcedure: (id: string) => void;
  onDuplicateProcedure: (procedure: Procedure) => void;
  onToggleFeatured: (id: string) => void;
  onViewDetails: (procedure: Procedure) => void;
  onShareSingle: (procedure: Procedure) => void;
  onOpenAnamnesis: (procedure: Procedure) => void;
  onCreateAnamnesisTemplate: (procedure: Procedure) => void;
}

export const ProcedureManager: React.FC<ProcedureManagerProps> = ({
  procedures,
  categories,
  templatesPorProcedimento,
  templatesCarregando,
  onOpenNewProcedure,
  onEditProcedure,
  onDeleteProcedure,
  onDuplicateProcedure,
  onToggleFeatured,
  onViewDetails,
  onShareSingle,
  onOpenAnamnesis,
  onCreateAnamnesisTemplate,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  // Garante que "Todos" seja sempre a primeira opção, seguida das demais categorias
  const listaCategorias = useMemo(() => {
    const semTodos = categories.filter((c) => c !== 'Todos');
    return ['Todos', ...semTodos];
  }, [categories]);

  // No celular a grade tem uma coluna só, então o botão flutuante cai bem em cima do terceiro
  // botão de cada card ("Anamnese") — o choque é sistemático, não acidental. Ele some enquanto a
  // lista desce e volta assim que ela sobe, que é quando a intenção de criar algo reaparece.
  const [fabVisivel, setFabVisivel] = useState(true);

  useEffect(() => {
    let ultimoY = window.scrollY;
    const aoRolar = () => {
      const y = window.scrollY;
      if (Math.abs(y - ultimoY) < 8) return;
      setFabVisivel(y < ultimoY || y < 80);
      ultimoY = y;
    };
    window.addEventListener('scroll', aoRolar, { passive: true });
    return () => window.removeEventListener('scroll', aoRolar);
  }, []);

  const filteredProcedures = procedures.filter((p) => {
    const matchesSearch =
      p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.subtitle && p.subtitle.toLowerCase().includes(searchTerm.toLowerCase())) ||
      p.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCat = selectedCategory === 'Todos' || p.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  const featuredCount = procedures.filter((p) => p.isFeatured).length;
  const categoriesCount = Array.from(new Set(procedures.map((p) => p.category))).length;

  /** Quantos procedimentos cada categoria tem — mostrado na folha de filtro para decidir antes de tocar. */
  const contagemPorCategoria = (cat: string) =>
    cat === 'Todos' ? procedures.length : procedures.filter((p) => p.category === cat).length;

  /** Enquanto as fichas não chegaram, todo procedimento é tratado como se tivesse ficha. */
  const temFichaDeAnamnese = (proc: Procedure) =>
    templatesCarregando || templatesPorProcedimento.has(proc.id);

  const openMenu = (procId: string, e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuPos({ top: rect.bottom + 8, left: Math.max(12, rect.right - 256) });
    setMenuFor(procId);
  };

  const closeMenu = () => {
    setMenuFor(null);
    setMenuPos(null);
  };

  const menuProcedure = procedures.find((p) => p.id === menuFor) || null;

  // "Detalhes" e "Editar" saíram do menu — viraram botões fixos no card. O que sobra aqui são as
  // ações ocasionais, mais a criação da ficha, que é o único caminho para destravar o botão
  // "Anamnese" de um procedimento que ainda não tem ficha-modelo.
  const menuActions = menuProcedure
    ? [
        ...(!templatesCarregando && !templatesPorProcedimento.has(menuProcedure.id)
          ? [
              {
                label: 'Criar ficha de anamnese',
                icon: ClipboardList,
                onClick: () => onCreateAnamnesisTemplate(menuProcedure),
                danger: false,
              },
            ]
          : []),
        {
          label: 'Enviar cartão em PDF',
          icon: Share2,
          onClick: () => onShareSingle(menuProcedure),
          danger: false,
        },
        {
          label: menuProcedure.isFeatured ? 'Remover destaque' : 'Alternar destaque',
          icon: Star,
          onClick: () => onToggleFeatured(menuProcedure.id),
          danger: false,
        },
        {
          label: 'Duplicar',
          icon: Copy,
          onClick: () => onDuplicateProcedure(menuProcedure),
          danger: false,
        },
        {
          label: 'Excluir',
          icon: Trash2,
          onClick: () => onDeleteProcedure(menuProcedure.id),
          danger: true,
        },
      ]
    : [];

  return (
    <div className="px-5 sm:px-6 lg:px-8 py-5 sm:py-6 pb-24 sm:pb-8">
      {/* Content header */}
      <div className="mb-4">
        <h2 className="font-serif-luxury text-[22px] sm:text-[24px] font-medium text-ink leading-tight">
          Procedimentos
        </h2>
        <p className="text-[13px] text-muted mt-0.5">
          {procedures.length} procedimentos · {categoriesCount} categorias
          {featuredCount > 0 && <> · {featuredCount} em destaque</>}
        </p>
      </div>

      {/* Search + action bar */}
      <div className="flex items-center gap-2.5 mb-3.5">
        <div className="relative flex-1 lg:flex-none lg:w-[360px]">
          <Search className="w-[18px] h-[18px] text-muted-light absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar procedimento..."
            className="w-full h-11 pl-11 pr-4 rounded-xl bg-white border border-[rgba(26,26,26,.1)] text-[15px] text-ink placeholder-muted-light focus:outline-hidden focus:border-brand transition-colors"
          />
        </div>

        <button
          onClick={onOpenNewProcedure}
          className="hidden sm:flex items-center gap-2 h-11 px-5 rounded-xl bg-brand text-white text-[15px] font-semibold hover:bg-brand-hover active:scale-97 transition-all shrink-0 ml-auto"
        >
          <Plus className="w-[18px] h-[18px]" />
          <span className="hidden lg:inline">Novo procedimento</span>
          <span className="lg:hidden">Novo</span>
        </button>
      </div>

      {/* Botões de filtro de categoria: visíveis em todos os aparelhos (mobile, tablet e desktop)
          - Começa com "Todos" e depois as demais categorias
          - Sem rolagem lateral (flex-wrap dinâmico)
          - Não é puramente vertical (agrupa horizontalmente com quebra de linha natural)
          - Tamanho compacto e elegante, perfeitamente legível e fácil de clicar */}
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-5">
        {listaCategorias.map((cat) => {
          const isSelected = selectedCategory === cat;
          const count = contagemPorCategoria(cat);

          return (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`h-[32px] sm:h-[34px] px-3 sm:px-3.5 rounded-full text-[12.5px] sm:text-[13px] font-medium border inline-flex items-center gap-1.5 transition-all duration-150 active:scale-95 ${
                isSelected
                  ? 'bg-ink text-cream border-ink shadow-xs'
                  : 'bg-white text-ink-soft border-[rgba(26,26,26,.12)] hover:border-brand hover:text-ink hover:bg-surface'
              }`}
            >
              <span>{cat}</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10.5px] sm:text-body font-semibold leading-none ${
                  isSelected
                    ? 'bg-white/20 text-cream'
                    : 'bg-black/5 text-muted'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Cards grid */}
      {filteredProcedures.length === 0 ? (
        <div className="text-center py-16 text-muted text-[15px] bg-white/50 rounded-2xl border border-white/70">
          <p>Nenhum procedimento encontrado com os filtros selecionados.</p>
          {(selectedCategory !== 'Todos' || searchTerm.trim() !== '') && (
            <button
              type="button"
              onClick={() => {
                setSelectedCategory('Todos');
                setSearchTerm('');
              }}
              className="mt-3.5 px-4 py-2 rounded-xl bg-brand text-white text-[13px] font-semibold hover:bg-brand-hover active:scale-97 transition-all inline-flex items-center gap-1.5"
            >
              Limpar filtros
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5 sm:gap-4">
          {filteredProcedures.map((proc) => {
            const hasDiscount = proc.promotionalPrice && proc.promotionalPrice < proc.price;
            const img = proc.images && proc.images.length > 0 ? proc.images[0] : '';
            const comFicha = temFichaDeAnamnese(proc);

            return (
              <article
                key={proc.id}
                className="bg-white rounded-2xl border border-[rgba(26,26,26,.07)] shadow-[0_2px_10px_rgba(0,0,0,.04)] overflow-hidden flex flex-col"
              >
                {/* Photo — faixa reduzida. Categoria e destaque moram no corpo, não sobre a foto:
                    a foto encolheu para ser um sinal rápido, cobri-la com pílulas desfaz o ganho. */}
                <div className="h-[128px] sm:h-[136px] bg-line-soft shrink-0">
                  {img ? (
                    <img
                      src={img}
                      alt=""
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-light">
                      <ImageIcon className="w-5 h-5" />
                    </div>
                  )}
                </div>

                {/* Body */}
                <div className="p-4 flex flex-col flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-label font-semibold uppercase tracking-wider text-brand truncate">
                        {proc.category}
                      </p>
                      <h3
                        onClick={() => onViewDetails(proc)}
                        className="font-serif-luxury text-[18px] font-semibold text-ink leading-tight cursor-pointer hover:text-brand transition-colors mt-0.5"
                      >
                        {proc.isFeatured && (
                          <Star
                            className="inline-block w-3.5 h-3.5 fill-[#E8CDAC] text-brand-light mr-1 -mt-0.5"
                            aria-label="Em destaque"
                          />
                        )}
                        {proc.title}
                      </h3>
                    </div>
                    <button
                      onClick={(e) => openMenu(proc.id, e)}
                      className="shrink-0 w-9 h-9 -mr-1.5 -mt-1 rounded-full flex items-center justify-center text-muted hover:bg-surface hover:text-ink active:scale-95 transition-all"
                      title="Mais ações"
                    >
                      <MoreHorizontal className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap text-[13px] text-ink-soft mt-2 mb-3.5">
                    {proc.duration && (
                      <>
                        <span className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-brand" />
                          {proc.duration}
                        </span>
                        <span className="text-line">·</span>
                      </>
                    )}
                    <span className="flex items-baseline gap-1.5">
                      {proc.isStartingPrice && (
                        <span className="text-[12px] text-muted">a partir de</span>
                      )}
                      {hasDiscount && (
                        <span className="text-[12px] text-muted-light line-through">
                          {formatBRL(proc.price)}
                        </span>
                      )}
                      <span className="font-semibold text-brand-hover">
                        {formatBRL(hasDiscount ? proc.promotionalPrice : proc.price)}
                      </span>
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 sm:gap-2 mt-auto">
                    <button
                      onClick={() => onViewDetails(proc)}
                      className="h-10 rounded-lg border border-[rgba(26,26,26,.15)] text-ink-soft text-[12px] sm:text-[13px] font-semibold hover:border-brand hover:text-brand active:scale-97 transition-all"
                    >
                      Detalhes
                    </button>
                    <button
                      onClick={() => onEditProcedure(proc)}
                      className="h-10 rounded-lg border border-[rgba(26,26,26,.15)] text-ink-soft text-[12px] sm:text-[13px] font-semibold hover:border-brand hover:text-brand active:scale-97 transition-all"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => comFicha && onOpenAnamnesis(proc)}
                      disabled={!comFicha}
                      title={
                        comFicha
                          ? 'Preencher anamnese deste procedimento'
                          : 'Este procedimento ainda não tem ficha de anamnese. Crie uma pelo menu de mais ações.'
                      }
                      className={`h-10 rounded-lg text-[12px] sm:text-[13px] font-semibold transition-all ${
                        comFicha
                          ? 'bg-brand text-white hover:bg-brand-hover active:scale-97'
                          : 'bg-line-soft text-muted-light cursor-not-allowed'
                      }`}
                    >
                      Anamnese
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}



      {/* "…" menu: backdrop + bottom sheet (mobile) / popover (sm+) */}
      {menuProcedure && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30 sm:bg-transparent" onClick={closeMenu} />

          {/* Mobile bottom sheet */}
          <div className="sm:hidden fixed left-0 right-0 bottom-0 z-50 bg-white rounded-t-[22px] shadow-2xl pb-[max(16px,env(safe-area-inset-bottom))] animate-fadeIn">
            <div className="w-11 h-1 bg-[rgba(26,26,26,.15)] rounded-full mx-auto mt-3 mb-1" />
            <p className="px-5 pt-2 pb-1 text-[13px] text-muted font-medium truncate">
              {menuProcedure.title}
            </p>
            <div className="py-1">
              {menuActions.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.label}
                    onClick={() => {
                      action.onClick();
                      closeMenu();
                    }}
                    className={`w-full flex items-center gap-3 h-[52px] px-5 text-[15px] font-medium transition-colors ${
                      action.danger
                        ? 'text-danger hover:bg-danger/5'
                        : 'text-ink hover:bg-surface'
                    }`}
                  >
                    <Icon className="w-[18px] h-[18px]" />
                    {action.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Desktop/tablet popover */}
          {menuPos && (
            <div
              className="hidden sm:block fixed z-50 w-64 bg-white rounded-2xl shadow-2xl border border-[rgba(26,26,26,.07)] py-1.5 overflow-hidden"
              style={{ top: menuPos.top, left: menuPos.left }}
            >
              {menuActions.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.label}
                    onClick={() => {
                      action.onClick();
                      closeMenu();
                    }}
                    className={`w-full flex items-center gap-3 h-[46px] px-4 text-[14px] font-medium transition-colors ${
                      action.danger
                        ? 'text-danger hover:bg-danger/5'
                        : 'text-ink hover:bg-surface'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {action.label}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Botão flutuante (celular): a barra fixa de largura total custava ~80px de altura em toda
          tela. "Exportar catálogo" saiu daqui — já existe no menu de navegação. */}
      <button
        onClick={onOpenNewProcedure}
        className={`sm:hidden fixed right-5 bottom-[max(20px,env(safe-area-inset-bottom))] z-30 w-14 h-14 rounded-full bg-brand text-white flex items-center justify-center shadow-lg active:scale-95 transition-all duration-200 ${
          fabVisivel ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5 pointer-events-none'
        }`}
        aria-label="Novo procedimento"
      >
        <Plus className="w-6 h-6" />
      </button>
    </div>
  );
};

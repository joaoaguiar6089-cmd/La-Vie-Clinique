import React, { useState } from 'react';
import {
  Search,
  Plus,
  Star,
  Clock,
  Repeat,
  MoreHorizontal,
  Eye,
  Edit3,
  Copy,
  Share2,
  Trash2,
  FileDown,
  Image as ImageIcon,
} from 'lucide-react';
import { Procedure, ClinicProfile } from '../types';
import { formatBRL } from '../utils/formatters';

interface ProcedureManagerProps {
  procedures: Procedure[];
  clinic: ClinicProfile;
  categories: string[];
  onOpenNewProcedure: () => void;
  onOpenExport: () => void;
  onEditProcedure: (procedure: Procedure) => void;
  onDeleteProcedure: (id: string) => void;
  onDuplicateProcedure: (procedure: Procedure) => void;
  onToggleFeatured: (id: string) => void;
  onViewDetails: (procedure: Procedure) => void;
  onShareSingle: (procedure: Procedure) => void;
}

export const ProcedureManager: React.FC<ProcedureManagerProps> = ({
  procedures,
  categories,
  onOpenNewProcedure,
  onOpenExport,
  onEditProcedure,
  onDeleteProcedure,
  onDuplicateProcedure,
  onToggleFeatured,
  onViewDetails,
  onShareSingle,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

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

  const menuActions = menuProcedure
    ? [
        { label: 'Abrir detalhes', icon: Eye, onClick: () => onViewDetails(menuProcedure) },
        { label: 'Editar procedimento', icon: Edit3, onClick: () => onEditProcedure(menuProcedure) },
        { label: 'Enviar cartão em PDF', icon: Share2, onClick: () => onShareSingle(menuProcedure) },
        {
          label: menuProcedure.isFeatured ? 'Remover destaque' : 'Alternar destaque',
          icon: Star,
          onClick: () => onToggleFeatured(menuProcedure.id),
        },
        { label: 'Duplicar', icon: Copy, onClick: () => onDuplicateProcedure(menuProcedure) },
        {
          label: 'Excluir',
          icon: Trash2,
          onClick: () => onDeleteProcedure(menuProcedure.id),
          danger: true,
        },
      ]
    : [];

  return (
    <div className="px-5 sm:px-6 lg:px-8 py-5 sm:py-8 pb-28 sm:pb-8">
      {/* Content header */}
      <div className="mb-5 sm:mb-6">
        <div className="sm:hidden flex items-baseline gap-2.5 flex-wrap">
          <h2 className="font-serif-luxury text-[30px] font-medium text-[#1A1A1A] leading-tight">
            {procedures.length} procedimentos
          </h2>
          {featuredCount > 0 && (
            <span className="text-[13px] font-semibold text-[#A67C52]">
              {featuredCount} em destaque
            </span>
          )}
        </div>
        <div className="hidden sm:block">
          <h2 className="font-serif-luxury text-[34px] font-medium text-[#1A1A1A] leading-tight">
            Procedimentos
          </h2>
          <p className="text-[16px] text-[#8a8578] mt-1">
            {procedures.length} procedimentos · {categoriesCount} categorias
            {featuredCount > 0 && <> · <span className="text-[#A67C52] font-medium">{featuredCount} em destaque</span></>}
          </p>
        </div>
      </div>

      {/* Search + new-procedure bar */}
      <div className="flex items-center gap-3 mb-4 sm:bg-white/50 sm:backdrop-blur-md sm:border sm:border-white/70 sm:rounded-2xl sm:px-4 sm:py-3">
        <div className="relative flex-1 sm:flex-none sm:w-[340px]">
          <Search className="w-[18px] h-[18px] text-[#a8a29a] absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar procedimento"
            className="w-full h-12 sm:h-[46px] pl-11 pr-4 rounded-2xl sm:rounded-xl bg-white/60 backdrop-blur-xs border border-white/70 sm:border-[rgba(26,26,26,.1)] text-[15px] text-[#1A1A1A] placeholder-[#a8a29a] focus:outline-hidden focus:border-[#A67C52] transition-colors"
          />
        </div>
        <button
          onClick={onOpenNewProcedure}
          className="hidden sm:flex items-center gap-2 h-[46px] px-5 rounded-xl bg-[#A67C52] text-white text-[15px] font-semibold hover:bg-[#8E653D] active:scale-97 transition-all shadow-xs shrink-0"
        >
          <Plus className="w-[18px] h-[18px]" />
          Novo procedimento
        </button>
      </div>

      {/* Category chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 mb-6 -mx-5 px-5 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`shrink-0 h-9 sm:h-10 px-4 rounded-full text-[14px] font-medium border transition-colors whitespace-nowrap ${
              selectedCategory === cat
                ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]'
                : 'bg-white text-[#4a4740] border-[rgba(26,26,26,.1)] hover:border-[#A67C52]'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Cards grid */}
      {filteredProcedures.length === 0 ? (
        <div className="text-center py-16 text-[#8a8578] text-[15px] bg-white/50 rounded-2xl border border-white/70">
          Nenhum procedimento encontrado com os filtros selecionados.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {filteredProcedures.map((proc) => {
            const hasDiscount = proc.promotionalPrice && proc.promotionalPrice < proc.price;
            const img = proc.images && proc.images.length > 0 ? proc.images[0] : '';

            return (
              <article
                key={proc.id}
                className="bg-white rounded-[20px] shadow-[0_6px_22px_rgba(0,0,0,.06)] overflow-hidden flex flex-col"
              >
                {/* Photo */}
                <div className="relative aspect-[2/3] bg-[#EFEDE7] shrink-0">
                  {img ? (
                    <img src={img} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#a8a29a]">
                      <ImageIcon className="w-6 h-6" />
                    </div>
                  )}
                  {proc.isFeatured && (
                    <span className="absolute top-3 left-3 flex items-center gap-1 h-7 px-2.5 rounded-full bg-[rgba(26,26,26,.85)] text-[#E8CDAC] text-[12px] font-semibold">
                      <Star className="w-3.5 h-3.5 fill-[#E8CDAC]" />
                      Destaque
                    </span>
                  )}
                  <span className="absolute top-3 right-3 h-7 px-2.5 rounded-full bg-white/95 text-[#4a4740] text-[11px] font-semibold flex items-center max-w-[70%] truncate">
                    {proc.category}
                  </span>
                </div>

                {/* Body */}
                <div className="p-5 flex flex-col flex-1">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <h3
                      onClick={() => onViewDetails(proc)}
                      className="font-serif-luxury text-[24px] font-semibold text-[#1A1A1A] leading-tight cursor-pointer hover:text-[#A67C52] transition-colors"
                    >
                      {proc.title}
                    </h3>
                    <button
                      onClick={(e) => openMenu(proc.id, e)}
                      className="shrink-0 w-10 h-10 -mr-1.5 -mt-1 rounded-full flex items-center justify-center text-[#8a8578] hover:bg-[#F9F8F6] hover:text-[#1A1A1A] active:scale-95 transition-all"
                      title="Mais ações"
                    >
                      <MoreHorizontal className="w-5 h-5" />
                    </button>
                  </div>

                  {proc.subtitle && (
                    <p className="text-[14px] text-[#8a8578] leading-snug line-clamp-2 mb-3">
                      {proc.subtitle}
                    </p>
                  )}

                  <div className="flex items-center gap-3 text-[13px] text-[#4a4740] mb-3.5">
                    {proc.duration && (
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-[#A67C52]" />
                        {proc.duration}
                      </span>
                    )}
                    {proc.sessionsRecommended && (
                      <span className="flex items-center gap-1.5">
                        <Repeat className="w-3.5 h-3.5 text-[#A67C52]" />
                        {proc.sessionsRecommended}
                      </span>
                    )}
                  </div>

                  <div className="border-t border-[rgba(26,26,26,.07)] pt-3 mb-3.5 mt-auto">
                    <span className="block text-[12px] text-[#8a8578] mb-0.5">Investimento</span>
                    <div className="flex items-baseline gap-2 flex-wrap">
                      {proc.isStartingPrice && (
                        <span className="text-[12px] font-medium text-[#8a8578]">
                          a partir de
                        </span>
                      )}
                      {hasDiscount && (
                        <span className="text-[13px] text-[#a8a29a] line-through">
                          {formatBRL(proc.price)}
                        </span>
                      )}
                      <span className="text-[24px] font-bold text-[#8E653D]">
                        {formatBRL(hasDiscount ? proc.promotionalPrice : proc.price)}
                      </span>
                      {proc.priceNote && (
                        <span className="text-[12px] text-[#8a8578]">{proc.priceNote}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <button
                      onClick={() => onEditProcedure(proc)}
                      className="flex-1 h-11 rounded-xl border border-[#A67C52] text-[#A67C52] text-[14px] font-semibold hover:bg-[#A67C52]/5 active:scale-97 transition-all"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => onViewDetails(proc)}
                      className="flex-1 h-11 rounded-xl bg-[#A67C52] text-white text-[14px] font-semibold hover:bg-[#8E653D] active:scale-97 transition-all"
                    >
                      Ver ficha
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
            <p className="px-5 pt-2 pb-1 text-[13px] text-[#8a8578] font-medium truncate">
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
                      action.danger ? 'text-[#E11D48] hover:bg-[#E11D48]/5' : 'text-[#1A1A1A] hover:bg-[#F9F8F6]'
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
                      action.danger ? 'text-[#E11D48] hover:bg-[#E11D48]/5' : 'text-[#1A1A1A] hover:bg-[#F9F8F6]'
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

      {/* Mobile sticky footer */}
      <div className="sm:hidden fixed left-0 right-0 bottom-0 z-30 pt-8 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pointer-events-none" style={{ background: 'linear-gradient(to top, #F9F8F6 55%, transparent)' }}>
        <div className="flex items-center gap-2.5 pointer-events-auto">
          <button
            onClick={onOpenNewProcedure}
            className="flex-1 h-[52px] rounded-2xl bg-[#A67C52] text-white text-[16px] font-semibold shadow-lg active:scale-97 transition-all"
          >
            Novo procedimento
          </button>
          <button
            onClick={onOpenExport}
            className="w-[52px] h-[52px] rounded-2xl bg-white border border-[rgba(26,26,26,.1)] text-[#1A1A1A] flex items-center justify-center shadow-lg active:scale-97 transition-all shrink-0"
            title="Exportar catálogo"
          >
            <FileDown className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

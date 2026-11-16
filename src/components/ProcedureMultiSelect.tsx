import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Check, X, CheckCheck } from 'lucide-react';
import { Procedure } from '../types';
import { JanelaDeEscolha } from './common/JanelaDeEscolha';

interface ProcedureMultiSelectProps {
  procedures: Procedure[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  currentCategory?: string;
}

/**
 * Escolha de vários procedimentos do catálogo — o filtro do compartilhar e das fichas-modelo. A
 * lista abre na janela de escolha, no meio da tela (ver `JanelaDeEscolha`), com as categorias e o
 * "marcar todos" presos no topo e o "Concluir" embaixo.
 */
export const ProcedureMultiSelect: React.FC<ProcedureMultiSelectProps> = ({
  procedures,
  selectedIds,
  onChange,
  currentCategory,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('Todas');

  const triggerRef = useRef<HTMLButtonElement>(null);

  // Cada abertura começa com a busca limpa.
  useEffect(() => {
    if (isOpen) setSearchTerm('');
  }, [isOpen]);

  // Sync category filter when opened if a specific category was pre-filtered
  useEffect(() => {
    if (isOpen && currentCategory && currentCategory !== 'Todos') {
      setActiveCategoryFilter(currentCategory);
    } else if (isOpen) {
      setActiveCategoryFilter('Todas');
    }
  }, [isOpen, currentCategory]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  // Extract all categories
  const categoriesList = useMemo(() => {
    const cats = Array.from(new Set(procedures.map((p) => p.category).filter(Boolean)));
    return ['Todas', ...cats];
  }, [procedures]);

  // Group procedures by category with search & category pill filter
  const groupedByCategory = useMemo<Record<string, Procedure[]>>(() => {
    const term = searchTerm.trim().toLowerCase();
    let filtered = procedures;

    if (activeCategoryFilter !== 'Todas') {
      filtered = filtered.filter((p) => p.category === activeCategoryFilter);
    }

    if (term) {
      filtered = filtered.filter(
        (p) =>
          p.title.toLowerCase().includes(term) ||
          p.category.toLowerCase().includes(term) ||
          (p.subtitle && p.subtitle.toLowerCase().includes(term))
      );
    }

    const groups: Record<string, Procedure[]> = {};
    filtered.forEach((p) => {
      if (!groups[p.category]) groups[p.category] = [];
      groups[p.category].push(p);
    });
    return groups;
  }, [procedures, searchTerm, activeCategoryFilter]);

  const toggleProcedure = (id: string) => {
    if (selectedSet.has(id)) {
      onChange(selectedIds.filter((sId) => sId !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const toggleCategoryAll = (category: string, procs: Procedure[]) => {
    const categoryIds = procs.map((p) => p.id);
    const allSelected = categoryIds.every((id) => selectedSet.has(id));

    if (allSelected) {
      // Unselect all in this category
      onChange(selectedIds.filter((id) => !categoryIds.includes(id)));
    } else {
      // Add all missing in this category
      const newIds = new Set([...selectedIds, ...categoryIds]);
      onChange(Array.from(newIds));
    }
  };

  const selectAllFiltered = () => {
    const allFilteredIds = (Object.values(groupedByCategory) as Procedure[][]).flatMap((procs) => procs.map((p) => p.id));
    const merged = new Set([...selectedIds, ...allFilteredIds]);
    onChange(Array.from(merged));
  };

  const clearSelection = () => {
    onChange([]);
  };

  const label =
    selectedIds.length === 0
      ? currentCategory && currentCategory !== 'Todos'
        ? `Todos de "${currentCategory}"`
        : 'Todos os procedimentos'
      : `${selectedIds.length} procedimento${selectedIds.length > 1 ? 's' : ''} selecionado${selectedIds.length > 1 ? 's' : ''}`;

  return (
    <div className="w-full sm:w-auto">
      <label className="block text-label font-semibold uppercase tracking-widest text-gray-400 mb-1">
        Selecionar Procedimentos Específicos
      </label>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className={`w-full sm:w-auto flex items-center justify-between gap-2 px-3 py-2 rounded-sm bg-white/70 border text-xs font-medium min-w-[240px] transition-colors cursor-pointer ${
          selectedIds.length > 0
            ? 'border-brand text-ink bg-brand/5'
            : 'border-white/80 text-ink hover:border-gray-300'
        }`}
      >
        <span className="truncate font-medium">{label}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          {selectedIds.length > 0 && (
            <span className="w-5 h-5 rounded-full bg-brand text-white text-label font-bold flex items-center justify-center">
              {selectedIds.length}
            </span>
          )}
          <ChevronDown
            className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isOpen ? 'rotate-180 text-brand' : ''}`}
          />
        </div>
      </button>

      {isOpen && (
        <JanelaDeEscolha
          titulo="Selecionar procedimentos"
          descricao={
            selectedIds.length === 0
              ? 'Nenhum marcado: entram todos'
              : `${selectedIds.length} de ${procedures.length} marcado${selectedIds.length > 1 ? 's' : ''}`
          }
          onFechar={() => setIsOpen(false)}
          origem={triggerRef}
          busca={{ valor: searchTerm, onMudar: setSearchTerm, placeholder: 'Buscar por nome ou categoria…' }}
          topo={
            <div className="px-3 pb-2.5 flex flex-col gap-2">
              {/* As categorias: rolam de lado, sem quebrar a janela no celular. */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-3 px-3">
                {categoriesList.map((cat) => {
                  const isCurrent = activeCategoryFilter === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      aria-pressed={isCurrent}
                      onClick={() => setActiveCategoryFilter(cat)}
                      className={`h-8 px-3 rounded-full whitespace-nowrap text-[13px] font-semibold transition-colors shrink-0 ${
                        isCurrent ? 'bg-ink text-white' : 'bg-line-soft text-ink hover:bg-[#E6E2DA]'
                      }`}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center justify-between text-[13px]">
                <button
                  type="button"
                  onClick={selectAllFiltered}
                  className="min-h-[32px] font-semibold text-ink flex items-center gap-1 hover:underline underline-offset-2"
                >
                  <CheckCheck className="w-4 h-4" />
                  Marcar todos
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="min-h-[32px] font-semibold text-ink-soft flex items-center gap-1 hover:text-ink"
                >
                  <X className="w-3.5 h-3.5" />
                  Limpar
                </button>
              </div>
            </div>
          }
          rodape={
            <div className="px-4 py-2.5 flex items-center justify-between gap-3">
              <span className="text-[13px] text-ink-soft">
                {selectedIds.length === 0
                  ? 'Todos os procedimentos'
                  : `${selectedIds.length} selecionado${selectedIds.length > 1 ? 's' : ''}`}
              </span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="h-11 px-5 rounded-full bg-ink text-white text-[14px] font-semibold hover:bg-black transition-colors flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                Concluir
              </button>
            </div>
          }
        >
          {Object.keys(groupedByCategory).length === 0 ? (
            <p className="px-5 py-6 text-[14px] text-ink-soft">Nenhum procedimento encontrado.</p>
          ) : (
            (Object.entries(groupedByCategory) as [string, Procedure[]][]).map(([category, procs]) => {
              const categoryIds = procs.map((p) => p.id);
              const allCatSelected = categoryIds.every((id) => selectedSet.has(id));
              return (
                <div key={category}>
                  <div className="sticky top-0 z-[1] bg-card px-5 pt-2.5 pb-1 flex items-center justify-between gap-3">
                    <span className="text-[12px] font-semibold text-ink-soft">
                      {category} ({procs.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleCategoryAll(category, procs)}
                      className="text-[12px] font-semibold text-ink hover:underline underline-offset-2"
                    >
                      {allCatSelected ? 'Desmarcar todos' : 'Marcar todos'}
                    </button>
                  </div>
                  {procs.map((proc) => {
                    const isChecked = selectedSet.has(proc.id);
                    return (
                      <label
                        key={proc.id}
                        className={`mx-1.5 min-h-[48px] px-3 py-2 rounded-xl flex items-center gap-3 cursor-pointer select-none transition-colors ${
                          isChecked ? 'bg-line-soft' : 'hover:bg-line-soft'
                        }`}
                      >
                        <span
                          className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                            isChecked ? 'bg-ink border-ink text-white' : 'border-ink/30 bg-card'
                          }`}
                        >
                          {isChecked && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                        </span>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleProcedure(proc.id)}
                          className="sr-only"
                        />
                        <span className="min-w-0 flex-1 text-[15px] font-semibold text-ink leading-snug">{proc.title}</span>
                        {proc.price > 0 && (
                          <span className="shrink-0 text-[13px] text-ink-soft tabular-nums">
                            R$ {proc.price.toLocaleString('pt-BR')}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              );
            })
          )}
        </JanelaDeEscolha>
      )}
    </div>
  );
};

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, Check, X, CheckCheck } from 'lucide-react';
import { Procedure } from '../types';

interface ProcedureMultiSelectProps {
  procedures: Procedure[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  currentCategory?: string;
}

export const ProcedureMultiSelect: React.FC<ProcedureMultiSelectProps> = ({
  procedures,
  selectedIds,
  onChange,
  currentCategory,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('Todas');
  const [panelStyle, setPanelStyle] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 360,
  });
  const [isMobile, setIsMobile] = useState(false);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Detect mobile device / screen width
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const updatePosition = () => {
    if (window.innerWidth < 640) return; // on mobile we use a bottom sheet
    const btn = triggerRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const panelWidth = Math.max(340, Math.min(440, window.innerWidth - 24));

    // Check if there is enough space below (estimated panel height 420px)
    const spaceBelow = window.innerHeight - rect.bottom;
    const estimatedHeight = 420;

    let top = rect.bottom + 6;
    if (spaceBelow < estimatedHeight && rect.top > estimatedHeight) {
      top = Math.max(12, rect.top - estimatedHeight - 6);
    }

    const left = Math.min(Math.max(12, rect.left), window.innerWidth - panelWidth - 12);
    setPanelStyle({ top, left, width: panelWidth });
  };

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      // On mobile, the backdrop click handles closing.
      // On desktop, check if click is outside both trigger and panel.
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        panelRef.current && !panelRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleScroll = (e: Event) => {
      const target = e.target as Node;
      // CRITICAL FIX: If the user is scrolling INSIDE the procedure list panel,
      // DO NOT CLOSE! This was causing the list to disappear when scrolling.
      if (panelRef.current && (panelRef.current === target || panelRef.current.contains(target))) {
        return;
      }
      // If outside scroll happens on desktop, adjust coordinates
      if (window.innerWidth >= 640) {
        updatePosition();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside, { passive: true });
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', updatePosition);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', updatePosition);
    };
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
        onClick={() => setIsOpen((v) => !v)}
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

      {isOpen && createPortal(
        isMobile ? (
          /* MOBILE BOTTOM SHEET */
          <div className="fixed inset-0 z-[120] flex flex-col justify-end bg-black/60 animate-fadeIn">
            <div
              className="absolute inset-0"
              onClick={() => setIsOpen(false)}
            />
            <div
              ref={panelRef}
              className="relative z-10 w-full bg-white rounded-t-2xl shadow-2xl flex flex-col max-h-[88vh] overflow-hidden animate-slideUp"
            >
              {/* Handle bar */}
              <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mt-2.5 mb-1 shrink-0" />

              {/* Sheet Header */}
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
                <div>
                  <h3 className="font-semibold text-sm text-ink">
                    Selecionar Procedimentos
                  </h3>
                  <p className="text-body text-gray-500">
                    {selectedIds.length === 0
                      ? 'Todos incluídos no catálogo'
                      : `${selectedIds.length} de ${procedures.length} selecionado${selectedIds.length > 1 ? 's' : ''}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-2 -mr-1 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Search & Category Pills */}
              <div className="p-3 border-b border-gray-100 space-y-2.5 shrink-0 bg-surface">
                <div className="relative">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar por nome ou categoria..."
                    className="w-full pl-9 pr-8 py-2 rounded-lg bg-white border border-gray-200 text-xs text-ink placeholder:text-gray-400 focus:outline-hidden focus:border-brand"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Category Pills (horizontal scroll) */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-body">
                  {categoriesList.map((cat) => {
                    const isCurrent = activeCategoryFilter === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setActiveCategoryFilter(cat)}
                        className={`px-2.5 py-1 rounded-full whitespace-nowrap font-medium transition-all shrink-0 ${
                          isCurrent
                            ? 'bg-ink text-white shadow-2xs'
                            : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>

                {/* Bulk Actions */}
                <div className="flex items-center justify-between text-body pt-1">
                  <button
                    type="button"
                    onClick={selectAllFiltered}
                    className="text-brand font-semibold flex items-center gap-1 hover:underline"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    Selecionar todos
                  </button>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="text-gray-500 hover:text-gray-700 font-semibold flex items-center gap-1"
                  >
                    <X className="w-3 h-3" />
                    Limpar seleção
                  </button>
                </div>
              </div>

              {/* Scrollable Procedure List (Mobile) */}
              <div className="flex-1 overflow-y-auto overscroll-contain divide-y divide-gray-100">
                {Object.keys(groupedByCategory).length === 0 ? (
                  <div className="text-center py-12 px-4">
                    <p className="text-xs text-gray-500">Nenhum procedimento encontrado.</p>
                  </div>
                ) : (
                  (Object.entries(groupedByCategory) as [string, Procedure[]][]).map(([category, procs]) => {
                    const categoryIds = procs.map((p) => p.id);
                    const allCatSelected = categoryIds.every((id) => selectedSet.has(id));

                    return (
                      <div key={category} className="bg-white">
                        <div className="px-4 py-2 bg-surface sticky top-0 z-10 flex items-center justify-between border-y border-gray-100">
                          <span className="text-label font-bold uppercase tracking-wider text-gray-600">
                            {category} ({procs.length})
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleCategoryAll(category, procs)}
                            className="text-label font-semibold text-brand hover:underline"
                          >
                            {allCatSelected ? 'Desmarcar todos' : 'Marcar todos'}
                          </button>
                        </div>
                        {procs.map((proc) => {
                          const isChecked = selectedSet.has(proc.id);
                          return (
                            <label
                              key={proc.id}
                              className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors active:bg-gray-100 ${
                                isChecked ? 'bg-brand/5' : 'hover:bg-gray-50'
                              }`}
                            >
                              <span
                                className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                                  isChecked
                                    ? 'bg-brand border-brand text-white'
                                    : 'border-gray-300 bg-white'
                                }`}
                              >
                                {isChecked && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                              </span>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleProcedure(proc.id)}
                                className="hidden"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-semibold text-ink leading-snug">
                                  {proc.title}
                                </div>
                                {(proc.duration || proc.price) && (
                                  <div className="text-body text-gray-500 mt-0.5 flex items-center gap-2">
                                    {proc.duration && <span>⏱️ {proc.duration}</span>}
                                    {proc.price > 0 && <span>• R$ {proc.price.toLocaleString('pt-BR')}</span>}
                                  </div>
                                )}
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Mobile Bottom Confirm Bar */}
              <div className="p-3 border-t border-gray-100 bg-white shrink-0">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="w-full py-3 rounded-lg bg-brand text-white text-xs font-bold uppercase tracking-wider shadow-sm hover:bg-brand-hover active:scale-[0.99] transition-all flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>
                    Concluir Seleção ({selectedIds.length === 0 ? 'Todos' : selectedIds.length})
                  </span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* DESKTOP POPOVER */
          <div
            ref={panelRef}
            style={{ position: 'fixed', top: panelStyle.top, left: panelStyle.left, width: panelStyle.width }}
            className="z-[110] bg-white rounded-md border border-gray-200 shadow-2xl overflow-hidden animate-fadeIn flex flex-col"
          >
            {/* Header & Search */}
            <div className="p-3 border-b border-gray-100 space-y-2.5 bg-surface">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar procedimento ou categoria..."
                  className="w-full pl-8 pr-7 py-1.5 rounded-sm bg-white border border-gray-200 text-xs text-ink focus:outline-hidden focus:border-brand"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Category Pills */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1 text-label no-scrollbar">
                {categoriesList.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setActiveCategoryFilter(cat)}
                    className={`px-2 py-0.5 rounded-full whitespace-nowrap font-medium transition-all shrink-0 ${
                      activeCategoryFilter === cat
                        ? 'bg-ink text-white'
                        : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Bulk actions */}
              <div className="flex items-center justify-between text-body pt-0.5">
                <button
                  type="button"
                  onClick={selectAllFiltered}
                  className="text-brand hover:underline font-semibold flex items-center gap-1"
                >
                  <CheckCheck className="w-3 h-3" />
                  Selecionar todos
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="text-gray-400 hover:text-gray-600 font-semibold flex items-center gap-1"
                >
                  <X className="w-3 h-3" />
                  Limpar seleção
                </button>
              </div>
            </div>

            {/* Scrollable Procedure List (Desktop) */}
            <div className="max-h-72 overflow-y-auto divide-y divide-gray-50 overscroll-contain">
              {Object.keys(groupedByCategory).length === 0 ? (
                <p className="text-center text-xs text-gray-400 py-6">Nenhum procedimento encontrado.</p>
              ) : (
                (Object.entries(groupedByCategory) as [string, Procedure[]][]).map(([category, procs]) => {
                  const categoryIds = procs.map((p) => p.id);
                  const allCatSelected = categoryIds.every((id) => selectedSet.has(id));

                  return (
                    <div key={category}>
                      <div className="px-3 py-1.5 bg-surface text-label font-bold uppercase tracking-wider text-gray-500 sticky top-0 z-10 flex items-center justify-between border-y border-gray-100">
                        <span>{category} ({procs.length})</span>
                        <button
                          type="button"
                          onClick={() => toggleCategoryAll(category, procs)}
                          className="text-label font-semibold text-brand hover:underline cursor-pointer"
                        >
                          {allCatSelected ? 'Desmarcar todos' : 'Marcar todos'}
                        </button>
                      </div>
                      {procs.map((proc) => {
                        const isChecked = selectedSet.has(proc.id);
                        return (
                          <label
                            key={proc.id}
                            className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors ${
                              isChecked ? 'bg-brand/5' : 'hover:bg-surface'
                            }`}
                          >
                            <span
                              className={`w-4 h-4 rounded-xs border flex items-center justify-center shrink-0 transition-colors ${
                                isChecked ? 'bg-brand border-brand' : 'border-gray-300 bg-white'
                              }`}
                            >
                              {isChecked && <Check className="w-3 h-3 text-white stroke-[2.5]" />}
                            </span>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleProcedure(proc.id)}
                              className="hidden"
                            />
                            <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                              <span className="text-xs text-ink truncate">{proc.title}</span>
                              {proc.price > 0 && (
                                <span className="text-label text-gray-400 shrink-0">
                                  R$ {proc.price.toLocaleString('pt-BR')}
                                </span>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>

            {/* Desktop Footer */}
            <div className="px-3 py-2 border-t border-gray-100 bg-surface flex items-center justify-between">
              <span className="text-body text-gray-500">
                {selectedIds.length === 0
                  ? 'Todos os procedimentos'
                  : `${selectedIds.length} selecionado${selectedIds.length > 1 ? 's' : ''}`}
              </span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-3 py-1 bg-ink text-white text-body font-semibold rounded-xs hover:bg-ink transition-colors cursor-pointer"
              >
                Concluir
              </button>
            </div>
          </div>
        ),
        document.body
      )}
    </div>
  );
};

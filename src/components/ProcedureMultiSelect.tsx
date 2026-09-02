import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, Check, X } from 'lucide-react';
import { Procedure } from '../types';

interface ProcedureMultiSelectProps {
  procedures: Procedure[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export const ProcedureMultiSelect: React.FC<ProcedureMultiSelectProps> = ({
  procedures,
  selectedIds,
  onChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [panelStyle, setPanelStyle] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 320,
  });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const updatePosition = () => {
    const btn = triggerRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const panelWidth = 320;
    const left = Math.min(rect.left, window.innerWidth - panelWidth - 12);
    setPanelStyle({ top: rect.bottom + 6, left: Math.max(12, left), width: panelWidth });
  };

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        panelRef.current && !panelRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    // Any scroll (modal body, page) invalidates the anchored position — simplest
    // robust fix is to close, rather than track every possible scroll container.
    const handleScroll = () => setIsOpen(false);

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const groupedByCategory = useMemo<Record<string, Procedure[]>>(() => {
    const term = searchTerm.trim().toLowerCase();
    const filtered = term
      ? procedures.filter((p) => p.title.toLowerCase().includes(term))
      : procedures;

    const groups: Record<string, Procedure[]> = {};
    filtered.forEach((p) => {
      if (!groups[p.category]) groups[p.category] = [];
      groups[p.category].push(p);
    });
    return groups;
  }, [procedures, searchTerm]);

  const toggleProcedure = (id: string) => {
    if (selectedSet.has(id)) {
      onChange(selectedIds.filter((sId) => sId !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const label =
    selectedIds.length === 0
      ? 'Todos os procedimentos'
      : `${selectedIds.length} procedimento${selectedIds.length > 1 ? 's' : ''} selecionado${selectedIds.length > 1 ? 's' : ''}`;

  return (
    <div>
      <label className="block text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">
        Selecionar Procedimentos Específicos
      </label>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className={`flex items-center justify-between gap-2 px-3 py-1.5 rounded-sm bg-white/70 border text-xs font-medium min-w-[220px] transition-colors ${
          selectedIds.length > 0
            ? 'border-[#A67C52] text-[#1A1A1A]'
            : 'border-white/80 text-[#1A1A1A]'
        }`}
      >
        <span className="truncate">{label}</span>
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && createPortal(
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: panelStyle.top, left: panelStyle.left, width: panelStyle.width }}
          className="z-[100] bg-white rounded-sm border border-white/80 shadow-xl overflow-hidden animate-fadeIn"
        >
          <div className="p-2.5 border-b border-gray-100 space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar procedimento..."
                className="w-full pl-8 pr-3 py-1.5 rounded-xs bg-gray-50 border border-gray-200 text-xs text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
              />
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <button
                type="button"
                onClick={() => onChange(procedures.map((p) => p.id))}
                className="text-[#A67C52] hover:underline font-semibold"
              >
                Selecionar todos
              </button>
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-gray-400 hover:text-gray-600 font-semibold flex items-center gap-1"
              >
                <X className="w-3 h-3" />
                Limpar seleção
              </button>
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {Object.keys(groupedByCategory).length === 0 ? (
              <p className="text-center text-xs text-gray-400 py-6">Nenhum procedimento encontrado.</p>
            ) : (
              (Object.entries(groupedByCategory) as [string, Procedure[]][]).map(([category, procs]) => (
                <div key={category}>
                  <div className="px-3 py-1.5 bg-gray-50 text-[10px] font-semibold uppercase tracking-wider text-gray-400 sticky top-0">
                    {category}
                  </div>
                  {procs.map((proc) => {
                    const isChecked = selectedSet.has(proc.id);
                    return (
                      <label
                        key={proc.id}
                        className="flex items-center gap-2.5 px-3 py-2 hover:bg-[#FAF9F5] cursor-pointer transition-colors"
                      >
                        <span
                          className={`w-4 h-4 rounded-xs border flex items-center justify-center shrink-0 transition-colors ${
                            isChecked ? 'bg-[#A67C52] border-[#A67C52]' : 'border-gray-300 bg-white'
                          }`}
                        >
                          {isChecked && <Check className="w-3 h-3 text-white" />}
                        </span>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleProcedure(proc.id)}
                          className="hidden"
                        />
                        <span className="text-xs text-[#1A1A1A] truncate">{proc.title}</span>
                      </label>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

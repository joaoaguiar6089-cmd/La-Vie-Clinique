import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Plus } from 'lucide-react';
import { Procedure } from '../../types';
import { formatBRL } from '../../utils/formatters';

interface ProcedureSearchAddProps {
  procedures: Procedure[];
  onAdd: (procedure: Procedure) => void;
}

/**
 * Botão que abre a busca no catálogo para acrescentar um procedimento. Diferente do
 * ProcedureMultiSelect (que filtra), aqui cada clique adiciona um item novo — o
 * mesmo procedimento pode entrar duas vezes, por exemplo em regiões diferentes.
 */
export const ProcedureSearchAdd: React.FC<ProcedureSearchAddProps> = ({ procedures, onAdd }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    inputRef.current?.focus();
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const grouped = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const filtered = term
      ? procedures.filter(
          (p) =>
            p.title.toLowerCase().includes(term) || p.category.toLowerCase().includes(term)
        )
      : procedures;

    const groups: Record<string, Procedure[]> = {};
    filtered.forEach((p) => {
      if (!groups[p.category]) groups[p.category] = [];
      groups[p.category].push(p);
    });
    return groups;
  }, [procedures, searchTerm]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setSearchTerm('');
          setIsOpen((v) => !v);
        }}
        className="px-3 py-1.5 bg-white/60 border border-white/80 text-[#1A1A1A] text-xs font-medium rounded-sm hover:bg-white/80 transition-colors flex items-center gap-1.5"
      >
        <Plus className="w-3.5 h-3.5" />
        Adicionar procedimento
      </button>

      {isOpen && (
        <div className="absolute z-30 mt-1 w-[min(380px,80vw)] bg-white rounded-sm border border-gray-200 shadow-xl overflow-hidden">
          <div className="p-2.5 border-b border-gray-100">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar no catálogo..."
                className="w-full pl-8 pr-3 py-1.5 rounded-xs bg-gray-50 border border-gray-200 text-xs text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
              />
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto">
            {Object.keys(grouped).length === 0 ? (
              <p className="text-center text-xs text-gray-400 py-5">
                Nenhum procedimento encontrado.
              </p>
            ) : (
              (Object.entries(grouped) as [string, Procedure[]][]).map(([category, procs]) => (
                <div key={category}>
                  <div className="px-3 py-1.5 bg-gray-50 text-[10px] font-semibold uppercase tracking-wider text-gray-400 sticky top-0">
                    {category}
                  </div>
                  {procs.map((proc) => (
                    <button
                      key={proc.id}
                      type="button"
                      onClick={() => {
                        onAdd(proc);
                        setSearchTerm('');
                        setIsOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-[#FAF9F5] transition-colors flex items-center justify-between gap-3 group"
                    >
                      <span className="text-xs text-[#1A1A1A] truncate flex items-center gap-1.5">
                        <Plus className="w-3 h-3 text-[#A67C52] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                        {proc.title}
                      </span>
                      <span className="text-[11px] text-gray-400 shrink-0 tabular-nums">
                        {formatBRL(
                          proc.promotionalPrice && proc.promotionalPrice > 0
                            ? proc.promotionalPrice
                            : proc.price
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import { Procedure } from '../../types';

interface ProcedureSearchSelectProps {
  procedures: Procedure[];
  procedureId?: string;
  nome: string;
  onSelect: (escolha: { procedureId?: string; procedimentoNome: string }) => void;
  erro?: string;
}

/**
 * Busca por digitação sobre o catálogo, aceitando também o que não está nele.
 *
 * É o `PatientSearchSelect` aplicado a procedimentos, e não o `ProcedureSearchAdd` do orçamento:
 * aquele só devolve item do catálogo, e aqui um atendimento de "avaliação" ou "retorno" — coisas
 * que nunca serão procedimento com preço — precisa poder ser registrado.
 *
 * Escolher da lista guarda o `procedureId`; digitar livre guarda só o nome. Essa diferença é o
 * que o vínculo automático de plano usa para decidir se dois atendimentos são o mesmo
 * tratamento (ver `mesmoProcedimento` em `utils/attendances.ts`).
 */
export const ProcedureSearchSelect: React.FC<ProcedureSearchSelectProps> = ({
  procedures,
  procedureId,
  nome,
  onSelect,
  erro,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const clicouFora = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', clicouFora);
    return () => document.removeEventListener('mousedown', clicouFora);
  }, [isOpen]);

  const matches = useMemo(() => {
    const termo = nome.trim().toLowerCase();
    const base = termo
      ? procedures.filter(
          (p) =>
            p.title.toLowerCase().includes(termo) ||
            (p.category || '').toLowerCase().includes(termo)
        )
      : procedures;
    return base.slice(0, 30);
  }, [procedures, nome]);

  const selecionado = procedureId ? procedures.find((p) => p.id === procedureId) : undefined;

  return (
    <div ref={containerRef} className="relative">
      <label
        className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1"
        htmlFor="atendimento-procedimento"
      >
        Procedimento *
      </label>

      <div className="relative">
        <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          id="atendimento-procedimento"
          type="text"
          value={nome}
          onChange={(e) => {
            // Digitar desfaz o vínculo com o catálogo: vira procedimento livre até que a pessoa
            // escolha um da lista de novo.
            onSelect({ procedureId: undefined, procedimentoNome: e.target.value });
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="Buscar no catálogo ou digitar"
          aria-invalid={!!erro}
          className={`w-full glass-input pl-8 pr-8 py-2 rounded-sm text-sm text-[#1A1A1A] focus:outline-hidden ${
            erro ? 'border-red-300' : ''
          }`}
        />
        {nome && (
          <button
            type="button"
            onClick={() => {
              onSelect({ procedureId: undefined, procedimentoNome: '' });
              setIsOpen(false);
            }}
            aria-label="Limpar procedimento"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {erro ? (
        <p className="mt-1 text-[11px] text-red-600">{erro}</p>
      ) : selecionado ? (
        <p className="mt-1 text-[11px] text-[#A67C52] flex items-center gap-1">
          <Check className="w-3 h-3" />
          {selecionado.category}
        </p>
      ) : nome.trim() ? (
        <p className="mt-1 text-[11px] text-gray-400">Fora do catálogo — registrado como digitado</p>
      ) : null}

      {isOpen && (
        <div className="absolute z-30 mt-1 w-full bg-white rounded-sm border border-gray-200 shadow-xl overflow-hidden">
          <div className="max-h-56 overflow-y-auto">
            {matches.length === 0 ? (
              <p className="text-center text-xs text-gray-400 py-5">
                Nada no catálogo com esse nome — pode registrar como está.
              </p>
            ) : (
              matches.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onSelect({ procedureId: p.id, procedimentoNome: p.title });
                    setIsOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-[#FAF9F5] transition-colors flex items-center justify-between gap-3"
                >
                  <span className="text-xs text-[#1A1A1A] truncate">{p.title}</span>
                  <span className="text-[10px] text-gray-400 shrink-0 truncate max-w-[40%]">
                    {p.category}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

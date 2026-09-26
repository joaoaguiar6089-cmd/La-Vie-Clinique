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
        htmlFor="atendimento-procedimento"
        className={`flex items-center gap-2.5 rounded-[14px] px-4 pt-2 pb-2.5 min-h-[56px] cursor-text transition-colors focus-within:bg-card focus-within:ring-2 focus-within:ring-ink ${
          erro ? 'bg-danger-bg ring-2 ring-danger' : 'bg-line-soft'
        }`}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] font-semibold text-ink-soft leading-tight mb-0.5">
            Procedimento
          </span>
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
            autoComplete="off"
            className="w-full min-w-0 bg-transparent border-0 p-0 text-[16px] font-semibold text-ink placeholder:text-muted placeholder:font-medium focus:outline-none"
          />
        </span>
        {nome ? (
          <button
            type="button"
            onClick={() => {
              onSelect({ procedureId: undefined, procedimentoNome: '' });
              setIsOpen(false);
            }}
            aria-label="Limpar procedimento"
            className="w-9 h-9 -mr-2 shrink-0 rounded-full flex items-center justify-center text-ink-soft hover:text-ink hover:bg-black/5"
          >
            <X className="w-4 h-4" />
          </button>
        ) : (
          <Search className="w-[18px] h-[18px] shrink-0 text-ink-soft" aria-hidden />
        )}
      </label>

      {erro ? (
        <p className="mt-1 px-1 text-[13px] font-medium text-danger">{erro}</p>
      ) : selecionado ? (
        <p className="mt-1 px-1 text-[13px] text-ink-soft flex items-center gap-1">
          <Check className="w-3.5 h-3.5 text-ok" />
          {selecionado.category}
        </p>
      ) : nome.trim() ? (
        <p className="mt-1 px-1 text-[13px] text-ink-soft">Fora do catálogo — registrado como digitado</p>
      ) : null}

      {isOpen && (
        <div className="absolute z-30 mt-1.5 w-full bg-card rounded-2xl border border-ink/10 shadow-[0_12px_30px_rgba(26,26,26,.16)] overflow-hidden">
          <div className="max-h-64 overflow-y-auto py-1">
            {matches.length === 0 ? (
              <p className="text-center text-[14px] text-ink-soft py-5 px-4">
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
                  className="w-full text-left min-h-[48px] px-4 py-2 hover:bg-line-soft transition-colors flex items-center justify-between gap-3"
                >
                  <span className="text-[15px] font-semibold text-ink truncate">{p.title}</span>
                  <span className="text-[12px] text-ink-soft shrink-0 truncate max-w-[40%]">
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

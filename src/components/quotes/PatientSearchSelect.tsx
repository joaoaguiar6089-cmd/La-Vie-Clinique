import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Search, X, UserCheck } from 'lucide-react';
import { Patient } from '../../types';

interface PatientSearchSelectProps {
  patients: Patient[];
  pacienteId?: string;
  pacienteNome: string;
  onSelect: (paciente: { id?: string; nome: string; contato?: string }) => void;
}

/**
 * Busca por digitação sobre o cadastro de pacientes. Escolher da lista vincula o
 * `pacienteId`; digitar um nome que não está na lista vale como paciente avulso,
 * sem vínculo — que é o caso de quem ainda não fez cadastro.
 */
export const PatientSearchSelect: React.FC<PatientSearchSelectProps> = ({
  patients,
  pacienteId,
  pacienteNome,
  onSelect,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const matches = useMemo(() => {
    const term = pacienteNome.trim().toLowerCase();
    const base = term
      ? patients.filter(
          (p) =>
            p.nome.toLowerCase().includes(term) ||
            (p.contato || '').replace(/\D/g, '').includes(term.replace(/\D/g, '') || ' ')
        )
      : patients;
    return base.slice(0, 30);
  }, [patients, pacienteNome]);

  const selecionado = pacienteId ? patients.find((p) => p.id === pacienteId) : undefined;

  return (
    <div ref={containerRef} className="relative">
      <label
        className="flex items-center gap-2.5 rounded-[14px] px-4 pt-2 pb-2.5 min-h-[56px] cursor-text bg-line-soft transition-colors focus-within:bg-card focus-within:ring-2 focus-within:ring-ink"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] font-semibold text-ink-soft leading-tight mb-0.5">
            Paciente
          </span>
          <input
            type="text"
            value={pacienteNome}
            onChange={(e) => {
              // Digitar desfaz o vínculo: o nome passa a ser de um paciente avulso
              onSelect({ id: undefined, nome: e.target.value, contato: undefined });
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            placeholder="Buscar no cadastro ou digitar um nome"
            autoComplete="off"
            className="w-full min-w-0 bg-transparent border-0 p-0 text-[16px] font-semibold text-ink placeholder:text-muted placeholder:font-medium focus:outline-none"
          />
        </span>
        {pacienteNome ? (
          <button
            type="button"
            onClick={() => {
              onSelect({ id: undefined, nome: '', contato: undefined });
              setIsOpen(false);
            }}
            aria-label="Limpar paciente"
            className="w-9 h-9 -mr-2 shrink-0 rounded-full flex items-center justify-center text-ink-soft hover:text-ink hover:bg-black/5"
          >
            <X className="w-4 h-4" />
          </button>
        ) : (
          <Search className="w-[18px] h-[18px] shrink-0 text-ink-soft" aria-hidden />
        )}
      </label>

      {selecionado ? (
        <p className="mt-1 px-1 text-[13px] text-ink-soft flex items-center gap-1">
          <UserCheck className="w-3.5 h-3.5 text-ok" />
          Vinculado ao cadastro de {selecionado.nome}
        </p>
      ) : pacienteNome.trim() ? (
        <p className="mt-1 px-1 text-[13px] text-ink-soft">
          Paciente avulso — não ficará vinculado a um cadastro
        </p>
      ) : null}

      {isOpen && (
        <div className="absolute z-30 mt-1.5 w-full bg-card rounded-2xl border border-ink/10 shadow-[0_12px_30px_rgba(26,26,26,.16)] overflow-hidden">
          <div className="max-h-64 overflow-y-auto py-1">
            {matches.length === 0 ? (
              <p className="text-center text-[14px] text-ink-soft py-5 px-4">
                Nenhum paciente no cadastro com esse nome.
              </p>
            ) : (
              matches.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onSelect({ id: p.id, nome: p.nome, contato: p.contato });
                    setIsOpen(false);
                  }}
                  className="w-full text-left min-h-[48px] px-4 py-2 hover:bg-line-soft transition-colors flex items-center justify-between gap-3"
                >
                  <span className="text-[15px] font-semibold text-ink truncate">{p.nome}</span>
                  {p.contato && (
                    <span className="text-[13px] text-ink-soft shrink-0">{p.contato}</span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

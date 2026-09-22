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
      <label className="block text-xs font-medium text-ink mb-1">Paciente *</label>

      <div className="relative">
        <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
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
          className="w-full glass-input pl-8 pr-8 py-2 rounded-sm text-sm text-ink focus:outline-hidden"
        />
        {pacienteNome && (
          <button
            type="button"
            onClick={() => {
              onSelect({ id: undefined, nome: '', contato: undefined });
              setIsOpen(false);
            }}
            aria-label="Limpar paciente"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {selecionado ? (
        <p className="mt-1 text-body text-brand flex items-center gap-1">
          <UserCheck className="w-3 h-3" />
          Vinculado ao cadastro de {selecionado.nome}
        </p>
      ) : pacienteNome.trim() ? (
        <p className="mt-1 text-body text-gray-400">
          Paciente avulso — não ficará vinculado a um cadastro
        </p>
      ) : null}

      {isOpen && (
        <div className="absolute z-30 mt-1 w-full bg-white rounded-sm border border-gray-200 shadow-xl overflow-hidden">
          <div className="max-h-56 overflow-y-auto">
            {matches.length === 0 ? (
              <p className="text-center text-xs text-gray-400 py-5">
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
                  className="w-full text-left px-3 py-2 hover:bg-surface transition-colors flex items-center justify-between gap-3"
                >
                  <span className="text-xs text-ink truncate">{p.nome}</span>
                  {p.contato && (
                    <span className="text-body text-gray-400 shrink-0">{p.contato}</span>
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

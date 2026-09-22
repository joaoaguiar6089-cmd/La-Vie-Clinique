import React from 'react';
import { DoorOpen, Users } from 'lucide-react';
import { ClinicProfile, Professional } from '../../types';
import { corDaProfissional, salasDaClinica } from '../../utils/agenda';

/**
 * Chips de filtro da agenda: por profissional e por sala/equipamento.
 *
 * Chip e não `select` porque o estado precisa ficar **visível**: com um select, a agenda
 * filtrada por uma profissional parece uma agenda vazia, e já aconteceu de alguém marcar em
 * cima de um horário que o filtro estava escondendo. O chip aceso diz o porquê.
 *
 * Cada fileira some quando não há o que escolher — uma clínica com uma profissional só e sem
 * salas cadastradas não ganha dois controles inúteis.
 */

interface AgendaFiltrosProps {
  professionals: Professional[];
  clinic: Pick<ClinicProfile, 'agendaSalas'>;
  filtroProfissionalId: string;
  filtroSalaId: string;
  onFiltrarProfissional: (id: string) => void;
  onFiltrarSala: (id: string) => void;
}

const Chip: React.FC<{
  ativo: boolean;
  onClick: () => void;
  cor?: string;
  children: React.ReactNode;
}> = ({ ativo, onClick, cor, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={ativo}
    className={`inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-full border text-body font-medium whitespace-nowrap transition-colors ${
      ativo
        ? 'bg-ink text-white border-ink'
        : 'bg-card text-ink-soft border-line hover:border-brand'
    }`}
  >
    {cor && (
      <span
        aria-hidden
        className="w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: cor }}
      />
    )}
    {children}
  </button>
);

export const AgendaFiltros: React.FC<AgendaFiltrosProps> = ({
  professionals,
  clinic,
  filtroProfissionalId,
  filtroSalaId,
  onFiltrarProfissional,
  onFiltrarSala,
}) => {
  const salas = salasDaClinica(clinic);
  const temProfissionais = professionals.length > 1;
  const temSalas = salas.length > 0;
  if (!temProfissionais && !temSalas) return null;

  return (
    <div className="space-y-2">
      {temProfissionais && (
        <div className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto">
          <div
            className="flex items-center gap-1.5 w-max"
            role="group"
            aria-label="Filtrar por profissional"
          >
            <Users className="w-4 h-4 text-muted shrink-0 mr-0.5" aria-hidden />
            <Chip ativo={!filtroProfissionalId} onClick={() => onFiltrarProfissional('')}>
              Todas
            </Chip>
            {professionals.map((p) => (
              <Chip
                key={p.id}
                ativo={filtroProfissionalId === p.id}
                cor={corDaProfissional(p.id)}
                onClick={() => onFiltrarProfissional(filtroProfissionalId === p.id ? '' : p.id)}
              >
                {p.name.replace(/^(Dra?\.?|Dr\.?)\s+/i, '')}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {temSalas && (
        <div className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto">
          <div
            className="flex items-center gap-1.5 w-max"
            role="group"
            aria-label="Filtrar por sala ou equipamento"
          >
            <DoorOpen className="w-4 h-4 text-muted shrink-0 mr-0.5" aria-hidden />
            <Chip ativo={!filtroSalaId} onClick={() => onFiltrarSala('')}>
              Todas as salas
            </Chip>
            {salas.map((s) => (
              <Chip
                key={s.id}
                ativo={filtroSalaId === s.id}
                onClick={() => onFiltrarSala(filtroSalaId === s.id ? '' : s.id)}
              >
                {s.nome}
              </Chip>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

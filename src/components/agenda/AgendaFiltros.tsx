import React from 'react';
import { ClinicProfile, Professional } from '../../types';
import { corDaProfissional, salasDaClinica } from '../../utils/agenda';
import { Chip } from '../common/Tinta';

/**
 * Chips de filtro da agenda: por profissional e por sala/equipamento.
 *
 * Chip e não `select` porque o estado precisa ficar **visível**: com um select, a agenda
 * filtrada por uma profissional parece uma agenda vazia, e já aconteceu de alguém marcar em
 * cima de um horário que o filtro estava escondendo. O chip aceso — preto — diz o porquê.
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

const semTitulo = (nome: string) => nome.replace(/^(Dra?\.?|Dr\.?)\s+/i, '').trim();

/**
 * "Juliana", "Karoline" — o primeiro nome basta num chip. Quando duas profissionais dividem o
 * primeiro nome, as duas ficam com o nome inteiro, senão o chip não diria qual é qual.
 */
const rotulosDasProfissionais = (professionals: Professional[]): Map<string, string> => {
  const primeiros = professionals.map((p) => semTitulo(p.name).split(/\s+/)[0] || p.name);
  return new Map(
    professionals.map((p, i) => [
      p.id,
      primeiros.filter((n) => n === primeiros[i]).length > 1 ? semTitulo(p.name) : primeiros[i],
    ])
  );
};

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

  const rotulos = rotulosDasProfissionais(professionals);

  return (
    <div className="space-y-2">
      {temProfissionais && (
        <div className="-mx-5 px-5 sm:mx-0 sm:px-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex items-center gap-2 w-max" role="group" aria-label="Filtrar por profissional">
            <Chip ativo={!filtroProfissionalId} onClick={() => onFiltrarProfissional('')}>
              Todas
            </Chip>
            {professionals.map((p) => (
              <Chip
                key={p.id}
                ativo={filtroProfissionalId === p.id}
                cor={corDaProfissional(p.id)}
                title={p.name}
                onClick={() => onFiltrarProfissional(filtroProfissionalId === p.id ? '' : p.id)}
              >
                {rotulos.get(p.id)}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {temSalas && (
        <div className="-mx-5 px-5 sm:mx-0 sm:px-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex items-center gap-2 w-max" role="group" aria-label="Filtrar por sala ou equipamento">
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

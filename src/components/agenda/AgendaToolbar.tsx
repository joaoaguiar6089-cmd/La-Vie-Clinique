import React from 'react';
import { CalendarPlus, ChevronLeft, ChevronRight } from 'lucide-react';
import { Professional } from '../../types';
import { AgendaVisao, rotuloDoPeriodo } from '../../utils/agenda';
import { DataISO } from '../../utils/attendances';

/** Navegação de período, troca de visão, filtro de profissional e o botão de criar. */

const VISOES: { id: AgendaVisao; rotulo: string }[] = [
  { id: 'dia', rotulo: 'Dia' },
  { id: 'semana', rotulo: 'Semana' },
  { id: 'mes', rotulo: 'Mês' },
];

interface AgendaToolbarProps {
  visao: AgendaVisao;
  onTrocarVisao: (v: AgendaVisao) => void;
  dataFoco: DataISO;
  onAnterior: () => void;
  onProximo: () => void;
  onHoje: () => void;
  professionals: Professional[];
  filtroProfissionalId: string;
  onFiltrarProfissional: (id: string) => void;
  onNovo: () => void;
}

export const AgendaToolbar: React.FC<AgendaToolbarProps> = ({
  visao,
  onTrocarVisao,
  dataFoco,
  onAnterior,
  onProximo,
  onHoje,
  professionals,
  filtroProfissionalId,
  onFiltrarProfissional,
  onNovo,
}) => (
  <div className="flex flex-col gap-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-serif-luxury text-3xl sm:text-4xl text-[#1A1A1A]">Agenda</h1>
        <p className="text-xs text-gray-500 mt-1 first-letter:uppercase">
          {rotuloDoPeriodo(visao, dataFoco)}
        </p>
      </div>

      <button
        type="button"
        onClick={onNovo}
        className="px-5 py-2.5 bg-[#A67C52] text-white text-xs font-semibold uppercase tracking-widest rounded-sm hover:bg-[#8E653D] transition-colors flex items-center gap-2"
      >
        <CalendarPlus className="w-4 h-4" />
        Novo agendamento
      </button>
    </div>

    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onAnterior}
          aria-label="Período anterior"
          className="p-2 rounded-sm text-gray-500 hover:text-[#1A1A1A] hover:bg-white/70 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onHoje}
          className="px-3 py-1.5 rounded-sm bg-white/70 border border-white/80 text-xs font-semibold text-[#1A1A1A] hover:border-[#A67C52]/40 transition-colors"
        >
          Hoje
        </button>
        <button
          type="button"
          onClick={onProximo}
          aria-label="Próximo período"
          className="p-2 rounded-sm text-gray-500 hover:text-[#1A1A1A] hover:bg-white/70 transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Segmentado em vez de ModuleTabs: dia/semana/mês é um controle, não uma seção do módulo. */}
      <div className="flex items-center rounded-sm border border-white/80 bg-white/70 p-0.5">
        {VISOES.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => onTrocarVisao(v.id)}
            aria-pressed={visao === v.id}
            className={`px-3 py-1.5 rounded-xs text-xs font-semibold transition-colors ${
              visao === v.id ? 'bg-[#1A1A1A] text-white' : 'text-gray-500 hover:text-[#1A1A1A]'
            }`}
          >
            {v.rotulo}
          </button>
        ))}
      </div>

      {professionals.length > 1 && (
        <select
          value={filtroProfissionalId}
          onChange={(e) => onFiltrarProfissional(e.target.value)}
          aria-label="Filtrar por profissional"
          className="glass-input px-3 py-2 rounded-sm text-xs text-[#1A1A1A] focus:outline-hidden"
        >
          <option value="">Todas as profissionais</option>
          {professionals.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}
    </div>
  </div>
);

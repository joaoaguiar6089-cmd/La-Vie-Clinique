import React, { useState } from 'react';
import { AlertTriangle, CalendarClock, Check, ChevronDown, X } from 'lucide-react';
import { Attendance } from '../../types';
import { DataISO } from '../../utils/attendances';
import { dataCurta } from '../../utils/agenda';

/**
 * Agendamentos cuja data já passou e ninguém marcou compareceu, faltou ou remarcou.
 *
 * É trabalho represado invisível: o registro fica preso em "agendado" para sempre, o plano de
 * sessões não conta a visita e a fila de avaliações nunca a recebe. A faixa some sozinha quando não
 * há nenhum — selo aceso sem nada para fazer treina a equipe a ignorá-lo.
 */

interface AgendaPendenciasProps {
  pendentes: Attendance[];
  onIrParaData: (data: DataISO) => void;
  onCompareceu: (a: Attendance) => void;
  onFaltou: (a: Attendance) => void;
  onRemarcar: (a: Attendance) => void;
}

export const AgendaPendencias: React.FC<AgendaPendenciasProps> = ({
  pendentes,
  onIrParaData,
  onCompareceu,
  onFaltou,
  onRemarcar,
}) => {
  const [aberto, setAberto] = useState(false);
  if (pendentes.length === 0) return null;

  return (
    <div className="rounded-sm border border-amber-200 bg-amber-50/80 overflow-hidden">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="w-full px-4 py-2.5 flex items-center gap-2.5 text-left hover:bg-amber-100/50 transition-colors"
      >
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
        <span className="flex-1 min-w-0 text-xs text-amber-900">
          <strong>
            {pendentes.length} agendamento{pendentes.length === 1 ? '' : 's'} sem desfecho
          </strong>{' '}
          — a data já passou e ninguém marcou compareceu, faltou ou remarcou.
        </span>
        <ChevronDown
          className={`w-4 h-4 text-amber-600 shrink-0 transition-transform ${
            aberto ? 'rotate-180' : ''
          }`}
        />
      </button>

      {aberto && (
        <ul className="border-t border-amber-200 divide-y divide-amber-200/70">
          {pendentes.map((a) => (
            <li
              key={a.id}
              className="px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 bg-white/50"
            >
              <button
                type="button"
                onClick={() => onIrParaData(a.data)}
                className="flex-1 min-w-0 text-left group"
              >
                <span className="block text-xs font-medium text-[#1A1A1A] truncate group-hover:text-[#A67C52] transition-colors">
                  {a.pacienteNome}
                </span>
                <span className="block text-[11px] text-gray-500 truncate">
                  {dataCurta(a.data)}
                  {a.hora ? ` às ${a.hora}` : ''} · {a.procedimentoNome}
                  {a.profissionalNome ? ` · ${a.profissionalNome}` : ''}
                </span>
              </button>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => onCompareceu(a)}
                  className="inline-flex items-center gap-1 px-2 py-1.5 rounded-sm text-[11px] font-medium text-emerald-700 hover:bg-emerald-50 transition-colors"
                >
                  <Check className="w-3.5 h-3.5" />
                  Compareceu
                </button>
                <button
                  type="button"
                  onClick={() => onFaltou(a)}
                  className="inline-flex items-center gap-1 px-2 py-1.5 rounded-sm text-[11px] font-medium text-red-600 hover:bg-red-50 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  Faltou
                </button>
                <button
                  type="button"
                  onClick={() => onRemarcar(a)}
                  className="inline-flex items-center gap-1 px-2 py-1.5 rounded-sm text-[11px] font-medium text-gray-500 hover:bg-white transition-colors"
                >
                  <CalendarClock className="w-3.5 h-3.5" />
                  Remarcar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

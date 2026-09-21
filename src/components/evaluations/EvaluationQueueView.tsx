import React, { useMemo, useState } from 'react';
import { CalendarCheck, CheckCircle2, ClipboardCheck, User } from 'lucide-react';
import { Attendance } from '../../types';
import { formatDateOnly } from '../../utils/formatters';
import { JANELA_PENDENTES_DIAS, filaDePendentes } from '../../utils/evaluations';

interface EvaluationQueueViewProps {
  atendimentos: Attendance[];
  onAvaliar: (a: Attendance) => void;
}

/** As janelas oferecidas. `undefined` = tudo, para a auditoria eventual. */
const JANELAS: { rotulo: string; dias: number | undefined }[] = [
  { rotulo: '30 dias', dias: JANELA_PENDENTES_DIAS },
  { rotulo: '90 dias', dias: 90 },
  { rotulo: '1 ano', dias: 365 },
  { rotulo: 'Tudo', dias: undefined },
];

/**
 * O trabalho represado: visitas que aconteceram e ainda não foram avaliadas.
 *
 * Começa nos últimos 30 dias porque, sem janela, a fila nasceria com todo atendimento já lançado
 * na história da clínica — centenas de linhas anteriores a esta funcionalidade, que ninguém vai
 * preencher, e um contador no menu que mente desde o primeiro minuto. As janelas maiores ficam a
 * um toque para quem precisar auditar para trás.
 */
export const EvaluationQueueView: React.FC<EvaluationQueueViewProps> = ({
  atendimentos,
  onAvaliar,
}) => {
  const [janela, setJanela] = useState<number | undefined>(JANELA_PENDENTES_DIAS);

  const pendentes = useMemo(
    () => filaDePendentes(atendimentos, janela),
    [atendimentos, janela]
  );

  return (
    <div className="space-y-6">
      <div className="bg-white/60 backdrop-blur-md rounded-sm border border-white/80 p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#A67C52]" />
              <h3 className="font-serif-luxury text-xl font-medium text-[#1A1A1A]">
                Avaliações pendentes
              </h3>
            </div>
            <p className="text-xs text-gray-500 mt-1 max-w-2xl leading-relaxed">
              Atendimentos que já aconteceram e ainda não têm ficha de avaliação preenchida.
              Agendamento futuro, falta e remarcação não entram aqui — não houve o que avaliar.
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {JANELAS.map((j) => (
              <button
                key={j.rotulo}
                type="button"
                onClick={() => setJanela(j.dias)}
                className={`px-2.5 py-1.5 rounded-sm text-[11px] font-semibold border transition-colors ${
                  janela === j.dias
                    ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
              >
                {j.rotulo}
              </button>
            ))}
          </div>
        </div>
      </div>

      {pendentes.length === 0 ? (
        <div className="bg-white/50 rounded-sm border border-white/70 p-12 text-center">
          <CheckCircle2 className="w-9 h-9 text-emerald-400 mx-auto mb-3" />
          <p className="text-sm font-semibold text-[#1A1A1A]">Nenhuma avaliação pendente</p>
          <p className="text-xs text-gray-500 mt-1">
            Todo atendimento realizado nesta janela já foi avaliado.
          </p>
        </div>
      ) : (
        <div className="bg-white/50 backdrop-blur-md rounded-sm border border-white/70 shadow-xs overflow-hidden">
          <div className="px-5 py-3.5 bg-white/70 border-b border-white/80">
            <span className="text-[11px] uppercase tracking-widest font-semibold text-gray-500">
              {pendentes.length} {pendentes.length === 1 ? 'pendente' : 'pendentes'}
            </span>
          </div>

          <div className="divide-y divide-gray-100">
            {pendentes.map((a) => (
              <div
                key={a.id}
                className="p-4 sm:px-5 flex items-center justify-between gap-4 hover:bg-white/80 transition-colors"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-sm bg-[#1A1A1A] flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-[#C49B74]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#1A1A1A] truncate">
                      {a.pacienteNome}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{a.procedimentoNome}</p>
                    <p className="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5">
                      <CalendarCheck className="w-3 h-3" />
                      {formatDateOnly(a.data)}
                      {a.hora ? ` · ${a.hora}` : ''}
                      {a.profissionalNome ? ` · ${a.profissionalNome}` : ''}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onAvaliar(a)}
                  className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-sm bg-[#A67C52] text-white text-[11px] font-semibold uppercase tracking-wider hover:bg-[#8e6945] active:scale-95 transition-all"
                >
                  <ClipboardCheck className="w-3.5 h-3.5" />
                  Avaliar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

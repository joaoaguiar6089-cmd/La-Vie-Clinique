import React, { useMemo } from 'react';
import { Attendance, ClinicProfile } from '../../types';
import { DataISO } from '../../utils/attendances';
import {
  corDaProfissional,
  ehDoMesDe,
  expedienteDoDia,
  instanteNoDia,
  nomeCurtoDoDia,
} from '../../utils/agenda';
import { situacaoDoCartao } from './AgendaCard';

/**
 * O panorama do mês.
 *
 * Aqui não cabe grade proporcional nem cartão com três linhas — cada dia vira uma pilha de fichas
 * finas, no máximo três, e o resto vira "+N". Quem precisa do detalhe clica no dia e cai na visão
 * diária, que é onde ele existe.
 */

const LIMITE_POR_DIA = 3;

const COR_DA_SITUACAO: Record<string, string> = {
  agendado: 'text-ink',
  atrasado: 'text-amber-800 font-semibold',
  compareceu: 'text-emerald-800',
  faltou: 'text-red-700/70 line-through',
  realizado: 'text-gray-600',
};

interface AgendaMesViewProps {
  dias: DataISO[];
  /** A data que define o mês "de dentro" — os dias das outras semanas entram apagados. */
  referencia: DataISO;
  atendimentos: Attendance[];
  clinic: ClinicProfile;
  hoje: DataISO;
  onAbrirDia: (data: DataISO) => void;
  onAbrirAtendimento: (a: Attendance) => void;
}

export const AgendaMesView: React.FC<AgendaMesViewProps> = ({
  dias,
  referencia,
  atendimentos,
  clinic,
  hoje,
  onAbrirDia,
  onAbrirAtendimento,
}) => {
  const porDia = useMemo(() => {
    const mapa = new Map<DataISO, Attendance[]>();
    dias.forEach((d) => mapa.set(d, []));
    atendimentos.forEach((a) => {
      // Remarcado não conta aqui pela mesma razão da grade: aquele horário foi devolvido. Antes
      // desta linha ele não aparecia como ficha, mas inflava o "+N" — o mês dizia ter mais
      // compromissos do que existiam de fato.
      if (a.status === 'remarcado') return;
      const lista = mapa.get(a.data);
      if (lista) lista.push(a);
    });
    mapa.forEach((lista) => lista.sort((a, b) => instanteNoDia(a) - instanteNoDia(b)));
    return mapa;
  }, [dias, atendimentos]);

  return (
    <div className="glass-card rounded-sm overflow-hidden">
      <div className="grid grid-cols-7 border-b border-[rgba(26,26,28,.07)] bg-white/70">
        {dias.slice(0, 7).map((d) => (
          <div
            key={d}
            className="px-2 py-2 text-center text-label font-semibold uppercase tracking-wider text-gray-400"
          >
            {nomeCurtoDoDia(d)}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {dias.map((dia) => {
          const doDia = porDia.get(dia) || [];
          const doMes = ehDoMesDe(dia, referencia);
          const ehHoje = dia === hoje;
          const fechado = !expedienteDoDia(clinic, dia);

          return (
            <div
              key={dia}
              role="button"
              tabIndex={0}
              onClick={() => onAbrirDia(dia)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onAbrirDia(dia);
                }
              }}
              className={`min-h-[92px] p-1.5 border-t border-l border-[rgba(26,26,28,.06)] text-left transition-colors cursor-pointer hover:bg-brand/5 focus:outline-hidden focus:ring-1 focus:ring-inset focus:ring-brand/50 ${
                doMes ? '' : 'bg-surface/50'
              } ${fechado && doMes ? 'bg-line/45' : ''}`}
            >
              <span
                className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-body tabular-nums mb-1 ${
                  ehHoje
                    ? 'bg-brand text-white font-semibold'
                    : doMes
                    ? 'text-gray-600'
                    : 'text-gray-300'
                }`}
              >
                {Number(dia.slice(8, 10))}
              </span>

              <div className="space-y-0.5">
                {doDia.slice(0, LIMITE_POR_DIA).map((a) => (
                  <div
                    key={a.id}
                    role="button"
                    tabIndex={-1}
                    onClick={(e) => {
                      e.stopPropagation();
                      onAbrirAtendimento(a);
                    }}
                    title={`${a.hora || 's/ hora'} · ${a.pacienteNome} · ${a.procedimentoNome}`}
                    className="flex items-center gap-1 min-w-0 rounded-xs px-0.5 hover:bg-white/80"
                  >
                    <span
                      aria-hidden
                      className="shrink-0 w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: corDaProfissional(a.professionalId) }}
                    />
                    <span
                      className={`truncate text-label leading-tight ${
                        COR_DA_SITUACAO[situacaoDoCartao(a)]
                      } ${doMes ? '' : 'opacity-50'}`}
                    >
                      {a.hora ? `${a.hora} ` : ''}
                      {a.pacienteNome}
                    </span>
                  </div>
                ))}

                {doDia.length > LIMITE_POR_DIA && (
                  <p className="px-0.5 text-label text-gray-400">
                    +{doDia.length - LIMITE_POR_DIA}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

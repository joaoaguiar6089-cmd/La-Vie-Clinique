import React, { useEffect, useRef } from 'react';
import { DataISO } from '../../utils/attendances';
import {
  dataCurta,
  deslocarDias,
  diasDaSemanaDe,
  expedienteDoDia,
  inicioDaSemana,
} from '../../utils/agenda';
import { ClinicProfile } from '../../types';

/**
 * A faixa de dias do celular — três semanas deslizáveis, com a de hoje no meio.
 *
 * Substitui as sete colunas espremidas da visão de semana. Numa tela de 375px, sete colunas dão
 * 46px cada: cabe a data e mais nada, e o nome da paciente some. Aqui a semana vira só a
 * **navegação**, e o dia inteiro fica embaixo com a largura toda.
 *
 * Três semanas e não infinitas: a recepção navega em dias, não em meses — para ir longe existem
 * as setas da barra e a visão de mês. Três cabem em memória sem virar carrossel.
 */

interface AgendaSemanaStripProps {
  dataFoco: DataISO;
  hoje: DataISO;
  clinic: Pick<ClinicProfile, 'agendaExpediente'>;
  /** Dias que têm algo marcado — recebem o pontinho. */
  diasComAlgo: Set<DataISO>;
  onEscolherDia: (data: DataISO) => void;
}

const DIAS_CURTOS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

export const AgendaSemanaStrip: React.FC<AgendaSemanaStripProps> = ({
  dataFoco,
  hoje,
  clinic,
  diasComAlgo,
  onEscolherDia,
}) => {
  const trilhoRef = useRef<HTMLDivElement>(null);
  const domingoDoFoco = inicioDaSemana(dataFoco);

  const semanas = [
    diasDaSemanaDe(deslocarDias(domingoDoFoco, -7)),
    diasDaSemanaDe(domingoDoFoco),
    diasDaSemanaDe(deslocarDias(domingoDoFoco, 7)),
  ];

  /**
   * Abre centrado na semana do meio.
   *
   * `scrollLeft` direto e não `scrollIntoView`: este é o único contêiner que rola na horizontal
   * e `scrollIntoView` arrastaria a página inteira junto no celular.
   */
  useEffect(() => {
    const el = trilhoRef.current;
    if (!el) return;
    el.scrollLeft = el.scrollWidth / 3;
  }, [domingoDoFoco]);

  return (
    <div
      ref={trilhoRef}
      className="overflow-x-auto snap-x snap-mandatory -mx-4 px-0 sm:mx-0"
      aria-label="Semana"
    >
      <div className="flex w-max">
        {semanas.map((semana, i) => (
          <div key={i} className="flex w-screen sm:w-full snap-start px-4 sm:px-0">
            {semana.map((dia) => {
              const ehFoco = dia === dataFoco;
              const ehHoje = dia === hoje;
              const fechado = !expedienteDoDia(clinic, dia);
              const temAlgo = diasComAlgo.has(dia);
              const diaDoMes = Number(dia.slice(8, 10));
              const diaSemana = new Date(`${dia}T12:00:00`).getDay();

              return (
                <button
                  key={dia}
                  type="button"
                  onClick={() => onEscolherDia(dia)}
                  aria-current={ehFoco ? 'date' : undefined}
                  aria-label={`${dataCurta(dia)}${temAlgo ? ', com atendimentos' : ''}`}
                  className={`flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 h-[60px] mx-0.5 rounded-xl transition-colors ${
                    ehFoco
                      ? 'bg-ink text-white'
                      : fechado
                      ? 'text-muted-light hover:bg-surface-2'
                      : 'text-ink hover:bg-surface-2'
                  }`}
                >
                  <span
                    className={`text-label font-semibold uppercase ${
                      ehFoco ? 'text-brand-light' : ehHoje ? 'text-brand' : 'text-muted'
                    }`}
                  >
                    {DIAS_CURTOS[diaSemana]}
                  </span>
                  <span
                    className={`text-body-lg tabular-nums leading-none ${
                      ehHoje || ehFoco ? 'font-bold' : 'font-medium'
                    }`}
                  >
                    {diaDoMes}
                  </span>
                  {/* O ponto fica no lugar mesmo quando não há nada, para a linha de baixo não
                      subir e descer conforme os dias mudam. */}
                  <span
                    aria-hidden
                    className={`w-1 h-1 rounded-full ${
                      temAlgo ? (ehFoco ? 'bg-brand-light' : 'bg-brand') : 'bg-transparent'
                    }`}
                  />
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

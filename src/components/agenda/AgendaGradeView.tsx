import React, { useMemo, useRef } from 'react';
import { Attendance, ClinicProfile, Procedure, Professional } from '../../types';
import { DataISO } from '../../utils/attendances';
import {
  dataCurta,
  distribuirEmColunas,
  expedienteDoDia,
  faixaDaGrade,
  hhmmDeMinutos,
  intervaloDaGrade,
  intervaloDoAtendimento,
  nomeCurtoDoDia,
  ocupaAGrade,
  semHorario,
} from '../../utils/agenda';
import { AgendaCard } from './AgendaCard';

/**
 * A grade de horários. A mesma engrenagem serve o **dia** (uma coluna) e a **semana** (as colunas
 * que a clínica abre) — o que muda é só a lista de dias que chega.
 *
 * O desenho é proporcional ao tempo: um cartão de 90 min tem o triplo da altura de um de 30. É isso
 * que faz o buraco livre na agenda ser visível sem ninguém precisar ler horário nenhum.
 */

/** Pixels por minuto. 1,4 põe um expediente de 10h em ~840px — rola uma tela e meia, não dez. */
const PX_POR_MIN = 1.4;
const LARGURA_CALHA = 52;

interface AgendaGradeViewProps {
  dias: DataISO[];
  /** Já filtrados por profissional, quando há filtro. */
  atendimentos: Attendance[];
  clinic: ClinicProfile;
  catalogo: Procedure[];
  professionals: Professional[];
  rotulosDePlano: Map<string, string>;
  hoje: DataISO;
  onAbrirAtendimento: (a: Attendance) => void;
  onNovoEm: (data: DataISO, hora: string) => void;
  onSoltarEm: (a: Attendance, data: DataISO, hora: string) => void;
  /** O que está sendo arrastado agora. */
  arrastando: Attendance | null;
  onArrastarInicio: (a: Attendance) => void;
  onArrastarFim: () => void;
}

/** O risco de "agora". Só no dia de hoje, e só quando cai dentro da faixa desenhada. */
const MarcaDeAgora: React.FC<{ faixa: { inicioMin: number; fimMin: number } }> = ({ faixa }) => {
  const agora = new Date();
  const minutos = agora.getHours() * 60 + agora.getMinutes();
  if (minutos < faixa.inicioMin || minutos > faixa.fimMin) return null;

  return (
    <div
      className="absolute left-0 right-0 z-30 pointer-events-none"
      style={{ top: (minutos - faixa.inicioMin) * PX_POR_MIN }}
    >
      <div className="h-px bg-[#C0392B]/70" />
      <div className="absolute -left-[3px] -top-[3px] w-[7px] h-[7px] rounded-full bg-[#C0392B]/70" />
    </div>
  );
};

export const AgendaGradeView: React.FC<AgendaGradeViewProps> = ({
  dias,
  atendimentos,
  clinic,
  catalogo,
  professionals,
  rotulosDePlano,
  hoje,
  onAbrirAtendimento,
  onNovoEm,
  onSoltarEm,
  arrastando,
  onArrastarInicio,
  onArrastarFim,
}) => {
  const colunasRef = useRef<Record<string, HTMLDivElement | null>>({});
  const passo = intervaloDaGrade(clinic);
  const faixa = useMemo(
    () => faixaDaGrade(dias, atendimentos, clinic, catalogo),
    [dias, atendimentos, clinic, catalogo]
  );
  const alturaTotal = (faixa.fimMin - faixa.inicioMin) * PX_POR_MIN;

  /** As horas cheias da calha. Rotular cada faixa de 15 min viraria uma parede de números. */
  const horas = useMemo(() => {
    const lista: number[] = [];
    for (let m = Math.ceil(faixa.inicioMin / 60) * 60; m <= faixa.fimMin; m += 60) lista.push(m);
    return lista;
  }, [faixa]);

  /** Todas as divisórias, na granularidade escolhida — a da hora cheia vem mais forte. */
  const linhas = useMemo(() => {
    const lista: number[] = [];
    for (let m = faixa.inicioMin; m <= faixa.fimMin; m += passo) lista.push(m);
    return lista;
  }, [faixa, passo]);

  const porDia = useMemo(() => {
    const mapa = new Map<DataISO, Attendance[]>();
    dias.forEach((d) => mapa.set(d, []));
    atendimentos.forEach((a) => {
      const lista = mapa.get(a.data);
      if (lista) lista.push(a);
    });
    return mapa;
  }, [dias, atendimentos]);

  const temSemHorario = dias.some((d) => (porDia.get(d) || []).some(semHorario));

  /**
   * De onde o ponteiro caiu para que horário ele quer. Arredonda **para baixo**: quem clica no meio
   * do bloco das 14h quer as 14h, não as 14h07.
   */
  const horaNoPonto = (data: DataISO, clientY: number): string | null => {
    const el = colunasRef.current[data];
    if (!el) return null;
    const caixa = el.getBoundingClientRect();
    const minutos = faixa.inicioMin + (clientY - caixa.top) / PX_POR_MIN;
    const preso = Math.max(faixa.inicioMin, Math.min(faixa.fimMin - passo, minutos));
    return hhmmDeMinutos(Math.floor(preso / passo) * passo);
  };

  return (
    <div className="glass-card rounded-sm overflow-hidden">
      {/* min-w faz a semana rolar na horizontal no celular em vez de espremer sete colunas. */}
      <div className="overflow-x-auto">
        <div style={{ minWidth: dias.length > 2 ? LARGURA_CALHA + dias.length * 118 : undefined }}>
          <div className="flex border-b border-[rgba(26,26,28,.07)] bg-white/70 sticky top-0 z-20">
            <div className="shrink-0" style={{ width: LARGURA_CALHA }} />
            {dias.map((dia) => {
              const ehHoje = dia === hoje;
              const fechado = !expedienteDoDia(clinic, dia);
              return (
                <div
                  key={dia}
                  className={`flex-1 min-w-0 px-2 py-2 text-center border-l border-[rgba(26,26,28,.06)] ${
                    ehHoje ? 'bg-[#A67C52]/10' : ''
                  }`}
                >
                  <p
                    className={`text-[10px] font-semibold uppercase tracking-wider ${
                      ehHoje ? 'text-[#A67C52]' : fechado ? 'text-gray-300' : 'text-gray-400'
                    }`}
                  >
                    {nomeCurtoDoDia(dia)}
                  </p>
                  <p
                    className={`text-sm tabular-nums ${
                      ehHoje ? 'font-semibold text-[#1A1A1A]' : 'text-gray-600'
                    }`}
                  >
                    {dataCurta(dia)}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Visitas sem horário: lançamento retroativo não tem hora obrigatória, e inventar uma
              para encaixá-la na grade seria criar dado que ninguém informou. */}
          {temSemHorario && (
            <div className="flex border-b border-[rgba(26,26,28,.07)] bg-[#F9F8F6]">
              <div
                className="shrink-0 px-2 py-1.5 text-[9px] uppercase tracking-wider text-gray-400 text-right"
                style={{ width: LARGURA_CALHA }}
              >
                s/ hora
              </div>
              {dias.map((dia) => (
                <div
                  key={dia}
                  className="flex-1 min-w-0 p-1 space-y-1 border-l border-[rgba(26,26,28,.06)]"
                >
                  {(porDia.get(dia) || []).filter(semHorario).map((a) => (
                    <AgendaCard
                      key={a.id}
                      atendimento={a}
                      catalogo={catalogo}
                      professionals={professionals}
                      rotuloDoPlano={rotulosDePlano.get(a.id)}
                      denso
                      onAbrir={onAbrirAtendimento}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}

          <div className="flex" style={{ height: alturaTotal }}>
            <div className="relative shrink-0" style={{ width: LARGURA_CALHA }}>
              {horas.map((m) => (
                <span
                  key={m}
                  className="absolute right-2 text-[10px] tabular-nums text-gray-400"
                  style={{
                    top: (m - faixa.inicioMin) * PX_POR_MIN,
                    // Centrado na linha, menos o primeiro: o cartão esconde o que transborda e
                    // metade dele ficaria cortada na borda de cima.
                    transform: m === faixa.inicioMin ? 'none' : 'translateY(-50%)',
                  }}
                >
                  {hhmmDeMinutos(m)}
                </span>
              ))}
            </div>

            {dias.map((dia) => {
              const expediente = expedienteDoDia(clinic, dia);
              const doDia = (porDia.get(dia) || []).filter(ocupaAGrade);

              const eventos = doDia
                .map((a) => {
                  const intervalo = intervaloDoAtendimento(a, catalogo);
                  return intervalo ? { id: a.id, ...intervalo } : null;
                })
                .filter((e): e is { id: string; inicioMin: number; fimMin: number } => !!e);
              const posicoes = distribuirEmColunas(eventos);

              return (
                <div
                  key={dia}
                  ref={(el) => {
                    colunasRef.current[dia] = el;
                  }}
                  className="relative flex-1 min-w-0 border-l border-[rgba(26,26,28,.06)] cursor-copy"
                  onClick={(e) => {
                    const hora = horaNoPonto(dia, e.clientY);
                    if (hora) onNovoEm(dia, hora);
                  }}
                  onDragOver={(e) => {
                    if (!arrastando) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                  }}
                  onDrop={(e) => {
                    if (!arrastando) return;
                    e.preventDefault();
                    const hora = horaNoPonto(dia, e.clientY);
                    if (hora) onSoltarEm(arrastando, dia, hora);
                  }}
                >
                  {/* Fora do expediente: cinza, e ainda assim clicável — encaixe é decisão da
                      clínica, então a grade desencoraja sem impedir. */}
                  {!expediente ? (
                    <div className="absolute inset-0 bg-[#E9E5DD]/70" />
                  ) : (
                    <>
                      {expediente.abreMin > faixa.inicioMin && (
                        <div
                          className="absolute left-0 right-0 bg-[#E9E5DD]/70"
                          style={{
                            top: 0,
                            height: (expediente.abreMin - faixa.inicioMin) * PX_POR_MIN,
                          }}
                        />
                      )}
                      {expediente.fechaMin < faixa.fimMin && (
                        <div
                          className="absolute left-0 right-0 bg-[#E9E5DD]/70"
                          style={{
                            top: (expediente.fechaMin - faixa.inicioMin) * PX_POR_MIN,
                            height: (faixa.fimMin - expediente.fechaMin) * PX_POR_MIN,
                          }}
                        />
                      )}
                    </>
                  )}

                  {linhas.map((m) => (
                    <div
                      key={m}
                      className={`absolute left-0 right-0 border-t ${
                        m % 60 === 0 ? 'border-[rgba(26,26,28,.09)]' : 'border-[rgba(26,26,28,.04)]'
                      }`}
                      style={{ top: (m - faixa.inicioMin) * PX_POR_MIN }}
                    />
                  ))}

                  {dia === hoje && <MarcaDeAgora faixa={faixa} />}

                  {doDia.map((a) => {
                    const intervalo = intervaloDoAtendimento(a, catalogo);
                    if (!intervalo) return null;
                    const pos = posicoes.get(a.id) || { coluna: 0, colunas: 1 };
                    const altura = (intervalo.fimMin - intervalo.inicioMin) * PX_POR_MIN;
                    const largura = 100 / pos.colunas;

                    return (
                      <AgendaCard
                        key={a.id}
                        atendimento={a}
                        catalogo={catalogo}
                        professionals={professionals}
                        rotuloDoPlano={rotulosDePlano.get(a.id)}
                        alturaPx={altura}
                        arrastavel={a.status === 'agendado'}
                        onArrastarInicio={onArrastarInicio}
                        onArrastarFim={onArrastarFim}
                        onAbrir={onAbrirAtendimento}
                        style={{
                          position: 'absolute',
                          top: (intervalo.inicioMin - faixa.inicioMin) * PX_POR_MIN,
                          height: Math.max(20, altura - 2),
                          left: `calc(${pos.coluna * largura}% + 3px)`,
                          width: `calc(${largura}% - 5px)`,
                          zIndex: 10 + pos.coluna,
                        }}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

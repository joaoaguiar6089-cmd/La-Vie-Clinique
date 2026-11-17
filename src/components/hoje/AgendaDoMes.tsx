import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { Attendance, ClinicProfile } from '../../types';
import { DataISO, ehRealizado, nomeDosProcedimentos } from '../../utils/attendances';
import {
  deslocarDias,
  deslocarMeses,
  diasDoMesDe,
  expedienteDoDia,
  instanteNoDia,
} from '../../utils/agenda';

/**
 * O calendário grande da tela Hoje — o mês inteiro da agenda, feito para ficar aberto na recepção.
 *
 * Cada dia mostra os horários que cabem nele ("09:30 Maria S."); o dia inteiro aparece numa prévia
 * ao parar o mouse sobre ele (horário, cliente, procedimento e situação). Tocar no dia abre a
 * agenda naquele dia; tocar num horário — na célula ou na prévia — abre a agenda já nele.
 *
 * Tudo sai dos atendimentos que o `App` já assina: nenhuma leitura nova.
 */

interface AgendaDoMesProps {
  atendimentos: Attendance[];
  clinic: ClinicProfile;
  hoje: DataISO;
  /** "14:05" — para o "próximo atendimento" não apontar para um horário que já passou. */
  agora: string;
  onAbrirDia: (data: DataISO) => void;
  onAbrirAtendimento: (a: Attendance) => void;
  onAbrirAgenda: () => void;
}

type Tom = 'ok' | 'warn' | 'danger' | 'brand' | 'neutro';

/** Em que pé está o horário — a cor do ponto e o selo da prévia. */
const situacaoDe = (a: Attendance): { rotulo: string; tom: Tom } => {
  if (a.status === 'faltou') return { rotulo: 'Faltou', tom: 'danger' };
  if (ehRealizado(a)) return { rotulo: 'Compareceu', tom: 'neutro' };
  if (a.avisoAusenciaEm) return { rotulo: 'Avisou que não vem', tom: 'warn' };
  if (a.pedidoRemarcacao) return { rotulo: 'Pediu outro horário', tom: 'warn' };
  if (a.confirmadoEm) return { rotulo: 'Confirmado', tom: 'ok' };
  return { rotulo: 'A confirmar', tom: 'brand' };
};

const PONTO: Record<Tom, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  danger: 'bg-danger',
  brand: 'bg-brand',
  neutro: 'bg-ink/30',
};

const SELO: Record<Tom, string> = {
  ok: 'bg-ok-bg text-ok border-ok-line',
  warn: 'bg-warn-bg text-warn border-warn-line',
  danger: 'bg-danger-bg text-danger border-danger-line',
  brand: 'bg-brand-bg text-brand-deep border-brand/25',
  neutro: 'bg-surface-2 text-ink-soft border-line',
};

const LEGENDA: { tom: Tom; rotulo: string }[] = [
  { tom: 'brand', rotulo: 'A confirmar' },
  { tom: 'ok', rotulo: 'Confirmado' },
  { tom: 'warn', rotulo: 'Aviso da cliente' },
  { tom: 'danger', rotulo: 'Faltou' },
  { tom: 'neutro', rotulo: 'Compareceu' },
];

const SEMANA_CURTA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** "Maria S." — cabe na célula e ainda separa duas Marias no mesmo dia. */
const nomeCurto = (nome: string): string => {
  const partes = (nome || '').trim().split(/\s+/).filter(Boolean);
  if (partes.length <= 1) return partes[0] || '';
  return `${partes[0]} ${partes[partes.length - 1][0]}.`;
};

const aoMeioDia = (data: DataISO) => new Date(`${data}T12:00:00`);

const dataLonga = (data: DataISO) =>
  aoMeioDia(data).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

/** Altura de cada linha de horário na célula, com o respiro até a seguinte — ver `cabem`. */
const ALTURA_DO_HORARIO = 21;
/** O respiro entre o número do dia e o primeiro horário. */
const RESPIRO_DO_TOPO = 4;

export const AgendaDoMes: React.FC<AgendaDoMesProps> = ({
  atendimentos,
  clinic,
  hoje,
  agora,
  onAbrirDia,
  onAbrirAtendimento,
  onAbrirAgenda,
}) => {
  /**
   * Quantos meses a partir do mês de hoje — e não a data mostrada: deixada aberta na recepção, a
   * tela vira o mês sozinha à meia-noite do dia 1º, em vez de ficar presa no mês em que abriu.
   */
  const [deslocamento, setDeslocamento] = useState(0);
  const referencia = deslocarMeses(`${hoje.slice(0, 7)}-01`, deslocamento);
  const mesDaReferencia = referencia.slice(0, 7);

  const dias = useMemo(() => diasDoMesDe(referencia), [referencia]);
  const semanas = Math.ceil(dias.length / 7);

  const doDia = (lista: Attendance[]) =>
    lista.sort((a, b) => instanteNoDia(a) - instanteNoDia(b));

  /** Os horários de cada dia da grade, em ordem. O remarcado sai: aquele horário foi devolvido. */
  const porDia = useMemo(() => {
    const inicio = dias[0];
    const fim = dias[dias.length - 1];
    const mapa = new Map<DataISO, Attendance[]>();
    atendimentos.forEach((a) => {
      if (!a.data || a.status === 'remarcado' || a.data < inicio || a.data > fim) return;
      const lista = mapa.get(a.data);
      if (lista) lista.push(a);
      else mapa.set(a.data, [a]);
    });
    mapa.forEach(doDia);
    return mapa;
  }, [atendimentos, dias]);

  const quantosHoje = useMemo(
    () => atendimentos.filter((a) => a.data === hoje && a.status !== 'remarcado').length,
    [atendimentos, hoje]
  );

  /** O próximo horário marcado a partir de agora — hoje ou no próximo dia com agenda. */
  const proximo = useMemo(() => {
    let melhor: Attendance | undefined;
    atendimentos.forEach((a) => {
      if (a.status !== 'agendado' || !a.hora || !a.data) return;
      if (a.data < hoje || (a.data === hoje && a.hora < agora)) return;
      if (!melhor || a.data < melhor.data || (a.data === melhor.data && a.hora < (melhor.hora || ''))) {
        melhor = a;
      }
    });
    return melhor;
  }, [atendimentos, hoje, agora]);

  const quandoDoProximo = (a: Attendance): string => {
    if (a.data === hoje) return a.hora || '';
    if (a.data === deslocarDias(hoje, 1)) return `amanhã, ${a.hora}`;
    const dia = aoMeioDia(a.data)
      .toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })
      .replace(/\./g, '');
    return `${dia}, ${a.hora}`;
  };

  // "Novembro 2026" — o ano vem sempre: na parede da recepção ninguém confere em que ano está.
  const nomeDoMes = aoMeioDia(referencia).toLocaleDateString('pt-BR', { month: 'long' });
  const ano = referencia.slice(0, 4);
  const noMesAtual = deslocamento === 0;

  /**
   * Quantos horários cabem numa célula. A altura das células muda com a janela (no computador o
   * calendário ocupa a tela), então ela é medida: mostrar um horário cortado ao meio seria pior
   * do que mostrar "+2".
   */
  const gradeRef = useRef<HTMLDivElement>(null);
  const [cabem, setCabem] = useState(2);
  useLayoutEffect(() => {
    const grade = gradeRef.current;
    if (!grade) return;
    const medir = () => {
      const celula = grade.querySelector<HTMLElement>('[data-celula]');
      const topo = celula?.querySelector<HTMLElement>('[data-topo]');
      if (!celula || !topo) return;
      const livre =
        celula.clientHeight -
        parseFloat(getComputedStyle(celula).paddingBottom || '0') -
        (topo.offsetTop + topo.offsetHeight) -
        RESPIRO_DO_TOPO;
      // A última linha não precisa do respiro de baixo.
      setCabem(Math.max(0, Math.floor((livre + 2) / ALTURA_DO_HORARIO)));
    };
    medir();
    if (typeof ResizeObserver === 'undefined') return;
    const observador = new ResizeObserver(medir);
    observador.observe(grade);
    return () => observador.disconnect();
  }, [referencia]);

  return (
    <section
      aria-labelledby="hoje-agenda-titulo"
      className="vidro-no-relevo relative z-10 rounded-[26px] lg:rounded-[34px] p-3 sm:p-5 lg:px-6 flex flex-col lg:h-[calc(100dvh-244px)] lg:min-h-[580px]"
    >
      {/* Cabeçalho: o mês, as setas e o resumo de hoje */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-1 sm:px-0">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => setDeslocamento((d) => d - 1)}
            aria-label="Mês anterior"
            className="w-10 h-10 shrink-0 rounded-full bg-white/65 border border-white text-ink flex items-center justify-center hover:bg-white transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h2
            id="hoje-agenda-titulo"
            className="min-w-0 px-1 font-marca text-[18px] sm:text-[22px] lg:text-[28px] leading-none text-brand-deep whitespace-nowrap"
          >
            <span className="capitalize">{nomeDoMes}</span>{' '}
            <span className="text-ink-soft/55">{ano}</span>
          </h2>
          <button
            type="button"
            onClick={() => setDeslocamento((d) => d + 1)}
            aria-label="Próximo mês"
            className="w-10 h-10 shrink-0 rounded-full bg-white/65 border border-white text-ink flex items-center justify-center hover:bg-white transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          {!noMesAtual && (
            <button
              type="button"
              onClick={() => setDeslocamento(0)}
              className="ml-1 h-9 px-3.5 shrink-0 rounded-full bg-ink text-cream text-[13px] font-semibold hover:bg-black transition-colors"
            >
              Voltar a hoje
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-1 px-1">
          <span className="inline-flex items-center gap-2 h-10 px-4 shrink-0 rounded-full bg-white/70 border border-white text-[14px] text-ink-soft whitespace-nowrap">
            <CalendarDays className="w-4 h-4 text-brand-deep" aria-hidden />
            Hoje:
            <strong className="text-ink tabular-nums">
              {quantosHoje} {quantosHoje === 1 ? 'atendimento' : 'atendimentos'}
            </strong>
          </span>
          {proximo && (
            <button
              type="button"
              onClick={() => onAbrirAtendimento(proximo)}
              title={`${proximo.pacienteNome} · ${nomeDosProcedimentos(proximo)}`}
              className="inline-flex items-center gap-2 h-10 px-4 shrink-0 rounded-full bg-white/70 border border-white text-[14px] text-ink-soft whitespace-nowrap hover:bg-white transition-colors"
            >
              <Clock className="w-4 h-4 text-brand-deep" aria-hidden />
              Próximo:
              <strong className="text-ink tabular-nums">{quandoDoProximo(proximo)}</strong>
              <span className="text-ink">{nomeCurto(proximo.pacienteNome)}</span>
            </button>
          )}
          <button
            type="button"
            onClick={onAbrirAgenda}
            className="hidden sm:inline-flex items-center gap-2 h-10 px-4 shrink-0 rounded-full bg-ink text-cream text-[14px] font-semibold whitespace-nowrap hover:bg-black transition-colors"
          >
            Abrir agenda
            <ArrowRight className="w-4 h-4" aria-hidden />
          </button>
        </div>
      </div>

      {/* Dias da semana */}
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5 lg:gap-2 mt-4 mb-1.5 lg:mt-5" aria-hidden>
        {SEMANA.map((d, i) => (
          <span
            key={i}
            className="text-center text-[11px] sm:text-[12px] lg:text-[13px] font-bold uppercase tracking-[.16em] text-brand-deep/80"
          >
            <span className="sm:hidden">{SEMANA_CURTA[i]}</span>
            <span className="hidden sm:inline">{d}</span>
          </span>
        ))}
      </div>

      {/* A grade. No computador as semanas dividem a altura do painel; abaixo disso cada linha tem
          uma altura mínima e o painel cresce com ela. */}
      <div
        key={referencia}
        ref={gradeRef}
        role="group"
        aria-label={`Agenda de ${nomeDoMes} de ${ano}`}
        style={{ '--semanas': semanas } as React.CSSProperties}
        className="animate-fadeIn grid grid-cols-7 gap-1 sm:gap-1.5 lg:gap-2 auto-rows-[minmax(52px,auto)] sm:auto-rows-[minmax(104px,auto)] lg:flex-1 lg:min-h-0 lg:[grid-template-rows:repeat(var(--semanas),minmax(0,1fr))]"
      >
        {dias.map((dia, indice) => {
          const doMes = dia.slice(0, 7) === mesDaReferencia;
          const ehHoje = dia === hoje;
          const passou = dia < hoje;
          const fechado = !expedienteDoDia(clinic, dia);
          const lista = porDia.get(dia) || [];
          const total = lista.length;
          // Os que não cabem viram um "+N" na ponta da última linha (sem gastar uma linha só com ele).
          const mostrados = lista.slice(0, cabem);
          const resto = total - mostrados.length;

          const coluna = indice % 7;
          const linha = Math.floor(indice / 7);
          const horizontal =
            coluna <= 1 ? 'left-0' : coluna >= 5 ? 'right-0' : 'left-1/2 -translate-x-1/2';
          const vertical = linha >= semanas - 2 ? 'bottom-full pb-2' : 'top-full pt-2';

          const fundo = ehHoje
            ? 'bg-ink text-cream border-ink shadow-[0_18px_36px_-18px_rgba(26,26,26,.85)]'
            : !doMes
            ? 'bg-white/15 border-white/30 text-ink/35 hover:bg-white/50'
            : fechado
            ? 'bg-white/25 border-white/40 text-ink/50 hover:bg-white/70'
            : passou
            ? 'bg-white/40 border-white/60 text-ink/65 hover:bg-white/85'
            : 'bg-white/60 border-white/80 text-ink hover:bg-white/95';

          const rotuloDoDia = `${dataLonga(dia)}${ehHoje ? ', hoje' : ''}${
            total ? `, ${total} ${total === 1 ? 'atendimento' : 'atendimentos'}` : ', sem atendimento'
          }${fechado && doMes ? ', clínica fechada' : ''}`;

          return (
            <div
              key={dia}
              data-celula
              className={`dia-do-calendario group relative min-w-0 flex flex-col rounded-xl sm:rounded-2xl border p-1.5 sm:p-2 lg:p-2.5 transition-[background-color,box-shadow] duration-150 hover:z-20 focus-within:z-20 hover:shadow-[0_14px_30px_-18px_rgba(110,73,36,.55)] ${fundo}`}
            >
              {/* O dia inteiro é o botão que abre a agenda nele; os horários sobem por cima dele. */}
              <button
                type="button"
                onClick={() => onAbrirDia(dia)}
                aria-label={rotuloDoDia}
                className="absolute inset-0 rounded-[inherit] focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
              />

              <div data-topo className="flex items-start justify-between gap-1">
                <span
                  className={`font-serif-luxury font-semibold leading-none lining-nums tabular-nums text-[17px] sm:text-[21px] lg:text-[25px] ${
                    ehHoje
                      ? 'w-7 h-7 sm:w-8 sm:h-8 lg:w-9 lg:h-9 -m-0.5 rounded-full bg-brand-light text-ink flex items-center justify-center'
                      : ''
                  }`}
                >
                  {Number(dia.slice(8, 10))}
                </span>
                {total > 0 && (
                  <span
                    className={`hidden sm:inline-flex items-center h-6 px-2 rounded-full text-[12px] font-bold tabular-nums ${
                      ehHoje ? 'bg-white/15 text-brand-pale' : 'bg-brand/12 text-brand-deep'
                    }`}
                  >
                    {total}
                  </span>
                )}
              </div>

              {/* Celular: um ponto por horário, até três. */}
              {total > 0 && (
                <span className="sm:hidden mt-auto mx-auto flex gap-[3px] pb-0.5" aria-hidden>
                  {lista.slice(0, 3).map((a) => (
                    <span
                      key={a.id}
                      className={`w-[5px] h-[5px] rounded-full ${ehHoje ? 'bg-brand-light' : PONTO[situacaoDe(a).tom]}`}
                    />
                  ))}
                </span>
              )}

              {/* Do tablet em diante: os horários que cabem, cada um abrindo a agenda nele. */}
              {total > 0 && cabem > 0 && (
                <ul className="hidden sm:flex mt-1 flex-col gap-px min-h-0 overflow-hidden -mx-1">
                  {mostrados.map((a, i) => {
                    const { tom, rotulo } = situacaoDe(a);
                    const ultimo = i === mostrados.length - 1;
                    return (
                      <li key={a.id} className="min-w-0 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onAbrirAtendimento(a)}
                          aria-label={`${a.hora || 'Sem horário'} — ${a.pacienteNome}, ${nomeDosProcedimentos(a)} (${rotulo.toLowerCase()})`}
                          className={`relative z-10 min-w-0 flex-1 h-5 flex items-center gap-1.5 px-1 rounded-md text-[12.5px] lg:text-[13px] leading-none text-left transition-colors ${
                            ehHoje ? 'text-cream hover:bg-white/15' : 'text-ink hover:bg-white'
                          } ${tom === 'danger' ? 'line-through decoration-1 opacity-70' : ''} ${
                            passou && !ehHoje ? 'opacity-75' : ''
                          }`}
                        >
                          <span aria-hidden className={`w-1.5 h-1.5 rounded-full shrink-0 ${PONTO[tom]}`} />
                          {a.hora && <span className="font-bold tabular-nums shrink-0">{a.hora}</span>}
                          {/* Abaixo de 1280px a célula só tem lugar para a hora; o nome fica na prévia. */}
                          <span className="hidden xl:inline truncate">{nomeCurto(a.pacienteNome)}</span>
                        </button>
                        {ultimo && resto > 0 && (
                          <span
                            title={`Mais ${resto} ${resto === 1 ? 'horário' : 'horários'} neste dia`}
                            className={`shrink-0 pr-1 text-[12px] font-bold tabular-nums ${
                              ehHoje ? 'text-brand-pale' : 'text-brand-deep'
                            }`}
                          >
                            +{resto}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* A prévia do dia, ao parar o mouse. */}
              {total > 0 && (
                <div className={`previa-do-dia hidden sm:block absolute z-30 w-[320px] ${horizontal} ${vertical}`}>
                  <div className="rounded-2xl bg-[#FFFCF7] text-ink border border-white shadow-[0_26px_60px_-22px_rgba(60,40,20,.5),0_0_0_1px_rgba(110,73,36,.08)] overflow-hidden">
                    <div className="px-4 pt-3.5 pb-2.5 border-b border-ink/8 flex items-baseline justify-between gap-3">
                      <p className="text-[15px] font-bold first-letter:uppercase">{dataLonga(dia)}</p>
                      <span className="shrink-0 text-[13px] font-semibold text-brand-deep tabular-nums">
                        {total} {total === 1 ? 'horário' : 'horários'}
                      </span>
                    </div>
                    <ul className="max-h-[300px] overflow-y-auto overscroll-contain py-1">
                      {lista.map((a) => {
                        const { tom, rotulo } = situacaoDe(a);
                        return (
                          <li key={a.id}>
                            <button
                              type="button"
                              onClick={() => onAbrirAtendimento(a)}
                              className="w-full text-left px-4 py-2.5 flex gap-3 hover:bg-brand-bg/80 focus-visible:bg-brand-bg/80 focus-visible:outline-none transition-colors"
                            >
                              <span className="w-12 shrink-0 pt-px text-[15px] font-bold tabular-nums">
                                {a.hora || '—'}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span
                                  className={`block text-[15px] font-semibold truncate ${
                                    tom === 'danger' ? 'line-through decoration-1 text-ink-soft' : ''
                                  }`}
                                >
                                  {a.pacienteNome}
                                </span>
                                <span className="block text-[13px] text-ink-soft truncate">
                                  {nomeDosProcedimentos(a)}
                                </span>
                                <span className="mt-1 flex items-center gap-1.5 min-w-0">
                                  <span
                                    className={`shrink-0 inline-flex items-center h-5 px-1.5 rounded-md border text-[11px] font-bold uppercase tracking-wider ${SELO[tom]}`}
                                  >
                                    {rotulo}
                                  </span>
                                  {a.profissionalNome && (
                                    <span className="text-[12px] text-muted truncate">{a.profissionalNome}</span>
                                  )}
                                </span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    <button
                      type="button"
                      onClick={() => onAbrirDia(dia)}
                      className="w-full px-4 py-2.5 border-t border-ink/8 flex items-center justify-between text-[13px] font-semibold text-brand-deep hover:bg-brand-bg/70 transition-colors"
                    >
                      Abrir o dia na agenda
                      <ArrowRight className="w-4 h-4" aria-hidden />
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legenda das cores — só onde os horários aparecem por escrito. */}
      <ul className="hidden sm:flex flex-wrap items-center gap-x-4 gap-y-1 mt-2.5 px-1 text-[13px] leading-5 text-ink-soft">
        {LEGENDA.map(({ tom, rotulo }) => (
          <li key={tom} className="inline-flex items-center gap-1.5">
            <span aria-hidden className={`w-2 h-2 rounded-full ${PONTO[tom]}`} />
            {rotulo}
          </li>
        ))}
        <li className="hidden lg:inline ml-auto text-muted">Pare o mouse num dia para ver os horários</li>
      </ul>
    </section>
  );
};

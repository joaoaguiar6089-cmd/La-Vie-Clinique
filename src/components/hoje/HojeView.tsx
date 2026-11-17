import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  CalendarPlus,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  FilePlus2,
  NotebookPen,
  Plus,
  Receipt,
  Search,
  UserPlus,
} from 'lucide-react';
import {
  AnamnesisTemplate,
  AppView,
  Attendance,
  ClinicProfile,
  Patient,
  Procedure,
  Professional,
  Quote,
} from '../../types';
import { agoraHHMM, hojeISO } from '../../utils/attendances';
import { dataPorExtenso, saudacaoDaHora } from '../../utils/indicadores';
import { BotaoRedondo, GatilhoDeBusca, MenuDeAcoes } from '../common/Tinta';
import { AcaoDeCriacao } from '../BottomNav';
import { AgendaDoMes } from './AgendaDoMes';
import { LinhaDoTempoDaClinica } from './LinhaDoTempoDaClinica';
import { AlvoDoPasso } from '../linhaDoTempo/PainelDoEvento';
import { OrigemDaVisita } from '../../utils/passosDaJornada';

/**
 * A tela inicial — feita também para ficar aberta na recepção.
 *
 * O fundo é o mesmo relevo da tela de entrada, com as figuras de traço boiando. Por cima, em
 * vidro fosco e nesta ordem: o calendário do mês, grande, com os horários de cada dia (ver
 * `AgendaDoMes`); os atalhos para os documentos da paciente, numa linha só, na sequência em que o
 * atendimento acontece (orçamento, anamnese, avaliação, relatório); e a linha do tempo da clínica.
 *
 * Tudo sai das coleções que o `App` já assina — nenhuma leitura nova, a não ser a da linha do
 * tempo, que lê só anamneses e avaliações dos últimos 30 dias.
 */

interface HojeViewProps {
  clinic: ClinicProfile;
  catalogProcedures: Procedure[];
  atendimentos: Attendance[];
  pacientes: Patient[];
  quotes: Quote[];
  /** Fichas-modelo de anamnese — a ficha aberta pela linha do tempo resolve o termo por elas. */
  templatesAnamnese: AnamnesisTemplate[];
  professionalLogada?: Professional | null;
  carregando?: boolean;
  onAbrirBusca: () => void;
  onCriar: (acao: AcaoDeCriacao) => void;
  /** Sem data, o dia de hoje; com data, aquele dia. */
  onIrParaAgenda: (data?: string) => void;
  /** Abre uma seção — os atalhos da sequência do atendimento. */
  onIrPara: (view: AppView) => void;
  onAbrirPaciente: (pacienteId: string) => void;
  /** Os passos do painel da linha do tempo que abrem em outra tela — ver `LinhaDoTempoDaClinica`. */
  onAgendar: (alvo: AlvoDoPasso & { professionalId?: string }) => void;
  onRegistrarVisita: (origem: OrigemDaVisita) => void;
  /** Abre a agenda no dia do atendimento, já com ele aberto — o calendário e a linha do tempo usam. */
  onAbrirNaAgenda: (a: Attendance) => void;
  onNovaAnamnese: (alvo: AlvoDoPasso & { templateId?: string }) => void;
}

/** Os documentos da paciente na ordem em que o atendimento acontece. */
const SEQUENCIA: { view: AppView; titulo: string; sub: string; icone: React.ElementType }[] = [
  { view: 'quotes', titulo: 'Orçamento', sub: 'Preços e pagamentos', icone: Receipt },
  { view: 'anamnesis', titulo: 'Anamnese', sub: 'Histórico de saúde', icone: ClipboardList },
  { view: 'evaluations', titulo: 'Avaliação', sub: 'Antes do procedimento', icone: ClipboardCheck },
  { view: 'acompanhamento', titulo: 'Relatório', sub: 'Depois do atendimento', icone: NotebookPen },
];

/**
 * As figuras de traço do login (`public/login/figura-N.webp`), aqui nas bordas: o calendário cobre
 * o meio da tela, e o que passa por trás do vidro aparece borrado, como desenho na parede.
 */
const FIGURAS: { arquivo: number; classes: string; duracao: number; atraso: number }[] = [
  { arquivo: 1, classes: 'left-[-5%] bottom-[-8%] h-[64vh] hidden md:block', duracao: 19, atraso: 0 },
  { arquivo: 5, classes: 'right-[-3%] top-[2%] h-[44vh] hidden md:block', duracao: 23, atraso: -6 },
  { arquivo: 4, classes: 'right-[4%] bottom-[-10%] h-[52vh] hidden lg:block', duracao: 21, atraso: -11 },
  { arquivo: 3, classes: 'left-[44%] bottom-[-4%] h-[36vh] hidden xl:block', duracao: 25, atraso: -3 },
];

/**
 * O relógio da tela. Deixada aberta o dia inteiro, ela precisa trocar sozinha o "Bom dia" pelo
 * "Boa tarde", o próximo atendimento quando o horário passa e o dia à meia-noite. Acorda na virada
 * de cada minuto, não a cada segundo: nada aqui mostra segundos.
 */
const useMinutoAtual = (): void => {
  const [, setTique] = useState(0);
  useEffect(() => {
    let id: number;
    const agendar = () => {
      id = window.setTimeout(() => {
        setTique((t) => t + 1);
        agendar();
      }, 60_000 - (Date.now() % 60_000) + 50);
    };
    agendar();
    return () => window.clearTimeout(id);
  }, []);
};

export const HojeView: React.FC<HojeViewProps> = ({
  clinic,
  catalogProcedures,
  atendimentos,
  pacientes,
  quotes,
  templatesAnamnese,
  professionalLogada,
  carregando,
  onAbrirBusca,
  onCriar,
  onIrParaAgenda,
  onIrPara,
  onAbrirPaciente,
  onAgendar,
  onRegistrarVisita,
  onAbrirNaAgenda,
  onNovaAnamnese,
}) => {
  useMinutoAtual();
  const hoje = hojeISO();
  const agora = agoraHHMM();

  const primeiroNome = (professionalLogada?.name || '')
    .replace(/^(Dra?\.?|Dr\.?)\s+/i, '')
    .trim()
    .split(/\s+/)[0];

  const acoesDeCriar = [
    { rotulo: 'Novo agendamento', icone: CalendarPlus, onClick: () => onCriar('agendamento') },
    { rotulo: 'Nova paciente', icone: UserPlus, onClick: () => onCriar('paciente') },
    { rotulo: 'Novo orçamento', icone: FilePlus2, onClick: () => onCriar('orcamento') },
    { rotulo: 'Nova ficha de anamnese', icone: ClipboardList, onClick: () => onCriar('anamnese') },
    { rotulo: 'Nova avaliação', icone: ClipboardCheck, onClick: () => onCriar('avaliacao') },
    { rotulo: 'Novo relatório', icone: NotebookPen, onClick: () => onCriar('relatorio') },
  ];

  return (
    <div className="relative min-h-dvh">
      {/* O relevo do login, preso à tela enquanto o conteúdo rola por cima. É `sticky` (e não
          `fixed`, que passaria por cima do menu lateral), e o conteúdo sobe sobre ele com margem
          negativa; no fim da tela ele para junto com ela, sem cobrir o rodapé. */}
      <div
        aria-hidden="true"
        className="sticky top-0 h-dvh overflow-hidden pointer-events-none select-none"
      >
        <div
          className="absolute inset-0 bg-cream bg-cover bg-center"
          style={{ backgroundImage: 'url(/login-fundo.webp)' }}
        />
        {FIGURAS.map((f, i) => (
          <img
            key={i}
            src={`/login/figura-${f.arquivo}.webp`}
            alt=""
            className={`figura-flutuante absolute w-auto max-w-none ${f.classes}`}
            style={{ animationDuration: `${f.duracao}s`, animationDelay: `${f.atraso}s` }}
          />
        ))}
        <div className="absolute inset-0 bg-linear-to-b from-cream/15 via-transparent to-cream/45" />
      </div>

      <div className="relative -mt-[100dvh] max-w-[1680px] mx-auto px-4 sm:px-8 lg:px-10 pt-5 sm:pt-6 lg:pt-7 pb-10 lg:pb-14 flex flex-col gap-4 lg:gap-5">
        <header className="flex items-center justify-between gap-3">
          <div className="min-w-0 marca-em-relevo">
            <p className="text-[14px] lg:text-[16px] font-semibold text-ink-soft first-letter:uppercase">
              {dataPorExtenso(hoje)}
            </p>
            <h1 className="font-serif-luxury text-[34px] sm:text-[40px] lg:text-[48px] font-semibold leading-[1.05] text-ink break-words">
              {saudacaoDaHora()}
              {primeiroNome ? `, ${primeiroNome}` : ''}
            </h1>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <BotaoRedondo
              icone={Search}
              rotulo="Buscar paciente, procedimento ou orçamento"
              onClick={onAbrirBusca}
              className="sm:hidden"
            />
            <GatilhoDeBusca
              onClick={onAbrirBusca}
              texto="Buscar paciente, procedimento ou orçamento"
              className="hidden sm:flex w-[220px] md:w-[260px] lg:w-[380px]"
            />
            <span className="hidden sm:inline-flex">
              <MenuDeAcoes
                acoes={acoesDeCriar}
                rotulo="Criar agendamento, paciente, orçamento, anamnese, avaliação ou relatório"
                titulo="Criar"
                gatilho={{ texto: 'Criar', icone: Plus }}
              />
            </span>
          </div>
        </header>

        <AgendaDoMes
          atendimentos={atendimentos}
          clinic={clinic}
          hoje={hoje}
          agora={agora}
          onAbrirDia={(data) => onIrParaAgenda(data)}
          onAbrirAtendimento={onAbrirNaAgenda}
          onAbrirAgenda={() => onIrParaAgenda()}
        />

        {/* Os atalhos, numa linha, na ordem do atendimento — o número diz o passo. */}
        <nav aria-labelledby="hoje-atalhos">
          <h2 id="hoje-atalhos" className="sr-only">
            Atalhos, na ordem do atendimento
          </h2>
          <ol className="grid grid-cols-4 gap-2 sm:gap-3 lg:gap-4">
            {SEQUENCIA.map(({ view, titulo, sub, icone: Icone }, i) => (
              <li key={view} className="relative min-w-0">
                <button
                  type="button"
                  onClick={() => onIrPara(view)}
                  className="peca-no-relevo group w-full h-full rounded-[18px] sm:rounded-[22px] px-1 py-3 sm:p-3.5 lg:px-5 lg:py-3.5 flex flex-col lg:flex-row items-center gap-2 lg:gap-4 text-center lg:text-left"
                >
                  <span className="relative shrink-0 w-11 h-11 lg:w-[52px] lg:h-[52px] rounded-full bg-ink text-brand-pale flex items-center justify-center shadow-[0_8px_18px_-10px_rgba(26,26,26,.8)]">
                    <Icone className="w-5 h-5 lg:w-[22px] lg:h-[22px]" />
                    <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-brand-light text-ink text-[11px] font-bold flex items-center justify-center tabular-nums ring-2 ring-[#FFFCF6]">
                      {i + 1}
                    </span>
                  </span>
                  <span className="min-w-0 max-w-full lg:flex-1">
                    <span className="block text-[12px] min-[400px]:text-[13px] sm:text-[15px] lg:text-[17px] font-bold text-ink truncate">
                      {titulo}
                    </span>
                    <span className="hidden sm:block text-[13px] text-ink-soft truncate">{sub}</span>
                  </span>
                  <ArrowRight
                    aria-hidden
                    className="hidden lg:block w-[18px] h-[18px] shrink-0 text-brand-deep opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition"
                  />
                </button>
                {/* A emenda entre um passo e o seguinte. */}
                {i < SEQUENCIA.length - 1 && (
                  <span
                    aria-hidden
                    className="hidden sm:flex absolute top-1/2 -translate-y-1/2 -right-[18px] lg:-right-[20px] z-10 w-6 h-6 rounded-full bg-[#FFFCF6] border border-white text-brand-deep items-center justify-center shadow-[0_2px_6px_rgba(110,73,36,.25)]"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>

        <LinhaDoTempoDaClinica
          clinic={clinic}
          catalogProcedures={catalogProcedures}
          atendimentos={atendimentos}
          pacientes={pacientes}
          quotes={quotes}
          templatesAnamnese={templatesAnamnese}
          carregando={carregando}
          professionalLogadaId={professionalLogada?.id}
          onAbrirPaciente={onAbrirPaciente}
          onAgendar={onAgendar}
          onRegistrarVisita={onRegistrarVisita}
          onAbrirNaAgenda={onAbrirNaAgenda}
          onNovaAnamnese={onNovaAnamnese}
        />
      </div>
    </div>
  );
};

import React, { useMemo, useState } from 'react';
import {
  CalendarPlus,
  ChevronLeft,
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
import { hojeISO } from '../../utils/attendances';
import {
  diasComAtendimento,
  diasDoMesDe,
  deslocarMeses,
  expedienteDoDia,
} from '../../utils/agenda';
import { dataPorExtenso, saudacaoDaHora } from '../../utils/indicadores';
import { BotaoRedondo, GatilhoDeBusca, MenuDeAcoes, TituloDaTela } from '../common/Tinta';
import { AcaoDeCriacao } from '../BottomNav';
import { LinhaDoTempoDaClinica } from './LinhaDoTempoDaClinica';

/**
 * A tela inicial.
 *
 * Três coisas, nesta ordem: os atalhos para os documentos da paciente, na sequência em que o
 * atendimento acontece (orçamento, anamnese, avaliação, acompanhamento); o calendário do mês, com
 * um ponto em cada dia que tem atendimento — tocar num dia abre a agenda nele —; e a linha do
 * tempo da clínica, para consulta.
 *
 * Os números do mês e a lista de pendências saíram daqui: o faturamento mora no Financeiro, e o
 * que está parado (orçamento por enviar, agendamento sem desfecho) aparece na própria tela onde
 * se resolve.
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
}

/** Os documentos da paciente na ordem em que o atendimento acontece. */
const SEQUENCIA: { view: AppView; titulo: string; sub: string; icone: React.ElementType }[] = [
  { view: 'quotes', titulo: 'Orçamento', sub: 'Preços e pagamentos', icone: Receipt },
  { view: 'anamnesis', titulo: 'Anamnese', sub: 'Histórico de saúde', icone: ClipboardList },
  { view: 'evaluations', titulo: 'Avaliação', sub: 'Antes do procedimento', icone: ClipboardCheck },
  { view: 'acompanhamento', titulo: 'Acompanhamento', sub: 'Depois do atendimento', icone: NotebookPen },
];

const DIAS_DA_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

// ==========================================
// CALENDÁRIO DO MÊS
// ==========================================

/**
 * O mês da agenda, só com o que responde "tem gente marcada?": um ponto em cada dia com
 * atendimento. O detalhe (quem, que horas) está a um toque — o dia abre a agenda nele.
 */
const CalendarioDoMes: React.FC<{
  atendimentos: Attendance[];
  clinic: ClinicProfile;
  hoje: string;
  onEscolherDia: (data: string) => void;
  onAbrir: () => void;
}> = ({ atendimentos, clinic, hoje, onEscolherDia, onAbrir }) => {
  /** Um dia qualquer do mês mostrado — o primeiro, para as setas nunca pularem mês. */
  const [referencia, setReferencia] = useState(`${hoje.slice(0, 7)}-01`);

  const dias = useMemo(() => diasDoMesDe(referencia), [referencia]);
  const comAtendimento = useMemo(() => diasComAtendimento(atendimentos), [atendimentos]);
  const mesDaReferencia = referencia.slice(0, 7);

  // "Setembro"; o ano só entra quando não é o deste ano.
  const mesPorExtenso = new Date(`${referencia}T12:00:00`).toLocaleDateString('pt-BR', { month: 'long' });
  const nomeDoMes =
    referencia.slice(0, 4) === hoje.slice(0, 4) ? mesPorExtenso : `${mesPorExtenso} de ${referencia.slice(0, 4)}`;
  const noMesAtual = mesDaReferencia === hoje.slice(0, 7);

  return (
    <section className="rounded-[24px] bg-card border border-ink/8 p-5 lg:p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-sans text-[18px] font-bold text-ink">Agenda</h2>
        <button
          type="button"
          onClick={onAbrir}
          className="text-[14px] font-semibold text-brand-hover hover:text-ink transition-colors"
        >
          Abrir →
        </button>
      </div>

      <div className="flex items-center justify-between gap-2 -my-1">
        <button
          type="button"
          onClick={() => setReferencia((r) => deslocarMeses(r, -1))}
          aria-label="Mês anterior"
          className="w-10 h-10 rounded-full flex items-center justify-center text-ink hover:bg-line-soft transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={() => setReferencia(`${hoje.slice(0, 7)}-01`)}
          disabled={noMesAtual}
          title={noMesAtual ? undefined : 'Voltar para este mês'}
          className="text-[15px] font-bold text-ink first-letter:uppercase disabled:cursor-default"
        >
          {nomeDoMes}
        </button>
        <button
          type="button"
          onClick={() => setReferencia((r) => deslocarMeses(r, 1))}
          aria-label="Próximo mês"
          className="w-10 h-10 rounded-full flex items-center justify-center text-ink hover:bg-line-soft transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-1 text-center" role="grid" aria-label={`Agenda de ${nomeDoMes}`}>
        {DIAS_DA_SEMANA.map((d, i) => (
          <span key={i} className="text-[12px] font-semibold text-muted pb-1" aria-hidden>
            {d}
          </span>
        ))}
        {dias.map((dia) => {
          const doMes = dia.slice(0, 7) === mesDaReferencia;
          const ehHoje = dia === hoje;
          const temAtendimento = comAtendimento.has(dia);
          const fechado = !expedienteDoDia(clinic, dia);
          return (
            <button
              key={dia}
              type="button"
              onClick={() => onEscolherDia(dia)}
              aria-label={`${new Date(`${dia}T12:00:00`).toLocaleDateString('pt-BR', {
                day: 'numeric',
                month: 'long',
              })}${ehHoje ? ', hoje' : ''}${temAtendimento ? ', com atendimento' : ''}`}
              className={`mx-auto w-full max-w-11 aspect-square rounded-full flex flex-col items-center justify-center gap-0.5 transition-colors ${
                ehHoje
                  ? 'bg-ink text-white'
                  : doMes
                  ? fechado
                    ? 'text-muted hover:bg-line-soft'
                    : 'text-ink hover:bg-line-soft'
                  : 'text-[#BDB7AD] hover:bg-line-soft'
              }`}
            >
              <span className={`text-[14px] tabular-nums leading-none ${ehHoje || temAtendimento ? 'font-bold' : 'font-medium'}`}>
                {Number(dia.slice(8, 10))}
              </span>
              {/* O ponto fica no lugar mesmo sem atendimento, para os números não pularem. */}
              <span
                aria-hidden
                className={`w-[5px] h-[5px] rounded-full ${
                  temAtendimento ? (ehHoje ? 'bg-brand-light' : doMes ? 'bg-brand' : 'bg-brand/40') : 'bg-transparent'
                }`}
              />
            </button>
          );
        })}
      </div>

      <p className="flex items-center gap-2 text-[13px] text-ink-soft">
        <span aria-hidden className="w-[5px] h-[5px] rounded-full bg-brand" />
        Dia com atendimento · toque para abrir a agenda nele
      </p>
    </section>
  );
};

// ==========================================
// A TELA
// ==========================================

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
}) => {
  const hoje = hojeISO();

  const primeiroNome = (professionalLogada?.name || '')
    .replace(/^(Dra?\.?|Dr\.?)\s+/i, '')
    .trim()
    .split(/\s+/)[0];

  const acoesDeCriar = [
    { rotulo: 'Novo agendamento', icone: CalendarPlus, onClick: () => onCriar('agendamento') },
    { rotulo: 'Nova paciente', icone: UserPlus, onClick: () => onCriar('paciente') },
    { rotulo: 'Novo orçamento', icone: FilePlus2, onClick: () => onCriar('orcamento') },
    { rotulo: 'Nova ficha de anamnese', icone: ClipboardList, onClick: () => onCriar('anamnese') },
  ];

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 lg:px-10 pt-6 lg:pt-7 pb-6 flex flex-col gap-[18px] lg:gap-6">
      <TituloDaTela
        sobre={dataPorExtenso(hoje)}
        titulo={`${saudacaoDaHora()}${primeiroNome ? `, ${primeiroNome}` : ''}`}
        acao={
          <>
            <BotaoRedondo
              icone={Search}
              rotulo="Buscar paciente, procedimento ou orçamento"
              onClick={onAbrirBusca}
              className="sm:hidden"
            />
            <GatilhoDeBusca
              onClick={onAbrirBusca}
              texto="Buscar paciente, procedimento ou orçamento"
              className="hidden sm:flex w-[260px] lg:w-[380px]"
            />
            <span className="hidden sm:inline-flex">
              <MenuDeAcoes
                acoes={acoesDeCriar}
                rotulo="Criar agendamento, paciente, orçamento ou anamnese"
                titulo="Criar"
                gatilho={{ texto: 'Criar', icone: Plus }}
              />
            </span>
          </>
        }
      />

      <div className="flex flex-col gap-[18px] lg:grid lg:grid-cols-[1.6fr_1fr] lg:gap-5 lg:items-start">
        {/* Os atalhos, na ordem do atendimento — o número diz o passo. */}
        <section aria-labelledby="hoje-atalhos" className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="hoje-atalhos" className="font-sans text-[18px] font-bold text-ink">
              Atalhos
            </h2>
            <span className="text-[13px] font-medium text-ink-soft">na ordem do atendimento</span>
          </div>
          <ol className="grid grid-cols-2 gap-2.5 lg:gap-3">
            {SEQUENCIA.map(({ view, titulo, sub, icone: Icone }, i) => (
              <li key={view}>
                <button
                  type="button"
                  onClick={() => onIrPara(view)}
                  className="w-full h-full rounded-[20px] bg-card border border-ink/8 p-3.5 min-[400px]:p-4 lg:p-5 flex flex-col gap-3 lg:gap-6 text-left hover:border-ink/30 transition-colors group"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="w-10 h-10 lg:w-11 lg:h-11 rounded-full bg-ink text-brand-pale flex items-center justify-center shrink-0">
                      <Icone className="w-5 h-5" />
                    </span>
                    <span className="text-[13px] font-bold text-ink-soft tabular-nums">{i + 1}</span>
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[15px] min-[400px]:text-[16px] font-bold text-ink break-words group-hover:underline underline-offset-2">
                      {titulo}
                    </span>
                    <span className="block text-[13px] text-ink-soft">{sub}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>

        <CalendarioDoMes
          atendimentos={atendimentos}
          clinic={clinic}
          hoje={hoje}
          onEscolherDia={(data) => onIrParaAgenda(data)}
          onAbrir={() => onIrParaAgenda()}
        />
      </div>

      <LinhaDoTempoDaClinica
        clinic={clinic}
        catalogProcedures={catalogProcedures}
        atendimentos={atendimentos}
        pacientes={pacientes}
        quotes={quotes}
        templatesAnamnese={templatesAnamnese}
        carregando={carregando}
        onAbrirPaciente={onAbrirPaciente}
      />
    </div>
  );
};

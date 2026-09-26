import React from 'react';
import { CalendarPlus, ChevronLeft, ChevronRight } from 'lucide-react';
import { AgendaVisao, rotuloDoPeriodo } from '../../utils/agenda';
import { DataISO, hojeISO } from '../../utils/attendances';
import { Segmentado } from '../common/Tinta';

/**
 * O cabeçalho preto da agenda: o mês em letra grande, a troca de vista (dia, semana, mês), a
 * navegação de período e — no celular, na vista de dia — a faixa da semana logo abaixo.
 *
 * É o "bloco preto para o número-chave" do redesign aplicado à agenda: o que se procura primeiro
 * aqui é **quando**, e o quando fica no bloco de maior contraste da tela. No celular ele encosta
 * nas bordas; do tablet para cima vira um cartão.
 */

const VISOES: { id: AgendaVisao; rotulo: string }[] = [
  { id: 'dia', rotulo: 'Dia' },
  { id: 'semana', rotulo: 'Semana' },
  { id: 'mes', rotulo: 'Mês' },
];

/* O filtro de profissional mora fora daqui, em chips (`AgendaFiltros`): num `select`, a agenda
   filtrada parece uma agenda vazia, e já aconteceu de alguém marcar em cima de um horário que o
   filtro estava escondendo. */
interface AgendaToolbarProps {
  visao: AgendaVisao;
  onTrocarVisao: (v: AgendaVisao) => void;
  dataFoco: DataISO;
  onAnterior: () => void;
  onProximo: () => void;
  onHoje: () => void;
  onNovo: () => void;
  /** A faixa da semana — só no celular, na vista de dia. */
  semana?: React.ReactNode;
}

/** "Setembro" — e "Setembro de 2027" quando o mês em foco é de outro ano. */
const tituloDoMes = (data: DataISO): string => {
  const d = new Date(`${data}T12:00:00`);
  const mes = d.toLocaleDateString('pt-BR', { month: 'long' });
  const ano = d.getFullYear();
  return ano === Number(hojeISO().slice(0, 4)) ? mes : `${mes} de ${ano}`;
};

const BotaoDeSeta: React.FC<{ rotulo: string; onClick: () => void; children: React.ReactNode }> = ({
  rotulo,
  onClick,
  children,
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={rotulo}
    title={rotulo}
    className="w-10 h-10 rounded-full flex items-center justify-center text-cream hover:bg-cream/10 transition-colors"
  >
    {children}
  </button>
);

export const AgendaToolbar: React.FC<AgendaToolbarProps> = ({
  visao,
  onTrocarVisao,
  dataFoco,
  onAnterior,
  onProximo,
  onHoje,
  onNovo,
  semana,
}) => (
  <header className="bg-ink text-cream px-5 pt-5 pb-5 sm:rounded-[24px] sm:p-6 flex flex-col gap-4">
    <div className="flex items-center justify-between gap-3">
      <h1 className="font-serif-luxury text-[34px] lg:text-[40px] font-semibold leading-[1.1] text-white first-letter:uppercase truncate">
        {tituloDoMes(dataFoco)}
      </h1>
      <Segmentado
        tom="escuro"
        rotulo="Vista da agenda"
        opcoes={VISOES}
        valor={visao}
        onMudar={onTrocarVisao}
        className="shrink-0"
      />
    </div>

    <div className="flex items-center justify-between gap-2 -my-1">
      <p className="min-w-0 text-[13px] font-medium text-cream/75 first-letter:uppercase truncate">
        {rotuloDoPeriodo(visao, dataFoco)}
      </p>
      <div className="flex items-center gap-0.5 shrink-0 -mr-2 sm:mr-0">
        <BotaoDeSeta rotulo="Período anterior" onClick={onAnterior}>
          <ChevronLeft className="w-5 h-5" />
        </BotaoDeSeta>
        <button
          type="button"
          onClick={onHoje}
          className="h-9 px-3 rounded-full border border-cream/25 text-[13px] font-semibold text-cream hover:border-cream/50 transition-colors"
        >
          Hoje
        </button>
        <BotaoDeSeta rotulo="Próximo período" onClick={onProximo}>
          <ChevronRight className="w-5 h-5" />
        </BotaoDeSeta>
        {/* No celular o "+" da barra de baixo e os horários livres já criam; aqui é o desktop. */}
        <button
          type="button"
          onClick={onNovo}
          className="hidden sm:inline-flex items-center gap-2 h-10 ml-2 px-4 rounded-full bg-brand-light text-ink text-[14px] font-semibold hover:brightness-105 active:scale-[.97] transition"
        >
          <CalendarPlus className="w-[18px] h-[18px]" />
          Agendar
        </button>
      </div>
    </div>

    {semana}
  </header>
);

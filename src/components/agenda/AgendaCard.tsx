import React from 'react';
import { AlertTriangle, Check, Clock, X } from 'lucide-react';
import { Attendance, Procedure, Professional } from '../../types';
import {
  corDaProfissional,
  duracaoDoAtendimento,
  hhmmDeMinutos,
  minutosDoHHMM,
  nomeCurtoDaProfissional,
} from '../../utils/agenda';
import { ehPendenteAtrasado } from '../../utils/attendances';

/**
 * O cartão de uma visita na agenda.
 *
 * Duas informações disputam o mesmo espaço e foram separadas de propósito: **o status pinta o
 * cartão** (é o que a recepção precisa varrer de longe) e **a profissional é só a tarja de 3px à
 * esquerda**. Misturar as duas no preenchimento tornaria impossível ler qualquer uma das duas.
 */

export type SituacaoDoCartao =
  | 'agendado'
  | 'atrasado'
  | 'compareceu'
  | 'faltou'
  | 'realizado';

export const situacaoDoCartao = (a: Attendance): SituacaoDoCartao => {
  if (ehPendenteAtrasado(a)) return 'atrasado';
  if (a.status === 'agendado') return 'agendado';
  if (a.status === 'compareceu') return 'compareceu';
  if (a.status === 'faltou') return 'faltou';
  return 'realizado';
};

const ESTILO: Record<SituacaoDoCartao, string> = {
  agendado: 'bg-white border-brand/45 text-ink hover:border-brand',
  atrasado: 'bg-amber-50 border-amber-300 text-amber-900 hover:border-amber-400',
  compareceu: 'bg-emerald-50/80 border-emerald-200/80 text-emerald-900 hover:border-emerald-300',
  faltou: 'bg-red-50/60 border-red-200/70 text-red-800/75 hover:border-red-300',
  realizado: 'bg-surface-2 border-line text-ink hover:border-brand/40',
};

interface AgendaCardProps {
  atendimento: Attendance;
  catalogo: Procedure[];
  professionals: Professional[];
  /** "3ª de 10", quando a visita pertence a um plano. */
  rotuloDoPlano?: string;
  /** Uma linha só. Usado onde não há altura para medir: faixa "sem horário" e célula do mês. */
  denso?: boolean;
  /**
   * Altura reservada na grade. O cartão decide o que cabe a partir dela, em vez de escrever sempre
   * as quatro linhas e deixar o excesso ser cortado no meio de um nome.
   */
  alturaPx?: number;
  /** Posição absoluta calculada pela grade. */
  style?: React.CSSProperties;
  onAbrir: (a: Attendance) => void;
  /** Só agendamento é arrastável — remarcar o que já aconteceu não quer dizer nada. */
  arrastavel?: boolean;
  onArrastarInicio?: (a: Attendance) => void;
  onArrastarFim?: () => void;
}

export const AgendaCard: React.FC<AgendaCardProps> = ({
  atendimento,
  catalogo,
  professionals,
  rotuloDoPlano,
  denso,
  alturaPx,
  style,
  onAbrir,
  arrastavel,
  onArrastarInicio,
  onArrastarFim,
}) => {
  const situacao = situacaoDoCartao(atendimento);
  const inicioMin = minutosDoHHMM(atendimento.hora);
  const duracao = duracaoDoAtendimento(atendimento, catalogo);
  /**
   * O cartão mostra **só a hora de início**. O fim está dito pela altura — é para isso que a grade
   * é proporcional — e escrever a faixa inteira fazia o texto quebrar em duas linhas numa coluna de
   * semana, comendo justamente a linha do nome da paciente. A faixa completa aparece no title e no
   * modal de detalhe, onde há espaço.
   */
  const faixa =
    inicioMin === null
      ? 'Sem horário'
      : `${atendimento.hora}–${hhmmDeMinutos(inicioMin + duracao)}`;
  const profissional = nomeCurtoDaProfissional(atendimento.professionalId, professionals);

  // Duas linhas não cabem abaixo de ~38px; a quarta (a profissional) precisa de ~76px.
  const apertado = denso ?? (alturaPx !== undefined && alturaPx < 38);
  const cabeProfissional = alturaPx === undefined ? !denso : alturaPx >= 76;

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={!!arrastavel}
      onDragStart={(e) => {
        // O dado precisa existir para o Firefox aceitar o arrasto; quem lê é o estado do módulo.
        e.dataTransfer.setData('text/plain', atendimento.id);
        e.dataTransfer.effectAllowed = 'move';
        if (onArrastarInicio) onArrastarInicio(atendimento);
      }}
      onDragEnd={onArrastarFim}
      // Sem isto, o clique atravessa o cartão e a coluna abre um agendamento novo por baixo dele.
      onClick={(e) => {
        e.stopPropagation();
        onAbrir(atendimento);
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        e.stopPropagation();
        onAbrir(atendimento);
      }}
      style={style}
      title={`${faixa} · ${atendimento.pacienteNome} · ${atendimento.procedimentoNome}`}
      className={`group relative overflow-hidden rounded-sm border text-left transition-colors cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-brand/50 ${
        ESTILO[situacao]
      } ${arrastavel ? 'active:cursor-grabbing' : ''} ${apertado ? 'px-1.5 py-0.5' : 'px-2 py-1'}`}
    >
      {/* A tarja da profissional. Cinza quando ninguém foi atribuído — a ausência também informa. */}
      <span
        aria-hidden
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ backgroundColor: corDaProfissional(atendimento.professionalId) }}
      />

      <div className={apertado ? 'pl-1.5 flex items-center gap-1.5 min-w-0' : 'pl-1.5'}>
        <span
          className={`shrink-0 tabular-nums font-semibold ${
            apertado ? 'text-label' : 'text-label block'
          } ${situacao === 'faltou' ? 'line-through' : ''}`}
        >
          {atendimento.hora || '—'}
        </span>

        <span
          className={`font-medium truncate ${apertado ? 'text-body min-w-0' : 'text-xs block'} ${
            situacao === 'faltou' ? 'line-through' : ''
          }`}
        >
          {atendimento.pacienteNome}
        </span>

        {!apertado && (
          <span className="text-body opacity-70 truncate block">
            {atendimento.procedimentoNome}
            {rotuloDoPlano ? ` · ${rotuloDoPlano}` : ''}
          </span>
        )}

        {cabeProfissional && profissional && (
          <span className="text-label opacity-55 truncate block">{profissional}</span>
        )}
      </div>

      {/* Selo de situação — o que o preenchimento já diz, dito também em símbolo, para quem não
          distingue as cores e para quando o cartão é pequeno demais para o texto. */}
      {situacao !== 'agendado' && situacao !== 'realizado' && (
        <span className="absolute top-0.5 right-0.5 opacity-70">
          {situacao === 'compareceu' ? (
            <Check className="w-3 h-3" />
          ) : situacao === 'faltou' ? (
            <X className="w-3 h-3" />
          ) : (
            <AlertTriangle className="w-3 h-3" />
          )}
        </span>
      )}

      {situacao === 'agendado' && !apertado && (
        <Clock className="absolute top-1 right-1 w-3 h-3 opacity-25" />
      )}
    </div>
  );
};

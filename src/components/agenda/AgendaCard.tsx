import React from 'react';
import { AlertTriangle, Check, CheckCheck, Clock, X } from 'lucide-react';
import { Attendance, Procedure, Professional } from '../../types';
import {
  corDaProfissional,
  duracaoDoAtendimento,
  ehConfirmado,
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
  | 'confirmado'
  | 'atrasado'
  | 'compareceu'
  | 'faltou'
  | 'realizado';

/**
 * `atrasado` vence `confirmado`: um agendamento que a paciente confirmou e cuja data já passou
 * sem desfecho continua sendo trabalho represado da recepção, e pintá-lo de verde o esconderia
 * justamente da fila que existe para pegá-lo.
 */
export const situacaoDoCartao = (a: Attendance): SituacaoDoCartao => {
  if (ehPendenteAtrasado(a)) return 'atrasado';
  if (a.status === 'agendado') return ehConfirmado(a) ? 'confirmado' : 'agendado';
  if (a.status === 'compareceu') return 'compareceu';
  if (a.status === 'faltou') return 'faltou';
  return 'realizado';
};

/** O que a recepção varre de longe: bronze = a confirmar, verde = confirmado. */
export const ESTILO_DA_SITUACAO: Record<SituacaoDoCartao, string> = {
  agendado: 'bg-card border-brand/45 text-ink hover:border-brand',
  confirmado: 'bg-ok-bg border-ok-line text-ok hover:border-ok',
  atrasado: 'bg-warn-bg border-warn-line text-warn hover:border-warn',
  compareceu: 'bg-ok-bg/60 border-ok-line/70 text-ok hover:border-ok-line',
  faltou: 'bg-danger-bg/70 border-danger-line text-danger hover:border-danger',
  realizado: 'bg-surface-2 border-line text-ink hover:border-brand/40',
};

export const ROTULO_DA_SITUACAO: Record<SituacaoDoCartao, string> = {
  agendado: 'A confirmar',
  confirmado: 'Confirmado',
  atrasado: 'Sem desfecho',
  compareceu: 'Compareceu',
  faltou: 'Faltou',
  realizado: 'Realizado',
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
        ESTILO_DA_SITUACAO[situacao]
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
        <span className="absolute top-0.5 right-0.5 opacity-70" title={ROTULO_DA_SITUACAO[situacao]}>
          {situacao === 'confirmado' ? (
            <CheckCheck className="w-3 h-3" />
          ) : situacao === 'compareceu' ? (
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

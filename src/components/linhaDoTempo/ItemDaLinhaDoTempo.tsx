import React from 'react';
import { CalendarCheck, ChevronRight, ClipboardCheck, ClipboardList, Receipt, UserRound } from 'lucide-react';
import { ItemDaLinha } from '../../utils/pacienteResumo';
import { formatBRL, formatDateOnly } from '../../utils/formatters';
import { ROTULO_DO_STATUS } from '../../utils/attendances';
import { QuoteDesfecho } from '../quotes/QuoteDesfecho';

const ICONE_DO_TIPO = {
  atendimento: CalendarCheck,
  anamnese: ClipboardList,
  avaliacao: ClipboardCheck,
  orcamento: Receipt,
} as const;

const ROTULO_DO_TIPO = {
  atendimento: 'Atendimento',
  anamnese: 'Anamnese',
  avaliacao: 'Avaliação',
  orcamento: 'Orçamento',
} as const;

interface ItemDaLinhaDoTempoProps {
  item: ItemDaLinha;
  /**
   * Na linha da clínica, cada item diz de quem é — e o botão da pessoa abre a ficha da paciente.
   * Na página da paciente, repetir o nome dela em toda linha seria ruído.
   */
  onAbrirPaciente?: (pacienteId: string) => void;
  /** Mostrar a data no item (a página da paciente) ou só a hora (a tela Hoje, agrupada por dia). */
  mostrarData?: boolean;
  /** O toque na linha: abre o painel do evento. */
  onAbrir: (item: ItemDaLinha) => void;
}

/**
 * Um item da linha do tempo. A linha inteira é o botão que abre o painel do evento — o documento,
 * o passo seguinte da jornada e os próximos agendamentos (ver `PainelDoEvento`).
 *
 * Os atalhos que ficavam à direita saíram: com o painel, seriam um segundo caminho para as mesmas
 * ações, e é o caminho único que ensina a ordem do atendimento.
 *
 * O mesmo componente serve à linha da clínica (tela Hoje) e à da paciente (aba Resumo): as duas
 * são a mesma coisa em recortes diferentes, e com dois desenhos a equipe teria que aprender dois.
 *
 * A ficha da paciente abre pelo botão com a pessoa, e não pelo nome: com a linha toda clicável, o
 * nome não pode levar a outro lugar.
 */
export const ItemDaLinhaDoTempo: React.FC<ItemDaLinhaDoTempoProps> = ({
  item,
  onAbrirPaciente,
  mostrarData,
  onAbrir,
}) => {
  const Icone = ICONE_DO_TIPO[item.tipo];

  const hora = item.tipo === 'atendimento' ? item.ref.hora : undefined;
  const pacienteId = item.ref.pacienteId;
  const faltou = item.tipo === 'atendimento' && item.ref.status === 'faltou';

  const detalhe =
    item.tipo === 'orcamento'
      ? `${formatBRL(item.ref.total)} · ${item.ref.itens.length} procedimento${
          item.ref.itens.length === 1 ? '' : 's'
        }`
      : item.profissional;

  return (
    <li className="relative pl-6">
      <span
        aria-hidden
        className="absolute -left-[9px] top-4 w-[18px] h-[18px] rounded-full bg-card border border-line flex items-center justify-center"
      >
        <Icone className="w-2.5 h-2.5 text-brand" />
      </span>

      {/* A linha inteira abre o painel: o botão do título se estica por cima dela (`after:inset-0`),
          e o botão da pessoa e o desfecho do orçamento sobem acima dele (`relative z-10`) para
          continuarem tocáveis — botão dentro de botão não existe em HTML. */}
      <div className="group relative flex items-start gap-2 py-2.5 pl-3 pr-1 rounded-lg hover:bg-surface-2 transition-colors">
        <div className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            {(mostrarData || hora) && (
              <span className="text-body font-semibold text-brand tabular-nums shrink-0">
                {mostrarData ? formatDateOnly(item.data) : hora}
              </span>
            )}
            <span className="text-label uppercase tracking-wider text-muted">
              {ROTULO_DO_TIPO[item.tipo]}
            </span>
            {faltou && (
              <span className="px-1.5 py-0.5 rounded-xs bg-danger-bg text-danger border border-danger-line text-label font-semibold uppercase tracking-wider">
                {ROTULO_DO_STATUS.faltou}
              </span>
            )}
          </span>

          {onAbrirPaciente && (
            <span className="block text-body-lg font-medium text-ink truncate">
              {item.ref.pacienteNome}
            </span>
          )}

          <button
            type="button"
            onClick={() => onAbrir(item)}
            aria-label={`Abrir ${ROTULO_DO_TIPO[item.tipo].toLowerCase()}: ${item.titulo}${
              onAbrirPaciente ? ` — ${item.ref.pacienteNome}` : ''
            }`}
            className={`block max-w-full text-left truncate group-hover:text-brand transition-colors after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-brand ${
              onAbrirPaciente ? 'text-body text-ink-soft' : 'text-body-lg text-ink'
            }`}
          >
            {item.titulo}
          </button>

          {detalhe && <span className="block text-body text-muted truncate">{detalhe}</span>}

          {/* Pagou / recusou / comprovante — o mesmo controle da tela de Orçamentos. */}
          {item.tipo === 'orcamento' && (
            <div className="relative z-10 mt-1.5 w-fit">
              <QuoteDesfecho quote={item.ref} />
            </div>
          )}
        </div>

        {onAbrirPaciente && pacienteId ? (
          <button
            type="button"
            onClick={() => onAbrirPaciente(pacienteId)}
            title="Abrir paciente"
            aria-label={`Abrir a página de ${item.ref.pacienteNome}`}
            className="relative z-10 inline-flex w-10 h-10 shrink-0 self-center items-center justify-center rounded-lg text-ink-soft hover:text-brand hover:bg-card transition-colors"
          >
            <UserRound className="w-[18px] h-[18px]" />
          </button>
        ) : (
          <ChevronRight aria-hidden className="w-[18px] h-[18px] text-muted shrink-0 self-center" />
        )}
      </div>
    </li>
  );
};

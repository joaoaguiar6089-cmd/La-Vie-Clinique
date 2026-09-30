import React, { useState } from 'react';
import { CalendarClock, Check, ChevronDown, Inbox, Trash2, UserX, X } from 'lucide-react';
import { Attendance } from '../../types';
import { dataCurta } from '../../utils/agenda';
import { instanteCurto } from '../../utils/agendamentoLink';

/**
 * O que as clientes responderam pelo link e ainda espera uma decisão da equipe.
 *
 * Confirmações não aparecem aqui: não pedem nada, e o cartão verde da agenda já as mostra. Ficam
 * os dois casos em que alguém precisa agir — o **pedido de outro horário** (aprovar ou recusar) e o
 * **aviso de que não vai** (remarcar ou excluir; "Faltou" não é oferecido, porque ela avisou).
 *
 * A faixa some sozinha quando não há nada, como as outras da agenda: um selo aceso sem trabalho
 * atrás treina a equipe a ignorá-lo.
 */

interface AgendaRespostasClientesProps {
  respostas: Attendance[];
  onAbrir: (a: Attendance) => void;
  onAprovar: (a: Attendance) => void;
  onRecusar: (a: Attendance) => void;
  onRemarcar: (a: Attendance) => void;
  onExcluir: (a: Attendance) => void;
}

const botao =
  'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-sm text-body font-semibold transition-colors';

export const AgendaRespostasClientes: React.FC<AgendaRespostasClientesProps> = ({
  respostas,
  onAbrir,
  onAprovar,
  onRecusar,
  onRemarcar,
  onExcluir,
}) => {
  const [aberto, setAberto] = useState(true);
  if (respostas.length === 0) return null;

  return (
    <div className="rounded-[14px] border border-brand/40 bg-brand-bg overflow-hidden">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="w-full px-4 py-3 flex items-center gap-2.5 text-left hover:bg-brand/5 transition-colors"
      >
        <Inbox className="w-4 h-4 text-brand shrink-0" />
        <span className="flex-1 min-w-0 text-xs text-ink">
          <strong>
            {respostas.length} resposta{respostas.length === 1 ? '' : 's'} de cliente
            {respostas.length === 1 ? '' : 's'} para resolver
          </strong>{' '}
          — pedidos de outro horário e avisos de que não vão.
        </span>
        <ChevronDown
          className={`w-4 h-4 text-brand shrink-0 transition-transform ${aberto ? 'rotate-180' : ''}`}
        />
      </button>

      {aberto && (
        <ul className="border-t border-brand/25 divide-y divide-brand/20">
          {respostas.map((a) => {
            const pedido = a.pedidoRemarcacao;
            return (
              <li key={a.id} className="px-4 py-3 bg-white/50 space-y-2">
                <button
                  type="button"
                  onClick={() => onAbrir(a)}
                  className="w-full text-left group"
                >
                  <span className="block text-xs font-semibold text-ink truncate group-hover:text-brand transition-colors">
                    {a.pacienteNome}
                  </span>
                  <span className="block text-body text-ink-soft truncate">
                    {a.procedimentoNome} · marcado para {dataCurta(a.data)}
                    {a.hora ? ` às ${a.hora}` : ''}
                  </span>
                </button>

                {pedido ? (
                  <>
                    <p className="flex items-start gap-1.5 text-body text-warn">
                      <CalendarClock className="w-3.5 h-3.5 shrink-0 mt-px" />
                      <span>
                        Pediu <strong>{dataCurta(pedido.data)} às {pedido.hora}</strong> —{' '}
                        {instanteCurto(pedido.em)}
                      </span>
                    </p>
                    {pedido.mensagem && (
                      <p className="text-body text-ink-soft italic whitespace-pre-wrap">
                        “{pedido.mensagem}”
                      </p>
                    )}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onAprovar(a)}
                        className={`${botao} bg-ok-bg text-ok border border-ok-line hover:bg-ok-bg/70`}
                      >
                        <Check className="w-3.5 h-3.5" />
                        Aprovar
                      </button>
                      <button
                        type="button"
                        onClick={() => onRecusar(a)}
                        className={`${botao} bg-white/70 text-gray-600 border border-gray-200 hover:border-brand/40`}
                      >
                        <X className="w-3.5 h-3.5" />
                        Recusar
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="flex items-start gap-1.5 text-body text-danger">
                      <UserX className="w-3.5 h-3.5 shrink-0 mt-px" />
                      <span>
                        Avisou que <strong>não vai poder ir</strong> — {instanteCurto(a.avisoAusenciaEm)}
                      </span>
                    </p>
                    {/* Sem "Faltou": ela avisou, então o que sobra é reagendar ou liberar o horário. */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onRemarcar(a)}
                        className={`${botao} bg-white/70 text-ink border border-line hover:border-brand`}
                      >
                        <CalendarClock className="w-3.5 h-3.5" />
                        Remarcar
                      </button>
                      <button
                        type="button"
                        onClick={() => onExcluir(a)}
                        className={`${botao} text-gray-500 hover:text-red-600 hover:bg-red-50`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Excluir
                      </button>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

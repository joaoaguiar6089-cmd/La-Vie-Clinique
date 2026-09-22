import React, { useState } from 'react';
import { CheckCheck, ChevronDown, MessageCircle, PhoneOff } from 'lucide-react';
import { Attendance, ClinicProfile, Patient, Procedure } from '../../types';
import { contatoDoAtendimento, mensagemDeConfirmacao } from '../../utils/agenda';
import { buildWhatsAppUrl } from '../../utils/whatsapp';

/**
 * Os agendamentos de **amanhã** que ninguém confirmou ainda.
 *
 * Amanhã e não "os próximos dias": é esse o expediente da recepção — confirmar hoje o que
 * acontece amanhã. Uma janela maior devolveria uma lista que ninguém trabalha inteira, e a faixa
 * viraria mais um aviso permanente que se aprende a ignorar. Some sozinha quando está vazia, pela
 * mesma razão da faixa de pendências.
 *
 * Os dois botões de cada linha são os dois passos, nessa ordem: mandar a mensagem e, quando a
 * paciente responder, marcar. Nenhum dos dois faz o outro sozinho.
 */

interface AgendaAConfirmarProps {
  aConfirmar: Attendance[];
  clinic: ClinicProfile;
  catalogo: Procedure[];
  pacientes: Patient[];
  onAbrirAtendimento: (a: Attendance) => void;
  onConfirmar: (a: Attendance) => void;
}

export const AgendaAConfirmar: React.FC<AgendaAConfirmarProps> = ({
  aConfirmar,
  clinic,
  catalogo,
  pacientes,
  onAbrirAtendimento,
  onConfirmar,
}) => {
  // Aberta por padrão, ao contrário das pendências: é a lista de hoje, não um acúmulo antigo.
  const [aberto, setAberto] = useState(true);
  if (aConfirmar.length === 0) return null;

  return (
    <div className="rounded-card border border-brand/35 bg-brand-bg/60 overflow-hidden">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="w-full px-4 py-3 flex items-center gap-2.5 text-left hover:bg-brand-bg transition-colors"
      >
        <CheckCheck className="w-[18px] h-[18px] text-brand shrink-0" />
        <span className="flex-1 min-w-0 text-body-lg text-ink">
          <strong>
            {aConfirmar.length} agendamento{aConfirmar.length === 1 ? '' : 's'} de amanhã
          </strong>{' '}
          <span className="text-muted">
            ainda sem confirmação da paciente.
          </span>
        </span>
        <ChevronDown
          className={`w-4 h-4 text-brand shrink-0 transition-transform ${aberto ? 'rotate-180' : ''}`}
        />
      </button>

      {aberto && (
        <ul className="border-t border-brand/25 divide-y divide-brand/15">
          {aConfirmar.map((a) => {
            const link = buildWhatsAppUrl(
              contatoDoAtendimento(a, pacientes),
              mensagemDeConfirmacao(clinic, a, catalogo)
            );
            return (
              <li
                key={a.id}
                className="px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 bg-card/70"
              >
                <button
                  type="button"
                  onClick={() => onAbrirAtendimento(a)}
                  className="flex-1 min-w-0 text-left group"
                >
                  <span className="block text-body-lg font-medium text-ink truncate group-hover:text-brand transition-colors">
                    {a.hora ? `${a.hora} · ` : ''}
                    {a.pacienteNome}
                  </span>
                  <span className="block text-body text-muted truncate">
                    {a.procedimentoNome}
                    {a.profissionalNome ? ` · ${a.profissionalNome}` : ''}
                  </span>
                </button>

                <div className="flex items-center gap-1.5 shrink-0">
                  {link ? (
                    <a
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 rounded-lg bg-whatsapp text-white text-body font-semibold transition-colors"
                    >
                      <MessageCircle className="w-4 h-4" />
                      WhatsApp
                    </a>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1.5 min-h-[44px] px-3 text-body text-muted"
                      title="Sem telefone no cadastro"
                    >
                      <PhoneOff className="w-4 h-4" />
                      Sem telefone
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => onConfirmar(a)}
                    className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 rounded-lg border border-line bg-card text-body font-semibold text-ink hover:border-brand transition-colors"
                  >
                    <CheckCheck className="w-4 h-4" />
                    Confirmar
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

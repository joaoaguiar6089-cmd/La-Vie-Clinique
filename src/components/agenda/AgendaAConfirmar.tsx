import React, { useState } from 'react';
import { AlertCircle, CheckCheck, ChevronDown, Loader2, MessageCircle, PhoneOff } from 'lucide-react';
import { Attendance, ClinicProfile, Patient, Procedure } from '../../types';
import { contatoDoAtendimento } from '../../utils/agenda';
import { nomeDosProcedimentos } from '../../utils/attendances';
import {
  abrirAbaDoWhatsApp,
  enviarLinkNoWhatsApp,
  explicarErroDoLink,
  temWhatsApp,
} from './linkDeConfirmacao';

/**
 * Os agendamentos de **amanhã** que ninguém confirmou ainda.
 *
 * Amanhã e não "os próximos dias": é esse o expediente da recepção — confirmar hoje o que
 * acontece amanhã. Uma janela maior devolveria uma lista que ninguém trabalha inteira, e a faixa
 * viraria mais um aviso permanente que se aprende a ignorar. Some sozinha quando está vazia, pela
 * mesma razão da faixa de pendências.
 *
 * O WhatsApp de cada linha manda o **link de confirmação**: a cliente confirma, avisa que não vai
 * ou pede outro horário pela página, e a resposta volta sozinha para a agenda. O "Confirmar" fica
 * para quando ela responde por outro caminho (ligação, mensagem) — nenhum dos dois faz o outro.
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
  /** O agendamento cujo link está sendo gerado — o botão espera, e um segundo toque não duplica. */
  const [enviando, setEnviando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  if (aConfirmar.length === 0) return null;

  const enviar = (a: Attendance, telefone?: string) => {
    if (enviando) return;
    // A aba nasce no toque; o link é gravado depois.
    const aba = abrirAbaDoWhatsApp();
    setEnviando(a.id);
    setErro(null);
    enviarLinkNoWhatsApp(a, clinic, catalogo, telefone, aba)
      .catch((e) => {
        console.warn('Falha ao enviar o link de confirmação:', e);
        setErro(explicarErroDoLink(e));
      })
      .finally(() => setEnviando(null));
  };

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

      {aberto && erro && (
        <p className="px-4 py-2.5 border-t border-brand/25 bg-danger-bg text-body text-danger flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
          {erro}
        </p>
      )}

      {aberto && (
        <ul className="border-t border-brand/25 divide-y divide-brand/15">
          {aConfirmar.map((a) => {
            const telefone = contatoDoAtendimento(a, pacientes);
            const esteEnviando = enviando === a.id;
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
                    {nomeDosProcedimentos(a)}
                    {a.profissionalNome ? ` · ${a.profissionalNome}` : ''}
                  </span>
                </button>

                <div className="flex items-center gap-1.5 shrink-0">
                  {temWhatsApp(telefone) ? (
                    <button
                      type="button"
                      onClick={() => enviar(a, telefone)}
                      disabled={!!enviando}
                      title="Enviar o link de confirmação pelo WhatsApp"
                      className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 rounded-lg bg-whatsapp text-white text-body font-semibold transition-opacity hover:opacity-90 disabled:opacity-60"
                    >
                      {esteEnviando ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <MessageCircle className="w-4 h-4" />
                      )}
                      WhatsApp
                    </button>
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

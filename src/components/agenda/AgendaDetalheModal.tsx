import React from 'react';
import {
  CalendarClock,
  Check,
  CheckCheck,
  MessageCircle,
  NotebookPen,
  Pencil,
  Stethoscope,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { Attendance, ClinicProfile, Patient, Procedure } from '../../types';
import {
  contatoDoAtendimento,
  dataExtensa,
  duracaoDoAtendimento,
  ehConfirmado,
  hhmmDeMinutos,
  mensagemDeConfirmacao,
  minutosDoHHMM,
} from '../../utils/agenda';
import { ROTULO_DO_STATUS, ehPendente } from '../../utils/attendances';
import { buildWhatsAppUrl } from '../../utils/whatsapp';
import { acompanhamentoComRegistro, acompanhamentoVisivel } from '../../utils/fichasClinicas';

/**
 * O que um cartão da grade abre.
 *
 * As ações não cabem dentro do cartão — num bloco de 30 minutos não há espaço para seis botões — e
 * espremê-las ali tornaria o clique errado o clique provável. Aqui elas ficam legíveis, e são as
 * mesmas da aba do paciente, para não existirem dois vocabulários de desfecho no sistema.
 */

interface AgendaDetalheModalProps {
  atendimento: Attendance;
  clinic: ClinicProfile;
  catalogo: Procedure[];
  pacientes: Patient[];
  rotuloDoPlano?: string;
  onFechar: () => void;
  onEditar: (a: Attendance) => void;
  onCompareceu: (a: Attendance) => void;
  onFaltou: (a: Attendance) => void;
  onRemarcar: (a: Attendance) => void;
  onExcluir: (a: Attendance) => void;
  /** Liga/desliga o "confirmado" — o toque que a recepção dá depois de a paciente responder. */
  onAlternarConfirmacao: (a: Attendance, confirmado: boolean) => void;
  /**
   * O registro pós-atendimento, com os materiais usados dentro — o mesmo atalho da linha do
   * atendimento na ficha da paciente.
   */
  onAcompanhamento: (a: Attendance) => void;
}

const acaoBase =
  'flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-sm text-xs font-semibold transition-colors';

export const AgendaDetalheModal: React.FC<AgendaDetalheModalProps> = ({
  atendimento,
  clinic,
  catalogo,
  pacientes,
  rotuloDoPlano,
  onFechar,
  onEditar,
  onCompareceu,
  onFaltou,
  onRemarcar,
  onExcluir,
  onAlternarConfirmacao,
  onAcompanhamento,
}) => {
  const inicioMin = minutosDoHHMM(atendimento.hora);
  const duracao = duracaoDoAtendimento(atendimento, catalogo);
  const contato = contatoDoAtendimento(atendimento, pacientes);
  const linkWhatsApp = buildWhatsAppUrl(
    contato,
    mensagemDeConfirmacao(clinic, atendimento, catalogo)
  );
  const pendente = ehPendente(atendimento);
  const confirmado = ehConfirmado(atendimento);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center sm:p-4 animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="agenda-detalhe-titulo"
      onClick={(e) => {
        if (e.target === e.currentTarget) onFechar();
      }}
    >
      <div className="w-full sm:max-w-md max-h-[88vh] overflow-y-auto bg-surface rounded-t-2xl sm:rounded-card shadow-2xl sm:border sm:border-line animate-slideUpSheet sm:animate-none pb-area-segura sm:pb-0">
        <div className="bg-ink px-6 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-label font-semibold uppercase tracking-widest text-brand first-letter:uppercase">
              {dataExtensa(atendimento.data)}
              {inicioMin !== null
                ? ` · ${atendimento.hora}–${hhmmDeMinutos(inicioMin + duracao)}`
                : ' · sem horário'}
            </p>
            <h2 id="agenda-detalhe-titulo" className="text-lg text-white font-serif-luxury truncate">
              {atendimento.pacienteNome}
            </h2>
          </div>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="text-white/60 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="space-y-2">
            <p className="flex items-start gap-2 text-sm text-ink">
              <Stethoscope className="w-4 h-4 text-brand shrink-0 mt-0.5" />
              <span className="min-w-0">
                {atendimento.procedimentoNome}
                {rotuloDoPlano && (
                  <span className="block text-body text-brand">{rotuloDoPlano}</span>
                )}
              </span>
            </p>
            <p className="flex items-center gap-2 text-sm text-gray-600">
              <User className="w-4 h-4 text-gray-400 shrink-0" />
              {atendimento.profissionalNome || 'Sem profissional atribuída'}
            </p>
            {atendimento.status && (
              <p className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm bg-white/70 border border-white/80 text-body font-semibold text-gray-600">
                {ROTULO_DO_STATUS[atendimento.status]}
              </p>
            )}
          </div>

          {atendimento.observacoes && (
            <p className="px-3 py-2.5 rounded-sm bg-white/60 border border-white/80 text-xs text-gray-600 whitespace-pre-wrap">
              {atendimento.observacoes}
            </p>
          )}

          {/* Confirmação, em dois passos separados de propósito.

              O botão de WhatsApp **não grava nada**: ele só abre a conversa com a mensagem
              pronta. Quem confirma é a paciente, respondendo; então a recepção volta aqui e
              marca. Gravar "confirmado" no momento do envio seria registrar uma pergunta como
              se fosse resposta, e a agenda de amanhã passaria a mentir. */}
          {pendente && (
            <div className="space-y-2">
              {linkWhatsApp ? (
                <a
                  href={linkWhatsApp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${acaoBase} w-full bg-whatsapp text-white`}
                >
                  <MessageCircle className="w-4 h-4" />
                  Confirmar pelo WhatsApp
                </a>
              ) : (
                <p className="px-3 py-2.5 rounded-sm bg-surface-2 border border-line text-body text-muted text-center">
                  Sem telefone no cadastro — não dá para confirmar pelo WhatsApp.
                </p>
              )}

              <button
                type="button"
                onClick={() => onAlternarConfirmacao(atendimento, !confirmado)}
                aria-pressed={confirmado}
                className={`${acaoBase} w-full border ${
                  confirmado
                    ? 'bg-ok-bg text-ok border-ok-line hover:bg-ok-bg/70'
                    : 'bg-card text-ink border-line hover:border-brand'
                }`}
              >
                <CheckCheck className="w-4 h-4" />
                {confirmado ? 'Confirmado — desmarcar' : 'Marcar como confirmado'}
              </button>
            </div>
          )}

          {/* Depois que a visita aconteceu: o registro dela, com os materiais usados dentro. Verde =
              preenchido. Sem custo aqui — ele fica no Financeiro. */}
          {acompanhamentoVisivel(atendimento) && (
            <button
              type="button"
              onClick={() => onAcompanhamento(atendimento)}
              className={`w-full ${acaoBase} border ${
                acompanhamentoComRegistro(atendimento)
                  ? 'bg-ok-bg text-ok border-ok-line'
                  : 'bg-card text-ink border-line hover:border-brand'
              }`}
            >
              <NotebookPen className="w-4 h-4" />
              Acompanhamento
            </button>
          )}

          {/* Os três desfechos, só enquanto houver o que resolver. */}
          {pendente && (
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => onCompareceu(atendimento)}
                className={`${acaoBase} bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100`}
              >
                <Check className="w-4 h-4" />
                Compareceu
              </button>
              <button
                type="button"
                onClick={() => onFaltou(atendimento)}
                className={`${acaoBase} bg-red-50 text-red-600 border border-red-200 hover:bg-red-100`}
              >
                <X className="w-4 h-4" />
                Faltou
              </button>
              <button
                type="button"
                onClick={() => onRemarcar(atendimento)}
                className={`${acaoBase} bg-white/70 text-gray-600 border border-gray-200 hover:border-brand/40`}
              >
                <CalendarClock className="w-4 h-4" />
                Remarcar
              </button>
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-white/50 border-t border-white/70 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => onExcluir(atendimento)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-sm text-xs font-medium text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Excluir
          </button>
          <button
            type="button"
            onClick={() => onEditar(atendimento)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-sm bg-brand text-white text-xs font-semibold uppercase tracking-widest hover:bg-brand-hover transition-colors"
          >
            <Pencil className="w-4 h-4" />
            Editar
          </button>
        </div>
      </div>
    </div>
  );
};

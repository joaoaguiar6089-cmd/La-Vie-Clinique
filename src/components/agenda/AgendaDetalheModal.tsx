import React, { useState } from 'react';
import {
  AlertCircle,
  CalendarClock,
  Check,
  CheckCheck,
  ChevronRight,
  Copy,
  Loader2,
  MessageCircle,
  NotebookPen,
  Pencil,
  Stethoscope,
  Trash2,
  User,
  UserRound,
  UserX,
  X,
} from 'lucide-react';
import { Attendance, ClinicProfile, Patient, Procedure } from '../../types';
import {
  contatoDoAtendimento,
  dataExtensa,
  duracaoDoAtendimento,
  ehConfirmado,
  hhmmDeMinutos,
  minutosDoHHMM,
} from '../../utils/agenda';
import { ROTULO_DO_STATUS, ehPendente, procedimentosDoAtendimento } from '../../utils/attendances';
import { acompanhamentoComRegistro, acompanhamentoVisivel } from '../../utils/fichasClinicas';
import { ausenciaAvisada, instanteCurto } from '../../utils/agendamentoLink';
import {
  abrirAbaDoWhatsApp,
  copiarLinkDeConfirmacao,
  enviarLinkNoWhatsApp,
  explicarErroDoLink,
  temWhatsApp,
} from './linkDeConfirmacao';

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
  /** Aprova o horário que a cliente pediu pelo link — é uma remarcação, com confirmação em diálogo. */
  onAprovarPedido: (a: Attendance) => void;
  onRecusarPedido: (a: Attendance) => void;
  /** Leva à página da paciente — o histórico, os planos e os dados dela, a um toque da agenda. */
  onAbrirPaciente?: (pacienteId: string) => void;
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
  onAprovarPedido,
  onRecusarPedido,
  onAbrirPaciente,
}) => {
  const inicioMin = minutosDoHHMM(atendimento.hora);
  const duracao = duracaoDoAtendimento(atendimento, catalogo);
  const contato = contatoDoAtendimento(atendimento, pacientes);
  const pendente = ehPendente(atendimento);
  const confirmado = ehConfirmado(atendimento);
  /**
   * A cliente já disse, pelo link, que não vem. "Faltou" deixa de ser oferecido: ela avisou, então
   * marcar falta seria registrar como descuido o que foi um aviso. Sobram Remarcar e Excluir — a
   * decisão de quem atende. "Compareceu" fica, porque quem avisou pode aparecer mesmo assim.
   */
  const avisouAusencia = ausenciaAvisada(atendimento);
  const pedido = pendente ? atendimento.pedidoRemarcacao : undefined;

  /** O link de confirmação sendo gerado — para o WhatsApp ou para a área de transferência. */
  const [gerando, setGerando] = useState<'whatsapp' | 'copiar' | null>(null);
  const [copiado, setCopiado] = useState(false);
  /** O link que não deu para copiar sozinho — fica à vista para copiar à mão. */
  const [linkParaCopiar, setLinkParaCopiar] = useState<string | null>(null);
  const [erroDoLink, setErroDoLink] = useState<string | null>(null);

  const enviarNoWhatsApp = () => {
    if (gerando) return;
    // A aba nasce no toque; o link é gravado depois.
    const aba = abrirAbaDoWhatsApp();
    setGerando('whatsapp');
    setErroDoLink(null);
    enviarLinkNoWhatsApp(atendimento, clinic, catalogo, contato, aba)
      .catch((e) => {
        console.warn('Falha ao enviar o link de confirmação:', e);
        setErroDoLink(explicarErroDoLink(e));
      })
      .finally(() => setGerando(null));
  };

  const copiarLink = () => {
    if (gerando) return;
    setGerando('copiar');
    setErroDoLink(null);
    setLinkParaCopiar(null);
    copiarLinkDeConfirmacao(atendimento, clinic, catalogo)
      .then(({ link, copiado: deuCerto }) => {
        if (deuCerto) {
          setCopiado(true);
          setTimeout(() => setCopiado(false), 2500);
        } else {
          setLinkParaCopiar(link);
        }
      })
      .catch((e) => {
        console.warn('Falha ao gerar o link de confirmação:', e);
        setErroDoLink(explicarErroDoLink(e));
      })
      .finally(() => setGerando(null));
  };

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
            {onAbrirPaciente && atendimento.pacienteId && (
              <button
                type="button"
                onClick={() => onAbrirPaciente(atendimento.pacienteId)}
                className="mt-1 inline-flex items-center gap-1.5 text-body font-semibold text-brand-light underline-offset-2 hover:underline"
              >
                <UserRound className="w-4 h-4" />
                Ver página da cliente
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
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
                {procedimentosDoAtendimento(atendimento).map((p, i) => (
                  <span key={i} className="block">
                    {p.procedimentoNome}
                  </span>
                ))}
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

          {/* O que a cliente respondeu pelo link. Só aparece enquanto pede alguma decisão. */}
          {pedido && (
            <div className="rounded-sm bg-warn-bg border border-warn-line px-3 py-2.5 space-y-2">
              <p className="flex items-start gap-2 text-body text-warn">
                <CalendarClock className="w-4 h-4 shrink-0 mt-px" />
                <span>
                  <strong>A cliente pediu outro horário</strong> em {instanteCurto(pedido.em)}:{' '}
                  <span className="font-semibold first-letter:uppercase">
                    {dataExtensa(pedido.data)} às {pedido.hora}
                  </span>
                  .
                </span>
              </p>
              {pedido.mensagem && (
                <p className="text-body text-ink-soft italic whitespace-pre-wrap">
                  “{pedido.mensagem}”
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onAprovarPedido(atendimento)}
                  className={`${acaoBase} bg-ok-bg text-ok border border-ok-line hover:bg-ok-bg/70`}
                >
                  <Check className="w-4 h-4" />
                  Aprovar
                </button>
                <button
                  type="button"
                  onClick={() => onRecusarPedido(atendimento)}
                  className={`${acaoBase} bg-white/70 text-gray-600 border border-gray-200 hover:border-brand/40`}
                >
                  <X className="w-4 h-4" />
                  Recusar
                </button>
              </div>
            </div>
          )}

          {avisouAusencia && (
            <p className="flex items-start gap-2 px-3 py-2.5 rounded-sm bg-danger-bg border border-danger-line text-body text-danger">
              <UserX className="w-4 h-4 shrink-0 mt-px" />
              <span>
                <strong>A cliente avisou que não vai poder ir</strong> em{' '}
                {instanteCurto(atendimento.avisoAusenciaEm)}. Remarque ou exclua o agendamento.
              </span>
            </p>
          )}

          {/* Confirmação pelo link. O WhatsApp manda a mensagem com o endereço da página do
              horário, em que a cliente confirma, avisa que não vai ou pede outro horário — e a
              resposta volta sozinha para cá. Enviar **não grava** "confirmado": seria registrar
              uma pergunta como se fosse resposta. O "Marcar como confirmado" fica para quando ela
              responde por outro caminho. */}
          {pendente && (
            <div className="space-y-2">
              {temWhatsApp(contato) ? (
                <button
                  type="button"
                  onClick={enviarNoWhatsApp}
                  disabled={!!gerando}
                  className={`${acaoBase} w-full bg-whatsapp text-white hover:opacity-90 disabled:opacity-60`}
                >
                  {gerando === 'whatsapp' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <MessageCircle className="w-4 h-4" />
                  )}
                  Confirmar pelo WhatsApp
                </button>
              ) : (
                <p className="px-3 py-2.5 rounded-sm bg-surface-2 border border-line text-body text-muted text-center">
                  Sem telefone no cadastro — copie o link e envie por onde preferir.
                </p>
              )}

              <button
                type="button"
                onClick={copiarLink}
                disabled={!!gerando}
                className={`${acaoBase} w-full border ${
                  copiado
                    ? 'bg-ok-bg text-ok border-ok-line'
                    : 'bg-card text-ink border-line hover:border-brand disabled:opacity-60'
                }`}
              >
                {gerando === 'copiar' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : copiado ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
                {copiado ? 'Link copiado' : 'Copiar link de confirmação'}
              </button>

              {linkParaCopiar && (
                <input
                  type="text"
                  readOnly
                  value={linkParaCopiar}
                  autoFocus
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label="Link de confirmação"
                  className="w-full glass-input px-3 py-2 rounded-sm text-xs text-gray-600 focus:outline-hidden"
                />
              )}

              {erroDoLink && (
                <p className="flex items-start gap-2 px-3 py-2.5 rounded-sm bg-danger-bg border border-danger-line text-body text-danger">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
                  {erroDoLink}
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
              Relatório
            </button>
          )}

          {/* Os três desfechos, só enquanto houver o que resolver. */}
          {pendente && (
            <div className={`grid gap-2 ${avisouAusencia ? 'grid-cols-2' : 'grid-cols-3'}`}>
              <button
                type="button"
                onClick={() => onCompareceu(atendimento)}
                className={`${acaoBase} bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100`}
              >
                <Check className="w-4 h-4" />
                Compareceu
              </button>
              {!avisouAusencia && (
                <button
                  type="button"
                  onClick={() => onFaltou(atendimento)}
                  className={`${acaoBase} bg-red-50 text-red-600 border border-red-200 hover:bg-red-100`}
                >
                  <X className="w-4 h-4" />
                  Faltou
                </button>
              )}
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

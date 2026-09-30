import React, { useEffect, useRef, useState } from 'react';
import {
  CalendarClock,
  Check,
  CheckCheck,
  Copy,
  ExternalLink,
  Loader2,
  MessageCircle,
  Share2,
  UserX,
  X,
} from 'lucide-react';
import { Attendance, ClinicProfile, Patient, Procedure } from '../../types';
import { garantirLinkDoAgendamento } from '../../services/databaseService';
import { contatoDoAtendimento, dataExtensa } from '../../utils/agenda';
import { instanteCurto, mensagemDoLink } from '../../utils/agendamentoLink';
import { buildPublicLink } from '../../utils/publicLinks';
import { buildWhatsAppUrl } from '../../utils/whatsapp';
import { AvisoLinkFechado } from '../common/AvisoLinkFechado';

interface AgendamentoShareModalProps {
  atendimento: Attendance;
  clinic: ClinicProfile;
  catalogo: Procedure[];
  pacientes: Patient[];
  onFechar: () => void;
}

/**
 * O que a equipe faz para mandar o agendamento à cliente: gera o link, copia ou abre no WhatsApp.
 *
 * O link é criado (ou a cópia dele renovada) **quando este modal abre** — uma ação explícita da
 * equipe, e não uma escrita automática a cada agendamento. Agendamento que nunca é compartilhado
 * não custa nada da cota do banco.
 */

/** Traduz o erro do Firestore no que a equipe precisa fazer. */
const explicarErro = (e: unknown): string => {
  const codigo = (e as { code?: string })?.code;
  if (codigo === 'permission-denied') {
    return (
      'O banco de dados ainda não aceita links de agendamento. Falta publicar as regras do ' +
      'Firestore (firebase deploy --only firestore:rules) — depois é só abrir este painel de novo.'
    );
  }
  return `Não foi possível gerar o link: ${(e as Error)?.message || 'erro desconhecido'}`;
};

export const AgendamentoShareModal: React.FC<AgendamentoShareModalProps> = ({
  atendimento,
  clinic,
  catalogo,
  pacientes,
  onFechar,
}) => {
  const [token, setToken] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  /** O modo estrito monta o efeito duas vezes — sem isto o link seria gravado em dobro. */
  const iniciou = useRef(false);

  useEffect(() => {
    if (iniciou.current) return;
    iniciou.current = true;
    garantirLinkDoAgendamento(atendimento, clinic, catalogo)
      .then(setToken)
      .catch((e) => {
        console.warn('Falha ao gerar o link do agendamento:', e);
        setErro(explicarErro(e));
      });
    // Roda uma vez por abertura: o modal é montado só enquanto está aberto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const link = token ? buildPublicLink(clinic, { agendamento: token }) : '';
  const mensagem = link ? mensagemDoLink(clinic, atendimento, link) : '';
  const whatsapp = link
    ? buildWhatsAppUrl(contatoDoAtendimento(atendimento, pacientes), mensagem)
    : null;
  const podeCompartilhar = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sem permissão de área de transferência: o link continua visível para copiar à mão.
      setCopiado(false);
    }
  };

  const compartilhar = async () => {
    try {
      await navigator.share({ title: clinic.name, text: mensagem });
    } catch {
      // Quem fecha a folha de compartilhamento cancela o envio — não é erro.
    }
  };

  const quando = `${dataExtensa(atendimento.data)}${atendimento.hora ? ` às ${atendimento.hora}` : ''}`;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center sm:p-4 animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="agendamento-share-titulo"
      onClick={(e) => {
        if (e.target === e.currentTarget) onFechar();
      }}
    >
      <div className="w-full sm:max-w-md max-h-[88vh] overflow-y-auto bg-surface rounded-t-2xl sm:rounded-card shadow-2xl sm:border sm:border-line animate-slideUpSheet sm:animate-none pb-area-segura sm:pb-0">
        <div className="bg-ink px-6 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-label font-semibold uppercase tracking-widest text-brand">
              Compartilhar agendamento
            </p>
            <h2
              id="agendamento-share-titulo"
              className="text-lg text-white font-serif-luxury truncate"
            >
              {atendimento.pacienteNome}
            </h2>
            <p className="text-body text-white/60 truncate first-letter:uppercase">{quando}</p>
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
          <p className="text-xs text-gray-600 leading-relaxed">
            A cliente abre esse link no celular, sem login e sem instalar nada. Ela vê o card do
            procedimento e pode <strong>confirmar</strong>, avisar que <strong>não vai</strong> ou
            pedir <strong>outro horário</strong>. O link é secreto: só quem recebe consegue abrir.
          </p>

          {erro && (
            <div className="text-body leading-relaxed text-red-700 bg-red-50 border border-red-200 rounded-sm px-3 py-2">
              {erro}
            </div>
          )}

          {!token && !erro && (
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted">
              <Loader2 className="w-4 h-4 animate-spin text-brand" />
              Preparando o link…
            </div>
          )}

          {token && (
            <>
              <AvisoLinkFechado link={link} />

              <div className="flex items-stretch gap-2">
                <input
                  type="text"
                  readOnly
                  value={link}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label="Link do agendamento"
                  className="flex-1 min-w-0 glass-input px-3 py-2 rounded-sm text-xs text-gray-600 focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={copiar}
                  className="px-3 bg-white/70 border border-line rounded-sm text-ink hover:bg-white transition-colors"
                  aria-label="Copiar link"
                >
                  {copiado ? (
                    <Check className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>

              {whatsapp ? (
                <a
                  href={whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full px-5 py-3 bg-whatsapp text-white text-xs font-semibold uppercase tracking-widest rounded-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                >
                  <MessageCircle className="w-4 h-4" />
                  Enviar no WhatsApp
                </a>
              ) : (
                <p className="px-3 py-2.5 rounded-sm bg-surface-2 border border-line text-body text-muted text-center">
                  Sem telefone no cadastro — copie o link e envie por onde preferir.
                </p>
              )}

              <div className="grid grid-cols-2 gap-2">
                {podeCompartilhar && (
                  <button
                    type="button"
                    onClick={compartilhar}
                    className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-sm text-xs font-semibold bg-card text-ink border border-line hover:border-brand transition-colors"
                  >
                    <Share2 className="w-4 h-4" />
                    Compartilhar…
                  </button>
                )}
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-sm text-xs font-semibold bg-card text-ink border border-line hover:border-brand transition-colors ${
                    podeCompartilhar ? '' : 'col-span-2'
                  }`}
                >
                  <ExternalLink className="w-4 h-4" />
                  Ver como a cliente vê
                </a>
              </div>
            </>
          )}

          <RespostaDaCliente atendimento={atendimento} />
        </div>
      </div>
    </div>
  );
};

/** O que a cliente já respondeu, se respondeu — para a equipe não reenviar o link à toa. */
const RespostaDaCliente: React.FC<{ atendimento: Attendance }> = ({ atendimento }) => {
  if (atendimento.pedidoRemarcacao) {
    const p = atendimento.pedidoRemarcacao;
    return (
      <p className="flex items-start gap-2 px-3 py-2.5 rounded-sm bg-warn-bg border border-warn-line text-body text-warn">
        <CalendarClock className="w-4 h-4 shrink-0 mt-px" />
        <span>
          <strong>A cliente pediu outro horário</strong> ({p.data.split('-').reverse().join('/')} às{' '}
          {p.hora}) em {instanteCurto(p.em)}. Responda na Agenda.
        </span>
      </p>
    );
  }
  if (atendimento.avisoAusenciaEm) {
    return (
      <p className="flex items-start gap-2 px-3 py-2.5 rounded-sm bg-danger-bg border border-danger-line text-body text-danger">
        <UserX className="w-4 h-4 shrink-0 mt-px" />
        <span>
          <strong>A cliente avisou que não vai poder ir</strong> em{' '}
          {instanteCurto(atendimento.avisoAusenciaEm)}.
        </span>
      </p>
    );
  }
  if (atendimento.confirmadoEm) {
    return (
      <p className="flex items-start gap-2 px-3 py-2.5 rounded-sm bg-ok-bg border border-ok-line text-body text-ok">
        <CheckCheck className="w-4 h-4 shrink-0 mt-px" />
        <span>
          <strong>Confirmado</strong> em {instanteCurto(atendimento.confirmadoEm)}.
        </span>
      </p>
    );
  }
  return null;
};

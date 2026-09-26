import React from 'react';
import {
  Ban,
  CheckCircle2,
  Copy,
  Eye,
  MessageCircle,
  Paperclip,
  Pencil,
  RefreshCw,
  Share2,
  Trash2,
  Undo2,
  XCircle,
} from 'lucide-react';
import { Quote, QuoteStatus } from '../../types';
import { formatBRL } from '../../utils/formatters';
import {
  isQuoteEditavel,
  podeRegistrarDesfecho,
  podeSubstituir,
  resolveQuoteStatus,
} from '../../utils/quoteCalc';
import { AcaoDoMenu, MenuDeAcoes, Selo } from '../common/Tinta';
import { AcoesDeOrcamento } from './useAcoesDeOrcamento';
import { QUOTE_STATUS_LABEL, useDesfechoDoOrcamento } from './QuoteDesfecho';

/** O selo de status em pílula — fundo claro e texto escuro do mesmo tom, sem borda. */
export const SELO_DO_STATUS: Record<QuoteStatus, string> = {
  rascunho: 'bg-line-soft text-[#3A3833]',
  enviado: 'bg-brand-bg text-brand-deep',
  pago: 'bg-ok-bg text-ok',
  recusado: 'bg-danger-bg text-danger',
  expirado: 'bg-warn-bg text-warn',
  cancelado: 'bg-ink text-brand-pale',
};

/** "2026-09-25T…" → "25 SET". */
const diaEMes = (iso: string): string => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const mes = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase();
  return `${String(d.getDate()).padStart(2, '0')} ${mes}`;
};

/** "2026-10-25T…" → "25/10". */
const diaBarraMes = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
};

interface CartaoDeOrcamentoProps {
  quote: Quote;
  acoes: AcoesDeOrcamento;
  /** Rascunho ou cancelado: some do sistema, depois de perguntar. */
  onExcluir: (quote: Quote) => void;
  /** Enviado, recusado ou expirado: cancela, depois de perguntar. */
  onCancelar: (quote: Quote) => void;
}

/**
 * Um orçamento na lista, no desenho do redesign: número e data, status em pílula, a cliente e o
 * valor grande — e **uma** ação principal, escrita com o verbo, no lugar dos cinco ícones soltos
 * de antes. O que não é principal mora no "…".
 *
 * A ação principal é o próximo passo do orçamento: rascunho se envia; enviado se marca pago;
 * pago pede o comprovante; recusado se reabre; vencido se renova com número novo.
 */
export const CartaoDeOrcamento: React.FC<CartaoDeOrcamentoProps> = ({
  quote,
  acoes,
  onExcluir,
  onCancelar,
}) => {
  const status = resolveQuoteStatus(quote);
  const editavel = isQuoteEditavel(quote);
  const podeDecidir = podeRegistrarDesfecho(quote);
  const substituivel = podeSubstituir(quote);
  const desfecho = useDesfechoDoOrcamento(quote);

  const principal: {
    rotulo: string;
    icone: React.ElementType;
    onClick: () => void;
    escuro: boolean;
  } =
    status === 'rascunho'
      ? {
          rotulo: 'Enviar pelo WhatsApp',
          icone: MessageCircle,
          onClick: () => acoes.abrirCompartilhamento(quote),
          escuro: true,
        }
      : status === 'enviado' && podeDecidir
      ? { rotulo: 'Marcar pago', icone: CheckCircle2, onClick: desfecho.abrirPagamento, escuro: true }
      : quote.status === 'pago'
      ? {
          rotulo: quote.comprovante ? 'Ver comprovante' : 'Anexar comprovante',
          icone: Paperclip,
          onClick: desfecho.abrirPagamento,
          escuro: false,
        }
      : status === 'recusado'
      ? { rotulo: 'Reabrir', icone: Undo2, onClick: desfecho.reabrir, escuro: false }
      : status === 'expirado' && substituivel
      ? {
          rotulo: 'Renovar com número novo',
          icone: RefreshCw,
          onClick: () => acoes.abrirSubstituicao(quote),
          escuro: false,
        }
      : { rotulo: 'Ver orçamento', icone: Eye, onClick: () => acoes.abrirPrevia(quote), escuro: false };

  const menu: AcaoDoMenu[] = [];
  if (principal.icone !== Eye) {
    menu.push({ rotulo: 'Visualizar e salvar PDF', icone: Eye, onClick: () => acoes.abrirPrevia(quote) });
  }
  if (status !== 'rascunho' && status !== 'cancelado') {
    menu.push({
      rotulo: 'Compartilhar o link',
      icone: Share2,
      onClick: () => acoes.abrirCompartilhamento(quote),
    });
  }
  if (editavel) {
    menu.push({ rotulo: 'Editar rascunho', icone: Pencil, onClick: () => acoes.abrirEdicao(quote) });
  }
  if (podeDecidir && status === 'rascunho') {
    menu.push({ rotulo: 'A cliente pagou', icone: CheckCircle2, onClick: desfecho.abrirPagamento });
  }
  if (podeDecidir) {
    menu.push({ rotulo: 'A cliente recusou', icone: XCircle, onClick: desfecho.recusar });
  }
  // Pago não se substitui: o dinheiro entrou por este, com este número.
  if (substituivel && principal.icone !== RefreshCw) {
    menu.push({
      rotulo: 'Substituir por um novo',
      icone: RefreshCw,
      onClick: () => acoes.abrirSubstituicao(quote),
    });
  }
  menu.push({
    rotulo: 'Duplicar para outra cliente',
    icone: Copy,
    onClick: () => acoes.abrirDuplicacao(quote),
  });
  // Rascunho ou cancelado podem ser excluídos. Pago não tem nenhum dos dois: primeiro se desfaz o
  // pagamento, na folha do comprovante.
  if (editavel) {
    menu.push({ rotulo: 'Excluir rascunho', icone: Trash2, tom: 'perigo', onClick: () => onExcluir(quote) });
  } else if (status === 'cancelado') {
    menu.push({ rotulo: 'Excluir orçamento', icone: Trash2, tom: 'perigo', onClick: () => onExcluir(quote) });
  } else if (status !== 'pago') {
    menu.push({ rotulo: 'Cancelar orçamento', icone: Ban, tom: 'perigo', onClick: () => onCancelar(quote) });
  }

  const procedimentos = `${quote.itens.length} ${quote.itens.length === 1 ? 'procedimento' : 'procedimentos'}`;
  const detalhe =
    quote.status === 'pago' && quote.pagoEm
      ? `pago em ${diaBarraMes(quote.pagoEm)}`
      : status === 'rascunho' || status === 'enviado'
      ? `válido até ${diaBarraMes(quote.dataValidade)}`
      : status === 'expirado'
      ? `venceu em ${diaBarraMes(quote.dataValidade)}`
      : '';

  const IconePrincipal = principal.icone;

  return (
    <article className="rounded-[20px] bg-card border border-ink/8 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-semibold tracking-[.04em] text-ink-soft tabular-nums truncate">
          {quote.numero} · {diaEMes(quote.dataEmissao)}
        </p>
        <Selo className={SELO_DO_STATUS[status]}>
          {QUOTE_STATUS_LABEL[status]}
          {quote.status === 'pago' && quote.comprovante ? ' · comprovante' : ''}
        </Selo>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[17px] font-bold text-ink truncate">{quote.pacienteNome}</p>
          <p className="text-[13px] text-ink-soft truncate">
            {[procedimentos, detalhe].filter(Boolean).join(' · ')}
          </p>
          {quote.substituidoPor && (
            <p className="text-[12px] text-muted">substituído por {quote.substituidoPor.numero}</p>
          )}
        </div>
        <p className="shrink-0 text-[22px] font-bold tracking-[-0.01em] text-ink tabular-nums">
          {formatBRL(quote.total)}
        </p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={principal.onClick}
          className={`flex-1 min-w-0 h-11 rounded-xl px-3 text-[14px] font-semibold flex items-center justify-center gap-2 transition-colors ${
            principal.escuro
              ? 'bg-ink text-white hover:bg-black'
              : 'border border-ink/15 text-ink hover:border-ink/40'
          }`}
        >
          <IconePrincipal className="w-4 h-4 shrink-0" />
          <span className="truncate">{principal.rotulo}</span>
        </button>
        <MenuDeAcoes acoes={menu} rotulo={`Mais ações do orçamento ${quote.numero}`} titulo={`Orçamento ${quote.numero}`} />
      </div>

      {desfecho.elementos}
    </article>
  );
};

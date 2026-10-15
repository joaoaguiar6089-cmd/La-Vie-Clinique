import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckCircle2,
  ChevronRight,
  XCircle,
  Paperclip,
  Loader2,
  AlertCircle,
  ReceiptText,
  Undo2,
} from 'lucide-react';
import { Quote, QuoteComprovante, QuoteStatus, Recibo } from '../../types';
import { formatBRL, formatDate } from '../../utils/formatters';
import { hojeISO } from '../../utils/attendances';
import {
  podeRegistrarDesfecho,
  resolveQuoteStatus,
  statusAntesDoDesfecho,
} from '../../utils/quoteCalc';
import { dataCurta } from '../documentos/estiloA4';
import { rotuloCurtoDoPagamento } from '../../utils/recibos';
import {
  anexarComprovanteAoQuote,
  desfazerDesfechoDoQuote,
  marcarQuoteComoPago,
  marcarQuoteComoRecusado,
} from '../../services/databaseService';
import {
  apagarComprovante,
  enviarComprovante,
  problemaNoArquivoDeComprovante,
} from '../../services/comprovantes';
import { BottomSheet } from '../common/BottomSheet';
import { ConfirmDialog, ConfirmRequest, aviso } from '../ConfirmDialog';
import { ComprovanteAnexado, EscolhaDeComprovante } from './CampoDeComprovante';
import { useRecibos } from '../recibos/RecibosContext';

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  pago: 'Pago',
  recusado: 'Recusado',
  expirado: 'Expirado',
  cancelado: 'Cancelado',
};

export const QUOTE_STATUS_CLASS: Record<QuoteStatus, string> = {
  rascunho: 'bg-gray-100 text-gray-500 border-gray-200',
  enviado: 'bg-brand/10 text-brand-hover border-brand/25',
  pago: 'bg-ok-bg text-ok border-ok-line',
  recusado: 'bg-danger-bg text-danger border-danger-line',
  expirado: 'bg-amber-50 text-amber-700 border-amber-200',
  cancelado: 'bg-ink text-brand-light border-ink',
};

/** "2026-09-20" → o ISO do meio-dia local desse dia. Ver `pagoEm` em `types.ts`. */
const dataParaISO = (data: string): string => new Date(`${data}T12:00:00`).toISOString();

/** O dia de um ISO no fuso local, como "2026-09-20" — o valor do campo de data. */
const isoParaData = (iso?: string): string => {
  if (!iso) return hojeISO();
  const d = new Date(iso);
  if (isNaN(d.getTime())) return hojeISO();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// ==========================================
// DESFAZER O PAGAMENTO
// ==========================================

/**
 * A pergunta de desfazer o pagamento — a mesma na folha, no cartão e na linha da lista.
 *
 * As notas de recibo do orçamento saem junto: um recibo de um pagamento que não aconteceu não
 * pode continuar no sistema. Saem **antes** do status voltar — se a exclusão falhar no meio, o
 * pior caso é um orçamento pago sem recibo, e não um recibo de orçamento em aberto.
 */
export const pedidoDeDesfazerPagamento = (
  quote: Quote,
  recibos: Recibo[],
  excluirRecibos: ((quoteId: string) => Promise<void>) | undefined,
  onErro: (pedido: ConfirmRequest) => void,
  depois?: () => void
): ConfirmRequest => {
  const volta = statusAntesDoDesfecho(quote);
  const extras = [
    recibos.length === 1
      ? `A nota de recibo Nº ${recibos[0].numero} também é excluída.`
      : recibos.length > 1
      ? `As ${recibos.length} notas de recibo dele também são excluídas.`
      : null,
    quote.comprovante ? 'O comprovante anexado é apagado.' : null,
  ].filter(Boolean);
  return {
    titulo: `Desfazer o pagamento do ${quote.numero}?`,
    mensagem:
      `O orçamento volta para ${volta === 'enviado' ? 'enviado' : 'rascunho'} e sai do faturamento.` +
      (extras.length ? ` ${extras.join(' ')}` : ''),
    textoConfirmar: 'Desfazer pagamento',
    onConfirmar: async () => {
      try {
        if (recibos.length > 0 && excluirRecibos) await excluirRecibos(quote.id);
        await desfazerDesfechoDoQuote(quote);
        void apagarComprovante(quote.comprovante);
        depois?.();
      } catch (e) {
        onErro(aviso('Não foi possível desfazer o pagamento', (e as Error).message, 'perigo'));
      }
    },
  };
};

// ==========================================
// FOLHA DO PAGAMENTO
// ==========================================

interface FolhaDePagamentoProps {
  quote: Quote | null;
  onFechar: () => void;
  /** Pede confirmação acima da folha — desfazer e remover não têm volta. */
  onConfirmar: (pedido: ConfirmRequest) => void;
}

/**
 * Registrar o pagamento (orçamento ainda aberto) ou cuidar dele depois (orçamento já pago).
 *
 * Registrar pede só a data. O comprovante deixou de morar aqui: ele vai na **nota de recibo**,
 * junto com a forma de pagamento — e "Confirmar e criar nota de recibo" já abre o formulário dela,
 * com a data escolhida aqui. Quem só quer marcar o pago tem o botão de baixo.
 *
 * Com o orçamento pago, a folha lista as notas de recibo dele, oferece uma nova e é onde se
 * desfaz o pagamento. O comprovante anexado do jeito antigo (direto no orçamento) continua
 * aparecendo aqui, para ver, trocar ou remover.
 */
export const FolhaDePagamento: React.FC<FolhaDePagamentoProps> = ({ quote, onFechar, onConfirmar }) => {
  const recibosCtx = useRecibos();
  const [data, setData] = useState(hojeISO());
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const jaPago = quote?.status === 'pago';

  // Cada abertura começa limpa, com a data do pagamento já gravado (ou hoje).
  useEffect(() => {
    if (!quote) return;
    setData(isoParaData(quote.status === 'pago' ? quote.pagoEm : undefined));
    setArquivo(null);
    setSalvando(false);
    setErro(null);
  }, [quote?.id, quote?.status]);

  if (!quote) return null;

  const recibos = recibosCtx?.doOrcamento(quote.id) ?? [];

  const escolher = (novo: File | null) => {
    setErro(novo ? problemaNoArquivoDeComprovante(novo) : null);
    setArquivo(novo && !problemaNoArquivoDeComprovante(novo) ? novo : null);
  };

  const registrarPagamento = async (emitirRecibo: boolean) => {
    if (!data) {
      setErro('Informe a data do pagamento.');
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      const pagoEm = dataParaISO(data);
      await marcarQuoteComoPago(quote.id, pagoEm);
      onFechar();
      if (emitirRecibo) recibosCtx?.abrirDoOrcamento({ ...quote, status: 'pago', pagoEm });
    } catch (e) {
      setErro((e as Error).message);
      setSalvando(false);
    }
  };

  /** Troca do comprovante antigo, preso ao orçamento. */
  const salvarComprovante = async () => {
    if (!arquivo) return;
    setSalvando(true);
    setErro(null);
    let novo: QuoteComprovante | undefined;
    try {
      novo = await enviarComprovante(quote.id, arquivo);
      await anexarComprovanteAoQuote(quote.id, novo);
      void apagarComprovante(quote.comprovante);
      onFechar();
    } catch (e) {
      if (novo) void apagarComprovante(novo);
      setErro((e as Error).message);
      setSalvando(false);
    }
  };

  const removerComprovante = () =>
    onConfirmar({
      titulo: 'Remover o comprovante?',
      mensagem:
        'O arquivo é apagado e some também do link da cliente. O orçamento continua pago.',
      textoConfirmar: 'Remover',
      onConfirmar: async () => {
        try {
          await anexarComprovanteAoQuote(quote.id, null);
          void apagarComprovante(quote.comprovante);
        } catch (e) {
          setErro(`Não foi possível remover: ${(e as Error).message}`);
        }
      },
    });

  const desfazerPagamento = () =>
    onConfirmar(
      pedidoDeDesfazerPagamento(quote, recibos, recibosCtx?.excluirDoOrcamento, onConfirmar, onFechar)
    );

  const criarRecibo = () => {
    onFechar();
    recibosCtx?.abrirDoOrcamento(quote);
  };

  const rotulo = 'block text-label uppercase tracking-wider font-semibold text-muted';

  return (
    <BottomSheet
      aberto
      onFechar={() => {
        if (!salvando) onFechar();
      }}
      titulo={jaPago ? 'Pagamento' : 'Registrar pagamento'}
      descricao={`Nº ${quote.numero} · ${quote.pacienteNome}`}
    >
      <div className="px-2 pb-3 space-y-4">
        <div className="flex items-baseline justify-between gap-3 px-1">
          <span className="text-body text-muted">Total do orçamento</span>
          <span className="font-serif-luxury text-title text-ink tabular-nums">
            {formatBRL(quote.total)}
          </span>
        </div>

        {jaPago ? (
          <p className="px-1 text-body-lg text-ok flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            Pago em {formatDate(quote.pagoEm || '')}
          </p>
        ) : (
          <label className="block px-1">
            <span className={`${rotulo} mb-1.5`}>Data do pagamento</span>
            <input
              type="date"
              value={data}
              max={hojeISO()}
              onChange={(e) => setData(e.target.value)}
              className="w-full glass-input px-3 py-2.5 rounded-xl text-body-lg text-ink tabular-nums focus:outline-hidden"
            />
          </label>
        )}

        {/* As notas de recibo do orçamento pago */}
        {jaPago && recibosCtx && (
          <div className="px-1 space-y-2">
            <span className={rotulo}>Nota de recibo</span>
            {recibos.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  onFechar();
                  recibosCtx.abrirPrevia(r);
                }}
                className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-line bg-surface hover:border-brand transition-colors text-left"
              >
                <span className="w-11 h-11 rounded-lg bg-ok-bg text-ok flex items-center justify-center shrink-0">
                  <ReceiptText className="w-5 h-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-body-lg font-semibold text-ink tabular-nums truncate">
                    Nº {r.numero} · {formatBRL(r.valor)}
                  </span>
                  <span className="block text-body text-muted tabular-nums truncate">
                    {rotuloCurtoDoPagamento(r)} · pago em {dataCurta(r.dataPagamento)}
                    {r.comprovante ? ' · com comprovante' : ''}
                  </span>
                </span>
                <ChevronRight className="w-4 h-4 text-muted shrink-0 mr-1" />
              </button>
            ))}
            <button
              type="button"
              onClick={criarRecibo}
              className={`w-full min-h-[48px] px-5 rounded-xl text-body font-semibold flex items-center justify-center gap-2 transition-colors ${
                recibos.length === 0
                  ? 'bg-ink text-white hover:bg-black'
                  : 'border border-dashed border-brand/50 text-brand-hover hover:bg-brand/5'
              }`}
            >
              <ReceiptText className="w-4 h-4" />
              {recibos.length === 0 ? 'Criar nota de recibo' : 'Nova nota de recibo'}
            </button>
            {recibos.length === 0 && (
              <p className="text-body text-muted leading-relaxed">
                Data, valor, forma de pagamento e o comprovante, num PDF com a identidade da
                clínica para enviar à cliente.
              </p>
            )}
          </div>
        )}

        {/* O comprovante antigo, anexado direto ao orçamento antes da nota de recibo existir */}
        {jaPago && quote.comprovante && (
          <div className="px-1 space-y-2">
            <span className={rotulo}>Comprovante anexado ao orçamento</span>
            {!arquivo && <ComprovanteAnexado comprovante={quote.comprovante} />}
            {arquivo ? (
              <EscolhaDeComprovante arquivo={arquivo} onEscolher={escolher} rotulo="Trocar arquivo" />
            ) : (
              <div className="flex gap-2">
                <EscolhaDeComprovante arquivo={null} onEscolher={escolher} rotulo="Trocar arquivo" />
                <button
                  type="button"
                  onClick={removerComprovante}
                  className="shrink-0 min-h-[52px] px-4 rounded-xl text-body font-semibold text-muted hover:text-danger hover:bg-danger-bg transition-colors"
                >
                  Remover
                </button>
              </div>
            )}
          </div>
        )}

        {!jaPago && (
          <p className="px-1 text-body text-muted leading-relaxed">
            A forma de pagamento e o comprovante vão na nota de recibo, que sai em PDF para enviar
            à cliente.
          </p>
        )}

        {erro && (
          <div className="mx-1 px-3 py-2 rounded-xl bg-danger-bg border border-danger-line text-body text-danger flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
            <span>{erro}</span>
          </div>
        )}

        {!jaPago && (
          <div className="space-y-1.5">
            <button
              type="button"
              disabled={salvando}
              onClick={() => registrarPagamento(!!recibosCtx)}
              className="w-full min-h-[48px] px-5 bg-brand text-white text-body font-semibold uppercase tracking-widest rounded-xl hover:bg-brand-hover transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
              {recibosCtx ? 'Confirmar e criar nota de recibo' : 'Confirmar pagamento'}
            </button>
            {recibosCtx && (
              <button
                type="button"
                disabled={salvando}
                onClick={() => registrarPagamento(false)}
                className="w-full min-h-[44px] px-4 rounded-xl text-body font-semibold text-ink-soft hover:text-ink hover:bg-surface-2 transition-colors disabled:opacity-60"
              >
                Só confirmar o pagamento
              </button>
            )}
          </div>
        )}

        {jaPago && arquivo && (
          <button
            type="button"
            disabled={salvando}
            onClick={salvarComprovante}
            className="w-full min-h-[48px] px-5 bg-brand text-white text-body font-semibold uppercase tracking-widest rounded-xl hover:bg-brand-hover transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
            Salvar comprovante
          </button>
        )}

        {jaPago && (
          <button
            type="button"
            onClick={desfazerPagamento}
            disabled={salvando}
            className="w-full min-h-[44px] px-4 rounded-xl text-body font-semibold text-muted hover:text-danger hover:bg-danger-bg transition-colors flex items-center justify-center gap-2"
          >
            <Undo2 className="w-4 h-4" />
            Desfazer pagamento
          </button>
        )}
      </div>
    </BottomSheet>
  );
};

// ==========================================
// NA LINHA DA LISTA
// ==========================================

/**
 * O desfecho de um orçamento — registrar o pagamento, recusar, reabrir, desfazer o pagamento, a
 * nota de recibo — com a folha e as perguntas que ele abre. Serve à linha antiga
 * (`QuoteDesfecho`) e ao cartão da tela de Orçamentos, para os dois pedirem a mesma confirmação
 * com as mesmas palavras.
 */
export const useDesfechoDoOrcamento = (quote: Quote) => {
  const recibosCtx = useRecibos();
  const [folhaAberta, setFolhaAberta] = useState(false);
  const [confirmacao, setConfirmacao] = useState<ConfirmRequest | null>(null);
  const recibos = recibosCtx?.doOrcamento(quote.id) ?? [];

  const recusar = () =>
    setConfirmacao({
      titulo: `A cliente recusou o ${quote.numero}?`,
      mensagem:
        'O orçamento sai dos abertos e conta na conversão como não fechado. O link da cliente continua igual. Dá para desfazer depois.',
      textoConfirmar: 'Marcar recusado',
      tom: 'neutro',
      onConfirmar: () => {
        marcarQuoteComoRecusado(quote.id).catch((e) =>
          setConfirmacao(aviso('Não foi possível marcar como recusado', (e as Error).message, 'perigo'))
        );
      },
    });

  const reabrir = () => {
    const volta = statusAntesDoDesfecho(quote);
    setConfirmacao({
      titulo: `Reabrir o ${quote.numero}?`,
      mensagem: `A recusa é desfeita e o orçamento volta para ${volta === 'enviado' ? 'enviado' : 'rascunho'}.`,
      textoConfirmar: 'Reabrir',
      tom: 'neutro',
      onConfirmar: () => {
        desfazerDesfechoDoQuote(quote).catch((e) =>
          setConfirmacao(aviso('Não foi possível reabrir', (e as Error).message, 'perigo'))
        );
      },
    });
  };

  const desfazerPagamento = () =>
    setConfirmacao(
      pedidoDeDesfazerPagamento(quote, recibos, recibosCtx?.excluirDoOrcamento, setConfirmacao)
    );

  /** O formulário da nota de recibo — sem o contexto (fora do painel), cai na folha. */
  const criarRecibo = () => {
    if (recibosCtx) recibosCtx.abrirDoOrcamento(quote);
    else setFolhaAberta(true);
  };

  /** Um recibo abre direto na prévia; mais de um, na folha que lista todos. */
  const verRecibos = () => {
    if (recibos.length === 1 && recibosCtx) recibosCtx.abrirPrevia(recibos[0]);
    else setFolhaAberta(true);
  };

  /* No `body`, e não dentro da linha: a lista pode estar num painel com animação de entrada, e
     um ancestral com `transform` prende o `position: fixed` a ele. */
  const elementos = createPortal(
    <>
      {folhaAberta && (
        <FolhaDePagamento
          quote={quote}
          onFechar={() => setFolhaAberta(false)}
          onConfirmar={setConfirmacao}
        />
      )}
      <ConfirmDialog pedido={confirmacao} onFechar={() => setConfirmacao(null)} />
    </>,
    document.body
  );

  return {
    abrirPagamento: () => setFolhaAberta(true),
    recusar,
    reabrir,
    desfazerPagamento,
    criarRecibo,
    verRecibos,
    recibos,
    elementos,
  };
};

/**
 * O status do orçamento na linha da lista, com o desfecho logo abaixo.
 *
 * Quem decide se o orçamento fechou é a profissional: enquanto ele está em rascunho ou enviado,
 * aparecem "Pagou" e "Recusou". Pago oferece a nota de recibo — criar, ou ver a que já existe —
 * e o desfazer; recusado mostra como reabrir. Usado na aba de orçamentos da paciente e na linha do
 * tempo.
 */
export const QuoteDesfecho: React.FC<{ quote: Quote }> = ({ quote }) => {
  const desfecho = useDesfechoDoOrcamento(quote);
  const { recibos } = desfecho;

  const status = resolveQuoteStatus(quote);
  const podeDecidir = podeRegistrarDesfecho(quote);

  const chip =
    'inline-flex items-center gap-1 px-2 py-1 text-label font-semibold rounded-xs border transition-colors';

  return (
    <div className="flex flex-col items-start gap-1.5">
      <span
        className={`px-2 py-0.5 text-label font-semibold uppercase tracking-wider rounded-xs border ${QUOTE_STATUS_CLASS[status]}`}
      >
        {QUOTE_STATUS_LABEL[status]}
      </span>

      {podeDecidir && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={desfecho.abrirPagamento}
            title="A cliente pagou — registrar o pagamento e emitir a nota de recibo"
            className={`${chip} bg-white/60 text-ok border-ok-line hover:bg-ok-bg`}
          >
            <CheckCircle2 className="w-3 h-3" />
            Pagou
          </button>
          <button
            type="button"
            onClick={desfecho.recusar}
            title="A cliente recusou este orçamento"
            className={`${chip} bg-white/60 text-danger border-danger-line hover:bg-danger-bg`}
          >
            <XCircle className="w-3 h-3" />
            Recusou
          </button>
        </div>
      )}

      {quote.status === 'pago' && (
        <div className="flex flex-wrap items-center gap-1">
          {recibos.length === 0 ? (
            <button
              type="button"
              onClick={desfecho.criarRecibo}
              title="Emitir a nota de recibo deste pagamento, com o comprovante"
              className={`${chip} bg-white/60 text-info border-info-line hover:bg-info-bg`}
            >
              <ReceiptText className="w-3 h-3" />
              Criar nota de recibo
            </button>
          ) : (
            <button
              type="button"
              onClick={desfecho.verRecibos}
              title="Ver, baixar e enviar a nota de recibo"
              className={`${chip} bg-ok-bg text-ok border-ok-line hover:brightness-95`}
            >
              <ReceiptText className="w-3 h-3" />
              {recibos.length === 1 ? `Recibo ${recibos[0].numero}` : `${recibos.length} recibos`}
            </button>
          )}
          {quote.comprovante && (
            <button
              type="button"
              onClick={desfecho.abrirPagamento}
              title="Ver, trocar ou remover o comprovante"
              className={`${chip} bg-white/60 text-muted border-line hover:text-ink`}
            >
              <Paperclip className="w-3 h-3" />
              Comprovante
            </button>
          )}
          <button
            type="button"
            onClick={desfecho.desfazerPagamento}
            title="Desfazer o pagamento registrado por engano"
            className={`${chip} bg-white/60 text-muted border-line hover:text-ink`}
          >
            <Undo2 className="w-3 h-3" />
            Desfazer
          </button>
        </div>
      )}

      {quote.status === 'recusado' && (
        <button
          type="button"
          onClick={desfecho.reabrir}
          className={`${chip} bg-white/60 text-muted border-line hover:text-ink`}
        >
          <Undo2 className="w-3 h-3" />
          Desfazer
        </button>
      )}

      {desfecho.elementos}
    </div>
  );
};

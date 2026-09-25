import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckCircle2,
  XCircle,
  Paperclip,
  FileText,
  ExternalLink,
  Loader2,
  X,
  AlertCircle,
  Undo2,
} from 'lucide-react';
import { Quote, QuoteComprovante, QuoteStatus } from '../../types';
import { formatBRL, formatDate } from '../../utils/formatters';
import { hojeISO } from '../../utils/attendances';
import {
  podeRegistrarDesfecho,
  resolveQuoteStatus,
  statusAntesDoDesfecho,
} from '../../utils/quoteCalc';
import {
  anexarComprovanteAoQuote,
  desfazerDesfechoDoQuote,
  marcarQuoteComoPago,
  marcarQuoteComoRecusado,
} from '../../services/databaseService';
import {
  apagarComprovante,
  COMPROVANTE_TIPOS_ACEITOS,
  comprovanteEhPdf,
  enviarComprovante,
  problemaNoArquivoDeComprovante,
} from '../../services/comprovantes';
import { BottomSheet } from '../common/BottomSheet';
import { ConfirmDialog, ConfirmRequest, aviso } from '../ConfirmDialog';

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

const tamanhoLegivel = (bytes: number): string =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

// ==========================================
// ESCOLHA DO ARQUIVO
// ==========================================

/**
 * Campo do comprovante: botão que abre o seletor e, escolhido o arquivo, a miniatura com o nome.
 * Aceita foto ou PDF — no celular o seletor oferece a câmera e a galeria, que é de onde sai a
 * captura de tela do Pix.
 */
const EscolhaDeComprovante: React.FC<{
  arquivo: File | null;
  onEscolher: (arquivo: File | null) => void;
  rotulo: string;
}> = ({ arquivo, onEscolher, rotulo }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previa, setPrevia] = useState<string | null>(null);

  useEffect(() => {
    if (!arquivo || !arquivo.type.startsWith('image/')) {
      setPrevia(null);
      return;
    }
    const url = URL.createObjectURL(arquivo);
    setPrevia(url);
    return () => URL.revokeObjectURL(url);
  }, [arquivo]);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={COMPROVANTE_TIPOS_ACEITOS}
        className="hidden"
        onChange={(e) => {
          onEscolher(e.target.files?.[0] || null);
          // Zera o campo: escolher o mesmo arquivo de novo, depois de removê-lo, precisa disparar.
          e.target.value = '';
        }}
      />

      {arquivo ? (
        <div className="flex items-center gap-3 p-2.5 rounded-xl border border-line bg-surface">
          {previa ? (
            <img src={previa} alt="" className="w-12 h-12 object-cover rounded-lg shrink-0" />
          ) : (
            <span className="w-12 h-12 rounded-lg bg-surface-2 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5 text-brand" />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block text-body-lg text-ink truncate">{arquivo.name}</span>
            <span className="block text-body text-muted">{tamanhoLegivel(arquivo.size)}</span>
          </span>
          <button
            type="button"
            onClick={() => onEscolher(null)}
            aria-label="Remover arquivo escolhido"
            className="w-11 h-11 shrink-0 flex items-center justify-center text-muted hover:text-danger transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full min-h-[52px] px-4 rounded-xl border border-dashed border-brand/50 text-brand-hover hover:bg-brand/5 transition-colors flex items-center justify-center gap-2 text-body-lg font-medium"
        >
          <Paperclip className="w-4 h-4" />
          {rotulo}
        </button>
      )}
    </>
  );
};

/** O comprovante já anexado: miniatura (ou ícone de PDF), nome e o link para abrir. */
const ComprovanteAnexado: React.FC<{ comprovante: QuoteComprovante }> = ({ comprovante }) => (
  <a
    href={comprovante.url}
    target="_blank"
    rel="noopener noreferrer"
    className="flex items-center gap-3 p-2.5 rounded-xl border border-line bg-surface hover:border-brand transition-colors"
  >
    {comprovanteEhPdf(comprovante) ? (
      <span className="w-12 h-12 rounded-lg bg-surface-2 flex items-center justify-center shrink-0">
        <FileText className="w-5 h-5 text-brand" />
      </span>
    ) : (
      <img src={comprovante.url} alt="" className="w-12 h-12 object-cover rounded-lg shrink-0" />
    )}
    <span className="min-w-0 flex-1">
      <span className="block text-body-lg text-ink truncate">{comprovante.nome}</span>
      <span className="block text-body text-muted">anexado em {formatDate(comprovante.enviadoEm)}</span>
    </span>
    <ExternalLink className="w-4 h-4 text-muted shrink-0 mr-2" />
  </a>
);

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
 * Registrar o pagamento (orçamento ainda aberto) ou cuidar dele depois (orçamento já pago):
 * anexar o comprovante que ficou para depois, trocá-lo, removê-lo ou desfazer o pagamento.
 *
 * O comprovante sobe **antes** de o status mudar: se o Storage recusar, nada foi gravado e a
 * profissional decide — tenta de novo ou tira o arquivo e registra só o pagamento.
 */
const FolhaDePagamento: React.FC<FolhaDePagamentoProps> = ({ quote, onFechar, onConfirmar }) => {
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

  const escolher = (novo: File | null) => {
    setErro(novo ? problemaNoArquivoDeComprovante(novo) : null);
    setArquivo(novo && !problemaNoArquivoDeComprovante(novo) ? novo : null);
  };

  const registrarPagamento = async () => {
    if (!data) {
      setErro('Informe a data do pagamento.');
      return;
    }
    setSalvando(true);
    setErro(null);
    let comprovante: QuoteComprovante | undefined;
    try {
      if (arquivo) comprovante = await enviarComprovante(quote.id, arquivo);
      await marcarQuoteComoPago(quote.id, dataParaISO(data), comprovante);
      onFechar();
    } catch (e) {
      // O arquivo subiu mas o status não mudou: não deixa o comprovante órfão no Storage.
      if (comprovante) void apagarComprovante(comprovante);
      setErro((e as Error).message);
      setSalvando(false);
    }
  };

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

  const desfazerPagamento = () => {
    const volta = statusAntesDoDesfecho(quote);
    onConfirmar({
      titulo: `Desfazer o pagamento do ${quote.numero}?`,
      mensagem:
        `O orçamento volta para ${volta === 'enviado' ? 'enviado' : 'rascunho'} e sai do faturamento.` +
        (quote.comprovante ? ' O comprovante anexado é apagado.' : ''),
      textoConfirmar: 'Desfazer pagamento',
      onConfirmar: async () => {
        try {
          await desfazerDesfechoDoQuote(quote);
          void apagarComprovante(quote.comprovante);
          onFechar();
        } catch (e) {
          setErro(`Não foi possível desfazer: ${(e as Error).message}`);
        }
      },
    });
  };

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
            <span className="block text-label uppercase tracking-wider font-semibold text-muted mb-1.5">
              Data do pagamento
            </span>
            <input
              type="date"
              value={data}
              max={hojeISO()}
              onChange={(e) => setData(e.target.value)}
              className="w-full glass-input px-3 py-2.5 rounded-xl text-body-lg text-ink tabular-nums focus:outline-hidden"
            />
          </label>
        )}

        <div className="px-1 space-y-2">
          <span className="block text-label uppercase tracking-wider font-semibold text-muted">
            Comprovante{jaPago ? '' : ' (opcional)'}
          </span>

          {jaPago && quote.comprovante && !arquivo && (
            <>
              <ComprovanteAnexado comprovante={quote.comprovante} />
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
            </>
          )}

          {!(jaPago && quote.comprovante && !arquivo) && (
            <EscolhaDeComprovante
              arquivo={arquivo}
              onEscolher={escolher}
              rotulo="Anexar foto ou PDF"
            />
          )}

          <p className="text-body text-muted leading-relaxed">
            Fica disponível para a cliente no link do orçamento, junto com o aviso de pagamento
            confirmado.{!jaPago && ' Se não estiver com ele agora, dá para anexar depois.'}
          </p>
        </div>

        {erro && (
          <div className="mx-1 px-3 py-2 rounded-xl bg-danger-bg border border-danger-line text-body text-danger flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
            <span>{erro}</span>
          </div>
        )}

        {(!jaPago || arquivo) && (
          <button
            type="button"
            disabled={salvando}
            onClick={jaPago ? salvarComprovante : registrarPagamento}
            className="w-full min-h-[48px] px-5 bg-brand text-white text-body font-semibold uppercase tracking-widest rounded-xl hover:bg-brand-hover transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
            {jaPago ? 'Salvar comprovante' : 'Confirmar pagamento'}
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
 * O status do orçamento na linha da lista, com o desfecho logo abaixo.
 *
 * Quem decide se o orçamento fechou é a profissional: enquanto ele está em rascunho ou enviado,
 * aparecem "Pagou" e "Recusou". Pago mostra o comprovante (ou o convite para anexá-lo); recusado
 * mostra como desfazer. Usado na tela de Orçamentos e na aba de orçamentos da paciente, para as
 * duas listas se comportarem igual.
 */
export const QuoteDesfecho: React.FC<{ quote: Quote }> = ({ quote }) => {
  const [folhaAberta, setFolhaAberta] = useState(false);
  const [confirmacao, setConfirmacao] = useState<ConfirmRequest | null>(null);

  const status = resolveQuoteStatus(quote);
  const podeDecidir = podeRegistrarDesfecho(quote);

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
            onClick={() => setFolhaAberta(true)}
            title="A cliente pagou — registrar o pagamento e o comprovante"
            className={`${chip} bg-white/60 text-ok border-ok-line hover:bg-ok-bg`}
          >
            <CheckCircle2 className="w-3 h-3" />
            Pagou
          </button>
          <button
            type="button"
            onClick={recusar}
            title="A cliente recusou este orçamento"
            className={`${chip} bg-white/60 text-danger border-danger-line hover:bg-danger-bg`}
          >
            <XCircle className="w-3 h-3" />
            Recusou
          </button>
        </div>
      )}

      {quote.status === 'pago' && (
        <button
          type="button"
          onClick={() => setFolhaAberta(true)}
          title={quote.comprovante ? 'Ver, trocar ou remover o comprovante' : 'Anexar o comprovante'}
          className={`${chip} ${
            quote.comprovante
              ? 'bg-ok-bg text-ok border-ok-line hover:brightness-95'
              : 'bg-white/60 text-muted border-line hover:text-ink'
          }`}
        >
          <Paperclip className="w-3 h-3" />
          {quote.comprovante ? 'Comprovante anexo' : 'Anexar comprovante'}
        </button>
      )}

      {quote.status === 'recusado' && (
        <button
          type="button"
          onClick={reabrir}
          className={`${chip} bg-white/60 text-muted border-line hover:text-ink`}
        >
          <Undo2 className="w-3 h-3" />
          Desfazer
        </button>
      )}

      {/* No `body`, e não dentro da linha: a lista pode estar num painel com animação de
          entrada, e um ancestral com `transform` prende o `position: fixed` a ele. */}
      {createPortal(
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
      )}
    </div>
  );
};

import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Search,
  Pencil,
  Copy,
  RefreshCw,
  Trash2,
  Check,
  FileText,
  AlertCircle,
  Eye,
  Share2,
  Ban,
} from 'lucide-react';
import {
  ClinicProfile,
  Patient,
  Procedure,
  Quote,
  QuoteDraft,
  QuoteStatus,
  QuoteStoredStatus,
} from '../../types';
import { formatBRL, formatDate } from '../../utils/formatters';
import { resolveQuoteStatus, isQuoteEditavel } from '../../utils/quoteCalc';
import {
  subscribeToQuotes,
  subscribeToPatients,
  createQuote,
  updateQuote,
  replaceQuote,
  deleteQuote,
  setQuoteStatus,
  markQuoteAsSent,
} from '../../services/databaseService';
import { ConfirmDialog, ConfirmRequest } from '../ConfirmDialog';
import { QuoteFormModal } from './QuoteFormModal';
import { QuotePreviewModal } from './QuotePreviewModal';
import { montarEspelhoPublico } from '../../utils/laserAreas';
import { QuoteShareModal } from './QuoteShareModal';

interface QuotesPanelProps {
  clinic: ClinicProfile;
  catalogProcedures: Procedure[];
}

const STATUS_LABEL: Record<QuoteStatus, string> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  aceito: 'Aceito',
  expirado: 'Expirado',
  cancelado: 'Cancelado',
};

const STATUS_CLASS: Record<QuoteStatus, string> = {
  rascunho: 'bg-gray-100 text-gray-500 border-gray-200',
  enviado: 'bg-[#A67C52]/10 text-[#8E653D] border-[#A67C52]/25',
  aceito: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  expirado: 'bg-amber-50 text-amber-700 border-amber-200',
  cancelado: 'bg-[#1A1A1A] text-[#C49B74] border-[#1A1A1A]',
};

export const QuotesPanel: React.FC<QuotesPanelProps> = ({ clinic, catalogProcedures }) => {
  /** Mapa corporal do catálogo, para a página das áreas contratadas no PDF. */
  const mapaDoLaser = useMemo(
    () => montarEspelhoPublico(catalogProcedures, clinic),
    [catalogProcedures, clinic]
  );

  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [quotaAtingida, setQuotaAtingida] = useState(false);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<'todos' | QuoteStatus>('todos');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [quoteToEdit, setQuoteToEdit] = useState<Quote | null>(null);
  const [seedFrom, setSeedFrom] = useState<Quote | null>(null);
  const [modoSubstituicao, setModoSubstituicao] = useState<Quote | null>(null);
  const [quoteNaPrevia, setQuoteNaPrevia] = useState<Quote | null>(null);
  const [quoteParaCompartilhar, setQuoteParaCompartilhar] = useState<Quote | null>(null);
  const [confirmacao, setConfirmacao] = useState<ConfirmRequest | null>(null);

  useEffect(() => {
    const unsubQuotes = subscribeToQuotes(
      (data) => {
        setQuotes(data);
        setQuotaAtingida(false);
        setErro(null);
      },
      (e) => {
        const msg = e.message || '';
        const isQuota = msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('resource_exhausted');
        if (isQuota) {
          setQuotaAtingida(true);
        } else {
          setErro(`Não foi possível carregar os orçamentos: ${msg}`);
        }
      }
    );
    const unsubPatients = subscribeToPatients(setPatients);
    return () => {
      unsubQuotes();
      unsubPatients();
    };
  }, []);

  const listaFiltrada = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return quotes.filter((q) => {
      const status = resolveQuoteStatus(q);
      if (filtroStatus !== 'todos' && status !== filtroStatus) return false;
      if (!termo) return true;
      return (
        q.pacienteNome.toLowerCase().includes(termo) ||
        q.numero.toLowerCase().includes(termo) ||
        q.itens.some((i) => (i.profissionalNome || '').toLowerCase().includes(termo))
      );
    });
  }, [quotes, busca, filtroStatus]);

  const handleCompartilhado = async (quote: Quote) => {
    if (quote.status !== 'rascunho') return;
    try {
      await markQuoteAsSent(quote.id);
    } catch (e) {
      setErro(`O link foi compartilhado, mas o status não mudou: ${(e as Error).message}`);
    }
  };

  const abrirNovo = () => {
    setQuoteToEdit(null);
    setSeedFrom(null);
    setModoSubstituicao(null);
    setIsFormOpen(true);
  };

  const abrirEdicao = (quote: Quote) => {
    setQuoteToEdit(quote);
    setSeedFrom(null);
    setModoSubstituicao(null);
    setIsFormOpen(true);
  };

  const abrirDuplicacao = (quote: Quote) => {
    setQuoteToEdit(null);
    setSeedFrom(quote);
    setModoSubstituicao(null);
    setIsFormOpen(true);
  };

  const abrirSubstituicao = (quote: Quote) => {
    setQuoteToEdit(null);
    setSeedFrom(quote);
    setModoSubstituicao(quote);
    setIsFormOpen(true);
  };

  const handleSave = async (draft: QuoteDraft, existing?: Quote) => {
    setErro(null);
    if (existing) {
      await updateQuote(existing, draft);
    } else if (modoSubstituicao) {
      await replaceQuote(modoSubstituicao, draft);
    } else {
      await createQuote(draft);
    }
  };

  const handleSetStatus = async (quote: Quote, status: QuoteStoredStatus) => {
    try {
      await setQuoteStatus(quote.id, status);
    } catch (e) {
      setErro(`Não foi possível atualizar o status: ${(e as Error).message}`);
    }
  };

  const handleDelete = async (quote: Quote) => {
    try {
      await deleteQuote(quote.id);
    } catch (e) {
      setErro(`Não foi possível excluir: ${(e as Error).message}`);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="font-serif-luxury text-3xl sm:text-4xl text-[#1A1A1A]">Orçamentos</h1>
          <p className="text-xs text-gray-500 mt-1">
            {quotes.length} orçamento{quotes.length === 1 ? '' : 's'}
            {listaFiltrada.length !== quotes.length && ` · ${listaFiltrada.length} no filtro`}
          </p>
        </div>

        <button
          type="button"
          onClick={abrirNovo}
          className="px-5 py-2.5 bg-[#A67C52] text-white text-xs font-semibold uppercase tracking-widest rounded-sm hover:bg-[#8E653D] transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Novo orçamento
        </button>
      </div>

      {erro && (
        <div className="mb-4 px-4 py-3 rounded-sm bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {erro}
        </div>
      )}

      {quotaAtingida && (
        <div className="mb-4 px-4 py-3 rounded-sm bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-900">
              Limite diário de leitura gratuita do Firebase atingido (50.000 leituras/dia)
            </p>
            <p className="mt-0.5 text-amber-700">
              {quotes.length > 0
                ? 'Exibindo orçamentos salvos no cache deste navegador. A sincronização em nuvem será retomada automaticamente assim que a cota diária for renovada pelo Google (à meia-noite PST / 04:00 BRT).'
                : 'A cota diária do plano gratuito do Firestore foi esgotada para hoje. O Google reinicia esse limite diariamente às 04:00 BRT (meia-noite PST).'}
            </p>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por cliente, número ou profissional"
            className="w-full glass-input pl-9 pr-3 py-2 rounded-sm text-sm text-[#1A1A1A] focus:outline-hidden"
          />
        </div>

        <div className="flex items-center gap-1.5">
          {(['todos', 'rascunho', 'enviado', 'aceito', 'expirado', 'cancelado'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFiltroStatus(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-sm border transition-colors ${
                filtroStatus === s
                  ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]'
                  : 'bg-white/60 text-gray-600 border-white/80 hover:bg-white/80'
              }`}
            >
              {s === 'todos' ? 'Todos' : STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      {listaFiltrada.length === 0 ? (
        <div className="glass-card rounded-sm py-16 text-center">
          <FileText className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">
            {quotes.length === 0
              ? 'Nenhum orçamento ainda. Crie o primeiro no botão acima.'
              : 'Nenhum orçamento encontrado com esses filtros.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {listaFiltrada.map((quote) => {
            const status = resolveQuoteStatus(quote);
            const editavel = isQuoteEditavel(quote);
            const substituido = !!quote.substituidoPor;

            return (
              <div
                key={quote.id}
                className="glass-card glass-card-hover rounded-sm p-4 flex flex-wrap items-center gap-4"
              >
                <div className="min-w-[110px]">
                  <p className="font-serif-luxury text-lg text-[#1A1A1A] tabular-nums">
                    {quote.numero}
                  </p>
                  <p className="text-[11px] text-gray-400">{formatDate(quote.dataEmissao)}</p>
                </div>

                <div className="flex-1 min-w-[160px]">
                  <p className="text-sm text-[#1A1A1A] truncate">{quote.pacienteNome}</p>
                  <p className="text-[11px] text-gray-400 truncate">
                    {quote.itens.length} procedimento{quote.itens.length === 1 ? '' : 's'}
                    {(() => {
                      const nomes = Array.from(
                        new Set(quote.itens.map((i) => i.profissionalNome).filter(Boolean))
                      );
                      return nomes.length > 0 ? ` · ${nomes.join(', ')}` : '';
                    })()}
                  </p>
                </div>

                <div className="text-right min-w-[110px]">
                  <p className="text-sm font-semibold text-[#1A1A1A] tabular-nums">
                    {formatBRL(quote.total)}
                  </p>
                  <p className="text-[11px] text-gray-400">
                    válido até {formatDate(quote.dataValidade)}
                  </p>
                </div>

                <div className="flex flex-col items-start gap-1">
                  <span
                    className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-xs border ${STATUS_CLASS[status]}`}
                  >
                    {STATUS_LABEL[status]}
                  </span>
                  {substituido && (
                    <span className="text-[10px] text-gray-400">
                      substituído por {quote.substituidoPor?.numero}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-0.5 ml-auto">
                  <button
                    type="button"
                    onClick={() => setQuoteParaCompartilhar(quote)}
                    aria-label={`Compartilhar ${quote.numero}`}
                    title="Compartilhar link com a cliente"
                    className="p-2 text-gray-400 hover:text-[#A67C52] transition-colors"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setQuoteNaPrevia(quote)}
                    aria-label={`Visualizar ${quote.numero}`}
                    title="Visualizar — o botão de salvar PDF fica dentro da prévia"
                    className="p-2 text-gray-400 hover:text-[#A67C52] transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                  </button>

                  {editavel && (
                    <button
                      type="button"
                      onClick={() => abrirEdicao(quote)}
                      aria-label={`Editar ${quote.numero}`}
                      title="Editar rascunho"
                      className="p-2 text-gray-400 hover:text-[#A67C52] transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}

                  {!editavel && !substituido && status !== 'cancelado' && (
                    <button
                      type="button"
                      onClick={() => abrirSubstituicao(quote)}
                      aria-label={`Substituir ${quote.numero}`}
                      title="Substituir — cria um novo com número próprio"
                      className="p-2 text-gray-400 hover:text-[#A67C52] transition-colors"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => abrirDuplicacao(quote)}
                    aria-label={`Duplicar ${quote.numero}`}
                    title="Duplicar para outra cliente"
                    className="p-2 text-gray-400 hover:text-[#A67C52] transition-colors"
                  >
                    <Copy className="w-4 h-4" />
                  </button>

                  {status === 'enviado' && (
                    <button
                      type="button"
                      onClick={() => handleSetStatus(quote, 'aceito')}
                      aria-label={`Marcar ${quote.numero} como aceito`}
                      title="Marcar como aceito"
                      className="p-2 text-gray-400 hover:text-emerald-600 transition-colors"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  )}

                  {/* Rascunho ou cancelado podem ser excluídos definitivamente */}
                  {editavel ? (
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmacao({
                          titulo: `Excluir o rascunho ${quote.numero}?`,
                          mensagem:
                            'O rascunho some para sempre e o número não será reaproveitado. Como ele nunca foi enviado, ninguém tem link para ele.',
                          textoConfirmar: 'Excluir',
                          onConfirmar: () => handleDelete(quote),
                        })
                      }
                      aria-label={`Excluir ${quote.numero}`}
                      title="Excluir rascunho"
                      className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  ) : status === 'cancelado' ? (
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmacao({
                          titulo: `Excluir o orçamento ${quote.numero}?`,
                          mensagem:
                            'O registro sai do sistema para sempre. Se a cliente ainda tiver o link, ele passa a mostrar "orçamento não encontrado" em vez do aviso de cancelamento.',
                          textoConfirmar: 'Excluir',
                          onConfirmar: () => handleDelete(quote),
                        })
                      }
                      aria-label={`Excluir orçamento cancelado ${quote.numero}`}
                      title="Excluir orçamento cancelado"
                      className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmacao({
                          titulo: `Cancelar o orçamento ${quote.numero}?`,
                          mensagem:
                            'Ele sai da lista de ativos e o link que a cliente recebeu passa a avisar que foi cancelado.',
                          textoConfirmar: 'Cancelar orçamento',
                          onConfirmar: () => handleSetStatus(quote, 'cancelado'),
                        })
                      }
                      aria-label={`Cancelar ${quote.numero}`}
                      title="Cancelar orçamento"
                      className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                    >
                      <Ban className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <QuoteFormModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSave={handleSave}
        quoteToEdit={quoteToEdit}
        seedFrom={seedFrom}
        procedures={catalogProcedures}
        patients={patients}
        clinic={clinic}
      />

      <QuotePreviewModal
        quote={quoteNaPrevia}
        clinic={clinic}
        mapaCorporal={mapaDoLaser}
        onClose={() => setQuoteNaPrevia(null)}
      />

      <QuoteShareModal
        quote={quoteParaCompartilhar}
        clinic={clinic}
        onClose={() => setQuoteParaCompartilhar(null)}
        onCompartilhado={handleCompartilhado}
      />

      <ConfirmDialog pedido={confirmacao} onFechar={() => setConfirmacao(null)} />
    </div>
  );
};

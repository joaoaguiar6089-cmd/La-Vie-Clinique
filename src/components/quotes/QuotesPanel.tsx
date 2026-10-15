import React, { useEffect, useMemo, useState } from 'react';
import { Plus, FileText, AlertCircle, ReceiptText } from 'lucide-react';
import {
  ClinicProfile,
  Patient,
  PedidoDeNavegacao,
  Procedure,
  Quote,
  QuoteStatus,
} from '../../types';
import { resolveQuoteStatus, isQuoteEditavel } from '../../utils/quoteCalc';
import {
  subscribeToQuotes,
  subscribeToPatients,
  deleteQuote,
  cancelarQuote,
} from '../../services/databaseService';
import { ConfirmDialog, ConfirmRequest } from '../ConfirmDialog';
import { useAcoesDeOrcamento } from './useAcoesDeOrcamento';
import { CartaoDeOrcamento } from './CartaoDeOrcamento';
import { SkeletonLista } from '../common/Skeleton';
import { useRecibos } from '../recibos/RecibosContext';
import { CartaoDeRecibo } from '../recibos/CartaoDeRecibo';
import { resumoDosItens } from '../../utils/recibos';
import { AbaTinta, AbasSublinhadas, BotaoPilula, CampoDeBusca, TituloDaTela } from '../common/Tinta';

/**
 * As abas da lista. "Outros" junta os três finais que não pedem ação — recusado, vencido e
 * cancelado —: são consulta, e ocupavam três botões de filtro sozinhos.
 *
 * "Recibos" não é um status: é a lista das notas de recibo, com e sem orçamento. Mora aqui porque
 * é aqui que o recibo avulso nasce ("Novo recibo"), e ele precisa aparecer em algum lugar depois.
 */
type AbaDaLista = 'todos' | 'rascunho' | 'enviado' | 'pago' | 'outros' | 'recibos';

const ABA_DO_STATUS: Record<QuoteStatus, AbaDaLista> = {
  rascunho: 'rascunho',
  enviado: 'enviado',
  pago: 'pago',
  recusado: 'outros',
  expirado: 'outros',
  cancelado: 'outros',
};

const ehAbaDaLista = (valor?: string): valor is AbaDaLista =>
  valor === 'todos' ||
  valor === 'rascunho' ||
  valor === 'enviado' ||
  valor === 'pago' ||
  valor === 'outros' ||
  valor === 'recibos';

interface QuotesPanelProps {
  clinic: ClinicProfile;
  catalogProcedures: Procedure[];
  /** Pedido vindo da busca global ou da tela Hoje: abrir um orçamento, começar um novo. */
  pedido?: PedidoDeNavegacao | null;
  onPedidoAtendido?: () => void;
}

export const QuotesPanel: React.FC<QuotesPanelProps> = ({
  clinic,
  catalogProcedures,
  pedido,
  onPedidoAtendido,
}) => {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [quotaAtingida, setQuotaAtingida] = useState(false);
  const [busca, setBusca] = useState('');
  const [aba, setAba] = useState<AbaDaLista>('todos');
  const [confirmacao, setConfirmacao] = useState<ConfirmRequest | null>(null);

  const recibos = useRecibos();

  const acoes = useAcoesDeOrcamento({
    clinic,
    procedures: catalogProcedures,
    patients,
    onErro: setErro,
  });

  useEffect(() => {
    const unsubQuotes = subscribeToQuotes(
      (data) => {
        setQuotes(data);
        setCarregando(false);
        setQuotaAtingida(false);
        setErro(null);
      },
      (e) => {
        // Sem isto a falha de rede deixaria o skeleton pulsando para sempre.
        setCarregando(false);
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
      if (aba !== 'todos' && ABA_DO_STATUS[status] !== aba) return false;
      if (!termo) return true;
      return (
        q.pacienteNome.toLowerCase().includes(termo) ||
        q.numero.toLowerCase().includes(termo) ||
        q.itens.some((i) => (i.profissionalNome || '').toLowerCase().includes(termo))
      );
    });
  }, [quotes, busca, aba]);

  const recibosFiltrados = useMemo(() => {
    const lista = recibos?.recibos ?? [];
    const termo = busca.trim().toLowerCase();
    if (!termo) return lista;
    const digitos = termo.replace(/\D/g, '');
    return lista.filter(
      (r) =>
        r.pacienteNome.toLowerCase().includes(termo) ||
        r.numero.toLowerCase().includes(termo) ||
        (r.quoteNumero || '').toLowerCase().includes(termo) ||
        resumoDosItens(r).toLowerCase().includes(termo) ||
        (digitos.length >= 3 && (r.pacienteCpf || '').includes(digitos))
    );
  }, [recibos?.recibos, busca]);

  const abrirNovo = () => {
    setErro(null);
    acoes.abrirNovo();
  };

  /** Recibo do pagamento que chegou sem orçamento: a cliente é escolhida no formulário. */
  const abrirNovoRecibo = () => {
    setErro(null);
    recibos?.abrirNovo();
  };

  const abrirOrcamentoDoRecibo = (quoteId: string) => {
    const quote = quotes.find((q) => q.id === quoteId);
    if (quote) acoes.abrirPrevia(quote);
  };

  /**
   * Atende o pedido de quem chegou de fora — a busca global abrindo um orçamento pelo número, ou
   * "Novo orçamento". O `quotes` entra nas dependências porque o pedido pode chegar antes de a
   * lista: nesse caso ele é atendido assim que o documento aparece.
   */
  useEffect(() => {
    if (!pedido) return;
    if (ehAbaDaLista(pedido.filtro)) setAba(pedido.filtro);
    if (pedido.criarNovo) {
      abrirNovo();
      onPedidoAtendido?.();
      return;
    }
    if (pedido.quoteId) {
      const achado = quotes.find((q) => q.id === pedido.quoteId);
      if (!achado) return;
      acoes.abrirPrevia(achado);
    }
    onPedidoAtendido?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido?.nonce, quotes]);

  const handleCancelar = async (quote: Quote) => {
    try {
      await cancelarQuote(quote.id);
    } catch (e) {
      setErro(`Não foi possível cancelar: ${(e as Error).message}`);
    }
  };

  const handleDelete = async (quote: Quote) => {
    try {
      await deleteQuote(quote.id);
    } catch (e) {
      setErro(`Não foi possível excluir: ${(e as Error).message}`);
    }
  };

  const pedirExclusao = (quote: Quote) =>
    setConfirmacao(
      isQuoteEditavel(quote)
        ? {
            titulo: `Excluir o rascunho ${quote.numero}?`,
            mensagem:
              'O rascunho some para sempre e o número não será reaproveitado. Como ele nunca foi enviado, ninguém tem link para ele.',
            textoConfirmar: 'Excluir',
            onConfirmar: () => handleDelete(quote),
          }
        : {
            titulo: `Excluir o orçamento ${quote.numero}?`,
            mensagem:
              'O registro sai do sistema para sempre. Se a cliente ainda tiver o link, ele passa a mostrar "orçamento não encontrado" em vez do aviso de cancelamento.',
            textoConfirmar: 'Excluir',
            onConfirmar: () => handleDelete(quote),
          }
    );

  const pedirCancelamento = (quote: Quote) =>
    setConfirmacao({
      titulo: `Cancelar o orçamento ${quote.numero}?`,
      mensagem:
        'Ele sai da lista de ativos e o link que a cliente recebeu passa a avisar que foi cancelado.',
      textoConfirmar: 'Cancelar orçamento',
      onConfirmar: () => handleCancelar(quote),
    });

  return (
    <div className="max-w-3xl mx-auto px-5 sm:px-8 pt-6 lg:pt-8 pb-6 flex flex-col gap-4">
      <TituloDaTela
        titulo="Orçamentos"
        acao={
          <div className="flex flex-col items-end gap-0.5">
            <BotaoPilula icone={Plus} onClick={abrirNovo}>
              <span className="sm:hidden">Novo</span>
              <span className="hidden sm:inline">Novo orçamento</span>
            </BotaoPilula>
            {recibos && (
              <button
                type="button"
                onClick={abrirNovoRecibo}
                className="inline-flex items-center gap-1.5 min-h-[36px] px-1 text-[14px] font-semibold text-info hover:underline underline-offset-4"
              >
                <ReceiptText className="w-4 h-4" />
                Novo recibo
              </button>
            )}
          </div>
        }
      />

      <AbasSublinhadas<AbaDaLista>
        abas={
          [
            { id: 'todos', rotulo: 'Todos', contagem: quotes.length },
            { id: 'rascunho', rotulo: 'Rascunho' },
            { id: 'enviado', rotulo: 'Enviados' },
            { id: 'pago', rotulo: 'Pagos' },
            { id: 'outros', rotulo: 'Outros' },
            ...(recibos ? [{ id: 'recibos', rotulo: 'Recibos', contagem: recibos.recibos.length }] : []),
          ] as AbaTinta<AbaDaLista>[]
        }
        ativa={aba}
        onSelecionar={setAba}
      />

      <CampoDeBusca
        valor={busca}
        onMudar={setBusca}
        placeholder={aba === 'recibos' ? 'Cliente, número, CPF ou orçamento' : 'Cliente, número ou profissional'}
        rotulo={
          aba === 'recibos'
            ? 'Buscar recibo por cliente, número, CPF ou orçamento'
            : 'Buscar orçamento por cliente, número ou profissional'
        }
      />

      {erro && (
        <div className="px-4 py-3 rounded-[14px] bg-danger-bg text-[14px] text-danger flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
          {erro}
        </div>
      )}

      {quotaAtingida && (
        <div className="px-4 py-3 rounded-[14px] bg-warn-bg text-[14px] text-warn flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">
              Limite diário de leitura gratuita do Firebase atingido (50.000 leituras/dia)
            </p>
            <p className="mt-0.5">
              {quotes.length > 0
                ? 'Exibindo orçamentos salvos no cache deste navegador. A sincronização em nuvem será retomada automaticamente assim que a cota diária for renovada pelo Google (à meia-noite PST / 04:00 BRT).'
                : 'A cota diária do plano gratuito do Firestore foi esgotada para hoje. O Google reinicia esse limite diariamente às 04:00 BRT (meia-noite PST).'}
            </p>
          </div>
        </div>
      )}

      {aba === 'recibos' && recibos?.erro && (
        <div className="px-4 py-3 rounded-[14px] bg-danger-bg text-[14px] text-danger flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
          {recibos.erro}
        </div>
      )}

      {/* Lista */}
      {aba === 'recibos' && recibos ? (
        recibos.carregando ? (
          <SkeletonLista linhas={4} comAvatar={false} />
        ) : recibosFiltrados.length === 0 ? (
          <div className="rounded-[20px] bg-card border border-ink/8 py-12 px-5 text-center">
            <ReceiptText className="w-8 h-8 text-ink-soft mx-auto mb-3" />
            <p className="text-[14px] text-ink-soft">
              {recibos.recibos.length === 0
                ? 'Nenhuma nota de recibo ainda. Emita uma pelo orçamento pago ou em "Novo recibo".'
                : 'Nenhum recibo encontrado com essa busca.'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {recibosFiltrados.map((recibo) => (
              <CartaoDeRecibo key={recibo.id} recibo={recibo} onAbrirOrcamento={abrirOrcamentoDoRecibo} />
            ))}
          </div>
        )
      ) : carregando ? (
        <SkeletonLista linhas={6} comAvatar={false} />
      ) : listaFiltrada.length === 0 ? (
        <div className="rounded-[20px] bg-card border border-ink/8 py-12 px-5 text-center">
          <FileText className="w-8 h-8 text-ink-soft mx-auto mb-3" />
          <p className="text-[14px] text-ink-soft">
            {quotes.length === 0
              ? 'Nenhum orçamento ainda. Crie o primeiro no botão acima.'
              : busca.trim()
              ? 'Nenhum orçamento encontrado com essa busca.'
              : 'Nenhum orçamento nesta aba.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {listaFiltrada.map((quote) => (
            <CartaoDeOrcamento
              key={quote.id}
              quote={quote}
              acoes={acoes}
              onExcluir={pedirExclusao}
              onCancelar={pedirCancelamento}
            />
          ))}
        </div>
      )}

      {acoes.modais}

      <ConfirmDialog pedido={confirmacao} onFechar={() => setConfirmacao(null)} />
    </div>
  );
};

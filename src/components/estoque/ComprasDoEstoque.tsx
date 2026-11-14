import React, { useState } from 'react';
import { ChevronRight, ExternalLink, Paperclip, ShoppingBag, Trash2 } from 'lucide-react';
import { LoteDeEstoque, PedidoDeCompra, ProdutoDeEstoque } from '../../types';
import { formatBRL, formatDateOnly } from '../../utils/formatters';
import { quantidadeDoProduto } from '../../utils/estoque';
import { pedidoPodeSerExcluido, totalDoItem, unidadesDeUso, validadeCurta } from '../../utils/lotes';
import { excluirPedidoDeCompra } from '../../services/databaseService';
import { apagarComprovante } from '../../services/comprovantes';
import { SidePanel } from '../common/SidePanel';
import { ConfirmDialog, ConfirmRequest, aviso } from '../ConfirmDialog';

interface ComprasDoEstoqueProps {
  pedidos: PedidoDeCompra[];
  lotes: LoteDeEstoque[];
  produtos: ProdutoDeEstoque[];
  termo: string;
}

const nomeDoPedido = (p: PedidoDeCompra) => (p.estoqueInicial ? 'Estoque atual lançado' : p.fornecedor || 'Compra sem fornecedor');

/**
 * A aba Compras do Estoque: os pedidos registrados, dos mais novos para os mais antigos. Tocar
 * abre o pedido — os itens, o lote e a validade de cada um, o anexo. Pedido só sai se nenhum lote
 * dele foi usado nem ajustado; depois disso, quem corrige é o "Ajustar" do lote.
 */
export const ComprasDoEstoque: React.FC<ComprasDoEstoqueProps> = ({ pedidos, lotes, produtos, termo }) => {
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [confirmacao, setConfirmacao] = useState<ConfirmRequest | null>(null);

  const visiveis = termo
    ? pedidos.filter((p) =>
        `${nomeDoPedido(p)} ${p.numero || ''} ${p.itens.map((i) => `${i.nome} ${i.marca || ''}`).join(' ')}`
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .toLowerCase()
          .includes(termo)
      )
    : pedidos;
  const aberto = abertoId ? pedidos.find((p) => p.id === abertoId) || null : null;

  const pedirExclusao = (p: PedidoDeCompra) => {
    if (!pedidoPodeSerExcluido(p, lotes)) {
      setConfirmacao(
        aviso(
          'Este pedido já foi usado',
          'Algum lote dele já saiu em atendimento ou foi ajustado, então o pedido não pode mais ser apagado — o histórico ficaria furado. Para corrigir uma quantidade, use o "Ajustar" do lote, no tipo do produto.'
        )
      );
      return;
    }
    setConfirmacao({
      titulo: 'Excluir este pedido?',
      mensagem: `O pedido e os ${p.itens.length === 1 ? 'lote que ele criou saem' : `${p.itens.length} lotes que ele criou saem`} do estoque${p.anexo ? ', junto com o anexo' : ''}. Os produtos continuam cadastrados.`,
      textoConfirmar: 'Excluir pedido',
      tom: 'perigo',
      onConfirmar: async () => {
        try {
          await excluirPedidoDeCompra(p);
          if (p.anexo) void apagarComprovante(p.anexo);
          setAbertoId(null);
        } catch (e) {
          setConfirmacao(aviso('Não foi possível excluir', (e as Error).message, 'perigo'));
        }
      },
    });
  };

  return (
    <>
      {visiveis.length === 0 ? (
        <div className="rounded-[20px] bg-card border border-ink/8 p-10 text-center">
          <ShoppingBag className="w-9 h-9 text-ink-soft mx-auto mb-3" />
          <p className="text-[15px] font-bold text-ink">{pedidos.length === 0 ? 'Nenhuma compra registrada ainda' : 'Nada encontrado'}</p>
          {pedidos.length === 0 && (
            <p className="text-[14px] text-ink-soft mt-1 max-w-md mx-auto">
              Comece lançando o estoque atual — o que já está na prateleira, com lote e validade. Depois, registre cada compra
              que chegar.
            </p>
          )}
        </div>
      ) : (
        <ul className="rounded-[20px] bg-card border border-ink/8 divide-y divide-ink/8 overflow-hidden">
          {visiveis.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setAbertoId(p.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface transition-colors"
              >
                <span className="w-12 shrink-0 text-[14px] font-bold text-ink tabular-nums">{formatDateOnly(p.dataCompra).slice(0, 5)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-semibold text-ink truncate">
                    {nomeDoPedido(p)}
                    {p.numero && <span className="font-medium text-ink-soft"> · nº {p.numero}</span>}
                  </span>
                  <span className="block text-[13px] text-ink-soft truncate">
                    {p.itens.length} {p.itens.length === 1 ? 'item' : 'itens'} · {p.itens.map((i) => i.nome).join(', ')}
                  </span>
                </span>
                {p.anexo && <Paperclip className="w-4 h-4 text-ink-soft shrink-0" aria-label="Com anexo" />}
                <span className="shrink-0 text-[16px] font-bold text-ink tabular-nums">{formatBRL(p.total)}</span>
                <ChevronRight className="w-4 h-4 text-ink-soft shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <SidePanel
        aberto={!!aberto}
        onFechar={() => setAbertoId(null)}
        titulo={aberto ? nomeDoPedido(aberto) : ''}
        sobretitulo="Estoque · Compras"
        largura="larga"
        cabecalho={
          aberto ? (
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[12px] font-semibold text-brand-light">{aberto.estoqueInicial ? 'Lançado em' : 'Comprado em'}</p>
                <p className="text-[18px] font-bold text-white">{formatDateOnly(aberto.dataCompra)}</p>
              </div>
              <div className="text-right">
                <p className="text-[12px] font-semibold text-brand-light">Total</p>
                <p className="text-[24px] font-bold text-white tabular-nums leading-tight">{formatBRL(aberto.total)}</p>
              </div>
            </div>
          ) : undefined
        }
        rodape={
          aberto ? (
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => pedirExclusao(aberto)}
                className="inline-flex items-center gap-1.5 min-h-[44px] px-2 text-[15px] font-semibold text-ink-soft hover:text-danger transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Excluir pedido
              </button>
              <button
                type="button"
                onClick={() => setAbertoId(null)}
                className="min-h-[44px] px-5 rounded-xl bg-ink text-white text-[15px] font-semibold"
              >
                Fechar
              </button>
            </div>
          ) : undefined
        }
      >
        {aberto && (
          <div className="px-5 sm:px-6 py-5 flex flex-col gap-5">
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-[14px] text-ink-soft">
              {aberto.numero && (
                <span>
                  Nota <strong className="text-ink">{aberto.numero}</strong>
                </span>
              )}
              {aberto.criadoPorNome && (
                <span>
                  Registrado por <strong className="text-ink">{aberto.criadoPorNome}</strong>
                </span>
              )}
            </div>
            {aberto.anexo && (
              <a
                href={aberto.anexo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="self-start inline-flex items-center gap-2 min-h-[44px] px-4 rounded-full border border-ink/15 text-[14px] font-semibold text-ink hover:border-ink/40"
              >
                <Paperclip className="w-4 h-4" />
                Abrir o anexo ({aberto.anexo.nome})
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
            <ul className="flex flex-col gap-2.5">
              {aberto.itens.map((i) => {
                const unidade = produtos.find((p) => p.id === i.produtoId)?.unidade || 'un';
                const lote = lotes.find((l) => l.id === i.loteId);
                return (
                  <li key={i.loteId} className="rounded-[18px] bg-card border border-ink/10 p-4 flex flex-col gap-1.5">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[15px] font-bold text-ink min-w-0">
                        {i.nome}
                        {i.marca && <span className="font-medium text-ink-soft"> · {i.marca}</span>}
                      </p>
                      <p className="shrink-0 text-[16px] font-bold text-ink tabular-nums">{formatBRL(totalDoItem(i))}</p>
                    </div>
                    <p className="text-[13px] text-ink-soft">
                      {i.porEmbalagem
                        ? `${i.quantidade} ${i.quantidade === 1 ? 'embalagem' : 'embalagens'} de ${quantidadeDoProduto(i.unidadesPorEmbalagem || 1, unidade)} a ${formatBRL(i.valorUnitario)}`
                        : `${quantidadeDoProduto(i.quantidade, unidade)} a ${formatBRL(i.valorUnitario)}`}
                      {' · entrou '}
                      {quantidadeDoProduto(unidadesDeUso(i.quantidade, i.porEmbalagem, i.unidadesPorEmbalagem), unidade)}
                    </p>
                    <p className="text-[13px] text-ink-soft">
                      {i.lote ? `Lote ${i.lote}` : 'Sem lote'} · {i.validade ? `Validade ${validadeCurta(i.validade)}` : 'sem validade'}
                      {lote && <> · resta <strong className="text-ink">{quantidadeDoProduto(lote.saldo, unidade)}</strong></>}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </SidePanel>

      <ConfirmDialog pedido={confirmacao} onFechar={() => setConfirmacao(null)} />
    </>
  );
};

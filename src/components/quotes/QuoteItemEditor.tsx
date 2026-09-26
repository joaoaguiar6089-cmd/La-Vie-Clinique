import React, { useEffect, useState } from 'react';
import {
  Trash2,
  Plus,
  ChevronUp,
  ChevronDown,
  AlertCircle,
  PackageOpen,
  RotateCcw,
} from 'lucide-react';
import { ProdutoDeEstoque, Professional, QuoteItem, QuoteItemDetail } from '../../types';
import { formatBRL } from '../../utils/formatters';
import { itemValorFinal, itemDescontoPercentual, itemSessoes } from '../../utils/quoteCalc';
import { LinhaDeMaterial, arredondar, totaisDosMateriais } from '../../utils/estoque';
import { EditorDeMateriais } from '../estoque/EditorDeMateriais';

interface QuoteItemEditorProps {
  item: QuoteItem;
  index: number;
  total: number;
  professionals: Professional[];
  onChange: (item: QuoteItem) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
  /** Os produtos do estoque, para o "calcular por consumo de produto". */
  produtos: ProdutoDeEstoque[];
  /** O consumo deste item — as mesmas linhas do custo de material, que moram em `quote_costs`. */
  linhasDoConsumo: LinhaDeMaterial[];
  /** Liga ou desliga o cálculo por consumo. Quem calcula o valor é o formulário. */
  onAlternarConsumo: (marcado: boolean) => void;
  onMudarConsumo: (linhas: LinhaDeMaterial[]) => void;
  /** Refaz o consumo pelo padrão do procedimento × sessões. */
  onRecalcularConsumo: () => void;
}

/** Campos numéricos guardam o texto digitado para não travar em "0" enquanto se apaga. */
const numeroDigitado = (valor: number | undefined): string =>
  valor === undefined || valor === null || valor === 0 ? '' : String(valor);

export const QuoteItemEditor: React.FC<QuoteItemEditorProps> = ({
  item,
  index,
  total,
  professionals,
  onChange,
  onRemove,
  onMove,
  produtos,
  linhasDoConsumo,
  onAlternarConsumo,
  onMudarConsumo,
  onRecalcularConsumo,
}) => {
  const [valorTabelaStr, setValorTabelaStr] = useState(numeroDigitado(item.valorTabela));
  const [valorDescontoStr, setValorDescontoStr] = useState(numeroDigitado(item.valorComDesconto));

  // O campo guarda o texto digitado, e não acompanha o valor sozinho: ao desligar o consumo, o
  // valor volta ao do catálogo, e o campo precisa mostrar esse — não o que foi digitado antes.
  useEffect(() => {
    if (!item.calculadoPorConsumo) setValorTabelaStr(numeroDigitado(item.valorTabela));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.calculadoPorConsumo]);

  const porConsumo = !!item.calculadoPorConsumo;
  const consumo = totaisDosMateriais(linhasDoConsumo);
  const margemDoConsumo = arredondar(consumo.valorCliente - consumo.custo);
  const sessoes = itemSessoes(item);

  const valorFinal = itemValorFinal(item);
  const percentual = itemDescontoPercentual(item);
  const descontoInvalido =
    item.temDesconto &&
    valorDescontoStr.trim() !== '' &&
    (Number(valorDescontoStr) >= item.valorTabela || Number(valorDescontoStr) < 0);

  const patch = (changes: Partial<QuoteItem>) => onChange({ ...item, ...changes });

  const updateDetail = (id: string, field: 'titulo' | 'valor', value: string) =>
    patch({
      detalhes: item.detalhes.map((d) => (d.id === id ? { ...d, [field]: value } : d)),
    });

  const addDetail = () =>
    patch({
      detalhes: [
        ...item.detalhes,
        { id: `qd-${Date.now()}-${item.detalhes.length}`, titulo: '', valor: '' } as QuoteItemDetail,
      ],
    });

  const removeDetail = (id: string) =>
    patch({ detalhes: item.detalhes.filter((d) => d.id !== id) });

  return (
    <div className="glass-card rounded-sm p-4 space-y-3">
      {/* Cabeçalho: categoria, título e controles de ordem */}
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-label font-semibold uppercase tracking-widest text-brand mb-1 truncate">
            {item.categoria || 'Sem categoria'}
          </p>
          <input
            type="text"
            value={item.titulo}
            onChange={(e) => patch({ titulo: e.target.value })}
            placeholder="Nome do procedimento"
            className="w-full glass-input px-3 py-1.5 rounded-sm text-sm text-ink focus:outline-hidden"
          />
          {/* O orçamento personalizado: o valor sai do que o procedimento vai gastar nesta cliente. */}
          <label className="mt-2 inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={porConsumo}
              onChange={(e) => onAlternarConsumo(e.target.checked)}
              className="w-3.5 h-3.5 accent-brand"
            />
            <span className="text-xs font-medium text-ink">Calcular por consumo de produto</span>
          </label>
        </div>

        <div className="flex items-center gap-0.5 pt-4 shrink-0">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label="Mover para cima"
            className="p-1 text-gray-400 hover:text-brand disabled:opacity-25 disabled:hover:text-gray-400 transition-colors"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            aria-label="Mover para baixo"
            className="p-1 text-gray-400 hover:text-brand disabled:opacity-25 disabled:hover:text-gray-400 transition-colors"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remover ${item.titulo || 'procedimento'}`}
            className="p-1 text-red-500 hover:text-red-700 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Profissional e valor */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-body font-medium text-ink mb-1">
            Profissional deste procedimento
          </label>
          <select
            value={item.professionalId || ''}
            onChange={(e) => {
              const id = e.target.value || undefined;
              patch({
                professionalId: id,
                profissionalNome: professionals.find((p) => p.id === id)?.name,
              });
            }}
            className="w-full glass-input px-3 py-1.5 rounded-sm text-sm text-ink focus:outline-hidden"
          >
            <option value="">Sem profissional definida</option>
            {professionals.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {porConsumo ? (
          <div>
            <span className="block text-body font-medium text-ink mb-1">Valor pelo consumo</span>
            <p className="w-full px-3 py-1.5 rounded-sm border border-line bg-surface-2 text-sm font-semibold text-ink tabular-nums">
              {formatBRL(item.valorTabela)}
            </p>
          </div>
        ) : (
          <div>
            <label className="block text-body font-medium text-ink mb-1">Valor de tabela</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={valorTabelaStr}
              onChange={(e) => {
                setValorTabelaStr(e.target.value);
                patch({ valorTabela: e.target.value === '' ? 0 : Number(e.target.value) });
              }}
              className="w-full glass-input px-3 py-1.5 rounded-sm text-sm text-ink tabular-nums focus:outline-hidden"
            />
          </div>
        )}
      </div>

      {/* Desconto e sessões */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={item.temDesconto}
              onChange={(e) =>
                patch({
                  temDesconto: e.target.checked,
                  valorComDesconto: e.target.checked ? item.valorComDesconto : undefined,
                })
              }
              className="w-3.5 h-3.5 accent-brand"
            />
            <span className="text-xs font-medium text-ink">Desconto</span>
          </label>

          {item.temDesconto && (
            <div>
              <input
                type="number"
                min="0"
                step="0.01"
                value={valorDescontoStr}
                onChange={(e) => {
                  setValorDescontoStr(e.target.value);
                  patch({
                    valorComDesconto: e.target.value === '' ? undefined : Number(e.target.value),
                  });
                }}
                placeholder="Novo valor"
                className="w-full glass-input px-3 py-1.5 rounded-sm text-sm text-ink tabular-nums focus:outline-hidden"
              />
              {descontoInvalido ? (
                <p className="mt-1 text-body text-amber-600 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  Precisa ser menor que o valor de tabela — o desconto não será aplicado
                </p>
              ) : percentual > 0 ? (
                <p className="mt-1 text-body text-brand tabular-nums">
                  desconto de {Math.round(percentual)}% · sai de {formatBRL(item.valorTabela)} por{' '}
                  {formatBRL(valorFinal)}
                </p>
              ) : null}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={item.maisDeUmaSessao}
              onChange={(e) =>
                patch({
                  maisDeUmaSessao: e.target.checked,
                  sessoes: e.target.checked ? Math.max(2, item.sessoes || 2) : 1,
                })
              }
              className="w-3.5 h-3.5 accent-brand"
            />
            <span className="text-xs font-medium text-ink">Mais de 1 sessão</span>
          </label>

          {item.maisDeUmaSessao && (
            <div>
              <input
                type="number"
                min="2"
                step="1"
                value={item.sessoes}
                onChange={(e) => patch({ sessoes: Math.max(2, Number(e.target.value) || 2) })}
                className="w-full glass-input px-3 py-1.5 rounded-sm text-sm text-ink tabular-nums focus:outline-hidden"
              />
              <p className="mt-1 text-body text-gray-400">
                Informativo no PDF — não multiplica o valor
              </p>
            </div>
          )}
        </div>
      </div>

      {/*
        Consumo de produto — só para a equipe. O valor do item é a soma do repassado à cliente;
        compra e margem aparecem aqui para a conta ficar à vista. No documento da cliente saem só
        os nomes dos produtos.
      */}
      {porConsumo && (
        <div className="rounded-xl border border-line bg-surface p-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-label font-semibold uppercase tracking-widest text-brand flex items-center gap-1.5">
              <PackageOpen className="w-3.5 h-3.5" />
              Consumo de produto
            </p>
            <button
              type="button"
              onClick={onRecalcularConsumo}
              className="inline-flex items-center gap-1.5 text-body font-semibold text-brand hover:underline"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Usar consumo padrão{sessoes > 1 ? ` × ${sessoes} sessões` : ''}
            </button>
          </div>

          <EditorDeMateriais
            idBase={`consumo-${item.id}`}
            itens={linhasDoConsumo}
            onChange={onMudarConsumo}
            produtos={produtos}
            mostrarTotais={false}
          />

          <div className="grid grid-cols-3 gap-2 pt-2.5 border-t border-line tabular-nums">
            <div>
              <span className="block text-label text-muted">Valor de compra</span>
              <span className="text-body-lg font-semibold text-ink">{formatBRL(consumo.custo)}</span>
            </div>
            <div>
              <span className="block text-label text-muted">Repassado à cliente</span>
              <span className="text-body-lg font-semibold text-ink">
                {formatBRL(consumo.valorCliente)}
              </span>
            </div>
            <div>
              <span className="block text-label text-muted">Margem</span>
              <span
                className={`text-body-lg font-semibold ${margemDoConsumo < 0 ? 'text-danger' : 'text-ok'}`}
              >
                {formatBRL(margemDoConsumo)}
              </span>
            </div>
          </div>

          <p className="text-body text-muted">
            Na proposta da cliente saem só os nomes dos produtos — sem quantidade e sem valores.
          </p>
        </div>
      )}

      {/* Detalhes do procedimento */}
      <div className="pt-1">
        <p className="text-label font-semibold uppercase tracking-widest text-gray-400 mb-2">
          Detalhes ({item.detalhes.length})
        </p>

        <div className="space-y-2">
          {item.detalhes.map((detail) => (
            <div key={detail.id} className="flex gap-2 items-start">
              <input
                type="text"
                value={detail.titulo}
                onChange={(e) => updateDetail(detail.id, 'titulo', e.target.value)}
                placeholder="Título"
                className="w-2/5 glass-input px-2.5 py-1.5 rounded-sm text-xs text-ink focus:outline-hidden"
              />
              <input
                type="text"
                value={detail.valor}
                onChange={(e) => updateDetail(detail.id, 'valor', e.target.value)}
                placeholder="Resposta"
                className="flex-1 glass-input px-2.5 py-1.5 rounded-sm text-xs text-ink focus:outline-hidden"
              />
              <button
                type="button"
                onClick={() => removeDetail(detail.id)}
                aria-label={`Remover detalhe ${detail.titulo || 'sem título'}`}
                className="p-1.5 text-red-500 hover:text-red-700 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={addDetail}
            className="px-3 py-1.5 bg-white/60 border border-white/80 text-ink text-xs font-medium rounded-sm hover:bg-white/80 transition-colors flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Adicionar campo
          </button>
        </div>
      </div>
    </div>
  );
};

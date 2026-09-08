import React, { useState } from 'react';
import { Trash2, Plus, ChevronUp, ChevronDown, AlertCircle } from 'lucide-react';
import { QuoteItem, QuoteItemDetail } from '../../types';
import { formatBRL } from '../../utils/formatters';
import { itemValorFinal, itemDescontoPercentual } from '../../utils/quoteCalc';

interface QuoteItemEditorProps {
  item: QuoteItem;
  index: number;
  total: number;
  onChange: (item: QuoteItem) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}

/** Campos numéricos guardam o texto digitado para não travar em "0" enquanto se apaga. */
const numeroDigitado = (valor: number | undefined): string =>
  valor === undefined || valor === null || valor === 0 ? '' : String(valor);

export const QuoteItemEditor: React.FC<QuoteItemEditorProps> = ({
  item,
  index,
  total,
  onChange,
  onRemove,
  onMove,
}) => {
  const [valorTabelaStr, setValorTabelaStr] = useState(numeroDigitado(item.valorTabela));
  const [valorDescontoStr, setValorDescontoStr] = useState(numeroDigitado(item.valorComDesconto));

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
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#A67C52] mb-1 truncate">
            {item.categoria || 'Sem categoria'}
          </p>
          <input
            type="text"
            value={item.titulo}
            onChange={(e) => patch({ titulo: e.target.value })}
            placeholder="Nome do procedimento"
            className="w-full glass-input px-3 py-1.5 rounded-sm text-sm text-[#1A1A1A] focus:outline-hidden"
          />
        </div>

        <div className="flex items-center gap-0.5 pt-4 shrink-0">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label="Mover para cima"
            className="p-1 text-gray-400 hover:text-[#A67C52] disabled:opacity-25 disabled:hover:text-gray-400 transition-colors"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            aria-label="Mover para baixo"
            className="p-1 text-gray-400 hover:text-[#A67C52] disabled:opacity-25 disabled:hover:text-gray-400 transition-colors"
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

      {/* Valores */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-[11px] font-medium text-[#1A1A1A] mb-1">Valor de tabela</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={valorTabelaStr}
            onChange={(e) => {
              setValorTabelaStr(e.target.value);
              patch({ valorTabela: e.target.value === '' ? 0 : Number(e.target.value) });
            }}
            className="w-full glass-input px-3 py-1.5 rounded-sm text-sm text-[#1A1A1A] tabular-nums focus:outline-hidden"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-[11px] font-medium text-[#1A1A1A] mb-1">
            Nota de preço (opcional)
          </label>
          <input
            type="text"
            value={item.notaPreco || ''}
            onChange={(e) => patch({ notaPreco: e.target.value })}
            placeholder="por aplicação · pacote fechado · por sessão"
            className="w-full glass-input px-3 py-1.5 rounded-sm text-sm text-[#1A1A1A] focus:outline-hidden"
          />
        </div>
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
              className="w-3.5 h-3.5 accent-[#A67C52]"
            />
            <span className="text-xs font-medium text-[#1A1A1A]">Desconto</span>
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
                className="w-full glass-input px-3 py-1.5 rounded-sm text-sm text-[#1A1A1A] tabular-nums focus:outline-hidden"
              />
              {descontoInvalido ? (
                <p className="mt-1 text-[11px] text-amber-600 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  Precisa ser menor que o valor de tabela — o desconto não será aplicado
                </p>
              ) : percentual > 0 ? (
                <p className="mt-1 text-[11px] text-[#A67C52] tabular-nums">
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
              className="w-3.5 h-3.5 accent-[#A67C52]"
            />
            <span className="text-xs font-medium text-[#1A1A1A]">Mais de 1 sessão</span>
          </label>

          {item.maisDeUmaSessao && (
            <div>
              <input
                type="number"
                min="2"
                step="1"
                value={item.sessoes}
                onChange={(e) => patch({ sessoes: Math.max(2, Number(e.target.value) || 2) })}
                className="w-full glass-input px-3 py-1.5 rounded-sm text-sm text-[#1A1A1A] tabular-nums focus:outline-hidden"
              />
              <p className="mt-1 text-[11px] text-gray-400">
                Informativo no PDF — não multiplica o valor
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Detalhes do procedimento */}
      <div className="pt-1">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-2">
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
                className="w-2/5 glass-input px-2.5 py-1.5 rounded-sm text-xs text-[#1A1A1A] focus:outline-hidden"
              />
              <input
                type="text"
                value={detail.valor}
                onChange={(e) => updateDetail(detail.id, 'valor', e.target.value)}
                placeholder="Resposta"
                className="flex-1 glass-input px-2.5 py-1.5 rounded-sm text-xs text-[#1A1A1A] focus:outline-hidden"
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
            className="px-3 py-1.5 bg-white/60 border border-white/80 text-[#1A1A1A] text-xs font-medium rounded-sm hover:bg-white/80 transition-colors flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Adicionar campo
          </button>
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { Trash2, AlertCircle } from 'lucide-react';
import { PaymentMethod, QuotePaymentOption } from '../../types';
import { formatBRL } from '../../utils/formatters';
import { NOME_FORMA_PAGAMENTO } from '../../utils/quoteCalc';

interface QuotePaymentOptionEditorProps {
  opcao: QuotePaymentOption;
  /** Valor desta opção já calculado (totalBruto com o desconto dela aplicado). */
  valorFinal: number;
  parcela: number | null;
  podeRemover: boolean;
  principal: boolean;
  onChange: (opcao: QuotePaymentOption) => void;
  onRemove: () => void;
}

export const QuotePaymentOptionEditor: React.FC<QuotePaymentOptionEditorProps> = ({
  opcao,
  valorFinal,
  parcela,
  podeRemover,
  principal,
  onChange,
  onRemove,
}) => {
  const patch = (changes: Partial<QuotePaymentOption>) => onChange({ ...opcao, ...changes });
  const ehCartao = opcao.forma === 'cartao';
  const parcelas = opcao.parcelas ?? 1;
  const semJuros = opcao.parcelasSemJuros ?? 12;
  const temParcelaComJuros = ehCartao && parcelas > semJuros;

  return (
    <div className="glass-card rounded-sm p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <span className="text-label font-semibold uppercase tracking-widest text-brand pt-2">
          {principal ? 'Forma principal' : 'Forma alternativa'}
        </span>
        {podeRemover && (
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remover esta forma de pagamento"
            className="p-1 text-red-500 hover:text-red-700 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-body font-medium text-ink mb-1">Forma</label>
          <select
            value={opcao.forma}
            onChange={(e) => {
              const forma = e.target.value as PaymentMethod;
              patch({
                forma,
                parcelas: forma === 'cartao' ? opcao.parcelas || 1 : undefined,
                parcelasSemJuros: forma === 'cartao' ? opcao.parcelasSemJuros || 12 : undefined,
              });
            }}
            className="w-full glass-input px-3 py-1.5 rounded-sm text-sm text-ink focus:outline-hidden"
          >
            <option value="pix">{NOME_FORMA_PAGAMENTO.pix}</option>
            <option value="cartao">{NOME_FORMA_PAGAMENTO.cartao}</option>
            <option value="dinheiro">{NOME_FORMA_PAGAMENTO.dinheiro}</option>
          </select>
        </div>

        {ehCartao && (
          <div>
            <label className="block text-body font-medium text-ink mb-1">Parcelas</label>
            <select
              value={parcelas}
              onChange={(e) => patch({ parcelas: Number(e.target.value) })}
              className="w-full glass-input px-3 py-1.5 rounded-sm text-sm text-ink focus:outline-hidden"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}×
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {ehCartao && (
        <div>
          <label className="block text-body font-medium text-ink mb-1">
            Sem juros até quantas parcelas
          </label>
          <select
            value={semJuros}
            onChange={(e) => patch({ parcelasSemJuros: Number(e.target.value) })}
            className="w-full sm:w-48 glass-input px-3 py-1.5 rounded-sm text-sm text-ink focus:outline-hidden"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                até {n}×
              </option>
            ))}
          </select>
          {temParcelaComJuros ? (
            <p className="mt-1 text-body text-amber-600 flex items-center gap-1">
              <AlertCircle className="w-3 h-3 shrink-0" />
              Da {semJuros + 1}ª parcela em diante pode haver juros da operadora — confirme na
              maquininha.
            </p>
          ) : (
            <p className="mt-1 text-body text-gray-400">
              {parcelas}× cabe dentro do limite sem juros
            </p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={opcao.temDesconto}
            onChange={(e) =>
              patch({
                temDesconto: e.target.checked,
                descontoPercentual: e.target.checked ? opcao.descontoPercentual : undefined,
              })
            }
            className="w-3.5 h-3.5 accent-brand"
          />
          <span className="text-xs font-medium text-ink">Desconto nesta forma</span>
        </label>

        {opcao.temDesconto && (
          <div className="w-32">
            <input
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={opcao.descontoPercentual ?? ''}
              onChange={(e) => patch({ descontoPercentual: Number(e.target.value) || 0 })}
              placeholder="%"
              className="w-full glass-input px-3 py-1.5 rounded-sm text-sm text-ink tabular-nums focus:outline-hidden"
            />
          </div>
        )}
      </div>

      <div className="pt-2 border-t border-white/60 flex items-center justify-between text-sm">
        <span className="text-gray-500">
          {NOME_FORMA_PAGAMENTO[opcao.forma]}
          {ehCartao && parcelas > 1 ? `, ${parcelas}×` : ''}
        </span>
        <span className="font-semibold text-ink tabular-nums">
          {parcela !== null ? `${parcelas} × ${formatBRL(parcela)}` : formatBRL(valorFinal)}
        </span>
      </div>
    </div>
  );
};

import React from 'react';
import { Trash2 } from 'lucide-react';
import { PaymentMethod, QuotePaymentOption } from '../../types';
import { formatBRL } from '../../utils/formatters';
import { NOME_FORMA_PAGAMENTO } from '../../utils/quoteCalc';
import { CampoTinta, INPUT_TINTA, PilulasDeEscolha, SetaDoSelect } from '../common/Tinta';
import { OpcaoLigavel } from './PecasDoOrcamento';

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
    <div className="rounded-[20px] bg-card border border-ink/10 p-4 sm:p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span className="text-[16px] font-bold text-ink">{principal ? 'Forma principal' : 'Forma alternativa'}</span>
          {principal && (
            <span className="text-[12px] font-semibold text-ink-soft bg-line-soft rounded-full px-2 py-0.5">
              valor do bloco preto
            </span>
          )}
        </span>
        {podeRemover && (
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remover esta forma de pagamento"
            title="Remover"
            className="w-9 h-9 -mr-1 rounded-full flex items-center justify-center text-ink-soft hover:bg-danger-bg hover:text-danger transition-colors"
          >
            <Trash2 className="w-[18px] h-[18px]" />
          </button>
        )}
      </div>

      {/* A forma em pílulas: três escolhas curtas, todas à vista, em vez de uma lista suspensa. */}
      <PilulasDeEscolha
        rotulo="Forma de pagamento"
        compacta
        opcoes={(['pix', 'cartao', 'dinheiro'] as PaymentMethod[]).map((f) => ({ id: f, rotulo: NOME_FORMA_PAGAMENTO[f] }))}
        valor={opcao.forma}
        onMudar={(valor) => {
          if (!valor) return;
          const forma = valor as PaymentMethod;
          patch({
            forma,
            parcelas: forma === 'cartao' ? opcao.parcelas || 1 : undefined,
            parcelasSemJuros: forma === 'cartao' ? opcao.parcelasSemJuros || 12 : undefined,
          });
        }}
      />

      {ehCartao && (
        <div className="grid grid-cols-2 gap-2.5">
          <CampoTinta rotulo="Parcelas" htmlFor={`pagamento-parcelas-${opcao.id}`} sufixo={<SetaDoSelect />}>
            <select
              id={`pagamento-parcelas-${opcao.id}`}
              value={parcelas}
              onChange={(e) => patch({ parcelas: Number(e.target.value) })}
              className={`${INPUT_TINTA} appearance-none cursor-pointer`}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}×
                </option>
              ))}
            </select>
          </CampoTinta>
          <CampoTinta rotulo="Sem juros até" htmlFor={`pagamento-sem-juros-${opcao.id}`} sufixo={<SetaDoSelect />}>
            <select
              id={`pagamento-sem-juros-${opcao.id}`}
              value={semJuros}
              onChange={(e) => patch({ parcelasSemJuros: Number(e.target.value) })}
              className={`${INPUT_TINTA} appearance-none cursor-pointer`}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}×
                </option>
              ))}
            </select>
          </CampoTinta>
          <p
            className={`col-span-2 -mt-1 px-1 text-[13px] leading-snug ${
              temParcelaComJuros ? 'text-warn font-semibold' : 'text-ink-soft'
            }`}
          >
            {temParcelaComJuros
              ? `Da ${semJuros + 1}ª parcela em diante pode haver juros da operadora — confirme na maquininha.`
              : `${parcelas}× cabe dentro do limite sem juros.`}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2.5">
        <OpcaoLigavel
          ligada={opcao.temDesconto}
          onMudar={(ligada) =>
            patch({ temDesconto: ligada, descontoPercentual: ligada ? opcao.descontoPercentual : undefined })
          }
        >
          Desconto nesta forma
        </OpcaoLigavel>
        {opcao.temDesconto && (
          <CampoTinta
            rotulo="Desconto"
            htmlFor={`pagamento-desconto-${opcao.id}`}
            sufixo={<span className="text-[16px] font-semibold text-ink-soft">%</span>}
            className="w-32"
          >
            <input
              id={`pagamento-desconto-${opcao.id}`}
              type="number"
              min="0"
              max="100"
              step="0.5"
              inputMode="decimal"
              value={opcao.descontoPercentual ?? ''}
              onChange={(e) => patch({ descontoPercentual: Number(e.target.value) || 0 })}
              placeholder="0"
              className={`${INPUT_TINTA} tabular-nums`}
            />
          </CampoTinta>
        )}
      </div>

      {/* O que a cliente vê nesta forma — o número do cartão. */}
      <div className="pt-3 border-t border-ink/8 flex items-baseline justify-between gap-3">
        <span className="text-[14px] font-semibold text-ink-soft">
          {NOME_FORMA_PAGAMENTO[opcao.forma]}
          {ehCartao && parcelas > 1 ? ` em ${parcelas}×` : ''}
        </span>
        <span className="text-[19px] font-bold text-ink tabular-nums">
          {parcela !== null ? `${parcelas} × ${formatBRL(parcela)}` : formatBRL(valorFinal)}
        </span>
      </div>
    </div>
  );
};

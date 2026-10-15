import React from 'react';
import { Eye, FileText, Paperclip, Pencil, Trash2 } from 'lucide-react';
import { Recibo } from '../../types';
import { formatBRL } from '../../utils/formatters';
import { rotuloCurtoDoPagamento } from '../../utils/recibos';
import { AcaoDoMenu, MenuDeAcoes, Selo } from '../common/Tinta';
import { useRecibos } from './RecibosContext';

/** "2026-10-14" → "14 OUT". */
const diaEMes = (dia: string): string => {
  const d = new Date(`${dia}T12:00:00`);
  if (isNaN(d.getTime())) return '';
  const mes = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase();
  return `${String(d.getDate()).padStart(2, '0')} ${mes}`;
};

/**
 * Um recibo na lista, no mesmo desenho do cartão de orçamento: número e data, a forma de
 * pagamento em pílula, a cliente e o valor grande — e uma ação principal, ver o recibo (de onde
 * ele é baixado e enviado). Editar e excluir moram no "…".
 */
export const CartaoDeRecibo: React.FC<{
  recibo: Recibo;
  /** Abre o orçamento de origem — só onde há para onde ir. */
  onAbrirOrcamento?: (quoteId: string) => void;
}> = ({ recibo, onAbrirOrcamento }) => {
  const ctx = useRecibos();
  if (!ctx) return null;

  const menu: AcaoDoMenu[] = [
    { rotulo: 'Editar recibo', icone: Pencil, onClick: () => ctx.abrirEdicao(recibo) },
  ];
  if (recibo.quoteId && onAbrirOrcamento) {
    menu.push({
      rotulo: `Ver o orçamento ${recibo.quoteNumero || ''}`.trim(),
      icone: FileText,
      onClick: () => onAbrirOrcamento(recibo.quoteId!),
    });
  }
  menu.push({ rotulo: 'Excluir recibo', icone: Trash2, tom: 'perigo', onClick: () => ctx.pedirExclusao(recibo) });

  const origem = recibo.quoteNumero ? `orçamento ${recibo.quoteNumero}` : 'sem orçamento';
  const linha = [recibo.referente, origem].filter(Boolean).join(' · ');

  return (
    <article className="rounded-[20px] bg-card border border-ink/8 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-semibold tracking-[.04em] text-ink-soft tabular-nums truncate">
          Recibo {recibo.numero} · {diaEMes(recibo.dataPagamento)}
        </p>
        <Selo className="bg-ok-bg text-ok">
          {rotuloCurtoDoPagamento(recibo)}
          {recibo.comprovante && <Paperclip className="w-3 h-3" aria-label="com comprovante" />}
        </Selo>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[17px] font-bold text-ink truncate">{recibo.pacienteNome}</p>
          <p className="text-[13px] text-ink-soft truncate">{linha}</p>
        </div>
        <p className="shrink-0 text-[22px] font-bold tracking-[-0.01em] text-ink tabular-nums">
          {formatBRL(recibo.valor)}
        </p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => ctx.abrirPrevia(recibo)}
          className="flex-1 min-w-0 h-11 rounded-xl px-3 text-[14px] font-semibold flex items-center justify-center gap-2 transition-colors border border-ink/15 text-ink hover:border-ink/40"
        >
          <Eye className="w-4 h-4 shrink-0" />
          <span className="truncate">Ver, baixar e enviar</span>
        </button>
        <MenuDeAcoes acoes={menu} rotulo={`Mais ações do recibo ${recibo.numero}`} titulo={`Recibo ${recibo.numero}`} />
      </div>
    </article>
  );
};

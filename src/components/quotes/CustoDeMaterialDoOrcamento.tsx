import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Eye, EyeOff, PackageOpen, RotateCcw } from 'lucide-react';
import { ProdutoDeEstoque, QuoteItem } from '../../types';
import { formatBRL } from '../../utils/formatters';
import { LinhaDeMaterial, totaisDosMateriais } from '../../utils/estoque';
import { itemSessoes } from '../../utils/quoteCalc';
import { margemDoPeriodo } from '../../utils/indicadores';
import { EditorDeMateriais } from '../estoque/EditorDeMateriais';

interface CustoDeMaterialDoOrcamentoProps {
  itens: QuoteItem[];
  /** Linhas de material por item (id do item no formulário). */
  custos: Record<string, LinhaDeMaterial[]>;
  produtos: ProdutoDeEstoque[];
  /** O total do orçamento — a base da margem estimada. */
  totalDoOrcamento: number;
  onChange: (itemId: string, linhas: LinhaDeMaterial[]) => void;
  /** Volta o item a seguir o consumo padrão × sessões. */
  onRecalcular: (itemId: string) => void;
  /** Custos à vista — o mesmo interruptor do olho no topo da seção de procedimentos. */
  visivel: boolean;
  onAlternarVisivel: () => void;
}

/**
 * O custo de material do orçamento — só para a equipe.
 *
 * Nasce do consumo padrão de cada procedimento vezes o número de sessões do item, e cada linha é
 * editável. Não soma no total — a não ser no item marcado "calcular por consumo de produto", em
 * que o repassado à cliente **é** o valor do item —, não sai no PDF e não chega ao link da
 * cliente: o documento que ela lê nem carrega estes números (moram em `quote_costs`, fora de
 * `quotes`). Do consumo, a cliente vê só o nome dos produtos.
 *
 * A margem estimada é o total do orçamento menos o custo de material — o que sobra para
 * honorário, impostos e o resto da clínica.
 *
 * Começa fechado, a cada abertura: o orçamento costuma ser montado com a paciente por perto, e
 * custo e margem não são para ela ver. Fechado, nenhum número aparece; a conta continua sendo
 * feita e gravada do mesmo jeito, porque o estado mora no formulário. Abrir aqui ou no olho do
 * topo da seção de procedimentos é a mesma coisa (`mostrarCustos` em `useOrcamentoEmEdicao`).
 */
export const CustoDeMaterialDoOrcamento: React.FC<CustoDeMaterialDoOrcamentoProps> = ({
  itens,
  custos,
  produtos,
  totalDoOrcamento,
  onChange,
  onRecalcular,
  visivel,
  onAlternarVisivel,
}) => {
  const [abertos, setAbertos] = useState<Set<string>>(new Set());

  if (itens.length === 0) return null;

  const todas = itens.flatMap((i) => custos[i.id] || []);
  const totais = totaisDosMateriais(todas);
  const margem = margemDoPeriodo(totalDoOrcamento, totais.custo);
  const semEstoque = produtos.length === 0 && todas.length === 0;

  const alternar = (id: string) =>
    setAbertos((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });

  return (
    <div className="rounded-[20px] border border-dashed border-ink/20 p-4 sm:p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-sans text-[16px] font-bold text-ink flex items-center gap-2">
            <PackageOpen className="w-[18px] h-[18px] shrink-0" />
            Custo de material
          </h3>
          <p className="mt-1 text-[13px] leading-snug text-ink-soft">
            Só para a equipe — não sai no PDF nem no link da cliente. Só soma no total no item
            calculado por consumo de produto.
          </p>
        </div>
        <button
          type="button"
          onClick={onAlternarVisivel}
          aria-expanded={visivel}
          className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-ink/15 text-[13px] font-semibold text-ink hover:border-ink/40 transition-colors"
        >
          {visivel ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          {visivel ? 'Esconder' : 'Ver'}
        </button>
      </div>

      {!visivel ? null : semEstoque ? (
        <p className="text-[14px] text-ink-soft">
          Cadastre os produtos e o consumo por procedimento em <strong className="text-ink">Estoque</strong> para o custo
          vir preenchido aqui.
        </p>
      ) : (
        <>
          <div className="rounded-2xl border border-ink/10 bg-card divide-y divide-ink/8 overflow-hidden">
            {itens.map((item) => {
              const linhas = custos[item.id] || [];
              const doItem = totaisDosMateriais(linhas);
              const sessoes = itemSessoes(item);
              const aberto = abertos.has(item.id);
              return (
                <div key={item.id}>
                  <button
                    type="button"
                    onClick={() => alternar(item.id)}
                    aria-expanded={aberto}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-surface-2 transition-colors"
                  >
                    {aberto ? (
                      <ChevronDown className="w-4 h-4 text-muted shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted shrink-0" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold text-ink truncate">
                        {item.titulo || 'Procedimento sem nome'}
                      </span>
                      <span className="block text-[13px] text-ink-soft">
                        {linhas.length === 0
                          ? 'Sem material'
                          : `${linhas.length} ${linhas.length === 1 ? 'material' : 'materiais'}`}
                        {sessoes > 1 ? ` · ${sessoes} sessões` : ''}
                        {item.calculadoPorConsumo ? ' · dá o valor do item' : ''}
                      </span>
                    </span>
                    <span className="text-right tabular-nums shrink-0">
                      <span className="block text-[15px] font-bold text-ink">
                        {formatBRL(doItem.custo)}
                      </span>
                      {doItem.valorCliente > 0 && (
                        <span className="block text-[12px] text-ink-soft">
                          cliente {formatBRL(doItem.valorCliente)}
                        </span>
                      )}
                    </span>
                  </button>

                  {aberto && (
                    <div className="px-3 pb-3 space-y-2 bg-surface">
                      <EditorDeMateriais
                        idBase={`custo-${item.id}`}
                        itens={linhas}
                        onChange={(novas) => onChange(item.id, novas)}
                        produtos={produtos}
                        mostrarTotais={false}
                      />
                      <button
                        type="button"
                        onClick={() => onRecalcular(item.id)}
                        className="inline-flex items-center gap-1.5 min-h-[36px] text-[14px] font-semibold text-ink underline underline-offset-2 hover:no-underline"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Recalcular pelo consumo padrão
                        {sessoes > 1 ? ` × ${sessoes} sessões` : ''}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="rounded-2xl bg-card border border-ink/10 p-4 space-y-1.5 text-[14px] tabular-nums">
            <div className="flex justify-between gap-3 text-ink-soft">
              <span>Custo estimado de material</span>
              <span className="font-semibold text-ink">{formatBRL(totais.custo)}</span>
            </div>
            <div className="flex justify-between gap-3 text-ink-soft">
              <span>Valor de material para a cliente</span>
              <span className="font-semibold text-ink">{formatBRL(totais.valorCliente)}</span>
            </div>
            <div className="flex justify-between gap-3 text-ink-soft">
              <span>Total do orçamento</span>
              <span className="font-semibold text-ink">{formatBRL(totalDoOrcamento)}</span>
            </div>
            <div
              className={`flex justify-between gap-3 pt-2 mt-1 border-t border-ink/10 text-[16px] font-bold ${
                margem.valor < 0 ? 'text-danger' : 'text-ink'
              }`}
            >
              <span>Margem estimada</span>
              <span>
                {formatBRL(margem.valor)}
                {margem.percentual !== null && (
                  <span className="text-[13px] font-semibold text-ink-soft"> ({margem.percentual}%)</span>
                )}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

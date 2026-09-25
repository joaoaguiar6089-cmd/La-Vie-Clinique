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
}

/**
 * O custo de material do orçamento — só para a equipe.
 *
 * Nasce do consumo padrão de cada procedimento vezes o número de sessões do item, e cada linha é
 * editável. Não soma no total, não sai no PDF e não chega ao link da cliente: o documento que ela
 * lê nem carrega estes números (moram em `quote_costs`, fora de `quotes`).
 *
 * A margem estimada é o total do orçamento menos o custo de material — o que sobra para
 * honorário, impostos e o resto da clínica.
 *
 * Começa fechado, a cada abertura: o orçamento costuma ser montado com a paciente por perto, e
 * custo e margem não são para ela ver. Fechado, nenhum número aparece; a conta continua sendo
 * feita e gravada do mesmo jeito, porque o estado mora no formulário.
 */
export const CustoDeMaterialDoOrcamento: React.FC<CustoDeMaterialDoOrcamentoProps> = ({
  itens,
  custos,
  produtos,
  totalDoOrcamento,
  onChange,
  onRecalcular,
}) => {
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [visivel, setVisivel] = useState(false);

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
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 pb-1 border-b border-white/60">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-brand flex items-center gap-1.5">
          <PackageOpen className="w-3.5 h-3.5" />
          Custo de material
        </h3>
        <button
          type="button"
          onClick={() => setVisivel((atual) => !atual)}
          aria-expanded={visivel}
          className="inline-flex items-center gap-1.5 min-h-[36px] px-2 -mr-2 rounded-lg text-body font-semibold text-brand hover:bg-surface-2 transition-colors"
        >
          {visivel ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {visivel ? 'Esconder' : 'Ver custo e margem'}
        </button>
      </div>
      <p className="text-body text-muted -mt-1">
        Só para a equipe — não soma no total, não sai no PDF nem no link da cliente.
      </p>

      {!visivel ? null : semEstoque ? (
        <p className="text-body text-muted">
          Cadastre os produtos e o consumo por procedimento em <strong>Estoque</strong> para o custo
          vir preenchido aqui.
        </p>
      ) : (
        <>
          <div className="rounded-xl border border-line bg-card divide-y divide-line overflow-hidden">
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
                      <span className="block text-body-lg text-ink truncate">
                        {item.titulo || 'Procedimento sem nome'}
                      </span>
                      <span className="block text-body text-muted">
                        {linhas.length === 0
                          ? 'Sem material'
                          : `${linhas.length} ${linhas.length === 1 ? 'material' : 'materiais'}`}
                        {sessoes > 1 ? ` · ${sessoes} sessões` : ''}
                      </span>
                    </span>
                    <span className="text-right tabular-nums shrink-0">
                      <span className="block text-body-lg font-semibold text-ink">
                        {formatBRL(doItem.custo)}
                      </span>
                      {doItem.valorCliente > 0 && (
                        <span className="block text-label text-muted">
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
                        className="inline-flex items-center gap-1.5 text-body font-semibold text-brand hover:underline"
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

          <div className="glass-card rounded-sm p-4 space-y-1.5 text-sm tabular-nums">
            <div className="flex justify-between text-gray-600">
              <span>Custo estimado de material</span>
              <span>{formatBRL(totais.custo)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Valor de material para a cliente</span>
              <span>{formatBRL(totais.valorCliente)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Total do orçamento</span>
              <span>{formatBRL(totalDoOrcamento)}</span>
            </div>
            <div
              className={`flex justify-between pt-2 mt-1 border-t border-line font-semibold ${
                margem.valor < 0 ? 'text-danger' : 'text-ink'
              }`}
            >
              <span>Margem estimada</span>
              <span>
                {formatBRL(margem.valor)}
                {margem.percentual !== null && (
                  <span className="text-body font-medium text-muted"> ({margem.percentual}%)</span>
                )}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

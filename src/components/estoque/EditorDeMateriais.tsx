import React from 'react';
import { Trash2 } from 'lucide-react';
import { LoteDeEstoque, ProdutoDeEstoque } from '../../types';
import { formatBRL } from '../../utils/formatters';
import {
  LinhaDeMaterial,
  custoDaLinha,
  linhaAvulsa,
  linhaDoProduto,
  numeroValido,
  produtosAtivos,
  totaisDosMateriais,
  valorClienteDaLinha,
  quantidadeComUnidade,
} from '../../utils/estoque';
import { ordemDeSaida, rotuloDaSaida } from '../../utils/lotes';

interface EditorDeMateriaisProps {
  itens: LinhaDeMaterial[];
  onChange: (itens: LinhaDeMaterial[]) => void;
  /** Todos os produtos, arquivados inclusive — uma linha antiga pode apontar para um deles. */
  produtos: ProdutoDeEstoque[];
  /** Oferece "Outro material…", digitado à mão. Desligado no consumo padrão, que é só do estoque. */
  permitirAvulso?: boolean;
  /**
   * Mostra os valores: os unitários, editáveis, e o custo de cada linha. Desligado no consumo
   * padrão, que é só material e quantidade, e no acompanhamento, preenchido ao lado da paciente —
   * as linhas continuam carregando o preço, só não o mostram.
   */
  mostrarValores?: boolean;
  /**
   * Com os valores à vista, mostra também o custo por unidade (o que a clínica pagou). Desligado
   * no consumo do orçamento enquanto os custos estão escondidos — ele é preenchido com a cliente
   * por perto, e ela vê só a quantidade e o valor dela.
   */
  mostrarCusto?: boolean;
  /**
   * O total de cada linha: o custo para a clínica (padrão) ou o valor para a cliente — no item
   * calculado por consumo de produto, é o valor da cliente que vira o preço do item.
   */
  totalDaLinha?: 'custo' | 'cliente';
  /** Mostra a linha de totais embaixo. */
  mostrarTotais?: boolean;
  /** Oferece, nas linhas avulsas, "cadastrar este material no estoque ao salvar". */
  oferecerCadastro?: boolean;
  /** Id base dos campos, para os `label` não colidirem com outro editor na mesma tela. */
  idBase: string;
  /**
   * Os lotes do estoque. Com eles, cada linha de produto mostra de que lote saiu e deixa trocar —
   * é o detalhe dos materiais do atendimento, onde a baixa no estoque fica rastreada.
   */
  lotes?: LoteDeEstoque[];
}

/** O campo de cada linha: o preenchido do redesign, compacto — várias linhas cabem na tela. */
const inputClass =
  'w-full h-11 px-3 rounded-xl border-0 bg-line-soft text-[15px] font-semibold text-ink tabular-nums transition-colors focus:outline-none focus:bg-card focus:ring-2 focus:ring-ink';
const miniLabel = 'block text-[12px] font-semibold text-ink-soft mb-1';

const OUTRO = '__outro__';

/**
 * A lista de materiais: produto, quantidade, valores e total de cada linha.
 *
 * O mesmo editor serve ao consumo padrão do procedimento, aos materiais do atendimento (no
 * acompanhamento e no detalhe do Financeiro) e ao custo estimado do orçamento — telas que precisam
 * das mesmas linhas, e com valores, da mesma conta, feita do mesmo jeito. No consumo padrão e no
 * acompanhamento ficam só material e quantidade. "Adicionar material" é uma lista suspensa dos
 * produtos do estoque, com a opção de digitar outro.
 */
export const EditorDeMateriais: React.FC<EditorDeMateriaisProps> = ({
  itens,
  onChange,
  produtos,
  permitirAvulso = true,
  mostrarValores = true,
  mostrarCusto = true,
  totalDaLinha = 'custo',
  mostrarTotais = true,
  oferecerCadastro = false,
  idBase,
  lotes,
}) => {
  const ativos = produtosAtivos(produtos);
  const totais = totaisDosMateriais(itens);

  const trocar = (indice: number, patch: Partial<LinhaDeMaterial>) =>
    onChange(itens.map((m, i) => (i === indice ? { ...m, ...patch } : m)));

  const remover = (indice: number) => onChange(itens.filter((_, i) => i !== indice));

  const adicionar = (escolha: string) => {
    if (!escolha) return;
    if (escolha === OUTRO) {
      onChange([...itens, linhaAvulsa()]);
      return;
    }
    const produto = produtos.find((p) => p.id === escolha);
    if (produto) onChange([...itens, linhaDoProduto(produto, 1)]);
  };

  /** Trocar o produto de uma linha traz o preço de hoje dele, mas mantém a quantidade. */
  const trocarProduto = (indice: number, produtoId: string) => {
    const produto = produtos.find((p) => p.id === produtoId);
    if (!produto) return;
    trocar(indice, linhaDoProduto(produto, itens[indice].quantidade));
  };

  return (
    <div className="space-y-2.5">
      {itens.length === 0 && (
        <p className="text-[14px] text-ink-soft py-2">Nenhum material nesta lista.</p>
      )}

      {itens.map((m, i) => {
        const produto = m.produtoId ? produtos.find((p) => p.id === m.produtoId) : undefined;
        const id = `${idBase}-${i}`;
        return (
          <div key={i} className="p-3 rounded-2xl border border-ink/10 bg-card space-y-2.5">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                {m.produtoId ? (
                  <>
                    <label className="sr-only" htmlFor={`${id}-produto`}>
                      Material
                    </label>
                    <select
                      id={`${id}-produto`}
                      value={m.produtoId}
                      onChange={(e) => trocarProduto(i, e.target.value)}
                      className={inputClass}
                    >
                      {/* Produto arquivado ou excluído continua aparecendo na linha que já o usa. */}
                      {!ativos.some((p) => p.id === m.produtoId) && (
                        <option value={m.produtoId}>
                          {m.nome}
                          {produto?.arquivado ? ' (arquivado)' : produto ? '' : ' (fora do estoque)'}
                        </option>
                      )}
                      {ativos.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nome}
                          {p.marca ? ` — ${p.marca}` : ''}
                        </option>
                      ))}
                    </select>
                  </>
                ) : (
                  <div className="flex gap-2">
                    <div className="flex-1 min-w-0">
                      <label className="sr-only" htmlFor={`${id}-nome`}>
                        Nome do material
                      </label>
                      <input
                        id={`${id}-nome`}
                        value={m.nome}
                        onChange={(e) => trocar(i, { nome: e.target.value })}
                        placeholder="Nome do material"
                        className={inputClass}
                      />
                    </div>
                    <div className="w-24 shrink-0">
                      <label className="sr-only" htmlFor={`${id}-unidade`}>
                        Unidade
                      </label>
                      <input
                        id={`${id}-unidade`}
                        value={m.unidade}
                        onChange={(e) => trocar(i, { unidade: e.target.value })}
                        placeholder="un"
                        className={inputClass}
                      />
                    </div>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => remover(i)}
                aria-label={`Remover ${m.nome || 'material'}`}
                className="w-11 h-11 shrink-0 flex items-center justify-center rounded-full text-ink-soft hover:text-danger hover:bg-danger-bg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div
              className={`grid gap-2 ${
                !mostrarValores
                  ? 'grid-cols-2'
                  : mostrarCusto
                  ? 'grid-cols-2 sm:grid-cols-4'
                  : 'grid-cols-2 sm:grid-cols-3'
              }`}
            >
              <div>
                <label className={miniLabel} htmlFor={`${id}-qtd`}>
                  Quantidade ({m.unidade || 'un'})
                </label>
                <input
                  id={`${id}-qtd`}
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={Number.isFinite(m.quantidade) && m.quantidade !== 0 ? m.quantidade : ''}
                  onChange={(e) => trocar(i, { quantidade: numeroValido(e.target.value) })}
                  className={inputClass}
                />
              </div>
              {mostrarValores && (
                <>
                  {mostrarCusto && (
                    <div>
                      <label className={miniLabel} htmlFor={`${id}-custo`}>
                        Custo / {m.unidade || 'un'}
                      </label>
                      <input
                        id={`${id}-custo`}
                        type="number"
                        min="0"
                        step="0.0001"
                        inputMode="decimal"
                        value={m.custoUnitario || ''}
                        onChange={(e) => trocar(i, { custoUnitario: numeroValido(e.target.value) })}
                        className={inputClass}
                      />
                    </div>
                  )}
                  <div>
                    <label className={miniLabel} htmlFor={`${id}-cliente`}>
                      Cliente / {m.unidade || 'un'}
                    </label>
                    <input
                      id={`${id}-cliente`}
                      type="number"
                      min="0"
                      step="0.0001"
                      inputMode="decimal"
                      value={m.valorCliente || ''}
                      onChange={(e) => trocar(i, { valorCliente: numeroValido(e.target.value) })}
                      className={inputClass}
                    />
                  </div>
                  <div className="flex flex-col justify-end">
                    <span className={miniLabel}>
                      {totalDaLinha === 'cliente' ? 'Valor da linha' : 'Custo da linha'}
                    </span>
                    <span className="text-[16px] font-bold text-ink tabular-nums h-11 flex items-center">
                      {formatBRL(totalDaLinha === 'cliente' ? valorClienteDaLinha(m) : custoDaLinha(m))}
                    </span>
                  </div>
                </>
              )}
            </div>

            {lotes && m.produtoId && (() => {
              const doProduto = lotes.filter((l) => l.produtoId === m.produtoId).sort(ordemDeSaida);
              const saidas = m.lotes || [];
              if (doProduto.length === 0 && saidas.length === 0) return null;
              // Uma saída só: é ela que aparece escolhida. Várias (o lote acabou no meio): automático.
              const escolhido = saidas.length === 1 ? saidas[0].loteId : '';
              return (
                <div>
                  <label className={miniLabel} htmlFor={`${id}-lote`}>
                    Lote
                  </label>
                  <select
                    id={`${id}-lote`}
                    value={escolhido}
                    onChange={(e) => {
                      const lote = doProduto.find((l) => l.id === e.target.value);
                      trocar(i, {
                        lotes: lote
                          ? [{ loteId: lote.id, lote: lote.lote, validade: lote.validade, quantidade: m.quantidade }]
                          : undefined,
                      });
                    }}
                    className={inputClass}
                  >
                    <option value="">
                      {saidas.length > 1
                        ? saidas.map((s) => `${rotuloDaSaida(s)} (${quantidadeComUnidade(s.quantidade, m.unidade)})`).join(' + ')
                        : 'Automático — o lote que vence primeiro'}
                    </option>
                    {doProduto.map((l) => (
                      <option key={l.id} value={l.id}>
                        {rotuloDaSaida(l)} — {l.saldo > 0 ? `${quantidadeComUnidade(l.saldo, m.unidade)} no estoque` : 'esgotado'}
                      </option>
                    ))}
                  </select>
                  {saidas.length === 0 && (
                    <p className="mt-1 text-[13px] text-ink-soft">O lote é definido ao salvar.</p>
                  )}
                </div>
              );
            })()}

            {/* No acompanhamento não há campo de valor: o material de fora do estoque entra sem
                preço, e o Financeiro avisa que falta completar. */}
            {!m.produtoId && permitirAvulso && !mostrarValores && (
              <p className="text-[13px] text-ink-soft">
                O valor deste material é completado depois, no Financeiro.
              </p>
            )}

            {!m.produtoId && permitirAvulso && oferecerCadastro && (
              <label className="flex items-center gap-2 min-h-[32px] text-[14px] font-medium text-ink cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!m.cadastrarNoEstoque}
                  onChange={(e) => trocar(i, { cadastrarNoEstoque: e.target.checked })}
                  className="w-[18px] h-[18px] accent-ink"
                />
                Cadastrar este material no estoque ao salvar
              </label>
            )}
          </div>
        );
      })}

      <div>
        <label className="sr-only" htmlFor={`${idBase}-adicionar`}>
          Adicionar material
        </label>
        <select
          id={`${idBase}-adicionar`}
          value=""
          onChange={(e) => adicionar(e.target.value)}
          className="w-full sm:w-auto min-h-[44px] px-3.5 rounded-xl border border-dashed border-ink/25 bg-card text-[14px] font-semibold text-ink hover:border-ink/50 focus:outline-none focus:ring-2 focus:ring-ink cursor-pointer"
        >
          <option value="">+ Adicionar material…</option>
          {ativos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
              {p.marca ? ` — ${p.marca}` : ''} ({p.unidade})
            </option>
          ))}
          {permitirAvulso && <option value={OUTRO}>Outro material (fora do estoque)…</option>}
        </select>
        {ativos.length === 0 && (
          <p className="mt-1 text-[13px] text-ink-soft">
            Nenhum produto cadastrado no Estoque ainda
            {permitirAvulso ? ' — dá para lançar como "outro material".' : '.'}
          </p>
        )}
      </div>

      {mostrarTotais && itens.length > 0 && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pt-2 border-t border-ink/10">
          <span className="text-[14px] text-ink-soft">
            Valor para a cliente:{' '}
            <strong className="text-ink tabular-nums">{formatBRL(totais.valorCliente)}</strong>
          </span>
          {mostrarCusto && (
            <span className="text-body-lg text-ink">
              Custo total:{' '}
              <strong className="font-serif-luxury text-title tabular-nums">
                {formatBRL(totais.custo)}
              </strong>
            </span>
          )}
        </div>
      )}
    </div>
  );
};

import React from 'react';
import { Trash2 } from 'lucide-react';
import { ProdutoDeEstoque } from '../../types';
import { formatBRL } from '../../utils/formatters';
import {
  LinhaDeMaterial,
  custoDaLinha,
  linhaAvulsa,
  linhaDoProduto,
  numeroValido,
  produtosAtivos,
  totaisDosMateriais,
} from '../../utils/estoque';

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
  /** Mostra a linha de totais embaixo. */
  mostrarTotais?: boolean;
  /** Oferece, nas linhas avulsas, "cadastrar este material no estoque ao salvar". */
  oferecerCadastro?: boolean;
  /** Id base dos campos, para os `label` não colidirem com outro editor na mesma tela. */
  idBase: string;
}

const inputClass =
  'w-full glass-input px-2.5 py-1.5 rounded-sm text-sm text-ink focus:outline-hidden tabular-nums';
const miniLabel = 'block text-label text-gray-400 mb-0.5';

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
  mostrarTotais = true,
  oferecerCadastro = false,
  idBase,
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
        <p className="text-body text-gray-400 py-2">Nenhum material nesta lista.</p>
      )}

      {itens.map((m, i) => {
        const produto = m.produtoId ? produtos.find((p) => p.id === m.produtoId) : undefined;
        const id = `${idBase}-${i}`;
        return (
          <div key={i} className="p-3 rounded-xl border border-line bg-card space-y-2.5">
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
                className="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg text-gray-400 hover:text-danger hover:bg-danger-bg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div className={`grid gap-2 ${mostrarValores ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2'}`}>
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
                    <span className={miniLabel}>Custo da linha</span>
                    <span className="text-body-lg font-semibold text-ink tabular-nums py-1">
                      {formatBRL(custoDaLinha(m))}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* No acompanhamento não há campo de valor: o material de fora do estoque entra sem
                preço, e o Financeiro avisa que falta completar. */}
            {!m.produtoId && permitirAvulso && !mostrarValores && (
              <p className="text-body text-muted">
                O valor deste material é completado depois, no Financeiro.
              </p>
            )}

            {!m.produtoId && permitirAvulso && oferecerCadastro && (
              <label className="flex items-center gap-2 text-body text-ink-soft cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!m.cadastrarNoEstoque}
                  onChange={(e) => trocar(i, { cadastrarNoEstoque: e.target.checked })}
                  className="w-3.5 h-3.5 accent-brand"
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
          className="w-full sm:w-auto min-h-[40px] px-3 rounded-lg border border-dashed border-brand/50 bg-card text-body font-semibold text-brand-hover focus:outline-hidden cursor-pointer"
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
          <p className="mt-1 text-body text-gray-400">
            Nenhum produto cadastrado no Estoque ainda
            {permitirAvulso ? ' — dá para lançar como "outro material".' : '.'}
          </p>
        )}
      </div>

      {mostrarTotais && itens.length > 0 && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pt-2 border-t border-line">
          <span className="text-body text-muted">
            Valor para a cliente:{' '}
            <strong className="text-ink tabular-nums">{formatBRL(totais.valorCliente)}</strong>
          </span>
          <span className="text-body-lg text-ink">
            Custo total:{' '}
            <strong className="font-serif-luxury text-title tabular-nums">
              {formatBRL(totais.custo)}
            </strong>
          </span>
        </div>
      )}
    </div>
  );
};

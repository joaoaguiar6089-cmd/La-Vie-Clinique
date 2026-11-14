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
import { ordemDeSaida, rotuloDaSaida, validadeCurta } from '../../utils/lotes';
import { ListaSuspensa, OpcaoDaLista } from '../common/ListaSuspensa';

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
const miniLabel = 'block truncate text-[12px] font-semibold text-ink-soft mb-1';

/**
 * As cores dos dois valores de cada linha, iguais em todo lugar: o **custo do produto** (o que a
 * clínica pagou) em bronze, o **valor para a cliente** em verde. O ponto colorido no rótulo do preço
 * por unidade liga o campo ao total da mesma cor.
 */
export const COR_DO_CUSTO = { ponto: 'bg-brand', caixa: 'bg-brand-bg text-brand-deep', valor: 'text-brand-deep' };
export const COR_DA_CLIENTE = { ponto: 'bg-ok', caixa: 'bg-ok-bg text-ok', valor: 'text-ok' };

const Ponto: React.FC<{ cor: string }> = ({ cor }) => (
  <span aria-hidden className={`inline-block w-2 h-2 rounded-full mr-1.5 align-middle ${cor}`} />
);

/** Um produto do estoque como opção da lista: o nome, e embaixo a marca, a unidade e o custo; agrupado pelo tipo. */
export const opcaoDoProduto = (p: ProdutoDeEstoque): OpcaoDaLista => ({
  valor: p.id,
  rotulo: p.nome,
  detalhe: [p.marca, `por ${p.unidade}`].filter(Boolean).join(' · '),
  grupo: p.tipo?.trim() || 'Sem tipo',
});

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
                  <ListaSuspensa
                    id={`${id}-produto`}
                    rotuloAcessivel="Material"
                    valor={m.produtoId}
                    onMudar={(v) => trocarProduto(i, v)}
                    placeholderDaBusca="Buscar produto, marca ou tipo…"
                    opcoes={[
                      // Produto arquivado ou excluído continua aparecendo na linha que já o usa.
                      ...(!ativos.some((p) => p.id === m.produtoId)
                        ? [
                            {
                              valor: m.produtoId,
                              rotulo: m.nome,
                              detalhe: produto?.arquivado ? 'arquivado' : produto ? undefined : 'fora do estoque',
                            },
                          ]
                        : []),
                      ...ativos.map(opcaoDoProduto),
                    ]}
                  />
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

            <div className={`grid gap-2 ${!mostrarValores ? 'grid-cols-2' : mostrarCusto ? 'grid-cols-3' : 'grid-cols-2'}`}>
              <div>
                <label className={miniLabel} htmlFor={`${id}-qtd`}>
                  {/* "Qtd." no celular: com três colunas, "Quantidade" quebrava e desalinhava os campos. */}
                  <span className={mostrarValores && mostrarCusto ? 'sm:hidden' : 'hidden'}>Qtd.</span>
                  <span className={mostrarValores && mostrarCusto ? 'hidden sm:inline' : ''}>Quantidade</span> ({m.unidade || 'un'})
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
              {mostrarValores && mostrarCusto && (
                <div>
                  <label className={miniLabel} htmlFor={`${id}-custo`}>
                    <Ponto cor={COR_DO_CUSTO.ponto} />
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
              {mostrarValores && (
                <div>
                  <label className={miniLabel} htmlFor={`${id}-cliente`}>
                    <Ponto cor={COR_DA_CLIENTE.ponto} />
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
              )}
            </div>

            {/* Os totais da linha, lado a lado e cada um na sua cor: o custo do produto e o valor
                para a cliente. Com os custos escondidos (o orçamento ao lado da cliente), só o dela. */}
            {mostrarValores && (
              <div className={`grid gap-2 ${mostrarCusto ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'}`}>
                {mostrarCusto && (
                  <div className={`rounded-xl px-3 py-2 ${COR_DO_CUSTO.caixa}`}>
                    <span className="block text-[12px] font-semibold">Total custo do produto</span>
                    <span className="block text-[17px] font-bold tabular-nums">{formatBRL(custoDaLinha(m))}</span>
                  </div>
                )}
                <div className={`rounded-xl px-3 py-2 ${COR_DA_CLIENTE.caixa}`}>
                  <span className="block text-[12px] font-semibold">
                    {totalDaLinha === 'cliente' && !mostrarCusto ? 'Valor da linha' : 'Total para a cliente'}
                  </span>
                  <span className="block text-[17px] font-bold tabular-nums">{formatBRL(valorClienteDaLinha(m))}</span>
                </div>
              </div>
            )}

            {lotes && m.produtoId && (() => {
              const doProduto = lotes.filter((l) => l.produtoId === m.produtoId).sort(ordemDeSaida);
              const saidas = m.lotes || [];
              if (doProduto.length === 0 && saidas.length === 0) return null;
              // Uma saída só: é ela que aparece escolhida. Várias (o lote acabou no meio): automático.
              const escolhido = saidas.length === 1 ? saidas[0].loteId : '';
              return (
                <div>
                  <span className={miniLabel} id={`${id}-lote-rotulo`}>
                    Lote
                  </span>
                  <ListaSuspensa
                    id={`${id}-lote`}
                    rotuloAcessivel="Lote"
                    valor={escolhido}
                    onMudar={(v) => {
                      const lote = doProduto.find((l) => l.id === v);
                      trocar(i, {
                        lotes: lote
                          ? [{ loteId: lote.id, lote: lote.lote, validade: lote.validade, quantidade: m.quantidade }]
                          : undefined,
                      });
                    }}
                    opcoes={[
                      {
                        valor: '',
                        rotulo:
                          saidas.length > 1
                            ? saidas.map((s) => `${rotuloDaSaida(s)} (${quantidadeComUnidade(s.quantidade, m.unidade)})`).join(' + ')
                            : 'Automático',
                        detalhe: saidas.length > 1 ? 'saiu de mais de um lote' : 'o lote que vence primeiro',
                      },
                      ...doProduto.map((l) => ({
                        valor: l.id,
                        rotulo: l.lote ? `Lote ${l.lote}` : 'Lote sem código',
                        detalhe: [
                          l.validade ? `validade ${validadeCurta(l.validade)}` : 'sem validade',
                          l.saldo > 0 ? `${quantidadeComUnidade(l.saldo, m.unidade)} no estoque` : 'esgotado',
                        ].join(' · '),
                      })),
                    ]}
                  />
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
        <ListaSuspensa
          id={`${idBase}-adicionar`}
          variante="adicionar"
          rotuloAcessivel="Adicionar material"
          placeholder="Adicionar material"
          placeholderDaBusca="Buscar produto, marca ou tipo…"
          valor=""
          onMudar={adicionar}
          opcoes={[
            ...ativos.map(opcaoDoProduto),
            ...(permitirAvulso ? [{ valor: OUTRO, rotulo: 'Outro material (fora do estoque)', acao: true }] : []),
          ]}
        />
        {ativos.length === 0 && (
          <p className="mt-1 text-[13px] text-ink-soft">
            Nenhum produto cadastrado no Estoque ainda
            {permitirAvulso ? ' — dá para lançar como "outro material".' : '.'}
          </p>
        )}
      </div>

      {mostrarTotais && itens.length > 0 && mostrarValores && (
        <div className={`grid gap-2 pt-2 border-t border-ink/10 ${mostrarCusto ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {mostrarCusto && (
            <div className={`rounded-xl px-3 py-2 ${COR_DO_CUSTO.caixa}`}>
              <span className="block text-[12px] font-semibold">Custo total dos produtos</span>
              <span className="block text-[19px] font-bold tabular-nums">{formatBRL(totais.custo)}</span>
            </div>
          )}
          <div className={`rounded-xl px-3 py-2 ${COR_DA_CLIENTE.caixa}`}>
            <span className="block text-[12px] font-semibold">Total para a cliente</span>
            <span className="block text-[19px] font-bold tabular-nums">{formatBRL(totais.valorCliente)}</span>
          </div>
        </div>
      )}
    </div>
  );
};

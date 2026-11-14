import React, { useEffect, useState } from 'react';
import { Trash2, ChevronUp, ChevronDown, RotateCcw } from 'lucide-react';
import { ProdutoDeEstoque, Professional, QuoteItem } from '../../types';
import { formatBRL } from '../../utils/formatters';
import {
  itemValorFinal,
  itemDescontoPercentual,
  itemEhProduto,
  itemQuantidade,
  itemSessoes,
  itemValorUnitario,
} from '../../utils/quoteCalc';
import { ajustarItemDoProduto } from '../../utils/quoteFactory';
import {
  LinhaDeMaterial,
  arredondar,
  numeroValido,
  rotuloDaEmbalagem,
  totaisDosMateriais,
} from '../../utils/estoque';
import { EditorDeMateriais } from '../estoque/EditorDeMateriais';
import { CampoTinta, INPUT_TINTA } from '../common/Tinta';
import { OpcaoLigavel, PrefixoReais } from './PecasDoOrcamento';
import { ListaSuspensa } from '../common/ListaSuspensa';

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
  /**
   * Mostra, no consumo, o custo por unidade, o valor de compra, o repassado e a margem. Desligado
   * por padrão (o olho no topo da seção liga): o orçamento costuma ser montado com a cliente perto.
   */
  mostrarCustos: boolean;
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
  mostrarCustos,
}) => {
  const [valorTabelaStr, setValorTabelaStr] = useState(numeroDigitado(item.valorTabela));
  const [valorDescontoStr, setValorDescontoStr] = useState(numeroDigitado(item.valorComDesconto));
  // O item já pode nascer com o número do cadastro (10 sessões de laser) e a profissional só ajusta.
  // Guardar o texto, e não forçar `>= 2` a cada tecla, é o que deixa apagar o "10" para digitar "12".
  const [sessoesStr, setSessoesStr] = useState(numeroDigitado(item.sessoes));
  // Item de produto: quantidade e valor de uma unidade; o total da linha sai dos dois.
  const [quantidadeStr, setQuantidadeStr] = useState(numeroDigitado(item.quantidade));
  const [unitarioStr, setUnitarioStr] = useState(numeroDigitado(itemValorUnitario(item)));

  // O campo guarda o texto digitado, e não acompanha o valor sozinho: ao desligar o consumo, o
  // valor volta ao do catálogo, e o campo precisa mostrar esse — não o que foi digitado antes.
  useEffect(() => {
    if (!item.calculadoPorConsumo) setValorTabelaStr(numeroDigitado(item.valorTabela));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.calculadoPorConsumo]);

  const produto = itemEhProduto(item);
  /** "(5 por embalagem)", lido do cadastro do estoque — só para quem monta o orçamento. */
  const embalagem = produto ? rotuloDaEmbalagem(produtos.find((p) => p.id === item.produtoId)) : null;
  const porConsumo = !produto && !!item.calculadoPorConsumo;
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

  const botaoDeControle =
    'w-9 h-9 rounded-full flex items-center justify-center text-ink-soft hover:bg-line-soft hover:text-ink disabled:opacity-25 disabled:hover:bg-transparent transition-colors';
  const ajuda = 'mt-1 px-1 text-[13px] leading-snug text-ink-soft';

  return (
    <div className="rounded-[20px] bg-card border border-ink/10 p-4 sm:p-5 flex flex-col gap-4">
      {/* Cabeçalho: o número, o nome (com a categoria no rótulo) e os controles de ordem. No
          celular o nome desce para uma linha só dele — entre o número e os três botões, sobrava
          meio nome. */}
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <span
          aria-hidden
          className="w-8 h-8 mt-0.5 sm:mt-3 shrink-0 rounded-full bg-ink text-brand-pale text-[14px] font-bold flex items-center justify-center tabular-nums"
        >
          {index + 1}
        </span>
        <CampoTinta
          rotulo={`${produto ? 'Produto' : 'Procedimento'}${item.categoria && !produto ? ` · ${item.categoria}` : ''}`}
          htmlFor={`item-titulo-${item.id}`}
          className="order-last w-full sm:order-none sm:w-auto sm:flex-1 min-w-0"
        >
          <input
            id={`item-titulo-${item.id}`}
            type="text"
            value={item.titulo}
            onChange={(e) => patch({ titulo: e.target.value })}
            placeholder={produto ? 'Nome do produto' : 'Nome do procedimento'}
            className={INPUT_TINTA}
          />
        </CampoTinta>
        <div className="flex items-center gap-0.5 ml-auto sm:ml-0 sm:mt-2.5 shrink-0">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label="Mover para cima"
            title="Mover para cima"
            className={botaoDeControle}
          >
            <ChevronUp className="w-[18px] h-[18px]" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            aria-label="Mover para baixo"
            title="Mover para baixo"
            className={botaoDeControle}
          >
            <ChevronDown className="w-[18px] h-[18px]" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remover ${item.titulo || 'procedimento'}`}
            title="Remover"
            className="w-9 h-9 rounded-full flex items-center justify-center text-ink-soft hover:bg-danger-bg hover:text-danger transition-colors"
          >
            <Trash2 className="w-[18px] h-[18px]" />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4 sm:pl-11">
        {/* Produto: quantidade × valor de uma unidade. Sem profissional — ninguém "realiza" um produto. */}
        {produto ? (
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <CampoTinta rotulo={`Quantidade (${item.unidade || 'un'})`} htmlFor={`item-qtd-${item.id}`}>
                <input
                  id={`item-qtd-${item.id}`}
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={quantidadeStr}
                  onChange={(e) => {
                    setQuantidadeStr(e.target.value);
                    const n = numeroValido(e.target.value);
                    if (n > 0) onChange(ajustarItemDoProduto(item, { quantidade: n }));
                  }}
                  onBlur={() => setQuantidadeStr(numeroDigitado(itemQuantidade(item)))}
                  className={`${INPUT_TINTA} tabular-nums`}
                />
              </CampoTinta>
              {embalagem && <p className={ajuda}>{embalagem}</p>}
            </div>
            <CampoTinta
              rotulo={`Valor por ${item.unidade || 'un'}`}
              htmlFor={`item-unitario-${item.id}`}
              prefixo={<PrefixoReais />}
            >
              <input
                id={`item-unitario-${item.id}`}
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={unitarioStr}
                onChange={(e) => {
                  setUnitarioStr(e.target.value);
                  onChange(ajustarItemDoProduto(item, { valorUnitario: numeroValido(e.target.value) }));
                }}
                className={`${INPUT_TINTA} tabular-nums`}
              />
            </CampoTinta>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <ListaSuspensa
              id={`item-profissional-${item.id}`}
              rotulo="Profissional deste procedimento"
              valor={item.professionalId || ''}
              onMudar={(v) => {
                const id = v || undefined;
                patch({ professionalId: id, profissionalNome: professionals.find((p) => p.id === id)?.name });
              }}
              opcoes={[
                { valor: '', rotulo: 'Sem profissional definida' },
                ...professionals.map((p) => ({ valor: p.id, rotulo: p.name, detalhe: p.specialty || p.title })),
              ]}
            />

            {porConsumo ? (
              <div className="rounded-[14px] px-4 pt-2 pb-2.5 min-h-[56px] bg-surface-2 border border-ink/8">
                <span className="block text-[12px] font-semibold text-ink-soft leading-tight mb-0.5">
                  Valor pelo consumo
                </span>
                <span className="block text-[16px] font-semibold text-ink tabular-nums">
                  {formatBRL(item.valorTabela)}
                </span>
              </div>
            ) : (
              <CampoTinta rotulo="Valor de tabela" htmlFor={`item-valor-${item.id}`} prefixo={<PrefixoReais />}>
                <input
                  id={`item-valor-${item.id}`}
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={valorTabelaStr}
                  onChange={(e) => {
                    setValorTabelaStr(e.target.value);
                    patch({ valorTabela: e.target.value === '' ? 0 : Number(e.target.value) });
                  }}
                  className={`${INPUT_TINTA} tabular-nums`}
                />
              </CampoTinta>
            )}
          </div>
        )}

        {/* As opções do item, ligadas e desligadas à vista. O campo de cada uma aparece embaixo. */}
        <div className="flex flex-wrap gap-2">
          <OpcaoLigavel
            ligada={item.temDesconto}
            onMudar={(ligada) =>
              patch({ temDesconto: ligada, valorComDesconto: ligada ? item.valorComDesconto : undefined })
            }
          >
            Desconto
          </OpcaoLigavel>
          {!produto && (
            <OpcaoLigavel
              ligada={item.maisDeUmaSessao}
              onMudar={(ligada) => {
                const sessoes = ligada ? Math.max(2, item.sessoes || 2) : 1;
                setSessoesStr(numeroDigitado(sessoes));
                patch({ maisDeUmaSessao: ligada, sessoes });
              }}
            >
              Mais de 1 sessão
            </OpcaoLigavel>
          )}
          {/* O orçamento personalizado: o valor sai do que o procedimento vai gastar nesta cliente. */}
          {!produto && (
            <OpcaoLigavel ligada={porConsumo} onMudar={onAlternarConsumo}>
              Calcular por consumo de produto
            </OpcaoLigavel>
          )}
        </div>

        {(item.temDesconto || (!produto && item.maisDeUmaSessao)) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {item.temDesconto && (
              <div>
                <CampoTinta
                  rotulo="Novo valor, com desconto"
                  htmlFor={`item-desconto-${item.id}`}
                  prefixo={<PrefixoReais />}
                  erro={descontoInvalido ? 'Precisa ser menor que o valor de tabela — o desconto não será aplicado.' : undefined}
                >
                  <input
                    id={`item-desconto-${item.id}`}
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={valorDescontoStr}
                    onChange={(e) => {
                      setValorDescontoStr(e.target.value);
                      patch({
                        valorComDesconto: e.target.value === '' ? undefined : Number(e.target.value),
                      });
                    }}
                    placeholder="0,00"
                    className={`${INPUT_TINTA} tabular-nums`}
                  />
                </CampoTinta>
                {!descontoInvalido && percentual > 0 && (
                  <p className={`${ajuda} tabular-nums`}>
                    Desconto de <strong className="text-ink">{Math.round(percentual)}%</strong> — sai de{' '}
                    {formatBRL(item.valorTabela)} por {formatBRL(valorFinal)}.
                  </p>
                )}
              </div>
            )}
            {!produto && item.maisDeUmaSessao && (
              <div>
                <CampoTinta rotulo="Sessões" htmlFor={`item-sessoes-${item.id}`}>
                  <input
                    id={`item-sessoes-${item.id}`}
                    type="number"
                    min="2"
                    step="1"
                    inputMode="numeric"
                    value={sessoesStr}
                    onChange={(e) => {
                      setSessoesStr(e.target.value);
                      // Só grava o que já é um número válido; o resto espera a saída do campo.
                      const n = Math.floor(Number(e.target.value));
                      if (n >= 2) patch({ sessoes: n });
                    }}
                    onBlur={() => setSessoesStr(numeroDigitado(item.sessoes))}
                    className={`${INPUT_TINTA} tabular-nums`}
                  />
                </CampoTinta>
                <p className={ajuda}>Informativo no PDF — não multiplica o valor.</p>
              </div>
            )}
          </div>
        )}

        {/*
          Consumo de produto. O valor do item é a soma do repassado à cliente, e cada linha mostra o
          valor dela para a cliente. Custo por unidade, compra, repassado e margem só aparecem com o
          olho do topo da seção ligado — o orçamento costuma ser montado com a cliente por perto. No
          documento da cliente saem só os nomes dos produtos.
        */}
        {porConsumo && (
          <div className="rounded-2xl bg-surface border border-ink/8 p-3.5 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <p className="text-[15px] font-bold text-ink">Consumo de produto</p>
              <button
                type="button"
                onClick={onRecalcularConsumo}
                className="inline-flex items-center gap-1.5 min-h-[36px] text-[14px] font-semibold text-ink underline underline-offset-2 hover:no-underline"
              >
                <RotateCcw className="w-4 h-4" />
                Usar consumo padrão{sessoes > 1 ? ` × ${sessoes} sessões` : ''}
              </button>
            </div>

            <EditorDeMateriais
              idBase={`consumo-${item.id}`}
              itens={linhasDoConsumo}
              onChange={onMudarConsumo}
              produtos={produtos}
              mostrarCusto={mostrarCustos}
              totalDaLinha="cliente"
              mostrarTotais={false}
            />

            {mostrarCustos && (
              <div className="grid grid-cols-3 gap-2 pt-3 border-t border-ink/8 tabular-nums">
                <div>
                  <span className="block text-[12px] font-semibold text-ink-soft">Valor de compra</span>
                  <span className="text-[16px] font-bold text-ink">{formatBRL(consumo.custo)}</span>
                </div>
                <div>
                  <span className="block text-[12px] font-semibold text-ink-soft">Repassado à cliente</span>
                  <span className="text-[16px] font-bold text-ink">{formatBRL(consumo.valorCliente)}</span>
                </div>
                <div>
                  <span className="block text-[12px] font-semibold text-ink-soft">Margem</span>
                  <span className={`text-[16px] font-bold ${margemDoConsumo < 0 ? 'text-danger' : 'text-ok'}`}>
                    {formatBRL(margemDoConsumo)}
                  </span>
                </div>
              </div>
            )}

            <p className="text-[13px] leading-snug text-ink-soft">
              Na proposta da cliente saem só os nomes dos produtos — sem quantidade e sem valores.
            </p>
          </div>
        )}

        {/* O que este item soma no orçamento — o número que se procura no cartão. */}
        <div className="flex items-baseline justify-between gap-3 pt-3 border-t border-ink/8">
          <span className="text-[14px] font-semibold text-ink-soft">
            {produto ? 'Total da linha' : 'Valor no orçamento'}
            {!produto && sessoes > 1 ? ` · ${sessoes} sessões` : ''}
          </span>
          <span className="flex items-baseline gap-2 tabular-nums">
            {percentual > 0 && (
              <span className="text-[14px] text-ink-soft line-through">{formatBRL(item.valorTabela)}</span>
            )}
            <span className="text-[19px] font-bold text-ink">{formatBRL(valorFinal)}</span>
          </span>
        </div>
      </div>
    </div>
  );
};

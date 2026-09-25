import {
  Attendance,
  CaixaDoProduto,
  ConsumoPadrao,
  CustoDoOrcamento,
  MaterialUsado,
  Procedure,
  ProdutoDeEstoque,
  Quote,
  QuoteItem,
} from '../types';
import { itemSessoes } from './quoteCalc';
import { procedimentoDoAtendimento } from './evaluations';
import { atendimentoAconteceu } from './fichasClinicas';

/**
 * As contas do estoque: custo de uma linha, totais, e o consumo padrão de um procedimento
 * transformado nas linhas que o atendimento e o orçamento abrem preenchidas.
 *
 * Nada aqui lê o banco — é o que permite `scripts/verificar-custos.ts` conferir as contas sem
 * Firebase.
 */

/** As unidades que o cadastro oferece. A lista é sugestão: digitar outra continua valendo. */
export const UNIDADES_SUGERIDAS = [
  'un',
  'ml',
  'U',
  'seringa',
  'ampola',
  'frasco',
  'fio',
  'g',
  'par',
  'cm',
];

/**
 * Uma linha em edição. `cadastrarNoEstoque` é a marca da linha avulsa que deve virar produto ao
 * salvar — vive só na tela e sai em `linhasParaGravar`, nunca chega ao banco.
 */
export type LinhaDeMaterial = MaterialUsado & { cadastrarNoEstoque?: boolean };

/** Tira as marcas de edição e as linhas vazias (sem nome ou sem quantidade). */
export const linhasParaGravar = (linhas: LinhaDeMaterial[]): MaterialUsado[] =>
  (linhas || [])
    .filter((l) => (l.produtoId || l.nome.trim()) && numeroValido(l.quantidade) > 0)
    .map(({ cadastrarNoEstoque: _marca, ...linha }) => ({
      ...linha,
      nome: linha.nome.trim(),
      unidade: (linha.unidade || 'un').trim(),
      quantidade: numeroValido(linha.quantidade),
      custoUnitario: numeroValido(linha.custoUnitario),
      valorCliente: numeroValido(linha.valorCliente),
    }));

/** Centavos: evita que 0,1 + 0,2 apareça como R$ 0,30000000000000004 numa soma de linhas. */
export const arredondar = (valor: number): number =>
  Math.round(((Number.isFinite(valor) ? valor : 0) + Number.EPSILON) * 100) / 100;

/** Número vindo de campo ou de documento antigo: qualquer coisa inválida vira zero. */
export const numeroValido = (valor: unknown): number => {
  const n = typeof valor === 'number' ? valor : Number(String(valor ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export const custoDaLinha = (m: Pick<MaterialUsado, 'quantidade' | 'custoUnitario'>): number =>
  arredondar(numeroValido(m.quantidade) * numeroValido(m.custoUnitario));

export const valorClienteDaLinha = (m: Pick<MaterialUsado, 'quantidade' | 'valorCliente'>): number =>
  arredondar(numeroValido(m.quantidade) * numeroValido(m.valorCliente));

export interface TotaisDeMateriais {
  /** Quanto os materiais custaram para a clínica. */
  custo: number;
  /** Quanto eles valem para a cliente, pelo valor repassado. */
  valorCliente: number;
}

export const totaisDosMateriais = (itens: MaterialUsado[]): TotaisDeMateriais => ({
  custo: arredondar((itens || []).reduce((soma, m) => soma + custoDaLinha(m), 0)),
  valorCliente: arredondar((itens || []).reduce((soma, m) => soma + valorClienteDaLinha(m), 0)),
});

/** Uma linha nova a partir do produto do estoque, com o preço de hoje congelado. */
export const linhaDoProduto = (produto: ProdutoDeEstoque, quantidade: number): MaterialUsado => ({
  produtoId: produto.id,
  nome: produto.nome,
  unidade: produto.unidade,
  quantidade,
  custoUnitario: numeroValido(produto.custoUnitario),
  valorCliente: numeroValido(produto.valorCliente),
});

/** Linha em branco para um material fora do estoque. */
export const linhaAvulsa = (): MaterialUsado => ({
  nome: '',
  unidade: 'un',
  quantidade: 1,
  custoUnitario: 0,
  valorCliente: 0,
});

/** O consumo padrão de um procedimento do catálogo, se configurado. */
export const consumoPadraoDe = (
  procedureId: string | undefined,
  consumos: ConsumoPadrao[]
): ConsumoPadrao | undefined =>
  procedureId ? (consumos || []).find((c) => c.procedureId === procedureId) : undefined;

/**
 * O que um atendimento (ou um item de orçamento) abre preenchido: o consumo padrão do
 * procedimento, em linhas com o preço atual de cada produto.
 *
 * O procedimento é achado pela mesma escada da ficha de avaliação — id do catálogo, e na falta
 * dele o nome normalizado —, então um atendimento de procedimento digitado à mão que bate com um
 * do catálogo também abre preenchido. Sem procedimento ou sem consumo configurado, a lista vem
 * vazia e a profissional adiciona à mão.
 *
 * `multiplicador` é o número de sessões no orçamento: um pacote de 10 sessões consome dez vezes.
 * Produto excluído do estoque some da sugestão — não há preço de onde tirar a linha.
 */
export const materiaisSugeridos = (
  alvo: { procedureId?: string; procedimentoNome: string },
  consumos: ConsumoPadrao[],
  produtos: ProdutoDeEstoque[],
  catalogo: Procedure[],
  multiplicador = 1
): MaterialUsado[] => {
  const procedimento = procedimentoDoAtendimento(alvo, catalogo);
  const consumo = consumoPadraoDe(procedimento?.id || alvo.procedureId, consumos);
  if (!consumo) return [];

  const vezes = Math.max(1, Math.floor(numeroValido(multiplicador)) || 1);
  return consumo.itens
    .map((item) => {
      const produto = (produtos || []).find((p) => p.id === item.produtoId);
      if (!produto) return null;
      return linhaDoProduto(produto, arredondar(numeroValido(item.quantidade) * vezes));
    })
    .filter((m): m is MaterialUsado => !!m);
};

/** O produto aparece em algum consumo padrão? — o que decide entre excluir e arquivar. */
export const produtoEmUso = (produtoId: string, consumos: ConsumoPadrao[]): boolean =>
  (consumos || []).some((c) => c.itens.some((i) => i.produtoId === produtoId));

/** Quanto sobra por unidade entre o valor repassado e o comprado. `null` sem valor repassado. */
export const margemUnitaria = (
  produto: Pick<ProdutoDeEstoque, 'custoUnitario' | 'valorCliente'>
): { valor: number; percentual: number } | null => {
  const custo = numeroValido(produto.custoUnitario);
  const cliente = numeroValido(produto.valorCliente);
  if (cliente <= 0) return null;
  const valor = arredondar(cliente - custo);
  return { valor, percentual: Math.round((valor / cliente) * 100) };
};

/**
 * Preço da unidade de uso a partir do preço da embalagem: o frasco de 100 U por R$ 1.200 dá
 * R$ 12,00 por U. Quatro casas, porque unidade barata (a luva, o ml de gel) perde a conta com
 * duas.
 */
export const precoPorUnidade = (precoDaEmbalagem: number, unidadesNaEmbalagem: number): number => {
  const preco = numeroValido(precoDaEmbalagem);
  const unidades = numeroValido(unidadesNaEmbalagem);
  if (!preco || !unidades) return 0;
  return Math.round((preco / unidades) * 10000) / 10000;
};

/**
 * Os valores por unidade de um produto comprado em caixa: a caixa de 5 frascos por R$ 500 dá
 * R$ 100 por frasco, e o repasse da caixa se divide do mesmo jeito. Sem unidades na caixa não há
 * por onde dividir, e os dois saem zero.
 */
export const valoresPorUnidadeDaCaixa = (
  caixa: CaixaDoProduto
): Pick<ProdutoDeEstoque, 'custoUnitario' | 'valorCliente'> => ({
  custoUnitario: precoPorUnidade(caixa.custo, caixa.unidades),
  valorCliente: precoPorUnidade(caixa.valorCliente, caixa.unidades),
});

/**
 * A caixa como veio do banco, ou `undefined`. Caixa sem unidades é caixa nenhuma: não há como
 * dividir, e mostrá-la marcada levaria a gravar zero por unidade.
 */
export const caixaLida = (valor: unknown): CaixaDoProduto | undefined => {
  if (!valor || typeof valor !== 'object') return undefined;
  const bruta = valor as Record<string, unknown>;
  const unidades = numeroValido(bruta.unidades);
  if (!unidades) return undefined;
  return {
    unidades,
    custo: numeroValido(bruta.custo),
    valorCliente: numeroValido(bruta.valorCliente),
  };
};

/**
 * Preço de uma unidade de uso, com até quatro casas: R$ 0,0035 o ml de gel não pode aparecer
 * como R$ 0,00. Totais continuam com duas casas (`formatBRL`).
 */
export const formatarPrecoUnitario = (valor: number): string =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
    // Margem pode ser negativa (repasse abaixo do custo) — por isso não passa por `numeroValido`.
  }).format(Number.isFinite(valor) ? valor : 0);

/**
 * O atalho de materiais aparece na linha do atendimento? — depois que a visita aconteceu, ou
 * sempre que já houver registro (mesma regra do acompanhamento: o que está gravado não some).
 */
export const materiaisVisiveis = (a: Attendance): boolean =>
  !!a.materiaisRegistradosEm || atendimentoAconteceu(a);

/** Os produtos que se oferecem para escolha, em ordem alfabética. */
export const produtosAtivos = (produtos: ProdutoDeEstoque[]): ProdutoDeEstoque[] =>
  (produtos || [])
    .filter((p) => !p.arquivado)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

/**
 * "2,5 ml", "20 U", "1 seringa" — quantidade e unidade para a tela. Unidade que já começa com
 * número (a seringa inteira, "10 ml") ganha um "×": "1 10 ml" se lê cento e dez.
 */
export const quantidadeComUnidade = (quantidade: number, unidade: string): string => {
  const numero = String(arredondar(numeroValido(quantidade))).replace('.', ',');
  const nome = (unidade || '').trim();
  if (!nome) return numero;
  return /^\d/.test(nome) ? `${numero} × ${nome}` : `${numero} ${nome}`;
};

// ==========================================
// CUSTO ESTIMADO DO ORÇAMENTO
// ==========================================

/**
 * O custo que um item de orçamento abre preenchido: o consumo padrão do procedimento vezes o
 * número de sessões do item — um pacote de 10 sessões de laser gasta dez vezes o gel de uma.
 *
 * O item digitado à mão, fora do catálogo, ainda pode achar o procedimento pelo nome.
 */
export const materiaisDoItem = (
  item: Pick<QuoteItem, 'procedureId' | 'titulo' | 'maisDeUmaSessao' | 'sessoes'>,
  consumos: ConsumoPadrao[],
  produtos: ProdutoDeEstoque[],
  catalogo: Procedure[]
): MaterialUsado[] =>
  materiaisSugeridos(
    { procedureId: item.procedureId, procedimentoNome: item.titulo },
    consumos,
    produtos,
    catalogo,
    itemSessoes(item as QuoteItem)
  );

/** O que o formulário do orçamento entrega para gravar o custo: os itens, na ordem, e as linhas. */
export interface CustoEmEdicao {
  itens: Pick<QuoteItem, 'id'>[];
  linhas: Record<string, LinhaDeMaterial[]>;
}

/**
 * O documento de custo de um orçamento que acabou de ser salvo.
 *
 * Liga as linhas aos itens **pela posição**, e não pelo id: substituir e duplicar geram ids novos
 * para os itens (`clonarItens`), e a ordem é a única coisa que se mantém entre o formulário e o
 * orçamento gravado.
 */
export const montarCustoDoOrcamento = (salvo: Pick<Quote, 'id' | 'itens'>, custo: CustoEmEdicao): CustoDoOrcamento => {
  const itens = (salvo.itens || []).map((item, i) => {
    const doFormulario = custo.itens[i];
    return {
      quoteItemId: item.id,
      materiais: linhasParaGravar((doFormulario && custo.linhas[doFormulario.id]) || []),
    };
  });
  const todas = itens.flatMap((i) => i.materiais);
  const totais = totaisDosMateriais(todas);
  return {
    id: salvo.id,
    quoteId: salvo.id,
    itens: itens.filter((i) => i.materiais.length > 0),
    custoTotal: totais.custo,
    valorClienteTotal: totais.valorCliente,
  };
};

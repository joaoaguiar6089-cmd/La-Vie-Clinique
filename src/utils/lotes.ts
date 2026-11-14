import {
  ItemDoPedido,
  LoteDeEstoque,
  MaterialUsado,
  PedidoDeCompra,
  ProdutoDeEstoque,
  SaidaDeLote,
  TipoDeProduto,
} from '../types';
import { arredondar, numeroValido, quantidadeDoProduto } from './estoque';
import { chaveDeNome } from './templateMatching';

/**
 * As contas do estoque com lotes: a compra virando lote (em unidades de uso), a baixa do material
 * usado no atendimento (o lote que vence primeiro sai primeiro), a validade, o resumo por tipo de
 * produto, a leitura da planilha de um pedido e o casamento de um nome lido com um produto do
 * cadastro.
 *
 * Nada aqui lê o banco — `scripts/verificar-lotes.ts` confere tudo sem Firebase.
 */

/** Quantidades com quatro casas: 0,1 ml + 0,2 ml não pode virar 0,30000000000000004 ml. */
export const arredondarQuantidade = (valor: number): number =>
  Math.round(((Number.isFinite(valor) ? valor : 0) + Number.EPSILON) * 10000) / 10000;

// ==========================================
// DA COMPRA AO LOTE
// ==========================================

/** Quantas unidades de uso entram: 2 caixas de 5 frascos são 10 frascos. */
export const unidadesDeUso = (
  quantidade: number,
  porEmbalagem: boolean,
  unidadesPorEmbalagem?: number
): number =>
  arredondarQuantidade(numeroValido(quantidade) * (porEmbalagem ? numeroValido(unidadesPorEmbalagem) || 1 : 1));

/** O custo de uma unidade de uso: a caixa de R$ 500 com 5 frascos dá R$ 100 o frasco. */
export const custoPorUnidadeDeUso = (
  valorUnitario: number,
  porEmbalagem: boolean,
  unidadesPorEmbalagem?: number
): number => {
  const porUnidade = numeroValido(valorUnitario) / (porEmbalagem ? numeroValido(unidadesPorEmbalagem) || 1 : 1);
  return Math.round(porUnidade * 10000) / 10000;
};

export const totalDoItem = (item: Pick<ItemDoPedido, 'quantidade' | 'valorUnitario'>): number =>
  arredondar(numeroValido(item.quantidade) * numeroValido(item.valorUnitario));

export const totalDoPedido = (itens: Pick<ItemDoPedido, 'quantidade' | 'valorUnitario'>[]): number =>
  arredondar((itens || []).reduce((soma, i) => soma + totalDoItem(i), 0));

/** O lote que uma linha do pedido cria. */
export const loteDoItem = (
  item: ItemDoPedido,
  pedido: Pick<PedidoDeCompra, 'id' | 'dataCompra' | 'fornecedor'>,
  agora: string
): LoteDeEstoque => {
  const quantidade = unidadesDeUso(item.quantidade, item.porEmbalagem, item.unidadesPorEmbalagem);
  const lote: LoteDeEstoque = {
    id: item.loteId,
    produtoId: item.produtoId,
    produtoNome: item.nome,
    quantidade,
    saldo: quantidade,
    custoUnitario: custoPorUnidadeDeUso(item.valorUnitario, item.porEmbalagem, item.unidadesPorEmbalagem),
    dataCompra: pedido.dataCompra,
    pedidoId: pedido.id,
    createdAt: agora,
  };
  if (item.marca) lote.marca = item.marca;
  if (item.lote?.trim()) lote.lote = item.lote.trim();
  if (item.validade) lote.validade = item.validade;
  if (pedido.fornecedor?.trim()) lote.fornecedor = pedido.fornecedor.trim();
  return lote;
};

/**
 * O produto com o custo desta compra. Produto cadastrado em caixa tem a caixa refeita junto — o
 * formulário mostra e grava os valores da caixa, e um custo de caixa velho voltaria na próxima
 * edição.
 */
export const produtoComCustoDaCompra = (produto: ProdutoDeEstoque, custoPorUnidade: number): ProdutoDeEstoque => {
  const custo = numeroValido(custoPorUnidade);
  if (custo <= 0) return produto;
  const atualizado: ProdutoDeEstoque = { ...produto, custoUnitario: custo };
  if (produto.caixa && numeroValido(produto.caixa.unidades) > 0) {
    atualizado.caixa = { ...produto.caixa, custo: arredondar(custo * produto.caixa.unidades) };
  }
  return atualizado;
};

/** Pedido só sai inteiro se nenhum lote dele foi usado nem ajustado — senão a história fica furada. */
export const pedidoPodeSerExcluido = (pedido: Pick<PedidoDeCompra, 'itens'>, lotes: LoteDeEstoque[]): boolean =>
  pedido.itens.every((item) => {
    const lote = lotes.find((l) => l.id === item.loteId);
    return !lote || (lote.saldo === lote.quantidade && !(lote.ajustes || []).length);
  });

// ==========================================
// A BAIXA PELO ATENDIMENTO
// ==========================================

/** Vence primeiro, sai primeiro; sem validade, por último; empatou, a compra mais antiga. */
export const ordemDeSaida = (a: LoteDeEstoque, b: LoteDeEstoque): number => {
  const va = a.validade || '9999-12-31';
  const vb = b.validade || '9999-12-31';
  if (va !== vb) return va.localeCompare(vb);
  if (a.dataCompra !== b.dataCompra) return a.dataCompra.localeCompare(b.dataCompra);
  return (a.createdAt || '').localeCompare(b.createdAt || '');
};

export interface PlanoDeBaixa {
  /** As linhas novas, cada uma com os lotes de onde saiu. */
  linhas: MaterialUsado[];
  /** O saldo novo de cada lote que mudou. */
  saldos: Record<string, number>;
}

/**
 * A baixa de um registro de materiais, refeita do zero a cada gravação: devolve aos lotes o que o
 * registro anterior tinha tirado e tira de novo, linha a linha.
 *
 * Cada linha tira primeiro dos lotes que ela já tinha — os da gravação anterior, ou o que alguém
 * escolheu no detalhe dos materiais —, e o que faltar sai dos outros lotes do produto, na
 * `ordemDeSaida`. Assim corrigir a quantidade de um atendimento não troca o lote dele de lugar, e
 * escolher o lote vale.
 *
 * Linha sem produto do estoque (material digitado à mão) não tem de onde sair. Produto sem saldo
 * bastante tira o que houver: o estoque não fica negativo, e o resto é coisa para o "Ajustar".
 * Lote apagado de lá para cá é ignorado na devolução.
 *
 * Com `novas` vazio, é só a devolução — o caso de apagar o registro.
 */
export const planejarBaixa = ({
  anteriores,
  novas,
  lotes,
}: {
  anteriores: MaterialUsado[];
  novas: MaterialUsado[];
  lotes: LoteDeEstoque[];
}): PlanoDeBaixa => {
  const saldo = new Map<string, number>(lotes.map((l) => [l.id, numeroValido(l.saldo)]));
  const original = new Map(saldo);

  (anteriores || []).forEach((m) =>
    (m.lotes || []).forEach((s) => {
      if (saldo.has(s.loteId)) saldo.set(s.loteId, arredondarQuantidade(saldo.get(s.loteId)! + numeroValido(s.quantidade)));
    })
  );

  const porProduto = new Map<string, LoteDeEstoque[]>();
  [...lotes].sort(ordemDeSaida).forEach((l) => {
    const lista = porProduto.get(l.produtoId) || [];
    lista.push(l);
    porProduto.set(l.produtoId, lista);
  });

  const linhas = (novas || []).map((linha) => {
    const { lotes: preferidos, ...resto } = linha;
    const limpa: MaterialUsado = { ...resto };
    const doProduto = linha.produtoId ? porProduto.get(linha.produtoId) || [] : [];
    let falta = arredondarQuantidade(numeroValido(linha.quantidade));
    if (doProduto.length === 0 || falta <= 0) return limpa;

    const saidas: SaidaDeLote[] = [];
    const tirar = (lote: LoteDeEstoque) => {
      const disponivel = saldo.get(lote.id) ?? 0;
      if (disponivel <= 0 || falta <= 0) return;
      const q = arredondarQuantidade(Math.min(disponivel, falta));
      saldo.set(lote.id, arredondarQuantidade(disponivel - q));
      falta = arredondarQuantidade(falta - q);
      const ja = saidas.find((s) => s.loteId === lote.id);
      if (ja) {
        ja.quantidade = arredondarQuantidade(ja.quantidade + q);
        return;
      }
      const saida: SaidaDeLote = { loteId: lote.id, quantidade: q };
      if (lote.lote) saida.lote = lote.lote;
      if (lote.validade) saida.validade = lote.validade;
      saidas.push(saida);
    };

    (preferidos || []).forEach((p) => {
      const lote = doProduto.find((l) => l.id === p.loteId);
      if (lote) tirar(lote);
    });
    doProduto.forEach(tirar);

    if (saidas.length > 0) limpa.lotes = saidas;
    return limpa;
  });

  const saldos: Record<string, number> = {};
  saldo.forEach((valor, id) => {
    if (valor !== original.get(id)) saldos[id] = valor;
  });
  return { linhas, saldos };
};

/** "Lote AB123 · val. 03/2027" — o lote de uma saída, para o atendimento. */
export const rotuloDaSaida = (s: Pick<SaidaDeLote, 'lote' | 'validade'>): string => {
  const partes = [s.lote ? `Lote ${s.lote}` : 'Lote sem código'];
  if (s.validade) partes.push(`val. ${validadeCurta(s.validade)}`);
  return partes.join(' · ');
};

// ==========================================
// VALIDADE
// ==========================================

export const DIAS_DE_AVISO_DA_VALIDADE = 30;

export type SituacaoDaValidade = 'vencido' | 'vencendo' | 'ok';

const diasEntre = (de: string, ate: string): number =>
  Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86400000);

/** Vencido, vencendo (até 30 dias) ou em dia. Sem validade, `null`. */
export const situacaoDaValidade = (
  validade: string | undefined,
  hoje: string
): { situacao: SituacaoDaValidade; dias: number } | null => {
  if (!validade || !/^\d{4}-\d{2}-\d{2}$/.test(validade)) return null;
  const dias = diasEntre(hoje, validade);
  return { situacao: dias < 0 ? 'vencido' : dias <= DIAS_DE_AVISO_DA_VALIDADE ? 'vencendo' : 'ok', dias };
};

/** "2027-03-31" → "31/03/2027". */
export const validadeCurta = (validade?: string): string => {
  if (!validade) return '';
  const [a, m, d] = validade.split('-');
  return a && m && d ? `${d}/${m}/${a}` : validade;
};

// ==========================================
// O ESTOQUE POR TIPO
// ==========================================

export const SEM_TIPO = 'Sem tipo';

/** A chave de um tipo — o id do documento do mínimo, e o que agrupa "Ácido Hialurônico" com "acido hialuronico". */
export const chaveDoTipo = (tipo?: string): string => chaveDeNome(tipo).replace(/ /g, '-');

export interface ResumoDoTipo {
  /** `''` para os produtos sem tipo. */
  chave: string;
  nome: string;
  produtos: ProdutoDeEstoque[];
  /** Os lotes dos produtos do tipo, os com saldo primeiro, na ordem de saída. */
  lotes: LoteDeEstoque[];
  /** O saldo somado por unidade de uso: [{ unidade: 'seringa', saldo: 3 }]. */
  totais: { unidade: string; saldo: number }[];
  minimo?: number;
  unidadeDoMinimo?: string;
  abaixoDoMinimo: boolean;
  vencidos: number;
  vencendo: number;
}

/** "3 seringas · 10 ml" — o total de um tipo, unidade por unidade. */
export const totaisLegiveis = (totais: ResumoDoTipo['totais']): string =>
  totais.length === 0 ? 'Sem estoque' : totais.map((t) => quantidadeDoProduto(t.saldo, t.unidade)).join(' · ');

/**
 * O estoque agrupado por tipo de produto — a lista do Estoque. Produto arquivado só aparece se
 * ainda tiver saldo (ou com `incluirArquivados`); lote de produto excluído cai em "Sem tipo", com o
 * nome que guardou.
 */
export const resumoDosTipos = (
  produtos: ProdutoDeEstoque[],
  lotes: LoteDeEstoque[],
  tipos: TipoDeProduto[],
  hoje: string,
  incluirArquivados = false
): ResumoDoTipo[] => {
  const grupos = new Map<string, ResumoDoTipo>();
  const grupo = (tipo?: string): ResumoDoTipo => {
    const chave = tipo?.trim() ? chaveDoTipo(tipo) : '';
    let g = grupos.get(chave);
    if (!g) {
      const config = chave ? tipos.find((t) => t.id === chave) : undefined;
      g = {
        chave,
        nome: config?.nome || (chave ? tipo!.trim() : SEM_TIPO),
        produtos: [],
        lotes: [],
        totais: [],
        minimo: config?.minimo,
        unidadeDoMinimo: config?.unidade,
        abaixoDoMinimo: false,
        vencidos: 0,
        vencendo: 0,
      };
      grupos.set(chave, g);
    }
    return g;
  };

  const comSaldo = new Set(lotes.filter((l) => l.saldo > 0).map((l) => l.produtoId));
  const aparece = (p: ProdutoDeEstoque) => incluirArquivados || !p.arquivado || comSaldo.has(p.id);
  produtos.filter(aparece).forEach((p) => grupo(p.tipo).produtos.push(p));

  lotes.forEach((l) => {
    const produto = produtos.find((p) => p.id === l.produtoId);
    if (produto && !aparece(produto)) return;
    const g = grupo(produto?.tipo);
    g.lotes.push(l);
    if (l.saldo <= 0) return;
    const unidade = produto?.unidade || 'un';
    const total = g.totais.find((t) => t.unidade === unidade);
    if (total) total.saldo = arredondarQuantidade(total.saldo + l.saldo);
    else g.totais.push({ unidade, saldo: arredondarQuantidade(l.saldo) });
    const validade = situacaoDaValidade(l.validade, hoje);
    if (validade?.situacao === 'vencido') g.vencidos++;
    else if (validade?.situacao === 'vencendo') g.vencendo++;
  });

  return Array.from(grupos.values())
    .map((g) => {
      g.lotes.sort((a, b) => (a.saldo > 0) === (b.saldo > 0) ? ordemDeSaida(a, b) : a.saldo > 0 ? -1 : 1);
      g.totais.sort((a, b) => b.saldo - a.saldo);
      if (g.minimo !== undefined && g.minimo > 0) {
        const unidade = g.unidadeDoMinimo || g.totais[0]?.unidade || g.produtos[0]?.unidade;
        const total = g.totais.find((t) => t.unidade === unidade)?.saldo || 0;
        g.unidadeDoMinimo = unidade;
        g.abaixoDoMinimo = total < g.minimo;
      }
      return g;
    })
    .sort((a, b) => (a.chave === '' ? 1 : b.chave === '' ? -1 : a.nome.localeCompare(b.nome, 'pt-BR')));
};

/** Os tipos já usados, para as sugestões do campo — um por chave, com o nome mais comum. */
export const tiposUsados = (produtos: ProdutoDeEstoque[]): string[] => {
  const nomes = new Map<string, string>();
  produtos.forEach((p) => {
    if (p.tipo?.trim() && !nomes.has(chaveDoTipo(p.tipo))) nomes.set(chaveDoTipo(p.tipo), p.tipo.trim());
  });
  return Array.from(nomes.values()).sort((a, b) => a.localeCompare(b, 'pt-BR'));
};

// ==========================================
// A PLANILHA DO PEDIDO
// ==========================================

/** As colunas, na ordem do modelo — a mesma que vale quando a planilha vem sem cabeçalho. */
export const COLUNAS_DA_PLANILHA = [
  { id: 'produto', titulo: 'Produto', exemplo: 'Juvéderm Voluma 1 ml', obrigatoria: true },
  { id: 'marca', titulo: 'Marca', exemplo: 'Allergan', obrigatoria: false },
  { id: 'tipo', titulo: 'Tipo', exemplo: 'Ácido hialurônico', obrigatoria: false },
  { id: 'quantidade', titulo: 'Quantidade', exemplo: '2', obrigatoria: true },
  { id: 'unidade', titulo: 'Unidade', exemplo: 'seringa', obrigatoria: false },
  { id: 'valorUnitario', titulo: 'Valor unitário', exemplo: '890,00', obrigatoria: true },
  { id: 'lote', titulo: 'Lote', exemplo: 'AB1234', obrigatoria: false },
  { id: 'validade', titulo: 'Validade', exemplo: '31/03/2027', obrigatoria: false },
] as const;

export type ColunaDaPlanilha = (typeof COLUNAS_DA_PLANILHA)[number]['id'] | 'total';

export interface LinhaDaPlanilha {
  /** O número da linha no texto colado, para o aviso dizer qual. */
  linha: number;
  produto: string;
  marca?: string;
  tipo?: string;
  quantidade: number;
  unidade?: string;
  valorUnitario: number;
  lote?: string;
  validade?: string; // YYYY-MM-DD
}

/** O modelo para baixar: o cabeçalho e uma linha de exemplo, separados por ponto e vírgula. */
export const modeloDaPlanilha = (): string =>
  [COLUNAS_DA_PLANILHA.map((c) => c.titulo).join(';'), COLUNAS_DA_PLANILHA.map((c) => c.exemplo).join(';')].join('\n');

/** O texto pronto para pedir a outra IA que converta o pedido no formato do modelo. */
export const PEDIDO_PARA_OUTRA_IA =
  'Transforme este pedido de compra numa tabela com exatamente estas colunas, nesta ordem: ' +
  COLUNAS_DA_PLANILHA.map((c) => c.titulo).join(', ') +
  '. Uma linha por produto. Quantidade e valor unitário só com números (use vírgula para os centavos); ' +
  'validade no formato dd/mm/aaaa. Deixe em branco o que não aparecer no pedido. Responda só com a ' +
  'tabela, sem texto antes ou depois.';

/** "R$ 1.234,56" → 1234.56; "12,5" → 12.5; "1.000" → 1000. Vazio ou bobagem → 0. */
export const numeroBrasileiro = (texto: unknown): number => {
  let t = String(texto ?? '').replace(/[^0-9.,-]/g, '');
  if (!t) return 0;
  const virgula = t.lastIndexOf(',');
  const ponto = t.lastIndexOf('.');
  if (virgula >= 0 && ponto >= 0) {
    t = virgula > ponto ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (virgula >= 0) {
    t = t.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, '');
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Uma data de pedido ou de validade → "AAAA-MM-DD". Aceita 31/03/2027, 31/03/27, 2027-03-31,
 * 31-03-2027 e o "03/2027" das caixas de medicamento, que vale até o último dia do mês.
 */
export const dataBrasileira = (texto: unknown): string | undefined => {
  const t = String(texto ?? '').trim();
  if (!t) return undefined;
  const pad = (n: number) => String(n).padStart(2, '0');
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (iso) return `${iso[1]}-${pad(+iso[2])}-${pad(+iso[3])}`;
  const dma = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(t);
  if (dma) {
    const ano = dma[3].length === 2 ? 2000 + Number(dma[3]) : Number(dma[3]);
    const mes = Number(dma[2]);
    const dia = Number(dma[1]);
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return undefined;
    return `${ano}-${pad(mes)}-${pad(dia)}`;
  }
  const ma = /^(\d{1,2})[/.-](\d{4})$/.exec(t);
  if (ma) {
    const mes = Number(ma[1]);
    const ano = Number(ma[2]);
    if (mes < 1 || mes > 12) return undefined;
    const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
    return `${ano}-${pad(mes)}-${pad(ultimo)}`;
  }
  return undefined;
};

/** Separa uma linha em células, respeitando aspas ("Seringa 1,0 ml"). */
const celulas = (linha: string, separador: string): string[] => {
  const saida: string[] = [];
  let atual = '';
  let entreAspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      if (entreAspas && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else entreAspas = !entreAspas;
    } else if (c === separador && !entreAspas) {
      saida.push(atual.trim());
      atual = '';
    } else atual += c;
  }
  saida.push(atual.trim());
  return saida;
};

/** Qual coluna um título de cabeçalho é. A ordem importa: "valor total" não é o valor unitário. */
const colunaDoTitulo = (titulo: string): ColunaDaPlanilha | null => {
  const t = chaveDeNome(titulo);
  if (!t) return null;
  if (/total/.test(t)) return 'total';
  if (/^(produto|nome|item|descricao|material)/.test(t)) return 'produto';
  if (/^(marca|fabricante|laboratorio)/.test(t)) return 'marca';
  if (/^(tipo|categoria)/.test(t)) return 'tipo';
  if (/^(quantidade|qtd|qtde|quant)/.test(t)) return 'quantidade';
  if (/^(unidade|un|und|unid|embalagem)\b/.test(t)) return 'unidade';
  if (/(valor|preco|unitario|custo)/.test(t)) return 'valorUnitario';
  if (/^lote/.test(t)) return 'lote';
  if (/^(validade|vencimento|val)\b/.test(t)) return 'validade';
  return null;
};

/**
 * A planilha colada (do Excel ou do Google Planilhas, que copiam com tabulação) ou o CSV (com
 * ponto e vírgula ou vírgula) → linhas do pedido.
 *
 * Com cabeçalho, as colunas são achadas pelo título, em qualquer ordem; sem ele, valem as do
 * modelo, na ordem do modelo. Sem valor unitário mas com total, o unitário sai da divisão. Linha
 * sem produto ou sem quantidade é deixada de fora, com um aviso.
 */
export const lerPlanilha = (texto: string): { linhas: LinhaDaPlanilha[]; avisos: string[] } => {
  const brutas = (texto || '').replace(/^﻿/, '').split(/\r?\n/);
  const avisos: string[] = [];
  const naoVazias = brutas.map((l, i) => ({ texto: l, numero: i + 1 })).filter((l) => l.texto.trim());
  if (naoVazias.length === 0) return { linhas: [], avisos: ['Nada para ler — cole as linhas da planilha.'] };

  const primeira = naoVazias[0].texto;
  const separador = naoVazias.some((l) => l.texto.includes('\t'))
    ? '\t'
    : (primeira.match(/;/g) || []).length >= (primeira.match(/,/g) || []).length && primeira.includes(';')
      ? ';'
      : ',';

  const cabecalho = celulas(primeira, separador).map(colunaDoTitulo);
  const temCabecalho = cabecalho.includes('produto') || cabecalho.filter(Boolean).length >= 2;
  const colunas: (ColunaDaPlanilha | null)[] = temCabecalho
    ? cabecalho
    : COLUNAS_DA_PLANILHA.map((c) => c.id);

  const linhas: LinhaDaPlanilha[] = [];
  (temCabecalho ? naoVazias.slice(1) : naoVazias).forEach(({ texto: bruta, numero }) => {
    const valores = celulas(bruta, separador);
    const campo = (id: ColunaDaPlanilha): string => {
      const i = colunas.indexOf(id);
      return i >= 0 ? valores[i] || '' : '';
    };
    const produto = campo('produto').trim();
    const quantidade = numeroBrasileiro(campo('quantidade'));
    if (!produto || quantidade <= 0) {
      avisos.push(`Linha ${numero} ficou de fora: ${!produto ? 'sem o nome do produto' : 'sem a quantidade'}.`);
      return;
    }
    let valorUnitario = numeroBrasileiro(campo('valorUnitario'));
    const total = numeroBrasileiro(campo('total'));
    if (valorUnitario <= 0 && total > 0) valorUnitario = Math.round((total / quantidade) * 10000) / 10000;
    const validadeBruta = campo('validade').trim();
    const validade = dataBrasileira(validadeBruta);
    if (validadeBruta && !validade) avisos.push(`Linha ${numero}: a validade "${validadeBruta}" não foi entendida.`);
    const linha: LinhaDaPlanilha = { linha: numero, produto, quantidade, valorUnitario };
    const marca = campo('marca').trim();
    const tipo = campo('tipo').trim();
    const unidade = campo('unidade').trim();
    const lote = campo('lote').trim();
    if (marca) linha.marca = marca;
    if (tipo) linha.tipo = tipo;
    if (unidade) linha.unidade = unidade;
    if (lote) linha.lote = lote;
    if (validade) linha.validade = validade;
    linhas.push(linha);
  });
  if (linhas.length === 0 && avisos.length === 0) avisos.push('Nenhuma linha com produto e quantidade.');
  return { linhas, avisos };
};

// ==========================================
// O NOME LIDO E O PRODUTO DO CADASTRO
// ==========================================

const palavras = (texto?: string): Set<string> =>
  new Set(chaveDeNome(texto).split(' ').filter((p) => p.length >= 2));

/**
 * O produto do cadastro que mais parece com o nome lido no pedido, ou `null` se nenhum parece o
 * bastante. Compara as palavras do nome (sem acento, sem maiúscula); a marca igual ajuda a
 * desempatar. É a sugestão — quem confirma é a pessoa, na revisão.
 */
export const casarProduto = (
  nome: string,
  marca: string | undefined,
  produtos: ProdutoDeEstoque[]
): ProdutoDeEstoque | null => {
  const chave = chaveDeNome(nome);
  if (!chave) return null;
  const doNome = palavras(nome);
  const daMarca = chaveDeNome(marca);
  let melhor: { produto: ProdutoDeEstoque; nota: number } | null = null;
  produtos
    .filter((p) => !p.arquivado)
    .forEach((p) => {
      let nota: number;
      if (chaveDeNome(p.nome) === chave) nota = 1;
      else {
        const doProduto = palavras(p.nome);
        const comuns = [...doNome].filter((w) => doProduto.has(w)).length;
        const todas = new Set([...doNome, ...doProduto]).size;
        nota = todas ? comuns / todas : 0;
        // "Voluma" no pedido e "Juvéderm Voluma 1 ml" no cadastro: o nome curto inteiro está no longo.
        if (comuns > 0 && comuns === Math.min(doNome.size, doProduto.size)) nota = Math.max(nota, 0.6);
      }
      if (daMarca && p.marca && chaveDeNome(p.marca) === daMarca) nota += 0.15;
      if (!melhor || nota > melhor.nota) melhor = { produto: p, nota };
    });
  const achado = melhor as { produto: ProdutoDeEstoque; nota: number } | null;
  return achado && achado.nota >= 0.5 ? achado.produto : null;
};

/**
 * A linha lida veio em embalagem? Só dá para saber com caixa cadastrada no produto: aí, unidade
 * lida diferente da unidade de uso ("caixa" no pedido, "frasco" no cadastro) é a embalagem.
 */
export const pareceEmbalagem = (unidadeLida: string | undefined, produto?: ProdutoDeEstoque | null): boolean => {
  const u = chaveDeNome(unidadeLida);
  if (!u || !produto?.caixa?.unidades) return false;
  return chaveDeNome(produto.unidade) !== u;
};

// ==========================================
// LEITURA DO BANCO
// ==========================================

const numeroLido = (valor: unknown): number => {
  const n = typeof valor === 'number' ? valor : Number(valor);
  return Number.isFinite(n) ? n : 0;
};
const textoOpcional = (valor: unknown): string | undefined => (valor ? String(valor) : undefined);
const lista = <T>(valor: unknown): T[] => (Array.isArray(valor) ? (valor as T[]) : []);

export const normalizarLote = (bruto: Record<string, unknown> & { id: string }): LoteDeEstoque => ({
  id: bruto.id,
  produtoId: String(bruto.produtoId || ''),
  produtoNome: String(bruto.produtoNome || 'Produto'),
  marca: textoOpcional(bruto.marca),
  quantidade: numeroLido(bruto.quantidade),
  saldo: numeroLido(bruto.saldo),
  custoUnitario: numeroLido(bruto.custoUnitario),
  lote: textoOpcional(bruto.lote),
  validade: textoOpcional(bruto.validade),
  dataCompra: String(bruto.dataCompra || String(bruto.createdAt || '').slice(0, 10)),
  pedidoId: textoOpcional(bruto.pedidoId),
  fornecedor: textoOpcional(bruto.fornecedor),
  ajustes: lista<Record<string, unknown>>(bruto.ajustes).map((a) => ({
    em: String(a.em || ''),
    de: numeroLido(a.de),
    para: numeroLido(a.para),
    motivo: String(a.motivo || ''),
    porNome: textoOpcional(a.porNome),
  })),
  createdAt: String(bruto.createdAt || ''),
  updatedAt: textoOpcional(bruto.updatedAt),
});

export const normalizarPedido = (bruto: Record<string, unknown> & { id: string }): PedidoDeCompra => {
  const itens = lista<Record<string, unknown>>(bruto.itens).map((i) => ({
    produtoId: String(i.produtoId || ''),
    nome: String(i.nome || ''),
    marca: textoOpcional(i.marca),
    quantidade: numeroLido(i.quantidade),
    porEmbalagem: !!i.porEmbalagem,
    unidadesPorEmbalagem: i.unidadesPorEmbalagem ? numeroLido(i.unidadesPorEmbalagem) : undefined,
    valorUnitario: numeroLido(i.valorUnitario),
    lote: textoOpcional(i.lote),
    validade: textoOpcional(i.validade),
    loteId: String(i.loteId || ''),
  }));
  const anexo = bruto.anexo as PedidoDeCompra['anexo'] | undefined;
  return {
    id: bruto.id,
    dataCompra: String(bruto.dataCompra || ''),
    fornecedor: textoOpcional(bruto.fornecedor),
    numero: textoOpcional(bruto.numero),
    observacoes: textoOpcional(bruto.observacoes),
    anexo: anexo && anexo.url ? anexo : undefined,
    itens,
    total: totalDoPedido(itens),
    estoqueInicial: !!bruto.estoqueInicial,
    criadoPorUid: textoOpcional(bruto.criadoPorUid),
    criadoPorNome: textoOpcional(bruto.criadoPorNome),
    createdAt: String(bruto.createdAt || ''),
  };
};

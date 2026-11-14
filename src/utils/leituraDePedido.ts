import { ProdutoDeEstoque } from '../types';
import { dataBrasileira, numeroBrasileiro } from './lotes';

/**
 * A leitura do pedido de compra por IA — a parte que não depende de rede: o que se pede ao modelo
 * e a limpeza do que ele devolve. A chamada mora no servidor (`server/leituraDePedido.ts`); a tela,
 * em `PedidoDeCompraPanel`. Puro, para `scripts/verificar-leitura-de-pedido.ts` conferir sem IA.
 */

/** O produto do cadastro como vai para o modelo — só o que ajuda a reconhecer. */
export interface ProdutoParaLeitura {
  id: string;
  nome: string;
  marca?: string;
  tipo?: string;
  unidade: string;
}

/** Um item lido e já limpo. `produtoId` só vem quando o modelo reconheceu um produto da lista. */
export interface ItemLido {
  produto: string;
  marca?: string;
  tipo?: string;
  quantidade: number;
  unidade?: string;
  valorUnitario: number;
  lote?: string;
  validade?: string; // YYYY-MM-DD
  produtoId?: string;
}

export interface LeituraDoPedido {
  fornecedor?: string;
  numero?: string;
  dataCompra?: string; // YYYY-MM-DD
  itens: ItemLido[];
}

/** Até quantos produtos do cadastro vão junto — o bastante para qualquer clínica, sem pesar o pedido. */
export const MAXIMO_DE_PRODUTOS_NA_LEITURA = 400;

export const produtosParaLeitura = (produtos: ProdutoDeEstoque[]): ProdutoParaLeitura[] =>
  produtos
    .filter((p) => !p.arquivado)
    .slice(0, MAXIMO_DE_PRODUTOS_NA_LEITURA)
    .map((p) => {
      const item: ProdutoParaLeitura = { id: p.id, nome: p.nome, unidade: p.unidade };
      if (p.marca) item.marca = p.marca;
      if (p.tipo) item.tipo = p.tipo;
      return item;
    });

/** O que se pede ao modelo, junto com a foto ou o PDF. */
export const instrucoesDaLeitura = (produtos: ProdutoParaLeitura[]): string => {
  const lista = produtos.length
    ? produtos
        .map((p) => `- id: ${p.id} | ${p.nome}${p.marca ? ` | marca: ${p.marca}` : ''}${p.tipo ? ` | tipo: ${p.tipo}` : ''} | unidade: ${p.unidade}`)
        .join('\n')
    : '(nenhum produto cadastrado ainda)';
  return [
    'Você lê pedidos de compra e notas fiscais de produtos de uma clínica de estética.',
    'Extraia cada item comprado, um por linha do documento:',
    '- produto: o nome como está escrito no documento;',
    '- marca: o fabricante ou a marca, se aparecer;',
    '- tipo: o que o produto é (ex.: "Ácido hialurônico", "Toxina botulínica", "Fio de PDO"), se der para saber;',
    '- quantidade: quantas unidades foram compradas, na unidade em que foram vendidas;',
    '- unidade: a unidade da compra (caixa, frasco, seringa, ampola, U, ml, un…);',
    '- valorUnitario: o preço de UMA unidade da compra, sem o total da linha;',
    '- valorTotal: o total da linha, se aparecer;',
    '- lote e validade, se aparecerem (validade em dd/mm/aaaa, ou mm/aaaa quando só houver mês e ano).',
    'Também o fornecedor (quem vendeu), o número da nota ou do pedido e a data da compra (dd/mm/aaaa).',
    'Não invente nada: o que não estiver no documento fica vazio. Frete, impostos e descontos gerais não são itens.',
    '',
    'Estes produtos já estão cadastrados na clínica. Se um item for claramente um deles (mesmo com outro',
    'nome ou abreviado), preencha produtoId com o id dele; se não tiver certeza, deixe produtoId vazio.',
    lista,
  ].join('\n');
};

const texto = (valor: unknown, maximo = 200): string | undefined => {
  if (valor === null || valor === undefined) return undefined;
  const t = String(valor).replace(/\s+/g, ' ').trim().slice(0, maximo);
  return t || undefined;
};

const numero = (valor: unknown): number => (typeof valor === 'number' ? (Number.isFinite(valor) && valor > 0 ? valor : 0) : Math.max(0, numeroBrasileiro(valor)));

/**
 * O que o modelo devolveu → a leitura, limpa. Item sem nome ou sem quantidade sai; o valor unitário
 * que faltar sai do total; datas em qualquer formato brasileiro viram AAAA-MM-DD; e `produtoId` só
 * fica se for mesmo de um produto da lista — um id inventado viraria um produto que não existe.
 */
export const normalizarLeitura = (bruto: unknown, idsValidos: Set<string>): LeituraDoPedido => {
  const b = (bruto && typeof bruto === 'object' ? bruto : {}) as Record<string, unknown>;
  const itens: ItemLido[] = [];
  (Array.isArray(b.itens) ? b.itens : []).forEach((x) => {
    const i = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    const produto = texto(i.produto, 160);
    const quantidade = numero(i.quantidade);
    if (!produto || quantidade <= 0) return;
    let valorUnitario = numero(i.valorUnitario);
    const valorTotal = numero(i.valorTotal);
    if (valorUnitario <= 0 && valorTotal > 0) valorUnitario = Math.round((valorTotal / quantidade) * 10000) / 10000;
    const item: ItemLido = { produto, quantidade, valorUnitario };
    const marca = texto(i.marca, 80);
    const tipo = texto(i.tipo, 80);
    const unidade = texto(i.unidade, 30);
    const lote = texto(i.lote, 60);
    const validade = dataBrasileira(texto(i.validade, 20));
    const produtoId = texto(i.produtoId, 120);
    if (marca) item.marca = marca;
    if (tipo) item.tipo = tipo;
    if (unidade) item.unidade = unidade;
    if (lote) item.lote = lote;
    if (validade) item.validade = validade;
    if (produtoId && idsValidos.has(produtoId)) item.produtoId = produtoId;
    itens.push(item);
  });
  const leitura: LeituraDoPedido = { itens };
  const fornecedor = texto(b.fornecedor, 120);
  const numeroDaNota = texto(b.numero, 60);
  const dataCompra = dataBrasileira(texto(b.dataCompra, 20));
  if (fornecedor) leitura.fornecedor = fornecedor;
  if (numeroDaNota) leitura.numero = numeroDaNota;
  if (dataCompra) leitura.dataCompra = dataCompra;
  return leitura;
};

/** Os tipos de arquivo que a leitura aceita — os mesmos do anexo do pedido. */
export const TIPOS_DA_LEITURA = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

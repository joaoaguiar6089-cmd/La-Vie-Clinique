import { Procedure, QuoteItem, QuoteItemDetail } from "../types";

const novoId = (prefixo: string) =>
  `${prefixo}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/**
 * Detalhes que o item nasce mostrando. Os quatro campos que já existem no cadastro
 * do procedimento entram automaticamente; `quoteDetails` traz o que só faz sentido
 * em orçamento (produto, unidades, duração do efeito). A ordem segue o design:
 * áreas tratadas, campos próprios do procedimento, e por fim tempo e recuperação.
 */
export const montarDetalhesDoProcedimento = (procedure: Procedure): QuoteItemDetail[] => {
  const detalhes: QuoteItemDetail[] = [];

  const push = (titulo: string, valor?: string) => {
    const limpo = (valor || "").trim();
    if (limpo) detalhes.push({ id: novoId("qd"), titulo, valor: limpo });
  };

  push("Áreas tratadas", procedure.areasTreated?.join(", "));

  (procedure.quoteDetails || []).forEach((d) => push(d.titulo, d.valor));

  push("Tempo em clínica", procedure.duration);
  push("Recuperação", procedure.recoveryTime);
  push("Sessões", procedure.sessionsRecommended);

  return detalhes;
};

/** Item de orçamento pré-preenchido a partir do catálogo. Tudo continua editável. */
export const montarItemDoProcedimento = (procedure: Procedure): QuoteItem => ({
  id: novoId("qi"),
  procedureId: procedure.id,
  categoria: procedure.category,
  titulo: procedure.title,
  // O "a partir de" do catálogo não vale em orçamento: aqui o valor é firme
  valorTabela:
    procedure.promotionalPrice && procedure.promotionalPrice > 0
      ? procedure.promotionalPrice
      : procedure.price,
  temDesconto: false,
  maisDeUmaSessao: false,
  sessoes: 1,
  notaPreco: procedure.priceNote,
  detalhes: montarDetalhesDoProcedimento(procedure),
});

/** Item em branco, para um procedimento que não está no catálogo. */
export const montarItemAvulso = (): QuoteItem => ({
  id: novoId("qi"),
  categoria: "",
  titulo: "",
  valorTabela: 0,
  temDesconto: false,
  maisDeUmaSessao: false,
  sessoes: 1,
  detalhes: [],
});

/** Cópia profunda de itens com IDs novos — usada ao duplicar ou substituir um orçamento. */
export const clonarItens = (itens: QuoteItem[]): QuoteItem[] =>
  itens.map((item) => ({
    ...item,
    id: novoId("qi"),
    detalhes: item.detalhes.map((d) => ({ ...d, id: novoId("qd") })),
  }));

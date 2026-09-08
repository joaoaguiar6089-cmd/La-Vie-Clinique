import {
  ClinicProfile,
  Procedure,
  Professional,
  QuoteClinicSnapshot,
  QuoteItem,
  QuoteItemDetail,
} from "../types";
import { QUOTE_DEFAULTS } from "./quoteCalc";

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

/**
 * Item de orçamento pré-preenchido a partir do catálogo. Tudo continua editável.
 * A profissional vem da atribuição do próprio procedimento quando existe; senão,
 * da responsável escolhida no orçamento.
 */
export const montarItemDoProcedimento = (
  procedure: Procedure,
  professionals: Professional[] = [],
  professionalPadraoId?: string
): QuoteItem => {
  const idAtribuido = procedure.assignedDoctorIds?.find((id) =>
    professionals.some((p) => p.id === id)
  );
  const professionalId = idAtribuido || professionalPadraoId;
  const profissional = professionals.find((p) => p.id === professionalId);

  return {
    id: novoId("qi"),
    procedureId: procedure.id,
    categoria: procedure.category,
    titulo: procedure.title,
    professionalId,
    profissionalNome: profissional?.name,
    // O "a partir de" do catálogo não vale em orçamento: aqui o valor é firme
    valorTabela:
      procedure.promotionalPrice && procedure.promotionalPrice > 0
        ? procedure.promotionalPrice
        : procedure.price,
    temDesconto: false,
    maisDeUmaSessao: false,
    sessoes: 1,
    detalhes: montarDetalhesDoProcedimento(procedure),
  };
};

/** Item em branco, para um procedimento que não está no catálogo. */
export const montarItemAvulso = (
  professionals: Professional[] = [],
  professionalPadraoId?: string
): QuoteItem => {
  const profissional = professionals.find((p) => p.id === professionalPadraoId);
  return {
    id: novoId("qi"),
    categoria: "",
    titulo: "",
    professionalId: professionalPadraoId,
    profissionalNome: profissional?.name,
    valorTabela: 0,
    temDesconto: false,
    maisDeUmaSessao: false,
    sessoes: 1,
    detalhes: [],
  };
};

/** Último recurso para orçamentos antigos abertos pela página pública, que não lê clinic_settings. */
export const SNAPSHOT_CLINICA_PADRAO: QuoteClinicSnapshot = {
  name: "La Vie Clinique",
  legalNotice: QUOTE_DEFAULTS.legalNotice,
};

/** Congela os dados da clínica que o documento precisa mostrar, hoje e daqui a um ano. */
export const montarSnapshotClinica = (clinic: ClinicProfile): QuoteClinicSnapshot => ({
  name: clinic.name,
  tagline: clinic.tagline || undefined,
  cityState: clinic.cityState || undefined,
  phone: clinic.phone || undefined,
  email: clinic.email || undefined,
  instagram: clinic.instagram || undefined,
  legalNotice: clinic.quoteLegalNotice?.trim() || QUOTE_DEFAULTS.legalNotice,
});

/** Cópia profunda de itens com IDs novos — usada ao duplicar ou substituir um orçamento. */
export const clonarItens = (itens: QuoteItem[]): QuoteItem[] =>
  itens.map((item) => ({
    ...item,
    id: novoId("qi"),
    detalhes: item.detalhes.map((d) => ({ ...d, id: novoId("qd") })),
  }));

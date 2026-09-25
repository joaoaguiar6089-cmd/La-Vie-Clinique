import { Quote, QuoteDraft } from '../types';
import { createQuote, markQuoteAsSent, replaceQuote, updateQuote } from './databaseService';

/**
 * Salvar um orçamento é uma de três coisas: editar o rascunho, substituir um já enviado (número
 * novo, os dois ligados) ou criar um do zero — duplicar é criar a partir de outro.
 *
 * A escolha morava em cada tela que abre o formulário. Com a tela de Orçamentos, a página da
 * paciente e a linha do tempo da tela Hoje fazendo a mesma coisa, ela sai para cá, pelo mesmo
 * motivo de `attendanceWorkflow.ts`: três cópias acabariam divergindo.
 *
 * Devolve o orçamento gravado — é dele que vem o id de um orçamento novo.
 */
export const salvarOrcamento = async (
  draft: QuoteDraft,
  opcoes: { existente?: Quote; substituindo?: Quote | null } = {}
): Promise<Quote> => {
  if (opcoes.existente) return updateQuote(opcoes.existente, draft);
  if (opcoes.substituindo) return replaceQuote(opcoes.substituindo, draft);
  return createQuote(draft);
};

/** O 1º compartilhamento do link tira o orçamento de rascunho e trava a edição. */
export const marcarComoEnviadoSeRascunho = async (quote: Quote): Promise<void> => {
  if (quote.status !== 'rascunho') return;
  await markQuoteAsSent(quote.id);
};

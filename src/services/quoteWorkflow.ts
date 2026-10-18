import { Quote, QuoteDraft } from '../types';
import {
  createQuote,
  markQuoteAsSent,
  replaceQuote,
  saveCustoDoOrcamento,
  updateQuote,
} from './databaseService';
import { CustoEmEdicao, montarCustoDoOrcamento } from '../utils/estoque';

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

/**
 * O orçamento primeiro, o custo depois — o custo precisa do id que o orçamento ganha, e das
 * posições dos itens gravados. Se só o custo falhar, o orçamento continua salvo e a falha volta
 * em `erroDoCusto`, em vez de fazer a profissional salvar o orçamento de novo (o que, num
 * orçamento novo, criaria outro número).
 */
export const salvarOrcamentoComCusto = async (
  draft: QuoteDraft,
  opcoes: { existente?: Quote; substituindo?: Quote | null },
  custo?: CustoEmEdicao
): Promise<{ salvo: Quote; erroDoCusto?: string }> => {
  const salvo = await salvarOrcamento(draft, opcoes);
  if (!custo) return { salvo };
  try {
    await saveCustoDoOrcamento(montarCustoDoOrcamento(salvo, custo));
    return { salvo };
  } catch (e) {
    return {
      salvo,
      erroDoCusto:
        `O orçamento ${salvo.numero} foi salvo, mas o custo de material não: ${(e as Error).message}. ` +
        'Se for erro de permissão, publique as regras novas do Firebase.',
    };
  }
};

/** O 1º compartilhamento do link tira o orçamento de rascunho e trava a edição. */
export const marcarComoEnviadoSeRascunho = async (quote: Quote): Promise<void> => {
  if (quote.status !== 'rascunho') return;
  await markQuoteAsSent(quote.id);
};

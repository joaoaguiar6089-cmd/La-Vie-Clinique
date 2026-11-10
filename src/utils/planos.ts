/**
 * Os planos da plataforma e os limites do gratuito (docs/zulia-plataforma.md, "Planos").
 *
 * Puro, para valer igual no painel, no servidor e nos testes. As regras do Firestore
 * (`zulia/firestore.rules`) repetem os números: mudou aqui, mude lá.
 *
 * Como o uso é contado: `clinicas/{c}.uso.clientes` e `.uso.procedimentos` sobem e descem na mesma
 * gravação em que o cadastro nasce ou é excluído de vez (cliente arquivada continua contando). No
 * painel, isso é feito por `savePatient`, `saveProcedureToDb` e companhia; no servidor, pela ficha
 * pública de cliente nova. As regras recusam, no plano gratuito, a criação sem o contador ou além
 * do limite. Logins: o índice `clinicas/{c}.equipe`, conferido pelo servidor.
 */

export type Plano = 'gratuito' | 'completo';

export interface LimitesDoPlano {
  clientes: number;
  procedimentos: number;
  logins: number;
}

const SEM_LIMITE = Number.POSITIVE_INFINITY;

export const LIMITES_DO_GRATUITO: LimitesDoPlano = { clientes: 5, procedimentos: 2, logins: 1 };

/** Os limites de um plano. Plano desconhecido vale como gratuito: na dúvida, o mais restrito. */
export const limitesDoPlano = (plano: unknown): LimitesDoPlano =>
  plano === 'completo' ? { clientes: SEM_LIMITE, procedimentos: SEM_LIMITE, logins: SEM_LIMITE } : LIMITES_DO_GRATUITO;

export interface UsoDaClinica {
  clientes: number;
  procedimentos: number;
}

/** O uso gravado na clínica, com zero no que faltar. */
export const usoDe = (dados: unknown): UsoDaClinica => {
  const uso = (dados && typeof dados === 'object' ? (dados as { uso?: Record<string, unknown> }).uso : null) || {};
  const numero = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  return { clientes: numero(uso.clientes), procedimentos: numero(uso.procedimentos) };
};

export type RecursoLimitado = 'clientes' | 'procedimentos' | 'logins';

/** Cabe mais um? */
export const cabeMaisUm = (plano: unknown, recurso: Exclude<RecursoLimitado, 'logins'>, uso: UsoDaClinica): boolean =>
  uso[recurso] < limitesDoPlano(plano)[recurso];

/** A frase para quem bateu no limite. */
export function mensagemDoLimite(recurso: RecursoLimitado): string {
  const { clientes, procedimentos, logins } = LIMITES_DO_GRATUITO;
  switch (recurso) {
    case 'clientes':
      return `O plano gratuito permite até ${clientes} clientes (as arquivadas contam). Para cadastrar mais, assine o plano completo — ou exclua de vez uma cliente que não atende mais.`;
    case 'procedimentos':
      return `O plano gratuito permite até ${procedimentos} procedimentos. Para cadastrar mais, assine o plano completo — ou exclua um procedimento que não usa.`;
    case 'logins':
      return `O plano gratuito permite ${logins} login. Para ter a sua equipe no painel, assine o plano completo.`;
  }
}

/** O erro que o painel e o servidor lançam quando a gravação passaria do limite. */
export class ErroDeLimiteDoPlano extends Error {
  constructor(readonly recurso: RecursoLimitado) {
    super(mensagemDoLimite(recurso));
    this.name = 'ErroDeLimiteDoPlano';
  }
}

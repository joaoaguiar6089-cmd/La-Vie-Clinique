import type { Request } from 'express';
import { ehZulia } from '../src/lib/projetoFirebase';
import { idDeClinicaValido } from '../src/utils/clinicas';
import { authAdmin } from './firebaseAdmin';

/**
 * Quem fez o pedido: o login do painel, conferido pelo Admin SDK (`verifyIdToken`), com a clínica
 * e o papel que o servidor gravou nas custom claims (ver docs/zulia-plataforma.md).
 *
 * É a única porta de entrada de login do servidor — Google Agenda e `/api/equipe` passam por aqui.
 * No modo legado (projeto da La Vie), os logins não têm claim: `clinicaId` e `papel` vêm `null`, e
 * quem decide o acesso é a lista da equipe, como sempre.
 */

export type Papel = 'admin' | 'profissional';

export interface LoginDoPainel {
  uid: string;
  email: string | null;
  /** A clínica do login (claim `clinicaId`), ou `null` sem claim. */
  clinicaId: string | null;
  /** O papel na clínica (claim `papel`), ou `null` sem claim. */
  papel: Papel | null;
  /** Dono da plataforma (claim `donoDaPlataforma`). */
  dono: boolean;
  /** O e-mail do login foi confirmado (claim padrão `email_verified`). Ausente: não. */
  emailVerificado?: boolean;
  /**
   * O segundo fator usado para entrar nesta sessão (`firebase.sign_in_second_factor`: `totp` pelo
   * aplicativo autenticador, `phone` por SMS), ou `null` se entrou só com a senha.
   */
  segundoFator?: string | null;
}

/** As claims viram o login. Puro, para conferir sem token (`scripts/verificar-servidor-zulia.ts`). */
export const loginDasClaims = (claims: Record<string, unknown> & { uid: string; email?: unknown }): LoginDoPainel => ({
  uid: claims.uid,
  email: typeof claims.email === 'string' ? claims.email : null,
  clinicaId: idDeClinicaValido(claims.clinicaId) || null,
  papel: claims.papel === 'admin' || claims.papel === 'profissional' ? claims.papel : null,
  dono: claims.donoDaPlataforma === true,
  emailVerificado: claims.email_verified === true,
  segundoFator:
    typeof (claims.firebase as { sign_in_second_factor?: unknown } | undefined)?.sign_in_second_factor === 'string'
      ? String((claims.firebase as { sign_in_second_factor: string }).sign_in_second_factor)
      : null,
});

/** Códigos do Admin SDK que querem dizer "este token não vale" — e não "não deu para conferir". */
const TOKEN_QUE_NAO_VALE = new Set([
  'auth/argument-error',
  'auth/id-token-expired',
  'auth/id-token-revoked',
  'auth/invalid-id-token',
  'auth/user-disabled',
  'auth/user-not-found',
]);

/**
 * Confere o token (assinatura, projeto, validade) e devolve o login, ou `null` se não for um login
 * válido deste projeto.
 *
 * Na Zulia confere também se o login continua ativo (`checkRevoked`): um login desativado em
 * `/api/equipe/desativar` ainda tem um token assinado por até uma hora, e é isso que o barra antes.
 * Essa conferência consulta o Authentication; se ela falhar por outro motivo (rede, permissão),
 * vale a assinatura, com aviso no registro. No legado, só a assinatura — como sempre foi.
 */
export async function verificarLogin(
  token: string,
  { conferirSeAtivo = ehZulia }: { conferirSeAtivo?: boolean } = {}
): Promise<LoginDoPainel | null> {
  if (!token) return null;
  try {
    return loginDasClaims(await authAdmin().verifyIdToken(token, conferirSeAtivo));
  } catch (erro) {
    const codigo = String((erro as { code?: string })?.code || '');
    if (!conferirSeAtivo || TOKEN_QUE_NAO_VALE.has(codigo)) return null;
    console.warn(`[login] não deu para conferir se o login está ativo (${codigo}); vale a assinatura.`);
    try {
      return loginDasClaims(await authAdmin().verifyIdToken(token));
    } catch {
      return null;
    }
  }
}

/** O token do cabeçalho `Authorization: Bearer <token>`, ou `''`. */
export const tokenDoPedido = (req: Request): string => {
  const cabecalho = req.headers.authorization || '';
  return cabecalho.startsWith('Bearer ') ? cabecalho.slice(7).trim() : '';
};

/** O login de quem fez o pedido, ou `null`. */
export const loginDoPedido = (req: Request): Promise<LoginDoPainel | null> => verificarLogin(tokenDoPedido(req));

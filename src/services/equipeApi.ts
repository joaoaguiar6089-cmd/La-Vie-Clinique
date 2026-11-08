import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../lib/firebase';

/**
 * Os logins da equipe na Zulia, pelo servidor (`/api/equipe`, ver `server/equipe.ts`).
 *
 * Na plataforma, a clínica e o papel de cada login moram nas custom claims, que só o servidor
 * grava. Por isso criar login, mudar o papel e desativar não acontecem mais no navegador como no
 * modo legado (`createProfessionalLogin`). Só a admin da clínica consegue: o servidor confere.
 */

export type PapelNaClinica = 'admin' | 'profissional';

export class ErroDaEquipe extends Error {
  constructor(
    readonly codigo: string,
    readonly status: number
  ) {
    super(codigo);
  }
}

async function chamar<T>(rota: string, corpo: unknown): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new ErroDaEquipe('login', 401);
  const resposta = await fetch(`/api/equipe/${rota}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(corpo),
  });
  const json: any = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new ErroDaEquipe(json?.erro || `http-${resposta.status}`, resposta.status);
  return json as T;
}

/**
 * Cria o login (com a clínica e o papel) e manda o e-mail de definir a senha, que é o convite.
 * Devolve o uid.
 */
export async function criarLoginNaClinica(email: string, papel: PapelNaClinica): Promise<string> {
  const { uid } = await chamar<{ uid: string }>('criar-login', { email: email.trim(), papel });
  await sendPasswordResetEmail(auth, email.trim());
  return uid;
}

export async function mudarPapelNaClinica(uid: string, papel: PapelNaClinica): Promise<void> {
  await chamar('mudar-papel', { uid, papel });
}

export async function desativarLoginNaClinica(uid: string): Promise<void> {
  await chamar('desativar', { uid });
}

/** Uma frase para a tela, a partir do erro do servidor. */
export function mensagemDoErroDaEquipe(erro: unknown): string {
  const codigo = erro instanceof ErroDaEquipe ? erro.codigo : '';
  switch (codigo) {
    case 'email-em-uso':
      return 'Este e-mail já é o login de outra conta. Use outro e-mail para esta profissional.';
    case 'email-invalido':
      return 'O e-mail não parece válido. Confira e tente de novo.';
    case 'ultima-admin':
      return 'A clínica precisa de ao menos uma admin. Torne outra pessoa admin antes.';
    case 'desativar-a-si-mesma':
      return 'Você não pode desativar o próprio login enquanto está usando ele.';
    case 'so-admin':
      return 'Só a admin da clínica pode mexer nos logins da equipe.';
    case 'login-nao-encontrado':
      return 'Este login não foi encontrado na clínica.';
    case 'servidor-nao-configurado':
      return 'O servidor ainda não está configurado para criar logins. Avise o suporte.';
    default:
      return 'Não foi possível concluir agora. Tente novamente.';
  }
}

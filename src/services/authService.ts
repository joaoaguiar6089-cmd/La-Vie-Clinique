import { initializeApp, deleteApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  createUserWithEmailAndPassword,
  type User,
} from 'firebase/auth';
import { auth, firebaseConfig } from '../lib/firebase';
import { definirClinicaAtual } from '../lib/estadoDaClinica';
import { ehZulia } from '../lib/projetoFirebase';
import { idDeClinicaValido } from '../utils/clinicas';
import { resetSharedSubscriptions } from './sharedSubscription';

export function onAuthChange(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

export async function login(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function logout(): Promise<void> {
  // As assinaturas compartilhadas guardam o último valor lido para entregá-lo de imediato a quem
  // assinar depois. Sem limpá-las aqui, a próxima pessoa a entrar nesta mesma aba veria por um
  // instante os pacientes e fichas da sessão anterior.
  resetSharedSubscriptions();
  await signOut(auth);
  if (ehZulia) {
    // Na plataforma, quem entra depois nesta aba pode ser de outra clínica. Além das assinaturas,
    // o painel guarda em memória o catálogo, as pacientes, a agenda... Recarregar a página é o
    // único jeito de garantir que nada da clínica anterior apareça para ela.
    definirClinicaAtual(null);
    window.location.reload();
  }
}

/** O que as custom claims do login dizem, na Zulia (ver docs/zulia-plataforma.md). */
export interface AcessoDaPlataforma {
  clinicaId: string | null;
  papel: 'admin' | 'profissional' | null;
  dono: boolean;
}

/**
 * Lê as claims do login (`getIdTokenResult`). Com `forcar`, pede um token novo ao Firebase — é o
 * que faz valer na hora uma claim que o servidor acabou de mudar (o papel, por exemplo); sem isso
 * o token antigo vale por até uma hora.
 */
export async function lerAcessoDaPlataforma(user: User, forcar = false): Promise<AcessoDaPlataforma> {
  const { claims } = await user.getIdTokenResult(forcar);
  return {
    clinicaId: idDeClinicaValido(claims.clinicaId) || null,
    papel: claims.papel === 'admin' || claims.papel === 'profissional' ? claims.papel : null,
    dono: claims.donoDaPlataforma === true,
  };
}

export async function sendResetPasswordEmail(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim());
}

/**
 * Modo legado (projeto da La Vie). Na Zulia, o login nasce no servidor, com a clínica e o papel
 * nas claims — ver `services/equipeApi.ts`.
 *
 * Cria a conta de login (Firebase Auth) de uma nova profissional sem derrubar a sessão de
 * quem está criando. `createUserWithEmailAndPassword` autentica automaticamente o usuário
 * recém-criado na instância de Auth usada — por isso essa chamada roda numa instância
 * secundária e temporária do Firebase App, descartada logo em seguida. A sessão do admin
 * (na instância principal `auth`) nunca é afetada.
 */
export async function createProfessionalLogin(email: string): Promise<string> {
  const secondaryApp = initializeApp(firebaseConfig, `secondary-${Date.now()}`);
  const secondaryAuth = getAuth(secondaryApp);
  try {
    // Senha temporária aleatória — a profissional nunca a usa; ela define a própria senha
    // através do link de redefinição enviado por e-mail logo abaixo.
    const tempPassword = `Tmp-${crypto.randomUUID()}`;
    const credential = await createUserWithEmailAndPassword(secondaryAuth, email.trim(), tempPassword);
    await sendPasswordResetEmail(secondaryAuth, email.trim());
    return credential.user.uid;
  } finally {
    await signOut(secondaryAuth).catch(() => {});
    await deleteApp(secondaryApp).catch(() => {});
  }
}

export type { User };

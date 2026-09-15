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
}

export async function sendResetPasswordEmail(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim());
}

/**
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

/**
 * Script de execução única: cria a conta de login (Firebase Auth) da primeira admin
 * e marca o registro dela em `clinic_settings.professionals` com email/uid/isAdmin.
 *
 * Por que um script à parte: as novas regras do Firestore exigem autenticação para
 * escrever em `clinic_settings`, e a única forma de criar o próprio login de admin
 * (via botão "Criar login" no painel) é já estar logada como admin — para o primeiro
 * acesso, alguém precisa existir antes. Este script resolve esse bootstrap uma única vez,
 * fora do painel.
 *
 * Uso:
 *   npx tsx scripts/bootstrap-first-admin.ts
 *
 * Depois de rodar, Karoline recebe um e-mail do Firebase para definir a própria senha.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const firebaseConfig = JSON.parse(readFileSync(join(__dirname, '../firebase-applet-config.json'), 'utf-8'));

const ADMIN_EMAIL = 'enfesteta.karoline@gmail.com';
// Senha temporária apenas para o Firebase aceitar a criação da conta — Karoline nunca a
// usa, pois define a própria senha pelo e-mail de redefinição enviado ao final.
const TEMP_PASSWORD = 'Bootstrap-Temp-' + ADMIN_EMAIL.length + '-LaVie2026!';
const PROFESSIONAL_NAME_MATCH = 'karoline';

async function main() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = firebaseConfig.firestoreDatabaseId
    ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
    : getFirestore(app);

  console.log(`Criando (ou reaproveitando) conta de login para ${ADMIN_EMAIL}...`);
  let uid: string;
  try {
    const cred = await createUserWithEmailAndPassword(auth, ADMIN_EMAIL, TEMP_PASSWORD);
    uid = cred.user.uid;
    console.log('Conta criada no Firebase Auth. uid:', uid);
  } catch (err: any) {
    if (err?.code === 'auth/email-already-in-use') {
      console.log('Conta já existe — entrando com a senha temporária do bootstrap...');
      const cred = await signInWithEmailAndPassword(auth, ADMIN_EMAIL, TEMP_PASSWORD);
      uid = cred.user.uid;
    } else {
      throw err;
    }
  }

  const clinicRef = doc(db, 'clinic_settings', 'main_profile');
  const snap = await getDoc(clinicRef);
  if (!snap.exists()) {
    throw new Error('Documento clinic_settings/main_profile não encontrado — a clínica ainda não tem dados no Firestore.');
  }

  const clinic = snap.data() as { professionals?: Array<Record<string, any>> };
  const professionals = clinic.professionals || [];
  const idx = professionals.findIndex((p) => String(p.name || '').toLowerCase().includes(PROFESSIONAL_NAME_MATCH));
  if (idx === -1) {
    throw new Error(`Nenhuma profissional com nome contendo "${PROFESSIONAL_NAME_MATCH}" encontrada em clinic_settings.professionals.`);
  }

  const updatedProfessionals = professionals.map((p, i) =>
    i === idx ? { ...p, email: ADMIN_EMAIL, uid, isAdmin: true } : p
  );

  await setDoc(clinicRef, { professionals: updatedProfessionals, updatedAt: new Date().toISOString() }, { merge: true });
  console.log(`Profissional "${professionals[idx].name}" atualizada com email/uid/isAdmin=true.`);

  await sendPasswordResetEmail(auth, ADMIN_EMAIL);
  console.log(`E-mail de definição de senha enviado para ${ADMIN_EMAIL}.`);

  await signOut(auth);
  console.log('Concluído.');
}

main().catch((err) => {
  console.error('Falha no bootstrap:', err);
  process.exit(1);
});

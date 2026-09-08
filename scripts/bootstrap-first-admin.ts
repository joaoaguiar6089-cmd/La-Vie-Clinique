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
    if (err?.code === 'auth/operation-not-allowed') {
      console.error('\n❌ ERRO: O provedor "E-mail/senha" está DESATIVADO no Firebase Authentication.');
      console.error('Para ativar (leva menos de 1 minuto):');
      console.error('1. Acesse: https://console.firebase.google.com/project/' + firebaseConfig.projectId + '/authentication/providers');
      console.error('2. Clique em "E-mail/senha" (Email/Password).');
      console.error('3. Ative a primeira chave ("Permitir que os usuários se cadastrem usando o e-mail e a senha") e clique em Salvar.');
      console.error('4. Em seguida, execute este script novamente: npx tsx scripts/bootstrap-first-admin.ts\n');
      process.exit(1);
    } else if (err?.code === 'auth/email-already-in-use') {
      console.log('Conta já existe — entrando com a senha temporária do bootstrap...');
      try {
        const cred = await signInWithEmailAndPassword(auth, ADMIN_EMAIL, TEMP_PASSWORD);
        uid = cred.user.uid;
      } catch (signInErr: any) {
        // Usuário já pode ter definido sua própria senha ou estar cadastrado
        console.log('Conta existente encontrada no Firebase Auth.');
        await sendPasswordResetEmail(auth, ADMIN_EMAIL);
        console.log(`Link de redefinição de senha enviado para ${ADMIN_EMAIL}.`);
        console.log('Concluído.');
        return;
      }
    } else {
      throw err;
    }
  }

  const clinicRef = doc(db, 'clinic_settings', 'main_profile');
  const snap = await getDoc(clinicRef);
  let professionals: Array<Record<string, any>> = [];

  if (!snap.exists()) {
    console.log('Documento clinic_settings/main_profile não existia — inicializando perfil padrão...');
    professionals = [
      {
        id: 'doc-karoline',
        name: 'Dra. Karoline Ferreira',
        registryNumber: 'Responsável Técnica',
        title: 'Especialista em Estética Avançada & Tecnologias',
        specialty: 'Especialista em Estética Avançada & Tecnologias',
        email: ADMIN_EMAIL,
        uid,
        isAdmin: true,
      },
    ];
    await setDoc(clinicRef, {
      name: 'La Vie - Clínica de Estética Facial e Corporal',
      tagline: 'Estética Avançada, Tecnologias de Alta Performance e Cuidado Personalizado',
      professionalName: 'Dra. Karoline Ferreira',
      professionalTitle: 'Especialista em Estética Avançada & Tecnologias',
      registryNumber: 'Dra. Karoline Ferreira',
      professionals,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  } else {
    const clinic = snap.data() as { professionals?: Array<Record<string, any>> };
    professionals = clinic.professionals || [];
    const idx = professionals.findIndex((p) => String(p.name || '').toLowerCase().includes(PROFESSIONAL_NAME_MATCH));
    
    if (idx === -1) {
      professionals.push({
        id: 'doc-karoline',
        name: 'Dra. Karoline Ferreira',
        email: ADMIN_EMAIL,
        uid,
        isAdmin: true,
      });
    } else {
      professionals = professionals.map((p, i) =>
        i === idx ? { ...p, email: ADMIN_EMAIL, uid, isAdmin: true } : p
      );
    }

    await setDoc(clinicRef, { professionals, updatedAt: new Date().toISOString() }, { merge: true });
  }

  console.log(`Profissional Karoline atualizada com email/uid/isAdmin=true no Firestore.`);

  await sendPasswordResetEmail(auth, ADMIN_EMAIL);
  console.log(`E-mail de definição de senha enviado para ${ADMIN_EMAIL}.`);

  await signOut(auth);
  console.log('Bootstrap finalizado com sucesso!');
}

main().catch((err) => {
  console.error('Falha no bootstrap:', err);
  process.exit(1);
});

/**
 * Script de execução única: tira as imagens em base64 de dentro dos documentos do Firestore e as
 * move para o Firebase Storage, deixando no documento apenas a URL.
 *
 * Por que rodar: enquanto as fotos ficam embutidas, uma ficha-modelo com foto feminina, foto
 * masculina e imagem orientativa passa do teto de 1 MB por documento do Firestore — e aí *nada*
 * daquela ficha salva, nem uma linha de texto. A partir da versão que criou `imageStorage.ts`,
 * imagens novas já vão direto para o Storage; este script cuida das que já estavam gravadas.
 *
 * Antes de rodar:
 *   1. Habilite o Firebase Storage no projeto (console do Firebase > Storage > Começar).
 *   2. Publique as regras:  firebase deploy --only storage
 *   3. Tenha certeza de que a cota diária do Firestore não está esgotada — o script lê e grava.
 *
 * Uso:
 *   npx tsx scripts/migrar-imagens-para-storage.ts            (simulação, não grava nada)
 *   npx tsx scripts/migrar-imagens-para-storage.ts --aplicar  (grava de verdade)
 *
 * É seguro rodar mais de uma vez: campos que já são URL são ignorados.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { getStorage, ref, uploadString, getDownloadURL } from 'firebase/storage';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

const aplicar = process.argv.includes('--aplicar');

const raiz = dirname(dirname(fileURLToPath(import.meta.url)));
const config = JSON.parse(readFileSync(join(raiz, 'firebase-applet-config.json'), 'utf8'));

const app = initializeApp(config);
const db = config.firestoreDatabaseId
  ? getFirestore(app, config.firestoreDatabaseId)
  : getFirestore(app);
const storage = getStorage(app);

/** Campos de imagem de cada coleção, na ordem em que aparecem no documento. */
const CAMPOS = {
  anamnesis_templates: [
    'fotoModeloUrl',
    'fotoModeloFemininoUrl',
    'fotoModeloMasculinoUrl',
    'imagemOrientativaUrl',
  ],
  anamnesis_records: [
    'fotoModeloUrl',
    'fotoModeloAnotadaUrl',
    'fotoPacienteUrl',
    'fotoPacienteAnotadaUrl',
    'fotoUrl',
  ],
} as const;

const ehBase64 = (v: unknown): v is string => typeof v === 'string' && v.startsWith('data:image');

async function subir(dataUrl: string, pasta: string): Promise<string> {
  const extensao = dataUrl.startsWith('data:image/png') ? 'png' : 'jpg';
  const objeto = ref(storage, `${pasta}/${crypto.randomUUID()}.${extensao}`);
  await uploadString(objeto, dataUrl, 'data_url');
  return getDownloadURL(objeto);
}

async function migrarColecao(nome: keyof typeof CAMPOS, pasta: string): Promise<void> {
  const snap = await getDocs(collection(db, nome));
  console.log(`\n== ${nome}: ${snap.size} documento(s)`);

  let migrados = 0;
  let bytesLiberados = 0;

  for (const docSnap of snap.docs) {
    const dados = docSnap.data() as Record<string, unknown>;
    const alteracoes: Record<string, string> = {};

    for (const campo of CAMPOS[nome]) {
      const valor = dados[campo];
      if (!ehBase64(valor)) continue;

      bytesLiberados += valor.length;
      if (aplicar) {
        alteracoes[campo] = await subir(valor, pasta);
      } else {
        alteracoes[campo] = '(simulação)';
      }
    }

    if (Object.keys(alteracoes).length === 0) continue;

    migrados++;
    const rotulo = (dados.procedimentoNome as string) || (dados.pacienteNome as string) || docSnap.id;
    console.log(`   ${rotulo}: ${Object.keys(alteracoes).join(', ')}`);

    if (aplicar) {
      await updateDoc(doc(db, nome, docSnap.id), alteracoes);
    }
  }

  console.log(
    `   -> ${migrados} documento(s) com imagem embutida, ` +
      `${(bytesLiberados / 1024 / 1024).toFixed(2)} MB saindo dos documentos.`
  );
}

async function main(): Promise<void> {
  const email = process.env.FIREBASE_EMAIL;
  const senha = process.env.FIREBASE_SENHA;
  if (!email || !senha) {
    console.error(
      'Defina FIREBASE_EMAIL e FIREBASE_SENHA com um login de admin da clínica — as regras exigem\n' +
        'autenticação para gravar em anamnesis_templates e no Storage.\n\n' +
        '  FIREBASE_EMAIL=... FIREBASE_SENHA=... npx tsx scripts/migrar-imagens-para-storage.ts --aplicar'
    );
    process.exit(1);
  }
  await signInWithEmailAndPassword(getAuth(app), email, senha);

  console.log(aplicar ? 'MODO APLICAR — as alterações serão gravadas.' : 'SIMULAÇÃO — nada será gravado.');

  await migrarColecao('anamnesis_templates', 'anamnese/fichas-modelo/migrados');
  await migrarColecao('anamnesis_records', 'anamnese/fotos-pacientes');

  if (!aplicar) {
    console.log('\nRode de novo com --aplicar para gravar.');
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('\nFalhou:', err);
  process.exit(1);
});

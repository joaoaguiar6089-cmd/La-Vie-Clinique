/**
 * Script de execução única: tira as imagens em base64 de dentro dos documentos do Firestore e as
 * move para o Firebase Storage, deixando no documento apenas a URL.
 *
 * Por que rodar: enquanto as fotos ficam embutidas, elas são cobradas de novo a cada gravação do
 * documento — e a cota diária do Firestore é medida em KB gravados, não em número de gravações.
 * Um perfil de clínica com logo e fotos da equipe embutidas custa algumas centenas de "gravações"
 * toda vez que é salvo. Some-se a isso o teto de 1 MB por documento, que uma ficha-modelo com foto
 * feminina, masculina e imagem orientativa estoura sozinha — e aí *nada* daquela ficha salva, nem
 * uma linha de texto.
 *
 * A partir da versão que criou `imageStorage.ts`, as imagens novas já vão direto para o Storage;
 * este script cuida das que já estavam gravadas.
 *
 * Antes de rodar:
 *   1. Habilite o Firebase Storage no projeto (console do Firebase > Storage > Começar).
 *   2. Publique as regras:  firebase deploy --only storage
 *   3. Tenha certeza de que a cota diária do Firestore não está esgotada — o script lê e grava.
 *      Se estiver, espere o próximo ciclo (a cota zera à meia-noite no horário do Pacífico,
 *      por volta das 4h ou 5h de Brasília).
 *
 * Uso (o script pergunta o login da clínica; a senha não aparece na tela):
 *   npx tsx scripts/migrar-imagens-para-storage.ts            (simulação: só lê, e mostra o relatório)
 *   npx tsx scripts/migrar-imagens-para-storage.ts --aplicar  (grava de verdade)
 *   npx tsx scripts/migrar-imagens-para-storage.ts --banco <id> --aplicar   (em outro banco)
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
import { obterCredenciais, explicarErro, encerrar } from './credenciais';

const aplicar = process.argv.includes('--aplicar');

const raiz = dirname(dirname(fileURLToPath(import.meta.url)));
const config = JSON.parse(readFileSync(join(raiz, 'firebase-applet-config.json'), 'utf8'));

/**
 * `--banco <id>` aponta para outro banco sem editar o arquivo de config.
 *
 * Existe por causa da migração de banco: esta rotina precisa rodar no banco NOVO, e não no antigo.
 * No antigo (Enterprise, que cobra a cota por KB gravado) reescrever os ~3 MB de imagens embutidas
 * custaria alguns milhares de unidades da cota diária; no novo (Standard, que cobra por documento)
 * são algumas dezenas de gravações. Como o Firebase Storage é do projeto e não do banco, as
 * imagens enviadas valem para os dois lados de qualquer forma.
 */
function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const banco = argumento('--banco') || config.firestoreDatabaseId || '(default)';

const app = initializeApp(config);
const db = getFirestore(app, banco);
const storage = getStorage(app);

/** Campos de imagem (string única) de cada coleção, na ordem em que aparecem no documento. */
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

const mb = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(2)} MB`;
const kb = (bytes: number): string => `${Math.round(bytes / 1024)} KB`;

async function subir(dataUrl: string, pasta: string): Promise<string> {
  const extensao = dataUrl.startsWith('data:image/png') ? 'png' : 'jpg';
  const objeto = ref(storage, `${pasta}/${crypto.randomUUID()}.${extensao}`);
  await uploadString(objeto, dataUrl, 'data_url');
  return getDownloadURL(objeto);
}

/**
 * Peso do documento como o Firestore cobra: cada 1 KB gravado conta como uma unidade da cota.
 * É esta coluna, e não a contagem de documentos, que explica uma cota estourada.
 */
function pesoDoDocumento(dados: unknown): number {
  return new TextEncoder().encode(JSON.stringify(dados)).length;
}

/** Coleções em que as imagens são campos de texto simples. */
async function migrarColecao(nome: keyof typeof CAMPOS, pasta: string): Promise<void> {
  const snap = await getDocs(collection(db, nome));
  console.log(`\n== ${nome}: ${snap.size} documento(s)`);

  let migrados = 0;
  let bytesLiberados = 0;
  const pesos: Array<{ rotulo: string; bytes: number }> = [];

  for (const docSnap of snap.docs) {
    const dados = docSnap.data() as Record<string, unknown>;
    const rotulo = (dados.procedimentoNome as string) || (dados.pacienteNome as string) || docSnap.id;
    pesos.push({ rotulo, bytes: pesoDoDocumento(dados) });

    const alteracoes: Record<string, string> = {};

    for (const campo of CAMPOS[nome]) {
      const valor = dados[campo];
      if (!ehBase64(valor)) continue;

      bytesLiberados += valor.length;
      alteracoes[campo] = aplicar ? await subir(valor, pasta) : '(simulação)';
    }

    if (Object.keys(alteracoes).length === 0) continue;

    migrados++;
    console.log(`   ${rotulo}: ${Object.keys(alteracoes).join(', ')}`);

    if (aplicar) {
      await updateDoc(doc(db, nome, docSnap.id), alteracoes);
    }
  }

  relatar(migrados, bytesLiberados, pesos);
}

/** `procedures` guarda as fotos numa lista (`images`), e não em campos separados. */
async function migrarProcedimentos(): Promise<void> {
  const snap = await getDocs(collection(db, 'procedures'));
  console.log(`\n== procedures: ${snap.size} documento(s)`);

  let migrados = 0;
  let bytesLiberados = 0;
  const pesos: Array<{ rotulo: string; bytes: number }> = [];

  for (const docSnap of snap.docs) {
    const dados = docSnap.data() as Record<string, unknown>;
    const rotulo = (dados.title as string) || docSnap.id;
    pesos.push({ rotulo, bytes: pesoDoDocumento(dados) });

    const imagens = Array.isArray(dados.images) ? (dados.images as unknown[]) : [];
    if (!imagens.some(ehBase64)) continue;

    const novas: string[] = [];
    let embutidas = 0;
    for (const img of imagens) {
      if (ehBase64(img)) {
        embutidas++;
        bytesLiberados += img.length;
        novas.push(aplicar ? await subir(img, `procedimentos/${docSnap.id}`) : img);
      } else {
        novas.push(img as string);
      }
    }

    migrados++;
    console.log(`   ${rotulo}: ${embutidas} imagem(ns) embutida(s)`);

    if (aplicar) {
      await updateDoc(doc(db, 'procedures', docSnap.id), { images: novas });
    }
  }

  relatar(migrados, bytesLiberados, pesos);
}

/**
 * O perfil da clínica: logo, banner de capa e a foto de cada profissional.
 *
 * São dois documentos com o mesmo conteúdo de imagem — `main_profile` (completo, só para a equipe
 * logada) e `public_profile` (o espelho que a página da paciente lê sem login). O espelho é
 * reescrito inteiro a cada publicação, então uma imagem embutida aqui é a que mais pesa na cota.
 */
async function migrarPerfilDaClinica(): Promise<void> {
  const snap = await getDocs(collection(db, 'clinic_settings'));
  console.log(`\n== clinic_settings: ${snap.size} documento(s)`);

  let migrados = 0;
  let bytesLiberados = 0;
  const pesos: Array<{ rotulo: string; bytes: number }> = [];

  for (const docSnap of snap.docs) {
    const dados = docSnap.data() as Record<string, unknown>;
    pesos.push({ rotulo: docSnap.id, bytes: pesoDoDocumento(dados) });

    const alteracoes: Record<string, unknown> = {};
    const tocados: string[] = [];

    for (const campo of ['logoUrl', 'coverBannerUrl'] as const) {
      const valor = dados[campo];
      if (!ehBase64(valor)) continue;
      bytesLiberados += valor.length;
      tocados.push(campo);
      alteracoes[campo] = aplicar
        ? await subir(valor, `clinica/${campo === 'logoUrl' ? 'logo' : 'capa'}`)
        : valor;
    }

    const equipe = Array.isArray(dados.professionals) ? (dados.professionals as any[]) : [];
    if (equipe.some((p) => ehBase64(p?.photoUrl))) {
      const nova: any[] = [];
      for (const p of equipe) {
        if (ehBase64(p?.photoUrl)) {
          bytesLiberados += p.photoUrl.length;
          tocados.push(`foto de ${p.name || p.id}`);
          nova.push({ ...p, photoUrl: aplicar ? await subir(p.photoUrl, 'clinica/equipe') : p.photoUrl });
        } else {
          nova.push(p);
        }
      }
      alteracoes.professionals = nova;
    }

    if (tocados.length === 0) continue;

    migrados++;
    console.log(`   ${docSnap.id}: ${tocados.join(', ')}`);

    if (aplicar) {
      await updateDoc(doc(db, 'clinic_settings', docSnap.id), alteracoes);
    }
  }

  relatar(migrados, bytesLiberados, pesos);
}

function relatar(
  migrados: number,
  bytesLiberados: number,
  pesos: Array<{ rotulo: string; bytes: number }>
): void {
  const total = pesos.reduce((soma, p) => soma + p.bytes, 0);
  console.log(
    `   -> ${migrados} documento(s) com imagem embutida, ${mb(bytesLiberados)} saindo dos documentos.`
  );
  console.log(`   -> peso atual da coleção: ${mb(total)}`);

  const maiores = [...pesos].sort((a, b) => b.bytes - a.bytes).slice(0, 3);
  for (const m of maiores) {
    if (m.bytes < 50 * 1024) break; // abaixo disso não vale a menção
    console.log(`      mais pesado: ${m.rotulo} — ${kb(m.bytes)} por gravação`);
  }
}

async function main(): Promise<void> {
  // Antes de pedir a senha, e não depois: quem digitar o login precisa já ter visto em qual banco
  // a rotina vai mexer, para poder cancelar com Ctrl+C se for o errado.
  console.log(`Banco: ${banco}`);
  console.log(aplicar ? 'MODO APLICAR — as alterações serão gravadas.' : 'SIMULAÇÃO — nada será gravado.');
  console.log('');

  const { email, senha } = await obterCredenciais(
    'As regras exigem login para gravar em anamnesis_templates, clinic_settings, procedures e no Storage.'
  );
  await signInWithEmailAndPassword(getAuth(app), email, senha);

  // Do mais caro para o mais barato: o perfil da clínica é gravado em todo salvamento das
  // configurações e republicado no espelho público, então é onde cada KB pesa mais.
  await migrarPerfilDaClinica();
  await migrarProcedimentos();
  await migrarColecao('anamnesis_templates', 'anamnese/fichas-modelo/migrados');
  await migrarColecao('anamnesis_records', 'anamnese/fotos-pacientes');

  if (!aplicar) {
    console.log('\nRode de novo com --aplicar para gravar.');
  }
  await encerrar(app, 0);
}

main().catch(async (err) => {
  // Sem rastro de pilha: quem roda isto quer saber o que fazer, não em que linha do Node parou.
  console.error('\n' + explicarErro(err) + '\n');
  await encerrar(app, 1);
});

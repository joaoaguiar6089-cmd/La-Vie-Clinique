/**
 * Publica `firestore.rules` e `storage.rules` direto pela API de regras do Firebase
 * (firebaserules.googleapis.com) — o mesmo que o `firebase deploy --only firestore:rules,storage`
 * faz, sem instalar o firebase-tools e sem login interativo no navegador.
 *
 * Quem publica é uma **conta de serviço** do projeto com o papel "Administrador de regras do
 * Firebase" (Firebase Rules Admin). A credencial vem de variáveis de ambiente:
 *
 *   FIREBASE_PRIVATE_KEY      o campo "private_key" do JSON da chave (uma linha, com os "\n")
 *   FIREBASE_CLIENT_EMAIL     o campo "client_email"; ausente, vale
 *                             publicar-regras@<projeto>.iam.gserviceaccount.com
 *   FIREBASE_SERVICE_ACCOUNT  alternativa às duas: o JSON inteiro numa linha só
 *
 * Só a chave privada é segredo. As duas primeiras existem separadas porque a tela de variáveis
 * do ambiente aceita uma linha por valor, e o JSON da chave vem em várias.
 *
 *   npx tsx scripts/publicar-regras.ts --conferir   só mostra o que está publicado hoje
 *   npx tsx scripts/publicar-regras.ts              valida e publica as duas
 *
 * O projeto, o banco (`firestoreDatabaseId`) e o bucket vêm do `firebase-applet-config.json`;
 * os arquivos de regras, do `firebase.json`. Antes de publicar, o script confere que a release de
 * cada um já existe no projeto: um nome errado criaria uma release que nada usa, e a regra
 * "publicada" não valeria em lugar nenhum.
 */
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = dirname(dirname(fileURLToPath(import.meta.url)));
const config = JSON.parse(readFileSync(join(raiz, 'firebase-applet-config.json'), 'utf8'));
const firebaseJson = JSON.parse(readFileSync(join(raiz, 'firebase.json'), 'utf8'));

const projeto: string = config.projectId;
const banco: string = config.firestoreDatabaseId || '(default)';
const bucket: string = config.storageBucket;
const API = 'https://firebaserules.googleapis.com/v1';

const soConferir = process.argv.includes('--conferir');

interface Alvo {
  rotulo: string;
  arquivo: string;
  /** O nome da release, depois de `projects/<projeto>/releases/`. */
  release: string;
}

const arquivoDoFirestore: string =
  (Array.isArray(firebaseJson.firestore) ? firebaseJson.firestore[0]?.rules : firebaseJson.firestore?.rules) ||
  'firestore.rules';
const arquivoDoStorage: string = firebaseJson.storage?.rules || 'storage.rules';

const ALVOS: Alvo[] = [
  {
    rotulo: `Firestore (banco ${banco})`,
    arquivo: arquivoDoFirestore,
    // O banco padrão publica em "cloud.firestore"; um banco com nome, em "cloud.firestore/<nome>".
    release: banco === '(default)' ? 'cloud.firestore' : `cloud.firestore/${banco}`,
  },
  {
    rotulo: `Storage (${bucket})`,
    arquivo: arquivoDoStorage,
    release: `firebase.storage/${bucket}`,
  },
];

// ==========================================
// CREDENCIAL
// ==========================================

function lerCredencial(): { email: string; chave: string } {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (json?.trim()) {
    const conta = JSON.parse(json);
    return { email: conta.client_email, chave: conta.private_key };
  }
  const chave = process.env.FIREBASE_PRIVATE_KEY;
  if (!chave?.trim()) {
    throw new Error(
      'Falta a credencial: defina FIREBASE_PRIVATE_KEY (o campo "private_key" do JSON da conta de ' +
        'serviço) nas variáveis do ambiente.'
    );
  }
  return {
    email: process.env.FIREBASE_CLIENT_EMAIL?.trim() || `publicar-regras@${projeto}.iam.gserviceaccount.com`,
    chave,
  };
}

/**
 * A chave como o Node a lê. Copiada do JSON ela chega com os "\n" escritos como texto, às vezes
 * com as aspas e a vírgula do JSON junto, e a tela do ambiente pode ter trocado as quebras por
 * espaços. O corpo da chave é base64, então todo espaço em branco nele é sobra e pode sair.
 */
function normalizarChave(bruta: string): string {
  // Aspas e vírgula do JSON, se vieram junto na cópia, saem; os "\n" escritos viram quebra.
  let chave = bruta.replace(/^[\s"']+|[\s"',]+$/g, '').replace(/\\n/g, '\n');
  const corpo = chave
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '');
  if (!corpo) throw new Error('FIREBASE_PRIVATE_KEY está vazia.');
  chave = `-----BEGIN PRIVATE KEY-----\n${corpo.match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----\n`;
  return chave;
}

const base64url = (dado: Buffer | string): string =>
  Buffer.from(dado).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

/** Troca a conta de serviço por um token de acesso de uma hora (OAuth com JWT assinado). */
async function obterToken(): Promise<string> {
  const { email, chave } = lerCredencial();
  const agora = Math.floor(Date.now() / 1000);
  const cabecalho = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const corpo = base64url(
    JSON.stringify({
      iss: email,
      scope: 'https://www.googleapis.com/auth/cloud-platform',
      aud: 'https://oauth2.googleapis.com/token',
      iat: agora,
      exp: agora + 3600,
    })
  );
  let assinatura: string;
  try {
    assinatura = base64url(createSign('RSA-SHA256').update(`${cabecalho}.${corpo}`).sign(normalizarChave(chave)));
  } catch {
    throw new Error(
      'A chave privada não pôde ser lida. Copie de novo o valor de "private_key" do arquivo JSON, ' +
        'do -----BEGIN até o -----END PRIVATE KEY-----.'
    );
  }

  const resposta = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${cabecalho}.${corpo}.${assinatura}`,
    }),
  });
  const dados = (await resposta.json()) as { access_token?: string; error?: string; error_description?: string };
  if (!dados.access_token) {
    throw new Error(
      `O Google recusou a credencial (${dados.error}: ${dados.error_description}). Confira se o e-mail ` +
        `da conta de serviço é ${email} e se a chave é dessa conta.`
    );
  }
  return dados.access_token;
}

// ==========================================
// API DE REGRAS
// ==========================================

async function chamar<T>(token: string, metodo: string, caminho: string, corpo?: unknown): Promise<T> {
  const resposta = await fetch(`${API}/${caminho}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await resposta.text();
  const dados = texto ? JSON.parse(texto) : {};
  if (!resposta.ok) {
    const erro = new Error(dados?.error?.message || `${resposta.status} ${resposta.statusText}`) as Error & {
      status?: number;
      detalhes?: unknown;
    };
    erro.status = resposta.status;
    erro.detalhes = dados?.error?.details;
    throw erro;
  }
  return dados as T;
}

interface Release {
  name: string;
  rulesetName: string;
  updateTime?: string;
}

async function listarReleases(token: string): Promise<Release[]> {
  const todas: Release[] = [];
  let pagina: string | undefined;
  do {
    const dados = await chamar<{ releases?: Release[]; nextPageToken?: string }>(
      token,
      'GET',
      `projects/${projeto}/releases${pagina ? `?pageToken=${encodeURIComponent(pagina)}` : ''}`
    );
    todas.push(...(dados.releases || []));
    pagina = dados.nextPageToken;
  } while (pagina);
  return todas;
}

/** Cria o ruleset — é aqui que o Google valida a sintaxe, antes de qualquer coisa ir ao ar. */
async function criarRuleset(token: string, alvo: Alvo): Promise<string> {
  const conteudo = readFileSync(join(raiz, alvo.arquivo), 'utf8');
  try {
    const ruleset = await chamar<{ name: string }>(token, 'POST', `projects/${projeto}/rulesets`, {
      source: { files: [{ name: alvo.arquivo, content: conteudo }] },
    });
    return ruleset.name;
  } catch (e) {
    const detalhes = JSON.stringify((e as { detalhes?: unknown }).detalhes || '', null, 2);
    throw new Error(`${alvo.arquivo} tem erro e não foi publicado: ${(e as Error).message}\n${detalhes}`);
  }
}

async function publicar(token: string, alvo: Alvo, rulesetName: string): Promise<void> {
  const nome = `projects/${projeto}/releases/${alvo.release}`;
  await chamar(token, 'PATCH', nome, { release: { name: nome, rulesetName } });
}

// ==========================================
// PRINCIPAL
// ==========================================

const dataLegivel = (iso?: string) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—');

async function main() {
  console.log(`Projeto ${projeto}${soConferir ? ' — só conferindo, nada será alterado' : ''}\n`);
  const token = await obterToken();

  let releases: Release[];
  try {
    releases = await listarReleases(token);
  } catch (e) {
    const status = (e as { status?: number }).status;
    throw new Error(
      status === 403
        ? `A conta de serviço não tem permissão (${(e as Error).message}). Dê a ela o papel ` +
            '"Administrador de regras do Firebase" no IAM do projeto.'
        : (e as Error).message
    );
  }

  console.log('Publicado hoje:');
  for (const r of releases) {
    console.log(`  ${r.name.replace(`projects/${projeto}/releases/`, '')}  (atualizado em ${dataLegivel(r.updateTime)})`);
  }
  console.log('');

  const faltando = ALVOS.filter((a) => !releases.some((r) => r.name.endsWith(`/releases/${a.release}`)));
  if (faltando.length > 0) {
    throw new Error(
      `Não existe release para ${faltando.map((a) => `"${a.release}"`).join(' e ')} neste projeto. ` +
        'Confira o banco e o bucket no firebase-applet-config.json antes de publicar.'
    );
  }
  if (soConferir) return;

  for (const alvo of ALVOS) {
    const rulesetName = await criarRuleset(token, alvo);
    await publicar(token, alvo, rulesetName);
    console.log(`  publicado  ${alvo.rotulo} ← ${alvo.arquivo}`);
  }
  console.log('\nRegras no ar. Elas valem para o site em até um minuto.');
}

main().catch((e) => {
  console.error(`\nNão publicado: ${(e as Error).message}`);
  process.exitCode = 1;
});

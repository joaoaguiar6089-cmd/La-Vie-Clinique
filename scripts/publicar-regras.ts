/**
 * Publica as regras do Firestore e do Storage direto pela API de regras do Firebase
 * (firebaserules.googleapis.com) — o mesmo que o `firebase deploy --only firestore:rules,storage`
 * faz, sem instalar o firebase-tools e sem login interativo no navegador.
 *
 * DOIS PROJETOS, CADA UM COM AS SUAS REGRAS
 *   --projeto legado (padrão enquanto `plataforma.json` diz "legado"): o projeto da La Vie
 *     (`database-dra-karoline`), com `firestore.rules` e `storage.rules` da raiz (os do
 *     `firebase.json`);
 *   --projeto zulia: o `zulia-plataforma`, com `zulia/firestore.rules` e `zulia/storage.rules`.
 * Os arquivos andam sempre com o projeto: as regras da raiz nunca vão para a Zulia, e as de
 * `zulia/` nunca vão para a La Vie. Sem `--projeto`, vale o modo de `plataforma.json`.
 *
 * Quem publica é uma **conta de serviço** com o papel "Administrador de regras do Firebase"
 * (Firebase Rules Admin) — ou mais — no projeto. A credencial vem de variáveis de ambiente:
 *
 *   Projeto da La Vie
 *     FIREBASE_PRIVATE_KEY      o campo "private_key" do JSON da chave (uma linha, com os "\n")
 *     FIREBASE_CLIENT_EMAIL     o campo "client_email"; ausente, vale
 *                               publicar-regras@<projeto>.iam.gserviceaccount.com
 *     FIREBASE_SERVICE_ACCOUNT  alternativa às duas: o JSON inteiro numa linha só
 *   Projeto da Zulia
 *     ZULIA_PRIVATE_KEY e ZULIA_CLIENT_EMAIL (ou ZULIA_SERVICE_ACCOUNT), no mesmo formato
 *
 * Só a chave privada é segredo. As duas primeiras existem separadas porque a tela de variáveis
 * do ambiente aceita uma linha por valor, e o JSON da chave vem em várias.
 *
 *   npx tsx scripts/publicar-regras.ts --conferir                    só mostra o que está publicado
 *   npx tsx scripts/publicar-regras.ts                               valida e publica as duas
 *   npx tsx scripts/publicar-regras.ts --projeto zulia [--conferir]  o mesmo, no zulia-plataforma
 *
 * O projeto, o banco (`firestoreDatabaseId`) e o bucket vêm da configuração do projeto
 * (`src/lib/projetoFirebase.ts`). Antes de publicar, o script confere que a release de cada um já
 * existe no projeto: um nome errado criaria uma release que nada usa, e a regra "publicada" não
 * valeria em lugar nenhum.
 */
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configDoProjeto, lerModo, modoPlataforma, type ModoPlataforma } from '../src/lib/projetoFirebase';

const raiz = dirname(dirname(fileURLToPath(import.meta.url)));

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const projetoPedido = argumento('--projeto');
const alvoDoProjeto: ModoPlataforma | null =
  projetoPedido === undefined ? modoPlataforma : projetoPedido === 'la-vie' ? 'legado' : lerModo(projetoPedido);
if (!alvoDoProjeto) {
  console.error(`--projeto "${projetoPedido}" não existe. Use --projeto legado ou --projeto zulia.`);
  process.exit(1);
}

const config = configDoProjeto(alvoDoProjeto);
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

/** Os arquivos de regras de cada projeto. */
function arquivosDeRegras(alvo: ModoPlataforma): { firestore: string; storage: string } {
  if (alvo === 'zulia') return { firestore: 'zulia/firestore.rules', storage: 'zulia/storage.rules' };
  const firebaseJson = JSON.parse(readFileSync(join(raiz, 'firebase.json'), 'utf8'));
  return {
    firestore:
      (Array.isArray(firebaseJson.firestore) ? firebaseJson.firestore[0]?.rules : firebaseJson.firestore?.rules) ||
      'firestore.rules',
    storage: firebaseJson.storage?.rules || 'storage.rules',
  };
}

const arquivos = arquivosDeRegras(alvoDoProjeto);

const ALVOS: Alvo[] = [
  {
    rotulo: `Firestore (banco ${banco})`,
    arquivo: arquivos.firestore,
    // O banco padrão publica em "cloud.firestore"; um banco com nome, em "cloud.firestore/<nome>".
    release: banco === '(default)' ? 'cloud.firestore' : `cloud.firestore/${banco}`,
  },
  {
    rotulo: `Storage (${bucket})`,
    arquivo: arquivos.storage,
    release: `firebase.storage/${bucket}`,
  },
];

// ==========================================
// CREDENCIAL
// ==========================================

/** O prefixo das variáveis da credencial: FIREBASE_* para a La Vie, ZULIA_* para a Zulia. */
const PREFIXO = alvoDoProjeto === 'zulia' ? 'ZULIA' : 'FIREBASE';

function lerCredencial(): { email: string; chave: string } {
  const json = process.env[`${PREFIXO}_SERVICE_ACCOUNT`];
  if (json?.trim()) {
    const conta = JSON.parse(json);
    return { email: conta.client_email, chave: conta.private_key };
  }
  const chave = process.env[`${PREFIXO}_PRIVATE_KEY`];
  if (!chave?.trim()) {
    throw new Error(
      `Falta a credencial: defina ${PREFIXO}_PRIVATE_KEY (o campo "private_key" do JSON da conta de ` +
        'serviço) nas variáveis do ambiente.'
    );
  }
  const email = process.env[`${PREFIXO}_CLIENT_EMAIL`]?.trim();
  if (!email && alvoDoProjeto === 'zulia') {
    throw new Error('Falta ZULIA_CLIENT_EMAIL, o e-mail da conta de serviço do zulia-plataforma.');
  }
  return { email: email || `publicar-regras@${projeto}.iam.gserviceaccount.com`, chave };
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
  if (!corpo) throw new Error(`${PREFIXO}_PRIVATE_KEY está vazia.`);
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
  console.log(`Projeto ${projeto} (${alvoDoProjeto})${soConferir ? ' — só conferindo, nada será alterado' : ''}\n`);
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
        'Confira o banco e o bucket na configuração do projeto antes de publicar.'
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

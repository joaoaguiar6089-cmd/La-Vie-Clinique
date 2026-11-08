import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { ehZulia, firebaseConfig } from '../src/lib/projetoFirebase';

/**
 * Acesso do servidor ao banco, com uma conta de serviço — o mesmo banco do painel, mas sem passar
 * pelas regras do Firestore.
 *
 * Por que o servidor precisa disto: cadastros e fichas de anamnese eram legíveis e graváveis por
 * qualquer pessoa na internet, porque a paciente preenche a ficha sem login e o navegador dela
 * falava direto com o banco. Agora a página da paciente fala com o servidor
 * (`server/fichaPublica.ts`), o servidor confere o link e devolve só o necessário, e as regras
 * fecham essas coleções para quem não é da equipe.
 *
 * Configuração (Secrets do AI Studio), um dos dois jeitos:
 *   - FIREBASE_ADMIN_EMAIL e FIREBASE_ADMIN_CHAVE: o `client_email` e a `private_key` do arquivo
 *     JSON da conta de serviço, cada um numa linha;
 *   - FIREBASE_ADMIN_CREDENCIAL: o arquivo JSON inteiro.
 * Passo a passo em docs/ficha-publica-servidor.md.
 *
 * No modo Zulia (`plataforma.json`), as mesmas três com o prefixo ZULIA_ADMIN_ no lugar de
 * FIREBASE_ADMIN_ (ZULIA_ADMIN_EMAIL, ZULIA_ADMIN_CHAVE, ZULIA_ADMIN_CREDENCIAL): a conta do
 * servidor da Zulia. Nomes separados para que virar o `plataforma.json` — e desvirar, se for
 * preciso — não dependa de trocar o valor de um Secret, e para que a conta de um projeto nunca
 * seja usada no outro sem querer. Na Zulia, o projeto é sempre o `zulia-plataforma`.
 *
 * Sem configuração, `bancoAdmin()` devolve `null` e as rotas respondem que o servidor não está
 * configurado — nada lança na inicialização.
 */

export interface Credencial {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

/**
 * A chave como o Node a lê. Copiada do JSON ela chega com os "\n" escritos como texto, às vezes
 * com as aspas e a vírgula do JSON junto, e a tela de Secrets pode ter trocado as quebras por
 * espaços. O corpo da chave é base64, então todo espaço em branco nele é sobra e pode sair.
 * (Mesma lógica de `scripts/publicar-regras.ts`.)
 */
export function normalizarChave(bruta: string): string {
  const chave = bruta.replace(/^[\s"']+|[\s"',]+$/g, '').replace(/\\n/g, '\n');
  const corpo = chave
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '');
  if (!corpo) return '';
  return `-----BEGIN PRIVATE KEY-----\n${corpo.match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----\n`;
}

/** O prefixo das variáveis da credencial do servidor no modo em uso. */
export const PREFIXO_DA_CREDENCIAL = ehZulia ? 'ZULIA_ADMIN' : 'FIREBASE_ADMIN';

/** Lê a credencial das variáveis de ambiente. `null` quando não há nenhuma configurada. */
export function credencialDoAmbiente(
  env: NodeJS.ProcessEnv = process.env,
  prefixo: string = PREFIXO_DA_CREDENCIAL
): Credencial | null {
  const projetoPadrao = firebaseConfig.projectId;
  // Na Zulia o projeto é sempre o da configuração: uma chave de outro projeto não muda o destino.
  const projetoFixo = prefixo === 'ZULIA_ADMIN';

  const json = env[`${prefixo}_CREDENCIAL`]?.trim();
  if (json) {
    let dados: any;
    try {
      dados = JSON.parse(json);
    } catch {
      // Aceita também o JSON em base64, para telas que não aceitam chaves e aspas.
      try {
        dados = JSON.parse(Buffer.from(json, 'base64').toString('utf8'));
      } catch {
        console.error(`[admin] ${prefixo}_CREDENCIAL não é um JSON de conta de serviço válido.`);
        return null;
      }
    }
    const privateKey = normalizarChave(String(dados?.private_key || ''));
    if (!dados?.client_email || !privateKey) {
      console.error(`[admin] ${prefixo}_CREDENCIAL não tem client_email e private_key.`);
      return null;
    }
    return {
      projectId: projetoFixo ? projetoPadrao : dados.project_id || projetoPadrao,
      clientEmail: dados.client_email,
      privateKey,
    };
  }

  const email = env[`${prefixo}_EMAIL`]?.trim().replace(/^["']|["',]+$/g, '');
  const bruta = env[`${prefixo}_CHAVE`];
  const chave = bruta ? normalizarChave(bruta) : '';
  if (email && chave) return { projectId: projetoPadrao, clientEmail: email, privateKey: chave };
  if (email || chave) {
    console.error(`[admin] Falta ${prefixo}_EMAIL ou ${prefixo}_CHAVE — as duas são necessárias.`);
  }
  return null;
}

let banco: Firestore | null | undefined;
let appDoServidor: App | null | undefined;

/** O app do Admin SDK com a credencial do servidor, ou `null` se não houver credencial. */
function appComCredencial(): App | null {
  if (appDoServidor !== undefined) return appDoServidor;
  const credencial = credencialDoAmbiente();
  appDoServidor = credencial
    ? getApps().find((a) => a.name === 'servidor') ||
      initializeApp(
        {
          credential: cert({
            projectId: credencial.projectId,
            clientEmail: credencial.clientEmail,
            privateKey: credencial.privateKey,
          }),
          projectId: credencial.projectId,
        },
        'servidor'
      )
    : null;
  return appDoServidor;
}

/** O Firestore do painel com acesso de servidor, ou `null` se não houver credencial. */
export function bancoAdmin(): Firestore | null {
  if (banco !== undefined) return banco;
  const app = appComCredencial();
  if (!app) {
    banco = null;
    return banco;
  }
  const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || '(default)');
  // Campos `undefined` são ignorados, como faz o `cleanForFirestore` do painel.
  db.settings({ ignoreUndefinedProperties: true });
  banco = db;
  return banco;
}

/** Para os testes: troca o banco (um emulador, por exemplo) ou volta a ler do ambiente. */
export function definirBancoAdmin(novo: Firestore | null | undefined): void {
  banco = novo;
}

let autenticacao: Auth | undefined;

/**
 * O Authentication do projeto pelo Admin SDK.
 *
 * Conferir o login do painel (`verifyIdToken`) não precisa de credencial — só do projeto, para
 * buscar as chaves públicas do Google —, então sem credencial ele ainda funciona, com um app só de
 * leitura de tokens. Criar login e gravar claims (`/api/equipe`) precisam da credencial; sem ela,
 * essas chamadas falham e as rotas respondem que o servidor não está configurado.
 */
export function authAdmin(): Auth {
  if (autenticacao) return autenticacao;
  // No legado, sempre o app sem credencial: o servidor da La Vie só confere token (como sempre
  // fez), e a conta dele não tem papel no Authentication. Na Zulia, o app do servidor, cujo
  // projeto é sempre o da configuração.
  const app =
    (ehZulia ? appComCredencial() : null) ||
    getApps().find((a) => a.name === 'login') ||
    initializeApp({ projectId: firebaseConfig.projectId }, 'login');
  autenticacao = getAuth(app);
  return autenticacao;
}

/** O servidor pode criar login e gravar claims? Só na Zulia, e com credencial. */
export const servidorGerenciaLogins = (): boolean => ehZulia && !!appComCredencial();

/** Para os testes: troca o Authentication (o do emulador, por exemplo). */
export function definirAuthAdmin(novo: Auth | undefined): void {
  autenticacao = novo;
}

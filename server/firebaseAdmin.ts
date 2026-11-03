import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-applet-config.json';

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

/** Lê a credencial das variáveis de ambiente. `null` quando não há nenhuma configurada. */
export function credencialDoAmbiente(env: NodeJS.ProcessEnv = process.env): Credencial | null {
  const projetoPadrao = firebaseConfig.projectId;

  const json = env.FIREBASE_ADMIN_CREDENCIAL?.trim();
  if (json) {
    let dados: any;
    try {
      dados = JSON.parse(json);
    } catch {
      // Aceita também o JSON em base64, para telas que não aceitam chaves e aspas.
      try {
        dados = JSON.parse(Buffer.from(json, 'base64').toString('utf8'));
      } catch {
        console.error('[admin] FIREBASE_ADMIN_CREDENCIAL não é um JSON de conta de serviço válido.');
        return null;
      }
    }
    const privateKey = normalizarChave(String(dados?.private_key || ''));
    if (!dados?.client_email || !privateKey) {
      console.error('[admin] FIREBASE_ADMIN_CREDENCIAL não tem client_email e private_key.');
      return null;
    }
    return { projectId: dados.project_id || projetoPadrao, clientEmail: dados.client_email, privateKey };
  }

  const email = env.FIREBASE_ADMIN_EMAIL?.trim().replace(/^["']|["',]+$/g, '');
  const chave = env.FIREBASE_ADMIN_CHAVE ? normalizarChave(env.FIREBASE_ADMIN_CHAVE) : '';
  if (email && chave) return { projectId: projetoPadrao, clientEmail: email, privateKey: chave };
  if (email || chave) {
    console.error('[admin] Falta FIREBASE_ADMIN_EMAIL ou FIREBASE_ADMIN_CHAVE — as duas são necessárias.');
  }
  return null;
}

let banco: Firestore | null | undefined;

/** O Firestore do painel com acesso de servidor, ou `null` se não houver credencial. */
export function bancoAdmin(): Firestore | null {
  if (banco !== undefined) return banco;
  const credencial = credencialDoAmbiente();
  if (!credencial) {
    banco = null;
    return banco;
  }
  const app: App =
    getApps().find((a) => a.name === 'servidor') ||
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
    );
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

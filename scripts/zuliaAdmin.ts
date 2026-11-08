/**
 * Acesso de servidor (Admin SDK) ao projeto da Zulia, para os scripts: `verificar-regras-zulia`,
 * `criar-clinica` e `migrar-la-vie`.
 *
 * Dois destinos:
 *   - o `zulia-plataforma` de verdade, com a conta `claude-configuracao@zulia-plataforma` (ou outra)
 *     nas variáveis ZULIA_CLIENT_EMAIL e ZULIA_PRIVATE_KEY;
 *   - os emuladores locais do Firebase (`--emulador`), que não tocam em projeto nenhum. Suba-os com
 *       npx -y firebase-tools@15 emulators:exec --config zulia/firebase.json --project demo-zulia "<comando>"
 *     (precisa de Java). O projeto `demo-*` não tem credencial nem rede: tudo fica na máquina.
 */
import { cert, deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { normalizarChave } from '../server/firebaseAdmin';
import { configDoEmulador, configDoProjeto, type ConfigDoFirebase } from '../src/lib/projetoFirebase';

export { PROJETO_DO_EMULADOR, configDoEmulador } from '../src/lib/projetoFirebase';

export const EMULADORES = {
  auth: '127.0.0.1:9099',
  firestore: '127.0.0.1:8080',
  storage: '127.0.0.1:9199',
};

export interface AcessoZulia {
  emulador: boolean;
  /** A configuração do app web (a do `zulia-plataforma`, ou uma de mentira no emulador). */
  config: ConfigDoFirebase;
  app: App;
  db: Firestore;
  auth: Auth;
  bucket: ReturnType<ReturnType<typeof getStorage>['bucket']>;
  encerrar: () => Promise<void>;
}

/** `--emulador` na linha de comando. */
export const pediuEmulador = (argv: string[] = process.argv): boolean => argv.includes('--emulador');

/** Abre o acesso de servidor. Lança com uma mensagem que diz o que fazer quando falta credencial. */
export function abrirZulia({ emulador }: { emulador: boolean }): AcessoZulia {
  let app: App;
  let config: ConfigDoFirebase;
  if (emulador) {
    process.env.FIREBASE_AUTH_EMULATOR_HOST = EMULADORES.auth;
    process.env.FIRESTORE_EMULATOR_HOST = EMULADORES.firestore;
    process.env.FIREBASE_STORAGE_EMULATOR_HOST = EMULADORES.storage;
    config = configDoEmulador();
    app = initializeApp({ projectId: config.projectId, storageBucket: config.storageBucket }, `zulia-${Date.now()}`);
  } else {
    config = configDoProjeto('zulia');
    const email = process.env.ZULIA_CLIENT_EMAIL?.trim().replace(/^["']|["',]+$/g, '');
    const chave = process.env.ZULIA_PRIVATE_KEY ? normalizarChave(process.env.ZULIA_PRIVATE_KEY) : '';
    if (!email || !chave) {
      throw new Error(
        'Falta a credencial do zulia-plataforma: defina ZULIA_CLIENT_EMAIL e ZULIA_PRIVATE_KEY nas ' +
          'variáveis do ambiente (ou rode com --emulador, nos emuladores locais).'
      );
    }
    app = initializeApp(
      {
        credential: cert({ projectId: config.projectId, clientEmail: email, privateKey: chave }),
        projectId: config.projectId,
        storageBucket: config.storageBucket,
      },
      `zulia-${Date.now()}`
    );
  }
  const db = getFirestore(app, config.firestoreDatabaseId || '(default)');
  db.settings({ ignoreUndefinedProperties: true });
  return {
    emulador,
    config,
    app,
    db,
    auth: getAuth(app),
    bucket: getStorage(app).bucket(config.storageBucket),
    encerrar: () => deleteApp(app),
  };
}

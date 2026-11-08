import plataforma from '../../plataforma.json';
import configDaLaVie from '../../firebase-applet-config.json';
import configDaZulia from '../../zulia-firebase-config.json';

/**
 * Qual projeto do Firebase este código usa: o da La Vie (`legado`) ou o da Zulia (`zulia`).
 *
 * É a chave única da migração para várias clínicas. O painel (`src/lib/firebase.ts`), o servidor
 * (`server/*`) e os scripts pedem a configuração aqui, e nunca importam o JSON de um projeto
 * direto. Assim, virar a La Vie para a Zulia no dia da migração é trocar uma palavra em
 * `plataforma.json`, e não caçar imports pelo código.
 *
 *   - `legado`: o projeto `database-dra-karoline` (`firebase-applet-config.json`), com as
 *     coleções na raiz. É o sistema da La Vie que está no ar hoje.
 *   - `zulia`: o projeto `zulia-plataforma` (`zulia-firebase-config.json`), com cada clínica em
 *     `clinicas/{clinicaId}/...` (ver `src/lib/clinicaAtual.ts` e `docs/zulia-plataforma.md`).
 *
 * **A escolha mora num arquivo versionado**, e não numa variável de ambiente, porque não está
 * confirmado que o build do AI Studio enxerga variáveis: o que vai ao ar é o que está na `main`.
 *
 * Para desenvolvimento e scripts, o arquivo aceita sobrescrita:
 *   - `VITE_PLATAFORMA=zulia` no Vite (`npm run dev`, configuração `zulia-dev` do `.claude/launch.json`);
 *   - `PLATAFORMA=zulia` no Node (servidor e `npx tsx scripts/...`).
 *
 * Cuidado: no modo `legado`, o `vite dev` lê e grava no Firestore de produção da La Vie. Teste o
 * painel no modo `zulia`, contra o `zulia-plataforma`.
 */

export type ModoPlataforma = 'legado' | 'zulia';

/** O formato dos dois arquivos de configuração do app web. */
export interface ConfigDoFirebase {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId: string;
  storageBucket: string;
  messagingSenderId: string;
  measurementId: string;
  oAuthClientId: string;
  recaptchaSiteKey: string;
}

const CONFIGS: Record<ModoPlataforma, ConfigDoFirebase> = {
  legado: configDaLaVie,
  zulia: configDaZulia,
};

/** `'legado'` ou `'zulia'`, ou `null` se `valor` não for nenhum dos dois. */
export function lerModo(valor: unknown): ModoPlataforma | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim().toLowerCase();
  return limpo === 'legado' || limpo === 'zulia' ? limpo : null;
}

/**
 * O modo valendo: a sobrescrita (se houver e for válida), senão o arquivo. Um valor inválido no
 * arquivo cai no `legado` com erro no console — o painel não pode deixar de abrir por um erro de
 * digitação, e `scripts/verificar-plataforma.ts` barra esse arquivo antes de ele chegar à `main`.
 */
export function escolherModo(doArquivo: unknown, sobrescrita?: unknown): ModoPlataforma {
  const sobrescrito = lerModo(sobrescrita);
  if (sobrescrito) return sobrescrito;
  if (sobrescrita !== undefined && sobrescrita !== null && sobrescrita !== '') {
    console.error(`[plataforma] sobrescrita "${String(sobrescrita)}" inválida; vale o plataforma.json.`);
  }
  const doJson = lerModo(doArquivo);
  if (doJson) return doJson;
  console.error(`[plataforma] plataforma.json com modo "${String(doArquivo)}" inválido; usando "legado".`);
  return 'legado';
}

/** A configuração do app web de um projeto, independente do modo valendo. */
export function configDoProjeto(modo: ModoPlataforma): ConfigDoFirebase {
  return CONFIGS[modo];
}

/** A sobrescrita do ambiente: `VITE_PLATAFORMA` no Vite, `PLATAFORMA` no Node. */
function sobrescritaDoAmbiente(): string | undefined {
  // No navegador o Vite troca `import.meta.env` pelos valores do build; no Node ele não existe.
  const doVite = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_PLATAFORMA;
  if (doVite) return doVite;
  // `process` não existe no navegador: a checagem do tipo vem antes de qualquer acesso.
  if (typeof process !== 'undefined' && process?.env) return process.env.PLATAFORMA;
  return undefined;
}

/** O modo deste processo (ou desta aba). Não muda depois de carregado. */
export const modoPlataforma: ModoPlataforma = escolherModo(plataforma.modo, sobrescritaDoAmbiente());

/** Atalho para `modoPlataforma === 'zulia'`. */
export const ehZulia = modoPlataforma === 'zulia';

/** O projeto de mentira dos emuladores locais. `demo-` faz o Firebase não procurar credencial. */
export const PROJETO_DO_EMULADOR = 'demo-zulia';

/**
 * Só para teste local, nunca no ar: o painel e o servidor falam com os emuladores do Firebase
 * (Auth, Firestore e Storage na máquina), e não com projeto nenhum. Liga com `VITE_EMULADORES=1`
 * no Vite e, no Node, com as variáveis que o `firebase emulators:exec` define
 * (`FIREBASE_AUTH_EMULATOR_HOST` e `FIRESTORE_EMULATOR_HOST`). Ver docs/zulia-plataforma.md.
 */
export const usaEmuladores: boolean = (() => {
  if ((import.meta as { env?: Record<string, string | undefined> }).env?.VITE_EMULADORES === '1') return true;
  if (typeof process !== 'undefined' && process?.env) {
    return !!process.env.FIREBASE_AUTH_EMULATOR_HOST && !!process.env.FIRESTORE_EMULATOR_HOST;
  }
  return false;
})();

/** A configuração do app web para os emuladores: o formato de sempre, com o projeto de mentira. */
export const configDoEmulador = (): ConfigDoFirebase => ({
  ...configDoProjeto('zulia'),
  projectId: PROJETO_DO_EMULADOR,
  apiKey: 'chave-do-emulador',
  authDomain: `${PROJETO_DO_EMULADOR}.firebaseapp.com`,
  firestoreDatabaseId: '(default)',
  storageBucket: `${PROJETO_DO_EMULADOR}.appspot.com`,
});

/** A configuração do app web do projeto em uso. */
export const firebaseConfig: ConfigDoFirebase = usaEmuladores ? configDoEmulador() : configDoProjeto(modoPlataforma);

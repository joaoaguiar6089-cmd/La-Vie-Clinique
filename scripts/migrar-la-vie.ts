/**
 * Migra a La Vie (projeto `database-dra-karoline`, banco `banco-novo`) para a Zulia, como a
 * clínica `clinicas/{id}` do `zulia-plataforma` (ver docs/zulia-plataforma.md, fase 6).
 *
 * Três modos, sempre com `--id`:
 *
 *   --ensaio          só os dados (Firestore e Storage), sem logins, num id de ensaio
 *                     (`ensaio-...`). Para conferir e apagar antes do dia.
 *   --aplicar         a migração: dados, Storage, logins (mesmos uids, mesmas senhas, com as
 *                     claims) e o documento da clínica (completo, cortesia, Google Agenda).
 *   --conferir        compara origem e destino: contagem por coleção e por pasta, arquivos com o
 *                     mesmo token, nenhuma URL com o bucket antigo e (fora do ensaio) os logins.
 *   --apagar-ensaio   apaga um ensaio (só um id cuja clínica está marcada como ensaio).
 *
 *   npx tsx scripts/migrar-la-vie.ts --ensaio --id ensaio-1108
 *   npx tsx scripts/migrar-la-vie.ts --conferir --ensaio --id ensaio-1108
 *   npx tsx scripts/migrar-la-vie.ts --apagar-ensaio --id ensaio-1108
 *   npx tsx scripts/migrar-la-vie.ts --aplicar --id <id-da-la-vie> [--dono <e-mail do dono>] [--hash <arquivo.json>]
 *   npx tsx scripts/migrar-la-vie.ts --conferir --id <id-da-la-vie>
 *   (+ --emulador: tudo nos emuladores locais, com a "La Vie de mentira" `demo-lavie` de origem)
 *
 * Credencial: a conta do Claude no zulia-plataforma (ZULIA_CLIENT_EMAIL e ZULIA_PRIVATE_KEY), que
 * na janela da migração recebe do João papéis de LEITURA no projeto da La Vie. Outra conta para a
 * origem: ORIGEM_CLIENT_EMAIL e ORIGEM_PRIVATE_KEY.
 *
 * O que o script faz e por quê:
 *   - Firestore: lista as coleções com `listCollections()` (o `exportar-banco.ts` tem uma lista
 *     fixa e pula 15 das 23), com subcoleções, preservando ids e tipos (Timestamp continua
 *     Timestamp). Toda string com URL de download do bucket antigo é reescrita para o bucket da
 *     Zulia e o caminho novo, com o mesmo token — `photoUrl`, `fotoUrl`, `images[]`,
 *     `comprovante.url` e qualquer outro campo, em qualquer profundidade.
 *   - Storage: cada arquivo vai para `clinicas/{id}/<mesmo caminho>` no bucket da Zulia, mantendo
 *     `firebaseStorageDownloadTokens` (é o token que faz a URL reescrita abrir).
 *   - Logins: `listUsers` traz hash e sal; com os parâmetros scrypt do projeto (pela API de
 *     configuração do Identity Toolkit, ou `--hash` com o que o João copiar do console), o
 *     `importUsers` cria no zulia-plataforma os mesmos uids, com as mesmas senhas, e as claims
 *     (`papel` vem de `professionals[].isAdmin`). Contas que não são da equipe ficam de fora. O
 *     login do dono (`--dono`) entra só com `donoDaPlataforma`, sem clínica.
 *   - Rodar de novo com o mesmo id regrava o mesmo conteúdo: dá para repetir se cair no meio.
 */
import { readFileSync } from 'node:fs';
import { cert, deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth, type UserImportRecord, type UserRecord } from 'firebase-admin/auth';
import {
  DocumentReference,
  GeoPoint,
  Timestamp,
  getFirestore,
  type CollectionReference,
  type DocumentData,
  type Firestore,
} from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { normalizarChave } from '../server/firebaseAdmin';
import { configDoProjeto } from '../src/lib/projetoFirebase';
import { idDeClinicaValido } from '../src/utils/clinicas';
import { abrirZulia, pediuEmulador, type AcessoZulia } from './zuliaAdmin';

type Bucket = ReturnType<ReturnType<typeof getStorage>['bucket']>;

/** O projeto de mentira que faz o papel da La Vie nos emuladores. */
export const PROJETO_ORIGEM_DO_EMULADOR = 'demo-lavie';

export interface Origem {
  emulador: boolean;
  projectId: string;
  banco: string;
  app: App;
  db: Firestore;
  auth: Auth;
  bucket: Bucket;
  encerrar: () => Promise<void>;
}

/** O projeto da La Vie (só leitura), ou a "La Vie de mentira" dos emuladores. */
export function abrirOrigem({ emulador }: { emulador: boolean }): Origem {
  const laVie = configDoProjeto('legado');
  let app: App;
  let projectId: string;
  let bucketNome: string;
  if (emulador) {
    projectId = PROJETO_ORIGEM_DO_EMULADOR;
    bucketNome = `${PROJETO_ORIGEM_DO_EMULADOR}.appspot.com`;
    app = initializeApp({ projectId, storageBucket: bucketNome }, `origem-${Date.now()}`);
  } else {
    projectId = laVie.projectId;
    bucketNome = laVie.storageBucket;
    const email = (process.env.ORIGEM_CLIENT_EMAIL || process.env.ZULIA_CLIENT_EMAIL || '').trim().replace(/^["']|["',]+$/g, '');
    const bruta = process.env.ORIGEM_PRIVATE_KEY || process.env.ZULIA_PRIVATE_KEY || '';
    const chave = bruta ? normalizarChave(bruta) : '';
    if (!email || !chave) {
      throw new Error('Falta a credencial para ler a La Vie: ZULIA_CLIENT_EMAIL e ZULIA_PRIVATE_KEY (ou ORIGEM_*).');
    }
    app = initializeApp(
      { credential: cert({ projectId, clientEmail: email, privateKey: chave }), projectId, storageBucket: bucketNome },
      `origem-${Date.now()}`
    );
  }
  const banco = laVie.firestoreDatabaseId || '(default)';
  return {
    emulador,
    projectId,
    banco,
    app,
    db: getFirestore(app, banco),
    auth: getAuth(app),
    bucket: getStorage(app).bucket(bucketNome),
    encerrar: () => deleteApp(app),
  };
}

// ==========================================
// URLS DO STORAGE
// ==========================================

const escaparRegex = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Troca, num texto, toda URL de arquivo do bucket antigo pela do arquivo copiado: bucket da Zulia
 * e caminho com `clinicas/{id}/` na frente. O token (`?alt=media&token=...`) fica igual — e vale,
 * porque o arquivo copiado leva o mesmo `firebaseStorageDownloadTokens`.
 *
 * Formas reconhecidas: a URL de download do Firebase (caminho codificado), a pública do Cloud
 * Storage e a `gs://`.
 */
export function reescreverUrls(texto: string, bucketsAntigos: string[], bucketNovo: string, prefixo: string): string {
  let resultado = texto;
  for (const antigo of bucketsAntigos) {
    const b = escaparRegex(antigo);
    resultado = resultado
      .replace(
        new RegExp(`(https?://firebasestorage\\.googleapis\\.com/v0/b/)${b}(/o/)`, 'g'),
        (_t, ini: string, meio: string) => `${ini}${bucketNovo}${meio}${encodeURIComponent(prefixo)}`
      )
      .replace(new RegExp(`(https?://storage\\.googleapis\\.com/)${b}/`, 'g'), (_t, ini: string) => `${ini}${bucketNovo}/${prefixo}`)
      .replace(new RegExp(`gs://${b}/`, 'g'), () => `gs://${bucketNovo}/${prefixo}`);
  }
  return resultado;
}

interface Contexto {
  destino: AcessoZulia;
  clinicaId: string;
  bucketsAntigos: string[];
}

/** O valor como deve ser gravado no destino: URLs reescritas, referências apontando para a clínica. */
export function valorNoDestino(valor: unknown, ctx: Contexto): unknown {
  if (typeof valor === 'string') {
    return reescreverUrls(valor, ctx.bucketsAntigos, ctx.destino.config.storageBucket, `clinicas/${ctx.clinicaId}/`);
  }
  if (Array.isArray(valor)) return valor.map((v) => valorNoDestino(v, ctx));
  if (valor instanceof Timestamp || valor instanceof GeoPoint || Buffer.isBuffer(valor) || valor instanceof Uint8Array) {
    return valor;
  }
  if (valor instanceof DocumentReference) return ctx.destino.db.doc(`clinicas/${ctx.clinicaId}/${valor.path}`);
  if (valor && typeof valor === 'object') {
    // Outros tipos do Firestore (FieldValue não aparece em leitura) passam como estão.
    if (Object.getPrototypeOf(valor) !== Object.prototype && Object.getPrototypeOf(valor) !== null) return valor;
    return Object.fromEntries(Object.entries(valor as Record<string, unknown>).map(([k, v]) => [k, valorNoDestino(v, ctx)]));
  }
  return valor;
}

// ==========================================
// FIRESTORE
// ==========================================

/** O "molde" do caminho de uma coleção, sem os ids: `patients`, `quotes/<id>/historico` vira `quotes/*\/historico`... */
const molde = (caminho: string) => caminho.split('/').filter((_, i) => i % 2 === 0).join('/*/');

/**
 * Percorre a coleção e as subcoleções. `visitar` recebe cada documento que existe (os "fantasmas",
 * que só têm subcoleção, não contam, mas as subcoleções deles são percorridas).
 */
async function percorrer(
  col: CollectionReference,
  visitar: (ref: DocumentReference, dados: DocumentData) => void | Promise<void>
): Promise<void> {
  const refs = await col.listDocuments();
  for (let i = 0; i < refs.length; i += 300) {
    const pedaco = refs.slice(i, i + 300);
    const snaps = await col.firestore.getAll(...pedaco);
    for (const snap of snaps) if (snap.exists) await visitar(snap.ref, snap.data() as DocumentData);
    for (const ref of pedaco) {
      for (const sub of await ref.listCollections()) await percorrer(sub, visitar);
    }
  }
}

/** Contagem de documentos por molde de coleção (ver `molde`), relativa à raiz dada. */
async function contarDocumentos(colecoes: CollectionReference[], raiz: string): Promise<Map<string, number>> {
  const contagem = new Map<string, number>();
  for (const col of colecoes) {
    await percorrer(col, (ref) => {
      const relativo = ref.parent.path.slice(raiz.length);
      const chave = molde(relativo);
      contagem.set(chave, (contagem.get(chave) || 0) + 1);
    });
  }
  return contagem;
}

async function copiarFirestore(origem: Origem, ctx: Contexto): Promise<Map<string, number>> {
  const escritor = ctx.destino.db.bulkWriter();
  escritor.onWriteError((erro) => erro.failedAttempts < 5);
  const contagem = new Map<string, number>();
  for (const col of await origem.db.listCollections()) {
    await percorrer(col, (ref, dados) => {
      void escritor.set(ctx.destino.db.doc(`clinicas/${ctx.clinicaId}/${ref.path}`), valorNoDestino(dados, ctx) as DocumentData);
      const chave = molde(ref.parent.path);
      contagem.set(chave, (contagem.get(chave) || 0) + 1);
    });
  }
  await escritor.close();
  return contagem;
}

// ==========================================
// STORAGE
// ==========================================

const pastaDe = (nome: string) => nome.split('/')[0] || '(raiz)';

async function copiarStorage(origem: Origem, ctx: Contexto): Promise<Map<string, number>> {
  const [arquivos] = await origem.bucket.getFiles();
  const contagem = new Map<string, number>();
  const prefixo = `clinicas/${ctx.clinicaId}/`;
  const copiar = async (arquivo: (typeof arquivos)[number]) => {
    const destino = ctx.destino.bucket.file(`${prefixo}${arquivo.name}`);
    const meta = arquivo.metadata;
    const personalizados = (meta.metadata || {}) as Record<string, string>;
    try {
      await arquivo.copy(destino);
    } catch {
      // Cópia direta entre buckets negada ou indisponível (o emulador, por exemplo): baixa e envia.
      const [conteudo] = await arquivo.download();
      await destino.save(conteudo, {
        resumable: false,
        metadata: { contentType: meta.contentType, cacheControl: meta.cacheControl, metadata: personalizados },
      });
    }
    // O token é o que faz a URL antiga (reescrita) abrir o arquivo novo: confere e, se faltar, grava.
    if (personalizados.firebaseStorageDownloadTokens) {
      const [novo] = await destino.getMetadata();
      if ((novo.metadata as Record<string, string> | undefined)?.firebaseStorageDownloadTokens !== personalizados.firebaseStorageDownloadTokens) {
        await destino.setMetadata({ metadata: { ...(novo.metadata || {}), firebaseStorageDownloadTokens: personalizados.firebaseStorageDownloadTokens } });
      }
    }
    contagem.set(pastaDe(arquivo.name), (contagem.get(pastaDe(arquivo.name)) || 0) + 1);
  };
  for (let i = 0; i < arquivos.length; i += 8) await Promise.all(arquivos.slice(i, i + 8).map(copiar));
  return contagem;
}

// ==========================================
// LOGINS
// ==========================================

export interface ParametrosDoHash {
  signerKey: string;
  saltSeparator: string;
  rounds: number;
  memoryCost: number;
}

/** Os parâmetros scrypt do projeto da La Vie: do arquivo `--hash`, ou da API do Identity Toolkit. */
async function parametrosDoHash(origem: Origem, arquivo?: string): Promise<ParametrosDoHash | null> {
  if (arquivo) {
    const p = JSON.parse(readFileSync(arquivo, 'utf8'));
    // Aceita os nomes do console ("base64_signer_key", "mem_cost"...) e os da API.
    return {
      signerKey: p.signerKey || p.base64_signer_key,
      saltSeparator: p.saltSeparator || p.base64_salt_separator,
      rounds: Number(p.rounds),
      memoryCost: Number(p.memoryCost ?? p.mem_cost),
    };
  }
  if (origem.emulador) return null;
  const token = await origem.app.options.credential!.getAccessToken();
  const resposta = await fetch(`https://identitytoolkit.googleapis.com/admin/v2/projects/${origem.projectId}/config`, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!resposta.ok) {
    throw new Error(
      `A API de configuração do login recusou (${resposta.status}). Peça ao João os parâmetros do hash ` +
        '(console do Firebase → Authentication → Usuários → ⋮ → Parâmetros de hash de senha), salve num ' +
        'arquivo JSON e rode de novo com --hash <arquivo>.'
    );
  }
  const corpo = (await resposta.json()) as { signIn?: { hashConfig?: Record<string, unknown> } };
  const h = corpo.signIn?.hashConfig;
  if (!h || h.algorithm !== 'SCRYPT') throw new Error(`Hash do projeto inesperado: ${JSON.stringify(h)}`);
  return {
    signerKey: String(h.signerKey),
    saltSeparator: String(h.saltSeparator),
    rounds: Number(h.rounds),
    memoryCost: Number(h.memoryCost),
  };
}

async function todosOsLogins(auth: Auth): Promise<UserRecord[]> {
  const todos: UserRecord[] = [];
  let pagina: string | undefined;
  do {
    const lista = await auth.listUsers(1000, pagina);
    todos.push(...lista.users);
    pagina = lista.pageToken;
  } while (pagina);
  return todos;
}

export interface ResultadoDosLogins {
  equipe: Record<string, 'admin' | 'profissional'>;
  dono: string | null;
  deFora: string[];
  erros: string[];
}

async function migrarLogins(
  origem: Origem,
  ctx: Contexto,
  { dono, hash }: { dono?: string; hash?: string }
): Promise<ResultadoDosLogins> {
  const perfil = (await origem.db.doc('clinic_settings/main_profile').get()).data() || {};
  const papelPorUid = new Map<string, 'admin' | 'profissional'>();
  for (const p of (perfil.professionals || []) as Array<{ uid?: string; isAdmin?: boolean }>) {
    if (p?.uid) papelPorUid.set(p.uid, p.isAdmin ? 'admin' : 'profissional');
  }
  const emailDoDono = dono?.trim().toLowerCase() || '';
  const usuarios = await todosOsLogins(origem.auth);
  const resultado: ResultadoDosLogins = { equipe: {}, dono: null, deFora: [], erros: [] };

  const registros: UserImportRecord[] = [];
  for (const u of usuarios) {
    const ehDono = !!emailDoDono && u.email?.toLowerCase() === emailDoDono;
    const papel = papelPorUid.get(u.uid);
    if (!ehDono && !papel) {
      resultado.deFora.push(u.email || u.uid);
      continue;
    }
    // O dono é da plataforma, não de uma clínica (um login, uma clínica só — e o dele, nenhuma).
    const claims = ehDono ? { donoDaPlataforma: true } : { clinicaId: ctx.clinicaId, papel };
    if (ehDono) resultado.dono = u.uid;
    else resultado.equipe[u.uid] = papel!;
    registros.push({
      uid: u.uid,
      email: u.email,
      emailVerified: u.emailVerified,
      displayName: u.displayName,
      photoURL: u.photoURL,
      phoneNumber: u.phoneNumber,
      disabled: u.disabled,
      customClaims: claims,
      metadata: { creationTime: u.metadata.creationTime, lastSignInTime: u.metadata.lastSignInTime },
      ...(u.passwordHash ? { passwordHash: Buffer.from(u.passwordHash, 'base64') } : {}),
      ...(u.passwordSalt ? { passwordSalt: Buffer.from(u.passwordSalt, 'base64') } : {}),
    });
  }

  const comSenha = registros.some((r) => r.passwordHash);
  if (registros.some((r) => !r.passwordHash) && !origem.emulador) {
    resultado.erros.push(
      'Alguns logins vieram sem hash de senha: a conta precisa do papel que lê hashes ' +
        '(Administrador do Firebase Authentication, ou firebaseauth.users.get) no projeto da La Vie.'
    );
  }
  const parametros = comSenha ? await parametrosDoHash(origem, hash) : null;
  const opcoes = parametros
    ? {
        hash: {
          algorithm: 'SCRYPT' as const,
          key: Buffer.from(parametros.signerKey, 'base64'),
          saltSeparator: Buffer.from(parametros.saltSeparator, 'base64'),
          rounds: parametros.rounds,
          memoryCost: parametros.memoryCost,
        },
      }
    : undefined;

  // Rodando de novo (caiu no meio, por exemplo): quem já foi importado não é importado outra vez
  // — o importUsers não sobrescreve conta —, só tem as claims conferidas.
  const jaNoDestino = new Set<string>();
  for (let i = 0; i < registros.length; i += 100) {
    const { users } = await ctx.destino.auth.getUsers(registros.slice(i, i + 100).map((r) => ({ uid: r.uid })));
    users.forEach((u) => jaNoDestino.add(u.uid));
  }
  for (const r of registros.filter((r) => jaNoDestino.has(r.uid))) {
    await ctx.destino.auth.setCustomUserClaims(r.uid, r.customClaims || null);
  }
  const novos = registros.filter((r) => !jaNoDestino.has(r.uid));

  for (let i = 0; i < novos.length; i += 1000) {
    const lote = novos.slice(i, i + 1000);
    const r = opcoes
      ? await ctx.destino.auth.importUsers(lote, opcoes)
      : await ctx.destino.auth.importUsers(lote.map(({ passwordHash, passwordSalt, ...resto }) => resto));
    for (const erro of r.errors) {
      const registro = lote[erro.index];
      resultado.erros.push(`${registro.email || registro.uid}: ${erro.error.message}`);
    }
  }
  return resultado;
}

// ==========================================
// DOCUMENTO DA CLÍNICA
// ==========================================

async function gravarClinica(
  origem: Origem,
  ctx: Contexto,
  { ensaio, equipe }: { ensaio: boolean; equipe: Record<string, 'admin' | 'profissional'> }
): Promise<void> {
  const perfil = (await origem.db.doc('clinic_settings/main_profile').get()).data() || {};
  const admins = ((perfil.professionals || []) as Array<{ uid?: string; email?: string; isAdmin?: boolean }>).filter(
    (p) => p?.uid && p.isAdmin && equipe[p.uid] === 'admin'
  );
  const ref = ctx.destino.db.doc(`clinicas/${ctx.clinicaId}`);
  const existente = (await ref.get()).data();
  const agora = new Date().toISOString();
  await ref.set({
    nome: String(perfil.name || 'La Vie Clinique'),
    plano: 'completo',
    cortesia: true,
    situacao: ensaio ? 'ensaio' : 'ativa',
    dona: admins[0] ? { uid: admins[0].uid, email: admins[0].email || '' } : null,
    recursos: { googleAgenda: true },
    equipe: ensaio ? {} : equipe,
    origem: { projeto: origem.projectId, banco: origem.banco, bucket: origem.bucket.name },
    criadaEm: existente?.criadaEm || agora,
    migradaEm: agora,
    atualizadaEm: agora,
    criadaPor: 'scripts/migrar-la-vie.ts',
  });
}

/** Só regrava um id vazio, ou uma clínica que este mesmo script criou a partir da mesma origem. */
async function conferirDestinoLivre(origem: Origem, ctx: Contexto, ensaio: boolean): Promise<void> {
  const existente = (await ctx.destino.db.doc(`clinicas/${ctx.clinicaId}`).get()).data();
  if (!existente) return;
  if (existente.origem?.projeto !== origem.projectId) {
    throw new Error(`clinicas/${ctx.clinicaId} já existe e não veio desta migração. Escolha outro id.`);
  }
  if (ensaio !== (existente.situacao === 'ensaio')) {
    throw new Error(`clinicas/${ctx.clinicaId} é ${existente.situacao === 'ensaio' ? 'um ensaio' : 'a clínica de verdade'}: não misture.`);
  }
}

// ==========================================
// MIGRAR, CONFERIR, APAGAR
// ==========================================

export interface ResultadoDaMigracao {
  documentos: Map<string, number>;
  arquivos: Map<string, number>;
  logins?: ResultadoDosLogins;
}

export async function migrar(
  origem: Origem,
  destino: AcessoZulia,
  opcoes: { clinicaId: string; ensaio: boolean; dono?: string; hash?: string }
): Promise<ResultadoDaMigracao> {
  const ctx: Contexto = { destino, clinicaId: opcoes.clinicaId, bucketsAntigos: bucketsAntigos(origem) };
  await conferirDestinoLivre(origem, ctx, opcoes.ensaio);
  const documentos = await copiarFirestore(origem, ctx);
  const arquivos = await copiarStorage(origem, ctx);
  const logins = opcoes.ensaio ? undefined : await migrarLogins(origem, ctx, opcoes);
  await gravarClinica(origem, ctx, { ensaio: opcoes.ensaio, equipe: logins?.equipe || {} });
  return { documentos, arquivos, logins };
}

/** O bucket da La Vie e o nome antigo `<projeto>.appspot.com`, que URLs velhas podem usar. */
const bucketsAntigos = (origem: Origem) => [...new Set([origem.bucket.name, `${origem.projectId}.appspot.com`])];

export interface Diferencas {
  colecoes: string[];
  pastas: string[];
  arquivos: string[];
  urlsAntigas: string[];
  logins: string[];
}

export const semDiferencas = (d: Diferencas) => Object.values(d).every((lista) => lista.length === 0);

export async function conferir(
  origem: Origem,
  destino: AcessoZulia,
  { clinicaId, ensaio, dono }: { clinicaId: string; ensaio: boolean; dono?: string }
): Promise<Diferencas> {
  const d: Diferencas = { colecoes: [], pastas: [], arquivos: [], urlsAntigas: [], logins: [] };
  const raiz = `clinicas/${clinicaId}/`;

  // Firestore: contagem por coleção (molde), dos dois lados.
  const naOrigem = await contarDocumentos(await origem.db.listCollections(), '');
  const noDestino = await contarDocumentos(await destino.db.doc(`clinicas/${clinicaId}`).listCollections(), raiz);
  for (const chave of new Set([...naOrigem.keys(), ...noDestino.keys()])) {
    if ((naOrigem.get(chave) || 0) !== (noDestino.get(chave) || 0)) {
      d.colecoes.push(`${chave}: origem ${naOrigem.get(chave) || 0}, destino ${noDestino.get(chave) || 0}`);
    }
  }

  // Nenhuma string com o bucket antigo, em nenhum documento da clínica.
  const antigos = bucketsAntigos(origem);
  const procurar = (valor: unknown, onde: string) => {
    if (typeof valor === 'string') {
      if (antigos.some((b) => valor.includes(b))) d.urlsAntigas.push(onde);
    } else if (Array.isArray(valor)) {
      valor.forEach((v, i) => procurar(v, `${onde}[${i}]`));
    } else if (valor && typeof valor === 'object' && Object.getPrototypeOf(valor) === Object.prototype) {
      for (const [k, v] of Object.entries(valor)) procurar(v, `${onde}.${k}`);
    }
  };
  for (const col of await destino.db.doc(`clinicas/${clinicaId}`).listCollections()) {
    await percorrer(col, (ref, dados) => procurar(dados, ref.path));
  }

  // Storage: os mesmos arquivos, com o mesmo tamanho e o mesmo token.
  const [daOrigem] = await origem.bucket.getFiles();
  const [doDestino] = await destino.bucket.getFiles({ prefix: raiz });
  const porNome = new Map(doDestino.map((f) => [f.name.slice(raiz.length), f]));
  const pastasO = new Map<string, number>();
  const pastasD = new Map<string, number>();
  for (const f of daOrigem) pastasO.set(pastaDe(f.name), (pastasO.get(pastaDe(f.name)) || 0) + 1);
  for (const nome of porNome.keys()) pastasD.set(pastaDe(nome), (pastasD.get(pastaDe(nome)) || 0) + 1);
  for (const pasta of new Set([...pastasO.keys(), ...pastasD.keys()])) {
    if ((pastasO.get(pasta) || 0) !== (pastasD.get(pasta) || 0)) {
      d.pastas.push(`${pasta}: origem ${pastasO.get(pasta) || 0}, destino ${pastasD.get(pasta) || 0}`);
    }
  }
  for (const f of daOrigem) {
    const copia = porNome.get(f.name);
    if (!copia) continue; // já aparece na contagem por pasta
    const tokenO = (f.metadata.metadata as Record<string, string> | undefined)?.firebaseStorageDownloadTokens;
    const tokenD = (copia.metadata.metadata as Record<string, string> | undefined)?.firebaseStorageDownloadTokens;
    if (String(f.metadata.size) !== String(copia.metadata.size)) d.arquivos.push(`${f.name}: tamanho diferente`);
    if (tokenO && tokenO !== tokenD) d.arquivos.push(`${f.name}: token diferente`);
  }

  // Logins (fora do ensaio): cada um da equipe existe, com a claim desta clínica.
  if (!ensaio) {
    const perfil = (await origem.db.doc('clinic_settings/main_profile').get()).data() || {};
    for (const p of (perfil.professionals || []) as Array<{ uid?: string; isAdmin?: boolean; name?: string }>) {
      if (!p?.uid) continue;
      const u = await destino.auth.getUser(p.uid).catch(() => null);
      if (!u) {
        d.logins.push(`${p.name || p.uid}: login não foi importado`);
        continue;
      }
      const esperado = p.isAdmin ? 'admin' : 'profissional';
      if (dono && u.email?.toLowerCase() === dono.trim().toLowerCase()) continue;
      if (u.customClaims?.clinicaId !== clinicaId || u.customClaims?.papel !== esperado) {
        d.logins.push(`${p.name || p.uid}: claims ${JSON.stringify(u.customClaims)}, esperado ${esperado} em ${clinicaId}`);
      }
    }
  }
  return d;
}

/** Apaga um ensaio: só um id cuja clínica foi marcada como ensaio por este script. */
export async function apagarEnsaio(destino: AcessoZulia, clinicaId: string): Promise<void> {
  const ref = destino.db.doc(`clinicas/${clinicaId}`);
  const dados = (await ref.get()).data();
  if (!dados) throw new Error(`clinicas/${clinicaId} não existe.`);
  if (dados.situacao !== 'ensaio' || dados.criadaPor !== 'scripts/migrar-la-vie.ts') {
    throw new Error(`clinicas/${clinicaId} não é um ensaio desta migração: nada foi apagado.`);
  }
  await destino.db.recursiveDelete(ref);
  await destino.bucket.deleteFiles({ prefix: `clinicas/${clinicaId}/` });
}

// ==========================================
// LINHA DE COMANDO
// ==========================================

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const listar = (m: Map<string, number>) =>
  [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `    ${k}: ${v}`).join('\n') || '    (nada)';

async function main() {
  const emulador = pediuEmulador();
  const ensaio = process.argv.includes('--ensaio');
  const modo = process.argv.includes('--aplicar')
    ? 'aplicar'
    : process.argv.includes('--apagar-ensaio')
      ? 'apagar'
      : process.argv.includes('--conferir')
        ? 'conferir'
        : ensaio
          ? 'ensaio'
          : null;
  const clinicaId = idDeClinicaValido(argumento('--id'));
  if (!modo || !clinicaId) {
    console.error('Uso: --ensaio | --aplicar | --conferir [--ensaio] | --apagar-ensaio, sempre com --id <id>. Ver o topo do arquivo.');
    process.exit(1);
  }
  if ((modo === 'ensaio' || modo === 'apagar') && !clinicaId.startsWith('ensaio')) {
    console.error('Ensaio só num id que começa com "ensaio" (ex.: --id ensaio-1108).');
    process.exit(1);
  }
  if (modo === 'aplicar' && clinicaId.startsWith('ensaio')) {
    console.error('A migração de verdade não vai para um id de ensaio.');
    process.exit(1);
  }

  const destino = abrirZulia({ emulador });
  const origem = modo === 'apagar' ? null : abrirOrigem({ emulador });
  try {
    console.log(`Origem ${origem?.projectId ?? '—'} (banco ${origem?.banco ?? '—'}) → destino ${destino.config.projectId}, clinicas/${clinicaId}`);
    if (modo === 'apagar') {
      await apagarEnsaio(destino, clinicaId);
      console.log(`\nEnsaio clinicas/${clinicaId} apagado (documentos e arquivos).`);
      return;
    }
    if (modo === 'conferir') {
      const d = await conferir(origem!, destino, { clinicaId, ensaio, dono: argumento('--dono') });
      for (const [tipo, lista] of Object.entries(d)) {
        console.log(`\n${tipo}: ${lista.length === 0 ? 'sem diferenças' : `${lista.length} diferença(s)`}`);
        lista.slice(0, 50).forEach((l) => console.log(`    ${l}`));
      }
      console.log(semDiferencas(d) ? '\nConferido: sem diferenças.' : '\nHá diferenças (acima).');
      process.exitCode = semDiferencas(d) ? 0 : 1;
      return;
    }
    const r = await migrar(origem!, destino, { clinicaId, ensaio: modo === 'ensaio', dono: argumento('--dono'), hash: argumento('--hash') });
    console.log(`\nDocumentos copiados, por coleção:\n${listar(r.documentos)}`);
    console.log(`\nArquivos copiados, por pasta:\n${listar(r.arquivos)}`);
    if (r.logins) {
      console.log(`\nLogins da equipe: ${Object.keys(r.logins.equipe).length}`);
      for (const [uid, papel] of Object.entries(r.logins.equipe)) console.log(`    ${uid}: ${papel}`);
      if (r.logins.dono) console.log(`  dono da plataforma: ${r.logins.dono}`);
      if (r.logins.deFora.length) console.log(`  fora da equipe, não importados: ${r.logins.deFora.length}`);
      r.logins.erros.forEach((e) => console.log(`  ERRO: ${e}`));
      if (r.logins.erros.length) process.exitCode = 1;
    }
    console.log(`\nAgora: npx tsx scripts/migrar-la-vie.ts --conferir${modo === 'ensaio' ? ' --ensaio' : ''} --id ${clinicaId}${emulador ? ' --emulador' : ''}`);
  } finally {
    await origem?.encerrar();
    await destino.encerrar();
  }
}

if (process.argv[1] && /migrar-la-vie\.ts$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(`\nParou: ${(e as Error).message}`);
    process.exitCode = 1;
  });
}

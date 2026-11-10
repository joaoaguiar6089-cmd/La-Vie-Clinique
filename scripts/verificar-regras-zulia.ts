/**
 * Confere o isolamento entre clínicas nas regras da Zulia (`zulia/firestore.rules` e
 * `zulia/storage.rules`), entrando de verdade com cada tipo de login pelo SDK do navegador.
 *
 * O que está em jogo: na plataforma, todas as clínicas moram no mesmo banco e no mesmo bucket. Uma
 * regra frouxa aqui é uma clínica lendo as fichas das pacientes de outra. Por isso o teste não lê
 * o arquivo de regras: ele cria duas clínicas, entra com cada login e tenta.
 *
 *   1. Pelo Admin SDK: as clínicas `teste-a` e `teste-b`, cada uma com uma admin e uma
 *      profissional; um dono da plataforma; e um login sem clínica (alguém que criou conta por fora).
 *   2. Entra com cada um pelo SDK do cliente (senhas geradas aqui, que não saem da memória).
 *   3. Firestore: A não lê nem grava B; o anônimo só alcança as formas públicas; ninguém grava
 *      `clinicas/{c}` pelo navegador; o dono lê `clinicas/{c}`, mas não as coleções de dentro.
 *   4. Storage: o mesmo.
 *   5. Apaga tudo o que criou (também no começo, se uma rodada anterior ficou pela metade).
 *
 * Onde roda:
 *   npx tsx scripts/verificar-regras-zulia.ts
 *     no zulia-plataforma, com ZULIA_CLIENT_EMAIL e ZULIA_PRIVATE_KEY. Testa as regras PUBLICADAS:
 *     publique antes com `npm run publicar-regras -- --projeto zulia`.
 *   npx -y firebase-tools@15 emulators:exec --config zulia/firebase.json --project demo-zulia \
 *     "npx tsx scripts/verificar-regras-zulia.ts --emulador"
 *     nos emuladores locais, com as regras de `zulia/` do jeito que estão no disco.
 */
import crypto from 'node:crypto';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDocFromServer,
  getDocsFromServer,
  initializeFirestore,
  setDoc,
  setLogLevel,
  terminate,
  updateDoc,
  writeBatch,
  increment,
  type Firestore,
} from 'firebase/firestore';
import {
  connectStorageEmulator,
  deleteObject,
  getBytes,
  getStorage,
  listAll,
  ref,
  uploadBytes,
  type FirebaseStorage,
} from 'firebase/storage';
import { abrirZulia, EMULADORES, pediuEmulador } from './zuliaAdmin';

// Cada recusa das regras vira um aviso do SDK no console; aqui as recusas são o esperado.
setLogLevel('silent');

const emulador = pediuEmulador();
const zulia = abrirZulia({ emulador });
const { config } = zulia;

// A e B no plano completo (o isolamento); G no gratuito (os limites do plano).
const CLINICAS = ['teste-a', 'teste-b', 'teste-g'] as const;
type Clinica = (typeof CLINICAS)[number];
/** Os logins de teste usam este domínio, que não existe: nenhum e-mail sai para ninguém. */
const DOMINIO = 'regras.zulia.invalid';

let falhas = 0;
const ok = (nome: string, condicao: boolean, extra = '') => {
  console.log(`${condicao ? '  ok  ' : ' FALHA'}  ${nome}${extra ? `  — ${extra}` : ''}`);
  if (!condicao) falhas++;
};

// ==========================================
// LOGINS
// ==========================================

interface Sessao {
  nome: string;
  app: FirebaseApp;
  db: Firestore;
  storage: FirebaseStorage;
}

interface Login {
  chave: string;
  email: string;
  senha: string;
  claims: Record<string, unknown> | null;
}

const senhaGerada = () => `${crypto.randomBytes(18).toString('base64url')}Aa1!`;

const LOGINS: Login[] = [
  ...CLINICAS.flatMap((c) => [
    { chave: `admin-${c}`, email: `admin-${c}@${DOMINIO}`, senha: senhaGerada(), claims: { clinicaId: c, papel: 'admin' } },
    {
      chave: `prof-${c}`,
      email: `prof-${c}@${DOMINIO}`,
      senha: senhaGerada(),
      claims: { clinicaId: c, papel: 'profissional' },
    },
  ]),
  { chave: 'dono', email: `dono@${DOMINIO}`, senha: senhaGerada(), claims: { donoDaPlataforma: true } },
  { chave: 'sem-clinica', email: `sem-clinica@${DOMINIO}`, senha: senhaGerada(), claims: null },
];

const abrirSessao = async (nome: string, login?: Login): Promise<Sessao> => {
  const app = initializeApp(config, `sessao-${nome}-${Date.now()}`);
  const db = initializeFirestore(app, {}, config.firestoreDatabaseId || '(default)');
  const storage = getStorage(app);
  const auth = getAuth(app);
  if (emulador) {
    const [hostF, portaF] = EMULADORES.firestore.split(':');
    const [hostS, portaS] = EMULADORES.storage.split(':');
    connectFirestoreEmulator(db, hostF, Number(portaF));
    connectStorageEmulator(storage, hostS, Number(portaS));
    connectAuthEmulator(auth, `http://${EMULADORES.auth}`, { disableWarnings: true });
  }
  if (login) await signInWithEmailAndPassword(auth, login.email, login.senha);
  return { nome, app, db, storage };
};

const fecharSessao = async (s: Sessao) => {
  await signOut(getAuth(s.app)).catch(() => {});
  await terminate(s.db).catch(() => {});
  await deleteApp(s.app).catch(() => {});
};

// ==========================================
// PREPARO E LIMPEZA (Admin SDK)
// ==========================================

const limpar = async () => {
  for (const c of CLINICAS) {
    await zulia.db.recursiveDelete(zulia.db.doc(`clinicas/${c}`));
    await zulia.bucket.deleteFiles({ prefix: `clinicas/${c}/` }).catch(() => {});
  }
  for (const l of LOGINS) {
    const existente = await zulia.auth.getUserByEmail(l.email).catch(() => null);
    if (existente) await zulia.auth.deleteUser(existente.uid);
  }
};

const IMAGEM = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

const preparar = async () => {
  for (const l of LOGINS) {
    const usuario = await zulia.auth.createUser({ email: l.email, password: l.senha, emailVerified: true });
    if (l.claims) await zulia.auth.setCustomUserClaims(usuario.uid, l.claims);
  }
  const agora = new Date().toISOString();
  for (const c of CLINICAS) {
    const base = `clinicas/${c}`;
    const lote = zulia.db.batch();
    lote.set(zulia.db.doc(base), {
      nome: `Clínica ${c}`,
      plano: c === 'teste-g' ? 'gratuito' : 'completo',
      situacao: 'ativa',
      criadaEm: agora,
      uso: { clientes: 1, procedimentos: 0 },
    });
    lote.set(zulia.db.doc(`${base}/patients/p1`), { nome: `Paciente de ${c}`, cpf: '00000000000' });
    lote.set(zulia.db.doc(`${base}/anamnesis_records/r1`), { pacienteId: 'p1', respostasGerais: {} });
    lote.set(zulia.db.doc(`${base}/clinic_settings/main_profile`), { name: `Clínica ${c}`, professionals: [] });
    lote.set(zulia.db.doc(`${base}/clinic_settings/public_profile`), { name: `Clínica ${c}` });
    lote.set(zulia.db.doc(`${base}/clinic_settings/laser_body_map`), { mapas: [] });
    lote.set(zulia.db.doc(`${base}/anamnesis_general_questions/g1`), { texto: 'Pergunta geral' });
    lote.set(zulia.db.doc(`${base}/anamnesis_templates/t1`), { procedimentoNome: 'Procedimento' });
    lote.set(zulia.db.doc(`${base}/evaluation_templates/e1`), { nome: 'Avaliação' });
    lote.set(zulia.db.doc(`${base}/quotes/q1`), { numero: 1, itens: [] });
    lote.set(zulia.db.doc(`${base}/receipts/rc1`), { numero: 1, cpf: '00000000000' });
    lote.set(zulia.db.doc(`${base}/appointment_links/l1`), {
      situacao: 'ativo',
      data: '2030-01-10',
      hora: '10:00',
      respostaPendente: false,
    });
    await lote.commit();
    await zulia.bucket.file(`${base}/acompanhamentos/foto.png`).save(IMAGEM, { contentType: 'image/png' });
    await zulia.bucket.file(`${base}/clinica/logo.png`).save(IMAGEM, { contentType: 'image/png' });
  }
  // Um documento na raiz, no formato antigo: nada na Zulia pode alcançá-lo pelo navegador.
  await zulia.db.doc('patients/raiz-teste').set({ nome: 'Raiz' });
};

// ==========================================
// CONFERÊNCIAS
// ==========================================

const negado = (erro: unknown): boolean => {
  const codigo = String((erro as { code?: string })?.code || '');
  return codigo === 'permission-denied' || codigo === 'storage/unauthorized' || codigo === 'storage/unauthenticated';
};

/** Tenta `acao` e confere se as regras deixaram (`permitido`) ou barraram. */
const espera = async (nome: string, permitido: boolean, acao: () => Promise<unknown>) => {
  try {
    await acao();
    ok(nome, permitido, permitido ? '' : 'deveria ter sido barrado');
  } catch (erro) {
    if (negado(erro)) {
      ok(nome, !permitido, permitido ? `barrado: ${(erro as Error).message}` : '');
    } else {
      ok(nome, false, `erro inesperado: ${(erro as { code?: string }).code || ''} ${(erro as Error).message}`);
    }
  }
};

const ler = (s: Sessao, caminho: string) => () => getDocFromServer(doc(s.db, caminho));
const listar = (s: Sessao, caminho: string) => () => getDocsFromServer(collection(s.db, caminho));
const gravar = (s: Sessao, caminho: string, dados: Record<string, unknown> = { teste: true }) => () =>
  setDoc(doc(s.db, caminho), dados, { merge: true });
const apagar = (s: Sessao, caminho: string) => () => deleteDoc(doc(s.db, caminho));
const enviar = (s: Sessao, caminho: string, tipo = 'image/png') => () =>
  uploadBytes(ref(s.storage, caminho), new Uint8Array(IMAGEM), { contentType: tipo });
const baixar = (s: Sessao, caminho: string) => () => getBytes(ref(s.storage, caminho));
const apagarArquivo = (s: Sessao, caminho: string) => () => deleteObject(ref(s.storage, caminho));
const listarPasta = (s: Sessao, caminho: string) => () => listAll(ref(s.storage, caminho));

async function conferirFirestore(sessoes: Record<string, Sessao>) {
  const adminA = sessoes['admin-teste-a'];
  const profA = sessoes['prof-teste-a'];
  const adminB = sessoes['admin-teste-b'];
  const { dono, anonimo } = sessoes;
  const semClinica = sessoes['sem-clinica'];

  console.log('\nFirestore — a própria clínica');
  for (const s of [adminA, profA]) {
    await espera(`${s.nome} lê paciente de A`, true, ler(s, 'clinicas/teste-a/patients/p1'));
    await espera(`${s.nome} lista pacientes de A`, true, listar(s, 'clinicas/teste-a/patients'));
    await espera(`${s.nome} grava paciente em A`, true, gravar(s, `clinicas/teste-a/patients/novo-${s.nome}`));
    await espera(`${s.nome} apaga paciente em A`, true, apagar(s, `clinicas/teste-a/patients/novo-${s.nome}`));
    await espera(`${s.nome} lê o perfil completo de A`, true, ler(s, 'clinicas/teste-a/clinic_settings/main_profile'));
    await espera(`${s.nome} lista orçamentos de A`, true, listar(s, 'clinicas/teste-a/quotes'));
    await espera(`${s.nome} lê recibo de A`, true, ler(s, 'clinicas/teste-a/receipts/rc1'));
    await espera(`${s.nome} lê o documento da clínica A`, true, ler(s, 'clinicas/teste-a'));
    await espera(`${s.nome} NÃO grava o documento da clínica A`, false, gravar(s, 'clinicas/teste-a', { plano: 'completo' }));
  }
  await espera('profissional de A NÃO cria uma clínica nova', false, gravar(profA, 'clinicas/teste-c', { nome: 'X' }));

  console.log('\nFirestore — a outra clínica');
  for (const [s, outra] of [
    [adminA, 'teste-b'],
    [profA, 'teste-b'],
    [adminB, 'teste-a'],
  ] as const) {
    await espera(`${s.nome} NÃO lê paciente de ${outra}`, false, ler(s, `clinicas/${outra}/patients/p1`));
    await espera(`${s.nome} NÃO lista pacientes de ${outra}`, false, listar(s, `clinicas/${outra}/patients`));
    await espera(`${s.nome} NÃO grava paciente em ${outra}`, false, gravar(s, `clinicas/${outra}/patients/intruso`));
    await espera(`${s.nome} NÃO lê ficha de ${outra}`, false, ler(s, `clinicas/${outra}/anamnesis_records/r1`));
    await espera(`${s.nome} NÃO lê o perfil completo de ${outra}`, false, ler(s, `clinicas/${outra}/clinic_settings/main_profile`));
    await espera(`${s.nome} NÃO lista orçamentos de ${outra}`, false, listar(s, `clinicas/${outra}/quotes`));
    await espera(`${s.nome} NÃO lê o documento da clínica ${outra}`, false, ler(s, `clinicas/${outra}`));
    await espera(`${s.nome} NÃO grava o perfil público de ${outra}`, false, gravar(s, `clinicas/${outra}/clinic_settings/public_profile`));
  }

  console.log('\nFirestore — sem login (a paciente pelo link)');
  await espera('anônimo lê o perfil público', true, ler(anonimo, 'clinicas/teste-a/clinic_settings/public_profile'));
  await espera('anônimo lê o mapa do laser', true, ler(anonimo, 'clinicas/teste-a/clinic_settings/laser_body_map'));
  await espera('anônimo lista as perguntas gerais da anamnese', true, listar(anonimo, 'clinicas/teste-a/anamnesis_general_questions'));
  await espera('anônimo lê a ficha-modelo', true, ler(anonimo, 'clinicas/teste-a/anamnesis_templates/t1'));
  await espera('anônimo lê o orçamento pelo id', true, ler(anonimo, 'clinicas/teste-a/quotes/q1'));
  await espera('anônimo lê o link do agendamento pelo id', true, ler(anonimo, 'clinicas/teste-a/appointment_links/l1'));
  await espera('anônimo responde ao agendamento', true, () =>
    updateDoc(doc(anonimo.db, 'clinicas/teste-a/appointment_links/l1'), {
      resposta: { tipo: 'confirmar' },
      respostaPendente: true,
      respondidoEm: new Date().toISOString(),
    })
  );
  await espera('anônimo NÃO muda o horário do agendamento', false, () =>
    updateDoc(doc(anonimo.db, 'clinicas/teste-a/appointment_links/l1'), {
      hora: '23:00',
      respostaPendente: true,
      respondidoEm: new Date().toISOString(),
    })
  );
  await espera('anônimo NÃO lista orçamentos', false, listar(anonimo, 'clinicas/teste-a/quotes'));
  await espera('anônimo NÃO lista links de agendamento', false, listar(anonimo, 'clinicas/teste-a/appointment_links'));
  await espera('anônimo NÃO lê paciente', false, ler(anonimo, 'clinicas/teste-a/patients/p1'));
  await espera('anônimo NÃO lê ficha preenchida', false, ler(anonimo, 'clinicas/teste-a/anamnesis_records/r1'));
  await espera('anônimo NÃO lê ficha de avaliação', false, ler(anonimo, 'clinicas/teste-a/evaluation_templates/e1'));
  await espera('anônimo NÃO lê o perfil completo', false, ler(anonimo, 'clinicas/teste-a/clinic_settings/main_profile'));
  await espera('anônimo NÃO lê o documento da clínica', false, ler(anonimo, 'clinicas/teste-a'));
  await espera('anônimo NÃO grava o perfil público', false, gravar(anonimo, 'clinicas/teste-a/clinic_settings/public_profile'));
  await espera('anônimo NÃO grava ficha-modelo', false, gravar(anonimo, 'clinicas/teste-a/anamnesis_templates/t1'));
  await espera('anônimo NÃO cria orçamento', false, gravar(anonimo, 'clinicas/teste-a/quotes/q-novo'));

  console.log('\nFirestore — login sem clínica');
  await espera('sem clínica NÃO lê paciente de A', false, ler(semClinica, 'clinicas/teste-a/patients/p1'));
  await espera('sem clínica NÃO lê o documento da clínica A', false, ler(semClinica, 'clinicas/teste-a'));
  await espera('sem clínica NÃO grava paciente em A', false, gravar(semClinica, 'clinicas/teste-a/patients/intruso'));
  await espera('sem clínica lê o perfil público (como qualquer um)', true, ler(semClinica, 'clinicas/teste-a/clinic_settings/public_profile'));

  console.log('\nFirestore — dono da plataforma');
  await espera('dono lê o documento da clínica A', true, ler(dono, 'clinicas/teste-a'));
  await espera('dono lista as clínicas', true, listar(dono, 'clinicas'));
  await espera('dono NÃO grava o documento da clínica', false, gravar(dono, 'clinicas/teste-a', { plano: 'completo' }));
  await espera('dono NÃO lê paciente de A', false, ler(dono, 'clinicas/teste-a/patients/p1'));
  await espera('dono NÃO lista pacientes de A', false, listar(dono, 'clinicas/teste-a/patients'));
  await espera('dono NÃO lê o perfil completo de A', false, ler(dono, 'clinicas/teste-a/clinic_settings/main_profile'));
  await espera('dono NÃO lê recibo de A', false, ler(dono, 'clinicas/teste-a/receipts/rc1'));

  console.log('\nFirestore — fora de clinicas/');
  await espera('admin de A NÃO lê a raiz (formato antigo)', false, ler(adminA, 'patients/raiz-teste'));
  await espera('admin de A NÃO grava na raiz', false, gravar(adminA, 'patients/raiz-intruso'));
  await espera('dono NÃO lê a raiz', false, ler(dono, 'patients/raiz-teste'));
  await espera('admin de A NÃO lê coleção sem regra dentro da clínica', false, ler(adminA, 'clinicas/teste-a/colecao_sem_regra/x'));
}

/**
 * Cria (delta 1) ou exclui de vez (delta -1) um cadastro contado, com o contador da clínica no mesmo
 * lote — como o painel faz (`gravarCadastroContado` em src/services/databaseService.ts).
 */
const contado =
  (s: Sessao, c: string, colecao: 'patients' | 'procedures', id: string, delta: 1 | -1 = 1, extra: Record<string, unknown> = {}) =>
  () => {
    const [contador, ultimo] = colecao === 'patients' ? ['clientes', 'ultimoCliente'] : ['procedimentos', 'ultimoProcedimento'];
    const lote = writeBatch(s.db);
    const ref = doc(s.db, `clinicas/${c}/${colecao}/${id}`);
    if (delta > 0) lote.set(ref, { nome: id });
    else lote.delete(ref);
    lote.update(doc(s.db, `clinicas/${c}`), { [`uso.${contador}`]: increment(delta), [`uso.${ultimo}`]: id, ...extra });
    return lote.commit();
  };

const mexerNoContador = (s: Sessao, c: string, dados: Record<string, unknown>) => () => updateDoc(doc(s.db, `clinicas/${c}`), dados);

async function conferirLimites(sessoes: Record<string, Sessao>) {
  const adminG = sessoes['admin-teste-g'];
  const profG = sessoes['prof-teste-g'];
  const adminA = sessoes['admin-teste-a'];

  console.log('\nPlano gratuito — clientes (G começa com 1)');
  await espera('gratuito: cliente nova SEM o contador é recusada', false, gravar(adminG, 'clinicas/teste-g/patients/sem-contador'));
  await espera('gratuito: cliente nova com o contador (2)', true, contado(adminG, 'teste-g', 'patients', 'c2'));
  await espera('gratuito: a profissional também cadastra, contando (3)', true, contado(profG, 'teste-g', 'patients', 'c3'));
  await espera('gratuito: 4', true, contado(adminG, 'teste-g', 'patients', 'c4'));
  await espera('gratuito: 5', true, contado(adminG, 'teste-g', 'patients', 'c5'));
  await espera('gratuito: a 6ª cliente é recusada', false, contado(adminG, 'teste-g', 'patients', 'c6'));
  await espera('gratuito: editar uma cliente que existe continua livre', true, gravar(adminG, 'clinicas/teste-g/patients/c2', { nome: 'Outro nome' }));
  await espera('contador NÃO sobe sem cadastro novo', false, mexerNoContador(adminG, 'teste-g', { 'uso.clientes': increment(1), 'uso.ultimoCliente': 'p1' }));
  await espera('contador NÃO desce sem excluir', false, mexerNoContador(adminG, 'teste-g', { 'uso.clientes': increment(-1), 'uso.ultimoCliente': 'c2' }));
  await espera('contador NÃO vai a zero direto', false, mexerNoContador(adminG, 'teste-g', { 'uso.clientes': 0 }));
  await espera('excluir de vez, com o contador, libera a vaga', true, contado(adminG, 'teste-g', 'patients', 'c5', -1));
  await espera('NÃO muda o plano junto com o contador', false, contado(adminG, 'teste-g', 'patients', 'c6', 1, { plano: 'completo' }));
  await espera('com a vaga liberada, cabe mais uma', true, contado(adminG, 'teste-g', 'patients', 'c6'));
  const usoG = (await zulia.db.doc('clinicas/teste-g').get()).data()?.uso;
  const clientesG = (await zulia.db.collection('clinicas/teste-g/patients').count().get()).data().count;
  ok('o contador bate com as clientes que existem', usoG?.clientes === clientesG && clientesG === 5, `${usoG?.clientes} × ${clientesG}`);

  console.log('\nPlano gratuito — procedimentos');
  await espera('gratuito: procedimento SEM o contador é recusado', false, gravar(adminG, 'clinicas/teste-g/procedures/sem-contador'));
  await espera('gratuito: 1º procedimento', true, contado(adminG, 'teste-g', 'procedures', 'pr1'));
  await espera('gratuito: 2º procedimento', true, contado(adminG, 'teste-g', 'procedures', 'pr2'));
  await espera('gratuito: o 3º procedimento é recusado', false, contado(adminG, 'teste-g', 'procedures', 'pr3'));
  await espera('editar um procedimento que existe continua livre', true, gravar(adminG, 'clinicas/teste-g/procedures/pr1', { titulo: 'X' }));

  console.log('\nContadores — outras clínicas e o completo');
  await espera('admin de A NÃO mexe no contador de G', false, mexerNoContador(adminA, 'teste-g', { 'uso.clientes': increment(-1), 'uso.ultimoCliente': 'c2' }));
  await espera('admin de A NÃO cria cliente em G, nem contando', false, contado(adminA, 'teste-g', 'patients', 'intrusa'));
  await espera('completo: cliente nova com o contador também passa', true, contado(adminA, 'teste-a', 'patients', 'ca1'));
  await espera('completo: e sem o contador (não trava quem paga)', true, gravar(adminA, 'clinicas/teste-a/patients/ca2'));
}

async function conferirStorage(sessoes: Record<string, Sessao>) {
  const adminA = sessoes['admin-teste-a'];
  const profA = sessoes['prof-teste-a'];
  const adminB = sessoes['admin-teste-b'];
  const { dono, anonimo } = sessoes;
  const semClinica = sessoes['sem-clinica'];

  console.log('\nStorage — a própria clínica');
  await espera('admin de A envia foto do acompanhamento', true, enviar(adminA, 'clinicas/teste-a/acompanhamentos/nova.png'));
  await espera('profissional de A baixa a foto do acompanhamento', true, baixar(profA, 'clinicas/teste-a/acompanhamentos/foto.png'));
  await espera('profissional de A envia comprovante em PDF', true, enviar(profA, 'clinicas/teste-a/orcamentos/q1/comprovantes/c.pdf', 'application/pdf'));
  await espera('admin de A NÃO envia PDF como foto do catálogo', false, enviar(adminA, 'clinicas/teste-a/procedimentos/p1/x.pdf', 'application/pdf'));
  await espera('profissional de A apaga a foto que a admin enviou', true, apagarArquivo(profA, 'clinicas/teste-a/acompanhamentos/nova.png'));
  await espera('admin de A NÃO lista a pasta de acompanhamentos', false, listarPasta(adminA, 'clinicas/teste-a/acompanhamentos'));

  console.log('\nStorage — a outra clínica');
  await espera('admin de B NÃO baixa a foto do acompanhamento de A', false, baixar(adminB, 'clinicas/teste-a/acompanhamentos/foto.png'));
  await espera('admin de B NÃO envia para A', false, enviar(adminB, 'clinicas/teste-a/clinica/intruso.png'));
  await espera('admin de B NÃO apaga a logo de A', false, apagarArquivo(adminB, 'clinicas/teste-a/clinica/logo.png'));
  await espera('profissional de A NÃO baixa a foto do acompanhamento de B', false, baixar(profA, 'clinicas/teste-b/acompanhamentos/foto.png'));

  console.log('\nStorage — sem login (a paciente pelo link)');
  await espera('anônimo envia a foto dele na ficha', true, enviar(anonimo, 'clinicas/teste-a/anamnese/fotos-pacientes/paciente.png'));
  await espera('anônimo NÃO envia arquivo que não é imagem', false, enviar(anonimo, 'clinicas/teste-a/anamnese/fotos-pacientes/x.pdf', 'application/pdf'));
  await espera('anônimo NÃO troca uma foto já enviada', false, enviar(anonimo, 'clinicas/teste-a/anamnese/fotos-pacientes/paciente.png'));
  await espera('anônimo NÃO apaga a foto enviada', false, apagarArquivo(anonimo, 'clinicas/teste-a/anamnese/fotos-pacientes/paciente.png'));
  await espera('anônimo baixa a logo da clínica', true, baixar(anonimo, 'clinicas/teste-a/clinica/logo.png'));
  await espera('anônimo NÃO baixa a foto do acompanhamento', false, baixar(anonimo, 'clinicas/teste-a/acompanhamentos/foto.png'));
  await espera('anônimo NÃO envia para a pasta da clínica', false, enviar(anonimo, 'clinicas/teste-a/clinica/intruso.png'));
  await espera('anônimo NÃO envia na raiz (formato antigo)', false, enviar(anonimo, 'anamnese/fotos-pacientes/raiz.png'));

  console.log('\nStorage — login sem clínica e dono');
  await espera('sem clínica NÃO baixa a foto do acompanhamento de A', false, baixar(semClinica, 'clinicas/teste-a/acompanhamentos/foto.png'));
  await espera('sem clínica NÃO envia para A', false, enviar(semClinica, 'clinicas/teste-a/acompanhamentos/intruso.png'));
  await espera('dono NÃO baixa a foto do acompanhamento de A', false, baixar(dono, 'clinicas/teste-a/acompanhamentos/foto.png'));
  await espera('dono NÃO envia para A', false, enviar(dono, 'clinicas/teste-a/clinica/dono.png'));
}

// ==========================================
// PRINCIPAL
// ==========================================

async function main() {
  console.log(
    emulador
      ? `Emuladores locais (${config.projectId}), regras de zulia/ como estão no disco.`
      : `Projeto ${config.projectId}, regras PUBLICADAS.`
  );

  await limpar();
  await preparar();

  const sessoes: Record<string, Sessao> = { anonimo: await abrirSessao('anonimo') };
  for (const l of LOGINS) sessoes[l.chave] = await abrirSessao(l.chave, l);
  // Nomes curtos nas mensagens.
  sessoes['admin-teste-a'].nome = 'admin de A';
  sessoes['prof-teste-a'].nome = 'profissional de A';
  sessoes['admin-teste-b'].nome = 'admin de B';

  try {
    await conferirFirestore(sessoes);
    await conferirLimites(sessoes);
    await conferirStorage(sessoes);
  } finally {
    for (const s of Object.values(sessoes)) await fecharSessao(s);
    await zulia.db.doc('patients/raiz-teste').delete();
    await limpar();
    const sobrou = (await Promise.all(CLINICAS.map((c) => zulia.db.doc(`clinicas/${c}`).get()))).some((d) => d.exists);
    ok('limpeza: as clínicas de teste foram apagadas', !sobrou);
    await zulia.encerrar();
  }

  console.log(falhas === 0 ? '\nTudo certo.' : `\n${falhas} falha(s).`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(`\nNão foi possível conferir: ${(e as Error).message}`);
  await limpar().catch(() => {});
  process.exit(1);
});

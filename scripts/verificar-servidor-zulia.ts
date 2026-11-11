/**
 * Confere o servidor no modo Zulia (fase 3): cada pedido lê e grava só na clínica certa.
 *
 *   - ficha pública: `c` do link → `clinicas/{c}/...`; ficha de uma clínica não abre com o `c` de
 *     outra; link sem clínica conhecida é recusado;
 *   - cartão do link (preview): lê o documento da clínica do link e mostra o nome dela;
 *   - `/api/equipe`: só a admin da clínica cria login, muda papel e desativa; nunca de outra
 *     clínica; nunca sem admin; login desativado deixa de valer na hora;
 *   - Google Agenda: só clínica com o recurso, e só com uma conta dela.
 *
 * Roda nos emuladores locais (Auth e Firestore), nunca num projeto de verdade:
 *
 *   PLATAFORMA=zulia npx -y firebase-tools@15 emulators:exec --only auth,firestore \
 *     --config zulia/firebase.json --project demo-zulia "npx tsx scripts/verificar-servidor-zulia.ts"
 */
import type { AddressInfo } from 'node:net';
import express from 'express';
import { deleteApp, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { abrirZulia, EMULADORES } from './zuliaAdmin';
import { modoPlataforma } from '../src/lib/projetoFirebase';
import { MARCA_DA_PLATAFORMA } from '../src/utils/marca';
import { definirAuthAdmin, definirBancoAdmin } from '../server/firebaseAdmin';
import { criarLimitadores, criarRotasFichaPublica } from '../server/fichaPublica';
import { criarResolvedorDePreview } from '../server/previewDosLinks';
import { criarRotasDaEquipe } from '../server/equipe';
import { criarRotasDoDono } from '../server/dono';
import { criarRotasGoogleAgenda, cifrar } from '../server/googleAgenda';
import { loginDasClaims, verificarLogin } from '../server/login';
import { clinicaDoPedido, caminhoDaColecao } from '../server/clinicas';
import { CLINICA_DOS_LINKS_ANTIGOS, clinicaDoLink, gerarIdDeClinica, idDeClinicaValido } from '../src/utils/clinicas';

let falhas = 0;
const ok = (nome: string, condicao: boolean, extra = '') => {
  console.log(`${condicao ? '  ok  ' : ' FALHA'}  ${nome}${extra ? `  — ${extra}` : ''}`);
  if (!condicao) falhas++;
};

if (modoPlataforma !== 'zulia') {
  console.error('Rode com PLATAFORMA=zulia (ver o topo do arquivo).');
  process.exit(1);
}
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('Rode dentro dos emuladores (ver o topo do arquivo) — este teste grava e apaga.');
  process.exit(1);
}

const zulia = abrirZulia({ emulador: true });
definirBancoAdmin(zulia.db);
definirAuthAdmin(zulia.auth);

const SENHA = `Teste-${crypto.randomUUID()}`;

/** Cria um login com claims e devolve o token dele, como o painel mandaria. */
const loginDeTeste = async (email: string, claims: Record<string, unknown> | null) => {
  const usuario = await zulia.auth.createUser({ email, password: SENHA });
  if (claims) await zulia.auth.setCustomUserClaims(usuario.uid, claims);
  return { uid: usuario.uid, token: await tokenDe(email) };
};

/**
 * Um login com segundo fator por SMS (o tipo que o emulador do Authentication conhece) e o token
 * dele, que leva `firebase.sign_in_second_factor`: a mesma marca que o aplicativo autenticador deixa
 * no ar. Pela API REST do emulador: senha → início do 2º fator → código do emulador → fim.
 */
const tokenComSegundoFator = async (email: string): Promise<string> => {
  const raiz = `http://${EMULADORES.auth}/identitytoolkit.googleapis.com`;
  const chave = `key=${zulia.config.apiKey}`;
  const usuario = await zulia.auth.createUser({
    email,
    password: SENHA,
    emailVerified: true,
    multiFactor: { enrolledFactors: [{ factorId: 'phone', phoneNumber: '+5511999990000', displayName: 'Celular' }] },
  });
  await zulia.auth.setCustomUserClaims(usuario.uid, { donoDaPlataforma: true });
  const postar = async (url: string, corpo: unknown) =>
    (await (await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })).json()) as any;
  const senha = await postar(`${raiz}/v1/accounts:signInWithPassword?${chave}`, { email, password: SENHA, returnSecureToken: true });
  const inicio = await postar(`${raiz}/v2/accounts/mfaSignIn:start?${chave}`, {
    mfaPendingCredential: senha.mfaPendingCredential,
    mfaEnrollmentId: senha.mfaInfo[0].mfaEnrollmentId,
    phoneSignInInfo: {},
  });
  const sessionInfo = inicio.phoneResponseInfo.sessionInfo;
  const codigos = (await (await fetch(`http://${EMULADORES.auth}/emulator/v1/projects/${zulia.config.projectId}/verificationCodes`)).json()) as any;
  const codigo = codigos.verificationCodes.find((c: { sessionInfo: string }) => c.sessionInfo === sessionInfo).code;
  const fim = await postar(`${raiz}/v2/accounts/mfaSignIn:finalize?${chave}`, {
    mfaPendingCredential: senha.mfaPendingCredential,
    phoneVerificationInfo: { sessionInfo, code: codigo },
  });
  return fim.idToken;
};

const tokenDe = async (email: string) => {
  const app = initializeApp(zulia.config, `cliente-${email}-${Date.now()}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${EMULADORES.auth}`, { disableWarnings: true });
  const cred = await signInWithEmailAndPassword(auth, email, SENHA);
  const token = await cred.user.getIdToken(true);
  await deleteApp(app);
  return token;
};

async function main() {
  console.log('\nIds de clínica');
  ok('id gerado tem 6 caracteres e é válido', /^[A-Za-z0-9]{6}$/.test(gerarIdDeClinica()) && !!idDeClinicaValido(gerarIdDeClinica()));
  ok('ids gerados não se repetem', new Set(Array.from({ length: 200 }, () => gerarIdDeClinica())).size === 200);
  ok('caminho com barra não é id', idDeClinicaValido('a/b') === '' && idDeClinicaValido('../x') === '');
  // Desde a migração (10/11/2026), link sem c é link antigo da La Vie.
  ok('link sem c vai para a clínica dos links antigos (a La Vie)', CLINICA_DOS_LINKS_ANTIGOS === 'u9JYfN' && clinicaDoLink('') === 'u9JYfN');
  ok('legado ignora o c (raiz)', clinicaDoPedido('qualquer', false) === null);
  ok('zulia usa o c do link', clinicaDoPedido('k3P9xq', true) === 'k3P9xq');
  ok('zulia recusa c inválido', clinicaDoPedido('a/b', true) === undefined);
  ok('caminho da coleção na clínica', caminhoDaColecao('k3P9xq', 'quotes') === 'clinicas/k3P9xq/quotes');
  ok('caminho da coleção no legado', caminhoDaColecao(null, 'quotes') === 'quotes');
  ok(
    'claims viram o login',
    JSON.stringify(loginDasClaims({ uid: 'u', clinicaId: 'k3P9xq', papel: 'admin', donoDaPlataforma: false })) ===
      JSON.stringify({ uid: 'u', email: null, clinicaId: 'k3P9xq', papel: 'admin', dono: false, emailVerificado: false, segundoFator: null })
  );
  ok('e-mail confirmado vem da claim padrão', loginDasClaims({ uid: 'u', email_verified: true }).emailVerificado === true);
  ok('papel estranho vira nulo', loginDasClaims({ uid: 'u', papel: 'dona' }).papel === null);

  // ==========================================
  // DADOS DE TESTE
  // ==========================================
  const agora = new Date().toISOString();
  for (const c of ['srv-a', 'srv-b']) {
    const b = `clinicas/${c}`;
    // Plano completo: a equipe e as fichas sem limite (os limites do gratuito têm a seção deles).
    await zulia.db.doc(b).set({ nome: `Clínica ${c}`, plano: 'completo', recursos: { googleAgenda: c === 'srv-a' }, equipe: {} });
    await zulia.db.doc(`${b}/clinic_settings/public_profile`).set({ name: c === 'srv-a' ? 'Clínica Alfa' : 'Clínica Beta' });
    await zulia.db.doc(`${b}/anamnesis_templates/tpl-botox`).set({ procedimentoNome: `Botox ${c}`, procedimentoId: 'p' });
    await zulia.db.doc(`${b}/patients/pat-1`).set({ nome: `Paciente ${c}` });
    await zulia.db.doc(`${b}/anamnesis_records/rec-1`).set({
      pacienteId: 'pat-1',
      templateId: 'tpl-botox',
      procedimentoNome: `Botox ${c}`,
      createdAt: agora,
    });
  }
  // A clínica dos links antigos, com uma ficha de mesmo id: o link sem c abre esta.
  await zulia.db.doc(`clinicas/${CLINICA_DOS_LINKS_ANTIGOS}`).set({ nome: 'La Vie', recursos: { googleAgenda: true }, equipe: {} });
  await zulia.db.doc(`clinicas/${CLINICA_DOS_LINKS_ANTIGOS}/patients/pat-1`).set({ nome: 'Paciente La Vie' });
  await zulia.db.doc(`clinicas/${CLINICA_DOS_LINKS_ANTIGOS}/anamnesis_records/rec-1`).set({
    pacienteId: 'pat-1',
    templateId: 'tpl-botox',
    procedimentoNome: 'Botox La Vie',
    createdAt: agora,
  });
  const adminA = await loginDeTeste('admin@srv-a.invalid', { clinicaId: 'srv-a', papel: 'admin' });
  const profA = await loginDeTeste('prof@srv-a.invalid', { clinicaId: 'srv-a', papel: 'profissional' });
  const adminB = await loginDeTeste('admin@srv-b.invalid', { clinicaId: 'srv-b', papel: 'admin' });
  await zulia.db.doc('clinicas/srv-a').update({ [`equipe.${adminA.uid}`]: 'admin', [`equipe.${profA.uid}`]: 'profissional' });
  await zulia.db.doc('clinicas/srv-b').update({ [`equipe.${adminB.uid}`]: 'admin' });

  const app = express();
  app.use('/api/ficha-publica', criarRotasFichaPublica({ zulia: true, banco: () => zulia.db, limites: criarLimitadores() }));
  app.use('/api/equipe', criarRotasDaEquipe({ zulia: true, banco: () => zulia.db, auth: () => zulia.auth, gerencia: () => true }));
  app.use('/api/google-agenda', criarRotasGoogleAgenda({ zulia: true, banco: () => zulia.db }));
  // O painel do dono exigindo o segundo fator, como no ar (nos emuladores o padrão é não exigir).
  app.use('/api/dono', criarRotasDoDono({ zulia: true, banco: () => zulia.db, auth: () => zulia.auth, gerencia: () => true, exigirDuasEtapas: true }));
  const servidor = app.listen(0);
  const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  const post = async (rota: string, corpo: unknown, token?: string) => {
    const r = await fetch(`${base}${rota}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(corpo),
    });
    return { status: r.status, json: (await r.json().catch(() => ({}))) as any };
  };

  try {
    // ==========================================
    console.log('\nFicha pública por clínica');
    const a = await post('/api/ficha-publica/abrir', { c: 'srv-a', ficha: 'rec-1' });
    ok('abre a ficha da clínica do link', a.status === 200 && a.json.ficha?.procedimentoNome === 'Botox srv-a');
    ok('e a paciente dela', a.json.paciente?.nome === 'Paciente srv-a');
    const b = await post('/api/ficha-publica/abrir', { c: 'srv-b', ficha: 'rec-1' });
    ok('mesmo id com o c de outra clínica abre a ficha da outra', b.json.ficha?.procedimentoNome === 'Botox srv-b');
    const semC = await post('/api/ficha-publica/abrir', { ficha: 'rec-1' });
    ok('link sem c abre a ficha da clínica dos links antigos', semC.status === 200 && semC.json.ficha?.procedimentoNome === 'Botox La Vie', JSON.stringify(semC.json).slice(0, 120));
    const cRuim = await post('/api/ficha-publica/abrir', { c: '../srv-a', ficha: 'rec-1' });
    ok('c que não é id → 404', cRuim.status === 404);
    const cInexistente = await post('/api/ficha-publica/abrir', { c: 'naoexiste', ficha: 'rec-1' });
    ok('clínica que não existe → ficha não encontrada', cInexistente.status === 404 && cInexistente.json.erro === 'ficha-nao-encontrada');

    const salva = await post('/api/ficha-publica/salvar', {
      c: 'srv-b',
      anamnese: 'tpl-botox',
      dadosPaciente: { nome: 'Nova de B' },
      dadosFicha: { respostasGerais: { g1: 'sim' }, respostasEspecificas: {} },
    });
    ok('salvar cria a ficha na clínica do link', salva.status === 200 && typeof salva.json.ficha?.id === 'string');
    const id = salva.json.ficha?.id as string;
    ok('a ficha nova está em clinicas/srv-b', (await zulia.db.doc(`clinicas/srv-b/anamnesis_records/${id}`).get()).exists);
    ok('e não em clinicas/srv-a', !(await zulia.db.doc(`clinicas/srv-a/anamnesis_records/${id}`).get()).exists);
    ok('nem na raiz', !(await zulia.db.doc(`anamnesis_records/${id}`).get()).exists);
    const pacId = salva.json.ficha?.pacienteId as string;
    ok('a paciente nova também está em B', (await zulia.db.doc(`clinicas/srv-b/patients/${pacId}`).get()).exists);
    const cruzada = await post('/api/ficha-publica/salvar', {
      c: 'srv-a',
      ficha: id,
      dadosPaciente: { nome: 'Intrusa' },
      dadosFicha: {},
    });
    ok('a ficha de B não é gravada pelo link de A', cruzada.status === 404);
    const status = await (await fetch(`${base}/api/ficha-publica/status`)).json();
    ok('status no modo Zulia, com a clínica dos links antigos', status.modo === 'zulia' && status.conectado === true && status.linksAntigos === true, JSON.stringify(status));

    // ==========================================
    console.log('\nCartão do link por clínica');
    const leitor = () => async (colecao: string, docId: string, campos: string[]) => {
      const snap = await zulia.db.collection(colecao).doc(docId).get();
      if (!snap.exists) return null;
      const dados = snap.data() || {};
      return Object.fromEntries(campos.map((c) => [c, dados[c]]).filter(([, v]) => v !== undefined));
    };
    const resolver = criarResolvedorDePreview({ zulia: true, lerComCredencial: leitor });
    const pa = await resolver('?anamnese=tpl-botox&c=srv-a');
    ok('procedimento da clínica do link', pa?.titulo === 'Anamnese - Botox srv-a', pa?.titulo);
    ok('nome da clínica do perfil público', pa?.descricao.startsWith('Clínica Alfa') === true && pa?.site === 'Clínica Alfa', pa?.descricao);
    const pb = await resolver('?anamnese=tpl-botox&c=srv-b');
    ok('o mesmo link com o c de B mostra B', pb?.titulo === 'Anamnese - Botox srv-b' && pb?.site === 'Clínica Beta');
    const pSem = await resolver('?anamnese=tpl-botox');
    ok('link sem clínica conhecida sai genérico, com a marca da plataforma', pSem?.titulo === `Anamnese - ${MARCA_DA_PLATAFORMA}`, pSem?.titulo);

    // ==========================================
    console.log('\nLogin pelo Admin SDK');
    const lA = await verificarLogin(adminA.token);
    ok('token da admin de A traz clínica e papel', lA?.clinicaId === 'srv-a' && lA?.papel === 'admin' && lA?.dono === false);
    ok('token inventado não vale', (await verificarLogin('a.b.c')) === null);

    // ==========================================
    console.log('\n/api/equipe');
    const semLogin = await post('/api/equipe/criar-login', { email: 'x@srv-a.invalid' });
    ok('sem login → 401', semLogin.status === 401);
    const daProf = await post('/api/equipe/criar-login', { email: 'x@srv-a.invalid' }, profA.token);
    ok('profissional não cria login → 403', daProf.status === 403);
    const novo = await post('/api/equipe/criar-login', { email: 'Nova@srv-a.invalid' }, adminA.token);
    ok('admin cria login', novo.status === 200 && typeof novo.json.uid === 'string');
    const usuarioNovo = await zulia.auth.getUser(novo.json.uid);
    ok('com e-mail em minúsculas', usuarioNovo.email === 'nova@srv-a.invalid');
    ok(
      'e as claims da clínica, como profissional',
      usuarioNovo.customClaims?.clinicaId === 'srv-a' && usuarioNovo.customClaims?.papel === 'profissional'
    );
    ok('e entra no índice da equipe', (await zulia.db.doc('clinicas/srv-a').get()).data()?.equipe?.[novo.json.uid] === 'profissional');
    const deNovo = await post('/api/equipe/criar-login', { email: 'nova@srv-a.invalid' }, adminA.token);
    ok('o mesmo e-mail de novo na mesma clínica devolve o mesmo login', deNovo.json.uid === novo.json.uid);
    const deOutra = await post('/api/equipe/criar-login', { email: 'nova@srv-a.invalid' }, adminB.token);
    ok('o e-mail de um login de A não vira login de B', deOutra.status === 409 && deOutra.json.erro === 'email-em-uso');
    await zulia.auth.createUser({ email: 'avulsa@srv-a.invalid', password: SENHA });
    const avulsa = await post('/api/equipe/criar-login', { email: 'avulsa@srv-a.invalid' }, adminA.token);
    ok('conta criada por fora, sem clínica, não é adotada', avulsa.status === 409);
    const emailRuim = await post('/api/equipe/criar-login', { email: 'sem-arroba' }, adminA.token);
    ok('e-mail inválido → 400', emailRuim.status === 400);

    const promover = await post('/api/equipe/mudar-papel', { uid: profA.uid, papel: 'admin' }, adminA.token);
    ok('admin promove a profissional', promover.status === 200 && (await zulia.auth.getUser(profA.uid)).customClaims?.papel === 'admin');
    const outraClinica = await post('/api/equipe/mudar-papel', { uid: profA.uid, papel: 'profissional' }, adminB.token);
    ok('admin de B não mexe em login de A → 404', outraClinica.status === 404);
    const rebaixaUm = await post('/api/equipe/mudar-papel', { uid: profA.uid, papel: 'profissional' }, adminA.token);
    ok('com duas admins, uma pode deixar de ser', rebaixaUm.status === 200);
    const rebaixaUltima = await post('/api/equipe/mudar-papel', { uid: adminA.uid, papel: 'profissional' }, adminA.token);
    ok('a última admin não deixa de ser → 409', rebaixaUltima.status === 409 && rebaixaUltima.json.erro === 'ultima-admin');
    ok('e a claim dela fica como estava', (await zulia.auth.getUser(adminA.uid)).customClaims?.papel === 'admin');
    const papelRuim = await post('/api/equipe/mudar-papel', { uid: profA.uid, papel: 'dona' }, adminA.token);
    ok('papel inexistente → 400', papelRuim.status === 400);

    const aSiMesma = await post('/api/equipe/desativar', { uid: adminA.uid }, adminA.token);
    ok('não desativa o próprio login → 409', aSiMesma.status === 409);
    const tokenDaProf = await tokenDe('prof@srv-a.invalid');
    ok('antes de desativar, o token da profissional vale', (await verificarLogin(tokenDaProf)) !== null);
    const desativa = await post('/api/equipe/desativar', { uid: profA.uid }, adminA.token);
    ok('admin desativa a profissional', desativa.status === 200 && (await zulia.auth.getUser(profA.uid)).disabled === true);
    ok('ela sai do índice', (await zulia.db.doc('clinicas/srv-a').get()).data()?.equipe?.[profA.uid] === undefined);
    ok('o token que ela já tinha deixa de valer na hora', (await verificarLogin(tokenDaProf)) === null);
    const volta = await post('/api/equipe/criar-login', { email: 'prof@srv-a.invalid' }, adminA.token);
    ok('criar o login de novo reativa o mesmo', volta.json.uid === profA.uid && (await zulia.auth.getUser(profA.uid)).disabled === false);

    // ==========================================
    console.log('\nPlano gratuito');
    const adminG = await loginDeTeste('admin@srv-g.invalid', { clinicaId: 'srv-g', papel: 'admin' });
    await zulia.db.doc('clinicas/srv-g').set({
      nome: 'Clínica srv-g',
      plano: 'gratuito',
      equipe: { [adminG.uid]: 'admin' },
      uso: { clientes: 4, procedimentos: 0 },
    });
    await zulia.db.doc('clinicas/srv-g/anamnesis_templates/tpl-g').set({ procedimentoNome: 'Limpeza', procedimentoId: 'p' });
    const loginG = await post('/api/equipe/criar-login', { email: 'prof@srv-g.invalid' }, adminG.token);
    ok('gratuito: só 1 login (o da admin) → 403', loginG.status === 403 && loginG.json.erro === 'limite-do-plano', JSON.stringify(loginG.json));
    ok('e nenhum login é criado', !(await zulia.auth.getUserByEmail('prof@srv-g.invalid').catch(() => null)));
    const fichaNova = (nome: string) =>
      post('/api/ficha-publica/salvar', { c: 'srv-g', anamnese: 'tpl-g', dadosPaciente: { nome }, dadosFicha: {} });
    const quinta = await fichaNova('Quinta Cliente');
    const usoDepois = (await zulia.db.doc('clinicas/srv-g').get()).data()?.uso;
    ok('ficha de cliente nova, com vaga: grava e conta (5)', quinta.status === 200 && usoDepois?.clientes === 5, JSON.stringify(usoDepois));
    const sexta = await fichaNova('Sexta Cliente');
    ok('no limite, a ficha de cliente nova é recusada com gentileza', sexta.status === 409 && sexta.json.erro === 'limite-de-clientes', JSON.stringify(sexta.json));
    const pacientesG = (await zulia.db.collection('clinicas/srv-g/patients').get()).docs.map((d) => d.data().nome);
    ok('e nada é gravado', pacientesG.length === 1 && pacientesG[0] === 'Quinta Cliente', JSON.stringify(pacientesG));
    const fichasG = (await zulia.db.collection('clinicas/srv-g/anamnesis_records').get()).size;
    ok('nem a ficha', fichasG === 1);
    const daQuinta = (await zulia.db.collection('clinicas/srv-g/anamnesis_records').get()).docs[0];
    const deNovoQuinta = await post('/api/ficha-publica/salvar', {
      c: 'srv-g',
      ficha: daQuinta.id,
      dadosPaciente: { nome: 'Quinta Cliente' },
      dadosFicha: { respostasGerais: { g1: 'sim' } },
    });
    ok('cliente que já existe continua preenchendo no limite', deNovoQuinta.status === 200, JSON.stringify(deNovoQuinta.json).slice(0, 120));

    // ==========================================
    console.log('\nGoogle Agenda por clínica');
    process.env.GOOGLE_AGENDA_CLIENT_ID = 'cliente-teste.apps.googleusercontent.com';
    process.env.GOOGLE_AGENDA_CLIENT_SECRET = 'GOCSPX-segredo-teste';
    const tokenA = cifrar('refresh-de-a', process.env.GOOGLE_AGENDA_CLIENT_SECRET);
    const tokenB = cifrar('refresh-de-b', process.env.GOOGLE_AGENDA_CLIENT_SECRET);
    await zulia.db.doc('clinicas/srv-a/clinic_settings/google_agenda').set({
      contas: { k1: { tokenCifrado: tokenA, calendarioId: 'cal-a', email: 'a@x', conectadoEm: agora } },
    });
    await zulia.db.doc('clinicas/srv-b/clinic_settings/google_agenda').set({
      contas: { k2: { tokenCifrado: tokenB, calendarioId: 'cal-b', email: 'b@x', conectadoEm: agora } },
    });
    const pedido = (token: string) => ({ tokenCifrado: token, calendarioId: 'cal', operacoes: [] });
    const semRecurso = await post('/api/google-agenda/sincronizar', pedido(tokenB), adminB.token);
    ok('clínica sem o recurso → 403', semRecurso.status === 403 && semRecurso.json.erro === 'recurso-indisponivel');
    const contaDeB = await post('/api/google-agenda/sincronizar', pedido(tokenB), adminA.token);
    ok('A não usa a conta de B → 403', contaDeB.status === 403 && contaDeB.json.erro === 'conta-de-outra-clinica');
    const contaDeA = await post('/api/google-agenda/sincronizar', pedido(tokenA), adminA.token);
    // Passou da clínica: o próximo passo é falar com o Google, que aqui não existe.
    ok('A com a própria conta passa da conferência da clínica', contaDeA.status !== 403 && contaDeA.status !== 401, String(contaDeA.status));
    const semClinica = await loginDeTeste('avulsa2@x.invalid', null);
    const avulso = await post('/api/google-agenda/sincronizar', pedido(tokenA), semClinica.token);
    ok('login sem clínica → 401', avulso.status === 401);

    // ==========================================
    console.log('\nPainel do dono');
    const pedirDono = async (metodo: 'GET' | 'POST', rota: string, token: string, corpo?: unknown) => {
      const r = await fetch(`${base}/api/dono/${rota}`, {
        method: metodo,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
      });
      return { status: r.status, json: (await r.json().catch(() => ({}))) as any };
    };
    const donoSemFator = await loginDeTeste('dono-sem@x.invalid', { donoDaPlataforma: true });
    const semFator = await pedirDono('GET', 'clinicas', donoSemFator.token);
    ok('dono que entrou só com a senha → 403 duas-etapas', semFator.status === 403 && semFator.json.erro === 'duas-etapas');
    const deClinica = await pedirDono('GET', 'clinicas', adminA.token);
    ok('admin de clínica → 403 so-dono', deClinica.status === 403 && deClinica.json.erro === 'so-dono');
    const tokenDoDono = await tokenComSegundoFator('dono@x.invalid');
    const lista = await pedirDono('GET', 'clinicas', tokenDoDono);
    const ids = (lista.json.clinicas || []).map((c: { id: string }) => c.id).sort();
    ok('dono com o segundo fator vê todas as clínicas', lista.status === 200 && ['srv-a', 'srv-b', 'srv-g'].every((c) => ids.includes(c)), JSON.stringify(ids));
    const srvG = (lista.json.clinicas || []).find((c: { id: string }) => c.id === 'srv-g');
    ok('com uso, logins e plano', srvG?.plano === 'gratuito' && srvG?.logins === 1 && typeof srvG?.uso?.clientes === 'number', JSON.stringify(srvG));
    ok('e nenhum dado de paciente na resposta', !JSON.stringify(lista.json).includes('Quinta Cliente') && !JSON.stringify(lista.json).includes('Paciente srv'));
    ok('com os totais', lista.json.totais?.clinicas === ids.length && lista.json.totais?.gratuito >= 1, JSON.stringify(lista.json.totais));
    const cortesiaNoGratuito = await pedirDono('POST', 'plano', tokenDoDono, { clinicaId: 'srv-g', plano: 'gratuito', cortesia: true });
    ok('cortesia só no completo → 400', cortesiaNoGratuito.status === 400);
    const paraCortesia = await pedirDono('POST', 'plano', tokenDoDono, { clinicaId: 'srv-g', plano: 'completo', cortesia: true });
    const gDepois = (await zulia.db.doc('clinicas/srv-g').get()).data();
    const clientesDeG = (await zulia.db.collection('clinicas/srv-g/patients').count().get()).data().count;
    ok('mudar o plano para cortesia', paraCortesia.status === 200 && gDepois?.plano === 'completo' && gDepois?.cortesia === true);
    ok('e o uso é recontado', gDepois?.uso?.clientes === clientesDeG, `${gDepois?.uso?.clientes} × ${clientesDeG}`);
    const naoExiste = await pedirDono('POST', 'plano', tokenDoDono, { clinicaId: 'nao-existe', plano: 'completo', cortesia: false });
    ok('clínica que não existe → 404', naoExiste.status === 404);
    const suspende = await pedirDono('POST', 'situacao', tokenDoDono, { clinicaId: 'srv-b', situacao: 'suspensa' });
    ok('suspender desliga os logins da equipe', suspende.status === 200 && (await zulia.auth.getUser(adminB.uid)).disabled === true);
    ok('e a clínica fica suspensa', (await zulia.db.doc('clinicas/srv-b').get()).data()?.situacao === 'suspensa');
    ok('o token da admin suspensa deixa de valer', (await verificarLogin(adminB.token)) === null);
    const reativa = await pedirDono('POST', 'situacao', tokenDoDono, { clinicaId: 'srv-b', situacao: 'ativa' });
    ok('reativar liga de volta', reativa.status === 200 && (await zulia.auth.getUser(adminB.uid)).disabled === false);
    ok('e a clínica volta a ativa', (await zulia.db.doc('clinicas/srv-b').get()).data()?.situacao === 'ativa');
    const pelaClinica = await pedirDono('POST', 'situacao', adminA.token, { clinicaId: 'srv-b', situacao: 'suspensa' });
    ok('admin de clínica não suspende ninguém → 403', pelaClinica.status === 403);
  } finally {
    servidor.close();
    for (const c of ['srv-a', 'srv-b', 'srv-g', CLINICA_DOS_LINKS_ANTIGOS]) await zulia.db.recursiveDelete(zulia.db.doc(`clinicas/${c}`));
    const { users } = await zulia.auth.listUsers();
    await zulia.auth.deleteUsers(users.map((u) => u.uid));
    await zulia.encerrar();
  }

  console.log(falhas === 0 ? '\nTudo certo.' : `\n${falhas} falha(s).`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * O modo legado (o site da La Vie de hoje) continua igual depois das mudanças da Zulia — num
 * navegador de verdade, contra os emuladores locais, com as regras da La Vie (`/firestore.rules`).
 *
 *   - o login da equipe entra no painel (lista `equipeUids`, como sempre);
 *   - as sementes do legado continuam as da La Vie (catálogo e perfil);
 *   - tudo fica na raiz: nenhum `clinicas/` aparece;
 *   - os links saem sem `c=` e abrem como sempre (ficha, orçamento, agendamento).
 *
 *   VITE_EMULADORES=1 npm run build          (com plataforma.json em "legado")
 *   npx -y firebase-tools@15 emulators:exec --only auth,firestore,storage \
 *     --config <pasta com firebase.json apontando para /firestore.rules e /storage.rules> \
 *     --project demo-zulia "npx tsx scripts/verificar-ponta-a-ponta-legado.ts"
 *
 * (Depois, `npm run build` de novo, sem a variável, antes de publicar qualquer coisa.)
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { abrirZulia } from './zuliaAdmin';
import { buildPublicLink } from '../src/utils/publicLinks';
import { modoPlataforma } from '../src/lib/projetoFirebase';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { chromium } = createRequire(import.meta.url)('playwright') as { chromium: any };

let falhas = 0;
const ok = (nome: string, condicao: boolean, extra = '') => {
  console.log(`${condicao ? '  ok  ' : ' FALHA'}  ${nome}${extra ? `  — ${extra}` : ''}`);
  if (!condicao) falhas++;
};

if (!process.env.FIRESTORE_EMULATOR_HOST || modoPlataforma !== 'legado') {
  console.error('Rode dentro dos emuladores, no modo legado (ver o topo do arquivo).');
  process.exit(1);
}
if (!readFileSync('dist/index.html', 'utf8').includes('La Vie Clinique')) {
  console.error('O dist/ não é do modo legado: rode VITE_EMULADORES=1 npm run build.');
  process.exit(1);
}

// O mesmo acesso de servidor aos emuladores; aqui ele só prepara e confere a raiz.
const adm = abrirZulia({ emulador: true });
const PORTA = 3918;
const SITE = `http://127.0.0.1:${PORTA}`;
const SENHA = `Legado-${crypto.randomUUID()}`;
const EMAIL = 'equipe@lavie.invalid';

const esperar = async (condicao: () => Promise<boolean>, vezes = 60) => {
  for (let i = 0; i < vezes; i++) {
    if (await condicao()) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
};

async function main() {
  const servidor: ChildProcess = spawn('node', ['server.js'], {
    env: { ...process.env, PORT: String(PORTA) },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const navegador = await chromium.launch();
  try {
    await esperar(async () => (await fetch(`${SITE}/api/ficha-publica/status`).catch(() => null))?.ok === true);

    // O projeto da La Vie como está hoje: o catálogo dela, e um login da equipe no perfil e na
    // lista das regras. (Com o catálogo vazio, a semente antiga regravaria o perfil por cima — o
    // que nunca acontece no projeto real, que tem catálogo.)
    await adm.db.doc('procedures/proc-botox').set({ title: 'Botox', category: 'Facial', price: 1000, order: 1, images: [], benefits: [] });
    const usuario = await adm.auth.createUser({ email: EMAIL, password: SENHA });
    await adm.db.doc('clinic_settings/main_profile').set({
      name: 'La Vie - Clínica de Estética Facial e Corporal',
      tagline: 'Estética',
      professionals: [{ id: 'doc-karoline', name: 'Dra. Karoline Ferreira', email: EMAIL, uid: usuario.uid, isAdmin: true, photoUrl: '/dra-karoline.jpg' }],
      equipeUids: [usuario.uid],
      phone: '',
      instagram: '',
      address: '',
      cityState: 'Indaiatuba - SP',
    });

    console.log('\nPainel');
    const pagina = await (await navegador.newContext()).newPage();
    await pagina.goto(SITE);
    ok('a tela de login é a da La Vie', (await pagina.locator('h1').first().textContent())?.trim() === 'La Vie Clinique');
    await pagina.fill('input[type=email]', EMAIL);
    await pagina.fill('input[type=password]', SENHA);
    await pagina.click('button[type=submit]');
    await pagina.waitForFunction(() => !document.querySelector('input[type=password]'), null, { timeout: 30000 });
    await esperar(async () => !(await adm.db.collection('patients').get()).empty);
    ok('as fichas padrão entram na raiz, como sempre', !(await adm.db.collection('anamnesis_templates').get()).empty);
    ok('e as pacientes de exemplo do legado também', !(await adm.db.collection('patients').get()).empty);
    const catalogo = await adm.db.collection('procedures').get();
    ok('o catálogo que existia fica como estava', catalogo.size === 1 && catalogo.docs[0].id === 'proc-botox', String(catalogo.size));
    const perfil = (await adm.db.doc('clinic_settings/main_profile').get()).data();
    ok('o perfil e a equipe ficam como estavam', perfil?.equipeUids?.[0] === usuario.uid);
    const raiz = (await adm.db.listCollections()).map((c) => c.id);
    ok('nada vai para clinicas/', !raiz.includes('clinicas'), raiz.join(','));
    await pagina.waitForTimeout(1500);
    const texto = await pagina.locator('body').innerText();
    ok('o painel abre com a La Vie', /La Vie/.test(texto));
    const status = await (await fetch(`${SITE}/api/ficha-publica/status`)).json();
    ok('o status do servidor é o de sempre (equipe sincronizada)', status.equipeSincronizada === true && status.modo === undefined, JSON.stringify(status));

    console.log('\nLinks');
    const link = buildPublicLink(null, { anamnese: 'tpl-botox' });
    ok('o link sai sem c=', !new URL(link).searchParams.has('c'), link);
    const modelo = (await adm.db.collection('anamnesis_templates').get()).docs[0];
    const anonimo = await navegador.newContext();
    const ficha = await anonimo.newPage();
    await ficha.goto(`${SITE}/?anamnese=${modelo.id}`);
    const abriu = await ficha
      .waitForFunction(() => document.body.innerText.includes('La Vie'), null, { timeout: 30000 })
      .then(() => true)
      .catch(() => false);
    ok('a ficha abre sem login, sem c=', abriu);
    const salvar = await fetch(`${SITE}/api/ficha-publica/salvar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ anamnese: modelo.id, dadosPaciente: { nome: 'Paciente Legado' }, dadosFicha: { respostasGerais: {} } }),
    });
    const salva = (await salvar.json()) as { ficha?: { id: string } };
    ok('a ficha enviada vai para a raiz', salvar.ok && !!salva.ficha && (await adm.db.doc(`anamnesis_records/${salva.ficha.id}`).get()).exists);

    await adm.db.doc('appointment_links/ag-legado').set({
      situacao: 'ativo',
      data: '2030-01-10',
      hora: '10:00',
      procedimento: { titulo: 'Botox' },
      clinica: { name: 'La Vie Clinique' },
      pacientePrimeiroNome: 'Paciente',
      respostaPendente: false,
    });
    const ag = await anonimo.newPage();
    await ag.goto(`${SITE}/?agendamento=ag-legado`);
    const confirmar = ag.getByRole('button', { name: /confirm/i }).first();
    await confirmar.waitFor({ timeout: 30000 }).catch(() => {});
    if (await confirmar.isVisible().catch(() => false)) await confirmar.click();
    const respondeu = await esperar(async () => (await adm.db.doc('appointment_links/ag-legado').get()).data()?.respostaPendente === true);
    ok('o agendamento é confirmado sem login, sem c=', respondeu);
  } finally {
    await navegador.close();
    servidor.kill();
    await adm.encerrar();
  }
  console.log(falhas === 0 ? '\nTudo certo.' : `\n${falhas} falha(s).`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * O painel do dono da plataforma, num navegador de verdade, contra os emuladores locais:
 *
 *   1. o dono entra e vê as clínicas, com plano, uso e totais — e nenhum dado de paciente;
 *   2. dá cortesia a uma clínica pela tela (com confirmação);
 *   3. suspende outra: a admin dela deixa de entrar; reativa: ela volta.
 *
 * Nos emuladores não há aplicativo autenticador: o painel e o servidor pulam a exigência do
 * segundo fator (a trava do servidor é testada em verificar-servidor-zulia, com um segundo fator
 * por SMS). O cadastro do autenticador é testado no projeto de testes.
 *
 *   VITE_PLATAFORMA=zulia VITE_EMULADORES=1 npm run build
 *   PLATAFORMA=zulia npx -y firebase-tools@15 emulators:exec --only auth,firestore,storage \
 *     --config zulia/firebase.json --project demo-zulia "npx tsx scripts/verificar-dono-zulia.ts"
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { abrirZulia } from './zuliaAdmin';
import { criarClinica } from '../server/clinicasNovas';
import { criarDono } from './criar-dono';
import { MARCA_DA_PLATAFORMA } from '../src/utils/marca';
import { VERSAO_DOS_DOCUMENTOS } from '../src/utils/documentosLegais';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { chromium } = require('playwright') as { chromium: any };

let falhas = 0;
const ok = (nome: string, condicao: boolean, extra = '') => {
  console.log(`${condicao ? '  ok  ' : ' FALHA'}  ${nome}${extra ? `  — ${extra}` : ''}`);
  if (!condicao) falhas++;
};

if (!process.env.FIRESTORE_EMULATOR_HOST || process.env.PLATAFORMA !== 'zulia') {
  console.error('Rode dentro dos emuladores, com PLATAFORMA=zulia (ver o topo do arquivo).');
  process.exit(1);
}
if (!readFileSync('dist/index.html', 'utf8').includes(`<title>${MARCA_DA_PLATAFORMA}</title>`)) {
  console.error('O dist/ não é do modo Zulia: rode VITE_PLATAFORMA=zulia VITE_EMULADORES=1 npm run build.');
  process.exit(1);
}

const zulia = abrirZulia({ emulador: true });
const PORTA = 3927;
const SITE = `http://127.0.0.1:${PORTA}`;
const SENHA = `Dono-${crypto.randomUUID()}`;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const apareceu = (alvo: any, ms = 20000): Promise<boolean> => alvo.waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false);

const esperarServidor = async () => {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${SITE}/api/ficha-publica/status`)).ok) return;
    } catch {
      // ainda subindo
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('o servidor não subiu');
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const entrar = async (pagina: any, email: string) => {
  await pagina.goto(SITE);
  await pagina.fill('input[type=email]', email);
  await pagina.fill('input[type=password]', SENHA);
  await pagina.click('button[type=submit]');
};

async function main() {
  const servidor: ChildProcess = spawn('node', ['server.js'], {
    env: { ...process.env, PORT: String(PORTA), PLATAFORMA: 'zulia' },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const navegador = await chromium.launch();
  try {
    await esperarServidor();
    const aceite = { versao: VERSAO_DOS_DOCUMENTOS, em: new Date().toISOString(), uid: 'teste', email: null, ip: null };
    const alfa = await criarClinica(zulia, { nome: 'Clínica Alfa', email: 'dona@alfa.invalid', admin: 'Ana Alfa', aceite });
    const beta = await criarClinica(zulia, { nome: 'Clínica Beta', email: 'dona@beta.invalid', admin: 'Bia Beta', aceite });
    await zulia.auth.updateUser(alfa.uid, { password: SENHA });
    await zulia.db.doc(`clinicas/${alfa.id}/patients/p-secreta`).set({ nome: 'Paciente Secreta', cpf: '12345678900' });
    await zulia.db.doc(`clinicas/${alfa.id}`).update({ 'uso.clientes': 1 });
    const dono = await criarDono(zulia, 'dono@painel.invalid');
    await zulia.auth.updateUser(dono.uid, { password: SENHA });

    // ==========================================
    console.log('\n1. O dono entra e vê as clínicas');
    const pagina = await (await navegador.newContext({ viewport: { width: 1200, height: 900 } })).newPage();
    const errosDoConsole: string[] = [];
    pagina.on('console', (m: any) => m.type() === 'error' && errosDoConsole.push(m.text()));
    await entrar(pagina, 'dono@painel.invalid');
    ok('abre o painel do dono', await apareceu(pagina.getByRole('heading', { name: 'Clínicas' }), 30000));
    const cartaoAlfa = pagina.locator(`[data-clinica="${alfa.id}"]`);
    const cartaoBeta = pagina.locator(`[data-clinica="${beta.id}"]`);
    ok('com as duas clínicas', (await apareceu(cartaoAlfa)) && (await apareceu(cartaoBeta)));
    const texto = await pagina.locator('body').innerText();
    ok('com o uso no gratuito (clientes 1/5)', /Clientes\s*1\s*\/\s*5/.test(await cartaoAlfa.innerText()), (await cartaoAlfa.innerText()).replace(/\s+/g, ' ').slice(0, 160));
    ok('com os totais', texto.includes('Clínicas') && texto.includes('Gratuito'));
    ok('e nenhum dado de paciente', !texto.includes('Paciente Secreta') && !texto.includes('12345678900'));
    await pagina.screenshot({ path: `${process.env.PASTA_DAS_IMAGENS || '.'}/painel-do-dono.png`, fullPage: true });

    // ==========================================
    console.log('\n2. Cortesia para a Beta');
    await cartaoBeta.locator('select').selectOption('cortesia');
    await pagina.getByRole('button', { name: 'Mudar o plano' }).click();
    let dadosBeta: Record<string, any> | undefined;
    for (let i = 0; i < 40; i++) {
      dadosBeta = (await zulia.db.doc(`clinicas/${beta.id}`).get()).data();
      if (dadosBeta?.cortesia) break;
      await pagina.waitForTimeout(250);
    }
    ok('a Beta fica no completo, como cortesia', dadosBeta?.plano === 'completo' && dadosBeta?.cortesia === true);
    ok('e o cartão mostra', await apareceu(cartaoBeta.getByText('Completo — cortesia').first()));

    // ==========================================
    console.log('\n3. Suspender e reativar a Alfa');
    await cartaoAlfa.getByRole('button', { name: 'Suspender' }).click();
    await pagina.getByRole('button', { name: 'Suspender' }).last().click();
    ok('a Alfa aparece suspensa', await apareceu(cartaoAlfa.getByText('Suspensa', { exact: true })));
    ok('o login da admin da Alfa fica desligado', (await zulia.auth.getUser(alfa.uid)).disabled === true);
    const daAlfa = await (await navegador.newContext()).newPage();
    await entrar(daAlfa, 'dona@alfa.invalid');
    await daAlfa.waitForTimeout(2500);
    ok('e a admin da Alfa não entra', (await daAlfa.locator('input[type=password]').count()) === 1);
    await cartaoAlfa.getByRole('button', { name: 'Reativar' }).click();
    await pagina.getByRole('button', { name: 'Reativar' }).last().click();
    ok('reativada', await apareceu(cartaoAlfa.getByRole('button', { name: 'Suspender' })));
    ok('o login da admin volta', (await zulia.auth.getUser(alfa.uid)).disabled === false);
    await entrar(daAlfa, 'dona@alfa.invalid');
    ok('e ela entra de novo', await daAlfa.waitForFunction(() => !document.querySelector('input[type=password]'), null, { timeout: 30000 }).then(() => true, () => false));
    ok('sem erro de permissão no console do dono', !errosDoConsole.some((e) => /permission|insufficient/i.test(e)), errosDoConsole.slice(0, 2).join(' | '));
  } finally {
    await navegador.close();
    servidor.kill();
    await zulia.encerrar();
  }
  console.log(falhas === 0 ? '\nTudo certo.' : `\n${falhas} falha(s).`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

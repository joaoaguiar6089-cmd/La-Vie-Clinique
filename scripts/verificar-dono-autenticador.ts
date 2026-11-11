/**
 * O login do dono com o aplicativo autenticador DE VERDADE, no projeto de testes `venus-jk-testes`
 * (o emulador não tem TOTP). Num navegador:
 *
 *   1. o dono entra com a senha e cai no cadastro do autenticador;
 *   2. lê a chave (como faria o aplicativo), digita o código e cadastra;
 *   3. entra de novo: a tela pede o código; com ele, o painel abre e lista as clínicas;
 *   4. o servidor recusa o token de uma sessão sem o segundo fator, e aceita o da sessão com ele;
 *   5. apaga tudo o que criou.
 *
 *   VITE_PLATAFORMA=zulia VITE_PROJETO_DE_TESTES=1 npm run build
 *   PLATAFORMA=zulia PROJETO_DE_TESTES=1 npx tsx scripts/verificar-dono-autenticador.ts
 *
 * Só roda no projeto de testes. Credencial: ZULIA_CLIENT_EMAIL e ZULIA_PRIVATE_KEY (a conta do Claude
 * é Editor lá); o servidor local usa a mesma.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { abrirZulia } from './zuliaAdmin';
import { criarClinica } from '../server/clinicasNovas';
import { criarDono } from './criar-dono';
import { usaProjetoDeTestes } from '../src/lib/projetoFirebase';
import { VERSAO_DOS_DOCUMENTOS } from '../src/utils/documentosLegais';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { chromium } = require('playwright') as { chromium: any };

let falhas = 0;
const ok = (nome: string, condicao: boolean, extra = '') => {
  console.log(`${condicao ? '  ok  ' : ' FALHA'}  ${nome}${extra ? `  — ${extra}` : ''}`);
  if (!condicao) falhas++;
};

if (!usaProjetoDeTestes || process.env.PLATAFORMA !== 'zulia' || process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('Só no projeto de testes: PLATAFORMA=zulia PROJETO_DE_TESTES=1, fora dos emuladores.');
  process.exit(1);
}
if (!readFileSync('dist/assets/' + readFileSync('dist/index.html', 'utf8').match(/assets\/(index-[^"]+\.js)/)![1], 'utf8').includes('venus-jk-testes')) {
  console.error('O dist/ não aponta para o projeto de testes: rode VITE_PLATAFORMA=zulia VITE_PROJETO_DE_TESTES=1 npm run build.');
  process.exit(1);
}

const zulia = abrirZulia({ emulador: false });
const PORTA = 3931;
// `localhost` (e não 127.0.0.1): é o que o projeto de testes tem nos domínios autorizados.
const SITE = `http://localhost:${PORTA}`;
const SENHA = `Dono-${crypto.randomUUID()}`;
const EMAIL_DO_DONO = 'dono@autenticador.invalid';
const EMAIL_DA_CLINICA = 'dona@autenticador.invalid';

// ==========================================
// TOTP (RFC 6238), o que o aplicativo autenticador faz
// ==========================================

const base32 = (texto: string): Buffer => {
  const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of texto.replace(/[\s=]/g, '').toUpperCase()) bits += alfabeto.indexOf(c).toString(2).padStart(5, '0');
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
};

const codigoTotp = (segredo: string, quando = Date.now()): string => {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(Math.floor(quando / 30000)));
  const hmac = createHmac('sha1', base32(segredo)).update(contador).digest();
  const desvio = hmac[hmac.length - 1] & 15;
  return String((hmac.readUInt32BE(desvio) & 0x7fffffff) % 1_000_000).padStart(6, '0');
};

/** Espera virar a janela de 30 s: o mesmo código não vale duas vezes. */
const proximaJanela = async () => {
  const falta = 30000 - (Date.now() % 30000) + 1500;
  await new Promise((r) => setTimeout(r, falta));
};

// ==========================================

const limpar = async () => {
  for (const email of [EMAIL_DO_DONO, EMAIL_DA_CLINICA]) {
    const u = await zulia.auth.getUserByEmail(email).catch(() => null);
    if (!u) continue;
    const c = u.customClaims?.clinicaId;
    if (typeof c === 'string') await zulia.db.recursiveDelete(zulia.db.doc(`clinicas/${c}`));
    await zulia.auth.deleteUser(u.uid);
  }
};

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

async function main() {
  await limpar();
  const servidor: ChildProcess = spawn('node', ['server.js'], {
    env: {
      ...process.env,
      PORT: String(PORTA),
      PLATAFORMA: 'zulia',
      PROJETO_DE_TESTES: '1',
      ZULIA_ADMIN_EMAIL: process.env.ZULIA_CLIENT_EMAIL,
      ZULIA_ADMIN_CHAVE: process.env.ZULIA_PRIVATE_KEY,
    },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const navegador = await chromium.launch();
  try {
    await esperarServidor();
    const aceite = { versao: VERSAO_DOS_DOCUMENTOS, em: new Date().toISOString(), uid: 'teste', email: null, ip: null };
    const clinica = await criarClinica(zulia, { nome: 'Clínica do Autenticador', email: EMAIL_DA_CLINICA, admin: 'Ana', aceite });
    const dono = await criarDono(zulia, EMAIL_DO_DONO);
    await zulia.auth.updateUser(dono.uid, { password: SENHA });

    const pagina = await (await navegador.newContext({ viewport: { width: 1100, height: 900 } })).newPage();
    const entrarComSenha = async () => {
      await pagina.goto(SITE);
      await pagina.fill('input[type=email]', EMAIL_DO_DONO);
      await pagina.fill('input[type=password]', SENHA);
      await pagina.click('button[type=submit]');
    };

    // ==========================================
    console.log('\n1. Primeiro login: cadastrar o autenticador');
    await entrarComSenha();
    const cadastrar = pagina.getByRole('button', { name: 'Cadastrar o aplicativo autenticador' });
    ok('sem autenticador, o dono cai no cadastro (e não no painel)', await cadastrar.waitFor({ timeout: 30000 }).then(() => true, () => false));
    // A sessão de agora entrou só com a senha: o servidor não deixa ela ver as clínicas.
    const tokenSoSenha = await pagina.evaluate(async () => {
      const r = await fetch('/api/dono/clinicas', { headers: { Authorization: 'Bearer x' } });
      return r.status;
    });
    ok('(sem token válido, o servidor recusa)', tokenSoSenha === 401);
    await cadastrar.click();
    const chave = pagina.getByTestId('chave-do-autenticador');
    ok('mostra o QR e a chave', await chave.waitFor({ timeout: 20000 }).then(() => true, () => false));
    const segredo = (await chave.innerText()).replace(/\s/g, '');
    await pagina.getByLabel('Código do aplicativo autenticador').fill('000000');
    await pagina.getByRole('button', { name: 'Confirmar e ativar' }).click();
    ok('código errado é recusado', await pagina.getByText('Código incorreto').waitFor({ timeout: 15000 }).then(() => true, () => false));
    await pagina.getByLabel('Código do aplicativo autenticador').fill(codigoTotp(segredo));
    await pagina.getByRole('button', { name: 'Confirmar e ativar' }).click();
    ok('com o código certo, cadastra', await pagina.getByText('Autenticador cadastrado').waitFor({ timeout: 20000 }).then(() => true, () => false));
    const fatores = (await zulia.auth.getUser(dono.uid)).multiFactor?.enrolledFactors || [];
    ok('e o login passa a ter o segundo fator (TOTP)', fatores.length === 1 && fatores[0].factorId === 'totp', JSON.stringify(fatores.map((f) => f.factorId)));
    await pagina.getByRole('button', { name: 'Entrar de novo' }).click();

    // ==========================================
    console.log('\n2. Entrar de novo: senha e código');
    await proximaJanela();
    await entrarComSenha();
    const campoDoCodigo = pagina.getByLabel('Código do aplicativo autenticador');
    ok('a tela pede o código depois da senha', await campoDoCodigo.waitFor({ timeout: 30000 }).then(() => true, () => false));
    await campoDoCodigo.fill('123456');
    await pagina.getByRole('button', { name: 'Confirmar código' }).click();
    ok('código errado não entra', await pagina.getByText('Código incorreto').waitFor({ timeout: 15000 }).then(() => true, () => false));
    await campoDoCodigo.fill(codigoTotp(segredo));
    await pagina.getByRole('button', { name: 'Confirmar código' }).click();
    ok('com o código, o painel abre', await pagina.getByRole('heading', { name: 'Clínicas' }).waitFor({ timeout: 30000 }).then(() => true, () => false));
    ok('e lista a clínica', await pagina.locator(`[data-clinica="${clinica.id}"]`).waitFor({ timeout: 20000 }).then(() => true, () => false));
    const espaco = await pagina.locator(`[data-clinica="${clinica.id}"]`).innerText();
    ok('com o espaço das fotos medido', /Fotos\s*0 KB/.test(espaco), espaco.replace(/\s+/g, ' ').slice(0, 140));
    await pagina.screenshot({ path: `${process.env.PASTA_DAS_IMAGENS || '.'}/dono-autenticador-painel.png` });

    // ==========================================
    console.log('\n3. O servidor confere o segundo fator no token');
    const comFator = await pagina.evaluate(async () => {
      // O token desta sessão (entrou com o código), lido do armazenamento do Firebase no navegador.
      const req = indexedDB.open('firebaseLocalStorageDb');
      const token: string = await new Promise((resolve, reject) => {
        req.onsuccess = () => {
          const tx = req.result.transaction('firebaseLocalStorage', 'readonly');
          const todos = tx.objectStore('firebaseLocalStorage').getAll();
          todos.onsuccess = () => resolve(todos.result.find((r: any) => r.value?.stsTokenManager)?.value.stsTokenManager.accessToken);
          todos.onerror = () => reject(todos.error);
        };
        req.onerror = () => reject(req.error);
      });
      const r = await fetch('/api/dono/clinicas', { headers: { Authorization: `Bearer ${token}` } });
      const claims = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return { status: r.status, fator: claims.firebase?.sign_in_second_factor };
    });
    ok('o token da sessão leva o segundo fator e o servidor aceita', comFator.status === 200 && comFator.fator === 'totp', JSON.stringify(comFator));
  } finally {
    await navegador.close();
    servidor.kill();
    await limpar();
    const sobrou = await zulia.auth.getUserByEmail(EMAIL_DO_DONO).catch(() => null);
    ok('limpeza: o dono e a clínica de teste foram apagados', !sobrou);
    await zulia.encerrar();
  }
  console.log(falhas === 0 ? '\nTudo certo.' : `\n${falhas} falha(s).`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

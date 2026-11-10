/**
 * O cadastro sozinho de clínica (etapa 3), num navegador de verdade, contra os emuladores locais:
 *
 *   1. a tela de login oferece "Criar conta da clínica" (e `?cadastro` abre direto o formulário);
 *   2. a pessoa cria a conta e cai na tela "Confirme seu e-mail";
 *   3. antes de confirmar, o servidor recusa criar a clínica;
 *   4. confirmado o e-mail (pelo link que o emulador guarda), ela cria a clínica e o painel abre,
 *      com as sementes, no plano gratuito, e com ela de admin;
 *   5. o servidor recusa: segunda clínica para o mesmo login, o dono da plataforma, nome inválido,
 *      sem aceite dos documentos, sem login; e o mesmo e-mail não cria segunda conta;
 *   6. os documentos legais abrem como páginas, e o aceite fica gravado na clínica;
 *   7. a admin de uma clínica sem aceite (de antes dos documentos) vê o pedido e aceita.
 *
 *   VITE_PLATAFORMA=zulia VITE_EMULADORES=1 npm run build
 *   PLATAFORMA=zulia npx -y firebase-tools@15 emulators:exec --only auth,firestore,storage \
 *     --config zulia/firebase.json --project demo-zulia "npx tsx scripts/verificar-cadastro-zulia.ts"
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { abrirZulia, EMULADORES } from './zuliaAdmin';
import { MARCA_DA_PLATAFORMA } from '../src/utils/marca';
import { VERSAO_DOS_DOCUMENTOS } from '../src/utils/documentosLegais';
import { criarClinica } from '../server/clinicasNovas';

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
const PORTA = 3918;
const SITE = `http://127.0.0.1:${PORTA}`;
const AUTH = `http://${EMULADORES.auth}`;
const EMAIL = 'gama@cadastro.invalid';
const SENHA = `Cad-${crypto.randomUUID()}`;

/** Entra pelo emulador do Authentication e devolve o token, como o painel faria. */
const tokenDe = async (email: string, senha: string): Promise<string> => {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=chave-do-emulador`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: senha, returnSecureToken: true }),
  });
  return ((await r.json()) as { idToken: string }).idToken;
};

/** Espera o elemento aparecer (o do Playwright que só olha não espera). */
const apareceu = (alvo: any, ms = 20000): Promise<boolean> =>
  alvo.waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false);

const pedirClinica = async (token: string | null, corpo: unknown) => {
  const r = await fetch(`${SITE}/api/cadastro/clinica`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(corpo),
  });
  return { status: r.status, json: (await r.json().catch(() => ({}))) as { erro?: string; clinicaId?: string } };
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
  const servidor: ChildProcess = spawn('node', ['server.js'], {
    env: { ...process.env, PORT: String(PORTA), PLATAFORMA: 'zulia' },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const navegador = await chromium.launch();
  try {
    await esperarServidor();

    // ==========================================
    console.log('\n1. A tela de login oferece o cadastro');
    const contexto = await navegador.newContext();
    const pagina = await contexto.newPage();
    const errosDoConsole: string[] = [];
    pagina.on('console', (m: any) => m.type() === 'error' && errosDoConsole.push(m.text()));
    await pagina.goto(SITE);
    const link = pagina.getByRole('button', { name: 'Criar conta da clínica' });
    ok('o link "Criar conta da clínica" aparece', await apareceu(link));
    const direto = await (await navegador.newContext()).newPage();
    await direto.goto(`${SITE}/?cadastro`);
    ok('?cadastro abre direto o formulário', await apareceu(direto.getByText('Nome da clínica').first()));

    // ==========================================
    console.log('\n2. Criar a conta');
    await link.click();
    await pagina.getByLabel('Nome da clínica', { exact: true }).fill('Clínica Gama');
    await pagina.getByLabel('Seu nome').fill('Gabi Gama');
    await pagina.getByLabel('E-mail').fill(EMAIL);
    await pagina.getByLabel('Senha').fill(SENHA);
    await pagina.getByRole('button', { name: 'Criar conta' }).click();
    ok('sem marcar o aceite, a conta não é criada', await apareceu(pagina.getByText('marque que você aceita')));
    ok('e nenhum login nasce', !(await zulia.auth.getUserByEmail(EMAIL).catch(() => null)));
    // Ler os Termos abre o texto por cima do formulário, sem marcar a caixa.
    await pagina.getByRole('link', { name: 'Termos de Uso' }).first().click();
    const leitor = pagina.getByRole('dialog', { name: 'Termos de Uso', exact: true });
    ok('o link dos Termos abre o texto dentro da tela', await apareceu(leitor.getByRole('heading', { name: 'Termos de Uso da Venus JK' })));
    await leitor.getByRole('button', { name: 'Voltar' }).click();
    ok('e ler não marca o aceite', !(await pagina.getByRole('checkbox').isChecked()));
    await pagina.getByRole('checkbox').check();
    await pagina.getByRole('button', { name: 'Criar conta' }).click();
    const confirmar = pagina.getByRole('heading', { name: 'Confirme seu e-mail' });
    ok('cai na tela "Confirme seu e-mail"', await apareceu(confirmar));
    // O nome entra logo depois do login nascer: espera um pouco por ele.
    let login = await zulia.auth.getUserByEmail(EMAIL).catch(() => null);
    for (let i = 0; i < 20 && login && !login.displayName; i++) {
      await pagina.waitForTimeout(250);
      login = await zulia.auth.getUserByEmail(EMAIL).catch(() => null);
    }
    ok('o login existe, sem clínica e sem e-mail confirmado', !!login && !login.customClaims?.clinicaId && !login.emailVerified);
    ok('com o nome dela', login?.displayName === 'Gabi Gama', String(login?.displayName));

    // ==========================================
    console.log('\n3. Antes de confirmar, o servidor recusa');
    const antes = await pedirClinica(await tokenDe(EMAIL, SENHA), { nome: 'Clínica Gama' });
    ok('sem e-mail confirmado: 403', antes.status === 403 && antes.json.erro === 'email-nao-confirmado', JSON.stringify(antes));
    await pagina.getByRole('button', { name: 'Já confirmei' }).click();
    ok('"Já confirmei" sem confirmar avisa', await apareceu(pagina.getByText('ainda não aparece como confirmado')));

    // ==========================================
    console.log('\n4. Confirmar o e-mail e criar a clínica');
    const codigos = (await (await fetch(`${AUTH}/emulator/v1/projects/${zulia.config.projectId}/oobCodes`)).json()) as {
      oobCodes: Array<{ email: string; requestType: string; oobLink: string }>;
    };
    const verificar = codigos.oobCodes.filter((c) => c.email === EMAIL && c.requestType === 'VERIFY_EMAIL');
    ok('o e-mail de confirmação foi enviado', verificar.length > 0, String(verificar.length));
    await fetch(verificar[verificar.length - 1].oobLink);
    await pagina.getByRole('button', { name: 'Já confirmei' }).click();
    const crie = pagina.getByRole('heading', { name: 'Crie sua clínica' });
    ok('cai na tela "Crie sua clínica"', await apareceu(crie));
    ok('com o nome da clínica já preenchido', (await pagina.getByLabel('Nome da clínica', { exact: true }).inputValue()) === 'Clínica Gama');
    ok('e o aceite já marcado (foi marcado no formulário)', await pagina.getByRole('checkbox').isChecked());
    await pagina.getByRole('button', { name: 'Criar minha clínica' }).click();
    await pagina
      .waitForFunction(() => !document.body.innerText.includes('Crie sua clínica'), null, { timeout: 30000 })
      .catch(() => {});
    const depois = await zulia.auth.getUser(login!.uid);
    const clinicaId = String(depois.customClaims?.clinicaId || '');
    ok('o login virou admin de uma clínica nova', /^[A-Za-z0-9]{6}$/.test(clinicaId) && depois.customClaims?.papel === 'admin', JSON.stringify(depois.customClaims));
    const clinica = (await zulia.db.doc(`clinicas/${clinicaId}`).get()).data();
    ok(
      'a clínica nasce no plano gratuito, sem cortesia, sem Google Agenda',
      clinica?.plano === 'gratuito' && clinica?.cortesia === false && clinica?.recursos?.googleAgenda === false
    );
    ok('com ela de dona e na equipe', clinica?.dona?.uid === login!.uid && clinica?.equipe?.[login!.uid] === 'admin');
    ok('marcada como criada pelo cadastro', clinica?.criadaPor === 'cadastro' && clinica?.nome === 'Clínica Gama');
    const aceite = clinica?.aceites?.termos;
    ok(
      'o aceite dos documentos fica gravado (versão, data, login, IP)',
      aceite?.versao === VERSAO_DOS_DOCUMENTOS && aceite?.uid === login!.uid && aceite?.email === EMAIL && !!aceite?.em && !!aceite?.ip,
      JSON.stringify({ ...aceite, ip: aceite?.ip ? '(tem)' : null })
    );
    const procedimentos = async () => (await zulia.db.collection(`clinicas/${clinicaId}/procedures`).get()).docs;
    for (let i = 0; i < 60 && (await procedimentos()).length < 2; i++) await pagina.waitForTimeout(500);
    ok('as sementes entraram (os 2 procedimentos de exemplo)', (await procedimentos()).length === 2);
    await pagina.waitForFunction(() => document.body.innerText.includes('Clínica Gama'), null, { timeout: 20000 }).catch(() => {});
    const texto = await pagina.locator('body').innerText();
    ok('o painel abre com o nome da clínica', texto.includes('Clínica Gama') && !texto.includes('Crie sua clínica'));
    ok(
      'nenhum erro de permissão no console',
      !errosDoConsole.some((e) => /permission|insufficient/i.test(e)),
      errosDoConsole.filter((e) => /permission|insufficient/i.test(e)).slice(0, 2).join(' | ')
    );
    await pagina.screenshot({ path: `${process.env.PASTA_DAS_IMAGENS || '.'}/cadastro-painel.png` });

    // ==========================================
    console.log('\n4b. Os limites do plano gratuito no painel');
    const usoDaGama = async () => (await zulia.db.doc(`clinicas/${clinicaId}`).get()).data()?.uso || {};
    for (let i = 0; i < 20 && (await usoDaGama()).procedimentos !== 2; i++) await pagina.waitForTimeout(250);
    ok('os 2 procedimentos de exemplo contam no uso', (await usoDaGama()).procedimentos === 2, JSON.stringify(await usoDaGama()));
    const cadastrarPeloPainel = async (nome: string) => {
      // Do começo do painel: depois de cadastrar, ele abre a ficha da cliente, sem o botão de nova.
      await pagina.goto(SITE);
      await pagina.getByRole('button', { name: 'Pacientes' }).first().waitFor({ timeout: 30000 });
      await pagina.getByRole('button', { name: 'Pacientes' }).first().click();
      await pagina.getByRole('button', { name: /^Nova( paciente)?$/ }).first().click();
      await pagina.locator('form input').first().fill(nome);
      await pagina.getByRole('button', { name: 'Cadastrar paciente' }).click();
    };
    await cadastrarPeloPainel('Cliente Um');
    for (let i = 0; i < 40 && (await usoDaGama()).clientes !== 1; i++) await pagina.waitForTimeout(250);
    ok('a cliente cadastrada pelo painel conta no uso', (await usoDaGama()).clientes === 1, JSON.stringify(await usoDaGama()));
    // Simula a clínica cheia (5 de 5) e tenta mais uma pela tela.
    await zulia.db.doc(`clinicas/${clinicaId}`).update({ 'uso.clientes': 5 });
    await cadastrarPeloPainel('Cliente Seis');
    ok('no limite, a tela explica o plano gratuito', await apareceu(pagina.getByText('O plano gratuito permite até 5 clientes')));
    const nomes = (await zulia.db.collection(`clinicas/${clinicaId}/patients`).get()).docs.map((d) => d.data().nome);
    ok('e a cliente além do limite não é gravada', !nomes.includes('Cliente Seis'), JSON.stringify(nomes));
    await pagina.keyboard.press('Escape');
    await zulia.db.doc(`clinicas/${clinicaId}`).update({ 'uso.clientes': 1 });

    // A seção "Plano" das Configurações, para a admin.
    await pagina.goto(SITE);
    await pagina.getByRole('button', { name: /configura/i }).first().waitFor({ timeout: 30000 });
    await pagina.getByRole('button', { name: /configura/i }).first().click();
    const secaoDoPlano = pagina.locator('#cfg-plano');
    ok('as Configurações mostram o plano gratuito', await apareceu(secaoDoPlano.getByText('Gratuito', { exact: true }).first()));
    // O painel mostra primeiro o que guardou no aparelho e logo depois o que vem do servidor.
    ok(
      'com o uso contra os limites',
      (await apareceu(secaoDoPlano.getByText('1 de 5'))) &&
        (await secaoDoPlano.getByText('2 de 2').count()) === 1 &&
        (await secaoDoPlano.getByText('1 de 1').count()) === 1
    );
    const assinar = await secaoDoPlano.getByRole('link', { name: 'Quero assinar o plano completo' }).getAttribute('href');
    ok('e o caminho para assinar (e-mail pronto, até a cobrança pela InfinitePay)', !!assinar?.startsWith('mailto:') && assinar.includes('Cl%C3%ADnica%20Gama'));
    await secaoDoPlano.scrollIntoViewIfNeeded();
    await pagina.screenshot({ path: `${process.env.PASTA_DAS_IMAGENS || '.'}/meu-plano-gratuito.png` });

    // ==========================================
    console.log('\n5. O que o servidor recusa');
    const tokenAdmin = await tokenDe(EMAIL, SENHA);
    const segunda = await pedirClinica(tokenAdmin, { nome: 'Outra Gama' });
    ok('segunda clínica para o mesmo login: 409', segunda.status === 409 && segunda.json.erro === 'ja-tem-clinica', JSON.stringify(segunda));
    const semLogin = await pedirClinica(null, { nome: 'Clínica X' });
    ok('sem login: 401', semLogin.status === 401);

    const senhaExtra = `Ext-${crypto.randomUUID()}`;
    const dono = await zulia.auth.createUser({ email: 'dono@cadastro.invalid', password: senhaExtra, emailVerified: true });
    await zulia.auth.setCustomUserClaims(dono.uid, { donoDaPlataforma: true });
    const doDono = await pedirClinica(await tokenDe('dono@cadastro.invalid', senhaExtra), { nome: 'Clínica do Dono' });
    ok('o dono da plataforma: 403', doDono.status === 403 && doDono.json.erro === 'dono', JSON.stringify(doDono));

    await zulia.auth.createUser({ email: 'delta@cadastro.invalid', password: senhaExtra, emailVerified: true });
    const tokenDelta = await tokenDe('delta@cadastro.invalid', senhaExtra);
    const nomeRuim = await pedirClinica(tokenDelta, { nome: ' x ' });
    ok('nome curto demais: 400', nomeRuim.status === 400 && nomeRuim.json.erro === 'nome-invalido', JSON.stringify(nomeRuim));
    const semAceite = await pedirClinica(tokenDelta, { nome: 'Clínica Delta' });
    ok('sem aceite dos documentos: 400', semAceite.status === 400 && semAceite.json.erro === 'aceite-pendente', JSON.stringify(semAceite));
    const aceiteVelho = await pedirClinica(tokenDelta, { nome: 'Clínica Delta', aceite: '0.1' });
    ok('aceite de outra versão: 400', aceiteVelho.status === 400 && aceiteVelho.json.erro === 'aceite-pendente');
    const delta = await pedirClinica(tokenDelta, { nome: '  Clínica   Delta  ', aceite: VERSAO_DOS_DOCUMENTOS });
    ok('nome com espaços sobrando é limpo', delta.status === 200 && (await zulia.db.doc(`clinicas/${delta.json.clinicaId}`).get()).data()?.nome === 'Clínica Delta', JSON.stringify(delta));

    const outra = await (await navegador.newContext()).newPage();
    await outra.goto(`${SITE}/?cadastro`);
    await outra.getByLabel('Nome da clínica', { exact: true }).fill('Clínica Repetida');
    await outra.getByLabel('Seu nome').fill('Alguém');
    await outra.getByLabel('E-mail').fill(EMAIL);
    await outra.getByLabel('Senha').fill(SENHA);
    await outra.getByRole('checkbox').check();
    await outra.getByRole('button', { name: 'Criar conta' }).click();
    ok('o mesmo e-mail não cria segunda conta', await apareceu(outra.getByText('Este e-mail já tem login')));

    // ==========================================
    console.log('\n6. Os documentos como páginas');
    const paginas: Array<[string, string]> = [
      ['/termos', 'Termos de Uso da Venus JK'],
      ['/politica-de-privacidade', 'Política de Privacidade da Venus JK'],
      ['/tratamento-de-dados', 'Acordo de Tratamento de Dados'],
      [`/privacidade?c=${clinicaId}`, 'Aviso de Privacidade'],
    ];
    for (const [caminho, titulo] of paginas) {
      const r = await fetch(`${SITE}${caminho}`);
      const html = await r.text();
      ok(`${caminho} abre`, r.status === 200 && html.includes(`<title>${titulo}</title>`) && !html.includes('{{') && !html.includes('**'), String(r.status));
    }
    const aviso = await (await fetch(`${SITE}/privacidade?c=${clinicaId}`)).text();
    ok('o aviso da clínica leva o nome dela e a Venus JK como operadora', aviso.includes('Clínica Gama') && aviso.includes('operadora'));
    await pagina.goto(SITE);
    const login2 = await (await navegador.newContext()).newPage();
    await login2.goto(SITE);
    ok('a tela de login tem os links dos Termos e da Política', await apareceu(login2.getByRole('link', { name: 'Termos de Uso' })) && (await login2.getByRole('link', { name: 'Política de Privacidade' }).count()) === 1);

    // ==========================================
    console.log('\n7. Clínica de antes dos documentos: a admin aceita no painel');
    const antiga = await criarClinica(zulia, { nome: 'Clínica Antiga', email: 'antiga@cadastro.invalid', admin: 'Ana Antiga' });
    await zulia.auth.updateUser(antiga.uid, { password: senhaExtra, emailVerified: true });
    const painelAntiga = await (await navegador.newContext()).newPage();
    await painelAntiga.goto(SITE);
    await painelAntiga.fill('input[type=email]', 'antiga@cadastro.invalid');
    await painelAntiga.fill('input[type=password]', senhaExtra);
    await painelAntiga.click('button[type=submit]');
    const pedido = painelAntiga.getByRole('dialog', { name: 'Termos de uso e privacidade' });
    ok('a admin vê o pedido de aceite', await apareceu(pedido, 30000));
    const tokenAntiga = await tokenDe('antiga@cadastro.invalid', senhaExtra);
    const rAntiga = await fetch(`${SITE}/api/cadastro/aceite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenAntiga}` },
      body: JSON.stringify({ versao: '0.1' }),
    });
    ok('aceite de versão antiga: 409', rAntiga.status === 409);
    const rDono = await fetch(`${SITE}/api/cadastro/aceite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await tokenDe('dono@cadastro.invalid', senhaExtra)}` },
      body: JSON.stringify({ versao: VERSAO_DOS_DOCUMENTOS }),
    });
    ok('quem não é admin de clínica não aceita: 403', rDono.status === 403);
    await pedido.getByRole('link', { name: 'Termos de Uso' }).click();
    const leitorDaAdmin = painelAntiga.getByRole('dialog', { name: 'Termos de Uso', exact: true });
    ok('a admin lê os Termos dentro do painel', await apareceu(leitorDaAdmin.getByRole('heading', { name: 'Termos de Uso da Venus JK' })));
    await leitorDaAdmin.locator('a', { hasText: 'Acordo de Tratamento de Dados' }).first().click();
    ok(
      'o link para o Acordo, dentro do texto, troca o documento',
      await apareceu(painelAntiga.getByRole('dialog', { name: 'Acordo de Tratamento de Dados', exact: true }).getByRole('heading', { name: 'Acordo de Tratamento de Dados' }))
    );
    ok('com os dados da empresa preenchidos', !(await painelAntiga.locator('mark').count()) && (await painelAntiga.getByText('49.464.212/0001-19').count()) > 0);
    await painelAntiga.getByRole('button', { name: 'Voltar' }).click();
    await pedido.getByRole('button', { name: 'Li e aceito' }).click();
    const sumiu = await pedido.waitFor({ state: 'hidden', timeout: 15000 }).then(() => true, () => false);
    const aceiteAntiga = (await zulia.db.doc(`clinicas/${antiga.id}`).get()).data()?.aceites?.termos;
    ok('aceitou: fica gravado e o pedido some', sumiu && aceiteAntiga?.versao === VERSAO_DOS_DOCUMENTOS && aceiteAntiga?.uid === antiga.uid);

    const clinicas = (await zulia.db.collection('clinicas').get()).docs.map((d) => d.data().nome).sort();
    ok(
      'só as clínicas esperadas existem',
      JSON.stringify(clinicas) === JSON.stringify(['Clínica Antiga', 'Clínica Delta', 'Clínica Gama']),
      JSON.stringify(clinicas)
    );
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

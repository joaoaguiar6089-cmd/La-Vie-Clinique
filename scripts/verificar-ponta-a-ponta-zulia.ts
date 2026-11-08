/**
 * Ponta a ponta no modo Zulia, num navegador de verdade, contra os emuladores locais.
 *
 *   1. `criarClinica` cria duas clínicas de teste (Alfa e Beta);
 *   2. o painel entra com a admin da Alfa e recebe só as sementes combinadas (fichas padrão e os 2
 *      procedimentos de exemplo; nada da La Vie, nenhuma paciente);
 *   3. a admin cria o login de uma profissional pela tela, e a claim dela sai certa;
 *   4. os links de anamnese, orçamento e agendamento, com `c=`, abrem e respondem sem login;
 *   5. a Beta não vê nada da Alfa.
 *
 * Precisa do build no modo Zulia ligado aos emuladores e dos emuladores de pé:
 *
 *   VITE_PLATAFORMA=zulia VITE_EMULADORES=1 npm run build
 *   PLATAFORMA=zulia npx -y firebase-tools@15 emulators:exec --only auth,firestore,storage \
 *     --config zulia/firebase.json --project demo-zulia "npx tsx scripts/verificar-ponta-a-ponta-zulia.ts"
 *
 * (Depois, `npm run build` de novo, sem as variáveis, antes de publicar qualquer coisa.)
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { abrirZulia } from './zuliaAdmin';
import { criarClinica } from './criar-clinica';
import { buildPublicLink } from '../src/utils/publicLinks';
import { definirClinicaAtual } from '../src/lib/estadoDaClinica';

// O Playwright não é dependência do projeto: vem instalado no ambiente (o da nuvem do Claude tem).
// Sem tipos dele aqui, de propósito — `npm install` do site não precisa baixar navegador.
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
const indice = readFileSync('dist/index.html', 'utf8');
if (!indice.includes('<title>Zulia</title>')) {
  console.error('O dist/ não é do modo Zulia: rode VITE_PLATAFORMA=zulia VITE_EMULADORES=1 npm run build.');
  process.exit(1);
}

const zulia = abrirZulia({ emulador: true });
const PORTA = 3917;
const SITE = `http://127.0.0.1:${PORTA}`;
const SENHA = `E2e-${crypto.randomUUID()}`;

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
  // O servidor do site, no modo Zulia, falando com os emuladores (as variáveis vêm do emulators:exec).
  const servidor: ChildProcess = spawn('node', ['server.js'], {
    env: { ...process.env, PORT: String(PORTA), PLATAFORMA: 'zulia' },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const navegador = await chromium.launch();
  try {
    await esperarServidor();

    // ==========================================
    console.log('\n1. Criar as clínicas');
    const alfa = await criarClinica(zulia, { nome: 'Clínica Alfa', email: 'dona@alfa.invalid', admin: 'Ana Alfa' });
    const beta = await criarClinica(zulia, { nome: 'Clínica Beta', email: 'dona@beta.invalid', admin: 'Bia Beta' });
    ok('ids aleatórios de 6 caracteres', /^[A-Za-z0-9]{6}$/.test(alfa.id) && /^[A-Za-z0-9]{6}$/.test(beta.id), `${alfa.id} ${beta.id}`);
    const claimsAlfa = (await zulia.auth.getUser(alfa.uid)).customClaims;
    ok('a admin da Alfa tem a claim da clínica', claimsAlfa?.clinicaId === alfa.id && claimsAlfa?.papel === 'admin');
    await zulia.auth.updateUser(alfa.uid, { password: SENHA });
    await zulia.auth.updateUser(beta.uid, { password: SENHA });

    // ==========================================
    console.log('\n2. O painel entra e recebe só as sementes combinadas');
    const painel = await navegador.newContext();
    const pagina = await painel.newPage();
    const errosDoConsole: string[] = [];
    pagina.on('console', (m: any) => m.type() === 'error' && errosDoConsole.push(m.text()));
    await pagina.goto(SITE);
    ok('a tela de login é da Zulia', (await pagina.locator('h1').first().textContent())?.trim() === 'Zulia');
    await pagina.fill('input[type=email]', 'dona@alfa.invalid');
    await pagina.fill('input[type=password]', SENHA);
    await pagina.click('button[type=submit]');
    await pagina.waitForFunction(() => !document.querySelector('input[type=password]'), null, { timeout: 30000 });
    // As sementes rodam no primeiro login; dá um tempo para elas chegarem ao banco.
    const procedimentos = async (c: string) => (await zulia.db.collection(`clinicas/${c}/procedures`).get()).docs;
    for (let i = 0; i < 40 && (await procedimentos(alfa.id)).length < 2; i++) await pagina.waitForTimeout(500);
    const procs = await procedimentos(alfa.id);
    ok('o catálogo da Alfa tem os 2 procedimentos de exemplo', procs.length === 2 && procs.every((d) => d.id.startsWith('exemplo-')), procs.map((d) => d.id).join(', '));
    for (let i = 0; i < 40 && (await zulia.db.collection(`clinicas/${alfa.id}/anamnesis_templates`).get()).empty; i++) {
      await pagina.waitForTimeout(500);
    }
    const [gerais, modelos, avaliacoes, pacientes, fichas] = await Promise.all(
      ['anamnesis_general_questions', 'anamnesis_templates', 'evaluation_templates', 'patients', 'anamnesis_records'].map(
        (c) => zulia.db.collection(`clinicas/${alfa.id}/${c}`).get()
      )
    );
    ok('as perguntas gerais padrão entraram', gerais.size > 0, String(gerais.size));
    ok('as fichas de anamnese padrão entraram', modelos.size > 0, String(modelos.size));
    ok('as fichas de avaliação padrão entraram', avaliacoes.size > 0, String(avaliacoes.size));
    ok('nenhuma paciente de exemplo', pacientes.empty && fichas.empty);
    const perfil = (await zulia.db.doc(`clinicas/${alfa.id}/clinic_settings/main_profile`).get()).data();
    ok('o perfil continua o da Alfa (nada da La Vie)', perfil?.name === 'Clínica Alfa' && !JSON.stringify(perfil).includes('Karoline'));
    const raiz = await zulia.db.listCollections();
    ok('nada foi gravado fora de clinicas/', raiz.map((c) => c.id).join(',') === 'clinicas', raiz.map((c) => c.id).join(','));
    await pagina.waitForTimeout(1500);
    const textoDoPainel = await pagina.locator('body').innerText();
    ok('o painel não mostra "La Vie" nem "Karoline"', !/La Vie|Karoline/i.test(textoDoPainel));
    ok('o painel mostra o nome da clínica', textoDoPainel.includes('Clínica Alfa'));
    await pagina.screenshot({ path: `${process.env.PASTA_DAS_IMAGENS || '.'}/zulia-painel.png` });

    // ==========================================
    console.log('\n3. A admin cria o login de uma profissional pela tela');
    // A profissional entra no perfil (como faria pelo formulário), e o login nasce pelo botão.
    const profissional = { id: 'prof-carla', name: 'Carla Alfa', email: 'carla@alfa.invalid' };
    await zulia.db.doc(`clinicas/${alfa.id}/clinic_settings/main_profile`).update({
      professionals: [...(perfil?.professionals || []), profissional],
    });
    await pagina.evaluate(() => window.scrollTo(0, 0));
    await pagina.getByRole('button', { name: /configura/i }).first().click();
    await pagina.locator('button[title="Criar login para esta profissional"]').first().click({ timeout: 15000 });
    let carla = null as Awaited<ReturnType<typeof zulia.auth.getUserByEmail>> | null;
    for (let i = 0; i < 40 && !carla; i++) {
      carla = await zulia.auth.getUserByEmail('carla@alfa.invalid').catch(() => null);
      if (!carla) await pagina.waitForTimeout(250);
    }
    ok('o login da profissional existe', !!carla);
    ok(
      'com a claim da Alfa, como profissional',
      carla?.customClaims?.clinicaId === alfa.id && carla?.customClaims?.papel === 'profissional',
      JSON.stringify(carla?.customClaims)
    );
    ok('e entrou no índice da equipe', (await zulia.db.doc(`clinicas/${alfa.id}`).get()).data()?.equipe?.[carla?.uid || ''] === 'profissional');

    // ==========================================
    console.log('\n4. Os links com c= abrem e respondem sem login');
    definirClinicaAtual(alfa.id);
    const linkDaAnamnese = buildPublicLink(null, { anamnese: 'tpl-botox' });
    ok('o link sai com c= da clínica', new URL(linkDaAnamnese).searchParams.get('c') === alfa.id, linkDaAnamnese);
    definirClinicaAtual(null);

    const modelo = modelos.docs.find((d) => d.data().procedimentoNome) || modelos.docs[0];
    const anonimo = await navegador.newContext();
    const paciente = await anonimo.newPage();
    const errosDaPaciente: string[] = [];
    paciente.on('console', (m: any) => m.type() === 'error' && errosDaPaciente.push(m.text()));
    await paciente.goto(`${SITE}/?anamnese=${modelo.id}&c=${alfa.id}`);
    await paciente
      .waitForFunction(() => document.body.innerText.includes('Clínica Alfa'), null, { timeout: 30000 })
      .catch(async () => {
        console.log('   (a ficha não mostrou o nome da clínica a tempo)', errosDaPaciente.slice(0, 3));
        await paciente.screenshot({ path: `${process.env.PASTA_DAS_IMAGENS || '.'}/zulia-ficha.png` });
      });
    const textoDaFicha = await paciente.locator('body').innerText();
    ok('a ficha abre sem login, com o nome da clínica', textoDaFicha.includes('Clínica Alfa'));
    ok('e sem "La Vie"', !/La Vie/i.test(textoDaFicha));
    const titulo = await (await fetch(`${SITE}/?anamnese=${modelo.id}&c=${alfa.id}`)).text();
    ok('o cartão do link (WhatsApp) leva o procedimento e a clínica', titulo.includes(`Anamnese - ${modelo.data().procedimentoNome}`) && titulo.includes('Clínica Alfa'));

    // O envio da ficha pelo servidor, como a página faz.
    const envio = await fetch(`${SITE}/api/ficha-publica/salvar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ c: alfa.id, anamnese: modelo.id, dadosPaciente: { nome: 'Paciente Teste' }, dadosFicha: { respostasGerais: {} } }),
    });
    const salva = (await envio.json()) as { ficha?: { id: string } };
    ok('a ficha enviada sem login vai para a Alfa', envio.ok && !!salva.ficha && (await zulia.db.doc(`clinicas/${alfa.id}/anamnesis_records/${salva.ficha.id}`).get()).exists);

    // Um orçamento no formato que o painel grava (ver `Quote` em src/types.ts).
    const hoje = new Date().toISOString();
    await zulia.db.doc(`clinicas/${alfa.id}/quotes/q-e2e`).set({
      numero: '2026-0001',
      ano: 2026,
      sequencia: 1,
      status: 'enviado',
      dataEmissao: hoje,
      dataValidade: new Date(Date.now() + 30 * 86400000).toISOString(),
      pacienteNome: 'Paciente Teste',
      jaTeveAvaliacao: false,
      textoApresentacao: 'Olá!',
      itens: [
        {
          id: 'i1',
          procedureId: 'exemplo-limpeza-de-pele',
          categoria: 'Facial',
          titulo: 'Limpeza de pele (exemplo)',
          valorTabela: 150,
          temDesconto: false,
          maisDeUmaSessao: false,
          sessoes: 1,
          detalhes: [],
        },
      ],
      temDescontoCombinado: false,
      pagamento: { opcoes: [{ id: 'p1', forma: 'pix', temDesconto: false }] },
      clinica: { name: 'Clínica Alfa' },
      total: 150,
      enviadoEm: hoje,
      createdAt: hoje,
      updatedAt: hoje,
    });
    const orc = await anonimo.newPage();
    await orc.goto(`${SITE}/?orcamento=q-e2e&c=${alfa.id}`);
    await orc.waitForFunction(() => document.body.innerText.includes('Limpeza de pele'), null, { timeout: 30000 }).catch(() => {});
    const textoDoOrcamento = await orc.locator('body').innerText();
    ok('o orçamento abre sem login pelo link com c=', textoDoOrcamento.includes('Limpeza de pele'), textoDoOrcamento.slice(0, 200).replace(/\s+/g, ' '));
    await orc.goto(`${SITE}/?orcamento=q-e2e&c=${beta.id}`);
    await orc.waitForTimeout(3000);
    ok('o mesmo orçamento com o c da Beta não abre', !(await orc.locator('body').innerText()).includes('Limpeza de pele'));

    await zulia.db.doc(`clinicas/${alfa.id}/appointment_links/ag-e2e`).set({
      situacao: 'ativo',
      data: '2030-01-10',
      hora: '10:00',
      procedimento: { titulo: 'Limpeza de pele (exemplo)' },
      clinica: { name: 'Clínica Alfa' },
      pacientePrimeiroNome: 'Paciente',
      respostaPendente: false,
      criadoEm: new Date().toISOString(),
    });
    const ag = await anonimo.newPage();
    await ag.goto(`${SITE}/?agendamento=ag-e2e&c=${alfa.id}`);
    const confirmar = ag.getByRole('button', { name: /confirm/i }).first();
    await confirmar.waitFor({ timeout: 30000 }).catch(() => {});
    if (await confirmar.isVisible().catch(() => false)) await confirmar.click();
    let resposta: Record<string, unknown> | undefined;
    for (let i = 0; i < 40 && !resposta?.respostaPendente; i++) {
      resposta = (await zulia.db.doc(`clinicas/${alfa.id}/appointment_links/ag-e2e`).get()).data();
      if (!resposta?.respostaPendente) await ag.waitForTimeout(250);
    }
    ok('a paciente confirma o agendamento sem login', resposta?.respostaPendente === true && (resposta?.resposta as { tipo?: string })?.tipo === 'confirmar', JSON.stringify(resposta?.resposta));

    // ==========================================
    console.log('\n5. A Beta não vê nada da Alfa');
    const painelB = await navegador.newContext();
    const paginaB = await painelB.newPage();
    await paginaB.goto(SITE);
    await paginaB.fill('input[type=email]', 'dona@beta.invalid');
    await paginaB.fill('input[type=password]', SENHA);
    await paginaB.click('button[type=submit]');
    await paginaB.waitForFunction(() => !document.querySelector('input[type=password]'), null, { timeout: 30000 });
    await paginaB.waitForTimeout(4000);
    const textoB = await paginaB.locator('body').innerText();
    ok('o painel da Beta mostra a Beta', textoB.includes('Clínica Beta'));
    ok('e nada da Alfa', !textoB.includes('Clínica Alfa') && !textoB.includes('Paciente Teste') && !textoB.includes('Carla Alfa'));
    const leituraCruzada = await paginaB.evaluate(async (c: string) => {
      const r = await fetch('/api/ficha-publica/abrir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ c, ficha: 'qualquer' }),
      });
      return r.status;
    }, beta.id);
    ok('o servidor não acha na Beta uma ficha da Alfa', leituraCruzada === 404);
    ok(
      'nenhum erro de permissão no console do painel da Alfa',
      !errosDoConsole.some((e) => /permission|insufficient/i.test(e)),
      errosDoConsole.filter((e) => /permission|insufficient/i.test(e)).slice(0, 2).join(' | ')
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

/**
 * Cria (ou acerta) o login do dono da plataforma: a claim `donoDaPlataforma`, sem clínica.
 *
 *   npx tsx scripts/criar-dono.ts --email <e-mail> [--sem-convite] [--emulador]
 *   (PROJETO_DE_TESTES=1: no projeto de testes)
 *
 * - Recusa um e-mail que já é login de uma clínica: um login pertence a uma clínica só, e o do dono
 *   a nenhuma.
 * - Marca o e-mail como confirmado (é o dono quem roda o script) — o Firebase só deixa cadastrar o
 *   segundo fator com o e-mail confirmado.
 * - Manda o e-mail de definir a senha (a não ser com `--sem-convite`). No primeiro login, o painel
 *   pede para cadastrar o aplicativo autenticador; sem ele, o painel do dono não abre
 *   (ver server/dono.ts).
 *
 * Credencial: ZULIA_CLIENT_EMAIL e ZULIA_PRIVATE_KEY.
 */
import crypto from 'node:crypto';
import { abrirZulia, pediuEmulador, type AcessoZulia } from './zuliaAdmin';

export async function criarDono(zulia: AcessoZulia, emailBruto: string): Promise<{ uid: string; jaExistia: boolean }> {
  const email = emailBruto.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error('Informe o e-mail do dono com --email.');
  let usuario = await zulia.auth.getUserByEmail(email).catch(() => null);
  if (usuario?.customClaims?.clinicaId) {
    throw new Error(`O e-mail ${email} já é login da clínica ${usuario.customClaims.clinicaId}. O dono precisa de outro e-mail.`);
  }
  const jaExistia = !!usuario;
  if (!usuario) {
    usuario = await zulia.auth.createUser({ email, emailVerified: true, password: `${crypto.randomUUID()}-Aa1` });
  } else if (!usuario.emailVerified || usuario.disabled) {
    await zulia.auth.updateUser(usuario.uid, { emailVerified: true, disabled: false });
  }
  await zulia.auth.setCustomUserClaims(usuario.uid, { donoDaPlataforma: true });
  return { uid: usuario.uid, jaExistia };
}

/** O e-mail de definir a senha, pelo mesmo serviço do "Esqueci minha senha". */
async function mandarConvite(zulia: AcessoZulia, email: string): Promise<void> {
  const host = zulia.emulador
    ? `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com`
    : 'https://identitytoolkit.googleapis.com';
  const resposta = await fetch(`${host}/v1/accounts:sendOobCode?key=${zulia.config.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Firebase-Locale': 'pt-BR' },
    body: JSON.stringify({ requestType: 'PASSWORD_RESET', email }),
  });
  if (!resposta.ok) throw new Error(`o Firebase respondeu ${resposta.status}: ${await resposta.text()}`);
}

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const zulia = abrirZulia({ emulador: pediuEmulador() });
  try {
    const email = argumento('--email') || '';
    const r = await criarDono(zulia, email);
    console.log(`\nLogin do dono ${r.jaExistia ? 'acertado' : 'criado'} em ${zulia.config.projectId}: ${email.trim().toLowerCase()}`);
    if (process.argv.includes('--sem-convite')) {
      console.log('Sem convite: entre pela tela de login, em "Esqueci minha senha".');
    } else {
      await mandarConvite(zulia, email.trim().toLowerCase());
      console.log('E-mail de definir a senha enviado.');
    }
    console.log('No primeiro login, o painel pede para cadastrar o aplicativo autenticador.');
  } finally {
    await zulia.encerrar();
  }
}

if (process.argv[1] && /criar-dono\.ts$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(`\nNão foi possível: ${(e as Error).message}`);
    process.exitCode = 1;
  });
}

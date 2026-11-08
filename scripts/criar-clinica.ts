/**
 * Cria uma clínica na Zulia, até existir o cadastro sozinho (etapa 3).
 *
 *   npx tsx scripts/criar-clinica.ts --nome "Clínica Alfa" --email dona@alfa.com.br \
 *     [--admin "Dra. Ana Souza"] [--plano gratuito|completo] [--cortesia] [--google-agenda] \
 *     [--id <id>] [--sem-convite] [--emulador]
 *
 * O que faz, pelo Admin SDK, no `zulia-plataforma` (credencial ZULIA_CLIENT_EMAIL e
 * ZULIA_PRIVATE_KEY) ou nos emuladores locais (`--emulador`):
 *   1. gera o id aleatório da clínica (`src/utils/clinicas.ts`), que nunca muda;
 *   2. grava `clinicas/{id}`: nome, plano, situação, dona, datas, `recursos` e o índice da equipe;
 *   3. cria o login da admin (ou reaproveita um login dela sem clínica) e grava as claims
 *      `clinicaId` e `papel: 'admin'`;
 *   4. grava `clinic_settings/main_profile` e `public_profile` mínimos, com o nome da clínica e a
 *      admin na equipe;
 *   5. manda o e-mail de definir a senha (o convite), a não ser com `--sem-convite`.
 *
 * As sementes (fichas padrão e os 2 procedimentos de exemplo) entram no primeiro login dela, pelo
 * painel. Nada da La Vie é copiado.
 */
import { gerarIdDeClinica, idDeClinicaValido } from '../src/utils/clinicas';
import { abrirZulia, pediuEmulador, type AcessoZulia } from './zuliaAdmin';

export type Plano = 'gratuito' | 'completo';

export interface PedidoDeClinica {
  nome: string;
  email: string;
  /** O nome da admin na equipe. Ausente: a parte do e-mail antes do @. */
  admin?: string;
  plano?: Plano;
  /** Completo sem pagar (a La Vie, por exemplo). */
  cortesia?: boolean;
  googleAgenda?: boolean;
  /** Um id escolhido (testes, migração). Ausente: aleatório. */
  id?: string;
}

export interface ClinicaCriada {
  id: string;
  uid: string;
  loginJaExistia: boolean;
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

/** Um id que ainda não existe. */
async function idLivre(zulia: AcessoZulia, pedido?: string): Promise<string> {
  if (pedido) {
    const id = idDeClinicaValido(pedido);
    if (!id) throw new Error(`"${pedido}" não serve de id de clínica (letras, números, - e _, de 3 a 40).`);
    if ((await zulia.db.doc(`clinicas/${id}`).get()).exists) throw new Error(`A clínica ${id} já existe.`);
    return id;
  }
  for (let tentativa = 0; tentativa < 10; tentativa++) {
    const id = gerarIdDeClinica();
    if (!(await zulia.db.doc(`clinicas/${id}`).get()).exists) return id;
  }
  throw new Error('Não achei um id livre em 10 tentativas — algo está errado.');
}

export async function criarClinica(zulia: AcessoZulia, pedido: PedidoDeClinica): Promise<ClinicaCriada> {
  const nome = pedido.nome.trim();
  const email = pedido.email.trim().toLowerCase();
  if (!nome) throw new Error('Falta o nome da clínica (--nome).');
  if (!EMAIL.test(email)) throw new Error('Falta o e-mail da admin (--email), ou ele não é válido.');
  const plano: Plano = pedido.plano === 'completo' || pedido.cortesia ? 'completo' : 'gratuito';

  // O login primeiro: se o e-mail já é de outra clínica, nada é gravado.
  let usuario = await zulia.auth.getUserByEmail(email).catch(() => null);
  if (usuario?.customClaims?.clinicaId) {
    throw new Error(`O e-mail ${email} já é login da clínica ${usuario.customClaims.clinicaId}. Um login é de uma clínica só.`);
  }
  if (usuario?.customClaims?.donoDaPlataforma) {
    throw new Error(`O e-mail ${email} é o login do dono da plataforma. A admin da clínica precisa de outro.`);
  }
  const loginJaExistia = !!usuario;

  const id = await idLivre(zulia, pedido.id);
  if (!usuario) {
    usuario = await zulia.auth.createUser({
      email,
      // Ninguém usa esta senha: a admin define a dela pelo e-mail de convite.
      password: `${crypto.randomUUID()}-Aa1`,
      displayName: pedido.admin?.trim() || undefined,
    });
  }
  const uid = usuario.uid;
  const agora = new Date().toISOString();
  const nomeDaAdmin = pedido.admin?.trim() || email.split('@')[0];
  const profissional = { id: `prof-${uid.slice(0, 8)}`, name: nomeDaAdmin, email, uid, isAdmin: true };

  const base = `clinicas/${id}`;
  const lote = zulia.db.batch();
  lote.set(zulia.db.doc(base), {
    nome,
    plano,
    cortesia: !!pedido.cortesia,
    situacao: 'ativa',
    dona: { uid, email },
    recursos: { googleAgenda: !!pedido.googleAgenda },
    // Índice da equipe ({ uid: papel }), que só o servidor grava — ver server/equipe.ts.
    equipe: { [uid]: 'admin' },
    criadaEm: agora,
    atualizadaEm: agora,
    criadaPor: 'scripts/criar-clinica.ts',
  });
  lote.set(zulia.db.doc(`${base}/clinic_settings/main_profile`), {
    name: nome,
    tagline: '',
    professionals: [profissional],
    equipeUids: [uid],
    phone: '',
    instagram: '',
    address: '',
    cityState: '',
    updatedAt: agora,
  });
  lote.set(zulia.db.doc(`${base}/clinic_settings/public_profile`), {
    name: nome,
    tagline: '',
    phone: '',
    instagram: '',
    address: '',
    cityState: '',
    professionals: [{ id: profissional.id, name: profissional.name }],
    updatedAt: agora,
  });
  await lote.commit();

  // As claims depois do documento: quando ela entrar, a clínica já existe.
  await zulia.auth.setCustomUserClaims(uid, { ...(usuario.customClaims || {}), clinicaId: id, papel: 'admin' });
  if (usuario.disabled) await zulia.auth.updateUser(uid, { disabled: false });

  return { id, uid, loginJaExistia };
}

/** O e-mail de definir a senha, pelo mesmo serviço que o botão "Esqueci minha senha" usa. */
async function mandarConvite(zulia: AcessoZulia, email: string): Promise<void> {
  const host = zulia.emulador
    ? `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com`
    : 'https://identitytoolkit.googleapis.com';
  const resposta = await fetch(`${host}/v1/accounts:sendOobCode?key=${zulia.config.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
    const pedido: PedidoDeClinica = {
      nome: argumento('--nome') || '',
      email: argumento('--email') || '',
      admin: argumento('--admin'),
      plano: argumento('--plano') === 'completo' ? 'completo' : 'gratuito',
      cortesia: process.argv.includes('--cortesia'),
      googleAgenda: process.argv.includes('--google-agenda'),
      id: argumento('--id'),
    };
    const criada = await criarClinica(zulia, pedido);
    console.log(`\nClínica criada em ${zulia.config.projectId}${zulia.emulador ? ' (emuladores)' : ''}:`);
    console.log(`  id:     ${criada.id}`);
    console.log(`  nome:   ${pedido.nome}`);
    console.log(`  admin:  ${pedido.email.trim().toLowerCase()}${criada.loginJaExistia ? ' (login que já existia, agora desta clínica)' : ''}`);
    console.log(`  plano:  ${pedido.cortesia ? 'completo (cortesia)' : pedido.plano}`);
    if (process.argv.includes('--sem-convite')) {
      console.log('\nSem convite: a admin entra pela tela de login, em "Esqueci minha senha".');
    } else {
      await mandarConvite(zulia, pedido.email.trim().toLowerCase());
      console.log(`\nConvite (definir a senha) enviado para ${pedido.email}.`);
    }
  } finally {
    await zulia.encerrar();
  }
}

// Só roda como programa; importado (pelos testes), só exporta `criarClinica`.
if (process.argv[1] && /criar-clinica\.ts$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(`\nA clínica não foi criada: ${(e as Error).message}`);
    process.exitCode = 1;
  });
}

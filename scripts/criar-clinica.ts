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
import { criarClinica, type PedidoDeClinica } from '../server/clinicasNovas';
import { abrirZulia, pediuEmulador, type AcessoZulia } from './zuliaAdmin';

export { criarClinica, type ClinicaCriada, type PedidoDeClinica, type Plano } from '../server/clinicasNovas';

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

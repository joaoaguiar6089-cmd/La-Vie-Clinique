/**
 * Autoriza no login da Zulia (Firebase Authentication / Identity Platform) o endereço em que o
 * site é publicado.
 *
 * O Firebase só deixa o painel entrar, mandar o e-mail de redefinir senha e abrir o link do
 * e-mail em domínios da lista "Domínios autorizados". O projeto novo vem só com
 * `zulia-plataforma.firebaseapp.com` e `zulia-plataforma.web.app`; sem o endereço do AI Studio na
 * lista, a equipe da La Vie não entraria no dia da migração. Pôr o domínio antes não afeta a La
 * Vie, que usa outro projeto.
 *
 * Também liga a verificação em duas etapas por aplicativo autenticador (TOTP), exigida no login do
 * dono da plataforma (ver server/dono.ts). Ligar não obriga ninguém: só quem cadastra o aplicativo
 * passa a precisar do código.
 *
 *   npx tsx scripts/configurar-login-zulia.ts --conferir   só mostra como está
 *   npx tsx scripts/configurar-login-zulia.ts              acrescenta o que falta (nunca tira)
 *   (PROJETO_DE_TESTES=1: no projeto de testes)
 *
 * Os domínios a garantir ficam em DOMINIOS, abaixo. Quando houver domínio próprio, ele entra ali.
 *
 * Credencial: ZULIA_CLIENT_EMAIL e ZULIA_PRIVATE_KEY (papel que muda a configuração do login, como
 * Editor ou Administrador do Firebase Authentication).
 */
import { abrirZulia } from './zuliaAdmin';

/** Os endereços em que o painel da Zulia roda e que o login precisa aceitar. */
const DOMINIOS = ['drakaroline-lavie.ai.studio'];

const API = 'https://identitytoolkit.googleapis.com/admin/v2';

interface ConfigDoLogin {
  authorizedDomains?: string[];
  mfa?: {
    state?: string;
    providerConfigs?: Array<{ state?: string; totpProviderConfig?: { adjacentIntervals?: number } }>;
  };
}

/** A verificação em duas etapas por aplicativo autenticador está ligada? */
const totpLigado = (c: ConfigDoLogin): boolean =>
  c.mfa?.state === 'ENABLED' && !!c.mfa.providerConfigs?.some((p) => p.state === 'ENABLED' && p.totpProviderConfig);

async function main() {
  const zulia = abrirZulia({ emulador: false });
  try {
    const credencial = zulia.app.options.credential;
    if (!credencial) throw new Error('O acesso à Zulia abriu sem credencial.');
    const { access_token: token } = await credencial.getAccessToken();
    const endereco = `${API}/projects/${zulia.config.projectId}/config`;

    const chamar = async (metodo: string, url: string, corpo?: unknown): Promise<ConfigDoLogin> => {
      const resposta = await fetch(url, {
        method: metodo,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
      });
      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados?.error?.message || `${resposta.status} ${resposta.statusText}`);
      return dados as ConfigDoLogin;
    };

    const configuracao = await chamar('GET', endereco);
    const antes = configuracao.authorizedDomains || [];
    console.log(`Projeto ${zulia.config.projectId}\nDomínios autorizados hoje: ${antes.join(', ') || '(nenhum)'}`);
    console.log(`Duas etapas por aplicativo autenticador: ${totpLigado(configuracao) ? 'ligada' : 'desligada'}`);

    const faltando = DOMINIOS.filter((d) => !antes.includes(d));
    const faltaTotp = !totpLigado(configuracao);
    if (faltando.length === 0 && !faltaTotp) {
      console.log('Nada a acrescentar.');
      return;
    }
    if (process.argv.includes('--conferir')) {
      if (faltando.length) console.log(`Faltam: ${faltando.join(', ')}`);
      if (faltaTotp) console.log('Falta ligar as duas etapas por aplicativo autenticador.');
      process.exitCode = 1;
      return;
    }

    if (faltaTotp) {
      const depoisDoTotp = await chamar('PATCH', `${endereco}?updateMask=mfa`, {
        mfa: { state: 'ENABLED', providerConfigs: [{ state: 'ENABLED', totpProviderConfig: { adjacentIntervals: 5 } }] },
      });
      if (!totpLigado(depoisDoTotp)) throw new Error('As duas etapas não ficaram ligadas.');
      console.log('Duas etapas por aplicativo autenticador: ligada agora');
    }
    if (faltando.length === 0) return;

    // A lista é trocada inteira: manda a de hoje com os novos no fim, para não tirar nenhum.
    const depois =
      (
        await chamar('PATCH', `${endereco}?updateMask=authorizedDomains`, {
          authorizedDomains: [...antes, ...faltando],
        })
      ).authorizedDomains || [];
    console.log(`Domínios autorizados agora: ${depois.join(', ')}`);
    const naoEntrou = DOMINIOS.filter((d) => !depois.includes(d));
    if (naoEntrou.length > 0) throw new Error(`Não entraram: ${naoEntrou.join(', ')}`);
  } finally {
    await zulia.encerrar();
  }
}

main().catch((e) => {
  console.error(`\nNão aplicado: ${(e as Error).message}`);
  process.exitCode = 1;
});

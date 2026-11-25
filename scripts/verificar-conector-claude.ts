/**
 * Confere o conector do Claude de ponta a ponta, sem banco nem Google: o servidor de verdade
 * (`criarRotasDoConectorClaude`, numa porta local), com o banco da clínica e o armazém do login
 * na memória.
 *
 * O que ele caça:
 *   - no login (OAuth): acesso sem PKCE, código usado duas vezes, renovação reaproveitada, pedido
 *     de outro app, login desativado que continua usando, clínica vendo a agenda de outra;
 *   - na agenda: agendamento gravado em cima de sala ocupada, horário que já passou, aviso
 *     ignorado sem a pessoa confirmar, cadastro repetido, o link público vazando dado interno,
 *     o link apontando para a clínica errada, o fuso do servidor (UTC) virando o dia.
 *
 *   npx tsx scripts/verificar-conector-claude.ts
 */
import type { AddressInfo } from 'node:net';
import express from 'express';
import type { Attendance, ClinicProfile, ContaGoogleAgenda, MarcaGoogleAgenda, Patient, Procedure } from '../src/types';
import { criarRotasDoConectorClaude } from '../server/conectorClaude';
import { agoraNaClinica, ErroDoConector, limpar, type BancoDaClinica } from '../server/conectorClaudeAgenda';
import {
  armazemNaMemoria,
  desafioDoPkce,
  enderecoDeVoltaAceito,
  mesmoEnderecoDeVolta,
  novoSegredo,
} from '../server/conectorClaudeLogin';

const ID_PUBLICADO = 'https://claude.ai/oauth/mcp-oauth-client-metadata';
const ID_DO_CLAUDE_CODE = 'https://claude.ai/oauth/claude-code-client-metadata';
const documentosBuscados: string[] = [];
/** O que o documento do Claude Code devolve (para testar documento que mente). */
let documentoDoClaudeCode: unknown = {
  client_id: ID_DO_CLAUDE_CODE,
  client_name: 'Claude Code',
  redirect_uris: ['http://localhost/callback', 'http://127.0.0.1/callback'],
  token_endpoint_auth_method: 'none',
};
/** Simula o Authentication fora do ar. */
let authenticationForaDoAr = false;
import type { LoginDoPainel } from '../server/login';

let falhas = 0;
const ok = (nome: string, condicao: boolean, extra = '') => {
  console.log(`${condicao ? '  ok  ' : ' FALHA'}  ${nome}${extra ? `  — ${extra}` : ''}`);
  if (!condicao) falhas++;
};

// ==========================================
// A CLÍNICA NA MEMÓRIA
// ==========================================

interface ClinicaNaMemoria extends BancoDaClinica {
  pacientesDb: Map<string, Patient>;
  atendimentos: Map<string, Attendance>;
  links: Map<string, Record<string, unknown>>;
  uso: { clientes: number };
  plano: string;
  marcas: Map<string, MarcaGoogleAgenda>;
  contas: Record<string, ContaGoogleAgenda>;
}

const perfilBase = (nome: string): ClinicProfile =>
  ({
    name: nome,
    tagline: 'Estética avançada',
    phone: '(19) 3333-4444',
    instagram: '',
    address: 'Rua Bernardino de Campos, 192',
    cityState: 'Indaiatuba - SP',
    professionals: [
      { id: 'prof-k', name: 'Dra. Karoline Ferreira', title: 'Enfermeira esteta', registryNumber: 'COREN 1' },
      { id: 'prof-a', name: 'Ana Souza', title: 'Biomédica', registryNumber: 'CRBM 2' },
    ],
    agendaSalas: [{ id: 'sala-laser', nome: 'Sala do laser' }],
  }) as ClinicProfile;

const catalogoBase: Procedure[] = [
  { id: 'avaliacao', title: 'Avaliação', category: '', description: '', price: 0, duration: '30 min', images: [], benefits: [], order: 0, createdAt: '' },
  {
    id: 'proc-hg',
    title: 'Harmonização Glútea',
    focos: ['Fase 1', 'Fase 2'],
    category: 'Corporal',
    description: 'Bioestimulador e ácido hialurônico',
    price: 4500,
    duration: '1h',
    images: ['https://exemplo.com/hg.jpg', 'data:image/png;base64,AAAA'],
    benefits: [],
    orientacoesPreProcedimento: 'Venha com roupa confortável.',
    assignedDoctorIds: ['prof-k'],
    order: 1,
    createdAt: '',
  },
  { id: 'proc-botox', title: 'Botox', category: 'Facial', description: '', price: 1200, duration: '30 min', images: [], benefits: [], order: 2, createdAt: '' },
  { id: 'proc-velho', title: 'Procedimento antigo', category: '', description: '', price: 0, images: [], benefits: [], order: 3, createdAt: '', arquivado: true },
];

function clinicaNaMemoria(clinicaId: string | null, nome: string): ClinicaNaMemoria {
  const perfil = perfilBase(nome);
  const pacientesDb = new Map<string, Patient>();
  const atendimentos = new Map<string, Attendance>();
  const links = new Map<string, Record<string, unknown>>();
  const marcas = new Map<string, MarcaGoogleAgenda>();
  const clinica: ClinicaNaMemoria = {
    clinicaId,
    pacientesDb,
    atendimentos,
    links,
    marcas,
    uso: { clientes: 0 },
    plano: 'completo',
    contas: {},
    async perfil() {
      return perfil;
    },
    async procedimentos() {
      return catalogoBase.filter((p) => !p.arquivado);
    },
    async pacientes() {
      return [...pacientesDb.values()].filter((p) => !p.juntadoA && !p.arquivadoEm);
    },
    async paciente(id) {
      return pacientesDb.get(id) || null;
    },
    async atendimentosEntre(de, ate) {
      return [...atendimentos.values()].filter((a) => a.data >= de && a.data <= ate);
    },
    async atendimento(id) {
      return atendimentos.get(id) || null;
    },
    async atendimentosDoGrupo(grupoId) {
      return [...atendimentos.values()].filter((a) => a.grupoId === grupoId);
    },
    async criarPaciente(p) {
      if (pacientesDb.has(p.id)) throw new Error('já existe');
      if (clinica.plano !== 'completo' && clinica.uso.clientes >= 5) {
        throw new ErroDoConector('limite do plano');
      }
      pacientesDb.set(p.id, limpar(p));
      clinica.uso.clientes++;
    },
    async criarVisita(registros, link) {
      if (registros.some((r) => atendimentos.has(r.id)) || links.has(link.token)) throw new Error('já existe');
      registros.forEach((r) => atendimentos.set(r.id, limpar(r)));
      links.set(link.token, link.dados);
    },
    async gravarLink(token, snapshot, semToken) {
      const existente = links.get(token);
      links.set(token, limpar({ ...(existente || { respostaPendente: false, createdAt: 'agora' }), ...snapshot }));
      semToken.forEach((id) => {
        const a = atendimentos.get(id);
        if (a) a.linkToken = token;
      });
    },
    async marcarGoogle(id, marca) {
      marcas.set(id, marca);
      const a = atendimentos.get(id);
      if (a) a.googleAgenda = marca;
    },
    async googleAgenda() {
      return { ligado: true, contas: clinica.contas };
    },
  };
  return clinica;
}

// ==========================================
// O SERVIDOR LOCAL
// ==========================================

// Quarta, 25/11/2026, 11:00 em Brasília (14:00 UTC).
const INSTANTE = new Date('2026-11-25T14:00:00Z');
let relogio = INSTANTE.getTime();

const clinicaA = clinicaNaMemoria('clinA', 'La Vie Clinique');
const clinicaB = clinicaNaMemoria('clinB', 'Outra Clínica');
const armazem = armazemNaMemoria();
const ativos = new Map<string, string>([
  ['uid-joao', 'clinA'],
  ['uid-outra', 'clinB'],
]);
const loginsDoPainel: Record<string, LoginDoPainel> = {
  'painel-joao': { uid: 'uid-joao', email: 'joao@exemplo.com', clinicaId: 'clinA', papel: 'admin', dono: false },
  'painel-outra': { uid: 'uid-outra', email: 'outra@exemplo.com', clinicaId: 'clinB', papel: 'admin', dono: false },
  'painel-sem-clinica': { uid: 'uid-solto', email: 'solto@exemplo.com', clinicaId: null, papel: null, dono: false },
  'painel-joao-antigo': { uid: 'uid-joao', email: 'joao@exemplo.com', clinicaId: 'clinA', papel: 'admin', dono: false },
};
/** Quando as sessões de cada login foram encerradas (senha trocada, "sair de todos os aparelhos"). */
const sessoesEncerradasEm = new Map<string, number>();
const enviosAoGoogle: { calendario: string; eventos: { eventoId: string; evento: unknown }[] }[] = [];

const app = express();
app.set('trust proxy', true);
const rotas = criarRotasDoConectorClaude({
  zulia: true,
  armazem: () => armazem,
  agora: () => relogio,
  instante: () => new Date(relogio),
  loginDoPainel: async (req) => {
    const t = (req.headers.authorization || '').replace('Bearer ', '');
    const login = loginsDoPainel[t];
    if (!login) return null;
    // Senha digitada agora há pouco — menos na sessão "antiga", de uma hora atrás.
    return { ...login, autenticadoEm: t.endsWith('-antigo') ? relogio - 60 * 60 * 1000 : relogio - 60 * 1000 };
  },
  conferirLogin: async (uid, clinicaId, autorizadoEm) => {
    if (authenticationForaDoAr) throw new Error('Authentication fora do ar');
    return ativos.get(uid) === clinicaId && !((sessoesEncerradasEm.get(uid) || 0) > (autorizadoEm ?? 0));
  },
  bancoDaClinica: (c) => (c === 'clinA' ? clinicaA : c === 'clinB' ? clinicaB : null),
  salvarNoGoogle: async (_token, calendario, eventos) => {
    enviosAoGoogle.push({ calendario, eventos });
    return eventos.map((e) => ({ eventoId: e.eventoId, ok: true }));
  },
  semRegistroDeAcesso: true,
  buscarDocumento: async (url) => {
    documentosBuscados.push(url);
    if (url === ID_PUBLICADO) {
      return { client_id: ID_PUBLICADO, client_name: 'Claude', redirect_uris: ['https://claude.ai/api/mcp/auth_callback'], token_endpoint_auth_method: 'none' };
    }
    if (url === ID_DO_CLAUDE_CODE) return documentoDoClaudeCode;
    throw new Error('404');
  },
});
app.use(rotas);
app.get('*', (_req, res) => res.status(200).send('spa'));

const servidor = app.listen(0);
const porta = (servidor.address() as AddressInfo).port;
const BASE = `http://localhost:${porta}`;
// O endereço público do OAuth vem desta variável (no ar, sem ela, o ENDERECO_DO_SITE).
process.env.ENDERECO_DO_CONECTOR = BASE;

const json = async (r: Response) => {
  const t = await r.text();
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
};

const form = (dados: Record<string, string>) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(dados).toString(),
});

// ==========================================
// O FLUXO
// ==========================================

async function principal() {
  console.log('\nHora da clínica');
  const tarde = agoraNaClinica(new Date('2026-11-26T02:30:00Z'));
  ok('23:30 em Brasília ainda é dia 25 (o servidor, em UTC, já estaria no 26)', tarde.data === '2026-11-25' && tarde.hhmm === '23:30', JSON.stringify(tarde));
  ok('11:00 da quarta, 25/11', agoraNaClinica(INSTANTE).hhmm === '11:00');

  console.log('\nDescoberta');
  const semToken = await fetch(`${BASE}/api/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const www = semToken.headers.get('www-authenticate') || '';
  ok('sem acesso: 401 dizendo onde se autorizar', semToken.status === 401 && www.includes('/.well-known/oauth-protected-resource/api/mcp'), www);
  const getSemToken = await fetch(`${BASE}/api/mcp`);
  ok('GET sem acesso também responde 401 (e não 405)', getSemToken.status === 401);
  const recurso = await json(await fetch(`${BASE}/.well-known/oauth-protected-resource/api/mcp`));
  ok('metadados do recurso', recurso.resource === `${BASE}/api/mcp` && recurso.authorization_servers?.[0] === BASE);
  const meta = await json(await fetch(`${BASE}/.well-known/oauth-authorization-server`));
  ok('metadados do servidor de autorização', meta.issuer === BASE && meta.code_challenge_methods_supported?.includes('S256') && !!meta.registration_endpoint);

  console.log('\nRegistro do aplicativo');
  ok(
    'endereço de volta: só o do Claude, exato (e a própria máquina)',
    enderecoDeVoltaAceito('https://claude.ai/api/mcp/auth_callback') &&
      enderecoDeVoltaAceito('https://claude.com/api/mcp/auth_callback') &&
      enderecoDeVoltaAceito('http://localhost:6274/cb') &&
      !enderecoDeVoltaAceito('http://evil.com/cb') &&
      !enderecoDeVoltaAceito('https://evil.com/cb') &&
      !enderecoDeVoltaAceito('https://claude.ai.evil.com/cb') &&
      !enderecoDeVoltaAceito('https://anything.claude.com/some/page') &&
      !enderecoDeVoltaAceito('https://claude.ai/outra/pagina')
  );
  ok(
    'na própria máquina a porta pode mudar; no resto, nada',
    mesmoEnderecoDeVolta('http://localhost/callback', 'http://localhost:53712/callback') &&
      !mesmoEnderecoDeVolta('http://localhost/callback', 'http://localhost:53712/outro') &&
      !mesmoEnderecoDeVolta('https://claude.ai/api/mcp/auth_callback', 'https://claude.ai:444/api/mcp/auth_callback')
  );
  for (const uri of ['https://site-qualquer.com/cb', 'https://anything.claude.com/some/page']) {
    const deFora = await fetch(meta.registration_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ redirect_uris: [uri], client_name: 'Claude' }),
    });
    ok(`registro que volta para ${new URL(uri).host} é recusado`, deFora.status === 400);
  }
  const ruim = await fetch(meta.registration_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ redirect_uris: ['http://evil.com/cb'], client_name: 'Mau' }),
  });
  ok('registro com endereço http de fora é recusado', ruim.status === 400);
  const VOLTA = 'https://claude.ai/api/mcp/auth_callback';
  const reg = await json(
    await fetch(meta.registration_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ redirect_uris: [VOLTA], client_name: 'Claude', token_endpoint_auth_method: 'client_secret_post' }),
    })
  );
  ok('registro do Claude devolve client_id e client_secret', typeof reg.client_id === 'string' && typeof reg.client_secret === 'string');
  const regPublico = await json(
    await fetch(meta.registration_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ redirect_uris: ['http://localhost:6274/oauth/callback'], client_name: 'Inspetor local', token_endpoint_auth_method: 'none' }),
    })
  );
  ok('cliente público (só PKCE) não recebe segredo', !!regPublico.client_id && !regPublico.client_secret);

  console.log('\nAutorização');
  const autorizar = async (extra: Record<string, string> = {}, clientId = reg.client_id, volta = VOLTA) => {
    const verificador = novoSegredo(40);
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: volta,
      code_challenge: desafioDoPkce(verificador),
      code_challenge_method: 'S256',
      state: 'estado-123',
      scope: 'agenda',
      ...extra,
    });
    const r = await fetch(`${meta.authorization_endpoint}?${params}`, { redirect: 'manual' });
    return { r, verificador, local: r.headers.get('location') || '' };
  };
  const desvio = await autorizar({ redirect_uri: 'https://claude.ai/outro-caminho' });
  ok('endereço de volta diferente do registrado: página de erro, sem redirecionar', desvio.r.status === 400 && !desvio.local);
  const semPkce = await autorizar({ code_challenge_method: 'plain' });
  ok('sem PKCE S256: volta ao app com erro', semPkce.r.status === 302 && semPkce.local.startsWith(VOLTA) && semPkce.local.includes('error=invalid_request'));
  const escopoRuim = await autorizar({ scope: 'tudo' });
  ok('escopo desconhecido: invalid_scope', escopoRuim.local.includes('error=invalid_scope'));

  const pedido1 = await autorizar();
  const idDoPedido = new URL(pedido1.local).searchParams.get('autorizar-claude') || '';
  ok('autorizar manda para o painel', pedido1.r.status === 302 && pedido1.local.startsWith(`${BASE}/?autorizar-claude=`) && idDoPedido.length > 20);

  const verPedido = (login?: string) =>
    fetch(`${BASE}/api/claude/oauth/pedido/${idDoPedido}`, { headers: login ? { Authorization: `Bearer ${login}` } : {} });
  ok('o painel sem login não lê o pedido', (await verPedido()).status === 401);
  ok('login sem clínica não pode conectar', (await verPedido('painel-sem-clinica')).status === 403);
  const lido = await json(await verPedido('painel-joao'));
  ok('o painel vê quem pede e para onde volta (app registrado: não verificado)', lido.aplicativo === 'Claude' && lido.destino === 'claude.ai' && lido.verificado === false && lido.entrarDeNovo === false, JSON.stringify(lido));
  ok('sessão antiga: o painel pede para entrar de novo', (await json(await verPedido('painel-joao-antigo'))).entrarDeNovo === true);

  const decidir = (pedido: string, permitir: boolean, login = 'painel-joao') =>
    fetch(`${BASE}/api/claude/oauth/decidir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${login}` },
      body: JSON.stringify({ pedido, permitir }),
    });
  const antiga = await decidir(idDoPedido, true, 'painel-joao-antigo');
  ok('Permitir com sessão antiga é recusado (e o pedido continua valendo)', antiga.status === 401 && (await json(antiga)).erro === 'login-recente');
  const decisao = await json(await decidir(idDoPedido, true));
  const volta = new URL(decisao.redirecionar);
  const codigo = volta.searchParams.get('code') || '';
  ok('permitir volta ao Claude com código, state e emissor', volta.origin + volta.pathname === VOLTA && !!codigo && volta.searchParams.get('state') === 'estado-123' && volta.searchParams.get('iss') === BASE);
  ok('o mesmo pedido não decide duas vezes', (await decidir(idDoPedido, true)).status === 410);

  const recusa = await autorizar();
  const recusado = await json(await decidir(new URL(recusa.local).searchParams.get('autorizar-claude') || '', false));
  ok('recusar volta ao Claude com access_denied', String(recusado.redirecionar).includes('error=access_denied'));

  const vencido = await autorizar();
  relogio += 11 * 60 * 1000;
  ok('pedido de mais de 10 minutos vence', (await decidir(new URL(vencido.local).searchParams.get('autorizar-claude') || '', true)).status === 410);
  relogio = INSTANTE.getTime();

  console.log('\nIdentidade publicada do Claude (client_id é um endereço)');
  ok('os metadados anunciam a identidade publicada e o cliente público', meta.client_id_metadata_document_supported === true && meta.token_endpoint_auth_methods_supported.includes('none'));
  const publicado = await autorizar({}, ID_PUBLICADO);
  ok('autorizar com a identidade publicada manda para o painel', publicado.local.startsWith(`${BASE}/?autorizar-claude=`) && documentosBuscados.includes(ID_PUBLICADO), publicado.local);
  const lidoPublicado = await json(await fetch(`${BASE}/api/claude/oauth/pedido/${new URL(publicado.local).searchParams.get('autorizar-claude')}`, { headers: { Authorization: 'Bearer painel-joao' } }));
  ok('o painel mostra o Claude como verificado', lidoPublicado.aplicativo === 'Claude' && lidoPublicado.destino === 'claude.ai' && lidoPublicado.verificado === true);
  const codigoPublicado = new URL((await json(await decidir(new URL(publicado.local).searchParams.get('autorizar-claude') || '', true))).redirecionar).searchParams.get('code') || '';
  const tokensPublicados = await json(
    await fetch(meta.token_endpoint, form({ grant_type: 'authorization_code', code: codigoPublicado, code_verifier: publicado.verificador, client_id: ID_PUBLICADO, redirect_uri: VOLTA }))
  );
  ok('troca sem segredo, só com PKCE', typeof tokensPublicados.access_token === 'string', JSON.stringify(tokensPublicados).slice(0, 80));
  const code = await autorizar({ redirect_uri: 'http://localhost:53712/callback' }, ID_DO_CLAUDE_CODE);
  ok('Claude Code (porta livre na própria máquina) também conecta', code.local.startsWith(`${BASE}/?autorizar-claude=`), code.local);
  documentoDoClaudeCode = { client_id: 'https://claude.ai/oauth/outro', redirect_uris: ['http://localhost/callback'] };
  relogio += 6 * 60 * 1000; // o documento lido fica guardado por 5 minutos
  const mentiroso = await autorizar({ redirect_uri: 'http://localhost:53712/callback' }, ID_DO_CLAUDE_CODE);
  ok('documento que diz ser outro client_id: recusado', mentiroso.r.status === 400 && !mentiroso.local);
  relogio = INSTANTE.getTime();
  for (const id of ['https://site-qualquer.com/cliente.json', 'https://claude.ai/oauth/qualquer-outro']) {
    const deFora = await autorizar({}, id);
    ok(`documento fora da lista (${id}) nem é buscado`, deFora.r.status === 400 && !documentosBuscados.includes(id));
  }

  console.log('\nTroca do código');
  const trocar = (dados: Record<string, string>) => fetch(meta.token_endpoint, form(dados));
  const semSegredo = await trocar({ grant_type: 'authorization_code', code: codigo, code_verifier: pedido1.verificador, client_id: reg.client_id, redirect_uri: VOLTA });
  ok('cliente confidencial sem segredo: invalid_client', semSegredo.status === 401);

  // Um código separado para o verificador errado: o código é de uso único, e errar o gasta.
  const outro = await autorizar();
  const outroCodigo = new URL((await json(await decidir(new URL(outro.local).searchParams.get('autorizar-claude') || '', true))).redirecionar).searchParams.get('code') || '';
  const verificadorErrado = await json(
    await trocar({ grant_type: 'authorization_code', code: outroCodigo, code_verifier: novoSegredo(40), client_id: reg.client_id, client_secret: reg.client_secret, redirect_uri: VOLTA })
  );
  ok('verificador do PKCE errado: invalid_grant', verificadorErrado.error === 'invalid_grant');

  const tokens = await json(
    await trocar({ grant_type: 'authorization_code', code: codigo, code_verifier: pedido1.verificador, client_id: reg.client_id, client_secret: reg.client_secret, redirect_uri: VOLTA })
  );
  ok('código certo: acesso e renovação', typeof tokens.access_token === 'string' && typeof tokens.refresh_token === 'string' && tokens.expires_in === 3600);

  // Código usado duas vezes: alguém o interceptou. Com outro código, para não derrubar `tokens`.
  const pedidoD = await autorizar();
  const codigoD = new URL((await json(await decidir(new URL(pedidoD.local).searchParams.get('autorizar-claude') || '', true))).redirecionar).searchParams.get('code') || '';
  const dadosD = { grant_type: 'authorization_code', code: codigoD, code_verifier: pedidoD.verificador, client_id: reg.client_id, client_secret: reg.client_secret, redirect_uri: VOLTA };
  const tokensD = await json(await trocar(dadosD));
  const deNovo = await json(await trocar(dadosD));
  ok('código usado duas vezes: invalid_grant', deNovo.error === 'invalid_grant');

  // ---------- MCP ----------
  let acesso = tokens.access_token as string;
  let numero = 1;
  const rpc = async (method: string, params: unknown = {}, token = acesso) => {
    const r = await fetch(`${BASE}/api/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${token}`,
        'Mcp-Protocol-Version': '2025-06-18',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: numero++, method, params }),
    });
    return { status: r.status, corpo: await json(r) };
  };
  const ferramenta = async (nome: string, args: Record<string, unknown> = {}, token = acesso) => {
    const { corpo } = await rpc('tools/call', { name: nome, arguments: args }, token);
    const texto = corpo?.result?.content?.[0]?.text ?? '';
    let dados: any = null;
    try {
      dados = JSON.parse(texto);
    } catch {
      dados = null;
    }
    return { erro: !!corpo?.result?.isError, texto, dados, corpo };
  };

  console.log('\nConector (MCP)');
  // Pacientes e um agendamento feito pelo painel, sem link.
  clinicaA.pacientesDb.set('pat-1', { id: 'pat-1', nome: 'Jéssica Mendes', contato: '(19) 98888-7777', createdAt: '' });
  clinicaA.pacientesDb.set('pat-2', { id: 'pat-2', nome: 'Franciane Farinha', contato: '19 97777-6666', createdAt: '' });
  clinicaA.pacientesDb.set('pat-3', { id: 'pat-3', nome: 'Jessica Antiga', contato: '19 95555-4444', createdAt: '', juntadoA: 'pat-1' });
  clinicaA.atendimentos.set('atd-painel', {
    id: 'atd-painel',
    pacienteId: 'pat-2',
    pacienteNome: 'Franciane Farinha',
    data: '2026-11-27',
    hora: '14:00',
    procedureId: 'proc-hg',
    procedimentoNome: 'Harmonização Glútea',
    professionalId: 'prof-k',
    profissionalNome: 'Dra. Karoline Ferreira',
    salaId: 'sala-laser',
    status: 'agendado',
    observacoes: 'Paciente com alergia a látex',
    createdAt: '',
  });
  clinicaB.pacientesDb.set('pat-b', { id: 'pat-b', nome: 'Jéssica da Outra', contato: '11 91111-2222', createdAt: '' });

  const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'teste', version: '1' } });
  ok('initialize responde, com as instruções', init.status === 200 && !!init.corpo?.result?.instructions, String(init.status));
  const lista = await rpc('tools/list');
  const nomes = (lista.corpo?.result?.tools || []).map((t: { name: string }) => t.name).sort();
  ok('as 6 ferramentas', nomes.join(',') === 'buscar_pacientes,cadastrar_paciente,criar_agendamento,gerar_link_de_confirmacao,ver_agenda,ver_opcoes_de_agendamento', nomes.join(','));

  const opcoes = await ferramenta('ver_opcoes_de_agendamento');
  ok(
    'opções: hoje, profissionais, procedimentos com focos, sem arquivado',
    opcoes.dados?.hoje === '2026-11-25' &&
      opcoes.dados?.profissionais?.length === 2 &&
      opcoes.dados?.procedimentos?.find((p: any) => p.id === 'proc-hg')?.focos?.join() === 'Fase 1,Fase 2' &&
      !opcoes.dados?.procedimentos?.some((p: any) => p.id === 'proc-velho'),
    opcoes.texto.slice(0, 120)
  );

  const busca = await ferramenta('buscar_pacientes', { busca: 'jessica' });
  ok('busca sem acento acha "Jéssica", e não a juntada', busca.dados?.pacientes?.length === 1 && busca.dados.pacientes[0].id === 'pat-1');
  const porTelefone = await ferramenta('buscar_pacientes', { busca: '7777-6666' });
  ok('busca pelo telefone', porTelefone.dados?.pacientes?.[0]?.id === 'pat-2');
  const daOutra = await ferramenta('buscar_pacientes', { busca: 'outra' });
  ok('a clínica A não vê pacientes da clínica B', daOutra.dados?.total === 0);

  const repetida = await ferramenta('cadastrar_paciente', { nome: 'Jessica M.', telefone: '19988887777' });
  ok('cadastro com telefone já cadastrado não duplica', repetida.dados?.cadastrada === false && repetida.dados?.parecidas?.[0]?.id === 'pat-1');
  const telRuim = await ferramenta('cadastrar_paciente', { nome: 'Maria Teste', telefone: '9999-8888 ramal' });
  const nova = await ferramenta('cadastrar_paciente', { nome: 'Adriana Lino', telefone: '(19) 94444-3333' });
  ok('cadastro novo', nova.dados?.cadastrada === true && clinicaA.pacientesDb.has(nova.dados.paciente.id) && clinicaA.uso.clientes === 1);
  ok('telefone sem DDD é recusado', telRuim.erro && telRuim.texto.includes('DDD'), telRuim.texto.slice(0, 100));
  clinicaB.plano = 'gratuito';
  clinicaB.uso.clientes = 5;

  const agenda = await ferramenta('ver_agenda', { data_inicial: '2026-11-27', profissional_id: 'prof-k' });
  const sexta = agenda.dados?.dias?.[0];
  ok('agenda de sexta: o atendimento do painel, sem as observações internas', sexta?.atendimentos?.length === 1 && sexta.atendimentos[0].fim === '15:00' && !JSON.stringify(agenda.dados).includes('látex'));
  ok('horários livres: sem 14:00 (ocupado) e sem 12:00 (almoço), com 09:00', !sexta?.horarios_livres?.includes('14:00') && !sexta?.horarios_livres?.includes('12:00') && sexta?.horarios_livres?.includes('09:00'));
  const hoje = await ferramenta('ver_agenda', { data_inicial: '2026-11-25' });
  ok('hoje às 11:00 (Brasília): 10:30 não é mais livre, 11:00 é', !hoje.dados?.dias?.[0]?.horarios_livres?.includes('10:30') && hoje.dados?.dias?.[0]?.horarios_livres?.includes('11:00'));
  ok('mais de 14 dias é recusado', (await ferramenta('ver_agenda', { data_inicial: '2026-11-25', data_final: '2026-12-20' })).erro);

  console.log('\nAgendar');
  const pedidoBase = {
    paciente_id: 'pat-1',
    procedimentos: [{ procedimento_id: 'proc-hg', focos: ['fase 1'] }],
    profissional_id: 'prof-k',
    data: '2026-11-27',
    hora: '10:00',
    observacoes: 'Prefere ser chamada de Jéssi',
  };
  ok('horário que já passou é recusado', (await ferramenta('criar_agendamento', { ...pedidoBase, data: '2026-11-25', hora: '09:00' })).erro);
  ok('foco que não existe é recusado, com a lista dos que existem', (await ferramenta('criar_agendamento', { ...pedidoBase, procedimentos: [{ procedimento_id: 'proc-hg', focos: ['Fase 9'] }] })).texto.includes('Fase 1, Fase 2'));
  ok('id inventado é recusado', (await ferramenta('criar_agendamento', { ...pedidoBase, paciente_id: 'pat-inventada' })).erro);
  const salaOcupada = await ferramenta('criar_agendamento', { ...pedidoBase, hora: '14:30', profissional_id: 'prof-a', sala_id: 'sala-laser', confirmar_avisos: true });
  ok('sala ocupada impede, mesmo confirmando avisos', salaOcupada.erro && salaOcupada.texto.includes('Sala do laser'));
  const antes = clinicaA.atendimentos.size;
  const comAviso = await ferramenta('criar_agendamento', { ...pedidoBase, hora: '14:30' });
  ok('profissional ocupada: precisa confirmar, e nada é gravado', comAviso.dados?.precisa_confirmar === true && clinicaA.atendimentos.size === antes, comAviso.texto.slice(0, 160));
  const almoco = await ferramenta('criar_agendamento', { ...pedidoBase, hora: '11:30' });
  ok('horário que invade o almoço pede confirmação', almoco.dados?.precisa_confirmar === true && almoco.texto.includes('almoço'));
  const outraProfissional = await ferramenta('criar_agendamento', { ...pedidoBase, profissional_id: 'prof-a' });
  ok('profissional fora das do procedimento pede confirmação', outraProfissional.dados?.precisa_confirmar === true);

  clinicaA.contas = { 'prof-k': { email: 'k@gmail.com', calendarioId: 'cal-k', tokenCifrado: 'v1.cifrado', conectadoEm: '' } };
  const feito = await ferramenta('criar_agendamento', pedidoBase);
  ok('agendado', feito.dados?.agendado === true, feito.texto.slice(0, 200));
  if (process.env.MOSTRAR) console.log(opcoes.texto, '\n', agenda.texto, '\n', comAviso.texto, '\n', feito.texto);
  const link = new URL(feito.dados?.link_de_confirmacao || 'http://x');
  const token = link.searchParams.get('agendamento') || '';
  ok('link com o token e a clínica (c=clinA)', !!token && link.searchParams.get('c') === 'clinA' && link.origin === 'https://drakaroline-lavie.ai.studio', link.toString());
  const criado = [...clinicaA.atendimentos.values()].find((a) => a.linkToken === token);
  ok(
    'atendimento como o painel grava',
    !!criado && criado.status === 'agendado' && criado.hora === '10:00' && criado.duracaoMin === 60 && criado.focos?.join() === 'Fase 1' && criado.profissionalNome === 'Dra. Karoline Ferreira' && criado.observacoes === 'Prefere ser chamada de Jéssi' && !criado.grupoId,
    JSON.stringify(criado)
  );
  const doc = clinicaA.links.get(token) || {};
  const textoDoLink = JSON.stringify(doc);
  ok(
    'o link público não leva observação, telefone, id da paciente nem foto em base64',
    !textoDoLink.includes('Jéssi"') && !textoDoLink.includes('Prefere') && !textoDoLink.includes('98888') && !textoDoLink.includes('pat-1') && !textoDoLink.includes('data:image') && (doc as any).clientePrimeiroNome === 'Jéssica' && (doc as any).situacao === 'ativo' && (doc as any).respostaPendente === false,
    textoDoLink.slice(0, 200)
  );
  ok('mensagem do WhatsApp com o link, para o telefone dela', String(feito.dados?.mensagem_whatsapp).includes(feito.dados?.link_de_confirmacao) && String(feito.dados?.abrir_whatsapp).startsWith('https://wa.me/5519988887777?text='));
  ok('enviado ao Google Agenda da Dra. Karoline, com a marca no atendimento', enviosAoGoogle.length === 1 && enviosAoGoogle[0].calendario === 'cal-k' && !!criado?.googleAgenda?.assinatura && feito.dados?.google_agenda?.includes('enviado'));

  const visita = await ferramenta('criar_agendamento', {
    paciente_id: 'pat-2',
    procedimentos: [{ procedimento_id: 'proc-botox' }, { procedimento_id: 'avaliacao' }],
    profissional_id: 'prof-a',
    data: '2026-11-30',
    hora: '15:00',
  });
  const membros = [...clinicaA.atendimentos.values()].filter((a) => a.data === '2026-11-30').sort((a, b) => a.id.localeCompare(b.id));
  ok(
    'dois procedimentos: um atendimento cada, em sequência, mesmo grupo e mesmo link',
    visita.dados?.agendado === true && membros.length === 2 && membros[0].hora === '15:00' && membros[1].hora === '15:30' && !!membros[0].grupoId && membros[0].grupoId === membros[1].grupoId && membros[0].linkToken === membros[1].linkToken,
    JSON.stringify(membros.map((m) => [m.hora, m.procedimentoNome]))
  );
  ok('o link da visita lista os dois atendimentos', JSON.stringify(clinicaA.links.get(membros[0]?.linkToken || '')?.attendanceIds) === JSON.stringify(membros.map((m) => m.id)));
  ok('profissional sem Google Agenda: agenda mesmo assim e avisa', String(visita.dados?.google_agenda).includes('não conectou'));

  const linkDoPainel = await ferramenta('gerar_link_de_confirmacao', { atendimento_id: 'atd-painel' });
  const tokenDoPainel = clinicaA.atendimentos.get('atd-painel')?.linkToken;
  ok('link para agendamento feito no painel', !!tokenDoPainel && String(linkDoPainel.dados?.link_de_confirmacao).includes(tokenDoPainel!) && clinicaA.links.has(tokenDoPainel!));
  const deNovoLink = await ferramenta('gerar_link_de_confirmacao', { atendimento_id: 'atd-painel' });
  ok('pedir de novo devolve o mesmo link', deNovoLink.dados?.link_de_confirmacao === linkDoPainel.dados?.link_de_confirmacao);

  ok('…e o acesso que nasceu daquele código deixa de valer', (await rpc('tools/list', {}, tokensD.access_token)).status === 401);

  ok('o acesso da identidade publicada usa o conector', (await ferramenta('buscar_pacientes', { busca: 'franciane' }, tokensPublicados.access_token)).dados?.total === 1);

  console.log('\nOutra clínica');
  const pedidoB = await autorizar();
  const codigoB = new URL((await json(await decidir(new URL(pedidoB.local).searchParams.get('autorizar-claude') || '', true, 'painel-outra'))).redirecionar).searchParams.get('code') || '';
  const tokensB = await json(await trocar({ grant_type: 'authorization_code', code: codigoB, code_verifier: pedidoB.verificador, client_id: reg.client_id, client_secret: reg.client_secret }));
  const buscaB = await ferramenta('buscar_pacientes', { busca: 'jessica' }, tokensB.access_token);
  ok('o acesso da clínica B só vê a clínica B', buscaB.dados?.pacientes?.length === 1 && buscaB.dados.pacientes[0].id === 'pat-b');
  ok('a clínica B não gera link de atendimento da A', (await ferramenta('gerar_link_de_confirmacao', { atendimento_id: 'atd-painel' }, tokensB.access_token)).erro);
  const limite = await ferramenta('cadastrar_paciente', { nome: 'Nova da B', telefone: '11 92222-3333' }, tokensB.access_token);
  ok('plano gratuito no limite: não cadastra, e diz por quê', limite.erro && limite.texto.includes('limite'));

  console.log('\nRenovação e revogação');
  const renovar = (rt: string) => trocar({ grant_type: 'refresh_token', refresh_token: rt, client_id: reg.client_id, client_secret: reg.client_secret });
  const [paralela1, paralela2] = await Promise.all([json(await renovar(tokens.refresh_token)), json(await renovar(tokens.refresh_token))]);
  ok('duas renovações ao mesmo tempo: as duas recebem um par novo', typeof paralela1.access_token === 'string' && typeof paralela2.access_token === 'string', JSON.stringify([paralela1.error, paralela2.error]));
  ok('e os dois acessos funcionam', (await rpc('tools/list', {}, paralela1.access_token)).status === 200 && (await rpc('tools/list', {}, paralela2.access_token)).status === 200);
  const novos = paralela1;
  ok('renovação emite acesso e renovação novos', novos.refresh_token !== tokens.refresh_token);
  relogio += 2 * 60 * 1000;
  const reuso = await json(await renovar(tokens.refresh_token));
  ok('a mesma renovação depois de 2 minutos: invalid_grant', reuso.error === 'invalid_grant');
  ok('…e derruba a família inteira (o acesso novo para de valer)', (await rpc('tools/list', {}, novos.access_token)).status === 401);
  ok('renovação de outro app não serve', (await json(await fetch(meta.token_endpoint, form({ grant_type: 'refresh_token', refresh_token: tokensB.refresh_token, client_id: regPublico.client_id })))).error === 'invalid_grant');

  console.log('\nAuthentication fora do ar (não pode desconectar ninguém)');
  relogio += 6 * 60 * 1000;
  authenticationForaDoAr = true;
  const foraDoAr = await rpc('tools/list', {}, tokensB.access_token);
  ok('chamada ao conector: 503, e não 401', foraDoAr.status === 503, String(foraDoAr.status));
  const renovacaoForaDoAr = await renovar(tokensB.refresh_token);
  ok('renovação: 503 temporarily_unavailable, e não invalid_grant', renovacaoForaDoAr.status === 503 && (await json(renovacaoForaDoAr)).error === 'temporarily_unavailable');
  authenticationForaDoAr = false;
  ok('voltou: o acesso funciona de novo', (await rpc('tools/list', {}, tokensB.access_token)).status === 200);
  relogio -= 6 * 60 * 1000;

  relogio += 61 * 60 * 1000;
  ok('acesso vencido (1 hora): 401', (await rpc('tools/list', {}, tokensB.access_token)).status === 401);
  const renovadoB = await json(await renovar(tokensB.refresh_token));
  ok('mas a renovação ainda vale', typeof renovadoB.access_token === 'string');
  acesso = renovadoB.access_token;

  ativos.delete('uid-outra');
  relogio += 6 * 60 * 1000;
  ok('login desativado na Equipe: o acesso para de valer', (await rpc('tools/list', {}, acesso)).status === 401);
  ok('e a renovação também', (await json(await renovar(renovadoB.refresh_token))).error === 'invalid_grant');
  ativos.set('uid-outra', 'clinB');

  const pedidoC = await autorizar();
  const codigoC = new URL((await json(await decidir(new URL(pedidoC.local).searchParams.get('autorizar-claude') || '', true))).redirecionar).searchParams.get('code') || '';
  const tokensC = await json(await trocar({ grant_type: 'authorization_code', code: codigoC, code_verifier: pedidoC.verificador, client_id: reg.client_id, client_secret: reg.client_secret }));
  await fetch(meta.revocation_endpoint, form({ token: tokensC.refresh_token, client_id: reg.client_id, client_secret: reg.client_secret }));
  ok('revogar a renovação corta também o acesso', (await rpc('tools/list', {}, tokensC.access_token)).status === 401);

  const pedidoE = await autorizar();
  const codigoE = new URL((await json(await decidir(new URL(pedidoE.local).searchParams.get('autorizar-claude') || '', true))).redirecionar).searchParams.get('code') || '';
  const tokensE = await json(await trocar({ grant_type: 'authorization_code', code: codigoE, code_verifier: pedidoE.verificador, client_id: reg.client_id, client_secret: reg.client_secret }));
  ok('acesso novo do João funciona', (await rpc('tools/list', {}, tokensE.access_token)).status === 200);
  sessoesEncerradasEm.set('uid-joao', relogio + 1000);
  relogio += 6 * 60 * 1000;
  ok('senha trocada (sessões encerradas depois da autorização): o acesso cai', (await rpc('tools/list', {}, tokensE.access_token)).status === 401);
  ok('e a renovação também', (await json(await renovar(tokensE.refresh_token))).error === 'invalid_grant');

  console.log('\nAutorização vale no máximo 90 dias');
  sessoesEncerradasEm.delete('uid-joao');
  const inicioF = relogio;
  const pedidoF = await autorizar();
  const codigoF = new URL((await json(await decidir(new URL(pedidoF.local).searchParams.get('autorizar-claude') || '', true))).redirecionar).searchParams.get('code') || '';
  const tokensF = await json(await trocar({ grant_type: 'authorization_code', code: codigoF, code_verifier: pedidoF.verificador, client_id: reg.client_id, client_secret: reg.client_secret }));
  relogio = inicioF + 50 * 24 * 60 * 60 * 1000;
  const aos50 = await json(await renovar(tokensF.refresh_token));
  ok('aos 50 dias, renova', typeof aos50.access_token === 'string');
  relogio = inicioF + 89.99 * 24 * 60 * 60 * 1000;
  const quase = await json(await renovar(aos50.refresh_token));
  ok('perto dos 90, o acesso emitido vence junto com a autorização', typeof quase.access_token === 'string' && quase.expires_in <= 15 * 60, String(quase.expires_in));
  relogio = inicioF + 91 * 24 * 60 * 60 * 1000;
  ok('aos 91 dias, não renova mais: conectar de novo', (await json(await renovar(quase.refresh_token))).error === 'invalid_grant');

  const guardados = [...armazem.concessoes.keys()];
  ok('o banco guarda só o hash dos segredos', guardados.every((h) => /^[0-9a-f]{64}$/.test(h)) && !guardados.includes(tokensC.access_token));
}

principal()
  .catch((e) => {
    console.error(e);
    falhas++;
  })
  .finally(() => {
    servidor.close();
    console.log(falhas === 0 ? '\nTudo certo.' : `\n${falhas} falha(s).`);
    process.exit(falhas === 0 ? 0 : 1);
  });

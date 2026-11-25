import crypto from 'node:crypto';
import express, { type Request, type Response, type Router } from 'express';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { ehZulia } from '../src/lib/projetoFirebase';
import { ENDERECO_DO_SITE } from '../src/utils/publicLinks';
import { authAdmin, bancoAdmin } from './firebaseAdmin';
import { loginDoPedido, type LoginDoPainel, type Papel } from './login';
import { registrarAcesso } from './registrosDeAcesso';

/**
 * O login do conector do Claude: o OAuth 2.1 que o Claude exige para um conector personalizado.
 *
 * Como funciona, do lado de quem usa:
 *   1. No Claude, a pessoa adiciona o conector com o endereço `<site>/api/mcp`.
 *   2. O Claude se identifica — pela "identidade publicada" (um documento de metadados do
 *      cliente em claude.ai, o padrão do Claude) ou se registrando aqui (`/registrar`, registro
 *      dinâmico) — e abre `/autorizar`, que manda para o **próprio painel**:
 *      `<site>/?autorizar-claude=<pedido>`.
 *   3. O painel pede o login de sempre (com o segundo fator, se a conta tiver) e mostra
 *      "Conectar o Claude à agenda da <clínica>?". Ao permitir, o painel manda o pedido e o login
 *      para `/decidir`, e o servidor devolve o endereço de volta ao Claude, com um código.
 *   4. O Claude troca o código por um acesso (`/token`), que vale 1 hora e é renovado sozinho
 *      (até 60 dias sem uso, e no máximo 90 dias desde o Permitir — depois, conectar de novo).
 *      Cada chamada ao conector (`/api/mcp`) leva esse acesso.
 *
 * Por que o login é o do painel, e não uma senha nova: o acesso do Claude é o da pessoa que
 * conectou — da clínica dela, pela claim `clinicaId`. Desativar o login dela na Equipe corta o
 * Claude também (`aindaPodeUsar`, conferido a cada chamada).
 *
 * O que fica no banco (coleções na raiz, fechadas pelas regras — só o servidor lê):
 *   - `conector_claude_clientes`: os apps registrados (o Claude), com o endereço de volta;
 *   - `conector_claude_pedidos`: o pedido entre o `/autorizar` e a decisão no painel (10 min);
 *   - `conector_claude_tokens`: código, acesso e renovação, **pelo hash** — quem lê o banco não
 *     consegue usar nenhum deles.
 *
 * Rotas:
 *   GET  /.well-known/oauth-protected-resource[/api/mcp]   → onde está o servidor de autorização
 *   GET  /.well-known/oauth-authorization-server           → os endereços abaixo
 *   POST /api/claude/oauth/registrar                       → registro dinâmico (RFC 7591)
 *   GET  /api/claude/oauth/autorizar                       → manda para o painel
 *   GET  /api/claude/oauth/pedido/:id                      → o painel lê o pedido (login do painel)
 *   POST /api/claude/oauth/decidir                         → permitir ou recusar (login do painel)
 *   POST /api/claude/oauth/token                           → código ou renovação → acesso
 *   POST /api/claude/oauth/revogar                         → apaga acesso e renovação
 *
 * Ver docs/conector-claude.md.
 */

export const ESCOPO_DO_CONECTOR = 'agenda';
export const CAMINHO_DO_MCP = '/api/mcp';
const BASE_DAS_ROTAS = '/api/claude/oauth';

const PEDIDO_VALE_MS = 10 * 60 * 1000;
const CODIGO_VALE_MS = 5 * 60 * 1000;
const ACESSO_VALE_S = 60 * 60;
const RENOVACAO_VALE_MS = 60 * 24 * 60 * 60 * 1000;
/** Uma autorização vale no máximo isto, renovando ou não: depois, conectar de novo. */
const AUTORIZACAO_VALE_MS = 90 * 24 * 60 * 60 * 1000;
/**
 * Renovação apresentada de novo até este tempo depois do primeiro uso: duas renovações ao mesmo
 * tempo (o Claude renova antes de vencer e também depois de um 401) ou a repetição de um pedido
 * cuja resposta se perdeu. Ganha um par novo, em vez de derrubar a conexão.
 */
const REUSO_TOLERADO_MS = 60 * 1000;
/** Permitir exige ter digitado a senha há pouco: não basta uma sessão esquecida aberta. */
const LOGIN_RECENTE_MS = 15 * 60 * 1000;
/** App registrado sozinho que nunca chegou a trocar um código some depois disto. */
const CLIENTE_SEM_USO_VALE_MS = 24 * 60 * 60 * 1000;
/** Quanto tempo vale a conferência de que o login continua ativo e na mesma clínica. */
const CONFERENCIA_VALE_MS = 5 * 60 * 1000;

// ==========================================
// O QUE FICA GUARDADO
// ==========================================

export type MetodoDoCliente = 'none' | 'client_secret_post' | 'client_secret_basic';

export interface ClienteRegistrado {
  clientId: string;
  nome: string;
  redirectUris: string[];
  metodo: MetodoDoCliente;
  /** SHA-256 da chave do cliente; ausente no cliente público (`none`, só PKCE). */
  segredoHash?: string;
  criadoEm: string;
  /** Registrado aqui e ainda sem uso: some nesta data (ms). Apagado no primeiro código trocado. */
  expiraEm?: number;
  /** Cliente da identidade publicada do Claude (documento em claude.ai), e não registrado aqui. */
  publicado?: boolean;
}

export interface PedidoDeAutorizacao {
  id: string;
  clientId: string;
  redirectUri: string;
  state?: string;
  codeChallenge: string;
  escopo: string;
  /** Milissegundos desde 1970. */
  expiraEm: number;
  usadoEm?: number;
}

/** Código, acesso ou renovação. Guardado pelo hash do valor. */
export interface Concessao {
  tipo: 'codigo' | 'acesso' | 'renovacao';
  uid: string;
  email: string | null;
  clinicaId: string | null;
  papel: Papel | null;
  clientId: string;
  escopo: string;
  /** Todos os acessos e renovações nascidos de uma mesma autorização. Revogar é por família. */
  familia: string;
  /** Quando a pessoa tocou em Permitir (ms). Sessões do login encerradas depois disso derrubam a família. */
  autorizadoEm: number;
  expiraEm: number;
  usadoEm?: number;
  /** Só no código: o endereço de volta e o desafio do PKCE. */
  redirectUri?: string;
  codeChallenge?: string;
}

/**
 * Onde o login do conector guarda o que precisa. Há a versão do Firestore (no ar) e a da memória
 * (`armazemNaMemoria`, para o `scripts/verificar-conector-claude.ts`).
 */
export interface ArmazemDoConector {
  lerCliente(clientId: string): Promise<ClienteRegistrado | null>;
  gravarCliente(cliente: ClienteRegistrado): Promise<void>;
  /** O app registrado trocou um código: deixa de vencer. */
  marcarClienteUsado(clientId: string): Promise<void>;
  gravarPedido(pedido: PedidoDeAutorizacao): Promise<void>;
  lerPedido(id: string): Promise<PedidoDeAutorizacao | null>;
  /** Marca o pedido como usado e o devolve como estava antes; `null` se não existe. Atômico. */
  consumirPedido(id: string, agora: number): Promise<PedidoDeAutorizacao | null>;
  gravarConcessao(hash: string, concessao: Concessao): Promise<void>;
  lerConcessao(hash: string): Promise<Concessao | null>;
  /** Marca como usada e devolve como estava antes; `null` se não existe. Atômico. */
  consumirConcessao(hash: string, agora: number): Promise<Concessao | null>;
  revogarFamilia(familia: string): Promise<void>;
  /** Apaga pedidos, concessões e apps sem uso vencidos, aos poucos. */
  faxina(agora: number): Promise<void>;
}

const COLECAO_CLIENTES = 'conector_claude_clientes';
const COLECAO_PEDIDOS = 'conector_claude_pedidos';
const COLECAO_TOKENS = 'conector_claude_tokens';

const semIndefinidos = <T extends object>(obj: T): T =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;

export function armazemNoFirestore(db: Firestore): ArmazemDoConector {
  const consumir = async <T extends { usadoEm?: number }>(colecao: string, id: string, agora: number) => {
    const ref = db.collection(colecao).doc(id);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const antes = snap.data() as T;
      if (!antes.usadoEm) tx.update(ref, { usadoEm: agora });
      return antes;
    });
  };
  return {
    async lerCliente(clientId) {
      const snap = await db.collection(COLECAO_CLIENTES).doc(clientId).get();
      return snap.exists ? (snap.data() as ClienteRegistrado) : null;
    },
    async gravarCliente(cliente) {
      await db.collection(COLECAO_CLIENTES).doc(cliente.clientId).create(semIndefinidos(cliente));
    },
    async marcarClienteUsado(clientId) {
      await db.collection(COLECAO_CLIENTES).doc(clientId).update({ expiraEm: FieldValue.delete() });
    },
    async gravarPedido(pedido) {
      await db.collection(COLECAO_PEDIDOS).doc(pedido.id).create(semIndefinidos(pedido));
    },
    async lerPedido(id) {
      const snap = await db.collection(COLECAO_PEDIDOS).doc(id).get();
      return snap.exists ? (snap.data() as PedidoDeAutorizacao) : null;
    },
    consumirPedido: (id, agora) => consumir<PedidoDeAutorizacao>(COLECAO_PEDIDOS, id, agora),
    async gravarConcessao(hash, concessao) {
      await db.collection(COLECAO_TOKENS).doc(hash).create(semIndefinidos(concessao));
    },
    async lerConcessao(hash) {
      const snap = await db.collection(COLECAO_TOKENS).doc(hash).get();
      return snap.exists ? (snap.data() as Concessao) : null;
    },
    consumirConcessao: (hash, agora) => consumir<Concessao>(COLECAO_TOKENS, hash, agora),
    async revogarFamilia(familia) {
      const snap = await db.collection(COLECAO_TOKENS).where('familia', '==', familia).get();
      if (snap.empty) return;
      const lote = db.batch();
      snap.docs.forEach((d) => lote.delete(d.ref));
      await lote.commit();
    },
    async faxina(agora) {
      for (const colecao of [COLECAO_PEDIDOS, COLECAO_TOKENS, COLECAO_CLIENTES]) {
        const vencidos = await db.collection(colecao).where('expiraEm', '<', agora).limit(200).get();
        if (vencidos.empty) continue;
        const lote = db.batch();
        vencidos.docs.forEach((d) => lote.delete(d.ref));
        await lote.commit();
      }
    },
  };
}

/** O mesmo armazém, na memória — para os testes. */
export function armazemNaMemoria(): ArmazemDoConector & {
  clientes: Map<string, ClienteRegistrado>;
  pedidos: Map<string, PedidoDeAutorizacao>;
  concessoes: Map<string, Concessao>;
} {
  const clientes = new Map<string, ClienteRegistrado>();
  const pedidos = new Map<string, PedidoDeAutorizacao>();
  const concessoes = new Map<string, Concessao>();
  const copia = <T>(v: T | undefined): T | null => (v ? JSON.parse(JSON.stringify(v)) : null);
  return {
    clientes,
    pedidos,
    concessoes,
    async lerCliente(id) {
      return copia(clientes.get(id));
    },
    async gravarCliente(c) {
      if (clientes.has(c.clientId)) throw new Error('já existe');
      clientes.set(c.clientId, copia(c)!);
    },
    async marcarClienteUsado(clientId) {
      const c = clientes.get(clientId);
      if (c) delete c.expiraEm;
    },
    async gravarPedido(p) {
      pedidos.set(p.id, copia(p)!);
    },
    async lerPedido(id) {
      return copia(pedidos.get(id));
    },
    async consumirPedido(id, agora) {
      const p = pedidos.get(id);
      if (!p) return null;
      const antes = copia(p);
      if (!p.usadoEm) p.usadoEm = agora;
      return antes;
    },
    async gravarConcessao(hash, c) {
      if (concessoes.has(hash)) throw new Error('já existe');
      concessoes.set(hash, copia(c)!);
    },
    async lerConcessao(hash) {
      return copia(concessoes.get(hash));
    },
    async consumirConcessao(hash, agora) {
      const c = concessoes.get(hash);
      if (!c) return null;
      const antes = copia(c);
      if (!c.usadoEm) c.usadoEm = agora;
      return antes;
    },
    async revogarFamilia(familia) {
      for (const [hash, c] of concessoes) if (c.familia === familia) concessoes.delete(hash);
    },
    async faxina(agora) {
      for (const [id, p] of pedidos) if (p.expiraEm < agora) pedidos.delete(id);
      for (const [hash, c] of concessoes) if (c.expiraEm < agora) concessoes.delete(hash);
      for (const [id, c] of clientes) if (c.expiraEm !== undefined && c.expiraEm < agora) clientes.delete(id);
    },
  };
}

// ==========================================
// SEGREDOS
// ==========================================

/** Um segredo novo: 32 bytes aleatórios em base64url. */
export const novoSegredo = (bytes = 32): string => crypto.randomBytes(bytes).toString('base64url');

/** O hash com que o segredo é guardado e procurado. */
export const hashDoSegredo = (segredo: string): string =>
  crypto.createHash('sha256').update(segredo, 'utf8').digest('hex');

/** O desafio S256 do PKCE: base64url(SHA-256(verificador)). */
export const desafioDoPkce = (verificador: string): string =>
  crypto.createHash('sha256').update(verificador, 'ascii').digest('base64url');

const iguaisSemVazarTempo = (a: string, b: string): boolean => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/** O verificador do PKCE: 43 a 128 caracteres do alfabeto da RFC 7636. */
const VERIFICADOR = /^[A-Za-z0-9\-._~]{43,128}$/;
const DESAFIO = /^[A-Za-z0-9_-]{43}$/;
const ID_SEGURO = /^[A-Za-z0-9_-]{16,128}$/;

// ==========================================
// ENDEREÇO DE VOLTA
// ==========================================

/** Os endereços de volta do Claude, exatos (o claude.com é o mesmo app, no outro domínio). */
const VOLTAS_DO_CLAUDE = new Set(['https://claude.ai/api/mcp/auth_callback', 'https://claude.com/api/mcp/auth_callback']);

const ehDaPropriaMaquina = (url: URL): boolean =>
  url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');

/**
 * O endereço de volta que um app pode registrar: **o do Claude, exato**, ou `http` na própria
 * máquina (o Claude Code e as ferramentas de teste de conector rodam assim).
 *
 * Por que só esses: o registro é aberto (é assim que o Claude se registra quando não usa a
 * identidade publicada), e o código da autorização vai para o endereço de volta. Se qualquer
 * endereço servisse, bastaria mandar a alguém da clínica um link de "conectar" que voltasse para
 * um site de fora — um toque em "Permitir" e esse site teria a agenda e as pacientes. Outro app de
 * confiança entra aqui, na lista, com uma mudança de código revisada.
 */
export const enderecoDeVoltaAceito = (valor: unknown): valor is string => {
  if (typeof valor !== 'string' || valor.length > 500) return false;
  if (VOLTAS_DO_CLAUDE.has(valor)) return true;
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    return false;
  }
  return ehDaPropriaMaquina(url) && !url.hash && !url.username && !url.password;
};

/**
 * O endereço pedido é o registrado? Igual, letra por letra — menos a porta, na própria máquina: o
 * Claude Code registra `http://localhost/callback` e abre uma porta livre a cada login (RFC 8252,
 * 7.3).
 */
export const mesmoEnderecoDeVolta = (registrado: string, pedido: string): boolean => {
  if (registrado === pedido) return true;
  try {
    const a = new URL(registrado);
    const b = new URL(pedido);
    return (
      ehDaPropriaMaquina(a) &&
      ehDaPropriaMaquina(b) &&
      a.hostname === b.hostname &&
      a.pathname === b.pathname &&
      a.search === b.search &&
      !b.hash &&
      !b.username &&
      !b.password
    );
  } catch {
    return false;
  }
};

// ==========================================
// IDENTIDADE PUBLICADA (Client ID Metadata Document)
// ==========================================

/**
 * O documento de metadados de um cliente cujo `client_id` é um endereço https — é assim que o
 * Claude se identifica por padrão ("Use Claude's published identity", documento em
 * `https://claude.ai/oauth/mcp-oauth-client-metadata`). O servidor busca o documento, confere que
 * ele diz ser aquele `client_id` e usa os endereços de volta dele. Nada fica gravado.
 *
 * Só os documentos do Claude, pelo endereço exato: é o site que garante a identidade.
 */
export type BuscarDocumento = (url: string) => Promise<unknown>;

const DOCUMENTO_MAX_BYTES = 10 * 1024;

export const buscarDocumentoPadrao: BuscarDocumento = async (url) => {
  const resposta = await fetch(url, {
    redirect: 'error',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(5000),
  });
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
  const texto = await resposta.text();
  if (texto.length > DOCUMENTO_MAX_BYTES) throw new Error('documento grande demais');
  return JSON.parse(texto);
};

/** Os documentos da identidade publicada do Claude (o app e o Claude Code). Só estes. */
const DOCUMENTOS_DO_CLAUDE = new Set([
  'https://claude.ai/oauth/mcp-oauth-client-metadata',
  'https://claude.ai/oauth/claude-code-client-metadata',
]);

/** O `client_id` é um endereço de documento de cliente que aceitamos? */
export const ehClientIdDeDocumento = (clientId: string): boolean => DOCUMENTOS_DO_CLAUDE.has(clientId);

/** O documento vira um cliente — ou `null` se ele não serve. */
export const clienteDoDocumento = (clientId: string, doc: unknown): ClienteRegistrado | null => {
  if (!doc || typeof doc !== 'object') return null;
  const d = doc as Record<string, unknown>;
  if (d.client_id !== clientId) return null;
  const uris = d.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > 10 || !uris.every(enderecoDeVoltaAceito)) return null;
  // O cliente do documento é público (só PKCE): não há como ele guardar uma chave.
  if (d.token_endpoint_auth_method !== undefined && d.token_endpoint_auth_method !== 'none') return null;
  return {
    clientId,
    nome: typeof d.client_name === 'string' && d.client_name.trim() ? d.client_name.trim().slice(0, 100) : new URL(clientId).host,
    redirectUris: uris as string[],
    metodo: 'none',
    criadoEm: '',
    publicado: true,
  };
};

/** O endereço de volta com os parâmetros da resposta. */
const voltaCom = (redirectUri: string, parametros: Record<string, string | undefined>): string => {
  const url = new URL(redirectUri);
  Object.entries(parametros).forEach(([k, v]) => {
    if (v !== undefined) url.searchParams.set(k, v);
  });
  return url.toString();
};

// ==========================================
// QUEM AINDA PODE USAR
// ==========================================

/**
 * O login que autorizou continua ativo, na mesma clínica? Na Zulia, pela conta do Authentication:
 * não desativada, com a mesma claim `clinicaId` e sem sessões encerradas depois da autorização
 * (`tokensValidAfterTime` — trocar a senha ou "sair de todos os aparelhos" corta o Claude também).
 * No legado, pela lista da equipe do perfil (`equipeUids`), a mesma que as regras conferem.
 */
export type ConferenciaDoLogin = (uid: string, clinicaId: string | null, autorizadoEm?: number) => Promise<boolean>;

/**
 * Não deu para conferir agora (banco, Authentication ou o documento do Claude fora do ar, cota): não é
 * um "não". Quem recebe responde "tente de novo", e nada é revogado por causa disso.
 */
export class ServicoIndisponivel extends Error {}

export const conferenciaPadrao =
  (banco: () => Firestore | null = bancoAdmin, zulia: boolean = ehZulia): ConferenciaDoLogin =>
  async (uid, clinicaId, autorizadoEm) => {
    if (zulia) {
      const conta = await authAdmin().getUser(uid);
      const sessoesEncerradasEm = conta.tokensValidAfterTime ? Date.parse(conta.tokensValidAfterTime) : 0;
      if (autorizadoEm !== undefined && sessoesEncerradasEm > autorizadoEm) return false;
      return !conta.disabled && !!clinicaId && conta.customClaims?.clinicaId === clinicaId;
    }
    const db = banco();
    if (!db) return false;
    const perfil = await db.collection('clinic_settings').doc('main_profile').get();
    const equipe = perfil.data()?.equipeUids;
    return Array.isArray(equipe) && equipe.includes(uid);
  };

/** Login do painel que pode conectar o Claude: com clínica (Zulia) ou na equipe (legado). */
const podeConectar = async (login: LoginDoPainel, conferir: ConferenciaDoLogin, zulia: boolean) => {
  if (zulia && !login.clinicaId) return false;
  return conferir(login.uid, zulia ? login.clinicaId : null);
};

// ==========================================
// QUEM CHAMA O CONECTOR
// ==========================================

/** A pessoa por trás de uma chamada ao conector. */
export interface LoginDoConector {
  uid: string;
  email: string | null;
  clinicaId: string | null;
  papel: Papel | null;
  clientId: string;
}

export interface OpcoesDoLoginDoClaude {
  armazem?: () => ArmazemDoConector | null;
  /** Para os testes: as regras como na Zulia ou no legado. */
  zulia?: boolean;
  /** Para os testes: outra conferência do login do painel. */
  loginDoPainel?: (req: Request) => Promise<LoginDoPainel | null>;
  /** Para os testes: outra conferência de "ainda pode usar". */
  conferirLogin?: ConferenciaDoLogin;
  /** Para os testes: outro relógio. */
  agora?: () => number;
  /** Para os testes: o endereço público fixo (no ar, o do pedido). */
  endereco?: string;
  /** Para os testes: não gravar o registro de acesso (Marco Civil). */
  semRegistroDeAcesso?: boolean;
  /** Para os testes: outra busca do documento de metadados do cliente. */
  buscarDocumento?: BuscarDocumento;
}

const armazemPadrao = (): ArmazemDoConector | null => {
  const db = bancoAdmin();
  return db ? armazemNoFirestore(db) : null;
};

/**
 * O endereço público do site, de onde saem o emissor e os endereços do OAuth: a variável
 * `ENDERECO_DO_CONECTOR` quando existir, senão o `ENDERECO_DO_SITE` publicado. Nunca o do pedido:
 * o `resource` tem de ser exatamente o endereço que a pessoa digitou no Claude, e o cabeçalho
 * `Host` que chega pelo proxy do AI Studio pode não ser esse.
 */
const enderecoPublico = (fixo?: string): string =>
  (fixo || process.env.ENDERECO_DO_CONECTOR || ENDERECO_DO_SITE).trim().replace(/\/+$/, '');

/** Os metadados do servidor de autorização (RFC 8414). */
export const metadadosDaAutorizacao = (base: string) => ({
  issuer: base,
  authorization_endpoint: `${base}${BASE_DAS_ROTAS}/autorizar`,
  token_endpoint: `${base}${BASE_DAS_ROTAS}/token`,
  registration_endpoint: `${base}${BASE_DAS_ROTAS}/registrar`,
  revocation_endpoint: `${base}${BASE_DAS_ROTAS}/revogar`,
  response_types_supported: ['code'],
  grant_types_supported: ['authorization_code', 'refresh_token'],
  code_challenge_methods_supported: ['S256'],
  token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
  revocation_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
  scopes_supported: [ESCOPO_DO_CONECTOR],
  authorization_response_iss_parameter_supported: true,
  // O Claude só usa a identidade publicada com isto e com "none" nos métodos do token.
  client_id_metadata_document_supported: true,
});

/** Os metadados do recurso protegido (RFC 9728): o conector e quem o autoriza. */
export const metadadosDoRecurso = (base: string) => ({
  resource: `${base}${CAMINHO_DO_MCP}`,
  authorization_servers: [base],
  scopes_supported: [ESCOPO_DO_CONECTOR],
  bearer_methods_supported: ['header'],
  resource_name: 'Agenda do painel (conector do Claude)',
});

/** O cabeçalho que diz ao Claude onde se autorizar, numa resposta 401. */
export const cabecalhoDeAutenticacao = (base: string, erro?: string): string =>
  `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource${CAMINHO_DO_MCP}"` +
  (erro ? `, error="${erro}"` : '');

/**
 * Limite de gravações abertas (registro de app, pedido de autorização) por hora: por endereço de
 * IP e no total. O IP vem do `X-Forwarded-For`, que quem pede pode forjar — o total é o que segura
 * de verdade o banco contra quem gire o cabeçalho.
 */
const criarLimite = (porIp: number, total: number) => {
  const porEndereco = new Map<string, number[]>();
  let todos: number[] = [];
  return (ip: string, agora: number): boolean => {
    const hora = agora - 60 * 60 * 1000;
    todos = todos.filter((t) => t > hora);
    const recentes = (porEndereco.get(ip) || []).filter((t) => t > hora);
    if (recentes.length >= porIp || todos.length >= total) return false;
    recentes.push(agora);
    todos.push(agora);
    if (porEndereco.size > 5000) porEndereco.clear();
    porEndereco.set(ip, recentes);
    return true;
  };
};

/**
 * Cria as rotas do login do conector e devolve também a conferência do acesso, que a rota do
 * conector (`server/conectorClaude.ts`) usa em cada chamada.
 */
export function criarLoginDoClaude(opcoes: OpcoesDoLoginDoClaude = {}): {
  rotas: Router;
  /** O login por trás de um acesso, ou `null` se o acesso não vale (vencido, revogado, login desativado). */
  verificarAcesso: (token: string) => Promise<LoginDoConector | null>;
  endereco: (req: Request) => string;
} {
  const zulia = opcoes.zulia ?? ehZulia;
  const obterArmazem = opcoes.armazem ?? armazemPadrao;
  const loginDoPainel = opcoes.loginDoPainel ?? loginDoPedido;
  const conferir = opcoes.conferirLogin ?? conferenciaPadrao(bancoAdmin, zulia);
  const agora = opcoes.agora ?? Date.now;
  const endereco = (_req?: Request) => enderecoPublico(opcoes.endereco);
  const buscarDocumento = opcoes.buscarDocumento ?? buscarDocumentoPadrao;
  const registroPermitido = criarLimite(20, 60);
  const pedidoPermitido = criarLimite(60, 600);

  /** Documentos de cliente já lidos, por 5 minutos. */
  const documentos = new Map<string, { ate: number; cliente: ClienteRegistrado | null }>();
  /**
   * O cliente de um `client_id`: o do documento publicado (endereço https de um site do Claude) ou
   * o registrado aqui. `null` se não há.
   */
  const resolverCliente = async (armazem: ArmazemDoConector, clientId: string): Promise<ClienteRegistrado | null> => {
    if (!clientId || clientId.length > 300) return null;
    if (!/^https:\/\//i.test(clientId)) {
      try {
        const registrado = await armazem.lerCliente(clientId);
        return registrado && (registrado.expiraEm === undefined || registrado.expiraEm > agora()) ? registrado : null;
      } catch (e) {
        throw new ServicoIndisponivel((e as Error).message);
      }
    }
    if (!ehClientIdDeDocumento(clientId)) return null;
    const guardado = documentos.get(clientId);
    if (guardado && guardado.ate > agora()) return guardado.cliente;
    let cliente: ClienteRegistrado | null = null;
    try {
      cliente = clienteDoDocumento(clientId, await buscarDocumento(clientId));
    } catch (e) {
      console.warn('[conector-claude] não foi possível ler o documento do cliente:', (e as Error).message);
      throw new ServicoIndisponivel((e as Error).message);
    }
    if (documentos.size > 100) documentos.clear();
    documentos.set(clientId, { ate: agora() + 5 * 60 * 1000, cliente });
    return cliente;
  };

  const conferidos = new Map<string, number>();
  /**
   * `conferir`, guardado por alguns minutos — é uma leitura no Authentication por chamada. Lança
   * `ServicoIndisponivel` quando não deu para conferir: quem chama responde "tente de novo",
   * sem tratar como acesso negado (um 401 faria o Claude renovar, e a renovação negada o
   * desconectaria de vez por causa de um soluço do Authentication).
   */
  const aindaPodeUsar = async (uid: string, clinicaId: string | null, autorizadoEm: number): Promise<boolean> => {
    const chave = `${uid}|${clinicaId}|${autorizadoEm}`;
    if ((conferidos.get(chave) || 0) > agora()) return true;
    let pode = false;
    try {
      pode = await conferir(uid, clinicaId, autorizadoEm);
    } catch (e) {
      console.warn('[conector-claude] não foi possível conferir o login:', (e as Error).message);
      throw new ServicoIndisponivel((e as Error).message);
    }
    if (pode) {
      if (conferidos.size > 2000) conferidos.clear();
      conferidos.set(chave, agora() + CONFERENCIA_VALE_MS);
    } else {
      conferidos.delete(chave);
    }
    return pode;
  };

  /** Emite um acesso e uma renovação da mesma família. */
  const emitir = async (armazem: ArmazemDoConector, base: Omit<Concessao, 'tipo' | 'expiraEm' | 'usadoEm' | 'redirectUri' | 'codeChallenge'>) => {
    const acesso = novoSegredo();
    const renovacao = novoSegredo();
    const momento = agora();
    const limite = base.autorizadoEm + AUTORIZACAO_VALE_MS;
    const acessoAte = Math.min(momento + ACESSO_VALE_S * 1000, limite);
    await armazem.gravarConcessao(hashDoSegredo(acesso), { ...base, tipo: 'acesso', expiraEm: acessoAte });
    await armazem.gravarConcessao(hashDoSegredo(renovacao), {
      ...base,
      tipo: 'renovacao',
      expiraEm: Math.min(momento + RENOVACAO_VALE_MS, limite),
    });
    return {
      access_token: acesso,
      token_type: 'Bearer',
      expires_in: Math.max(1, Math.floor((acessoAte - momento) / 1000)),
      refresh_token: renovacao,
      scope: base.escopo,
    };
  };

  const verificarAcesso = async (token: string): Promise<LoginDoConector | null> => {
    if (!token || token.length > 200) return null;
    const armazem = obterArmazem();
    if (!armazem) return null;
    const concessao = await armazem.lerConcessao(hashDoSegredo(token));
    if (!concessao || concessao.tipo !== 'acesso' || concessao.expiraEm <= agora()) return null;
    if (!(await aindaPodeUsar(concessao.uid, concessao.clinicaId, concessao.autorizadoEm))) return null;
    return {
      uid: concessao.uid,
      email: concessao.email,
      clinicaId: concessao.clinicaId,
      papel: concessao.papel,
      clientId: concessao.clientId,
    };
  };

  const rotas = express.Router();

  // Nada aqui depende de cookie: o que autoriza é o segredo no corpo ou no cabeçalho. Liberar a
  // origem deixa as ferramentas de teste de conector (que rodam no navegador) chegarem aqui.
  const cors = (req: Request, res: Response, next: () => void) => {
    res.set({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, Mcp-Protocol-Version',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Max-Age': '600',
      'Cache-Control': 'no-store',
    });
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  };

  const metadadosDoServidor = (req: Request, res: Response) => res.json(metadadosDaAutorizacao(endereco(req)));
  const metadadosDoConector = (req: Request, res: Response) => res.json(metadadosDoRecurso(endereco(req)));
  rotas.use('/.well-known', cors);
  rotas.get('/.well-known/oauth-authorization-server', metadadosDoServidor);
  rotas.get(`/.well-known/oauth-authorization-server${CAMINHO_DO_MCP}`, metadadosDoServidor);
  rotas.get('/.well-known/openid-configuration', metadadosDoServidor);
  rotas.get('/.well-known/oauth-protected-resource', metadadosDoConector);
  rotas.get(`/.well-known/oauth-protected-resource${CAMINHO_DO_MCP}`, metadadosDoConector);

  const oauth = express.Router();
  rotas.use(BASE_DAS_ROTAS, oauth);
  oauth.use(cors);
  oauth.use(express.json({ limit: '32kb' }));
  oauth.use(express.urlencoded({ extended: false, limit: '32kb' }));

  /** Responde com o erro do OAuth (RFC 6749, seção 5.2). */
  const erroOAuth = (res: Response, status: number, error: string, descricao?: string) =>
    res.status(status).json({ error, ...(descricao ? { error_description: descricao } : {}) });

  const semArmazem = (res: Response): ArmazemDoConector | null => {
    const armazem = obterArmazem();
    if (!armazem) {
      erroOAuth(res, 503, 'temporarily_unavailable', 'o servidor ainda não tem a credencial do banco');
      return null;
    }
    return armazem;
  };

  // ---------- Registro dinâmico (RFC 7591) ----------
  oauth.post('/registrar', async (req, res) => {
    const armazem = semArmazem(res);
    if (!armazem) return;
    if (!registroPermitido(req.ip || 'desconhecido', agora())) {
      erroOAuth(res, 429, 'invalid_client_metadata', 'muitos registros deste endereço; tente mais tarde');
      return;
    }
    const corpo = req.body || {};
    const uris = corpo.redirect_uris;
    if (!Array.isArray(uris) || uris.length === 0 || uris.length > 10 || !uris.every(enderecoDeVoltaAceito)) {
      erroOAuth(res, 400, 'invalid_redirect_uri', 'redirect_uris: de 1 a 10 endereços https do Claude (claude.ai ou claude.com)');
      return;
    }
    const metodoPedido = corpo.token_endpoint_auth_method ?? 'client_secret_basic';
    if (!['none', 'client_secret_post', 'client_secret_basic'].includes(metodoPedido)) {
      erroOAuth(res, 400, 'invalid_client_metadata', 'token_endpoint_auth_method não suportado');
      return;
    }
    const tipos = corpo.grant_types ?? ['authorization_code', 'refresh_token'];
    if (
      !Array.isArray(tipos) ||
      !tipos.includes('authorization_code') ||
      !tipos.every((t: unknown) => t === 'authorization_code' || t === 'refresh_token')
    ) {
      erroOAuth(res, 400, 'invalid_client_metadata', 'grant_types: authorization_code e refresh_token');
      return;
    }
    if (corpo.response_types !== undefined && (!Array.isArray(corpo.response_types) || corpo.response_types.some((t: unknown) => t !== 'code'))) {
      erroOAuth(res, 400, 'invalid_client_metadata', 'response_types: só code');
      return;
    }
    const nome = typeof corpo.client_name === 'string' ? corpo.client_name.trim().slice(0, 100) : '';
    const metodo = metodoPedido as MetodoDoCliente;
    const segredo = metodo === 'none' ? undefined : novoSegredo();
    const cliente: ClienteRegistrado = {
      clientId: `cc-${novoSegredo(18)}`,
      nome: nome || 'Aplicativo sem nome',
      redirectUris: uris as string[],
      metodo,
      segredoHash: segredo ? hashDoSegredo(segredo) : undefined,
      criadoEm: new Date(agora()).toISOString(),
      expiraEm: agora() + CLIENTE_SEM_USO_VALE_MS,
    };
    try {
      await armazem.gravarCliente(cliente);
    } catch (e) {
      console.warn('[conector-claude] não foi possível registrar o cliente:', (e as Error).message);
      erroOAuth(res, 503, 'temporarily_unavailable');
      return;
    }
    res.status(201).json({
      client_id: cliente.clientId,
      ...(segredo ? { client_secret: segredo, client_secret_expires_at: 0 } : {}),
      client_id_issued_at: Math.floor(agora() / 1000),
      client_name: cliente.nome,
      redirect_uris: cliente.redirectUris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: metodo,
      scope: ESCOPO_DO_CONECTOR,
    });
  });

  // ---------- Autorização: manda para o painel ----------
  const paginaDeErro = (res: Response, mensagem: string) =>
    res
      .status(400)
      .type('html')
      .send(
        `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Conector do Claude</title></head>` +
          `<body style="font-family:system-ui,sans-serif;padding:32px;color:#2b2420;line-height:1.5"><h1 style="font-size:20px">Não foi possível conectar</h1><p>${mensagem
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')}</p><p>Volte ao Claude e tente adicionar o conector de novo.</p></body></html>`
      );

  oauth.get('/autorizar', async (req, res) => {
    const armazem = obterArmazem();
    if (!armazem) {
      paginaDeErro(res, 'O servidor ainda não tem a credencial do banco.');
      return;
    }
    const q = req.query as Record<string, unknown>;
    const texto = (v: unknown, max = 500) => (typeof v === 'string' && v.length <= max ? v : undefined);
    const clientId = texto(q.client_id, 300);
    let cliente: ClienteRegistrado | null = null;
    try {
      cliente = clientId ? await resolverCliente(armazem, clientId) : null;
    } catch {
      paginaDeErro(res, 'O servidor não conseguiu conferir o aplicativo agora. Tente de novo em instantes.');
      return;
    }
    if (!cliente) {
      paginaDeErro(res, 'Este aplicativo não está registrado (client_id desconhecido).');
      return;
    }
    const pedida = texto(q.redirect_uri);
    const redirectUri = pedida ?? (cliente.redirectUris.length === 1 ? cliente.redirectUris[0] : undefined);
    if (!redirectUri || !cliente.redirectUris.some((r) => mesmoEnderecoDeVolta(r, redirectUri))) {
      paginaDeErro(res, 'O endereço de volta (redirect_uri) não é o que o aplicativo registrou.');
      return;
    }
    // Daqui em diante o endereço de volta é confiável: os erros voltam para o aplicativo.
    const state = texto(q.state, 1000);
    const voltarComErro = (error: string, descricao: string) =>
      res.redirect(voltaCom(redirectUri, { error, error_description: descricao, state, iss: endereco(req) }));

    if (q.response_type !== 'code') {
      voltarComErro('unsupported_response_type', 'só response_type=code');
      return;
    }
    const codeChallenge = texto(q.code_challenge, 200);
    if (!codeChallenge || !DESAFIO.test(codeChallenge) || q.code_challenge_method !== 'S256') {
      voltarComErro('invalid_request', 'PKCE obrigatório, com code_challenge_method=S256');
      return;
    }
    const escopos = (texto(q.scope, 300) || ESCOPO_DO_CONECTOR).split(/\s+/).filter(Boolean);
    if (escopos.some((e) => e !== ESCOPO_DO_CONECTOR)) {
      voltarComErro('invalid_scope', `o único escopo é "${ESCOPO_DO_CONECTOR}"`);
      return;
    }

    if (!pedidoPermitido(req.ip || 'desconhecido', agora())) {
      voltarComErro('temporarily_unavailable', 'muitos pedidos agora; tente de novo em alguns minutos');
      return;
    }
    const pedido: PedidoDeAutorizacao = {
      id: novoSegredo(24),
      clientId: cliente.clientId,
      redirectUri,
      state,
      codeChallenge,
      escopo: ESCOPO_DO_CONECTOR,
      expiraEm: agora() + PEDIDO_VALE_MS,
    };
    try {
      await armazem.gravarPedido(pedido);
    } catch (e) {
      console.warn('[conector-claude] não foi possível gravar o pedido:', (e as Error).message);
      voltarComErro('temporarily_unavailable', 'tente de novo em instantes');
      return;
    }
    // A faxina dos vencidos, de vez em quando.
    if (Math.random() < 0.1) armazem.faxina(agora()).catch(() => undefined);
    res.redirect(`${endereco(req)}/?autorizar-claude=${encodeURIComponent(pedido.id)}`);
  });

  // ---------- O painel lê o pedido e decide ----------
  /** O login do painel que pode conectar, ou `null` com a resposta já dada. */
  const exigirLoginDoPainel = async (req: Request, res: Response): Promise<LoginDoPainel | null> => {
    let login: LoginDoPainel | null = null;
    try {
      login = await loginDoPainel(req);
    } catch (e) {
      console.warn('[conector-claude] não foi possível conferir o login do painel:', e);
    }
    if (!login) {
      res.status(401).json({ erro: 'login' });
      return null;
    }
    let pode = false;
    try {
      pode = await podeConectar(login, conferir, zulia);
    } catch (e) {
      console.warn('[conector-claude] não foi possível conferir a equipe:', (e as Error).message);
      res.status(503).json({ erro: 'indisponivel' });
      return null;
    }
    if (!pode) {
      res.status(403).json({ erro: 'sem-acesso' });
      return null;
    }
    return login;
  };

  const loginRecente = (login: LoginDoPainel): boolean =>
    !!login.autenticadoEm && agora() - login.autenticadoEm <= LOGIN_RECENTE_MS;

  const pedidoValido = (p: PedidoDeAutorizacao | null): p is PedidoDeAutorizacao =>
    !!p && !p.usadoEm && p.expiraEm > agora();

  oauth.get('/pedido/:id', async (req, res) => {
    const login = await exigirLoginDoPainel(req, res);
    if (!login) return;
    const armazem = obterArmazem();
    const id = req.params.id;
    if (!armazem || !ID_SEGURO.test(id)) {
      res.status(404).json({ erro: 'pedido-inexistente' });
      return;
    }
    const pedido = await armazem.lerPedido(id).catch(() => null);
    if (!pedidoValido(pedido)) {
      res.status(410).json({ erro: 'pedido-vencido' });
      return;
    }
    const cliente = await resolverCliente(armazem, pedido.clientId).catch(() => null);
    res.json({
      aplicativo: cliente?.nome || 'Aplicativo sem nome',
      destino: new URL(pedido.redirectUri).host,
      // A identidade publicada do Claude é garantida pelo site dele; um app registrado aqui
      // escolheu o próprio nome.
      verificado: cliente?.publicado === true,
      // Sessão antiga: o painel pede para entrar de novo antes de mostrar o Permitir.
      entrarDeNovo: !loginRecente(login),
    });
  });

  oauth.post('/decidir', async (req, res) => {
    const login = await exigirLoginDoPainel(req, res);
    if (!login) return;
    // Permitir dá acesso às pacientes por até 90 dias: exige ter digitado a senha há pouco, e não
    // só uma sessão que ficou aberta no computador da recepção.
    if (!loginRecente(login)) {
      res.status(401).json({ erro: 'login-recente' });
      return;
    }
    const armazem = obterArmazem();
    const id = typeof req.body?.pedido === 'string' ? req.body.pedido : '';
    if (!armazem || !ID_SEGURO.test(id)) {
      res.status(404).json({ erro: 'pedido-inexistente' });
      return;
    }
    const pedido = await armazem.consumirPedido(id, agora()).catch(() => null);
    if (!pedidoValido(pedido)) {
      res.status(410).json({ erro: 'pedido-vencido' });
      return;
    }
    const base = endereco(req);
    if (req.body?.permitir !== true) {
      res.json({
        redirecionar: voltaCom(pedido.redirectUri, {
          error: 'access_denied',
          error_description: 'a conexão foi recusada no painel',
          state: pedido.state,
          iss: base,
        }),
      });
      return;
    }

    const codigo = novoSegredo();
    try {
      await armazem.gravarConcessao(hashDoSegredo(codigo), {
        tipo: 'codigo',
        uid: login.uid,
        email: login.email,
        clinicaId: zulia ? login.clinicaId : null,
        papel: login.papel,
        clientId: pedido.clientId,
        escopo: pedido.escopo,
        familia: novoSegredo(18),
        autorizadoEm: agora(),
        expiraEm: agora() + CODIGO_VALE_MS,
        redirectUri: pedido.redirectUri,
        codeChallenge: pedido.codeChallenge,
      });
    } catch (e) {
      console.warn('[conector-claude] não foi possível gravar o código:', (e as Error).message);
      res.status(503).json({ erro: 'indisponivel' });
      return;
    }
    // O registro de acesso (Marco Civil, art. 15), como o do painel.
    const db = bancoAdmin();
    if (zulia && db && !opcoes.semRegistroDeAcesso) {
      registrarAcesso(db, login, {
        ip: req.ip || 'desconhecido',
        navegador: `Conector do Claude (autorização) — ${String(req.headers['user-agent'] || '')}`,
      }).catch((e) => console.warn('[conector-claude] registro de acesso falhou:', (e as Error).message));
    }
    res.json({ redirecionar: voltaCom(pedido.redirectUri, { code: codigo, state: pedido.state, iss: base }) });
  });

  // ---------- Token ----------
  /** O cliente da chamada ao `/token` ou ao `/revogar`, autenticado como ele se registrou. */
  const autenticarCliente = async (
    req: Request,
    armazem: ArmazemDoConector
  ): Promise<ClienteRegistrado | null> => {
    let clientId = typeof req.body?.client_id === 'string' ? req.body.client_id : '';
    let segredo = typeof req.body?.client_secret === 'string' ? req.body.client_secret : '';
    const basico = req.headers.authorization || '';
    if (basico.startsWith('Basic ')) {
      // RFC 6749, 2.3.1: id e chave vêm codificados, e o primeiro ":" é o que os separa.
      const par = Buffer.from(basico.slice(6), 'base64').toString('utf8');
      const separador = par.indexOf(':');
      try {
        clientId = decodeURIComponent(separador >= 0 ? par.slice(0, separador) : par);
        segredo = decodeURIComponent(separador >= 0 ? par.slice(separador + 1) : '');
      } catch {
        return null;
      }
    }
    if (!clientId || clientId.length > 300) return null;
    const cliente = await resolverCliente(armazem, clientId);
    if (!cliente) return null;
    if (cliente.metodo === 'none') return cliente;
    if (!segredo || !cliente.segredoHash) return null;
    return iguaisSemVazarTempo(hashDoSegredo(segredo), cliente.segredoHash) ? cliente : null;
  };

  oauth.post('/token', async (req, res) => {
    const armazem = semArmazem(res);
    if (!armazem) return;
    try {
      await trocarNoToken(req, res, armazem);
    } catch (e) {
      // Banco, Authentication ou o documento do Claude fora do ar: "tente de novo", nunca
      // invalid_grant — que o Claude entende como "conecte de novo".
      if (!(e instanceof ServicoIndisponivel)) console.warn('[conector-claude] falha no /token:', e);
      if (!res.headersSent) erroOAuth(res, 503, 'temporarily_unavailable', 'tente de novo em instantes');
    }
    if (Math.random() < 0.1) armazem.faxina(agora()).catch(() => undefined);
  });

  /** O `/token` em si. Lança em falha do banco ou do Authentication (o chamador responde 503). */
  const trocarNoToken = async (req: Request, res: Response, armazem: ArmazemDoConector): Promise<void> => {
    const cliente = await autenticarCliente(req, armazem);
    if (!cliente) {
      erroOAuth(res, 401, 'invalid_client');
      return;
    }
    const grant = req.body?.grant_type;
    const momento = agora();
    const daFamilia = (c: Concessao) => ({
      uid: c.uid,
      email: c.email,
      clinicaId: c.clinicaId,
      papel: c.papel,
      clientId: c.clientId,
      escopo: c.escopo,
      familia: c.familia,
      autorizadoEm: c.autorizadoEm,
    });

    if (grant === 'authorization_code') {
      const codigo = typeof req.body?.code === 'string' ? req.body.code : '';
      const verificador = typeof req.body?.code_verifier === 'string' ? req.body.code_verifier : '';
      if (!codigo || codigo.length > 200 || !VERIFICADOR.test(verificador)) {
        erroOAuth(res, 400, 'invalid_request', 'code e code_verifier são obrigatórios');
        return;
      }
      const hash = hashDoSegredo(codigo);
      // Conferir o dono antes de gastar: o código apresentado por outro app não pode queimá-lo.
      const lido = await armazem.lerConcessao(hash);
      if (!lido || lido.tipo !== 'codigo' || lido.clientId !== cliente.clientId) {
        erroOAuth(res, 400, 'invalid_grant');
        return;
      }
      const antes = await armazem.consumirConcessao(hash, momento);
      if (!antes || antes.tipo !== 'codigo') {
        erroOAuth(res, 400, 'invalid_grant');
        return;
      }
      if (antes.usadoEm) {
        // Código usado duas vezes: alguém o interceptou. Tudo o que nasceu dele cai.
        await armazem.revogarFamilia(antes.familia);
        erroOAuth(res, 400, 'invalid_grant', 'código já usado');
        return;
      }
      if (
        antes.expiraEm <= momento ||
        (req.body?.redirect_uri !== undefined && req.body.redirect_uri !== antes.redirectUri) ||
        !antes.codeChallenge ||
        !iguaisSemVazarTempo(desafioDoPkce(verificador), antes.codeChallenge)
      ) {
        erroOAuth(res, 400, 'invalid_grant');
        return;
      }
      const resposta = await emitir(armazem, daFamilia(antes));
      if (cliente.expiraEm !== undefined) {
        await armazem.marcarClienteUsado(cliente.clientId).catch((e) =>
          console.warn('[conector-claude] não foi possível marcar o app como usado:', (e as Error).message)
        );
      }
      res.json(resposta);
      return;
    }

    if (grant === 'refresh_token') {
      const renovacao = typeof req.body?.refresh_token === 'string' ? req.body.refresh_token : '';
      if (!renovacao || renovacao.length > 200) {
        erroOAuth(res, 400, 'invalid_request', 'refresh_token é obrigatório');
        return;
      }
      const hash = hashDoSegredo(renovacao);
      const lido = await armazem.lerConcessao(hash);
      if (!lido || lido.tipo !== 'renovacao' || lido.clientId !== cliente.clientId || lido.expiraEm <= momento) {
        erroOAuth(res, 400, 'invalid_grant');
        return;
      }
      const reusoForaDoPrazo = (c: Concessao) => !!c.usadoEm && momento - c.usadoEm > REUSO_TOLERADO_MS;
      if (reusoForaDoPrazo(lido)) {
        // Renovação reaproveitada bem depois do primeiro uso: alguém a copiou. A família inteira
        // cai, e o Claude pede para conectar de novo.
        await armazem.revogarFamilia(lido.familia);
        erroOAuth(res, 400, 'invalid_grant', 'renovação já usada');
        return;
      }
      // O login ainda pode? Antes de gastar a renovação: se não deu para conferir, ela continua
      // valendo para a próxima tentativa (`aindaPodeUsar` lança e o chamador responde 503).
      if (!(await aindaPodeUsar(lido.uid, lido.clinicaId, lido.autorizadoEm))) {
        await armazem.revogarFamilia(lido.familia);
        erroOAuth(res, 400, 'invalid_grant');
        return;
      }
      const antes = await armazem.consumirConcessao(hash, momento);
      if (!antes || antes.tipo !== 'renovacao' || reusoForaDoPrazo(antes)) {
        if (antes) await armazem.revogarFamilia(antes.familia);
        erroOAuth(res, 400, 'invalid_grant');
        return;
      }
      // Primeiro uso, ou a mesma renovação de novo dentro de um minuto (duas renovações ao mesmo
      // tempo, ou a repetição de um pedido cuja resposta se perdeu): um par novo, da mesma família.
      res.json(await emitir(armazem, daFamilia(antes)));
      return;
    }

    erroOAuth(res, 400, 'unsupported_grant_type');
  };

  // ---------- Revogação (RFC 7009) ----------
  oauth.post('/revogar', async (req, res) => {
    const armazem = semArmazem(res);
    if (!armazem) return;
    const cliente = await autenticarCliente(req, armazem).catch(() => null);
    if (!cliente) {
      erroOAuth(res, 401, 'invalid_client');
      return;
    }
    const token = typeof req.body?.token === 'string' ? req.body.token : '';
    if (token && token.length <= 200) {
      const concessao = await armazem.lerConcessao(hashDoSegredo(token)).catch(() => null);
      if (concessao && concessao.clientId === cliente.clientId) {
        await armazem.revogarFamilia(concessao.familia).catch(() => undefined);
      }
    }
    // A RFC manda responder 200 mesmo quando o token não existe.
    res.status(200).end();
  });

  oauth.use((_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  return { rotas, verificarAcesso, endereco };
}

import crypto from 'node:crypto';
import express, { type Request, type Response, type Router } from 'express';
import firebaseConfig from '../firebase-applet-config.json';
import { ENDERECO_DO_SITE } from '../src/utils/publicLinks';

/**
 * A parte do Google Agenda que precisa de servidor: conectar a conta Google de cada profissional e
 * enviar os eventos para o calendário dela.
 *
 * Por que servidor e não só o navegador: a autorização que o Google dá ao navegador vence em uma
 * hora, e só vale para quem está naquele computador. Se a recepção marca um horário para a
 * Dra. Karoline, é o calendário da Dra. Karoline que precisa mudar — sem ela estar logada ali.
 * Para isso o Google dá, uma vez, uma autorização permanente (refresh token). Ela é cifrada aqui
 * com uma chave que só este servidor tem, e o painel guarda no banco só a versão cifrada: quem lê
 * o banco não consegue usá-la, e o servidor não precisa de credencial do banco para nada.
 *
 * Permissão pedida: `calendar.app.created` — criar o calendário "La Vie Clinique" e mexer só nos
 * eventos dele. O sistema não vê nem altera os compromissos pessoais da profissional.
 *
 * Rotas (todas em /api/google-agenda):
 *   GET  /status      → { configurado }
 *   GET  /conectar    → manda para a tela de autorização do Google (abre numa janela à parte)
 *   GET  /retorno     → volta do Google; cria o calendário e entrega a conta ao painel
 *   POST /sincronizar → salva e apaga eventos (exige o login do painel)
 *   POST /desconectar → revoga a autorização no Google (exige o login do painel)
 *
 * Configuração (Secrets do AI Studio): GOOGLE_AGENDA_CLIENT_ID e GOOGLE_AGENDA_CLIENT_SECRET.
 * Ver docs/google-agenda.md.
 */

const ESCOPOS = ['openid', 'email', 'https://www.googleapis.com/auth/calendar.app.created'];
const ESCOPO_AGENDA = 'https://www.googleapis.com/auth/calendar.app.created';
const NOME_DO_CALENDARIO = 'La Vie Clinique';
const FUSO = 'America/Sao_Paulo';
const CANAL = 'lavie-google-agenda';
const API_AGENDA = 'https://www.googleapis.com/calendar/v3';
const MAX_OPERACOES = 50;

const clientId = () => process.env.GOOGLE_AGENDA_CLIENT_ID?.trim() || '';
const clientSecret = () => process.env.GOOGLE_AGENDA_CLIENT_SECRET?.trim() || '';
const configurado = () => !!clientId() && !!clientSecret();
const enderecoDeRetorno = () =>
  process.env.GOOGLE_AGENDA_REDIRECT_URI?.trim() || `${ENDERECO_DO_SITE}/api/google-agenda/retorno`;

// ==========================================
// CIFRA DA AUTORIZAÇÃO
// ==========================================

/** Chave AES derivada do client secret: um segredo a menos para configurar. */
const chaveDaCifra = (segredo: string): Buffer =>
  Buffer.from(crypto.hkdfSync('sha256', segredo, Buffer.alloc(0), 'lavie-google-agenda-v1', 32));

export const cifrar = (texto: string, segredo: string): string => {
  const iv = crypto.randomBytes(12);
  const cifra = crypto.createCipheriv('aes-256-gcm', chaveDaCifra(segredo), iv);
  const corpo = Buffer.concat([cifra.update(texto, 'utf8'), cifra.final()]);
  return `v1.${Buffer.concat([iv, cifra.getAuthTag(), corpo]).toString('base64url')}`;
};

/** Lança se o texto foi adulterado ou cifrado com outro segredo. */
export const decifrar = (cifrado: string, segredo: string): string => {
  if (!cifrado.startsWith('v1.')) throw new Error('formato desconhecido');
  const bruto = Buffer.from(cifrado.slice(3), 'base64url');
  const decifra = crypto.createDecipheriv('aes-256-gcm', chaveDaCifra(segredo), bruto.subarray(0, 12));
  decifra.setAuthTag(bruto.subarray(12, 28));
  return Buffer.concat([decifra.update(bruto.subarray(28)), decifra.final()]).toString('utf8');
};

// ==========================================
// LOGIN DO PAINEL (Firebase ID token)
// ==========================================

const CERTIFICADOS_FIREBASE =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
let certificados: { ate: number; chaves: Record<string, string> } | null = null;

const buscarCertificados = async (forcar = false): Promise<Record<string, string>> => {
  if (!forcar && certificados && certificados.ate > Date.now()) return certificados.chaves;
  const resposta = await fetch(CERTIFICADOS_FIREBASE);
  if (!resposta.ok) throw new Error(`certificados: HTTP ${resposta.status}`);
  const idade = /max-age=(\d+)/.exec(resposta.headers.get('cache-control') || '');
  const chaves = (await resposta.json()) as Record<string, string>;
  certificados = { ate: Date.now() + (idade ? Number(idade[1]) : 3600) * 1000, chaves };
  return chaves;
};

const lerParteDoJwt = (parte: string): any => JSON.parse(Buffer.from(parte, 'base64url').toString('utf8'));

/**
 * Confere o login do painel: o mesmo token que o Firebase Auth entrega à profissional logada.
 * Devolve o uid, ou `null` se não for um login válido deste projeto.
 */
export const verificarLoginDoPainel = async (
  token: string,
  projeto: string = firebaseConfig.projectId,
  agora: number = Date.now()
): Promise<string | null> => {
  const partes = token.split('.');
  if (partes.length !== 3) return null;
  let cabecalho: any;
  let conteudo: any;
  try {
    cabecalho = lerParteDoJwt(partes[0]);
    conteudo = lerParteDoJwt(partes[1]);
  } catch {
    return null;
  }
  const segundos = agora / 1000;
  if (
    cabecalho?.alg !== 'RS256' ||
    typeof cabecalho.kid !== 'string' ||
    conteudo?.aud !== projeto ||
    conteudo?.iss !== `https://securetoken.google.com/${projeto}` ||
    typeof conteudo.sub !== 'string' ||
    !conteudo.sub ||
    typeof conteudo.exp !== 'number' ||
    conteudo.exp < segundos ||
    (typeof conteudo.iat === 'number' && conteudo.iat > segundos + 300)
  ) {
    return null;
  }

  let chaves = await buscarCertificados();
  if (!chaves[cabecalho.kid]) chaves = await buscarCertificados(true);
  const certificado = chaves[cabecalho.kid];
  if (!certificado) return null;

  const valido = crypto.verify(
    'RSA-SHA256',
    Buffer.from(`${partes[0]}.${partes[1]}`),
    new crypto.X509Certificate(certificado).publicKey,
    Buffer.from(partes[2], 'base64url')
  );
  return valido ? conteudo.sub : null;
};

const exigirLogin = async (req: Request, res: Response): Promise<string | null> => {
  const cabecalho = req.headers.authorization || '';
  const token = cabecalho.startsWith('Bearer ') ? cabecalho.slice(7).trim() : '';
  try {
    const uid = token ? await verificarLoginDoPainel(token) : null;
    if (uid) return uid;
  } catch (e) {
    console.warn('[google-agenda] não foi possível conferir o login:', e);
  }
  res.status(401).json({ erro: 'login' });
  return null;
};

// ==========================================
// GOOGLE: AUTORIZAÇÃO E AGENDA
// ==========================================

class ContaInvalida extends Error {}

/** Resposta inesperada da API do Google Agenda. */
class ErroDoGoogle extends Error {
  constructor(
    readonly status: number,
    contexto: string
  ) {
    super(`${contexto}: HTTP ${status}`);
  }
}

/** Autorizações de 1 hora já trocadas, por conta — evita uma troca a cada envio. */
const acessos = new Map<string, { token: string; ate: number }>();

const tokenDeAcesso = async (tokenCifrado: string): Promise<string> => {
  const guardado = acessos.get(tokenCifrado);
  if (guardado && guardado.ate > Date.now()) return guardado.token;

  let refreshToken: string;
  try {
    refreshToken = decifrar(tokenCifrado, clientSecret());
  } catch {
    throw new ContaInvalida('autorização ilegível');
  }

  const resposta = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId(),
      client_secret: clientSecret(),
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const corpo: any = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    if (corpo?.error === 'invalid_grant') throw new ContaInvalida('o Google recusou a autorização');
    throw new Error(`token: HTTP ${resposta.status} ${corpo?.error || ''}`);
  }

  if (acessos.size > 200) acessos.clear();
  acessos.set(tokenCifrado, {
    token: corpo.access_token,
    ate: Date.now() + Math.max(60, (corpo.expires_in || 3600) - 120) * 1000,
  });
  return corpo.access_token;
};

const chamarAgenda = async (
  metodo: string,
  caminho: string,
  acesso: string,
  corpo?: unknown
): Promise<{ status: number; json: any }> => {
  const resposta = await fetch(`${API_AGENDA}${caminho}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${acesso}`,
      ...(corpo ? { 'Content-Type': 'application/json' } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const json = resposta.status === 204 ? null : await resposta.json().catch(() => null);
  return { status: resposta.status, json };
};

interface EventoRecebido {
  titulo: string;
  descricao: string;
  local?: string;
  inicio: string;
  fim: string;
}

const DATA_HORA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00$/;
const ID_DO_EVENTO = /^[a-v0-9]{5,1024}$/;

const textoAte = (valor: unknown, max: number): string | null =>
  typeof valor === 'string' && valor.length <= max ? valor : null;

/** Só aceita o formato que o painel monta — o servidor não repassa campo livre ao Google. */
const validarEvento = (bruto: any): EventoRecebido | null => {
  const titulo = textoAte(bruto?.titulo, 300);
  const descricao = textoAte(bruto?.descricao, 2000);
  const local = bruto?.local === undefined ? undefined : textoAte(bruto.local, 500);
  if (titulo === null || descricao === null || local === null) return null;
  if (!DATA_HORA.test(bruto?.inicio) || !DATA_HORA.test(bruto?.fim) || bruto.fim <= bruto.inicio) {
    return null;
  }
  return { titulo, descricao, local: local || undefined, inicio: bruto.inicio, fim: bruto.fim };
};

const corpoDoEvento = (evento: EventoRecebido) => ({
  summary: evento.titulo,
  description: evento.descricao,
  ...(evento.local ? { location: evento.local } : {}),
  start: { dateTime: evento.inicio, timeZone: FUSO },
  end: { dateTime: evento.fim, timeZone: FUSO },
  status: 'confirmed',
  extendedProperties: { private: { origem: 'lavie-clinique' } },
});

type Resultado = { eventoId: string; ok: true } | { eventoId: string; ok: false; erro: string };

class CalendarioApagado extends Error {}

/**
 * Cria ou atualiza. Tenta atualizar primeiro: o caso comum é o horário já existir. Atualizar um
 * evento apagado o traz de volta, então "excluiu e voltou a agendar" também funciona.
 */
const salvarEvento = async (
  acesso: string,
  calendario: string,
  eventoId: string,
  evento: EventoRecebido
): Promise<void> => {
  const base = `/calendars/${encodeURIComponent(calendario)}/events`;
  const corpo = corpoDoEvento(evento);

  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const atualizado = await chamarAgenda('PUT', `${base}/${eventoId}`, acesso, corpo);
    if (atualizado.status === 200) return;
    if (atualizado.status !== 404) throw new ErroDoGoogle(atualizado.status, 'atualizar');

    const criado = await chamarAgenda('POST', base, acesso, { ...corpo, id: eventoId });
    if (criado.status === 200) return;
    // 409: outro painel criou o mesmo evento agora há pouco — atualiza o dele.
    if (criado.status === 409) continue;
    if (criado.status === 404) throw new CalendarioApagado();
    throw new ErroDoGoogle(criado.status, 'criar');
  }
  throw new Error('conflito ao criar o evento');
};

const apagarEvento = async (acesso: string, calendario: string, eventoId: string): Promise<void> => {
  const { status } = await chamarAgenda(
    'DELETE',
    `/calendars/${encodeURIComponent(calendario)}/events/${eventoId}`,
    acesso
  );
  // 404/410: já não está lá, que é o que se queria.
  if (status !== 204 && status !== 200 && status !== 404 && status !== 410) {
    throw new ErroDoGoogle(status, 'apagar');
  }
};

// ==========================================
// PÁGINA DE RETORNO DA JANELA DE AUTORIZAÇÃO
// ==========================================

/**
 * A janela de autorização termina aqui. Ela entrega o resultado ao painel pelo `BroadcastChannel`
 * (e pelo `localStorage`, de reserva) em vez de `window.opener`: depois de passar pelas páginas do
 * Google, a janela costuma perder a referência a quem a abriu.
 */
const paginaDeRetorno = (resultado: Record<string, unknown>): string => {
  const dados = JSON.stringify(resultado).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Google Agenda · La Vie Clinique</title></head>
<body style="font-family:system-ui,sans-serif;padding:32px;color:#2b2420;line-height:1.5">
<p id="mensagem">Concluindo…</p>
<script>
  var r = ${dados};
  try { new BroadcastChannel(${JSON.stringify(CANAL)}).postMessage(r); } catch (e) {}
  try { localStorage.setItem(${JSON.stringify(`${CANAL}:`)} + r.estado, JSON.stringify(r)); } catch (e) {}
  document.getElementById('mensagem').textContent = r.ok
    ? 'Google Agenda conectado (' + r.conta.email + '). Pode fechar esta janela.'
    : 'Não foi possível conectar: ' + r.erro;
  setTimeout(function () { window.close(); }, r.ok ? 1200 : 15000);
</script>
</body></html>`;
};

const ESTADO_VALIDO = /^[A-Za-z0-9-]{8,64}$/;

const codificarEstado = (estado: string, calendario?: string) =>
  Buffer.from(JSON.stringify({ e: estado, c: calendario || '' })).toString('base64url');

const decodificarEstado = (bruto: unknown): { estado: string; calendario: string } | null => {
  if (typeof bruto !== 'string' || bruto.length > 1000) return null;
  try {
    const { e, c } = JSON.parse(Buffer.from(bruto, 'base64url').toString('utf8'));
    if (typeof e !== 'string' || !ESTADO_VALIDO.test(e) || typeof c !== 'string') return null;
    return { estado: e, calendario: c };
  } catch {
    return null;
  }
};

/**
 * O que deu errado na **troca do código pela autorização**, em português e com o que fazer.
 *
 * `invalid_client` é o caso que acontece de verdade, e é enganoso: a tela de consentimento
 * apareceu e o Google devolveu o código, então o ID do cliente existe e o endereço de retorno
 * bate. O que não bate é a chave secreta. Quase sempre uma destas três: a chave é de outro
 * cliente OAuth (o do Firebase, criado sozinho, é o que mais confunde), a chave foi trocada no
 * Google depois de copiada, ou a chave nova entrou nos Secrets sem publicar o app de novo — o
 * servidor só recebe Secret ao publicar.
 */
const mensagemDaTrocaDaAutorizacao = (erro: string, status: number): string => {
  if (erro === 'invalid_client') {
    return (
      'a chave secreta que o servidor tem não é a deste ID de cliente. Confira, nos Secrets do ' +
      'AI Studio, se GOOGLE_AGENDA_CLIENT_ID e GOOGLE_AGENDA_CLIENT_SECRET são do mesmo cliente ' +
      'OAuth, e publique o app de novo — Secret novo só chega ao servidor na publicação'
    );
  }
  if (erro === 'invalid_grant') {
    return 'o código do Google venceu ou já tinha sido usado. Tente conectar de novo';
  }
  return `o Google recusou a troca da autorização (${erro || status})`;
};

/** O código vem pela URL: só é mostrado se tiver cara de código do Google. */
const mensagemDoErroDoGoogle = (erro: string): string =>
  erro === 'access_denied'
    ? 'a autorização foi cancelada na tela do Google'
    : /^[a-z_]{1,60}$/.test(erro)
      ? `o Google respondeu "${erro}"`
      : 'o Google não concluiu a autorização';

// ==========================================
// ROTAS
// ==========================================

export const criarRotasGoogleAgenda = (): Router => {
  const rotas = express.Router();

  // O painel também roda fora deste endereço (dentro do AI Studio, por exemplo) e chama estas
  // rotas de lá. Liberar a origem é seguro porque nada aqui depende de cookie: o que autoriza é o
  // login do painel no cabeçalho Authorization.
  rotas.use((req, res, next) => {
    res.set({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Max-Age': '600',
      'Cache-Control': 'no-store',
    });
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  rotas.get('/status', (_req, res) => {
    res.json({ configurado: configurado() });
  });

  rotas.get('/conectar', (req, res) => {
    if (!configurado()) {
      res.status(503).type('html').send(paginaDeRetorno({ ok: false, estado: '', erro: 'a integração ainda não foi configurada no servidor' }));
      return;
    }
    const estado = typeof req.query.estado === 'string' ? req.query.estado : '';
    if (!ESTADO_VALIDO.test(estado)) {
      res.status(400).send('Pedido inválido.');
      return;
    }
    const calendario = typeof req.query.calendario === 'string' ? req.query.calendario.slice(0, 300) : '';
    const email = typeof req.query.email === 'string' ? req.query.email.trim().slice(0, 200) : '';

    const parametros = new URLSearchParams({
      client_id: clientId(),
      redirect_uri: enderecoDeRetorno(),
      response_type: 'code',
      scope: ESCOPOS.join(' '),
      // offline + consent: o Google só entrega a autorização permanente assim, inclusive para
      // quem já tinha conectado antes e está reconectando.
      access_type: 'offline',
      prompt: 'consent',
      state: codificarEstado(estado, calendario),
      ...(email.includes('@') ? { login_hint: email } : {}),
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${parametros}`);
  });

  rotas.get('/retorno', async (req, res) => {
    const decodificado = decodificarEstado(req.query.state);
    const responder = (resultado: Record<string, unknown>) =>
      res.type('html').send(paginaDeRetorno({ estado: decodificado?.estado || '', ...resultado }));

    if (!decodificado) {
      res.status(400).send('Pedido inválido.');
      return;
    }
    if (typeof req.query.error === 'string') {
      responder({ ok: false, erro: mensagemDoErroDoGoogle(req.query.error) });
      return;
    }
    if (!configurado() || typeof req.query.code !== 'string') {
      responder({ ok: false, erro: 'resposta do Google incompleta' });
      return;
    }

    try {
      const troca = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: req.query.code,
          client_id: clientId(),
          client_secret: clientSecret(),
          redirect_uri: enderecoDeRetorno(),
          grant_type: 'authorization_code',
        }),
      });
      const tokens: any = await troca.json().catch(() => ({}));
      if (!troca.ok) {
        responder({ ok: false, erro: mensagemDaTrocaDaAutorizacao(String(tokens?.error || ''), troca.status) });
        return;
      }
      // Na tela do Google dá para desmarcar a permissão da agenda e autorizar só o resto.
      if (!String(tokens.scope || '').split(' ').includes(ESCOPO_AGENDA)) {
        responder({ ok: false, erro: 'a permissão do Google Agenda não foi marcada na tela do Google. Conecte de novo e deixe a caixa da agenda marcada' });
        return;
      }
      if (!tokens.refresh_token) {
        responder({ ok: false, erro: 'o Google não entregou a autorização permanente. Tente conectar de novo' });
        return;
      }

      // Veio direto do Google, por HTTPS e em troca do código: dá para ler sem conferir assinatura.
      let email = '';
      try {
        email = String(lerParteDoJwt(String(tokens.id_token).split('.')[1])?.email || '');
      } catch {
        // Sem e-mail o painel mostra só "conectado".
      }

      const acesso = tokens.access_token as string;
      let calendarioId = '';
      // Reconectando: reaproveita o calendário que já existe, em vez de criar um segundo
      // "La Vie Clinique" na mesma conta.
      if (decodificado.calendario) {
        const existente = await chamarAgenda('GET', `/calendars/${encodeURIComponent(decodificado.calendario)}`, acesso);
        if (existente.status === 200) calendarioId = decodificado.calendario;
      }
      if (!calendarioId) {
        const criado = await chamarAgenda('POST', '/calendars', acesso, {
          summary: NOME_DO_CALENDARIO,
          description: 'Agendamentos do painel da La Vie Clinique. Alterações feitas aqui não voltam para o sistema.',
          timeZone: FUSO,
        });
        if (criado.status !== 200 || !criado.json?.id) {
          responder({ ok: false, erro: `não foi possível criar o calendário (HTTP ${criado.status})` });
          return;
        }
        calendarioId = criado.json.id;
      }

      const tokenCifrado = cifrar(tokens.refresh_token, clientSecret());
      acessos.set(tokenCifrado, { token: acesso, ate: Date.now() + 50 * 60 * 1000 });
      responder({
        ok: true,
        conta: { email, calendarioId, tokenCifrado, conectadoEm: new Date().toISOString() },
      });
    } catch (e) {
      console.warn('[google-agenda] falha ao concluir a conexão:', e);
      responder({ ok: false, erro: 'falha de comunicação com o Google. Tente de novo' });
    }
  });

  rotas.post('/sincronizar', express.json({ limit: '256kb' }), async (req, res) => {
    if (!configurado()) {
      res.status(503).json({ erro: 'nao-configurado' });
      return;
    }
    if (!(await exigirLogin(req, res))) return;

    const { tokenCifrado, calendarioId, operacoes } = req.body || {};
    if (
      typeof tokenCifrado !== 'string' ||
      typeof calendarioId !== 'string' ||
      !calendarioId ||
      calendarioId.length > 300 ||
      !Array.isArray(operacoes) ||
      operacoes.length > MAX_OPERACOES
    ) {
      res.status(400).json({ erro: 'pedido-invalido' });
      return;
    }

    let acesso: string;
    try {
      acesso = await tokenDeAcesso(tokenCifrado);
    } catch (e) {
      if (e instanceof ContaInvalida) {
        res.status(409).json({ erro: 'conta-invalida', motivo: e.message });
        return;
      }
      console.warn('[google-agenda] falha ao renovar a autorização:', e);
      res.status(502).json({ erro: 'google-indisponivel' });
      return;
    }

    const resultados: Resultado[] = [];
    for (const op of operacoes) {
      const eventoId = typeof op?.eventoId === 'string' ? op.eventoId : '';
      if (!ID_DO_EVENTO.test(eventoId)) {
        resultados.push({ eventoId, ok: false, erro: 'id-invalido' });
        continue;
      }
      try {
        if (op.acao === 'apagar') {
          await apagarEvento(acesso, calendarioId, eventoId);
        } else if (op.acao === 'salvar') {
          const evento = validarEvento(op.evento);
          if (!evento) {
            resultados.push({ eventoId, ok: false, erro: 'evento-invalido' });
            continue;
          }
          await salvarEvento(acesso, calendarioId, eventoId, evento);
        } else {
          resultados.push({ eventoId, ok: false, erro: 'acao-invalida' });
          continue;
        }
        resultados.push({ eventoId, ok: true });
      } catch (e) {
        if (e instanceof CalendarioApagado) {
          // A profissional apagou o calendário "La Vie Clinique" no Google: só reconectando.
          res.status(409).json({ erro: 'conta-invalida', motivo: 'o calendário "La Vie Clinique" foi apagado no Google' });
          return;
        }
        // 401: a autorização de 1 hora guardada não vale mais. A próxima tentativa troca outra —
        // e, se a profissional tiver removido o acesso, é essa troca que diz "conta-invalida".
        if (e instanceof ErroDoGoogle && e.status === 401) acessos.delete(tokenCifrado);
        console.warn('[google-agenda] falha numa operação:', e);
        resultados.push({ eventoId, ok: false, erro: 'falha' });
      }
    }
    res.json({ resultados });
  });

  rotas.post('/desconectar', express.json({ limit: '16kb' }), async (req, res) => {
    if (!(await exigirLogin(req, res))) return;
    const tokenCifrado = req.body?.tokenCifrado;
    if (typeof tokenCifrado === 'string' && configurado()) {
      acessos.delete(tokenCifrado);
      try {
        const refreshToken = decifrar(tokenCifrado, clientSecret());
        await fetch('https://oauth2.googleapis.com/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: refreshToken }),
        });
      } catch (e) {
        // Desconectar no painel vale mesmo assim; a profissional pode remover o acesso pela
        // conta Google dela.
        console.warn('[google-agenda] não foi possível revogar a autorização:', e);
      }
    }
    res.json({ ok: true });
  });

  rotas.use((_req, res) => {
    res.status(404).json({ erro: 'rota-inexistente' });
  });

  return rotas;
};

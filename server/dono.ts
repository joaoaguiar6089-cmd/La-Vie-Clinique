import express, { type Request, type Response, type Router } from 'express';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { ehZulia, usaEmuladores } from '../src/lib/projetoFirebase';
import { aceiteEmDia } from '../src/utils/documentosLegais';
import { usoDe, type Plano } from '../src/utils/planos';
import { authAdmin, bancoAdmin, servidorGerenciaLogins } from './firebaseAdmin';
import { loginDoPedido, type LoginDoPainel } from './login';

/**
 * O painel do dono da plataforma (etapa 5 de docs/zulia-plataforma.md), pelo servidor.
 *
 * Só o login com a claim `donoDaPlataforma` **e** que entrou com o segundo fator (o aplicativo
 * autenticador). As regras do Firestore não deixam o dono ler nada: tudo o que ele vê passa por
 * aqui, e é só o que é da conta da clínica — nome, plano, uso em números, logins, último acesso,
 * espaço das fotos. Nenhum dado de paciente.
 *
 * Rotas (todas em /api/dono, com `Authorization: Bearer <token>`):
 *   GET  /clinicas                                   → { clinicas: [...], totais }
 *   POST /plano     { clinicaId, plano, cortesia }   → { ok, uso }  (reconta o uso)
 *   POST /situacao  { clinicaId, situacao }          → { ok }       ('ativa' | 'suspensa')
 *
 * Suspender desativa os logins da equipe (e derruba as sessões); reativar liga de volta os que a
 * suspensão desligou. Os dados não são tocados.
 *
 * Recusas (`erro`): `so-na-plataforma` (404), `servidor-nao-configurado` (503), `login` (401),
 * `so-dono` (403), `duas-etapas` (403: o dono entrou sem o segundo fator), `clinica-nao-encontrada`
 * (404), `pedido-invalido` (400).
 */

export interface OpcoesDoDono {
  zulia?: boolean;
  banco?: () => Firestore | null;
  auth?: () => Auth;
  gerencia?: () => boolean;
  login?: (req: Request) => Promise<LoginDoPainel | null>;
  /** Exigir o segundo fator. Padrão: sempre, menos nos emuladores (que não têm o autenticador). */
  exigirDuasEtapas?: boolean;
  /** Para o espaço das fotos: soma os arquivos de `clinicas/{c}/`. Ausente: não mede. */
  espacoDaClinica?: (clinicaId: string) => Promise<number | null>;
}

export interface ClinicaParaODono {
  id: string;
  nome: string;
  plano: Plano;
  cortesia: boolean;
  situacao: string;
  criadaEm: string | null;
  criadaPor: string | null;
  dona: string | null;
  uso: { clientes: number; procedimentos: number };
  logins: number;
  ultimoAcesso: string | null;
  espacoBytes: number | null;
  aceiteEmDia: boolean;
}

const texto = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/** O último acesso de cada login (Authentication), em lotes de 100. */
async function ultimosAcessos(auth: Auth, uids: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  for (let i = 0; i < uids.length; i += 100) {
    const { users } = await auth.getUsers(uids.slice(i, i + 100).map((uid) => ({ uid })));
    for (const u of users) {
      const quando = u.metadata.lastRefreshTime || u.metadata.lastSignInTime;
      if (quando) mapa.set(u.uid, new Date(quando).toISOString());
    }
  }
  return mapa;
}

export async function listarClinicas(
  { db, auth }: { db: Firestore; auth: Auth },
  espacoDaClinica?: (clinicaId: string) => Promise<number | null>
): Promise<{ clinicas: ClinicaParaODono[]; totais: Record<string, number> }> {
  const snap = await db.collection('clinicas').get();
  const docs = snap.docs.filter((d) => d.data().situacao !== 'ensaio');
  const todosOsUids = docs.flatMap((d) => Object.keys((d.data().equipe || {}) as Record<string, unknown>));
  const acessos = await ultimosAcessos(auth, todosOsUids);

  const clinicas = await Promise.all(
    docs.map(async (d): Promise<ClinicaParaODono> => {
      const dados = d.data();
      const uids = Object.keys((dados.equipe || {}) as Record<string, unknown>);
      const ultimo = uids.map((u) => acessos.get(u)).filter((v): v is string => !!v).sort().pop() || null;
      return {
        id: d.id,
        nome: texto(dados.nome) || d.id,
        plano: dados.plano === 'completo' ? 'completo' : 'gratuito',
        cortesia: dados.cortesia === true,
        situacao: texto(dados.situacao) || 'ativa',
        criadaEm: texto(dados.criadaEm),
        criadaPor: texto(dados.criadaPor),
        dona: texto(dados.dona?.email),
        uso: usoDe(dados),
        logins: uids.length,
        ultimoAcesso: ultimo,
        espacoBytes: espacoDaClinica ? await espacoDaClinica(d.id).catch(() => null) : null,
        aceiteEmDia: aceiteEmDia(dados.aceites?.termos),
      };
    })
  );
  clinicas.sort((a, b) => (b.criadaEm || '').localeCompare(a.criadaEm || ''));

  const totais = {
    clinicas: clinicas.length,
    completo: clinicas.filter((c) => c.plano === 'completo' && !c.cortesia).length,
    cortesia: clinicas.filter((c) => c.cortesia).length,
    gratuito: clinicas.filter((c) => c.plano === 'gratuito').length,
    suspensas: clinicas.filter((c) => c.situacao === 'suspensa').length,
    clientes: clinicas.reduce((s, c) => s + c.uso.clientes, 0),
    procedimentos: clinicas.reduce((s, c) => s + c.uso.procedimentos, 0),
    logins: clinicas.reduce((s, c) => s + c.logins, 0),
    espacoBytes: clinicas.reduce((s, c) => s + (c.espacoBytes || 0), 0),
  };
  return { clinicas, totais };
}

/** Reconta o uso de uma clínica com `count()` (sem ler o conteúdo dos cadastros). */
async function recontar(db: Firestore, clinicaId: string): Promise<{ clientes: number; procedimentos: number }> {
  const [clientes, procedimentos] = await Promise.all(
    ['patients', 'procedures'].map(async (c) => (await db.collection(`clinicas/${clinicaId}/${c}`).count().get()).data().count)
  );
  return { clientes, procedimentos };
}

export async function mudarPlano(
  { db }: { db: Firestore },
  quem: LoginDoPainel,
  pedido: { clinicaId?: unknown; plano?: unknown; cortesia?: unknown }
): Promise<{ uso: { clientes: number; procedimentos: number } }> {
  const clinicaId = texto(pedido.clinicaId);
  const plano = pedido.plano === 'completo' || pedido.plano === 'gratuito' ? pedido.plano : null;
  if (!clinicaId || !plano || typeof pedido.cortesia !== 'boolean') throw new ErroDoDono(400, 'pedido-invalido');
  if (pedido.cortesia && plano !== 'completo') throw new ErroDoDono(400, 'pedido-invalido');
  const ref = db.doc(`clinicas/${clinicaId}`);
  if (!(await ref.get()).exists) throw new ErroDoDono(404, 'clinica-nao-encontrada');
  // O completo não exige o contador: ao mudar de plano, ele é recontado.
  const uso = await recontar(db, clinicaId);
  const agora = new Date().toISOString();
  await ref.update({
    plano,
    cortesia: pedido.cortesia,
    'uso.clientes': uso.clientes,
    'uso.procedimentos': uso.procedimentos,
    planoAlteradoEm: agora,
    planoAlteradoPor: quem.email || quem.uid,
    atualizadaEm: agora,
  });
  return { uso };
}

export async function mudarSituacao(
  { db, auth }: { db: Firestore; auth: Auth },
  quem: LoginDoPainel,
  pedido: { clinicaId?: unknown; situacao?: unknown }
): Promise<void> {
  const clinicaId = texto(pedido.clinicaId);
  const situacao = pedido.situacao === 'ativa' || pedido.situacao === 'suspensa' ? pedido.situacao : null;
  if (!clinicaId || !situacao) throw new ErroDoDono(400, 'pedido-invalido');
  const ref = db.doc(`clinicas/${clinicaId}`);
  const dados = (await ref.get()).data();
  if (!dados) throw new ErroDoDono(404, 'clinica-nao-encontrada');
  const agora = new Date().toISOString();

  if (situacao === 'suspensa') {
    if (dados.situacao === 'suspensa') return;
    // Só os logins que estão ativos agora: reativar liga de volta exatamente estes.
    const uids = Object.keys((dados.equipe || {}) as Record<string, unknown>);
    const desligados: string[] = [];
    for (const uid of uids) {
      const u = await auth.getUser(uid).catch(() => null);
      if (!u || u.disabled) continue;
      await auth.updateUser(uid, { disabled: true });
      await auth.revokeRefreshTokens(uid);
      desligados.push(uid);
    }
    await ref.update({
      situacao: 'suspensa',
      suspensao: { em: agora, por: quem.email || quem.uid, loginsDesligados: desligados },
      atualizadaEm: agora,
    });
    return;
  }

  if (dados.situacao !== 'suspensa') return;
  const desligados = (dados.suspensao?.loginsDesligados || []) as string[];
  for (const uid of desligados) await auth.updateUser(uid, { disabled: false }).catch(() => {});
  await ref.update({
    situacao: 'ativa',
    suspensao: null,
    reativadaEm: agora,
    reativadaPor: quem.email || quem.uid,
    atualizadaEm: agora,
  });
}

export class ErroDoDono extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string
  ) {
    super(codigo);
  }
}

export function criarRotasDoDono(opcoes: OpcoesDoDono = {}): Router {
  const zulia = opcoes.zulia ?? ehZulia;
  const banco = opcoes.banco ?? bancoAdmin;
  const auth = opcoes.auth ?? authAdmin;
  const gerencia = opcoes.gerencia ?? servidorGerenciaLogins;
  const verificar = opcoes.login ?? loginDoPedido;
  const exigirDuasEtapas = opcoes.exigirDuasEtapas ?? !usaEmuladores;

  const rotas = express.Router();
  rotas.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  rotas.use(express.json({ limit: '4kb' }));

  /** O dono (com o segundo fator) e o acesso de servidor, ou `null` com a resposta dada. */
  const preparar = async (req: Request, res: Response) => {
    if (!zulia) {
      res.status(404).json({ erro: 'so-na-plataforma' });
      return null;
    }
    const db = banco();
    if (!db || !gerencia()) {
      res.status(503).json({ erro: 'servidor-nao-configurado' });
      return null;
    }
    let login: LoginDoPainel | null = null;
    try {
      login = await verificar(req);
    } catch (e) {
      console.warn('[dono] não foi possível conferir o login:', e);
    }
    if (!login) {
      res.status(401).json({ erro: 'login' });
      return null;
    }
    if (!login.dono || login.clinicaId) {
      res.status(403).json({ erro: 'so-dono' });
      return null;
    }
    if (exigirDuasEtapas && !login.segundoFator) {
      res.status(403).json({ erro: 'duas-etapas' });
      return null;
    }
    return { login, acesso: { db, auth: auth() } };
  };

  const responder = async (res: Response, contexto: string, fazer: () => Promise<unknown>) => {
    try {
      res.json((await fazer()) ?? { ok: true });
    } catch (erro) {
      if (erro instanceof ErroDoDono) {
        res.status(erro.status).json({ erro: erro.codigo });
        return;
      }
      console.error(`[dono] ${contexto}:`, erro);
      res.status(500).json({ erro: 'interno' });
    }
  };

  rotas.get('/clinicas', async (req, res) => {
    const p = await preparar(req, res);
    if (!p) return;
    await responder(res, 'listar', () => listarClinicas(p.acesso, opcoes.espacoDaClinica));
  });

  rotas.post('/plano', async (req, res) => {
    const p = await preparar(req, res);
    if (!p) return;
    await responder(res, 'plano', async () => ({ ok: true, ...(await mudarPlano(p.acesso, p.login, req.body || {})) }));
  });

  rotas.post('/situacao', async (req, res) => {
    const p = await preparar(req, res);
    if (!p) return;
    await responder(res, 'situação', () => mudarSituacao(p.acesso, p.login, req.body || {}));
  });

  rotas.use((_req, res) => {
    res.status(404).json({ erro: 'rota-inexistente' });
  });

  return rotas;
}

import crypto from 'node:crypto';
import express, { type Request, type Response, type Router } from 'express';
import type { Auth, UserRecord } from 'firebase-admin/auth';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { ehZulia } from '../src/lib/projetoFirebase';
import { mesmaEquipe, uidsDaEquipe } from '../src/utils/equipe';
import { limitesDoPlano } from '../src/utils/planos';
import { authAdmin, bancoAdmin, servidorGerenciaLogins } from './firebaseAdmin';
import { loginDoPedido, type LoginDoPainel, type Papel } from './login';

// ==========================================
// MODO LEGADO: A LISTA DE LOGINS DAS REGRAS
// ==========================================

/**
 * Mantém `clinic_settings/main_profile.equipeUids` igual aos logins da lista de profissionais.
 *
 * Só no modo legado (projeto da La Vie). Na Zulia as regras conferem a claim do login, e não há
 * lista a sincronizar — `server.ts` nem liga isto.
 *
 * As regras do Firestore liberam o painel só para os uids desta lista (ver `src/utils/equipe.ts`).
 * O painel já grava a lista a cada salvamento do perfil; isto aqui é a rede de segurança — roda
 * quando o servidor sobe e de tempos em tempos, e conserta uma lista que ficou para trás (um
 * perfil salvo por uma versão antiga do app, por exemplo). Sem ela, uma profissional com login
 * válido poderia ficar trancada fora do próprio painel.
 *
 * Devolve `true` quando precisou corrigir.
 */
export async function sincronizarEquipe(db: Firestore): Promise<boolean> {
  const ref = db.collection('clinic_settings').doc('main_profile');
  const snap = await ref.get();
  if (!snap.exists) return false;
  const dados = snap.data() || {};
  const uids = uidsDaEquipe(dados.professionals);
  if (mesmaEquipe(dados.equipeUids, uids)) return false;
  await ref.update({ equipeUids: uids });
  return true;
}

const INTERVALO_MS = 30 * 60 * 1000;

/** Sincroniza agora e a cada 30 minutos. Nunca lança: o servidor continua de pé se falhar. */
export function manterEquipeSincronizada(banco: () => Firestore | null): void {
  const rodar = async () => {
    const db = banco();
    if (!db) return;
    try {
      if (await sincronizarEquipe(db)) console.log('[equipe] lista de logins da equipe atualizada.');
    } catch (erro) {
      console.warn('[equipe] não foi possível conferir a lista de logins da equipe:', erro);
    }
  };
  void rodar();
  setInterval(rodar, INTERVALO_MS).unref();
}

// ==========================================
// ZULIA: OS LOGINS DA EQUIPE (/api/equipe)
// ==========================================

/**
 * Na Zulia, quem é da clínica e com que papel está nas custom claims do login (`clinicaId`,
 * `papel`), e só o servidor grava claims. Por isso criar o login de uma profissional, mudar o papel
 * e desativar passam por aqui — e só a admin da mesma clínica pode.
 *
 * Rotas (todas em /api/equipe, com `Authorization: Bearer <token do painel>`):
 *   POST /criar-login  { email, papel? }  → { uid }  (depois o painel manda o e-mail de definir
 *                                                    senha, `sendPasswordResetEmail`, que é o convite)
 *   POST /mudar-papel  { uid, papel }     → { ok }   (o painel força o refresh do token se for o
 *                                                    próprio login)
 *   POST /desativar    { uid }            → { ok }
 *
 * "Sempre ao menos uma admin" é conferido no índice `clinicas/{c}.equipe` ({ uid: papel }), que só
 * o servidor grava (aqui, em `scripts/criar-clinica.ts` e na migração) e que muda numa transação.
 * No modo legado estas rotas não existem: o painel cria o login como sempre
 * (`createProfessionalLogin`).
 */

export interface OpcoesDaEquipe {
  /** Para os testes: as rotas como na Zulia ou no legado. */
  zulia?: boolean;
  banco?: () => Firestore | null;
  auth?: () => Auth;
  /** Para os testes: o servidor pode gerenciar logins? */
  gerencia?: () => boolean;
  login?: (req: Request) => Promise<LoginDoPainel | null>;
}

export class ErroDaEquipe extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string
  ) {
    super(codigo);
  }
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

const papelValido = (valor: unknown): Papel | null =>
  valor === 'admin' || valor === 'profissional' ? valor : null;

/** Uma senha que ninguém usa: a profissional define a dela pelo e-mail de convite. */
const senhaDescartavel = () => `${crypto.randomBytes(24).toString('base64url')}-Aa1`;

/** O índice da equipe: { uid: papel }, só com os logins ativos. */
type Indice = Record<string, Papel>;

const outrasAdmins = (indice: Indice, uid: string) =>
  Object.entries(indice).filter(([outro, papel]) => outro !== uid && papel === 'admin').length;

/** O login `uid`, se ele for desta clínica; senão lança 404 (sem dizer de quem é). */
const loginDaClinica = async (auth: Auth, uid: unknown, clinicaId: string): Promise<UserRecord> => {
  if (typeof uid !== 'string' || !uid || uid.length > 128) throw new ErroDaEquipe(400, 'pedido-invalido');
  const usuario = await auth.getUser(uid).catch(() => null);
  if (!usuario || usuario.customClaims?.clinicaId !== clinicaId) throw new ErroDaEquipe(404, 'login-nao-encontrado');
  return usuario;
};

/** Grava `uid` no índice (ou tira, com `papel` nulo), conferindo que sobra uma admin. */
const atualizarIndice = async (db: Firestore, clinicaId: string, uid: string, papel: Papel | null) => {
  const ref = db.doc(`clinicas/${clinicaId}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ErroDaEquipe(404, 'clinica-nao-encontrada');
    const indice = (snap.data()?.equipe || {}) as Indice;
    if (indice[uid] === 'admin' && papel !== 'admin' && outrasAdmins(indice, uid) === 0) {
      throw new ErroDaEquipe(409, 'ultima-admin');
    }
    tx.update(ref, { [`equipe.${uid}`]: papel ?? FieldValue.delete(), atualizadaEm: new Date().toISOString() });
  });
};

export async function criarLoginDaEquipe(
  { auth, db }: { auth: Auth; db: Firestore },
  clinicaId: string,
  pedido: { email?: unknown; papel?: unknown }
): Promise<{ uid: string; jaExistia: boolean }> {
  const email = typeof pedido.email === 'string' ? pedido.email.trim().toLowerCase() : '';
  if (!EMAIL.test(email)) throw new ErroDaEquipe(400, 'email-invalido');
  const papel = pedido.papel === undefined ? 'profissional' : papelValido(pedido.papel);
  if (!papel) throw new ErroDaEquipe(400, 'papel-invalido');

  // Limite de logins do plano (o gratuito tem 1: o da admin). O índice da equipe só tem os ativos.
  const clinica = (await db.doc(`clinicas/${clinicaId}`).get()).data() || {};
  const ativos = Object.keys((clinica.equipe || {}) as Record<string, unknown>).length;
  if (ativos >= limitesDoPlano(clinica.plano).logins) throw new ErroDaEquipe(403, 'limite-do-plano');

  const existente = await auth.getUserByEmail(email).catch(() => null);
  if (existente) {
    // Um login pertence a uma clínica só. O de outra clínica — ou uma conta criada por fora, sem
    // clínica, que alguém poderia ter aberto com o e-mail da profissional — não é reaproveitado.
    if (existente.customClaims?.clinicaId !== clinicaId) throw new ErroDaEquipe(409, 'email-em-uso');
    // Da mesma clínica: um login desativado que volta.
    await atualizarIndice(db, clinicaId, existente.uid, papel);
    await auth.setCustomUserClaims(existente.uid, { ...existente.customClaims, clinicaId, papel });
    await auth.updateUser(existente.uid, { disabled: false });
    return { uid: existente.uid, jaExistia: true };
  }

  const usuario = await auth.createUser({ email, password: senhaDescartavel(), emailVerified: false });
  await auth.setCustomUserClaims(usuario.uid, { clinicaId, papel });
  await atualizarIndice(db, clinicaId, usuario.uid, papel);
  return { uid: usuario.uid, jaExistia: false };
}

export async function mudarPapelNaEquipe(
  { auth, db }: { auth: Auth; db: Firestore },
  clinicaId: string,
  pedido: { uid?: unknown; papel?: unknown }
): Promise<void> {
  const papel = papelValido(pedido.papel);
  if (!papel) throw new ErroDaEquipe(400, 'papel-invalido');
  const usuario = await loginDaClinica(auth, pedido.uid, clinicaId);
  // O índice primeiro: é ele que barra tirar a última admin.
  await atualizarIndice(db, clinicaId, usuario.uid, papel);
  await auth.setCustomUserClaims(usuario.uid, { ...usuario.customClaims, clinicaId, papel });
}

export async function desativarLoginDaEquipe(
  { auth, db }: { auth: Auth; db: Firestore },
  clinicaId: string,
  quemPede: string,
  pedido: { uid?: unknown }
): Promise<void> {
  const usuario = await loginDaClinica(auth, pedido.uid, clinicaId);
  if (usuario.uid === quemPede) throw new ErroDaEquipe(409, 'desativar-a-si-mesma');
  await atualizarIndice(db, clinicaId, usuario.uid, null);
  // A claim fica: se a clínica criar o login de novo com o mesmo e-mail, ele volta (ver acima).
  await auth.updateUser(usuario.uid, { disabled: true });
  // O token que ela já tem vale por até uma hora; com isto, o servidor o recusa na hora
  // (`checkRevoked` em `server/login.ts`) e o navegador dela não consegue renovar.
  await auth.revokeRefreshTokens(usuario.uid);
}

export function criarRotasDaEquipe(opcoes: OpcoesDaEquipe = {}): Router {
  const zulia = opcoes.zulia ?? ehZulia;
  const banco = opcoes.banco ?? bancoAdmin;
  const auth = opcoes.auth ?? authAdmin;
  const gerencia = opcoes.gerencia ?? servidorGerenciaLogins;
  const verificar = opcoes.login ?? loginDoPedido;

  const rotas = express.Router();
  rotas.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  rotas.use(express.json({ limit: '16kb' }));

  /** A admin da clínica que fez o pedido e o acesso de servidor, ou `null` com a resposta dada. */
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
      console.warn('[equipe] não foi possível conferir o login:', e);
    }
    if (!login) {
      res.status(401).json({ erro: 'login' });
      return null;
    }
    if (!login.clinicaId || login.papel !== 'admin') {
      res.status(403).json({ erro: 'so-admin' });
      return null;
    }
    return { login, clinicaId: login.clinicaId, acesso: { auth: auth(), db } };
  };

  const responder = async (res: Response, contexto: string, fazer: () => Promise<unknown>) => {
    try {
      res.json((await fazer()) ?? { ok: true });
    } catch (erro) {
      if (erro instanceof ErroDaEquipe) {
        res.status(erro.status).json({ erro: erro.codigo });
        return;
      }
      console.error(`[equipe] ${contexto}:`, erro);
      res.status(500).json({ erro: 'interno' });
    }
  };

  rotas.post('/criar-login', async (req, res) => {
    const p = await preparar(req, res);
    if (!p) return;
    await responder(res, 'criar login', () => criarLoginDaEquipe(p.acesso, p.clinicaId, req.body || {}));
  });

  rotas.post('/mudar-papel', async (req, res) => {
    const p = await preparar(req, res);
    if (!p) return;
    await responder(res, 'mudar papel', () => mudarPapelNaEquipe(p.acesso, p.clinicaId, req.body || {}));
  });

  rotas.post('/desativar', async (req, res) => {
    const p = await preparar(req, res);
    if (!p) return;
    await responder(res, 'desativar', () =>
      desativarLoginDaEquipe(p.acesso, p.clinicaId, p.login.uid, req.body || {})
    );
  });

  rotas.use((_req, res) => {
    res.status(404).json({ erro: 'rota-inexistente' });
  });

  return rotas;
}

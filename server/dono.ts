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
 *   POST /encerrar  { clinicaId }                    → { ok, apagarAPartirDe }
 *   POST /desfazer-encerramento { clinicaId }        → { ok }
 *   POST /apagar    { clinicaId, confirmacao }       → { ok, arquivos, logins }
 *
 * Suspender desativa os logins da equipe (e derruba as sessões); reativar liga de volta os que a
 * suspensão desligou. Os dados não são tocados.
 *
 * Encerrar é o fim da conta (Termos, 15.3; Acordo de Tratamento de Dados, 10.2): os logins saem como
 * na suspensão, e os dados ficam guardados por 90 dias, para a clínica pedir a cópia. Dentro desse
 * prazo o encerramento pode ser desfeito. Passados os 90 dias, "apagar" elimina tudo — arquivos,
 * logins e o banco da clínica — e os Termos dão mais 30 dias para isso acontecer. Fica só uma
 * lápide em clinicas_apagadas/{c} (nome e datas), que é a prova da eliminação que o Acordo promete
 * confirmar por escrito. Apagar exige digitar o id da clínica.
 *
 * Recusas (`erro`): `so-na-plataforma` (404), `servidor-nao-configurado` (503), `login` (401),
 * `so-dono` (403), `duas-etapas` (403: o dono entrou sem o segundo fator), `clinica-nao-encontrada`
 * (404), `pedido-invalido` (400), `nao-encerrada` e `prazo-nao-venceu` (409, ao apagar),
 * `sem-permissao-arquivos` (503: a conta do servidor não pode apagar no Storage).
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
  /** Para apagar uma clínica encerrada: apaga os arquivos de clinicas/{c}/. Ausente: recusa apagar. */
  apagarArquivos?: (clinicaId: string) => Promise<number>;
}

/** Os dias de guarda depois do encerramento, e o prazo para eliminar depois deles (Termos, 15.3). */
export const DIAS_DE_GUARDA_DEPOIS_DO_ENCERRAMENTO = 90;
export const DIAS_PARA_ELIMINAR = 30;

export interface EncerramentoParaODono {
  em: string;
  por: string | null;
  /** A partir de quando os dados podem (e devem) ser apagados. */
  apagarAPartirDe: string;
  /** Até quando os Termos prometem apagar. */
  apagarAte: string;
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
  /** Presente quando a conta foi encerrada. */
  encerramento: EncerramentoParaODono | null;
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
        encerramento:
          dados.situacao === 'encerrada' && dados.encerramento?.em
            ? {
                em: String(dados.encerramento.em),
                por: texto(dados.encerramento.por),
                apagarAPartirDe: String(dados.encerramento.apagarAPartirDe),
                apagarAte: String(dados.encerramento.apagarAte),
              }
            : null,
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
    encerradas: clinicas.filter((c) => c.situacao === 'encerrada').length,
    paraApagar: clinicas.filter((c) => c.encerramento && c.encerramento.apagarAPartirDe <= new Date().toISOString()).length,
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
  // Encerrada não se suspende nem se reativa por aqui: o caminho de volta é desfazer o encerramento.
  if (dados.situacao === 'encerrada') throw new ErroDoDono(409, 'encerrada');
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

/** Desliga os logins ativos da equipe e derruba as sessões. Devolve quem foi desligado. */
async function desligarLogins(auth: Auth, uids: string[]): Promise<string[]> {
  const desligados: string[] = [];
  for (const uid of uids) {
    const u = await auth.getUser(uid).catch(() => null);
    if (!u || u.disabled) continue;
    await auth.updateUser(uid, { disabled: true });
    await auth.revokeRefreshTokens(uid);
    desligados.push(uid);
  }
  return desligados;
}

const maisDias = (iso: string, dias: number): string => new Date(new Date(iso).getTime() + dias * 86400000).toISOString();

/**
 * Encerra a conta: logins desligados (os que a suspensão já tinha desligado continuam na lista,
 * para o "desfazer" ligar de volta) e o relógio dos 90 dias começa.
 */
export async function encerrarClinica(
  { db, auth }: { db: Firestore; auth: Auth },
  quem: LoginDoPainel,
  pedido: { clinicaId?: unknown }
): Promise<{ apagarAPartirDe: string }> {
  const clinicaId = texto(pedido.clinicaId);
  if (!clinicaId) throw new ErroDoDono(400, 'pedido-invalido');
  const ref = db.doc('clinicas/' + clinicaId);
  const dados = (await ref.get()).data();
  if (!dados) throw new ErroDoDono(404, 'clinica-nao-encontrada');
  if (dados.situacao === 'encerrada' && dados.encerramento?.apagarAPartirDe) {
    return { apagarAPartirDe: String(dados.encerramento.apagarAPartirDe) };
  }
  const agora = new Date().toISOString();
  const jaDesligados = (dados.situacao === 'suspensa' ? dados.suspensao?.loginsDesligados || [] : []) as string[];
  const desligados = await desligarLogins(auth, Object.keys((dados.equipe || {}) as Record<string, unknown>));
  const apagarAPartirDe = maisDias(agora, DIAS_DE_GUARDA_DEPOIS_DO_ENCERRAMENTO);
  await ref.update({
    situacao: 'encerrada',
    encerramento: {
      em: agora,
      por: quem.email || quem.uid,
      apagarAPartirDe,
      apagarAte: maisDias(apagarAPartirDe, DIAS_PARA_ELIMINAR),
      loginsDesligados: [...new Set([...jaDesligados, ...desligados])],
    },
    suspensao: null,
    atualizadaEm: agora,
  });
  return { apagarAPartirDe };
}

/** Desfaz o encerramento dentro dos 90 dias: a conta volta ativa, com os logins de antes. */
export async function desfazerEncerramento(
  { db, auth }: { db: Firestore; auth: Auth },
  quem: LoginDoPainel,
  pedido: { clinicaId?: unknown }
): Promise<void> {
  const clinicaId = texto(pedido.clinicaId);
  if (!clinicaId) throw new ErroDoDono(400, 'pedido-invalido');
  const ref = db.doc('clinicas/' + clinicaId);
  const dados = (await ref.get()).data();
  if (!dados) throw new ErroDoDono(404, 'clinica-nao-encontrada');
  if (dados.situacao !== 'encerrada') return;
  const desligados = (dados.encerramento?.loginsDesligados || []) as string[];
  for (const uid of desligados) await auth.updateUser(uid, { disabled: false }).catch(() => {});
  const agora = new Date().toISOString();
  await ref.update({
    situacao: 'ativa',
    encerramento: null,
    reativadaEm: agora,
    reativadaPor: quem.email || quem.uid,
    atualizadaEm: agora,
  });
}

/**
 * Elimina a clínica encerrada há 90 dias ou mais: os arquivos no Storage, os logins e o banco
 * inteiro dela (recursiveDelete de clinicas/{c}, com todas as coleções de dentro). Os arquivos vão
 * primeiro: se a conta do servidor não puder apagá-los, nada mais é tocado, e dá para repetir
 * depois de dar a permissão.
 */
export async function apagarClinica(
  { db, auth }: { db: Firestore; auth: Auth },
  quem: LoginDoPainel,
  pedido: { clinicaId?: unknown; confirmacao?: unknown },
  apagarArquivos?: (clinicaId: string) => Promise<number>
): Promise<{ arquivos: number; logins: number }> {
  const clinicaId = texto(pedido.clinicaId);
  if (!clinicaId || pedido.confirmacao !== clinicaId) throw new ErroDoDono(400, 'pedido-invalido');
  const ref = db.doc('clinicas/' + clinicaId);
  const dados = (await ref.get()).data();
  if (!dados) throw new ErroDoDono(404, 'clinica-nao-encontrada');
  if (dados.situacao !== 'encerrada' || !dados.encerramento?.apagarAPartirDe) throw new ErroDoDono(409, 'nao-encerrada');
  if (String(dados.encerramento.apagarAPartirDe) > new Date().toISOString()) throw new ErroDoDono(409, 'prazo-nao-venceu');
  if (!apagarArquivos) throw new ErroDoDono(503, 'sem-permissao-arquivos');

  let arquivos = 0;
  try {
    arquivos = await apagarArquivos(clinicaId);
  } catch (erro) {
    console.error('[dono] não foi possível apagar os arquivos de ' + clinicaId + ':', (erro as Error).message);
    throw new ErroDoDono(503, 'sem-permissao-arquivos');
  }

  // Os logins da equipe e o da dona (que pode não estar no índice, se saiu da equipe antes).
  const uids = [
    ...new Set(
      [...Object.keys((dados.equipe || {}) as Record<string, unknown>), texto(dados.dona?.uid)].filter((u): u is string => !!u)
    ),
  ];
  let logins = 0;
  for (let i = 0; i < uids.length; i += 100) {
    const resultado = await auth.deleteUsers(uids.slice(i, i + 100));
    logins += resultado.successCount;
  }

  await db.recursiveDelete(ref);
  const agora = new Date().toISOString();
  await db.doc('clinicas_apagadas/' + clinicaId).set({
    nome: texto(dados.nome) || clinicaId,
    criadaEm: texto(dados.criadaEm),
    encerradaEm: String(dados.encerramento.em),
    apagadaEm: agora,
    apagadaPor: quem.email || quem.uid,
    arquivos,
    logins,
  });
  return { arquivos, logins };
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

  rotas.post('/encerrar', async (req, res) => {
    const p = await preparar(req, res);
    if (!p) return;
    await responder(res, 'encerrar', async () => ({ ok: true, ...(await encerrarClinica(p.acesso, p.login, req.body || {})) }));
  });

  rotas.post('/desfazer-encerramento', async (req, res) => {
    const p = await preparar(req, res);
    if (!p) return;
    await responder(res, 'desfazer encerramento', () => desfazerEncerramento(p.acesso, p.login, req.body || {}));
  });

  rotas.post('/apagar', async (req, res) => {
    const p = await preparar(req, res);
    if (!p) return;
    await responder(res, 'apagar', async () => ({
      ok: true,
      ...(await apagarClinica(p.acesso, p.login, req.body || {}, opcoes.apagarArquivos)),
    }));
  });

  rotas.use((_req, res) => {
    res.status(404).json({ erro: 'rota-inexistente' });
  });

  return rotas;
}

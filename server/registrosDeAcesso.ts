import express, { type Request, type Router } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import { ehZulia } from '../src/lib/projetoFirebase';
import { bancoAdmin } from './firebaseAdmin';
import { loginDoPedido, type LoginDoPainel } from './login';

/**
 * Os registros de acesso à plataforma — o que a Política de Privacidade e o Acordo de Tratamento de
 * Dados prometem guardar por 6 meses (art. 15 do Marco Civil da Internet): quem entrou, de qual
 * endereço IP, quando.
 *
 * O painel avisa o servidor ao abrir (`POST /api/acesso`, uma vez por sessão do navegador); o
 * servidor confere o login pelo token e grava em `registros_de_acesso`, uma coleção que as regras
 * fecham para todo mundo (só o Admin SDK escreve e lê). Os registros de mais de 6 meses são
 * apagados aos poucos, a cada gravação nova — sem tarefa agendada, que a hospedagem do AI Studio
 * não tem.
 *
 * Não depende da retenção dos logs da hospedagem (30 dias no padrão do Cloud Logging), que o
 * projeto não controla.
 */

/** 6 meses, contados por cima (184 dias). */
export const DIAS_DE_GUARDA_DOS_ACESSOS = 184;
const COLECAO = 'registros_de_acesso';

/** Um aviso por login a cada 10 minutos basta — recarregar a página não vira um registro novo. */
const INTERVALO_MS = 10 * 60 * 1000;
const ultimos = new Map<string, number>();

const ipDe = (req: Request): string => req.ip || req.socket.remoteAddress || 'desconhecido';

export async function registrarAcesso(
  db: Firestore,
  login: LoginDoPainel,
  dados: { ip: string; navegador: string; agora?: Date }
): Promise<void> {
  const agora = dados.agora || new Date();
  const expiraEm = new Date(agora.getTime() + DIAS_DE_GUARDA_DOS_ACESSOS * 86400000);
  await db.collection(COLECAO).add({
    uid: login.uid,
    email: login.email,
    clinicaId: login.clinicaId,
    papel: login.papel,
    dono: login.dono,
    ip: dados.ip,
    navegador: dados.navegador.slice(0, 300),
    em: agora.toISOString(),
    expiraEm: expiraEm.toISOString(),
  });
}

/** Apaga até 200 registros vencidos. Consulta de um campo só: o índice automático basta. */
export async function apagarAcessosVencidos(db: Firestore, agora = new Date()): Promise<number> {
  const vencidos = await db.collection(COLECAO).where('expiraEm', '<', agora.toISOString()).limit(200).get();
  if (vencidos.empty) return 0;
  const lote = db.batch();
  vencidos.docs.forEach((d) => lote.delete(d.ref));
  await lote.commit();
  return vencidos.size;
}

export function criarRotasDeAcesso(
  opcoes: { banco?: () => Firestore | null; login?: (req: Request) => Promise<LoginDoPainel | null> } = {}
): Router {
  const banco = opcoes.banco ?? bancoAdmin;
  const verificar = opcoes.login ?? loginDoPedido;
  const rotas = express.Router();
  rotas.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  rotas.post('/', async (req, res) => {
    // Nunca atrapalha o painel: qualquer falha responde 204 e fica no registro do servidor.
    res.status(204).end();
    if (!ehZulia) return;
    const db = banco();
    if (!db) return;
    try {
      const login = await verificar(req);
      if (!login) return;
      const agora = Date.now();
      if ((ultimos.get(login.uid) || 0) > agora - INTERVALO_MS) return;
      if (ultimos.size > 5000) ultimos.clear();
      ultimos.set(login.uid, agora);
      await registrarAcesso(db, login, { ip: ipDe(req), navegador: String(req.headers['user-agent'] || '') });
      // A faxina dos vencidos, de vez em quando.
      if (Math.random() < 0.05) await apagarAcessosVencidos(db);
    } catch (erro) {
      console.warn('[acesso] não foi possível registrar o acesso:', (erro as Error).message);
    }
  });

  return rotas;
}

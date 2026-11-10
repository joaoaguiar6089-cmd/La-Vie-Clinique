import express, { type Router } from 'express';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { ehZulia } from '../src/lib/projetoFirebase';
import { CADASTRO_ABERTO, nomeLimpo } from '../src/utils/cadastro';
import { VERSAO_DOS_DOCUMENTOS, type AceiteDosTermos } from '../src/utils/documentosLegais';
import { criarClinica } from './clinicasNovas';
import { criarLimitador } from './fichaPublica';
import { authAdmin, bancoAdmin, servidorGerenciaLogins } from './firebaseAdmin';
import { loginDoPedido, type LoginDoPainel } from './login';

/**
 * O cadastro sozinho de uma clínica na plataforma (etapa 3 de docs/zulia-plataforma.md).
 *
 * O caminho, do lado do painel (`src/components/auth/CadastroDaClinica.tsx`):
 *   1. a pessoa cria o login com e-mail e senha, no navegador, e recebe o e-mail de confirmação;
 *   2. com o e-mail confirmado, o painel chama `POST /api/cadastro/clinica { nome, admin }`, com o
 *      token do login;
 *   3. o servidor confere e cria a clínica no plano gratuito (`criarClinica`), com esse login de
 *      admin;
 *   4. o painel pede um token novo (já com a claim da clínica) e entra. As sementes (fichas padrão
 *      e os 2 procedimentos de exemplo) entram nesse primeiro login.
 *
 * Recusas, no campo `erro`: `so-na-plataforma` (404, modo legado), `cadastro-fechado` (403),
 * `servidor-nao-configurado` (503), `muitos-pedidos` (429), `login` (401), `dono` (403),
 * `ja-tem-clinica` (409), `email-nao-confirmado` (403), `nome-invalido` (400),
 * `aceite-pendente` (400), `em-andamento` (409).
 *
 * O aceite dos Termos de Uso, da Política de Privacidade e do Acordo de Tratamento de Dados (ver
 * `src/utils/documentosLegais.ts`) é obrigatório no cadastro: `aceite` com a versão em vigor. Fica
 * gravado em `clinicas/{c}.aceites.termos` (versão, data, login, e-mail e IP).
 *
 * `POST /api/cadastro/aceite { versao }`: a admin de uma clínica que já existe aceita a versão em
 * vigor (as clínicas de antes dos documentos, e toda vez que a versão muda). Recusas: `login` (401),
 * `so-admin` (403), `versao-antiga` (409).
 */

/** O registro do aceite, com o que prova quem aceitou e quando. */
const registroDoAceite = (login: LoginDoPainel, ip: string | undefined): AceiteDosTermos => ({
  versao: VERSAO_DOS_DOCUMENTOS,
  em: new Date().toISOString(),
  uid: login.uid,
  email: login.email,
  ip: ip || null,
});

export interface OpcoesDoCadastro {
  zulia?: boolean;
  aberto?: boolean;
  banco?: () => Firestore | null;
  auth?: () => Auth;
  gerencia?: () => boolean;
  login?: (req: express.Request) => Promise<LoginDoPainel | null>;
  /** Para os testes: o relógio do limite de pedidos. */
  agora?: () => number;
}

export function criarRotasDoCadastro(opcoes: OpcoesDoCadastro = {}): Router {
  const zulia = opcoes.zulia ?? ehZulia;
  const aberto = opcoes.aberto ?? CADASTRO_ABERTO;
  const banco = opcoes.banco ?? bancoAdmin;
  const auth = opcoes.auth ?? authAdmin;
  const gerencia = opcoes.gerencia ?? servidorGerenciaLogins;
  const verificar = opcoes.login ?? loginDoPedido;
  // Criar clínica é raro: 10 por hora por endereço já sobra para quem erra e tenta de novo.
  const porIp = criarLimitador(10, 60 * 60 * 1000, opcoes.agora);
  // Dois cliques seguidos não podem criar duas clínicas para o mesmo login.
  const emAndamento = new Set<string>();

  const rotas = express.Router();
  rotas.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  rotas.use(express.json({ limit: '4kb' }));

  rotas.post('/clinica', async (req, res) => {
    const recusar = (status: number, erro: string) => res.status(status).json({ erro });
    if (!zulia) return recusar(404, 'so-na-plataforma');
    if (!aberto) return recusar(403, 'cadastro-fechado');
    const db = banco();
    if (!db || !gerencia()) return recusar(503, 'servidor-nao-configurado');
    if (!porIp.usar(req.ip || 'sem-ip')) return recusar(429, 'muitos-pedidos');

    let login: LoginDoPainel | null = null;
    try {
      login = await verificar(req);
    } catch (e) {
      console.warn('[cadastro] não foi possível conferir o login:', e);
    }
    if (!login) return recusar(401, 'login');
    if (login.dono) return recusar(403, 'dono');
    if (login.clinicaId) return recusar(409, 'ja-tem-clinica');
    if (!login.emailVerificado || !login.email) return recusar(403, 'email-nao-confirmado');

    const nome = nomeLimpo(req.body?.nome);
    if (!nome) return recusar(400, 'nome-invalido');
    const admin = nomeLimpo(req.body?.admin) || undefined;
    if (req.body?.aceite !== VERSAO_DOS_DOCUMENTOS) return recusar(400, 'aceite-pendente');

    if (emAndamento.has(login.uid)) return recusar(409, 'em-andamento');
    emAndamento.add(login.uid);
    try {
      const criada = await criarClinica(
        { db, auth: auth() },
        {
          nome,
          email: login.email,
          admin,
          plano: 'gratuito',
          criadaPor: 'cadastro',
          aceite: registroDoAceite(login, req.ip),
        }
      );
      if (criada.uid !== login.uid) {
        // Não acontece (o e-mail é único no Authentication), mas uma clínica com a admin errada
        // seria pior do que um erro.
        console.error('[cadastro] o login do e-mail não é o do pedido:', criada.id);
        return recusar(500, 'interno');
      }
      console.log(`[cadastro] clínica ${criada.id} criada pelo cadastro.`);
      res.json({ clinicaId: criada.id });
    } catch (erro) {
      const mensagem = (erro as Error)?.message || '';
      if (/já é login da clínica/.test(mensagem)) return recusar(409, 'ja-tem-clinica');
      if (/dono da plataforma/.test(mensagem)) return recusar(403, 'dono');
      console.error('[cadastro] não foi possível criar a clínica:', erro);
      recusar(500, 'interno');
    } finally {
      emAndamento.delete(login.uid);
    }
  });

  rotas.post('/aceite', async (req, res) => {
    const recusar = (status: number, erro: string) => res.status(status).json({ erro });
    if (!zulia) return recusar(404, 'so-na-plataforma');
    const db = banco();
    if (!db) return recusar(503, 'servidor-nao-configurado');
    let login: LoginDoPainel | null = null;
    try {
      login = await verificar(req);
    } catch (e) {
      console.warn('[cadastro] não foi possível conferir o login:', e);
    }
    if (!login) return recusar(401, 'login');
    if (!login.clinicaId || login.papel !== 'admin') return recusar(403, 'so-admin');
    if (req.body?.versao !== VERSAO_DOS_DOCUMENTOS) return recusar(409, 'versao-antiga');
    try {
      await db.doc(`clinicas/${login.clinicaId}`).update({
        'aceites.termos': registroDoAceite(login, req.ip),
        atualizadaEm: new Date().toISOString(),
      });
      res.json({ ok: true, versao: VERSAO_DOS_DOCUMENTOS });
    } catch (erro) {
      console.error('[cadastro] não foi possível gravar o aceite:', erro);
      recusar(500, 'interno');
    }
  });

  rotas.use((_req, res) => {
    res.status(404).json({ erro: 'rota-inexistente' });
  });

  return rotas;
}

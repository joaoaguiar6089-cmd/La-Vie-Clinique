import express, { type Request, type Response, type Router } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import * as z from 'zod';
import { ehZulia } from '../src/lib/projetoFirebase';
import { bancoAdmin } from './firebaseAdmin';
import {
  agendar,
  agoraNaClinica,
  bancoDaClinicaNoFirestore,
  buscarPacientes,
  cadastrarPaciente,
  criarEnvioAoGoogle,
  ErroDoConector,
  linkDeConfirmacao,
  opcoesDeAgendamento,
  verAgenda,
  type BancoDaClinica,
  type SalvarEventos,
} from './conectorClaudeAgenda';
import {
  cabecalhoDeAutenticacao,
  CAMINHO_DO_MCP,
  criarLoginDoClaude,
  type LoginDoConector,
  type OpcoesDoLoginDoClaude,
} from './conectorClaudeLogin';
import { salvarEventosPeloServidor } from './googleAgenda';
import { registrarAcesso } from './registrosDeAcesso';

/**
 * O conector do Claude: um servidor MCP em `/api/mcp`, para a equipe da clínica agendar
 * conversando com o Claude ("agenda a Jessica pra Harmonização Fase 1 sexta às 14h com a
 * Dra. Karoline") e receber de volta o link de confirmação para mandar à cliente.
 *
 * Cada chamada leva o acesso que o login do conector (`server/conectorClaudeLogin.ts`) emitiu;
 * o acesso diz quem conectou e de qual clínica. As ferramentas só enxergam essa clínica.
 *
 * Sem sessão: cada pedido cria o servidor MCP, responde e acaba (o AI Studio pode ter mais de uma
 * instância, e nada aqui precisa lembrar de um pedido para o outro).
 *
 * As regras da agenda moram em `server/conectorClaudeAgenda.ts`. Ver docs/conector-claude.md.
 */

const INSTRUCOES = `Conector da agenda do painel da clínica (Venus JK). Agenda atendimentos, cadastra pacientes e gera o link de confirmação que a cliente abre para confirmar, avisar que não vai ou pedir outro horário.

Como agendar:
1. Chame ver_opcoes_de_agendamento para saber os ids de profissionais, procedimentos (e os focos/fases de cada um) e salas, e a data de hoje.
2. Ache a paciente com buscar_pacientes. Se não existir, cadastre com cadastrar_paciente (nome e telefone com DDD).
3. Se o horário não foi dito com certeza, consulte ver_agenda e ofereça os horários livres.
4. Antes de criar, confirme com a pessoa: paciente, procedimento (e foco), profissional, data e hora.
5. criar_agendamento devolve o link de confirmação e a mensagem pronta para o WhatsApp — mostre os dois. Se vier precisa_confirmar, nada foi gravado: conte os avisos e só repita com confirmar_avisos = true se a pessoa concordar.

Nunca invente ids: use só os que as ferramentas devolveram. Datas em AAAA-MM-DD e horas em HH:MM, no horário de Brasília.`;

export interface OpcoesDoConector extends OpcoesDoLoginDoClaude {
  /** Para os testes: o banco da clínica do login (no ar, o Firestore). */
  bancoDaClinica?: (clinicaId: string | null) => BancoDaClinica | null;
  /** Para os testes: o envio ao Google (no ar, `salvarEventosPeloServidor`). */
  salvarNoGoogle?: SalvarEventos;
  /** Para os testes: outro relógio para "hoje" e "agora" da clínica. */
  instante?: () => Date;
}

const bancoPadrao = (clinicaId: string | null): BancoDaClinica | null => {
  const db = bancoAdmin();
  return db ? bancoDaClinicaNoFirestore(db, clinicaId) : null;
};

/** A resposta de uma ferramenta: o resultado em JSON, ou o erro em português. */
const responder = async (fazer: () => Promise<unknown>) => {
  try {
    const resultado = await fazer();
    return { content: [{ type: 'text' as const, text: JSON.stringify(resultado, null, 2) }] };
  } catch (e) {
    const mensagem =
      e instanceof ErroDoConector
        ? e.message
        : 'Não foi possível concluir agora (falha no servidor da clínica). Tente de novo em instantes.';
    if (!(e instanceof ErroDoConector)) console.warn('[conector-claude] falha numa ferramenta:', e);
    return { content: [{ type: 'text' as const, text: mensagem }], isError: true };
  }
};

const DATA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'AAAA-MM-DD');
const HORA = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM');

/** O servidor MCP de um pedido, com as ferramentas presas à clínica de quem conectou. */
function servidorDoPedido(banco: BancoDaClinica, opcoes: OpcoesDoConector): McpServer {
  const agora = () => agoraNaClinica(opcoes.instante ? opcoes.instante() : new Date());
  const enviarAoGoogle = criarEnvioAoGoogle(banco, opcoes.salvarNoGoogle ?? salvarEventosPeloServidor);
  const servidor = new McpServer({ name: 'agenda-venus-jk', version: '1.0.0' }, { instructions: INSTRUCOES });

  servidor.registerTool(
    'ver_opcoes_de_agendamento',
    {
      title: 'Opções de agendamento',
      description:
        'Profissionais, procedimentos (com focos/fases e duração), salas, expediente da clínica e a data e hora de agora. Chame antes de agendar.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    () => responder(() => opcoesDeAgendamento(banco, agora()))
  );

  servidor.registerTool(
    'buscar_pacientes',
    {
      title: 'Buscar pacientes',
      description: 'Procura pacientes cadastradas pelo nome (sem acento, partes em qualquer ordem) ou pelo telefone (4 dígitos ou mais). Devolve até 10.',
      inputSchema: { busca: z.string().min(2).max(100).describe('Parte do nome ou do telefone') },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ busca }) => responder(() => buscarPacientes(banco, busca))
  );

  servidor.registerTool(
    'cadastrar_paciente',
    {
      title: 'Cadastrar paciente',
      description:
        'Cadastra uma paciente nova. Se já existir alguém com o mesmo telefone ou nome, não cadastra e devolve quem é — use o id dela, ou repita com cadastrar_mesmo_assim = true se for outra pessoa.',
      inputSchema: {
        nome: z.string().min(2).max(120).describe('Nome completo'),
        telefone: z.string().min(10).max(30).describe('WhatsApp com DDD, ex.: (19) 98888-7777'),
        data_nascimento: DATA.optional(),
        email: z.string().max(200).optional(),
        cadastrar_mesmo_assim: z.boolean().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    (a) =>
      responder(() =>
        cadastrarPaciente(banco, {
          nome: a.nome,
          telefone: a.telefone,
          dataNascimento: a.data_nascimento,
          email: a.email,
          cadastrarMesmoAssim: a.cadastrar_mesmo_assim,
        })
      )
  );

  servidor.registerTool(
    'ver_agenda',
    {
      title: 'Ver agenda',
      description:
        'Os atendimentos marcados e os horários livres de um dia ou de um período (até 14 dias). Com profissional_id, os horários livres são os dela; sem, são os horários em que ninguém está marcado.',
      inputSchema: {
        data_inicial: DATA,
        data_final: DATA.optional().describe('Igual à inicial quando for um dia só'),
        profissional_id: z.string().max(200).optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (a) =>
      responder(() =>
        verAgenda(banco, { dataInicial: a.data_inicial, dataFinal: a.data_final, profissionalId: a.profissional_id }, agora())
      )
  );

  servidor.registerTool(
    'criar_agendamento',
    {
      title: 'Criar agendamento',
      description:
        'Agenda uma visita no painel e devolve o link de confirmação para a cliente, com a mensagem pronta para o WhatsApp. Vários procedimentos na mesma visita ficam um depois do outro. Sala ocupada impede; profissional ocupada, fora do expediente ou no almoço devolve precisa_confirmar (nada é gravado) — repita com confirmar_avisos = true só se a pessoa concordar.',
      inputSchema: {
        paciente_id: z.string().max(200),
        procedimentos: z
          .array(
            z.object({
              procedimento_id: z.string().max(200),
              focos: z.array(z.string().max(100)).max(10).optional().describe('Focos/fases do procedimento, ex.: ["Fase 1"]'),
            })
          )
          .min(1)
          .max(5),
        profissional_id: z.string().max(200),
        data: DATA,
        hora: HORA,
        duracao_min: z.number().int().min(5).max(480).optional().describe('Só se for diferente do catálogo (total da visita)'),
        sala_id: z.string().max(200).optional(),
        observacoes: z.string().max(1000).optional().describe('Observação interna (não aparece para a cliente)'),
        confirmar_avisos: z.boolean().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    (a) =>
      responder(() =>
        agendar(
          banco,
          {
            pacienteId: a.paciente_id,
            procedimentos: a.procedimentos.map((p) => ({ procedimentoId: p.procedimento_id, focos: p.focos })),
            profissionalId: a.profissional_id,
            data: a.data,
            hora: a.hora,
            duracaoMin: a.duracao_min,
            salaId: a.sala_id,
            observacoes: a.observacoes,
            confirmarAvisos: a.confirmar_avisos,
          },
          agora(),
          enviarAoGoogle
        )
      )
  );

  servidor.registerTool(
    'gerar_link_de_confirmacao',
    {
      title: 'Link de confirmação',
      description:
        'O link de confirmação de um agendamento que já existe (o id vem de ver_agenda), com a mensagem pronta para o WhatsApp. Se o link já existia, devolve o mesmo.',
      inputSchema: { atendimento_id: z.string().max(200) },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    ({ atendimento_id }) => responder(() => linkDeConfirmacao(banco, atendimento_id))
  );

  return servidor;
}

/**
 * As rotas do conector: o login (OAuth) e o `/api/mcp`. Montar **antes** do `express.static` e do
 * `app.get('*')` do server.ts — os endereços `/.well-known/...` precisam chegar aqui.
 */
export function criarRotasDoConectorClaude(opcoes: OpcoesDoConector = {}): Router {
  const zulia = opcoes.zulia ?? ehZulia;
  const { rotas, verificarAcesso, endereco } = criarLoginDoClaude(opcoes);
  const obterBanco = opcoes.bancoDaClinica ?? bancoPadrao;

  /** Registro de acesso (Marco Civil, art. 15), no máximo um a cada 10 minutos por login. */
  const ultimosAcessos = new Map<string, number>();
  const anotarAcesso = (login: LoginDoConector, req: Request) => {
    if (!zulia || opcoes.semRegistroDeAcesso) return;
    const db = bancoAdmin();
    const agora = Date.now();
    if (!db || (ultimosAcessos.get(login.uid) || 0) > agora - 10 * 60 * 1000) return;
    if (ultimosAcessos.size > 5000) ultimosAcessos.clear();
    ultimosAcessos.set(login.uid, agora);
    registrarAcesso(
      db,
      { uid: login.uid, email: login.email, clinicaId: login.clinicaId, papel: login.papel, dono: false },
      { ip: req.ip || 'desconhecido', navegador: `Conector do Claude — ${String(req.headers['user-agent'] || '')}` }
    ).catch((e) => console.warn('[conector-claude] registro de acesso falhou:', (e as Error).message));
  };

  const mcp = express.Router();
  mcp.use((req, res, next) => {
    res.set({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, Mcp-Protocol-Version, Mcp-Session-Id',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Expose-Headers': 'WWW-Authenticate, Mcp-Session-Id',
      'Cache-Control': 'no-store',
    });
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  const naoAutorizado = (req: Request, res: Response, erro?: string) => {
    res
      .status(401)
      .set('WWW-Authenticate', cabecalhoDeAutenticacao(endereco(req), erro))
      .json({ jsonrpc: '2.0', error: { code: -32001, message: 'Conecte o Claude pelo login do painel.' }, id: null });
  };

  mcp.post('/', express.json({ limit: '256kb' }), async (req, res) => {
    const cabecalho = req.headers.authorization || '';
    const token = cabecalho.startsWith('Bearer ') ? cabecalho.slice(7).trim() : '';
    if (!token) {
      naoAutorizado(req, res);
      return;
    }
    let login: LoginDoConector | null = null;
    try {
      login = await verificarAcesso(token);
    } catch (e) {
      console.warn('[conector-claude] não foi possível conferir o acesso:', (e as Error).message);
      res.status(503).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Servidor indisponível.' }, id: null });
      return;
    }
    if (!login) {
      naoAutorizado(req, res, 'invalid_token');
      return;
    }
    const banco = obterBanco(zulia ? login.clinicaId : null);
    if (!banco) {
      res.status(503).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Servidor sem a credencial do banco.' }, id: null });
      return;
    }
    anotarAcesso(login, req);

    const servidor = servidorDoPedido(banco, opcoes);
    const transporte = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => {
      transporte.close().catch(() => undefined);
      servidor.close().catch(() => undefined);
    });
    try {
      await servidor.connect(transporte);
      await transporte.handleRequest(req, res, req.body);
    } catch (e) {
      console.warn('[conector-claude] falha no pedido MCP:', e);
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Erro interno.' }, id: null });
      }
    }
  });

  // Sem sessão, não há fluxo de eventos para abrir nem sessão para encerrar. Sem acesso, o 401
  // vem primeiro: é por ele que o Claude descobre onde se autorizar.
  mcp.all('/', (req, res) => {
    if (!(req.headers.authorization || '').startsWith('Bearer ')) {
      naoAutorizado(req, res);
      return;
    }
    res
      .status(405)
      .set('Allow', 'POST, OPTIONS')
      .json({ jsonrpc: '2.0', error: { code: -32000, message: 'Método não permitido.' }, id: null });
  });

  rotas.use(CAMINHO_DO_MCP, mcp);
  return rotas;
}

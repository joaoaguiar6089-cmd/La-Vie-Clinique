import crypto from 'node:crypto';
import express, { type Request, type Response, type Router } from 'express';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { anamneseFechada } from '../src/utils/evaluations';
import { mesmaEquipe, uidsDaEquipe } from '../src/utils/equipe';
import { bancoAdmin } from './firebaseAdmin';

/**
 * A ficha de anamnese que a paciente abre pelo link, sem login — agora pelo servidor.
 *
 * Antes, a página da paciente lia e gravava `patients` e `anamnesis_records` direto no banco, e
 * por isso as regras deixavam essas duas coleções abertas para qualquer pessoa na internet:
 * listar todos os cadastros (nome, CPF, telefone, nascimento), ler todas as fichas, alterar ou
 * apagar. E a confirmação de CPF e nascimento acontecia no navegador, depois de o cadastro inteiro
 * já ter sido baixado.
 *
 * Agora as regras fecham as duas coleções para quem não é da equipe, e a página da paciente fala
 * com estas rotas. O servidor:
 *   - só devolve o que o link dá direito: a ficha do link, ou a paciente do link e a ficha dela
 *     daquele procedimento — nunca uma lista;
 *   - confere CPF e nascimento aqui, antes de entregar uma ficha já fechada (atendimento feito),
 *     com limite de tentativas;
 *   - grava só os campos que a paciente preenche. O que é da equipe (respostas da profissional,
 *     anotações nas fotos, áreas confirmadas, arquivo) nunca é sobrescrito por esta rota;
 *   - gera os ids das fichas e cadastros novos, aleatórios, em vez de aceitar os do navegador;
 *   - limita pedidos por endereço, para ninguém sair testando links.
 *
 * O resto da página — ficha-modelo, perguntas gerais, perfil público da clínica — continua lido
 * direto do banco: não tem dado de paciente, e as regras seguem abertas para leitura.
 *
 * Rotas (todas em /api/ficha-publica):
 *   GET  /status  → { configurado, conectado, equipeSincronizada }
 *   POST /abrir   → { ficha, paciente, respostasAnteriores } ou { precisaConfirmar }
 *   POST /salvar  → { ficha }
 */

const PACIENTES = 'patients';
const FICHAS = 'anamnesis_records';
const MODELOS = 'anamnesis_templates';
/** Saltos de redirecionamento de cadastros juntados, como em `getPatientById`. */
const MAX_SALTOS_DE_JUNCAO = 5;
const OBSERVACAO_PADRAO = 'Ficha preenchida online previamente pelo(a) paciente via link compartilhado.';

type Doc = Record<string, any> & { id: string };

/** Ficha fechada: atendimento feito. Mesma regra da página da paciente (`anamneseFechada`). */
const fechada = (ficha: Doc): boolean =>
  anamneseFechada({ profissionalPreenchidoEm: ficha.profissionalPreenchidoEm, encerradaEm: ficha.encerradaEm });

export class ErroDaFicha extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string
  ) {
    super(codigo);
  }
}

// ==========================================
// VALIDAÇÃO
// ==========================================

const ID_VALIDO = /^[\w.~-]{1,200}$/;

/** Um id de documento vindo da URL, ou `''` se não parecer um. */
export const idDoLink = (valor: unknown): string => {
  if (typeof valor !== 'string') return '';
  const v = valor.trim();
  if (!ID_VALIDO.test(v) || v === '.' || v === '..' || /^__.*__$/.test(v)) return '';
  return v;
};

const texto = (valor: unknown, max: number): string | undefined => {
  if (typeof valor !== 'string') return undefined;
  const v = valor.trim();
  return v ? v.slice(0, max) : undefined;
};

const ehObjetoSimples = (valor: unknown): valor is Record<string, any> =>
  !!valor && typeof valor === 'object' && !Array.isArray(valor);

/**
 * Endereço de imagem aceitável numa ficha: o Storage do Firebase, uma imagem embutida (quando o
 * envio para o Storage falhou no aparelho da paciente — ver `subirImagem`) ou um caminho do próprio
 * site (as fotos de referência padrão).
 */
export const urlDeImagem = (valor: unknown): string | undefined => {
  if (typeof valor !== 'string' || !valor) return undefined;
  if (valor.startsWith('data:image/')) return valor;
  if (valor.length > 2000) return undefined;
  if (valor.startsWith('https://firebasestorage.googleapis.com/')) return valor;
  if (valor.startsWith('https://storage.googleapis.com/')) return valor;
  if (valor.startsWith('/') && !valor.startsWith('//')) return valor;
  return undefined;
};

const somenteDigitos = (valor: unknown): string => (typeof valor === 'string' ? valor.replace(/\D/g, '') : '');

/** Os campos do cadastro que a paciente preenche na ficha. Nada além disto entra no cadastro. */
export const dadosDoCadastro = (bruto: unknown) => {
  const d = ehObjetoSimples(bruto) ? bruto : {};
  const nome = texto(d.nome, 200);
  if (!nome) throw new ErroDaFicha(400, 'nome-obrigatorio');
  const nascimento = typeof d.dataNascimento === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.dataNascimento)
    ? d.dataNascimento
    : undefined;
  const genero = d.genero === 'feminino' || d.genero === 'masculino' ? d.genero : undefined;
  const cpf = somenteDigitos(d.cpf).slice(0, 11) || undefined;
  return {
    nome,
    contato: texto(d.contato, 40),
    dataNascimento: nascimento,
    genero,
    cpf,
    email: texto(d.email, 200),
  };
};

const listaDeAreas = (valor: unknown) =>
  Array.isArray(valor)
    ? valor
        .filter(ehObjetoSimples)
        .slice(0, 200)
        .map((a) => ({
          procedureId: texto(a.procedureId, 200) || '',
          areaId: texto(a.areaId, 200),
          nomeCurto: texto(a.nomeCurto, 200) || '',
        }))
    : undefined;

const snapshotDePerguntas = (valor: unknown) =>
  ehObjetoSimples(valor) && Array.isArray(valor.gerais) && Array.isArray(valor.especificas)
    ? { gerais: valor.gerais.filter(ehObjetoSimples), especificas: valor.especificas.filter(ehObjetoSimples) }
    : undefined;

/** Hoje no fuso da clínica, em YYYY-MM-DD. */
const hojeEmSaoPaulo = (agora = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora);

const novoId = (prefixo: string): string => `${prefixo}-${crypto.randomUUID()}`;

// ==========================================
// LIMITE DE PEDIDOS
// ==========================================

/** Contador simples em memória: `max` usos por `chave` a cada `janelaMs`. */
export function criarLimitador(max: number, janelaMs: number, agora: () => number = Date.now) {
  const usos = new Map<string, { quantos: number; ate: number }>();
  return {
    /** Registra um uso. `false` quando a chave já passou do limite. */
    usar(chave: string): boolean {
      const t = agora();
      if (usos.size > 10_000) {
        for (const [k, v] of usos) if (v.ate <= t) usos.delete(k);
        if (usos.size > 10_000) usos.clear();
      }
      const atual = usos.get(chave);
      if (!atual || atual.ate <= t) {
        usos.set(chave, { quantos: 1, ate: t + janelaMs });
        return true;
      }
      atual.quantos++;
      return atual.quantos <= max;
    },
    /** A chave já está no limite, sem registrar uso? */
    esgotado(chave: string): boolean {
      const atual = usos.get(chave);
      return !!atual && atual.ate > agora() && atual.quantos >= max;
    },
  };
}

export type Limitadores = ReturnType<typeof criarLimitadores>;

export const criarLimitadores = (agora?: () => number) => ({
  abrirPorIp: criarLimitador(60, 10 * 60 * 1000, agora),
  salvarPorIp: criarLimitador(30, 10 * 60 * 1000, agora),
  identidadePorFicha: criarLimitador(5, 60 * 60 * 1000, agora),
  identidadePorIp: criarLimitador(20, 60 * 60 * 1000, agora),
});

// ==========================================
// LEITURAS
// ==========================================

const lerDoc = async (db: Firestore, colecao: string, id: string): Promise<Doc | null> => {
  const snap = await db.collection(colecao).doc(id).get();
  return snap.exists ? ({ ...(snap.data() as Record<string, any>), id: snap.id } as Doc) : null;
};

/** O cadastro do link, seguindo a cadeia de cadastros juntados (ver `Patient.juntadoA`). */
export async function resolverPaciente(db: Firestore, pacienteId: string): Promise<Doc | null> {
  let id = pacienteId;
  for (let salto = 0; salto <= MAX_SALTOS_DE_JUNCAO; salto++) {
    const paciente = await lerDoc(db, PACIENTES, id);
    if (!paciente) return null;
    if (!paciente.juntadoA) return paciente;
    id = String(paciente.juntadoA);
  }
  return null;
}

const fichasDaPaciente = async (db: Firestore, pacienteId: string): Promise<Doc[]> => {
  const snap = await db.collection(FICHAS).where('pacienteId', '==', pacienteId).get();
  return snap.docs
    .map((d) => ({ ...(d.data() as Record<string, any>), id: d.id }) as Doc)
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
};

// ==========================================
// ABRIR
// ==========================================

export interface PedidoAbrir {
  ficha?: unknown;
  anamnese?: unknown;
  paciente?: unknown;
  cpf?: unknown;
  nascimento?: unknown;
}

export interface RespostaAbrir {
  /** A ficha a reabrir: a do link `?ficha=`, ou a desta paciente para este procedimento. */
  ficha: Doc | null;
  paciente: Doc | null;
  /** Respostas gerais da ficha mais recente dela, para já virem preenchidas numa ficha nova. */
  respostasAnteriores: Record<string, any> | null;
  /** A ficha está fechada e só abre com CPF e nascimento conferidos. Nada mais vem junto. */
  precisaConfirmar?: { pedeNascimento: boolean };
}

/** Confere CPF e nascimento contra o cadastro. Lança se não conferir ou se passou do limite. */
const conferirIdentidade = (
  ficha: Doc,
  paciente: Doc,
  pedido: PedidoAbrir,
  limites: Limitadores,
  ip: string
): void => {
  const chaveDaFicha = `ficha:${ficha.id}`;
  if (limites.identidadePorFicha.esgotado(chaveDaFicha) || limites.identidadePorIp.esgotado(`ip:${ip}`)) {
    throw new ErroDaFicha(429, 'tentativas');
  }
  const nascimentoEsperado = paciente.dataNascimento || ficha.pacienteDataNascimento;
  const cpfConfere = somenteDigitos(pedido.cpf) === somenteDigitos(paciente.cpf);
  const nascimentoConfere = !nascimentoEsperado || pedido.nascimento === nascimentoEsperado;
  if (cpfConfere && nascimentoConfere) return;
  limites.identidadePorFicha.usar(chaveDaFicha);
  limites.identidadePorIp.usar(`ip:${ip}`);
  throw new ErroDaFicha(403, 'identidade');
};

export async function abrirFicha(
  db: Firestore,
  pedido: PedidoAbrir,
  limites: Limitadores,
  ip: string
): Promise<RespostaAbrir> {
  const fichaId = idDoLink(pedido.ficha);
  const anamneseId = idDoLink(pedido.anamnese);
  const pacienteId = idDoLink(pedido.paciente);

  let ficha: Doc | null = null;
  let paciente: Doc | null = null;
  let respostasAnteriores: Record<string, any> | null = null;

  if (fichaId) {
    ficha = await lerDoc(db, FICHAS, fichaId);
    if (!ficha) throw new ErroDaFicha(404, 'ficha-nao-encontrada');
    paciente = ficha.pacienteId ? await resolverPaciente(db, String(ficha.pacienteId)) : null;
  } else if (anamneseId && pacienteId) {
    paciente = await resolverPaciente(db, pacienteId);
    // `paciente.id`, e não o do link: o link pode ser de um cadastro que depois foi juntado a
    // outro, e as fichas dela agora apontam para o que ficou.
    const fichas = await fichasDaPaciente(db, paciente?.id || pacienteId);
    ficha = fichas.find((f) => f.templateId === anamneseId) || null;
    if (!ficha && fichas.length > 0 && ehObjetoSimples(fichas[0].respostasGerais)) {
      respostasAnteriores = { ...fichas[0].respostasGerais };
    }
  } else {
    throw new ErroDaFicha(400, 'link-invalido');
  }

  // Ficha fechada (atendimento feito) só abre com CPF e nascimento. Fichas antigas, de cadastros
  // sem CPF, continuam abrindo direto — não há contra o que conferir.
  if (ficha && paciente?.cpf && fechada(ficha)) {
    const tentouConfirmar = pedido.cpf !== undefined || pedido.nascimento !== undefined;
    if (!tentouConfirmar) {
      return {
        ficha: null,
        paciente: null,
        respostasAnteriores: null,
        precisaConfirmar: { pedeNascimento: !!(paciente.dataNascimento || ficha.pacienteDataNascimento) },
      };
    }
    conferirIdentidade(ficha, paciente, pedido, limites, ip);
  }

  return { ficha, paciente, respostasAnteriores };
}

// ==========================================
// SALVAR
// ==========================================

export interface PedidoSalvar {
  ficha?: unknown;
  anamnese?: unknown;
  paciente?: unknown;
  dadosPaciente?: unknown;
  dadosFicha?: unknown;
}

export async function salvarFicha(
  db: Firestore,
  pedido: PedidoSalvar,
  agora: Date = new Date()
): Promise<{ ficha: Doc }> {
  const cadastro = dadosDoCadastro(pedido.dadosPaciente);
  const enviada = ehObjetoSimples(pedido.dadosFicha) ? pedido.dadosFicha : {};
  const agoraIso = agora.toISOString();

  const fichaId = idDoLink(pedido.ficha);
  const anamneseId = idDoLink(pedido.anamnese);
  const pacienteDoLink = idDoLink(pedido.paciente);

  let existente: Doc | null = null;
  let modelo: Doc | null = null;
  let pacienteId: string | null = null;

  if (fichaId) {
    existente = await lerDoc(db, FICHAS, fichaId);
    if (!existente) throw new ErroDaFicha(404, 'ficha-nao-encontrada');
  } else if (anamneseId) {
    modelo = await lerDoc(db, MODELOS, anamneseId);
    if (!modelo) throw new ErroDaFicha(404, 'modelo-nao-encontrado');
    if (pacienteDoLink) {
      const paciente = await resolverPaciente(db, pacienteDoLink);
      if (paciente) {
        pacienteId = paciente.id;
        const fichas = await fichasDaPaciente(db, paciente.id);
        existente = fichas.find((f) => f.templateId === anamneseId) || null;
      }
    }
  } else {
    throw new ErroDaFicha(400, 'link-invalido');
  }

  if (existente && fechada(existente)) throw new ErroDaFicha(409, 'ficha-fechada');
  if (existente?.pacienteId) pacienteId = String(existente.pacienteId);

  // O cadastro: o que já existe (seguindo uma junção feita depois do envio do link) ou um novo.
  const pacienteFinal = pacienteId ? (await resolverPaciente(db, pacienteId))?.id || pacienteId : novoId('pat');
  const pacienteRef = db.collection(PACIENTES).doc(pacienteFinal);
  const pacienteExiste = pacienteId ? (await pacienteRef.get()).exists : false;

  const dadosDaPacienteNaFicha = {
    pacienteNome: cadastro.nome,
    pacienteContato: cadastro.contato,
    pacienteDataNascimento: cadastro.dataNascimento,
    pacienteGenero: cadastro.genero,
  };
  // Só entram se vieram — um mapa vazio no `set` com merge não deve apagar nada do que existe.
  const respostas: Record<string, Record<string, any>> = {};
  if (ehObjetoSimples(enviada.respostasGerais)) respostas.respostasGerais = enviada.respostasGerais;
  if (ehObjetoSimples(enviada.respostasEspecificas)) respostas.respostasEspecificas = enviada.respostasEspecificas;
  const fotoPacienteUrl = urlDeImagem(enviada.fotoPacienteUrl);
  const profissional = {
    professionalId: texto(enviada.professionalId, 200),
    profissionalNome: texto(enviada.profissionalNome, 200),
  };

  const fichaRef = existente ? db.collection(FICHAS).doc(existente.id) : db.collection(FICHAS).doc(novoId('rec'));
  let dadosDaFicha: Record<string, any>;

  if (existente) {
    // Só o que a paciente preenche. Respostas da profissional, anotações, áreas confirmadas,
    // fechamento e marcas de arquivo ficam como estão no banco.
    dadosDaFicha = {
      ...dadosDaPacienteNaFicha,
      ...respostas,
      ...profissional,
      fotoPacienteUrl,
      areasSolicitadas: listaDeAreas(enviada.areasSolicitadas),
      updatedAt: agoraIso,
    };
    // A foto de referência acompanha o gênero só enquanto a profissional não a anotou.
    if (!existente.fotoModeloAnotadaUrl) dadosDaFicha.fotoModeloUrl = urlDeImagem(enviada.fotoModeloUrl);
    if (!existente.perguntasSnapshot) dadosDaFicha.perguntasSnapshot = snapshotDePerguntas(enviada.perguntasSnapshot);
  } else {
    if (!modelo) throw new ErroDaFicha(400, 'link-invalido');
    dadosDaFicha = {
      pacienteId: pacienteFinal,
      ...dadosDaPacienteNaFicha,
      procedimentoId: modelo.procedimentoId,
      templateId: modelo.id,
      procedimentoNome: modelo.procedimentoNome || texto(enviada.procedimentoNome, 200) || 'Anamnese',
      dataAtendimento: hojeEmSaoPaulo(agora),
      ...profissional,
      respostasGerais: {},
      respostasEspecificas: {},
      ...respostas,
      fotoModeloUrl: urlDeImagem(enviada.fotoModeloUrl),
      fotoPacienteUrl,
      perguntasSnapshot: snapshotDePerguntas(enviada.perguntasSnapshot) || { gerais: [], especificas: [] },
      areasSolicitadas: listaDeAreas(enviada.areasSolicitadas),
      observacoesFinais: OBSERVACAO_PADRAO,
      origemPreenchimento: 'online_paciente',
      createdAt: agoraIso,
      updatedAt: agoraIso,
    };
  }
  // `fotoUrl` é o espelho antigo de `fotoPacienteUrl` — ver `saveAnamnesisRecord`.
  if (fotoPacienteUrl) dadosDaFicha.fotoUrl = FieldValue.delete();

  const lote = db.batch();
  lote.set(
    pacienteRef,
    { ...cadastro, updatedAt: agoraIso, ...(pacienteExiste ? {} : { createdAt: agoraIso }) },
    { merge: true }
  );
  lote.set(fichaRef, dadosDaFicha, { merge: true });
  await lote.commit();

  const salva = await fichaRef.get();
  return { ficha: { ...(salva.data() as Record<string, any>), id: salva.id } as Doc };
}

// ==========================================
// ROTAS
// ==========================================

const ipDe = (req: Request): string => req.ip || req.socket.remoteAddress || 'desconhecido';

export interface OpcoesDasRotas {
  /** Para os testes: outro banco (um emulador). */
  banco?: () => Firestore | null;
  limites?: Limitadores;
}

export function criarRotasFichaPublica(opcoes: OpcoesDasRotas = {}): Router {
  const banco = opcoes.banco ?? bancoAdmin;
  const limites = opcoes.limites ?? criarLimitadores();
  const rotas = express.Router();
  // A foto da paciente pode chegar embutida quando o envio dela para o Storage falhou.
  rotas.use(express.json({ limit: '4mb' }));

  const responderErro = (res: Response, erro: unknown, contexto: string) => {
    if (erro instanceof ErroDaFicha) {
      res.status(erro.status).json({ erro: erro.codigo });
      return;
    }
    console.error(`[ficha-publica] ${contexto}:`, erro);
    res.status(500).json({ erro: 'interno' });
  };

  rotas.get('/status', async (_req, res) => {
    const db = banco();
    if (!db) {
      res.json({ configurado: false, conectado: false });
      return;
    }
    try {
      // `equipeSincronizada`: a lista de logins que as regras conferem já bate com a equipe. As
      // regras novas só podem ser publicadas com isto em `true` — senão a equipe fica trancada
      // fora do próprio painel. Só um sim ou não; nenhum dado sai daqui.
      const perfil = await db.collection('clinic_settings').doc('main_profile').get();
      const dados = perfil.data() || {};
      const uids = uidsDaEquipe(dados.professionals);
      res.set('Cache-Control', 'no-store').json({
        configurado: true,
        conectado: true,
        equipeSincronizada: uids.length > 0 && mesmaEquipe(dados.equipeUids, uids),
      });
    } catch (erro) {
      console.error('[ficha-publica] a credencial não conseguiu ler o banco:', erro);
      res.json({ configurado: true, conectado: false });
    }
  });

  rotas.post('/abrir', async (req, res) => {
    const db = banco();
    if (!db) {
      res.status(503).json({ erro: 'servidor-nao-configurado' });
      return;
    }
    if (!limites.abrirPorIp.usar(`ip:${ipDe(req)}`)) {
      res.status(429).json({ erro: 'muitos-pedidos' });
      return;
    }
    try {
      res.set('Cache-Control', 'no-store').json(await abrirFicha(db, req.body || {}, limites, ipDe(req)));
    } catch (erro) {
      responderErro(res, erro, 'abrir');
    }
  });

  rotas.post('/salvar', async (req, res) => {
    const db = banco();
    if (!db) {
      res.status(503).json({ erro: 'servidor-nao-configurado' });
      return;
    }
    if (!limites.salvarPorIp.usar(`ip:${ipDe(req)}`)) {
      res.status(429).json({ erro: 'muitos-pedidos' });
      return;
    }
    try {
      res.set('Cache-Control', 'no-store').json(await salvarFicha(db, req.body || {}));
    } catch (erro) {
      responderErro(res, erro, 'salvar');
    }
  });

  return rotas;
}

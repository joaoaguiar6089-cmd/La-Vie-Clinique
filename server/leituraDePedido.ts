import express, { type Router } from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import { ehZulia } from '../src/lib/projetoFirebase';
import {
  LeituraDoPedido,
  MAXIMO_DE_PRODUTOS_NA_LEITURA,
  ProdutoParaLeitura,
  TIPOS_DA_LEITURA,
  instrucoesDaLeitura,
  normalizarLeitura,
} from '../src/utils/leituraDePedido';
import { loginDoPedido } from './login';

/**
 * `/api/leitura-de-pedido`: lê a foto ou o PDF de um pedido de compra com o Gemini e devolve os
 * itens — nome, marca, tipo, quantidade, unidade, valor, lote e validade —, cada um com o produto
 * do cadastro que o modelo reconheceu.
 *
 * A chave mora no servidor (`GEMINI_API_KEY`, que o AI Studio fornece ao app publicado; `API_KEY`
 * também vale) e nunca vai para o navegador. Só login do painel entra — na plataforma, com
 * clínica. Sem chave, a rota responde `nao-configurada`, e a tela fica com a planilha.
 *
 * `GEMINI_MODELO` troca o modelo (padrão `gemini-2.5-flash`); `GEMINI_BASE_URL` aponta para outro
 * endereço da API — um proxy, ou o servidor falso do teste de ponta a ponta.
 */

const MODELO_PADRAO = 'gemini-2.5-flash';

const chaveDoGemini = (): string => (process.env.GEMINI_API_KEY || process.env.API_KEY || '').trim();

/** O formato da resposta — o modelo devolve exatamente isto, em JSON. */
const ESQUEMA = {
  type: Type.OBJECT,
  properties: {
    fornecedor: { type: Type.STRING, nullable: true },
    numero: { type: Type.STRING, nullable: true },
    dataCompra: { type: Type.STRING, nullable: true, description: 'dd/mm/aaaa' },
    itens: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          produto: { type: Type.STRING },
          marca: { type: Type.STRING, nullable: true },
          tipo: { type: Type.STRING, nullable: true },
          quantidade: { type: Type.NUMBER },
          unidade: { type: Type.STRING, nullable: true },
          valorUnitario: { type: Type.NUMBER, nullable: true },
          valorTotal: { type: Type.NUMBER, nullable: true },
          lote: { type: Type.STRING, nullable: true },
          validade: { type: Type.STRING, nullable: true, description: 'dd/mm/aaaa ou mm/aaaa' },
          produtoId: { type: Type.STRING, nullable: true },
        },
        required: ['produto', 'quantidade'],
      },
    },
  },
  required: ['itens'],
};

/**
 * A chamada ao Gemini em si, separada da rota para o teste chamar direto. Lança com mensagem
 * legível quando o modelo não responde ou responde fora do formato.
 */
export async function lerPedidoComGemini(
  pedido: { arquivo: string; tipo: string; produtos: ProdutoParaLeitura[] },
  opcoes: { chave: string; modelo?: string; baseUrl?: string }
): Promise<LeituraDoPedido> {
  const ai = new GoogleGenAI({
    apiKey: opcoes.chave,
    ...(opcoes.baseUrl ? { httpOptions: { baseUrl: opcoes.baseUrl } } : {}),
  });
  const resposta = await ai.models.generateContent({
    model: opcoes.modelo || MODELO_PADRAO,
    contents: [
      {
        role: 'user',
        parts: [{ inlineData: { mimeType: pedido.tipo, data: pedido.arquivo } }, { text: instrucoesDaLeitura(pedido.produtos) }],
      },
    ],
    config: { responseMimeType: 'application/json', responseSchema: ESQUEMA, temperature: 0 },
  });
  const texto = resposta.text || '';
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    throw new Error('a IA respondeu fora do formato');
  }
  return normalizarLeitura(json, new Set(pedido.produtos.map((p) => p.id)));
}

/** Quantas leituras cada login pode pedir por janela — leitura custa cota da conta. */
const LIMITE_POR_JANELA = 30;
const JANELA_MS = 10 * 60 * 1000;

export function criarRotasLeituraDePedido(): Router {
  const rotas = express.Router();
  // Foto reduzida ou PDF de até 10 MB, em base64 (um terço maior).
  rotas.use(express.json({ limit: '16mb' }));
  const pedidosPorLogin = new Map<string, number[]>();

  rotas.get('/status', (_req, res) => {
    res.json({ configurada: !!chaveDoGemini() });
  });

  rotas.post('/', async (req, res) => {
    const recusar = (status: number, erro: string) => res.status(status).json({ erro });
    const login = await loginDoPedido(req);
    if (!login || login.dono || (ehZulia && !login.clinicaId)) return recusar(401, 'login');

    const agora = Date.now();
    const recentes = (pedidosPorLogin.get(login.uid) || []).filter((t) => agora - t < JANELA_MS);
    if (recentes.length >= LIMITE_POR_JANELA) return recusar(429, 'muitas-leituras');
    recentes.push(agora);
    pedidosPorLogin.set(login.uid, recentes);

    const { arquivo, tipo, produtos } = (req.body || {}) as { arquivo?: unknown; tipo?: unknown; produtos?: unknown };
    if (typeof arquivo !== 'string' || !arquivo || typeof tipo !== 'string' || !TIPOS_DA_LEITURA.has(tipo)) {
      return recusar(400, 'arquivo');
    }
    const lista: ProdutoParaLeitura[] = (Array.isArray(produtos) ? produtos : [])
      .slice(0, MAXIMO_DE_PRODUTOS_NA_LEITURA)
      .filter((p): p is ProdutoParaLeitura => !!p && typeof p.id === 'string' && typeof p.nome === 'string')
      .map((p) => ({
        id: p.id.slice(0, 120),
        nome: p.nome.slice(0, 160),
        marca: typeof p.marca === 'string' ? p.marca.slice(0, 80) : undefined,
        tipo: typeof p.tipo === 'string' ? p.tipo.slice(0, 80) : undefined,
        unidade: typeof p.unidade === 'string' ? p.unidade.slice(0, 30) : 'un',
      }));

    const chave = chaveDoGemini();
    if (!chave) return recusar(503, 'nao-configurada');
    try {
      const leitura = await lerPedidoComGemini(
        { arquivo, tipo, produtos: lista },
        { chave, modelo: process.env.GEMINI_MODELO, baseUrl: process.env.GEMINI_BASE_URL }
      );
      res.json(leitura);
    } catch (e) {
      console.warn('[leitura-de-pedido] a leitura falhou:', (e as Error).message);
      recusar(502, 'leitura-falhou');
    }
  });

  return rotas;
}

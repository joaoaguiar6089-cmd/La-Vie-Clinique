import { ehZulia, firebaseConfig } from '../src/lib/projetoFirebase';
import { caminhoDaColecao, clinicaDoPedido } from './clinicas';
import {
  FonteDoLink,
  PreviewDoLink,
  identificarLink,
  previewDeAgendamento,
  previewDeAnamnese,
  previewDeOrcamento,
  previewGenerico,
} from '../src/utils/linkPreview';

/**
 * Descobre, para um link da clínica, o cartão que o WhatsApp deve mostrar.
 *
 * Lê com a credencial do servidor quando ela está configurada (`lerComCredencial`) — é o único
 * jeito de ler `anamnesis_records`, que deixou de ser legível sem login. Sem credencial, usa a API
 * REST sem chave, que só alcança o que as regras abrem (`anamnesis_templates`, `quotes` e
 * `appointment_links`, estes dois só por `get`). Nos dois casos pede só os campos de que precisa,
 * então a ficha preenchida, com os dados da paciente, nunca trafega até aqui além do nome do
 * procedimento.
 *
 * Duas regras valem acima do resto:
 *   - **nunca lança**: o cartão é enfeite. Banco fora do ar, cota esgotada, documento apagado — o
 *     link continua abrindo, só com o título genérico do tipo ("Anamnese - La Vie Clinique");
 *   - **não vira leitura infinita**: o resultado fica em memória por alguns minutos, e quem
 *     cola um id inventado na URL custa uma leitura por minuto, não uma por pedido.
 *
 * Na Zulia, o documento é o da clínica do link (`c=`, ou a dos links antigos sem ele), e o nome
 * que aparece no cartão vem do perfil público dela (`clinic_settings/public_profile.name`), em vez
 * do "La Vie Clinique" fixo. No modo legado, nada muda.
 */

const RAIZ_DO_BANCO =
  `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}` +
  `/databases/${firebaseConfig.firestoreDatabaseId || '(default)'}/documents`;

const ACHADO_POR_MS = 5 * 60 * 1000;
const NAO_ACHADO_POR_MS = 60 * 1000;
const PRAZO_DA_LEITURA_MS = 2500;
const MAX_NO_CACHE = 500;

/** Documento e campos a ler, por tipo de link. */
const ONDE_LER: Record<FonteDoLink, { colecao: string; campos: string[] }> = {
  'anamnese-modelo': { colecao: 'anamnesis_templates', campos: ['procedimentoNome'] },
  'anamnese-ficha': { colecao: 'anamnesis_records', campos: ['procedimentoNome'] },
  agendamento: {
    colecao: 'appointment_links',
    campos: ['procedimento.titulo', 'data', 'hora', 'clinica.name'],
  },
  orcamento: { colecao: 'quotes', campos: ['numero', 'itens'] },
};

type Valor = Record<string, any>;

/** Os valores tipados do Firestore REST (`{ stringValue: 'x' }`) viram JavaScript comum. */
export const decodificarValor = (valor: Valor | undefined): unknown => {
  if (!valor || typeof valor !== 'object') return undefined;
  if ('stringValue' in valor) return valor.stringValue;
  if ('integerValue' in valor) return Number(valor.integerValue);
  if ('doubleValue' in valor) return valor.doubleValue;
  if ('booleanValue' in valor) return valor.booleanValue;
  if ('timestampValue' in valor) return valor.timestampValue;
  if ('nullValue' in valor) return null;
  if ('arrayValue' in valor) return (valor.arrayValue?.values || []).map(decodificarValor);
  if ('mapValue' in valor) return decodificarCampos(valor.mapValue?.fields);
  return undefined;
};

export const decodificarCampos = (campos: Record<string, Valor> | undefined): Record<string, unknown> =>
  Object.fromEntries(Object.entries(campos || {}).map(([nome, v]) => [nome, decodificarValor(v)]));

/**
 * Leitura com a credencial do servidor (ver `server/firebaseAdmin.ts`). Necessária para as fichas
 * preenchidas: `anamnesis_records` deixou de ser legível sem login, e pela API REST sem chave o
 * cartão cairia sempre no título genérico. `null` quando o documento não existe.
 */
export type LeitorDoBanco = (
  colecao: string,
  id: string,
  campos: string[]
) => Promise<Record<string, unknown> | null>;

export interface OpcoesDoResolvedor {
  /** Para os testes: um `fetch` de mentira. */
  buscar?: typeof fetch;
  /** Para os testes: resolver como na Zulia (clínica do link) ou no legado (raiz). */
  zulia?: boolean;
  /** Leitura pelo servidor; quando devolve `undefined` (sem credencial), cai na API REST. */
  lerComCredencial?: () => LeitorDoBanco | undefined;
  /** Para os testes: um relógio que a gente controla. */
  agora?: () => number;
}

export const criarResolvedorDePreview = (opcoes: OpcoesDoResolvedor = {}) => {
  const buscar = opcoes.buscar ?? fetch;
  const agora = opcoes.agora ?? Date.now;
  const zulia = opcoes.zulia ?? ehZulia;
  const cache = new Map<string, { ate: number; preview: PreviewDoLink }>();
  const nomes = new Map<string, { ate: number; nome: string | undefined }>();

  /** `null` quando o documento não existe. Lança em qualquer outra falha. */
  const lerCampos = async (
    colecao: string,
    id: string,
    campos: string[]
  ): Promise<Record<string, unknown> | null> => {
    const leitor = opcoes.lerComCredencial?.();
    if (leitor) return leitor(colecao, id, campos);
    const mascara = campos.map((c) => `mask.fieldPaths=${encodeURIComponent(c)}`).join('&');
    const resposta = await buscar(`${RAIZ_DO_BANCO}/${colecao}/${encodeURIComponent(id)}?${mascara}`, {
      signal: AbortSignal.timeout(PRAZO_DA_LEITURA_MS),
    });
    if (resposta.status === 404) return null;
    if (!resposta.ok) throw new Error(`Firestore respondeu ${resposta.status} para ${colecao}`);
    const corpo = (await resposta.json()) as { fields?: Record<string, Valor> };
    return decodificarCampos(corpo.fields);
  };

  const lerDocumento = (fonte: FonteDoLink, clinicaId: string | null, id: string) =>
    lerCampos(caminhoDaColecao(clinicaId, ONDE_LER[fonte].colecao), id, ONDE_LER[fonte].campos);

  /**
   * O nome da clínica para o cartão. No legado, `undefined` (o padrão, "La Vie Clinique"). Na
   * Zulia, o do perfil público, guardado por alguns minutos; falhou, o padrão.
   */
  const nomeDaClinica = async (clinicaId: string | null): Promise<string | undefined> => {
    if (!zulia || !clinicaId) return undefined;
    const guardado = nomes.get(clinicaId);
    if (guardado && guardado.ate > agora()) return guardado.nome;
    let nome: string | undefined;
    try {
      const perfil = await lerCampos(caminhoDaColecao(clinicaId, 'clinic_settings'), 'public_profile', ['name']);
      nome = typeof perfil?.name === 'string' && perfil.name.trim() ? perfil.name.trim() : undefined;
    } catch {
      nome = undefined;
    }
    if (nomes.size >= MAX_NO_CACHE) nomes.clear();
    nomes.set(clinicaId, { ate: agora() + (nome ? ACHADO_POR_MS : NAO_ACHADO_POR_MS), nome });
    return nome;
  };

  const montar = (fonte: FonteDoLink, dados: Record<string, any>, nome?: string): PreviewDoLink => {
    switch (fonte) {
      case 'anamnese-modelo':
      case 'anamnese-ficha':
        return previewDeAnamnese(dados.procedimentoNome, nome);
      case 'agendamento':
        return previewDeAgendamento(dados, nome);
      case 'orcamento':
        return previewDeOrcamento(dados, nome);
    }
  };

  const guardar = (chave: string, preview: PreviewDoLink, porMs: number) => {
    if (cache.size >= MAX_NO_CACHE) {
      const maisAntiga = cache.keys().next().value;
      if (maisAntiga !== undefined) cache.delete(maisAntiga);
    }
    cache.set(chave, { ate: agora() + porMs, preview });
  };

  /**
   * `search` é o `?...` da URL pedida. `null` quando o endereço não é um link com cartão próprio
   * (o catálogo, por exemplo) — quem chamou então serve o `index.html` como está.
   */
  return async (search: string): Promise<PreviewDoLink | null> => {
    const link = identificarLink(search);
    if (!link) return null;

    // Na Zulia, a clínica do link; `undefined` quando o `c` não presta (o cartão sai genérico).
    const clinicaId = clinicaDoPedido(new URLSearchParams(search).get('c'), zulia);
    if (clinicaId === undefined) return previewGenerico(link.fonte);
    const nome = await nomeDaClinica(clinicaId);

    // Id que não parece id nem chega ao banco.
    if (!link.id) return previewGenerico(link.fonte, nome);

    const chave = `${clinicaId ?? ''}:${link.fonte}:${link.id}`;
    const guardado = cache.get(chave);
    if (guardado && guardado.ate > agora()) return guardado.preview;

    try {
      const dados = await lerDocumento(link.fonte, clinicaId, link.id);
      if (!dados) {
        const preview = previewGenerico(link.fonte, nome);
        guardar(chave, preview, NAO_ACHADO_POR_MS);
        return preview;
      }
      const preview = montar(link.fonte, dados, nome);
      guardar(chave, preview, ACHADO_POR_MS);
      return preview;
    } catch (erro) {
      console.warn(`[preview] ${link.fonte} indisponível:`, erro instanceof Error ? erro.message : erro);
      const preview = previewGenerico(link.fonte, nome);
      guardar(chave, preview, NAO_ACHADO_POR_MS);
      return preview;
    }
  };
};

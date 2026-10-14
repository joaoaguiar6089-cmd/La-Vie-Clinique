import firebaseConfig from '../firebase-applet-config.json';
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
 * Lê o Firestore pela API REST, sem login e sem chave: são exatamente os documentos que as regras
 * já abrem à paciente (`anamnesis_templates`, `anamnesis_records`, `quotes` e `appointment_links`,
 * este último só por `get`) — o servidor não enxerga nada que o navegador dela não enxergue. E pede
 * só os campos de que precisa (`mask.fieldPaths`), então a ficha preenchida, com os dados da
 * paciente, nunca trafega até aqui além do nome do procedimento.
 *
 * Duas regras valem acima do resto:
 *   - **nunca lança**: o cartão é enfeite. Banco fora do ar, cota esgotada, documento apagado — o
 *     link continua abrindo, só com o título genérico do tipo ("Anamnese - La Vie Clinique");
 *   - **não vira leitura infinita**: o resultado fica em memória por alguns minutos, e quem
 *     cola um id inventado na URL custa uma leitura por minuto, não uma por pedido.
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

export interface OpcoesDoResolvedor {
  /** Para os testes: um `fetch` de mentira. */
  buscar?: typeof fetch;
  /** Para os testes: um relógio que a gente controla. */
  agora?: () => number;
}

export const criarResolvedorDePreview = (opcoes: OpcoesDoResolvedor = {}) => {
  const buscar = opcoes.buscar ?? fetch;
  const agora = opcoes.agora ?? Date.now;
  const cache = new Map<string, { ate: number; preview: PreviewDoLink }>();

  /** `null` quando o documento não existe. Lança em qualquer outra falha. */
  const lerDocumento = async (fonte: FonteDoLink, id: string): Promise<Record<string, unknown> | null> => {
    const { colecao, campos } = ONDE_LER[fonte];
    const mascara = campos.map((c) => `mask.fieldPaths=${encodeURIComponent(c)}`).join('&');
    const resposta = await buscar(`${RAIZ_DO_BANCO}/${colecao}/${encodeURIComponent(id)}?${mascara}`, {
      signal: AbortSignal.timeout(PRAZO_DA_LEITURA_MS),
    });
    if (resposta.status === 404) return null;
    if (!resposta.ok) throw new Error(`Firestore respondeu ${resposta.status} para ${colecao}`);
    const corpo = (await resposta.json()) as { fields?: Record<string, Valor> };
    return decodificarCampos(corpo.fields);
  };

  const montar = (fonte: FonteDoLink, dados: Record<string, any>): PreviewDoLink => {
    switch (fonte) {
      case 'anamnese-modelo':
      case 'anamnese-ficha':
        return previewDeAnamnese(dados.procedimentoNome);
      case 'agendamento':
        return previewDeAgendamento(dados);
      case 'orcamento':
        return previewDeOrcamento(dados);
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

    // Id que não parece id nem chega ao banco.
    if (!link.id) return previewGenerico(link.fonte);

    const chave = `${link.fonte}:${link.id}`;
    const guardado = cache.get(chave);
    if (guardado && guardado.ate > agora()) return guardado.preview;

    try {
      const dados = await lerDocumento(link.fonte, link.id);
      if (!dados) {
        const preview = previewGenerico(link.fonte);
        guardar(chave, preview, NAO_ACHADO_POR_MS);
        return preview;
      }
      const preview = montar(link.fonte, dados);
      guardar(chave, preview, ACHADO_POR_MS);
      return preview;
    } catch (erro) {
      console.warn(`[preview] ${link.fonte} indisponível:`, erro instanceof Error ? erro.message : erro);
      const preview = previewGenerico(link.fonte);
      guardar(chave, preview, NAO_ACHADO_POR_MS);
      return preview;
    }
  };
};

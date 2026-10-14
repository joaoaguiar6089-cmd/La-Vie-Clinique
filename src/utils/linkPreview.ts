import { dataExtensa } from './agenda';

/**
 * O cartão que o WhatsApp (e o Telegram, o Instagram...) monta sobre um link colado na conversa.
 *
 * Esse cartão não vem do app: quem lê o link é o robô do WhatsApp, que baixa o HTML e olha só as
 * tags do `<head>` — ele não executa JavaScript. Como o site é uma página só, todos os links saíam
 * com o título do `index.html` ("La Vie Clinique - Indaiatuba"), da ficha de anamnese ao
 * orçamento. O servidor (`server.ts`) reescreve essas tags a cada pedido, com as funções daqui.
 *
 * Tudo aqui é puro — sem Firestore, sem Express — para dar para conferir sem subir nada
 * (`scripts/verificar-link-preview.ts`).
 *
 * Regra de privacidade: o cartão fica na conversa, à vista de quem vir o celular da cliente, então
 * leva só o **nome do procedimento** e a data e hora do horário. Nunca nome da paciente, valor,
 * contato ou observação.
 */

export const NOME_DA_CLINICA = 'La Vie Clinique';

/** O que o link abre — e, com isso, de onde sai o título. */
export type FonteDoLink = 'anamnese-modelo' | 'anamnese-ficha' | 'agendamento' | 'orcamento';

export interface LinkIdentificado {
  fonte: FonteDoLink;
  /** Vazio quando o valor da URL não parece um id (ver `ID_VALIDO`). */
  id: string;
}

export interface PreviewDoLink {
  titulo: string;
  descricao: string;
}

/**
 * Ids do app são `tpl-<timestamp>`, `atd-<timestamp>` e UUIDs. Qualquer coisa fora disso não vai ao
 * banco: o endereço é público, e valor lixo na URL não deve virar leitura do Firestore.
 */
const ID_VALIDO = /^[\w.~-]{1,200}$/;

const TITULO_MAX = 120;

const aparar = (texto: unknown): string => (typeof texto === 'string' ? texto.trim() : '');

const limitar = (texto: string, max: number): string =>
  texto.length > max ? `${texto.slice(0, max - 1).trimEnd()}…` : texto;

/**
 * Qual link é este, a partir do `?...` da URL. Na mesma ordem em que o `App.tsx` escolhe a tela:
 * ficha de anamnese, orçamento, agendamento. `null` para o catálogo e qualquer endereço sem esses
 * parâmetros — esses ficam com o título padrão do `index.html`.
 */
export const identificarLink = (search: string): LinkIdentificado | null => {
  const params = new URLSearchParams(search);
  const valor = (nome: string) => {
    const v = (params.get(nome) || '').trim();
    return ID_VALIDO.test(v) ? v : '';
  };
  const presente = (nome: string) => !!(params.get(nome) || '').trim();

  if (presente('anamnese') || presente('ficha')) {
    // `anamnese` (modelo) vale mais que `ficha` (registro), como em `PublicAnamnesisEntry`.
    return presente('ficha') && !presente('anamnese')
      ? { fonte: 'anamnese-ficha', id: valor('ficha') }
      : { fonte: 'anamnese-modelo', id: valor('anamnese') };
  }
  if (presente('orcamento')) return { fonte: 'orcamento', id: valor('orcamento') };
  if (presente('agendamento')) return { fonte: 'agendamento', id: valor('agendamento') };
  return null;
};

/** O cartão de quando não dá para saber o procedimento: ainda diz do que se trata. */
export const previewGenerico = (fonte: FonteDoLink): PreviewDoLink => {
  switch (fonte) {
    case 'anamnese-modelo':
    case 'anamnese-ficha':
      return {
        titulo: `Anamnese - ${NOME_DA_CLINICA}`,
        descricao: `${NOME_DA_CLINICA} · Preencha sua ficha de anamnese antes do atendimento.`,
      };
    case 'agendamento':
      return {
        titulo: `Confirmação de agendamento - ${NOME_DA_CLINICA}`,
        descricao: `${NOME_DA_CLINICA} · Confirme sua presença, avise se não puder ir ou peça outro horário.`,
      };
    case 'orcamento':
      return {
        titulo: `Orçamento - ${NOME_DA_CLINICA}`,
        descricao: `${NOME_DA_CLINICA} · Veja os detalhes do seu orçamento.`,
      };
  }
};

/** "Anamnese - Botox". */
export const previewDeAnamnese = (procedimentoNome?: unknown): PreviewDoLink => {
  const nome = aparar(procedimentoNome);
  if (!nome) return previewGenerico('anamnese-modelo');
  return {
    titulo: limitar(`Anamnese - ${nome}`, TITULO_MAX),
    descricao: `${NOME_DA_CLINICA} · Preencha sua ficha de anamnese antes do atendimento.`,
  };
};

/** O que `appointment_links/{token}` entrega à página pública — só a parte que o cartão usa. */
export interface DadosDoAgendamentoParaPreview {
  procedimento?: { titulo?: unknown };
  data?: unknown;
  hora?: unknown;
  clinica?: { name?: unknown };
}

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const HORA_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "Confirmação de agendamento - Botox", com "sexta-feira, 21/09 às 14:00" embaixo. */
export const previewDeAgendamento = (link: DadosDoAgendamentoParaPreview): PreviewDoLink => {
  const generico = previewGenerico('agendamento');
  const titulo = aparar(link.procedimento?.titulo);
  const clinica = aparar(link.clinica?.name) || NOME_DA_CLINICA;
  const data = aparar(link.data);
  const hora = aparar(link.hora);

  const quando = DATA_ISO.test(data)
    ? `${dataExtensa(data)}${HORA_HHMM.test(hora) ? ` às ${hora}` : ''}`
    : '';

  return {
    titulo: titulo ? limitar(`Confirmação de agendamento - ${titulo}`, TITULO_MAX) : generico.titulo,
    descricao: quando ? `${quando} · ${clinica}` : generico.descricao,
  };
};

/** O que `quotes/{id}` entrega — de novo, só o que o cartão usa. Valores ficam de fora. */
export interface DadosDoOrcamentoParaPreview {
  numero?: unknown;
  itens?: Array<{ titulo?: unknown }>;
}

/** "Orçamento - Botox", "Orçamento - Botox e Peeling" ou "Orçamento - Botox e mais 2". */
export const previewDeOrcamento = (orcamento: DadosDoOrcamentoParaPreview): PreviewDoLink => {
  const generico = previewGenerico('orcamento');
  const nomes = [
    ...new Set(
      (Array.isArray(orcamento.itens) ? orcamento.itens : [])
        .map((item) => aparar(item?.titulo))
        .filter(Boolean)
    ),
  ];
  const numero = aparar(orcamento.numero);

  const resumo =
    nomes.length === 0
      ? ''
      : nomes.length === 1
        ? nomes[0]
        : nomes.length === 2
          ? `${nomes[0]} e ${nomes[1]}`
          : `${nomes[0]} e mais ${nomes.length - 1}`;

  return {
    titulo: resumo ? limitar(`Orçamento - ${resumo}`, TITULO_MAX) : generico.titulo,
    descricao: numero
      ? `${NOME_DA_CLINICA} · Orçamento nº ${numero}`
      : generico.descricao,
  };
};

const escaparHtml = (texto: string): string =>
  texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Troca no `index.html` as tags que o robô lê. Cada troca é independente: se o Vite um dia
 * reformatar uma tag e a expressão deixar de achá-la, as outras continuam valendo e a página
 * nunca quebra. (Funções no lugar de texto de substituição, porque `$&` e afins num nome de
 * procedimento seriam interpretados.)
 */
export const aplicarPreviewNoHtml = (html: string, preview: PreviewDoLink): string => {
  const titulo = escaparHtml(preview.titulo);
  const descricao = escaparHtml(preview.descricao);
  const tagMeta = (atributo: string, nome: string) =>
    new RegExp(`(<meta\\s+${atributo}="${nome}"\\s+content=")[^"]*(")`, 'i');

  return html
    .replace(/<title>[\s\S]*?<\/title>/i, () => `<title>${titulo}</title>`)
    .replace(tagMeta('name', 'description'), (_t, ini, fim) => `${ini}${descricao}${fim}`)
    .replace(tagMeta('property', 'og:title'), (_t, ini, fim) => `${ini}${titulo}${fim}`)
    .replace(tagMeta('property', 'og:description'), (_t, ini, fim) => `${ini}${descricao}${fim}`)
    .replace(
      /<meta\s+property="og:type"[^>]*>/i,
      (tag) => `${tag}\n    <meta property="og:site_name" content="${escaparHtml(NOME_DA_CLINICA)}" />`
    );
};

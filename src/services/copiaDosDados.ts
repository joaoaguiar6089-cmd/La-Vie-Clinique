import { getDocs, getDoc, query, where } from 'firebase/firestore';
import { colecao, documento } from '../lib/clinicaAtual';
import { ArquivoDoZip, montarZip } from '../utils/zip';
import { baixarArquivo } from '../utils/exportHelpers';
import { formatCpf } from '../utils/formatters';

/**
 * A cópia dos dados da clínica — o que os Termos (15.1) e o Acordo de Tratamento de Dados (10.1)
 * prometem: "dados em formato de planilha ou JSON, mais as fotos e os arquivos".
 *
 * Feita pela própria clínica, no navegador da administradora, em vez de pedida ao suporte: a
 * plataforma é a operadora e não lê os dados das pacientes; quem tem o direito de lê-los (e de
 * levá-los embora) é a clínica. O pedido por e-mail continua valendo para quem preferir.
 *
 * O que sai num ZIP:
 * - `LEIA-ME.txt` — o que é cada pasta, a data da cópia e o que não pôde ser copiado;
 * - `dados/<coleção>.json` — todos os documentos de cada coleção, com o id;
 * - `planilhas/*.csv` — pacientes, agendamentos e atendimentos, orçamentos e recibos, para abrir no
 *   Excel (separador `;` e acentos em UTF-8, como o Excel em português espera);
 * - `arquivos/...` — as fotos e os comprovantes que os documentos citam, nas mesmas pastas do
 *   Storage.
 *
 * As fotos são baixadas pelas URLs gravadas nos documentos (o bucket tem CORS aberto para leitura
 * pela URL com token). As regras do Storage não deixam listar pastas pelo navegador, e é melhor
 * assim: a cópia leva o que os documentos usam, e não restos de envios abandonados.
 */

/** Todas as coleções de uma clínica, com o nome que vai no LEIA-ME. */
export const COLECOES_DA_CLINICA: { nome: string; rotulo: string }[] = [
  { nome: 'patients', rotulo: 'Pacientes (cadastro)' },
  { nome: 'attendances', rotulo: 'Agendamentos e atendimentos' },
  { nome: 'session_plans', rotulo: 'Planos de sessões' },
  { nome: 'anamnesis_records', rotulo: 'Fichas de anamnese preenchidas' },
  { nome: 'evaluation_records', rotulo: 'Avaliações preenchidas' },
  { nome: 'followup_records', rotulo: 'Relatórios de atendimento preenchidos' },
  { nome: 'quotes', rotulo: 'Orçamentos' },
  { nome: 'quote_costs', rotulo: 'Custos estimados dos orçamentos' },
  { nome: 'receipts', rotulo: 'Notas de recibo' },
  { nome: 'appointment_links', rotulo: 'Links de confirmação de agendamento' },
  { nome: 'procedures', rotulo: 'Catálogo de procedimentos' },
  { nome: 'anamnesis_templates', rotulo: 'Modelos de ficha de anamnese' },
  { nome: 'anamnesis_general_questions', rotulo: 'Perguntas gerais da anamnese' },
  { nome: 'evaluation_templates', rotulo: 'Modelos de avaliação' },
  { nome: 'evaluation_general_questions', rotulo: 'Perguntas gerais da avaliação' },
  { nome: 'followup_templates', rotulo: 'Modelos de relatório de atendimento' },
  { nome: 'followup_general_questions', rotulo: 'Perguntas gerais do relatório' },
  { nome: 'stock_products', rotulo: 'Produtos do estoque' },
  { nome: 'stock_lots', rotulo: 'Lotes do estoque' },
  { nome: 'stock_types', rotulo: 'Tipos de produto do estoque' },
  { nome: 'purchase_orders', rotulo: 'Pedidos de compra' },
  { nome: 'procedure_consumption', rotulo: 'Consumo padrão por procedimento' },
  { nome: 'attendance_materials', rotulo: 'Materiais usados nos atendimentos' },
  { nome: 'cost_simulations', rotulo: 'Simulações de custo' },
  { nome: 'clinic_settings', rotulo: 'Dados e configurações da clínica' },
  { nome: 'counters', rotulo: 'Contadores de numeração' },
];

/** As coleções que guardam documentos de uma paciente (`pacienteId`). */
const COLECOES_DA_PACIENTE = [
  'attendances',
  'session_plans',
  'anamnesis_records',
  'evaluation_records',
  'followup_records',
  'quotes',
  'receipts',
  'attendance_materials',
];

/**
 * Documentos que não saem na cópia: a ligação com o Google Agenda guarda a autorização (cifrada)
 * das contas Google — é credencial, não dado da clínica.
 */
const DOCUMENTOS_DE_FORA: Record<string, string[]> = { clinic_settings: ['google_agenda'] };

export interface ProgressoDaCopia {
  etapa: 'dados' | 'arquivos' | 'montando';
  feito: number;
  total: number;
}

export interface ResumoDaCopia {
  documentos: number;
  arquivos: number;
  bytes: number;
  faltaram: string[];
}

type Documento = Record<string, unknown> & { id: string };

// ==========================================
// LEITURA
// ==========================================

/** Datas do Firestore (`Timestamp`) viram texto ISO; o resto passa como está. */
function paraJson(valor: unknown): unknown {
  if (valor && typeof valor === 'object') {
    const v = valor as { toDate?: () => Date };
    if (typeof v.toDate === 'function') return v.toDate().toISOString();
    if (Array.isArray(valor)) return valor.map(paraJson);
    return Object.fromEntries(Object.entries(valor as Record<string, unknown>).map(([k, x]) => [k, paraJson(x)]));
  }
  return valor;
}

async function lerColecao(nome: string): Promise<Documento[]> {
  const snap = await getDocs(colecao(nome));
  const fora = DOCUMENTOS_DE_FORA[nome] || [];
  return snap.docs
    .filter((d) => !fora.includes(d.id))
    .map((d) => ({ id: d.id, ...(paraJson(d.data()) as Record<string, unknown>) }));
}

// ==========================================
// ARQUIVOS (FOTOS E COMPROVANTES)
// ==========================================

const URL_DO_STORAGE = /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\/([^?#]+)/;

/** Cada URL do Storage citada em qualquer campo, em qualquer profundidade. */
function urlsDoStorage(valor: unknown, achadas: Set<string>): Set<string> {
  if (typeof valor === 'string') {
    if (URL_DO_STORAGE.test(valor)) achadas.add(valor);
  } else if (Array.isArray(valor)) {
    valor.forEach((v) => urlsDoStorage(v, achadas));
  } else if (valor && typeof valor === 'object') {
    Object.values(valor as Record<string, unknown>).forEach((v) => urlsDoStorage(v, achadas));
  }
  return achadas;
}

/** O caminho do arquivo dentro do ZIP: a pasta do Storage, sem o `clinicas/<id>/` da frente. */
function caminhoDoArquivo(url: string): string {
  const bruto = URL_DO_STORAGE.exec(url)?.[1] || '';
  let caminho = bruto;
  try {
    caminho = decodeURIComponent(bruto);
  } catch {
    // fica o caminho codificado, que também serve de nome
  }
  const semClinica = caminho.replace(/^clinicas\/[^/]+\//, '');
  // Nada de ".." nem barras no começo: o ZIP é aberto no computador de alguém.
  return semClinica
    .split('/')
    .filter((p) => p && p !== '.' && p !== '..')
    .map((p) => p.replace(/[\\:*?"<>|]+/g, '_'))
    .join('/');
}

/** Baixa as URLs, quatro de cada vez. As que falham vão para a lista do LEIA-ME. */
const buscarPelaRede = async (url: string): Promise<Uint8Array> => {
  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error(String(resposta.status));
  return new Uint8Array(await resposta.arrayBuffer());
};

async function baixarArquivos(
  urls: string[],
  aoProgredir?: (feito: number, total: number) => void,
  buscar: (url: string) => Promise<Uint8Array> = buscarPelaRede
): Promise<{ arquivos: ArquivoDoZip[]; falharam: string[] }> {
  const arquivos: ArquivoDoZip[] = [];
  const falharam: string[] = [];
  const usados = new Set<string>();
  let proximo = 0;
  let feito = 0;

  const trabalhar = async () => {
    while (proximo < urls.length) {
      const url = urls[proximo++];
      const base = `arquivos/${caminhoDoArquivo(url) || `sem-nome-${proximo}`}`;
      let caminho = base;
      // Dois documentos podem citar arquivos de mesmo nome em lugares que viram a mesma pasta.
      for (let n = 2; usados.has(caminho); n++) caminho = base.replace(/(\.[^./]+)?$/, `-${n}$1`);
      usados.add(caminho);
      try {
        arquivos.push({ caminho, dados: await buscar(url) });
      } catch {
        falharam.push(caminho);
      }
      feito++;
      aoProgredir?.(feito, urls.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, urls.length) }, trabalhar));
  return { arquivos, falharam };
}

// ==========================================
// PLANILHAS
// ==========================================

const celula = (valor: unknown): string => {
  if (valor === undefined || valor === null) return '';
  const texto = typeof valor === 'number' ? String(valor).replace('.', ',') : String(valor);
  return /[;"\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
};

/** CSV para o Excel em português: `;` entre colunas, BOM para os acentos abrirem certos. */
function planilha(colunas: string[], linhas: unknown[][]): Uint8Array {
  const texto = [colunas, ...linhas].map((l) => l.map(celula).join(';')).join('\r\n');
  return new TextEncoder().encode('﻿' + texto + '\r\n');
}

const s = (d: Documento, campo: string): string => {
  const v = d[campo];
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
};

function planilhas(dados: Record<string, Documento[]>): ArquivoDoZip[] {
  const saida: ArquivoDoZip[] = [];
  const pacientes = dados.patients || [];
  if (pacientes.length) {
    saida.push({
      caminho: 'planilhas/pacientes.csv',
      dados: planilha(
        ['Id', 'Nome', 'Telefone', 'Nascimento', 'Gênero', 'CPF', 'E-mail', 'Observações', 'Cadastrada em', 'Arquivada em'],
        pacientes
          .filter((p) => !p.juntadoA)
          .map((p) => [p.id, s(p, 'nome'), s(p, 'contato'), s(p, 'dataNascimento'), s(p, 'genero'), s(p, 'cpf') ? formatCpf(s(p, 'cpf')) : '', s(p, 'email'), s(p, 'observacoes'), s(p, 'createdAt'), s(p, 'arquivadoEm')])
      ),
    });
  }
  const atendimentos = dados.attendances || [];
  if (atendimentos.length) {
    saida.push({
      caminho: 'planilhas/agendamentos-e-atendimentos.csv',
      dados: planilha(
        ['Id', 'Data', 'Hora', 'Paciente', 'Procedimento', 'Outros procedimentos', 'Profissional', 'Situação', 'Observações'],
        atendimentos.map((a) => [
          a.id,
          s(a, 'data'),
          s(a, 'hora'),
          s(a, 'pacienteNome'),
          s(a, 'procedimentoNome'),
          (Array.isArray(a.procedimentosAdicionais) ? a.procedimentosAdicionais : [])
            .map((p) => (p as { procedimentoNome?: string }).procedimentoNome || '')
            .filter(Boolean)
            .join(', '),
          s(a, 'profissionalNome'),
          s(a, 'status'),
          s(a, 'observacoes'),
        ])
      ),
    });
  }
  const orcamentos = dados.quotes || [];
  if (orcamentos.length) {
    saida.push({
      caminho: 'planilhas/orcamentos.csv',
      dados: planilha(
        ['Número', 'Emissão', 'Validade', 'Paciente', 'Situação', 'Total', 'Pago em', 'Itens'],
        orcamentos.map((q) => [
          s(q, 'numero'),
          s(q, 'dataEmissao').slice(0, 10),
          s(q, 'dataValidade').slice(0, 10),
          s(q, 'pacienteNome'),
          s(q, 'status'),
          typeof q.total === 'number' ? q.total : '',
          s(q, 'pagoEm').slice(0, 10),
          (Array.isArray(q.itens) ? q.itens : []).map((i) => (i as { titulo?: string }).titulo || '').join(', '),
        ])
      ),
    });
  }
  const recibos = dados.receipts || [];
  if (recibos.length) {
    saida.push({
      caminho: 'planilhas/recibos.csv',
      dados: planilha(
        ['Número', 'Data do pagamento', 'Paciente', 'CPF', 'Valor', 'Forma', 'Parcelas', 'Orçamento'],
        recibos.map((r) => [
          s(r, 'numero'),
          s(r, 'dataPagamento'),
          s(r, 'pacienteNome'),
          s(r, 'pacienteCpf') ? formatCpf(s(r, 'pacienteCpf')) : '',
          typeof r.valor === 'number' ? r.valor : '',
          s(r, 'forma'),
          typeof r.parcelas === 'number' ? r.parcelas : '',
          s(r, 'quoteNumero'),
        ])
      ),
    });
  }
  return saida;
}

// ==========================================
// MONTAGEM
// ==========================================

const json = (valor: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(valor, null, 2));

const dataLegivel = (d: Date): string =>
  d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function leiaMe(opcoes: {
  titulo: string;
  dados: Record<string, Documento[]>;
  rotulos: Record<string, string>;
  comArquivos: boolean;
  arquivos: number;
  faltaram: string[];
}): Uint8Array {
  const agora = new Date();
  const linhas = [
    opcoes.titulo,
    `Cópia feita em ${dataLegivel(agora)}.`,
    '',
    'O QUE TEM AQUI',
    '',
    '- dados/: todos os registros, um arquivo JSON por tipo (abre em qualquer editor de texto).',
    '- planilhas/: os principais registros em planilha (abre no Excel, no Google Planilhas ou no Numbers).',
    opcoes.comArquivos
      ? '- arquivos/: as fotos, os comprovantes e os demais arquivos que os registros citam, nas mesmas pastas em que estavam guardados.'
      : '- Esta cópia foi feita SEM as fotos e os arquivos. Para tê-los, faça a cópia completa.',
    '',
    'REGISTROS POR TIPO',
    '',
    ...Object.entries(opcoes.dados).map(([nome, docs]) => `- ${opcoes.rotulos[nome] || nome} (dados/${nome}.json): ${docs.length}`),
    '',
    opcoes.comArquivos ? `Arquivos copiados: ${opcoes.arquivos}.` : '',
  ];
  if (opcoes.faltaram.length) {
    linhas.push(
      '',
      'O QUE NÃO PÔDE SER COPIADO',
      '',
      'Os itens abaixo não puderam ser lidos agora (sem conexão, ou o arquivo já tinha sido apagado). Tente de novo mais tarde ou peça a cópia ao suporte.',
      '',
      ...opcoes.faltaram.map((f) => `- ${f}`)
    );
  }
  linhas.push(
    '',
    'GUARDE ESTA CÓPIA EM LUGAR SEGURO',
    '',
    'Ela contém dados de saúde das pacientes (dados pessoais sensíveis, pela LGPD). Guarde em um computador ou pasta protegida por senha e não envie por e-mail ou aplicativo de mensagens.'
  );
  return new TextEncoder().encode(linhas.join('\r\n') + '\r\n');
}

const nomeDeArquivo = (texto: string): string =>
  texto.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Clinica';

const hojeCurto = (): string => new Date().toISOString().slice(0, 10);

/**
 * Monta o ZIP a partir dos registros já lidos: LEIA-ME, JSON, planilhas e (com `comArquivos`) os
 * arquivos citados. Separada da leitura e do download para poder ser conferida com dados de teste
 * (`buscarArquivo` no lugar da rede).
 */
export async function montarCopia(opcoes: {
  titulo: string;
  dados: Record<string, Documento[]>;
  faltaram: string[];
  comArquivos: boolean;
  aoProgredir?: (p: ProgressoDaCopia) => void;
  buscarArquivo?: (url: string) => Promise<Uint8Array>;
}): Promise<{ zip: Blob; resumo: ResumoDaCopia }> {
  const rotulos = Object.fromEntries(COLECOES_DA_CLINICA.map((c) => [c.nome, c.rotulo]));
  const faltaram = [...opcoes.faltaram];

  let arquivos: ArquivoDoZip[] = [];
  if (opcoes.comArquivos) {
    const urls = [...urlsDoStorage(opcoes.dados, new Set<string>())];
    opcoes.aoProgredir?.({ etapa: 'arquivos', feito: 0, total: urls.length });
    const baixados = await baixarArquivos(
      urls,
      (feito, total) => opcoes.aoProgredir?.({ etapa: 'arquivos', feito, total }),
      opcoes.buscarArquivo
    );
    arquivos = baixados.arquivos;
    faltaram.push(...baixados.falharam);
  }

  opcoes.aoProgredir?.({ etapa: 'montando', feito: 0, total: 1 });
  const conteudo: ArquivoDoZip[] = [
    {
      caminho: 'LEIA-ME.txt',
      dados: leiaMe({ titulo: opcoes.titulo, dados: opcoes.dados, rotulos, comArquivos: opcoes.comArquivos, arquivos: arquivos.length, faltaram }),
    },
    ...Object.entries(opcoes.dados).map(([nome, docs]) => ({ caminho: `dados/${nome}.json`, dados: json(docs) })),
    ...planilhas(opcoes.dados),
    ...arquivos,
  ];
  const zip = montarZip(conteudo);
  return {
    zip,
    resumo: {
      documentos: Object.values(opcoes.dados).reduce((soma, docs) => soma + docs.length, 0),
      arquivos: arquivos.length,
      bytes: zip.size,
      faltaram,
    },
  };
}

async function montarEBaixar(opcoes: {
  titulo: string;
  nomeDoZip: string;
  dados: Record<string, Documento[]>;
  faltaram: string[];
  comArquivos: boolean;
  aoProgredir?: (p: ProgressoDaCopia) => void;
}): Promise<ResumoDaCopia> {
  const { zip, resumo } = await montarCopia(opcoes);
  baixarArquivo(zip, opcoes.nomeDoZip);
  return resumo;
}

/**
 * A cópia completa da clínica, baixada como ZIP. Só a administradora: as simulações de custo das
 * outras profissionais, por exemplo, só ela pode ler (ver `zulia/firestore.rules`).
 */
export async function baixarCopiaDaClinica(opcoes: {
  nomeDaClinica: string;
  comArquivos: boolean;
  aoProgredir?: (p: ProgressoDaCopia) => void;
}): Promise<ResumoDaCopia> {
  const dados: Record<string, Documento[]> = {};
  const faltaram: string[] = [];
  let feito = 0;
  for (const { nome, rotulo } of COLECOES_DA_CLINICA) {
    opcoes.aoProgredir?.({ etapa: 'dados', feito, total: COLECOES_DA_CLINICA.length });
    try {
      dados[nome] = await lerColecao(nome);
    } catch (erro) {
      console.warn(`[cópia] não foi possível ler ${nome}:`, erro);
      faltaram.push(`${rotulo} (dados/${nome}.json)`);
    }
    feito++;
  }
  return montarEBaixar({
    titulo: `CÓPIA DOS DADOS — ${opcoes.nomeDaClinica || 'Clínica'}`,
    nomeDoZip: `Copia dos dados - ${nomeDeArquivo(opcoes.nomeDaClinica)} - ${hojeCurto()}.zip`,
    dados,
    faltaram,
    comArquivos: opcoes.comArquivos,
    aoProgredir: opcoes.aoProgredir,
  });
}

/**
 * A cópia dos dados de uma paciente: o cadastro e tudo o que é dela (fichas, atendimentos,
 * orçamentos, recibos, fotos). É o que a clínica entrega quando a paciente pede os próprios dados
 * (LGPD, art. 18) — o Acordo de Tratamento de Dados promete que a plataforma permite isso.
 */
export async function baixarCopiaDaPaciente(opcoes: {
  pacienteId: string;
  nome: string;
  aoProgredir?: (p: ProgressoDaCopia) => void;
}): Promise<ResumoDaCopia> {
  const dados: Record<string, Documento[]> = {};
  const faltaram: string[] = [];
  const total = COLECOES_DA_PACIENTE.length + 1;
  opcoes.aoProgredir?.({ etapa: 'dados', feito: 0, total });
  try {
    const cadastro = await getDoc(documento('patients', opcoes.pacienteId));
    dados.patients = cadastro.exists()
      ? [{ id: cadastro.id, ...(paraJson(cadastro.data()) as Record<string, unknown>) }]
      : [];
  } catch {
    faltaram.push('Cadastro (dados/patients.json)');
  }
  let feito = 1;
  for (const nome of COLECOES_DA_PACIENTE) {
    opcoes.aoProgredir?.({ etapa: 'dados', feito, total });
    try {
      const snap = await getDocs(query(colecao(nome), where('pacienteId', '==', opcoes.pacienteId)));
      dados[nome] = snap.docs.map((d) => ({ id: d.id, ...(paraJson(d.data()) as Record<string, unknown>) }));
    } catch {
      faltaram.push(`${nome} (dados/${nome}.json)`);
    }
    feito++;
  }
  return montarEBaixar({
    titulo: `DADOS DE ${opcoes.nome || 'paciente'}`,
    nomeDoZip: `Dados de ${nomeDeArquivo(opcoes.nome)} - ${hojeCurto()}.zip`,
    dados,
    faltaram,
    comArquivos: true,
    aoProgredir: opcoes.aoProgredir,
  });
}

/** "1,2 MB" — o tamanho da cópia para o aviso de pronto. */
export function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2).replace('.', ',')} GB`;
}

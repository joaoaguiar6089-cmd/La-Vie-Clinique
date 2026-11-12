import {
  ConsumoPadrao,
  MaterialUsado,
  Procedure,
  ProcedimentoDaSimulacao,
  ProdutoDeEstoque,
  SimulacaoDeCusto,
} from '../types';
import {
  LinhaDeMaterial,
  TotaisDeMateriais,
  linhasParaGravar,
  materiaisSugeridos,
  numeroValido,
  totaisDosMateriais,
} from './estoque';
import { sessoesDoProcedimento } from './quoteFactory';

/**
 * As contas da simulação de custo: o procedimento que nasce do catálogo com o consumo padrão, os
 * totais, o que vai para o banco e quem vê o quê. Nada aqui lê o banco — é o que deixa
 * `scripts/verificar-simulacao-de-custo.ts` conferir tudo sem Firebase.
 */

const novoId = (prefixo: string) =>
  `${prefixo}-${
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  }`;

export const novoIdDeSimulacao = (): string => novoId('sim');

/** O procedimento em edição: as linhas ainda podem carregar a marca "cadastrar no estoque". */
export type ProcedimentoEmEdicao = Omit<ProcedimentoDaSimulacao, 'materiais'> & {
  materiais: LinhaDeMaterial[];
};

/** Sessões válidas: inteiro, 1 no mínimo. Campo vazio ou bobagem vira 1. */
export const sessoesValidas = (valor: unknown): number => Math.max(1, Math.floor(numeroValido(valor)) || 1);

/**
 * Os materiais do consumo padrão do procedimento × as sessões — o mesmo cálculo do custo de
 * material do orçamento. Sem consumo configurado, vem vazio.
 */
export const materiaisDoProcedimento = (
  procedimento: Pick<ProcedimentoDaSimulacao, 'procedureId' | 'titulo' | 'sessoes'>,
  consumos: ConsumoPadrao[],
  produtos: ProdutoDeEstoque[],
  catalogo: Procedure[]
): MaterialUsado[] =>
  materiaisSugeridos(
    { procedureId: procedimento.procedureId, procedimentoNome: procedimento.titulo },
    consumos,
    produtos,
    catalogo,
    sessoesValidas(procedimento.sessoes)
  );

/** Procedimento escolhido no catálogo: as sessões do cadastro e os materiais já preenchidos. */
export const procedimentoDoCatalogo = (
  procedure: Procedure,
  consumos: ConsumoPadrao[],
  produtos: ProdutoDeEstoque[],
  catalogo: Procedure[]
): ProcedimentoEmEdicao => {
  const base = {
    id: novoId('simp'),
    procedureId: procedure.id,
    titulo: procedure.title,
    sessoes: sessoesDoProcedimento(procedure),
  };
  return { ...base, materiais: materiaisDoProcedimento(base, consumos, produtos, catalogo) };
};

/** Procedimento digitado à mão: só o nome, e os materiais adicionados um a um. */
export const procedimentoEmBranco = (): ProcedimentoEmEdicao => ({
  id: novoId('simp'),
  titulo: '',
  sessoes: 1,
  materiais: [],
});

export const totaisDoProcedimento = (p: Pick<ProcedimentoDaSimulacao, 'materiais'>): TotaisDeMateriais =>
  totaisDosMateriais(p.materiais);

/** A soma de todos os procedimentos. */
export const totaisDaSimulacao = (procedimentos: Pick<ProcedimentoDaSimulacao, 'materiais'>[]): TotaisDeMateriais =>
  totaisDosMateriais((procedimentos || []).flatMap((p) => p.materiais || []));

/**
 * O que confere antes de gravar. A simulação precisa de ao menos um procedimento, e todo
 * procedimento precisa de nome — é por ele que a lista e o PDF se leem.
 */
export const problemaDaSimulacao = (procedimentos: Pick<ProcedimentoDaSimulacao, 'titulo'>[]): string | null => {
  if (procedimentos.length === 0) return 'Acrescente ao menos um procedimento.';
  if (procedimentos.some((p) => !p.titulo.trim())) return 'Dê um nome a cada procedimento.';
  return null;
};

/** Tira as marcas de edição e as linhas vazias; nome aparado, sessões inteiras. */
export const procedimentosParaGravar = (procedimentos: ProcedimentoEmEdicao[]): ProcedimentoDaSimulacao[] =>
  procedimentos.map((p) => {
    const limpo: ProcedimentoDaSimulacao = {
      id: p.id,
      titulo: p.titulo.trim(),
      sessoes: sessoesValidas(p.sessoes),
      materiais: linhasParaGravar(p.materiais),
    };
    if (p.procedureId) limpo.procedureId = p.procedureId;
    return limpo;
  });

/**
 * A simulação pronta para o banco. Editando, quem criou e quando continuam os do original — a
 * administradora que corrige a simulação da funcionária não a toma para si.
 */
export const montarSimulacao = (dados: {
  id: string;
  paciente: { id?: string; nome: string };
  procedimentos: ProcedimentoDaSimulacao[];
  autor: { uid: string; nome: string };
  anterior: SimulacaoDeCusto | null;
  agora: string;
}): SimulacaoDeCusto => {
  const totais = totaisDaSimulacao(dados.procedimentos);
  const nome = dados.paciente.nome.trim();
  const simulacao: SimulacaoDeCusto = {
    id: dados.id,
    procedimentos: dados.procedimentos,
    custoTotal: totais.custo,
    valorClienteTotal: totais.valorCliente,
    criadoPorUid: dados.anterior?.criadoPorUid || dados.autor.uid,
    criadoPorNome: dados.anterior?.criadoPorNome || dados.autor.nome,
    createdAt: dados.anterior?.createdAt || dados.agora,
  };
  if (nome) simulacao.pacienteNome = nome;
  if (nome && dados.paciente.id) simulacao.pacienteId = dados.paciente.id;
  if (dados.anterior) simulacao.updatedAt = dados.agora;
  return simulacao;
};

/**
 * As simulações que esta pessoa vê, das mais novas para as mais antigas: a administradora vê
 * todas; a profissional, só as que ela criou.
 */
export const simulacoesVisiveis = (
  lista: SimulacaoDeCusto[],
  uid: string | undefined,
  ehAdmin: boolean
): SimulacaoDeCusto[] =>
  (lista || [])
    .filter((s) => ehAdmin || (!!uid && s.criadoPorUid === uid))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

/** "Toxina botulínica · Preenchimento labial" — a linha de baixo do cartão da lista. */
export const resumoDosProcedimentos = (s: Pick<SimulacaoDeCusto, 'procedimentos'>): string =>
  (s.procedimentos || [])
    .map((p) => p.titulo.trim())
    .filter(Boolean)
    .join(' · ') || 'Sem procedimento';

/** A cópia de uma simulação para começar outra: tudo igual, com ids novos nos procedimentos. */
export const copiaDosProcedimentos = (procedimentos: ProcedimentoDaSimulacao[]): ProcedimentoEmEdicao[] =>
  (procedimentos || []).map((p) => ({
    ...p,
    id: novoId('simp'),
    materiais: (p.materiais || []).map((m) => ({ ...m })),
  }));

/** "Simulação de custo - Camila Albuquerque - 12-11-2026.pdf" — sem o que o sistema de arquivos rejeita. */
export const nomeDoArquivoDaSimulacao = (s: Pick<SimulacaoDeCusto, 'pacienteNome' | 'procedimentos' | 'createdAt'>): string => {
  const limpar = (texto: string) => texto.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
  const quem = limpar(s.pacienteNome || '') || limpar(s.procedimentos?.[0]?.titulo || '');
  const [ano, mes, dia] = (s.createdAt || '').slice(0, 10).split('-');
  const data = ano && mes && dia ? `${dia}-${mes}-${ano}` : '';
  return `${['Simulação de custo', quem, data].filter(Boolean).join(' - ')}.pdf`;
};

const numeroLido = (valor: unknown): number => {
  const n = typeof valor === 'number' ? valor : Number(valor);
  return Number.isFinite(n) ? n : 0;
};

const comoLista = <T>(valor: unknown): T[] => (Array.isArray(valor) ? (valor as T[]) : []);

/**
 * Põe uma simulação lida do banco numa forma em que as telas confiem. Um documento torto não pode
 * derrubar a lista inteira.
 */
export const normalizarSimulacao = (bruto: Record<string, unknown> & { id: string }): SimulacaoDeCusto => {
  const procedimentos = comoLista<Record<string, unknown>>(bruto.procedimentos).map((p, i) => {
    const procedimento: ProcedimentoDaSimulacao = {
      id: String(p.id || `simp-${i}`),
      titulo: String(p.titulo || ''),
      sessoes: sessoesValidas(p.sessoes),
      materiais: comoLista<Record<string, unknown>>(p.materiais).map((m) => {
        const material: MaterialUsado = {
          nome: String(m.nome || ''),
          unidade: String(m.unidade || 'un'),
          quantidade: numeroLido(m.quantidade),
          custoUnitario: numeroLido(m.custoUnitario),
          valorCliente: numeroLido(m.valorCliente),
        };
        if (m.produtoId) material.produtoId = String(m.produtoId);
        return material;
      }),
    };
    if (p.procedureId) procedimento.procedureId = String(p.procedureId);
    return procedimento;
  });
  const totais = totaisDaSimulacao(procedimentos);
  return {
    id: bruto.id,
    pacienteId: bruto.pacienteId ? String(bruto.pacienteId) : undefined,
    pacienteNome: bruto.pacienteNome ? String(bruto.pacienteNome) : undefined,
    procedimentos,
    // Os totais saem das linhas, e não do que foi gravado: é a mesma conta que a tela faz.
    custoTotal: totais.custo,
    valorClienteTotal: totais.valorCliente,
    criadoPorUid: String(bruto.criadoPorUid || ''),
    criadoPorNome: String(bruto.criadoPorNome || ''),
    createdAt: String(bruto.createdAt || ''),
    updatedAt: bruto.updatedAt ? String(bruto.updatedAt) : undefined,
  };
};

import { Procedure } from '../types';
import { chaveDeNome } from './templateMatching';

/**
 * A Avaliação — o procedimento fixo que toda clínica tem, e o "Foco / Aplicação" dos
 * procedimentos.
 *
 * A avaliação deixou de ser uma ficha à parte (a "ficha de avaliação") e virou um atendimento
 * como outro qualquer: a cliente agenda uma Avaliação, a profissional atende e preenche o
 * relatório dela. O que a cliente veio avaliar é o **foco** do atendimento ("Avaliação ·
 * Harmonização Glútea"), e é o foco que escolhe a ficha-modelo do relatório.
 *
 * O procedimento não mora na coleção `procedures`: fica num documento próprio das configurações
 * (`clinic_settings/procedimento_avaliacao`) e entra no catálogo pela assinatura
 * (`subscribeToProcedures`). Assim toda clínica o tem desde o primeiro acesso — inclusive a que
 * nunca o salvou, que vê o padrão abaixo —, e ele não ocupa vaga no limite de procedimentos do
 * plano gratuito, que conta a coleção.
 */

/** O id da Avaliação — o mesmo em todas as clínicas. */
export const PROCEDIMENTO_AVALIACAO_ID = 'avaliacao';

/** É a Avaliação? Aceita o procedimento, o item do orçamento ou o atendimento. */
export const ehAvaliacao = (x?: { id?: string; procedureId?: string } | string | null): boolean => {
  if (!x) return false;
  if (typeof x === 'string') return x === PROCEDIMENTO_AVALIACAO_ID;
  return x.procedureId === PROCEDIMENTO_AVALIACAO_ID || x.id === PROCEDIMENTO_AVALIACAO_ID;
};

/**
 * A Avaliação como ela aparece antes de a clínica a editar: sem categoria, sem valor e sem foto
 * (o catálogo mostra a moldura vazia), e sem os campos que não fazem sentido numa avaliação —
 * plano recomendado, pacote, preparo, benefícios e regiões.
 */
export const procedimentoAvaliacaoPadrao = (): Procedure => ({
  id: PROCEDIMENTO_AVALIACAO_ID,
  title: 'Avaliação',
  category: '',
  description:
    'Consulta para conhecer a sua queixa e o seu objetivo, avaliar a região e indicar o ' +
    'tratamento certo para você — com o plano e o orçamento.',
  price: 0,
  priceNote: '',
  duration: '30 min',
  images: [],
  benefits: [],
  focos: [],
  order: 0,
  createdAt: '',
});

/**
 * Tira da Avaliação o que o formulário dela não tem. Vale na leitura e na gravação: um documento
 * antigo, ou duplicado de outro procedimento, não traz de volta campo que a tela não mostra.
 */
export const limparCamposDaAvaliacao = (p: Procedure): Procedure => ({
  ...p,
  id: PROCEDIMENTO_AVALIACAO_ID,
  category: '',
  sessionsRecommended: undefined,
  sessoesInclusas: undefined,
  orientacoesPreProcedimento: undefined,
  benefits: [],
  areasTreated: undefined,
  arquivado: undefined,
  arquivadoEmFavorDe: undefined,
});

// ==========================================
// FOCO / APLICAÇÃO
// ==========================================

/** Os focos cadastrados no procedimento, sem vazios nem repetidos (sem acento e caixa). */
export const focosDoProcedimento = (p?: Pick<Procedure, 'focos'> | null): string[] => {
  const vistos = new Set<string>();
  const saida: string[] = [];
  (Array.isArray(p?.focos) ? p!.focos : []).forEach((f) => {
    const texto = typeof f === 'string' ? f.trim() : '';
    const chave = chaveDeNome(texto);
    if (!texto || vistos.has(chave)) return;
    vistos.add(chave);
    saida.push(texto);
  });
  return saida;
};

/** O mesmo foco? Sem acento, sem caixa, sem espaço sobrando. */
export const mesmoFoco = (a?: string | null, b?: string | null): boolean =>
  !!a && !!b && chaveDeNome(a) === chaveDeNome(b);

/**
 * Os focos de um atendimento, item de orçamento ou relatório: a lista `focos` — ou, em registro de
 * antes de dar para marcar mais de um, o `foco` único. Sem vazios nem repetidos.
 */
export const focosDe = (x?: { focos?: unknown; foco?: unknown } | null): string[] => {
  if (!x) return [];
  const lista = Array.isArray(x.focos)
    ? (x.focos as unknown[])
    : x.focos && typeof x.focos === 'object'
    ? Object.values(x.focos as Record<string, unknown>)
    : [];
  const brutos = lista.length > 0 ? lista : typeof x.foco === 'string' ? [x.foco] : [];
  return focosDoProcedimento({ focos: brutos.filter((f): f is string => typeof f === 'string') });
};

/** "Harmonização Glútea · Fase 1, Fase 2" — o nome com os focos, quando há. */
export const nomeComFoco = (nome: string, focos?: string | string[] | null): string => {
  const lista = (Array.isArray(focos) ? focos : focos ? [focos] : [])
    .map((f) => (f || '').trim())
    .filter(Boolean);
  return lista.length > 0 ? `${nome} · ${lista.join(', ')}` : nome;
};

/** Algum dos focos é este? */
export const temFoco = (focos: string[], foco?: string | null): boolean =>
  !!foco && focos.some((f) => mesmoFoco(f, foco));

/**
 * Do relatório de uma Avaliação, o que foi avaliado: um procedimento por foco, achado no catálogo
 * pelo nome ("Harmonização Glútea"). É sobre eles, e não sobre a Avaliação, que o orçamento montado
 * no relatório nasce — um item por foco. Foco que não é procedimento do catálogo vira item avulso
 * com o nome dele; sem foco, a lista vem vazia e o orçamento começa sem item.
 */
export const procedimentosAvaliados = (
  alvo: { focos?: string[]; foco?: string },
  catalogo: Procedure[]
): { procedureId?: string; procedimentoNome: string }[] =>
  focosDe(alvo).map((foco) => {
    const proc = (catalogo || []).find((p) => !ehAvaliacao(p) && chaveDeNome(p.title) === chaveDeNome(foco));
    return { procedureId: proc?.id, procedimentoNome: proc?.title || foco };
  });

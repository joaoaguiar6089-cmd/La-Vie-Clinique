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

/** "Harmonização Glútea · Trocanter" — o nome com o foco, quando há foco. */
export const nomeComFoco = (nome: string, foco?: string | null): string => {
  const f = (foco || '').trim();
  return f ? `${nome} · ${f}` : nome;
};

/** O foco da lista, na grafia dela — para gravar "Trocanter" mesmo que tenham digitado "trocanter". */
export const focoNaGrafiaDaLista = (foco: string | undefined, lista: string[]): string | undefined => {
  const f = (foco || '').trim();
  if (!f) return undefined;
  return lista.find((x) => mesmoFoco(x, f)) || f;
};

/**
 * Do relatório de uma Avaliação, o que foi avaliado — o procedimento do foco, achado no catálogo
 * pelo nome ("Harmonização Glútea"). É sobre ele, e não sobre a Avaliação, que o orçamento montado
 * no relatório nasce. Foco que não é procedimento do catálogo vira item avulso com o nome dele;
 * sem foco, o orçamento começa vazio (como na antiga avaliação personalizada).
 */
export const alvoDoQueFoiAvaliado = <
  T extends { procedureId?: string; procedimentoNome: string; foco?: string; personalizada?: boolean },
>(
  alvo: T,
  catalogo: Procedure[]
): T => {
  const foco = (alvo.foco || '').trim();
  if (!foco) {
    return { ...alvo, procedureId: undefined, procedimentoNome: 'o tratamento', foco: undefined, personalizada: true };
  }
  const proc = (catalogo || []).find((p) => !ehAvaliacao(p) && chaveDeNome(p.title) === chaveDeNome(foco));
  return { ...alvo, procedureId: proc?.id, procedimentoNome: proc?.title || foco, foco: undefined };
};

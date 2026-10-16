import { AnamnesisQuestion, EvaluationTemplate, GrupoDePerguntasExtra } from '../types';
import { perguntasRespondidas } from './evaluations';
import { TipoDeFicha } from './fichasClinicas';

/**
 * As perguntas que entram num acompanhamento sem virem da ficha-modelo do procedimento — os
 * grupos puxados de outra ficha-modelo e os campos do "Novo dado". Ver `GrupoDePerguntasExtra`.
 *
 * Todo id daqui começa com `extra-`. É o que deixa o formulário reconhecer, no snapshot de um
 * registro antigo, uma pergunta que veio de um grupo — e não a ressuscitar como "pergunta que saiu
 * da ficha-modelo" quando a profissional tirou o grupo de propósito.
 */

const PREFIXO = 'extra-';

/** Id do grupo dos campos livres. Um só por registro: os campos do "Novo dado" moram todos nele. */
export const ID_DO_GRUPO_LIVRE = `${PREFIXO}livres`;

export const ehPerguntaExtra = (q: Pick<AnamnesisQuestion, 'id'>): boolean =>
  (q.id || '').startsWith(PREFIXO);

const sufixoAleatorio = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().slice(0, 8)
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * O grupo puxado de uma ficha-modelo: as perguntas dela, copiadas com ids do grupo.
 *
 * Copiar, e não apontar para a ficha, pelo mesmo motivo do `perguntasSnapshot`: a ficha-modelo
 * pode ser reescrita amanhã, e o acompanhamento de hoje tem que continuar dizendo o que perguntou.
 * Nenhuma pergunta entra obrigatória — a ficha é interna e se completa ao longo do dia.
 */
export const grupoDaFichaModelo = (
  modelo: EvaluationTemplate,
  origemTipo: TipoDeFicha
): GrupoDePerguntasExtra => {
  const id = `${PREFIXO}${sufixoAleatorio()}`;
  return {
    id,
    titulo: modelo.nome,
    origemFichaId: modelo.id,
    origemTipo,
    perguntas: (modelo.perguntas || []).map((q, i) => ({
      ...q,
      id: `${id}-${q.id}`,
      obrigatoria: false,
      ordem: i,
    })),
  };
};

/** Um campo do "Novo dado": rótulo que a profissional escreve e resposta em texto. */
export const novoDadoLivre = (ordem: number): AnamnesisQuestion => ({
  id: `${ID_DO_GRUPO_LIVRE}-${sufixoAleatorio()}`,
  texto: '',
  tipo_campo: 'texto_curto',
  obrigatoria: false,
  ordem,
});

/** Rótulo de um campo livre que ficou com valor mas sem nome. */
export const ROTULO_DO_DADO_SEM_NOME = 'Dado adicional';

/**
 * O que vai para o banco: campo livre sem nome e sem valor sai; com valor e sem nome ganha um
 * rótulo genérico (apagar o que a profissional escreveu seria pior que um nome feio); grupo que
 * ficou vazio sai.
 */
export const gruposParaGravar = (
  grupos: GrupoDePerguntasExtra[],
  respostas: Record<string, any>
): GrupoDePerguntasExtra[] =>
  grupos
    .map((g) => {
      if (!g.livre) return g;
      const comValor = new Set(perguntasRespondidas(g.perguntas, respostas).map((q) => q.id));
      return {
        ...g,
        perguntas: g.perguntas
          .filter((q) => q.texto.trim() || comValor.has(q.id))
          .map((q, i) => ({ ...q, texto: q.texto.trim() || ROTULO_DO_DADO_SEM_NOME, ordem: i })),
      };
    })
    .filter((g) => g.perguntas.length > 0);

import { AnamnesisQuestion, EvaluationTemplate, GrupoDePerguntasExtra, QuestionFieldType } from '../types';
import { perguntasRespondidas } from './evaluations';
import { TipoDeFicha } from './fichasClinicas';

/**
 * As perguntas que entram numa ficha sem virem da ficha-modelo do procedimento — os
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

/** Título do grupo dos campos criados na hora — é o que aparece em cima deles. */
export const TITULO_DO_GRUPO_LIVRE = 'Perguntas adicionais';

/**
 * Os tipos que uma pergunta criada na hora pode ter, na ordem do seletor. São os mesmos da
 * ficha-modelo, para a resposta sair igual na tela, na impressão e no histórico.
 */
export const TIPOS_DO_CAMPO_LIVRE: { tipo: QuestionFieldType; rotulo: string }[] = [
  { tipo: 'texto_curto', rotulo: 'Texto' },
  { tipo: 'texto_longo', rotulo: 'Texto longo' },
  { tipo: 'sim_nao', rotulo: 'Sim / Não' },
  { tipo: 'unica_escolha', rotulo: 'Escolha única' },
  { tipo: 'multipla_escolha', rotulo: 'Várias escolhas' },
  { tipo: 'numero', rotulo: 'Número' },
  { tipo: 'data', rotulo: 'Data' },
  { tipo: 'escala', rotulo: 'Escala de 1 a 10' },
];

/** Tipos que pedem a lista de opções. */
export const campoTemOpcoes = (tipo: QuestionFieldType): boolean =>
  tipo === 'unica_escolha' || tipo === 'multipla_escolha';

/** As opções digitadas, sem as linhas em branco — o que a resposta mostra e o que se grava. */
export const opcoesDoCampo = (q: Pick<AnamnesisQuestion, 'opcoes'>): string[] =>
  (q.opcoes || []).map((o) => o.trim()).filter(Boolean);

/**
 * Uma pergunta criada na hora: o texto que a profissional escreve, o tipo que ela escolhe (texto,
 * sim/não, escolha…) e a resposta. Começa como texto.
 */
export const novoDadoLivre = (ordem: number): AnamnesisQuestion => ({
  id: `${ID_DO_GRUPO_LIVRE}-${sufixoAleatorio()}`,
  texto: '',
  tipo_campo: 'texto_curto',
  obrigatoria: false,
  ordem,
});

/** Troca o tipo da pergunta: as escolhas ganham duas opções para começar, a escala vai até 10. */
export const trocarTipoDoCampo = (q: AnamnesisQuestion, tipo: QuestionFieldType): AnamnesisQuestion => ({
  ...q,
  tipo_campo: tipo,
  opcoes: campoTemOpcoes(tipo) ? (opcoesDoCampo(q).length > 0 ? q.opcoes : ['', '']) : undefined,
  escalaMax: tipo === 'escala' ? 10 : undefined,
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
          .map((q, i) => ({
            ...q,
            texto: q.texto.trim() || ROTULO_DO_DADO_SEM_NOME,
            // As linhas em branco do editor de opções não vão para o banco.
            opcoes: campoTemOpcoes(q.tipo_campo) ? opcoesDoCampo(q) : undefined,
            ordem: i,
          })),
      };
    })
    .filter((g) => g.perguntas.length > 0);

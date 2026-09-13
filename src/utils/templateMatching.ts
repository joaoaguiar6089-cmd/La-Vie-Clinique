import { AnamnesisTemplate, Procedure } from '../types';

/**
 * Nomes iguais escritos de formas diferentes ("Botox (Toxina Botulínica)" x "botox – toxina
 * botulinica") precisam casar, senão um procedimento do catálogo que já tem ficha aparece como
 * se não tivesse. Compara sem acento, sem caixa e sem pontuação.
 */
export const chaveDeNome = (nome: string): string =>
  nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * O cruzamento entre catálogo e fichas-modelo é usado em dois lugares que precisam concordar: o
 * gerenciador de fichas (que lista "procedimentos sem ficha") e o card do catálogo (que desabilita
 * o botão "Anamnese" quando não há ficha). Divergir aqui significaria um botão travado num
 * procedimento que o outro lado jura ter ficha — por isso a regra mora num lugar só.
 */
export const criarIndiceDeProcedimentos = (catalogProcedures: Procedure[]) => {
  const porId = new Map<string, Procedure>(catalogProcedures.map((p) => [p.id, p]));
  const porNome = new Map<string, Procedure>(
    catalogProcedures.map((p) => [chaveDeNome(p.title), p])
  );
  return { porId, porNome };
};

/**
 * Três estados para `procedimentoId`: um ID (vínculo explícito), `''` (desvinculado de propósito)
 * e `undefined` (ficha antiga, anterior ao campo — aí o nome é a única pista).
 */
export const procedimentoDoTemplate = (
  tpl: AnamnesisTemplate,
  indice: ReturnType<typeof criarIndiceDeProcedimentos>
): Procedure | undefined => {
  if (tpl.procedimentoId === '') return undefined;
  if (tpl.procedimentoId) {
    const porId = indice.porId.get(tpl.procedimentoId);
    if (porId) return porId;
    // ID órfão (procedimento removido do catálogo): ainda vale tentar pelo nome.
  }
  return indice.porNome.get(chaveDeNome(tpl.procedimentoNome));
};

/** Mapa procedimentoId -> ficha-modelo, para o catálogo saber quem já tem anamnese configurada. */
export const mapearTemplatesPorProcedimento = (
  templates: AnamnesisTemplate[],
  catalogProcedures: Procedure[]
): Map<string, AnamnesisTemplate> => {
  const indice = criarIndiceDeProcedimentos(catalogProcedures);
  const mapa = new Map<string, AnamnesisTemplate>();
  templates.forEach((tpl) => {
    const proc = procedimentoDoTemplate(tpl, indice);
    if (proc && !mapa.has(proc.id)) mapa.set(proc.id, tpl);
  });
  return mapa;
};

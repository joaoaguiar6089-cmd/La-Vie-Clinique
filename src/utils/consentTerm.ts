import { AnamnesisTemplate, ConsentTermSection } from '../types';

type ConsentTermSource = Pick<
  AnamnesisTemplate,
  'termoConsentimentoAtivo' | 'termoConsentimentoSecoes'
>;

/** Títulos com que o termo nasce ao ser ligado — os quatro blocos padrão de um termo de ativo. */
export const DEFAULT_CONSENT_TITLES = [
  'Contra indicação',
  'Precauções e advertências',
  'Sintomas pós aplicação',
  'Cuidados pós aplicação',
];

export function criarSecoesPadraoDoTermo(): ConsentTermSection[] {
  const base = Date.now();
  return DEFAULT_CONSENT_TITLES.map((titulo, i) => ({
    id: `termo-${base}-${i}`,
    titulo,
    texto: '',
  }));
}

export function criarSecaoDoTermo(): ConsentTermSection {
  return { id: `termo-${Date.now()}`, titulo: '', texto: '' };
}

/**
 * Blocos do termo prontos para exibir, ou null quando esta ficha não tem termo.
 *
 * Blocos totalmente vazios (sem título e sem texto) são descartados: no editor eles são uma linha
 * que a equipe ainda não preencheu, e imprimir um título em branco na folha do paciente só gera
 * confusão. Se sobrar nenhum, a seção inteira não aparece.
 */
export function resolveConsentTerm(
  template?: ConsentTermSource | null
): ConsentTermSection[] | null {
  if (!template?.termoConsentimentoAtivo) return null;

  const secoes = (template.termoConsentimentoSecoes || [])
    .map((s) => ({ ...s, titulo: s.titulo.trim(), texto: s.texto.trim() }))
    .filter((s) => s.titulo || s.texto);

  return secoes.length > 0 ? secoes : null;
}

/**
 * O id da clínica na plataforma Zulia — o `{c}` de `clinicas/{c}/...` e o `c=` dos links.
 *
 * Puro (sem Firebase), para valer igual no painel, no servidor e nos scripts.
 */

/**
 * A clínica dos links antigos, sem `c=`: os que a La Vie mandou às pacientes antes de virar uma
 * clínica da Zulia. Abrem na clínica da La Vie.
 *
 * Fica vazio até o dia da migração, quando recebe o id da La Vie no mesmo commit que vira o
 * `plataforma.json` para `zulia` (ver docs/zulia-plataforma.md). No modo legado não é usado.
 */
export const CLINICA_DOS_LINKS_ANTIGOS = '';

/** Letras, números, `-` e `_`, de 3 a 40 — o que `gerarIdDeClinica` gera e o que os testes usam. */
const ID_DE_CLINICA = /^[A-Za-z0-9][A-Za-z0-9_-]{2,39}$/;

/** O id, se `valor` parece um id de clínica; senão `''`. Valor da URL nunca vira caminho sem isto. */
export const idDeClinicaValido = (valor: unknown): string => {
  if (typeof valor !== 'string') return '';
  const v = valor.trim();
  return ID_DE_CLINICA.test(v) ? v : '';
};

/**
 * A clínica de um link de paciente: o `c=` do link, ou, sem ele, a dos links antigos. `null`
 * quando não dá para saber (um `c` inválido, ou link antigo antes de a La Vie ter id).
 */
export const clinicaDoLink = (c: unknown): string | null => {
  const presente = typeof c === 'string' && c.trim() !== '';
  if (presente) return idDeClinicaValido(c) || null;
  return CLINICA_DOS_LINKS_ANTIGOS || null;
};

const ALFABETO = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Um id novo, aleatório, de 6 caracteres (ex.: `k3P9xq`). Sem `0/O`, `1/l/I`, que se confundem
 * quando alguém dita o link. O id nunca muda, nem quando a clínica muda de nome; quem cria confere
 * se ele já existe (`scripts/criar-clinica.ts`).
 */
export const gerarIdDeClinica = (tamanho = 6): string => {
  const bytes = new Uint8Array(tamanho);
  crypto.getRandomValues(bytes);
  // 256 não é múltiplo do alfabeto: a pequena preferência pelos primeiros caracteres não importa
  // para um id que não é segredo (vai em todo link).
  return Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join('');
};

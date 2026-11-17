import type React from 'react';

/**
 * A métrica e a paleta das folhas A4 que viram PDF — orçamento e nota de recibo.
 *
 * Moram juntas porque os dois documentos vão para a mesma cliente, muitas vezes no mesmo arquivo
 * (o orçamento pago com o recibo no fim), e precisam parecer da mesma casa. Tudo em hex e em
 * estilo inline: é o que o html2canvas lê sem tradução.
 */

/** A4 a 96dpi — mesma métrica que o exportElementAsPDF usa. */
export const PAGE_W = 794;
export const PAGE_H = 1123;
export const MM = 96 / 25.4;
export const PAD_TOP = 15 * MM;
export const PAD_X = 14 * MM;
export const PAD_BOTTOM = 12 * MM;
export const GAP = 13;
export const ALTURA_RODAPE_PAGINACAO = 18;
export const CONTENT_W = PAGE_W - PAD_X * 2;
export const ALTURA_UTIL = PAGE_H - PAD_TOP - PAD_BOTTOM - ALTURA_RODAPE_PAGINACAO;

/*
 * As cores da marca são variáveis CSS, e não hex: cada clínica escolhe a sua (ver
 * `utils/marcaDosDocumentos.ts`), e a raiz da folha põe as variáveis dela. Sem escolha, valem o
 * bronze e os cremes de sempre — os do tema (`--color-brand*`) ou o valor depois da vírgula.
 * O html2canvas lê o estilo já calculado, com a variável resolvida.
 *
 * Por isso nenhuma destas pode ser concatenada com um alfa (`${BRONZE}33`) nem passada ao jsPDF ou
 * a um canvas: lá não existe CSS para resolver a variável.
 */
export const BRONZE = 'var(--color-brand)';
export const BRONZE_CLARO = 'var(--color-brand-light)';
/** A cor da marca sobre o preto (as iniciais no quadrado preto do cabeçalho). */
export const BRONZE_SOBRE_PRETO = 'var(--doc-sobre-escuro, #A67C52)';
/** O filete sobre o preto (o bloco do total). */
export const FILETE_SOBRE_PRETO = 'var(--doc-divisor-escuro, rgba(196,155,116,.35))';
export const PRETO = '#1A1A1A';
export const OFFWHITE = '#F9F8F6';
export const CREME = 'var(--doc-creme, #F6EFE4)';
/** O zebrado das tabelas e o fundo da linha de total — tintas da cor da marca. */
export const BEGE_DA_LINHA = 'var(--doc-bege-linha, #F4F0EA)';
export const BEGE_DO_TOTAL = 'var(--doc-bege-total, #EEE6DB)';
export const HAIRLINE = '#E2DFD8';
export const CINZA = '#6B6862';
export const CINZA_CLARO = '#8A857C';
export const TEXTO_DETALHE = '#3A3833';

/**
 * Hífen que não quebra linha (U+2011) nos números dos documentos ("2026‑0042"). O html2canvas desenha
 * cada trecho entre pontos de quebra separado, e no hífen comum isso abria um vão no PDF ("2026 -0042")
 * — visível nas fontes sem serifa que a clínica pode escolher.
 */
export const semQuebra = (texto: string): string => texto.replace(/-/g, '\u2011');

/** ISO ou "YYYY-MM-DD" → "15/10/2026". */
export const dataCurta = (valor?: string): string => {
  if (!valor) return '';
  const d = valor.length === 10 ? new Date(`${valor}T12:00:00`) : new Date(valor);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

/** A folha em si: tamanho fixo, fundo off-white, coluna com o espaçamento padrão. */
export const estiloDaPagina: React.CSSProperties = {
  width: PAGE_W,
  height: PAGE_H,
  background: OFFWHITE,
  padding: `${PAD_TOP}px ${PAD_X}px ${PAD_BOTTOM}px`,
  display: 'flex',
  flexDirection: 'column',
  gap: GAP,
  position: 'relative',
  boxSizing: 'border-box',
  fontFamily: 'var(--font-sans)',
  color: PRETO,
};

/** O rótulo bronze em caixa alta — "Preparado para", "Valor recebido". */
export const estiloDoRotulo: React.CSSProperties = {
  fontSize: 8.5,
  textTransform: 'uppercase',
  letterSpacing: '.16em',
  color: BRONZE,
};

/** "1/3" no canto inferior direito. */
export const estiloDoNumeroDaPagina: React.CSSProperties = {
  position: 'absolute',
  right: PAD_X,
  bottom: PAD_BOTTOM / 2,
  fontSize: 9,
  color: CINZA_CLARO,
  fontVariantNumeric: 'tabular-nums',
};

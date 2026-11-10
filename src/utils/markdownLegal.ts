import { PRESTADOR, ROTULOS_DO_PRESTADOR } from './documentosLegais';

/**
 * O Markdown dos documentos legais (`public/legal/*.md`) em HTML, e os `{{marcadores}}` preenchidos.
 * Puro: o servidor usa para as páginas (`server/documentosLegais.ts`) e o painel, para mostrar o
 * documento dentro da janela de aceite (`src/components/auth/LeitorDeDocumento.tsx`).
 *
 * Aceita só o pouco que os documentos usam: títulos (#, ##, ###), parágrafos, listas com "- " (um
 * nível de recuo), tabelas com "|", **negrito**, `código` e [links](/caminho). Todo texto é
 * escapado antes; os marcadores são trocados já no HTML, também escapados.
 */

export const escapar = (texto: string): string =>
  texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Só links para páginas do próprio site, âncoras ou http(s). */
const linkSeguro = (url: string): string | null => (/^(https?:\/\/|\/|#)/.test(url) ? url : null);

/** Negrito, código e links, num texto já escapado. */
function emLinha(texto: string): string {
  let html = escapar(texto);
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_t, rotulo: string, url: string) => {
    const destino = linkSeguro(url.replace(/&amp;/g, '&'));
    if (!destino) return rotulo;
    const externo = /^https?:\/\//.test(destino);
    return `<a href="${escapar(destino)}"${externo ? ' rel="noopener noreferrer"' : ''}>${rotulo}</a>`;
  });
  return html;
}

const ancora = (titulo: string): string =>
  titulo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const celulas = (linha: string): string[] =>
  linha
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim());

export function markdownParaHtml(md: string): string {
  const linhas = md.replace(/\r\n?/g, '\n').split('\n');
  const saida: string[] = [];
  let i = 0;
  while (i < linhas.length) {
    const linha = linhas[i];
    if (!linha.trim()) {
      i++;
      continue;
    }
    const titulo = /^(#{1,3}) (.+)$/.exec(linha);
    if (titulo) {
      const nivel = titulo[1].length;
      const id = nivel === 2 ? ` id="${ancora(titulo[2])}"` : '';
      saida.push(`<h${nivel}${id}>${emLinha(titulo[2].trim())}</h${nivel}>`);
      i++;
      continue;
    }
    if (linha.trim().startsWith('|')) {
      const cabecalho = celulas(linha);
      i++;
      if (i < linhas.length && /^\s*\|[\s:|-]+\|\s*$/.test(linhas[i])) i++;
      const corpo: string[][] = [];
      while (i < linhas.length && linhas[i].trim().startsWith('|')) corpo.push(celulas(linhas[i++]));
      saida.push(
        '<table><thead><tr>' +
          cabecalho.map((c) => `<th>${emLinha(c)}</th>`).join('') +
          '</tr></thead><tbody>' +
          corpo.map((l) => `<tr>${l.map((c) => `<td>${emLinha(c)}</td>`).join('')}</tr>`).join('') +
          '</tbody></table>'
      );
      continue;
    }
    if (/^- /.test(linha)) {
      // Lista, com um nível de recuo ("  - ") e linhas de continuação recuadas.
      const itens: { texto: string; filhos: string[] }[] = [];
      while (i < linhas.length && /^( {2})?- |^ {2,}\S/.test(linhas[i])) {
        const l = linhas[i];
        if (/^- /.test(l)) itens.push({ texto: l.slice(2), filhos: [] });
        else if (/^ {2}- /.test(l)) itens[itens.length - 1]?.filhos.push(l.slice(4));
        else {
          const ultimo = itens[itens.length - 1];
          if (ultimo?.filhos.length) ultimo.filhos[ultimo.filhos.length - 1] += ` ${l.trim()}`;
          else if (ultimo) ultimo.texto += ` ${l.trim()}`;
        }
        i++;
      }
      saida.push(
        '<ul>' +
          itens
            .map(
              (it) =>
                `<li>${emLinha(it.texto)}${it.filhos.length ? `<ul>${it.filhos.map((f) => `<li>${emLinha(f)}</li>`).join('')}</ul>` : ''}</li>`
            )
            .join('') +
          '</ul>'
      );
      continue;
    }
    const paragrafo: string[] = [];
    while (i < linhas.length && linhas[i].trim() && !/^(#{1,3} |- |\|)/.test(linhas[i])) paragrafo.push(linhas[i++].trim());
    saida.push(`<p>${emLinha(paragrafo.join(' '))}</p>`);
  }
  return saida.join('\n');
}

// ==========================================
// MARCADORES E PÁGINA
// ==========================================

const VAZIO_DO_PRESTADOR = new Set(Object.keys(PRESTADOR));

/**
 * Troca os `{{marcadores}}` no HTML. Os valores são escapados; os de `html` entram como estão
 * (montados no código, já escapados). Um marcador do prestador sem valor vira
 * "[a preencher: ...]" destacado; qualquer outro sem valor some.
 */
export function preencher(html: string, valores: Record<string, string>, htmlPronto: Record<string, string> = {}): string {
  return html.replace(/\{\{(\w+)\}\}/g, (_t, chave: string) => {
    if (chave in htmlPronto) return htmlPronto[chave];
    const valor = valores[chave];
    if (valor) return escapar(valor);
    if (VAZIO_DO_PRESTADOR.has(chave)) {
      return `<mark>[a preencher: ${escapar(ROTULOS_DO_PRESTADOR[chave as keyof typeof PRESTADOR])}]</mark>`;
    }
    return '';
  });
}

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Request, Response } from 'express';
import { PAGINAS_LEGAIS, valoresDosDocumentos } from '../src/utils/documentosLegais';
import { escapar, markdownParaHtml, preencher } from '../src/utils/markdownLegal';

export { escapar } from '../src/utils/markdownLegal';

/**
 * Os documentos legais como páginas do site: `/termos`, `/politica-de-privacidade`,
 * `/tratamento-de-dados` e o aviso da clínica em `/privacidade` (ver `server/privacidade.ts`).
 *
 * O texto vem de `public/legal/*.md` (ou da cópia em `dist/legal/`, que o build faz). HTML do
 * servidor, e não uma tela do React, para abrir em qualquer lugar sem JavaScript: um revisor, um
 * leitor de tela, a paciente com internet ruim.
 *
 * O Markdown aceito é o pouco que os documentos usam: títulos (#, ##, ###), parágrafos, listas com
 * "- " (um nível de recuo), tabelas com "|", **negrito**, `código` e [links](/caminho). Os
 * `{{marcadores}}` são trocados depois, já no HTML, sempre escapados.
 */

export type NomeDoDocumento = 'termos-de-uso' | 'politica-de-privacidade' | 'acordo-de-tratamento-de-dados' | 'aviso-da-clinica';

// ==========================================
// LEITURA
// ==========================================

const aqui = path.dirname(fileURLToPath(import.meta.url));
/** Onde procurar: o fonte (`public/legal`) e a cópia do build (`dist/legal`), a partir da raiz ou de `server/`. */
const PASTAS = [
  path.join(process.cwd(), 'public', 'legal'),
  path.join(aqui, 'public', 'legal'),
  path.join(aqui, '..', 'public', 'legal'),
  path.join(process.cwd(), 'dist', 'legal'),
  path.join(aqui, 'dist', 'legal'),
  path.join(aqui, '..', 'dist', 'legal'),
];

const lidos = new Map<NomeDoDocumento, string>();

export function lerDocumento(nome: NomeDoDocumento): string {
  const guardado = lidos.get(nome);
  if (guardado !== undefined) return guardado;
  const pasta = PASTAS.find((p) => existsSync(path.join(p, `${nome}.md`)));
  if (!pasta) throw new Error(`Documento ${nome}.md não encontrado em public/legal nem em dist/legal.`);
  const texto = readFileSync(path.join(pasta, `${nome}.md`), 'utf8');
  lidos.set(nome, texto);
  return texto;
}

// ==========================================
// PÁGINA
// ==========================================

const ESTILO = `
  :root { color-scheme: light dark; --texto: #2b2420; --fundo: #faf7f4; --suave: #6b5f57; --linha: #e6ddd5; --realce: #fff1c2; }
  @media (prefers-color-scheme: dark) { :root { --texto: #eee6df; --fundo: #1d1916; --suave: #b3a79e; --linha: #3a322c; --realce: #5a4a12; } }
  body { margin: 0; background: var(--fundo); color: var(--texto); font: 16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 760px; margin: 0 auto; padding: 32px 16px 48px; }
  h1 { font-size: 1.7rem; line-height: 1.25; margin: 0 0 4px; }
  h1 + p { color: var(--suave); margin: 0 0 24px; }
  h2 { font-size: 1.1rem; margin: 32px 0 8px; padding-top: 16px; border-top: 1px solid var(--linha); }
  h3 { font-size: 1rem; margin: 20px 0 6px; }
  ul { padding-left: 1.2rem; }
  li { margin: 4px 0; }
  a { color: inherit; }
  code { font-size: .85em; word-break: break-all; }
  mark { background: var(--realce); color: inherit; padding: 0 2px; border-radius: 3px; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: .95rem; }
  th, td { border: 1px solid var(--linha); padding: 8px 10px; text-align: left; vertical-align: top; }
  footer { max-width: 760px; margin: 0 auto; padding: 16px 16px 48px; color: var(--suave); font-size: .9rem; border-top: 1px solid var(--linha); }
  footer a { margin-right: 16px; white-space: nowrap; }
  @media print { footer { display: none; } body { background: #fff; color: #000; } }
`;

/** O título da página: o primeiro `<h1>`, sem tags. */
const tituloDe = (html: string): string => (/<h1>(.*?)<\/h1>/.exec(html)?.[1] || 'Documento').replace(/<[^>]+>/g, '');

export function paginaDoDocumento(corpo: string): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="index, follow">
<title>${tituloDe(corpo)}</title>
<style>${ESTILO}</style>
</head>
<body>
<main>
${corpo}
</main>
<footer>
  <a href="${PAGINAS_LEGAIS.termos}">Termos de Uso</a>
  <a href="${PAGINAS_LEGAIS.politicaDePrivacidade}">Política de Privacidade</a>
  <a href="${PAGINAS_LEGAIS.tratamentoDeDados}">Acordo de Tratamento de Dados</a>
</footer>
</body>
</html>`;
}

/** O documento pronto, em HTML. */
export function documentoEmHtml(
  nome: NomeDoDocumento,
  valores: Record<string, string> = {},
  htmlPronto: Record<string, string> = {}
): string {
  return paginaDoDocumento(preencher(markdownParaHtml(lerDocumento(nome)), { ...valoresDosDocumentos(), ...valores }, htmlPronto));
}

/** A rota de um documento da plataforma (os três que não dependem da clínica). */
export const servirDocumento =
  (nome: Exclude<NomeDoDocumento, 'aviso-da-clinica'>) =>
  (_req: Request, res: Response): void => {
    try {
      res.set('Cache-Control', 'public, max-age=600').type('html').send(documentoEmHtml(nome));
    } catch (erro) {
      console.error(`[documentos] ${nome}:`, erro);
      res.status(500).type('text').send('Documento indisponível no momento. Tente de novo em alguns minutos.');
    }
  };

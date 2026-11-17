import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';
import plataforma from './plataforma.json';
import {escolherModo} from './src/lib/projetoFirebase';
import {DESCRICAO_DA_PLATAFORMA, MARCA_DA_PLATAFORMA} from './src/utils/marca';

/**
 * No modo Zulia (`plataforma.json`, ou VITE_PLATAFORMA=zulia), o `index.html` sai com a marca da
 * plataforma: é a primeira coisa que aparece, antes do JavaScript, e o título padrão dos links que
 * o servidor não reconhece. No modo legado, o `index.html` da La Vie fica como está.
 */
const marcaDaPlataforma = (): Plugin => ({
  name: 'marca-da-plataforma',
  transformIndexHtml(html) {
    if (escolherModo(plataforma.modo, process.env.VITE_PLATAFORMA) !== 'zulia') return html;
    const titulo = MARCA_DA_PLATAFORMA;
    const descricao = `${MARCA_DA_PLATAFORMA} — ${DESCRICAO_DA_PLATAFORMA.toLowerCase()}: agenda, fichas, orçamentos e catálogo da sua clínica.`;
    return {
      html: html
        .replace(/<title>[\s\S]*?<\/title>/i, `<title>${titulo}</title>`)
        .replace(/(<meta\s+name="description"\s+content=")[^"]*(")/i, `$1${descricao}$2`)
        .replace(/(<meta\s+property="og:title"\s+content=")[^"]*(")/i, `$1${titulo}$2`)
        .replace(/(<meta\s+property="og:description"\s+content=")[^"]*(")/i, `$1${descricao}$2`),
      // O site instalável no celular ("Adicionar à tela inicial"): o manifesto dá nome, ícone e a
      // abertura em tela cheia; o iPhone lê as metas `apple-*` e o ícone próprio dele. Só na
      // plataforma — o manifesto leva o nome e o ícone da Venus JK. O passo a passo para a equipe
      // está em Ajustes → Instalar no celular.
      tags: [
        { tag: 'link', attrs: { rel: 'manifest', href: '/manifest.webmanifest' }, injectTo: 'head' },
        { tag: 'meta', attrs: { name: 'theme-color', content: '#F9F8F6' }, injectTo: 'head' },
        { tag: 'link', attrs: { rel: 'apple-touch-icon', href: '/icones/apple-touch-icon.png' }, injectTo: 'head' },
        { tag: 'meta', attrs: { name: 'apple-mobile-web-app-capable', content: 'yes' }, injectTo: 'head' },
        { tag: 'meta', attrs: { name: 'mobile-web-app-capable', content: 'yes' }, injectTo: 'head' },
        { tag: 'meta', attrs: { name: 'apple-mobile-web-app-title', content: titulo }, injectTo: 'head' },
        { tag: 'meta', attrs: { name: 'apple-mobile-web-app-status-bar-style', content: 'default' }, injectTo: 'head' },
      ],
    };
  },
});

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), marcaDaPlataforma()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // Porta vinda do ambiente. O Vite não lê PORT sozinho — só --port — então sem esta linha
      // ele voltaria para a 5173 e ignoraria a porta que o harness reservou, colidindo com outra
      // sessão de desenvolvimento aberta no mesmo projeto. Ausente: comportamento padrão do Vite.
      port: process.env.PORT ? Number(process.env.PORT) : undefined,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

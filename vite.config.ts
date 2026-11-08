import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';
import plataforma from './plataforma.json';
import {escolherModo} from './src/lib/projetoFirebase';

/**
 * No modo Zulia (`plataforma.json`, ou VITE_PLATAFORMA=zulia), o `index.html` sai com a marca da
 * plataforma: é a primeira coisa que aparece, antes do JavaScript, e o título padrão dos links que
 * o servidor não reconhece. No modo legado, o `index.html` da La Vie fica como está.
 */
const marcaDaPlataforma = (): Plugin => ({
  name: 'marca-da-plataforma',
  transformIndexHtml(html) {
    if (escolherModo(plataforma.modo, process.env.VITE_PLATAFORMA) !== 'zulia') return html;
    const titulo = 'Zulia';
    const descricao = 'Zulia — agenda, fichas, orçamentos e catálogo da sua clínica.';
    return html
      .replace(/<title>[\s\S]*?<\/title>/i, `<title>${titulo}</title>`)
      .replace(/(<meta\s+name="description"\s+content=")[^"]*(")/i, `$1${descricao}$2`)
      .replace(/(<meta\s+property="og:title"\s+content=")[^"]*(")/i, `$1${titulo}$2`)
      .replace(/(<meta\s+property="og:description"\s+content=")[^"]*(")/i, `$1${descricao}$2`);
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

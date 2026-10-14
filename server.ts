import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarResolvedorDePreview } from './server/previewDosLinks';
import { aplicarPreviewNoHtml } from './src/utils/linkPreview';

/**
 * Serve o site já construído (`dist/`) e, nos links que a clínica manda para as clientes, troca o
 * título e a descrição do `<head>` antes de responder.
 *
 * Existe por um motivo só: o cartão que o WhatsApp mostra sobre o link vem das tags `og:title` e
 * `og:description` do HTML, lidas por um robô que não executa JavaScript. Num site de uma página
 * só, todos os links tinham o mesmo título. Aqui cada um sai com o seu — "Anamnese - Botox",
 * "Confirmação de agendamento - Limpeza de pele", "Orçamento - ..." (ver `src/utils/linkPreview.ts`).
 *
 * O resto do app não muda: o painel e as páginas públicas continuam sendo o mesmo bundle do Vite.
 * Se a busca do título falhar, a resposta é o `index.html` de sempre.
 *
 * Rodar: `npm run build && npm start`.
 */

const pasta = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(pasta, 'dist');
const arquivoIndex = path.join(dist, 'index.html');

if (!fs.existsSync(arquivoIndex)) {
  console.error(`Não encontrei ${arquivoIndex}. Rode "npm run build" antes de iniciar o servidor.`);
  process.exit(1);
}

const indexHtml = fs.readFileSync(arquivoIndex, 'utf-8');
const resolverPreview = criarResolvedorDePreview();

const app = express();
app.disable('x-powered-by');

// Arquivos com hash no nome nunca mudam; o resto (foto da doutora, por exemplo) revalida.
app.use('/assets', express.static(path.join(dist, 'assets'), { immutable: true, maxAge: '1y', fallthrough: true }));
// Um arquivo de /assets que não existe é um 404 de verdade — devolver a página no lugar dele faria
// o navegador tentar executar HTML como JavaScript depois de uma publicação nova.
app.use('/assets', (_req, res) => {
  res.status(404).end();
});
app.use(express.static(dist, { index: false }));

app.get('*', async (req, res) => {
  const busca = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';

  let html = indexHtml;
  try {
    const preview = await resolverPreview(busca);
    if (preview) html = aplicarPreviewNoHtml(indexHtml, preview);
  } catch (erro) {
    console.warn('[preview] falhou, servindo a página padrão:', erro);
  }

  // O título muda de link para link e com o cadastro; nada de guardar a página no navegador.
  res.set('Cache-Control', 'no-cache').type('html').send(html);
});

// A hospedagem informa a porta em PORT; sem ela, 3000 (a do AI Studio).
const porta = Number(process.env.PORT) || 3000;
app.listen(porta, '0.0.0.0', () => {
  console.log(`La Vie Clinique no ar em http://localhost:${porta}`);
});

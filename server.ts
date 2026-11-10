import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarRotasDaEquipe, manterEquipeSincronizada } from './server/equipe';
import { bancoAdmin, PREFIXO_DA_CREDENCIAL } from './server/firebaseAdmin';
import { criarRotasFichaPublica } from './server/fichaPublica';
import { criarRotasGoogleAgenda } from './server/googleAgenda';
import { criarResolvedorDePreview, type LeitorDoBanco } from './server/previewDosLinks';
import { servirPrivacidade } from './server/privacidade';
import { ehZulia, firebaseConfig } from './src/lib/projetoFirebase';
import { aplicarPreviewNoHtml } from './src/utils/linkPreview';
import { MARCA_DA_LA_VIE, MARCA_DA_PLATAFORMA } from './src/utils/marca';

/**
 * Serve o site já construído (`dist/`) e, nos links que a clínica manda para as clientes, troca o
 * título e a descrição do `<head>` antes de responder.
 *
 * Existe por dois motivos. O primeiro: o cartão que o WhatsApp mostra sobre o link vem das tags
 * `og:title` e `og:description` do HTML, lidas por um robô que não executa JavaScript. Num site de
 * uma página só, todos os links tinham o mesmo título. Aqui cada um sai com o seu — "Anamnese - Botox",
 * "Confirmação de agendamento - Limpeza de pele", "Orçamento - ..." (ver `src/utils/linkPreview.ts`).
 *
 * O segundo: a ligação com o Google Agenda de cada profissional, que guarda uma autorização que
 * não pode ficar no navegador (`/api/google-agenda`, ver `server/googleAgenda.ts`).
 *
 * O resto do app não muda: o painel e as páginas públicas continuam sendo o mesmo bundle do Vite.
 * Se a busca do título falhar, a resposta é o `index.html` de sempre.
 *
 * O projeto do Firebase (La Vie ou Zulia) vem de `plataforma.json` — ver
 * `src/lib/projetoFirebase.ts`. Na Zulia, os dados de cada clínica moram em `clinicas/{c}/...`
 * (`server/clinicas.ts`), e a equipe de cada clínica é gerenciada por `/api/equipe`.
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

/**
 * Leitura do cartão do link com a credencial do servidor, quando houver (ver previewDosLinks).
 * `colecao` já vem com o caminho da clínica na Zulia (`clinicas/{c}/quotes`, por exemplo).
 */
const lerComCredencial = (): LeitorDoBanco | undefined => {
  const db = bancoAdmin();
  if (!db) return undefined;
  return async (colecao, id, campos) => {
    const snap = await db.collection(colecao).doc(id).get();
    if (!snap.exists) return null;
    const dados = snap.data() || {};
    // Só os campos pedidos, como a máscara da API REST: nada da paciente sai daqui.
    const lerCaminho = (caminho: string) => caminho.split('.').reduce<any>((v, parte) => v?.[parte], dados);
    const resultado: Record<string, unknown> = {};
    for (const campo of campos) {
      const valor = lerCaminho(campo);
      if (valor === undefined) continue;
      const partes = campo.split('.');
      let alvo: any = resultado;
      partes.slice(0, -1).forEach((parte) => (alvo = alvo[parte] ??= {}));
      alvo[partes[partes.length - 1]] = valor;
    }
    return resultado;
  };
};
const resolverPreview = criarResolvedorDePreview({ lerComCredencial });

const app = express();
app.disable('x-powered-by');
// O AI Studio (Cloud Run) entrega o pedido por um proxy: o endereço de quem pediu vem no
// X-Forwarded-For. É ele que o limite de pedidos da ficha pública usa.
app.set('trust proxy', true);

app.use((_req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Ficha de anamnese da paciente, sem login: abrir e salvar passam pelo servidor, que confere o
// link — `patients` e `anamnesis_records` não abrem mais para quem não é da equipe.
app.use('/api/ficha-publica', criarRotasFichaPublica());
// Conexão das profissionais com o Google Agenda e envio dos eventos (ver server/googleAgenda.ts).
app.use('/api/google-agenda', criarRotasGoogleAgenda());
// Logins da equipe de cada clínica, na Zulia: criar, mudar papel, desativar (ver server/equipe.ts).
app.use('/api/equipe', criarRotasDaEquipe());
// Política de privacidade pública — o Google exige o link dela na tela de consentimento.
app.get('/privacidade', servirPrivacidade);

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
  console.log(
    `${ehZulia ? MARCA_DA_PLATAFORMA : MARCA_DA_LA_VIE} no ar em http://localhost:${porta} (projeto ${firebaseConfig.projectId})`
  );
  if (!bancoAdmin()) {
    console.warn(
      `[admin] Sem credencial do servidor (${PREFIXO_DA_CREDENCIAL}_EMAIL/${PREFIXO_DA_CREDENCIAL}_CHAVE): a ficha ` +
        'pública não vai abrir. Ver docs/ficha-publica-servidor.md.'
    );
  }
  // A lista de logins da equipe que as regras do Firestore da La Vie usam (ver server/equipe.ts).
  // Na Zulia as regras conferem a claim do login, e não há lista a manter.
  if (!ehZulia) manterEquipeSincronizada(bancoAdmin);
});

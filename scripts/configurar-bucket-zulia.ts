/**
 * Aplica no bucket da Zulia o CORS de `cors.json` — o mesmo do bucket da La Vie.
 *
 * Sem ele, o navegador baixa a foto (`<img>` não liga para CORS), mas não deixa desenhá-la num
 * `<canvas>` sem "sujar" o canvas — e é por canvas que o painel gera o PDF do catálogo, das fichas
 * e dos orçamentos (html2canvas). O PDF sairia sem as fotos.
 *
 *   npx tsx scripts/configurar-bucket-zulia.ts --conferir   só mostra o CORS de hoje
 *   npx tsx scripts/configurar-bucket-zulia.ts              aplica o cors.json
 *
 * Credencial: ZULIA_CLIENT_EMAIL e ZULIA_PRIVATE_KEY (papel que administra o bucket).
 */
import { readFileSync } from 'node:fs';
import { abrirZulia } from './zuliaAdmin';

async function main() {
  const zulia = abrirZulia({ emulador: false });
  try {
    const [antes] = await zulia.bucket.getMetadata();
    console.log(`Bucket ${zulia.bucket.name}\nCORS hoje: ${JSON.stringify(antes.cors || [])}`);
    if (process.argv.includes('--conferir')) return;
    const cors = JSON.parse(readFileSync('cors.json', 'utf8'));
    await zulia.bucket.setCorsConfiguration(cors);
    const [depois] = await zulia.bucket.getMetadata();
    console.log(`CORS agora: ${JSON.stringify(depois.cors || [])}`);
  } finally {
    await zulia.encerrar();
  }
}

main().catch((e) => {
  console.error(`\nNão aplicado: ${(e as Error).message}`);
  process.exitCode = 1;
});

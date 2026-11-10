/**
 * Reconta o uso de cada clínica (`clinicas/{c}.uso.clientes` e `.uso.procedimentos`) a partir do
 * que existe no banco — os contadores que os limites do plano gratuito conferem (ver
 * src/utils/planos.ts e zulia/firestore.rules).
 *
 * Quando rodar: uma vez, para as clínicas de antes dos contadores (a La Vie); quando uma clínica
 * mudar de plano (o completo não exige o contador, então ele pode ter ficado para trás); e sempre
 * que a conferência mostrar diferença.
 *
 *   npx tsx scripts/recontar-uso.ts --conferir          só mostra (nada é gravado)
 *   npx tsx scripts/recontar-uso.ts                     grava o uso certo em todas as clínicas
 *   npx tsx scripts/recontar-uso.ts --id <clinicaId>    só uma clínica
 *   (+ --emulador: nos emuladores locais)
 *
 * Conta com `count()` (agregação): não lê o conteúdo de nenhum cadastro. Credencial: ZULIA_CLIENT_EMAIL
 * e ZULIA_PRIVATE_KEY.
 */
import { abrirZulia, pediuEmulador, type AcessoZulia } from './zuliaAdmin';
import { usoDe, type UsoDaClinica } from '../src/utils/planos';

export interface Recontagem {
  id: string;
  nome: string;
  plano: string;
  antes: UsoDaClinica;
  depois: UsoDaClinica;
}

/** Reconta uma clínica; com `gravar`, acerta o contador se estiver diferente. */
export async function recontarClinica(zulia: AcessoZulia, id: string, gravar: boolean): Promise<Recontagem> {
  const ref = zulia.db.doc(`clinicas/${id}`);
  const dados = (await ref.get()).data() || {};
  const [clientes, procedimentos] = await Promise.all(
    ['patients', 'procedures'].map(async (c) => (await zulia.db.collection(`clinicas/${id}/${c}`).count().get()).data().count)
  );
  const antes = usoDe(dados);
  const depois = { clientes, procedimentos };
  if (gravar && (antes.clientes !== clientes || antes.procedimentos !== procedimentos || !dados.uso)) {
    await ref.update({ 'uso.clientes': clientes, 'uso.procedimentos': procedimentos, atualizadaEm: new Date().toISOString() });
  }
  return { id, nome: String(dados.nome || ''), plano: String(dados.plano || '?'), antes, depois };
}

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const zulia = abrirZulia({ emulador: pediuEmulador() });
  const gravar = !process.argv.includes('--conferir');
  try {
    const so = argumento('--id');
    const ids = so ? [so] : (await zulia.db.collection('clinicas').listDocuments()).map((d) => d.id);
    console.log(`${zulia.config.projectId}: ${ids.length} clínica(s)${gravar ? '' : ' — só conferindo'}\n`);
    let diferentes = 0;
    for (const id of ids) {
      const r = await recontarClinica(zulia, id, gravar);
      const igual = r.antes.clientes === r.depois.clientes && r.antes.procedimentos === r.depois.procedimentos;
      if (!igual) diferentes++;
      console.log(
        `  ${r.id}  ${r.nome.slice(0, 40).padEnd(40)}  ${r.plano.padEnd(9)}  ` +
          `clientes ${r.antes.clientes} → ${r.depois.clientes}, procedimentos ${r.antes.procedimentos} → ${r.depois.procedimentos}` +
          (igual ? '' : gravar ? '  (acertado)' : '  (diferente)')
      );
    }
    console.log(`\n${diferentes} clínica(s) com diferença${gravar && diferentes ? ', acertada(s)' : ''}.`);
  } finally {
    await zulia.encerrar();
  }
}

if (process.argv[1] && /recontar-uso\.ts$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(`\nParou: ${(e as Error).message}`);
    process.exitCode = 1;
  });
}

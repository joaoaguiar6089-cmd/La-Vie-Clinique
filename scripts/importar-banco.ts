/**
 * Grava num banco Firestore o backup em arquivo produzido por `scripts/exportar-banco.ts`.
 *
 * É a segunda metade da migração de banco: o export tira os dados do banco antigo e os põe no
 * disco; este script os leva ao banco novo, preservando o ID de cada documento.
 *
 * Preservar os IDs não é detalhe: o ID de um orçamento e o de uma ficha de anamnese *são* o
 * segredo do link enviado à paciente (ver `createQuote` em databaseService.ts, que usa
 * `crypto.randomUUID()`, e as regras de `quotes` e `anamnesis_records` em firestore.rules). Um
 * documento reimportado com ID novo é um link quebrado no WhatsApp de alguém.
 *
 * O banco de destino vem por `--banco`, e não do `firebase-applet-config.json`, de propósito: a
 * importação acontece ANTES da virada, e nessa hora o arquivo de config ainda aponta para o banco
 * antigo. Amarrar o destino ao config obrigaria a trocar o config cedo demais — e aí qualquer
 * pessoa que abrisse o app cairia num banco ainda vazio, onde `seedInitialDataIfEmpty()` popula
 * tudo com dados de exemplo e sobrescreve o perfil da clínica.
 *
 * Uso:
 *   # 1. simulação — só lê os arquivos, valida e relata
 *   npx tsx scripts/importar-banco.ts --pasta backup/2026-09-16-1535 --banco banco-novo
 *
 *   # 2. grava de verdade (pergunta o login da clínica; a senha não aparece na tela)
 *   npx tsx scripts/importar-banco.ts --pasta backup/2026-09-16-1535 --banco banco-novo --aplicar
 *
 *   # 3. confere o que foi parar lá, sem gravar nada
 *   npx tsx scripts/importar-banco.ts --pasta backup/2026-09-16-1535 --banco banco-novo --conferir
 *
 * É seguro rodar mais de uma vez: cada documento é gravado pelo seu próprio ID, então repetir
 * sobrescreve em vez de duplicar. É assim que a segunda passada da virada recolhe o que a clínica
 * digitou entre o primeiro backup e o momento de trocar a chave.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, isAbsolute } from 'node:path';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, writeBatch, Timestamp } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { obterCredenciais, explicarErro, encerrar } from './credenciais';

const COLECOES = [
  'procedures',
  'clinic_settings',
  'anamnesis_general_questions',
  'anamnesis_templates',
  'patients',
  'anamnesis_records',
  'quotes',
  'counters',
] as const;

/**
 * O Firestore aceita no máximo 500 operações por lote. 450 deixa folga para o caso de um lote
 * ganhar operações extras numa mudança futura, sem transformar isso num erro em produção.
 */
const TAMANHO_DO_LOTE = 450;

const raiz = dirname(dirname(fileURLToPath(import.meta.url)));
const config = JSON.parse(readFileSync(join(raiz, 'firebase-applet-config.json'), 'utf8'));

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const aplicar = process.argv.includes('--aplicar');
const conferir = process.argv.includes('--conferir');
const pastaArg = argumento('--pasta');
const bancoDestino = argumento('--banco');

if (!pastaArg || !bancoDestino) {
  console.error(
    'Faltam argumentos.\n\n' +
      '  npx tsx scripts/importar-banco.ts --pasta backup/<AAAA-MM-DD-HHMM> --banco <id-do-banco-novo>\n\n' +
      'Acrescente --aplicar para gravar de verdade, ou --conferir para comparar sem gravar.'
  );
  process.exit(1);
}

const pasta = isAbsolute(pastaArg) ? pastaArg : join(raiz, pastaArg);
if (!existsSync(join(pasta, 'resumo.json'))) {
  console.error(`Não achei um backup em ${pasta} (falta o resumo.json).`);
  process.exit(1);
}

const resumo = JSON.parse(readFileSync(join(pasta, 'resumo.json'), 'utf8'));

// Trava de segurança: gravar o backup de volta no banco de onde ele saiu não é o que ninguém quer
// fazer de propósito, e seria destrutivo (desfaz tudo que mudou desde o export).
if (resumo.bancoOrigem === bancoDestino) {
  console.error(
    `Recusado: o destino (--banco ${bancoDestino}) é o MESMO banco de onde este backup saiu.\n` +
      `Isso sobrescreveria com dados antigos tudo que mudou desde ${resumo.exportadoEm}.\n` +
      `Confira o --banco.`
  );
  process.exit(1);
}

const app = initializeApp(config);
const db = getFirestore(app, bancoDestino);

/** Desfaz a marca `__tipo` que o export usa para os tipos que o JSON não representa sozinho. */
function doJson(valor: unknown): unknown {
  if (valor === null || valor === undefined) return valor;
  if (Array.isArray(valor)) return valor.map(doJson);

  if (typeof valor === 'object') {
    const obj = valor as Record<string, unknown>;
    if (obj.__tipo === 'timestamp' && typeof obj.iso === 'string') {
      return Timestamp.fromDate(new Date(obj.iso));
    }
    const saida: Record<string, unknown> = {};
    for (const [chave, v] of Object.entries(obj)) saida[chave] = doJson(v);
    return saida;
  }

  return valor;
}

function lerColecao(nome: string): Record<string, Record<string, unknown>> {
  const caminho = join(pasta, `${nome}.json`);
  if (!existsSync(caminho)) return {};
  const arquivo = JSON.parse(readFileSync(caminho, 'utf8'));
  return arquivo.documentos || {};
}

/** Grava uma coleção em lotes, devolvendo quantos documentos foram gravados. */
async function gravarColecao(
  nome: string,
  documentos: Record<string, Record<string, unknown>>
): Promise<number> {
  const ids = Object.keys(documentos);
  let gravados = 0;

  for (let i = 0; i < ids.length; i += TAMANHO_DO_LOTE) {
    const fatia = ids.slice(i, i + TAMANHO_DO_LOTE);
    const lote = writeBatch(db);

    for (const id of fatia) {
      // `set` sem merge, de propósito: o documento do backup é a verdade inteira. Com merge, um
      // campo apagado no banco antigo depois de um import anterior sobreviveria para sempre.
      lote.set(doc(db, nome, id), doJson(documentos[id]) as Record<string, unknown>);
    }

    await lote.commit();
    gravados += fatia.length;
  }

  return gravados;
}

/** Compara o backup com o que está no banco de destino. Não grava nada. */
async function conferirColecao(
  nome: string,
  documentos: Record<string, Record<string, unknown>>
): Promise<boolean> {
  const snap = await getDocs(collection(db, nome));
  const noBanco = new Set<string>();
  snap.forEach((d) => noBanco.add(d.id));

  const noBackup = Object.keys(documentos);
  const faltando = noBackup.filter((id) => !noBanco.has(id));
  const sobrando = [...noBanco].filter((id) => !documentos[id]);

  const ok = faltando.length === 0;
  const marca = ok ? 'ok ' : 'FALHA';
  console.log(
    `  ${marca} ${nome.padEnd(30)} backup ${String(noBackup.length).padStart(5)} | ` +
      `banco ${String(noBanco.size).padStart(5)}`
  );

  if (faltando.length > 0) {
    console.log(`       faltam no banco: ${faltando.slice(0, 5).join(', ')}${faltando.length > 5 ? ` … (+${faltando.length - 5})` : ''}`);
  }
  if (sobrando.length > 0) {
    // Não é erro por si: pode ser dado novo criado no banco de destino depois do backup, ou os
    // dados de exemplo que o app semeia numa coleção vazia. Só precisa ser visto.
    console.log(`       existem no banco e não no backup: ${sobrando.slice(0, 5).join(', ')}${sobrando.length > 5 ? ` … (+${sobrando.length - 5})` : ''}`);
  }

  return ok;
}

async function main(): Promise<void> {
  console.log(`Backup:  ${pasta}`);
  console.log(`         ${resumo.totalDocumentos} documento(s), exportado(s) em ${resumo.exportadoEm}`);
  console.log(`         origem: ${resumo.bancoOrigem}`);
  console.log(`Destino: ${bancoDestino}`);
  console.log(
    conferir ? '\nMODO CONFERIR — nada será gravado.' : aplicar ? '\nMODO APLICAR — os dados serão gravados.' : '\nSIMULAÇÃO — nada será gravado.'
  );
  console.log('');

  // A simulação não precisa de login: ela só lê arquivos do disco.
  if (aplicar || conferir) {
    const { email, senha } = await obterCredenciais(
      'As regras do Firestore exigem login para gravar nas coleções do sistema.'
    );
    await signInWithEmailAndPassword(getAuth(app), email, senha);
  }

  let total = 0;
  let tudoConfere = true;

  for (const nome of COLECOES) {
    const documentos = lerColecao(nome);
    const quantos = Object.keys(documentos).length;

    if (conferir) {
      tudoConfere = (await conferirColecao(nome, documentos)) && tudoConfere;
      continue;
    }

    if (quantos === 0) {
      console.log(`  ${nome.padEnd(30)}     0 documento(s) — nada a fazer`);
      continue;
    }

    const gravados = aplicar ? await gravarColecao(nome, documentos) : quantos;
    total += gravados;
    console.log(`  ${nome.padEnd(30)} ${String(gravados).padStart(5)} documento(s)${aplicar ? '' : ' (simulação)'}`);
  }

  if (conferir) {
    console.log(
      tudoConfere
        ? '\nTudo que está no backup está no banco de destino.'
        : '\nFALTAM documentos no banco de destino. Rode de novo com --aplicar.'
    );
    process.exit(tudoConfere ? 0 : 1);
  }

  console.log(`\n  ${'TOTAL'.padEnd(30)} ${String(total).padStart(5)} documento(s)`);

  if (!aplicar) {
    console.log('\nRode de novo com --aplicar para gravar.');
  } else {
    console.log('\nAgora confira com --conferir antes de trocar o firebase-applet-config.json.');
  }
  await encerrar(app, 0);
}

main().catch(async (err) => {
  // Sem rastro de pilha: quem roda isto quer saber o que fazer, não em que linha do Node parou.
  console.error('\n' + explicarErro(err) + '\n');
  await encerrar(app, 1);
});

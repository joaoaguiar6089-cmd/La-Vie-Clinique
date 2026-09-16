/**
 * Salva no computador uma cópia completa do banco Firestore, em arquivos JSON.
 *
 * Para que serve: é o backup que torna a troca de banco reversível. Enquanto a cópia está no
 * disco, ela não depende de nenhuma conta do Google, de nenhuma cota e de nenhum dos dois bancos
 * — se qualquer coisa der errado na migração, a fonte da verdade está aqui.
 *
 * **Este script só lê.** Não grava em banco nenhum. Isso é proposital: a cota diária do Firestore
 * separa leitura de gravação, então ele roda normalmente mesmo com a clínica bloqueada para
 * gravar — que é exatamente a situação em que fazer o backup é mais urgente.
 *
 * Por que JSON puro resolve: o app não usa nenhum tipo do Firestore que o JSON não represente.
 * Não há `Timestamp`, `serverTimestamp`, `GeoPoint`, `Bytes` nem `increment` em todo o código —
 * as datas são gravadas como texto ISO (`new Date().toISOString()`). Tudo é string, número,
 * booleano, lista ou objeto simples, e a ida e volta por JSON é exata. Ainda assim `paraJson`
 * abaixo trata `Timestamp`, porque um documento legado semeado pelo AI Studio poderia ter um.
 *
 * Uso (o script pergunta o login da clínica; a senha não aparece na tela):
 *   npx tsx scripts/exportar-banco.ts
 *   npx tsx scripts/exportar-banco.ts --banco <id-de-outro-banco>
 *
 * O resultado vai para `backup/<AAAA-MM-DD-HHMM>/`, uma pasta nova a cada execução — rodar de
 * novo nunca sobrescreve um backup anterior.
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, Timestamp } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { obterCredenciais, explicarErro, encerrar } from './credenciais';

/** As 8 coleções do sistema. Conferido contra as constantes de `src/services/databaseService.ts`. */
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

const raiz = dirname(dirname(fileURLToPath(import.meta.url)));
const config = JSON.parse(readFileSync(join(raiz, 'firebase-applet-config.json'), 'utf8'));

/** `--banco <id>` sobrepõe o banco do arquivo de config, sem precisar editá-lo. */
function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const bancoOrigem = argumento('--banco') || config.firestoreDatabaseId || '(default)';

const app = initializeApp(config);
const db = getFirestore(app, bancoOrigem);

/**
 * Converte o que veio do Firestore para algo que o JSON representa sem perda.
 *
 * Na prática este projeto só tem tipos que o JSON já cobre, então a função é quase uma cópia. O
 * ramo do `Timestamp` existe como seguro: ele viraria `{}` num `JSON.stringify` direto — uma data
 * apagada silenciosamente, que só apareceria meses depois. A marca `__tipo` deixa o
 * `importar-banco.ts` reconstruir o valor original.
 */
function paraJson(valor: unknown): unknown {
  if (valor === null || valor === undefined) return valor;

  if (valor instanceof Timestamp) {
    return { __tipo: 'timestamp', iso: valor.toDate().toISOString() };
  }

  if (Array.isArray(valor)) return valor.map(paraJson);

  if (typeof valor === 'object') {
    const proto = Object.getPrototypeOf(valor);
    // Um objeto que não é `{}` puro nem `Timestamp` é um tipo do Firestore que este projeto não
    // usa (GeoPoint, Bytes, DocumentReference). Melhor barrar o backup do que gravar um `{}`.
    if (proto !== Object.prototype && proto !== null) {
      throw new Error(
        `Tipo do Firestore não previsto neste backup: ${valor.constructor?.name}. ` +
          `Acrescente o tratamento dele em paraJson() antes de continuar.`
      );
    }
    const saida: Record<string, unknown> = {};
    for (const [chave, v] of Object.entries(valor)) saida[chave] = paraJson(v);
    return saida;
  }

  // number, string, boolean. NaN e Infinity não sobrevivem ao JSON e o projeto não os usa.
  if (typeof valor === 'number' && !Number.isFinite(valor)) {
    throw new Error(`Número não representável em JSON (${valor}) encontrado no backup.`);
  }
  return valor;
}

function carimboDeHora(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

async function main(): Promise<void> {
  // O banco de origem aparece antes da senha: exportar do banco errado desperdiça cota de
  // leitura e produz um backup que parece bom e não serve.
  console.log(`Banco de origem: ${bancoOrigem}`);

  const { email, senha } = await obterCredenciais(
    'As regras do Firestore exigem login para ler procedures, clinic_settings e counters.'
  );
  await signInWithEmailAndPassword(getAuth(app), email, senha);

  const pasta = join(raiz, 'backup', carimboDeHora());
  mkdirSync(pasta, { recursive: true });

  console.log(`Salvando em:     ${pasta}\n`);

  const exportadoEm = new Date().toISOString();
  const contagem: Record<string, number> = {};
  let totalDocumentos = 0;
  let totalBytes = 0;

  for (const nome of COLECOES) {
    const snap = await getDocs(collection(db, nome));

    // O ID do documento é a CHAVE do objeto: é assim que ele é preservado na volta. Perder os IDs
    // quebraria todo link de orçamento e de ficha já enviado às pacientes — o ID é o segredo do
    // link. Ver `firestore.rules` e `createQuote` em databaseService.ts.
    const documentos: Record<string, unknown> = {};
    snap.forEach((docSnap) => {
      documentos[docSnap.id] = paraJson(docSnap.data());
    });

    const conteudo = JSON.stringify(
      { colecao: nome, bancoOrigem, exportadoEm, documentos },
      null,
      2
    );

    // Grava coleção por coleção, e não tudo no fim: se a leitura falhar na metade (rede, cota),
    // o que já saiu fica salvo em vez de se perder junto.
    writeFileSync(join(pasta, `${nome}.json`), conteudo, 'utf8');

    contagem[nome] = snap.size;
    totalDocumentos += snap.size;
    totalBytes += Buffer.byteLength(conteudo, 'utf8');

    console.log(`  ${nome.padEnd(30)} ${String(snap.size).padStart(5)} documento(s)`);
  }

  const resumo = {
    bancoOrigem,
    exportadoEm,
    projectId: config.projectId,
    totalDocumentos,
    contagem,
  };
  writeFileSync(join(pasta, 'resumo.json'), JSON.stringify(resumo, null, 2), 'utf8');

  console.log(`\n  ${'TOTAL'.padEnd(30)} ${String(totalDocumentos).padStart(5)} documento(s)`);
  console.log(`  Tamanho do backup: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`\nBackup concluído em ${pasta}`);

  // Uma coleção vazia não é erro, mas é importante saber: ao apontar o app para um banco onde ela
  // ficou vazia, `seedInitialDataIfEmpty` / `seedAnamnesisInitialDataIfEmpty` populam a coleção
  // com os dados de exemplo de `src/data/`. Melhor descobrir agora do que estranhar depois.
  const vazias = COLECOES.filter((c) => contagem[c] === 0);
  if (vazias.length > 0) {
    console.log(
      `\nAtenção: ${vazias.join(', ')} está(ão) vazia(s). Ao abrir o app no banco novo, o próprio\n` +
        `sistema vai populá-la(s) com os dados de exemplo — o que é o comportamento de sempre,\n` +
        `mas convém saber de onde vieram.`
    );
  }

  console.log(
    `\nGuarde esta pasta fora do computador de trabalho (pen drive ou nuvem): são dados de pacientes.`
  );
  await encerrar(app, 0);
}

main().catch(async (err) => {
  // Sem rastro de pilha: quem roda isto quer saber o que fazer, não em que linha do Node parou.
  console.error('\n' + explicarErro(err) + '\n');
  await encerrar(app, 1);
});

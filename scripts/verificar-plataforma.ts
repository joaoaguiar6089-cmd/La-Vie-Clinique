/**
 * Confere a escolha do projeto do Firebase (`plataforma.json` e `src/lib/projetoFirebase.ts`).
 *
 * O erro que este script caça: o arquivo versionado apontar para um projeto que ninguém pediu.
 * Com `legado`, o site no ar é o da La Vie de sempre; com `zulia`, ele passa a falar com o
 * `zulia-plataforma`. Um erro de digitação aqui não pode virar a La Vie sem querer.
 *
 *   npx tsx scripts/verificar-plataforma.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configDoProjeto, escolherModo, lerModo } from '../src/lib/projetoFirebase';

const raiz = dirname(dirname(fileURLToPath(import.meta.url)));

let falhas = 0;
const ok = (nome: string, condicao: boolean, extra = '') => {
  console.log(`${condicao ? '  ok  ' : ' FALHA'}  ${nome}${extra ? `  — ${extra}` : ''}`);
  if (!condicao) falhas++;
};

// Os avisos de valor inválido são esperados aqui; não poluem a saída.
const erroOriginal = console.error;
console.error = () => {};

console.log('\nO arquivo versionado');
const arquivo = JSON.parse(readFileSync(join(raiz, 'plataforma.json'), 'utf8'));
ok('plataforma.json tem um modo válido', lerModo(arquivo.modo) !== null, `modo: ${JSON.stringify(arquivo.modo)}`);
ok('plataforma.json só tem a chave "modo"', Object.keys(arquivo).join(',') === 'modo');

console.log('\nA escolha');
ok('legado no arquivo vale legado', escolherModo('legado') === 'legado');
ok('zulia no arquivo vale zulia', escolherModo('zulia') === 'zulia');
ok('sobrescrita zulia vence o arquivo', escolherModo('legado', 'zulia') === 'zulia');
ok('sobrescrita legado vence o arquivo', escolherModo('zulia', 'legado') === 'legado');
ok('sobrescrita vazia não muda nada', escolherModo('zulia', '') === 'zulia' && escolherModo('legado', undefined) === 'legado');
ok('sobrescrita inválida não muda nada', escolherModo('legado', 'zulai') === 'legado');
ok('maiúsculas e espaços são aceitos', escolherModo(' Zulia ') === 'zulia');
ok('arquivo inválido cai no legado', escolherModo('outro') === 'legado' && escolherModo(undefined) === 'legado');

console.log('\nOs projetos');
const laVie = configDoProjeto('legado');
const zulia = configDoProjeto('zulia');
ok('legado é o database-dra-karoline, banco banco-novo', laVie.projectId === 'database-dra-karoline' && laVie.firestoreDatabaseId === 'banco-novo');
ok('zulia é o zulia-plataforma, banco (default)', zulia.projectId === 'zulia-plataforma' && zulia.firestoreDatabaseId === '(default)');
ok('cada um com o próprio bucket', laVie.storageBucket.startsWith('database-dra-karoline') && zulia.storageBucket.startsWith('zulia-plataforma'));

console.error = erroOriginal;
console.log(falhas === 0 ? '\nTudo certo.' : `\n${falhas} falha(s).`);
process.exit(falhas === 0 ? 0 : 1);

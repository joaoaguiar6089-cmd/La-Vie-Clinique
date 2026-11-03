/**
 * Confere os caminhos por clínica (`src/lib/clinicaAtual.ts`).
 *
 * O erro que este script caça é o mais caro da migração para várias clínicas: um caminho que,
 * sem clínica definida, deixa de ser o da raiz — e o sistema da La Vie, que está no ar, passa a
 * ler e gravar no lugar errado. E o contrário: uma clínica cujos dados vão parar na raiz ou na
 * pasta de outra.
 *
 *   npx tsx scripts/verificar-clinica-atual.ts
 */
import { clinicaAtual, colecao, definirClinicaAtual, documento, pastaDaClinica } from '../src/lib/clinicaAtual';

let falhas = 0;
const ok = (nome: string, condicao: boolean, extra = '') => {
  console.log(`${condicao ? '  ok  ' : ' FALHA'}  ${nome}${extra ? `  — ${extra}` : ''}`);
  if (!condicao) falhas++;
};

console.log('\nModo legado (projeto atual da La Vie, sem clínica)');
definirClinicaAtual(null);
ok('sem clínica', clinicaAtual() === null);
ok('coleção na raiz', colecao('patients').path === 'patients');
ok('documento na raiz', documento('patients', 'pat-1').path === 'patients/pat-1');
ok('pasta de sempre', pastaDaClinica('anamnese/fotos-pacientes') === 'anamnese/fotos-pacientes');

console.log('\nNa plataforma');
definirClinicaAtual('lavie');
ok('clínica definida', clinicaAtual() === 'lavie');
ok('coleção dentro da clínica', colecao('patients').path === 'clinicas/lavie/patients');
ok('documento dentro da clínica', documento('quotes', 'q1').path === 'clinicas/lavie/quotes/q1');
ok('pasta dentro da clínica', pastaDaClinica('/acompanhamentos/antes-depois/p1') === 'clinicas/lavie/acompanhamentos/antes-depois/p1');
definirClinicaAtual('outra');
ok('trocar de clínica troca o caminho', colecao('patients').path === 'clinicas/outra/patients');
definirClinicaAtual('   ');
ok('clínica em branco volta ao legado', clinicaAtual() === null && colecao('patients').path === 'patients');

console.log(falhas === 0 ? '\nTudo certo.' : `\n${falhas} falha(s).`);
process.exit(falhas === 0 ? 0 : 1);

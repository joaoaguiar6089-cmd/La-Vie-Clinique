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
import {
  chaveLocal,
  clinicaAtual,
  colecao,
  definirClinicaAtual,
  definirClinicaDoLink,
  documento,
  documentoDaPlataforma,
  pastaDaClinica,
} from '../src/lib/clinicaAtual';
import { ehZulia } from '../src/lib/projetoFirebase';
import { subscribeShared, resetSharedSubscriptions } from '../src/services/sharedSubscription';
import { buildPublicLink } from '../src/utils/publicLinks';

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

console.log('\nDocumento da clínica e chaves locais');
definirClinicaAtual(null);
ok('legado não tem documento da clínica', documentoDaPlataforma() === null);
definirClinicaAtual('lavie');
ok('na plataforma, clinicas/{c}', documentoDaPlataforma()?.path === 'clinicas/lavie');
definirClinicaAtual(null);
if (!ehZulia) {
  ok('legado: a chave local é a de sempre', chaveLocal('aura_bronze_procedures_v1') === 'aura_bronze_procedures_v1');
  ok('legado: o link da paciente não muda a clínica (raiz)', definirClinicaDoLink('?anamnese=x&c=outra') && clinicaAtual() === null);
}

console.log('\nLinks da paciente');
definirClinicaAtual(null);
const semClinica = new URL(buildPublicLink(null, { orcamento: 'q1' }));
ok('sem clínica, o link sai como sempre (sem c=)', !semClinica.searchParams.has('c') && semClinica.searchParams.get('orcamento') === 'q1');
definirClinicaAtual('k3P9xq');
const comClinica = new URL(buildPublicLink(null, { agendamento: 't1' }));
ok('com clínica, o link leva c=', comClinica.searchParams.get('c') === 'k3P9xq' && comClinica.searchParams.get('agendamento') === 't1');
ok('o link do catálogo (sem parâmetro) não ganha c=', !buildPublicLink(null, {}).includes('?'));
definirClinicaAtual(null);

console.log('\nAssinaturas compartilhadas por clínica');
let inicios = 0;
const comecar = () => {
  inicios++;
  return () => {};
};
definirClinicaAtual('alfa');
const pararA = subscribeShared('patients', comecar, () => {});
definirClinicaAtual('beta');
const pararB = subscribeShared('patients', comecar, () => {});
ok('a mesma coleção em duas clínicas são duas assinaturas', inicios === 2);
definirClinicaAtual('alfa');
const pararA2 = subscribeShared('patients', comecar, () => {});
ok('a mesma clínica reaproveita a assinatura', inicios === 2);
[pararA, pararB, pararA2].forEach((parar) => parar());
resetSharedSubscriptions();
definirClinicaAtual(null);

console.log(falhas === 0 ? '\nTudo certo.' : `\n${falhas} falha(s).`);
process.exit(falhas === 0 ? 0 : 1);

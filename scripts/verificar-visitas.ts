/**
 * Confere a visita com mais de um procedimento (`utils/visitas.ts`): um atendimento por
 * procedimento, um depois do outro, o mesmo grupo. Sem Firebase.
 *
 *   npx tsx scripts/verificar-visitas.ts
 */
import { Attendance, Procedure } from '../src/types';
import {
  deslocarHora,
  duracoesDasLinhas,
  horariosEmSequencia,
  membrosDaVisita,
  umPorVisita,
  visitaComoUmAtendimento,
} from '../src/utils/visitas';
import { nomeDosProcedimentos } from '../src/utils/attendances';
import { conflitosDe } from '../src/utils/agenda';
import { montarSnapshotDoLink } from '../src/utils/agendamentoLink';

let falhas = 0;
const ok = (nome: string, condicao: boolean, extra = '') => {
  console.log(`${condicao ? '  ok  ' : ' FALHA'}  ${nome}${extra ? `  — ${extra}` : ''}`);
  if (!condicao) falhas++;
};

const proc = (id: string, title: string, duration?: string): Procedure => ({
  id,
  title,
  category: 'X',
  description: '',
  price: 100,
  images: [],
  benefits: [],
  duration,
  order: 1,
  createdAt: '2026-01-01',
});
const catalogo = [proc('gluteo', 'Harmonização Glútea', '30 min'), proc('botox', 'Botox', '45 min'), proc('peeling', 'Peeling')];

const atd = (id: string, extra: Partial<Attendance>): Attendance => ({
  id,
  pacienteId: 'p1',
  pacienteNome: 'Ana Souza',
  data: '2026-11-27',
  procedimentoNome: 'X',
  status: 'agendado',
  professionalId: 'karol',
  createdAt: '2026-11-22T10:00:00.000Z',
  ...extra,
});

console.log('== horários e durações');
ok('um depois do outro', horariosEmSequencia('14:00', [30, 45, 20]).join() === '14:00,14:30,15:15');
ok('sem hora, todos sem hora', horariosEmSequencia(undefined, [30, 45]).every((h) => h === undefined));
ok('deslocar mantém a sequência', deslocarHora('14:30', 90) === '16:00' && deslocarHora('14:30', -30) === '14:00');
ok(
  'duração do catálogo de cada um',
  duracoesDasLinhas([{ procedureId: 'gluteo' }, { procedureId: 'botox' }], 75, catalogo).join() === '30,45'
);
ok(
  'sem duração no catálogo, divide o que sobra',
  duracoesDasLinhas([{ procedureId: 'gluteo' }, { procedureId: 'peeling' }], 90, catalogo).join() === '30,60'
);
ok(
  'duração da visita digitada maior: o último absorve',
  duracoesDasLinhas([{ procedureId: 'gluteo' }, { procedureId: 'botox' }], 90, catalogo).join() === '30,60'
);
ok(
  'a gravada na edição vale mais que a do catálogo',
  duracoesDasLinhas([{ procedureId: 'gluteo', duracaoMin: 40 }, { procedureId: 'botox', duracaoMin: 50 }], 90, catalogo).join() === '40,50'
);
ok('um procedimento só: a duração da visita', duracoesDasLinhas([{ procedureId: 'gluteo' }], 50, catalogo).join() === '50');

console.log('== a visita');
const g1 = atd('a1', { grupoId: 'v1', hora: '14:00', duracaoMin: 30, procedureId: 'gluteo', procedimentoNome: 'Harmonização Glútea', focos: ['Fase 1', 'Fase 2'] });
const g2 = atd('a2', { grupoId: 'v1', hora: '14:30', duracaoMin: 45, procedureId: 'botox', procedimentoNome: 'Botox' });
const remarcado = atd('a0', { grupoId: 'v1', hora: '10:00', status: 'remarcado' });
const sozinho = atd('s1', { hora: '16:00', procedureId: 'botox', procedimentoNome: 'Botox' });
const lista = [g2, sozinho, remarcado, g1];
ok('os dois da visita, na ordem', membrosDaVisita(g2, lista).map((a) => a.id).join() === 'a1,a2');
ok('o remarcado não entra na visita viva', !membrosDaVisita(g1, lista).some((a) => a.id === 'a0'));
ok('sem grupo, ele só', membrosDaVisita(sozinho, lista).map((a) => a.id).join() === 's1');
const visita = visitaComoUmAtendimento(membrosDaVisita(g1, lista));
ok('como um atendimento só: o nome de todos, com os focos', nomeDosProcedimentos(visita) === 'Harmonização Glútea · Fase 1, Fase 2 + Botox');
ok('a hora do primeiro e a duração somada', visita.hora === '14:00' && visita.duracaoMin === 75);
const snapshot = montarSnapshotDoLink(visita, { name: 'Clínica', tagline: '', phone: '', address: '', cityState: '' }, catalogo);
ok('o link mostra a visita inteira', snapshot.procedimento.titulo === 'Harmonização Glútea · Fase 1, Fase 2 + Botox' && snapshot.hora === '14:00' && snapshot.duracaoMin === 75);
ok('uma linha por visita nas listas da recepção', umPorVisita(lista).map((a) => a.id).join() === 's1,a0,a1');
ok('e na ordem em que a lista veio', umPorVisita([g2, g1, sozinho]).map((a) => a.id).join() === 'a1,s1');

console.log('== conflito de horário');
const outraPaciente = atd('o1', { pacienteId: 'p2', hora: '14:15', duracaoMin: 30, procedureId: 'botox' });
const candidato = { id: 'a1', ignorarIds: ['a1', 'a2'], data: '2026-11-27', hora: '14:00', duracaoMin: 75, procedureId: 'gluteo', professionalId: 'karol' };
const conflitos = conflitosDe(candidato, [g1, g2, outraPaciente], catalogo).map((a) => a.id);
ok('a visita não conflita consigo mesma', !conflitos.includes('a2'));
ok('mas conflita com a outra paciente no meio dela', conflitos.join() === 'o1');

console.log(falhas === 0 ? '\nTUDO OK' : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);

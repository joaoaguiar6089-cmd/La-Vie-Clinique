/**
 * Confere o "Sem avaliação" da linha do tempo: a anamnese que não terá avaliação passa direto ao
 * relatório do atendimento, com os mesmos atendimentos que a avaliação ofereceria.
 *
 *   npx tsx scripts/verificar-sem-avaliacao.ts
 */
import { AnamnesisRecord, Attendance, EvaluationRecord } from '../src/types';
import {
  ContextoDaJornada,
  atendimentosDaAnamnese,
  atendimentosDaAvaliacao,
  origemDaAnamnese,
  sementeDaVisita,
} from '../src/utils/passosDaJornada';
import { hojeISO } from '../src/utils/attendances';

let falhas = 0;
const ok = (nome: string, condicao: boolean, extra = '') => {
  console.log(`${condicao ? '  ok  ' : ' FALHA'}  ${nome}${extra ? `  — ${extra}` : ''}`);
  if (!condicao) falhas++;
};

const atd = (id: string, data: string, extra: Partial<Attendance> = {}): Attendance => ({
  id,
  pacienteId: 'p1',
  pacienteNome: 'Cristiane Soares',
  data,
  hora: '10:00',
  procedureId: 'ozonio',
  procedimentoNome: 'Ozonioterapia',
  status: 'compareceu',
  createdAt: `${data}T09:00:00.000Z`,
  ...extra,
});

const anamnese = {
  id: 'r1',
  pacienteId: 'p1',
  pacienteNome: 'Cristiane Soares',
  procedimentoId: 'ozonio',
  procedimentoNome: 'Ozonioterapia',
  professionalId: 'karol',
  dataAtendimento: '2026-10-28',
  createdAt: '2026-10-28T12:00:00.000Z',
  avaliacaoDispensadaEm: '2026-11-03T15:00:00.000Z',
} as unknown as AnamnesisRecord;

const contexto: ContextoDaJornada = {
  atendimentos: [
    atd('antes', '2026-10-20'),
    atd('botox', '2026-10-30', { procedureId: 'botox', procedimentoNome: 'Botox' }),
    atd('ozonio', '2026-10-31'),
    atd('futuro', '2099-01-01', { status: 'agendado' }),
    atd('outra', '2026-10-31', { pacienteId: 'p2' }),
  ],
  anamneses: [anamnese],
  avaliacoes: [],
  catalogo: [],
  templatesAnamnese: [],
};

console.log('\nAnamnese sem avaliação → relatório');
const lista = atendimentosDaAnamnese(anamnese, contexto).map((a) => a.id);
ok('só atendimentos depois da anamnese, que já aconteceram, da mesma paciente', lista.join() === 'ozonio,botox', lista.join());
ok('o do mesmo tratamento vem primeiro', lista[0] === 'ozonio');

const semente = sementeDaVisita(origemDaAnamnese(anamnese));
ok('visita nova com o procedimento da anamnese', semente.procedureId === 'ozonio' && semente.procedimentoNome === 'Ozonioterapia');
ok('com a profissional da anamnese', semente.professionalId === 'karol');
ok('hoje, sem hora', semente.data === hojeISO() && !semente.hora);
ok('sem id — o formulário cria o seu', semente.id === '');

console.log('\nA avaliação segue igual');
const av = {
  id: 'av1',
  pacienteId: 'p1',
  pacienteNome: 'Cristiane Soares',
  procedureId: 'ozonio',
  procedimentoNome: 'Ozonioterapia',
  dataAtendimento: '2026-10-28',
  createdAt: '2026-10-28T12:00:00.000Z',
} as unknown as EvaluationRecord;
ok(
  'mesma lista que a anamnese ofereceria',
  atendimentosDaAvaliacao(av, contexto).map((a) => a.id).join() === lista.join()
);
ok('semente da avaliação igual à de antes', sementeDaVisita(av).procedureId === 'ozonio');

console.log(falhas === 0 ? '\nTudo certo.' : `\n${falhas} falha(s).`);
if (falhas > 0) process.exit(1);

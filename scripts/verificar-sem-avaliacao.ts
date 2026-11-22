/**
 * Confere o "Sem avaliação" da linha do tempo — a anamnese que não terá avaliação passa direto ao
 * relatório do atendimento — e o passo da Avaliação, que é um atendimento do procedimento fixo
 * Avaliação, com o foco no tratamento da anamnese.
 *
 *   npx tsx scripts/verificar-sem-avaliacao.ts
 */
import { AnamnesisRecord, Attendance } from '../src/types';
import {
  ContextoDaJornada,
  atendimentosDaAnamnese,
  avaliacaoDaAnamnese,
  origemDaAnamnese,
  sementeDaVisita,
  sementeDoAgendamento,
} from '../src/utils/passosDaJornada';
import { PROCEDIMENTO_AVALIACAO_ID } from '../src/utils/procedimentoAvaliacao';
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

console.log('\nO passo da Avaliação é um atendimento');
const aval = (id: string, data: string, extra: Partial<Attendance> = {}): Attendance =>
  atd(id, data, { procedureId: PROCEDIMENTO_AVALIACAO_ID, procedimentoNome: 'Avaliação', ...extra });
const comAvaliacoes = (...avs: Attendance[]): ContextoDaJornada => ({
  ...contexto,
  atendimentos: [...contexto.atendimentos, ...avs],
});
ok('sem atendimento de Avaliação, o passo está por fazer', !avaliacaoDaAnamnese(anamnese, contexto));
ok(
  'Avaliação com o foco no tratamento da anamnese conta',
  avaliacaoDaAnamnese(anamnese, comAvaliacoes(aval('a1', '2026-10-29', { focos: ['Ozonioterapia'] })))?.id === 'a1'
);
ok(
  'Avaliação com foco em outro tratamento não conta',
  !avaliacaoDaAnamnese(anamnese, comAvaliacoes(aval('a2', '2026-10-29', { focos: ['Botox'] })))
);
ok(
  'Avaliação sem foco serve, mas a do foco vence',
  avaliacaoDaAnamnese(
    anamnese,
    comAvaliacoes(aval('geral', '2026-10-30'), aval('foco', '2026-10-29', { focos: ['ozonioterapia'] }))
  )?.id === 'foco'
);
ok(
  'Avaliação de antes da anamnese não conta',
  !avaliacaoDaAnamnese(anamnese, comAvaliacoes(aval('antes', '2026-10-20', { focos: ['Ozonioterapia'] })))
);
ok(
  'falta não conta; agendada conta',
  !avaliacaoDaAnamnese(anamnese, comAvaliacoes(aval('f', '2026-10-29', { focos: ['Ozonioterapia'], status: 'faltou' }))) &&
    avaliacaoDaAnamnese(anamnese, comAvaliacoes(aval('ag', '2099-01-02', { focos: ['Ozonioterapia'], status: 'agendado' })))?.id === 'ag'
);
ok(
  'Avaliação com vários focos conta para a anamnese de qualquer um deles',
  avaliacaoDaAnamnese(anamnese, comAvaliacoes(aval('varios', '2026-10-29', { focos: ['Botox', 'Ozonioterapia'] })))?.id === 'varios'
);
ok(
  'o foco antigo (um só, gravado em `foco`) continua valendo',
  avaliacaoDaAnamnese(anamnese, comAvaliacoes(aval('antigo', '2026-10-29', { foco: 'Ozonioterapia' } as Partial<Attendance>)))?.id === 'antigo'
);
ok(
  'feita vence a agendada',
  avaliacaoDaAnamnese(
    anamnese,
    comAvaliacoes(
      aval('ag', '2099-01-02', { focos: ['Ozonioterapia'], status: 'agendado' }),
      aval('feita', '2026-10-29', { focos: ['Ozonioterapia'] })
    )
  )?.id === 'feita'
);
const agendamento = sementeDoAgendamento({
  pacienteId: 'p1',
  pacienteNome: 'Cristiane Soares',
  tratamento: { procedureId: PROCEDIMENTO_AVALIACAO_ID, procedimentoNome: 'Avaliação', focos: ['Ozonioterapia'] },
});
ok(
  'agendar a avaliação leva o procedimento Avaliação e o foco',
  agendamento.procedureId === PROCEDIMENTO_AVALIACAO_ID && agendamento.focos?.join() === 'Ozonioterapia'
);

console.log(falhas === 0 ? '\nTudo certo.' : `\n${falhas} falha(s).`);
if (falhas > 0) process.exit(1);

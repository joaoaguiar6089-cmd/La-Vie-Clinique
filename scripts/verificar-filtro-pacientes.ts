/**
 * Confere o filtro da lista de Pacientes — "Todas", "Com atendimento" e "Com agendamento".
 *
 * O que este script caça: agendamento que não é horário marcado entrando no filtro (o de ontem
 * esquecido sem desfecho, a falta, a remarcação), agendamento contando como atendimento feito, e
 * a linha mostrando um horário que não é o mais próximo.
 *
 *   npx tsx scripts/verificar-filtro-pacientes.ts
 */
import { Attendance, Patient } from '../src/types';
import {
  diaDoAgendamento,
  filtrarLinhas,
  montarLinhasDePacientes,
  ordenarPorAgendamento,
} from '../src/utils/patientsPanel';

let falhas = 0;
const ok = (nome: string, condicao: boolean, extra = '') => {
  console.log(`${condicao ? '  ok  ' : ' FALHA'}  ${nome}${extra ? `  — ${extra}` : ''}`);
  if (!condicao) falhas++;
};

const HOJE = '2026-11-01'; // um domingo

const paciente = (id: string, nome: string): Patient => ({
  id,
  nome,
  contato: '(19) 99999-0000',
  createdAt: '2026-01-01T12:00:00Z',
});

let seq = 0;
const visita = (p: Patient, data: string, extra: Partial<Attendance> = {}): Attendance => ({
  id: `att-${++seq}`,
  pacienteId: p.id,
  pacienteNome: p.nome,
  data,
  procedimentoNome: 'Botox',
  createdAt: '2026-01-01T12:00:00Z',
  ...extra,
});

const ana = paciente('pat-1', 'Ana Souza');
const bia = paciente('pat-2', 'Bia Lima');
const cris = paciente('pat-3', 'Cris Rocha');
const dani = paciente('pat-4', 'Dani Alves');
const eva = paciente('pat-5', 'Eva Martins');

const atendimentos: Attendance[] = [
  // Ana: atendida duas vezes e com dois horários marcados — o mais próximo é o de terça.
  visita(ana, '2026-09-10'),
  visita(ana, '2026-10-20', { procedimentoNome: 'Preenchimento labial' }),
  visita(ana, '2026-11-20', { status: 'agendado', hora: '10:00' }),
  visita(ana, '2026-11-03', { status: 'agendado', hora: '14:30', procedimentoNome: 'Laser' }),
  // Bia: nunca atendida, horário hoje — ainda conta, o dia não acabou.
  visita(bia, HOJE, { status: 'agendado', hora: '18:00' }),
  // Cris: só um agendamento de ontem que ninguém resolveu — trabalho represado, não horário.
  visita(cris, '2026-10-31', { status: 'agendado', hora: '09:00' }),
  // Dani: compareceu (conta como atendimento) e tem uma falta e uma remarcação no futuro.
  visita(dani, '2026-10-05', { status: 'compareceu' }),
  visita(dani, '2026-11-10', { status: 'faltou' }),
  visita(dani, '2026-11-12', { status: 'remarcado' }),
  // Eva: dois horários no mesmo dia — ganha o mais cedo.
  visita(eva, '2026-11-05', { status: 'agendado', hora: '16:00' }),
  visita(eva, '2026-11-05', { status: 'agendado', hora: '08:30' }),
  // Fernanda não tem cadastro: só um orçamento avulso e um horário marcado pelo nome.
  {
    id: 'att-fer',
    pacienteId: 'pat-inexistente',
    pacienteNome: 'Fernanda Dias',
    data: '2026-11-02',
    hora: '11:00',
    procedimentoNome: 'Limpeza de pele',
    status: 'agendado',
    createdAt: '2026-10-01T12:00:00Z',
  },
];

const linhas = montarLinhasDePacientes({
  patients: [ana, bia, cris, dani, eva],
  records: [],
  quotes: [
    {
      id: 'q-1',
      pacienteNome: 'Fernanda Dias',
      dataEmissao: '2026-10-01',
    } as never,
  ],
  atendimentos,
  hoje: HOJE,
});
const linha = (nome: string) => linhas.find((l) => l.nome === nome)!;

console.log('\nPróximo agendamento');
ok('Ana: o mais próximo, não o primeiro gravado', linha('Ana Souza').proximoAgendamento?.data === '2026-11-03');
ok('Ana: leva hora e procedimento', linha('Ana Souza').proximoAgendamento?.hora === '14:30' &&
  linha('Ana Souza').proximoAgendamento?.procedimento === 'Laser');
ok('Bia: horário de hoje conta', linha('Bia Lima').proximoAgendamento?.data === HOJE);
ok('Cris: agendamento de ontem sem desfecho não conta', !linha('Cris Rocha').proximoAgendamento);
ok('Dani: falta e remarcação não são horário marcado', !linha('Dani Alves').proximoAgendamento);
ok('Eva: no mesmo dia, ganha o mais cedo', linha('Eva Martins').proximoAgendamento?.hora === '08:30');
ok('Fernanda (sem cadastro): o horário chega pela linha do nome',
  linha('Fernanda Dias')?.proximoAgendamento?.data === '2026-11-02');

console.log('\nHistórico de atendimento');
ok('Ana: 2 atendimentos — os agendamentos não contam', linha('Ana Souza').totalAtendimentos === 2,
  String(linha('Ana Souza').totalAtendimentos));
ok('Ana: o último é o de outubro', linha('Ana Souza').ultimoAtendimento?.data === '2026-10-20' &&
  linha('Ana Souza').ultimoAtendimento?.procedimento === 'Preenchimento labial');
ok('Bia: só agendada, sem atendimento', linha('Bia Lima').totalAtendimentos === 0 && !linha('Bia Lima').ultimoAtendimento);
ok('Dani: "compareceu" conta como atendimento', linha('Dani Alves').totalAtendimentos === 1);
ok('Agendamento não vira "última interação"', linha('Bia Lima').ultimaInteracao === undefined);

console.log('\nFiltro');
const nomes = (ls: typeof linhas) => ls.map((l) => l.nome.split(' ')[0]).sort().join(',');
ok('Todas: todo mundo', filtrarLinhas(linhas, 'todas').length === linhas.length);
ok('Com atendimento: Ana e Dani', nomes(filtrarLinhas(linhas, 'com_atendimento')) === 'Ana,Dani',
  nomes(filtrarLinhas(linhas, 'com_atendimento')));
ok('Com agendamento: Ana, Bia, Eva e Fernanda',
  nomes(filtrarLinhas(linhas, 'com_agendamento')) === 'Ana,Bia,Eva,Fernanda',
  nomes(filtrarLinhas(linhas, 'com_agendamento')));
const ordem = ordenarPorAgendamento(filtrarLinhas(linhas, 'com_agendamento')).map((l) => l.nome.split(' ')[0]);
ok('Com agendamento: o horário mais próximo primeiro', ordem.join(',') === 'Bia,Fernanda,Ana,Eva', ordem.join(','));

console.log('\nRótulo do dia');
ok('hoje', diaDoAgendamento(HOJE, HOJE) === 'Hoje');
ok('amanhã', diaDoAgendamento('2026-11-02', HOJE) === 'Amanhã');
ok('dia da semana e data', diaDoAgendamento('2026-11-05', HOJE) === 'qui, 05/11', diaDoAgendamento('2026-11-05', HOJE));
ok('virada de ano: amanhã', diaDoAgendamento('2027-01-01', '2026-12-31') === 'Amanhã');
ok('outro ano leva o ano', diaDoAgendamento('2027-01-06', HOJE) === 'qua, 06/01/27', diaDoAgendamento('2027-01-06', HOJE));

console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);

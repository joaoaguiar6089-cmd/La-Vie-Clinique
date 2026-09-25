/**
 * Confere a linha do tempo da clínica (tela Hoje): o que entra, em que período, em que ordem, e
 * o que a busca e o filtro por tipo encontram.
 *
 * O erro que este script caça é o silencioso: um agendamento que aparece como se tivesse
 * acontecido, um item de ontem que some do "Hoje" por causa de fuso, uma paciente com acento que
 * a busca sem acento não acha.
 *
 *   npx tsx scripts/verificar-linha-do-tempo.ts
 */
import { AnamnesisRecord, Attendance, EvaluationRecord, Quote } from '../src/types';
import {
  agruparPorDia,
  atendimentoEntraNaLinha,
  contarPorTipo,
  corteDaLinha,
  linhaDaClinica,
} from '../src/utils/linhaDoTempoClinica';

let falhas = 0;
const ok = (nome: string, condicao: boolean, extra = '') => {
  console.log(`${condicao ? '  ok  ' : ' FALHA'}  ${nome}${extra ? `  — ${extra}` : ''}`);
  if (!condicao) falhas++;
};

const HOJE = '2026-09-25';
const dia = (n: number): string => {
  const d = new Date(`${HOJE}T12:00:00`);
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const atd = (id: string, data: string, extra: Partial<Attendance> = {}): Attendance => ({
  id,
  pacienteId: 'p1',
  pacienteNome: 'Ana Lúcia',
  data,
  procedimentoNome: 'Botox',
  createdAt: data,
  ...extra,
});

const atendimentos: Attendance[] = [
  atd('realizado-hoje', HOJE, { hora: '10:00' }),
  atd('compareceu-ontem', dia(1), { status: 'compareceu', hora: '15:00' }),
  atd('faltou', dia(2), { status: 'faltou' }),
  atd('agendado-hoje', HOJE, { status: 'agendado', hora: '17:00' }),
  atd('remarcado', dia(3), { status: 'remarcado' }),
  atd('futuro', dia(-5)),
  atd('antigo', dia(40)),
];

const anamneses = [
  {
    id: 'an1',
    pacienteId: 'p2',
    pacienteNome: 'Bruna',
    procedimentoNome: 'Depilação a Laser',
    // Horário local, sem "Z": o teste não pode depender do fuso de quem roda.
    dataAtendimento: dia(1),
    createdAt: `${dia(1)}T13:00:00`,
  },
] as unknown as AnamnesisRecord[];

const orcamentos = [
  {
    id: 'q1',
    numero: '2026-0148',
    status: 'enviado',
    pacienteNome: 'Carla',
    dataEmissao: `${dia(6)}T15:00:00.000Z`,
    createdAt: `${dia(6)}T15:00:00.000Z`,
    itens: [{ titulo: 'Bioestimulador' }],
    total: 1500,
  },
] as unknown as Quote[];

const avaliacoes = [
  {
    id: 'av1',
    pacienteId: 'p1',
    pacienteNome: 'Ana Lúcia',
    procedimentoNome: 'Preenchimento labial',
    dataAtendimento: dia(10),
    createdAt: `${dia(10)}T12:00:00.000Z`,
    respostas: {},
    perguntasSnapshot: [],
    preenchidoEm: dia(10),
  },
] as unknown as EvaluationRecord[];

const dados = { atendimentos, anamneses, orcamentos, avaliacoes };
const ids = (itens: { id: string }[]) => itens.map((i) => i.id);

console.log('== quem entra');
ok('realizado de hoje entra', atendimentoEntraNaLinha(atendimentos[0], HOJE));
ok('compareceu entra', atendimentoEntraNaLinha(atendimentos[1], HOJE));
ok('faltou entra (com selo)', atendimentoEntraNaLinha(atendimentos[2], HOJE));
ok('agendado fica de fora', !atendimentoEntraNaLinha(atendimentos[3], HOJE));
ok('remarcado fica de fora', !atendimentoEntraNaLinha(atendimentos[4], HOJE));
ok('data futura fica de fora', !atendimentoEntraNaLinha(atendimentos[5], HOJE));

console.log('== períodos');
const hoje = linhaDaClinica(dados, { dias: 1 }, HOJE);
ok('"Hoje" só tem o de hoje', ids(hoje).join() === 'realizado-hoje', ids(hoje).join());
const sete = linhaDaClinica(dados, { dias: 7 }, HOJE);
ok(
  '7 dias vai até 6 dias atrás',
  ids(sete).includes('q1') && !ids(sete).includes('av1'),
  ids(sete).join()
);
const trinta = linhaDaClinica(dados, { dias: 30 }, HOJE);
ok('30 dias alcança a avaliação de 10 dias atrás', ids(trinta).includes('av1'));
ok('30 dias não alcança o de 40 dias atrás', !ids(trinta).includes('antigo'));
ok('o corte das consultas é o de 30 dias', corteDaLinha(HOJE) === dia(29), corteDaLinha(HOJE));

console.log('== ordem');
ok('mais recente primeiro', trinta[0].id === 'realizado-hoje' && trinta[trinta.length - 1].id === 'av1');
const grupos = agruparPorDia(trinta, HOJE);
ok('primeiro grupo é "Hoje"', grupos[0].rotulo === 'Hoje');
ok('segundo grupo é "Ontem"', grupos[1].rotulo === 'Ontem');
ok(
  'ontem: atendimento das 15h antes da anamnese das 13h do mesmo dia',
  grupos[1].itens[0].id === 'compareceu-ontem',
  ids(grupos[1].itens).join()
);

console.log('== busca e tipo');
ok('busca sem acento acha "Ana Lúcia"', linhaDaClinica(dados, { dias: 30, busca: 'ana lucia' }, HOJE).length === 4);
ok('busca pelo procedimento', ids(linhaDaClinica(dados, { dias: 30, busca: 'laser' }, HOJE)).join() === 'an1');
ok('busca pelo número do orçamento', ids(linhaDaClinica(dados, { dias: 30, busca: '0148' }, HOJE)).join() === 'q1');
ok('busca pelo item do orçamento', ids(linhaDaClinica(dados, { dias: 30, busca: 'bioestim' }, HOJE)).join() === 'q1');
ok(
  'filtro por tipo',
  ids(linhaDaClinica(dados, { dias: 30, tipos: ['orcamento', 'avaliacao'] }, HOJE)).join() === 'q1,av1'
);
const contagem = contarPorTipo(trinta);
ok(
  'contagem por tipo',
  contagem.atendimento === 3 && contagem.orcamento === 1 && contagem.anamnese === 1 && contagem.avaliacao === 1,
  JSON.stringify(contagem)
);

console.log(falhas === 0 ? '\nTUDO OK' : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);

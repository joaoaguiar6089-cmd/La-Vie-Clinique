/**
 * Confere as regras de uma visita com mais de um procedimento — "Botox + Preenchimento labial"
 * num horário só.
 *
 * O erro que este script caça é o do registro antigo: todo atendimento gravado antes da lista de
 * procedimentos adicionais precisa continuar exatamente como era — o mesmo nome, a mesma duração,
 * o mesmo plano. E, na visita nova, nenhum procedimento pode sumir de onde a visita aparece: a
 * duração soma, cada plano conta a sessão, a mensagem e o link citam todos.
 *
 *   npx tsx scripts/verificar-varios-procedimentos.ts
 */
import { Attendance, ClinicProfile, ConsumoPadrao, Procedure, ProdutoDeEstoque, SessionPlan } from '../src/types';
import {
  montarHistorico,
  nomeDosProcedimentos,
  nomeDosProcedimentosPorExtenso,
  pertenceAoPlano,
  planosDoAtendimento,
  procedimentosDoAtendimento,
} from '../src/utils/attendances';
import {
  AGENDA_DEFAULTS,
  conflitosDe,
  duracaoDoAtendimento,
  mensagemDeConfirmacao,
  orientacoesDoAtendimento,
} from '../src/utils/agenda';
import { mensagemDoLink, montarSnapshotDoLink } from '../src/utils/agendamentoLink';
import { eventoDoAtendimento } from '../src/utils/googleAgenda';
import { materiaisSugeridosDaVisita } from '../src/utils/estoque';
import { anamnesesAFechar } from '../src/utils/evaluations';

let falhas = 0;
const ok = (nome: string, condicao: boolean, extra = '') => {
  console.log(`${condicao ? '  ok  ' : ' FALHA'}  ${nome}${extra ? `  — ${extra}` : ''}`);
  if (!condicao) falhas++;
};

const proc = (id: string, title: string, extra: Partial<Procedure> = {}): Procedure => ({
  id,
  title,
  category: 'Facial',
  description: `Descrição de ${title}.`,
  price: 100,
  images: [],
  benefits: [],
  order: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...extra,
});

const CATALOGO: Procedure[] = [
  proc('botox', 'Botox', { duration: '30 min', orientacoesPreProcedimento: 'Não deitar por 4 horas.' }),
  proc('preench', 'Preenchimento labial', {
    duration: '45 min',
    orientacoesPreProcedimento: 'Evite anti-inflamatório.',
  }),
  proc('laser', 'Depilação a Laser', { duration: '1h' }),
];

const atd = (extra: Partial<Attendance> = {}): Attendance => ({
  id: 'atd-1',
  pacienteId: 'p1',
  pacienteNome: 'Maria Aparecida',
  data: '2026-11-10',
  hora: '10:00',
  procedureId: 'botox',
  procedimentoNome: 'Botox',
  professionalId: 'dra-k',
  profissionalNome: 'Dra. Karoline',
  status: 'agendado',
  createdAt: '2026-10-28T10:00:00.000Z',
  ...extra,
});

const CLINICA: ClinicProfile = {
  name: 'La Vie',
  tagline: '',
  professionals: [],
  phone: '',
  instagram: '',
  address: 'Rua A, 1',
  cityState: 'São Paulo/SP',
  agendaConfirmacaoIncluirOrientacoes: true,
};

// ---------------------------------------------------------------------------------------------
console.log('\nRegistro antigo (um procedimento só)');
const antigo = atd({ planoId: 'plano-botox' });
ok('lista tem só o principal', procedimentosDoAtendimento(antigo).length === 1);
ok('nome igual ao de sempre', nomeDosProcedimentos(antigo) === 'Botox');
ok('nome por extenso igual', nomeDosProcedimentosPorExtenso(antigo) === 'Botox');
ok('duração do catálogo', duracaoDoAtendimento(antigo, CATALOGO) === 30);
ok('plano do principal', planosDoAtendimento(antigo).join() === 'plano-botox');
ok(
  'sem procedimento no catálogo cai no padrão',
  duracaoDoAtendimento(atd({ procedureId: undefined, procedimentoNome: 'Retorno' }), CATALOGO) ===
    AGENDA_DEFAULTS.duracaoMin
);
ok(
  'título do Google igual ao de sempre',
  eventoDoAtendimento(antigo, CATALOGO, CLINICA)?.titulo === 'Maria Aparecida · Botox'
);
ok(
  'orientações sem cabeçalho por procedimento',
  orientacoesDoAtendimento(antigo, CATALOGO) === 'Antes de vir:\nNão deitar por 4 horas.'
);

// ---------------------------------------------------------------------------------------------
console.log('\nVisita com três procedimentos');
const varios = atd({
  planoId: 'plano-botox',
  procedimentosAdicionais: [
    { procedureId: 'preench', procedimentoNome: 'Preenchimento labial' },
    { procedureId: 'laser', procedimentoNome: 'Depilação a Laser', planoId: 'plano-laser' },
  ],
});
ok('lista na ordem, principal primeiro', procedimentosDoAtendimento(varios).map((p) => p.procedureId).join() === 'botox,preench,laser');
ok('nome para o cartão', nomeDosProcedimentos(varios) === 'Botox + Preenchimento labial + Depilação a Laser');
ok(
  'nome para a frase',
  nomeDosProcedimentosPorExtenso(varios) === 'Botox, Preenchimento labial e Depilação a Laser'
);
ok('duração soma o catálogo', duracaoDoAtendimento(varios, CATALOGO) === 30 + 45 + 60);
ok('duração digitada vence a soma', duracaoDoAtendimento({ ...varios, duracaoMin: 50 }, CATALOGO) === 50);
ok('dois planos', planosDoAtendimento(varios).join() === 'plano-botox,plano-laser');
ok('pertence ao plano do adicional', pertenceAoPlano(varios, 'plano-laser'));
ok('não pertence a plano alheio', !pertenceAoPlano(varios, 'plano-x'));

const evento = eventoDoAtendimento(varios, CATALOGO, CLINICA);
ok('título do Google com todos', evento?.titulo === 'Maria Aparecida · Botox + Preenchimento labial + Depilação a Laser');
const minutosDoEvento = evento
  ? (Date.parse(`${evento.fim}Z`) - Date.parse(`${evento.inicio}Z`)) / 60000
  : 0;
ok('evento do Google dura a soma', minutosDoEvento === 135, `${minutosDoEvento} min`);

const mensagem = mensagemDeConfirmacao(CLINICA, varios, CATALOGO);
ok('confirmação cita todos', mensagem.includes('Botox, Preenchimento labial e Depilação a Laser'), mensagem.split('\n')[0]);
ok(
  'orientações de cada um, com o nome em cima',
  mensagem.includes('Botox:\nNão deitar por 4 horas.') &&
    mensagem.includes('Preenchimento labial:\nEvite anti-inflamatório.')
);
ok('laser sem orientação não aparece', !mensagem.includes('Depilação a Laser:'));

const snapshot = montarSnapshotDoLink(varios, CLINICA, CATALOGO);
ok('link: título com todos', snapshot.procedimento.titulo === 'Botox + Preenchimento labial + Depilação a Laser');
ok('link: sem descrição de um só', snapshot.procedimento.descricao === undefined);
ok('link: sem duração de um só', snapshot.procedimento.duracaoTexto === undefined);
ok('link: duração somada', snapshot.duracaoMin === 135);
ok('link: orientações sem o "Antes de vir" da mensagem', !!snapshot.procedimento.orientacoes && !snapshot.procedimento.orientacoes.startsWith('Antes de vir'));
const snapshotUm = montarSnapshotDoLink(antigo, CLINICA, CATALOGO);
ok('link de um só mantém a descrição', snapshotUm.procedimento.descricao === 'Descrição de Botox.');
ok('link de um só mantém a duração', snapshotUm.procedimento.duracaoTexto === '30 min');
ok(
  'mensagem do link cita todos',
  mensagemDoLink(CLINICA, varios, 'https://x').includes('— Botox, Preenchimento labial e Depilação a Laser.')
);

ok(
  'adicional sem nome é ignorado',
  nomeDosProcedimentos(atd({ procedimentosAdicionais: [{ procedimentoNome: '  ' }] })) === 'Botox'
);

// ---------------------------------------------------------------------------------------------
console.log('\nConflito de horário usa a duração somada');
const outra = atd({ id: 'atd-2', hora: '11:30', procedimentosAdicionais: undefined, planoId: undefined });
ok(
  'botox sozinho (10:00–10:30) não bate com 11:30',
  conflitosDe({ data: varios.data, hora: '10:00', procedureId: 'botox', professionalId: 'dra-k' }, [outra], CATALOGO).length === 0
);
ok(
  'os três (10:00–12:15) batem com 11:30',
  conflitosDe(
    {
      data: varios.data,
      hora: '10:00',
      procedureId: 'botox',
      procedimentosAdicionais: varios.procedimentosAdicionais,
      professionalId: 'dra-k',
    },
    [outra],
    CATALOGO
  ).length === 1
);

// ---------------------------------------------------------------------------------------------
console.log('\nPlanos na ficha da paciente');
const plano = (id: string, procedureId: string, nome: string): SessionPlan => ({
  id,
  pacienteId: 'p1',
  procedureId,
  procedimentoNome: nome,
  totalSessoes: 10,
  createdAt: '2026-01-01T00:00:00.000Z',
});
const planos = [plano('plano-botox', 'botox', 'Botox'), plano('plano-laser', 'laser', 'Depilação a Laser')];
const avulsa = atd({ id: 'atd-3', data: '2026-10-01', planoId: undefined, status: undefined });
const historico = montarHistorico([varios, avulsa], planos);
const doPlano = (id: string) =>
  historico.find((l) => l.tipo === 'plano' && l.plano.id === id) as
    | Extract<(typeof historico)[number], { tipo: 'plano' }>
    | undefined;
ok('a visita aparece no plano do botox', !!doPlano('plano-botox')?.atendimentos.some((a) => a.id === 'atd-1'));
ok('e também no plano do laser', !!doPlano('plano-laser')?.atendimentos.some((a) => a.id === 'atd-1'));
ok('a avulsa continua avulsa', historico.some((l) => l.tipo === 'avulso' && l.atendimento.id === 'atd-3'));
ok(
  'plano excluído: a visita não some',
  montarHistorico([varios], [planos[1]]).some((l) => l.tipo === 'plano' && l.atendimentos.some((a) => a.id === 'atd-1'))
);
ok(
  'sem plano nenhum existente vira avulsa',
  montarHistorico([varios], []).some((l) => l.tipo === 'avulso' && l.atendimento.id === 'atd-1')
);

// ---------------------------------------------------------------------------------------------
console.log('\nMateriais sugeridos somam os procedimentos');
const produto = (id: string, nome: string): ProdutoDeEstoque => ({
  id,
  nome,
  unidade: 'un',
  custoUnitario: 10,
  valorCliente: 20,
  createdAt: '2026-01-01T00:00:00.000Z',
});
const produtos = [produto('luva', 'Luva'), produto('toxina', 'Toxina'), produto('acido', 'Ácido hialurônico')];
const consumos: ConsumoPadrao[] = [
  { id: 'botox', procedureId: 'botox', itens: [{ produtoId: 'luva', quantidade: 2 }, { produtoId: 'toxina', quantidade: 20 }] },
  { id: 'preench', procedureId: 'preench', itens: [{ produtoId: 'luva', quantidade: 2 }, { produtoId: 'acido', quantidade: 1 }] },
] as ConsumoPadrao[];
const materiais = materiaisSugeridosDaVisita(varios, consumos, produtos, CATALOGO);
ok('uma linha por produto', materiais.length === 3, materiais.map((m) => `${m.nome}×${m.quantidade}`).join(', '));
ok('luva somada dos dois', materiais.find((m) => m.produtoId === 'luva')?.quantidade === 4);
ok('registro antigo sugere só o dele', materiaisSugeridosDaVisita(antigo, consumos, produtos, CATALOGO).length === 2);

// ---------------------------------------------------------------------------------------------
console.log('\nAnamnese de qualquer procedimento da visita fecha');
const ficha = (procedimentoId: string, procedimentoNome: string) =>
  ({
    id: `ficha-${procedimentoId}`,
    pacienteId: 'p1',
    procedimentoId,
    procedimentoNome,
    createdAt: '2026-09-01T00:00:00.000Z',
  }) as unknown as Parameters<typeof anamnesesAFechar>[1][number];
const realizada = { ...varios, data: '2026-10-01', status: 'compareceu' as const };
const fechadas = anamnesesAFechar(realizada, [ficha('preench', 'Preenchimento labial'), ficha('outro', 'Peeling')]);
ok('fecha a do adicional', fechadas.some((f) => f.id === 'ficha-preench'));
ok('não fecha a de outro tratamento', !fechadas.some((f) => f.id === 'ficha-outro'));

console.log(falhas === 0 ? '\nTudo certo.' : `\n${falhas} falha(s).`);
if (falhas > 0) process.exit(1);

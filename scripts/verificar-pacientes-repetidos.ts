/**
 * Confere a detecção de cadastros repetidos e a junção de dois cadastros num só.
 *
 * Existe porque os dois erros custam caro e ninguém os vê acontecer: deixar de apontar as duas
 * Heloíses deixa a clínica com o histórico partido ao meio; apontar a Larissa Souza e a Larissa
 * Lima como a mesma pessoa convida a juntar duas clientes. E a junção precisa mover exatamente o
 * que a página da paciente mostra — nem o orçamento da homônima, nem deixar o avulso para trás.
 *
 *   npx tsx scripts/verificar-pacientes-repetidos.ts
 */
import { AnamnesisRecord, Attendance, Patient, Quote, Recibo, SessionPlan } from '../src/types';
import { LinhaDePaciente, montarLinhasDePacientes, pertenceA } from '../src/utils/patientsPanel';
import {
  cadastrosParecidos,
  chavePar,
  motivoDeRepeticao,
  nomeCombina,
  paresRepetidos,
} from '../src/utils/pacientesRepetidos';
import {
  camposEmConflito,
  dadosJuntados,
  escolhasIniciais,
  planejarReapontamento,
  principalDaJuncao,
} from '../src/utils/juncaoDePacientes';

let falhas = 0;
const ok = (nome: string, condicao: boolean, extra = '') => {
  console.log(`${condicao ? '  ok  ' : ' FALHA'}  ${nome}${extra ? `  — ${extra}` : ''}`);
  if (!condicao) falhas++;
};

const paciente = (id: string, nome: string, extra: Partial<Patient> = {}): Patient => ({
  id,
  nome,
  createdAt: '2026-01-01T12:00:00.000Z',
  ...extra,
});

const linha = (p: Patient, extra: Partial<LinhaDePaciente> = {}): LinhaDePaciente => ({
  id: p.id,
  nome: p.nome,
  contato: p.contato,
  patient: p,
  totalAnamneses: 0,
  totalOrcamentos: 0,
  totalAtendimentos: 0,
  ...extra,
});

console.log('\nMotivo de repetição');
ok('Heloíse e Heloise: mesmo nome', motivoDeRepeticao({ nome: 'Heloíse' }, { nome: 'heloise ' }) === 'nome');
ok(
  'espaço repetido não conta',
  motivoDeRepeticao({ nome: 'Heloíse  Martins' }, { nome: 'Heloise Martins' }) === 'nome'
);
ok(
  'Heloíse e Heloíse Martins: nome parecido',
  motivoDeRepeticao({ nome: 'Heloíse' }, { nome: 'Heloíse Martins' }) === 'nome_parecido'
);
ok(
  'Larisa e Larissa: nome parecido',
  motivoDeRepeticao({ nome: 'Larisa' }, { nome: 'Larissa' }) === 'nome_parecido'
);
ok(
  'Larisa e Larissa Souza: nome parecido',
  motivoDeRepeticao({ nome: 'Larisa' }, { nome: 'Larissa Souza' }) === 'nome_parecido'
);
ok(
  'Maria da Silva e Maria Silva: partícula não conta',
  motivoDeRepeticao({ nome: 'Maria da Silva' }, { nome: 'Maria Silva' }) === 'nome_parecido'
);
ok(
  'Larissa Souza e Larissa Lima: pessoas diferentes',
  motivoDeRepeticao({ nome: 'Larissa Souza' }, { nome: 'Larissa Lima' }) === null
);
ok('Ana e Ane: curtas demais para letra trocada', motivoDeRepeticao({ nome: 'Ana' }, { nome: 'Ane' }) === null);
ok(
  'Heloíse M. e Heloíse Martins: a inicial conta',
  motivoDeRepeticao({ nome: 'Heloíse M.' }, { nome: 'Heloíse Martins' }) === 'nome_parecido'
);
ok(
  'Heloíse M. e Heloíse Lima: a inicial não bate',
  motivoDeRepeticao({ nome: 'Heloíse M.' }, { nome: 'Heloíse Lima' }) === null
);
ok(
  'mesmo celular com +55, DDD e máscara',
  motivoDeRepeticao(
    { nome: 'Heloíse', contato: '+55 (19) 99123-4567' },
    { nome: 'Helô', contato: '991234567' }
  ) === 'telefone'
);
ok(
  'mesmo celular sem o nono dígito',
  motivoDeRepeticao({ nome: 'A', contato: '(19) 9123-4567' }, { nome: 'B', contato: '19991234567' }) ===
    'telefone'
);
ok(
  'telefone curto não compara',
  motivoDeRepeticao({ nome: 'A', contato: '1234' }, { nome: 'B', contato: '1234' }) === null
);
ok(
  'mesmo CPF com e sem máscara',
  motivoDeRepeticao({ nome: 'A', cpf: '123.456.789-09' }, { nome: 'B', cpf: '12345678909' }) === 'cpf'
);
ok(
  'CPF ganha do nome',
  motivoDeRepeticao({ nome: 'Heloíse', cpf: '12345678909' }, { nome: 'Heloise', cpf: '12345678909' }) ===
    'cpf'
);

console.log('\nBusca por nome');
ok('"heloise" acha "Heloíse Martins"', nomeCombina('heloise', 'Heloíse Martins'));
ok('"heloise mar" acha "Heloíse Martins"', nomeCombina('heloise mar', 'Heloíse Martins'));
ok('"HELO" acha "Heloíse"', nomeCombina('HELO', 'Heloíse'));
ok('"martins" acha "Heloíse Martins"', nomeCombina('martins', 'Heloíse Martins'));
ok('"issa" acha "Larissa", como a busca antiga', nomeCombina('issa', 'Larissa'));
ok('"heloise s" não acha "Heloíse Martins"', !nomeCombina('heloise s', 'Heloíse Martins'));
ok('"heloise lima" não acha "Heloíse Martins"', !nomeCombina('heloise lima', 'Heloíse Martins'));
ok('termo vazio acha todo mundo', nomeCombina('  ', 'Qualquer'));

console.log('\nPares repetidos da lista');
const heloise1 = paciente('pat-1', 'Heloíse Martins', { contato: '(19) 99123-4567' });
const heloise2 = paciente('pat-2', 'Heloise', { contato: '19 991234567' });
const larissa1 = paciente('pat-3', 'Larissa Souza', { cpf: '12345678909' });
const larissa2 = paciente('pat-4', 'Larissa', { cpf: '123.456.789-09' });
const larissaLima = paciente('pat-5', 'Larissa Lima');
const bruna = paciente('pat-6', 'Bruna Carvalho');
const linhas = [heloise1, heloise2, larissa1, larissa2, larissaLima, bruna].map((p) => linha(p));
const pares = paresRepetidos(linhas);
const temPar = (a: string, b: string) => pares.some((p) => p.chave === chavePar(a, b));
ok('as duas Heloíses aparecem', temPar('pat-1', 'pat-2'));
ok('as duas Larissas (mesmo CPF) aparecem', temPar('pat-3', 'pat-4'));
ok('pelo motivo mais forte', pares.find((p) => p.chave === chavePar('pat-3', 'pat-4'))?.motivo === 'cpf');
ok('Larissa (sem sobrenome) e Larissa Lima: nome parecido', temPar('pat-4', 'pat-5'));
ok('Larissa Souza e Larissa Lima não', !temPar('pat-3', 'pat-5'));
ok('Bruna não aparece', !pares.some((p) => p.a.id === 'pat-6' || p.b.id === 'pat-6'));
ok('o mais forte vem primeiro', pares[0]?.motivo === 'cpf', pares.map((p) => p.motivo).join(', '));
const semDescartado = paresRepetidos(linhas, new Set([chavePar('pat-5', 'pat-4')]));
ok('par descartado não volta (a chave vale nos dois sentidos)', !semDescartado.some((p) => p.chave === chavePar('pat-4', 'pat-5')));
ok('os outros pares continuam', semDescartado.some((p) => p.chave === chavePar('pat-1', 'pat-2')));
const avulsa: LinhaDePaciente = {
  id: 'pat-heloise-m',
  nome: 'Heloise M.',
  pendencia: 'sem_cadastro',
  totalAnamneses: 0,
  totalOrcamentos: 1,
  totalAtendimentos: 0,
};
ok(
  'o "sem cadastro" também entra',
  paresRepetidos([linha(heloise1), avulsa]).some((p) => p.chave === chavePar('pat-1', 'pat-heloise-m'))
);

console.log('\nAviso na hora de cadastrar');
const todas = [heloise1, heloise2, larissa1, larissa2, larissaLima, bruna];
ok(
  'digitar "Heloise" avisa das duas Heloíses',
  cadastrosParecidos({ nome: 'Heloise' }, todas).map((c) => c.patient.id).sort().join() === 'pat-1,pat-2'
);
ok(
  'o mesmo telefone avisa mesmo com outro nome',
  cadastrosParecidos({ nome: 'Helô', contato: '91234567' }, todas)[0]?.motivo === 'telefone'
);
ok('nome em branco não avisa', cadastrosParecidos({ nome: ' ' }, todas).length === 0);
ok('"Bruna Carvalho" não avisa de si mesma', cadastrosParecidos({ nome: 'Bruna Carvalho' }, todas, 'pat-6').length === 0);

console.log('\nQual cadastro fica');
ok(
  'quem tem cadastro ganha de quem só tem nome',
  principalDaJuncao(avulsa, linha(heloise2))[0].id === 'pat-2'
);
ok(
  'entre dois cadastros, o de mais histórico',
  principalDaJuncao(linha(heloise1), linha(heloise2, { totalAtendimentos: 3 }))[0].id === 'pat-2'
);
ok(
  'empatado, o mais antigo',
  principalDaJuncao(
    linha(paciente('a', 'X', { createdAt: '2026-03-01' })),
    linha(paciente('b', 'X', { createdAt: '2025-11-01' }))
  )[0].id === 'b'
);

console.log('\nDados juntados');
const principal = paciente('pat-1', 'Heloise', {
  contato: '(19) 99123-4567',
  email: 'heloise@email.com',
  observacoes: 'Alergia a dipirona',
  angulosAntesDepois: [{ id: 'frente', nome: 'Frente' }],
  createdAt: '2026-02-01T12:00:00.000Z',
});
const outro = paciente('pat-2', 'Heloíse Martins', {
  contato: '19 99123 4567',
  cpf: '12345678909',
  dataNascimento: '1990-05-10',
  email: 'HELOISE@email.com',
  observacoes: 'Prefere manhã',
  angulosAntesDepois: [
    { id: 'frente', nome: 'Frente (repetido)' },
    { id: 'perfil', nome: 'Perfil' },
  ],
  createdAt: '2025-10-01T12:00:00.000Z',
});
ok(
  'só o nome está em conflito (telefone e e-mail são o mesmo escrito diferente)',
  camposEmConflito(principal, outro).join() === 'nome'
);
ok('o nome sugerido é o mais completo', escolhasIniciais(principal, outro).nome === 'outro');
ok(
  'Heloise e Heloíse: sugere o acentuado',
  escolhasIniciais(paciente('a', 'Heloise'), paciente('b', 'Heloíse')).nome === 'outro'
);
const juntado = dadosJuntados(principal, outro, { nome: 'outro' });
ok('fica o id do principal', juntado.id === 'pat-1');
ok('o nome vem da escolha', juntado.nome === 'Heloíse Martins');
ok('o CPF que só o outro tinha vem junto', juntado.cpf === '12345678909');
ok('o nascimento que só o outro tinha vem junto', juntado.dataNascimento === '1990-05-10');
ok('o telefone fica o do principal', juntado.contato === '(19) 99123-4567');
ok('as observações se somam', juntado.observacoes === 'Alergia a dipirona\n\nPrefere manhã');
ok(
  'os ângulos se somam sem repetir',
  (juntado.angulosAntesDepois || []).map((a) => a.id).join() === 'frente,perfil'
);
ok('"paciente desde" é o mais antigo', juntado.createdAt === '2025-10-01T12:00:00.000Z');
ok(
  'a escolha pelo principal vale mesmo quando o outro tem valor',
  dadosJuntados(paciente('a', 'A', { cpf: '11111111111' }), paciente('b', 'B', { cpf: '22222222222' }), {
    cpf: 'principal',
  }).cpf === '11111111111'
);
ok(
  'escolher um lado vazio não apaga o valor do outro',
  dadosJuntados(paciente('a', 'A'), paciente('b', 'B', { email: 'b@x.com' }), { email: 'principal' }).email ===
    'b@x.com'
);

console.log('\nO que a junção move');
const ficha = (id: string, pacienteId: string, pacienteNome: string) =>
  ({ id, pacienteId, pacienteNome }) as AnamnesisRecord;
const orcamento = (id: string, pacienteNome: string, pacienteId?: string) =>
  ({ id, pacienteId, pacienteNome }) as Quote;
const atendimento = (id: string, pacienteId: string, pacienteNome: string) =>
  ({ id, pacienteId, pacienteNome }) as Attendance;
const recibo = (id: string, pacienteNome: string, pacienteId?: string) =>
  ({ id, pacienteId, pacienteNome }) as Recibo;
const planoDeSessoes = (id: string, pacienteId: string) => ({ id, pacienteId }) as SessionPlan;

// "Heloíse Martins" homônima de outra cadastrada, para conferir que a junção não a leva junto.
const homonima = paciente('pat-9', 'Heloise');
const ids = new Set(['pat-1', 'pat-2', 'pat-9']);
ok(
  'pertenceA: por id, e o avulso pelo nome',
  pertenceA(outro, ids)(ficha('f', 'pat-2', 'qualquer')) &&
    pertenceA(outro, ids)(orcamento('q', 'heloíse martins'))
);
ok(
  'pertenceA: o documento da homônima cadastrada não',
  !pertenceA(principal, ids)(orcamento('q', 'Heloise', 'pat-9'))
);

const atualizacoes = planejarReapontamento({
  principal,
  outro,
  nomeFinal: 'Heloíse Martins',
  idsCadastrados: ids,
  fichas: [ficha('f1', 'pat-2', 'Heloíse Martins'), ficha('f2', 'pat-1', 'Heloise')],
  orcamentos: [
    orcamento('q1', 'Heloíse Martins'), // avulso do outro
    orcamento('q2', 'Heloise'), // avulso do principal — o nome dele vai mudar
    orcamento('q3', 'Heloise', 'pat-9'), // da homônima
    orcamento('q4', 'Bruna Carvalho'),
  ],
  recibos: [recibo('r1', 'Heloíse Martins', 'pat-2')],
  atendimentos: [
    atendimento('a1', 'pat-2', 'Heloíse Martins'),
    atendimento('a2', 'pat-1', 'Heloise'),
    atendimento('a3', 'pat-9', 'Heloise'),
  ],
  planos: [planoDeSessoes('p1', 'pat-2'), planoDeSessoes('p2', 'pat-1')],
  internos: [
    { colecao: 'avaliacoes', id: 'v1', pacienteId: 'pat-2', pacienteNome: 'Heloíse Martins' },
    { colecao: 'acompanhamentos', id: 'c1', pacienteId: 'pat-1', pacienteNome: 'Heloise' },
  ],
});
const de = (id: string) => atualizacoes.find((a) => a.id === id);
ok('a ficha do outro passa para o principal', de('f1')?.dados.pacienteId === 'pat-1');
ok('a ficha mantém o nome emitido', de('f1')?.dados.pacienteNome === undefined);
ok('a ficha que já era do principal não é regravada', !de('f2'));
ok('o orçamento avulso do outro ganha o id', de('q1')?.dados.pacienteId === 'pat-1');
ok('o avulso do principal ganha o id (o nome dele vai mudar)', de('q2')?.dados.pacienteId === 'pat-1');
ok('o orçamento da homônima fica onde está', !de('q3'));
ok('o de outra pessoa fica onde está', !de('q4'));
ok('o recibo do outro passa, com o nome emitido', de('r1')?.dados.pacienteId === 'pat-1' && !de('r1')?.dados.pacienteNome);
ok(
  'o atendimento do outro passa (o nome dele já era o que fica)',
  de('a1')?.dados.pacienteId === 'pat-1' && de('a1')?.dados.pacienteNome === undefined
);
ok(
  'o atendimento do principal ganha o nome novo, sem mudar o id',
  de('a2')?.dados.pacienteId === undefined && de('a2')?.dados.pacienteNome === 'Heloíse Martins'
);
ok('o atendimento da homônima não', !de('a3'));
ok('o plano do outro passa', de('p1')?.dados.pacienteId === 'pat-1');
ok('o plano do principal não é regravado', !de('p2'));
ok('a avaliação do outro passa', de('v1')?.dados.pacienteId === 'pat-1');
ok('o acompanhamento do principal ganha o nome novo', de('c1')?.dados.pacienteNome === 'Heloíse Martins');

const semMudarNome = planejarReapontamento({
  principal: paciente('pat-1', 'Heloíse Martins'),
  outro: paciente('pat-2', 'Heloise'),
  nomeFinal: 'Heloíse Martins',
  idsCadastrados: new Set(['pat-1', 'pat-2']),
  fichas: [],
  orcamentos: [],
  recibos: [],
  atendimentos: [atendimento('a1', 'pat-2', 'Heloise'), atendimento('a2', 'pat-1', 'Heloíse')],
  planos: [],
  internos: [],
});
ok(
  'o atendimento do outro ganha o nome que fica',
  semMudarNome.find((a) => a.id === 'a1')?.dados.pacienteNome === 'Heloíse Martins'
);
ok(
  'sem mudar o nome do principal, os registros dele ficam como estão',
  !semMudarNome.some((a) => a.id === 'a2')
);

console.log('\nDepois da junção, a lista vê uma pessoa só');
const fichas = [ficha('f1', 'pat-2', 'Heloíse Martins'), ficha('f2', 'pat-1', 'Heloise')];
const orcamentos = [orcamento('q1', 'Heloíse Martins'), orcamento('q2', 'Heloise')];
const aplicar = <T extends { id: string; pacienteId?: string; pacienteNome?: string }>(docs: T[]): T[] =>
  docs.map((d) => ({ ...d, ...(atualizacoes.find((a) => a.id === d.id)?.dados || {}) }));
const depois = montarLinhasDePacientes({
  patients: [{ ...juntado }],
  records: aplicar(fichas),
  quotes: aplicar(orcamentos),
});
ok('uma linha só', depois.length === 1, depois.map((l) => l.nome).join(' / '));
ok('com as duas fichas e os dois orçamentos', depois[0]?.totalAnamneses === 2 && depois[0]?.totalOrcamentos === 2);

console.log(falhas === 0 ? '\nTudo certo.\n' : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);

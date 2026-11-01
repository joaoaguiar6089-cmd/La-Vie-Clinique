/**
 * Confere o arquivo de pacientes — o que vai junto quando alguém é excluída.
 *
 * O que este script caça: documento da paciente que fica para trás, visível numa seção, depois de
 * ela ir para o arquivo (o orçamento avulso, o recibo pago por outra pessoa, o relatório de uma
 * visita); documento de **outra** pessoa indo junto (a homônima com cadastro próprio); e a
 * paciente sem documento nenhum indo para o arquivo em vez de simplesmente sair.
 *
 *   npx tsx scripts/verificar-arquivo-de-pacientes.ts
 */
import { AnamnesisRecord, Attendance, Patient, Quote, Recibo, SessionPlan } from '../src/types';
import {
  cadastroDoArquivo,
  planejarArquivo,
  resumoDosTotais,
  somarTotais,
  TOTAIS_VAZIOS,
} from '../src/utils/arquivoDePacientes';
import { idSinteticoDoNome, chaveDoNome, LinhaDePaciente } from '../src/utils/patientsPanel';
import { DocumentoInterno } from '../src/utils/juncaoDePacientes';

let falhas = 0;
const ok = (nome: string, condicao: boolean, extra = '') => {
  console.log(`${condicao ? '  ok  ' : ' FALHA'}  ${nome}${extra ? `  — ${extra}` : ''}`);
  if (!condicao) falhas++;
};

const CRIADO = '2026-01-01T12:00:00Z';
const paciente = (id: string, nome: string): Patient => ({ id, nome, createdAt: CRIADO });

const teste = paciente('pat-1', 'Paciente Teste');
// Outra pessoa, com cadastro próprio e o mesmo nome — nada dela pode ir junto.
const homonima = paciente('pat-2', 'Paciente Teste');
const outra = paciente('pat-3', 'Maria Souza');
const ids = new Set([teste.id, homonima.id, outra.id]);

const ficha = (id: string, pacienteId: string | undefined, pacienteNome: string): AnamnesisRecord =>
  ({ id, pacienteId, pacienteNome, procedimentoNome: 'Botox', createdAt: CRIADO } as unknown as AnamnesisRecord);
const orcamento = (id: string, pacienteId: string | undefined, pacienteNome: string): Quote =>
  ({ id, pacienteId, pacienteNome, numero: id, total: 100 } as unknown as Quote);
const recibo = (id: string, pacienteId: string | undefined, pacienteNome: string, quoteId?: string): Recibo =>
  ({ id, pacienteId, pacienteNome, quoteId, valor: 100 } as unknown as Recibo);
const visita = (id: string, p: Patient, extra: Partial<Attendance> = {}): Attendance => ({
  id,
  pacienteId: p.id,
  pacienteNome: p.nome,
  data: '2026-10-10',
  procedimentoNome: 'Botox',
  createdAt: CRIADO,
  ...extra,
});

const fontes = {
  fichas: [
    ficha('f-1', teste.id, teste.nome),
    ficha('f-2', homonima.id, homonima.nome), // da homônima
    ficha('f-3', outra.id, outra.nome),
  ],
  orcamentos: [
    orcamento('q-1', teste.id, teste.nome),
    orcamento('q-2', undefined, 'paciente teste'), // avulso, só pelo nome (caixa diferente)
    orcamento('q-3', outra.id, outra.nome),
  ],
  recibos: [
    recibo('r-1', teste.id, teste.nome),
    recibo('r-2', outra.id, outra.nome, 'q-1'), // pago por outra pessoa, do orçamento dela
    recibo('r-3', outra.id, outra.nome),
  ],
  atendimentos: [
    visita('a-1', teste, { acompanhamentoPreenchidoEm: CRIADO, materiaisRegistradosEm: CRIADO }),
    visita('a-2', teste, { status: 'agendado', data: '2026-12-01', hora: '10:00' }),
    visita('a-3', teste, { status: 'faltou' }),
    visita('a-4', outra),
  ],
  planos: [
    { id: 'pl-1', pacienteId: teste.id } as SessionPlan,
    { id: 'pl-2', pacienteId: outra.id } as SessionPlan,
  ],
  internos: [
    { colecao: 'avaliacoes', id: 'av-1', pacienteId: teste.id },
    // O relatório da a-1 já veio na leitura por paciente — não pode aparecer duas vezes.
    { colecao: 'acompanhamentos', id: 'a-1', pacienteId: teste.id },
  ] as DocumentoInterno[],
};

console.log('\nO que vai para o arquivo');
const plano = planejarArquivo(teste, ids, fontes);
const chaves = plano.documentos.map((d) => `${d.colecao}:${d.id}`).sort();
const tem = (chave: string) => chaves.includes(chave);
ok('a anamnese dela', tem('fichas:f-1'));
ok('não a da homônima com cadastro próprio', !tem('fichas:f-2'));
ok('o orçamento avulso, pelo nome', tem('orcamentos:q-2'));
ok('o recibo do orçamento dela, mesmo pago por outra pessoa', tem('recibos:r-2'));
ok('nada da Maria', !chaves.some((c) => ['f-3', 'q-3', 'r-3', 'a-4', 'pl-2'].some((id) => c.endsWith(`:${id}`))));
ok('todos os atendimentos: feito, agendado e falta', tem('atendimentos:a-1') && tem('atendimentos:a-2') && tem('atendimentos:a-3'));
ok('o plano de sessões', tem('planos:pl-1'));
ok('a avaliação', tem('avaliacoes:av-1'));
ok('os materiais da visita, pela marca no atendimento', tem('materiais:a-1'));
ok('o relatório uma vez só', chaves.filter((c) => c === 'acompanhamentos:a-1').length === 1, chaves.join(' '));
ok('total de documentos', plano.documentos.length === 12, String(plano.documentos.length));
ok('os atendimentos que saem do Google Agenda', plano.atendimentos.length === 3);

console.log('\nTotais');
const t = plano.totais;
ok('1 anamnese, 2 orçamentos, 2 recibos', t.anamneses === 1 && t.orcamentos === 2 && t.recibos === 2);
ok('1 atendimento feito; agendamento e falta à parte', t.atendimentos === 1 && t.agendamentos === 2);
ok('1 avaliação e 1 relatório', t.avaliacoes === 1 && t.relatorios === 1);
ok('resumo legível', resumoDosTotais(t) === '1 anamnese · 1 avaliação · 1 atendimento · 2 agendamentos · 1 relatório · 2 orçamentos · 2 recibos',
  resumoDosTotais(t));
ok('resumo de quem não tem nada é vazio', resumoDosTotais(TOTAIS_VAZIOS) === '');
ok('somar totais', somarTotais(t, t).orcamentos === 4 && somarTotais(undefined, t).anamneses === 1);

console.log('\nSem documento nenhum');
const vazia = paciente('pat-9', 'Sem Nada');
const planoVazio = planejarArquivo(vazia, new Set([...ids, vazia.id]), { ...fontes, internos: [] });
ok('nada a arquivar — o cadastro só é apagado', planoVazio.documentos.length === 0);

console.log('\nO cadastro que a guarda no arquivo');
const linha = (nome: string, patient?: Patient): LinhaDePaciente => ({
  id: patient?.id || idSinteticoDoNome(chaveDoNome(nome)),
  nome,
  patient,
  pendencia: patient ? undefined : 'sem_cadastro',
  totalAnamneses: 0,
  totalOrcamentos: 1,
  totalAtendimentos: 0,
});
const comCadastro = cadastroDoArquivo(linha(teste.nome, teste), []);
ok('quem tem cadastro é arquivada nele mesmo', comCadastro.paciente.id === teste.id && !comCadastro.jaArquivada);
const semCadastro = cadastroDoArquivo(linha('Bruna Carvalho'), []);
ok('quem só tem nome ganha cadastro com o id da linha', semCadastro.paciente.id === 'pat-bruna-carvalho');
ok('...marcado como criado no arquivo', semCadastro.paciente.cadastroCriadoNoArquivo === true);
const jaLa: Patient = { ...semCadastro.paciente, arquivadoEm: '2026-10-01T10:00:00Z' };
const deNovo = cadastroDoArquivo(linha('bruna  carvalho'), [jaLa]);
ok('o mesmo nome que volta se junta a quem já está no arquivo', deNovo.paciente.id === jaLa.id && deNovo.jaArquivada);

console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);

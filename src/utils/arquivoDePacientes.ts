import { AnamnesisRecord, Attendance, Patient, Quote, Recibo, SessionPlan, TotaisDoArquivo } from '../types';
import { ehRealizado } from './attendances';
import { ColecaoDaPaciente, DocumentoInterno } from './juncaoDePacientes';
import { chaveDoNome, LinhaDePaciente, pacienteProvisorio, pertenceA } from './patientsPanel';

/**
 * O arquivo de pacientes — o que acontece ao excluir alguém.
 *
 * Excluir **sempre** funciona. Sem documento nenhum, o cadastro é apagado e pronto. Com documentos
 * (anamnese, orçamento, atendimento, avaliação, relatório, recibo), o cadastro e todos eles vão
 * para o arquivo: somem da lista de Pacientes e de todas as seções, e só são vistos abrindo a
 * paciente no filtro "📁 Arquivo". Excluir de dentro do arquivo é que apaga tudo de vez — o caso
 * das pacientes de teste.
 *
 * Arquivar é **marcar**, e não mover: cada documento ganha `arquivadoEm` e `arquivoDe` e continua
 * na coleção dele, com o mesmo id. Assim o link que a paciente recebeu continua abrindo, e tirar
 * do arquivo é só apagar as duas marcas — nada é reescrito, nem o vínculo de cada documento.
 *
 * Aqui mora só a decisão, para poder ser testada sem o Firebase
 * (`scripts/verificar-arquivo-de-pacientes.ts`); a gravação está em `databaseService.ts`.
 */

/** Um documento a marcar, desmarcar ou apagar. */
export interface DocumentoDoArquivo {
  colecao: ColecaoDaPaciente;
  id: string;
}

/** O que a seção tem em memória — as coleções assinadas inteiras. */
export interface FontesDoArquivo {
  fichas: AnamnesisRecord[];
  orcamentos: Quote[];
  recibos: Recibo[];
  atendimentos: Attendance[];
  planos: SessionPlan[];
  /** Avaliações, relatórios e materiais — lidos do servidor pelo id dela. */
  internos: DocumentoInterno[];
}

export interface PlanoDoArquivo {
  documentos: DocumentoDoArquivo[];
  /** Os atendimentos que vão junto — os que estão no Google Agenda saem de lá. */
  atendimentos: Attendance[];
  totais: TotaisDoArquivo;
}

export const TOTAIS_VAZIOS: TotaisDoArquivo = {
  anamneses: 0,
  orcamentos: 0,
  atendimentos: 0,
  agendamentos: 0,
  avaliacoes: 0,
  relatorios: 0,
  recibos: 0,
};

/**
 * Tudo o que é dela — a mesma regra da página da paciente (`pertenceA`), para o arquivo levar
 * exatamente o que a página mostrava. O recibo de um orçamento dela vai junto mesmo que quem pagou
 * tenha sido outra pessoa: sem o orçamento, ele ficaria apontando para um documento invisível.
 */
export const planejarArquivo = (
  paciente: Pick<Patient, 'id' | 'nome'>,
  idsCadastrados: Set<string>,
  fontes: FontesDoArquivo
): PlanoDoArquivo => {
  const dela = pertenceA(paciente, idsCadastrados);
  const fichas = fontes.fichas.filter(dela);
  const orcamentos = fontes.orcamentos.filter(dela);
  const idsDosOrcamentos = new Set(orcamentos.map((q) => q.id));
  const recibos = fontes.recibos.filter((r) => dela(r) || (!!r.quoteId && idsDosOrcamentos.has(r.quoteId)));
  const atendimentos = fontes.atendimentos.filter(dela);
  const planos = fontes.planos.filter((p) => p.pacienteId === paciente.id);
  // Os internos foram lidos pelo id dela: são dela por definição. O relatório e os materiais de
  // cada visita entram também pela marca no atendimento (o id deles é o do atendimento), para o
  // que tiver ficado com outro `pacienteId` não sobrar visível na seção Relatórios.
  const internos: DocumentoDoArquivo[] = [
    ...fontes.internos.map((d) => ({ colecao: d.colecao, id: d.id })),
    ...atendimentos.flatMap((a) => [
      ...(a.acompanhamentoPreenchidoEm ? [{ colecao: 'acompanhamentos' as const, id: a.id }] : []),
      ...(a.materiaisRegistradosEm ? [{ colecao: 'materiais' as const, id: a.id }] : []),
    ]),
  ].filter((d, i, todos) => todos.findIndex((o) => o.colecao === d.colecao && o.id === d.id) === i);

  const documentos: DocumentoDoArquivo[] = [
    ...fichas.map((d) => ({ colecao: 'fichas' as const, id: d.id })),
    ...orcamentos.map((d) => ({ colecao: 'orcamentos' as const, id: d.id })),
    ...recibos.map((d) => ({ colecao: 'recibos' as const, id: d.id })),
    ...atendimentos.map((d) => ({ colecao: 'atendimentos' as const, id: d.id })),
    ...planos.map((d) => ({ colecao: 'planos' as const, id: d.id })),
    ...internos,
  ];

  return {
    documentos,
    atendimentos,
    totais: {
      anamneses: fichas.length,
      orcamentos: orcamentos.length,
      // Como em toda parte: agendamento, falta e remarcação não são atendimento feito.
      atendimentos: atendimentos.filter(ehRealizado).length,
      agendamentos: atendimentos.filter((a) => !ehRealizado(a)).length,
      avaliacoes: internos.filter((d) => d.colecao === 'avaliacoes').length,
      relatorios: internos.filter((d) => d.colecao === 'acompanhamentos').length,
      recibos: recibos.length,
    },
  };
};

/** Soma dois totais — quando um nome volta a aparecer e é arquivado junto da mesma pessoa. */
export const somarTotais = (a: TotaisDoArquivo | undefined, b: TotaisDoArquivo): TotaisDoArquivo => {
  const base = a || TOTAIS_VAZIOS;
  return {
    anamneses: base.anamneses + b.anamneses,
    orcamentos: base.orcamentos + b.orcamentos,
    atendimentos: base.atendimentos + b.atendimentos,
    agendamentos: (base.agendamentos || 0) + b.agendamentos,
    avaliacoes: base.avaliacoes + b.avaliacoes,
    relatorios: base.relatorios + b.relatorios,
    recibos: base.recibos + b.recibos,
  };
};

/**
 * O cadastro que guarda a pessoa no arquivo.
 *
 * Quem tem cadastro é arquivada nele mesmo. Quem só existia como nome ganha um cadastro com o id
 * da linha (o mesmo que a página dela já usava) — a não ser que já exista no arquivo alguém com o
 * mesmo nome: aí é a mesma pessoa voltando (uma anamnese nova pelo link antigo, ou o que sobrou de
 * um arquivamento interrompido pela rede), e os documentos se juntam aos que já estão lá.
 */
export const cadastroDoArquivo = (
  linha: LinhaDePaciente,
  arquivadas: Patient[]
): { paciente: Patient; jaArquivada: boolean } => {
  if (linha.patient) return { paciente: linha.patient, jaArquivada: false };
  const chave = chaveDoNome(linha.nome);
  const mesma = arquivadas.find((p) => chaveDoNome(p.nome) === chave);
  if (mesma) return { paciente: mesma, jaArquivada: true };
  return {
    paciente: { ...pacienteProvisorio(linha), cadastroCriadoNoArquivo: true },
    jaArquivada: false,
  };
};

/** "2 anamneses · 1 orçamento · 3 atendimentos" — só o que não é zero. */
export const resumoDosTotais = (totais: TotaisDoArquivo | undefined): string => {
  if (!totais) return '';
  const partes: [number, string, string][] = [
    [totais.anamneses, 'anamnese', 'anamneses'],
    [totais.avaliacoes, 'avaliação', 'avaliações'],
    [totais.atendimentos, 'atendimento', 'atendimentos'],
    [totais.agendamentos || 0, 'agendamento', 'agendamentos'],
    [totais.relatorios, 'relatório', 'relatórios'],
    [totais.orcamentos, 'orçamento', 'orçamentos'],
    [totais.recibos, 'recibo', 'recibos'],
  ];
  return partes
    .filter(([n]) => n > 0)
    .map(([n, um, varios]) => `${n} ${n === 1 ? um : varios}`)
    .join(' · ');
};

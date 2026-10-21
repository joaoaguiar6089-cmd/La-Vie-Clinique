import { AnamnesisRecord, Attendance, Patient, Quote, Recibo, SessionPlan } from '../types';
import { LinhaDePaciente, pertenceA } from './patientsPanel';

/**
 * Juntar dois cadastros da mesma pessoa num só — o que fica, com que dados, e o que se move.
 *
 * A gravação mora em `services/juncaoDePacientes.ts`; aqui só a decisão, para poder ser testada
 * sem o Firebase (`scripts/verificar-pacientes-repetidos.ts`).
 */

/** Os campos do cadastro em que os dois podem discordar — os únicos que a tela pergunta. */
export const CAMPOS_DA_JUNCAO = ['nome', 'contato', 'cpf', 'dataNascimento', 'email', 'genero'] as const;
export type CampoDaJuncao = (typeof CAMPOS_DA_JUNCAO)[number];

/** De qual dos dois vem cada campo em conflito. O que não está aqui vem do principal. */
export type EscolhasDaJuncao = Partial<Record<CampoDaJuncao, 'principal' | 'outro'>>;

const valorDe = (p: Patient, campo: CampoDaJuncao): string | undefined =>
  (p[campo] as string | undefined)?.trim() || undefined;

/** Os dois valores dizem a mesma coisa? Máscara de telefone e CPF, e caixa do e-mail, não contam. */
const mesmoValor = (campo: CampoDaJuncao, a: string, b: string): boolean => {
  if (campo === 'contato' || campo === 'cpf') return a.replace(/\D/g, '') === b.replace(/\D/g, '');
  if (campo === 'email') return a.toLowerCase() === b.toLowerCase();
  return a === b;
};

/** Os campos que os dois preencheram com valores diferentes. Os outros se resolvem sozinhos. */
export const camposEmConflito = (principal: Patient, outro: Patient): CampoDaJuncao[] =>
  CAMPOS_DA_JUNCAO.filter((campo) => {
    const a = valorDe(principal, campo);
    const b = valorDe(outro, campo);
    return !!a && !!b && !mesmoValor(campo, a, b);
  });

/**
 * O nome que a tela sugere: o mais completo. Mais palavras ganha ("Heloíse Martins" e não
 * "Heloíse"); empatado, o que tem acento ("Heloíse" e não "Heloise") — o NFD separa o acento num
 * caractere à parte, então o nome acentuado fica mais longo.
 */
export const nomeMaisCompleto = (principal: Patient, outro: Patient): 'principal' | 'outro' => {
  const palavras = (n: string) => n.trim().split(/\s+/).filter(Boolean).length;
  const diferenca = palavras(outro.nome) - palavras(principal.nome);
  if (diferenca !== 0) return diferenca > 0 ? 'outro' : 'principal';
  return outro.nome.trim().normalize('NFD').length > principal.nome.trim().normalize('NFD').length
    ? 'outro'
    : 'principal';
};

/** A escolha inicial da tela: o nome mais completo, e o resto como está no principal. */
export const escolhasIniciais = (principal: Patient, outro: Patient): EscolhasDaJuncao =>
  camposEmConflito(principal, outro).includes('nome')
    ? { nome: nomeMaisCompleto(principal, outro) }
    : {};

const totalDeHistorico = (l: LinhaDePaciente): number =>
  l.totalAnamneses + l.totalOrcamentos + l.totalAtendimentos;

/**
 * Qual dos dois cadastros continua existindo — o id que fica. A tela não pergunta: quem escolhe
 * os dados é a equipe, e o id não é dado de ninguém.
 *
 * Quem tem cadastro ganha de quem só existe como nome; entre dois cadastros, o de mais histórico
 * (menos documentos a mover); empatado, o mais antigo.
 */
export const principalDaJuncao = (
  a: LinhaDePaciente,
  b: LinhaDePaciente
): [principal: LinhaDePaciente, outro: LinhaDePaciente] => {
  if (!!a.patient !== !!b.patient) return a.patient ? [a, b] : [b, a];
  const historico = totalDeHistorico(b) - totalDeHistorico(a);
  if (historico !== 0) return historico > 0 ? [b, a] : [a, b];
  const desde = (l: LinhaDePaciente) => l.patient?.createdAt || '';
  return desde(b) && desde(b) < desde(a) ? [b, a] : [a, b];
};

/**
 * O cadastro que fica, com o melhor dos dois: o que só um tem vem dele; o que os dois têm
 * diferente vem da escolha da tela. As observações se somam, os ângulos do antes e depois também,
 * e a paciente é "desde" a data do mais antigo.
 */
export const dadosJuntados = (
  principal: Patient,
  outro: Patient,
  escolhas: EscolhasDaJuncao = {}
): Patient => {
  const escolhido = (campo: CampoDaJuncao): string | undefined => {
    const doPrincipal = valorDe(principal, campo);
    const doOutro = valorDe(outro, campo);
    return escolhas[campo] === 'outro' ? doOutro || doPrincipal : doPrincipal || doOutro;
  };

  const observacoes = [principal.observacoes, outro.observacoes]
    .map((o) => o?.trim())
    .filter((o, i, todas): o is string => !!o && todas.indexOf(o) === i)
    .join('\n\n');

  const idsDosAngulos = new Set((principal.angulosAntesDepois || []).map((a) => a.id));
  const angulos = [
    ...(principal.angulosAntesDepois || []),
    ...(outro.angulosAntesDepois || []).filter((a) => !idsDosAngulos.has(a.id)),
  ];

  const datas = [principal.createdAt, outro.createdAt].filter(Boolean).sort();

  return {
    ...principal,
    nome: escolhido('nome') || principal.nome,
    contato: escolhido('contato'),
    cpf: escolhido('cpf')?.replace(/\D/g, ''),
    dataNascimento: escolhido('dataNascimento'),
    email: escolhido('email'),
    genero: escolhido('genero') as Patient['genero'],
    observacoes: observacoes || undefined,
    angulosAntesDepois: angulos.length > 0 ? angulos : undefined,
    createdAt: datas[0] || principal.createdAt,
  };
};

/** As coleções com documentos de uma paciente — o que a junção pode ter de reapontar. */
export type ColecaoDaPaciente =
  | 'fichas'
  | 'orcamentos'
  | 'recibos'
  | 'atendimentos'
  | 'planos'
  | 'avaliacoes'
  | 'acompanhamentos'
  | 'materiais';

/** Uma gravação da junção: um documento, e os campos que mudam nele. */
export interface AtualizacaoDaJuncao {
  colecao: ColecaoDaPaciente;
  id: string;
  dados: { pacienteId?: string; pacienteNome?: string };
}

/** Um documento interno lido do servidor — avaliação, acompanhamento ou materiais. */
export interface DocumentoInterno {
  colecao: 'avaliacoes' | 'acompanhamentos' | 'materiais';
  id: string;
  pacienteId?: string;
  pacienteNome?: string;
}

export interface PlanoDaJuncao {
  principal: Patient;
  outro: Patient;
  /** O nome que fica — o de `dadosJuntados`. */
  nomeFinal: string;
  /** Os ids de `patients`, para `pertenceA` saber de quem é cada documento avulso. */
  idsCadastrados: Set<string>;
  fichas: AnamnesisRecord[];
  orcamentos: Quote[];
  recibos: Recibo[];
  atendimentos: Attendance[];
  planos: SessionPlan[];
  /** Avaliações, acompanhamentos e materiais, lidos do servidor pelo id dos dois. */
  internos: DocumentoInterno[];
}

/**
 * Tudo o que precisa ser gravado para os documentos dos dois passarem a ser do principal.
 *
 * Orçamento, recibo e anamnese foram entregues à paciente: muda só o vínculo, e o nome continua o
 * que estava no papel. O resto é diário interno da clínica — agenda, avaliação, acompanhamento,
 * materiais — e passa a mostrar o nome que fica, para a agenda não exibir duas versões da mesma
 * pessoa. Do principal, o nome só muda se a junção mudou o nome dele.
 *
 * Os documentos avulsos do principal (ligados só pelo nome) também ganham o id: se o nome que fica
 * for o do outro, eles deixariam de bater pelo nome e virariam um "sem cadastro" novo.
 */
export const planejarReapontamento = (plano: PlanoDaJuncao): AtualizacaoDaJuncao[] => {
  const { principal, outro, nomeFinal, idsCadastrados } = plano;
  const doPrincipal = pertenceA(principal, idsCadastrados);
  const doOutro = pertenceA(outro, idsCadastrados);
  const nomeDoPrincipalMudou = nomeFinal.trim() !== principal.nome.trim();
  const atualizacoes: AtualizacaoDaJuncao[] = [];

  const emitidos = (colecao: ColecaoDaPaciente, docs: { id: string; pacienteId?: string; pacienteNome?: string }[]) =>
    docs.forEach((d) => {
      if ((doOutro(d) || doPrincipal(d)) && d.pacienteId !== principal.id) {
        atualizacoes.push({ colecao, id: d.id, dados: { pacienteId: principal.id } });
      }
    });

  const internos = (colecao: ColecaoDaPaciente, docs: { id: string; pacienteId?: string; pacienteNome?: string }[]) =>
    docs.forEach((d) => {
      const doDele = doOutro(d) && d.pacienteId !== principal.id;
      if (!doDele && !doPrincipal(d)) return;
      const dados: AtualizacaoDaJuncao['dados'] = {};
      if (d.pacienteId !== principal.id) dados.pacienteId = principal.id;
      if ((doDele || nomeDoPrincipalMudou) && d.pacienteNome !== nomeFinal) dados.pacienteNome = nomeFinal;
      if (dados.pacienteId || dados.pacienteNome) atualizacoes.push({ colecao, id: d.id, dados });
    });

  emitidos('fichas', plano.fichas);
  emitidos('orcamentos', plano.orcamentos);
  emitidos('recibos', plano.recibos);
  internos('atendimentos', plano.atendimentos);
  plano.internos.forEach((d) => internos(d.colecao, [d]));

  // O plano de sessões não tem nome — só o vínculo, e só por id.
  plano.planos.forEach((p) => {
    if (p.pacienteId === outro.id) {
      atualizacoes.push({ colecao: 'planos', id: p.id, dados: { pacienteId: principal.id } });
    }
  });

  return atualizacoes;
};

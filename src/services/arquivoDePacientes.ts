import { AnamnesisRecord, Attendance, Patient, Quote, Recibo, SessionPlan } from '../types';
import {
  cadastroDoArquivo,
  planejarArquivo,
  PlanoDoArquivo,
  somarTotais,
} from '../utils/arquivoDePacientes';
import { LinhaDePaciente } from '../utils/patientsPanel';
import { deletePatient, getDocumentosInternosDaPaciente, gravarArquivamento } from './databaseService';
import { removerDoGoogleAgenda } from './googleAgenda';

/**
 * Excluir uma paciente da lista — em dois passos, porque o aviso precisa dizer o que vai
 * acontecer antes de acontecer: `prepararExclusao` lê o que falta e decide; `excluirPaciente`
 * grava. Sem documento nenhum, o cadastro é apagado. Com documentos, tudo vai para o arquivo.
 */
export interface ExclusaoPreparada {
  linha: LinhaDePaciente;
  /** O cadastro que a guarda no arquivo — o dela, ou um que nasce agora. */
  paciente: Patient;
  /** Ela se junta a quem já está no arquivo com o mesmo nome. */
  jaArquivada: boolean;
  plano: PlanoDoArquivo;
}

export interface FontesEmMemoria {
  fichas: AnamnesisRecord[];
  orcamentos: Quote[];
  recibos: Recibo[];
  atendimentos: Attendance[];
  planos: SessionPlan[];
}

export const prepararExclusao = async ({
  linha,
  arquivadas,
  idsCadastrados,
  emMemoria,
}: {
  linha: LinhaDePaciente;
  arquivadas: Patient[];
  idsCadastrados: Set<string>;
  emMemoria: FontesEmMemoria;
}): Promise<ExclusaoPreparada> => {
  const { paciente, jaArquivada } = cadastroDoArquivo(linha, arquivadas);
  // Avaliação, relatório e materiais só existem para quem tem cadastro — e só se leem por paciente.
  const internos = linha.patient ? await getDocumentosInternosDaPaciente([linha.patient.id]) : [];
  // O que é dela é decidido pelo cadastro da linha (ou pelo nome, sem cadastro), não pelo que a
  // guarda no arquivo: quando ela se junta a alguém que já está lá, o id dele não diz nada aqui.
  const dona = linha.patient || { id: linha.id, nome: linha.nome };
  const plano = planejarArquivo(dona, idsCadastrados, { ...emMemoria, internos });
  return { linha, paciente, jaArquivada, plano };
};

/** Grava a exclusão e diz o que aconteceu. */
export const excluirPaciente = async (
  preparo: ExclusaoPreparada
): Promise<'apagada' | 'arquivada'> => {
  const { linha, paciente, jaArquivada, plano } = preparo;

  if (plano.documentos.length === 0) {
    // Sem documento, nada a guardar. (Quem não tem cadastro sempre tem documento — é por causa
    // dele que ela está na lista.)
    if (linha.patient) await deletePatient(linha.patient.id);
    return 'apagada';
  }

  await gravarArquivamento({
    paciente: {
      ...paciente,
      arquivadoEm: jaArquivada ? paciente.arquivadoEm : new Date().toISOString(),
      arquivoTotais: jaArquivada ? somarTotais(paciente.arquivoTotais, plano.totais) : plano.totais,
    },
    documentos: plano.documentos,
  });

  // O agendamento arquivado sai da agenda — e do Google Agenda também. Sem esperar: o Google fora
  // do ar não pode segurar a tela.
  plano.atendimentos.filter((a) => a.googleAgenda).forEach((a) => void removerDoGoogleAgenda(a));
  return 'arquivada';
};

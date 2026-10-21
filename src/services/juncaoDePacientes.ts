import { AnamnesisRecord, Attendance, Patient, Quote, Recibo, SessionPlan } from '../types';
import { dadosJuntados, EscolhasDaJuncao, planejarReapontamento } from '../utils/juncaoDePacientes';
import { getDocumentosInternosDaPaciente, gravarJuncaoDePacientes } from './databaseService';

/**
 * Juntar dois cadastros da mesma pessoa — as duas Heloíses viram uma.
 *
 * Mora fora do `PatientsModule` pelo mesmo motivo do `attendanceWorkflow`: é uma sequência (ler o
 * que falta, decidir, gravar em lotes), e não um documento só. A decisão em si é pura e mora em
 * `utils/juncaoDePacientes.ts`.
 */
export interface JuncaoDePacientes {
  /** O cadastro que fica — o de `principalDaJuncao`. Pode ser o provisório de quem só tem nome. */
  principal: Patient;
  outro: Patient;
  /** O `outro` existe em `patients`? Quem só existe como nome não deixa redirecionamento. */
  outroTemCadastro: boolean;
  escolhas: EscolhasDaJuncao;
  idsCadastrados: Set<string>;
  /** As coleções que a seção já assina inteiras — o que vier daqui não precisa ser lido de novo. */
  emMemoria: {
    fichas: AnamnesisRecord[];
    orcamentos: Quote[];
    recibos: Recibo[];
    atendimentos: Attendance[];
    planos: SessionPlan[];
  };
}

/** Grava a junção e devolve o cadastro que ficou. */
export const juntarPacientes = async (juncao: JuncaoDePacientes): Promise<Patient> => {
  const { principal, outro, outroTemCadastro, escolhas, idsCadastrados, emMemoria } = juncao;
  const final = dadosJuntados(principal, outro, escolhas);

  // Do outro, tudo; do principal, só se o nome dele mudou — é o único motivo para mexer nos dele.
  const idsALer = [
    ...(outroTemCadastro ? [outro.id] : []),
    ...(final.nome !== principal.nome && idsCadastrados.has(principal.id) ? [principal.id] : []),
  ];
  const internos = idsALer.length > 0 ? await getDocumentosInternosDaPaciente(idsALer) : [];

  const atualizacoes = planejarReapontamento({
    principal,
    outro,
    nomeFinal: final.nome,
    idsCadastrados,
    ...emMemoria,
    internos,
  });

  await gravarJuncaoDePacientes({
    atualizacoes,
    final,
    saiu: outroTemCadastro ? outro : undefined,
  });
  return final;
};

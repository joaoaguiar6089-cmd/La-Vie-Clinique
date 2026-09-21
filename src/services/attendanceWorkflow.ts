import { AnamnesisRecord, Attendance, Patient, SessionPlan } from '../types';
import { anamnesesAFechar } from '../utils/evaluations';
import { ehRealizado } from '../utils/attendances';
import {
  encerrarAnamnese,
  getRecordsForPatient,
  savePatient,
  saveAttendance,
  saveSessionPlan,
} from './databaseService';

/**
 * Gravar uma visita não é gravar um documento — é uma sequência com efeitos colaterais.
 *
 * Isto morava dentro do `PatientsModule`. Saiu de lá quando a agenda virou um segundo lugar de
 * onde se lança atendimento: duas cópias da sequência acabariam divergindo, e o que a segunda
 * esqueceria primeiro seria justamente o mais invisível — o fechamento da anamnese, que ninguém
 * vê acontecer e cuja falta só aparece semanas depois, num link que continuou aberto.
 */
export interface SalvamentoDeAtendimento {
  registro: Attendance;
  /** Plano criado no mesmo formulário. */
  planoNovo?: SessionPlan;
  /** Cadastro de quem só existia como nome num orçamento ou numa ficha. */
  pacienteACriar?: Patient;
  /**
   * As anamneses do paciente, quando quem chama já as tem em memória (a aba do paciente tem).
   * Ausente: busca só se for preciso — ver `fecharAnamnesesDaVisita`.
   */
  anamneses?: AnamnesisRecord[];
}

/**
 * Visita realizada fecha o link da anamnese correspondente.
 *
 * A marca é gravada **no registro da anamnese**, e não deduzida na exibição, porque quem precisa
 * dela é a página pública da paciente — que não tem login e, pelas regras do Firestore, não pode
 * ler `attendances`. Sem esta gravação a trava não existiria na única tela onde ela importa.
 *
 * Falhar aqui não derruba o salvamento: a visita registrada é o dado essencial, e a trava volta a
 * ser tentada no próximo atendimento da mesma paciente.
 */
const fecharAnamnesesDaVisita = async (
  registro: Attendance,
  anamneses?: AnamnesisRecord[]
): Promise<void> => {
  try {
    // Agendamento futuro nunca fecha ficha nenhuma (`anamnesesAFechar` devolve lista vazia para
    // quem não é realizado). Conferir antes evita a leitura na agenda, que é o caso comum lá.
    if (!ehRealizado(registro) || !registro.data) return;

    const fichas = anamneses ?? (await getRecordsForPatient(registro.pacienteId));
    const aFechar = anamnesesAFechar(registro, fichas);
    if (aFechar.length === 0) return;
    await Promise.all(aFechar.map((f) => encerrarAnamnese(f.id)));
  } catch (e) {
    console.warn('Não foi possível encerrar a anamnese após o atendimento:', e);
  }
};

/**
 * Grava a visita e tudo o que ela arrasta junto.
 *
 * O cadastro vem primeiro de propósito. Se a gravação do atendimento falhar depois dele, a clínica
 * fica com um cadastro a mais — inofensivo. Na ordem inversa, ficaria com um atendimento apontando
 * para paciente que não existe.
 */
export const salvarAtendimento = async ({
  registro,
  planoNovo,
  pacienteACriar,
  anamneses,
}: SalvamentoDeAtendimento): Promise<void> => {
  if (pacienteACriar) await savePatient(pacienteACriar);
  if (planoNovo) await saveSessionPlan(planoNovo);
  await saveAttendance(registro);
  await fecharAnamnesesDaVisita(registro, anamneses);
};

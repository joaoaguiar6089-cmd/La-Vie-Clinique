import { ClipboardCheck } from 'lucide-react';
import { Attendance } from '../../types';
import { ConfirmRequest } from '../ConfirmDialog';
import { deveOferecerAcompanhamento } from '../../utils/fichasClinicas';
import { nomeDosProcedimentos } from '../../utils/attendances';

/**
 * A pergunta que sobe depois de confirmar o comparecimento: "Preencher acompanhamento?".
 *
 * A agenda e o painel da paciente confirmam o comparecimento cada um pelo seu caminho, e os dois
 * fazem a mesma pergunta com as mesmas palavras — por isso ela mora aqui, e não duplicada nos dois.
 *
 * Devolve `null` quando não cabe perguntar (ver `deveOferecerAcompanhamento`).
 *
 * `onSim` recebe o atendimento já com o que estava gravado antes (`anterior`) por baixo do que
 * acabou de ser salvo: o formulário de confirmação monta o registro do zero e não carrega as
 * marcas que só o banco conhece, como a de materiais já lançados.
 */
export const perguntaDoAcompanhamento = (
  anterior: Attendance | null | undefined,
  salvo: Attendance,
  onSim: (atendimento: Attendance) => void
): ConfirmRequest | null => {
  if (!deveOferecerAcompanhamento(anterior, salvo)) return null;
  const atendimento: Attendance = { ...(anterior as Attendance), ...salvo };
  return {
    titulo: 'Preencher relatório?',
    mensagem:
      `${salvo.pacienteNome} · ${nomeDosProcedimentos(salvo)}.\n` +
      'Fotos, respostas e materiais desta sessão — dá para completar depois pelo atendimento.',
    textoConfirmar: 'Sim',
    textoCancelar: 'Não',
    tom: 'neutro',
    icone: ClipboardCheck,
    onConfirmar: () => onSim(atendimento),
  };
};

import {
  Attendance,
  ClinicProfile,
  ContaGoogleAgenda,
  MarcaGoogleAgenda,
  Procedure,
} from '../types';
import { intervaloDoAtendimento } from './agenda';
import { DataISO, nomeDosProcedimentos } from './attendances';

/**
 * Regras puras da sincronização com o Google Agenda: que agendamento vai para o Google, com que
 * texto, e o que precisa ser enviado agora para o Google ficar igual à agenda do painel.
 *
 * A sincronização é de **mão única**. A agenda do painel é a oficial; o Google Agenda de cada
 * profissional é um espelho, num calendário próprio chamado "La Vie Clinique". O que alguém
 * mudar no Google não volta para o painel — e é sobrescrito na próxima mudança do agendamento.
 *
 * Como o painel sabe o que já foi enviado: cada atendimento guarda uma marca
 * (`Attendance.googleAgenda`) com a profissional, o calendário e a assinatura do evento enviado.
 * Marca igual ao evento de agora = nada a fazer. Por isso a sincronização inteira é uma
 * comparação só, feita sobre a lista de atendimentos que o App já tem em memória — não importa
 * por qual tela (agenda, plano de sessões, resposta da paciente) o agendamento mudou.
 *
 * O id do evento no Google é derivado do id do atendimento (`idDoEventoGoogle`). Dois painéis
 * abertos ao mesmo tempo enviando o mesmo agendamento escrevem no mesmo evento, em vez de criar
 * dois.
 */

export const NOME_DO_CALENDARIO = 'La Vie Clinique';
export const FUSO_DA_CLINICA = 'America/Sao_Paulo';

/** O evento como o servidor o recebe — o servidor só monta o corpo do Google a partir disto. */
export interface EventoGoogle {
  titulo: string;
  descricao: string;
  local?: string;
  /** Horário local da clínica, "YYYY-MM-DDTHH:MM:00". */
  inicio: string;
  fim: string;
}

export type OperacaoGoogle =
  | {
      acao: 'salvar';
      atendimentoId: string;
      eventoId: string;
      /** Em qual conta (de qual profissional) a operação acontece. */
      profissionalId: string;
      evento: EventoGoogle;
      /** A marca a gravar no atendimento quando o Google aceitar. */
      marca: MarcaGoogleAgenda;
    }
  | {
      acao: 'apagar';
      atendimentoId: string;
      eventoId: string;
      profissionalId: string;
      /**
       * `true` quando, depois de apagar, a marca do atendimento deve sumir. `false` quando o
       * agendamento mudou de profissional: quem grava a marca nova é o `salvar` na conta da outra.
       */
      limparMarca: boolean;
    };

/**
 * Id do evento no Google, derivado do id do atendimento. O Google só aceita `a`–`v` e `0`–`9`,
 * de 5 a 1024 caracteres; o hexadecimal dos bytes do id cabe nesse alfabeto.
 */
export const idDoEventoGoogle = (atendimentoId: string): string => {
  const bytes = new TextEncoder().encode(atendimentoId);
  let hex = '';
  bytes.forEach((b) => {
    hex += b.toString(16).padStart(2, '0');
  });
  return `lv${hex}`;
};

/** Agendamento que deve aparecer no Google: nasceu agendamento, tem hora e não foi remarcado. */
export const vaiParaOGoogle = (a: Attendance): boolean =>
  !!a.status && a.status !== 'remarcado' && !!a.hora && !!a.professionalId;

const pad = (n: number) => String(n).padStart(2, '0');

/** "YYYY-MM-DD" + minutos desde a meia-noite → "YYYY-MM-DDTHH:MM:00", virando o dia se preciso. */
const dataHora = (data: DataISO, minutos: number): string => {
  const [ano, mes, dia] = data.split('-').map(Number);
  // Em UTC só para fazer a conta do calendário; o resultado é o horário local da clínica.
  const d = new Date(Date.UTC(ano, mes - 1, dia, 0, minutos));
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00`
  );
};

/**
 * O evento do agendamento, ou `null` quando ele não vai para o Google.
 *
 * Só nome da paciente e procedimento: o Google Agenda aparece na tela do celular da profissional,
 * em notificações e em widgets. Observações, telefone e respostas da ficha ficam no painel.
 */
export const eventoDoAtendimento = (
  a: Attendance,
  catalogo: Procedure[],
  clinica: Pick<ClinicProfile, 'address' | 'cityState'>
): EventoGoogle | null => {
  if (!vaiParaOGoogle(a)) return null;
  const intervalo = intervaloDoAtendimento(a, catalogo);
  if (!intervalo) return null;

  const prefixo = a.status === 'faltou' ? '(faltou) ' : a.confirmadoEm ? '✓ ' : '';
  const situacao =
    a.status === 'faltou'
      ? 'A paciente faltou.'
      : a.status === 'compareceu'
        ? 'Atendimento realizado.'
        : a.confirmadoEm
          ? 'Confirmado pela paciente.'
          : 'Aguardando confirmação da paciente.';

  const local = [clinica.address, clinica.cityState].map((p) => (p || '').trim()).filter(Boolean);

  return {
    titulo: `${prefixo}${a.pacienteNome} · ${nomeDosProcedimentos(a)}`.trim(),
    descricao: [
      situacao,
      '',
      'Agendamento do painel da La Vie Clinique. Para mudar, use o painel — o que for alterado aqui no Google não volta para o sistema.',
    ].join('\n'),
    local: local.length > 0 ? local.join(' — ') : undefined,
    inicio: dataHora(a.data, intervalo.inicioMin),
    fim: dataHora(a.data, intervalo.fimMin),
  };
};

/** Resumo curto do que foi enviado: id, calendário e o evento inteiro. */
export const assinaturaDoEvento = (
  atendimentoId: string,
  calendarioId: string,
  evento: EventoGoogle
): string => {
  const texto = JSON.stringify([atendimentoId, calendarioId, evento]);
  let hash = 5381;
  for (let i = 0; i < texto.length; i++) {
    hash = ((hash << 5) + hash + texto.charCodeAt(i)) | 0;
  }
  return `${(hash >>> 0).toString(36)}:${texto.length}`;
};

/** A conta pode receber operações agora? Com erro, espera a profissional reconectar. */
const contaUtilizavel = (conta?: ContaGoogleAgenda): conta is ContaGoogleAgenda =>
  !!conta && !conta.erro && !!conta.tokenCifrado && !!conta.calendarioId;

/**
 * O que precisa ser enviado ao Google para cada calendário ficar igual à agenda do painel.
 *
 * - Agendamento que vai para o Google e cuja marca não bate → `salvar` na conta da profissional.
 * - Agendamento que mudou de profissional → também `apagar` da conta da anterior.
 * - Agendamento que saiu (remarcado, sem hora) mas tem marca → `apagar`.
 * - Conta com erro: nada daquela profissional se mexe até ela reconectar.
 * - Passado sem marca não é enviado: ao conectar, só os agendamentos de hoje em diante vão.
 *
 * Exclusão de atendimento não passa por aqui — o documento some da lista. Quem cuida é
 * `deleteAttendance`, que ainda tem a marca em mãos.
 */
export const planejarSincronizacao = (
  atendimentos: Attendance[],
  contas: Record<string, ContaGoogleAgenda>,
  catalogo: Procedure[],
  clinica: Pick<ClinicProfile, 'address' | 'cityState'>,
  hoje: DataISO
): OperacaoGoogle[] => {
  const operacoes: OperacaoGoogle[] = [];

  for (const a of atendimentos) {
    const marca = a.googleAgenda;
    if (!marca && (!a.status || a.data < hoje)) continue;

    const eventoId = idDoEventoGoogle(a.id);
    const conta = a.professionalId ? contas[a.professionalId] : undefined;
    const contaDaMarca = marca ? contas[marca.profissionalId] : undefined;
    // A marca aponta para um calendário que ainda está ligado (a profissional não reconectou
    // noutra conta nem desconectou) — só então dá para mexer no evento antigo.
    const marcaAlcancavel =
      !!marca && contaUtilizavel(contaDaMarca) && contaDaMarca.calendarioId === marca.calendarioId;

    if (conta?.erro || (marca && contaDaMarca?.erro)) continue;

    const evento = contaUtilizavel(conta) ? eventoDoAtendimento(a, catalogo, clinica) : null;

    if (evento && conta && a.professionalId) {
      const assinatura = assinaturaDoEvento(a.id, conta.calendarioId, evento);
      const mesmoLugar =
        !!marca &&
        marca.profissionalId === a.professionalId &&
        marca.calendarioId === conta.calendarioId;
      if (mesmoLugar && marca.assinatura === assinatura) continue;

      if (marca && !mesmoLugar && marcaAlcancavel) {
        operacoes.push({
          acao: 'apagar',
          atendimentoId: a.id,
          eventoId,
          profissionalId: marca.profissionalId,
          limparMarca: false,
        });
      }
      operacoes.push({
        acao: 'salvar',
        atendimentoId: a.id,
        eventoId,
        profissionalId: a.professionalId,
        evento,
        marca: { profissionalId: a.professionalId, calendarioId: conta.calendarioId, assinatura },
      });
      continue;
    }

    // Não deve (ou não pode mais) estar no Google: tira de onde a marca diz que está.
    if (marca && marcaAlcancavel) {
      operacoes.push({
        acao: 'apagar',
        atendimentoId: a.id,
        eventoId,
        profissionalId: marca.profissionalId,
        limparMarca: true,
      });
    }
  }

  return operacoes;
};

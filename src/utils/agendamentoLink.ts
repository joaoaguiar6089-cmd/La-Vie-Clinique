import {
  AppointmentLink,
  AppointmentLinkResposta,
  AppointmentLinkSituacao,
  Attendance,
  AttendanceStatus,
  ClinicProfile,
  PedidoDeRemarcacao,
  Procedure,
} from '../types';
import { dataExtensa, duracaoDoAtendimento } from './agenda';
import { DataISO, hojeISO } from './attendances';

/**
 * As regras do link que a clínica manda à paciente para ela confirmar, avisar que não vai ou pedir
 * outro horário.
 *
 * Tudo aqui é puro — sem Firestore, sem React — porque é onde moram as decisões que não podem
 * errar em silêncio: o que sai da clínica para uma página **sem login**, e o que cada resposta faz
 * com o atendimento. O serviço só grava o que estas funções mandam.
 */

/** Tamanho máximo do recado da paciente. As regras do Firestore repetem este limite. */
export const MENSAGEM_MAX_CARACTERES = 300;

// ==========================================
// O QUE SAI DA CLÍNICA
// ==========================================

/**
 * Onde o link está na vida do atendimento. Só `agendado` deixa a paciente responder; depois
 * disso a página vira leitura.
 */
export const situacaoDoLink = (status?: AttendanceStatus): AppointmentLinkSituacao => {
  if (status === 'agendado') return 'ativo';
  if (status === 'remarcado') return 'remarcado';
  return 'encerrado';
};

/** Endereço http(s), e não uma imagem embutida (`data:`) que pesaria dentro do documento. */
const ehEnderecoWeb = (url?: string): url is string => /^https?:\/\//i.test(url || '');

/**
 * A foto de capa, se houver uma que caiba num documento público.
 *
 * Só endereço http(s): quando o envio ao Storage falha o catálogo guarda a imagem em base64
 * (`data:`), e copiá-la para cá estouraria o limite de 1 MB do Firestore — o link inteiro deixaria
 * de ser gravado por causa de uma foto. Sem foto utilizável a página usa a capa tipográfica.
 */
export const fotoPublicaDoProcedimento = (procedimento?: Pick<Procedure, 'images'>): string | undefined =>
  (procedimento?.images || []).find(ehEnderecoWeb);

/** O que muda a cada gravação do atendimento — a resposta da paciente não entra aqui. */
export type SnapshotDoLink = Pick<
  AppointmentLink,
  | 'attendanceId'
  | 'clientePrimeiroNome'
  | 'procedimento'
  | 'data'
  | 'hora'
  | 'duracaoMin'
  | 'profissionalNome'
  | 'clinica'
  | 'situacao'
>;

export const primeiroNomeDe = (nome: string): string => (nome || '').trim().split(/\s+/)[0] || '';

const vazioParaUndefined = (texto?: string): string | undefined => {
  const limpo = (texto || '').trim();
  return limpo || undefined;
};

/**
 * A cópia pública de um agendamento.
 *
 * **Lista de permissão, não de exclusão**: cada campo entra aqui porque foi escolhido, então um
 * campo novo em `Attendance` ou em `Procedure` nunca vaza sozinho. Ficam de fora observações
 * internas, preços, ids e contato da paciente, plano de sessões e os dados de login da equipe.
 */
export const montarSnapshotDoLink = (
  atendimento: Attendance,
  clinic: Pick<ClinicProfile, 'name' | 'tagline' | 'phone' | 'address' | 'cityState' | 'logoUrl'>,
  catalogo: Procedure[]
): SnapshotDoLink => {
  const procedimento = atendimento.procedureId
    ? catalogo.find((p) => p.id === atendimento.procedureId)
    : undefined;

  return {
    attendanceId: atendimento.id,
    clientePrimeiroNome: primeiroNomeDe(atendimento.pacienteNome),
    procedimento: {
      // O nome do atendimento vence: é o que a recepção escolheu, e o catálogo pode ter mudado.
      titulo: atendimento.procedimentoNome || procedimento?.title || 'Seu horário',
      subtitulo: vazioParaUndefined(procedimento?.subtitle),
      descricao: vazioParaUndefined(procedimento?.description),
      foto: fotoPublicaDoProcedimento(procedimento),
      duracaoTexto: vazioParaUndefined(procedimento?.duration),
      orientacoes: vazioParaUndefined(procedimento?.orientacoesPreProcedimento),
    },
    data: atendimento.data,
    hora: atendimento.hora,
    duracaoMin: duracaoDoAtendimento(atendimento, catalogo),
    profissionalNome: vazioParaUndefined(atendimento.profissionalNome),
    clinica: {
      name: clinic.name,
      tagline: vazioParaUndefined(clinic.tagline),
      phone: vazioParaUndefined(clinic.phone),
      address: vazioParaUndefined(clinic.address),
      cityState: vazioParaUndefined(clinic.cityState),
      // Mesma regra da foto: o logo também pode ter caído no fallback em base64.
      logoUrl: ehEnderecoWeb(clinic.logoUrl) ? clinic.logoUrl : undefined,
    },
    situacao: situacaoDoLink(atendimento.status),
  };
};

/** O texto que acompanha o link no WhatsApp. Quem envia ainda revê antes de mandar. */
export const mensagemDoLink = (
  clinic: Pick<ClinicProfile, 'name'>,
  atendimento: Attendance,
  link: string
): string => {
  const nome = primeiroNomeDe(atendimento.pacienteNome);
  const quando = `${dataExtensa(atendimento.data)}${atendimento.hora ? ` às ${atendimento.hora}` : ''}`;
  return (
    `Oi${nome ? `, ${nome}` : ''}! Separamos os detalhes do seu horário na ${clinic.name}: ` +
    `${quando} — ${atendimento.procedimentoNome}.\n\n` +
    `Por aqui você confirma a presença, avisa se não puder vir ou pede outro horário:\n${link}`
  );
};

// ==========================================
// O QUE A PACIENTE ENVIA
// ==========================================

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const HORA_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Confere o horário que a paciente digitou para pedir a alteração. Devolve a mensagem de erro, ou
 * `null` quando está tudo certo.
 *
 * Não confere expediente nem conflito: ela não enxerga a agenda, e quem valida contra ela é a
 * equipe, na hora de aprovar. Aqui só impede o que é impossível.
 */
export const erroDoPedidoDeRemarcacao = (
  novaData: string,
  novaHora: string,
  mensagem = '',
  hoje: DataISO = hojeISO(),
  agora = ''
): string | null => {
  if (!DATA_ISO.test(novaData) || Number.isNaN(new Date(`${novaData}T12:00:00`).getTime())) {
    return 'Escolha a nova data.';
  }
  if (novaData < hoje) return 'A nova data já passou. Escolha um dia a partir de hoje.';
  if (!HORA_HHMM.test(novaHora)) return 'Escolha o novo horário.';
  if (novaData === hoje && agora && novaHora <= agora) {
    return 'Esse horário já passou. Escolha um mais tarde.';
  }
  if (mensagem.length > MENSAGEM_MAX_CARACTERES) {
    return `O recado pode ter até ${MENSAGEM_MAX_CARACTERES} caracteres.`;
  }
  return null;
};

/**
 * O documento da resposta como as regras do Firestore o esperam: sem campo vazio (o Firestore
 * recusa `undefined`) e com o recado aparado.
 */
export const respostaParaGravar = (resposta: AppointmentLinkResposta): AppointmentLinkResposta => {
  const recado = vazioParaUndefined(resposta.mensagem)?.slice(0, MENSAGEM_MAX_CARACTERES);
  const limpa: AppointmentLinkResposta = { tipo: resposta.tipo };
  if (resposta.tipo === 'remarcar') {
    limpa.novaData = resposta.novaData;
    limpa.novaHora = resposta.novaHora;
  }
  if (recado) limpa.mensagem = recado;
  return limpa;
};

// ==========================================
// O QUE A RESPOSTA FAZ NO ATENDIMENTO
// ==========================================

/** Os campos do atendimento que o link mexe. Cada resposta escreve um e apaga os outros. */
export type CampoDoLink = 'confirmadoEm' | 'avisoAusenciaEm' | 'pedidoRemarcacao';

export interface EfeitoDaResposta {
  gravar: Partial<Pick<Attendance, CampoDoLink>>;
  apagar: CampoDoLink[];
}

/**
 * O que a resposta da paciente faz no atendimento.
 *
 * As três respostas se excluem: a última vale. Quem confirmou e depois avisou que não vai deixa de
 * estar confirmada, e quem pediu outro horário não está mais confirmada para o horário antigo — a
 * agenda de amanhã voltaria a mostrá-la "a confirmar", que é o que ela é.
 *
 * `em` é o instante da resposta, e não o de agora: a equipe pode abrir o painel horas depois, e
 * "confirmou às 9h" precisa dizer 9h.
 */
export const efeitoDaResposta = (
  resposta: AppointmentLinkResposta,
  em: string
): EfeitoDaResposta => {
  if (resposta.tipo === 'confirmar') {
    return {
      gravar: { confirmadoEm: em },
      apagar: ['avisoAusenciaEm', 'pedidoRemarcacao'],
    };
  }
  if (resposta.tipo === 'nao_vai') {
    return {
      gravar: { avisoAusenciaEm: em },
      apagar: ['confirmadoEm', 'pedidoRemarcacao'],
    };
  }
  const pedido: PedidoDeRemarcacao = {
    data: resposta.novaData || '',
    hora: resposta.novaHora || '',
    em,
    ...(resposta.mensagem ? { mensagem: resposta.mensagem } : {}),
  };
  return {
    gravar: { pedidoRemarcacao: pedido },
    apagar: ['confirmadoEm', 'avisoAusenciaEm'],
  };
};

// ==========================================
// O QUE A EQUIPE VÊ
// ==========================================

/**
 * A paciente avisou que não vem. Existe uma função só para isto porque quatro telas decidem, a
 * partir dela, se o botão "Faltou" aparece — e a resposta não pode divergir entre elas.
 */
export const ausenciaAvisada = (a: Attendance): boolean =>
  a.status === 'agendado' && !!a.avisoAusenciaEm;

/** Há um pedido de outro horário esperando decisão. */
export const temPedidoDeRemarcacao = (a: Attendance): boolean =>
  a.status === 'agendado' && !!a.pedidoRemarcacao;

/**
 * As respostas que esperam uma decisão da equipe: pedidos de outro horário e avisos de ausência,
 * dos agendamentos que ainda vão acontecer. Em ordem de data — o que está mais perto vem primeiro.
 *
 * Confirmar não entra: é a resposta que não pede nada, e o cartão verde da agenda já a mostra.
 */
export const respostasParaResolver = (atendimentos: Attendance[], hoje: DataISO = hojeISO()): Attendance[] =>
  atendimentos
    .filter((a) => (temPedidoDeRemarcacao(a) || ausenciaAvisada(a)) && a.data >= hoje)
    .sort((a, b) => a.data.localeCompare(b.data) || (a.hora || '').localeCompare(b.hora || ''));

/** Há uma página aberta para a paciente responder? Só enquanto o agendamento está pendente. */
export const linkAceitaResposta = (situacao: AppointmentLinkSituacao, data: DataISO, hoje: DataISO = hojeISO()): boolean =>
  situacao === 'ativo' && data >= hoje;

/** "30/09 às 09:12" — quando a paciente respondeu, no fuso de quem olha. */
export const instanteCurto = (iso?: string): string => {
  const d = new Date(iso || '');
  if (Number.isNaN(d.getTime())) return '';
  const dois = (n: number) => String(n).padStart(2, '0');
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)} às ${dois(d.getHours())}:${dois(d.getMinutes())}`;
};

/** "sábado" e "3 de outubro", separados — o card da paciente escreve cada um num tamanho. */
export const partesDaData = (data: DataISO): { semana: string; diaMes: string } => {
  const [ano, mes, dia] = (data || '').split('-').map(Number);
  if (!ano || !mes || !dia) return { semana: '', diaMes: data || '' };
  const d = new Date(ano, mes - 1, dia);
  return {
    semana: d.toLocaleDateString('pt-BR', { weekday: 'long' }),
    diaMes: d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' }),
  };
};

/** "sexta-feira, 3 de outubro" — a data por extenso da página da paciente. */
export const dataPorExtenso = (data: DataISO): string => {
  const [ano, mes, dia] = (data || '').split('-').map(Number);
  if (!ano || !mes || !dia) return data || '';
  return new Date(ano, mes - 1, dia).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
};

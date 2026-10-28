import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarClock,
  Check,
  DoorClosed,
  Link2Off,
  Loader2,
  Plus,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  AgendaSala,
  Attendance,
  ClinicProfile,
  Patient,
  ProcedimentoDaVisita,
  Procedure,
  Professional,
  Quote,
  SessionPlan,
} from '../../types';
import {
  MaskedTimeInput,
  dataParaISO,
  horaValida,
  isoParaData,
} from '../common/MaskedDateTimeInput';
import { ProcedureSearchSelect } from '../common/ProcedureSearchSelect';
import { CampoDeDataComCalendario } from '../common/CampoDeDataComCalendario';
import { PatientSearchSelect } from '../quotes/PatientSearchSelect';
import {
  agoraHHMM,
  DataISO,
  ehDataFutura,
  ehRealizado,
  hojeISO,
  mesmoProcedimento,
  numeroDaSessao,
  pertenceAoPlano,
  planoAbertoPara,
  procedimentoSugerido,
  procedimentosDoAtendimento,
  progressoDoPlano,
} from '../../utils/attendances';
import {
  AGENDA_DEFAULTS,
  almocoDoDia,
  conflitosDe,
  conflitosDeSala,
  corDaProfissional,
  deslocarDias,
  duracaoDosProcedimentos,
  expedienteDoDia,
  hhmmDeMinutos,
  intervaloDaGrade,
  intervaloDoAtendimento,
  mensagemDeConfirmacao,
  minutosDoHHMM,
} from '../../utils/agenda';
import { resolveQuoteStatus } from '../../utils/quoteCalc';
import { formatDateShortYear } from '../../utils/formatters';
import { buildWhatsAppUrl } from '../../utils/whatsapp';
import { SidePanel } from '../common/SidePanel';
import {
  Avatar,
  AvisoTinta,
  BotaoPrincipal,
  CampoTinta,
  INPUT_TINTA,
  Interruptor,
  PilulasDeEscolha,
  RotuloTinta,
} from '../common/Tinta';

/**
 * `novo` nasce em branco; `edicao` corrige um registro; `confirmacao` é o "compareceu" de um
 * agendamento — que abre este mesmo formulário inteiro, e não só um campo de observações,
 * porque quem chegou atrasado ou trocou de procedimento na hora é caso comum.
 */
export type ModoDoFormulario = 'novo' | 'edicao' | 'confirmacao';

interface AttendanceFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * `null` só no fluxo da agenda, onde o horário é escolhido antes da paciente. Enquanto for nulo,
   * o formulário mostra a busca de paciente no topo e não deixa salvar.
   */
  patient: Patient | null;
  /**
   * Presente = a agenda abriu este formulário: a busca de paciente aparece no topo e quem escolhe
   * volta para o módulo, que resolve o cadastro e devolve as listas já filtradas por ele.
   */
  selecaoDePaciente?: {
    pacientes: Patient[];
    onSelecionar: (paciente: { id?: string; nome: string; contato?: string }) => void;
  };
  /**
   * Data e hora vindas de fora — o clique num espaço vazio da grade. Vence a data de hoje e o
   * horário de agora, mas **não** atropela o palpite de procedimento: o slot sabe o quando, o
   * histórico da paciente sabe o quê.
   */
  sementeDataHora?: { data: DataISO; hora?: string };
  /**
   * Todos os atendimentos da clínica, para o aviso de choque de horário e para os horários livres
   * do "Quando". Ausente = sem aviso e sem a lista de horários.
   */
  atendimentosDaClinica?: Attendance[];
  /**
   * A clínica: o expediente (os dias que abrem e os horários livres do "Quando") e o modelo da
   * mensagem de confirmação no WhatsApp. Ausente = só os campos digitados.
   */
  clinic?: ClinicProfile;
  /**
   * Salas e equipamentos da clínica. Lista vazia = a clínica não usa o conceito, e o campo
   * inteiro some do formulário em vez de virar uma escolha com uma opção só.
   */
  salas?: AgendaSala[];
  /** Se o cadastro dele ainda não existe — o formulário avisa que vai criar ao salvar. */
  cadastroSeraCriado: boolean;
  /** Atendimentos já registrados deste paciente: palpite de procedimento e contagem do plano. */
  atendimentos: Attendance[];
  planos: SessionPlan[];
  /** Orçamentos dele, só para sugerir o total de sessões de um plano novo. */
  quotes: Quote[];
  procedures: Procedure[];
  professionals: Professional[];
  /** Profissional logada — entra pré-selecionada. */
  professionalIdPadrao?: string;
  ultimaAnamnese?: { procedimentoId?: string; procedimentoNome: string };
  /**
   * Em `edicao` e `confirmacao`, o registro que está sendo mexido. Em `novo`, serve só de
   * semente: é assim que "remarcou" abre um agendamento novo já com o procedimento, a
   * profissional e o plano da visita que caiu.
   */
  atendimento?: Attendance | null;
  modo: ModoDoFormulario;
  /** "+ adicionar sessão" de dentro de um plano: o registro nasce amarrado a ele. */
  planoFixoId?: string;
  /**
   * Registrar uma visita que já aconteceu — o atendimento que o acompanhamento da avaliação
   * precisa. Data no futuro viraria agendamento, e acompanhamento é sempre depois da visita;
   * a hora também passa a ser obrigatória.
   */
  soVisitaFeita?: boolean;
  /**
   * `limparConfirmacao` é verdadeiro quando a edição mexeu na data ou na hora: a paciente tinha
   * confirmado **aquele** horário, e manter o selo verde no novo faria a agenda de amanhã mentir.
   * Vale o mesmo para o aviso de ausência e o pedido de outro horário que ela fez pelo link — e
   * também para o agendamento novo de uma remarcação, que herda o link mas não as respostas.
   */
  onSalvar: (
    attendance: Attendance,
    planoNovo?: SessionPlan,
    opcoes?: { limparConfirmacao?: boolean }
  ) => Promise<void>;
}

const DIAS_DA_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** "ter, 29/09" — o dia no botão de agendar. */
const diaCurto = (data: DataISO): string => {
  const d = new Date(`${data}T12:00:00`);
  return `${DIAS_DA_SEMANA[d.getDay()]}, ${data.slice(8, 10)}/${data.slice(5, 7)}`;
};

/** "Dra. Karoline Ferreira" → "Dra. Karoline" — o bastante numa pílula. */
const rotuloCurtoDaProfissional = (nome: string): string => {
  const m = /^(Dra?\.?)\s+(\S+)/i.exec(nome.trim());
  if (m) return `${m[1].replace(/\.?$/, '.')} ${m[2]}`;
  return nome.trim().split(/\s+/)[0] || nome;
};

/** A escolha de mandar a confirmação no WhatsApp fica lembrada no aparelho. */
const CHAVE_DA_CONFIRMACAO = 'lavie:agendar-confirmar-whatsapp';

const lerPreferenciaDeConfirmacao = (): boolean => {
  try {
    return localStorage.getItem(CHAVE_DA_CONFIRMACAO) === '1';
  } catch {
    return false;
  }
};

/** Uma linha do "Quando": horário livre, ocupado ou a pausa do almoço. */
type LinhaDoDia =
  | { tipo: 'livre'; minuto: number; hora: string; ate: string }
  | { tipo: 'ocupado'; minuto: number; hora: string; atendimento: Attendance }
  | { tipo: 'almoco'; minuto: number; hora: string; ate: string };

/** Quantas linhas do dia aparecem antes do "mostrar o dia inteiro". */
const LINHAS_VISIVEIS = 6;

/**
 * Um procedimento da visita, enquanto se preenche. O primeiro vira o principal do registro
 * (`procedureId`/`procedimentoNome`/`planoId`) e os demais, `procedimentosAdicionais`.
 */
interface LinhaDeProcedimento {
  /** Só para o React — a linha não tem identidade no banco. */
  chave: string;
  procedureId?: string;
  procedimentoNome: string;
  /** O plano que veio de fora: o do registro editado ou remarcado, ou o do "+ adicionar sessão". */
  planoDeOrigemId?: string;
  /** "Desvincular" tocado: fica avulso mesmo havendo plano aberto do mesmo procedimento. */
  desvinculado?: boolean;
}

let ultimaChave = 0;
const linhaDeProcedimento = (
  p: Partial<Pick<LinhaDeProcedimento, 'procedureId' | 'procedimentoNome' | 'planoDeOrigemId'>> = {}
): LinhaDeProcedimento => ({
  chave: `proc-${++ultimaChave}`,
  procedureId: p.procedureId,
  procedimentoNome: p.procedimentoNome || '',
  planoDeOrigemId: p.planoDeOrigemId,
});

/**
 * Formulário de uma visita.
 *
 * A natureza do registro sai da data e é mostrada em tempo real: data depois de hoje =
 * agendamento (nasce "agendado" e exige hora); hoje ou antes = atendimento realizado. Quem
 * decide isso é o momento de criar — editar a data depois não transforma um no outro, senão um
 * agendamento resolvido semanas atrás voltaria a pedir desfecho.
 *
 * No redesign, o agendamento se escolhe tocando: os próximos dias abertos em blocos, e os
 * horários do dia numa lista com o que está livre e o que está ocupado — o valor calculado
 * ("termina às 11:00") aparece enquanto se escolhe, e o botão de baixo diz o que vai acontecer.
 * Os campos digitados continuam logo abaixo, para a data que não está nos próximos dias.
 */
export const AttendanceFormModal: React.FC<AttendanceFormModalProps> = ({
  isOpen,
  onClose,
  patient,
  selecaoDePaciente,
  sementeDataHora,
  atendimentosDaClinica,
  clinic,
  salas,
  cadastroSeraCriado,
  atendimentos,
  planos,
  quotes,
  procedures,
  professionals,
  professionalIdPadrao,
  ultimaAnamnese,
  atendimento,
  modo,
  planoFixoId,
  soVisitaFeita,
  onSalvar,
}) => {
  const [data, setData] = useState('');
  const [hora, setHora] = useState('');
  const [procedimentos, setProcedimentos] = useState<LinhaDeProcedimento[]>(() => [
    linhaDeProcedimento(),
  ]);
  /** A linha recém-adicionada, que abre já com o cursor e a lista do catálogo. */
  const [linhaEmFoco, setLinhaEmFoco] = useState<string | null>(null);
  const [professionalId, setProfessionalId] = useState('');
  const [salaId, setSalaId] = useState('');
  /**
   * A duração escolhida por alguém — digitada aqui ou já gravada no registro. `null` = segue a do
   * catálogo (`duracaoSugerida`), que acompanha a troca, a soma e a retirada de procedimentos.
   *
   * Derivada, e não copiada para o campo por um efeito: o efeito rodava na abertura com o valor da
   * abertura anterior e apagava a duração gravada do registro editado.
   */
  const [duracaoDigitada, setDuracaoDigitada] = useState<string | null>(null);
  const [observacoes, setObservacoes] = useState('');
  const [criarPlano, setCriarPlano] = useState(false);
  const [totalSessoes, setTotalSessoes] = useState('');
  /** Para qual procedimento o plano novo é, quando há mais de um sem plano. Ausente = o primeiro. */
  const [chaveDoPlanoNovo, setChaveDoPlanoNovo] = useState('');
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [diaInteiro, setDiaInteiro] = useState(false);
  const [enviarConfirmacao, setEnviarConfirmacao] = useState(lerPreferenciaDeConfirmacao);

  // Cada abertura recomeça do zero: sobras do preenchimento anterior virariam o atendimento de
  // uma paciente lançado na página de outra.
  useEffect(() => {
    if (!isOpen) return;
    setErros({});
    setErroGeral(null);
    setSalvando(false);
    setCriarPlano(false);
    setTotalSessoes('');
    setChaveDoPlanoNovo('');
    setLinhaEmFoco(null);
    setDiaInteiro(false);
    setEnviarConfirmacao(lerPreferenciaDeConfirmacao());

    if (atendimento) {
      // A semente da grade vence a data do registro-modelo: é ela que carrega o horário clicado.
      setData(isoParaData(sementeDataHora?.data || atendimento.data));
      setHora(sementeDataHora?.hora ?? atendimento.hora ?? '');
      // Cada procedimento volta com o plano que já consumia. O "+ adicionar sessão" (raro com
      // registro-semente) continua mandando no principal, como sempre mandou.
      setProcedimentos(
        procedimentosDoAtendimento(atendimento).map((p, i) =>
          linhaDeProcedimento({
            procedureId: p.procedureId,
            procedimentoNome: p.procedimentoNome,
            planoDeOrigemId: (i === 0 && planoFixoId) || p.planoId,
          })
        )
      );
      setProfessionalId(atendimento.professionalId || professionalIdPadrao || '');
      setSalaId(atendimento.salaId || '');
      // Duração já gravada foi escolha de alguém: trocar o procedimento não a reescreve.
      setDuracaoDigitada(atendimento.duracaoMin ? String(atendimento.duracaoMin) : null);
      setObservacoes(atendimento.observacoes || '');
      return;
    }

    // O "+ adicionar sessão" de um plano já sabe o procedimento: é o do plano.
    const planoFixo = planoFixoId ? planos.find((p) => p.id === planoFixoId) : undefined;
    const sugestao = planoFixo
      ? { procedureId: planoFixo.procedureId, procedimentoNome: planoFixo.procedimentoNome }
      : procedimentoSugerido(atendimentos, ultimaAnamnese, procedures);
    setData(isoParaData(sementeDataHora?.data || hojeISO()));
    setHora(sementeDataHora?.hora ?? agoraHHMM());
    setProcedimentos([linhaDeProcedimento({ ...sugestao, planoDeOrigemId: planoFixoId })]);
    setProfessionalId(professionalIdPadrao || '');
    setDuracaoDigitada(null);
    setObservacoes('');
  }, [isOpen, atendimento, professionalIdPadrao, sementeDataHora]); // eslint-disable-line react-hooks/exhaustive-deps

  const dataISO = dataParaISO(data);
  /**
   * Vira agendamento o que ainda vai acontecer: data depois de hoje, ou hoje num horário que
   * ainda não chegou — o encaixe da tarde marcado de manhã, pelo horário livre da tela Hoje. Hoje
   * na hora de agora (o padrão ao abrir) continua sendo a visita que acabou de acontecer.
   */
  const seraAgendamento =
    modo === 'novo' &&
    !!dataISO &&
    (ehDataFutura(dataISO) ||
      (dataISO === hojeISO() && horaValida(hora) && !!hora.trim() && hora.trim() > agoraHHMM()));

  /**
   * A busca de paciente fica aberta enquanto se escolhe — digitar um nome já cria o cadastro
   * provisório lá no módulo, e sem isto o campo sumiria na primeira letra. Fecha ao escolher
   * alguém da lista; "Trocar" reabre.
   */
  const [escolhendoPaciente, setEscolhendoPaciente] = useState(false);
  useEffect(() => {
    if (isOpen) setEscolhendoPaciente(!!selecaoDePaciente && !patient);
    // Só na abertura: depois, quem decide é o toque na lista e o "Trocar".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  /**
   * Os procedimentos no formato do registro, para as contas de horário — só o `procedureId`
   * importa nelas (a duração do catálogo, quando ninguém digitou a sua).
   */
  const principal = procedimentos[0];
  const adicionaisParaHorario = useMemo(
    () =>
      procedimentos
        .slice(1)
        .map((p) => ({ procedureId: p.procedureId, procedimentoNome: p.procedimentoNome })),
    [procedimentos]
  );
  /** Chave estável das escolhas do catálogo, para as contas não refazerem a cada letra digitada. */
  const idsDosProcedimentos = procedimentos.map((p) => p.procedureId || '').join('|');

  /**
   * Quanto o catálogo diz que os procedimentos levam, somados. `undefined` quando nenhum tem
   * duração no catálogo (todos digitados à mão, por exemplo).
   */
  const duracaoSugerida = useMemo(
    () => duracaoDosProcedimentos(procedimentos, procedures),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [idsDosProcedimentos, procedures]
  );

  // Trocar, somar ou tirar procedimento retrás a duração do catálogo — até alguém digitar a sua, e
  // aí ela manda.
  const duracao = duracaoDigitada ?? (duracaoSugerida ? String(duracaoSugerida) : '');
  const duracaoMin = Number(duracao) > 0 ? Number(duracao) : undefined;

  /** "termina às 15:00" — confere o encaixe antes de salvar, sem precisar fazer a conta. */
  const terminaAs = useMemo(() => {
    const intervalo = intervaloDoAtendimento(
      {
        hora,
        duracaoMin,
        procedureId: principal?.procedureId,
        procedimentosAdicionais: adicionaisParaHorario,
      },
      procedures
    );
    return intervalo ? hhmmDeMinutos(intervalo.fimMin) : null;
  }, [hora, duracaoMin, principal?.procedureId, adicionaisParaHorario, procedures]);

  /**
   * Choque de horário da mesma profissional. É **aviso, não trava**: encaixe é decisão da clínica,
   * e um formulário que se recusa a salvar acaba contornado no papel.
   */
  const conflitos = useMemo(() => {
    if (!atendimentosDaClinica || !dataISO || !hora.trim() || !professionalId) return [];
    return conflitosDe(
      {
        id: modo === 'novo' ? undefined : atendimento?.id,
        data: dataISO,
        hora,
        duracaoMin,
        procedureId: principal?.procedureId,
        procedimentosAdicionais: adicionaisParaHorario,
        professionalId,
      },
      atendimentosDaClinica,
      procedures
    );
  }, [
    atendimentosDaClinica,
    dataISO,
    hora,
    professionalId,
    duracaoMin,
    principal?.procedureId,
    adicionaisParaHorario,
    procedures,
    modo,
    atendimento,
  ]);

  /**
   * Choque de **sala**. Ao contrário do de profissional, este **trava o salvamento**: a
   * profissional pode decidir dobrar o próprio horário, mas nenhuma decisão faz o laser atender
   * duas pacientes ao mesmo tempo.
   */
  const conflitosSala = useMemo(() => {
    if (!atendimentosDaClinica || !dataISO || !hora.trim() || !salaId) return [];
    return conflitosDeSala(
      {
        id: modo === 'novo' ? undefined : atendimento?.id,
        data: dataISO,
        hora,
        duracaoMin,
        procedureId: principal?.procedureId,
        procedimentosAdicionais: adicionaisParaHorario,
        salaId,
      },
      atendimentosDaClinica,
      procedures
    );
  }, [
    atendimentosDaClinica,
    dataISO,
    hora,
    salaId,
    duracaoMin,
    principal?.procedureId,
    adicionaisParaHorario,
    procedures,
    modo,
    atendimento,
  ]);

  /**
   * O plano que cada procedimento consome, na ordem das linhas. O que veio de fora (registro
   * editado, remarcação, "+ adicionar sessão") manda; fora isso, o plano aberto do mesmo
   * procedimento é detectado e oferecido — nunca aplicado calado. Um plano serve a uma linha só:
   * o mesmo procedimento digitado duas vezes não conta duas sessões do mesmo plano.
   */
  const planosVinculados = useMemo((): (SessionPlan | undefined)[] => {
    const usados = new Set<string>();
    return procedimentos.map((linha) => {
      if (linha.desvinculado) return undefined;
      const plano = linha.planoDeOrigemId
        ? planos.find((p) => p.id === linha.planoDeOrigemId)
        : linha.procedimentoNome.trim()
        ? planoAbertoPara(planos, linha, usados)
        : undefined;
      if (!plano || usados.has(plano.id)) return undefined;
      usados.add(plano.id);
      return plano;
    });
  }, [procedimentos, planos]);

  /** Em que posição esta sessão entra em cada plano — o número que o aviso mostra antes de salvar. */
  const posicaoNoPlano = (plano: SessionPlan) => {
    const doPlano = atendimentos.filter((a) => pertenceAoPlano(a, plano.id));
    const progresso = progressoDoPlano(plano, doPlano);
    // Editar mantém a posição que ele já ocupa; criar entra depois da última realizada.
    const jaExiste = modo !== 'novo' && atendimento && doPlano.some((a) => a.id === atendimento.id);
    const numero = jaExiste
      ? numeroDaSessao(atendimento!, doPlano) ?? progresso.realizadas
      : progresso.realizadas + 1;
    return { numero, total: progresso.total };
  };

  /**
   * O procedimento que ganha o plano novo, se a pessoa ligar a chave: um dos que ainda não têm
   * plano. Com um só, é ele; com mais de um, o escolhido nas pílulas (o primeiro, de partida).
   */
  const semPlano = procedimentos.filter(
    (linha, i) => !!linha.procedimentoNome.trim() && !planosVinculados[i]
  );
  const alvoDoPlanoNovo = semPlano.find((l) => l.chave === chaveDoPlanoNovo) || semPlano[0];

  /**
   * Quantas sessões o orçamento já vendeu deste procedimento — só como valor inicial do campo
   * quando a pessoa liga o plano. Sugestão, nunca vínculo: plano não depende de orçamento.
   */
  const sugestaoDeSessoes = useMemo(() => {
    if (!alvoDoPlanoNovo) return undefined;
    for (const q of quotes) {
      if (resolveQuoteStatus(q) !== 'pago') continue;
      const item = q.itens.find((i) =>
        mesmoProcedimento(
          { procedureId: i.procedureId, procedimentoNome: i.titulo },
          alvoDoPlanoNovo
        )
      );
      if (item?.maisDeUmaSessao && item.sessoes > 1) return item.sessoes;
    }
    return undefined;
  }, [quotes, alvoDoPlanoNovo]);

  /**
   * O "Quando" de tocar: só para marcar horário — o agendamento novo e a edição de um que ainda
   * não aconteceu. Lançar uma visita passada ou confirmar um comparecimento é com os campos
   * digitados, que continuam logo abaixo.
   */
  const mostrarSeletor =
    !!clinic &&
    (modo === 'novo' || (modo === 'edicao' && atendimento?.status === 'agendado'));

  /** Os próximos cinco dias em que a clínica abre, a partir de hoje — e o dia escolhido, se for outro. */
  const diasSugeridos = useMemo(() => {
    if (!mostrarSeletor || !clinic) return [];
    const hoje = hojeISO();
    const lista: DataISO[] = [];
    for (let i = 0; lista.length < 5 && i < 30; i++) {
      const dia = deslocarDias(hoje, i);
      if (expedienteDoDia(clinic, dia)) lista.push(dia);
    }
    if (dataISO && !lista.includes(dataISO)) {
      lista.pop();
      lista.push(dataISO);
      lista.sort();
    }
    return lista;
  }, [mostrarSeletor, clinic, dataISO]);

  /**
   * Os horários do dia escolhido, em ordem de relógio: livre (até quando), ocupado (por quem) e o
   * almoço. Com uma profissional escolhida, a lista é a agenda **dela** — é a pergunta que se faz
   * ao marcar: "a Karoline tem horário às 10?".
   */
  const linhasDoDia = useMemo((): LinhaDoDia[] => {
    if (!mostrarSeletor || !clinic || !dataISO) return [];
    const expediente = expedienteDoDia(clinic, dataISO);
    if (!expediente) return [];
    const passo = intervaloDaGrade(clinic);
    const almoco = almocoDoDia(clinic, dataISO);
    const ehHoje = dataISO === hojeISO();
    const agora = new Date();
    const minutosAgora = agora.getHours() * 60 + agora.getMinutes();

    const ocupados = (atendimentosDaClinica || [])
      .filter(
        (a) =>
          a.data === dataISO &&
          a.status !== 'faltou' &&
          a.status !== 'remarcado' &&
          (modo === 'novo' || a.id !== atendimento?.id) &&
          (!professionalId || a.professionalId === professionalId)
      )
      .map((a) => ({ atendimento: a, intervalo: intervaloDoAtendimento(a, procedures) }))
      .filter(
        (o): o is { atendimento: Attendance; intervalo: { inicioMin: number; fimMin: number } } =>
          !!o.intervalo
      );

    const linhas: LinhaDoDia[] = [];
    const jaListados = new Set<string>();
    let almocoListado = false;
    for (let m = expediente.abreMin; m + passo <= expediente.fechaMin; m += passo) {
      if (ehHoje && m < minutosAgora) continue;
      const fim = m + passo;
      if (almoco && m < almoco.fimMin && almoco.inicioMin < fim) {
        if (!almocoListado) {
          almocoListado = true;
          linhas.push({
            tipo: 'almoco',
            minuto: m,
            hora: hhmmDeMinutos(Math.max(m, almoco.inicioMin)),
            ate: hhmmDeMinutos(almoco.fimMin),
          });
        }
        continue;
      }
      const ocupando = ocupados.find((o) => m < o.intervalo.fimMin && o.intervalo.inicioMin < fim);
      if (ocupando) {
        if (!jaListados.has(ocupando.atendimento.id)) {
          jaListados.add(ocupando.atendimento.id);
          linhas.push({ tipo: 'ocupado', minuto: m, hora: hhmmDeMinutos(m), atendimento: ocupando.atendimento });
        }
        continue;
      }
      // Livre até o próximo compromisso, o almoço ou o fim do expediente — o que vier antes.
      const limites = [
        expediente.fechaMin,
        ...ocupados.filter((o) => o.intervalo.inicioMin >= fim).map((o) => o.intervalo.inicioMin),
      ];
      if (almoco && almoco.inicioMin >= fim) limites.push(almoco.inicioMin);
      linhas.push({ tipo: 'livre', minuto: m, hora: hhmmDeMinutos(m), ate: hhmmDeMinutos(Math.min(...limites)) });
    }
    return linhas;
  }, [mostrarSeletor, clinic, dataISO, atendimentosDaClinica, professionalId, procedures, modo, atendimento]);

  /** A última vez que a paciente veio — o que o cartão do cabeçalho mostra sob o nome. */
  const ultimaVisita = useMemo(() => {
    const hoje = hojeISO();
    return atendimentos
      .filter((a) => ehRealizado(a) && a.data <= hoje)
      .map((a) => a.data)
      .sort()
      .pop();
  }, [atendimentos]);

  if (!isOpen) return null;

  const mudarProcedimento = (
    chave: string,
    escolha: { procedureId?: string; procedimentoNome: string }
  ) =>
    setProcedimentos((atuais) =>
      atuais.map((l) =>
        l.chave === chave
          ? { ...l, procedureId: escolha.procedureId, procedimentoNome: escolha.procedimentoNome }
          : l
      )
    );

  const adicionarProcedimento = () => {
    const nova = linhaDeProcedimento();
    setProcedimentos((atuais) => [...atuais, nova]);
    setLinhaEmFoco(nova.chave);
  };

  const removerProcedimento = (chave: string) =>
    setProcedimentos((atuais) => atuais.filter((l) => l.chave !== chave));

  const desvincular = (chave: string) =>
    setProcedimentos((atuais) =>
      atuais.map((l) => (l.chave === chave ? { ...l, desvinculado: true } : l))
    );

  const ligarPlano = (ligado: boolean) => {
    setCriarPlano(ligado);
    if (ligado && !totalSessoes && sugestaoDeSessoes) setTotalSessoes(String(sugestaoDeSessoes));
  };

  const contatoDaPaciente = patient?.contato;
  const podeConfirmarNoWhatsApp =
    modo === 'novo' && seraAgendamento && !!clinic && !!buildWhatsAppUrl(contatoDaPaciente);

  const validar = (): Record<string, string> => {
    const novos: Record<string, string> = {};
    if (!data.trim()) novos.data = 'Informe a data.';
    else if (!dataISO) novos.data = 'Essa data não existe no calendário.';

    if (!horaValida(hora)) novos.hora = 'Hora inválida.';
    else if (seraAgendamento && !hora.trim()) novos.hora = 'Agendamento precisa de horário.';
    else if (soVisitaFeita && !hora.trim()) novos.hora = 'Informe o horário da visita.';

    if (soVisitaFeita && seraAgendamento && !novos.data) {
      novos.data = 'A visita precisa já ter acontecido: hoje, num horário que passou, ou antes.';
    }

    if (!procedimentos.some((p) => p.procedimentoNome.trim())) {
      novos.procedimento = 'Informe o procedimento.';
    }

    if (duracao.trim() && !(Number(duracao) >= 5 && Number(duracao) <= 480)) {
      novos.duracao = 'Entre 5 e 480 minutos.';
    }

    if (!patient) novos.paciente = 'Escolha a paciente.';

    // A chave pode ter ficado ligada enquanto o procedimento ganhou um plano aberto — aí o campo
    // sumiu da tela e não há plano novo a validar.
    if (criarPlano && alvoDoPlanoNovo) {
      const total = Number(totalSessoes);
      if (!Number.isInteger(total) || total < 2) {
        novos.plano = 'O plano precisa de um total de 2 sessões ou mais.';
      }
    }
    return novos;
  };

  const salvar = async () => {
    const novos = validar();
    setErros(novos);
    if (Object.keys(novos).length > 0 || !patient) return;

    /* A aba do WhatsApp abre **agora**, ainda dentro do toque: o navegador do celular só deixa
       abrir janela como resposta direta a um toque, e depois do `await` isso já não vale. Ela
       nasce em branco e recebe o endereço quando a gravação confirma — ou fecha, se falhar. */
    const confirmarNoWhatsApp = podeConfirmarNoWhatsApp && enviarConfirmacao;
    const janela = confirmarNoWhatsApp ? window.open('', '_blank') : null;

    setSalvando(true);
    setErroGeral(null);
    try {
      const agora = new Date().toISOString();
      const profissional = professionals.find((p) => p.id === professionalId);

      let planoNovo: SessionPlan | undefined;
      if (criarPlano && alvoDoPlanoNovo) {
        planoNovo = {
          id: `plan-${Date.now()}`,
          pacienteId: patient.id,
          procedureId: alvoDoPlanoNovo.procedureId,
          procedimentoNome: alvoDoPlanoNovo.procedimentoNome.trim(),
          totalSessoes: Number(totalSessoes),
          createdAt: agora,
        };
      }

      // Linha deixada em branco não vira procedimento: o primeiro preenchido é o principal.
      const daVisita: ProcedimentoDaVisita[] = procedimentos
        .map((linha, i) => ({
          procedureId: linha.procedureId,
          procedimentoNome: linha.procedimentoNome.trim(),
          planoId:
            planoNovo && linha.chave === alvoDoPlanoNovo?.chave
              ? planoNovo.id
              : planosVinculados[i]?.id,
        }))
        .filter((p) => p.procedimentoNome);
      const [principalDaVisita, ...adicionais] = daVisita;

      const registro: Attendance = {
        // Em `novo`, `atendimento` é semente e não identidade — reaproveitar o id dele
        // sobrescreveria a visita que serviu de modelo.
        id: modo === 'novo' ? `atd-${Date.now()}` : atendimento!.id,
        pacienteId: patient.id,
        pacienteNome: patient.nome,
        data: dataISO!,
        hora: hora.trim() || undefined,
        duracaoMin,
        procedureId: principalDaVisita.procedureId,
        procedimentoNome: principalDaVisita.procedimentoNome,
        planoId: principalDaVisita.planoId,
        procedimentosAdicionais: adicionais.length > 0 ? adicionais : undefined,
        professionalId: professionalId || undefined,
        salaId: salaId || undefined,
        profissionalNome: profissional?.name,
        observacoes: observacoes.trim() || undefined,
        // O link que a paciente recebeu. Em `novo` a semente é sempre uma remarcação (é o único
        // caminho que passa `atendimento` aí), e o agendamento novo fica com o mesmo endereço.
        linkToken: atendimento?.linkToken,
        // Natureza congelada na criação. Confirmar resolve o agendamento; editar não mexe nela.
        status:
          modo === 'confirmacao'
            ? 'compareceu'
            : modo === 'novo'
            ? seraAgendamento
              ? 'agendado'
              : undefined
            : atendimento?.status,
        // Guarda o horário que estava marcado, para o caso de a pessoa ter chegado noutro.
        agendadoPara:
          modo === 'confirmacao'
            ? atendimento?.agendadoPara ||
              `${atendimento?.data}T${atendimento?.hora || '00:00'}:00`
            : modo === 'edicao'
            ? atendimento?.agendadoPara
            : undefined,
        createdAt: modo === 'novo' ? agora : atendimento?.createdAt || agora,
      };

      const horarioMudou =
        modo === 'edicao' &&
        (registro.data !== atendimento?.data || (registro.hora || '') !== (atendimento?.hora || ''));

      const temRespostaDaPaciente =
        !!atendimento?.confirmadoEm ||
        !!atendimento?.avisoAusenciaEm ||
        !!atendimento?.pedidoRemarcacao;
      await onSalvar(registro, planoNovo, {
        limparConfirmacao:
          (temRespostaDaPaciente && horarioMudou) ||
          // Remarcação que herdou o link: o agendamento novo começa sem resposta nenhuma.
          (modo === 'novo' && !!atendimento?.linkToken) ||
          // O link guarda o que a paciente respondeu para o horário antigo, mesmo sem selo.
          (!!atendimento?.linkToken && horarioMudou),
      });

      if (confirmarNoWhatsApp && clinic) {
        const link = buildWhatsAppUrl(
          contatoDaPaciente,
          mensagemDeConfirmacao(clinic, registro, procedures)
        );
        if (link && janela) janela.location.href = link;
        else if (link) window.open(link, '_blank', 'noopener,noreferrer');
      }
      onClose();
    } catch (e) {
      janela?.close();
      setErroGeral(`Não foi possível salvar: ${(e as Error).message}`);
    } finally {
      setSalvando(false);
    }
  };

  const titulo =
    modo === 'confirmacao'
      ? 'Confirmar atendimento'
      : modo === 'edicao'
      ? 'Editar atendimento'
      : seraAgendamento
      ? 'Novo agendamento'
      : 'Novo atendimento';

  /** O botão diz o que vai acontecer — "Agendar · ter, 29/09 às 10:00". */
  const textoDoBotao = salvando
    ? 'Salvando…'
    : modo === 'confirmacao'
    ? 'Confirmar comparecimento'
    : modo === 'edicao'
    ? 'Salvar alterações'
    : seraAgendamento
    ? `Agendar${dataISO ? ` · ${diaCurto(dataISO)}` : ''}${hora.trim() ? ` às ${hora.trim()}` : ''}`
    : 'Salvar atendimento';

  /* A paciente no cabeçalho preto: quem é, e quando veio pela última vez. "Trocar" só existe
     quando a paciente foi escolhida aqui (fluxo da agenda). */
  const cabecalho = patient && !escolhendoPaciente ? (
    <div className="flex items-center gap-3 rounded-2xl bg-cream/8 px-3 py-2.5">
      <Avatar nome={patient.nome} tamanho={38} tom="ouro" />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-bold text-white truncate">{patient.nome}</p>
        <p className="text-[12px] text-cream/75 truncate">
          {cadastroSeraCriado
            ? 'O cadastro é criado ao salvar'
            : ultimaVisita
            ? `Última visita ${formatDateShortYear(ultimaVisita)}`
            : 'Primeira visita'}
        </p>
      </div>
      {selecaoDePaciente && (
        <button
          type="button"
          onClick={() => {
            setEscolhendoPaciente(true);
            selecaoDePaciente.onSelecionar({ nome: '' });
          }}
          className="shrink-0 min-h-[40px] px-2 text-[13px] font-semibold text-brand-pale hover:text-white transition-colors"
        >
          Trocar
        </button>
      )}
    </div>
  ) : undefined;

  const linhasVisiveis = (() => {
    if (diaInteiro || linhasDoDia.length <= LINHAS_VISIVEIS) return linhasDoDia;
    // A janela começa um horário antes do escolhido, para ele não abrir colado no topo.
    const escolhido = linhasDoDia.findIndex((l) => l.hora === hora.trim());
    const inicio = Math.max(0, Math.min(escolhido - 1, linhasDoDia.length - LINHAS_VISIVEIS));
    return linhasDoDia.slice(inicio, inicio + LINHAS_VISIVEIS);
  })();

  return (
    <SidePanel
      aberto={isOpen}
      onFechar={onClose}
      titulo={titulo}
      sobretitulo={selecaoDePaciente ? 'Agenda' : 'Pacientes'}
      cabecalho={cabecalho}
      bloqueado={salvando}
      rodape={
        <BotaoPrincipal
          onClick={salvar}
          disabled={salvando || !patient || conflitosSala.length > 0}
        >
          {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {textoDoBotao}
        </BotaoPrincipal>
      }
    >
      <div className="px-5 sm:px-6 py-5 flex flex-col gap-4">
        {erroGeral && (
          <AvisoTinta tom="erro" icone={AlertCircle}>
            {erroGeral}
          </AvisoTinta>
        )}

        {/* Quem só existe como nome num orçamento ganha o cadastro aqui, sem parar a recepção
            para preencher formulário com a cliente na frente. */}
        {cadastroSeraCriado && (
          <AvisoTinta icone={UserPlus}>
            O cadastro de {patient?.nome} será criado ao salvar este atendimento.
          </AvisoTinta>
        )}

        {/* Fluxo da agenda: o horário veio primeiro, a paciente vem aqui. */}
        {selecaoDePaciente && (escolhendoPaciente || !patient) && (
          <div>
            <PatientSearchSelect
              patients={selecaoDePaciente.pacientes}
              pacienteId={patient?.id}
              pacienteNome={patient?.nome || ''}
              onSelect={(escolha) => {
                selecaoDePaciente.onSelecionar(escolha);
                if (escolha.id) setEscolhendoPaciente(false);
              }}
            />
            {erros.paciente && (
              <p className="mt-1 px-1 text-[13px] font-medium text-danger">{erros.paciente}</p>
            )}
          </div>
        )}

        {/* Os procedimentos da visita. Mais de um no mesmo horário (botox + preenchimento) é
            um agendamento só: a duração soma, e cada um entra no plano dele. */}
        <div className="flex flex-col gap-2">
          {procedimentos.map((linha, i) => (
            <ProcedureSearchSelect
              key={linha.chave}
              id={i === 0 ? 'atendimento-procedimento' : `atendimento-${linha.chave}`}
              rotulo={procedimentos.length > 1 ? `${i + 1}º procedimento` : 'Procedimento'}
              procedures={procedures}
              procedureId={linha.procedureId}
              nome={linha.procedimentoNome}
              onSelect={(escolha) => mudarProcedimento(linha.chave, escolha)}
              onRemover={i > 0 ? () => removerProcedimento(linha.chave) : undefined}
              autoFocus={linha.chave === linhaEmFoco}
              erro={i === 0 ? erros.procedimento : undefined}
            />
          ))}
          <button
            type="button"
            onClick={adicionarProcedimento}
            className="self-start inline-flex items-center gap-1.5 min-h-[40px] px-1 text-[14px] font-semibold text-ink hover:underline underline-offset-2"
          >
            <Plus className="w-4 h-4" />
            Adicionar outro procedimento
          </button>
        </div>

        <div>
          <RotuloTinta>Profissional</RotuloTinta>
          {professionals.length === 0 ? (
            <p className="text-[13px] text-ink-soft">
              Nenhuma profissional cadastrada nas configurações da clínica.
            </p>
          ) : (
            <PilulasDeEscolha
              rotulo="Profissional"
              opcoes={professionals.map((p) => ({
                id: p.id,
                rotulo: rotuloCurtoDaProfissional(p.name),
                cor: corDaProfissional(p.id),
              }))}
              valor={professionalId}
              onMudar={setProfessionalId}
              permiteDesmarcar
            />
          )}
        </div>

        {/* QUANDO — os dias e os horários de tocar. */}
        {mostrarSeletor && (
          <div>
            <RotuloTinta>Quando</RotuloTinta>
            <div className="grid grid-cols-5 gap-1.5">
              {diasSugeridos.map((dia) => {
                const ativo = dia === dataISO;
                const d = new Date(`${dia}T12:00:00`);
                return (
                  <button
                    key={dia}
                    type="button"
                    aria-pressed={ativo}
                    aria-label={diaCurto(dia)}
                    onClick={() => {
                      setData(isoParaData(dia));
                      setDiaInteiro(false);
                    }}
                    className={`h-[58px] rounded-[14px] flex flex-col items-center justify-center transition-colors ${
                      ativo ? 'bg-ink text-white' : 'bg-line-soft text-ink hover:bg-[#E6E2DA]'
                    }`}
                  >
                    <span className={`text-[12px] font-medium ${ativo ? 'text-white/80' : 'text-ink-soft'}`}>
                      {dia === hojeISO() ? 'hoje' : DIAS_DA_SEMANA[d.getDay()]}
                    </span>
                    <span className="text-[17px] font-bold tabular-nums leading-tight">{d.getDate()}</span>
                  </button>
                );
              })}
            </div>

            {dataISO && clinic && !expedienteDoDia(clinic, dataISO) ? (
              <p className="mt-2 px-1 text-[13px] text-ink-soft">
                A clínica não abre neste dia — encaixe continua possível pelo horário digitado abaixo.
              </p>
            ) : dataISO && linhasDoDia.length === 0 ? (
              <p className="mt-2 px-1 text-[13px] text-ink-soft">
                Nenhum horário sobrando neste dia{professionalId ? ' para esta profissional' : ''}.
              </p>
            ) : (
              <div className="flex flex-col mt-1.5">
                {linhasVisiveis.map((linha) => {
                  if (linha.tipo === 'almoco') {
                    return (
                      <div
                        key={`almoco-${linha.hora}`}
                        className="h-12 flex items-center justify-between border-b border-ink/8 text-[15px] font-semibold text-muted"
                      >
                        <span className="tabular-nums">{linha.hora}</span>
                        <span className="text-[13px] font-medium">almoço até {linha.ate}</span>
                      </div>
                    );
                  }
                  if (linha.tipo === 'ocupado') {
                    const a = linha.atendimento;
                    return (
                      <div
                        key={`ocupado-${a.id}`}
                        className="h-12 flex items-center justify-between gap-3 border-b border-ink/8 text-[15px] font-semibold text-muted"
                      >
                        <span className="line-through tabular-nums">{linha.hora}</span>
                        <span className="text-[13px] font-medium truncate">
                          ocupado · {a.profissionalNome ? rotuloCurtoDaProfissional(a.profissionalNome) : a.pacienteNome}
                        </span>
                      </div>
                    );
                  }
                  const escolhido = linha.hora === hora.trim();
                  return escolhido ? (
                    <button
                      key={`livre-${linha.hora}`}
                      type="button"
                      aria-pressed
                      className="h-[52px] my-1 px-3.5 rounded-[14px] bg-ink text-white flex items-center justify-between text-[15px] font-bold"
                    >
                      <span className="tabular-nums">
                        {linha.hora}
                        {terminaAs ? ` – ${terminaAs}` : ''}
                      </span>
                      <Check className="w-[18px] h-[18px]" />
                    </button>
                  ) : (
                    <button
                      key={`livre-${linha.hora}`}
                      type="button"
                      onClick={() => setHora(linha.hora)}
                      className="h-12 flex items-center justify-between gap-3 border-b border-ink/8 text-[15px] font-semibold text-ink text-left hover:bg-line-soft/60 transition-colors"
                    >
                      <span className="tabular-nums">{linha.hora}</span>
                      <span className="text-[13px] font-medium text-ink-soft">livre até {linha.ate}</span>
                    </button>
                  );
                })}
                {linhasDoDia.length > LINHAS_VISIVEIS && (
                  <button
                    type="button"
                    onClick={() => setDiaInteiro((v) => !v)}
                    className="self-start mt-1 min-h-[40px] text-[14px] font-semibold text-ink underline underline-offset-2"
                  >
                    {diaInteiro ? 'Mostrar menos horários' : `Mostrar o dia inteiro (${linhasDoDia.length} horários)`}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* A data, a hora e a duração digitadas — o caminho de sempre, e o único para a data que
            não está nos próximos dias ou para a visita que já aconteceu. */}
        <div>
          {mostrarSeletor && <RotuloTinta>Ou digite a data e a hora</RotuloTinta>}
          <div className="grid grid-cols-3 gap-2">
            <CampoDeDataComCalendario
              id="atendimento-data"
              label="Data"
              value={data}
              onChange={setData}
              erro={erros.data}
              autoFocus={!selecaoDePaciente && !mostrarSeletor}
              // A visita que leva ao relatório já aconteceu: o calendário não oferece o futuro.
              maximo={soVisitaFeita ? hojeISO() : undefined}
            />
            <MaskedTimeInput
              id="atendimento-hora"
              label={seraAgendamento ? 'Hora' : 'Hora (opcional)'}
              value={hora}
              onChange={setHora}
              erro={erros.hora}
            />
            {/* A duração é o que dá altura ao cartão na agenda e o que deixa ver buraco livre.
                Vem do catálogo e fica editável — a mesma sessão leva tempos diferentes. */}
            <CampoTinta
              rotulo="Duração"
              htmlFor="atendimento-duracao"
              erro={erros.duracao}
              ajuda={!erros.duracao && terminaAs ? `até ${terminaAs}` : undefined}
              sufixo={<span className="text-[13px] font-semibold text-ink-soft shrink-0">min</span>}
              className="[&>label]:px-3.5"
            >
              <input
                id="atendimento-duracao"
                type="text"
                inputMode="numeric"
                value={duracao}
                onChange={(e) => {
                  setDuracaoDigitada(e.target.value.replace(/\D/g, '').slice(0, 3));
                }}
                placeholder={String(AGENDA_DEFAULTS.duracaoMin)}
                className={`${INPUT_TINTA} tabular-nums`}
              />
            </CampoTinta>
          </div>
        </div>

        {/* A natureza do registro, ao vivo — some a dúvida de "isso vai virar agendamento?" */}
        {seraAgendamento && !mostrarSeletor && (
          <AvisoTinta tom="alerta" icone={CalendarClock}>
            Data no futuro — será salvo como <strong>agendamento</strong>, e você marca
            compareceu, faltou ou remarcou depois.
          </AvisoTinta>
        )}

        {/* Aviso, não trava: quem decide abrir um encaixe é a clínica, não o formulário. */}
        {conflitos.length > 0 && (
          <AvisoTinta tom="alerta" icone={Users}>
            <strong>Choque de horário.</strong>{' '}
            {conflitos[0].profissionalNome || 'A profissional'} já tem {conflitos[0].pacienteNome}{' '}
            às {conflitos[0].hora}
            {conflitos.length > 1 && ' e mais ' + (conflitos.length - 1)}. Dá para salvar assim
            mesmo, se for encaixe.
          </AvisoTinta>
        )}

        {/* Sala/equipamento. Só aparece quando a clínica cadastrou alguma. */}
        {!!salas?.length && (
          <div>
            <RotuloTinta>Sala ou equipamento</RotuloTinta>
            <PilulasDeEscolha
              rotulo="Sala ou equipamento"
              opcoes={salas.map((s) => ({ id: s.id, rotulo: s.nome }))}
              valor={salaId}
              onMudar={setSalaId}
              permiteDesmarcar
            />
          </div>
        )}

        {/* Trava, não aviso: ver `conflitosSala`. */}
        {conflitosSala.length > 0 && (
          <AvisoTinta tom="erro" icone={DoorClosed}>
            <strong>Sala ocupada.</strong> {conflitosSala[0].pacienteNome} já está nesta sala às{' '}
            {conflitosSala[0].hora}
            {conflitosSala.length > 1 && ' (e mais ' + (conflitosSala.length - 1) + ')'}. Troque o
            horário ou a sala para salvar.
          </AvisoTinta>
        )}

        {/* Plano, por procedimento: ou o vínculo detectado, ou a oferta de criar um. Nunca os dois
            para o mesmo procedimento — digitar um total novo enquanto existe plano aberto não teria
            significado claro (criaria um segundo plano paralelo ou mexeria nas outras sessões sem
            avisar). */}
        {procedimentos.map((linha, i) => {
          const plano = planosVinculados[i];
          if (!plano) return null;
          const posicao = posicaoNoPlano(plano);
          return (
            <div
              key={`plano-${linha.chave}`}
              className="rounded-2xl bg-card border border-ink/10 px-4 py-3 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-ink-soft">Plano em andamento</p>
                {/* O nome longo encurta; o número da sessão, que é o que se confere, nunca. */}
                <p className="flex gap-1 text-[15px] font-bold text-ink">
                  <span className="truncate">{plano.procedimentoNome}</span>
                  <span className="shrink-0 tabular-nums">
                    · {posicao.numero}ª de {posicao.total}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => desvincular(linha.chave)}
                aria-label={`Desvincular do plano de ${plano.procedimentoNome}`}
                className="shrink-0 inline-flex items-center gap-1.5 h-10 px-3 rounded-full text-[13px] font-semibold text-ink-soft hover:text-danger hover:bg-danger-bg transition-colors"
              >
                <Link2Off className="w-4 h-4" />
                Desvincular
              </button>
            </div>
          );
        })}
        {(semPlano.length > 0 || !procedimentos.some((p) => p.procedimentoNome.trim())) && (
          <div className="rounded-2xl bg-card border border-ink/10 px-4 py-3.5 flex flex-col gap-3">
            <Interruptor
              ligado={criarPlano}
              onMudar={ligarPlano}
              rotulo="Plano de sessões"
              descricao="Para pacotes contínuos — as sessões seguintes entram neste plano sozinhas."
            />
            {criarPlano && semPlano.length > 1 && (
              <PilulasDeEscolha
                rotulo="Plano de qual procedimento"
                compacta
                opcoes={semPlano.map((l) => ({ id: l.chave, rotulo: l.procedimentoNome.trim() }))}
                valor={alvoDoPlanoNovo?.chave || ''}
                onMudar={(chave) => chave && setChaveDoPlanoNovo(chave)}
              />
            )}
            {criarPlano && (
              <CampoTinta
                rotulo="Total de sessões"
                htmlFor="atendimento-total-sessoes"
                erro={erros.plano}
                ajuda={sugestaoDeSessoes ? 'Sugerido pelo orçamento pago desta cliente.' : undefined}
                className="max-w-[200px]"
              >
                <input
                  id="atendimento-total-sessoes"
                  type="text"
                  inputMode="numeric"
                  value={totalSessoes}
                  onChange={(e) => setTotalSessoes(e.target.value.replace(/\D/g, '').slice(0, 3))}
                  placeholder="10"
                  className={`${INPUT_TINTA} tabular-nums`}
                />
              </CampoTinta>
            )}
          </div>
        )}

        <CampoTinta rotulo="Observações" htmlFor="atendimento-observacoes">
          <textarea
            id="atendimento-observacoes"
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            rows={2}
            placeholder="Parâmetros usados, reação da paciente, o que combinar para a próxima"
            className={`${INPUT_TINTA} resize-y leading-snug font-medium`}
          />
        </CampoTinta>

        {/* A confirmação sai no mesmo gesto de agendar, quando a pessoa quer. A escolha fica
            lembrada neste aparelho. */}
        {modo === 'novo' && seraAgendamento && !!clinic && (
          <Interruptor
            ligado={podeConfirmarNoWhatsApp && enviarConfirmacao}
            disabled={!podeConfirmarNoWhatsApp}
            onMudar={(ligado) => {
              setEnviarConfirmacao(ligado);
              try {
                localStorage.setItem(CHAVE_DA_CONFIRMACAO, ligado ? '1' : '0');
              } catch {
                // Sem armazenamento, a escolha vale só para este agendamento.
              }
            }}
            rotulo="Enviar confirmação no WhatsApp"
            descricao={
              podeConfirmarNoWhatsApp
                ? 'Abre a conversa com a mensagem de confirmação pronta, logo depois de agendar.'
                : patient
                ? 'Sem telefone no cadastro desta paciente.'
                : 'Escolha a paciente primeiro.'
            }
          />
        )}
      </div>
    </SidePanel>
  );
};

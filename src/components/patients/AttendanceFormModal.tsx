import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarClock,
  Check,
  DoorClosed,
  Link2Off,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  AgendaSala,
  Attendance,
  Patient,
  Procedure,
  Professional,
  Quote,
  SessionPlan,
} from '../../types';
import {
  MaskedDateInput,
  MaskedTimeInput,
  dataParaISO,
  horaValida,
  isoParaData,
} from '../common/MaskedDateTimeInput';
import { ProcedureSearchSelect } from '../common/ProcedureSearchSelect';
import { PatientSearchSelect } from '../quotes/PatientSearchSelect';
import {
  agoraHHMM,
  DataISO,
  ehDataFutura,
  hojeISO,
  mesmoProcedimento,
  numeroDaSessao,
  planoAbertoPara,
  procedimentoSugerido,
  progressoDoPlano,
} from '../../utils/attendances';
import {
  AGENDA_DEFAULTS,
  conflitosDe,
  conflitosDeSala,
  duracaoDoProcedimento,
  hhmmDeMinutos,
  intervaloDoAtendimento,
} from '../../utils/agenda';
import { resolveQuoteStatus } from '../../utils/quoteCalc';
import { SidePanel } from '../common/SidePanel';

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
   * Todos os atendimentos da clínica, para o aviso de choque de horário. Ausente = sem aviso (a
   * aba do paciente só tem os dele, e conflito é pergunta sobre a agenda inteira).
   */
  atendimentosDaClinica?: Attendance[];
  /**
   * Salas e equipamentos da clínica. Lista vazia = a clínica não usa o conceito, e o campo
   * inteiro some do formulário em vez de virar um select com uma opção só.
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
   * `limparConfirmacao` é verdadeiro quando a edição mexeu na data ou na hora: a paciente tinha
   * confirmado **aquele** horário, e manter o selo verde no novo faria a agenda de amanhã mentir.
   */
  onSalvar: (
    attendance: Attendance,
    planoNovo?: SessionPlan,
    opcoes?: { limparConfirmacao?: boolean }
  ) => Promise<void>;
}

const labelClass = 'block text-label font-semibold uppercase tracking-wider text-gray-400 mb-1';

const TITULO: Record<ModoDoFormulario, string> = {
  novo: 'Novo atendimento',
  edicao: 'Editar atendimento',
  confirmacao: 'Confirmar atendimento',
};

/**
 * Formulário de uma visita.
 *
 * A natureza do registro sai da data e é mostrada em tempo real no alto: data depois de hoje =
 * agendamento (nasce "agendado" e exige hora); hoje ou antes = atendimento realizado. Quem
 * decide isso é o momento de criar — editar a data depois não transforma um no outro, senão um
 * agendamento resolvido semanas atrás voltaria a pedir desfecho.
 */
export const AttendanceFormModal: React.FC<AttendanceFormModalProps> = ({
  isOpen,
  onClose,
  patient,
  selecaoDePaciente,
  sementeDataHora,
  atendimentosDaClinica,
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
  onSalvar,
}) => {
  const [data, setData] = useState('');
  const [hora, setHora] = useState('');
  const [procedimento, setProcedimento] = useState<{
    procedureId?: string;
    procedimentoNome: string;
  }>({ procedimentoNome: '' });
  const [professionalId, setProfessionalId] = useState('');
  const [salaId, setSalaId] = useState('');
  const [duracao, setDuracao] = useState('');
  /** Uma vez digitada à mão, a duração para de ser reescrita pela troca de procedimento. */
  const [duracaoTocada, setDuracaoTocada] = useState(false);
  const [observacoes, setObservacoes] = useState('');
  const [criarPlano, setCriarPlano] = useState(false);
  const [totalSessoes, setTotalSessoes] = useState('');
  const [desvinculado, setDesvinculado] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Cada abertura recomeça do zero: sobras do preenchimento anterior virariam o atendimento de
  // uma paciente lançado na página de outra.
  useEffect(() => {
    if (!isOpen) return;
    setErros({});
    setErroGeral(null);
    setSalvando(false);
    setCriarPlano(false);
    setTotalSessoes('');
    setDesvinculado(false);
    setDuracaoTocada(false);

    if (atendimento) {
      // A semente da grade vence a data do registro-modelo: é ela que carrega o horário clicado.
      setData(isoParaData(sementeDataHora?.data || atendimento.data));
      setHora(sementeDataHora?.hora ?? atendimento.hora ?? '');
      setProcedimento({
        procedureId: atendimento.procedureId,
        procedimentoNome: atendimento.procedimentoNome,
      });
      setProfessionalId(atendimento.professionalId || professionalIdPadrao || '');
      setSalaId(atendimento.salaId || '');
      setDuracao(atendimento.duracaoMin ? String(atendimento.duracaoMin) : '');
      // Duração já gravada foi escolha de alguém: trocar o procedimento não a reescreve.
      setDuracaoTocada(!!atendimento.duracaoMin);
      setObservacoes(atendimento.observacoes || '');
      return;
    }

    const sugestao = procedimentoSugerido(atendimentos, ultimaAnamnese, procedures);
    setData(isoParaData(sementeDataHora?.data || hojeISO()));
    setHora(sementeDataHora?.hora ?? agoraHHMM());
    setProcedimento(sugestao || { procedimentoNome: '' });
    setProfessionalId(professionalIdPadrao || '');
    setDuracao('');
    setObservacoes('');
  }, [isOpen, atendimento, professionalIdPadrao, sementeDataHora]); // eslint-disable-line react-hooks/exhaustive-deps

  const dataISO = dataParaISO(data);
  const seraAgendamento = modo === 'novo' && !!dataISO && ehDataFutura(dataISO);

  /** Quanto o catálogo diz que este procedimento leva. `undefined` para procedimento digitado. */
  const duracaoSugerida = useMemo(
    () =>
      procedimento.procedureId
        ? duracaoDoProcedimento(
            procedures.find((p) => p.id === procedimento.procedureId)?.duration
          )
        : undefined,
    [procedimento.procedureId, procedures]
  );

  // Trocar o procedimento retrás a duração do catálogo — até alguém digitar a sua, e aí ela manda.
  useEffect(() => {
    if (!isOpen || duracaoTocada) return;
    setDuracao(duracaoSugerida ? String(duracaoSugerida) : '');
  }, [isOpen, duracaoTocada, duracaoSugerida]);

  const duracaoMin = Number(duracao) > 0 ? Number(duracao) : undefined;

  /** "termina às 15:00" — confere o encaixe antes de salvar, sem precisar fazer a conta. */
  const terminaAs = useMemo(() => {
    const intervalo = intervaloDoAtendimento(
      { hora, duracaoMin, procedureId: procedimento.procedureId },
      procedures
    );
    return intervalo ? hhmmDeMinutos(intervalo.fimMin) : null;
  }, [hora, duracaoMin, procedimento.procedureId, procedures]);

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
        procedureId: procedimento.procedureId,
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
    procedimento.procedureId,
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
        procedureId: procedimento.procedureId,
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
    procedimento.procedureId,
    procedures,
    modo,
    atendimento,
  ]);

  /**
   * O plano que vai receber esta sessão. O "+ adicionar sessão" fixa um; fora dele, o plano
   * aberto do mesmo procedimento é detectado e oferecido — nunca aplicado calado.
   */
  const planoVinculado = useMemo(() => {
    if (desvinculado) return undefined;
    if (planoFixoId) return planos.find((p) => p.id === planoFixoId);
    if (atendimento?.planoId) return planos.find((p) => p.id === atendimento.planoId);
    if (!procedimento.procedimentoNome.trim()) return undefined;
    return planoAbertoPara(planos, procedimento);
  }, [desvinculado, planoFixoId, planos, atendimento, procedimento]);

  /** Em que posição esta sessão entra — o número que o aviso mostra antes de salvar. */
  const posicaoNoPlano = useMemo(() => {
    if (!planoVinculado) return null;
    const doPlano = atendimentos.filter((a) => a.planoId === planoVinculado.id);
    const progresso = progressoDoPlano(planoVinculado, doPlano);
    // Editar mantém a posição que ele já ocupa; criar entra depois da última realizada.
    const jaExiste = atendimento && doPlano.some((a) => a.id === atendimento.id);
    const numero = jaExiste
      ? numeroDaSessao(atendimento!, doPlano) ?? progresso.realizadas
      : progresso.realizadas + 1;
    return { numero, total: progresso.total };
  }, [planoVinculado, atendimentos, atendimento]);

  /**
   * Quantas sessões o orçamento já vendeu deste procedimento — só como valor inicial do campo
   * quando a pessoa liga o plano. Sugestão, nunca vínculo: plano não depende de orçamento.
   */
  const sugestaoDeSessoes = useMemo(() => {
    if (!procedimento.procedimentoNome.trim()) return undefined;
    for (const q of quotes) {
      if (resolveQuoteStatus(q) !== 'aceito') continue;
      const item = q.itens.find((i) =>
        mesmoProcedimento(
          { procedureId: i.procedureId, procedimentoNome: i.titulo },
          procedimento
        )
      );
      if (item?.maisDeUmaSessao && item.sessoes > 1) return item.sessoes;
    }
    return undefined;
  }, [quotes, procedimento]);

  if (!isOpen) return null;

  const ligarPlano = (ligado: boolean) => {
    setCriarPlano(ligado);
    if (ligado && !totalSessoes && sugestaoDeSessoes) setTotalSessoes(String(sugestaoDeSessoes));
  };

  const validar = (): Record<string, string> => {
    const novos: Record<string, string> = {};
    if (!data.trim()) novos.data = 'Informe a data.';
    else if (!dataISO) novos.data = 'Essa data não existe no calendário.';

    if (!horaValida(hora)) novos.hora = 'Hora inválida.';
    else if (seraAgendamento && !hora.trim()) novos.hora = 'Agendamento precisa de horário.';

    if (!procedimento.procedimentoNome.trim()) novos.procedimento = 'Informe o procedimento.';

    if (duracao.trim() && !(Number(duracao) >= 5 && Number(duracao) <= 480)) {
      novos.duracao = 'Entre 5 e 480 minutos.';
    }

    if (!patient) novos.paciente = 'Escolha a paciente.';

    if (criarPlano) {
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

    setSalvando(true);
    setErroGeral(null);
    try {
      const agora = new Date().toISOString();
      const profissional = professionals.find((p) => p.id === professionalId);

      let planoNovo: SessionPlan | undefined;
      if (criarPlano) {
        planoNovo = {
          id: `plan-${Date.now()}`,
          pacienteId: patient.id,
          procedureId: procedimento.procedureId,
          procedimentoNome: procedimento.procedimentoNome.trim(),
          totalSessoes: Number(totalSessoes),
          createdAt: agora,
        };
      }

      const registro: Attendance = {
        // Em `novo`, `atendimento` é semente e não identidade — reaproveitar o id dele
        // sobrescreveria a visita que serviu de modelo.
        id: modo === 'novo' ? `atd-${Date.now()}` : atendimento!.id,
        pacienteId: patient.id,
        pacienteNome: patient.nome,
        data: dataISO!,
        hora: hora.trim() || undefined,
        duracaoMin,
        procedureId: procedimento.procedureId,
        procedimentoNome: procedimento.procedimentoNome.trim(),
        planoId: planoNovo?.id || planoVinculado?.id,
        professionalId: professionalId || undefined,
        salaId: salaId || undefined,
        profissionalNome: profissional?.name,
        observacoes: observacoes.trim() || undefined,
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

      await onSalvar(registro, planoNovo, {
        limparConfirmacao: !!atendimento?.confirmadoEm && horarioMudou,
      });
      onClose();
    } catch (e) {
      setErroGeral(`Não foi possível salvar: ${(e as Error).message}`);
    } finally {
      setSalvando(false);
    }
  };

  /* O rodapé é montado fora do JSX principal porque o `SidePanel` o recebe por prop: ele
     precisa ficar fixo abaixo da área que rola, e não no fim do conteúdo rolável. */
  const rodape = (
    <div className="flex items-center justify-end gap-3">
      <button
        type="button"
        onClick={onClose}
        disabled={salvando}
        className="min-h-[44px] px-4 text-body font-semibold uppercase tracking-widest text-muted hover:text-ink transition-colors disabled:opacity-50"
      >
        Cancelar
      </button>
      <button
        type="button"
        onClick={salvar}
        disabled={salvando || !patient || conflitosSala.length > 0}
        className="flex items-center gap-2 min-h-[44px] px-5 rounded-xl bg-brand text-white text-body font-semibold uppercase tracking-widest transition-colors disabled:opacity-60"
      >
        <Check className="w-4 h-4" />
        {salvando ? 'Salvando...' : seraAgendamento ? 'Agendar' : 'Salvar'}
      </button>
    </div>
  );

  return (
    <SidePanel
      aberto={isOpen}
      onFechar={onClose}
      titulo={TITULO[modo]}
      sobretitulo={patient?.nome || 'Escolha a paciente'}
      bloqueado={salvando}
      rodape={rodape}
    >
      <div className="p-4 sm:p-5 space-y-4">
          {erroGeral && (
            <div className="px-3 py-2 rounded-sm bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {erroGeral}
            </div>
          )}

          {/* Quem só existe como nome num orçamento ganha o cadastro aqui, sem parar a recepção
              para preencher formulário com a cliente na frente. */}
          {cadastroSeraCriado && (
            <div className="px-3 py-2 rounded-sm bg-brand/10 border border-brand/25 text-xs text-brand-hover flex items-start gap-2">
              <UserPlus className="w-3.5 h-3.5 shrink-0 mt-px" />
              <span>O cadastro de {patient?.nome} será criado ao salvar este atendimento.</span>
            </div>
          )}

          {/* Fluxo da agenda: o horário veio primeiro, a paciente vem aqui. */}
          {selecaoDePaciente && (
            <div>
              <PatientSearchSelect
                patients={selecaoDePaciente.pacientes}
                pacienteId={patient?.id}
                pacienteNome={patient?.nome || ''}
                onSelect={selecaoDePaciente.onSelecionar}
              />
              {erros.paciente && (
                <p className="mt-1 text-body text-red-600">{erros.paciente}</p>
              )}
            </div>
          )}

          {/* A natureza do registro, ao vivo — some a dúvida de "isso vai virar agendamento?" */}
          {seraAgendamento && (
            <div className="px-3 py-2 rounded-sm bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
              <CalendarClock className="w-3.5 h-3.5 shrink-0 mt-px" />
              <span>
                Data no futuro — será salvo como <strong>agendamento</strong>, e você marca
                compareceu, faltou ou remarcou depois.
              </span>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <MaskedDateInput
              id="atendimento-data"
              label="Data *"
              value={data}
              onChange={setData}
              erro={erros.data}
              autoFocus={!selecaoDePaciente}
            />
            <MaskedTimeInput
              id="atendimento-hora"
              label={seraAgendamento ? 'Hora *' : 'Hora'}
              value={hora}
              onChange={setHora}
              erro={erros.hora}
              ajuda={seraAgendamento ? undefined : 'Opcional'}
            />
            {/* A duração é o que dá altura ao cartão na agenda e o que deixa ver buraco livre.
                Vem do catálogo e fica editável — a mesma sessão leva tempos diferentes. */}
            <div>
              <label className={labelClass} htmlFor="atendimento-duracao">
                Duração
              </label>
              <div className="relative">
                <input
                  id="atendimento-duracao"
                  type="text"
                  inputMode="numeric"
                  value={duracao}
                  onChange={(e) => {
                    setDuracaoTocada(true);
                    setDuracao(e.target.value.replace(/\D/g, '').slice(0, 3));
                  }}
                  placeholder={String(AGENDA_DEFAULTS.duracaoMin)}
                  className="w-full glass-input pl-3 pr-9 py-2 rounded-sm text-sm text-ink tabular-nums focus:outline-hidden"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-body text-gray-400 pointer-events-none">
                  min
                </span>
              </div>
              {erros.duracao ? (
                <p className="mt-1 text-body text-red-600">{erros.duracao}</p>
              ) : (
                terminaAs && <p className="mt-1 text-body text-gray-400">até {terminaAs}</p>
              )}
            </div>
          </div>

          {/* Aviso, não trava: quem decide abrir um encaixe é a clínica, não o formulário. */}
          {conflitos.length > 0 && (
            <div className="px-3 py-2 rounded-sm bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
              <Users className="w-3.5 h-3.5 shrink-0 mt-px" />
              <span>
                <strong>Choque de horário.</strong>{' '}
                {conflitos[0].profissionalNome || 'A profissional'} já tem {conflitos[0].pacienteNome}{' '}
                às {conflitos[0].hora}
                {conflitos.length > 1 && ' e mais ' + (conflitos.length - 1)}. Dá para salvar assim
                mesmo, se for encaixe.
              </span>
            </div>
          )}

          {/* Sala/equipamento. Só aparece quando a clínica cadastrou alguma. */}
          {!!salas?.length && (
            <div>
              <label className={labelClass} htmlFor="atendimento-sala">
                Sala / equipamento
              </label>
              <select
                id="atendimento-sala"
                value={salaId}
                onChange={(e) => setSalaId(e.target.value)}
                className="w-full glass-input px-3 py-2 rounded-sm text-sm text-ink focus:outline-hidden"
              >
                <option value="">Nenhuma</option>
                {salas.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Trava, não aviso: ver `conflitosSala`. */}
          {conflitosSala.length > 0 && (
            <div className="px-3 py-2 rounded-sm bg-danger-bg border border-danger-line text-body text-danger flex items-start gap-2">
              <DoorClosed className="w-3.5 h-3.5 shrink-0 mt-px" />
              <span>
                <strong>Sala ocupada.</strong> {conflitosSala[0].pacienteNome} já está nesta sala
                às {conflitosSala[0].hora}
                {conflitosSala.length > 1 && ' (e mais ' + (conflitosSala.length - 1) + ')'}. Troque
                o horário ou a sala para salvar.
              </span>
            </div>
          )}

          <ProcedureSearchSelect
            procedures={procedures}
            procedureId={procedimento.procedureId}
            nome={procedimento.procedimentoNome}
            onSelect={setProcedimento}
            erro={erros.procedimento}
          />

          {/* Plano: ou o vínculo detectado, ou a oferta de criar um. Nunca os dois — digitar um
              total novo enquanto existe plano aberto não teria significado claro (criaria um
              segundo plano paralelo ou mexeria nas outras sessões sem avisar). */}
          {planoVinculado ? (
            <div className="px-3 py-2.5 rounded-sm bg-white/70 border border-brand/25 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-label font-semibold uppercase tracking-wider text-brand">
                  Plano em andamento
                </p>
                <p className="text-xs text-ink truncate">
                  {planoVinculado.procedimentoNome} —{' '}
                  <strong className="tabular-nums">
                    {posicaoNoPlano?.numero}ª de {posicaoNoPlano?.total}
                  </strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDesvinculado(true)}
                className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm text-body font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
              >
                <Link2Off className="w-3.5 h-3.5" />
                Desvincular
              </button>
            </div>
          ) : (
            <div className="px-3 py-2.5 rounded-sm bg-white/50 border border-white/80">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={criarPlano}
                  onChange={(e) => ligarPlano(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-brand"
                />
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-ink">
                    Plano de sessões
                  </span>
                  <span className="block text-body text-gray-400">
                    Para pacotes contínuos — as sessões seguintes entram neste plano sozinhas.
                  </span>
                </span>
              </label>

              {criarPlano && (
                <div className="mt-3 pl-7">
                  <label className={labelClass} htmlFor="atendimento-total-sessoes">
                    Total de sessões
                  </label>
                  <input
                    id="atendimento-total-sessoes"
                    type="text"
                    inputMode="numeric"
                    value={totalSessoes}
                    onChange={(e) => setTotalSessoes(e.target.value.replace(/\D/g, '').slice(0, 3))}
                    placeholder="10"
                    className="w-24 glass-input px-3 py-2 rounded-sm text-sm text-ink tabular-nums focus:outline-hidden"
                  />
                  {erros.plano && <p className="mt-1 text-body text-red-600">{erros.plano}</p>}
                  {!erros.plano && sugestaoDeSessoes && (
                    <p className="mt-1 text-body text-gray-400">
                      Sugerido pelo orçamento aceito desta cliente.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <div>
            <span className={labelClass}>Quem atendeu</span>
            {professionals.length === 0 ? (
              <p className="text-xs text-gray-400">
                Nenhuma profissional cadastrada nas configurações da clínica.
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                {professionals.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setProfessionalId(professionalId === p.id ? '' : p.id)}
                    className={`px-3 py-2 rounded-sm text-xs font-medium border transition-colors ${
                      professionalId === p.id
                        ? 'bg-ink text-white border-ink'
                        : 'bg-white/70 text-gray-600 border-gray-200 hover:border-brand/40'
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className={labelClass} htmlFor="atendimento-observacoes">
              Observações
            </label>
            <textarea
              id="atendimento-observacoes"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={3}
              placeholder="Parâmetros usados, reação da paciente, o que combinar para a próxima"
              className="w-full glass-input px-3 py-2 rounded-sm text-sm text-ink resize-y focus:outline-hidden"
            />
          </div>
      </div>
    </SidePanel>
  );
};

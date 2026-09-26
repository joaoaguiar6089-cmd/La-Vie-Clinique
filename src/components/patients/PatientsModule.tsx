import React, { useEffect, useMemo, useState } from 'react';
import {
  AnamnesisQuestion,
  AnamnesisRecord,
  AnamnesisTemplate,
  Attendance,
  ClinicProfile,
  EvaluationRecord,
  Patient,
  PedidoDeNavegacao,
  Procedure,
  Quote,
  SessionPlan,
} from '../../types';
import {
  subscribeToPatients,
  subscribeToAnamnesisRecords,
  subscribeToQuotes,
  subscribeToGeneralQuestions,
  subscribeToAttendances,
  subscribeToSessionPlans,
  subscribeToRegistrosDeFicha,
  savePatient,
  deletePatient,
  saveAnamnesisRecord,
  deleteAnamnesisRecord,
  saveAttendance,
  deleteAttendance,
  saveSessionPlan,
  deleteSessionPlan,
} from '../../services/databaseService';
import {
  chaveDoNome,
  LinhaDePaciente,
  montarLinhasDePacientes,
  pacienteProvisorio,
} from '../../utils/patientsPanel';
import { instanteDoAtendimento } from '../../utils/attendances';
import { salasDaClinica } from '../../utils/agenda';
import { ConfirmDialog, ConfirmRequest } from '../ConfirmDialog';
import { PatientsListView } from './PatientsListView';
import { PatientDetailView } from './PatientDetailView';
import { NewPatientModal } from './NewPatientModal';
import { AttendanceFormModal, ModoDoFormulario } from './AttendanceFormModal';
import { FichaFillModal } from '../fichas/FichaFillModal';
import { alvoDoAtendimento, dependentesDoAtendimento } from '../../utils/fichasClinicas';
import { salvarAtendimento } from '../../services/attendanceWorkflow';

interface PatientsModuleProps {
  clinic: ClinicProfile;
  catalogProcedures: Procedure[];
  /** Assinadas no App — o catálogo e a anamnese também precisam delas. */
  templates: AnamnesisTemplate[];
  /** Profissional logada, para os formulários já virem preenchidos com ela. */
  currentProfessionalId?: string;
  /** Pedido vindo da busca global ou da tela Hoje: abrir a ficha de alguém, cadastrar alguém. */
  pedido?: PedidoDeNavegacao | null;
  onPedidoAtendido?: () => void;
}

/** O que o formulário de atendimento está fazendo neste instante. */
interface EstadoDoFormulario {
  modo: ModoDoFormulario;
  /** Registro sendo editado/confirmado — ou a semente, quando `modo === 'novo'`. */
  atendimento?: Attendance | null;
  /** "+ adicionar sessão": o registro nasce amarrado a este plano. */
  planoFixoId?: string;
}

/**
 * Seção "Pacientes": a lista de nomes e, ao abrir um deles, a página com os dados pessoais e o
 * histórico de atendimentos, anamneses e orçamentos.
 *
 * Todas as coleções vêm das assinaturas compartilhadas (ver `sharedSubscription.ts`), então
 * abrir esta seção não custa um snapshot novo quando a anamnese ou os orçamentos já estiveram
 * abertos nesta sessão.
 */
export const PatientsModule: React.FC<PatientsModuleProps> = ({
  clinic,
  catalogProcedures,
  templates,
  currentProfessionalId,
  pedido,
  onPedidoAtendido,
}) => {
  /** Visita cujo acompanhamento (com os materiais usados) está aberto. */
  const [acompanhando, setAcompanhando] = useState<Attendance | null>(null);
  /** Avaliações da paciente aberta — lidas só enquanto a página dela está na tela. */
  const [avaliacoes, setAvaliacoes] = useState<EvaluationRecord[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [records, setRecords] = useState<AnamnesisRecord[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [sessionPlans, setSessionPlans] = useState<SessionPlan[]>([]);
  const [generalQuestions, setGeneralQuestions] = useState<AnamnesisQuestion[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [pacienteAbertoId, setPacienteAbertoId] = useState<string | null>(null);
  const [cadastroAberto, setCadastroAberto] = useState(false);
  const [nomeDoCadastro, setNomeDoCadastro] = useState<string | undefined>(undefined);
  const [formAtendimento, setFormAtendimento] = useState<EstadoDoFormulario | null>(null);
  const [confirmacao, setConfirmacao] = useState<ConfirmRequest | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  /** Só os cadastros por completar — o quadro âmbar da lista, ou a pendência vinda da Hoje. */
  const [soPendentes, setSoPendentes] = useState(false);

  useEffect(() => {
    const unsubPacientes = subscribeToPatients(
      (data) => {
        setPatients(data);
        setCarregando(false);
      },
      // Sem isso, uma falha de rede deixaria a lista presa em "Carregando..." para sempre.
      () => setCarregando(false)
    );
    const unsubFichas = subscribeToAnamnesisRecords(setRecords);
    const unsubOrcamentos = subscribeToQuotes(setQuotes);
    const unsubPerguntas = subscribeToGeneralQuestions(setGeneralQuestions);
    // As duas coleções novas caem no `allow ... if false` do catch-all enquanto as regras não
    // subirem; o erro fica no console e o resto da seção continua de pé.
    const unsubAtendimentos = subscribeToAttendances(setAttendances, (e) =>
      setErro(`Não foi possível carregar os atendimentos: ${e.message}`)
    );
    const unsubPlanos = subscribeToSessionPlans(setSessionPlans);

    return () => {
      unsubPacientes();
      unsubFichas();
      unsubOrcamentos();
      unsubPerguntas();
      unsubAtendimentos();
      unsubPlanos();
    };
  }, []);

  /**
   * A lista não é só `patients`: quem recebeu um orçamento avulso (nome digitado na hora, sem
   * cadastro) também aparece, marcado como pendente. Ver `utils/patientsPanel.ts`.
   */
  const linhas = useMemo(
    () => montarLinhasDePacientes({ patients, records, quotes, atendimentos: attendances }),
    [patients, records, quotes, attendances]
  );

  /**
   * Quem não tem cadastro abre a página como qualquer outro, com um cadastro provisório montado
   * do nome. Nada é gravado por isso: o documento em `patients` só nasce quando a equipe salva os
   * dados pessoais ali — ou quando lança o primeiro atendimento — e aí já com este id.
   */
  const pacienteAberto = useMemo(() => {
    if (!pacienteAbertoId) return null;
    const cadastrado = patients.find((p) => p.id === pacienteAbertoId);
    if (cadastrado) return cadastrado;
    const linha = linhas.find((l) => l.id === pacienteAbertoId);
    return linha ? pacienteProvisorio(linha) : null;
  }, [pacienteAbertoId, patients, linhas]);

  const idsCadastrados = useMemo(() => new Set(patients.map((p) => p.id)), [patients]);

  /**
   * As avaliações dela, por consulta por paciente — e não a coleção inteira, que carrega
   * respostas e anotações de todo mundo. Quem ainda não tem cadastro não tem avaliação: emitir
   * uma pede o cadastro antes.
   */
  const pacienteAbertoCadastrado = !!pacienteAberto && idsCadastrados.has(pacienteAberto.id);
  useEffect(() => {
    if (!pacienteAberto || !pacienteAbertoCadastrado) {
      setAvaliacoes([]);
      return;
    }
    return subscribeToRegistrosDeFicha('avaliacao', { pacienteId: pacienteAberto.id }, setAvaliacoes);
  }, [pacienteAberto?.id, pacienteAbertoCadastrado]);

  /** O cadastro dele ainda não existe — o formulário de atendimento avisa que vai criá-lo. */
  const cadastroSeraCriado = !!pacienteAberto && !idsCadastrados.has(pacienteAberto.id);

  /**
   * O histórico de quem está com a página aberta. O vínculo por id resolve o caso normal; o nome
   * cobre os documentos que não têm a quem apontar — o orçamento avulso, emitido antes de o
   * cadastro existir, e a ficha cujo cadastro foi excluído depois. Sem isso a página de quem
   * ainda não tem cadastro abriria vazia, justamente a de quem só tem histórico.
   */
  const doPacienteAberto = useMemo(() => {
    if (!pacienteAberto) {
      return { fichas: [], orcamentos: [], atendimentos: [], planos: [] };
    }
    const chave = chaveDoNome(pacienteAberto.nome);
    const dele = (doc: { pacienteId?: string; pacienteNome?: string }) =>
      doc.pacienteId === pacienteAberto.id ||
      (!idsCadastrados.has(doc.pacienteId || '') &&
        chaveDoNome(doc.pacienteNome || '') === chave);

    return {
      fichas: records.filter(dele),
      orcamentos: quotes.filter(dele),
      atendimentos: attendances
        .filter(dele)
        .sort((a, b) => instanteDoAtendimento(b) - instanteDoAtendimento(a)),
      planos: sessionPlans.filter((p) => p.pacienteId === pacienteAberto.id),
    };
  }, [records, quotes, attendances, sessionPlans, pacienteAberto, idsCadastrados]);

  /** O palpite de procedimento quando o paciente ainda não tem atendimento nenhum. */
  const ultimaAnamnese = useMemo(() => {
    const maisRecente = [...doPacienteAberto.fichas].sort((a, b) =>
      (b.createdAt || '').localeCompare(a.createdAt || '')
    )[0];
    return maisRecente
      ? {
          procedimentoId: maisRecente.procedimentoId,
          procedimentoNome: maisRecente.procedimentoNome,
        }
      : undefined;
  }, [doPacienteAberto.fichas]);

  const abrirCadastro = (nomeInicial?: string) => {
    setNomeDoCadastro(nomeInicial);
    setCadastroAberto(true);
  };

  /**
   * Atende o pedido de quem chegou de fora — a busca global escolhendo uma paciente, ou
   * "Nova paciente". Consome e avisa, para não reagir de novo a cada render.
   */
  useEffect(() => {
    if (!pedido) return;
    if (pedido.pacienteId) setPacienteAbertoId(pedido.pacienteId);
    if (pedido.filtro === 'pendentes') {
      setPacienteAbertoId(null);
      setSoPendentes(true);
    }
    if (pedido.criarNovo) abrirCadastro();
    onPedidoAtendido?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido?.nonce]);

  // ==========================================
  // ATENDIMENTOS
  // ==========================================

  /**
   * Grava a visita e tudo o que ela arrasta junto — cadastro de quem só existia como nome, plano
   * novo do formulário e o fechamento das anamneses da visita.
   *
   * A sequência mora em `services/attendanceWorkflow.ts` porque a agenda é um segundo lugar de onde se
   * lança atendimento, e duas cópias dela acabariam divergindo. As fichas já estão aqui em memória,
   * então vão junto e poupam a leitura que o workflow faria sozinho.
   */
  const handleSalvarAtendimento = async (
    registro: Attendance,
    planoNovo?: SessionPlan,
    opcoes?: { limparConfirmacao?: boolean }
  ) => {
    await salvarAtendimento({
      registro,
      planoNovo,
      pacienteACriar:
        pacienteAberto && !idsCadastrados.has(pacienteAberto.id) ? pacienteAberto : undefined,
      anamneses: records,
      limparConfirmacao: opcoes?.limparConfirmacao,
    });
  };


  const abrirFormulario = (estado: EstadoDoFormulario) => {
    setErro(null);
    setFormAtendimento(estado);
  };

  /** Desfecho sem formulário: só o status muda. */
  const marcarStatus = async (a: Attendance, status: Attendance['status']) => {
    try {
      await saveAttendance({ ...a, status });
      setErro(null);
    } catch (e) {
      setErro(`Não foi possível atualizar o agendamento: ${(e as Error).message}`);
    }
  };

  /**
   * Remarcar fecha este agendamento como `remarcado` e abre outro com os mesmos dados, menos a
   * data e a hora — que são justamente o que a pessoa vai escolher de novo.
   */
  const handleRemarcar = async (a: Attendance) => {
    await marcarStatus(a, 'remarcado');
    abrirFormulario({
      modo: 'novo',
      atendimento: { ...a, data: '', hora: undefined },
    });
  };

  const pedirExclusaoDeAtendimento = (a: Attendance) => {
    setConfirmacao({
      titulo: 'Excluir este atendimento?',
      mensagem: `${a.procedimentoNome} — ${a.data.split('-').reverse().join('/')}.\n\nO registro e as observações${
        dependentesDoAtendimento(a) ? `${dependentesDoAtendimento(a)},` : ''
      } somem para sempre. Se ele fazia parte de um plano, as sessões seguintes são renumeradas sozinhas.`,
      textoConfirmar: 'Excluir atendimento',
      onConfirmar: async () => {
        try {
          await deleteAttendance(a);
          setErro(null);
        } catch (e) {
          setErro(`Não foi possível excluir o atendimento: ${(e as Error).message}`);
        }
      },
    });
  };

  const alternarEncerramentoDoPlano = async (plano: SessionPlan, encerrar: boolean) => {
    try {
      await saveSessionPlan({
        ...plano,
        // String vazia e não `undefined`: `cleanForFirestore` descarta o undefined e o
        // `merge: true` deixaria o encerramento antigo intacto, reabrindo nada.
        encerradoEm: encerrar ? new Date().toISOString() : '',
      });
      setErro(null);
    } catch (e) {
      setErro(`Não foi possível atualizar o plano: ${(e as Error).message}`);
    }
  };

  const pedirExclusaoDoPlano = (plano: SessionPlan) => {
    const doPlano = attendances.filter((a) => a.planoId === plano.id);
    setConfirmacao({
      titulo: `Excluir o plano de ${plano.procedimentoNome}?`,
      mensagem:
        doPlano.length === 0
          ? 'O plano não tem nenhuma sessão registrada, então nada mais sai junto.'
          : `As ${doPlano.length} sessões continuam no histórico, viram atendimentos avulsos e perdem a numeração. O que se perde é o agrupamento e o total contratado.`,
      textoConfirmar: 'Excluir plano',
      onConfirmar: async () => {
        try {
          await deleteSessionPlan(plano.id, doPlano);
          setErro(null);
        } catch (e) {
          setErro(`Não foi possível excluir o plano: ${(e as Error).message}`);
        }
      },
    });
  };

  /**
   * Excluir apaga o cadastro, e só ele. Fichas, orçamentos e atendimentos são documentos
   * próprios, com link já enviado à paciente no caso do orçamento — some com o cadastro e o nome
   * volta para a lista como pendente, com o histórico intacto. O aviso diz isso antes, em vez de
   * a equipe descobrir depois.
   */
  const pedirExclusao = (linha: LinhaDePaciente) => {
    if (!linha.patient) return;
    const { totalAnamneses: fichas, totalOrcamentos: orcamentos, totalAtendimentos } = linha;
    const temHistorico = fichas > 0 || orcamentos > 0 || totalAtendimentos > 0;

    setConfirmacao({
      titulo: `Excluir o cadastro de ${linha.nome}?`,
      mensagem: temHistorico
        ? `Os dados pessoais são apagados para sempre.\n\n${totalAtendimentos} atendimento${
            totalAtendimentos === 1 ? '' : 's'
          }, ${fichas} ficha${fichas === 1 ? '' : 's'} de anamnese e ${orcamentos} orçamento${
            orcamentos === 1 ? '' : 's'
          } continuam no sistema — os links já enviados seguem valendo. Por causa deles, o nome volta a aparecer nesta lista marcado como "sem cadastro".`
        : 'Os dados pessoais são apagados para sempre. Este paciente não tem nenhum atendimento, ficha ou orçamento, então nada mais sai junto.',
      textoConfirmar: 'Excluir cadastro',
      onConfirmar: async () => {
        try {
          await deletePatient(linha.patient!.id);
          setErro(null);
        } catch (e) {
          setErro(`Não foi possível excluir o cadastro: ${(e as Error).message}`);
        }
      },
    });
  };

  const bannerDeErro = erro && (
    <div className="max-w-3xl mx-auto px-5 sm:px-8 pt-6">
      <p className="px-4 py-3 rounded-[14px] bg-danger-bg text-[14px] text-danger">{erro}</p>
    </div>
  );

  if (pacienteAberto) {
    return (
      <>
        {bannerDeErro}

        <PatientDetailView
          patient={pacienteAberto}
          records={doPacienteAberto.fichas}
          quotes={doPacienteAberto.orcamentos}
          atendimentos={doPacienteAberto.atendimentos}
          planos={doPacienteAberto.planos}
          avaliacoes={avaliacoes}
          todosPacientes={patients}
          templates={templates}
          generalQuestions={generalQuestions}
          clinic={clinic}
          catalogProcedures={catalogProcedures}
          currentProfessionalId={currentProfessionalId}
          onVoltar={() => setPacienteAbertoId(null)}
          onSalvarPaciente={savePatient}
          onSalvarFicha={saveAnamnesisRecord}
          onExcluirFicha={deleteAnamnesisRecord}
          onNovoAtendimento={() => abrirFormulario({ modo: 'novo' })}
          onEditarAtendimento={(a) => abrirFormulario({ modo: 'edicao', atendimento: a })}
          onExcluirAtendimento={pedirExclusaoDeAtendimento}
          onConfirmarAtendimento={(a) =>
            abrirFormulario({ modo: 'confirmacao', atendimento: a })
          }
          onAcompanhamentoAtendimento={setAcompanhando}
          onFaltouAtendimento={(a) => marcarStatus(a, 'faltou')}
          onRemarcarAtendimento={handleRemarcar}
          onAdicionarSessao={(planoId) => abrirFormulario({ modo: 'novo', planoFixoId: planoId })}
          onEncerrarPlano={(p) => alternarEncerramentoDoPlano(p, true)}
          onReabrirPlano={(p) => alternarEncerramentoDoPlano(p, false)}
          onExcluirPlano={pedirExclusaoDoPlano}
        />

        {/* `atendimentosDaClinica` sai de graça: a aba já assina a coleção inteira, e choque de
            horário é pergunta sobre a agenda toda, não sobre este paciente. */}
        <AttendanceFormModal
          isOpen={!!formAtendimento}
          onClose={() => setFormAtendimento(null)}
          patient={pacienteAberto}
          atendimentosDaClinica={attendances}
          salas={salasDaClinica(clinic)}
          cadastroSeraCriado={cadastroSeraCriado}
          atendimentos={doPacienteAberto.atendimentos}
          planos={doPacienteAberto.planos}
          quotes={doPacienteAberto.orcamentos}
          procedures={catalogProcedures}
          professionals={clinic.professionals || []}
          professionalIdPadrao={currentProfessionalId}
          ultimaAnamnese={ultimaAnamnese}
          atendimento={formAtendimento?.atendimento}
          modo={formAtendimento?.modo || 'novo'}
          planoFixoId={formAtendimento?.planoFixoId}
          onSalvar={handleSalvarAtendimento}
        />

        {acompanhando && (
          <FichaFillModal
            tipo="acompanhamento"
            isOpen
            onClose={() => setAcompanhando(null)}
            alvo={alvoDoAtendimento(acompanhando)}
            paciente={pacienteAberto}
            catalogo={catalogProcedures}
            professionals={clinic.professionals || []}
            clinicProfile={clinic}
          />
        )}

        <ConfirmDialog pedido={confirmacao} onFechar={() => setConfirmacao(null)} />
      </>
    );
  }

  return (
    <>
      {bannerDeErro}

      <PatientsListView
        linhas={linhas}
        carregando={carregando}
        soPendentes={soPendentes}
        onSoPendentes={setSoPendentes}
        onAbrirPaciente={setPacienteAbertoId}
        onNovoPaciente={abrirCadastro}
        onExcluirPaciente={pedirExclusao}
      />

      <NewPatientModal
        isOpen={cadastroAberto}
        onClose={() => setCadastroAberto(false)}
        patients={patients}
        nomeInicial={nomeDoCadastro}
        onSalvar={savePatient}
        // Recém-cadastrado, o passo seguinte é quase sempre a primeira ficha ou o orçamento —
        // então a página dele já abre. O Firestore entrega a gravação ao snapshot local antes
        // mesmo de confirmar com o servidor, então o paciente já está na lista aqui.
        onSalvo={(novo) => setPacienteAbertoId(novo.id)}
      />

      <ConfirmDialog pedido={confirmacao} onFechar={() => setConfirmacao(null)} />
    </>
  );
};

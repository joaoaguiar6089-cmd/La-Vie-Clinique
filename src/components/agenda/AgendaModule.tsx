import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import {
  Attendance,
  ClinicProfile,
  Patient,
  Procedure,
  Professional,
  Quote,
  SessionPlan,
} from '../../types';
import {
  deleteAttendance,
  remarcarAtendimento,
  saveAttendance,
  subscribeToQuotes,
  subscribeToSessionPlans,
} from '../../services/databaseService';
import { salvarAtendimento } from '../../services/attendanceWorkflow';
import {
  AgendaVisao,
  AGENDA_VISAO_STORAGE_KEY,
  agendamentosAtrasados,
  dataCurta,
  deslocarDias,
  deslocarMeses,
  diasDaSemanaDe,
  diasDoMesDe,
  diasVisiveisDaSemana,
} from '../../utils/agenda';
import { DataISO, hojeISO, progressoDoPlano, numeroDaSessao } from '../../utils/attendances';
import { ConfirmDialog, ConfirmRequest } from '../ConfirmDialog';
import { AttendanceFormModal, ModoDoFormulario } from '../patients/AttendanceFormModal';
import { AgendaToolbar } from './AgendaToolbar';
import { AgendaGradeView } from './AgendaGradeView';
import { AgendaMesView } from './AgendaMesView';
import { AgendaPendencias } from './AgendaPendencias';
import { AgendaDetalheModal } from './AgendaDetalheModal';

/**
 * A agenda da clínica.
 *
 * Não é um módulo de dados novo: `attendances` já é a coleção dos agendamentos, já vem assinada no
 * `App` e já nasceu como coleção raiz **por causa desta tela** — o comentário em
 * `databaseService.ts` diz isso com todas as letras. O que existe aqui é uma leitura nova dos
 * mesmos documentos, e é por isso que a agenda não custa uma leitura a mais do Firestore.
 *
 * O formulário é o mesmo da aba do paciente (`AttendanceFormModal`). A única diferença é a ordem:
 * lá a paciente vem primeiro e o horário depois; aqui o horário vem do clique na grade e a paciente
 * é escolhida dentro do formulário.
 */

interface AgendaModuleProps {
  clinic: ClinicProfile;
  catalogProcedures: Procedure[];
  /** Assinados no App — a agenda não abre assinatura própria para eles. */
  atendimentos: Attendance[];
  pacientes: Patient[];
  professionals: Professional[];
  /**
   * Profissional logada — entra pré-selecionada no formulário. **Não** filtra a grade por padrão:
   * quem abre a agenda precisa ver a clínica inteira para saber se a sala está livre.
   */
  currentProfessionalId?: string;
}

/** O que o formulário está fazendo agora. */
interface EstadoDoFormulario {
  modo: ModoDoFormulario;
  atendimento?: Attendance | null;
  semente?: { data: DataISO; hora?: string };
}

const visaoInicial = (): AgendaVisao => {
  try {
    const guardada = localStorage.getItem(AGENDA_VISAO_STORAGE_KEY);
    if (guardada === 'dia' || guardada === 'semana' || guardada === 'mes') return guardada;
  } catch {
    // Navegador com armazenamento bloqueado: cai no padrão por tamanho de tela.
  }
  // No celular a semana não cabe sem rolar — quem abre no balcão quer o dia mesmo.
  return typeof window !== 'undefined' && window.innerWidth < 640 ? 'dia' : 'semana';
};

export const AgendaModule: React.FC<AgendaModuleProps> = ({
  clinic,
  catalogProcedures,
  atendimentos,
  pacientes,
  professionals,
  currentProfessionalId,
}) => {
  const hoje = hojeISO();

  const [visao, setVisao] = useState<AgendaVisao>(visaoInicial);
  const [dataFoco, setDataFoco] = useState<DataISO>(hoje);
  const [filtroProfissionalId, setFiltroProfissionalId] = useState('');

  const [planos, setPlanos] = useState<SessionPlan[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);

  const [formulario, setFormulario] = useState<EstadoDoFormulario | null>(null);
  const [pacienteDoForm, setPacienteDoForm] = useState<Patient | null>(null);
  const [detalhe, setDetalhe] = useState<Attendance | null>(null);
  const [arrastando, setArrastando] = useState<Attendance | null>(null);
  const [confirmacao, setConfirmacao] = useState<ConfirmRequest | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // Os planos alimentam o "3ª de 10" do cartão, então são precisos o tempo todo.
  useEffect(() => subscribeToSessionPlans(setPlanos, (e) => setErro(e.message)), []);

  /**
   * Os orçamentos servem a **uma** coisa: sugerir o total de sessões quando alguém liga um plano
   * novo no formulário. Quem abriu a agenda só para olhar o dia não deve pagar a leitura da coleção
   * inteira, então ela só é assinada enquanto o formulário está aberto.
   */
  const formularioAberto = !!formulario;
  useEffect(() => {
    if (!formularioAberto) return;
    return subscribeToQuotes(setQuotes);
  }, [formularioAberto]);

  useEffect(() => {
    try {
      localStorage.setItem(AGENDA_VISAO_STORAGE_KEY, visao);
    } catch {
      // Sem armazenamento, a preferência vale só para esta sessão. Não é motivo para quebrar nada.
    }
  }, [visao]);

  // ==========================================
  // O QUE A TELA MOSTRA
  // ==========================================

  const visiveis = useMemo(
    () =>
      filtroProfissionalId
        ? atendimentos.filter((a) => a.professionalId === filtroProfissionalId)
        : atendimentos,
    [atendimentos, filtroProfissionalId]
  );

  const dias = useMemo(() => {
    if (visao === 'dia') return [dataFoco];
    if (visao === 'mes') return diasDoMesDe(dataFoco);
    // Domingo fechado e vazio não rouba largura das colunas que interessam.
    return diasVisiveisDaSemana(diasDaSemanaDe(dataFoco), visiveis, clinic);
  }, [visao, dataFoco, visiveis, clinic]);

  /**
   * "3ª de 10" por atendimento.
   *
   * O número nunca é gravado — é a posição da visita entre as realizadas do mesmo plano. Para o que
   * ainda está agendado não existe posição, então mostramos a que ele **vai** ocupar.
   */
  const rotulosDePlano = useMemo(() => {
    const rotulos = new Map<string, string>();
    const porPlano = new Map<string, Attendance[]>();
    atendimentos.forEach((a) => {
      if (!a.planoId) return;
      const lista = porPlano.get(a.planoId) || [];
      lista.push(a);
      porPlano.set(a.planoId, lista);
    });

    planos.forEach((plano) => {
      const doPlano = porPlano.get(plano.id) || [];
      const progresso = progressoDoPlano(plano, doPlano);
      doPlano.forEach((a) => {
        const numero = numeroDaSessao(a, doPlano) ?? (a.status === 'agendado' ? progresso.realizadas + 1 : undefined);
        if (numero) rotulos.set(a.id, `${numero}ª de ${plano.totalSessoes}`);
      });
    });
    return rotulos;
  }, [atendimentos, planos]);

  const pendentes = useMemo(() => agendamentosAtrasados(visiveis), [visiveis]);

  // ==========================================
  // NAVEGAÇÃO
  // ==========================================

  const passo = visao === 'mes' ? 0 : visao === 'semana' ? 7 : 1;
  const andar = (sentido: 1 | -1) =>
    setDataFoco((atual) =>
      visao === 'mes' ? deslocarMeses(atual, sentido) : deslocarDias(atual, passo * sentido)
    );

  const irParaDia = (data: DataISO) => {
    setDataFoco(data);
    setVisao('dia');
  };

  // ==========================================
  // O PACIENTE DO FORMULÁRIO
  // ==========================================

  /**
   * O cadastro por trás de um atendimento. Quando ele não existe mais (ou nunca existiu, no caso de
   * quem só aparece como nome), monta-se um provisório com o **mesmo id** que o atendimento já
   * aponta — assim salvar recria o cadastro sem órfão nem id novo.
   */
  const pacienteDe = (a: Attendance): Patient =>
    pacientes.find((p) => p.id === a.pacienteId) || {
      id: a.pacienteId,
      nome: a.pacienteNome,
      createdAt: a.createdAt || new Date().toISOString(),
    };

  const cadastroSeraCriado =
    !!pacienteDoForm && !pacientes.some((p) => p.id === pacienteDoForm.id);

  const doPacienteDoForm = useMemo(() => {
    if (!pacienteDoForm) return { atendimentos: [], planos: [], quotes: [] };
    return {
      atendimentos: atendimentos.filter((a) => a.pacienteId === pacienteDoForm.id),
      planos: planos.filter((p) => p.pacienteId === pacienteDoForm.id),
      quotes: quotes.filter((q) => q.pacienteId === pacienteDoForm.id),
    };
  }, [pacienteDoForm, atendimentos, planos, quotes]);

  const fecharFormulario = () => {
    setFormulario(null);
    setPacienteDoForm(null);
  };

  // ==========================================
  // ABRIR O FORMULÁRIO
  // ==========================================

  const abrirNovo = (semente?: { data: DataISO; hora?: string }) => {
    setErro(null);
    setDetalhe(null);
    setPacienteDoForm(null);
    setFormulario({ modo: 'novo', semente });
  };

  const abrirEdicao = (a: Attendance) => {
    setErro(null);
    setDetalhe(null);
    setPacienteDoForm(pacienteDe(a));
    setFormulario({ modo: 'edicao', atendimento: a });
  };

  const abrirConfirmacao = (a: Attendance) => {
    setErro(null);
    setDetalhe(null);
    setPacienteDoForm(pacienteDe(a));
    setFormulario({ modo: 'confirmacao', atendimento: a });
  };

  // ==========================================
  // DESFECHOS
  // ==========================================

  const marcarStatus = async (a: Attendance, status: Attendance['status']) => {
    try {
      setErro(null);
      await saveAttendance({ ...a, status });
      setDetalhe(null);
    } catch (e) {
      setErro(`Não foi possível atualizar o agendamento: ${(e as Error).message}`);
    }
  };

  /**
   * Remarcar pelo botão: marca o antigo como remarcado e abre um agendamento novo já com o
   * procedimento, a profissional e o plano da visita que caiu — a data fica em branco de propósito,
   * porque é justamente o que precisa ser decidido. Mesmo comportamento da aba do paciente.
   */
  const abrirRemarcacao = async (a: Attendance) => {
    try {
      setErro(null);
      await saveAttendance({ ...a, status: 'remarcado' });
      setDetalhe(null);
      setPacienteDoForm(pacienteDe(a));
      setFormulario({ modo: 'novo', atendimento: { ...a, data: '', hora: undefined } });
    } catch (e) {
      setErro(`Não foi possível remarcar: ${(e as Error).message}`);
    }
  };

  /**
   * Remarcar arrastando.
   *
   * Vale a mesma regra do botão — o antigo morre como `remarcado` e nasce um novo ao lado —, mas
   * aqui as duas gravações acontecem juntas, num batch, porque o destino já é conhecido. Pergunta
   * antes: arrastar é fácil demais de fazer sem querer para mexer na agenda calado.
   */
  const soltarEm = (a: Attendance, data: DataISO, hora: string) => {
    setArrastando(null);
    if (a.data === data && a.hora === hora) return;

    setConfirmacao({
      titulo: 'Remarcar agendamento',
      tom: 'neutro',
      textoConfirmar: 'Remarcar',
      mensagem:
        `${a.pacienteNome} passa de ${dataCurta(a.data)}${a.hora ? ' às ' + a.hora : ''} ` +
        `para ${dataCurta(data)} às ${hora}. O agendamento atual fica marcado como remarcado e ` +
        'um novo é criado no horário de destino.',
      onConfirmar: async () => {
        try {
          setErro(null);
          await remarcarAtendimento(a, { data, hora });
        } catch (e) {
          setErro(`Não foi possível remarcar: ${(e as Error).message}`);
        }
      },
    });
  };

  const pedirExclusao = (a: Attendance) => {
    setDetalhe(null);
    setConfirmacao({
      titulo: 'Excluir atendimento',
      textoConfirmar: 'Excluir',
      mensagem: `O registro de ${a.pacienteNome} em ${dataCurta(a.data)} será apagado. Não tem volta.`,
      onConfirmar: async () => {
        try {
          setErro(null);
          await deleteAttendance(a.id);
        } catch (e) {
          setErro(`Não foi possível excluir: ${(e as Error).message}`);
        }
      },
    });
  };

  /**
   * O mesmo caminho do módulo de pacientes — cadastro, plano, atendimento e fechamento das
   * anamneses, nesta ordem. As fichas não são passadas: agendamento futuro não fecha ficha nenhuma,
   * e nos outros casos o workflow busca só as da paciente em questão.
   */
  const handleSalvar = async (registro: Attendance, planoNovo?: SessionPlan) => {
    await salvarAtendimento({
      registro,
      planoNovo,
      pacienteACriar: cadastroSeraCriado ? pacienteDoForm || undefined : undefined,
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-5">
      <AgendaToolbar
        visao={visao}
        onTrocarVisao={setVisao}
        dataFoco={dataFoco}
        onAnterior={() => andar(-1)}
        onProximo={() => andar(1)}
        onHoje={() => setDataFoco(hoje)}
        professionals={professionals}
        filtroProfissionalId={filtroProfissionalId}
        onFiltrarProfissional={setFiltroProfissionalId}
        onNovo={() => abrirNovo()}
      />

      {erro && (
        <div className="px-3 py-2 rounded-sm bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
          {erro}
        </div>
      )}

      <AgendaPendencias
        pendentes={pendentes}
        onIrParaData={irParaDia}
        onCompareceu={abrirConfirmacao}
        onFaltou={(a) => marcarStatus(a, 'faltou')}
        onRemarcar={abrirRemarcacao}
      />

      {visao === 'mes' ? (
        <AgendaMesView
          dias={dias}
          referencia={dataFoco}
          atendimentos={visiveis}
          clinic={clinic}
          hoje={hoje}
          onAbrirDia={irParaDia}
          onAbrirAtendimento={setDetalhe}
        />
      ) : (
        <AgendaGradeView
          dias={dias}
          atendimentos={visiveis}
          clinic={clinic}
          catalogo={catalogProcedures}
          professionals={professionals}
          rotulosDePlano={rotulosDePlano}
          hoje={hoje}
          onAbrirAtendimento={setDetalhe}
          onNovoEm={(data, hora) => abrirNovo({ data, hora })}
          onSoltarEm={soltarEm}
          arrastando={arrastando}
          onArrastarInicio={setArrastando}
          onArrastarFim={() => setArrastando(null)}
        />
      )}

      <p className="text-[11px] text-gray-400 text-center">
        Clique num horário vazio para agendar. Arraste um agendamento para remarcá-lo.
      </p>

      {detalhe && (
        <AgendaDetalheModal
          atendimento={detalhe}
          clinic={clinic}
          catalogo={catalogProcedures}
          pacientes={pacientes}
          rotuloDoPlano={rotulosDePlano.get(detalhe.id)}
          onFechar={() => setDetalhe(null)}
          onEditar={abrirEdicao}
          onCompareceu={abrirConfirmacao}
          onFaltou={(a) => marcarStatus(a, 'faltou')}
          onRemarcar={abrirRemarcacao}
          onExcluir={pedirExclusao}
        />
      )}

      <AttendanceFormModal
        isOpen={!!formulario}
        onClose={fecharFormulario}
        patient={pacienteDoForm}
        // Só no `novo` a paciente ainda está em aberto; editar e confirmar já sabem de quem é.
        selecaoDePaciente={
          formulario?.modo === 'novo'
            ? {
                pacientes,
                onSelecionar: (escolha) =>
                  setPacienteDoForm(
                    escolha.nome.trim()
                      ? {
                          id: escolha.id || `pat-${Date.now()}`,
                          nome: escolha.nome.trim(),
                          contato: escolha.contato,
                          createdAt: new Date().toISOString(),
                        }
                      : null
                  ),
              }
            : undefined
        }
        sementeDataHora={formulario?.semente}
        atendimentosDaClinica={atendimentos}
        cadastroSeraCriado={cadastroSeraCriado}
        atendimentos={doPacienteDoForm.atendimentos}
        planos={doPacienteDoForm.planos}
        quotes={doPacienteDoForm.quotes}
        procedures={catalogProcedures}
        professionals={professionals}
        professionalIdPadrao={currentProfessionalId}
        atendimento={formulario?.atendimento}
        modo={formulario?.modo || 'novo'}
        onSalvar={handleSalvar}
      />

      <ConfirmDialog pedido={confirmacao} onFechar={() => setConfirmacao(null)} />
    </div>
  );
};

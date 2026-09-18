import React, { useEffect, useMemo, useState } from 'react';
import {
  AnamnesisQuestion,
  AnamnesisRecord,
  AnamnesisTemplate,
  ClinicProfile,
  Patient,
  Procedure,
  Quote,
  QuoteDraft,
} from '../../types';
import {
  subscribeToPatients,
  subscribeToAnamnesisRecords,
  subscribeToQuotes,
  subscribeToGeneralQuestions,
  savePatient,
  deletePatient,
  saveAnamnesisRecord,
  deleteAnamnesisRecord,
  createQuote,
  updateQuote,
  markQuoteAsSent,
} from '../../services/databaseService';
import {
  chaveDoNome,
  LinhaDePaciente,
  montarLinhasDePacientes,
  pacienteProvisorio,
} from '../../utils/patientsPanel';
import { ConfirmDialog, ConfirmRequest } from '../ConfirmDialog';
import { PatientsListView } from './PatientsListView';
import { PatientDetailView } from './PatientDetailView';
import { NewPatientModal } from './NewPatientModal';

interface PatientsModuleProps {
  clinic: ClinicProfile;
  catalogProcedures: Procedure[];
  /** Assinadas no App — o catálogo e a anamnese também precisam delas. */
  templates: AnamnesisTemplate[];
}

/**
 * Seção "Pacientes": a lista de nomes e, ao abrir um deles, a página com os dados pessoais e o
 * histórico de anamneses e orçamentos.
 *
 * Todas as coleções vêm das assinaturas compartilhadas (ver `sharedSubscription.ts`), então
 * abrir esta seção não custa um snapshot novo quando a anamnese ou os orçamentos já estiveram
 * abertos nesta sessão.
 */
export const PatientsModule: React.FC<PatientsModuleProps> = ({
  clinic,
  catalogProcedures,
  templates,
}) => {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [records, setRecords] = useState<AnamnesisRecord[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [generalQuestions, setGeneralQuestions] = useState<AnamnesisQuestion[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [pacienteAbertoId, setPacienteAbertoId] = useState<string | null>(null);
  const [cadastroAberto, setCadastroAberto] = useState(false);
  const [nomeDoCadastro, setNomeDoCadastro] = useState<string | undefined>(undefined);
  const [confirmacao, setConfirmacao] = useState<ConfirmRequest | null>(null);
  const [erro, setErro] = useState<string | null>(null);

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

    return () => {
      unsubPacientes();
      unsubFichas();
      unsubOrcamentos();
      unsubPerguntas();
    };
  }, []);

  /**
   * A lista não é só `patients`: quem recebeu um orçamento avulso (nome digitado na hora, sem
   * cadastro) também aparece, marcado como pendente. Ver `utils/patientsPanel.ts`.
   */
  const linhas = useMemo(
    () => montarLinhasDePacientes({ patients, records, quotes }),
    [patients, records, quotes]
  );

  /**
   * Quem não tem cadastro abre a página como qualquer outro, com um cadastro provisório montado
   * do nome. Nada é gravado por isso: o documento em `patients` só nasce quando a equipe salva os
   * dados pessoais ali — e aí já com este id.
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
   * O histórico de quem está com a página aberta. O vínculo por id resolve o caso normal; o nome
   * cobre os documentos que não têm a quem apontar — o orçamento avulso, emitido antes de o
   * cadastro existir, e a ficha cujo cadastro foi excluído depois. Sem isso a página de quem
   * ainda não tem cadastro abriria vazia, justamente a de quem só tem histórico.
   */
  const fichasDoPaciente = useMemo(() => {
    if (!pacienteAberto) return [];
    const chave = chaveDoNome(pacienteAberto.nome);
    return records.filter(
      (r) =>
        r.pacienteId === pacienteAberto.id ||
        (!idsCadastrados.has(r.pacienteId || '') && chaveDoNome(r.pacienteNome) === chave)
    );
  }, [records, pacienteAberto, idsCadastrados]);

  const orcamentosDoPaciente = useMemo(() => {
    if (!pacienteAberto) return [];
    const chave = chaveDoNome(pacienteAberto.nome);
    return quotes.filter(
      (q) =>
        q.pacienteId === pacienteAberto.id ||
        (!idsCadastrados.has(q.pacienteId || '') && chaveDoNome(q.pacienteNome) === chave)
    );
  }, [quotes, pacienteAberto, idsCadastrados]);

  const handleSalvarOrcamento = async (draft: QuoteDraft, existing?: Quote) => {
    if (existing) {
      await updateQuote(existing, draft);
    } else {
      await createQuote(draft);
    }
  };

  /** O 1º compartilhamento do link tira o orçamento de rascunho e trava a edição. */
  const handleOrcamentoCompartilhado = async (quote: Quote) => {
    if (quote.status !== 'rascunho') return;
    try {
      await markQuoteAsSent(quote.id);
    } catch (e) {
      console.warn('Link compartilhado, mas o status não mudou:', e);
    }
  };

  const abrirCadastro = (nomeInicial?: string) => {
    setNomeDoCadastro(nomeInicial);
    setCadastroAberto(true);
  };

  /**
   * Excluir apaga o cadastro, e só ele. Fichas e orçamentos são documentos próprios, com link já
   * enviado à paciente no caso do orçamento — some com o cadastro e o nome volta para a lista
   * como pendente, com o histórico intacto. O aviso diz isso antes, em vez de a equipe descobrir
   * depois.
   */
  const pedirExclusao = (linha: LinhaDePaciente) => {
    if (!linha.patient) return;
    const { totalAnamneses: fichas, totalOrcamentos: orcamentos } = linha;
    const temHistorico = fichas > 0 || orcamentos > 0;

    setConfirmacao({
      titulo: `Excluir o cadastro de ${linha.nome}?`,
      mensagem: temHistorico
        ? `Os dados pessoais são apagados para sempre.\n\n${fichas} ficha${
            fichas === 1 ? '' : 's'
          } de anamnese e ${orcamentos} orçamento${
            orcamentos === 1 ? '' : 's'
          } continuam no sistema — os links já enviados seguem valendo. Por causa deles, o nome volta a aparecer nesta lista marcado como "sem cadastro".`
        : 'Os dados pessoais são apagados para sempre. Este paciente não tem nenhuma ficha nem orçamento, então nada mais sai junto.',
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

  if (pacienteAberto) {
    return (
      <PatientDetailView
        patient={pacienteAberto}
        records={fichasDoPaciente}
        quotes={orcamentosDoPaciente}
        todosPacientes={patients}
        templates={templates}
        generalQuestions={generalQuestions}
        clinic={clinic}
        catalogProcedures={catalogProcedures}
        onVoltar={() => setPacienteAbertoId(null)}
        onSalvarPaciente={savePatient}
        onSalvarFicha={saveAnamnesisRecord}
        onExcluirFicha={deleteAnamnesisRecord}
        onSalvarOrcamento={handleSalvarOrcamento}
        onOrcamentoCompartilhado={handleOrcamentoCompartilhado}
      />
    );
  }

  return (
    <>
      {erro && (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
          <p className="px-4 py-3 rounded-sm bg-red-50 border border-red-200 text-xs text-red-700">
            {erro}
          </p>
        </div>
      )}

      <PatientsListView
        linhas={linhas}
        carregando={carregando}
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

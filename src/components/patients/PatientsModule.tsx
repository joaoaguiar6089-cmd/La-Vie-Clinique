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
  saveAnamnesisRecord,
  deleteAnamnesisRecord,
  createQuote,
  updateQuote,
  markQuoteAsSent,
} from '../../services/databaseService';
import { PatientsListView } from './PatientsListView';
import { PatientDetailView } from './PatientDetailView';
import { NewPatientModal } from './NewPatientModal';

interface PatientsModuleProps {
  clinic: ClinicProfile;
  catalogProcedures: Procedure[];
  /** Assinadas no App — o catálogo e a anamnese também precisam delas. */
  templates: AnamnesisTemplate[];
}

/** Normaliza para comparar nomes digitados à mão com nomes do cadastro. */
const chaveDoNome = (nome: string): string =>
  nome
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

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

  const pacienteAberto = pacienteAbertoId
    ? patients.find((p) => p.id === pacienteAbertoId) || null
    : null;

  const fichasDoPaciente = useMemo(
    () => (pacienteAberto ? records.filter((r) => r.pacienteId === pacienteAberto.id) : []),
    [records, pacienteAberto]
  );

  const orcamentosDoPaciente = useMemo(() => {
    if (!pacienteAberto) return [];
    const chave = chaveDoNome(pacienteAberto.nome);
    return quotes.filter(
      (q) =>
        q.pacienteId === pacienteAberto.id ||
        // Orçamento avulso: emitido com o nome digitado na hora, antes do paciente existir no
        // cadastro. Continua sendo dele, e não aparecer aqui faria a página mentir.
        (!q.pacienteId && chaveDoNome(q.pacienteNome) === chave)
    );
  }, [quotes, pacienteAberto]);

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
      <PatientsListView
        patients={patients}
        carregando={carregando}
        onAbrirPaciente={setPacienteAbertoId}
        onNovoPaciente={abrirCadastro}
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
    </>
  );
};

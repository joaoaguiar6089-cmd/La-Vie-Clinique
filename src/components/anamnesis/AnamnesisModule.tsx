import React, { useState, useEffect, useMemo } from 'react';
import {
  AnamnesisQuestion,
  AnamnesisTemplate,
  Patient,
  AnamnesisRecord,
  ClinicProfile,
  Procedure,
} from '../../types';
import {
  subscribeToGeneralQuestions,
  saveGeneralQuestion,
  saveAllGeneralQuestions,
  deleteGeneralQuestion,
  saveAnamnesisTemplate,
  deleteAnamnesisTemplate,
  subscribeToPatients,
  savePatient,
  deletePatient,
  subscribeToAnamnesisRecords,
  saveAnamnesisRecord,
  deleteAnamnesisRecord,
} from '../../services/databaseService';
import { GeneralQuestionsManager } from './GeneralQuestionsManager';
import { ProcedureTemplatesManager } from './ProcedureTemplatesManager';
import { ModuleTabs } from '../common/ModuleTabs';
import { PatientHistoryView } from './PatientHistoryView';
import { AnamnesisFormFillModal } from './AnamnesisFormFillModal';
import { PrintableAnamnesisSheet } from './PrintableAnamnesisSheet';
import { resolveOrientationImage } from '../../utils/orientationImage';
import { resolveConsentTerm } from '../../utils/consentTerm';
import { montarEspelhoPublico } from '../../utils/laserAreas';
import { fichasParaEscolher, isLaserCategory } from '../../utils/templateMatching';
import { ClipboardList, Layers } from 'lucide-react';

/**
 * Pedido vindo do catálogo de procedimentos. Chega junto com a troca de aba: o card navega até
 * aqui e diz o que abrir. O `nonce` distingue dois toques seguidos no mesmo procedimento.
 */
export interface AnamnesisOpenRequest {
  /**
   * `preencher` e `criar-ficha` vêm do card do catálogo e trazem o procedimento junto.
   * `nova-ficha` vem do "+" do celular e da busca global: abre o formulário em branco, com a
   * escolha do procedimento dentro dele — é o único caso em que `procedure` não existe.
   */
  tipo: 'preencher' | 'criar-ficha' | 'nova-ficha';
  procedure?: Procedure;
  /** Ficha-modelo já vinculada ao procedimento, quando existe. */
  templateId?: string;
  nonce: number;
}

interface AnamnesisModuleProps {
  clinicProfile: ClinicProfile;
  catalogProcedures: Procedure[];
  /** As fichas-modelo são assinadas no App — o catálogo também precisa delas. */
  templates: AnamnesisTemplate[];
  openRequest?: AnamnesisOpenRequest | null;
  onOpenRequestHandled?: () => void;
}

/**
 * As seções do módulo. A configuração das perguntas gerais deixou de ser uma delas: virou um bloco
 * dentro de 'templates', porque é ajuste raro e estava ocupando um terço da navegação diária.
 */
export type AnamnesisTab = 'records' | 'templates';

export const AnamnesisModule: React.FC<AnamnesisModuleProps> = ({
  clinicProfile,
  catalogProcedures,
  templates,
  openRequest,
  onOpenRequestHandled,
}) => {
  /**
   * Fichas oferecidas para escolher e gerenciar.
   *
   * As 13 fichas de laser por área foram aposentadas em favor de uma única, onde a região é
   * escolhida no mapa corporal. Elas continuam existindo (fichas já preenchidas apontam para elas
   * por `templateId` e deixariam de renderizar se sumissem), mas não devem mais aparecer para
   * escolher — daí a lista completa continuar indo para o histórico, que resolve registros antigos,
   * e só estas irem para o gerenciador e para o preenchimento.
   *
   * A regra vive em `fichasParaEscolher`, e não numa marca no banco, para valer em qualquer
   * máquina — inclusive nas que nunca rodaram a migração que marca `oculta`.
   */
  const templatesVisiveis = useMemo(() => fichasParaEscolher(templates), [templates]);

  /**
   * Mapa corporal montado do catálogo em memória — esta tela é autenticada e lê `procedures`
   * direto, sem passar pelo espelho público. É a mesma função que gera o espelho, de propósito:
   * a ficha impressa aqui precisa sair idêntica à que a paciente vê pelo link.
   */
  const mapaDoLaser = useMemo(
    () => montarEspelhoPublico(catalogProcedures, clinicProfile),
    [catalogProcedures, clinicProfile]
  );

  const [activeTab, setActiveTab] = useState<AnamnesisTab>('records');

  // Firestore collections state
  const [generalQuestions, setGeneralQuestions] = useState<AnamnesisQuestion[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [records, setRecords] = useState<AnamnesisRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modals state
  const [fillModalOpen, setFillModalOpen] = useState(false);
  const [fillModalPatientId, setFillModalPatientId] = useState<string | undefined>(undefined);
  const [fillModalTemplateId, setFillModalTemplateId] = useState<string | undefined>(undefined);
  /** Área do laser que já entra marcada, quando o pedido veio de um card de procedimento. */
  const [fillModalAreaInicial, setFillModalAreaInicial] = useState<string | undefined>(undefined);
  const [detailRecord, setDetailRecord] = useState<AnamnesisRecord | null>(null);

  /** Procedimento que o catálogo pediu para ganhar uma ficha-modelo nova. */
  const [criarFichaPara, setCriarFichaPara] = useState<Procedure | null>(null);

  // O seeding já roda uma vez no boot do app (App.tsx). Repeti-lo aqui fazia o mesmo conjunto de
  // leituras de novo a cada vez que a aba de anamnese era aberta.
  useEffect(() => {
    const unsubGenQ = subscribeToGeneralQuestions((data) => setGeneralQuestions(data));
    const unsubPat = subscribeToPatients((data) => setPatients(data));
    const unsubRec = subscribeToAnamnesisRecords(
      (data) => {
        setRecords(data);
        setIsLoading(false);
      },
      () => {
        setIsLoading(false);
      }
    );

    return () => {
      unsubGenQ();
      unsubPat();
      unsubRec();
    };
  }, []);

  // Atende o pedido que veio do catálogo de procedimentos.
  useEffect(() => {
    if (!openRequest) return;

    if (openRequest.tipo === 'nova-ficha') {
      setActiveTab('records');
      handleOpenFillModal();
      onOpenRequestHandled?.();
      return;
    }

    if (openRequest.tipo === 'preencher') {
      setActiveTab('records');
      setFillModalPatientId(undefined);
      setFillModalTemplateId(openRequest.templateId);
      // Clicar "Anamnese" num procedimento de laser abre a ficha única com **aquela** área já
      // marcada no manequim. A ficha é uma só para as treze regiões, então sem isto o clique em
      // "Virilha Completa" e o clique em "Axilas" abririam exatamente a mesma tela vazia, e a
      // escolha que a profissional acabou de fazer no catálogo se perderia.
      setFillModalAreaInicial(
        openRequest.procedure && isLaserCategory(openRequest.procedure.category)
          ? openRequest.procedure.id
          : undefined
      );
      setFillModalOpen(true);
    } else if (openRequest.procedure) {
      setActiveTab('templates');
      setCriarFichaPara(openRequest.procedure);
    }

    onOpenRequestHandled?.();
    // `nonce` é o que torna dois pedidos iguais em pedidos distintos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest?.nonce]);

  const handleOpenFillModal = (patientId?: string, templateId?: string) => {
    setFillModalPatientId(patientId);
    setFillModalTemplateId(templateId);
    setFillModalAreaInicial(undefined);
    setFillModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/*
        Sem cabeçalho de módulo, de propósito.

        Ele existia só aqui — Procedimentos, Pacientes e Orçamentos nunca tiveram — e empilhava
        duas hierarquias dizendo quase a mesma coisa: "Fichas de Anamnese" seguido, um pixel
        abaixo, de "Anamneses Preenchidas & Enviadas". Cada seção já se apresenta no próprio
        cabeçalho, e os três contadores do topo repetiam números que as abas e os selos das seções
        já mostravam.
      */}
      <ModuleTabs
        tabs={[
          {
            id: 'records' as const,
            icon: ClipboardList,
            label: 'Preenchidas',
            count: records.length,
          },
          { id: 'templates' as const, icon: Layers, label: 'Fichas-modelo', count: templates.length },
        ]}
        active={activeTab}
        onSelect={setActiveTab}
      />

      {/* TAB CONTENT */}
      {activeTab === 'records' && (
        <PatientHistoryView
          patients={patients}
          records={records}
          templates={templates}
          clinicProfile={clinicProfile}
          onOpenFillModal={handleOpenFillModal}
          onOpenRecordDetail={(rec) => setDetailRecord(rec)}
          onDeleteRecord={deleteAnamnesisRecord}
          onDeletePatient={deletePatient}
        />
      )}

      {activeTab === 'templates' && (
        <div className="space-y-8">
          {/*
            As perguntas gerais deixaram de ser aba própria e passaram a morar aqui, acima dos
            modelos: elas são herdadas por toda ficha, então quem vem ajustar um modelo precisa
            ver primeiro o que já entra nele sem ninguém pedir. Mesma disposição na tela de
            avaliação, para as duas serem reconhecíveis uma na outra.
          */}
          <GeneralQuestionsManager
            questions={generalQuestions}
            onSaveQuestion={saveGeneralQuestion}
            onSaveAllQuestions={saveAllGeneralQuestions}
            onDeleteQuestion={deleteGeneralQuestion}
          />

          <ProcedureTemplatesManager
            templates={templatesVisiveis}
            catalogProcedures={catalogProcedures}
            generalQuestions={generalQuestions}
            clinicProfile={clinicProfile}
            patients={patients}
            criarFichaPara={criarFichaPara}
            onCriarFichaHandled={() => setCriarFichaPara(null)}
            onSaveTemplate={saveAnamnesisTemplate}
            onDeleteTemplate={deleteAnamnesisTemplate}
          />
        </div>
      )}

      {/* FORM FILL MODAL */}
      <AnamnesisFormFillModal
        isOpen={fillModalOpen}
        onClose={() => setFillModalOpen(false)}
        patients={patients}
        templates={templatesVisiveis}
        generalQuestions={generalQuestions}
        clinicProfile={clinicProfile}
        catalogProcedures={catalogProcedures}
        initialPatientId={fillModalPatientId}
        initialTemplateId={fillModalTemplateId}
        initialAreaLaserId={fillModalAreaInicial}
        onSavePatient={savePatient}
        onSaveRecord={saveAnamnesisRecord}
        onOpenRecordDetail={(rec) => setDetailRecord(rec)}
      />

      {/* PRINTABLE / DETAIL MODAL */}
      {detailRecord && (() => {
        // A imagem orientativa e o termo vivem na ficha-modelo, não no registro — daí a busca aqui.
        const templateDoRegistroAberto = templates.find(
          (t) => t.id === (detailRecord.templateId || detailRecord.procedimentoId)
        );
        return (
        <PrintableAnamnesisSheet
          record={records.find((r) => r.id === detailRecord.id) || detailRecord}
          clinicProfile={clinicProfile}
          onClose={() => setDetailRecord(null)}
          viewerRole="staff"
          onSaveRecord={saveAnamnesisRecord}
          orientationImage={resolveOrientationImage(templateDoRegistroAberto)}
          consentSections={resolveConsentTerm(templateDoRegistroAberto)}
          mapaCorporal={mapaDoLaser}
        />
        );
      })()}
    </div>
  );
};

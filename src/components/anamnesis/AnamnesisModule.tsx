import React, { useState, useEffect } from 'react';
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
  subscribeToAnamnesisTemplates,
  saveAnamnesisTemplate,
  deleteAnamnesisTemplate,
  subscribeToPatients,
  savePatient,
  deletePatient,
  subscribeToAnamnesisRecords,
  saveAnamnesisRecord,
  deleteAnamnesisRecord,
  seedAnamnesisInitialDataIfEmpty,
} from '../../services/databaseService';
import { GeneralQuestionsManager } from './GeneralQuestionsManager';
import { ProcedureTemplatesManager } from './ProcedureTemplatesManager';
import { PatientHistoryView } from './PatientHistoryView';
import { AnamnesisFormFillModal } from './AnamnesisFormFillModal';
import { PrintableAnamnesisSheet } from './PrintableAnamnesisSheet';
import {
  FileSpreadsheet,
  Layers,
  Sparkles,
  Plus,
  Users,
  ClipboardList,
  CheckCircle2,
} from 'lucide-react';

interface AnamnesisModuleProps {
  clinicProfile: ClinicProfile;
  catalogProcedures: Procedure[];
}

export type AnamnesisTab = 'records' | 'templates' | 'general';

export const AnamnesisModule: React.FC<AnamnesisModuleProps> = ({
  clinicProfile,
  catalogProcedures,
}) => {
  const [activeTab, setActiveTab] = useState<AnamnesisTab>('records');

  // Firestore collections state
  const [generalQuestions, setGeneralQuestions] = useState<AnamnesisQuestion[]>([]);
  const [templates, setTemplates] = useState<AnamnesisTemplate[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [records, setRecords] = useState<AnamnesisRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modals state
  const [fillModalOpen, setFillModalOpen] = useState(false);
  const [fillModalPatientId, setFillModalPatientId] = useState<string | undefined>(undefined);
  const [fillModalTemplateId, setFillModalTemplateId] = useState<string | undefined>(undefined);
  const [detailRecord, setDetailRecord] = useState<AnamnesisRecord | null>(null);

  // Subscribe to all 4 collections on mount and seed if empty
  useEffect(() => {
    seedAnamnesisInitialDataIfEmpty();

    const unsubGenQ = subscribeToGeneralQuestions((data) => setGeneralQuestions(data));
    const unsubTpl = subscribeToAnamnesisTemplates((data) => setTemplates(data));
    const unsubPat = subscribeToPatients((data) => setPatients(data));
    const unsubRec = subscribeToAnamnesisRecords((data) => {
      setRecords(data);
      setIsLoading(false);
    });

    return () => {
      unsubGenQ();
      unsubTpl();
      unsubPat();
      unsubRec();
    };
  }, []);

  const handleOpenFillModal = (patientId?: string, templateId?: string) => {
    setFillModalPatientId(patientId);
    setFillModalTemplateId(templateId);
    setFillModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Module Title & Tab Navigation */}
      <div className="bg-white/70 backdrop-blur-md rounded-sm border border-white/90 p-4 sm:p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#A67C52]" />
              <h2 className="font-serif-luxury text-2xl font-bold text-[#1A1A1A]">
                Fichas de Anamnese
              </h2>
              <span className="px-2.5 py-0.5 rounded-full bg-[#1A1A1A] text-[#C49B74] text-[10px] font-mono uppercase tracking-widest font-bold">
                Módulo Clínico
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1 max-w-2xl leading-relaxed">
              Sistema de anamnese da clínica La Vie. Configure as perguntas gerais, modele fichas por procedimento
              e registre o histórico clínico de cada paciente com anexo fotográfico.
            </p>
          </div>

          {/* Quick Stat Pill counters */}
          <div className="flex items-center gap-3 self-start md:self-center">
            <div className="px-3 py-1.5 rounded-sm bg-gray-50 border border-gray-200/80 text-center">
              <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold block">
                Pacientes
              </span>
              <span className="font-mono text-sm font-bold text-[#1A1A1A]">{patients.length}</span>
            </div>
            <div className="px-3 py-1.5 rounded-sm bg-gray-50 border border-gray-200/80 text-center">
              <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold block">
                Fichas
              </span>
              <span className="font-mono text-sm font-bold text-[#A67C52]">{records.length}</span>
            </div>
            <div className="px-3 py-1.5 rounded-sm bg-gray-50 border border-gray-200/80 text-center">
              <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold block">
                Modelos
              </span>
              <span className="font-mono text-sm font-bold text-gray-700">{templates.length}</span>
            </div>
          </div>
        </div>

        {/* The 3 Core Sub-Tabs requested by User */}
        <div className="flex items-center gap-2 mt-6 border-b border-gray-200/80 overflow-x-auto pb-px">
          {/* Tab 1 */}
          <button
            type="button"
            onClick={() => setActiveTab('records')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'records'
                ? 'border-[#A67C52] text-[#1A1A1A]'
                : 'border-transparent text-gray-400 hover:text-gray-700'
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            <span>(3) Atendimentos & Histórico por Paciente</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                activeTab === 'records' ? 'bg-[#A67C52] text-white' : 'bg-gray-100 text-gray-500'
              }`}
            >
              {records.length}
            </span>
          </button>

          {/* Tab 2 */}
          <button
            type="button"
            onClick={() => setActiveTab('templates')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'templates'
                ? 'border-[#A67C52] text-[#1A1A1A]'
                : 'border-transparent text-gray-400 hover:text-gray-700'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>(2) Fichas por Procedimento</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                activeTab === 'templates' ? 'bg-[#A67C52] text-white' : 'bg-gray-100 text-gray-500'
              }`}
            >
              {templates.length}
            </span>
          </button>

          {/* Tab 3 */}
          <button
            type="button"
            onClick={() => setActiveTab('general')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'general'
                ? 'border-[#A67C52] text-[#1A1A1A]'
                : 'border-transparent text-gray-400 hover:text-gray-700'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>(1) Configuração das Perguntas Gerais</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                activeTab === 'general' ? 'bg-[#A67C52] text-white' : 'bg-gray-100 text-gray-500'
              }`}
            >
              {generalQuestions.length}
            </span>
          </button>
        </div>
      </div>

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
        <ProcedureTemplatesManager
          templates={templates}
          catalogProcedures={catalogProcedures}
          generalQuestions={generalQuestions}
          clinicProfile={clinicProfile}
          patients={patients}
          onSaveTemplate={saveAnamnesisTemplate}
          onDeleteTemplate={deleteAnamnesisTemplate}
        />
      )}

      {activeTab === 'general' && (
        <GeneralQuestionsManager
          questions={generalQuestions}
          onSaveQuestion={saveGeneralQuestion}
          onSaveAllQuestions={saveAllGeneralQuestions}
          onDeleteQuestion={deleteGeneralQuestion}
        />
      )}

      {/* FORM FILL MODAL */}
      <AnamnesisFormFillModal
        isOpen={fillModalOpen}
        onClose={() => setFillModalOpen(false)}
        patients={patients}
        templates={templates}
        generalQuestions={generalQuestions}
        clinicProfile={clinicProfile}
        initialPatientId={fillModalPatientId}
        initialTemplateId={fillModalTemplateId}
        onSavePatient={savePatient}
        onSaveRecord={saveAnamnesisRecord}
        onOpenRecordDetail={(rec) => setDetailRecord(rec)}
      />

      {/* PRINTABLE / DETAIL MODAL */}
      {detailRecord && (
        <PrintableAnamnesisSheet
          record={records.find((r) => r.id === detailRecord.id) || detailRecord}
          clinicProfile={clinicProfile}
          onClose={() => setDetailRecord(null)}
          viewerRole="staff"
          onSaveRecord={saveAnamnesisRecord}
        />
      )}
    </div>
  );
};

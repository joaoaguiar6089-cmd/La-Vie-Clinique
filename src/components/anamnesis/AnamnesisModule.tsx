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

        {/* The 3 Core Sub-Tabs requested by User — vertical stack on mobile/tablet, horizontal on desktop */}
        <div className="flex flex-col gap-1.5 mt-6 lg:flex-row lg:items-center lg:gap-2 lg:border-b lg:border-[rgba(26,26,26,.07)] lg:pb-px">
          {[
            { id: 'records' as const, icon: ClipboardList, label: 'Atendimentos & histórico por paciente', count: records.length },
            { id: 'templates' as const, icon: Layers, label: 'Fichas por procedimento', count: templates.length },
            { id: 'general' as const, icon: Sparkles, label: 'Configuração das perguntas gerais', count: generalQuestions.length },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-3 w-full rounded-xl px-4 py-3.5 text-[15px] font-semibold transition-all lg:w-auto lg:gap-2 lg:rounded-none lg:px-4 lg:py-2.5 lg:text-[14px] lg:border-b-2 ${
                  active
                    ? 'bg-[#A67C52]/10 text-[#1A1A1A] lg:bg-transparent lg:border-[#A67C52]'
                    : 'text-[#4a4740] hover:bg-[#F9F8F6] lg:text-[#8a8578] lg:border-transparent lg:hover:bg-transparent lg:hover:text-[#1A1A1A]'
                }`}
              >
                <Icon className="w-[18px] h-[18px] lg:w-4 lg:h-4 shrink-0" />
                <span className="flex-1 text-left lg:flex-initial whitespace-nowrap">{tab.label}</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[12px] font-semibold ${
                    active ? 'bg-[#A67C52] text-white' : 'bg-[#F9F8F6] text-[#8a8578] lg:bg-gray-100'
                  }`}
                  style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
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

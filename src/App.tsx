import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { ProcedureManager } from './components/ProcedureManager';
import { ProcedureDetailModal } from './components/ProcedureDetailModal';
import { ProcedureFormModal } from './components/ProcedureFormModal';
import { ShareExportModal } from './components/ShareExportModal';
import { ClinicSettingsModal } from './components/ClinicSettingsModal';
import { AnamnesisModule } from './components/anamnesis/AnamnesisModule';
import { PublicAnamnesisEntry } from './components/anamnesis/PublicAnamnesisEntry';
import { Procedure, ClinicProfile } from './types';
import { SAMPLE_PROCEDURES, DEFAULT_CLINIC_PROFILE, INITIAL_CATEGORIES } from './data/initialData';
import { RefreshCw, Check } from 'lucide-react';
import {
  seedInitialDataIfEmpty,
  subscribeToProcedures,
  subscribeToClinicProfile,
  saveProcedureToDb,
  deleteProcedureFromDb,
  saveClinicProfileToDb,
  replaceAllProceduresWithOfficialPdfCatalog,
} from './services/databaseService';

const STORAGE_KEY_PROCEDURES = 'aura_bronze_procedures_v1';
const STORAGE_KEY_CLINIC = 'aura_bronze_clinic_v1';

// A ficha de anamnese pública (link enviado ao cliente) é servida por um shell totalmente
// separado do painel administrativo — sem login, sem catálogo. Esta checagem depende só da
// URL de carregamento da página, então é estável durante toda a vida desta instância do App.
const publicSearchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
const isPublicAnamnesisRoute = !!(publicSearchParams?.get('anamnese') || publicSearchParams?.get('ficha'));

export default function App() {
  if (isPublicAnamnesisRoute) {
    return <PublicAnamnesisEntry />;
  }

  // Load procedures from localStorage or default samples initial fallback
  const [procedures, setProcedures] = useState<Procedure[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_PROCEDURES);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error('Error loading saved procedures:', e);
    }
    return SAMPLE_PROCEDURES;
  });

  // Load clinic profile from localStorage or default initial fallback
  const [clinic, setClinic] = useState<ClinicProfile>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CLINIC);
      if (saved) {
        return { ...DEFAULT_CLINIC_PROFILE, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.error('Error loading saved clinic profile:', e);
    }
    return DEFAULT_CLINIC_PROFILE;
  });

  // Firebase Real-time Synchronization Status
  const [syncStatus, setSyncStatus] = useState<'syncing' | 'synced' | 'error'>('synced');

  // Navigation and Modals State
  const [currentView, setCurrentView] = useState<'procedures' | 'anamnesis'>('procedures');
  const [selectedProcedureForDetails, setSelectedProcedureForDetails] = useState<Procedure | null>(null);
  const [selectedProcedureForEdit, setSelectedProcedureForEdit] = useState<Procedure | null>(null);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [singleProcedureToExport, setSingleProcedureToExport] = useState<Procedure | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Initialize Firebase and subscribe to real-time updates
  useEffect(() => {
    let unsubscribeProcedures: (() => void) | undefined;
    let unsubscribeClinic: (() => void) | undefined;

    async function initFirestore() {
      try {
        setSyncStatus('syncing');
        // 1. Seed initial data to Firestore if the collections are empty
        await seedInitialDataIfEmpty();

        // 2. Subscribe to real-time procedures collection
        unsubscribeProcedures = subscribeToProcedures(
          (firebaseProcedures) => {
            if (firebaseProcedures && firebaseProcedures.length > 0) {
              setProcedures(firebaseProcedures);
              localStorage.setItem(STORAGE_KEY_PROCEDURES, JSON.stringify(firebaseProcedures));
            }
            setSyncStatus('synced');
          },
          (err) => {
            console.warn('Firestore procedures subscription offline/error:', err);
            setSyncStatus('error');
          }
        );

        // 3. Subscribe to real-time clinic profile document
        unsubscribeClinic = subscribeToClinicProfile(
          (firebaseClinic) => {
            if (firebaseClinic) {
              setClinic(firebaseClinic);
              localStorage.setItem(STORAGE_KEY_CLINIC, JSON.stringify(firebaseClinic));
            }
            setSyncStatus('synced');
          },
          (err) => {
            console.warn('Firestore clinic subscription offline/error:', err);
            setSyncStatus('error');
          }
        );
      } catch (err) {
        console.error('Firebase initialization error:', err);
        setSyncStatus('error');
      }
    }

    initFirestore();

    return () => {
      if (unsubscribeProcedures) unsubscribeProcedures();
      if (unsubscribeClinic) unsubscribeClinic();
    };
  }, []);

  // Backup sync to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_PROCEDURES, JSON.stringify(procedures));
    } catch (e) {
      console.error('Error saving procedures to localStorage:', e);
    }
  }, [procedures]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_CLINIC, JSON.stringify(clinic));
    } catch (e) {
      console.error('Error saving clinic to localStorage:', e);
    }
  }, [clinic]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Derive unique categories
  const categories = Array.from(
    new Set([
      'Todos',
      ...INITIAL_CATEGORIES.filter((c) => c !== 'Todos'),
      ...procedures.map((p) => p.category).filter(Boolean),
    ])
  );

  // Handlers with Firestore Persistence
  const handleSaveProcedure = async (procedure: Procedure) => {
    try {
      setSyncStatus('syncing');
      // Optimistic update
      setProcedures((prev) => {
        const existingIndex = prev.findIndex((p) => p.id === procedure.id);
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = procedure;
          return updated;
        } else {
          return [procedure, ...prev];
        }
      });

      // Persist to Firebase Firestore
      await saveProcedureToDb(procedure);
      setSyncStatus('synced');
      showToast(`Procedimento "${procedure.title}" salvo e sincronizado na nuvem!`);
    } catch (err) {
      console.error('Error saving procedure to Firestore:', err);
      setSyncStatus('error');
      showToast(`Procedimento salvo localmente.`);
    }
  };

  const handleDeleteProcedure = async (id: string) => {
    const proc = procedures.find((p) => p.id === id);
    if (!proc) return;
    if (window.confirm(`Tem certeza que deseja remover o procedimento "${proc.title}"?`)) {
      try {
        setSyncStatus('syncing');
        setProcedures((prev) => prev.filter((p) => p.id !== id));
        if (selectedProcedureForDetails?.id === id) {
          setSelectedProcedureForDetails(null);
        }

        // Delete from Firebase Firestore
        await deleteProcedureFromDb(id);
        setSyncStatus('synced');
        showToast(`Procedimento "${proc.title}" removido com sucesso.`);
      } catch (err) {
        console.error('Error deleting procedure from Firestore:', err);
        setSyncStatus('error');
        showToast(`Procedimento removido.`);
      }
    }
  };

  const handleDuplicateProcedure = async (procedure: Procedure) => {
    const duplicated: Procedure = {
      ...procedure,
      id: `proc-${Date.now()}`,
      title: `${procedure.title} (Cópia)`,
      createdAt: new Date().toISOString(),
      order: (procedure.order || 0) + 1,
    };
    try {
      setSyncStatus('syncing');
      setProcedures((prev) => [duplicated, ...prev]);
      await saveProcedureToDb(duplicated);
      setSyncStatus('synced');
      showToast(`Procedimento "${procedure.title}" duplicado e gravado no Firebase!`);
    } catch (err) {
      console.error('Error duplicating procedure in Firestore:', err);
      showToast(`Procedimento duplicado.`);
    }
  };

  const handleToggleFeatured = async (id: string) => {
    const proc = procedures.find((p) => p.id === id);
    if (!proc) return;
    const updated = { ...proc, isFeatured: !proc.isFeatured };

    try {
      setSyncStatus('syncing');
      setProcedures((prev) => prev.map((p) => (p.id === id ? updated : p)));
      await saveProcedureToDb(updated);
      setSyncStatus('synced');
      showToast(
        updated.isFeatured
          ? `"${proc.title}" adicionado aos Destaques!`
          : `"${proc.title}" removido dos Destaques.`
      );
    } catch (err) {
      console.error('Error toggling featured in Firestore:', err);
    }
  };

  const handleSaveClinic = async (updatedClinic: ClinicProfile) => {
    try {
      setSyncStatus('syncing');
      setClinic(updatedClinic);
      await saveClinicProfileToDb(updatedClinic);
      setSyncStatus('synced');
      showToast('Dados da clínica e equipe médica sincronizados no Firebase!');
    } catch (err) {
      console.error('Error saving clinic to Firestore:', err);
      setSyncStatus('error');
      showToast('Dados da clínica atualizados localmente.');
    }
  };

  const handleResetToDefaultSamples = async () => {
    if (
      window.confirm(
        'Deseja sincronizar e restaurar o catálogo oficial de procedimentos da Dra. Karoline Ferreira no Firebase?'
      )
    ) {
      try {
        setSyncStatus('syncing');
        setProcedures(SAMPLE_PROCEDURES);
        setClinic(DEFAULT_CLINIC_PROFILE);
        await replaceAllProceduresWithOfficialPdfCatalog();
        setSyncStatus('synced');
        showToast('Catálogo oficial sincronizado no Firebase com sucesso!');
      } catch (err) {
        console.error('Error resetting Firestore samples:', err);
        showToast('Catálogo atualizado localmente.');
      }
    }
  };

  const handleShareSingle = (procedure: Procedure) => {
    setSingleProcedureToExport(procedure);
    setIsExportModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-[#F9F8F6] text-[#1A1A1A] flex flex-col selection:bg-[#A67C52]/25 selection:text-[#1A1A1A]">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#1A1A1A]/90 backdrop-blur-xl text-white px-5 py-3 rounded-lg shadow-2xl border border-white/20 flex items-center gap-3 text-xs font-medium animate-bounce">
          <Check className="w-4 h-4 text-[#C49B74]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Top Header */}
      <Navbar
        currentView={currentView}
        onSelectView={(view) => setCurrentView(view)}
        onOpenExport={() => {
          setSingleProcedureToExport(null);
          setIsExportModalOpen(true);
        }}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        onOpenNewProcedure={() => {
          setSelectedProcedureForEdit(null);
          setIsFormModalOpen(true);
        }}
        clinic={clinic}
        proceduresCount={procedures.length}
        syncStatus={syncStatus}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        {currentView === 'procedures' ? (
          <ProcedureManager
            procedures={procedures}
            clinic={clinic}
            categories={categories}
            onOpenNewProcedure={() => {
              setSelectedProcedureForEdit(null);
              setIsFormModalOpen(true);
            }}
            onEditProcedure={(proc) => {
              setSelectedProcedureForEdit(proc);
              setIsFormModalOpen(true);
            }}
            onDeleteProcedure={handleDeleteProcedure}
            onDuplicateProcedure={handleDuplicateProcedure}
            onToggleFeatured={handleToggleFeatured}
            onViewDetails={(proc) => setSelectedProcedureForDetails(proc)}
            onShareSingle={handleShareSingle}
          />
        ) : (
          <AnamnesisModule
            clinicProfile={clinic}
            catalogProcedures={procedures}
          />
        )}
      </main>

      {/* Modals & Drawers */}
      {/* 1. Detail Modal */}
      <ProcedureDetailModal
        procedure={selectedProcedureForDetails}
        clinic={clinic}
        isOpen={Boolean(selectedProcedureForDetails)}
        onClose={() => setSelectedProcedureForDetails(null)}
        onEdit={(proc) => {
          setSelectedProcedureForDetails(null);
          setSelectedProcedureForEdit(proc);
          setIsFormModalOpen(true);
        }}
        onShareSingle={handleShareSingle}
      />

      {/* 2. Create / Edit Form Modal */}
      <ProcedureFormModal
        isOpen={isFormModalOpen}
        onClose={() => {
          setIsFormModalOpen(false);
          setSelectedProcedureForEdit(null);
        }}
        onSave={handleSaveProcedure}
        procedureToEdit={selectedProcedureForEdit}
        existingCategories={categories}
        availableDoctors={clinic.professionals || []}
      />

      {/* 3. Export / Share Modal (PDF, Image, WhatsApp, QR) */}
      <ShareExportModal
        isOpen={isExportModalOpen}
        onClose={() => {
          setIsExportModalOpen(false);
          setSingleProcedureToExport(null);
        }}
        procedures={procedures}
        clinic={clinic}
        categories={categories}
        singleProcedureToExport={singleProcedureToExport}
      />

      {/* 4. Clinic Settings Modal */}
      <ClinicSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        clinic={clinic}
        onSave={handleSaveClinic}
      />

      {/* Frosted Luxury Footer */}
      <footer className="bg-[#1A1A1A] text-[#E5E4E0] border-t border-white/10 mt-16 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8 pb-8 border-b border-white/10">
            {/* Col 1: Brand */}
            <div className="md:col-span-2 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-sm bg-[#A67C52] text-white font-serif-luxury text-sm font-bold flex items-center justify-center shadow-sm">
                  LV
                </div>
                <h3 className="font-serif-luxury text-xl font-medium tracking-tight text-white">
                  {clinic.name}
                </h3>
              </div>
              <p className="text-xs text-gray-400 max-w-md leading-relaxed">
                {clinic.tagline}. Plataforma de catálogo editorial e compartilhamento inteligente de procedimentos em PDF e Imagem.
              </p>
              {clinic.professionals && clinic.professionals.length > 0 ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  {clinic.professionals.map((doc, dIdx) => (
                    <span key={dIdx} className="text-[11px] text-[#C49B74] tracking-wider uppercase font-medium bg-white/5 px-2.5 py-1 rounded-xs border border-white/10">
                      {doc.name} {doc.specialty || doc.title ? `• ${doc.specialty || doc.title}` : ''}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-[#A67C52] tracking-wider uppercase font-medium">
                  {clinic.professionalName} {clinic.professionalTitle ? `• ${clinic.professionalTitle}` : ''}
                </p>
              )}
            </div>

            {/* Col 2: Fast Navigation */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-widest text-[#A67C52] mb-3">
                Navegação
              </h4>
              <ul className="space-y-2 text-xs text-gray-400">
                <li>
                  <button
                    onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                    className="hover:text-white transition-colors"
                  >
                    Gerenciador de Procedimentos
                  </button>
                </li>
                <li>
                  <button onClick={() => setIsExportModalOpen(true)} className="hover:text-white transition-colors">
                    Exportar Catálogo em PDF
                  </button>
                </li>
                <li>
                  <button onClick={() => setIsSettingsModalOpen(true)} className="hover:text-white transition-colors">
                    Personalizar Dados da Clínica
                  </button>
                </li>
              </ul>
            </div>

            {/* Col 3: Contact & Demo Actions */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-widest text-[#A67C52] mb-3">
                Atendimento
              </h4>
              <p className="text-xs text-gray-400 mb-1">📱 {clinic.phone}</p>
              <p className="text-xs text-gray-400 mb-1">📸 {clinic.instagram}</p>
              <p className="text-xs text-gray-400 mb-3">{clinic.cityState}</p>
              <button
                onClick={handleResetToDefaultSamples}
                className="text-[10px] text-gray-500 hover:text-[#A67C52] flex items-center gap-1 transition-colors uppercase tracking-wider"
                title="Restaurar dados de exemplo"
              >
                <RefreshCw className="w-3 h-3" /> Restaurar demonstração
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500">
            <p>© {new Date().getFullYear()} {clinic.name}. Todos os direitos reservados.</p>
            <div className="flex items-center space-x-2 text-[#A67C52]">
              <div className="w-8 h-[1px] bg-[#A67C52]/40"></div>
              <span className="text-[10px] tracking-widest uppercase font-medium">Design Frosted Glass</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Navbar } from './components/Navbar';
import { ProcedureManager } from './components/ProcedureManager';
import { ProcedureDetailModal } from './components/ProcedureDetailModal';
import { ProcedureFormModal } from './components/ProcedureFormModal';
import { ShareExportModal } from './components/ShareExportModal';
import { ClinicSettingsModal } from './components/ClinicSettingsModal';
import { AnamnesisModule, AnamnesisOpenRequest } from './components/anamnesis/AnamnesisModule';
import { PatientsModule } from './components/patients/PatientsModule';
import { PublicAnamnesisEntry } from './components/anamnesis/PublicAnamnesisEntry';
import { QuotesPanel } from './components/quotes/QuotesPanel';
import { PublicQuoteEntry } from './components/quotes/PublicQuoteEntry';
import { LoginScreen } from './components/auth/LoginScreen';
import { ConfirmDialog, ConfirmRequest } from './components/ConfirmDialog';
import { Procedure, ClinicProfile, Professional, AppView, AnamnesisTemplate } from './types';
import { mapearTemplatesPorProcedimento } from './utils/templateMatching';
import { SAMPLE_PROCEDURES, DEFAULT_CLINIC_PROFILE, INITIAL_CATEGORIES } from './data/initialData';
import { ClinicLogo } from './components/ClinicLogo';
import { RefreshCw, Check, Loader2, AlertTriangle, AlertCircle } from 'lucide-react';
import {
  seedInitialDataIfEmpty,
  seedAnamnesisInitialDataIfEmpty,
  subscribeToProcedures,
  subscribeToClinicProfile,
  saveProcedureToDb,
  deleteProcedureFromDb,
  saveClinicProfileToDb,
  publishPublicClinicProfile,
  replaceAllProceduresWithOfficialPdfCatalog,
  subscribeToAnamnesisTemplates,
  isQuotaOrOfflineError,
  mergeWithDefaultProcedures,
  ensureAllDefaultProceduresInFirestore,
} from './services/databaseService';
import { DEFAULT_PROCEDURE_TEMPLATES } from './data/anamnesisInitialData';
import { onAuthChange, logout, type User } from './services/authService';

const STORAGE_KEY_PROCEDURES = 'aura_bronze_procedures_v1';
const STORAGE_KEY_DELETED_PROCEDURES = 'aura_bronze_deleted_procedures_v1';
const STORAGE_KEY_CLINIC = 'aura_bronze_clinic_v1';

// A ficha de anamnese pública (link enviado ao cliente) é servida por um shell totalmente
// separado do painel administrativo — sem login, sem catálogo. Esta checagem depende só da
// URL de carregamento da página, então é estável durante toda a vida desta instância do App.
const publicSearchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
const isPublicAnamnesisRoute = !!(publicSearchParams?.get('anamnese') || publicSearchParams?.get('ficha'));
const isPublicQuoteRoute = !!publicSearchParams?.get('orcamento');

function MainCatalogApp() {
  // Lista de IDs excluídos manualmente pelo usuário
  const [deletedProcedureIds, setDeletedProcedureIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_DELETED_PROCEDURES);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Load procedures from localStorage or default samples initial fallback.
  // Utiliza mergeWithDefaultProcedures para que edições feitas em procedimentos individuais
  // (como trocar foto ou preço) nunca façam os demais procedimentos do catálogo desaparecerem.
  const [procedures, setProcedures] = useState<Procedure[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_PROCEDURES);
      const savedDeleted = localStorage.getItem(STORAGE_KEY_DELETED_PROCEDURES);
      const deletedList: string[] = savedDeleted ? JSON.parse(savedDeleted) : [];

      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return mergeWithDefaultProcedures(parsed, deletedList);
        }
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
        const parsed = JSON.parse(saved);
        const mergedProfessionals = (parsed.professionals && parsed.professionals.length > 0)
          ? parsed.professionals.map((p: Professional) => {
              if (
                (!p.photoUrl || p.photoUrl.trim() === '') &&
                (p.id === 'doc-karoline' || p.name.toLowerCase().includes('karoline'))
              ) {
                return { ...p, photoUrl: '/dra-karoline.jpg' };
              }
              return p;
            })
          : DEFAULT_CLINIC_PROFILE.professionals;

        return {
          ...DEFAULT_CLINIC_PROFILE,
          ...parsed,
          professionals: mergedProfessionals,
        };
      }
    } catch (e) {
      console.error('Error loading saved clinic profile:', e);
    }
    return DEFAULT_CLINIC_PROFILE;
  });

  // Firebase Authentication — o painel inteiro fica atrás deste gate
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthChange((user) => {
      setAuthUser(user);
      setAuthLoading(false);
    });
    return unsubscribe;
  }, []);

  // Firebase Real-time Synchronization Status
  const [syncStatus, setSyncStatus] = useState<'syncing' | 'synced' | 'error'>('synced');
  const [isQuotaExceeded, setIsQuotaExceeded] = useState(false);
  const publicProfilePublishedRef = useRef(false);
  const firebaseClinicSyncedPhotoRef = useRef(false);

  useEffect(() => {
    if (syncStatus === 'error') {
      if (isQuotaExceeded) {
        showToast('Modo local: Cota diária gratuita do Firebase atingida. Seus dados continuam disponíveis.');
      } else {
        showToast('Modo local: suas alterações serão sincronizadas quando a conexão voltar.');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncStatus, isQuotaExceeded]);

  // Navigation and Modals State
  const [currentView, setCurrentView] = useState<AppView>('procedures');
  const [selectedProcedureForDetails, setSelectedProcedureForDetails] = useState<Procedure | null>(null);
  const [selectedProcedureForEdit, setSelectedProcedureForEdit] = useState<Procedure | null>(null);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [singleProcedureToExport, setSingleProcedureToExport] = useState<Procedure | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastTone, setToastTone] = useState<'ok' | 'erro'>('ok');
  const [confirmacao, setConfirmacao] = useState<ConfirmRequest | null>(null);

  // As fichas-modelo de anamnese moravam só dentro do AnamnesisModule. O card do catálogo agora
  // precisa saber quais procedimentos já têm ficha para habilitar o botão "Anamnese", então a
  // assinatura subiu para cá — o módulo recebe a mesma lista por prop, sem duplicar a leitura.
  const [anamnesisTemplates, setAnamnesisTemplates] = useState<AnamnesisTemplate[]>(DEFAULT_PROCEDURE_TEMPLATES);
  const [templatesCarregando, setTemplatesCarregando] = useState(false);

  /**
   * Pedido vindo do catálogo para o módulo de anamnese. O `nonce` existe porque tocar "Anamnese"
   * duas vezes no mesmo procedimento é um pedido novo — sem ele o módulo não veria mudança alguma
   * e o formulário não reabriria.
   */
  const [anamnesisRequest, setAnamnesisRequest] = useState<AnamnesisOpenRequest | null>(null);

  // Initialize Firebase and subscribe to real-time updates — só depois de autenticado,
  // já que as regras do Firestore agora exigem login para procedures/clinic_settings.
  useEffect(() => {
    if (!authUser) return;
    let unsubscribeProcedures: (() => void) | undefined;
    let unsubscribeClinic: (() => void) | undefined;

    async function initFirestore() {
      try {
        setSyncStatus('syncing');
        // 1. Seed initial data to Firestore if the collections are empty
        await seedInitialDataIfEmpty();
        await seedAnamnesisInitialDataIfEmpty();

        // 2. Subscribe to real-time procedures collection
        unsubscribeProcedures = subscribeToProcedures(
          (firebaseProcedures) => {
            if (firebaseProcedures && firebaseProcedures.length > 0) {
              let currentDeleted: string[] = [];
              try {
                const savedDeleted = localStorage.getItem(STORAGE_KEY_DELETED_PROCEDURES);
                if (savedDeleted) currentDeleted = JSON.parse(savedDeleted);
              } catch {
                currentDeleted = [];
              }

              const merged = mergeWithDefaultProcedures(firebaseProcedures, currentDeleted);
              setProcedures(merged);
              localStorage.setItem(STORAGE_KEY_PROCEDURES, JSON.stringify(merged));

              // Sincroniza em segundo plano no Firestore quaisquer procedimentos base ausentes
              ensureAllDefaultProceduresInFirestore(firebaseProcedures, currentDeleted).catch(() => {});
            }
            setSyncStatus('synced');
          },
          (err) => {
            if (isQuotaOrOfflineError(err)) {
              setIsQuotaExceeded(true);
            }
            console.warn('Firestore procedures subscription offline/error:', err);
            setSyncStatus('error');
          }
        );

        // 3. Subscribe to real-time clinic profile document
        unsubscribeClinic = subscribeToClinicProfile(
          (firebaseClinic) => {
            if (firebaseClinic) {
              const updatedProfessionals = (firebaseClinic.professionals && firebaseClinic.professionals.length > 0)
                ? firebaseClinic.professionals.map((p) => {
                    if (
                      (!p.photoUrl || p.photoUrl.trim() === '') &&
                      (p.id === 'doc-karoline' || p.name.toLowerCase().includes('karoline'))
                    ) {
                      return { ...p, photoUrl: '/dra-karoline.jpg' };
                    }
                    return p;
                  })
                : DEFAULT_CLINIC_PROFILE.professionals;

              const enrichedClinic: ClinicProfile = {
                ...firebaseClinic,
                professionals: updatedProfessionals,
              };

              setClinic(enrichedClinic);
              localStorage.setItem(STORAGE_KEY_CLINIC, JSON.stringify(enrichedClinic));

              // If Firestore was missing Dra. Karoline's photo, persist it to Firestore so it stays permanently synced
              const hadMissingPhoto = (firebaseClinic.professionals || []).some(
                (p) => (!p.photoUrl || p.photoUrl.trim() === '') && (p.id === 'doc-karoline' || p.name.toLowerCase().includes('karoline'))
              ) || !firebaseClinic.professionals || firebaseClinic.professionals.length === 0;

              if (hadMissingPhoto && !firebaseClinicSyncedPhotoRef.current) {
                firebaseClinicSyncedPhotoRef.current = true;
                saveClinicProfileToDb(enrichedClinic).catch((err) =>
                  console.warn('Auto-sync doctor photo to Firestore warning:', err)
                );
              }

              // Garante que o espelho público exista mesmo em clínicas que nunca reabriram as
              // configurações desde que ele passou a ser usado — é dele que a página da paciente
              // tira nome, telefone e equipe. Uma vez por sessão, e nunca bloqueante.
              if (!publicProfilePublishedRef.current) {
                publicProfilePublishedRef.current = true;
                publishPublicClinicProfile(enrichedClinic).catch((err) =>
                  console.warn('Não foi possível publicar o espelho público da clínica:', err)
                );
              }
            }
            setSyncStatus('synced');
          },
          (err) => {
            if (isQuotaOrOfflineError(err)) {
              setIsQuotaExceeded(true);
            }
            console.warn('Firestore clinic subscription offline/error:', err);
            setSyncStatus('error');
          }
        );
      } catch (err) {
        if (isQuotaOrOfflineError(err)) {
          setIsQuotaExceeded(true);
          console.warn('Firebase initialization offline/cota diária atingida.');
        } else {
          console.error('Firebase initialization error:', err);
        }
        setSyncStatus('error');
      }
    }

    initFirestore();

    return () => {
      if (unsubscribeProcedures) unsubscribeProcedures();
      if (unsubscribeClinic) unsubscribeClinic();
    };
  }, [authUser]);

  // Assinatura das fichas-modelo — mesma condição de login das demais coleções.
  useEffect(() => {
    if (!authUser) return;
    const unsubscribe = subscribeToAnamnesisTemplates(
      (data) => {
        setAnamnesisTemplates(data);
        setTemplatesCarregando(false);
      },
      (err) => {
        if (isQuotaOrOfflineError(err)) {
          setIsQuotaExceeded(true);
        }
        console.warn('Firestore anamnesis templates subscription offline/error:', err);
        // Desistir do estado de carregamento é deliberado: sem isso, uma falha de rede deixaria
        // todo botão "Anamnese" permanentemente habilitado por engano.
        setTemplatesCarregando(false);
      }
    );
    return unsubscribe;
  }, [authUser]);

  const templatesPorProcedimento = useMemo(
    () => mapearTemplatesPorProcedimento(anamnesisTemplates, procedures),
    [anamnesisTemplates, procedures]
  );

  // Backup sync to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_PROCEDURES, JSON.stringify(procedures));
    } catch (e) {
      console.warn('Aviso: cota de localStorage atingida, salvando versão sanitizada:', e);
      try {
        const sanitized = procedures.map((p) => ({
          ...p,
          images: (p.images || []).map((img) => (img && img.startsWith('data:') ? '' : img)),
        }));
        localStorage.setItem(STORAGE_KEY_PROCEDURES, JSON.stringify(sanitized));
      } catch {
        // Ignora caso o storage local esteja totalmente ocupado
      }
    }
  }, [procedures]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_CLINIC, JSON.stringify(clinic));
    } catch (e) {
      console.error('Error saving clinic to localStorage:', e);
    }
  }, [clinic]);

  const showToast = (msg: string, tone: 'ok' | 'erro' = 'ok') => {
    setToastMessage(msg);
    setToastTone(tone);
    // Um erro precisa de tempo para ser lido inteiro — ele diz o que fazer, não só que falhou.
    setTimeout(() => setToastMessage(null), tone === 'erro' ? 8000 : 3500);
  };

  // Derive unique categories
  const categories = Array.from(
    new Set([
      'Todos',
      ...INITIAL_CATEGORIES.filter((c) => c !== 'Todos'),
      ...procedures.map((p) => p.category).filter(Boolean),
    ])
  ).filter(
    (c) =>
      c !== 'Depilação a Laser - Facial' &&
      c !== 'Depilação a Laser - Íntima' &&
      c !== 'Depilação a Laser - Corporal' &&
      c !== 'Depilação a Laser - Intima'
  );

  /**
   * "Anamnese" no card do catálogo. Navega para o módulo antes de abrir o formulário — como o
   * fluxo termina nas Anamneses de qualquer jeito, saltar de contexto agora é menos desorientador
   * do que saltar depois de salvar. Também evita duplicar aqui o modal de preenchimento, que
   * continua sendo do AnamnesisModule.
   */
  const handleOpenAnamnesis = (procedure: Procedure) => {
    const template = templatesPorProcedimento.get(procedure.id);
    setAnamnesisRequest({
      tipo: 'preencher',
      procedure,
      templateId: template?.id,
      nonce: Date.now(),
    });
    setCurrentView('anamnesis');
  };

  /** Único caminho para destravar o botão "Anamnese" de um procedimento sem ficha-modelo. */
  const handleCreateAnamnesisTemplate = (procedure: Procedure) => {
    setAnamnesisRequest({ tipo: 'criar-ficha', procedure, nonce: Date.now() });
    setCurrentView('anamnesis');
  };

  // Handlers with Firestore Persistence
  const handleSaveProcedure = async (procedure: Procedure) => {
    const anterior = procedures.find((p) => p.id === procedure.id) || null;

    try {
      setSyncStatus('syncing');

      // Persiste no Firebase Storage e Firestore com confirmação garantida do servidor
      const salvo = await saveProcedureToDb(procedure);

      // Atualiza o estado da aplicação com as URLs definitivas geradas pelo Storage
      setProcedures((prev) => {
        const existingIndex = prev.findIndex((p) => p.id === salvo.id);
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = salvo;
          return updated;
        } else {
          return [salvo, ...prev];
        }
      });

      setSyncStatus('synced');
      showToast(`Procedimento "${salvo.title}" salvo e sincronizado na nuvem!`);
    } catch (err) {
      console.error('Error saving procedure to Firestore:', err);
      setSyncStatus('error');

      // Reverte para o estado anterior — nada de manter na tela algo que não foi gravado.
      if (anterior) {
        setProcedures((prev) => prev.map((p) => (p.id === procedure.id ? anterior : p)));
      }

      const motivo = err instanceof Error ? err.message : 'Erro desconhecido ao gravar na nuvem.';
      showToast(`Não foi possível salvar "${procedure.title}". ${motivo}`, 'erro');
      throw err;
    }
  };

  const handleDeleteProcedure = (id: string) => {
    const proc = procedures.find((p) => p.id === id);
    if (!proc) return;

    setConfirmacao({
      titulo: `Remover "${proc.title}"?`,
      mensagem:
        'O procedimento sai do catálogo e deixa de aparecer para as clientes. Orçamentos já emitidos com ele não são afetados.',
      textoConfirmar: 'Remover',
      onConfirmar: async () => {
        try {
          setSyncStatus('syncing');
          const updatedDeleted = Array.from(new Set([...deletedProcedureIds, id]));
          setDeletedProcedureIds(updatedDeleted);
          try {
            localStorage.setItem(STORAGE_KEY_DELETED_PROCEDURES, JSON.stringify(updatedDeleted));
          } catch {
            // ignore
          }

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
      },
    });
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

  const handleResetToDefaultSamples = () => {
    setConfirmacao({
      titulo: 'Restaurar o catálogo oficial?',
      mensagem:
        'Todos os procedimentos atuais são apagados e substituídos pelo catálogo oficial da Dra. Karoline Ferreira, e os dados da clínica voltam ao padrão. Qualquer edição feita no catálogo se perde.',
      textoConfirmar: 'Restaurar catálogo',
      onConfirmar: async () => {
        try {
          setSyncStatus('syncing');
          setDeletedProcedureIds([]);
          try {
            localStorage.removeItem(STORAGE_KEY_DELETED_PROCEDURES);
          } catch {
            // ignore
          }
          setProcedures(SAMPLE_PROCEDURES);
          setClinic(DEFAULT_CLINIC_PROFILE);
          await replaceAllProceduresWithOfficialPdfCatalog();
          setSyncStatus('synced');
          showToast('Catálogo oficial sincronizado no Firebase com sucesso!');
        } catch (err) {
          console.error('Error resetting Firestore samples:', err);
          showToast('Catálogo atualizado localmente.');
        }
      },
    });
  };

  const handleShareSingle = (procedure: Procedure) => {
    setSingleProcedureToExport(procedure);
    setIsExportModalOpen(true);
  };

  const currentProfessional = clinic.professionals?.find((p) => p.uid === authUser?.uid) || null;
  const isAdminUser = !!currentProfessional?.isAdmin;

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#F9F8F6] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#A67C52] animate-spin" />
      </div>
    );
  }

  if (!authUser) {
    return <LoginScreen />;
  }

  return (
    <div className="min-h-screen bg-[#F9F8F6] text-[#1A1A1A] sm:flex selection:bg-[#A67C52]/25 selection:text-[#1A1A1A]">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 max-w-sm backdrop-blur-xl text-white px-5 py-3 rounded-lg shadow-2xl border flex items-start gap-3 text-xs font-medium ${
            toastTone === 'erro'
              ? 'bg-[#7F1D1D]/95 border-red-300/40'
              : 'bg-[#1A1A1A]/90 border-white/20 animate-bounce'
          }`}
        >
          {toastTone === 'erro' ? (
            <AlertTriangle className="w-4 h-4 text-red-200 shrink-0 mt-px" />
          ) : (
            <Check className="w-4 h-4 text-[#C49B74] shrink-0 mt-px" />
          )}
          <span className="leading-relaxed">{toastMessage}</span>
        </div>
      )}

      {/* Navigation: mobile header+links, tablet icon rail, desktop sidebar */}
      <Navbar
        currentView={currentView}
        onSelectView={(view) => setCurrentView(view)}
        onOpenExport={() => {
          setSingleProcedureToExport(null);
          setIsExportModalOpen(true);
        }}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        clinic={clinic}
        proceduresCount={procedures.length}
        currentProfessionalName={currentProfessional?.name}
        onLogout={logout}
      />

      {/* Content Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {isQuotaExceeded && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900">
            <div className="flex items-start sm:items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
              <span>
                <strong>Modo Offline (Cota diária do Firebase atingida):</strong> O limite gratuito diário de 50.000 leituras do Firestore foi atingido hoje. O aplicativo segue funcionando normalmente com os dados locais salvos. A cota é renovada automaticamente pelo Google às 04:00 BRT.
              </span>
            </div>
            <a
              href="https://console.firebase.google.com/project/database-dra-karoline/firestore/databases/ai-studio-aurabronzecatlog-2ed33bb0-bfc5-4dcb-8c57-c6bd40087442/data?openUpgradeDialog=true"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-amber-900 hover:text-amber-950 underline underline-offset-2 shrink-0 self-start sm:self-auto"
            >
              Ativar plano Blaze no Firebase &rarr;
            </a>
          </div>
        )}
        <main className="flex-1 w-full">
          {currentView === 'procedures' ? (
            <ProcedureManager
              procedures={procedures}
              clinic={clinic}
              categories={categories}
              templatesPorProcedimento={templatesPorProcedimento}
              templatesCarregando={templatesCarregando}
              onOpenAnamnesis={handleOpenAnamnesis}
              onCreateAnamnesisTemplate={handleCreateAnamnesisTemplate}
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
          ) : currentView === 'patients' ? (
            <PatientsModule
              clinic={clinic}
              catalogProcedures={procedures}
              templates={anamnesisTemplates}
            />
          ) : currentView === 'anamnesis' ? (
            <AnamnesisModule
              clinicProfile={clinic}
              catalogProcedures={procedures}
              templates={anamnesisTemplates}
              openRequest={anamnesisRequest}
              onOpenRequestHandled={() => setAnamnesisRequest(null)}
            />
          ) : (
            <QuotesPanel clinic={clinic} catalogProcedures={procedures} />
          )}
        </main>

        {/* Frosted Luxury Footer */}
        <footer className="bg-[#1A1A1A] text-[#E5E4E0] border-t border-white/10 mt-16 transition-all">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8 pb-8 border-b border-white/10">
              {/* Col 1: Brand */}
              <div className="md:col-span-2 space-y-3">
                <div className="flex items-center gap-3">
                  <ClinicLogo
                    clinic={clinic}
                    className="w-8 h-8 rounded-sm shrink-0"
                    monogramClassName="bg-[#A67C52] text-white font-serif-luxury text-sm font-bold shadow-sm"
                  />
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
        currentUserUid={authUser?.uid}
        isAdminUser={isAdminUser}
      />

      {/* 5. Confirmação de ações destrutivas */}
      <ConfirmDialog pedido={confirmacao} onFechar={() => setConfirmacao(null)} />
    </div>
  );
}

export default function App() {
  if (isPublicAnamnesisRoute) {
    return <PublicAnamnesisEntry />;
  }

  // Mesmo padrão da anamnese: a paciente abre o orçamento pelo link, sem login
  if (isPublicQuoteRoute) {
    return <PublicQuoteEntry />;
  }

  return <MainCatalogApp />;
}


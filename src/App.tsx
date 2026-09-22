import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Navbar } from './components/Navbar';
import { ProcedureManager } from './components/ProcedureManager';
import { ProcedureDetailModal } from './components/ProcedureDetailModal';
import { ProcedureFormModal } from './components/ProcedureFormModal';
import { ShareExportModal } from './components/ShareExportModal';
import { ClinicSettingsModal } from './components/ClinicSettingsModal';
import { LaserAreasManagerModal } from './components/laser/LaserAreasManagerModal';
import { AnamnesisModule, AnamnesisOpenRequest } from './components/anamnesis/AnamnesisModule';
import { PatientsModule } from './components/patients/PatientsModule';
import { PublicAnamnesisEntry } from './components/anamnesis/PublicAnamnesisEntry';
import { QuotesPanel } from './components/quotes/QuotesPanel';
import { EvaluationsModule } from './components/evaluations/EvaluationsModule';
import { AgendaModule } from './components/agenda/AgendaModule';
import { filaDePendentes } from './utils/evaluations';
import { agendamentosAtrasados } from './utils/agenda';
import { PublicQuoteEntry } from './components/quotes/PublicQuoteEntry';
import { LoginScreen } from './components/auth/LoginScreen';
import { ConfirmDialog, ConfirmRequest } from './components/ConfirmDialog';
import { CommandPalette, AcaoRapida } from './components/common/CommandPalette';
import {
  Procedure,
  ClinicProfile,
  Professional,
  AppView,
  AnamnesisTemplate,
  AnamnesisQuestion,
  Attendance,
  EvaluationTemplate,
  Patient,
  PedidoDeNavegacao,
  Quote,
} from './types';
import { mapearTemplatesPorProcedimento, isLaserCategory } from './utils/templateMatching';
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
  publicarMapaCorporalDoLaser,
  publicarEspelhoPublicoSeMudou,
  replaceAllProceduresWithOfficialPdfCatalog,
  subscribeToAnamnesisTemplates,
  subscribeToEvaluationTemplates,
  subscribeToEvaluationGeneralQuestions,
  subscribeToAttendances,
  subscribeToPatients,
  subscribeToQuotes,
  isQuotaOrOfflineError,
  normalizeProcedureList,
} from './services/databaseService';
import { DEFAULT_PROCEDURE_TEMPLATES } from './data/anamnesisInitialData';
import { onAuthChange, logout, type User } from './services/authService';
import { firebaseConfig } from './lib/firebase';

/**
 * Endereço do banco no console do Firebase, montado a partir da configuração em vez de escrito à
 * mão. Antes o `projectId` e o id do banco estavam colados direto no `href`, e ao trocar de banco
 * o link continuava apontando para o anterior — justamente no aviso que a clínica abre quando
 * precisa investigar a cota.
 */
const URL_DO_BANCO_NO_CONSOLE = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/firestore/databases/${firebaseConfig.firestoreDatabaseId || '(default)'}/data`;

const STORAGE_KEY_PROCEDURES = 'aura_bronze_procedures_v1';
const STORAGE_KEY_CLINIC = 'aura_bronze_clinic_v1';

// A ficha de anamnese pública (link enviado ao cliente) é servida por um shell totalmente
// separado do painel administrativo — sem login, sem catálogo. Esta checagem depende só da
// URL de carregamento da página, então é estável durante toda a vida desta instância do App.
const publicSearchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
const isPublicAnamnesisRoute = !!(publicSearchParams?.get('anamnese') || publicSearchParams?.get('ficha'));
const isPublicQuoteRoute = !!publicSearchParams?.get('orcamento');

function MainCatalogApp() {
  // Catálogo exibido enquanto o Firestore não responde. É só uma cópia local da última
  // sincronização: a assinatura em tempo real substitui esta lista assim que chega.
  const [procedures, setProcedures] = useState<Procedure[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_PROCEDURES);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return normalizeProcedureList(parsed);
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
  const [isLaserAreasOpen, setIsLaserAreasOpen] = useState(false);
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
   * Fichas de avaliação, atendimentos e pacientes sobem para cá — e não para dentro da tela de
   * avaliação — porque o contador do menu lateral precisa da fila de pendentes estando o usuário
   * em qualquer tela. As assinaturas são compartilhadas (`subscribeShared`), então quem já as
   * consumia adiante continua sem pagar leitura nova.
   */
  const [evaluationTemplates, setEvaluationTemplates] = useState<EvaluationTemplate[]>([]);
  const [evaluationGerais, setEvaluationGerais] = useState<AnamnesisQuestion[]>([]);
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [allPatients, setAllPatients] = useState<Patient[]>([]);
  /**
   * Orçamentos sobem para cá por causa da tela Hoje (faturamento do mês, orçamentos abertos,
   * conversão) e da busca global. **Não é assinatura nova**: `subscribeToQuotes` passa pelo
   * `subscribeShared`, então esta é a mesma que o painel de Orçamentos e o de Pacientes já
   * consomem — quem chegar depois recebe o valor em cache, sem pagar leitura.
   */
  const [quotes, setQuotes] = useState<Quote[]>([]);

  /**
   * Primeira resposta do Firestore ainda não chegou — o que as telas usam para desenhar
   * skeleton no lugar de uma lista vazia. Vira `false` também no erro: uma falha de rede
   * não pode deixar a tela pulsando para sempre.
   */
  const [atendimentosCarregando, setAtendimentosCarregando] = useState(true);
  /**
   * O catálogo é diferente das outras coleções: ele tem cópia local da última sincronização,
   * e mostrar essa cópia é melhor do que mostrar skeleton. Só quem abre o app pela primeira
   * vez (sem cache e sem os exemplos ainda) vê o carregamento.
   */
  const [proceduresCarregando, setProceduresCarregando] = useState(
    () => !localStorage.getItem(STORAGE_KEY_PROCEDURES)
  );

  /**
   * Pedido vindo do catálogo para o módulo de anamnese. O `nonce` existe porque tocar "Anamnese"
   * duas vezes no mesmo procedimento é um pedido novo — sem ele o módulo não veria mudança alguma
   * e o formulário não reabriria.
   */
  const [anamnesisRequest, setAnamnesisRequest] = useState<AnamnesisOpenRequest | null>(null);

  /** Busca global (Cmd/Ctrl+K no desktop, campo da tela Hoje no celular). */
  const [buscaAberta, setBuscaAberta] = useState(false);

  /**
   * Pedido de navegação para a tela de destino — "abra a ficha da Ana", "comece um orçamento".
   * Mesma mecânica de `anamnesisRequest`: quem recebe consome e avisa, e o `nonce` garante que
   * pedir a mesma coisa duas vezes conte como dois pedidos.
   */
  const [pedido, setPedido] = useState<PedidoDeNavegacao | null>(null);

  /** Navega e, de passagem, registra o pedido que a tela de destino deve atender. */
  const navegar = (p: Omit<PedidoDeNavegacao, 'nonce'>) => {
    setPedido({ ...p, nonce: Date.now() });
    setCurrentView(p.view);
    window.scrollTo({ top: 0 });
  };

  const acaoRapida = (acao: AcaoRapida) => {
    if (acao === 'novo-agendamento') navegar({ view: 'agenda', criarNovo: true });
    else if (acao === 'nova-paciente') navegar({ view: 'patients', criarNovo: true });
    else navegar({ view: 'quotes', criarNovo: true });
  };

  /**
   * Cmd+K no Mac, Ctrl+K no resto. Fica no `document` porque a busca precisa abrir de qualquer
   * tela, inclusive com o foco dentro de um formulário.
   */
  useEffect(() => {
    const noTeclado = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setBuscaAberta((aberta) => !aberta);
      }
    };
    document.addEventListener('keydown', noTeclado);
    return () => document.removeEventListener('keydown', noTeclado);
  }, []);

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
              const lista = normalizeProcedureList(firebaseProcedures);
              setProcedures(lista);
              localStorage.setItem(STORAGE_KEY_PROCEDURES, JSON.stringify(lista));
            }
            setProceduresCarregando(false);
            setSyncStatus('synced');
          },
          (err) => {
            if (isQuotaOrOfflineError(err)) {
              setIsQuotaExceeded(true);
            }
            console.warn('Firestore procedures subscription offline/error:', err);
            setProceduresCarregando(false);
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
              // tira nome, telefone e equipe. Nunca bloqueante.
              //
              // O `ref` evita a repetição dentro desta montagem; ele zera a cada F5, e por isso a
              // decisão de gravar mesmo mora em `publicarEspelhoPublicoSeMudou`, que compara o
              // conteúdo com o da última publicação e não escreve nada quando nada mudou.
              if (!publicProfilePublishedRef.current) {
                publicProfilePublishedRef.current = true;
                publicarEspelhoPublicoSeMudou(enrichedClinic).catch((err) =>
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

  // Avaliações: fichas-modelo, perguntas gerais, atendimentos e pacientes.
  useEffect(() => {
    if (!authUser) return;
    const unsubs = [
      subscribeToEvaluationTemplates(setEvaluationTemplates, (err) => {
        if (isQuotaOrOfflineError(err)) setIsQuotaExceeded(true);
      }),
      subscribeToEvaluationGeneralQuestions(setEvaluationGerais, (err) => {
        if (isQuotaOrOfflineError(err)) setIsQuotaExceeded(true);
      }),
      subscribeToAttendances(
        (data) => {
          setAttendances(data);
          setAtendimentosCarregando(false);
        },
        (err) => {
          if (isQuotaOrOfflineError(err)) setIsQuotaExceeded(true);
          setAtendimentosCarregando(false);
        }
      ),
      subscribeToPatients(setAllPatients, (err) => {
        if (isQuotaOrOfflineError(err)) setIsQuotaExceeded(true);
      }),
      subscribeToQuotes(setQuotes, (err) => {
        if (isQuotaOrOfflineError(err)) setIsQuotaExceeded(true);
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [authUser]);

  const avaliacoesPendentes = useMemo(
    () => filaDePendentes(attendances).length,
    [attendances]
  );

  /** Agendamentos que já passaram e continuam sem desfecho — o selo da Agenda no menu. */
  const agendamentosPendentes = useMemo(
    () => agendamentosAtrasados(attendances).length,
    [attendances]
  );

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

      // Uma área aplicada (ou removida) muda o mapa que a paciente vê na ficha de anamnese, então
      // o espelho público acompanha o salvamento. Só quando o procedimento é de laser: um botox
      // salvo não tem por que reescrever um documento de 10 KB.
      if (isLaserCategory(salvo.category) || isLaserCategory(anterior?.category)) {
        const catalogoAtualizado = procedures.some((p) => p.id === salvo.id)
          ? procedures.map((p) => (p.id === salvo.id ? salvo : p))
          : [...procedures, salvo];
        await publicarMapaCorporalDoLaser(catalogoAtualizado, clinic);
      }

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

          // O servidor não confirmou: o procedimento continua no banco, então ele volta para a
          // tela. Dizer "removido" aqui era prometer algo que a próxima abertura desmentiria.
          setProcedures((prev) =>
            prev.some((p) => p.id === id)
              ? prev
              : normalizeProcedureList([...prev, proc])
          );

          const motivo = err instanceof Error ? err.message : 'Erro desconhecido ao gravar na nuvem.';
          showToast(`Não foi possível remover "${proc.title}". ${motivo}`, 'erro');
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
    const anterior = clinic;
    try {
      setSyncStatus('syncing');
      setClinic(updatedClinic);
      // O perfil que volta traz logo, capa e fotos da equipe já como URL do Storage, no lugar das
      // base64 que entraram pelo formulário. É essa versão que precisa ficar na tela e no backup
      // local — senão o navegador segue carregando (e o localStorage segue guardando) algumas
      // centenas de KB de imagem à toa até o próximo F5.
      const clinicaSalva = await saveClinicProfileToDb(updatedClinic);
      setClinic(clinicaSalva);

      // O espelho público carrega as URLs dos manequins, então ele acompanha o salvamento do
      // perfil. Chamada explícita, a partir da ação da equipe — nunca em carregamento de tela.
      await publicarMapaCorporalDoLaser(procedures, clinicaSalva);

      setSyncStatus('synced');
      showToast('Dados da clínica e equipe médica sincronizados no Firebase!');
    } catch (err) {
      console.error('Error saving clinic to Firestore:', err);
      setSyncStatus('error');
      // Desfaz o estado otimista: ao contrário do resto do sistema, aqui a falha pode ser a recusa
      // deliberada de gravar um manequim que não subiu para o Storage. Manter a versão otimista
      // deixaria a base64 de 500 KB viva na tela e no localStorage — exatamente o que a recusa
      // existe para impedir — sob um aviso de "salvo localmente" que seria mentira.
      setClinic(anterior);
      showToast(
        err instanceof Error && err.message
          ? err.message
          : 'Não foi possível salvar os dados da clínica. Tente novamente.',
        'erro'
      );
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
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand animate-spin" />
      </div>
    );
  }

  if (!authUser) {
    return <LoginScreen />;
  }

  return (
    <div className="min-h-screen bg-surface text-ink sm:flex selection:bg-brand/25 selection:text-ink">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 max-w-sm text-white px-5 py-3 rounded-lg shadow-2xl border flex items-start gap-3 text-xs font-medium ${
            toastTone === 'erro'
              ? 'bg-[#7F1D1D]/95 border-red-300/40'
              : 'bg-ink/90 border-white/20 animate-bounce'
          }`}
        >
          {toastTone === 'erro' ? (
            <AlertTriangle className="w-4 h-4 text-red-200 shrink-0 mt-px" />
          ) : (
            <Check className="w-4 h-4 text-brand-light shrink-0 mt-px" />
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
        avaliacoesPendentesCount={avaliacoesPendentes}
        agendamentosPendentesCount={agendamentosPendentes}
        currentProfessionalName={currentProfessional?.name}
        onOpenBusca={() => setBuscaAberta(true)}
        onLogout={logout}
      />

      {/* Content Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {isQuotaExceeded && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900">
            <div className="flex items-start sm:items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
              <span>
                <strong>Modo Offline (Cota diária do Firebase atingida):</strong> O limite gratuito diário do Firestore foi atingido hoje — pode ser o de leitura ou o de gravação. Consultar os dados segue funcionando; salvar pode falhar até a cota virar. A cota é renovada automaticamente pelo Google às 04:00 BRT.
              </span>
            </div>
            <a
              href={URL_DO_BANCO_NO_CONSOLE}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-amber-900 hover:text-amber-950 underline underline-offset-2 shrink-0 self-start sm:self-auto"
            >
              Ver o uso no Firebase &rarr;
            </a>
          </div>
        )}
        <main className="flex-1 w-full">
          {currentView === 'agenda' ? (
            <AgendaModule
              clinic={clinic}
              catalogProcedures={procedures}
              atendimentos={attendances}
              pacientes={allPatients}
              professionals={clinic.professionals || []}
              currentProfessionalId={currentProfessional?.id}
              carregando={atendimentosCarregando}
              pedido={currentView === 'agenda' ? pedido : null}
              onPedidoAtendido={() => setPedido(null)}
            />
          ) : currentView === 'procedures' ? (
            <ProcedureManager
              procedures={procedures}
              clinic={clinic}
              categories={categories}
              templatesPorProcedimento={templatesPorProcedimento}
              templatesCarregando={templatesCarregando}
              carregando={proceduresCarregando}
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
              fichasAvaliacao={evaluationTemplates}
              avaliacaoGerais={evaluationGerais}
              currentProfessionalId={currentProfessional?.id}
              pedido={currentView === 'patients' ? pedido : null}
              onPedidoAtendido={() => setPedido(null)}
            />
          ) : currentView === 'anamnesis' ? (
            <AnamnesisModule
              clinicProfile={clinic}
              catalogProcedures={procedures}
              templates={anamnesisTemplates}
              openRequest={anamnesisRequest}
              onOpenRequestHandled={() => setAnamnesisRequest(null)}
            />
          ) : currentView === 'evaluations' ? (
            <EvaluationsModule
              clinicProfile={clinic}
              catalogProcedures={procedures}
              fichas={evaluationTemplates}
              atendimentos={attendances}
              pacientes={allPatients}
              professionals={clinic.professionals || []}
              gerais={evaluationGerais}
              carregando={atendimentosCarregando}
            />
          ) : (
            <QuotesPanel
              clinic={clinic}
              catalogProcedures={procedures}
              pedido={currentView === 'quotes' ? pedido : null}
              onPedidoAtendido={() => setPedido(null)}
            />
          )}
        </main>

        {/* Frosted Luxury Footer */}
        <footer className="bg-ink text-line-soft border-t border-white/10 mt-16 transition-all">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8 pb-8 border-b border-white/10">
              {/* Col 1: Brand */}
              <div className="md:col-span-2 space-y-3">
                <div className="flex items-center gap-3">
                  <ClinicLogo
                    clinic={clinic}
                    className="w-8 h-8 rounded-sm shrink-0"
                    monogramClassName="bg-brand text-white font-serif-luxury text-sm font-bold shadow-sm"
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
                      <span key={dIdx} className="text-label text-brand-light tracking-wider uppercase font-medium bg-white/5 px-2.5 py-1 rounded-xs border border-white/10">
                        {doc.name} {doc.specialty || doc.title ? `• ${doc.specialty || doc.title}` : ''}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-label text-brand tracking-wider uppercase font-medium">
                    {clinic.professionalName} {clinic.professionalTitle ? `• ${clinic.professionalTitle}` : ''}
                  </p>
                )}
              </div>

              {/* Col 2: Fast Navigation */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-widest text-brand mb-3">
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
                <h4 className="text-xs font-semibold uppercase tracking-widest text-brand mb-3">
                  Atendimento
                </h4>
                <p className="text-xs text-gray-400 mb-1">📱 {clinic.phone}</p>
                <p className="text-xs text-gray-400 mb-1">📸 {clinic.instagram}</p>
                <p className="text-xs text-gray-400 mb-3">{clinic.cityState}</p>
                <button
                  onClick={handleResetToDefaultSamples}
                  className="text-label text-gray-500 hover:text-brand flex items-center gap-1 transition-colors uppercase tracking-wider"
                  title="Restaurar dados de exemplo"
                >
                  <RefreshCw className="w-3 h-3" /> Restaurar demonstração
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500">
              <p>© {new Date().getFullYear()} {clinic.name}. Todos os direitos reservados.</p>
              <div className="flex items-center space-x-2 text-brand">
                <div className="w-8 h-[1px] bg-brand/40"></div>
                <span className="text-label tracking-widest uppercase font-medium">Design Frosted Glass</span>
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
        allProcedures={procedures}
        clinic={clinic}
        onAbrirConfiguracoes={() => {
          setIsFormModalOpen(false);
          setSelectedProcedureForEdit(null);
          setIsSettingsModalOpen(true);
        }}
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
        onAbrirMapaDeAreas={() => setIsLaserAreasOpen(true)}
      />

      {/* Gestão das áreas do laser — conferir o mapa inteiro, reposicionar botões, remover áreas.
          Mora aqui, e não dentro das Configurações, porque precisa do catálogo e da gravação de
          procedimento, que são de outro módulo. */}
      <LaserAreasManagerModal
        isOpen={isLaserAreasOpen}
        onClose={() => setIsLaserAreasOpen(false)}
        procedures={procedures}
        clinic={clinic}
        onSalvarProcedimento={handleSaveProcedure}
      />

      {/* 5. Confirmação de ações destrutivas */}
      <ConfirmDialog pedido={confirmacao} onFechar={() => setConfirmacao(null)} />

      {/* 6. Busca global — filtra o que já está em memória, sem leitura nova no Firestore. */}
      <CommandPalette
        aberta={buscaAberta}
        onFechar={() => setBuscaAberta(false)}
        pacientes={allPatients}
        procedimentos={procedures}
        orcamentos={quotes}
        onAbrirPaciente={(pacienteId) => navegar({ view: 'patients', pacienteId })}
        onAbrirProcedimento={(procedureId) => {
          const proc = procedures.find((p) => p.id === procedureId);
          if (proc) {
            setCurrentView('procedures');
            setSelectedProcedureForDetails(proc);
          }
        }}
        onAbrirOrcamento={(quoteId) => navegar({ view: 'quotes', quoteId })}
        onAcaoRapida={acaoRapida}
      />
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


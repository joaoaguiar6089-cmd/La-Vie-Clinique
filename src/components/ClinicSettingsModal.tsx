import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  Camera,
  Check,
  ChevronRight,
  Crop,
  Database,
  Edit3,
  FileText,
  Gem,
  Image as ImageIcon,
  KeyRound,
  Loader2,
  Phone,
  Plus,
  Shield,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Stethoscope,
  Trash2,
  X,
} from 'lucide-react';
import { AgendaExpedienteDia, ClinicProfile, Professional } from '../types';
import { AGENDA_DEFAULTS, INTERVALOS_DISPONIVEIS } from '../utils/agenda';
import { mascararHora } from './common/MaskedDateTimeInput';
import { GoogleAgendaConexoes } from './agenda/GoogleAgendaConexoes';
import { createProfessionalLogin } from '../services/authService';
import {
  criarLoginNaClinica,
  desativarLoginNaClinica,
  mensagemDoErroDaEquipe,
  mudarPapelNaClinica,
} from '../services/equipeApi';
import { ehZulia } from '../lib/projetoFirebase';
import { clinicaAtual, gravarLocal, lerLocal } from '../lib/estadoDaClinica';
import { MeuPlano } from './plano/MeuPlano';
import { ImageCropperModal, AspectOption } from './ImageCropperModal';
import { ClinicLogo, clinicMonogram, resolveClinicLogoUrl } from './ClinicLogo';
import { ENDERECO_DO_SITE, motivoEnderecoFechado, normalizarEnderecoPublico, resolvePublicBase } from '../utils/publicLinks';
import { formatCnpj } from '../utils/recibos';
import { ListaSuspensa } from './common/ListaSuspensa';
import { AvisoTinta, BotaoPilula, CampoTinta, INPUT_TINTA, Interruptor, RotuloTinta, iniciaisDe } from './common/Tinta';
import { ConfirmDialog, ConfirmRequest } from './ConfirmDialog';
import { SecaoDocumentos } from './ajustes/SecaoDocumentos';
import { SecaoCelular } from './ajustes/SecaoCelular';
import { SecaoDados } from './ajustes/SecaoDados';

/**
 * A foto da profissional entra em dois lugares com recortes diferentes: o bloco 92×104 da capa do
 * catálogo em PDF e o avatar redondo das listas. O frame do recorte é o do PDF (o mais exigente) e
 * o círculo do avatar aparece como guia por cima — assim o rosto não fica cortado em nenhum dos dois.
 */
const PROFESSIONAL_PHOTO_ASPECTS: AspectOption[] = [{ id: 'ficha', label: 'Ficha', ratio: 92 / 104 }];

/**
 * O logo é desenhado dentro de quadros quadrados (cabeçalho do painel, capa do catálogo em PDF)
 * sempre por inteiro, sem corte — por isso "Original" é a primeira opção: marcas largas continuam
 * legíveis. "Quadrado" existe para quem quiser recortar um símbolo fechado.
 */
const CLINIC_LOGO_ASPECTS: AspectOption[] = [
  { id: 'original', label: 'Original', ratio: null },
  { id: 'quadrado', label: 'Quadrado', ratio: 1 },
];

// ==========================================
// AS SEÇÕES
// ==========================================

/**
 * Os Ajustes viraram seções, como os ajustes do celular: uma lista agrupada do lado (no celular, a
 * lista vem primeiro e cada toque abre uma seção), e só a seção escolhida na tela. Antes era uma
 * página única de formulário, com um índice de âncoras no topo, onde o expediente da agenda ficava
 * a dez rolagens do nome da clínica e nada dizia o que cada bloco fazia.
 */
type IdDaSecao = 'plano' | 'identidade' | 'contato' | 'equipe' | 'documentos' | 'catalogo' | 'agenda' | 'celular' | 'dados';

const SECOES: Record<IdDaSecao, { rotulo: string; descricao: string; icone: React.ElementType }> = {
  plano: { rotulo: 'Plano', descricao: 'Uso, limites e assinatura', icone: Gem },
  identidade: { rotulo: 'Identidade', descricao: 'Nome, slogan e logo', icone: Building2 },
  contato: { rotulo: 'Contato e endereço', descricao: 'WhatsApp, Instagram, endereço e CNPJ', icone: Phone },
  equipe: { rotulo: 'Equipe', descricao: 'Profissionais e logins de acesso', icone: Stethoscope },
  documentos: { rotulo: 'Documentos (PDF)', descricao: 'Cor, fontes e logo do orçamento, recibo e fichas', icone: FileText },
  catalogo: { rotulo: 'Catálogo', descricao: 'Mensagens do catálogo em PDF', icone: Sparkles },
  agenda: { rotulo: 'Agenda', descricao: 'Horários, grade, salas e Google Agenda', icone: CalendarDays },
  celular: { rotulo: 'Instalar no celular', descricao: 'O sistema na tela inicial, como um app', icone: Smartphone },
  dados: { rotulo: 'Dados e privacidade', descricao: 'Cópia dos dados, encerramento e termos', icone: Database },
};

const GRUPOS: { titulo: string; secoes: IdDaSecao[] }[] = [
  { titulo: 'Clínica', secoes: ['plano', 'identidade', 'contato', 'equipe'] },
  { titulo: 'Documentos', secoes: ['documentos', 'catalogo'] },
  { titulo: 'Atendimento', secoes: ['agenda'] },
  { titulo: 'App e dados', secoes: ['celular', 'dados'] },
];

/** A seção aberta da última vez, por navegador — quem volta aos Ajustes cai onde parou. */
const CHAVE_DA_SECAO = 'lavie:ajustes-secao:v1';

interface ClinicSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  clinic: ClinicProfile;
  /**
   * Grava o perfil. Devolve o perfil salvo (com as imagens já como URL do Storage) ou `null` se
   * falhou — o App já avisou o erro; a tela só não dá a edição por salva.
   */
  onSave: (updatedClinic: ClinicProfile) => Promise<ClinicProfile | null> | void;
  /** UID (Firebase Auth) da profissional logada agora — usado para impedir que ela se auto-exclua. */
  currentUserUid?: string;
  /** Se a profissional logada tem poderes de admin (excluir contas, conceder/revogar admin). */
  isAdminUser: boolean;
  /**
   * Na Zulia: o papel do próprio login acabou de mudar no servidor — o App pede um token novo,
   * para a claim nova valer já.
   */
  onPapelDoLoginMudou?: () => void;
}

/**
 * A equipe que o formulário mostra quando o perfil ainda não tem nenhuma. No legado, a
 * profissional do perfil antigo (a Dra. Karoline, na La Vie). Na Zulia, a clínica nasce com a
 * admin no perfil (`scripts/criar-clinica.ts`), e nenhum nome da La Vie aparece por padrão.
 */
const equipeInicial = (clinic: ClinicProfile): Professional[] => {
  if (clinic.professionals && clinic.professionals.length > 0) return clinic.professionals;
  if (ehZulia) return [];
  return [
    {
      id: 'doc-1',
      name: clinic.professionalName || 'Dra. Karoline Ferreira',
      registryNumber: clinic.registryNumber || '',
      title: clinic.professionalTitle || 'Especialista em Estética Avançada & Tecnologias',
      specialty: clinic.professionalTitle || 'Especialista em Estética Avançada & Tecnologias',
    },
  ];
};

const paraFormulario = (clinic: ClinicProfile): ClinicProfile => ({ ...clinic, professionals: equipeInicial(clinic) });

const iguais = (a: ClinicProfile, b: ClinicProfile): boolean => JSON.stringify(a) === JSON.stringify(b);

// ==========================================
// PEÇAS DE FORMULÁRIO
// ==========================================

/** Um campo de texto no desenho da casa (rótulo dentro, 56px). */
const Texto: React.FC<{
  rotulo: string;
  valor: string;
  onMudar: (v: string) => void;
  placeholder?: string;
  ajuda?: React.ReactNode;
  erro?: string;
  tipo?: 'text' | 'email' | 'tel';
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  obrigatorio?: boolean;
  className?: string;
}> = ({ rotulo, valor, onMudar, placeholder, ajuda, erro, tipo = 'text', inputMode, obrigatorio, className }) => {
  const id = React.useId();
  return (
    <CampoTinta rotulo={obrigatorio ? `${rotulo} *` : rotulo} htmlFor={id} ajuda={ajuda} erro={erro} className={className}>
      <input
        id={id}
        type={tipo}
        inputMode={inputMode}
        value={valor}
        onChange={(e) => onMudar(e.target.value)}
        placeholder={placeholder}
        required={obrigatorio}
        className={INPUT_TINTA}
      />
    </CampoTinta>
  );
};

const TextoLongo: React.FC<{ rotulo: string; valor: string; onMudar: (v: string) => void; ajuda?: React.ReactNode; linhas?: number }> = ({
  rotulo,
  valor,
  onMudar,
  ajuda,
  linhas = 3,
}) => {
  const id = React.useId();
  return (
    <CampoTinta rotulo={rotulo} htmlFor={id} ajuda={ajuda}>
      <textarea id={id} rows={linhas} value={valor} onChange={(e) => onMudar(e.target.value)} className={`${INPUT_TINTA} resize-y`} />
    </CampoTinta>
  );
};

/** Botão pequeno com rótulo, para as ações de uma linha (Editar, Criar login...). */
const BotaoDaLinha: React.FC<{
  onClick: () => void;
  icone: React.ElementType;
  children: React.ReactNode;
  tom?: 'normal' | 'perigo';
  disabled?: boolean;
  carregando?: boolean;
}> = ({ onClick, icone: Icone, children, tom = 'normal', disabled, carregando }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-[13px] font-semibold transition-colors disabled:opacity-50 ${
      tom === 'perigo' ? 'text-danger hover:bg-danger-bg' : 'text-ink bg-line-soft hover:bg-[#E6E2DA]'
    }`}
  >
    {carregando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icone className="w-3.5 h-3.5" />}
    {children}
  </button>
);

// ==========================================
// A TELA
// ==========================================

export const ClinicSettingsModal: React.FC<ClinicSettingsModalProps> = ({
  isOpen,
  onClose,
  clinic,
  onSave,
  currentUserUid,
  isAdminUser,
  onPapelDoLoginMudou,
}) => {
  // "Plano" só na plataforma e só para a admin (é ela quem cuida do plano e do pagamento).
  const mostrarPlano = ehZulia && isAdminUser;
  const grupos = GRUPOS.map((g) => ({ ...g, secoes: g.secoes.filter((s) => s !== 'plano' || mostrarPlano) }));
  const primeira: IdDaSecao = mostrarPlano ? 'plano' : 'identidade';

  /** A seção aberta. `null` no celular = a lista; no computador vale a primeira. */
  const [secao, setSecao] = useState<IdDaSecao | null>(() => {
    try {
      const salva = lerLocal(CHAVE_DA_SECAO) as IdDaSecao | null;
      // No celular a tela abre na lista; a seção lembrada só vale no computador.
      if (salva && SECOES[salva] && (salva !== 'plano' || mostrarPlano) && window.matchMedia('(min-width: 1024px)').matches) return salva;
    } catch {
      // sem localStorage: começa pela lista
    }
    return null;
  });
  const abrirSecao = (id: IdDaSecao | null) => {
    setSecao(id);
    if (id) {
      try {
        gravarLocal(CHAVE_DA_SECAO, id);
      } catch {
        // sem localStorage: só não lembra
      }
    }
    window.scrollTo({ top: 0 });
  };
  const secaoNaTela: IdDaSecao = secao || primeira;

  const [formData, setFormData] = useState<ClinicProfile>(() => paraFormulario(clinic));
  /** O perfil como está salvo — o que a tela compara para saber se há alteração. */
  const [base, setBase] = useState<ClinicProfile>(() => paraFormulario(clinic));
  const [salvando, setSalvando] = useState(false);
  const [confirmacao, setConfirmacao] = useState<ConfirmRequest | null>(null);

  // State for adding / editing a professional
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [docName, setDocName] = useState('');
  const [docRegistry, setDocRegistry] = useState('');
  const [docTitle, setDocTitle] = useState('');
  const [docPhotoUrl, setDocPhotoUrl] = useState('');
  const [docEmail, setDocEmail] = useState('');
  /** Foto aguardando recorte: o arquivo recém-escolhido ou a foto atual que a usuária quer reajustar. */
  const [photoCropSource, setPhotoCropSource] = useState<File | string | null>(null);
  /** Mesma ideia do recorte da foto, para o logo da clínica. */
  const [logoCropSource, setLogoCropSource] = useState<File | string | null>(null);
  const [showDoctorForm, setShowDoctorForm] = useState(false);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [creatingLoginForId, setCreatingLoginForId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  /** Na Zulia, um pedido à equipe no servidor em andamento (criar, mudar papel, desativar). */
  const [equipeOcupadaId, setEquipeOcupadaId] = useState<string | null>(null);

  const formularioDaProfissionalAberto = showDoctorForm && !!docName.trim();
  const sujo = !iguais(formData, base) || formularioDaProfissionalAberto;

  // O perfil chega pela assinatura em tempo real e pode mudar com a tela aberta (outro aparelho
  // salvou). Sem edição em andamento, a tela acompanha; com edição, nada é atropelado — sobrescrever
  // o que a pessoa está digitando é pior do que mostrar por um instante um dado desatualizado.
  const sujoRef = useRef(sujo);
  sujoRef.current = sujo;
  useEffect(() => {
    if (sujoRef.current || salvando) return;
    setFormData(paraFormulario(clinic));
    setBase(paraFormulario(clinic));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinic]);

  /**
   * O arquivo escolhido não vira foto direto: abre o recorte. É lá que a foto é enquadrada e
   * reduzida para caber com folga no limite de 1 MiB por documento do Firestore.
   */
  const handleDoctorPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Permite reabrir o mesmo arquivo caso o recorte seja cancelado.
    e.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    setPhotoCropSource(file);
  };

  /** Como a foto da profissional: o arquivo escolhido abre o recorte antes de virar o logo salvo. */
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    setLogoCropSource(file);
  };

  const handleChange = (field: keyof ClinicProfile, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const limparFormularioDaProfissional = () => {
    setEditingDocId(null);
    setDocName('');
    setDocRegistry('');
    setDocTitle('');
    setDocPhotoUrl('');
    setDocEmail('');
    setPhotoCropSource(null);
  };

  const handleStartAddDoctor = () => {
    limparFormularioDaProfissional();
    setShowDoctorForm(true);
  };

  const handleStartEditDoctor = (doc: Professional) => {
    setEditingDocId(doc.id);
    setDocName(doc.name);
    setDocRegistry(doc.registryNumber || '');
    setDocTitle(doc.title || doc.specialty || '');
    setDocPhotoUrl(doc.photoUrl || '');
    setDocEmail(doc.email || '');
    setPhotoCropSource(null);
    setShowDoctorForm(true);
  };

  /** A equipe com o formulário da profissional aplicado (adicionar ou editar). */
  const equipeComOFormulario = (equipe: Professional[]): Professional[] => {
    if (!docName.trim()) return equipe;
    if (editingDocId) {
      return equipe.map((d) =>
        d.id === editingDocId
          ? {
              ...d,
              name: docName.trim(),
              registryNumber: docRegistry.trim(),
              title: docTitle.trim(),
              specialty: docTitle.trim(),
              photoUrl: docPhotoUrl.trim() || d.photoUrl || undefined,
              email: docEmail.trim() || undefined,
            }
          : d
      );
    }
    return [
      ...equipe,
      {
        id: `doc-${Date.now()}`,
        name: docName.trim(),
        registryNumber: docRegistry.trim(),
        title: docTitle.trim(),
        specialty: docTitle.trim(),
        photoUrl: docPhotoUrl.trim() || undefined,
        email: docEmail.trim() || undefined,
      },
    ];
  };

  const handleSaveDoctor = () => {
    if (!docName.trim()) return;
    setFormData((prev) => ({ ...prev, professionals: equipeComOFormulario(prev.professionals) }));
    limparFormularioDaProfissional();
    setShowDoctorForm(false);
  };

  const adminCount = formData.professionals.filter((d) => d.isAdmin).length;

  const avisarErro = (texto: string) => {
    setErrorMessage(texto);
    setTimeout(() => setErrorMessage(null), 5000);
  };

  const handleDeleteDoctor = async (id: string) => {
    const target = formData.professionals.find((d) => d.id === id);
    if (formData.professionals.length <= 1) {
      avisarErro('A clínica deve ter ao menos uma profissional cadastrada.');
      return;
    }
    if (target?.uid && target.uid === currentUserUid) {
      avisarErro('Você não pode excluir a própria conta enquanto está logada.');
      return;
    }
    // Na Zulia, quem confere "sobra uma admin" é o servidor, pela claim (o `isAdmin` do perfil é só
    // o que a tela mostra).
    if (!ehZulia && target?.isAdmin && adminCount <= 1) {
      avisarErro('A clínica deve ter ao menos uma profissional admin. Torne outra pessoa admin antes de excluir esta conta.');
      return;
    }
    if (ehZulia && target?.uid) {
      // O login sai na hora, no servidor: excluir a profissional sem desativar o login deixaria
      // alguém de fora da equipe entrando no painel.
      setEquipeOcupadaId(id);
      try {
        await desativarLoginNaClinica(target.uid);
      } catch (err) {
        avisarErro(mensagemDoErroDaEquipe(err));
        return;
      } finally {
        setEquipeOcupadaId(null);
      }
    }
    setFormData((prev) => ({ ...prev, professionals: prev.professionals.filter((d) => d.id !== id) }));
    setDeletingDocId(null);
    setErrorMessage(null);
  };

  const handleCreateLogin = async (doc: Professional) => {
    if (!doc.email?.trim()) {
      avisarErro(`Informe um e-mail para "${doc.name}" antes de criar o login (em Editar).`);
      return;
    }
    setCreatingLoginForId(doc.id);
    try {
      // Na Zulia o login nasce no servidor, já com a clínica e o papel; o convite (definir a
      // senha) sai do mesmo jeito.
      const uid = ehZulia
        ? await criarLoginNaClinica(doc.email, doc.isAdmin ? 'admin' : 'profissional')
        : await createProfessionalLogin(doc.email);
      setFormData((prev) => ({
        ...prev,
        professionals: prev.professionals.map((d) => (d.id === doc.id ? { ...d, uid } : d)),
      }));
    } catch (err: any) {
      const msg = ehZulia
        ? mensagemDoErroDaEquipe(err)
        : err?.code === 'auth/email-already-in-use'
          ? 'Este e-mail já possui uma conta de login no Firebase.'
          : 'Não foi possível criar o login agora. Tente novamente.';
      avisarErro(msg);
    } finally {
      setCreatingLoginForId(null);
    }
  };

  const handleToggleAdmin = async (doc: Professional) => {
    if (!ehZulia && doc.isAdmin && adminCount <= 1) {
      avisarErro('A clínica deve ter ao menos uma profissional admin.');
      return;
    }
    if (ehZulia && doc.uid) {
      // Na Zulia o papel é a claim do login, gravada pelo servidor na hora — o "Salvar" do
      // formulário só guarda o selo que a tela mostra.
      setEquipeOcupadaId(doc.id);
      try {
        await mudarPapelNaClinica(doc.uid, doc.isAdmin ? 'profissional' : 'admin');
      } catch (err) {
        avisarErro(mensagemDoErroDaEquipe(err));
        return;
      } finally {
        setEquipeOcupadaId(null);
      }
      if (doc.uid === currentUserUid) onPapelDoLoginMudou?.();
    }
    setFormData((prev) => ({
      ...prev,
      professionals: prev.professionals.map((d) => (d.id === doc.id ? { ...d, isAdmin: !d.isAdmin } : d)),
    }));
  };

  const salvar = async () => {
    if (!formData.name.trim()) {
      abrirSecao('identidade');
      avisarErro('Dê um nome à clínica antes de salvar.');
      return;
    }
    // O formulário da profissional aberto entra junto: "salvar" é salvar tudo o que está na tela.
    const equipe = equipeComOFormulario(formData.professionals);
    const primaryDoc = equipe[0];
    const finalData: ClinicProfile = {
      ...formData,
      professionals: equipe,
      professionalName: primaryDoc?.name || formData.professionalName,
      professionalTitle: primaryDoc?.title || formData.professionalTitle,
      registryNumber: primaryDoc?.registryNumber || formData.registryNumber,
    };
    setSalvando(true);
    try {
      const salvo = await onSave(finalData);
      if (salvo === null) return; // o App já mostrou o erro; a edição continua na tela
      const novo = paraFormulario(salvo || finalData);
      setFormData(novo);
      setBase(novo);
      limparFormularioDaProfissional();
      setShowDoctorForm(false);
    } finally {
      setSalvando(false);
    }
  };

  const descartar = () => {
    setFormData(base);
    limparFormularioDaProfissional();
    setShowDoctorForm(false);
    setDeletingDocId(null);
  };

  const sair = () => {
    if (!sujo) {
      onClose();
      return;
    }
    setConfirmacao({
      titulo: 'Sair sem salvar?',
      mensagem: 'As alterações feitas nos Ajustes ainda não foram salvas e se perdem.',
      textoConfirmar: 'Sair sem salvar',
      textoCancelar: 'Continuar editando',
      tom: 'perigo',
      onConfirmar: onClose,
    });
  };

  if (!isOpen) return null;

  const info = SECOES[secaoNaTela];
  const temLogo = !!resolveClinicLogoUrl(formData.logoUrl);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 pb-36">
      <header className="mb-6">
        <button
          type="button"
          onClick={sair}
          className="inline-flex items-center gap-1.5 min-h-[44px] -ml-1 pr-2 text-body font-semibold text-muted hover:text-ink transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </button>
        <h1 className="font-serif-luxury text-[34px] lg:text-[42px] font-semibold leading-[1.1] text-ink">Ajustes</h1>
        <p className="text-[14px] text-ink-soft mt-1">A clínica, a equipe, os documentos e o app — tudo num lugar.</p>
      </header>

      <div className="lg:grid lg:grid-cols-[272px_minmax(0,1fr)] lg:gap-10">
        {/* O MENU. No celular é a tela inicial dos Ajustes; no computador, a coluna fixa ao lado. */}
        <nav aria-label="Seções dos Ajustes" className={`${secao ? 'hidden lg:block' : 'block'} lg:sticky lg:top-6 lg:self-start space-y-5`}>
          {grupos.map((grupo) => (
            <div key={grupo.titulo}>
              <p className="px-1 mb-1.5 text-[12px] font-semibold uppercase tracking-wider text-muted">{grupo.titulo}</p>
              <ul className="rounded-2xl bg-card border border-line overflow-hidden divide-y divide-line-soft">
                {grupo.secoes.map((id) => {
                  const s = SECOES[id];
                  const ativa = id === secaoNaTela;
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        onClick={() => abrirSecao(id)}
                        aria-current={ativa ? 'page' : undefined}
                        className={`w-full flex items-center gap-3 min-h-[60px] px-3.5 text-left transition-colors ${
                          ativa ? 'lg:bg-ink lg:text-white' : 'hover:bg-surface-2'
                        }`}
                      >
                        <span
                          className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center ${
                            ativa ? 'bg-line-soft text-ink lg:bg-white/10 lg:text-brand-pale' : 'bg-line-soft text-ink'
                          }`}
                        >
                          <s.icone className="w-[18px] h-[18px]" />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-[15px] font-semibold leading-tight">{s.rotulo}</span>
                          <span className={`block text-[12.5px] leading-snug truncate ${ativa ? 'text-muted lg:text-cream/70' : 'text-muted'}`}>
                            {s.descricao}
                          </span>
                        </span>
                        <ChevronRight className="w-4 h-4 shrink-0 opacity-50 lg:hidden" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* A SEÇÃO */}
        <main className={`${secao ? 'block' : 'hidden lg:block'} min-w-0`}>
          <button
            type="button"
            onClick={() => abrirSecao(null)}
            className="lg:hidden inline-flex items-center gap-1.5 min-h-[44px] -ml-1 mb-1 pr-2 text-body font-semibold text-muted hover:text-ink"
          >
            <ArrowLeft className="w-4 h-4" />
            Todos os ajustes
          </button>

          <div className="flex items-start gap-3 mb-6">
            <span className="w-11 h-11 shrink-0 rounded-2xl bg-ink text-brand-pale flex items-center justify-center">
              <info.icone className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-[22px] font-semibold text-ink leading-tight font-sans">{info.rotulo}</h2>
              <p className="text-[14px] text-ink-soft">{info.descricao}</p>
            </div>
          </div>

          {errorMessage && (
            <AvisoTinta tom="alerta" className="mb-5">
              <span className="flex items-start justify-between gap-3">
                <span>{errorMessage}</span>
                <button type="button" onClick={() => setErrorMessage(null)} aria-label="Fechar aviso" className="shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </span>
            </AvisoTinta>
          )}

          {/* PLANO */}
          {secaoNaTela === 'plano' && mostrarPlano && <MeuPlano nomeDaClinica={clinic.name || formData.name} />}

          {/* IDENTIDADE */}
          {secaoNaTela === 'identidade' && (
            <div className="space-y-6 max-w-2xl">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Texto rotulo="Nome da clínica" obrigatorio valor={formData.name} onMudar={(v) => handleChange('name', v)} />
                <Texto
                  rotulo="Slogan"
                  valor={formData.tagline}
                  onMudar={(v) => handleChange('tagline', v)}
                  placeholder="Ex.: Estética avançada"
                  ajuda="Sai embaixo do nome, no catálogo e nos documentos."
                />
              </div>

              <div>
                <RotuloTinta>Logo</RotuloTinta>
                <div className="rounded-2xl bg-card border border-line p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                  {/* A marca aparece sobre fundo claro (documentos, capa do PDF) e sobre fundo escuro (menu
                      lateral) — as duas prévias mostram os dois casos. */}
                  <div className="flex items-center gap-2.5 shrink-0">
                    {(['Claro', 'Escuro'] as const).map((fundo) => (
                      <div key={fundo} className="text-center">
                        <div
                          className={`w-16 h-16 rounded-xl flex items-center justify-center p-1.5 border ${
                            fundo === 'Claro' ? 'bg-white border-line' : 'bg-ink border-ink'
                          }`}
                        >
                          <ClinicLogo
                            clinic={formData}
                            className="w-full h-full"
                            monogramClassName={`${fundo === 'Claro' ? 'bg-ink rounded-xs' : ''} text-brand-light font-serif-luxury text-base font-semibold`}
                          />
                        </div>
                        <span className="block text-[11px] text-muted mt-1">{fundo}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex-1 min-w-0 space-y-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex items-center gap-2 h-11 px-4 rounded-full bg-ink text-white text-[14px] font-semibold cursor-pointer hover:bg-black">
                        <ImageIcon className="w-4 h-4" />
                        {temLogo ? 'Trocar o logo' : 'Enviar o logo'}
                        <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                      </label>
                      {temLogo && (
                        <>
                          <BotaoDaLinha icone={Crop} onClick={() => setLogoCropSource(formData.logoUrl || null)}>
                            Ajustar
                          </BotaoDaLinha>
                          <BotaoDaLinha icone={Trash2} tom="perigo" onClick={() => handleChange('logoUrl', '')}>
                            Remover
                          </BotaoDaLinha>
                        </>
                      )}
                    </div>
                    <p className="text-[13px] text-ink-soft leading-snug">
                      Aparece no topo do painel, na capa do catálogo e no cabeçalho dos documentos (veja{' '}
                      <button type="button" onClick={() => abrirSecao('documentos')} className="font-semibold text-ink underline underline-offset-2">
                        Documentos
                      </button>
                      ). Sem logo, saem as iniciais <strong>{clinicMonogram(formData.name)}</strong>. Prefira PNG com fundo
                      transparente.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* CONTATO */}
          {secaoNaTela === 'contato' && (
            <div className="space-y-6 max-w-2xl">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Texto
                  rotulo="WhatsApp / telefone"
                  obrigatorio
                  tipo="tel"
                  valor={formData.phone}
                  onMudar={(v) => handleChange('phone', v)}
                  placeholder="(19) 99876-5432"
                  ajuda="As clientes falam com a clínica por este número."
                />
                <Texto
                  rotulo="Instagram"
                  valor={formData.instagram}
                  onMudar={(v) => handleChange('instagram', v)}
                  placeholder={ehZulia ? '@suaclinica' : '@lavieclinique.indaiatuba'}
                />
                <Texto
                  rotulo="Endereço"
                  valor={formData.address}
                  onMudar={(v) => handleChange('address', v)}
                  placeholder="Rua, número, sala e bairro"
                  className="sm:col-span-2"
                />
                <Texto
                  rotulo="Cidade / UF"
                  valor={formData.cityState}
                  onMudar={(v) => handleChange('cityState', v)}
                  placeholder={ehZulia ? 'Cidade - UF' : 'Indaiatuba - SP'}
                />
                <Texto
                  rotulo="CNPJ"
                  inputMode="numeric"
                  valor={formData.cnpj ? formatCnpj(formData.cnpj) : ''}
                  onMudar={(v) => handleChange('cnpj', v.replace(/\D/g, '').slice(0, 14))}
                  placeholder="00.000.000/0001-00"
                  ajuda="Sai no rodapé da nota de recibo."
                />
              </div>
              <p className="text-[13px] text-ink-soft">
                O contato e o endereço saem no rodapé do catálogo, nos documentos e nas páginas que a cliente abre pelo link.
              </p>

              <details className="rounded-2xl bg-card border border-line p-4 group">
                <summary className="cursor-pointer text-[14px] font-semibold text-ink list-none flex items-center gap-2">
                  <ChevronRight className="w-4 h-4 transition-transform group-open:rotate-90" />
                  Avançado: endereço dos links
                </summary>
                <div className="mt-3 space-y-2">
                  <Texto
                    rotulo="Endereço público do sistema"
                    valor={formData.publicBaseUrl || ''}
                    onMudar={(v) => handleChange('publicBaseUrl', v)}
                    placeholder={ENDERECO_DO_SITE}
                    ajuda={
                      <>
                        Base dos links enviados à paciente — ficha de anamnese, orçamento, confirmação do agendamento e QR
                        Code do catálogo. Em branco, vale <strong>{ENDERECO_DO_SITE}</strong>. Só preencha se o site tiver
                        outro endereço que abra <strong>sem pedir login</strong> (confira numa aba anônima).
                      </>
                    }
                    erro={(() => {
                      const base = normalizarEnderecoPublico(formData.publicBaseUrl);
                      const motivo = base ? motivoEnderecoFechado(base) : null;
                      return motivo ? `Este endereço não serve: ele ${motivo}. Os links saem com ${ENDERECO_DO_SITE}.` : undefined;
                    })()}
                  />
                </div>
              </details>
            </div>
          )}

          {/* EQUIPE */}
          {secaoNaTela === 'equipe' && (
            <div className="space-y-4 max-w-3xl">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[14px] text-ink-soft max-w-md">
                  Quem atende na clínica. Cada profissional pode ganhar um login para entrar no painel; quem é{' '}
                  <strong>admin</strong> cuida também da equipe, do plano e dos dados.
                </p>
                {!showDoctorForm && (
                  <BotaoPilula tom="preto" icone={Plus} onClick={handleStartAddDoctor}>
                    Adicionar profissional
                  </BotaoPilula>
                )}
              </div>

              {showDoctorForm && (
                <div className="rounded-2xl bg-card border-2 border-ink p-4 sm:p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-[16px] font-semibold text-ink">{editingDocId ? 'Editar profissional' : 'Nova profissional'}</p>
                    <button
                      type="button"
                      onClick={() => {
                        limparFormularioDaProfissional();
                        setShowDoctorForm(false);
                      }}
                      aria-label="Fechar"
                      className="w-9 h-9 rounded-full flex items-center justify-center text-muted hover:bg-line-soft"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-16 h-16 rounded-full bg-line-soft overflow-hidden shrink-0 flex items-center justify-center">
                      {docPhotoUrl ? (
                        <img src={docPhotoUrl} alt="Prévia da foto" className="w-full h-full object-cover" />
                      ) : (
                        <Camera className="w-5 h-5 text-muted" />
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-line-soft text-[13px] font-semibold text-ink cursor-pointer hover:bg-[#E6E2DA]">
                        <Camera className="w-3.5 h-3.5" />
                        {docPhotoUrl ? 'Trocar a foto' : 'Escolher foto'}
                        <input type="file" accept="image/*" onChange={handleDoctorPhotoUpload} className="hidden" />
                      </label>
                      {docPhotoUrl && (
                        <>
                          <BotaoDaLinha icone={Crop} onClick={() => setPhotoCropSource(docPhotoUrl)}>
                            Ajustar
                          </BotaoDaLinha>
                          <BotaoDaLinha icone={Trash2} tom="perigo" onClick={() => setDocPhotoUrl('')}>
                            Remover
                          </BotaoDaLinha>
                        </>
                      )}
                    </div>
                  </div>
                  <p className="text-[12.5px] text-muted -mt-2">A foto sai na capa do catálogo em PDF.</p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Texto rotulo="Nome" obrigatorio valor={docName} onMudar={setDocName} placeholder="Ex.: Dra. Ana Souza" />
                    <Texto rotulo="Registro profissional" valor={docRegistry} onMudar={setDocRegistry} placeholder="CRBM, CRM, COREN..." />
                    <Texto
                      rotulo="Título / especialidade"
                      valor={docTitle}
                      onMudar={setDocTitle}
                      placeholder="Ex.: Biomédica esteta"
                      className="sm:col-span-2"
                    />
                    <Texto
                      rotulo="E-mail de login"
                      tipo="email"
                      valor={docEmail}
                      onMudar={setDocEmail}
                      placeholder={ehZulia ? 'profissional@suaclinica.com' : 'profissional@lavieclinique.com'}
                      ajuda="Usado para criar o acesso dela ao painel."
                      className="sm:col-span-2"
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    <BotaoPilula
                      tom="contorno"
                      onClick={() => {
                        limparFormularioDaProfissional();
                        setShowDoctorForm(false);
                      }}
                    >
                      Cancelar
                    </BotaoPilula>
                    <BotaoPilula tom="preto" icone={Check} onClick={handleSaveDoctor} disabled={!docName.trim()}>
                      {editingDocId ? 'Atualizar' : 'Adicionar'}
                    </BotaoPilula>
                  </div>
                </div>
              )}

              <ul className="space-y-2">
                {formData.professionals.map((doc, idx) => {
                  const ocupado = equipeOcupadaId === doc.id;
                  return (
                    <li key={doc.id || idx} className="rounded-2xl bg-card border border-line p-3.5 sm:p-4">
                      <div className="flex items-start gap-3">
                        <button
                          type="button"
                          onClick={() => handleStartEditDoctor(doc)}
                          className="w-11 h-11 rounded-full bg-ink text-brand-light flex items-center justify-center text-[13px] font-bold overflow-hidden shrink-0"
                          title="Editar ou trocar a foto"
                        >
                          {doc.photoUrl ? (
                            <img src={doc.photoUrl} alt={doc.name} className="w-full h-full object-cover" />
                          ) : (
                            iniciaisDe(doc.name, 2)
                          )}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-[15px] font-semibold text-ink">{doc.name}</p>
                          {doc.title && <p className="text-[13px] text-ink-soft line-clamp-1">{doc.title}</p>}
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {doc.registryNumber && (
                              <span className="px-2 py-0.5 rounded-full text-[11.5px] font-semibold bg-line-soft text-ink">{doc.registryNumber}</span>
                            )}
                            {doc.isAdmin && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11.5px] font-semibold bg-ink text-brand-light">
                                <ShieldCheck className="w-3 h-3" /> Admin
                              </span>
                            )}
                            {doc.uid ? (
                              <span className="px-2 py-0.5 rounded-full text-[11.5px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                Com login
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[11.5px] font-medium bg-line-soft text-muted">Sem login</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {deletingDocId === doc.id ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-danger-bg px-3 py-2">
                          <span className="text-[13px] font-semibold text-danger flex-1 min-w-[160px]">
                            {ehZulia && doc.uid ? 'Excluir e desativar o login dela?' : 'Excluir esta profissional?'}
                          </span>
                          <BotaoDaLinha icone={Trash2} tom="perigo" onClick={() => void handleDeleteDoctor(doc.id)} carregando={ocupado} disabled={ocupado}>
                            Excluir
                          </BotaoDaLinha>
                          <BotaoDaLinha icone={X} onClick={() => setDeletingDocId(null)}>
                            Não
                          </BotaoDaLinha>
                        </div>
                      ) : (
                        <div className="mt-3 flex flex-wrap gap-1.5 sm:pl-14">
                          <BotaoDaLinha icone={Edit3} onClick={() => handleStartEditDoctor(doc)}>
                            Editar
                          </BotaoDaLinha>
                          {!doc.uid && (!ehZulia || isAdminUser) && (
                            <BotaoDaLinha
                              icone={KeyRound}
                              onClick={() => void handleCreateLogin(doc)}
                              carregando={creatingLoginForId === doc.id}
                              disabled={creatingLoginForId === doc.id}
                            >
                              Criar login
                            </BotaoDaLinha>
                          )}
                          {isAdminUser && doc.uid && (
                            <BotaoDaLinha
                              icone={doc.isAdmin ? Shield : ShieldCheck}
                              onClick={() => void handleToggleAdmin(doc)}
                              carregando={ocupado}
                              disabled={ocupado}
                            >
                              {doc.isAdmin ? 'Tirar de admin' : 'Tornar admin'}
                            </BotaoDaLinha>
                          )}
                          {isAdminUser && (
                            <BotaoDaLinha icone={Trash2} tom="perigo" onClick={() => setDeletingDocId(doc.id)}>
                              Excluir
                            </BotaoDaLinha>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              <p className="text-[13px] text-ink-soft">
                Criar login manda à profissional um e-mail para ela definir a senha. No cadastro de cada procedimento, você
                escolhe quem o realiza.
              </p>
            </div>
          )}

          {/* DOCUMENTOS */}
          {secaoNaTela === 'documentos' && (
            <SecaoDocumentos perfil={formData} onMudar={(campo, valor) => handleChange(campo, valor)} onIrParaIdentidade={() => abrirSecao('identidade')} />
          )}

          {/* CATÁLOGO */}
          {secaoNaTela === 'catalogo' && (
            <div className="space-y-4 max-w-2xl">
              <TextoLongo
                rotulo="Boas-vindas no topo do catálogo"
                valor={formData.catalogWelcomeNote || ''}
                onMudar={(v) => handleChange('catalogWelcomeNote', v)}
                ajuda="Uma frase curta de apresentação, na capa do catálogo em PDF."
              />
              <Texto
                rotulo="Nota de rodapé"
                valor={formData.consultationNote || ''}
                onMudar={(v) => handleChange('consultationNote', v)}
                ajuda="Condições ou aviso — por exemplo, que os valores dependem de avaliação."
              />
              <p className="text-[13px] text-ink-soft">
                A cor, as fontes e o logo do catálogo seguem os de{' '}
                <button type="button" onClick={() => abrirSecao('documentos')} className="font-semibold text-ink underline underline-offset-2">
                  Documentos
                </button>
                .
              </p>
            </div>
          )}

          {/* AGENDA */}
          {secaoNaTela === 'agenda' && (
            <div className="space-y-8 max-w-3xl">
              <SecaoAgendaDaClinica formData={formData} onChange={handleChange} />
              <GoogleAgendaConexoes profissionais={clinic.professionals || []} />
            </div>
          )}

          {/* CELULAR */}
          {secaoNaTela === 'celular' && (
            <div className="max-w-2xl">
              <SecaoCelular endereco={resolvePublicBase(formData)} />
            </div>
          )}

          {/* DADOS */}
          {secaoNaTela === 'dados' && (
            <div className="max-w-2xl">
              <SecaoDados nomeDaClinica={clinic.name || formData.name} ehAdmin={isAdminUser} clinicaId={clinicaAtual()} />
            </div>
          )}
        </main>
      </div>

      {/* A barra de salvar só aparece quando há o que salvar — e fica à vista em qualquer seção, para
          ninguém sair achando que a mudança já valeu. No celular, acima da barra de navegação. */}
      {sujo && (
        <div className="fixed inset-x-0 z-40 px-4 bottom-[calc(var(--altura-barra-inferior)+8px)] sm:bottom-5">
          <div className="max-w-3xl mx-auto rounded-2xl bg-ink text-white shadow-[0_10px_30px_rgba(0,0,0,.25)] px-4 py-3 flex flex-wrap items-center gap-3">
            <p className="flex-1 min-w-[150px] text-[14px] font-semibold">Alterações não salvas</p>
            <BotaoPilula tom="contorno-escuro" onClick={descartar} disabled={salvando}>
              Descartar
            </BotaoPilula>
            <BotaoPilula tom="ouro" icone={salvando ? Loader2 : Check} onClick={() => void salvar()} disabled={salvando}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </BotaoPilula>
          </div>
        </div>
      )}

      <ConfirmDialog pedido={confirmacao} onFechar={() => setConfirmacao(null)} />

      <ImageCropperModal
        isOpen={photoCropSource !== null}
        source={photoCropSource}
        title="Enquadrar foto da profissional"
        description="O frame é o mesmo usado na capa do catálogo em PDF. O círculo tracejado mostra o que aparece no avatar."
        aspectOptions={PROFESSIONAL_PHOTO_ASPECTS}
        circleGuide
        maxOutputDim={600}
        quality={0.85}
        confirmLabel="Usar esta foto"
        onCancel={() => setPhotoCropSource(null)}
        onConfirm={(dataUrl) => {
          setDocPhotoUrl(dataUrl);
          if (editingDocId) {
            setFormData((prev) => ({
              ...prev,
              professionals: prev.professionals.map((d) => (d.id === editingDocId ? { ...d, photoUrl: dataUrl } : d)),
            }));
          }
          setPhotoCropSource(null);
        }}
      />

      {/* PNG, e não JPEG: um logo com fundo transparente precisa continuar transparente sobre o
          preto do menu lateral e sobre o creme da capa do catálogo. */}
      <ImageCropperModal
        isOpen={logoCropSource !== null}
        source={logoCropSource}
        title="Enquadrar logo da clínica"
        description="A marca aparece inteira dentro do quadro, sem corte. Deixe uma folga nas bordas."
        aspectOptions={CLINIC_LOGO_ASPECTS}
        maxOutputDim={512}
        quality={0.92}
        outputMimeType="image/png"
        confirmLabel="Usar este logo"
        onCancel={() => setLogoCropSource(null)}
        onConfirm={(dataUrl) => {
          handleChange('logoUrl', dataUrl);
          setLogoCropSource(null);
        }}
      />
    </div>
  );
};

// ==========================================
// AGENDA
// ==========================================

/**
 * Configurações da agenda: expediente, granularidade da grade e salas.
 *
 * O expediente **não bloqueia nada** — só pinta de cinza o que está fora dele. Encaixe continua
 * gravável, porque quem decide abrir uma exceção é a clínica, não a grade.
 */
const DIAS_DO_EXPEDIENTE = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const CampoDeHora: React.FC<{ valor: string; onMudar: (v: string) => void; rotulo: string; apagado?: boolean }> = ({
  valor,
  onMudar,
  rotulo,
  apagado,
}) => (
  <input
    type="text"
    inputMode="numeric"
    value={valor}
    onChange={(e) => onMudar(mascararHora(e.target.value))}
    placeholder="hh:mm"
    aria-label={rotulo}
    className={`w-[72px] h-10 px-2.5 rounded-xl bg-line-soft text-[14px] font-semibold tabular-nums text-center focus:outline-none focus:ring-2 focus:ring-ink focus:bg-card ${
      apagado ? 'text-ink-soft' : 'text-ink'
    }`}
  />
);

const SecaoAgendaDaClinica: React.FC<{
  formData: ClinicProfile;
  onChange: (campo: keyof ClinicProfile, valor: any) => void;
}> = ({ formData, onChange }) => {
  const tabela =
    formData.agendaExpediente && formData.agendaExpediente.length > 0 ? formData.agendaExpediente : AGENDA_DEFAULTS.expediente;

  const doDia = (diaSemana: number): AgendaExpedienteDia => tabela.find((d) => d.diaSemana === diaSemana) || { diaSemana };

  /** Reescreve a tabela inteira, sempre com os sete dias — assim nunca falta linha no banco. */
  const atualizar = (diaSemana: number, mudanca: Partial<AgendaExpedienteDia>) => {
    const nova = DIAS_DO_EXPEDIENTE.map((_, i) => {
      const atual = doDia(i);
      return i === diaSemana ? { ...atual, ...mudanca } : atual;
    });
    onChange('agendaExpediente', nova);
  };

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <RotuloTinta>Horário de funcionamento</RotuloTinta>
          <p className="text-[13px] text-ink-soft -mt-1">
            O que fica fora dele aparece em cinza na agenda — mas continua clicável, para encaixe.
          </p>
        </div>
        <ul className="rounded-2xl bg-card border border-line divide-y divide-line-soft">
          {DIAS_DO_EXPEDIENTE.map((rotulo, i) => {
            const dia = doDia(i);
            const aberto = !!dia.abre && !!dia.fecha;
            return (
              <li key={rotulo} className="px-3.5 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="w-[150px] shrink-0">
                  <Interruptor
                    ligado={aberto}
                    onMudar={(ligado) =>
                      atualizar(
                        i,
                        ligado
                          ? { abre: '09:00', fecha: '19:00' }
                          : // String vazia, não `undefined`: o `cleanForFirestore` remove chaves
                            // indefinidas e o `merge: true` preservaria o horário antigo.
                            { abre: '', fecha: '' }
                      )
                    }
                    rotulo={rotulo}
                  />
                </div>
                {aberto ? (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                    <CampoDeHora valor={dia.abre || ''} onMudar={(v) => atualizar(i, { abre: v })} rotulo={`${rotulo}: abre às`} />
                    <span className="text-[13px] text-muted">às</span>
                    <CampoDeHora valor={dia.fecha || ''} onMudar={(v) => atualizar(i, { fecha: v })} rotulo={`${rotulo}: fecha às`} />
                    {/* Pausa do almoço. As duas pontas juntas ou nenhuma: só o início pintaria de
                        cinza tudo dali até o fechamento. */}
                    <span className="text-[13px] text-muted ml-2">almoço</span>
                    <CampoDeHora
                      valor={dia.almocoInicio || ''}
                      onMudar={(v) => atualizar(i, { almocoInicio: v })}
                      rotulo={`${rotulo}: almoço começa às`}
                      apagado
                    />
                    <span className="text-[13px] text-muted">às</span>
                    <CampoDeHora
                      valor={dia.almocoFim || ''}
                      onMudar={(v) => atualizar(i, { almocoFim: v })}
                      rotulo={`${rotulo}: almoço termina às`}
                      apagado
                    />
                  </div>
                ) : (
                  <span className="text-[13px] text-muted">Fechado</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-2">
        <RotuloTinta>Divisão da grade</RotuloTinta>
        <ListaSuspensa
          className="max-w-[240px]"
          rotuloAcessivel="Divisão da grade"
          valor={String(formData.agendaIntervaloMin || AGENDA_DEFAULTS.intervaloMin)}
          onMudar={(v) => onChange('agendaIntervaloMin', Number(v))}
          opcoes={INTERVALOS_DISPONIVEIS.map((m) => ({ valor: String(m), rotulo: `De ${m} em ${m} minutos` }))}
          buscavel={false}
        />
      </section>

      {/* Salas e equipamentos.

          Existe por causa do equipamento, não da parede: o laser é um aparelho só, e duas
          pacientes marcadas para ele no mesmo horário é um problema que a agenda por
          profissional não pega — são duas profissionais diferentes, cada uma com a coluna
          livre. Clínica que não usa o conceito deixa a lista vazia e o campo some do
          formulário de agendamento. */}
      <section className="space-y-3">
        <div>
          <RotuloTinta>Salas e equipamentos</RotuloTinta>
          <p className="text-[13px] text-ink-soft -mt-1">
            Dois agendamentos na mesma sala e no mesmo horário são impedidos. Sem salas, o campo nem aparece ao agendar.
          </p>
        </div>
        <div className="space-y-2">
          {(formData.agendaSalas || []).map((sala, i) => (
            <div key={sala.id} className="flex items-center gap-2">
              <input
                type="text"
                value={sala.nome}
                onChange={(e) => {
                  const nova = [...(formData.agendaSalas || [])];
                  nova[i] = { ...sala, nome: e.target.value };
                  onChange('agendaSalas', nova);
                }}
                placeholder="Ex.: Sala laser"
                aria-label={`Nome da sala ${i + 1}`}
                className="flex-1 h-12 px-4 rounded-[14px] bg-line-soft text-[15px] font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-ink focus:bg-card"
              />
              <button
                type="button"
                onClick={() => onChange('agendaSalas', (formData.agendaSalas || []).filter((s) => s.id !== sala.id))}
                aria-label={`Remover ${sala.nome || 'esta sala'}`}
                className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-muted hover:text-danger hover:bg-danger-bg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
        <BotaoPilula
          tom="contorno"
          icone={Plus}
          onClick={() => onChange('agendaSalas', [...(formData.agendaSalas || []), { id: `sala-${Date.now()}`, nome: '' }])}
        >
          Adicionar sala
        </BotaoPilula>
      </section>

      {/* A confirmação vai sempre pelo link do agendamento — não há mais modelo de mensagem
          para editar aqui. */}
      <p className="text-[13px] text-ink-soft">
        A confirmação no WhatsApp vai sempre com o <strong>link do agendamento</strong>: a cliente confirma, avisa que não vai
        ou pede outro horário pela página, e as orientações de preparo de cada procedimento aparecem lá.
      </p>
    </div>
  );
};

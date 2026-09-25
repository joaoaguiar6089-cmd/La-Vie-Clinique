import React, { useState } from 'react';
import { X, ArrowLeft, Building2, Check, Sparkles, Phone, Instagram, MapPin, Award, Plus, Trash2, Edit3, UserCheck, Stethoscope, Camera, Mail, KeyRound, ShieldCheck, Shield, Loader2, Crop, Image as ImageIcon, Scan, CalendarDays } from 'lucide-react';
import { AgendaExpedienteDia, ClinicProfile, LaserCategoryDefaults, Professional } from '../types';
import { AGENDA_DEFAULTS, INTERVALOS_DISPONIVEIS } from '../utils/agenda';
import { mascararHora } from './common/MaskedDateTimeInput';
import { createProfessionalLogin } from '../services/authService';
import { ImageCropperModal, AspectOption } from './ImageCropperModal';
import { ClinicLogo, clinicMonogram, resolveClinicLogoUrl } from './ClinicLogo';
import { motivoEnderecoFechado, normalizarEnderecoPublico } from '../utils/publicLinks';

/**
 * A foto da profissional entra em dois lugares com recortes diferentes: o bloco 92×104 da capa do
 * catálogo em PDF e o avatar redondo das listas. O frame do recorte é o do PDF (o mais exigente) e
 * o círculo do avatar aparece como guia por cima — assim o rosto não fica cortado em nenhum dos dois.
 */
const PROFESSIONAL_PHOTO_ASPECTS: AspectOption[] = [
  { id: 'ficha', label: 'Ficha', ratio: 92 / 104 },
];

/**
 * O logo é desenhado dentro de quadros quadrados (cabeçalho do painel, capa do catálogo em PDF)
 * sempre por inteiro, sem corte — por isso "Original" é a primeira opção: marcas largas continuam
 * legíveis. "Quadrado" existe para quem quiser recortar um símbolo fechado.
 */
const CLINIC_LOGO_ASPECTS: AspectOption[] = [
  { id: 'original', label: 'Original', ratio: null },
  { id: 'quadrado', label: 'Quadrado', ratio: 1 },
];

/**
 * Os dois manequins do mapa corporal da depilação a laser. São só dois campos, e sem variante por
 * gênero: a silhueta é neutra e as áreas são desenhadas uma vez para todo mundo.
 */
type ManequimCampo = 'laserManequimFrenteUrl' | 'laserManequimCostasUrl';

const MANEQUINS: { campo: ManequimCampo; rotulo: string }[] = [
  { campo: 'laserManequimFrenteUrl', rotulo: 'Corpo — Frente' },
  { campo: 'laserManequimCostasUrl', rotulo: 'Corpo — Costas' },
];

/**
 * Maior lado da imagem gerada. As áreas precisam ficar nítidas num manequim grande, mas o arquivo
 * ainda vai para o Storage e é baixado pela paciente no celular — 1400px é o meio-termo.
 */
const LASER_MANEQUIM_MAX_DIM = 1400;

/** Campos que toda área de laser herda desta tela quando os deixa em branco no cadastro. */
const LASER_PADROES_CAMPOS: {
  campo: keyof LaserCategoryDefaults;
  rotulo: string;
  dica: string;
  linhas: number;
}[] = [
  {
    campo: 'description',
    rotulo: 'Descrição do procedimento',
    dica: 'Remoção progressiva dos pelos com laser de diodo, com resfriamento contínuo da pele...',
    linhas: 3,
  },
  {
    campo: 'contraindications',
    rotulo: 'Contraindicações',
    dica: 'Gestantes, pele bronzeada ou queimada de sol, uso de isotretinoína nos últimos 6 meses...',
    linhas: 3,
  },
  {
    campo: 'recoveryTime',
    rotulo: 'Recuperação',
    dica: 'Sem downtime. Leve vermelhidão por algumas horas.',
    linhas: 2,
  },
  {
    campo: 'idealCandidate',
    rotulo: 'Candidato ideal',
    dica: 'Pessoas com pelos escuros e pele não bronzeada, buscando redução definitiva.',
    linhas: 2,
  },
];

/** O índice do topo da página. A ordem é a mesma em que as seções aparecem abaixo. */
const SECOES = [
  { id: 'cfg-identidade', rotulo: 'Identidade', icone: Building2 },
  { id: 'cfg-equipe', rotulo: 'Equipe', icone: Stethoscope },
  { id: 'cfg-contato', rotulo: 'Contato', icone: Phone },
  { id: 'cfg-catalogo', rotulo: 'Catálogo', icone: Sparkles },
  { id: 'cfg-agenda', rotulo: 'Agenda', icone: CalendarDays },
  { id: 'cfg-laser', rotulo: 'Mapa do laser', icone: Scan },
] as const;

interface ClinicSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  clinic: ClinicProfile;
  onSave: (updatedClinic: ClinicProfile) => void;
  /** UID (Firebase Auth) da profissional logada agora — usado para impedir que ela se auto-exclua. */
  currentUserUid?: string;
  /** Se a profissional logada tem poderes de admin (excluir contas, conceder/revogar admin). */
  isAdminUser: boolean;
  /**
   * Abre a gestão das áreas do mapa corporal. Mora no App, e não aqui, porque precisa do catálogo
   * e da gravação de procedimento — que são de outro módulo.
   */
  onAbrirMapaDeAreas?: () => void;
}

export const ClinicSettingsModal: React.FC<ClinicSettingsModalProps> = ({
  isOpen,
  onClose,
  clinic,
  onSave,
  currentUserUid,
  isAdminUser,
  onAbrirMapaDeAreas,
}) => {
  const [formData, setFormData] = useState<ClinicProfile>(() => {
    const initialProfessionals: Professional[] = clinic.professionals && clinic.professionals.length > 0
      ? clinic.professionals
      : [
          {
            id: 'doc-1',
            name: clinic.professionalName || 'Dra. Karoline Ferreira',
            registryNumber: clinic.registryNumber || '',
            title: clinic.professionalTitle || 'Especialista em Estética Avançada & Tecnologias',
            specialty: clinic.professionalTitle || 'Especialista em Estética Avançada & Tecnologias'
          }
        ];
    return { ...clinic, professionals: initialProfessionals };
  });
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);

  // Sync formData only when the modal transitions from closed to open — NOT on every
  // `clinic` prop change while it stays open. The clinic prop is a live Firestore
  // subscription and can update mid-edit (e.g. another tab/device saving), which
  // would otherwise silently wipe out professionals just added/edited in this modal
  // before the user clicks "Salvar Informações".
  const wasOpenRef = React.useRef(false);
  React.useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      const initialProfessionals: Professional[] = clinic.professionals && clinic.professionals.length > 0
        ? clinic.professionals
        : [
            {
              id: 'doc-1',
              name: clinic.professionalName || 'Dra. Karoline Ferreira',
              registryNumber: clinic.registryNumber || '',
              title: clinic.professionalTitle || 'Especialista em Estética Avançada & Tecnologias',
              specialty: clinic.professionalTitle || 'Especialista em Estética Avançada & Tecnologias'
            }
          ];
      setFormData({ ...clinic, professionals: initialProfessionals });
      setEditingDocId(null);
      setShowDoctorForm(false);
      setDeletingDocId(null);
      setPhotoCropSource(null);
      setLogoCropSource(null);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, clinic]);

  // State for adding / editing a doctor
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [docName, setDocName] = useState('');
  const [docRegistry, setDocRegistry] = useState('');
  const [docTitle, setDocTitle] = useState('');
  const [docSpecialty, setDocSpecialty] = useState('');
  const [docPhotoUrl, setDocPhotoUrl] = useState('');
  const [docEmail, setDocEmail] = useState('');
  /** Foto aguardando recorte: o arquivo recém-escolhido ou a foto atual que a usuária quer reajustar. */
  const [photoCropSource, setPhotoCropSource] = useState<File | string | null>(null);
  /** Mesma ideia do recorte da foto, para o logo da clínica. */
  const [logoCropSource, setLogoCropSource] = useState<File | string | null>(null);
  const [manequimCrop, setManequimCrop] = useState<{
    campo: ManequimCampo;
    source: File | string;
    opcoes: AspectOption[];
    substituindo: boolean;
  } | null>(null);
  const [avisoManequim, setAvisoManequim] = useState<string | null>(null);
  const [showDoctorForm, setShowDoctorForm] = useState(false);
  const [creatingLoginForId, setCreatingLoginForId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  /** Como a foto da médica: o arquivo escolhido abre o recorte antes de virar o logo salvo. */
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    setLogoCropSource(file);
  };

  /**
   * Troca de manequim é travada na proporção da imagem que já está lá.
   *
   * As áreas do mapa guardam coordenadas relativas à imagem (0–1). Substituir a frente por um
   * arquivo mais largo ou mais alto não moveria um número sequer no banco, mas jogaria a virilha
   * na coxa em todas as áreas daquela vista de uma vez — um estrago silencioso, que só aparece
   * quando alguém abre o mapa. Travar o recorte na proporção atual mantém as coordenadas válidas.
   *
   * Frente e costas **não** precisam combinar entre si: cada vista tem seu próprio sistema de
   * coordenadas. Por isso a trava é por slot, e o primeiro envio de cada um é livre.
   */
  const proporcaoDaImagem = (url: string): Promise<number | null> =>
    new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img.naturalHeight ? img.naturalWidth / img.naturalHeight : null);
      img.onerror = () => resolve(null);
      img.src = url;
    });

  const handleManequimUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    campo: ManequimCampo
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;

    const atual = formData[campo];
    const proporcao = atual ? await proporcaoDaImagem(atual) : null;

    setManequimCrop({
      campo,
      source: file,
      opcoes: proporcao
        ? [{ id: 'atual', label: 'Proporção atual', ratio: proporcao }]
        : [
            { id: 'corpo', label: 'Corpo inteiro', ratio: 1 / 2.2 },
            { id: 'original', label: 'Original', ratio: null },
          ],
      substituindo: Boolean(atual),
    });
  };

  const handleChange = (field: keyof ClinicProfile, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleStartAddDoctor = () => {
    setEditingDocId(null);
    setDocName('');
    setDocRegistry('');
    setDocTitle('');
    setDocSpecialty('');
    setDocPhotoUrl('');
    setDocEmail('');
    setPhotoCropSource(null);
    setShowDoctorForm(true);
  };

  const handleStartEditDoctor = (doc: Professional) => {
    setEditingDocId(doc.id);
    setDocName(doc.name);
    setDocRegistry(doc.registryNumber || '');
    setDocTitle(doc.title || doc.specialty || '');
    setDocSpecialty(doc.specialty || doc.title || '');
    setDocPhotoUrl(doc.photoUrl || '');
    setDocEmail(doc.email || '');
    setPhotoCropSource(null);
    setShowDoctorForm(true);
  };

  const handleSaveDoctor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!docName.trim()) return;

    if (editingDocId) {
      // Edit existing
      setFormData((prev) => ({
        ...prev,
        professionals: prev.professionals.map((d) =>
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
        ),
      }));
    } else {
      // Add new
      const newDoc: Professional = {
        id: `doc-${Date.now()}`,
        name: docName.trim(),
        registryNumber: docRegistry.trim(),
        title: docTitle.trim(),
        specialty: docTitle.trim(),
        photoUrl: docPhotoUrl.trim() || undefined,
        email: docEmail.trim() || undefined,
      };
      setFormData((prev) => ({
        ...prev,
        professionals: [...prev.professionals, newDoc],
      }));
    }

    // Reset doctor form
    setEditingDocId(null);
    setDocName('');
    setDocRegistry('');
    setDocTitle('');
    setDocSpecialty('');
    setDocPhotoUrl('');
    setDocEmail('');
    setPhotoCropSource(null);
    setShowDoctorForm(false);
  };

  const adminCount = formData.professionals.filter((d) => d.isAdmin).length;

  const handleDeleteDoctor = (id: string) => {
    const target = formData.professionals.find((d) => d.id === id);
    if (formData.professionals.length <= 1) {
      setErrorMessage('A clínica deve ter ao menos uma profissional cadastrada.');
      setTimeout(() => setErrorMessage(null), 3500);
      return;
    }
    if (target?.uid && target.uid === currentUserUid) {
      setErrorMessage('Você não pode excluir a própria conta enquanto está logada.');
      setTimeout(() => setErrorMessage(null), 3500);
      return;
    }
    if (target?.isAdmin && adminCount <= 1) {
      setErrorMessage('A clínica deve ter ao menos uma profissional admin. Torne outra pessoa admin antes de excluir esta conta.');
      setTimeout(() => setErrorMessage(null), 3500);
      return;
    }
    setFormData((prev) => ({
      ...prev,
      professionals: prev.professionals.filter((d) => d.id !== id),
    }));
    setDeletingDocId(null);
    setErrorMessage(null);
  };

  const handleCreateLogin = async (doc: Professional) => {
    if (!doc.email?.trim()) {
      setErrorMessage(`Informe um e-mail para "${doc.name}" antes de criar o login.`);
      setTimeout(() => setErrorMessage(null), 3500);
      return;
    }
    setCreatingLoginForId(doc.id);
    try {
      const uid = await createProfessionalLogin(doc.email);
      setFormData((prev) => ({
        ...prev,
        professionals: prev.professionals.map((d) => (d.id === doc.id ? { ...d, uid } : d)),
      }));
    } catch (err: any) {
      const msg =
        err?.code === 'auth/email-already-in-use'
          ? 'Este e-mail já possui uma conta de login no Firebase.'
          : 'Não foi possível criar o login agora. Tente novamente.';
      setErrorMessage(msg);
      setTimeout(() => setErrorMessage(null), 4500);
    } finally {
      setCreatingLoginForId(null);
    }
  };

  const handleToggleAdmin = (doc: Professional) => {
    if (doc.isAdmin && adminCount <= 1) {
      setErrorMessage('A clínica deve ter ao menos uma profissional admin.');
      setTimeout(() => setErrorMessage(null), 3500);
      return;
    }
    setFormData((prev) => ({
      ...prev,
      professionals: prev.professionals.map((d) => (d.id === doc.id ? { ...d, isAdmin: !d.isAdmin } : d)),
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    let updatedProfessionals = [...formData.professionals];

    // Se o formulário de médica estiver aberto, incorpora as alterações automaticamente
    if (showDoctorForm && docName.trim()) {
      if (editingDocId) {
        updatedProfessionals = updatedProfessionals.map((d) =>
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
      } else {
        const newDoc: Professional = {
          id: `doc-${Date.now()}`,
          name: docName.trim(),
          registryNumber: docRegistry.trim(),
          title: docTitle.trim(),
          specialty: docTitle.trim(),
          photoUrl: docPhotoUrl.trim() || undefined,
          email: docEmail.trim() || undefined,
        };
        updatedProfessionals.push(newDoc);
      }
    } else if (editingDocId && docPhotoUrl.trim()) {
      updatedProfessionals = updatedProfessionals.map((d) =>
        d.id === editingDocId ? { ...d, photoUrl: docPhotoUrl.trim() } : d
      );
    }

    // Update legacy fields if needed from first doctor
    const primaryDoc = updatedProfessionals[0];
    const finalData: ClinicProfile = {
      ...formData,
      professionals: updatedProfessionals,
      professionalName: primaryDoc?.name || formData.professionalName,
      professionalTitle: primaryDoc?.title || formData.professionalTitle,
      registryNumber: primaryDoc?.registryNumber || formData.registryNumber,
    };
    onSave(finalData);
    onClose();
  };

  if (!isOpen) return null;

  return (
    /* Página, não modal.

       Eram 700 linhas de formulário dentro de uma caixa de 672px com rolagem própria, sobre
       um véu preto: no celular, meia tela útil; no desktop, a sensação de que fechar sem querer
       perderia tudo. Como página ela usa a largura que tem, rola com a página e o índice do topo
       leva direto à seção. */
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
      <header className="mb-5">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 min-h-[44px] -ml-1 pr-2 text-body font-semibold text-muted hover:text-ink transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </button>
        <p className="text-label uppercase tracking-wider font-semibold text-brand">
          Configurações
        </p>
        <h1 className="font-serif-luxury text-title-lg sm:text-display text-ink mt-0.5">
          Dados da clínica e equipe
        </h1>
      </header>

      {/* Índice das seções. Rola horizontalmente no celular, onde os seis rótulos não cabem
          lado a lado — melhor deslizar do que quebrar em três linhas. */}
      <nav
        aria-label="Seções das configurações"
        className="sticky top-[57px] sm:top-0 z-20 -mx-4 px-4 sm:mx-0 sm:px-0 py-2 mb-5 bg-surface/95 border-b border-line overflow-x-auto"
      >
        <ul className="flex items-center gap-1.5 w-max">
          {SECOES.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-lg text-body font-medium text-ink-soft hover:bg-surface-2 hover:text-brand transition-colors whitespace-nowrap"
              >
                <s.icone className="w-3.5 h-3.5 text-brand shrink-0" />
                {s.rotulo}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="glass-card">
        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-7">
          {/* Clinic & Brand */}
          <div id="cfg-identidade" className="space-y-4 scroll-mt-24">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-brand flex items-center gap-1.5 pb-1 border-b border-white/60">
              <Building2 className="w-3.5 h-3.5" />
              Identidade da Clínica
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-ink mb-1">
                  Nome da Clínica / Consultório *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  className="w-full px-3.5 py-2 rounded-sm bg-card border border-white/80 text-xs font-medium text-ink focus:outline-hidden focus:border-brand"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-ink mb-1">
                  Slogan / Subtítulo da Marca
                </label>
                <input
                  type="text"
                  value={formData.tagline}
                  onChange={(e) => handleChange('tagline', e.target.value)}
                  className="w-full px-3.5 py-2 rounded-sm bg-card border border-white/80 text-xs font-medium text-ink focus:outline-hidden focus:border-brand"
                />
              </div>
            </div>

            {/* Logo — substitui o monograma "LV" no painel e na capa do catálogo em PDF */}
            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Logo da Clínica
              </label>
              <div className="p-3 rounded-sm bg-card border border-white/80 space-y-3">
                <div className="flex items-center gap-3">
                  {/* A marca aparece sobre fundo claro (página inicial, capa do PDF) e sobre fundo
                      escuro (menu lateral, rodapé) — as duas prévias mostram os dois casos. */}
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-center">
                      <div className="w-14 h-14 rounded-sm bg-white border border-gray-200 flex items-center justify-center p-1.5">
                        <ClinicLogo
                          clinic={formData}
                          className="w-full h-full"
                          monogramClassName="bg-ink text-brand-light font-serif-luxury text-base font-semibold rounded-xs"
                        />
                      </div>
                      <span className="block text-label uppercase tracking-wider text-gray-400 mt-1">
                        Claro
                      </span>
                    </div>
                    <div className="text-center">
                      <div className="w-14 h-14 rounded-sm bg-ink border border-ink flex items-center justify-center p-1.5">
                        <ClinicLogo
                          clinic={formData}
                          className="w-full h-full"
                          monogramClassName="text-brand-light font-serif-luxury text-base font-semibold"
                        />
                      </div>
                      <span className="block text-label uppercase tracking-wider text-gray-400 mt-1">
                        Escuro
                      </span>
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="px-3 py-1.5 rounded-xs bg-white border border-gray-200 text-body font-medium text-ink hover:border-brand cursor-pointer transition-colors flex items-center gap-1">
                        <ImageIcon className="w-3 h-3" />
                        {resolveClinicLogoUrl(formData.logoUrl) ? 'Trocar logo' : 'Enviar logo'}
                        <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                      </label>
                      {resolveClinicLogoUrl(formData.logoUrl) && (
                        <>
                          <button
                            type="button"
                            onClick={() => setLogoCropSource(formData.logoUrl || null)}
                            className="px-3 py-1.5 rounded-xs bg-white border border-gray-200 text-body font-medium text-ink hover:border-brand transition-colors flex items-center gap-1"
                          >
                            <Crop className="w-3 h-3" />
                            Ajustar enquadramento
                          </button>
                          <button
                            type="button"
                            onClick={() => handleChange('logoUrl', '')}
                            className="text-body text-red-500 hover:text-red-700 font-medium"
                          >
                            Remover
                          </button>
                        </>
                      )}
                    </div>
                    <p className="text-label text-gray-500 leading-relaxed mt-2">
                      Usada na capa do catálogo em PDF e no topo da página inicial, no lugar do
                      monograma <strong>{clinicMonogram(formData.name)}</strong>. Prefira PNG com
                      fundo transparente — o arquivo é gravado junto do perfil, então mantenha-o leve.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Clinical Team / Registered Doctors */}
          <div id="cfg-equipe" className="space-y-4 scroll-mt-24">
            <div className="flex items-center justify-between pb-1 border-b border-white/60">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-brand flex items-center gap-1.5">
                <Stethoscope className="w-3.5 h-3.5" />
                Corpo Clínico & Médicas Cadastradas ({formData.professionals.length})
              </h3>
              {!showDoctorForm && (
                <button
                  type="button"
                  onClick={handleStartAddDoctor}
                  className="px-2.5 py-1 rounded-xs bg-brand text-white text-label uppercase tracking-wider font-semibold hover:bg-brand-hover flex items-center gap-1 transition-all"
                >
                  <Plus className="w-3 h-3" />
                  Adicionar Médica / Dra.
                </button>
              )}
            </div>

            {/* Doctor Add/Edit Form Box */}
            {showDoctorForm && (
              <div className="p-4 rounded-sm bg-card border border-brand/40 shadow-xs space-y-3 animate-fadeIn">
                <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                  <span className="text-xs font-bold text-ink uppercase tracking-wider">
                    {editingDocId ? 'Editar Dados da Médica' : 'Cadastrar Nova Médica / Dra.'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowDoctorForm(false);
                      setPhotoCropSource(null);
                    }}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    Fechar
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-full bg-white border border-gray-200 overflow-hidden shrink-0 flex items-center justify-center">
                    {docPhotoUrl ? (
                      <img src={docPhotoUrl} alt="Prévia da foto" className="w-full h-full object-cover" />
                    ) : (
                      <Camera className="w-5 h-5 text-gray-300" />
                    )}
                  </div>
                  <div className="flex-1">
                    <label className="block text-body font-medium text-gray-700 mb-1">
                      Foto da Médica (usada na capa do catálogo em PDF)
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="px-3 py-1.5 rounded-xs bg-white border border-gray-200 text-body font-medium text-ink hover:border-brand cursor-pointer transition-colors">
                        Escolher Arquivo
                        <input type="file" accept="image/*" onChange={handleDoctorPhotoUpload} className="hidden" />
                      </label>
                      {docPhotoUrl && (
                        <button
                          type="button"
                          onClick={() => setPhotoCropSource(docPhotoUrl)}
                          className="px-3 py-1.5 rounded-xs bg-white border border-gray-200 text-body font-medium text-ink hover:border-brand transition-colors flex items-center gap-1"
                        >
                          <Crop className="w-3 h-3" />
                          Ajustar enquadramento
                        </button>
                      )}
                      {docPhotoUrl && (
                        <button
                          type="button"
                          onClick={() => setDocPhotoUrl('')}
                          className="text-body text-red-500 hover:text-red-700 font-medium"
                        >
                          Remover
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-body font-medium text-gray-700 mb-1">
                      Nome da Profissional (Ex: Dra. Marcella Ribeiro) *
                    </label>
                    <input
                      type="text"
                      value={docName}
                      onChange={(e) => setDocName(e.target.value)}
                      placeholder="Dra. Nome Completo"
                      className="w-full px-3 py-1.5 rounded-xs bg-white border border-gray-200 text-xs font-medium text-ink focus:outline-hidden focus:border-brand"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-body font-medium text-gray-700 mb-1">
                      Registro Profissional (CRM / CRBM / COREN)
                    </label>
                    <input
                      type="text"
                      value={docRegistry}
                      onChange={(e) => setDocRegistry(e.target.value)}
                      placeholder="CRBM 28.450 ou CRM 184.920"
                      className="w-full px-3 py-1.5 rounded-xs bg-white border border-gray-200 text-xs font-medium text-ink focus:outline-hidden focus:border-brand"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-body font-medium text-gray-700 mb-1">
                      Título / Especialidade
                    </label>
                    <input
                      type="text"
                      value={docTitle}
                      onChange={(e) => setDocTitle(e.target.value)}
                      placeholder="Ex: Biomédica Esteta / Dermatologista / Harmonização Facial"
                      className="w-full px-3 py-1.5 rounded-xs bg-white border border-gray-200 text-xs font-medium text-ink focus:outline-hidden focus:border-brand"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-body font-medium text-gray-700 mb-1 flex items-center gap-1">
                      <Mail className="w-3 h-3" />
                      E-mail de login (usado para criar o acesso ao painel)
                    </label>
                    <input
                      type="email"
                      value={docEmail}
                      onChange={(e) => setDocEmail(e.target.value)}
                      placeholder="profissional@lavieclinique.com"
                      className="w-full px-3 py-1.5 rounded-xs bg-white border border-gray-200 text-xs font-medium text-ink focus:outline-hidden focus:border-brand"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowDoctorForm(false)}
                    className="px-3 py-1.5 rounded-xs border border-gray-200 text-xs text-gray-600 hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveDoctor}
                    className="px-4 py-1.5 rounded-xs bg-ink text-white text-xs font-medium uppercase tracking-wider hover:bg-ink"
                  >
                    {editingDocId ? 'Atualizar Médica' : 'Salvar Médica'}
                  </button>
                </div>
              </div>
            )}

            {/* List of Registered Doctors */}
            {errorMessage && (
              <div className="p-2.5 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xs flex items-center justify-between">
                <span>{errorMessage}</span>
                <button
                  type="button"
                  onClick={() => setErrorMessage(null)}
                  className="text-amber-600 hover:text-amber-900 font-bold ml-2"
                >
                  ✕
                </button>
              </div>
            )}

            <div className="space-y-2">
              {formData.professionals.map((doc, idx) => (
                <div
                  key={doc.id || idx}
                  className="flex items-center justify-between p-3 rounded-xs bg-card border border-white/80 hover:border-brand/30 transition-all"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      type="button"
                      onClick={() => handleStartEditDoctor(doc)}
                      className="relative group w-9 h-9 rounded-full bg-ink text-brand-light flex items-center justify-center text-xs font-bold font-serif-luxury shadow-xs overflow-hidden shrink-0 border border-brand/30 hover:border-brand transition-colors"
                      title="Clique para editar ou trocar foto"
                    >
                      {doc.photoUrl ? (
                        <img src={doc.photoUrl} alt={doc.name} className="w-full h-full object-cover" />
                      ) : (
                        doc.name.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || 'DR'
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <Camera className="w-3.5 h-3.5 text-white" />
                      </div>
                    </button>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs font-semibold text-ink">{doc.name}</p>
                        {doc.registryNumber && (
                          <span className="text-label px-1.5 py-0.2 rounded-xs bg-brand/15 text-brand font-semibold">
                            {doc.registryNumber}
                          </span>
                        )}
                        {doc.isAdmin && (
                          <span className="flex items-center gap-0.5 text-label px-1.5 py-0.2 rounded-xs bg-ink text-brand-light font-semibold">
                            <ShieldCheck className="w-2.5 h-2.5" /> Admin
                          </span>
                        )}
                        {doc.uid ? (
                          <span className="text-label px-1.5 py-0.2 rounded-xs bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                            Login ativo
                          </span>
                        ) : (
                          <span className="text-label px-1.5 py-0.2 rounded-xs bg-gray-100 text-gray-500 font-medium">
                            Sem login
                          </span>
                        )}
                      </div>
                      {doc.title && (
                        <p className="text-body text-gray-500 font-light line-clamp-1">{doc.title}</p>
                      )}
                    </div>
                  </div>

                  {deletingDocId === doc.id ? (
                    <div className="flex items-center gap-1.5 animate-fadeIn shrink-0">
                      <span className="text-body text-red-600 font-medium mr-1">Excluir?</span>
                      <button
                        type="button"
                        onClick={() => handleDeleteDoctor(doc.id)}
                        className="px-2 py-1 bg-red-600 text-white rounded-xs text-label font-bold uppercase tracking-wider hover:bg-red-700 shadow-xs"
                      >
                        Sim
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingDocId(null)}
                        className="px-2 py-1 bg-gray-200 text-gray-700 rounded-xs text-label font-medium hover:bg-gray-300"
                      >
                        Não
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 shrink-0">
                      {!doc.uid && (
                        <button
                          type="button"
                          disabled={creatingLoginForId === doc.id}
                          onClick={() => handleCreateLogin(doc)}
                          className="p-1.5 rounded-xs text-gray-400 hover:text-brand hover:bg-white transition-colors disabled:opacity-50"
                          title="Criar login para esta profissional"
                        >
                          {creatingLoginForId === doc.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <KeyRound className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}
                      {isAdminUser && doc.uid && (
                        <button
                          type="button"
                          onClick={() => handleToggleAdmin(doc)}
                          className={`p-1.5 rounded-xs transition-colors ${
                            doc.isAdmin
                              ? 'text-brand hover:text-gray-400 hover:bg-white'
                              : 'text-gray-400 hover:text-brand hover:bg-white'
                          }`}
                          title={doc.isAdmin ? 'Remover admin' : 'Tornar admin'}
                        >
                          {doc.isAdmin ? <ShieldCheck className="w-3.5 h-3.5" /> : <Shield className="w-3.5 h-3.5" />}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleStartEditDoctor(doc)}
                        className="p-1.5 rounded-xs text-gray-400 hover:text-ink hover:bg-white transition-colors"
                        title="Editar Médica"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      {isAdminUser && (
                        <button
                          type="button"
                          onClick={() => setDeletingDocId(doc.id)}
                          className="p-1.5 rounded-xs text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="Remover Médica"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <p className="text-body text-gray-500 italic">
              * Ao cadastrar um procedimento, você poderá selecionar qual ou quais médicas são responsáveis pelo atendimento.
            </p>
          </div>

          {/* Contact & Location (Editable for Footer & PDF) */}
          <div id="cfg-contato" className="space-y-4 scroll-mt-24">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-brand flex items-center gap-1.5 pb-1 border-b border-white/60">
              <Phone className="w-3.5 h-3.5" />
              Canais de Contato & Localização (Exibidos no Rodapé e PDF)
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-ink mb-1">
                  WhatsApp / Telefone para Agendamentos *
                </label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  placeholder="(19) 99876-5432"
                  className="w-full px-3.5 py-2 rounded-sm bg-card border border-white/80 text-xs font-medium text-ink focus:outline-hidden focus:border-brand"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-ink mb-1">
                  Instagram (@perfil)
                </label>
                <input
                  type="text"
                  value={formData.instagram}
                  onChange={(e) => handleChange('instagram', e.target.value)}
                  placeholder="@lavieclinique.indaiatuba"
                  className="w-full px-3.5 py-2 rounded-sm bg-card border border-white/80 text-xs font-medium text-ink focus:outline-hidden focus:border-brand"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-ink mb-1">
                  Endereço do Consultório
                </label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => handleChange('address', e.target.value)}
                  placeholder="Av. Pres. Vargas, 1400 - Sala 82, Jardim Vitória"
                  className="w-full px-3.5 py-2 rounded-sm bg-card border border-white/80 text-xs font-medium text-ink focus:outline-hidden focus:border-brand"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-ink mb-1">
                  Cidade / UF
                </label>
                <input
                  type="text"
                  value={formData.cityState}
                  onChange={(e) => handleChange('cityState', e.target.value)}
                  placeholder="Indaiatuba - SP"
                  className="w-full px-3.5 py-2 rounded-sm bg-card border border-white/80 text-xs font-medium text-ink focus:outline-hidden focus:border-brand"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-ink mb-1">
                  Endereço público do sistema
                </label>
                <input
                  type="text"
                  value={formData.publicBaseUrl || ''}
                  onChange={(e) => handleChange('publicBaseUrl', e.target.value)}
                  placeholder="https://catalogo.lavieclinique.com.br"
                  className="w-full px-3.5 py-2 rounded-sm bg-card border border-white/80 text-xs font-medium text-ink focus:outline-hidden focus:border-brand"
                />
                <p className="text-body text-gray-500 mt-1.5 leading-snug">
                  Base dos links enviados à paciente — ficha de anamnese, orçamento e QR Code do
                  catálogo. Preencha com o endereço que abre <strong>sem pedir login</strong>. Em
                  branco, o link usa o endereço da janela em que você estiver: se o painel foi
                  aberto por um endereço de desenvolvimento, a paciente recebe esse endereço e cai
                  numa tela de login. Para conferir, abra o link numa aba anônima.
                </p>
                {(() => {
                  const base = normalizarEnderecoPublico(formData.publicBaseUrl);
                  const motivo = base ? motivoEnderecoFechado(base) : null;
                  return motivo ? (
                    <p className="text-body text-red-600 mt-1.5 leading-snug">
                      Este endereço não serve: ele {motivo}. Use o endereço publicado do site.
                    </p>
                  ) : null;
                })()}
              </div>
            </div>
          </div>

          {/* Catalog notes */}
          <div id="cfg-catalogo" className="space-y-4 scroll-mt-24">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-brand flex items-center gap-1.5 pb-1 border-b border-white/60">
              <Sparkles className="w-3.5 h-3.5" />
              Mensagens do Catálogo & PDF
            </h3>

            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Mensagem de Boas-Vindas no Topo do Catálogo
              </label>
              <textarea
                rows={2}
                value={formData.catalogWelcomeNote || ''}
                onChange={(e) => handleChange('catalogWelcomeNote', e.target.value)}
                className="w-full px-3.5 py-2 rounded-sm bg-card border border-white/80 text-xs font-medium text-ink"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Nota de Rodapé (Condições / Aviso de Avaliação)
              </label>
              <input
                type="text"
                value={formData.consultationNote || ''}
                onChange={(e) => handleChange('consultationNote', e.target.value)}
                className="w-full px-3.5 py-2 rounded-sm bg-card border border-white/80 text-xs font-medium text-ink"
              />
            </div>
          </div>

          <div id="cfg-agenda" className="scroll-mt-24">
            <SecaoAgendaDaClinica formData={formData} onChange={handleChange} />
          </div>

          {/* Mapa corporal da depilação a laser */}
          <div id="cfg-laser" className="space-y-4 scroll-mt-24">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-brand flex items-center gap-1.5 pb-1 border-b border-white/60">
              <Scan className="w-3.5 h-3.5" />
              Depilação a Laser — Mapa Corporal
            </h3>

            <p className="text-body text-gray-500 leading-relaxed">
              Os dois manequins sobre os quais as áreas de aplicação são desenhadas. Servem para
              ambos os gêneros — as áreas são desenhadas uma vez só. Envie de preferência em PNG
              com fundo transparente, e use a mesma silhueta nas duas vistas.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {MANEQUINS.map(({ campo, rotulo }) => {
                const url = formData[campo];
                return (
                  <div
                    key={campo}
                    className="bg-white/70 border border-white/80 rounded-sm p-3 flex flex-col items-center gap-2"
                  >
                    <span className="text-label font-semibold text-ink uppercase tracking-wider">
                      {rotulo}
                    </span>

                    <div className="h-40 flex items-center justify-center w-full bg-surface rounded-xs border border-dashed border-line overflow-hidden">
                      {url ? (
                        <img src={url} alt={rotulo} className="h-full w-auto object-contain" />
                      ) : (
                        <span className="text-label text-gray-400">Nenhuma imagem enviada</span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <label className="px-3 py-1.5 rounded-xs bg-white border border-gray-200 text-body font-medium text-ink hover:border-brand cursor-pointer transition-colors flex items-center gap-1">
                        <ImageIcon className="w-3 h-3" />
                        {url ? 'Trocar' : 'Enviar'}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleManequimUpload(e, campo)}
                          className="hidden"
                        />
                      </label>
                      {url && (
                        <button
                          type="button"
                          onClick={() => handleChange(campo, '')}
                          className="text-body text-red-500 hover:text-red-700 font-medium"
                        >
                          Remover
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {avisoManequim && (
              <p className="text-body text-warn bg-warn-bg border border-[#F0DCB4] rounded-sm px-3 py-2 leading-relaxed">
                {avisoManequim}
              </p>
            )}

            {onAbrirMapaDeAreas && (
              <div className="flex items-start justify-between gap-3 flex-wrap bg-white/70 border border-white/80 rounded-sm px-3 py-2.5">
                <p className="text-body text-gray-500 leading-relaxed flex-1 min-w-[200px]">
                  As áreas são desenhadas no cadastro de cada procedimento. Aqui você vê o mapa
                  inteiro de uma vez — para conferir encavalamentos, reposicionar botões ou remover
                  uma área.
                </p>
                <button
                  type="button"
                  onClick={onAbrirMapaDeAreas}
                  className="px-3.5 py-2 rounded-xs bg-white border border-gray-200 text-[12px] font-medium text-ink hover:border-brand transition-colors flex items-center gap-1.5 shrink-0"
                >
                  <Scan className="w-3.5 h-3.5" />
                  Configurar áreas
                </button>
              </div>
            )}

            {/*
              Padrões da categoria.

              Contraindicação, recuperação, candidato ideal e a descrição comercial são idênticos
              nas treze áreas — o que muda de buço para axila é o preço. Mantê-los em treze cópias
              significa, na prática, que uma correção clínica nunca chega a todas. Aqui a herança é
              viva: a área só guarda o campo quando alguém o edita lá; vazio usa o que está abaixo.
            */}
            <div className="pt-1 space-y-3">
              <div>
                <h4 className="text-label font-semibold uppercase tracking-wider text-brand">
                  Padrões da categoria
                </h4>
                <p className="text-body text-gray-500 leading-relaxed mt-0.5">
                  Valem para toda área de laser que deixar o campo em branco no cadastro. Corrigir
                  aqui corrige em todas de uma vez.
                </p>
              </div>

              {LASER_PADROES_CAMPOS.map(({ campo, rotulo, dica, linhas }) => (
                <div key={campo}>
                  <label className="block text-xs font-medium text-ink mb-1">{rotulo}</label>
                  <textarea
                    rows={linhas}
                    value={formData.laserPadroes?.[campo] || ''}
                    onChange={(e) =>
                      handleChange('laserPadroes', {
                        ...(formData.laserPadroes || {}),
                        [campo]: e.target.value,
                      })
                    }
                    placeholder={dica}
                    className="w-full px-3.5 py-2 rounded-sm bg-card border border-white/80 text-xs font-medium text-ink focus:outline-hidden focus:border-brand"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Ações. Coladas no fim da página, e não numa barra flutuante: numa página de
              configurações a pessoa rola até acabar e salva — não salva no meio. */}
          <div className="pt-5 border-t border-line flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 rounded-xl border border-line text-body font-semibold uppercase tracking-wider text-muted hover:text-ink transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="min-h-[44px] px-6 rounded-xl bg-brand text-white text-body font-semibold uppercase tracking-widest shadow-xs active:scale-95 transition-all flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              Salvar informações
            </button>
          </div>
        </form>
      </div>

      {/* Fora do <form>: o recorte não pode disparar o submit do cadastro da médica. */}
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
              professionals: prev.professionals.map((d) =>
                d.id === editingDocId ? { ...d, photoUrl: dataUrl } : d
              ),
            }));
          } else if (formData.professionals.length > 0) {
            setFormData((prev) => ({
              ...prev,
              professionals: prev.professionals.map((d, i) =>
                i === 0 ? { ...d, photoUrl: dataUrl } : d
              ),
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

      {/* Manequim: PNG pelo mesmo motivo do logo (a silhueta costuma vir com fundo transparente) e
          num lado maior generoso — as áreas desenhadas por cima precisam ficar nítidas. */}
      <ImageCropperModal
        isOpen={manequimCrop !== null}
        source={manequimCrop?.source ?? null}
        title="Enquadrar manequim"
        description={
          manequimCrop?.substituindo
            ? 'A proporção está travada na da imagem atual: as áreas já desenhadas nesta vista usam coordenadas relativas a ela e sairiam do lugar com outra proporção.'
            : 'A figura inteira precisa caber no quadro. Deixe uma folga em volta do corpo.'
        }
        aspectOptions={manequimCrop?.opcoes}
        maxOutputDim={LASER_MANEQUIM_MAX_DIM}
        quality={0.92}
        outputMimeType="image/png"
        confirmLabel="Usar este manequim"
        onCancel={() => setManequimCrop(null)}
        onConfirm={(dataUrl) => {
          if (manequimCrop) {
            handleChange(manequimCrop.campo, dataUrl);
            setAvisoManequim(
              manequimCrop.substituindo
                ? 'Manequim substituído. Abra um procedimento de depilação a laser e confira se as áreas desta vista continuam no lugar certo.'
                : null
            );
          }
          setManequimCrop(null);
        }}
      />
    </div>
  );
};

/**
 * Configurações da agenda: expediente, granularidade da grade e a mensagem de confirmação.
 *
 * O expediente **não bloqueia nada** — só pinta de cinza o que está fora dele. Encaixe continua
 * gravável, porque quem decide abrir uma exceção é a clínica, não a grade.
 */
const DIAS_DO_EXPEDIENTE = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
];

const SecaoAgendaDaClinica: React.FC<{
  formData: ClinicProfile;
  onChange: (campo: keyof ClinicProfile, valor: any) => void;
}> = ({ formData, onChange }) => {
  const tabela =
    formData.agendaExpediente && formData.agendaExpediente.length > 0
      ? formData.agendaExpediente
      : AGENDA_DEFAULTS.expediente;

  const doDia = (diaSemana: number): AgendaExpedienteDia =>
    tabela.find((d) => d.diaSemana === diaSemana) || { diaSemana };

  /** Reescreve a tabela inteira, sempre com os sete dias — assim nunca falta linha no banco. */
  const atualizar = (diaSemana: number, mudanca: Partial<AgendaExpedienteDia>) => {
    const nova = DIAS_DO_EXPEDIENTE.map((_, i) => {
      const atual = doDia(i);
      return i === diaSemana ? { ...atual, ...mudanca } : atual;
    });
    onChange('agendaExpediente', nova);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-brand flex items-center gap-1.5 pb-1 border-b border-white/60">
        <CalendarDays className="w-3.5 h-3.5" />
        Agenda
      </h3>

      <div>
        <p className="text-body text-gray-500 leading-relaxed mb-2">
          Horário de funcionamento. O que fica fora dele aparece em cinza na agenda — mas continua
          clicável, para encaixe.
        </p>

        <div className="space-y-1.5">
          {DIAS_DO_EXPEDIENTE.map((rotulo, i) => {
            const dia = doDia(i);
            const aberto = !!dia.abre && !!dia.fecha;
            return (
              <div
                key={rotulo}
                className="flex items-center gap-2 bg-white/60 border border-white/80 rounded-sm px-2.5 py-1.5"
              >
                <label className="flex items-center gap-2 w-28 shrink-0 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={aberto}
                    onChange={(e) =>
                      atualizar(
                        i,
                        e.target.checked
                          ? { abre: '09:00', fecha: '19:00' }
                          : // String vazia, não `undefined`: o `cleanForFirestore` remove chaves
                            // indefinidas e o `merge: true` preservaria o horário antigo.
                            { abre: '', fecha: '' }
                      )
                    }
                    className="w-4 h-4 accent-brand"
                  />
                  <span className="text-xs font-medium text-ink">{rotulo}</span>
                </label>

                {aberto ? (
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={dia.abre || ''}
                      onChange={(e) => atualizar(i, { abre: mascararHora(e.target.value) })}
                      placeholder="hh:mm"
                      aria-label={`${rotulo}: abre às`}
                      className="w-20 glass-input px-2.5 py-1.5 rounded-sm text-body text-ink tabular-nums focus:outline-hidden"
                    />
                    <span className="text-body text-muted">às</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={dia.fecha || ''}
                      onChange={(e) => atualizar(i, { fecha: mascararHora(e.target.value) })}
                      placeholder="hh:mm"
                      aria-label={`${rotulo}: fecha às`}
                      className="w-20 glass-input px-2.5 py-1.5 rounded-sm text-body text-ink tabular-nums focus:outline-hidden"
                    />

                    {/* Pausa do almoço. As duas pontas juntas ou nenhuma: só o início
                        pintaria de cinza tudo dali até o fechamento. */}
                    <span className="text-body text-muted ml-1">almoço</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={dia.almocoInicio || ''}
                      onChange={(e) => atualizar(i, { almocoInicio: mascararHora(e.target.value) })}
                      placeholder="hh:mm"
                      aria-label={`${rotulo}: almoço começa às`}
                      className="w-20 glass-input px-2.5 py-1.5 rounded-sm text-body text-muted tabular-nums focus:outline-hidden"
                    />
                    <span className="text-body text-muted">às</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={dia.almocoFim || ''}
                      onChange={(e) => atualizar(i, { almocoFim: mascararHora(e.target.value) })}
                      placeholder="hh:mm"
                      aria-label={`${rotulo}: almoço termina às`}
                      className="w-20 glass-input px-2.5 py-1.5 rounded-sm text-body text-muted tabular-nums focus:outline-hidden"
                    />
                  </div>
                ) : (
                  <span className="text-body text-muted">Fechado</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-ink mb-1">
          Divisão da grade
        </label>
        <select
          value={formData.agendaIntervaloMin || AGENDA_DEFAULTS.intervaloMin}
          onChange={(e) => onChange('agendaIntervaloMin', Number(e.target.value))}
          className="glass-input px-3 py-2 rounded-sm text-xs text-ink focus:outline-hidden"
        >
          {INTERVALOS_DISPONIVEIS.map((m) => (
            <option key={m} value={m}>
              {m} minutos
            </option>
          ))}
        </select>
      </div>

      {/* Salas e equipamentos.

          Existe por causa do equipamento, não da parede: o laser é um aparelho só, e duas
          pacientes marcadas para ele no mesmo horário é um problema que a agenda por
          profissional não pega — são duas profissionais diferentes, cada uma com a coluna
          livre. Clínica que não usa o conceito deixa a lista vazia e o campo some do
          formulário de agendamento. */}
      <div>
        <label className="block text-body font-medium text-ink mb-1">
          Salas e equipamentos
        </label>
        <p className="text-label text-muted mb-2">
          Dois agendamentos na mesma sala e no mesmo horário são impedidos — ao contrário do
          conflito de profissional, que só avisa.
        </p>

        <div className="space-y-1.5">
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
                className="flex-1 glass-input px-3 py-2 rounded-sm text-body text-ink focus:outline-hidden"
              />
              <button
                type="button"
                onClick={() =>
                  onChange(
                    'agendaSalas',
                    (formData.agendaSalas || []).filter((s) => s.id !== sala.id)
                  )
                }
                aria-label={`Remover ${sala.nome || 'esta sala'}`}
                className="w-11 h-11 shrink-0 rounded-lg flex items-center justify-center text-muted hover:text-danger hover:bg-danger-bg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() =>
            onChange('agendaSalas', [
              ...(formData.agendaSalas || []),
              { id: `sala-${Date.now()}`, nome: '' },
            ])
          }
          className="mt-2 inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-lg border border-line bg-card text-body font-semibold text-ink hover:border-brand transition-colors"
        >
          <Plus className="w-4 h-4 text-brand" />
          Adicionar sala
        </button>
      </div>

      <div>
        <label className="block text-body font-medium text-ink mb-1">
          Mensagem de confirmação no WhatsApp
        </label>
        <textarea
          rows={3}
          value={formData.agendaConfirmacaoTemplate ?? AGENDA_DEFAULTS.confirmacaoTemplate}
          onChange={(e) => onChange('agendaConfirmacaoTemplate', e.target.value)}
          className="w-full px-3.5 py-2 rounded-sm bg-card border border-line text-body font-medium text-ink"
        />
        <p className="mt-1 text-label text-muted">
          Marcadores: {'{nome}'} {'{primeiroNome}'} {'{data}'} {'{hora}'} {'{procedimento}'}{' '}
          {'{profissional}'} {'{clinica}'}
        </p>

        {/* O preparo é texto do procedimento, cadastrado no catálogo — aqui só se decide se ele
            viaja junto. Procedimento sem preparo cadastrado não acrescenta nada à mensagem. */}
        <label className="mt-3 flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={!!formData.agendaConfirmacaoIncluirOrientacoes}
            onChange={(e) => onChange('agendaConfirmacaoIncluirOrientacoes', e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-[#A67C52] shrink-0"
          />
          <span className="min-w-0">
            <span className="block text-body font-medium text-ink">
              Enviar também as orientações de preparo
            </span>
            <span className="block text-label text-muted">
              O texto "Antes de vir" cadastrado em cada procedimento entra ao fim da mensagem.
            </span>
          </span>
        </label>
      </div>
    </div>
  );
};

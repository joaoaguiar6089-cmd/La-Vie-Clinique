import React, { useState } from 'react';
import { X, Building2, Check, Sparkles, Phone, Instagram, MapPin, Award, Plus, Trash2, Edit3, UserCheck, Stethoscope, Camera, Mail, KeyRound, ShieldCheck, Shield, Loader2, Crop, Image as ImageIcon } from 'lucide-react';
import { ClinicProfile, Professional } from '../types';
import { createProfessionalLogin } from '../services/authService';
import { ImageCropperModal, AspectOption } from './ImageCropperModal';
import { ClinicLogo, clinicMonogram, resolveClinicLogoUrl } from './ClinicLogo';

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

interface ClinicSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  clinic: ClinicProfile;
  onSave: (updatedClinic: ClinicProfile) => void;
  /** UID (Firebase Auth) da profissional logada agora — usado para impedir que ela se auto-exclua. */
  currentUserUid?: string;
  /** Se a profissional logada tem poderes de admin (excluir contas, conceder/revogar admin). */
  isAdminUser: boolean;
}

export const ClinicSettingsModal: React.FC<ClinicSettingsModalProps> = ({
  isOpen,
  onClose,
  clinic,
  onSave,
  currentUserUid,
  isAdminUser,
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
            ? { ...d, name: docName.trim(), registryNumber: docRegistry.trim(), title: docTitle.trim(), specialty: docTitle.trim(), photoUrl: docPhotoUrl.trim() || undefined, email: docEmail.trim() || undefined }
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
    // Update legacy fields if needed from first doctor
    const primaryDoc = formData.professionals[0];
    const finalData: ClinicProfile = {
      ...formData,
      professionalName: primaryDoc?.name || formData.professionalName,
      professionalTitle: primaryDoc?.title || formData.professionalTitle,
      registryNumber: primaryDoc?.registryNumber || formData.registryNumber,
    };
    onSave(finalData);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-[#F9F8F6]/95 backdrop-blur-xl rounded-sm overflow-hidden shadow-2xl border border-white/60 my-6 transition-all">
        {/* Header */}
        <div className="bg-[#1A1A1A] text-[#E5E4E0] px-6 py-4 flex items-center justify-between border-b border-white/10">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-[#C49B74]" />
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-[#C49B74]">
                Configurações & Corpo Clínico
              </span>
              <h2 className="font-serif-luxury text-xl font-medium text-white leading-none mt-0.5">
                Dados da Clínica & Médicas Responsáveis
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xs text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* Clinic & Brand */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-[#A67C52] flex items-center gap-1.5 pb-1 border-b border-white/60">
              <Building2 className="w-3.5 h-3.5" />
              Identidade da Clínica
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#1A1A1A] mb-1">
                  Nome da Clínica / Consultório *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  className="w-full px-3.5 py-2 rounded-sm bg-white/70 backdrop-blur-xs border border-white/80 text-xs font-medium text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1A1A1A] mb-1">
                  Slogan / Subtítulo da Marca
                </label>
                <input
                  type="text"
                  value={formData.tagline}
                  onChange={(e) => handleChange('tagline', e.target.value)}
                  className="w-full px-3.5 py-2 rounded-sm bg-white/70 backdrop-blur-xs border border-white/80 text-xs font-medium text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                />
              </div>
            </div>

            {/* Logo — substitui o monograma "LV" no painel e na capa do catálogo em PDF */}
            <div>
              <label className="block text-xs font-medium text-[#1A1A1A] mb-1">
                Logo da Clínica
              </label>
              <div className="p-3 rounded-sm bg-white/70 backdrop-blur-xs border border-white/80 space-y-3">
                <div className="flex items-center gap-3">
                  {/* A marca aparece sobre fundo claro (página inicial, capa do PDF) e sobre fundo
                      escuro (menu lateral, rodapé) — as duas prévias mostram os dois casos. */}
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-center">
                      <div className="w-14 h-14 rounded-sm bg-white border border-gray-200 flex items-center justify-center p-1.5">
                        <ClinicLogo
                          clinic={formData}
                          className="w-full h-full"
                          monogramClassName="bg-[#1A1A1A] text-[#C49B74] font-serif-luxury text-base font-semibold rounded-xs"
                        />
                      </div>
                      <span className="block text-[9px] uppercase tracking-wider text-gray-400 mt-1">
                        Claro
                      </span>
                    </div>
                    <div className="text-center">
                      <div className="w-14 h-14 rounded-sm bg-[#1A1A1A] border border-[#1A1A1A] flex items-center justify-center p-1.5">
                        <ClinicLogo
                          clinic={formData}
                          className="w-full h-full"
                          monogramClassName="text-[#C49B74] font-serif-luxury text-base font-semibold"
                        />
                      </div>
                      <span className="block text-[9px] uppercase tracking-wider text-gray-400 mt-1">
                        Escuro
                      </span>
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="px-3 py-1.5 rounded-xs bg-white border border-gray-200 text-[11px] font-medium text-[#1A1A1A] hover:border-[#A67C52] cursor-pointer transition-colors flex items-center gap-1">
                        <ImageIcon className="w-3 h-3" />
                        {resolveClinicLogoUrl(formData.logoUrl) ? 'Trocar logo' : 'Enviar logo'}
                        <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                      </label>
                      {resolveClinicLogoUrl(formData.logoUrl) && (
                        <>
                          <button
                            type="button"
                            onClick={() => setLogoCropSource(formData.logoUrl || null)}
                            className="px-3 py-1.5 rounded-xs bg-white border border-gray-200 text-[11px] font-medium text-[#1A1A1A] hover:border-[#A67C52] transition-colors flex items-center gap-1"
                          >
                            <Crop className="w-3 h-3" />
                            Ajustar enquadramento
                          </button>
                          <button
                            type="button"
                            onClick={() => handleChange('logoUrl', '')}
                            className="text-[11px] text-red-500 hover:text-red-700 font-medium"
                          >
                            Remover
                          </button>
                        </>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-500 leading-relaxed mt-2">
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
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-1 border-b border-white/60">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-[#A67C52] flex items-center gap-1.5">
                <Stethoscope className="w-3.5 h-3.5" />
                Corpo Clínico & Médicas Cadastradas ({formData.professionals.length})
              </h3>
              {!showDoctorForm && (
                <button
                  type="button"
                  onClick={handleStartAddDoctor}
                  className="px-2.5 py-1 rounded-xs bg-[#A67C52] text-white text-[10px] uppercase tracking-wider font-semibold hover:bg-[#8e6945] flex items-center gap-1 transition-all"
                >
                  <Plus className="w-3 h-3" />
                  Adicionar Médica / Dra.
                </button>
              )}
            </div>

            {/* Doctor Add/Edit Form Box */}
            {showDoctorForm && (
              <div className="p-4 rounded-sm bg-white/80 backdrop-blur-md border border-[#A67C52]/40 shadow-xs space-y-3 animate-fadeIn">
                <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                  <span className="text-xs font-bold text-[#1A1A1A] uppercase tracking-wider">
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
                    <label className="block text-[11px] font-medium text-gray-700 mb-1">
                      Foto da Médica (usada na capa do catálogo em PDF)
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="px-3 py-1.5 rounded-xs bg-white border border-gray-200 text-[11px] font-medium text-[#1A1A1A] hover:border-[#A67C52] cursor-pointer transition-colors">
                        Escolher Arquivo
                        <input type="file" accept="image/*" onChange={handleDoctorPhotoUpload} className="hidden" />
                      </label>
                      {docPhotoUrl && (
                        <button
                          type="button"
                          onClick={() => setPhotoCropSource(docPhotoUrl)}
                          className="px-3 py-1.5 rounded-xs bg-white border border-gray-200 text-[11px] font-medium text-[#1A1A1A] hover:border-[#A67C52] transition-colors flex items-center gap-1"
                        >
                          <Crop className="w-3 h-3" />
                          Ajustar enquadramento
                        </button>
                      )}
                      {docPhotoUrl && (
                        <button
                          type="button"
                          onClick={() => setDocPhotoUrl('')}
                          className="text-[11px] text-red-500 hover:text-red-700 font-medium"
                        >
                          Remover
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-gray-700 mb-1">
                      Nome da Profissional (Ex: Dra. Marcella Ribeiro) *
                    </label>
                    <input
                      type="text"
                      value={docName}
                      onChange={(e) => setDocName(e.target.value)}
                      placeholder="Dra. Nome Completo"
                      className="w-full px-3 py-1.5 rounded-xs bg-white border border-gray-200 text-xs font-medium text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-gray-700 mb-1">
                      Registro Profissional (CRM / CRBM / COREN)
                    </label>
                    <input
                      type="text"
                      value={docRegistry}
                      onChange={(e) => setDocRegistry(e.target.value)}
                      placeholder="CRBM 28.450 ou CRM 184.920"
                      className="w-full px-3 py-1.5 rounded-xs bg-white border border-gray-200 text-xs font-medium text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-medium text-gray-700 mb-1">
                      Título / Especialidade
                    </label>
                    <input
                      type="text"
                      value={docTitle}
                      onChange={(e) => setDocTitle(e.target.value)}
                      placeholder="Ex: Biomédica Esteta / Dermatologista / Harmonização Facial"
                      className="w-full px-3 py-1.5 rounded-xs bg-white border border-gray-200 text-xs font-medium text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-medium text-gray-700 mb-1 flex items-center gap-1">
                      <Mail className="w-3 h-3" />
                      E-mail de login (usado para criar o acesso ao painel)
                    </label>
                    <input
                      type="email"
                      value={docEmail}
                      onChange={(e) => setDocEmail(e.target.value)}
                      placeholder="profissional@lavieclinique.com"
                      className="w-full px-3 py-1.5 rounded-xs bg-white border border-gray-200 text-xs font-medium text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
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
                    className="px-4 py-1.5 rounded-xs bg-[#1A1A1A] text-white text-xs font-medium uppercase tracking-wider hover:bg-[#333333]"
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
                  className="flex items-center justify-between p-3 rounded-xs bg-white/60 backdrop-blur-xs border border-white/80 hover:border-[#A67C52]/30 transition-all"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-[#1A1A1A] text-[#C49B74] flex items-center justify-center text-xs font-bold font-serif-luxury shadow-xs overflow-hidden shrink-0">
                      {doc.photoUrl ? (
                        <img src={doc.photoUrl} alt={doc.name} className="w-full h-full object-cover" />
                      ) : (
                        doc.name.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || 'DR'
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs font-semibold text-[#1A1A1A]">{doc.name}</p>
                        {doc.registryNumber && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded-xs bg-[#A67C52]/15 text-[#A67C52] font-semibold">
                            {doc.registryNumber}
                          </span>
                        )}
                        {doc.isAdmin && (
                          <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.2 rounded-xs bg-[#1A1A1A] text-[#C49B74] font-semibold">
                            <ShieldCheck className="w-2.5 h-2.5" /> Admin
                          </span>
                        )}
                        {doc.uid ? (
                          <span className="text-[10px] px-1.5 py-0.2 rounded-xs bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                            Login ativo
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.2 rounded-xs bg-gray-100 text-gray-500 font-medium">
                            Sem login
                          </span>
                        )}
                      </div>
                      {doc.title && (
                        <p className="text-[11px] text-gray-500 font-light line-clamp-1">{doc.title}</p>
                      )}
                    </div>
                  </div>

                  {deletingDocId === doc.id ? (
                    <div className="flex items-center gap-1.5 animate-fadeIn shrink-0">
                      <span className="text-[11px] text-red-600 font-medium mr-1">Excluir?</span>
                      <button
                        type="button"
                        onClick={() => handleDeleteDoctor(doc.id)}
                        className="px-2 py-1 bg-red-600 text-white rounded-xs text-[10px] font-bold uppercase tracking-wider hover:bg-red-700 shadow-xs"
                      >
                        Sim
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingDocId(null)}
                        className="px-2 py-1 bg-gray-200 text-gray-700 rounded-xs text-[10px] font-medium hover:bg-gray-300"
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
                          className="p-1.5 rounded-xs text-gray-400 hover:text-[#A67C52] hover:bg-white transition-colors disabled:opacity-50"
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
                              ? 'text-[#A67C52] hover:text-gray-400 hover:bg-white'
                              : 'text-gray-400 hover:text-[#A67C52] hover:bg-white'
                          }`}
                          title={doc.isAdmin ? 'Remover admin' : 'Tornar admin'}
                        >
                          {doc.isAdmin ? <ShieldCheck className="w-3.5 h-3.5" /> : <Shield className="w-3.5 h-3.5" />}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleStartEditDoctor(doc)}
                        className="p-1.5 rounded-xs text-gray-400 hover:text-[#1A1A1A] hover:bg-white transition-colors"
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
            <p className="text-[11px] text-gray-500 italic">
              * Ao cadastrar um procedimento, você poderá selecionar qual ou quais médicas são responsáveis pelo atendimento.
            </p>
          </div>

          {/* Contact & Location (Editable for Footer & PDF) */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-[#A67C52] flex items-center gap-1.5 pb-1 border-b border-white/60">
              <Phone className="w-3.5 h-3.5" />
              Canais de Contato & Localização (Exibidos no Rodapé e PDF)
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#1A1A1A] mb-1">
                  WhatsApp / Telefone para Agendamentos *
                </label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  placeholder="(19) 99876-5432"
                  className="w-full px-3.5 py-2 rounded-sm bg-white/70 backdrop-blur-xs border border-white/80 text-xs font-medium text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1A1A1A] mb-1">
                  Instagram (@perfil)
                </label>
                <input
                  type="text"
                  value={formData.instagram}
                  onChange={(e) => handleChange('instagram', e.target.value)}
                  placeholder="@lavieclinique.indaiatuba"
                  className="w-full px-3.5 py-2 rounded-sm bg-white/70 backdrop-blur-xs border border-white/80 text-xs font-medium text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1A1A1A] mb-1">
                  Endereço do Consultório
                </label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => handleChange('address', e.target.value)}
                  placeholder="Av. Pres. Vargas, 1400 - Sala 82, Jardim Vitória"
                  className="w-full px-3.5 py-2 rounded-sm bg-white/70 backdrop-blur-xs border border-white/80 text-xs font-medium text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1A1A1A] mb-1">
                  Cidade / UF
                </label>
                <input
                  type="text"
                  value={formData.cityState}
                  onChange={(e) => handleChange('cityState', e.target.value)}
                  placeholder="Indaiatuba - SP"
                  className="w-full px-3.5 py-2 rounded-sm bg-white/70 backdrop-blur-xs border border-white/80 text-xs font-medium text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                />
              </div>
            </div>
          </div>

          {/* Catalog notes */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-[#A67C52] flex items-center gap-1.5 pb-1 border-b border-white/60">
              <Sparkles className="w-3.5 h-3.5" />
              Mensagens do Catálogo & PDF
            </h3>

            <div>
              <label className="block text-xs font-medium text-[#1A1A1A] mb-1">
                Mensagem de Boas-Vindas no Topo do Catálogo
              </label>
              <textarea
                rows={2}
                value={formData.catalogWelcomeNote || ''}
                onChange={(e) => handleChange('catalogWelcomeNote', e.target.value)}
                className="w-full px-3.5 py-2 rounded-sm bg-white/70 backdrop-blur-xs border border-white/80 text-xs font-medium text-[#1A1A1A]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#1A1A1A] mb-1">
                Nota de Rodapé (Condições / Aviso de Avaliação)
              </label>
              <input
                type="text"
                value={formData.consultationNote || ''}
                onChange={(e) => handleChange('consultationNote', e.target.value)}
                className="w-full px-3.5 py-2 rounded-sm bg-white/70 backdrop-blur-xs border border-white/80 text-xs font-medium text-[#1A1A1A]"
              />
            </div>
          </div>

          {/* Footer actions */}
          <div className="pt-4 border-t border-white/60 flex items-center justify-end gap-3 sticky bottom-0 bg-[#F9F8F6]/95 backdrop-blur-md py-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-sm border border-white/80 text-xs font-semibold uppercase tracking-wider text-gray-600 hover:bg-white"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-sm bg-[#A67C52] text-white text-xs font-semibold uppercase tracking-widest shadow-xs hover:bg-[#8e6945] active:scale-95 transition-all flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              Salvar Informações
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

import React, { useState } from 'react';
import { buildPublicLink } from '../../utils/publicLinks';
import { AnamnesisTemplate, Patient, ClinicProfile } from '../../types';
import {
  X,
  Share2,
  Copy,
  Check,
  MessageCircle,
  ExternalLink,
  Eye,
  Camera,
  Sparkles,
  User,
  ShieldCheck,
  QrCode,
} from 'lucide-react';

interface ShareAnamnesisLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  templates: AnamnesisTemplate[];
  patients?: Patient[];
  clinicProfile: ClinicProfile;
  initialTemplateId?: string;
  initialPatientId?: string;
  /** Avisa quem abriu que o link chegou ao paciente (copiado ou mandado no WhatsApp). */
  onShared?: () => void;
}

export const ShareAnamnesisLinkModal: React.FC<ShareAnamnesisLinkModalProps> = ({
  isOpen,
  onClose,
  templates,
  patients = [],
  clinicProfile,
  initialTemplateId,
  initialPatientId,
  onShared,
}) => {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    initialTemplateId || (templates[0]?.id || '')
  );
  const [selectedPatientId, setSelectedPatientId] = useState<string>(initialPatientId || '');
  const [selectedProfessionalId, setSelectedProfessionalId] = useState<string>('');
  const [isCopied, setIsCopied] = useState(false);
  const [customPhone, setCustomPhone] = useState<string>('');

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) || templates[0];

  // As fotos por gênero substituíram a foto única `fotoModeloUrl`, mas este resumo continuava
  // olhando só para o campo legado — modelos configurados com as versões feminina/masculina
  // apareciam aqui como "sem foto cadastrada", e os que ainda carregam uma URL legada morta
  // mostravam "Foto Anexada" com a miniatura quebrada ao lado.
  const fotoReferenciaUrl =
    selectedTemplate?.fotoModeloFemininoUrl ||
    selectedTemplate?.fotoModeloMasculinoUrl ||
    selectedTemplate?.fotoModeloUrl;
  const selectedPatient = patients.find((p) => p.id === selectedPatientId);
  const canShare = !!selectedProfessionalId;

  // Compute public link — base vem do perfil da clínica, não da janela (ver utils/publicLinks.ts)
  const shareableUrl = buildPublicLink(clinicProfile, {
    anamnese: selectedTemplate?.id || '',
    paciente: selectedPatientId,
    profissional: selectedProfessionalId,
  });

  // WhatsApp formatted message
  const targetPhone = selectedPatient?.contato
    ? selectedPatient.contato.replace(/\D/g, '')
    : customPhone.replace(/\D/g, '');

  const patientGreeting = selectedPatient ? `Olá, ${selectedPatient.nome.split(' ')[0]}!` : 'Olá!';
  const whatsappMessage = `${patientGreeting} Segue o link da sua Ficha de Anamnese oficial da *${
    clinicProfile.name || 'La Vie Clinique'
  }* para o procedimento *${selectedTemplate?.procedimentoNome || 'Avaliação Estética'}*:\n\n🔗 ${shareableUrl}\n\nPor favor, preencha as respostas e, como combinamos, faça o envio de uma foto sua nítida da região para que a ${
    clinicProfile.professionalName || 'Dra. Karoline Ferreira'
  } realize o planejamento estético e anotações personalizadas na sua imagem.\n\nQualquer dúvida estamos à disposição!`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareableUrl);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);
    onShared?.();
  };

  const handleOpenWhatsApp = () => {
    const encodedText = encodeURIComponent(whatsappMessage);
    const waUrl = targetPhone
      ? `https://wa.me/${targetPhone.startsWith('55') ? targetPhone : `55${targetPhone}`}?text=${encodedText}`
      : `https://wa.me/?text=${encodedText}`;
    window.open(waUrl, '_blank');
    onShared?.();
  };

  const handlePreviewAsPatient = () => {
    window.open(shareableUrl, '_blank');
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3 sm:p-6 animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-xl bg-white rounded-2xl border border-white/80 shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[90vh]">
        {/* Header (fixo no topo) */}
        <div className="px-5 sm:px-6 py-3.5 sm:py-4 bg-ink text-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-brand-light shrink-0" />
            <div className="min-w-0">
              <h3 className="font-serif-luxury text-base sm:text-lg font-medium tracking-tight truncate">
                Compartilhar Ficha de Anamnese Online
              </h3>
              <p className="text-body text-gray-400 truncate">
                Gere o link para o cliente preencher antes do atendimento
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content (rola livremente no celular e PC) */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-4 sm:space-y-5 text-ink">
          {/* Template Selector */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wider">
              Procedimento / Ficha-Modelo
            </label>
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-sm bg-gray-50 border border-gray-200 text-ink focus:outline-hidden focus:border-brand font-medium"
            >
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.procedimentoNome} ({tpl.categoria || 'Geral'})
                </option>
              ))}
            </select>
          </div>

          {/* Photo presence summary */}
          <div className="p-3 bg-surface rounded-sm border border-gray-200/80 text-xs flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-brand/10 text-brand flex items-center justify-center shrink-0 mt-0.5">
              <Camera className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <span className="font-bold text-ink block">
                {fotoReferenciaUrl
                  ? 'Foto do Doutor Anexada no Início do Formulário'
                  : 'Nenhuma foto do doutor cadastrada neste modelo'}
              </span>
              <p className="text-body text-gray-500 mt-0.5 leading-relaxed">
                {fotoReferenciaUrl
                  ? 'O cliente verá sua foto/mapa de referência no topo do formulário e terá o campo para enviar a foto dele opcionalmente.'
                  : 'Dica: Você pode anexar uma foto ou mapa anatômico editando este modelo na aba "(2) Fichas por Procedimento".'}
              </p>
            </div>
            {fotoReferenciaUrl && (
              <img
                src={fotoReferenciaUrl}
                alt="Foto do doutor"
                // Uma URL legada que saiu do ar não deve deixar um ícone de imagem quebrada no lugar
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
                className="w-12 h-12 object-cover rounded-xs border border-gray-300 shrink-0"
              />
            )}
          </div>

          {/* Optional Patient Target */}
          {patients.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Vincular a Paciente Já Cadastrado (Opcional)
                </label>
                <span className="text-label text-gray-400">Preenche o nome automaticamente</span>
              </div>
              <select
                value={selectedPatientId}
                onChange={(e) => {
                  setSelectedPatientId(e.target.value);
                  const p = patients.find((pat) => pat.id === e.target.value);
                  if (p?.contato) setCustomPhone(p.contato);
                }}
                className="w-full px-3 py-2 text-xs rounded-sm bg-gray-50 border border-gray-200 text-ink focus:outline-hidden focus:border-brand"
              >
                <option value="">Nenhum (Qualquer paciente novo pode preencher)</option>
                {patients.map((pat) => (
                  <option key={pat.id} value={pat.id}>
                    {pat.nome} {pat.contato ? `(${pat.contato})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Phone for WhatsApp if no patient selected */}
          {!selectedPatient && (
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wider">
                WhatsApp do Paciente (Opcional)
              </label>
              <input
                type="text"
                value={customPhone}
                onChange={(e) => setCustomPhone(e.target.value)}
                placeholder="Ex: (11) 98765-4321"
                className="w-full px-3 py-2 text-xs rounded-sm bg-gray-50 border border-gray-200 text-ink focus:outline-hidden focus:border-brand"
              />
            </div>
          )}

          {/* Responsible Professional Selector */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wider">
              Profissional Responsável *
            </label>
            <select
              value={selectedProfessionalId}
              onChange={(e) => setSelectedProfessionalId(e.target.value)}
              className={`w-full px-3 py-2 text-xs rounded-sm bg-gray-50 border ${
                canShare ? 'border-gray-200' : 'border-amber-300'
              } text-ink focus:outline-hidden focus:border-brand font-medium`}
            >
              <option value="">-- Selecione o profissional --</option>
              {clinicProfile.professionals?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {!canShare && (
              <p className="text-label text-amber-600 mt-1">
                Selecione o profissional responsável para gerar e enviar o link.
              </p>
            )}
          </div>

          {/* Generated URL Box */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wider">
              Link Direto do Formulário do Paciente
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={shareableUrl}
                className="w-full px-3 py-2 text-xs rounded-sm bg-gray-100 border border-gray-200 text-gray-700 font-mono select-all focus:outline-hidden"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                disabled={!canShare}
                className="flex items-center gap-1.5 px-3 py-2 rounded-sm bg-ink text-brand-light hover:bg-black text-xs font-semibold uppercase tracking-wider shrink-0 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-ink"
              >
                {isCopied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    Copiado!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copiar
                  </>
                )}
              </button>
            </div>
          </div>

          {/* WhatsApp Message Preview */}
          <div className="bg-ok-bg/60 border border-emerald-200 rounded-sm p-3.5 text-xs text-[#064E3B] space-y-2">
            <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-label text-emerald-800">
              <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
              Mensagem Pronta para WhatsApp
            </div>
            <p className="text-body leading-relaxed whitespace-pre-line text-emerald-950/80 bg-white/70 p-2.5 rounded-xs border border-emerald-100 font-sans">
              {whatsappMessage}
            </p>
          </div>
        </div>

        {/* Action Buttons Footer (fixo no rodapé) */}
        <div className="p-3 sm:p-4 bg-surface border-t border-gray-200/80 shrink-0 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <button
            type="button"
            onClick={handlePreviewAsPatient}
            disabled={!canShare}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-gray-300 text-gray-800 hover:border-brand text-xs font-semibold tracking-wide transition-all shadow-2xs active:scale-97 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Eye className="w-4 h-4 text-brand" />
            Visualizar como Paciente
          </button>

          <button
            type="button"
            onClick={handleOpenWhatsApp}
            disabled={!canShare}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-whatsapp text-white hover:bg-whatsapp text-xs font-bold uppercase tracking-wider shadow-xs transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <MessageCircle className="w-4 h-4" />
            Enviar pelo WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
};

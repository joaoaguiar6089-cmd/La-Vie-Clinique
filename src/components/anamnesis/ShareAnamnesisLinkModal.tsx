import React, { useState } from 'react';
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
  onOpenPatientView?: (templateId: string, patientId?: string) => void;
}

export const ShareAnamnesisLinkModal: React.FC<ShareAnamnesisLinkModalProps> = ({
  isOpen,
  onClose,
  templates,
  patients = [],
  clinicProfile,
  initialTemplateId,
  initialPatientId,
  onOpenPatientView,
}) => {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    initialTemplateId || (templates[0]?.id || '')
  );
  const [selectedPatientId, setSelectedPatientId] = useState<string>(initialPatientId || '');
  const [isCopied, setIsCopied] = useState(false);
  const [customPhone, setCustomPhone] = useState<string>('');

  if (!isOpen) return null;

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) || templates[0];
  const selectedPatient = patients.find((p) => p.id === selectedPatientId);

  // Compute public link
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
  const patientParam = selectedPatientId ? `&paciente=${encodeURIComponent(selectedPatientId)}` : '';
  const shareableUrl = `${origin}${pathname}?anamnese=${encodeURIComponent(selectedTemplate?.id || '')}${patientParam}`;

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
  };

  const handleOpenWhatsApp = () => {
    const encodedText = encodeURIComponent(whatsappMessage);
    const waUrl = targetPhone
      ? `https://wa.me/${targetPhone.startsWith('55') ? targetPhone : `55${targetPhone}`}?text=${encodedText}`
      : `https://wa.me/?text=${encodedText}`;
    window.open(waUrl, '_blank');
  };

  const handlePreviewAsPatient = () => {
    if (onOpenPatientView && selectedTemplate) {
      onOpenPatientView(selectedTemplate.id, selectedPatientId || undefined);
    } else {
      window.open(shareableUrl, '_blank');
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-fadeIn">
      <div className="relative w-full max-w-xl bg-white rounded-sm border border-white/80 shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-[#1A1A1A] text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#C49B74]" />
            <div>
              <h3 className="font-serif-luxury text-lg font-medium tracking-tight">
                Compartilhar Ficha de Anamnese Online
              </h3>
              <p className="text-[11px] text-gray-400">
                Gere o link para o cliente preencher antes do atendimento e enviar a foto dele
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-xs text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 text-[#1A1A1A]">
          {/* Template Selector */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wider">
              Procedimento / Ficha-Modelo
            </label>
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-sm bg-gray-50 border border-gray-200 text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52] font-medium"
            >
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.procedimentoNome} ({tpl.categoria || 'Geral'})
                </option>
              ))}
            </select>
          </div>

          {/* Photo presence summary */}
          <div className="p-3 bg-[#FAF9F6] rounded-sm border border-gray-200/80 text-xs flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-[#A67C52]/10 text-[#A67C52] flex items-center justify-center shrink-0 mt-0.5">
              <Camera className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <span className="font-bold text-[#1A1A1A] block">
                {selectedTemplate?.fotoModeloUrl
                  ? 'Foto do Doutor Anexada no Início do Formulário'
                  : 'Nenhuma foto do doutor cadastrada neste modelo'}
              </span>
              <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">
                {selectedTemplate?.fotoModeloUrl
                  ? 'O cliente verá sua foto/mapa de referência no topo do formulário e terá o campo para enviar a foto dele opcionalmente.'
                  : 'Dica: Você pode anexar uma foto ou mapa anatômico editando este modelo na aba "(2) Fichas por Procedimento".'}
              </p>
            </div>
            {selectedTemplate?.fotoModeloUrl && (
              <img
                src={selectedTemplate.fotoModeloUrl}
                alt="Foto do doutor"
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
                <span className="text-[10px] text-gray-400">Preenche o nome automaticamente</span>
              </div>
              <select
                value={selectedPatientId}
                onChange={(e) => {
                  setSelectedPatientId(e.target.value);
                  const p = patients.find((pat) => pat.id === e.target.value);
                  if (p?.contato) setCustomPhone(p.contato);
                }}
                className="w-full px-3 py-2 text-xs rounded-sm bg-gray-50 border border-gray-200 text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
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
                className="w-full px-3 py-2 text-xs rounded-sm bg-gray-50 border border-gray-200 text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
              />
            </div>
          )}

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
                className="flex items-center gap-1.5 px-3 py-2 rounded-sm bg-[#1A1A1A] text-[#C49B74] hover:bg-black text-xs font-semibold uppercase tracking-wider shrink-0 transition-all active:scale-95"
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
          <div className="bg-[#E7F8ED]/60 border border-emerald-200 rounded-sm p-3.5 text-xs text-[#064E3B] space-y-2">
            <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[10px] text-emerald-800">
              <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
              Mensagem Pronta para WhatsApp
            </div>
            <p className="text-[11px] leading-relaxed whitespace-pre-line text-emerald-950/80 bg-white/70 p-2.5 rounded-xs border border-emerald-100 font-sans">
              {whatsappMessage}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
            <button
              type="button"
              onClick={handlePreviewAsPatient}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-sm bg-white border border-gray-300 text-gray-800 hover:border-[#A67C52] text-xs font-semibold tracking-wide transition-all shadow-2xs"
            >
              <Eye className="w-4 h-4 text-[#A67C52]" />
              Visualizar como Paciente
            </button>

            <button
              type="button"
              onClick={handleOpenWhatsApp}
              className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-sm bg-[#25D366] text-white hover:bg-[#20ba59] text-xs font-bold uppercase tracking-wider shadow-xs transition-all active:scale-95"
            >
              <MessageCircle className="w-4 h-4" />
              Enviar pelo WhatsApp
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

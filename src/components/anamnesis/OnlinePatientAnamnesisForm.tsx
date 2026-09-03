import React, { useState, useEffect } from 'react';
import {
  AnamnesisTemplate,
  AnamnesisQuestion,
  ClinicProfile,
  Patient,
  AnamnesisRecord,
} from '../../types';
import { downscaleImage } from '../../utils/imageCompressor';
import { QuestionFieldRenderer } from './QuestionFieldRenderer';
import { PrintableAnamnesisSheet } from './PrintableAnamnesisSheet';
import {
  Sparkles,
  Camera,
  Upload,
  CheckCircle2,
  AlertCircle,
  MessageCircle,
  FileText,
  ShieldCheck,
  User,
  Calendar,
  Phone,
  Mail,
  Music,
  Printer,
  ChevronRight,
  ArrowLeft,
  X,
} from 'lucide-react';

interface OnlinePatientAnamnesisFormProps {
  template: AnamnesisTemplate;
  generalQuestions: AnamnesisQuestion[];
  clinicProfile: ClinicProfile;
  initialPatient?: Patient | null;
  onSaveRecord: (record: AnamnesisRecord) => Promise<void>;
  onSavePatient: (patient: Patient) => Promise<void>;
  onBackToDashboard?: () => void;
  isStandalonePublic?: boolean;
}

export const OnlinePatientAnamnesisForm: React.FC<OnlinePatientAnamnesisFormProps> = ({
  template,
  generalQuestions,
  clinicProfile,
  initialPatient,
  onSaveRecord,
  onSavePatient,
  onBackToDashboard,
  isStandalonePublic = false,
}) => {
  // Patient fields
  const [nome, setNome] = useState(initialPatient?.nome || '');
  const [contato, setContato] = useState(initialPatient?.contato || '');
  const [dataNascimento, setDataNascimento] = useState(initialPatient?.dataNascimento || '');
  const [email, setEmail] = useState(initialPatient?.email || '');
  const [tipoMusica, setTipoMusica] = useState(
    (initialPatient as any)?.tipoMusica || ''
  );

  // Answers maps
  const [respostasGerais, setRespostasGerais] = useState<Record<string, any>>({});
  const [respostasEspecificas, setRespostasEspecificas] = useState<Record<string, any>>({});

  // Patient's uploaded photo (Optional)
  const [fotoPacienteUrl, setFotoPacienteUrl] = useState<string>('');
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);

  // Consent checkbox
  const [termoAceito, setTermoAceito] = useState(false);

  // Status & submitted record
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedRecord, setSubmittedRecord] = useState<AnamnesisRecord | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);

  // Helper to identify questions that shouldn't be duplicated
  const isDuplicateIdentQuestion = (q: AnamnesisQuestion): boolean => {
    const idLower = q.id.toLowerCase();
    const textLower = q.texto.toLowerCase();
    return (
      idLower === 'gen-nome' ||
      idLower === 'gen-nascimento' ||
      idLower === 'gen-whatsapp' ||
      idLower === 'gen-contato' ||
      idLower === 'gen-telefone' ||
      idLower === 'gen-musica' ||
      textLower.includes('nome completo') ||
      textLower.includes('qual seu nome') ||
      textLower === 'data de nascimento' ||
      textLower.includes('música') ||
      textLower.includes('musica')
    );
  };

  // Additional general questions configured on platform (excluding native fields)
  const extraGeneralQuestions = generalQuestions.filter((q) => !isDuplicateIdentQuestion(q));

  // Pre-fill general questions if initialPatient has data
  useEffect(() => {
    if (initialPatient) {
      setNome(initialPatient.nome);
      if (initialPatient.contato) setContato(initialPatient.contato);
      if (initialPatient.dataNascimento) setDataNascimento(initialPatient.dataNascimento);
      if (initialPatient.email) setEmail(initialPatient.email);

      setRespostasGerais((prev) => {
        const updated = { ...prev };
        generalQuestions.forEach((q) => {
          if (q.id === 'gen-musica' || q.texto.toLowerCase().includes('música') || q.texto.toLowerCase().includes('musica')) {
            if ((initialPatient as any).tipoMusica) {
              updated[q.id] = (initialPatient as any).tipoMusica;
              setTipoMusica((initialPatient as any).tipoMusica);
            }
          }
        });
        return updated;
      });
    }
  }, [initialPatient, generalQuestions]);

  const handleGeneralAnswerChange = (questionId: string, value: any) => {
    setRespostasGerais((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleSpecificAnswerChange = (questionId: string, value: any) => {
    setRespostasEspecificas((prev) => ({ ...prev, [questionId]: value }));
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessingPhoto(true);
    try {
      const compressed = await downscaleImage(file, 1200, 0.82);
      setFotoPacienteUrl(compressed);
    } catch (err) {
      console.error(err);
      alert('Não foi possível processar a imagem selecionada. Tente outra foto.');
    } finally {
      setIsProcessingPhoto(false);
      e.target.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const patientNameToSave = nome.trim() || 'Paciente (Preenchimento Online)';
      const patientId = initialPatient?.id || `pat-${Date.now()}`;
      const patientDoc: Patient = {
        id: patientId,
        nome: patientNameToSave,
        contato: contato.trim(),
        dataNascimento: dataNascimento,
        email: email.trim() || undefined,
        createdAt: initialPatient?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await onSavePatient(patientDoc);

      const finalRespostasGerais: Record<string, any> = {
        ...respostasGerais,
        'gen-musica': tipoMusica.trim(),
      };

      const recordId = `rec-${Date.now()}`;
      const newRecord: AnamnesisRecord = {
        id: recordId,
        pacienteId: patientDoc.id,
        pacienteNome: patientDoc.nome,
        pacienteContato: patientDoc.contato,
        pacienteDataNascimento: patientDoc.dataNascimento,
        procedimentoId: template.procedimentoId,
        procedimentoNome: template.procedimentoNome,
        dataAtendimento: new Date().toISOString().split('T')[0],
        profissionalNome: clinicProfile.professionalName || 'Dra. Karoline Ferreira',
        respostasGerais: finalRespostasGerais,
        respostasEspecificas,
        fotoModeloUrl: template.fotoModeloUrl,
        fotoPacienteUrl: fotoPacienteUrl || undefined,
        fotoUrl: fotoPacienteUrl || undefined,
        perguntasSnapshot: {
          gerais: [
            {
              id: 'gen-musica',
              texto: 'Qual tipo de música você gosta?',
              tipo_campo: 'texto_curto',
              obrigatoria: false,
              ordem: 1,
            },
            ...extraGeneralQuestions,
          ],
          especificas: template.perguntasEspecificas || [],
        },
        observacoesFinais: 'Ficha preenchida online previamente pelo(a) paciente via link compartilhado.',
        origemPreenchimento: 'online_paciente',
        createdAt: new Date().toISOString(),
      };

      await onSaveRecord(newRecord);
      setSubmittedRecord(newRecord);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      console.error('Erro ao enviar anamnese:', err);
      alert('Ocorreu um erro ao enviar sua ficha. Por favor, tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // WhatsApp confirmation url for patient
  const clinicPhoneDigits = clinicProfile.phone?.replace(/\D/g, '') || '';
  const waConfirmText = encodeURIComponent(
    `Olá Dra. Karoline / ${clinicProfile.name || 'La Vie Clinique'}! Acabei de preencher minha Ficha de Anamnese online para o procedimento *${
      template.procedimentoNome
    }*.\n\n👤 Paciente: *${nome}*\n📅 Data: ${new Date().toLocaleDateString('pt-BR')}\n\nJá enviei minhas respostas e foto para seu planejamento. Até breve!`
  );
  const waConfirmUrl = clinicPhoneDigits
    ? `https://wa.me/${clinicPhoneDigits.startsWith('55') ? clinicPhoneDigits : `55${clinicPhoneDigits}`}?text=${waConfirmText}`
    : `https://wa.me/?text=${waConfirmText}`;

  // SUCCESS CONFIRMATION VIEW
  if (submittedRecord) {
    return (
      <div className="min-h-screen bg-[#FDFBF7] py-8 sm:py-16 px-4">
        <div className="max-w-2xl mx-auto bg-white rounded-sm border border-gray-200/80 shadow-xl overflow-hidden animate-fadeIn">
          {/* Top Banner */}
          <div className="bg-[#1A1A1A] p-8 text-center text-white relative">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-400/40 mx-auto flex items-center justify-center mb-4 shadow-lg">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <span className="text-[10px] font-mono tracking-widest uppercase text-[#C49B74] block font-bold mb-1">
              {clinicProfile.name || 'LA VIE CLINIQUE'}
            </span>
            <h2 className="font-serif-luxury text-2xl sm:text-3xl font-bold tracking-tight">
              Ficha de Anamnese Enviada!
            </h2>
            <p className="text-xs sm:text-sm text-gray-300 mt-2 max-w-md mx-auto leading-relaxed">
              Obrigado, <strong className="text-white">{nome}</strong>. Suas informações e fotos foram registradas
              com segurança no prontuário digital da clínica.
            </p>
          </div>

          {/* Details & WhatsApp Action */}
          <div className="p-6 sm:p-8 space-y-6">
            <div className="bg-[#FAF9F6] border border-gray-200 rounded-sm p-4 text-xs space-y-2">
              <div className="flex justify-between border-b border-gray-200/60 pb-2">
                <span className="text-gray-500">Procedimento:</span>
                <span className="font-bold text-[#1A1A1A]">{template.procedimentoNome}</span>
              </div>
              <div className="flex justify-between border-b border-gray-200/60 pb-2">
                <span className="text-gray-500">Profissional Responsável:</span>
                <span className="font-medium text-[#1A1A1A]">
                  {clinicProfile.professionalName || 'Dra. Karoline Ferreira'}
                </span>
              </div>
              <div className="flex justify-between border-b border-gray-200/60 pb-2">
                <span className="text-gray-500">Foto do Paciente:</span>
                <span className="font-semibold text-emerald-700">
                  {fotoPacienteUrl ? 'Anexada com sucesso' : 'Não enviada'}
                </span>
              </div>
              <div className="flex justify-between pt-1">
                <span className="text-gray-500">Protocolo Digital:</span>
                <span className="font-mono text-gray-700 font-bold">
                  #{submittedRecord.id.slice(-8).toUpperCase()}
                </span>
              </div>
            </div>

            {/* Crucial: WhatsApp button requested by user */}
            <div className="bg-[#E7F8ED] border border-emerald-300/80 rounded-sm p-5 text-center space-y-3">
              <div className="flex items-center justify-center gap-2 text-emerald-950 font-bold text-sm">
                <MessageCircle className="w-5 h-5 text-emerald-600" />
                Avisar o Doutor / Clínica pelo WhatsApp
              </div>
              <p className="text-xs text-emerald-900/80 max-w-md mx-auto leading-relaxed">
                Clique no botão abaixo para nos enviar uma mensagem de confirmação instantânea no WhatsApp informando que
                seu formulário foi preenchido.
              </p>
              <a
                href={waConfirmUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3 rounded-sm bg-[#25D366] text-white hover:bg-[#20ba59] font-bold text-xs uppercase tracking-wider shadow-md active:scale-95 transition-all"
              >
                <MessageCircle className="w-4 h-4" />
                Enviar Confirmação pelo WhatsApp
              </a>
            </div>

            {/* Option to view/print PDF */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setShowPrintModal(true)}
                className="flex items-center gap-2 text-xs text-[#A67C52] hover:text-[#8e6945] font-semibold transition-colors"
              >
                <Printer className="w-4 h-4" />
                Visualizar / Imprimir Cópia da Ficha
              </button>

              {!isStandalonePublic && onBackToDashboard && (
                <button
                  type="button"
                  onClick={onBackToDashboard}
                  className="text-xs text-gray-500 hover:text-gray-800 underline transition-colors"
                >
                  Voltar ao Painel da Clínica
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Printable modal if clicked */}
        {showPrintModal && (
          <PrintableAnamnesisSheet
            record={submittedRecord}
            clinicProfile={clinicProfile}
            onClose={() => setShowPrintModal(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6] py-6 sm:py-12 px-3 sm:px-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Navigation back for admin if logged in and not standalone public */}
        {!isStandalonePublic && onBackToDashboard && (
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onBackToDashboard}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xs bg-white border border-gray-200 text-xs font-semibold text-gray-600 hover:text-[#1A1A1A] transition-all shadow-2xs"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Voltar ao Painel da Clínica
            </button>
            <span className="text-[11px] font-mono text-gray-400">
              Modo: Pré-visualização do Paciente
            </span>
          </div>
        )}

        {/* Top Header Card */}
        <div className="bg-white rounded-sm border border-gray-200/80 shadow-xs p-6 sm:p-8 text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#1A1A1A] text-[#C49B74] text-[10px] font-mono uppercase tracking-widest font-bold">
            <Sparkles className="w-3 h-3" />
            {clinicProfile.name || 'LA VIE CLINIQUE'}
          </div>

          <h1 className="font-serif-luxury text-2xl sm:text-3xl font-bold text-[#1A1A1A] tracking-tight">
            Ficha de Anamnese & Avaliação Clínica
          </h1>

          <div className="inline-block px-4 py-1.5 rounded-sm bg-[#A67C52]/10 border border-[#A67C52]/20">
            <span className="text-xs sm:text-sm font-serif-luxury font-bold text-[#A67C52]">
              {template.procedimentoNome}
            </span>
          </div>

          <p className="text-xs sm:text-sm text-gray-600 max-w-xl mx-auto leading-relaxed pt-1">
            Por favor, preencha as questões abaixo com atenção antes da sua sessão. O registro prévio garante total
            segurança médica, personalização dos parâmetros e o melhor resultado para o seu atendimento.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* ============================================================ */}
          {/* DOCTOR'S PHOTO & PATIENT'S OPTIONAL PHOTO UPLOAD SECTION     */}
          {/* (As specifically requested by user)                          */}
          {/* ============================================================ */}
          <div className="bg-white rounded-sm border border-gray-200/80 shadow-xs p-5 sm:p-6 space-y-5">
            <div className="border-b border-gray-100 pb-3">
              <span className="text-[10px] uppercase font-bold tracking-widest text-[#A67C52] block">
                Planejamento Clínico & Mapeamento
              </span>
              <h3 className="font-serif-luxury text-base sm:text-lg font-bold text-[#1A1A1A] mt-0.5">
                Fotos de Referência e Mapeamento
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* 1. FOTO DO DOUTOR (Uploaded in template editor) */}
              <div className="bg-[#FAF9F6] border border-gray-200 rounded-sm p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-2 h-2 rounded-full bg-[#1A1A1A]" />
                    <span className="text-xs font-bold text-[#1A1A1A]">
                      Referência da Clínica / Dra. Karoline
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 leading-snug mb-3">
                    {template.fotoModeloUrl
                      ? 'Guia técnico e mapa de referência clínica cadastrado pela profissional responsável para este procedimento.'
                      : 'Nenhuma imagem de guia técnico foi cadastrada para este modelo.'}
                  </p>
                </div>

                <div className="w-full h-56 sm:h-64 rounded-sm border border-gray-300/80 overflow-hidden bg-white flex items-center justify-center shadow-2xs">
                  {template.fotoModeloUrl ? (
                    <img
                      src={template.fotoModeloUrl}
                      alt="Referência clínica do doutor"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="text-center p-4 text-gray-400">
                      <Camera className="w-8 h-8 mx-auto stroke-1 mb-1 text-gray-300" />
                      <span className="text-xs font-medium block">Sem foto cadastrada pelo doutor</span>
                      <span className="text-[10px] text-gray-400">
                        O doutor pode fazer upload no editor do modelo
                      </span>
                    </div>
                  )}
                </div>

                <div className="mt-2 text-[10px] text-gray-400 text-center italic">
                  Utilizada para orientar anotações de dosagem, vetores e pontos de aplicação.
                </div>
              </div>

              {/* 2. FOTO DO PACIENTE (Envio pelo cliente) */}
              <div className="bg-[#FAF9F6] border border-[#A67C52]/30 rounded-sm p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#A67C52]" />
                      <span className="text-xs font-bold text-[#1A1A1A]">
                        Foto do Paciente
                      </span>
                    </div>
                  </div>

                  <p className="text-[11px] text-gray-600 leading-relaxed mb-3">
                    Conforme combinamos previamente via <strong>WhatsApp</strong>, faça o envio de uma foto nítida do seu
                    rosto ou da região a ser tratada. Assim, a ficha fica personalizada e a Dra. poderá fazer anotações
                    diretamente sobre a sua foto.
                  </p>
                </div>

                {fotoPacienteUrl ? (
                  <div className="space-y-3">
                    <div className="relative w-full h-56 sm:h-64 rounded-sm border-2 border-emerald-500/60 overflow-hidden bg-black/5 shadow-xs">
                      <img
                        src={fotoPacienteUrl}
                        alt="Foto enviada pelo paciente"
                        className="w-full h-full object-contain"
                      />
                      <button
                        type="button"
                        onClick={() => setFotoPacienteUrl('')}
                        className="absolute top-2 right-2 p-1.5 rounded-full bg-black/70 hover:bg-black text-white transition-all shadow-md"
                        title="Remover foto"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Sua foto foi anexada com sucesso
                      </span>
                      <label className="cursor-pointer text-[11px] font-semibold text-[#A67C52] hover:underline">
                        Trocar foto
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handlePhotoUpload}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>
                ) : (
                  <label className="cursor-pointer flex flex-col items-center justify-center p-6 sm:p-8 border-2 border-dashed border-[#A67C52]/40 hover:border-[#A67C52] rounded-sm bg-white hover:bg-[#FAF9F6] transition-all text-center group h-56 sm:h-64">
                    <div className="w-12 h-12 rounded-full bg-[#A67C52]/10 text-[#A67C52] flex items-center justify-center group-hover:scale-105 transition-transform mb-2 shadow-2xs">
                      <Camera className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-bold text-[#1A1A1A] group-hover:text-[#A67C52] transition-colors">
                      {isProcessingPhoto ? 'Processando imagem...' : 'Tirar foto ou escolher da galeria'}
                    </span>
                    <span className="text-[11px] text-gray-500 mt-1 max-w-xs leading-snug">
                      Envie uma foto frontal com boa iluminação da área a ser tratada.
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      disabled={isProcessingPhoto}
                      className="hidden"
                    />
                  </label>
                )}

                <div className="mt-2 text-[10px] text-gray-400 text-center italic">
                  Ambiente seguro e protegido pelas normas médicas de sigilo e LGPD.
                </div>
              </div>
            </div>
          </div>

          {/* ============================================================ */}
          {/* IDENTIFICAÇÃO DO PACIENTE (Com Perguntas Gerais Integradas)   */}
          {/* Sem título "Perguntas Gerais", sem a palavra "Opcional"      */}
          {/* Contém: Nome, WhatsApp, Data de Nascimento e Tipo de Música   */}
          {/* ============================================================ */}
          <div className="bg-white rounded-sm border border-gray-200/80 shadow-xs p-5 sm:p-6 space-y-4">
            <div className="border-b border-gray-100 pb-3">
              <span className="text-[10px] uppercase font-bold tracking-widest text-[#A67C52] block">
                Ficha Clínica
              </span>
              <h3 className="font-serif-luxury text-base sm:text-lg font-bold text-[#1A1A1A]">
                Identificação do Paciente
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* 1. NOME COMPLETO */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-800 mb-1">
                  Nome Completo
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="Seu nome completo"
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-sm bg-[#FAF9F6] border border-gray-200 text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                  />
                </div>
              </div>

              {/* 2. WHATSAPP */}
              <div>
                <label className="block text-xs font-semibold text-gray-800 mb-1">
                  WhatsApp / Celular
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={contato}
                    onChange={(e) => setContato(e.target.value)}
                    placeholder="(DDD) 99999-9999"
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-sm bg-[#FAF9F6] border border-gray-200 text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                  />
                </div>
              </div>

              {/* 3. DATA DE NASCIMENTO */}
              <div>
                <label className="block text-xs font-semibold text-gray-800 mb-1">
                  Data de Nascimento
                </label>
                <div className="relative">
                  <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="date"
                    value={dataNascimento}
                    onChange={(e) => setDataNascimento(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-sm bg-[#FAF9F6] border border-gray-200 text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                  />
                </div>
              </div>

              {/* 4. TIPO DA MÚSICA */}
              <div>
                <label className="block text-xs font-semibold text-gray-800 mb-1 flex items-center gap-1.5">
                  <Music className="w-3.5 h-3.5 text-[#A67C52]" />
                  Tipo de Música
                </label>
                <input
                  type="text"
                  value={tipoMusica}
                  onChange={(e) => {
                    setTipoMusica(e.target.value);
                    setRespostasGerais((prev) => ({ ...prev, 'gen-musica': e.target.value }));
                  }}
                  placeholder="Ex: MPB, Jazz, Pop, Lounge, Clássica, Instrumental..."
                  className="w-full px-3 py-2 text-xs rounded-sm bg-[#FAF9F6] border border-gray-200 text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                />
              </div>

              {/* 5. E-MAIL */}
              <div>
                <label className="block text-xs font-semibold text-gray-800 mb-1">
                  E-mail
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu.email@exemplo.com"
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-sm bg-[#FAF9F6] border border-gray-200 text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                  />
                </div>
              </div>

              {/* OUTRAS PERGUNTAS GERAIS CONFIGURADAS NA PLATAFORMA (Se houver) */}
              {extraGeneralQuestions.length > 0 && (
                <div className="sm:col-span-2 pt-2 space-y-3 divide-y divide-gray-100">
                  {extraGeneralQuestions.map((q) => (
                    <div key={q.id} className="pt-3 first:pt-0">
                      <QuestionFieldRenderer
                        question={q}
                        value={respostasGerais[q.id]}
                        onChange={(val) => handleGeneralAnswerChange(q.id, val)}
                        hideMandatoryAsterisk={true}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ============================================================ */}
          {/* SECTION: AVALIAÇÃO ESPECÍFICA DO PROCEDIMENTO                */}
          {/* ============================================================ */}
          {template.perguntasEspecificas.length > 0 && (
            <div className="bg-white rounded-sm border border-gray-200/80 shadow-xs p-5 sm:p-6 space-y-4">
              <div className="border-b border-gray-100 pb-3">
                <span className="text-[10px] uppercase font-bold tracking-widest text-[#A67C52] block">
                  Avaliação Específica
                </span>
                <h3 className="font-serif-luxury text-base sm:text-lg font-bold text-[#1A1A1A]">
                  Avaliação para {template.procedimentoNome}
                </h3>
                {template.descricao && (
                  <p className="text-xs text-gray-500 mt-1">{template.descricao}</p>
                )}
              </div>

              <div className="space-y-4 divide-y divide-gray-100">
                {template.perguntasEspecificas.map((q) => (
                  <div key={q.id} className="pt-3 first:pt-0">
                    <QuestionFieldRenderer
                      question={q}
                      value={respostasEspecificas[q.id]}
                      onChange={(val) => handleSpecificAnswerChange(q.id, val)}
                      hideMandatoryAsterisk={true}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* SECTION: DECLARAÇÃO DE VERACIDADE E CONSENTIMENTO           */}
          {/* ============================================================ */}
          <div className="bg-white rounded-sm border border-gray-200/80 shadow-xs p-5 sm:p-6 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#1A1A1A]">
              <ShieldCheck className="w-4 h-4 text-[#A67C52]" />
              Declaração de Veracidade e Consentimento
            </div>

            <p className="text-xs text-gray-500 leading-relaxed text-justify">
              Declaro que todas as informações prestadas nesta ficha de anamnese são verdadeiras e completas, não tendo
              omitido nenhum dado relevante sobre histórico de saúde, uso de medicamentos, alergias ou procedimentos
              anteriores. Autorizo a clínica La Vie a utilizar essas informações estritamente para fins de planejamento e
              execução do meu tratamento estético.
            </p>

            <label className="flex items-start gap-3 p-3 rounded-sm bg-[#FAF9F6] border border-gray-200 cursor-pointer hover:bg-white transition-colors">
              <input
                type="checkbox"
                checked={termoAceito}
                onChange={(e) => setTermoAceito(e.target.checked)}
                className="accent-[#A67C52] w-4 h-4 mt-0.5 rounded-xs"
              />
              <span className="text-xs font-medium text-[#1A1A1A] leading-snug">
                Li, compreendi e concordo com os termos acima, confirmando a veracidade de todas as minhas respostas.
              </span>
            </label>
          </div>

          {/* Error Banner if any */}
          {Object.keys(errors).length > 0 && (
            <div className="p-4 rounded-sm bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Por favor, verifique os campos obrigatórios destacados acima antes de enviar.</span>
            </div>
          )}

          {/* SUBMIT BUTTON */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-sm bg-[#1A1A1A] text-[#C49B74] hover:bg-black text-xs font-bold uppercase tracking-widest transition-all shadow-md active:scale-98 disabled:opacity-50"
            >
              {isSubmitting ? (
                <span>Enviando Ficha de Anamnese...</span>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Finalizar e Enviar Ficha de Anamnese</span>
                </>
              )}
            </button>
            <p className="text-[11px] text-gray-400 text-center mt-2">
              Após o envio, você poderá notificar a clínica pelo WhatsApp com um clique.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};

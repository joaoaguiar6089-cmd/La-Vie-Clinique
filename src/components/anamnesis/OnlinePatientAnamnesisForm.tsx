import React, { useState } from 'react';
import {
  AnamnesisTemplate,
  AnamnesisQuestion,
  ClinicProfile,
  Patient,
  PatientGender,
  AnamnesisRecord,
} from '../../types';
import { downscaleImage } from '../../utils/imageCompressor';
import { resolveTemplatePhoto } from '../../utils/genderPhoto';
import { QuestionFieldRenderer } from './QuestionFieldRenderer';
import {
  Sparkles,
  Camera,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  User,
  Calendar,
  Phone,
  Mail,
  Music,
  X,
} from 'lucide-react';

interface OnlinePatientAnamnesisFormProps {
  template: AnamnesisTemplate;
  generalQuestions: AnamnesisQuestion[];
  clinicProfile: ClinicProfile;
  initialPatient?: Patient | null;
  /** When set, the form edits this existing record in place instead of creating a new one. */
  existingRecord?: AnamnesisRecord | null;
  /** Only applied when existingRecord is not set — pre-fills general answers from the patient's most recent prior ficha. */
  prefillRespostasGerais?: Record<string, any>;
  onSaveRecord: (record: AnamnesisRecord) => Promise<void>;
  onSavePatient: (patient: Patient) => Promise<void>;
  onSaved: (record: AnamnesisRecord) => void;
}

// Helper to identify identification questions already covered by the dedicated fields below
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

const isPatientQuestion = (q: AnamnesisQuestion): boolean => (q.publicoAlvo || 'paciente') !== 'medico';

const isAnswerEmpty = (v: any): boolean =>
  v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

export const OnlinePatientAnamnesisForm: React.FC<OnlinePatientAnamnesisFormProps> = ({
  template,
  generalQuestions,
  clinicProfile,
  initialPatient,
  existingRecord,
  prefillRespostasGerais,
  onSaveRecord,
  onSavePatient,
  onSaved,
}) => {
  // Every general question minus the ones already covered by dedicated identification fields
  const nonIdentGeneralQuestions = generalQuestions.filter((q) => !isDuplicateIdentQuestion(q));
  // Only the subset the CLIENT should see/answer (médico-only questions never reach this form)
  const patientGeneralQuestions = nonIdentGeneralQuestions.filter(isPatientQuestion);
  const patientSpecificQuestions = (template.perguntasEspecificas || []).filter(isPatientQuestion);

  const isEditing = !!existingRecord;

  // Patient identification fields
  const [nome, setNome] = useState(existingRecord?.pacienteNome || initialPatient?.nome || '');
  const [contato, setContato] = useState(existingRecord?.pacienteContato || initialPatient?.contato || '');
  const [dataNascimento, setDataNascimento] = useState(
    existingRecord?.pacienteDataNascimento || initialPatient?.dataNascimento || ''
  );
  const [genero, setGenero] = useState<PatientGender | ''>(
    existingRecord?.pacienteGenero || initialPatient?.genero || ''
  );
  const [email, setEmail] = useState(initialPatient?.email || '');
  const [tipoMusica, setTipoMusica] = useState(
    existingRecord?.respostasGerais?.['gen-musica'] ||
      prefillRespostasGerais?.['gen-musica'] ||
      (initialPatient as any)?.tipoMusica ||
      ''
  );

  // Answers maps
  const [respostasGerais, setRespostasGerais] = useState<Record<string, any>>(() =>
    existingRecord ? { ...existingRecord.respostasGerais } : { ...(prefillRespostasGerais || {}) }
  );
  const [respostasEspecificas, setRespostasEspecificas] = useState<Record<string, any>>(
    () => (existingRecord ? { ...existingRecord.respostasEspecificas } : {})
  );

  // Patient's uploaded photo (optional)
  const [fotoPacienteUrl, setFotoPacienteUrl] = useState<string>(existingRecord?.fotoPacienteUrl || '');
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);

  // Consent checkbox — already implicitly given on a prior save
  const [termoAceito, setTermoAceito] = useState(isEditing);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const handleGeneralAnswerChange = (questionId: string, value: any) => {
    setRespostasGerais((prev) => ({ ...prev, [questionId]: value }));
    setErrors((prev) => {
      if (!prev[questionId]) return prev;
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
  };

  const handleSpecificAnswerChange = (questionId: string, value: any) => {
    setRespostasEspecificas((prev) => ({ ...prev, [questionId]: value }));
    setErrors((prev) => {
      if (!prev[questionId]) return prev;
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
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

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!nome.trim()) {
      newErrors['nome'] = 'Informe seu nome completo.';
    }
    if (!genero) {
      newErrors['genero'] = 'Selecione uma opção.';
    }
    patientGeneralQuestions.forEach((q) => {
      if (q.obrigatoria && isAnswerEmpty(respostasGerais[q.id])) {
        newErrors[q.id] = 'Esta pergunta é obrigatória.';
      }
    });
    patientSpecificQuestions.forEach((q) => {
      if (q.obrigatoria && isAnswerEmpty(respostasEspecificas[q.id])) {
        newErrors[q.id] = 'Esta pergunta é obrigatória.';
      }
    });
    if (!termoAceito) {
      newErrors['termo'] = 'É necessário aceitar os termos para enviar a ficha.';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setIsSubmitting(true);
    try {
      const patientId = existingRecord?.pacienteId || initialPatient?.id || `pat-${Date.now()}`;
      const patientDoc: Patient = {
        id: patientId,
        nome: nome.trim(),
        contato: contato.trim() || undefined,
        dataNascimento: dataNascimento || undefined,
        genero: genero || undefined,
        email: email.trim() || undefined,
        createdAt: initialPatient?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await onSavePatient(patientDoc);

      const finalRespostasGerais: Record<string, any> = {
        ...respostasGerais,
        'gen-musica': tipoMusica.trim(),
      };

      const recordId = existingRecord?.id || `rec-${Date.now()}`;
      // Uma vez que o profissional já anotou a foto, mantemos a referência original para não
      // perder a anotação — a foto só é re-resolvida pelo gênero enquanto ainda não há anotação.
      const resolvedFotoModelo = existingRecord?.fotoModeloAnotadaUrl
        ? existingRecord.fotoModeloUrl
        : resolveTemplatePhoto(template, patientDoc.genero);
      const record: AnamnesisRecord = {
        id: recordId,
        pacienteId: patientDoc.id,
        pacienteNome: patientDoc.nome,
        pacienteContato: patientDoc.contato,
        pacienteDataNascimento: patientDoc.dataNascimento,
        pacienteGenero: patientDoc.genero,
        procedimentoId: template.procedimentoId,
        templateId: template.id,
        procedimentoNome: template.procedimentoNome,
        dataAtendimento: existingRecord?.dataAtendimento || new Date().toISOString().split('T')[0],
        profissionalNome:
          existingRecord?.profissionalNome ||
          clinicProfile.professionals?.[0]?.name ||
          clinicProfile.professionalName ||
          'Equipe La Vie',
        respostasGerais: finalRespostasGerais,
        respostasEspecificas,
        respostasProfissional: existingRecord?.respostasProfissional,
        profissionalPreenchidoEm: existingRecord?.profissionalPreenchidoEm,
        fotoModeloUrl: resolvedFotoModelo,
        fotoModeloAnotadaUrl: existingRecord?.fotoModeloAnotadaUrl,
        fotoModeloAnotacoesJson: existingRecord?.fotoModeloAnotacoesJson,
        fotoPacienteUrl: fotoPacienteUrl || undefined,
        fotoUrl: fotoPacienteUrl || undefined,
        perguntasSnapshot: existingRecord?.perguntasSnapshot || {
          gerais: [
            {
              id: 'gen-musica',
              texto: 'Qual tipo de música você gosta?',
              tipo_campo: 'texto_curto',
              obrigatoria: false,
              ordem: 1,
              publicoAlvo: 'paciente',
            },
            ...nonIdentGeneralQuestions,
          ],
          especificas: template.perguntasEspecificas || [],
        },
        observacoesFinais:
          existingRecord?.observacoesFinais ||
          'Ficha preenchida online previamente pelo(a) paciente via link compartilhado.',
        origemPreenchimento: 'online_paciente',
        createdAt: existingRecord?.createdAt || new Date().toISOString(),
      };

      await onSaveRecord(record);

      if (isEditing) {
        setJustSaved(true);
        setTimeout(() => setJustSaved(false), 3000);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      onSaved(record);
    } catch (err) {
      console.error('Erro ao enviar anamnese:', err);
      alert('Ocorreu um erro ao enviar sua ficha. Por favor, tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const previewFotoModelo = resolveTemplatePhoto(template, genero || undefined);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {justSaved && (
        <div className="flex items-center gap-2 p-3.5 rounded-sm bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          Alterações salvas com sucesso.
        </div>
      )}

      {/* Top Header Card */}
      <div className="bg-white rounded-sm border border-gray-200/80 shadow-xs p-6 sm:p-8 text-center space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#1A1A1A] text-[#C49B74] text-[10px] font-mono uppercase tracking-widest font-bold">
          <Sparkles className="w-3 h-3" />
          {clinicProfile.name || 'LA VIE CLINIQUE'}
        </div>

        <h1 className="font-serif-luxury text-2xl sm:text-3xl font-bold text-[#1A1A1A] tracking-tight">
          {isEditing ? 'Editar sua Ficha de Anamnese' : 'Ficha de Anamnese & Avaliação Clínica'}
        </h1>

        <div className="inline-block px-4 py-1.5 rounded-sm bg-[#A67C52]/10 border border-[#A67C52]/20">
          <span className="text-xs sm:text-sm font-serif-luxury font-bold text-[#A67C52]">
            {template.procedimentoNome}
          </span>
        </div>

        <p className="text-xs sm:text-sm text-gray-600 max-w-xl mx-auto leading-relaxed pt-1">
          {isEditing
            ? 'Você pode revisar e corrigir suas respostas livremente até que a profissional responsável complemente sua ficha na plataforma.'
            : 'Por favor, preencha as questões abaixo com atenção antes da sua sessão. O registro prévio garante total segurança médica, personalização dos parâmetros e o melhor resultado para o seu atendimento.'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* PHOTOS SECTION */}
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
            {/* Doctor's reference photo */}
            <div className="bg-[#FAF9F6] border border-gray-200 rounded-sm p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-[#1A1A1A]" />
                  <span className="text-xs font-bold text-[#1A1A1A]">Referência da Clínica</span>
                </div>
                <p className="text-[11px] text-gray-500 leading-snug mb-3">
                  {previewFotoModelo
                    ? 'Guia técnico e mapa de referência clínica cadastrado pela profissional responsável para este procedimento.'
                    : genero
                    ? 'Nenhuma imagem de guia técnico foi cadastrada para este modelo.'
                    : 'Selecione seu gênero abaixo para ver a foto de referência correspondente.'}
                </p>
              </div>

              <div className="w-full h-56 sm:h-64 rounded-sm border border-gray-300/80 overflow-hidden bg-white flex items-center justify-center shadow-2xs">
                {previewFotoModelo ? (
                  <img
                    src={previewFotoModelo}
                    alt="Referência clínica do doutor"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="text-center p-4 text-gray-400">
                    <Camera className="w-8 h-8 mx-auto stroke-1 mb-1 text-gray-300" />
                    <span className="text-xs font-medium block">Sem foto cadastrada</span>
                  </div>
                )}
              </div>
            </div>

            {/* Patient's optional photo upload */}
            <div className="bg-[#FAF9F6] border border-[#A67C52]/30 rounded-sm p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-[#A67C52]" />
                  <span className="text-xs font-bold text-[#1A1A1A]">Foto do Paciente</span>
                </div>
                <p className="text-[11px] text-gray-600 leading-relaxed mb-3">
                  Se combinado previamente com a clínica, envie uma foto nítida do seu rosto ou da região a ser
                  tratada para personalizar sua ficha.
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
                      Sua foto foi anexada
                    </span>
                    <label className="cursor-pointer text-[11px] font-semibold text-[#A67C52] hover:underline">
                      Trocar foto
                      <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
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
                    Envie uma foto frontal com boa iluminação da área a ser tratada (opcional).
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
            </div>
          </div>
        </div>

        {/* IDENTIFICATION SECTION */}
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
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-gray-800 mb-1">Nome Completo *</label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={nome}
                  onChange={(e) => {
                    setNome(e.target.value);
                    if (errors['nome']) setErrors((prev) => ({ ...prev, nome: '' }));
                  }}
                  placeholder="Seu nome completo"
                  className={`w-full pl-9 pr-3 py-2 text-xs rounded-sm bg-[#FAF9F6] border text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52] ${
                    errors['nome'] ? 'border-red-400' : 'border-gray-200'
                  }`}
                />
              </div>
              {errors['nome'] && <p className="text-[10px] text-red-500 font-medium mt-1">{errors['nome']}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-800 mb-1">WhatsApp / Celular</label>
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

            <div>
              <label className="block text-xs font-semibold text-gray-800 mb-1">Data de Nascimento</label>
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

            <div>
              <label className="block text-xs font-semibold text-gray-800 mb-1">
                Gênero * <span className="text-[10px] text-gray-400 font-normal">(define a foto de referência)</span>
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setGenero('feminino');
                    if (errors['genero']) setErrors((prev) => ({ ...prev, genero: '' }));
                  }}
                  className={`flex-1 py-2 px-3 rounded-sm text-xs font-semibold uppercase tracking-wider transition-all border ${
                    genero === 'feminino'
                      ? 'bg-[#1A1A1A] text-white border-[#1A1A1A] shadow-xs'
                      : `bg-white/80 text-gray-700 hover:bg-white ${errors['genero'] ? 'border-red-400' : 'border-gray-200'}`
                  }`}
                >
                  Feminino
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setGenero('masculino');
                    if (errors['genero']) setErrors((prev) => ({ ...prev, genero: '' }));
                  }}
                  className={`flex-1 py-2 px-3 rounded-sm text-xs font-semibold uppercase tracking-wider transition-all border ${
                    genero === 'masculino'
                      ? 'bg-[#A67C52] text-white border-[#A67C52] shadow-xs'
                      : `bg-white/80 text-gray-700 hover:bg-white ${errors['genero'] ? 'border-red-400' : 'border-gray-200'}`
                  }`}
                >
                  Masculino
                </button>
              </div>
              {errors['genero'] && <p className="text-[10px] text-red-500 font-medium mt-1">{errors['genero']}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-800 mb-1 flex items-center gap-1.5">
                <Music className="w-3.5 h-3.5 text-[#A67C52]" />
                Tipo de Música
              </label>
              <input
                type="text"
                value={tipoMusica}
                onChange={(e) => setTipoMusica(e.target.value)}
                placeholder="Ex: MPB, Jazz, Pop, Lounge, Clássica, Instrumental..."
                className="w-full px-3 py-2 text-xs rounded-sm bg-[#FAF9F6] border border-gray-200 text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-800 mb-1">E-mail</label>
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

            {patientGeneralQuestions.length > 0 && (
              <div className="sm:col-span-2 pt-2 space-y-3 divide-y divide-gray-100">
                {patientGeneralQuestions.map((q) => (
                  <div key={q.id} className="pt-3 first:pt-0">
                    <QuestionFieldRenderer
                      question={q}
                      value={respostasGerais[q.id]}
                      onChange={(val) => handleGeneralAnswerChange(q.id, val)}
                      error={errors[q.id]}
                      hideMandatoryAsterisk={false}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* SPECIFIC QUESTIONS SECTION */}
        {patientSpecificQuestions.length > 0 && (
          <div className="bg-white rounded-sm border border-gray-200/80 shadow-xs p-5 sm:p-6 space-y-4">
            <div className="border-b border-gray-100 pb-3">
              <span className="text-[10px] uppercase font-bold tracking-widest text-[#A67C52] block">
                Avaliação Específica
              </span>
              <h3 className="font-serif-luxury text-base sm:text-lg font-bold text-[#1A1A1A]">
                Avaliação para {template.procedimentoNome}
              </h3>
              {template.descricao && <p className="text-xs text-gray-500 mt-1">{template.descricao}</p>}
            </div>

            <div className="space-y-4 divide-y divide-gray-100">
              {patientSpecificQuestions.map((q) => (
                <div key={q.id} className="pt-3 first:pt-0">
                  <QuestionFieldRenderer
                    question={q}
                    value={respostasEspecificas[q.id]}
                    onChange={(val) => handleSpecificAnswerChange(q.id, val)}
                    error={errors[q.id]}
                    hideMandatoryAsterisk={false}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CONSENT SECTION */}
        <div className="bg-white rounded-sm border border-gray-200/80 shadow-xs p-5 sm:p-6 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#1A1A1A]">
            <ShieldCheck className="w-4 h-4 text-[#A67C52]" />
            Declaração de Veracidade e Consentimento
          </div>

          <p className="text-xs text-gray-500 leading-relaxed text-justify">
            Declaro que todas as informações prestadas nesta ficha de anamnese são verdadeiras e completas, não
            tendo omitido nenhum dado relevante sobre histórico de saúde, uso de medicamentos, alergias ou
            procedimentos anteriores. Autorizo a clínica a utilizar essas informações estritamente para fins de
            planejamento e execução do meu tratamento estético.
          </p>

          <label
            className={`flex items-start gap-3 p-3 rounded-sm bg-[#FAF9F6] border cursor-pointer hover:bg-white transition-colors ${
              errors['termo'] ? 'border-red-400' : 'border-gray-200'
            }`}
          >
            <input
              type="checkbox"
              checked={termoAceito}
              onChange={(e) => {
                setTermoAceito(e.target.checked);
                if (errors['termo']) setErrors((prev) => ({ ...prev, termo: '' }));
              }}
              className="accent-[#A67C52] w-4 h-4 mt-0.5 rounded-xs"
            />
            <span className="text-xs font-medium text-[#1A1A1A] leading-snug">
              Li, compreendi e concordo com os termos acima, confirmando a veracidade de todas as minhas respostas.
            </span>
          </label>
          {errors['termo'] && <p className="text-[10px] text-red-500 font-medium">{errors['termo']}</p>}
        </div>

        {Object.keys(errors).length > 0 && (
          <div className="p-4 rounded-sm bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Por favor, verifique os campos obrigatórios destacados acima antes de enviar.</span>
          </div>
        )}

        <div className="pt-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-sm bg-[#1A1A1A] text-[#C49B74] hover:bg-black text-xs font-bold uppercase tracking-widest transition-all shadow-md active:scale-98 disabled:opacity-50"
          >
            {isSubmitting ? (
              <span>{isEditing ? 'Salvando Alterações...' : 'Enviando Ficha de Anamnese...'}</span>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>{isEditing ? 'Salvar Alterações' : 'Finalizar e Enviar Ficha de Anamnese'}</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

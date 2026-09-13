import React, { useRef, useState } from 'react';
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
import { ClinicLogo } from '../ClinicLogo';
import { QuestionFieldRenderer } from './QuestionFieldRenderer';
import {
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
  ArrowLeft,
  ArrowRight,
  IdCard,
} from 'lucide-react';

const formatCpf = (raw: string): string => {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
};

const isValidCpf = (raw: string): boolean => raw.replace(/\D/g, '').length === 11;

interface OnlinePatientAnamnesisFormProps {
  template: AnamnesisTemplate;
  generalQuestions: AnamnesisQuestion[];
  clinicProfile: ClinicProfile;
  initialPatient?: Patient | null;
  /** When set, the form edits this existing record in place instead of creating a new one. */
  existingRecord?: AnamnesisRecord | null;
  /** Only applied when existingRecord is not set — pre-fills general answers from the patient's most recent prior ficha. */
  prefillRespostasGerais?: Record<string, any>;
  /** ID of the professional assigned when the share link was generated (see ShareAnamnesisLinkModal). */
  professionalId?: string;
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

type Step = 'intro' | 1 | 2 | 3;

export const OnlinePatientAnamnesisForm: React.FC<OnlinePatientAnamnesisFormProps> = ({
  template,
  generalQuestions,
  clinicProfile,
  initialPatient,
  existingRecord,
  prefillRespostasGerais,
  professionalId,
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

  const resolvedProfessionalId = existingRecord?.professionalId || professionalId;
  const resolvedProfessionalName =
    clinicProfile.professionals?.find((p) => p.id === resolvedProfessionalId)?.name ||
    existingRecord?.profissionalNome;

  const [step, setStep] = useState<Step>(isEditing ? 1 : 'intro');
  const termoRef = useRef<HTMLLabelElement>(null);

  // Patient identification fields
  const [nome, setNome] = useState(existingRecord?.pacienteNome || initialPatient?.nome || '');
  const [contato, setContato] = useState(existingRecord?.pacienteContato || initialPatient?.contato || '');
  const [dataNascimento, setDataNascimento] = useState(
    existingRecord?.pacienteDataNascimento || initialPatient?.dataNascimento || ''
  );
  const [genero, setGenero] = useState<PatientGender | ''>(
    existingRecord?.pacienteGenero || initialPatient?.genero || ''
  );
  const [cpf, setCpf] = useState(initialPatient?.cpf || '');
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

  const clearError = (key: string) => {
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
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

  const goToStep = (next: Step) => {
    setStep(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const validateStep1 = (): boolean => {
    const stepErrors: Record<string, string> = {};
    if (!nome.trim()) stepErrors['nome'] = 'Informe seu nome completo.';
    if (!genero) stepErrors['genero'] = 'Selecione uma opção.';
    if (!isValidCpf(cpf)) stepErrors['cpf'] = 'Informe um CPF válido (11 dígitos).';
    patientGeneralQuestions.forEach((q) => {
      if (q.obrigatoria && isAnswerEmpty(respostasGerais[q.id])) {
        stepErrors[q.id] = 'Esta pergunta é obrigatória.';
      }
    });
    setErrors((prev) => ({ ...prev, ...stepErrors }));
    return Object.keys(stepErrors).length === 0;
  };

  const validateStep2 = (): boolean => {
    const stepErrors: Record<string, string> = {};
    patientSpecificQuestions.forEach((q) => {
      if (q.obrigatoria && isAnswerEmpty(respostasEspecificas[q.id])) {
        stepErrors[q.id] = 'Esta pergunta é obrigatória.';
      }
    });
    setErrors((prev) => ({ ...prev, ...stepErrors }));
    return Object.keys(stepErrors).length === 0;
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!nome.trim()) {
      newErrors['nome'] = 'Informe seu nome completo.';
    }
    if (!genero) {
      newErrors['genero'] = 'Selecione uma opção.';
    }
    if (!isValidCpf(cpf)) {
      newErrors['cpf'] = 'Informe um CPF válido (11 dígitos).';
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

  const handleContinueFromStep1 = () => {
    if (validateStep1()) goToStep(2);
  };

  const handleContinueFromStep2 = () => {
    if (validateStep2()) goToStep(3);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      if (errors['nome'] || errors['genero'] || errors['cpf'] || Object.keys(errors).some((k) => patientGeneralQuestions.some((q) => q.id === k))) {
        goToStep(1);
        return;
      }
      if (Object.keys(errors).some((k) => patientSpecificQuestions.some((q) => q.id === k))) {
        goToStep(2);
        return;
      }
      termoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
        cpf: cpf.replace(/\D/g, '') || undefined,
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
        professionalId: resolvedProfessionalId,
        profissionalNome:
          resolvedProfessionalName || clinicProfile.professionals?.[0]?.name || clinicProfile.professionalName,
        respostasGerais: finalRespostasGerais,
        respostasEspecificas,
        respostasProfissional: existingRecord?.respostasProfissional,
        profissionalPreenchidoEm: existingRecord?.profissionalPreenchidoEm,
        fotoModeloUrl: resolvedFotoModelo,
        fotoModeloAnotadaUrl: existingRecord?.fotoModeloAnotadaUrl,
        fotoModeloAnotacoesJson: existingRecord?.fotoModeloAnotacoesJson,
        fotoPacienteUrl: fotoPacienteUrl || undefined,
        fotoPacienteAnotadaUrl: existingRecord?.fotoPacienteAnotadaUrl,
        fotoPacienteAnotacoesJson: existingRecord?.fotoPacienteAnotacoesJson,
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

  const answeredSpecificCount = patientSpecificQuestions.filter((q) => !isAnswerEmpty(respostasEspecificas[q.id])).length;
  const answeredGeneralCount = patientGeneralQuestions.filter((q) => !isAnswerEmpty(respostasGerais[q.id])).length;
  const totalQuestions = patientSpecificQuestions.length + patientGeneralQuestions.length;
  const answeredQuestions = answeredSpecificCount + answeredGeneralCount;

  // ============================= INTRO =============================
  if (step === 'intro') {
    return (
      <div className="max-w-lg mx-auto">
        <div
          className="rounded-3xl overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #221A14 0%, #1A1410 50%, #120D0A 100%)' }}
        >
          <div className="px-6 sm:px-8 pt-10 pb-8 text-center">
            <ClinicLogo
              clinic={clinicProfile}
              className="w-14 h-14 rounded-2xl mx-auto mb-4"
              monogramClassName="bg-black/20 border border-[rgba(232,205,172,.35)] text-[#C49B74] font-serif-luxury text-2xl font-semibold"
            />
            <h1 className="font-serif-luxury text-[26px] font-medium text-[#F6EFE4]">
              {clinicProfile.name || 'La Vie Clinique'}
            </h1>
            <p className="text-[14px] text-[rgba(246,239,228,.6)] mt-2">
              Sua ficha de anamnese para o procedimento agendado.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-3xl -mt-6 relative shadow-[0_6px_22px_rgba(0,0,0,.06)] p-6 sm:p-7 space-y-5">
          <div>
            <span className="text-[13px] font-semibold text-[#A67C52]">Procedimento</span>
            <h2 className="font-serif-luxury text-[24px] font-semibold text-[#1A1A1A] leading-tight mt-0.5">
              {template.procedimentoNome}
            </h2>
            {template.categoria && <p className="text-[14px] text-[#8a8578] mt-1">{template.categoria}</p>}
          </div>

          <ol className="space-y-3">
            {[
              { n: 1, label: 'Seus dados', desc: 'Nome, contato e informações básicas.' },
              { n: 2, label: 'Saúde e histórico', desc: 'Perguntas específicas do procedimento.' },
              { n: 3, label: 'Confirmação', desc: 'Revise e envie sua ficha.' },
            ].map((s) => (
              <li key={s.n} className="flex items-start gap-3">
                <span className="w-7 h-7 rounded-full bg-[#F9F8F6] border border-[rgba(26,26,26,.1)] flex items-center justify-center text-[13px] font-bold text-[#A67C52] shrink-0">
                  {s.n}
                </span>
                <div>
                  <p className="text-[15px] font-semibold text-[#1A1A1A] leading-tight">{s.label}</p>
                  <p className="text-[13px] text-[#8a8578]">{s.desc}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="text-[13px] text-[#A67C52] font-medium pl-10 -mt-2">Leva cerca de 5 minutos</p>

          <div className="flex items-start gap-2.5 text-[13px] text-[#8a8578] bg-[#F9F8F6] p-3.5 rounded-2xl">
            <ShieldCheck className="w-4 h-4 text-[#A67C52] shrink-0 mt-0.5" />
            <span>Suas respostas são usadas exclusivamente pela equipe clínica para planejar seu atendimento com segurança.</span>
          </div>

          <button
            type="button"
            onClick={() => goToStep(1)}
            className="w-full h-[54px] rounded-2xl bg-[#A67C52] text-white text-[16px] font-semibold flex items-center justify-center gap-2 hover:bg-[#8E653D] active:scale-97 transition-all"
          >
            Começar
            <ArrowRight className="w-[18px] h-[18px]" />
          </button>
        </div>
      </div>
    );
  }

  // ============================= STEP SHELL (1/2/3) =============================
  const stepIndex = step as 1 | 2 | 3;

  return (
    <div className="max-w-lg mx-auto pb-28">
      {justSaved && (
        <div className="flex items-center gap-2 p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[13px] font-semibold mb-4 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          Alterações salvas com sucesso.
        </div>
      )}

      {/* Progress */}
      <div className="flex items-center gap-2 mb-5">
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className={`flex-1 h-1 rounded-full ${n <= stepIndex ? 'bg-[#A67C52]' : 'bg-[rgba(26,26,26,.1)]'}`}
          />
        ))}
        <span className="text-[13px] text-[#8a8578] font-medium ml-1 shrink-0">{stepIndex} de 3</span>
      </div>

      <form onSubmit={handleSubmit}>
        {/* ============ STEP 1 — Seus dados ============ */}
        {stepIndex === 1 && (
          <div className="space-y-4">
            <div>
              <h2 className="font-serif-luxury text-[26px] font-medium text-[#1A1A1A]">Seus dados</h2>
              {resolvedProfessionalName && (
                <p className="text-[13px] text-[#8a8578] mt-1">
                  Profissional responsável: <span className="font-semibold text-[#1A1A1A]">{resolvedProfessionalName}</span>
                </p>
              )}
            </div>

            <div className="bg-white rounded-2xl p-5 space-y-4 shadow-[0_3px_14px_rgba(0,0,0,.04)]">
              <div>
                <label className="block text-[15px] font-semibold text-[#1A1A1A] mb-1.5">Nome completo *</label>
                <div className="relative">
                  <User className="w-[18px] h-[18px] absolute left-4 top-1/2 -translate-y-1/2 text-[#a8a29a]" />
                  <input
                    type="text"
                    value={nome}
                    onChange={(e) => {
                      setNome(e.target.value);
                      if (errors['nome']) clearError('nome');
                    }}
                    placeholder="Seu nome completo"
                    className={`w-full h-[52px] pl-11 pr-4 text-[15px] rounded-[13px] bg-white border transition-colors ${
                      errors['nome'] ? 'border-[#E11D48]' : 'border-[rgba(26,26,26,.12)] focus:border-[#A67C52]'
                    } text-[#1A1A1A] focus:outline-hidden`}
                  />
                </div>
                {errors['nome'] && <p className="text-[13px] text-[#E11D48] font-medium mt-1">{errors['nome']}</p>}
              </div>

              <div>
                <label className="block text-[15px] font-semibold text-[#1A1A1A] mb-1.5">WhatsApp / celular</label>
                <div className="relative">
                  <Phone className="w-[18px] h-[18px] absolute left-4 top-1/2 -translate-y-1/2 text-[#a8a29a]" />
                  <input
                    type="text"
                    value={contato}
                    onChange={(e) => setContato(e.target.value)}
                    placeholder="(DDD) 99999-9999"
                    className="w-full h-[52px] pl-11 pr-4 text-[15px] rounded-[13px] bg-white border border-[rgba(26,26,26,.12)] text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[15px] font-semibold text-[#1A1A1A] mb-1.5">Data de nascimento</label>
                <div className="relative">
                  <Calendar className="w-[18px] h-[18px] absolute left-4 top-1/2 -translate-y-1/2 text-[#a8a29a]" />
                  <input
                    type="date"
                    value={dataNascimento}
                    onChange={(e) => setDataNascimento(e.target.value)}
                    className="w-full h-[52px] pl-11 pr-4 text-[15px] rounded-[13px] bg-white border border-[rgba(26,26,26,.12)] text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[15px] font-semibold text-[#1A1A1A] mb-1.5">
                  CPF * <span className="text-[13px] text-[#8a8578] font-normal">— usado para você acessar sua ficha depois</span>
                </label>
                <div className="relative">
                  <IdCard className="w-[18px] h-[18px] absolute left-4 top-1/2 -translate-y-1/2 text-[#a8a29a]" />
                  <input
                    type="text"
                    inputMode="numeric"
                    value={cpf}
                    onChange={(e) => {
                      setCpf(formatCpf(e.target.value));
                      if (errors['cpf']) clearError('cpf');
                    }}
                    placeholder="000.000.000-00"
                    className={`w-full h-[52px] pl-11 pr-4 text-[15px] rounded-[13px] bg-white border transition-colors ${
                      errors['cpf'] ? 'border-[#E11D48]' : 'border-[rgba(26,26,26,.12)] focus:border-[#A67C52]'
                    } text-[#1A1A1A] focus:outline-hidden`}
                  />
                </div>
                {errors['cpf'] && <p className="text-[13px] text-[#E11D48] font-medium mt-1">{errors['cpf']}</p>}
              </div>

              <div>
                <label className="block text-[15px] font-semibold text-[#1A1A1A] mb-1.5">E-mail</label>
                <div className="relative">
                  <Mail className="w-[18px] h-[18px] absolute left-4 top-1/2 -translate-y-1/2 text-[#a8a29a]" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu.email@exemplo.com"
                    className="w-full h-[52px] pl-11 pr-4 text-[15px] rounded-[13px] bg-white border border-[rgba(26,26,26,.12)] text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[15px] font-semibold text-[#1A1A1A] mb-1.5">
                  Gênero * <span className="text-[13px] text-[#8a8578] font-normal">— define a foto de referência usada na sua ficha</span>
                </label>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setGenero('feminino');
                      if (errors['genero']) clearError('genero');
                    }}
                    className={`flex-1 h-[52px] rounded-[13px] text-[15px] font-semibold transition-colors border flex items-center justify-center gap-2 ${
                      genero === 'feminino'
                        ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]'
                        : `bg-white text-[#4a4740] ${errors['genero'] ? 'border-[#E11D48]' : 'border-[rgba(26,26,26,.12)]'}`
                    }`}
                  >
                    {genero === 'feminino' && <CheckCircle2 className="w-4 h-4" />}
                    Feminino
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setGenero('masculino');
                      if (errors['genero']) clearError('genero');
                    }}
                    className={`flex-1 h-[52px] rounded-[13px] text-[15px] font-semibold transition-colors border flex items-center justify-center gap-2 ${
                      genero === 'masculino'
                        ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]'
                        : `bg-white text-[#4a4740] ${errors['genero'] ? 'border-[#E11D48]' : 'border-[rgba(26,26,26,.12)]'}`
                    }`}
                  >
                    {genero === 'masculino' && <CheckCircle2 className="w-4 h-4" />}
                    Masculino
                  </button>
                </div>
                {errors['genero'] && <p className="text-[13px] text-[#E11D48] font-medium mt-1">{errors['genero']}</p>}
              </div>

              <div>
                <label className="block text-[15px] font-semibold text-[#1A1A1A] mb-1.5 flex items-center gap-1.5">
                  <Music className="w-4 h-4 text-[#A67C52]" />
                  Tipo de música
                </label>
                <input
                  type="text"
                  value={tipoMusica}
                  onChange={(e) => setTipoMusica(e.target.value)}
                  placeholder="Ex: MPB, Jazz, Pop, Lounge, Clássica, Instrumental..."
                  className="w-full h-[52px] px-4 text-[15px] rounded-[13px] bg-white border border-[rgba(26,26,26,.12)] text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                />
              </div>

              {patientGeneralQuestions.length > 0 && (
                <div className="pt-2 space-y-4 divide-y divide-[rgba(26,26,26,.07)]">
                  {patientGeneralQuestions.map((q) => (
                    <div key={q.id} className="pt-4 first:pt-0">
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
        )}

        {/* ============ STEP 2 — Saúde e histórico ============ */}
        {stepIndex === 2 && (
          <div className="space-y-4">
            <div>
              <span className="text-[13px] font-semibold text-[#A67C52]">Avaliação do procedimento</span>
              <h2 className="font-serif-luxury text-[28px] font-medium text-[#1A1A1A] leading-tight mt-0.5">
                {template.procedimentoNome}
              </h2>
              {template.descricao && <p className="text-[14px] text-[#8a8578] mt-1">{template.descricao}</p>}
            </div>

            {patientSpecificQuestions.length > 0 && (
              <div className="bg-white rounded-2xl p-5 divide-y divide-[rgba(26,26,26,.07)] shadow-[0_3px_14px_rgba(0,0,0,.04)]">
                {patientSpecificQuestions.map((q) => (
                  <div key={q.id} className="pt-4 first:pt-0">
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
            )}

            {/* Patient photo upload */}
            <div className="bg-white rounded-2xl p-5 shadow-[0_3px_14px_rgba(0,0,0,.04)]">
              <label className="block text-[15px] font-semibold text-[#1A1A1A] mb-1">Foto do paciente</label>
              <p className="text-[13px] text-[#8a8578] mb-3">Opcional. Frontal, com boa iluminação.</p>

              {fotoPacienteUrl ? (
                <div className="space-y-3">
                  <div className="relative w-full h-[220px] rounded-2xl border border-[rgba(26,26,26,.1)] overflow-hidden bg-[#F9F8F6]">
                    <img src={fotoPacienteUrl} alt="Foto enviada pelo paciente" className="w-full h-full object-contain" />
                    <button
                      type="button"
                      onClick={() => setFotoPacienteUrl('')}
                      className="absolute top-2.5 right-2.5 w-9 h-9 rounded-full bg-black/70 hover:bg-black text-white flex items-center justify-center transition-colors"
                      title="Remover foto"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[13px] font-semibold text-emerald-700">
                      <CheckCircle2 className="w-4 h-4" />
                      Sua foto foi anexada
                    </span>
                    <label className="cursor-pointer text-[13px] font-semibold text-[#A67C52] hover:underline">
                      Trocar foto
                      <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                    </label>
                  </div>
                </div>
              ) : (
                <label
                  className="flex flex-col items-center justify-center h-32 rounded-2xl cursor-pointer text-center transition-colors"
                  style={{ border: '1.5px dashed rgba(166,124,82,.5)' }}
                >
                  <span className="w-12 h-12 rounded-full bg-[#A67C52] text-white flex items-center justify-center mb-2">
                    <Camera className="w-5 h-5" />
                  </span>
                  <span className="text-[15px] font-semibold text-[#8E653D]">
                    {isProcessingPhoto ? 'Processando imagem...' : 'Tirar foto ou escolher da galeria'}
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
        )}

        {/* ============ STEP 3 — Confirmação ============ */}
        {stepIndex === 3 && (
          <div className="space-y-4">
            <h2 className="font-serif-luxury text-[26px] font-medium text-[#1A1A1A]">Confirmação</h2>

            <div className="bg-white rounded-2xl divide-y divide-[rgba(26,26,26,.07)] shadow-[0_3px_14px_rgba(0,0,0,.04)]">
              <div className="flex items-center justify-between px-5 py-3.5">
                <span className="text-[14px] text-[#8a8578]">Nome</span>
                <span className="text-[14px] font-semibold text-[#1A1A1A]">{nome || '—'}</span>
              </div>
              <div className="flex items-center justify-between px-5 py-3.5">
                <span className="text-[14px] text-[#8a8578]">Procedimento</span>
                <span className="text-[14px] font-semibold text-[#1A1A1A] text-right">{template.procedimentoNome}</span>
              </div>
              {totalQuestions > 0 && (
                <div className="flex items-center justify-between px-5 py-3.5">
                  <span className="text-[14px] text-[#8a8578]">Respostas</span>
                  <span className="text-[14px] font-semibold text-[#1A1A1A]">
                    {answeredQuestions} de {totalQuestions} preenchidas
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between px-5 py-3.5">
                <span className="text-[14px] text-[#8a8578]">Foto</span>
                <span className="text-[14px] font-semibold text-[#1A1A1A]">{fotoPacienteUrl ? 'Anexada' : 'Não enviada'}</span>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 space-y-3 shadow-[0_3px_14px_rgba(0,0,0,.04)]">
              <div className="flex items-center gap-2 text-[15px] font-semibold text-[#1A1A1A]">
                <ShieldCheck className="w-[18px] h-[18px] text-[#A67C52]" />
                Declaração de Veracidade e Consentimento
              </div>

              <p className="text-[13px] text-[#4a4740] leading-relaxed">
                Declaro que todas as informações prestadas nesta ficha de anamnese são verdadeiras e completas, não
                tendo omitido nenhum dado relevante sobre histórico de saúde, uso de medicamentos, alergias ou
                procedimentos anteriores. Autorizo a clínica a utilizar essas informações estritamente para fins de
                planejamento e execução do meu tratamento estético.
              </p>

              <label
                ref={termoRef}
                className={`flex items-start gap-3 p-3.5 rounded-2xl bg-[#F9F8F6] border cursor-pointer transition-colors ${
                  errors['termo'] ? 'border-[#E11D48]' : 'border-[rgba(26,26,26,.1)]'
                }`}
              >
                <span
                  className={`w-[26px] h-[26px] rounded-lg border-[1.5px] flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                    termoAceito ? 'bg-[#A67C52] border-[#A67C52] text-white' : 'border-[#A67C52] bg-white'
                  }`}
                >
                  {termoAceito && <CheckCircle2 className="w-4 h-4" />}
                </span>
                <input
                  type="checkbox"
                  checked={termoAceito}
                  onChange={(e) => {
                    setTermoAceito(e.target.checked);
                    if (errors['termo']) clearError('termo');
                  }}
                  className="sr-only"
                />
                <span className="text-[14px] font-medium text-[#1A1A1A] leading-snug">
                  Li e concordo com a declaração acima.
                </span>
              </label>
              {errors['termo'] && <p className="text-[13px] text-[#E11D48] font-medium">{errors['termo']}</p>}
            </div>

            {Object.keys(errors).length > 0 && (
              <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-[13px] flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Por favor, verifique os campos obrigatórios destacados antes de enviar.</span>
              </div>
            )}
          </div>
        )}

        {/* ============ Sticky footer ============ */}
        <div className="fixed left-0 right-0 bottom-0 z-30 pt-8 px-4 sm:px-0 pb-[max(16px,env(safe-area-inset-bottom))] pointer-events-none" style={{ background: 'linear-gradient(to top, #FAF9F6 55%, transparent)' }}>
          <div className="max-w-lg mx-auto flex items-center gap-2.5 pointer-events-auto">
            {stepIndex > 1 && (
              <button
                type="button"
                onClick={() => goToStep((stepIndex - 1) as Step)}
                className="w-[54px] h-[54px] rounded-2xl bg-white border border-[rgba(26,26,26,.1)] text-[#1A1A1A] flex items-center justify-center shadow-lg active:scale-97 transition-all shrink-0"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}

            {stepIndex === 1 && (
              <button
                type="button"
                onClick={handleContinueFromStep1}
                className="flex-1 h-[54px] rounded-2xl bg-[#A67C52] text-white text-[16px] font-semibold flex items-center justify-center gap-2 shadow-lg active:scale-97 transition-all"
              >
                Continuar
                <ArrowRight className="w-[18px] h-[18px]" />
              </button>
            )}

            {stepIndex === 2 && (
              <button
                type="button"
                onClick={handleContinueFromStep2}
                className="flex-1 h-[54px] rounded-2xl bg-[#A67C52] text-white text-[16px] font-semibold flex items-center justify-center gap-2 shadow-lg active:scale-97 transition-all"
              >
                Continuar
                <ArrowRight className="w-[18px] h-[18px]" />
              </button>
            )}

            {stepIndex === 3 && (
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 h-[54px] rounded-2xl bg-[#1A1A1A] text-[#C49B74] text-[16px] font-semibold flex items-center justify-center gap-2 shadow-lg active:scale-97 transition-all disabled:opacity-50"
              >
                {isSubmitting ? (
                  <span>{isEditing ? 'Salvando...' : 'Enviando...'}</span>
                ) : (
                  <>
                    <CheckCircle2 className="w-[18px] h-[18px]" />
                    <span>{isEditing ? 'Salvar alterações' : 'Enviar ficha'}</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
};

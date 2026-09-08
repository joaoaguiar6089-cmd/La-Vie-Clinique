import React, { useState, useEffect } from 'react';
import {
  Patient,
  PatientGender,
  AnamnesisTemplate,
  AnamnesisQuestion,
  AnamnesisRecord,
  ClinicProfile,
} from '../../types';
import { downscaleImage } from '../../utils/imageCompressor';
import { resolveTemplatePhoto } from '../../utils/genderPhoto';
import { QuestionFieldRenderer } from './QuestionFieldRenderer';
import { PhotoAnnotationEditor } from './PhotoAnnotationEditor';
import {
  X,
  Camera,
  User,
  FileText,
  CheckCircle2,
  Printer,
  Music,
  PenTool,
  IdCard,
} from 'lucide-react';

const formatCpf = (raw: string): string => {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
};

interface GenderToggleProps {
  value: PatientGender | '';
  onChange: (value: PatientGender) => void;
  error?: string;
}

const GenderToggle: React.FC<GenderToggleProps> = ({ value, onChange, error }) => (
  <div>
    <label className="block text-[13px] font-semibold text-[#1A1A1A] mb-1.5">
      Gênero <span className="text-[#8a8578] font-normal">(define a foto de referência)</span>
    </label>
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange('feminino')}
        className={`flex-1 h-11 rounded-xl text-[14px] font-semibold transition-colors border ${
          value === 'feminino'
            ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]'
            : `bg-white text-[#4a4740] hover:border-[#A67C52]/40 ${error ? 'border-[#E11D48]' : 'border-[rgba(26,26,26,.12)]'}`
        }`}
      >
        Feminino
      </button>
      <button
        type="button"
        onClick={() => onChange('masculino')}
        className={`flex-1 h-11 rounded-xl text-[14px] font-semibold transition-colors border ${
          value === 'masculino'
            ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]'
            : `bg-white text-[#4a4740] hover:border-[#A67C52]/40 ${error ? 'border-[#E11D48]' : 'border-[rgba(26,26,26,.12)]'}`
        }`}
      >
        Masculino
      </button>
    </div>
    {error && <p className="text-[13px] text-[#E11D48] mt-1">{error}</p>}
  </div>
);

/** Pequena pílula indicando que a pergunta é de uso exclusivo da equipe clínica. */
const StaffOnlyPill: React.FC = () => (
  <span className="inline-block text-[11px] font-semibold text-[#4338CA] bg-[#EEF2FF] px-2 py-0.5 rounded-full border border-[#E0E7FF] ml-2 align-middle">
    Não vai ao paciente
  </span>
);

const isRiskAnswer = (q: AnamnesisQuestion, val: any): boolean =>
  (q.tipo_campo === 'sim_nao' && (val === 'Sim' || val === true)) ||
  (q.tipo_campo === 'escala' && Number(val) >= 7);

interface AnamnesisFormFillModalProps {
  isOpen: boolean;
  onClose: () => void;
  patients: Patient[];
  templates: AnamnesisTemplate[];
  generalQuestions: AnamnesisQuestion[];
  clinicProfile: ClinicProfile;
  initialPatientId?: string;
  initialTemplateId?: string;
  onSavePatient: (patient: Patient) => Promise<void>;
  onSaveRecord: (record: AnamnesisRecord) => Promise<void>;
  onOpenRecordDetail?: (record: AnamnesisRecord) => void;
}

export const AnamnesisFormFillModal: React.FC<AnamnesisFormFillModalProps> = ({
  isOpen,
  onClose,
  patients,
  templates,
  generalQuestions,
  clinicProfile,
  initialPatientId,
  initialTemplateId,
  onSavePatient,
  onSaveRecord,
  onOpenRecordDetail,
}) => {
  // Patient selection or creation
  const [patientMode, setPatientMode] = useState<'select' | 'new'>('select');
  const [selectedPatientId, setSelectedPatientId] = useState<string>(initialPatientId || '');
  const [newPatientName, setNewPatientName] = useState('');
  const [newPatientPhone, setNewPatientPhone] = useState('');
  const [newPatientBirth, setNewPatientBirth] = useState('');
  const [newPatientGender, setNewPatientGender] = useState<PatientGender | ''>('');
  const [newPatientCpf, setNewPatientCpf] = useState('');
  const [newPatientEmail, setNewPatientEmail] = useState('');
  const [tipoMusica, setTipoMusica] = useState('');
  const [selectedPatientGender, setSelectedPatientGender] = useState<PatientGender | ''>('');

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

  const extraGeneralQuestions = generalQuestions.filter((q) => !isDuplicateIdentQuestion(q));

  // Procedure Template selection
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    initialTemplateId || (templates[0]?.id || '')
  );

  // Consultation info
  const [dataAtendimento, setDataAtendimento] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [professionalId, setProfessionalId] = useState<string>('');

  // Answers maps: questionId -> value
  const [respostasGerais, setRespostasGerais] = useState<Record<string, any>>({});
  const [respostasEspecificas, setRespostasEspecificas] = useState<Record<string, any>>({});
  const [fotoUrl, setFotoUrl] = useState<string>('');
  const [fotoAnotadaUrl, setFotoAnotadaUrl] = useState<string>('');
  const [fotoAnotacoesJson, setFotoAnotacoesJson] = useState<string | undefined>(undefined);
  const [isAnnotatingPhoto, setIsAnnotatingPhoto] = useState(false);
  const [observacoesFinais, setObservacoesFinais] = useState<string>('');

  // Validation & status
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  // When selected patient changes, auto-fill general questions that match
  useEffect(() => {
    if (patientMode === 'select' && selectedPatientId) {
      const patient = patients.find((p) => p.id === selectedPatientId);
      if (patient) {
        if ((patient as any).tipoMusica) {
          setTipoMusica((patient as any).tipoMusica);
        }
        setSelectedPatientGender(patient.genero || '');
      }
    }
  }, [selectedPatientId, patientMode, patients, generalQuestions]);

  const currentTemplate = templates.find((t) => t.id === selectedTemplateId) || templates[0];
  const currentGenero = patientMode === 'new' ? newPatientGender : selectedPatientGender;
  const previewFotoModelo = currentTemplate ? resolveTemplatePhoto(currentTemplate, currentGenero || undefined) : undefined;

  if (!isOpen) return null;

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const compressed = await downscaleImage(file);
      setFotoUrl(compressed);
      setFotoAnotadaUrl('');
      setFotoAnotacoesJson(undefined);
    } catch (err) {
      console.error(err);
      alert('Falha ao processar foto.');
    }
  };

  const handleSaveAnnotation = async (dataUrl: string, annotationsJson: string) => {
    setFotoAnotadaUrl(dataUrl);
    setFotoAnotacoesJson(annotationsJson);
    setIsAnnotatingPhoto(false);
  };

  const handleGeneralAnswerChange = (questionId: string, val: any) => {
    setRespostasGerais((prev) => ({ ...prev, [questionId]: val }));
    if (errors[questionId]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[questionId];
        return next;
      });
    }
  };

  const handleSpecificAnswerChange = (questionId: string, val: any) => {
    setRespostasEspecificas((prev) => ({ ...prev, [questionId]: val }));
    if (errors[questionId]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[questionId];
        return next;
      });
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Patient
    if (patientMode === 'new' && !newPatientName.trim()) {
      newErrors['patient_name'] = 'Informe o nome completo do paciente.';
    }
    if (patientMode === 'new' && !newPatientGender) {
      newErrors['patient_gender'] = 'Selecione o gênero (define a foto de referência).';
    }
    if (patientMode === 'select' && !selectedPatientId) {
      newErrors['patient_select'] = 'Selecione um paciente cadastrado ou crie um novo.';
    }
    if (patientMode === 'select' && selectedPatientId && !selectedPatientGender) {
      newErrors['patient_gender'] = 'Selecione o gênero (define a foto de referência).';
    }

    // Procedure
    if (!currentTemplate) {
      newErrors['template'] = 'Selecione um modelo de procedimento.';
    }

    // Professional
    if (!professionalId) {
      newErrors['professional'] = 'Selecione o profissional responsável.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSaveForm = async (openPrintAfter = false) => {
    if (!validateForm()) {
      alert('Por favor, verifique os campos obrigatórios (paciente, procedimento e profissional responsável).');
      return;
    }

    setIsSaving(true);
    try {
      let patientIdToUse = selectedPatientId;
      let patientNameToUse = '';
      let patientPhoneToUse = '';
      let patientBirthToUse = '';
      let patientGenderToUse: Patient['genero'];

      if (patientMode === 'new') {
        const newPat: Patient = {
          id: `pat-${Date.now()}`,
          nome: newPatientName.trim(),
          contato: newPatientPhone.trim() || undefined,
          dataNascimento: newPatientBirth || undefined,
          genero: newPatientGender || undefined,
          cpf: newPatientCpf.replace(/\D/g, '') || undefined,
          email: newPatientEmail.trim() || undefined,
          createdAt: new Date().toISOString(),
        };
        await onSavePatient(newPat);
        patientIdToUse = newPat.id;
        patientNameToUse = newPat.nome;
        patientPhoneToUse = newPat.contato || '';
        patientBirthToUse = newPat.dataNascimento || '';
        patientGenderToUse = newPat.genero;
      } else {
        const found = patients.find((p) => p.id === selectedPatientId);
        patientNameToUse = found?.nome || '';
        patientPhoneToUse = found?.contato || '';
        patientBirthToUse = found?.dataNascimento || '';
        patientGenderToUse = selectedPatientGender || found?.genero;
        // Persiste o gênero caso tenha sido corrigido/preenchido agora para um paciente já existente
        if (found && selectedPatientGender && found.genero !== selectedPatientGender) {
          await onSavePatient({ ...found, genero: selectedPatientGender });
        }
      }

      // If user filled gen-nome in answers, prioritize it
      const nameFromGeneral = Object.entries(respostasGerais).find(([k]) =>
        k.includes('nome')
      )?.[1];
      if (nameFromGeneral && typeof nameFromGeneral === 'string') {
        patientNameToUse = nameFromGeneral;
      }

      const finalRespostasGerais: Record<string, any> = {
        ...respostasGerais,
        'gen-musica': tipoMusica.trim(),
      };

      // Perguntas exclusivas do profissional já são preenchidas de uma vez só no atendimento
      // presencial — espelha essas respostas em respostasProfissional para manter a mesma
      // fonte de verdade usada pela ficha online + complementação.
      const respostasProfissional: Record<string, any> = {};
      extraGeneralQuestions.forEach((q) => {
        if ((q.publicoAlvo || 'paciente') === 'medico' && finalRespostasGerais[q.id] !== undefined) {
          respostasProfissional[q.id] = finalRespostasGerais[q.id];
        }
      });
      currentTemplate.perguntasEspecificas.forEach((q) => {
        if ((q.publicoAlvo || 'paciente') === 'medico' && respostasEspecificas[q.id] !== undefined) {
          respostasProfissional[q.id] = respostasEspecificas[q.id];
        }
      });

      const selectedProfessional = clinicProfile.professionals?.find((p) => p.id === professionalId);

      const newRecord: AnamnesisRecord = {
        id: `rec-${Date.now()}`,
        pacienteId: patientIdToUse,
        pacienteNome: patientNameToUse,
        pacienteContato: patientPhoneToUse,
        pacienteDataNascimento: patientBirthToUse,
        pacienteGenero: patientGenderToUse,
        procedimentoId: currentTemplate.id,
        templateId: currentTemplate.id,
        procedimentoNome: currentTemplate.procedimentoNome,
        dataAtendimento,
        professionalId,
        profissionalNome: selectedProfessional?.name,
        respostasGerais: finalRespostasGerais,
        respostasEspecificas,
        respostasProfissional,
        profissionalPreenchidoEm: new Date().toISOString(),
        fotoModeloUrl: resolveTemplatePhoto(currentTemplate, patientGenderToUse),
        fotoPacienteUrl: currentTemplate.tem_foto ? fotoUrl || undefined : undefined,
        fotoPacienteAnotadaUrl: currentTemplate.tem_foto ? fotoAnotadaUrl || undefined : undefined,
        fotoPacienteAnotacoesJson: currentTemplate.tem_foto ? fotoAnotacoesJson : undefined,
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
          especificas: currentTemplate.perguntasEspecificas || [],
        },
        observacoesFinais: observacoesFinais.trim() || undefined,
        origemPreenchimento: 'presencial_clinica',
        createdAt: new Date().toISOString(),
      };

      await onSaveRecord(newRecord);
      onClose();

      if (openPrintAfter && onOpenRecordDetail) {
        onOpenRecordDetail(newRecord);
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar ficha de anamnese.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 md:p-6 animate-fadeIn">
      <div className="relative w-full max-w-4xl bg-[#F9F8F6] rounded-2xl border border-white/80 shadow-2xl overflow-hidden max-h-[95vh] flex flex-col">
        {/* Modal Top Header */}
        <div className="px-6 py-4 bg-[#1A1A1A] text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-[#C49B74]" />
            <div>
              <h3 className="font-serif-luxury text-[21px] font-medium tracking-tight">
                Nova Ficha de Anamnese
              </h3>
              <p className="text-[13px] text-[#C49B74] font-medium">
                {clinicProfile.name || 'La Vie Clinique'} · Registro médico e estético integrado
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* SECTION 1: PACIENTE & ATENDIMENTO */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[rgba(26,26,26,.07)] space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3 border-b border-[rgba(26,26,26,.07)] pb-3">
              <h4 className="text-[15px] font-semibold text-[#1A1A1A] flex items-center gap-2">
                <User className="w-4 h-4 text-[#A67C52]" />
                1. Identificação do paciente & atendimento
              </h4>

              <div className="flex items-center gap-1 bg-[#F9F8F6] p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setPatientMode('select')}
                  className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all ${
                    patientMode === 'select'
                      ? 'bg-white text-[#1A1A1A] shadow-xs font-semibold'
                      : 'text-[#8a8578] hover:text-[#1A1A1A]'
                  }`}
                >
                  Paciente cadastrado
                </button>
                <button
                  type="button"
                  onClick={() => setPatientMode('new')}
                  className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all ${
                    patientMode === 'new'
                      ? 'bg-white text-[#1A1A1A] shadow-xs font-semibold'
                      : 'text-[#8a8578] hover:text-[#1A1A1A]'
                  }`}
                >
                  + Novo paciente
                </button>
              </div>
            </div>

            {/* Existing Patient Selector */}
            {patientMode === 'select' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-[13px] font-semibold text-[#1A1A1A] mb-1.5">
                    Selecione o paciente
                  </label>
                  <select
                    value={selectedPatientId}
                    onChange={(e) => setSelectedPatientId(e.target.value)}
                    className={`w-full h-11 px-3 text-[14px] rounded-xl bg-[#F9F8F6] border ${
                      errors['patient_select'] ? 'border-[#E11D48]' : 'border-[rgba(26,26,26,.12)]'
                    } text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52] font-medium`}
                  >
                    <option value="">-- Escolha um paciente da clínica --</option>
                    {patients.map((pat) => (
                      <option key={pat.id} value={pat.id}>
                        {pat.nome} {pat.contato ? `(${pat.contato})` : ''}
                      </option>
                    ))}
                  </select>
                  {errors['patient_select'] && (
                    <p className="text-[13px] text-[#E11D48] mt-1">{errors['patient_select']}</p>
                  )}
                </div>

                {selectedPatientId && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-[#F9F8F6] rounded-xl">
                    <div>
                      <label className="block text-[13px] font-semibold text-[#1A1A1A] mb-1.5 flex items-center gap-1.5">
                        <Music className="w-3.5 h-3.5 text-[#A67C52]" />
                        Tipo de música
                      </label>
                      <input
                        type="text"
                        value={tipoMusica}
                        onChange={(e) => setTipoMusica(e.target.value)}
                        placeholder="Ex: MPB, Jazz, Pop, Lounge, Clássica..."
                        className="w-full h-11 px-3 text-[14px] rounded-xl bg-white border border-[rgba(26,26,26,.12)] text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                      />
                    </div>
                    <GenderToggle
                      value={selectedPatientGender}
                      onChange={(v) => {
                        setSelectedPatientGender(v);
                        if (errors['patient_gender']) setErrors((prev) => ({ ...prev, patient_gender: '' }));
                      }}
                      error={errors['patient_gender']}
                    />
                  </div>
                )}
              </div>
            )}

            {/* New Patient Inline Fields */}
            {patientMode === 'new' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 bg-[#F9F8F6] rounded-xl">
                <div className="sm:col-span-2">
                  <label className="block text-[13px] font-semibold text-[#1A1A1A] mb-1.5">
                    Nome completo
                  </label>
                  <input
                    type="text"
                    value={newPatientName}
                    onChange={(e) => setNewPatientName(e.target.value)}
                    placeholder="Ex: Ana Clara Menezes"
                    className="w-full h-11 px-3 text-[14px] rounded-xl bg-white border border-[rgba(26,26,26,.12)] text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                  />
                  {errors['patient_name'] && (
                    <p className="text-[13px] text-[#E11D48] mt-1">{errors['patient_name']}</p>
                  )}
                </div>

                <div>
                  <label className="block text-[13px] font-semibold text-[#1A1A1A] mb-1.5">
                    WhatsApp / telefone
                  </label>
                  <input
                    type="text"
                    value={newPatientPhone}
                    onChange={(e) => setNewPatientPhone(e.target.value)}
                    placeholder="(19) 99999-9999"
                    className="w-full h-11 px-3 text-[14px] rounded-xl bg-white border border-[rgba(26,26,26,.12)] text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                  />
                </div>

                <div>
                  <label className="block text-[13px] font-semibold text-[#1A1A1A] mb-1.5">
                    Data de nascimento
                  </label>
                  <input
                    type="date"
                    value={newPatientBirth}
                    onChange={(e) => setNewPatientBirth(e.target.value)}
                    className="w-full h-11 px-3 text-[14px] rounded-xl bg-white border border-[rgba(26,26,26,.12)] text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                  />
                </div>

                <div>
                  <label className="block text-[13px] font-semibold text-[#1A1A1A] mb-1.5 flex items-center gap-1.5">
                    <Music className="w-3.5 h-3.5 text-[#A67C52]" />
                    Tipo de música
                  </label>
                  <input
                    type="text"
                    value={tipoMusica}
                    onChange={(e) => setTipoMusica(e.target.value)}
                    placeholder="Ex: MPB, Jazz, Pop, Lounge, Clássica..."
                    className="w-full h-11 px-3 text-[14px] rounded-xl bg-white border border-[rgba(26,26,26,.12)] text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                  />
                </div>

                <div>
                  <label className="block text-[13px] font-semibold text-[#1A1A1A] mb-1.5 flex items-center gap-1.5">
                    <IdCard className="w-3.5 h-3.5 text-[#A67C52]" />
                    CPF <span className="text-[#8a8578] font-normal">(opcional)</span>
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={newPatientCpf}
                    onChange={(e) => setNewPatientCpf(formatCpf(e.target.value))}
                    placeholder="000.000.000-00"
                    className="w-full h-11 px-3 text-[14px] rounded-xl bg-white border border-[rgba(26,26,26,.12)] text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                  />
                </div>

                <div>
                  <label className="block text-[13px] font-semibold text-[#1A1A1A] mb-1.5">
                    E-mail
                  </label>
                  <input
                    type="email"
                    value={newPatientEmail}
                    onChange={(e) => setNewPatientEmail(e.target.value)}
                    placeholder="paciente@exemplo.com"
                    className="w-full h-11 px-3 text-[14px] rounded-xl bg-white border border-[rgba(26,26,26,.12)] text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                  />
                </div>

                <GenderToggle
                  value={newPatientGender}
                  onChange={(v) => {
                    setNewPatientGender(v);
                    if (errors['patient_gender']) setErrors((prev) => ({ ...prev, patient_gender: '' }));
                  }}
                  error={errors['patient_gender']}
                />
              </div>
            )}

            {/* Procedure Template, Date & Professional */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div>
                <label className="block text-[13px] font-semibold text-[#1A1A1A] mb-1.5">
                  Procedimento / ficha
                </label>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="w-full h-11 px-3 text-[14px] rounded-xl bg-[#F9F8F6] border border-[rgba(26,26,26,.12)] text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52] font-semibold"
                >
                  {templates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.procedimentoNome}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[13px] font-semibold text-[#1A1A1A] mb-1.5">
                  Data do atendimento
                </label>
                <input
                  type="date"
                  value={dataAtendimento}
                  onChange={(e) => setDataAtendimento(e.target.value)}
                  className="w-full h-11 px-3 text-[14px] rounded-xl bg-[#F9F8F6] border border-[rgba(26,26,26,.12)] text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                />
              </div>

              <div>
                <label className="block text-[13px] font-semibold text-[#1A1A1A] mb-1.5">
                  Profissional responsável
                </label>
                <select
                  value={professionalId}
                  onChange={(e) => {
                    setProfessionalId(e.target.value);
                    if (errors['professional']) {
                      setErrors((prev) => {
                        const next = { ...prev };
                        delete next['professional'];
                        return next;
                      });
                    }
                  }}
                  className={`w-full h-11 px-3 text-[14px] rounded-xl bg-[#F9F8F6] border ${
                    errors['professional'] ? 'border-[#E11D48]' : 'border-[rgba(26,26,26,.12)]'
                  } text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]`}
                >
                  <option value="">-- Selecione o profissional --</option>
                  {clinicProfile.professionals?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                {errors['professional'] && (
                  <p className="text-[13px] text-[#E11D48] mt-1">{errors['professional']}</p>
                )}
                {(!clinicProfile.professionals || clinicProfile.professionals.length === 0) && (
                  <p className="text-[13px] text-amber-600 mt-1">
                    Nenhum profissional cadastrado. Cadastre em Configurações da Clínica.
                  </p>
                )}
              </div>
            </div>

            {/* Outras Perguntas Gerais (se houver, integradas sem título separado) */}
            {extraGeneralQuestions.length > 0 && (
              <div className="pt-3 border-t border-[rgba(26,26,26,.07)] space-y-4 divide-y divide-[rgba(26,26,26,.07)]">
                {extraGeneralQuestions.map((q) => (
                  <div key={q.id} className="pt-4 first:pt-0">
                    {(q.publicoAlvo || 'paciente') === 'medico' && <StaffOnlyPill />}
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

          {/* SECTION 2: PERGUNTAS ESPECÍFICAS DO PROCEDIMENTO */}
          {currentTemplate && (
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[rgba(26,26,26,.07)] space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2 border-b border-[rgba(26,26,26,.07)] pb-3">
                <div>
                  <h4 className="text-[15px] font-semibold text-[#1A1A1A] flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#A67C52]" />
                    2. Avaliação específica — {currentTemplate.procedimentoNome}
                  </h4>
                  {currentTemplate.descricao && (
                    <p className="text-[13px] text-[#8a8578] mt-1">{currentTemplate.descricao}</p>
                  )}
                </div>
                <span className="text-[12px] text-[#1A1A1A] bg-[#F9F8F6] px-2.5 py-1 rounded-full font-semibold">
                  {currentTemplate.perguntasEspecificas.length} questões
                </span>
              </div>

              {currentTemplate.perguntasEspecificas.length === 0 ? (
                <p className="text-[14px] text-[#8a8578] py-3 italic">
                  Este procedimento não possui perguntas específicas cadastradas no modelo.
                </p>
              ) : (
                <div className="space-y-4 divide-y divide-[rgba(26,26,26,.07)]">
                  {currentTemplate.perguntasEspecificas.map((q) => {
                    const val = respostasEspecificas[q.id];
                    const warning = isRiskAnswer(q, val);
                    return (
                      <div
                        key={q.id}
                        className={`pt-4 first:pt-0 ${warning ? '-mx-3 px-3 rounded-xl bg-[#E11D48]/5' : ''}`}
                      >
                        {(q.publicoAlvo || 'paciente') === 'medico' && <StaffOnlyPill />}
                        <QuestionFieldRenderer
                          question={q}
                          value={val}
                          onChange={(val) => handleSpecificAnswerChange(q.id, val)}
                          hideMandatoryAsterisk={true}
                        />
                        {warning && (
                          <p className="text-[13px] text-[#9F1239] font-medium mt-1.5">
                            Atenção na parametrização
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* SECTION 4: FOTOS CLÍNICAS (Foto do Doutor e Foto do Paciente) */}
          {(currentTemplate?.tem_foto || previewFotoModelo) && (
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[rgba(26,26,26,.07)] space-y-4">
              <div>
                <h4 className="text-[15px] font-semibold text-[#1A1A1A] flex items-center gap-2">
                  <Camera className="w-4 h-4 text-[#A67C52]" />
                  4. Fotos de mapeamento & registro clínico
                </h4>
                <p className="text-[13px] text-[#8a8578] mt-1">
                  A foto de referência da clínica e a foto do paciente ficam disponíveis para anotações manuais (unidades, doses, vetores).
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* 1. Foto de Referência da Clínica (escolhida pelo gênero do paciente) */}
                {previewFotoModelo ? (
                  <div className="p-3.5 bg-[#F9F8F6] rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[14px] font-semibold text-[#1A1A1A]">
                        Referência da clínica
                      </span>
                      <span className="text-[11px] text-[#4a4740] bg-white px-2 py-0.5 rounded-full font-semibold border border-[rgba(26,26,26,.1)]">
                        Modelo
                      </span>
                    </div>
                    <div className="w-full h-44 rounded-xl overflow-hidden border border-[rgba(26,26,26,.07)] bg-white flex items-center justify-center">
                      <img
                        src={previewFotoModelo}
                        alt="Foto de referência da clínica"
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <p className="text-[12px] text-[#8a8578] text-center italic">
                      Guia anatômico configurado para {currentTemplate.procedimentoNome}
                    </p>
                  </div>
                ) : (
                  !currentGenero && (currentTemplate?.fotoModeloFemininoUrl || currentTemplate?.fotoModeloMasculinoUrl) && (
                    <div className="p-3.5 bg-amber-50 rounded-xl text-[13px] text-amber-800 flex items-center justify-center text-center">
                      Selecione o gênero do paciente acima para ver a foto de referência.
                    </div>
                  )
                )}

                {/* 2. Foto do Paciente */}
                {currentTemplate?.tem_foto && (
                  <div className={`p-3.5 bg-[#F9F8F6] rounded-xl space-y-2 ${!previewFotoModelo ? 'sm:col-span-2' : ''}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[14px] font-semibold text-[#1A1A1A]">
                        Foto do paciente
                      </span>
                      <div className="flex items-center gap-1.5">
                        {fotoAnotadaUrl && (
                          <span className="text-[11px] text-[#4338CA] bg-[#EEF2FF] px-2 py-0.5 rounded-full font-semibold border border-[#E0E7FF]">
                            Anotada
                          </span>
                        )}
                        <span className="text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-semibold border border-emerald-200">
                          Prontuário
                        </span>
                      </div>
                    </div>

                    {fotoUrl ? (
                      <div className="space-y-2.5">
                        <div className="relative w-full h-[206px] rounded-xl overflow-hidden border border-[rgba(26,26,26,.07)] bg-black/5 flex items-center justify-center">
                          <img
                            src={fotoAnotadaUrl || fotoUrl}
                            alt="Foto do paciente"
                            className="w-full h-full object-contain"
                          />
                        </div>
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-emerald-700">
                            <CheckCircle2 className="w-4 h-4" />
                            Foto anexada
                          </span>
                          <div className="flex items-center gap-3">
                            <label className="cursor-pointer text-[13px] font-semibold text-[#A67C52] hover:underline">
                              Trocar
                              <input
                                type="file"
                                accept="image/*"
                                onChange={handleImageUpload}
                                className="hidden"
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() => {
                                setFotoUrl('');
                                setFotoAnotadaUrl('');
                                setFotoAnotacoesJson(undefined);
                              }}
                              className="text-[13px] text-[#E11D48] hover:underline"
                            >
                              Remover
                            </button>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsAnnotatingPhoto(true)}
                          className="w-full h-11 rounded-xl bg-[#A67C52] text-white text-[14px] font-semibold flex items-center justify-center gap-2 hover:bg-[#8E653D] active:scale-97 transition-all"
                        >
                          <PenTool className="w-4 h-4" />
                          Anotar foto
                        </button>
                      </div>
                    ) : (
                      <label className="cursor-pointer flex flex-col items-center justify-center h-44 rounded-xl bg-white hover:bg-[#F9F8F6] transition-all text-center group" style={{ border: '1.5px dashed rgba(166,124,82,.5)' }}>
                        <Camera className="w-6 h-6 text-[#A67C52] group-hover:scale-105 transition-transform mb-1.5" />
                        <span className="text-[14px] font-semibold text-[#8E653D]">
                          Tirar ou selecionar foto do paciente
                        </span>
                        <span className="text-[12px] text-[#8a8578] mt-0.5">
                          Para registro clínico e marcações personalizadas
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SECTION 5: OBSERVAÇÕES FINAIS & CONDUTA */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[rgba(26,26,26,.07)] space-y-2">
            <h4 className="text-[15px] font-semibold text-[#1A1A1A]">
              5. Observações finais & conduta do atendimento
            </h4>
            <textarea
              rows={3}
              value={observacoesFinais}
              onChange={(e) => setObservacoesFinais(e.target.value)}
              placeholder="Ex: Paciente bem orientada quanto aos cuidados pós-procedimento. Retorno agendado em 15 dias para conferência de simetria..."
              className="w-full min-h-[120px] px-3.5 py-3 text-[14px] rounded-xl bg-[#F9F8F6] border border-[rgba(26,26,26,.12)] text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52] resize-y"
            />
          </div>
        </div>

        {/* Modal Bottom Actions */}
        <div className="px-6 py-4 bg-white border-t border-[rgba(26,26,26,.07)] flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto h-[52px] px-5 rounded-2xl border border-[rgba(26,26,26,.12)] text-[15px] font-semibold text-[#4a4740] hover:bg-[#F9F8F6] transition-colors whitespace-nowrap"
          >
            Cancelar
          </button>

          <div className="w-full sm:w-auto flex items-center gap-2.5">
            <button
              type="button"
              disabled={isSaving}
              onClick={() => handleSaveForm(false)}
              className="flex-1 sm:flex-initial h-[52px] px-5 rounded-2xl bg-white border border-[rgba(26,26,26,.15)] text-[15px] font-semibold text-[#1A1A1A] hover:border-[#A67C52] hover:text-[#A67C52] transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {isSaving ? 'Gravando...' : 'Salvar ficha'}
            </button>

            <button
              type="button"
              disabled={isSaving}
              onClick={() => handleSaveForm(true)}
              className="flex-1 sm:flex-initial h-[52px] px-6 rounded-2xl bg-[#1A1A1A] text-[#C49B74] text-[15px] font-semibold flex items-center justify-center gap-2 hover:bg-black shadow-xs active:scale-97 transition-all disabled:opacity-50 whitespace-nowrap"
            >
              <Printer className="w-4 h-4" />
              {isSaving ? 'Processando...' : 'Salvar e gerar PDF'}
            </button>
          </div>
        </div>
      </div>

      {isAnnotatingPhoto && fotoUrl && (
        <PhotoAnnotationEditor
          imageUrl={fotoAnotadaUrl || fotoUrl}
          initialAnnotationsJson={fotoAnotacoesJson}
          title="Anotar foto do paciente"
          onSave={handleSaveAnnotation}
          onClose={() => setIsAnnotatingPhoto(false)}
        />
      )}
    </div>
  );
};

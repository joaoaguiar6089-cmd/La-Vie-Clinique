import React, { useState, useEffect } from 'react';
import {
  Patient,
  AnamnesisTemplate,
  AnamnesisQuestion,
  AnamnesisRecord,
  ClinicProfile,
} from '../../types';
import { downscaleImage } from '../../utils/imageCompressor';
import { QuestionFieldRenderer } from './QuestionFieldRenderer';
import {
  X,
  Camera,
  Upload,
  User,
  Calendar,
  Sparkles,
  FileText,
  CheckCircle2,
  AlertCircle,
  Plus,
  Search,
  Printer,
  ChevronDown,
  Music,
} from 'lucide-react';

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
  const [newPatientEmail, setNewPatientEmail] = useState('');
  const [tipoMusica, setTipoMusica] = useState('');

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
  const [profissionalNome, setProfissionalNome] = useState<string>(
    clinicProfile.professionals?.[0]?.name || clinicProfile.professionalName || 'Equipe La Vie'
  );

  // Answers maps: questionId -> value
  const [respostasGerais, setRespostasGerais] = useState<Record<string, any>>({});
  const [respostasEspecificas, setRespostasEspecificas] = useState<Record<string, any>>({});
  const [fotoUrl, setFotoUrl] = useState<string>('');
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
      }
    }
  }, [selectedPatientId, patientMode, patients, generalQuestions]);

  const currentTemplate = templates.find((t) => t.id === selectedTemplateId) || templates[0];

  if (!isOpen) return null;

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const compressed = await downscaleImage(file);
      setFotoUrl(compressed);
    } catch (err) {
      console.error(err);
      alert('Falha ao processar foto.');
    }
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
    if (patientMode === 'select' && !selectedPatientId) {
      newErrors['patient_select'] = 'Selecione um paciente cadastrado ou crie um novo.';
    }

    // Procedure
    if (!currentTemplate) {
      newErrors['template'] = 'Selecione um modelo de procedimento.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSaveForm = async (openPrintAfter = false) => {
    if (!validateForm()) {
      alert('Por favor, selecione ou informe o paciente.');
      return;
    }

    setIsSaving(true);
    try {
      let patientIdToUse = selectedPatientId;
      let patientNameToUse = '';
      let patientPhoneToUse = '';
      let patientBirthToUse = '';

      if (patientMode === 'new') {
        const newPat: Patient = {
          id: `pat-${Date.now()}`,
          nome: newPatientName.trim(),
          contato: newPatientPhone.trim() || undefined,
          dataNascimento: newPatientBirth || undefined,
          email: newPatientEmail.trim() || undefined,
          createdAt: new Date().toISOString(),
        };
        await onSavePatient(newPat);
        patientIdToUse = newPat.id;
        patientNameToUse = newPat.nome;
        patientPhoneToUse = newPat.contato || '';
        patientBirthToUse = newPat.dataNascimento || '';
      } else {
        const found = patients.find((p) => p.id === selectedPatientId);
        patientNameToUse = found?.nome || '';
        patientPhoneToUse = found?.contato || '';
        patientBirthToUse = found?.dataNascimento || '';
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

      const newRecord: AnamnesisRecord = {
        id: `rec-${Date.now()}`,
        pacienteId: patientIdToUse,
        pacienteNome: patientNameToUse,
        pacienteContato: patientPhoneToUse,
        pacienteDataNascimento: patientBirthToUse,
        procedimentoId: currentTemplate.id,
        procedimentoNome: currentTemplate.procedimentoNome,
        dataAtendimento,
        profissionalNome,
        respostasGerais: finalRespostasGerais,
        respostasEspecificas,
        fotoModeloUrl: currentTemplate.fotoModeloUrl || undefined,
        fotoPacienteUrl: currentTemplate.tem_foto ? fotoUrl || undefined : undefined,
        fotoUrl: currentTemplate.tem_foto ? fotoUrl || undefined : undefined,
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
      <div className="relative w-full max-w-4xl bg-[#FAF9F6] rounded-sm border border-white/80 shadow-2xl overflow-hidden max-h-[95vh] flex flex-col">
        {/* Modal Top Header */}
        <div className="px-6 py-4 bg-[#1A1A1A] text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-[#C49B74]" />
            <div>
              <h3 className="font-serif-luxury text-lg font-medium tracking-tight">
                Nova Ficha de Anamnese — Atendimento Clínico
              </h3>
              <p className="text-[11px] text-[#C49B74] font-medium">
                La Vie Clinique • Registro Médico e Estético Integrado
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xs text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* SECTION 1: PACIENTE & ATENDIMENTO */}
          <div className="bg-white p-4 sm:p-5 rounded-sm border border-gray-200/80 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
              <h4 className="text-xs font-semibold uppercase tracking-widest text-[#1A1A1A] flex items-center gap-1.5">
                <User className="w-4 h-4 text-[#A67C52]" />
                1. Identificação do Paciente & Atendimento
              </h4>

              <div className="flex items-center gap-1 bg-gray-100 p-0.5 rounded-xs">
                <button
                  type="button"
                  onClick={() => setPatientMode('select')}
                  className={`px-3 py-1 rounded-2xs text-xs font-medium transition-all ${
                    patientMode === 'select'
                      ? 'bg-white text-[#1A1A1A] shadow-2xs font-semibold'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  Paciente Cadastrado
                </button>
                <button
                  type="button"
                  onClick={() => setPatientMode('new')}
                  className={`px-3 py-1 rounded-2xs text-xs font-medium transition-all ${
                    patientMode === 'new'
                      ? 'bg-white text-[#1A1A1A] shadow-2xs font-semibold'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  + Novo Paciente
                </button>
              </div>
            </div>

            {/* Existing Patient Selector */}
            {patientMode === 'select' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-800 mb-1">
                    Selecione o Paciente
                  </label>
                  <select
                    value={selectedPatientId}
                    onChange={(e) => setSelectedPatientId(e.target.value)}
                    className={`w-full px-3 py-2 text-xs rounded-sm bg-[#FAF9F6] border ${
                      errors['patient_select'] ? 'border-red-400' : 'border-gray-200'
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
                    <p className="text-[10px] text-red-500 mt-1">{errors['patient_select']}</p>
                  )}
                </div>

                {selectedPatientId && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-gray-50/70 border border-gray-200 rounded-sm">
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1 flex items-center gap-1.5">
                        <Music className="w-3.5 h-3.5 text-[#A67C52]" />
                        Tipo de Música
                      </label>
                      <input
                        type="text"
                        value={tipoMusica}
                        onChange={(e) => setTipoMusica(e.target.value)}
                        placeholder="Ex: MPB, Jazz, Pop, Lounge, Clássica..."
                        className="w-full px-3 py-2 text-xs rounded-sm bg-white border border-gray-200 text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* New Patient Inline Fields */}
            {patientMode === 'new' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-gray-50/70 border border-gray-200 rounded-sm">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-gray-800 mb-1">
                    Nome Completo
                  </label>
                  <input
                    type="text"
                    value={newPatientName}
                    onChange={(e) => setNewPatientName(e.target.value)}
                    placeholder="Ex: Ana Clara Menezes"
                    className="w-full px-3 py-2 text-xs rounded-sm bg-white border border-gray-200 text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                  />
                  {errors['patient_name'] && (
                    <p className="text-[10px] text-red-500 mt-1">{errors['patient_name']}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-800 mb-1">
                    WhatsApp / Telefone
                  </label>
                  <input
                    type="text"
                    value={newPatientPhone}
                    onChange={(e) => setNewPatientPhone(e.target.value)}
                    placeholder="(19) 99999-9999"
                    className="w-full px-3 py-2 text-xs rounded-sm bg-white border border-gray-200 text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-800 mb-1">
                    Data de Nascimento
                  </label>
                  <input
                    type="date"
                    value={newPatientBirth}
                    onChange={(e) => setNewPatientBirth(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-sm bg-white border border-gray-200 text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                  />
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
                    placeholder="Ex: MPB, Jazz, Pop, Lounge, Clássica..."
                    className="w-full px-3 py-2 text-xs rounded-sm bg-white border border-gray-200 text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-800 mb-1">
                    E-mail
                  </label>
                  <input
                    type="email"
                    value={newPatientEmail}
                    onChange={(e) => setNewPatientEmail(e.target.value)}
                    placeholder="paciente@exemplo.com"
                    className="w-full px-3 py-2 text-xs rounded-sm bg-white border border-gray-200 text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                  />
                </div>
              </div>
            )}

            {/* Procedure Template, Date & Professional */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div>
                <label className="block text-xs font-semibold text-gray-800 mb-1">
                  Procedimento / Ficha
                </label>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-sm bg-[#FAF9F6] border border-gray-200 text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52] font-semibold"
                >
                  {templates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.procedimentoNome}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-800 mb-1">
                  Data do Atendimento
                </label>
                <input
                  type="date"
                  value={dataAtendimento}
                  onChange={(e) => setDataAtendimento(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-sm bg-[#FAF9F6] border border-gray-200 text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-800 mb-1">
                  Profissional Responsável
                </label>
                <input
                  type="text"
                  value={profissionalNome}
                  onChange={(e) => setProfissionalNome(e.target.value)}
                  placeholder="Nome da biomédica/esteticista"
                  className="w-full px-3 py-2 text-xs rounded-sm bg-[#FAF9F6] border border-gray-200 text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                />
              </div>
            </div>

            {/* Outras Perguntas Gerais (se houver, integradas sem título separado) */}
            {extraGeneralQuestions.length > 0 && (
              <div className="pt-3 border-t border-gray-100 space-y-3 divide-y divide-gray-100/60">
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

          {/* SECTION 2: PERGUNTAS ESPECÍFICAS DO PROCEDIMENTO */}
          {currentTemplate && (
            <div className="bg-white p-4 sm:p-5 rounded-sm border border-gray-200/80 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-widest text-[#1A1A1A] flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-[#A67C52]" />
                    Avaliação Específica — {currentTemplate.procedimentoNome}
                  </h4>
                  {currentTemplate.descricao && (
                    <p className="text-[11px] text-gray-500 mt-0.5">{currentTemplate.descricao}</p>
                  )}
                </div>
                <span className="text-[10px] text-[#1A1A1A] bg-gray-100 px-2 py-0.5 rounded-xs font-bold">
                  {currentTemplate.perguntasEspecificas.length} Questões
                </span>
              </div>

              {currentTemplate.perguntasEspecificas.length === 0 ? (
                <p className="text-xs text-gray-400 py-3 italic">
                  Este procedimento não possui perguntas específicas cadastradas no modelo.
                </p>
              ) : (
                <div className="space-y-4 divide-y divide-gray-100/60">
                  {currentTemplate.perguntasEspecificas.map((q) => (
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
              )}
            </div>
          )}

          {/* SECTION 4: FOTOS CLÍNICAS (Foto do Doutor e Foto do Paciente) */}
          {(currentTemplate?.tem_foto || currentTemplate?.fotoModeloUrl) && (
            <div className="bg-white p-4 sm:p-5 rounded-sm border border-emerald-200/80 shadow-2xs space-y-4 bg-gradient-to-br from-white to-emerald-50/20">
              <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-xs bg-emerald-100 text-emerald-800 flex items-center justify-center">
                    <Camera className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-widest text-emerald-950">
                      4. Fotos de Mapeamento & Registro Clínico
                    </h4>
                    <p className="text-[11px] text-gray-500">
                      A foto de referência do doutor e a foto do paciente saem impressas ou no tablet para anotações manuais (unidades, doses, vetores).
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* 1. Foto do Doutor / Mapa de Referência */}
                {currentTemplate?.fotoModeloUrl && (
                  <div className="p-3 bg-white rounded-sm border border-gray-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#1A1A1A]">
                        Foto de Referência da Dra. / Clínica
                      </span>
                      <span className="text-[10px] text-purple-700 bg-purple-50 px-2 py-0.5 rounded-xs font-semibold border border-purple-200">
                        Modelo
                      </span>
                    </div>
                    <div className="w-full h-44 rounded-xs overflow-hidden border border-gray-200 bg-[#FAF9F6] flex items-center justify-center">
                      <img
                        src={currentTemplate.fotoModeloUrl}
                        alt="Foto de referência do doutor"
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <p className="text-[10px] text-gray-400 text-center italic">
                      Guia anatômico configurado para {currentTemplate.procedimentoNome}
                    </p>
                  </div>
                )}

                {/* 2. Foto do Paciente */}
                {currentTemplate?.tem_foto && (
                  <div className={`p-3 bg-white rounded-sm border border-emerald-200 space-y-2 ${!currentTemplate?.fotoModeloUrl ? 'sm:col-span-2' : ''}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-900">
                        Foto Real do Paciente (Opcional)
                      </span>
                      <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-xs font-semibold border border-emerald-200">
                        Prontuário
                      </span>
                    </div>

                    {fotoUrl ? (
                      <div className="space-y-2">
                        <div className="relative w-full h-44 rounded-xs overflow-hidden border border-gray-200 bg-black/5 flex items-center justify-center">
                          <img
                            src={fotoUrl}
                            alt="Foto do paciente"
                            className="w-full h-full object-contain"
                          />
                        </div>
                        <div className="flex items-center justify-between pt-1">
                          <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Foto do paciente anexada
                          </span>
                          <div className="flex items-center gap-2">
                            <label className="cursor-pointer text-[11px] font-semibold text-[#A67C52] hover:underline">
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
                              onClick={() => setFotoUrl('')}
                              className="text-[11px] text-red-600 hover:underline"
                            >
                              Remover
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <label className="cursor-pointer flex flex-col items-center justify-center p-4 border-2 border-dashed border-emerald-300/80 hover:border-emerald-500 rounded-sm bg-emerald-50/20 hover:bg-emerald-50/40 transition-all text-center group h-44">
                        <Camera className="w-6 h-6 text-emerald-600 group-hover:scale-105 transition-transform mb-1.5" />
                        <span className="text-xs font-bold text-emerald-950 group-hover:text-emerald-700">
                          Tirar ou Selecionar Foto do Paciente
                        </span>
                        <span className="text-[10px] text-gray-500 mt-0.5">
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
          <div className="bg-white p-4 sm:p-5 rounded-sm border border-gray-200/80 shadow-2xs space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-widest text-[#1A1A1A]">
              5. Observações Finais & Conduta do Atendimento
            </h4>
            <textarea
              rows={3}
              value={observacoesFinais}
              onChange={(e) => setObservacoesFinais(e.target.value)}
              placeholder="Ex: Paciente bem orientada quanto aos cuidados pós-procedimento. Retorno agendado em 15 dias para conferência de simetria..."
              className="w-full px-3 py-2 text-xs rounded-sm bg-[#FAF9F6] border border-gray-200 text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
            />
          </div>
        </div>

        {/* Modal Bottom Actions */}
        <div className="px-6 py-4 bg-white border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 rounded-sm border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
          >
            Cancelar
          </button>

          <div className="w-full sm:w-auto flex items-center gap-2">
            <button
              type="button"
              disabled={isSaving}
              onClick={() => handleSaveForm(false)}
              className="flex-1 sm:flex-initial px-5 py-2 rounded-sm bg-white border border-gray-300 text-xs font-semibold text-gray-800 hover:border-[#A67C52] hover:text-[#A67C52] uppercase tracking-wider transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Gravando...' : 'Salvar Ficha'}
            </button>

            <button
              type="button"
              disabled={isSaving}
              onClick={() => handleSaveForm(true)}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-6 py-2 rounded-sm bg-[#1A1A1A] text-[#C49B74] text-xs font-semibold uppercase tracking-wider hover:bg-black shadow-xs active:scale-95 transition-all disabled:opacity-50"
            >
              <Printer className="w-3.5 h-3.5" />
              {isSaving ? 'Processando...' : 'Salvar & Gerar PDF'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect, useMemo } from 'react';
import {
  Patient,
  PatientGender,
  AnamnesisTemplate,
  AnamnesisQuestion,
  AnamnesisRecord,
  ClinicProfile,
  LaserAreaRef,
  Procedure,
} from '../../types';
import { downscaleImage } from '../../utils/imageCompressor';
import { subirImagemOuManter } from '../../services/imageStorage';
import { resolveTemplatePhoto } from '../../utils/genderPhoto';
import { resolveOrientationImage } from '../../utils/orientationImage';
import { resolveConsentTerm } from '../../utils/consentTerm';
import { isDuplicateIdentQuestion } from '../../utils/anamnesisQuestions';
import { QuestionFieldRenderer } from './QuestionFieldRenderer';
import { OrientationImageCard } from './OrientationImageCard';
import { ConsentTermView } from './ConsentTermView';
import { PhotoAnnotationEditor } from './PhotoAnnotationEditor';
import { ShareAnamnesisLinkModal } from './ShareAnamnesisLinkModal';
import { LaserAreaPicker } from '../laser/LaserAreaPicker';
import { ehTemplateDeLaser } from '../../utils/templateMatching';
import { SidePanel } from '../common/SidePanel';
import { ConfirmDialog, ConfirmRequest, aviso } from '../ConfirmDialog';
import { listarNomesDeAreas, montarEspelhoPublico } from '../../utils/laserAreas';
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
  Share2,
  Scan,
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
    <label className="block text-[13px] font-semibold text-ink mb-1.5">
      Gênero <span className="text-muted font-normal">(define a foto de referência)</span>
    </label>
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange('feminino')}
        className={`flex-1 h-11 rounded-xl text-[14px] font-semibold transition-colors border ${
          value === 'feminino'
            ? 'bg-ink text-white border-ink'
            : `bg-white text-ink-soft hover:border-brand/40 ${error ? 'border-danger' : 'border-[rgba(26,26,26,.12)]'}`
        }`}
      >
        Feminino
      </button>
      <button
        type="button"
        onClick={() => onChange('masculino')}
        className={`flex-1 h-11 rounded-xl text-[14px] font-semibold transition-colors border ${
          value === 'masculino'
            ? 'bg-ink text-white border-ink'
            : `bg-white text-ink-soft hover:border-brand/40 ${error ? 'border-danger' : 'border-[rgba(26,26,26,.12)]'}`
        }`}
      >
        Masculino
      </button>
    </div>
    {error && <p className="text-[13px] text-danger mt-1">{error}</p>}
  </div>
);

/** Pequena pílula indicando que a pergunta é de uso exclusivo da equipe clínica. */
const StaffOnlyPill: React.FC = () => (
  <span className="inline-block text-body font-semibold text-[#4338CA] bg-[#EEF2FF] px-2 py-0.5 rounded-full border border-[#E0E7FF] ml-2 align-middle">
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
  /** Catálogo — o mapa corporal do laser é montado a partir dele. */
  catalogProcedures: Procedure[];
  initialPatientId?: string;
  initialTemplateId?: string;
  /**
   * Área do laser que já entra marcada no manequim — o `procedureId` do card que abriu esta ficha.
   *
   * Existe porque a ficha de laser é uma só para as treze regiões: sem isto, clicar "Anamnese" em
   * "Virilha Completa" e em "Axilas" abriria a mesma tela vazia, e a escolha feita no catálogo se
   * perderia no caminho.
   */
  initialAreaLaserId?: string;
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
  catalogProcedures,
  initialPatientId,
  initialTemplateId,
  initialAreaLaserId,
  onSavePatient,
  onSaveRecord,
  onOpenRecordDetail,
}) => {
  // Patient selection or creation
  const [confirmacao, setConfirmacao] = useState<ConfirmRequest | null>(null);
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

  // "Link pro paciente": o mesmo atendimento não pode ser preenchido aqui e pelo paciente online,
  // senão viram duas fichas. Por isso, assim que o link sai, este formulário se encerra — mas só
  // ao fechar a folha de compartilhamento, para dar tempo de copiar, conferir e mandar de novo.
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [linkFoiCompartilhado, setLinkFoiCompartilhado] = useState(false);

  // O modal devolve `null` quando fechado, mas nunca desmonta — o componente fica sempre no JSX
  // do módulo. Isso congela os valores iniciais dos useState na primeira montagem: sem sincronizar
  // a cada abertura, tocar "Anamnese" num card do catálogo abriria sempre a primeira ficha da
  // lista em vez da ficha do procedimento clicado.
  useEffect(() => {
    if (!isOpen) return;
    setSelectedTemplateId(initialTemplateId || templates[0]?.id || '');
    if (initialPatientId) {
      setPatientMode('select');
      setSelectedPatientId(initialPatientId);
    }
    setAreasConfirmadas(new Set(initialAreaLaserId ? [initialAreaLaserId] : []));
    setLinkFoiCompartilhado(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialTemplateId, initialPatientId, initialAreaLaserId]);

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
  /**
   * Áreas marcadas pela profissional no atendimento — a conduta, não o pedido.
   *
   * O mapa é montado a partir do catálogo em memória (esta tela é autenticada), pela mesma função
   * que gera o espelho público, para que a profissional veja exatamente o mesmo desenho que a
   * paciente viu no link.
   */
  const ehFichaDeLaser = ehTemplateDeLaser(currentTemplate);
  const mapaCorporal = useMemo(
    () => montarEspelhoPublico(catalogProcedures, clinicProfile),
    [catalogProcedures, clinicProfile]
  );
  const [areasConfirmadas, setAreasConfirmadas] = useState<Set<string>>(new Set());

  const alternarAreaConfirmada = (procedureId: string) =>
    setAreasConfirmadas((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(procedureId)) proximo.delete(procedureId);
      else proximo.add(procedureId);
      return proximo;
    });

  const refsConfirmadas: LaserAreaRef[] = mapaCorporal.areas
    .filter((a) => areasConfirmadas.has(a.procedureId))
    .map((a) => ({ procedureId: a.procedureId, nomeCurto: a.nomeCurto }));

  const nomesDasAreasConfirmadas = listarNomesDeAreas(refsConfirmadas);

  const previewFotoModelo = currentTemplate ? resolveTemplatePhoto(currentTemplate, currentGenero || undefined) : undefined;
  const orientationImage = resolveOrientationImage(currentTemplate);
  const consentSections = resolveConsentTerm(currentTemplate);

  if (!isOpen) return null;

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const compressed = await downscaleImage(file);
      setFotoUrl(await subirImagemOuManter(compressed, 'anamnese/fotos-pacientes'));
      setFotoAnotadaUrl('');
      setFotoAnotacoesJson(undefined);
    } catch (err) {
      console.error(err);
      setConfirmacao(aviso('Não foi possível usar essa foto', 'Falha ao processar a imagem. Tente outra foto.', 'perigo'));
    }
  };

  const handleSaveAnnotation = async (dataUrl: string, annotationsJson: string) => {
    // A imagem "achatada" com as anotações é uma segunda foto do mesmo tamanho da original — é ela
    // que fazia uma ficha anotada dobrar de peso dentro do documento.
    setFotoAnotadaUrl(await subirImagemOuManter(dataUrl, 'anamnese/fotos-anotadas'));
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
      setConfirmacao(
        aviso(
          'Faltam campos obrigatórios',
          'Confira paciente, procedimento e profissional responsável antes de salvar.'
        )
      );
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

      // Rede de segurança para a ficha-modelo que ainda não passou pela migração que move as
      // perguntas da profissional para a ficha de avaliação (ela roda no boot, mas pode falhar
      // por rede ou cota). Depois da migração isto resulta sempre em `{}` — e é de propósito que
      // continue aqui: sem ele, uma resposta dada numa máquina antes da migração se perderia.
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
        // `encerradaEm` e não `profissionalPreenchidoEm`: a ficha nasce fechada para o link da
        // paciente (ela acabou de preenchê-la na clínica, na frente da equipe), mas fechada de um
        // jeito que a equipe consegue reabrir. `profissionalPreenchidoEm` virou marca de ficha
        // antiga, e escrevê-la aqui faria toda ficha presencial nova parecer legado — travando
        // inclusive o botão de reabrir.
        encerradaEm: new Date().toISOString(),
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
        // Ficha presencial: a profissional é quem marca, então isto é conduta confirmada.
        areasConfirmadas: ehFichaDeLaser && refsConfirmadas.length > 0 ? refsConfirmadas : undefined,
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
      setConfirmacao(aviso('Não foi possível salvar', 'Erro ao salvar a ficha de anamnese. Tente novamente.', 'perigo'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SidePanel
      aberto
      onFechar={onClose}
      titulo="Nova ficha de anamnese"
      sobretitulo={clinicProfile.name || 'La Vie Clinique'}
      largura="larga"
      bloqueado={isSaving}
      /* Escolher a paciente ou a ficha-modelo passa por `change`; anexar foto, não. */
      alterado={!!fotoUrl}
      rodape={
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setIsShareOpen(true)}
            className="w-full sm:w-auto h-[48px] px-4 rounded-xl border border-line text-body-lg font-semibold text-ink-soft hover:border-brand hover:text-brand transition-colors whitespace-nowrap flex items-center justify-center gap-2"
          >
            <Share2 className="w-[18px] h-[18px] shrink-0" />
            Link pro paciente
          </button>

          <div className="w-full sm:w-auto flex items-center gap-2.5">
            <button
              type="button"
              disabled={isSaving}
              onClick={() => handleSaveForm(false)}
              className="flex-1 sm:flex-initial h-[48px] px-5 rounded-xl bg-card border border-line text-body-lg font-semibold text-ink hover:border-brand hover:text-brand transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {isSaving ? 'Gravando...' : 'Salvar ficha'}
            </button>

            <button
              type="button"
              disabled={isSaving}
              onClick={() => handleSaveForm(true)}
              className="flex-1 sm:flex-initial h-[48px] px-6 rounded-xl bg-ink text-brand-light text-body-lg font-semibold flex items-center justify-center gap-2 shadow-xs active:scale-97 transition-all disabled:opacity-50 whitespace-nowrap"
            >
              <Printer className="w-4 h-4" />
              {isSaving ? 'Processando...' : 'Salvar e gerar PDF'}
            </button>
          </div>
        </div>
      }
    >
      <div className="p-4 sm:p-6 space-y-5">
          {/* SECTION 1: PACIENTE & ATENDIMENTO */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[rgba(26,26,26,.07)] space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3 border-b border-[rgba(26,26,26,.07)] pb-3">
              <h4 className="text-[15px] font-semibold text-ink flex items-center gap-2">
                <User className="w-4 h-4 text-brand" />
                1. Identificação do paciente & atendimento
              </h4>

              <div className="flex items-center gap-1 bg-surface p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setPatientMode('select')}
                  className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all ${
                    patientMode === 'select'
                      ? 'bg-white text-ink shadow-xs font-semibold'
                      : 'text-muted hover:text-ink'
                  }`}
                >
                  Paciente cadastrado
                </button>
                <button
                  type="button"
                  onClick={() => setPatientMode('new')}
                  className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all ${
                    patientMode === 'new'
                      ? 'bg-white text-ink shadow-xs font-semibold'
                      : 'text-muted hover:text-ink'
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
                  <label className="block text-[13px] font-semibold text-ink mb-1.5">
                    Selecione o paciente
                  </label>
                  <select
                    value={selectedPatientId}
                    onChange={(e) => setSelectedPatientId(e.target.value)}
                    className={`w-full h-11 px-3 text-[14px] rounded-xl bg-surface border ${
                      errors['patient_select'] ? 'border-danger' : 'border-[rgba(26,26,26,.12)]'
                    } text-ink focus:outline-hidden focus:border-brand font-medium`}
                  >
                    <option value="">-- Escolha um paciente da clínica --</option>
                    {patients.map((pat) => (
                      <option key={pat.id} value={pat.id}>
                        {pat.nome} {pat.contato ? `(${pat.contato})` : ''}
                      </option>
                    ))}
                  </select>
                  {errors['patient_select'] && (
                    <p className="text-[13px] text-danger mt-1">{errors['patient_select']}</p>
                  )}
                </div>

                {selectedPatientId && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-surface rounded-xl">
                    <div>
                      <label className="block text-[13px] font-semibold text-ink mb-1.5 flex items-center gap-1.5">
                        <Music className="w-3.5 h-3.5 text-brand" />
                        Tipo de música
                      </label>
                      <input
                        type="text"
                        value={tipoMusica}
                        onChange={(e) => setTipoMusica(e.target.value)}
                        placeholder="Ex: MPB, Jazz, Pop, Lounge, Clássica..."
                        className="w-full h-11 px-3 text-[14px] rounded-xl bg-white border border-[rgba(26,26,26,.12)] text-ink focus:outline-hidden focus:border-brand"
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 bg-surface rounded-xl">
                <div className="sm:col-span-2">
                  <label className="block text-[13px] font-semibold text-ink mb-1.5">
                    Nome completo
                  </label>
                  <input
                    type="text"
                    value={newPatientName}
                    onChange={(e) => setNewPatientName(e.target.value)}
                    placeholder="Ex: Ana Clara Menezes"
                    className="w-full h-11 px-3 text-[14px] rounded-xl bg-white border border-[rgba(26,26,26,.12)] text-ink focus:outline-hidden focus:border-brand"
                  />
                  {errors['patient_name'] && (
                    <p className="text-[13px] text-danger mt-1">{errors['patient_name']}</p>
                  )}
                </div>

                <div>
                  <label className="block text-[13px] font-semibold text-ink mb-1.5">
                    WhatsApp / telefone
                  </label>
                  <input
                    type="text"
                    value={newPatientPhone}
                    onChange={(e) => setNewPatientPhone(e.target.value)}
                    placeholder="(19) 99999-9999"
                    className="w-full h-11 px-3 text-[14px] rounded-xl bg-white border border-[rgba(26,26,26,.12)] text-ink focus:outline-hidden focus:border-brand"
                  />
                </div>

                <div>
                  <label className="block text-[13px] font-semibold text-ink mb-1.5">
                    Data de nascimento
                  </label>
                  <input
                    type="date"
                    value={newPatientBirth}
                    onChange={(e) => setNewPatientBirth(e.target.value)}
                    className="w-full h-11 px-3 text-[14px] rounded-xl bg-white border border-[rgba(26,26,26,.12)] text-ink focus:outline-hidden focus:border-brand"
                  />
                </div>

                <div>
                  <label className="block text-[13px] font-semibold text-ink mb-1.5 flex items-center gap-1.5">
                    <Music className="w-3.5 h-3.5 text-brand" />
                    Tipo de música
                  </label>
                  <input
                    type="text"
                    value={tipoMusica}
                    onChange={(e) => setTipoMusica(e.target.value)}
                    placeholder="Ex: MPB, Jazz, Pop, Lounge, Clássica..."
                    className="w-full h-11 px-3 text-[14px] rounded-xl bg-white border border-[rgba(26,26,26,.12)] text-ink focus:outline-hidden focus:border-brand"
                  />
                </div>

                <div>
                  <label className="block text-[13px] font-semibold text-ink mb-1.5 flex items-center gap-1.5">
                    <IdCard className="w-3.5 h-3.5 text-brand" />
                    CPF <span className="text-muted font-normal">(opcional)</span>
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={newPatientCpf}
                    onChange={(e) => setNewPatientCpf(formatCpf(e.target.value))}
                    placeholder="000.000.000-00"
                    className="w-full h-11 px-3 text-[14px] rounded-xl bg-white border border-[rgba(26,26,26,.12)] text-ink focus:outline-hidden focus:border-brand"
                  />
                </div>

                <div>
                  <label className="block text-[13px] font-semibold text-ink mb-1.5">
                    E-mail
                  </label>
                  <input
                    type="email"
                    value={newPatientEmail}
                    onChange={(e) => setNewPatientEmail(e.target.value)}
                    placeholder="paciente@exemplo.com"
                    className="w-full h-11 px-3 text-[14px] rounded-xl bg-white border border-[rgba(26,26,26,.12)] text-ink focus:outline-hidden focus:border-brand"
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
                <label className="block text-[13px] font-semibold text-ink mb-1.5">
                  Procedimento / ficha
                </label>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="w-full h-11 px-3 text-[14px] rounded-xl bg-surface border border-[rgba(26,26,26,.12)] text-ink focus:outline-hidden focus:border-brand font-semibold"
                >
                  {templates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.procedimentoNome}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[13px] font-semibold text-ink mb-1.5">
                  Data do atendimento
                </label>
                <input
                  type="date"
                  value={dataAtendimento}
                  onChange={(e) => setDataAtendimento(e.target.value)}
                  className="w-full h-11 px-3 text-[14px] rounded-xl bg-surface border border-[rgba(26,26,26,.12)] text-ink focus:outline-hidden focus:border-brand"
                />
              </div>

              <div>
                <label className="block text-[13px] font-semibold text-ink mb-1.5">
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
                  className={`w-full h-11 px-3 text-[14px] rounded-xl bg-surface border ${
                    errors['professional'] ? 'border-danger' : 'border-[rgba(26,26,26,.12)]'
                  } text-ink focus:outline-hidden focus:border-brand`}
                >
                  <option value="">-- Selecione o profissional --</option>
                  {clinicProfile.professionals?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                {errors['professional'] && (
                  <p className="text-[13px] text-danger mt-1">{errors['professional']}</p>
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

          {/* TERMO DE CONSENTIMENTO — logo abaixo das perguntas gerais, como no formulário online */}
          {consentSections && <ConsentTermView sections={consentSections} />}

          {/* ÁREAS DO LASER — só nas fichas de depilação a laser */}
          {ehFichaDeLaser && (
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[rgba(26,26,26,.07)] space-y-3">
              <div className="border-b border-[rgba(26,26,26,.07)] pb-3">
                <h4 className="text-[15px] font-semibold text-ink flex items-center gap-2">
                  <Scan className="w-4 h-4 text-brand" />
                  Áreas a tratar
                </h4>
                <p className="text-[13px] text-muted mt-0.5">
                  Marque as regiões desta sessão. Fica gravado como a conduta da profissional,
                  separado do que a paciente pediu pelo link.
                </p>
              </div>

              <LaserAreaPicker
                mapa={mapaCorporal}
                selecionadas={areasConfirmadas}
                onToggle={alternarAreaConfirmada}
                alturaManequim={460}
                vazioMensagem="Nenhum procedimento de laser tem área desenhada ainda. Configure o mapa no cadastro de procedimentos."
              />

              {areasConfirmadas.size > 0 && (
                <p className="text-[13px] text-ink bg-[#E4F5EA] border border-[#BFE3CB] rounded-xl px-3 py-2 leading-snug">
                  <strong>{areasConfirmadas.size}</strong>{' '}
                  {areasConfirmadas.size === 1 ? 'área' : 'áreas'}: {nomesDasAreasConfirmadas}
                </p>
              )}
            </div>
          )}

          {/* SECTION 2: PERGUNTAS ESPECÍFICAS DO PROCEDIMENTO */}
          {currentTemplate && (
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[rgba(26,26,26,.07)] space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2 border-b border-[rgba(26,26,26,.07)] pb-3">
                <div>
                  <h4 className="text-[15px] font-semibold text-ink flex items-center gap-2">
                    <FileText className="w-4 h-4 text-brand" />
                    2. Avaliação específica — {currentTemplate.procedimentoNome}
                  </h4>
                  {currentTemplate.descricao && (
                    <p className="text-[13px] text-muted mt-1">{currentTemplate.descricao}</p>
                  )}
                </div>
                <span className="text-[12px] text-ink bg-surface px-2.5 py-1 rounded-full font-semibold">
                  {currentTemplate.perguntasEspecificas.length} questões
                </span>
              </div>

              {orientationImage && <OrientationImageCard image={orientationImage} variant="clinica" />}

              {currentTemplate.perguntasEspecificas.length === 0 ? (
                <p className="text-[14px] text-muted py-3 italic">
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
                        className={`pt-4 first:pt-0 ${warning ? '-mx-3 px-3 rounded-xl bg-danger/5' : ''}`}
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
                <h4 className="text-[15px] font-semibold text-ink flex items-center gap-2">
                  <Camera className="w-4 h-4 text-brand" />
                  4. Fotos de mapeamento & registro clínico
                </h4>
                <p className="text-[13px] text-muted mt-1">
                  A foto de referência da clínica e a foto do paciente ficam disponíveis para anotações manuais (unidades, doses, vetores).
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* 1. Foto de Referência da Clínica (escolhida pelo gênero do paciente) */}
                {previewFotoModelo ? (
                  <div className="p-3.5 bg-surface rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[14px] font-semibold text-ink">
                        Referência da clínica
                      </span>
                      <span className="text-body text-ink-soft bg-white px-2 py-0.5 rounded-full font-semibold border border-[rgba(26,26,26,.1)]">
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
                    <p className="text-[12px] text-muted text-center italic">
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
                  <div className={`p-3.5 bg-surface rounded-xl space-y-2 ${!previewFotoModelo ? 'sm:col-span-2' : ''}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[14px] font-semibold text-ink">
                        Foto do paciente
                      </span>
                      <div className="flex items-center gap-1.5">
                        {fotoAnotadaUrl && (
                          <span className="text-body text-[#4338CA] bg-[#EEF2FF] px-2 py-0.5 rounded-full font-semibold border border-[#E0E7FF]">
                            Anotada
                          </span>
                        )}
                        <span className="text-body text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-semibold border border-emerald-200">
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
                            <label className="cursor-pointer text-[13px] font-semibold text-brand hover:underline">
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
                              className="text-[13px] text-danger hover:underline"
                            >
                              Remover
                            </button>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsAnnotatingPhoto(true)}
                          className="w-full h-11 rounded-xl bg-brand text-white text-[14px] font-semibold flex items-center justify-center gap-2 hover:bg-brand-hover active:scale-97 transition-all"
                        >
                          <PenTool className="w-4 h-4" />
                          Anotar foto
                        </button>
                      </div>
                    ) : (
                      <label className="cursor-pointer flex flex-col items-center justify-center h-44 rounded-xl bg-white hover:bg-surface transition-all text-center group" style={{ border: '1.5px dashed rgba(166,124,82,.5)' }}>
                        <Camera className="w-6 h-6 text-brand group-hover:scale-105 transition-transform mb-1.5" />
                        <span className="text-[14px] font-semibold text-brand-hover">
                          Tirar ou selecionar foto do paciente
                        </span>
                        <span className="text-[12px] text-muted mt-0.5">
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
            <h4 className="text-[15px] font-semibold text-ink">
              5. Observações finais & conduta do atendimento
            </h4>
            <textarea
              rows={3}
              value={observacoesFinais}
              onChange={(e) => setObservacoesFinais(e.target.value)}
              placeholder="Ex: Paciente bem orientada quanto aos cuidados pós-procedimento. Retorno agendado em 15 dias para conferência de simetria..."
              className="w-full min-h-[120px] px-3.5 py-3 text-[14px] rounded-xl bg-surface border border-[rgba(26,26,26,.12)] text-ink focus:outline-hidden focus:border-brand resize-y"
            />
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

      {isShareOpen && (
        <ShareAnamnesisLinkModal
          isOpen={isShareOpen}
          onClose={() => {
            setIsShareOpen(false);
            // Só encerra o preenchimento se o link realmente saiu — abrir e desistir não deve
            // custar o que já foi digitado aqui.
            if (linkFoiCompartilhado) onClose();
          }}
          templates={templates}
          patients={patients}
          clinicProfile={clinicProfile}
          initialTemplateId={selectedTemplateId}
          // Em "novo paciente" ainda não existe ID (o cadastro só grava ao salvar a ficha), então
          // o link sai sem identificar o paciente e ele se identifica ao abrir.
          initialPatientId={patientMode === 'select' ? selectedPatientId || undefined : undefined}
          onShared={() => setLinkFoiCompartilhado(true)}
        />
      )}

      <ConfirmDialog pedido={confirmacao} onFechar={() => setConfirmacao(null)} />
    </SidePanel>
  );
};

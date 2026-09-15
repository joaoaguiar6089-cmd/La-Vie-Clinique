import React, { useRef, useState } from 'react';
import { AnamnesisRecord, AnamnesisQuestion, ClinicProfile, OrientationImage } from '../../types';
import { QuestionFieldRenderer } from './QuestionFieldRenderer';
import { PhotoAnnotationEditor } from './PhotoAnnotationEditor';
import { exportElementAsPDF } from '../../utils/exportHelpers';
import {
  isDuplicateIdentQuestion,
  isMedicoQuestion,
  isPatientQuestion,
} from '../../utils/anamnesisQuestions';
import {
  Printer,
  Download,
  X,
  ShieldCheck,
  Stethoscope,
  Edit3,
  Save,
  Loader2,
  PenTool,
} from 'lucide-react';

interface PrintableAnamnesisSheetProps {
  record: AnamnesisRecord;
  clinicProfile: ClinicProfile;
  onClose: () => void;
  /** 'staff' (default) shows the professional's complementary section and lets it be edited. 'paciente' shows only the patient's own answers, read-only. */
  viewerRole?: 'staff' | 'paciente';
  /** Required when viewerRole is 'staff' — persists the professional's complementary answers. */
  onSaveRecord?: (record: AnamnesisRecord) => Promise<void>;
  /**
   * Imagem orientativa da ficha-modelo que originou este registro, já resolvida pelo chamador
   * (ver `resolveOrientationImage`). Vive no template e não no registro, então quem monta a tela
   * é quem a busca — a ficha só a desenha.
   */
  orientationImage?: OrientationImage | null;
}


function displayValue(q: AnamnesisQuestion, val: any): string {
  if (val === undefined || val === null || val === '') return 'Não informado';
  if (Array.isArray(val)) return val.length > 0 ? val.join(', ') : 'Nenhuma opção selecionada';
  if (typeof val === 'boolean') return val ? 'Sim' : 'Não';
  if (q.tipo_campo === 'escala') return `${val} / ${q.escalaMax || 10}`;
  return String(val);
}

export const PrintableAnamnesisSheet: React.FC<PrintableAnamnesisSheetProps> = ({
  record,
  clinicProfile,
  onClose,
  viewerRole = 'staff',
  onSaveRecord,
  orientationImage,
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isEditingProfissional, setIsEditingProfissional] = useState(false);
  const [isSavingProfissional, setIsSavingProfissional] = useState(false);
  const [professionalIdDraft, setProfessionalIdDraft] = useState(
    record.professionalId || clinicProfile.professionals?.find((p) => p.name === record.profissionalNome)?.id || ''
  );
  const [respostasProfissionalDraft, setRespostasProfissionalDraft] = useState<Record<string, any>>(
    { ...(record.respostasProfissional || {}) }
  );
  const [annotatingTarget, setAnnotatingTarget] = useState<'modelo' | 'paciente' | null>(null);

  const handlePrint = () => {
    window.print();
  };

  const handleSaveAnnotation = async (dataUrl: string, annotationsJson: string) => {
    if (!onSaveRecord || !annotatingTarget) return;
    try {
      const updated: AnamnesisRecord =
        annotatingTarget === 'modelo'
          ? { ...record, fotoModeloAnotadaUrl: dataUrl, fotoModeloAnotacoesJson: annotationsJson }
          : { ...record, fotoPacienteAnotadaUrl: dataUrl, fotoPacienteAnotacoesJson: annotationsJson };
      await onSaveRecord(updated);
      setAnnotatingTarget(null);
    } catch (err) {
      console.error('Erro ao salvar anotações:', err);
      const message = err instanceof Error ? err.message : String(err);
      const isTooLarge = /longer than|exceeds|too large|maximum.*byte/i.test(message);
      alert(
        isTooLarge
          ? 'Esta ficha ficou grande demais para salvar (limite de tamanho do banco de dados) — provavelmente por acumular várias fotos/anotações no mesmo registro. Tente remover alguma foto não essencial desta ficha antes de anotar, ou avise o suporte técnico.'
          : 'Não foi possível salvar as anotações agora. Tente novamente.'
      );
    }
  };

  const handleSavePdf = async () => {
    if (!contentRef.current) return;
    setIsGeneratingPdf(true);
    try {
      const filename = `anamnese-${(record.pacienteNome || 'paciente').toLowerCase().replace(/\s+/g, '-')}-${record.id.slice(-6)}.pdf`;
      await exportElementAsPDF(contentRef.current, filename);
    } catch (err) {
      console.error('Erro ao gerar PDF:', err);
      alert('Não foi possível gerar o PDF agora. Tente novamente em instantes.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleSaveProfissional = async () => {
    if (!onSaveRecord) return;
    setIsSavingProfissional(true);
    try {
      const selectedProfessional = clinicProfile.professionals?.find((p) => p.id === professionalIdDraft);
      const updated: AnamnesisRecord = {
        ...record,
        professionalId: professionalIdDraft || record.professionalId,
        profissionalNome: selectedProfessional?.name || record.profissionalNome,
        respostasProfissional: respostasProfissionalDraft,
        profissionalPreenchidoEm: record.profissionalPreenchidoEm || new Date().toISOString(),
      };
      await onSaveRecord(updated);
      setIsEditingProfissional(false);
    } catch (err) {
      console.error('Erro ao salvar respostas do profissional:', err);
      alert('Não foi possível salvar agora. Tente novamente.');
    } finally {
      setIsSavingProfissional(false);
    }
  };

  const calculateAge = (birthDateStr?: string) => {
    if (!birthDateStr) return null;
    const birth = new Date(birthDateStr);
    if (isNaN(birth.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  const patientAge = calculateAge(record.pacienteDataNascimento);

  const nonDuplicateGeneral = (record.perguntasSnapshot?.gerais || []).filter(
    (q) => !isDuplicateIdentQuestion(q)
  );

  const patientGeneralQuestions = nonDuplicateGeneral.filter(isPatientQuestion);
  const patientSpecificQuestions = (record.perguntasSnapshot?.especificas || []).filter(isPatientQuestion);
  const medicoQuestions = [
    ...nonDuplicateGeneral.filter(isMedicoQuestion),
    ...(record.perguntasSnapshot?.especificas || []).filter(isMedicoQuestion),
  ];

  const isStaff = viewerRole === 'staff';
  const showMedicoSection = isStaff && medicoQuestions.length > 0;
  const referenceImageSrc = (isStaff && record.fotoModeloAnotadaUrl) || record.fotoModeloUrl;
  const patientImageSrc =
    (isStaff && record.fotoPacienteAnotadaUrl) || record.fotoPacienteUrl || record.fotoUrl;

  const professionalName =
    clinicProfile.professionals?.find((p) => p.id === record.professionalId)?.name || record.profissionalNome;
  const hasProfessional = !!professionalName;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 md:p-6 animate-fadeIn">
      {/* Container */}
      <div className="relative w-full max-w-4xl bg-white rounded-sm shadow-2xl overflow-hidden max-h-[96vh] flex flex-col">
        {/* Screen Controls Header (hidden in print) */}
        <div className="px-6 py-3.5 bg-[#1A1A1A] text-white flex items-center justify-between shrink-0 print:hidden gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-[#C49B74] shrink-0" />
            <span className="font-serif-luxury text-sm tracking-wide truncate">
              Ficha Clínica {isStaff ? 'Oficial' : ''} de Anamnese — {record.pacienteNome}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isStaff && (
              <button
                type="button"
                onClick={handlePrint}
                className="hidden sm:flex items-center gap-1.5 px-3.5 py-1.5 rounded-sm bg-white/10 border border-white/20 text-white text-xs font-semibold uppercase tracking-wider hover:bg-white/20 transition-all"
                title="Abrir diálogo de impressão (útil para anotações manuais no papel/tablet)"
              >
                <Printer className="w-4 h-4" />
                Imprimir
              </button>
            )}
            <button
              type="button"
              onClick={handleSavePdf}
              disabled={isGeneratingPdf}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-sm bg-[#A67C52] text-white text-xs font-semibold uppercase tracking-wider hover:bg-[#8e6945] transition-all shadow-xs disabled:opacity-60"
            >
              {isGeneratingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {isGeneratingPdf ? 'Gerando...' : 'Salvar PDF'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-xs text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* PRINTABLE DOCUMENT CONTENT */}
        <div
          ref={contentRef}
          className="flex-1 overflow-y-auto p-6 sm:p-10 text-[#1A1A1A] font-sans bg-white print:p-0 print:overflow-visible"
        >
          {/* Clinic Header */}
          <div className="border-b-2 border-[#1A1A1A] pb-5 mb-6 flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-serif-luxury text-2xl font-bold tracking-tight text-[#1A1A1A]">
                  {clinicProfile.name || 'LA VIE CLINIQUE'}
                </span>
                <span className="text-[10px] font-mono uppercase tracking-widest text-[#A67C52] border-l border-[#A67C52]/40 pl-2">
                  Prontuário & Anamnese
                </span>
              </div>
              <p className="text-xs text-gray-500 italic mt-0.5">
                {clinicProfile.tagline || 'Excelência Médica e Estética Avançada'}
              </p>
              <p className="text-[11px] text-gray-500 mt-1">
                {clinicProfile.address} • {clinicProfile.cityState} • Tel: {clinicProfile.phone}
              </p>
            </div>

            <div className="text-right">
              <span className="inline-block px-3 py-1 bg-gray-100 border border-gray-200 text-xs font-mono font-bold text-[#1A1A1A] rounded-xs">
                FICHA Nº {record.id.slice(-6).toUpperCase()}
              </span>
              <p className="text-[11px] text-gray-500 mt-1 font-medium">
                Data do Atendimento:{' '}
                <span className="font-bold text-[#1A1A1A]">
                  {new Date(record.dataAtendimento + 'T12:00:00Z').toLocaleDateString('pt-BR')}
                </span>
              </p>
            </div>
          </div>

          {/* Patient Info Box */}
          <div className="bg-[#FAF9F6] border border-gray-200 rounded-sm p-4 mb-6 grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
            <div className="sm:col-span-2">
              <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">Paciente</span>
              <span className="text-sm font-bold text-[#1A1A1A] block mt-0.5">{record.pacienteNome}</span>
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">
                Nascimento / Idade
              </span>
              <span className="font-semibold text-gray-800 block mt-0.5">
                {record.pacienteDataNascimento
                  ? `${new Date(record.pacienteDataNascimento + 'T12:00:00Z').toLocaleDateString('pt-BR')} ${
                      patientAge !== null ? `(${patientAge} anos)` : ''
                    }`
                  : 'Não informado'}
              </span>
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">
                Contato / WhatsApp
              </span>
              <span className="font-semibold text-gray-800 block mt-0.5">
                {record.pacienteContato || 'Não informado'}
              </span>
            </div>

            <div className="sm:col-span-2 pt-2 border-t border-gray-200/60">
              <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">
                Preferência Musical
              </span>
              <span className="font-semibold text-gray-800 block mt-0.5">
                {record.respostasGerais?.['gen-musica'] || 'Não informado'}
              </span>
            </div>

            <div className="pt-2 border-t border-gray-200/60">
              <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">
                Procedimento Realizado
              </span>
              <span className="font-serif-luxury text-sm font-bold text-[#A67C52] block mt-0.5">
                {record.procedimentoNome}
              </span>
            </div>

            <div className="pt-2 border-t border-gray-200/60">
              <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">
                Profissional Responsável
              </span>
              <span className="font-semibold text-gray-800 block mt-0.5">
                {professionalName || clinicProfile.professionalName || 'Equipe La Vie'}
              </span>
            </div>
          </div>

          {/* Respostas do Paciente — Outras Perguntas Gerais */}
          {patientGeneralQuestions.length > 0 && (
            <div className="mb-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
                {patientGeneralQuestions.map((q) => (
                  <div key={q.id} className="py-1 border-b border-gray-100">
                    <span className="text-[11px] text-gray-500 block leading-tight">{q.texto}</span>
                    <span className="text-xs font-bold text-[#1A1A1A] block mt-0.5">
                      {displayValue(q, record.respostasGerais[q.id])}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Respostas do Paciente — Avaliação Específica */}
          {patientSpecificQuestions.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center gap-2 border-b border-[#A67C52]/40 pb-1.5 mb-3">
                <span className="w-2 h-2 rounded-full bg-[#A67C52]" />
                <h4 className="font-serif-luxury text-xs font-bold uppercase tracking-wider text-[#1A1A1A]">
                  Avaliação Específica — {record.procedimentoNome} (Respostas do Paciente)
                </h4>
              </div>

              <div className="space-y-2.5">
                {patientSpecificQuestions.map((q, idx) => {
                  const val = record.respostasEspecificas[q.id];
                  const display = displayValue(q, val);
                  const isWarning =
                    (q.tipo_campo === 'sim_nao' && (val === 'Sim' || val === true)) ||
                    (q.tipo_campo === 'escala' && Number(val) >= 7);

                  return (
                    <div
                      key={q.id}
                      className={`p-2.5 rounded-xs border ${
                        isWarning ? 'bg-amber-50/40 border-amber-200/80' : 'bg-white border-gray-200/80'
                      } text-xs`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium text-gray-700 leading-snug">
                          {idx + 1}. {q.texto}
                        </span>
                        {q.obrigatoria && <span className="text-[10px] text-[#A67C52] font-bold">*</span>}
                      </div>
                      <div className="mt-1 font-bold text-[#1A1A1A]">
                        Resposta: <span className={isWarning ? 'text-amber-900' : 'text-[#1A1A1A]'}>{display}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Respostas do Profissional — apenas para a equipe */}
          {isStaff && (
            <div className="mb-6 print:break-inside-avoid">
              <div className="flex items-center justify-between border-b border-indigo-300/60 pb-1.5 mb-3">
                <div className="flex items-center gap-2">
                  <Stethoscope className="w-3.5 h-3.5 text-indigo-700" />
                  <h4 className="font-serif-luxury text-xs font-bold uppercase tracking-wider text-indigo-900">
                    Complemento do Profissional
                  </h4>
                </div>
                {onSaveRecord && medicoQuestions.length > 0 && !isEditingProfissional && (
                  <button
                    type="button"
                    onClick={() => setIsEditingProfissional(true)}
                    className="print:hidden flex items-center gap-1.5 px-3 py-1 rounded-xs bg-indigo-50 border border-indigo-200 text-indigo-700 text-[11px] font-semibold hover:bg-indigo-100 transition-colors"
                  >
                    <Edit3 className="w-3 h-3" />
                    {record.profissionalPreenchidoEm ? 'Editar Respostas' : 'Preencher Respostas'}
                  </button>
                )}
              </div>

              {medicoQuestions.length === 0 ? (
                <p className="text-xs text-gray-400 italic">
                  Esta ficha não possui perguntas exclusivas do profissional configuradas.
                </p>
              ) : isEditingProfissional ? (
                <div className="space-y-4 bg-indigo-50/30 border border-indigo-200 rounded-sm p-4 print:hidden">
                  <div>
                    <label className="block text-xs font-semibold text-gray-800 mb-1">
                      Profissional Responsável
                    </label>
                    <select
                      value={professionalIdDraft}
                      onChange={(e) => setProfessionalIdDraft(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-sm bg-white border border-gray-200 text-[#1A1A1A] focus:outline-hidden focus:border-indigo-400"
                    >
                      <option value="">-- Selecione o profissional --</option>
                      {clinicProfile.professionals?.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-3 divide-y divide-indigo-100">
                    {medicoQuestions.map((q) => (
                      <div key={q.id} className="pt-3 first:pt-0">
                        <QuestionFieldRenderer
                          question={q}
                          value={respostasProfissionalDraft[q.id]}
                          onChange={(val) =>
                            setRespostasProfissionalDraft((prev) => ({ ...prev, [q.id]: val }))
                          }
                        />
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-indigo-200">
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditingProfissional(false);
                        setRespostasProfissionalDraft({ ...(record.respostasProfissional || {}) });
                      }}
                      className="px-3 py-1.5 rounded-sm border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-100"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveProfissional}
                      disabled={isSavingProfissional}
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-sm bg-indigo-700 text-white text-xs font-semibold uppercase tracking-wider hover:bg-indigo-800 transition-colors disabled:opacity-50"
                    >
                      {isSavingProfissional ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      Salvar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {medicoQuestions.map((q, idx) => {
                    const val = (record.respostasProfissional || {})[q.id];
                    return (
                      <div key={q.id} className="p-2.5 rounded-xs border bg-indigo-50/20 border-indigo-100 text-xs">
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium text-gray-700 leading-snug">
                            {idx + 1}. {q.texto}
                          </span>
                        </div>
                        <div className="mt-1 font-bold text-[#1A1A1A]">
                          Resposta: <span>{displayValue(q, val)}</span>
                        </div>
                      </div>
                    );
                  })}
                  {!record.profissionalPreenchidoEm && (
                    <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xs px-2.5 py-1.5">
                      Ainda não complementada pelo profissional.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Imagem orientativa do procedimento — o mesmo material que o paciente viu ao preencher */}
          {orientationImage && (
            <div className="mb-6 page-break-inside-avoid">
              <div className="flex items-center gap-2 border-b border-[#A67C52]/40 pb-1.5 mb-3">
                <span className="w-2 h-2 rounded-full bg-[#A67C52]" />
                <h4 className="font-serif-luxury text-xs font-bold uppercase tracking-wider text-[#1A1A1A]">
                  {orientationImage.titulo || 'Imagem Orientativa'}
                </h4>
              </div>

              {orientationImage.descricao && (
                <p className="text-[11px] text-gray-600 leading-relaxed mb-2.5">{orientationImage.descricao}</p>
              )}

              <div className="border border-gray-200 rounded-sm bg-[#FAF9F6] p-3 flex justify-center">
                {/* Sem caixa de altura fixa: a imagem sai na proporção exata do arquivo enviado, só
                    limitada em altura para não estourar uma página A4 no PDF. */}
                <img
                  src={orientationImage.url}
                  alt={orientationImage.titulo || 'Imagem orientativa do procedimento'}
                  className="block w-full h-auto object-contain rounded-xs"
                  style={{ maxHeight: '1040px' }}
                />
              </div>
            </div>
          )}

          {/* Photos & Digital Annotation — clínica apenas */}
          {(record.fotoModeloUrl || record.fotoModeloAnotadaUrl || record.fotoPacienteUrl || record.fotoUrl) && (
            <div className="mb-6 page-break-inside-avoid">
              <div className="flex items-center gap-2 border-b border-[#A67C52]/40 pb-1.5 mb-3">
                <span className="w-2 h-2 rounded-full bg-[#A67C52]" />
                <h4 className="font-serif-luxury text-xs font-bold uppercase tracking-wider text-[#1A1A1A]">
                  Mapeamento Clínico & Fotos
                </h4>
              </div>

              <div className="space-y-4">
                <div className="flex flex-col items-center gap-4">
                  {(record.fotoModeloUrl || record.fotoModeloAnotadaUrl) && (
                    <div className="w-full max-w-xl border border-gray-200 rounded-sm p-3.5 bg-[#FAF9F6] flex flex-col justify-between">
                      <div className="flex items-center justify-between border-b border-gray-200 pb-1.5 mb-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#1A1A1A]">
                          Referência / Mapeamento
                          {isStaff && record.fotoModeloAnotadaUrl && (
                            <span className="ml-1.5 text-[9px] text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded-xs font-semibold border border-indigo-200 normal-case tracking-normal">
                              Anotada
                            </span>
                          )}
                        </span>
                        {isStaff && onSaveRecord && (
                          <button
                            type="button"
                            onClick={() => setAnnotatingTarget('modelo')}
                            className="print:hidden flex items-center gap-1 px-2 py-1 rounded-xs bg-[#1A1A1A] text-[#C49B74] text-[10px] font-semibold uppercase tracking-wider hover:bg-black transition-colors"
                          >
                            <PenTool className="w-3 h-3" />
                            {record.fotoModeloAnotadaUrl ? 'Editar' : 'Anotar'}
                          </button>
                        )}
                      </div>
                      <div className="w-full h-[308px] sm:h-[346px] border border-gray-300 rounded-xs overflow-hidden bg-white flex items-center justify-center">
                        <img
                          src={referenceImageSrc}
                          alt="Foto de referência, com anotações do profissional quando disponíveis"
                          className="w-full h-full object-contain"
                        />
                      </div>
                    </div>
                  )}

                  {(record.fotoPacienteUrl || record.fotoUrl) && (
                    <div className="w-full max-w-xl border border-gray-200 rounded-sm p-3.5 bg-[#FAF9F6] flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between border-b border-gray-200 pb-1.5 mb-2">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-950">
                            Foto do(a) Paciente
                            {isStaff && record.fotoPacienteAnotadaUrl && (
                              <span className="ml-1.5 text-[9px] text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded-xs font-semibold border border-indigo-200 normal-case tracking-normal">
                                Anotada
                              </span>
                            )}
                          </span>
                          {isStaff && onSaveRecord && (
                            <button
                              type="button"
                              onClick={() => setAnnotatingTarget('paciente')}
                              className="print:hidden flex items-center gap-1 px-2 py-1 rounded-xs bg-[#1A1A1A] text-[#C49B74] text-[10px] font-semibold uppercase tracking-wider hover:bg-black transition-colors"
                            >
                              <PenTool className="w-3 h-3" />
                              {record.fotoPacienteAnotadaUrl ? 'Editar' : 'Anotar'}
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="w-full h-[308px] sm:h-[346px] border border-emerald-300 rounded-xs overflow-hidden bg-white flex items-center justify-center">
                        <img
                          src={patientImageSrc}
                          alt="Foto da paciente, com anotações do profissional quando disponíveis"
                          className="w-full h-full object-contain"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Observações Finais — clínica apenas */}
          {isStaff && record.observacoesFinais && (
            <div className="mb-6 p-3 bg-gray-50 border border-gray-200 rounded-sm text-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 block mb-1">
                Observações Finais & Orientações
              </span>
              <p className="text-gray-800 leading-relaxed font-medium">{record.observacoesFinais}</p>
            </div>
          )}

          {/* Consentimento */}
          <div className="mt-8 pt-4 border-t-2 border-gray-300 page-break-inside-avoid">
            <p className="text-[10px] text-gray-500 leading-relaxed text-justify">
              Declaro que todas as informações prestadas nesta ficha de anamnese são verdadeiras, não tendo omitido
              qualquer fato relevante sobre meu estado de saúde, uso de medicações ou procedimentos prévios. Fui
              devidamente orientado(a) acerca dos cuidados pré e pós-procedimento e autorizo a realização do
              protocolo estético indicado.
            </p>

            {isStaff ? (
              hasProfessional ? (
                <div className="mt-12 text-center">
                  <div className="max-w-[220px] mx-auto">
                    <div className="border-t border-[#1A1A1A] mb-1.5" />
                    <span className="text-xs font-bold text-[#1A1A1A] block">{record.pacienteNome}</span>
                    <span className="text-[10px] text-gray-400 block">Assinatura do(a) Paciente</span>
                  </div>
                  <p className="text-[10px] text-gray-500 mt-6">
                    Profissional responsável: <span className="font-semibold text-[#1A1A1A]">{professionalName}</span>
                    {' • '}
                    {clinicProfile.professionalTitle || 'Biomédica Esteta'} • {clinicProfile.name}
                  </p>
                </div>
              ) : (
                <p className="mt-8 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xs px-3 py-2 text-center">
                  Atribua um profissional responsável a esta ficha para habilitar a área de assinatura.
                </p>
              )
            ) : (
              <div className="mt-10 space-y-2.5">
                {hasProfessional && (
                  <p className="text-[11px] text-gray-500 text-center">
                    Profissional responsável pelo seu atendimento:{' '}
                    <span className="font-semibold text-[#1A1A1A]">{professionalName}</span>
                  </p>
                )}
                <div className="flex items-center gap-2 text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xs px-3 py-2">
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                  Termos aceitos digitalmente por {record.pacienteNome} em{' '}
                  {new Date(record.createdAt).toLocaleDateString('pt-BR')}.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {annotatingTarget === 'modelo' && (record.fotoModeloUrl || record.fotoModeloAnotacoesJson) && (
        <PhotoAnnotationEditor
          imageUrl={record.fotoModeloUrl || ''}
          initialAnnotationsJson={record.fotoModeloAnotacoesJson}
          title={`Anotar Foto de Referência — ${record.pacienteNome}`}
          onSave={handleSaveAnnotation}
          onClose={() => setAnnotatingTarget(null)}
        />
      )}

      {annotatingTarget === 'paciente' &&
        (record.fotoPacienteUrl || record.fotoUrl || record.fotoPacienteAnotacoesJson) && (
          <PhotoAnnotationEditor
            imageUrl={record.fotoPacienteUrl || record.fotoUrl || ''}
            initialAnnotationsJson={record.fotoPacienteAnotacoesJson}
            title={`Anotar Foto do(a) Paciente — ${record.pacienteNome}`}
            onSave={handleSaveAnnotation}
            onClose={() => setAnnotatingTarget(null)}
          />
        )}
    </div>
  );
};

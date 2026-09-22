import React, { useRef, useState } from 'react';
import {
  AnamnesisRecord,
  AnamnesisQuestion,
  ClinicProfile,
  ConsentTermSection,
  OrientationImage,
} from '../../types';
import { PhotoAnnotationEditor } from './PhotoAnnotationEditor';
import { ConsentTermView } from './ConsentTermView';
import { LaserBodyMapView } from '../laser/LaserBodyMapView';
import { listarNomesDeAreas } from '../../utils/laserAreas';
import { exportElementAsPDF } from '../../utils/exportHelpers';
import { subirImagemOuManter } from '../../services/imageStorage';
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
  Loader2,
  PenTool,
} from 'lucide-react';
import { ConfirmDialog, ConfirmRequest, aviso } from '../ConfirmDialog';

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
  /** Blocos do Termo de Consentimento configurados na ficha-modelo (ver `resolveConsentTerm`). */
  consentSections?: ConsentTermSection[] | null;
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
  consentSections,
  mapaCorporal,
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [confirmacao, setConfirmacao] = useState<ConfirmRequest | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [annotatingTarget, setAnnotatingTarget] = useState<'modelo' | 'paciente' | null>(null);

  const handlePrint = () => {
    window.print();
  };

  const handleSaveAnnotation = async (dataUrl: string, annotationsJson: string) => {
    if (!onSaveRecord || !annotatingTarget) return;
    try {
      const url = await subirImagemOuManter(dataUrl, 'anamnese/fotos-anotadas');
      const updated: AnamnesisRecord =
        annotatingTarget === 'modelo'
          ? { ...record, fotoModeloAnotadaUrl: url, fotoModeloAnotacoesJson: annotationsJson }
          : { ...record, fotoPacienteAnotadaUrl: url, fotoPacienteAnotacoesJson: annotationsJson };
      await onSaveRecord(updated);
      setAnnotatingTarget(null);
    } catch (err) {
      console.error('Erro ao salvar anotações:', err);
      const message = err instanceof Error ? err.message : String(err);
      const isTooLarge = /longer than|exceeds|too large|maximum.*byte/i.test(message);
      setConfirmacao(
        aviso(
          'Não foi possível salvar as anotações',
          isTooLarge
            ? 'Esta ficha ficou grande demais para salvar (limite de tamanho do banco de dados) — provavelmente por acumular várias fotos e anotações no mesmo registro. Tente remover alguma foto não essencial desta ficha antes de anotar, ou avise o suporte técnico.'
            : 'Tente novamente em instantes.',
          'perigo'
        )
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
      setConfirmacao(aviso('Não foi possível gerar o PDF', 'Tente novamente em instantes.', 'perigo'));
    } finally {
      setIsGeneratingPdf(false);
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
  /**
   * Bloco **legado**, somente-leitura. As perguntas da profissional saíram da anamnese e viraram
   * `EvaluationRecord` — uma por atendimento, que é a cardinalidade certa para elas.
   *
   * Sobrevive aqui porque fichas assinadas antes da separação têm respostas gravadas, e apagar a
   * exibição apagaria dado clínico da tela. Mas só entra o que foi **respondido**: pergunta em
   * branco que ninguém mais pode responder é só um convite a abrir chamado.
   */
  const medicoRespondidas = [
    ...nonDuplicateGeneral.filter(isMedicoQuestion),
    ...(record.perguntasSnapshot?.especificas || []).filter(isMedicoQuestion),
  ].filter((q) => {
    const v = (record.respostasProfissional || {})[q.id];
    if (v === undefined || v === null) return false;
    if (typeof v === 'string') return v.trim() !== '';
    if (Array.isArray(v)) return v.length > 0;
    return true;
  });

  const isStaff = viewerRole === 'staff';
  const showMedicoSection = isStaff && medicoRespondidas.length > 0;
  const referenceImageSrc = (isStaff && record.fotoModeloAnotadaUrl) || record.fotoModeloUrl;

  // ---- Áreas do laser ----
  const areasSolicitadas = record.areasSolicitadas || [];
  const areasConfirmadas = record.areasConfirmadas || [];
  const temAreasDeLaser = areasSolicitadas.length > 0 || areasConfirmadas.length > 0;

  /**
   * O que é pintado no manequim: a conduta quando existe, senão o pedido.
   *
   * A confirmada vence porque é o que vai ser tratado — mas a solicitada continua impressa por
   * extenso logo ao lado, para o documento preservar o que a paciente pediu mesmo quando as duas
   * divergem.
   */
  const areasParaDesenhar = new Set(
    (areasConfirmadas.length > 0 ? areasConfirmadas : areasSolicitadas).map((a) => a.procedureId)
  );

  const areasDivergem =
    areasConfirmadas.length > 0 &&
    areasSolicitadas.length > 0 &&
    (areasConfirmadas.length !== areasSolicitadas.length ||
      areasConfirmadas.some((c) => !areasSolicitadas.some((s) => s.procedureId === c.procedureId)));
  const patientImageSrc =
    (isStaff && record.fotoPacienteAnotadaUrl) || record.fotoPacienteUrl || record.fotoUrl;

  const professionalName =
    clinicProfile.professionals?.find((p) => p.id === record.professionalId)?.name || record.profissionalNome;
  const hasProfessional = !!professionalName;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 flex items-center justify-center p-2 sm:p-4 md:p-6 animate-fadeIn">
      {/* Container */}
      <div className="relative w-full max-w-4xl bg-white rounded-sm shadow-2xl overflow-hidden max-h-[96vh] flex flex-col">
        {/* Screen Controls Header (hidden in print) */}
        <div className="px-6 py-3.5 bg-ink text-white flex items-center justify-between shrink-0 print:hidden gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-brand-light shrink-0" />
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
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-sm bg-brand text-white text-xs font-semibold uppercase tracking-wider hover:bg-brand-hover transition-all shadow-xs disabled:opacity-60"
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
          className="flex-1 overflow-y-auto p-6 sm:p-10 text-ink font-sans bg-white print:p-0 print:overflow-visible"
        >
          {/* Clinic Header */}
          <div className="border-b-2 border-ink pb-5 mb-6 flex items-start justify-between gap-4">
            <div>
              {/* O documento se apresenta pelo que ele é. Antes o topo trazia só o nome da
                  clínica, e uma folha impressa não dizia de qual procedimento era sem que
                  alguém lesse o corpo dela. O selo "Prontuário & Anamnese" saiu porque o
                  título agora diz a mesma coisa.

                  "La Vie Clinique" é a marca, e vai literal: o nome cadastrado no perfil é a
                  razão social por extenso, longa demais para um título — ela continua logo
                  abaixo, que é onde identifica a clínica. */}
              <h2 className="font-serif-luxury text-2xl font-bold tracking-tight text-ink leading-tight">
                Anamnese - {record.procedimentoNome} - La Vie Clinique
              </h2>
              <p className="text-xs font-semibold text-ink mt-1.5">
                {clinicProfile.name || 'La Vie Clinique'}
              </p>
              <p className="text-xs text-gray-500 italic mt-0.5">
                {clinicProfile.tagline || 'Excelência Médica e Estética Avançada'}
              </p>
              <p className="text-[11px] text-gray-500 mt-1">
                {clinicProfile.address} • {clinicProfile.cityState} • Tel: {clinicProfile.phone}
              </p>
            </div>

            <div className="text-right">
              <span className="inline-block px-3 py-1 bg-gray-100 border border-gray-200 text-xs font-mono font-bold text-ink rounded-xs">
                FICHA Nº {record.id.slice(-6).toUpperCase()}
              </span>
              <p className="text-[11px] text-gray-500 mt-1 font-medium">
                Data do Atendimento:{' '}
                <span className="font-bold text-ink">
                  {new Date(record.dataAtendimento + 'T12:00:00Z').toLocaleDateString('pt-BR')}
                </span>
              </p>
            </div>
          </div>

          {/* Patient Info Box */}
          <div className="bg-surface border border-gray-200 rounded-sm p-4 mb-6 grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
            <div className="sm:col-span-2">
              <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">Paciente</span>
              <span className="text-sm font-bold text-ink block mt-0.5">{record.pacienteNome}</span>
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
              <span className="font-serif-luxury text-sm font-bold text-brand block mt-0.5">
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

          {/*
            Áreas do laser — logo abaixo da identificação, porque numa ficha de depilação é a
            informação que a profissional procura primeiro no atendimento.

            O manequim sai como SVG em linha (não imagem rasterizada): o registro já carrega foto
            de referência, foto do paciente e as versões anotadas, e tem o teto de 1 MB do
            Firestore para respeitar. A lista por extenso acompanha porque desenho não se lê em voz
            alta nem se copia para uma mensagem.
          */}
          {temAreasDeLaser && (
            <div className="mb-6">
              <h3 className="text-[11px] font-semibold uppercase tracking-widest text-brand border-b border-[rgba(26,26,26,.12)] pb-1 mb-3">
                Áreas de depilação a laser
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-5 items-start">
                <div className="space-y-2.5">
                  {areasSolicitadas.length > 0 && (
                    <div>
                      <span className="block text-[10px] uppercase tracking-wider text-muted">
                        Solicitadas pela paciente
                      </span>
                      <span className="text-[13px] text-ink">
                        {listarNomesDeAreas(areasSolicitadas)}
                      </span>
                    </div>
                  )}

                  {areasConfirmadas.length > 0 && (
                    <div>
                      <span className="block text-[10px] uppercase tracking-wider text-muted">
                        Confirmadas para tratamento
                      </span>
                      <span className="text-[13px] font-semibold text-ink">
                        {listarNomesDeAreas(areasConfirmadas)}
                      </span>
                    </div>
                  )}

                  {areasDivergem && (
                    <p className="text-[11px] text-warn bg-warn-bg border border-[#F0DCB4] rounded-sm px-2.5 py-1.5 leading-snug">
                      A conduta difere do que a paciente pediu pelo link. As duas listas ficam
                      registradas.
                    </p>
                  )}
                </div>

                {mapaCorporal && (
                  <div className="flex gap-3 shrink-0">
                    {(['frente', 'costas'] as const).map((vista) => {
                      const daVista = mapaCorporal.areas.filter((a) => a.vista === vista);
                      const imagem =
                        vista === 'frente'
                          ? mapaCorporal.manequimFrenteUrl
                          : mapaCorporal.manequimCostasUrl;
                      // Uma vista sem área marcada é só um boneco em branco ocupando papel.
                      if (!imagem || !daVista.some((a) => areasParaDesenhar.has(a.procedureId))) {
                        return null;
                      }
                      return (
                        <div key={vista} className="text-center">
                          <LaserBodyMapView
                            imagemUrl={imagem}
                            areas={daVista.map((a) => ({
                              chave: a.procedureId,
                              nomeCurto: a.nomeCurto,
                              area: { id: a.procedureId, vista: a.vista, formas: a.formas },
                            }))}
                            selecionadas={areasParaDesenhar}
                            alturaManequim={210}
                            ocultarBotoes
                          />
                          <span className="block text-[9px] uppercase tracking-wider text-muted mt-1">
                            {vista === 'frente' ? 'Frente' : 'Costas'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Respostas do Paciente — Outras Perguntas Gerais */}
          {patientGeneralQuestions.length > 0 && (
            <div className="mb-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
                {patientGeneralQuestions.map((q) => (
                  <div key={q.id} className="py-1 border-b border-gray-100">
                    <span className="text-[11px] text-gray-500 block leading-tight">{q.texto}</span>
                    <span className="text-xs font-bold text-ink block mt-0.5">
                      {displayValue(q, record.respostasGerais[q.id])}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Termo de Consentimento e Responsabilidade — mesma posição da ficha em branco e do
              formulário online: logo abaixo dos dados do paciente e das perguntas gerais. */}
          {consentSections && consentSections.length > 0 && (
            <ConsentTermView sections={consentSections} variant="documento" className="mb-6" />
          )}

          {/* Respostas do Paciente — Avaliação Específica */}
          {patientSpecificQuestions.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center gap-2 border-b border-brand/40 pb-1.5 mb-3">
                <span className="w-2 h-2 rounded-full bg-brand" />
                <h4 className="font-serif-luxury text-xs font-bold uppercase tracking-wider text-ink">
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
                        {q.obrigatoria && <span className="text-[10px] text-brand font-bold">*</span>}
                      </div>
                      <div className="mt-1 font-bold text-ink">
                        Resposta: <span className={isWarning ? 'text-amber-900' : 'text-ink'}>{display}</span>
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
                  <span className="print:hidden text-[9px] uppercase font-bold tracking-wider text-gray-400 border border-gray-200 rounded-xs px-1.5 py-0.5">
                    Registro histórico
                  </span>
                </div>
              </div>

              <p className="print:hidden text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-xs px-2.5 py-1.5 mb-3">
                Estas respostas foram gravadas antes de a avaliação virar ficha própria. Ficam
                preservadas como estão; a avaliação de cada atendimento agora é preenchida em
                Fichas de Avaliação.
              </p>

              <div className="space-y-2.5">
                {medicoRespondidas.map((q, idx) => (
                  <div
                    key={q.id}
                    className="p-2.5 rounded-xs border bg-indigo-50/20 border-indigo-100 text-xs"
                  >
                    <span className="font-medium text-gray-700 leading-snug block">
                      {idx + 1}. {q.texto}
                    </span>
                    <div className="mt-1 font-bold text-ink">
                      Resposta:{' '}
                      <span>{displayValue(q, (record.respostasProfissional || {})[q.id])}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Imagem orientativa do procedimento — o mesmo material que o paciente viu ao preencher */}
          {orientationImage && (
            <div className="mb-6 page-break-inside-avoid">
              <div className="flex items-center gap-2 border-b border-brand/40 pb-1.5 mb-3">
                <span className="w-2 h-2 rounded-full bg-brand" />
                <h4 className="font-serif-luxury text-xs font-bold uppercase tracking-wider text-ink">
                  {orientationImage.titulo || 'Imagem Orientativa'}
                </h4>
              </div>

              {orientationImage.descricao && (
                <p className="text-[11px] text-gray-600 leading-relaxed mb-2.5">{orientationImage.descricao}</p>
              )}

              <div className="border border-gray-200 rounded-sm bg-surface p-3 flex justify-center">
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
              <div className="flex items-center gap-2 border-b border-brand/40 pb-1.5 mb-3">
                <span className="w-2 h-2 rounded-full bg-brand" />
                <h4 className="font-serif-luxury text-xs font-bold uppercase tracking-wider text-ink">
                  Mapeamento Clínico & Fotos
                </h4>
              </div>

              <div className="space-y-4">
                <div className="flex flex-col items-center gap-4">
                  {(record.fotoModeloUrl || record.fotoModeloAnotadaUrl) && (
                    <div className="w-full max-w-xl border border-gray-200 rounded-sm p-3.5 bg-surface flex flex-col justify-between">
                      <div className="flex items-center justify-between border-b border-gray-200 pb-1.5 mb-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-ink">
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
                            className="print:hidden flex items-center gap-1 px-2 py-1 rounded-xs bg-ink text-brand-light text-[10px] font-semibold uppercase tracking-wider hover:bg-black transition-colors"
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
                    <div className="w-full max-w-xl border border-gray-200 rounded-sm p-3.5 bg-surface flex flex-col justify-between">
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
                              className="print:hidden flex items-center gap-1 px-2 py-1 rounded-xs bg-ink text-brand-light text-[10px] font-semibold uppercase tracking-wider hover:bg-black transition-colors"
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
                    <div className="border-t border-ink mb-1.5" />
                    <span className="text-xs font-bold text-ink block">{record.pacienteNome}</span>
                    <span className="text-[10px] text-gray-400 block">Assinatura do(a) Paciente</span>
                  </div>
                  <p className="text-[10px] text-gray-500 mt-6">
                    Profissional responsável: <span className="font-semibold text-ink">{professionalName}</span>
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
                    <span className="font-semibold text-ink">{professionalName}</span>
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
      <ConfirmDialog pedido={confirmacao} onFechar={() => setConfirmacao(null)} />
    </div>
  );
};

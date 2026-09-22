import React, { useMemo, useRef, useState } from 'react';
import { Download, Loader2, Printer, X } from 'lucide-react';
import {
  AnamnesisQuestion,
  ClinicProfile,
  EvaluationRecord,
  EvaluationTemplate,
} from '../../types';
import { exportElementAsPDF } from '../../utils/exportHelpers';
import {
  IdentField,
  QuestionBlock,
  RuledLines,
  SectionHeading,
} from '../anamnesis/printableQuestionBlocks';
import { QuestionFieldRenderer } from '../anamnesis/QuestionFieldRenderer';
import { perguntasDaAvaliacao } from '../../utils/evaluations';
import { formatDateOnly } from '../../utils/formatters';

interface PrintableEvaluationSheetProps {
  ficha?: EvaluationTemplate | null;
  /**
   * A avaliação preenchida. **Ausente = folha em branco**, gerada direto da ficha-modelo para
   * preencher à caneta.
   *
   * É o mesmo componente nos dois casos de propósito: as duas folhas precisam sair iguais, e a
   * única diferença real é se cada pergunta mostra a resposta ou o espaço para escrevê-la. Dois
   * componentes divergiriam em detalhe até deixarem de parecer da mesma clínica.
   */
  registro?: EvaluationRecord | null;
  gerais: AnamnesisQuestion[];
  clinicProfile: ClinicProfile;
  onClose: () => void;
}

export const PrintableEvaluationSheet: React.FC<PrintableEvaluationSheetProps> = ({
  ficha,
  registro,
  gerais,
  clinicProfile,
  onClose,
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [gerandoPdf, setGerandoPdf] = useState(false);

  const emBranco = !registro;

  /**
   * Preenchida, as perguntas vêm do **snapshot** do registro, não da ficha-modelo atual: é isso
   * que impede uma pergunta reescrita hoje de mudar o sentido de uma avaliação de meses atrás.
   * Em branco não há snapshot, então a ficha-modelo é a fonte.
   */
  const perguntas = useMemo(
    () => (registro ? registro.perguntasSnapshot : perguntasDaAvaliacao(gerais, ficha || undefined)),
    [registro, gerais, ficha]
  );

  const titulo = registro?.procedimentoNome || ficha?.nome || 'Avaliação';

  const fotoModelo = registro
    ? registro.fotoModeloAnotadaUrl || registro.fotoModeloUrl
    : ficha?.fotoModeloFemininoUrl || ficha?.fotoModeloUrl || ficha?.fotoModeloMasculinoUrl;

  const fotoSessao = registro
    ? registro.fotoSessaoAnotadaUrl || registro.fotoSessaoUrl
    : undefined;

  const handlePrint = () => window.print();

  const handleSavePdf = async () => {
    if (!contentRef.current) return;
    setGerandoPdf(true);
    try {
      const slug = titulo.toLowerCase().replace(/\s+/g, '-');
      const prefixo = emBranco ? 'avaliacao-em-branco' : 'avaliacao';
      await exportElementAsPDF(contentRef.current, `${prefixo}-${slug}.pdf`);
    } catch (err) {
      console.error('Erro ao gerar PDF da avaliação:', err);
    } finally {
      setGerandoPdf(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 flex items-center justify-center p-2 sm:p-4 md:p-6">
      <div className="relative w-full max-w-4xl bg-white rounded-sm shadow-2xl overflow-hidden max-h-[96vh] flex flex-col">
        {/* Controles — não saem na impressão nem no PDF */}
        <div className="px-6 py-3.5 bg-ink text-white flex items-center justify-between shrink-0 print:hidden gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-brand-light shrink-0" />
            <span className="font-serif-luxury text-sm tracking-wide truncate">
              {emBranco ? 'Avaliação em Branco' : 'Ficha de Avaliação'} — {titulo}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handlePrint}
              className="hidden sm:flex items-center gap-1.5 px-3.5 py-1.5 rounded-sm bg-white/10 border border-white/20 text-white text-xs font-semibold uppercase tracking-wider hover:bg-white/20 transition-all"
            >
              <Printer className="w-4 h-4" />
              Imprimir
            </button>
            <button
              type="button"
              onClick={handleSavePdf}
              disabled={gerandoPdf}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-sm bg-brand text-white text-xs font-semibold uppercase tracking-wider hover:bg-brand-hover transition-all shadow-xs disabled:opacity-60"
            >
              {gerandoPdf ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {gerandoPdf ? 'Gerando...' : 'Salvar PDF'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-xs text-gray-400 hover:text-white transition-colors"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Documento */}
        <div ref={contentRef} className="overflow-y-auto bg-white px-7 sm:px-10 py-8">
          <div className="flex items-start justify-between gap-6 mb-6 pb-4 border-b-2 border-ink">
            <div>
              <h2 className="font-serif-luxury text-2xl font-bold tracking-tight text-ink leading-tight">
                Avaliação - {titulo} - La Vie Clinique
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

            <div className="text-right shrink-0">
              <span className="inline-block px-3 py-1 bg-gray-100 border border-gray-200 text-[10px] font-mono font-bold uppercase tracking-wider text-ink rounded-xs">
                {emBranco ? 'Folha para preenchimento' : 'Preenchida pela equipe'}
              </span>
              {!emBranco && registro && (
                <p className="text-[11px] text-gray-500 mt-3">
                  {formatDateOnly(registro.dataAtendimento)}
                  {registro.profissionalNome ? ` · ${registro.profissionalNome}` : ''}
                </p>
              )}
            </div>
          </div>

          {/* Identificação */}
          {emBranco ? (
            <div className="grid grid-cols-2 gap-x-8 gap-y-3 mb-6">
              <IdentField label="Paciente" />
              <IdentField label="Data do atendimento" />
              <IdentField label="Procedimento" />
              <IdentField label="Profissional responsável" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 mb-6 text-[11px]">
              <div>
                <span className="text-[9px] uppercase font-bold text-gray-400 tracking-wider block">
                  Paciente
                </span>
                <span className="font-semibold text-ink">{registro?.pacienteNome}</span>
              </div>
              <div>
                <span className="text-[9px] uppercase font-bold text-gray-400 tracking-wider block">
                  Data do atendimento
                </span>
                <span className="font-semibold text-ink">
                  {formatDateOnly(registro!.dataAtendimento)}
                </span>
              </div>
              <div>
                <span className="text-[9px] uppercase font-bold text-gray-400 tracking-wider block">
                  Procedimento
                </span>
                <span className="font-semibold text-ink">
                  {registro?.procedimentoNome}
                </span>
              </div>
              <div>
                <span className="text-[9px] uppercase font-bold text-gray-400 tracking-wider block">
                  Profissional responsável
                </span>
                <span className="font-semibold text-ink">
                  {registro?.profissionalNome || '—'}
                </span>
              </div>
            </div>
          )}

          {/* Perguntas */}
          {perguntas.length > 0 && (
            <div className="mb-6">
              <SectionHeading
                title="Avaliação Clínica"
                hint={emBranco ? 'Preenchido pela equipe após o atendimento' : undefined}
              />
              {emBranco
                ? perguntas.map((q, idx) => (
                    <QuestionBlock key={q.id} question={q} index={idx + 1} />
                  ))
                : perguntas.map((q) => (
                    <QuestionFieldRenderer
                      key={q.id}
                      question={q}
                      value={registro?.respostas?.[q.id]}
                      readOnly
                      hideMandatoryAsterisk
                    />
                  ))}
            </div>
          )}

          {/* Mapa anatômico */}
          {fotoModelo && (
            <div className="mb-6 page-break-inside-avoid">
              <SectionHeading
                title="Mapa Anatômico"
                hint={emBranco ? 'Marque à caneta durante o atendimento' : undefined}
              />
              <div className="border border-gray-200 rounded-sm bg-white p-3 flex justify-center">
                <img
                  src={fotoModelo}
                  alt={`Mapa anatômico — ${titulo}`}
                  className="block w-full h-auto object-contain rounded-xs"
                  style={{ maxHeight: '620px' }}
                />
              </div>
            </div>
          )}

          {/* Foto da sessão */}
          {fotoSessao && (
            <div className="mb-6 page-break-inside-avoid">
              <SectionHeading title="Foto desta Sessão" />
              <div className="border border-gray-200 rounded-sm bg-white p-3 flex justify-center">
                <img
                  src={fotoSessao}
                  alt="Foto da sessão"
                  className="block w-full h-auto object-contain rounded-xs"
                  style={{ maxHeight: '620px' }}
                />
              </div>
            </div>
          )}

          {/* Observações */}
          <div className="mb-6 page-break-inside-avoid">
            <SectionHeading title="Observações da Avaliação" />
            {emBranco ? (
              <RuledLines count={5} />
            ) : registro?.observacoes ? (
              <p className="text-[11px] text-ink whitespace-pre-wrap leading-relaxed pt-1.5">
                {registro.observacoes}
              </p>
            ) : (
              <p className="text-[11px] text-gray-400 italic pt-1.5">Nenhuma observação registrada.</p>
            )}
          </div>

          {/* Assinatura */}
          <div className="pt-8 flex justify-end">
            <div className="w-64 text-center">
              <div className="border-b border-gray-500 h-8" />
              <span className="block text-[9px] uppercase font-bold text-gray-400 tracking-wider mt-1">
                Profissional responsável
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

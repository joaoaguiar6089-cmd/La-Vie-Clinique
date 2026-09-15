import React, { useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  ClipboardList,
  Download,
  Eye,
  FileText,
  MessageCircle,
  Plus,
  Receipt,
  Share2,
  Trash2,
} from 'lucide-react';
import {
  AnamnesisQuestion,
  AnamnesisRecord,
  AnamnesisTemplate,
  ClinicProfile,
  Patient,
  Procedure,
  Quote,
  QuoteDraft,
  QuoteStatus,
} from '../../types';
import { formatBRL, formatDate, formatDateOnly } from '../../utils/formatters';
import { buildWhatsAppUrl } from '../../utils/whatsapp';
import { resolveQuoteStatus } from '../../utils/quoteCalc';
import { resolveOrientationImage } from '../../utils/orientationImage';
import { resolveConsentTerm } from '../../utils/consentTerm';
import { ConfirmDialog, ConfirmRequest } from '../ConfirmDialog';
import { AnamnesisFormFillModal } from '../anamnesis/AnamnesisFormFillModal';
import { PrintableAnamnesisSheet } from '../anamnesis/PrintableAnamnesisSheet';
import { QuoteFormModal } from '../quotes/QuoteFormModal';
import { QuotePreviewModal } from '../quotes/QuotePreviewModal';
import { QuoteShareModal } from '../quotes/QuoteShareModal';
import { PatientPersonalDataCard } from './PatientPersonalDataCard';

interface PatientDetailViewProps {
  patient: Patient;
  /** Fichas deste paciente, das mais recentes para as mais antigas. */
  records: AnamnesisRecord[];
  /** Orçamentos deste paciente, dos mais recentes para os mais antigos. */
  quotes: Quote[];
  /** Cadastro completo — o formulário de ficha precisa dele para a busca de paciente. */
  todosPacientes: Patient[];
  templates: AnamnesisTemplate[];
  generalQuestions: AnamnesisQuestion[];
  clinic: ClinicProfile;
  catalogProcedures: Procedure[];
  onVoltar: () => void;
  onSalvarPaciente: (patient: Patient) => Promise<void>;
  onSalvarFicha: (record: AnamnesisRecord) => Promise<void>;
  onExcluirFicha: (recordId: string) => Promise<void>;
  onSalvarOrcamento: (draft: QuoteDraft, existing?: Quote) => Promise<void>;
  onOrcamentoCompartilhado: (quote: Quote) => void;
}

type Aba = 'anamneses' | 'orcamentos';

const STATUS_LABEL: Record<QuoteStatus, string> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  aceito: 'Aceito',
  expirado: 'Expirado',
  cancelado: 'Cancelado',
};

const STATUS_CLASS: Record<QuoteStatus, string> = {
  rascunho: 'bg-gray-100 text-gray-500 border-gray-200',
  enviado: 'bg-[#A67C52]/10 text-[#8E653D] border-[#A67C52]/25',
  aceito: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  expirado: 'bg-amber-50 text-amber-700 border-amber-200',
  cancelado: 'bg-[#1A1A1A] text-[#C49B74] border-[#1A1A1A]',
};

/** A data de atendimento pode estar em "YYYY-MM-DD" ou em ISO completo, conforme a origem da ficha. */
const formatarDataAtendimento = (valor: string): string =>
  valor?.length === 10 ? formatDateOnly(valor) : formatDate(valor);

/**
 * Página de um paciente: os dados pessoais dele no topo (editáveis) e, abaixo, o histórico
 * dividido em anamneses e orçamentos — cada lado com o seu "novo", que já abre o formulário
 * correspondente com o paciente escolhido.
 */
export const PatientDetailView: React.FC<PatientDetailViewProps> = ({
  patient,
  records,
  quotes,
  todosPacientes,
  templates,
  generalQuestions,
  clinic,
  catalogProcedures,
  onVoltar,
  onSalvarPaciente,
  onSalvarFicha,
  onExcluirFicha,
  onSalvarOrcamento,
  onOrcamentoCompartilhado,
}) => {
  const [aba, setAba] = useState<Aba>('anamneses');
  const [confirmacao, setConfirmacao] = useState<ConfirmRequest | null>(null);

  const [fichaModalAberto, setFichaModalAberto] = useState(false);
  const [fichaAberta, setFichaAberta] = useState<AnamnesisRecord | null>(null);
  const [orcamentoModalAberto, setOrcamentoModalAberto] = useState(false);
  const [orcamentoNaPrevia, setOrcamentoNaPrevia] = useState<Quote | null>(null);
  const [orcamentoParaCompartilhar, setOrcamentoParaCompartilhar] = useState<Quote | null>(null);

  const whatsAppUrl = buildWhatsAppUrl(patient.contato);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      {/* Volta para a lista */}
      <button
        type="button"
        onClick={onVoltar}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-[#A67C52] transition-colors mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Todos os pacientes
      </button>

      {/* Cabeçalho */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h1 className="font-serif-luxury text-3xl sm:text-4xl text-[#1A1A1A] break-words">
            {patient.nome}
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            {records.length} anamnese{records.length === 1 ? '' : 's'} · {quotes.length} orçamento
            {quotes.length === 1 ? '' : 's'}
          </p>
        </div>

        {whatsAppUrl && (
          <a
            href={whatsAppUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-sm bg-white/70 border border-emerald-200 text-emerald-700 text-xs font-semibold uppercase tracking-wider hover:bg-emerald-50 transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
            WhatsApp
          </a>
        )}
      </div>

      {/* Dados pessoais */}
      <div className="mb-6">
        <PatientPersonalDataCard patient={patient} onSalvar={onSalvarPaciente} />
      </div>

      {/* Filtro entre anamneses e orçamentos. Quebra em linhas no celular: os dois filtros mais o
          "novo" não cabem lado a lado em 375px, e sem isto a página ganhava rolagem horizontal. */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {(
          [
            { id: 'anamneses' as const, icone: ClipboardList, rotulo: 'Anamneses', total: records.length },
            { id: 'orcamentos' as const, icone: Receipt, rotulo: 'Orçamentos', total: quotes.length },
          ]
        ).map((filtro) => {
          const Icone = filtro.icone;
          const ativo = aba === filtro.id;
          return (
            <button
              key={filtro.id}
              type="button"
              onClick={() => setAba(filtro.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-sm border text-xs font-semibold uppercase tracking-wider transition-colors ${
                ativo
                  ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]'
                  : 'bg-white/60 text-gray-600 border-white/80 hover:bg-white/80'
              }`}
            >
              <Icone className="w-4 h-4" />
              {filtro.rotulo}
              <span
                className={`px-1.5 py-0.5 rounded-xs text-[10px] tabular-nums ${
                  ativo ? 'bg-white/15 text-[#C49B74]' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {filtro.total}
              </span>
            </button>
          );
        })}

        {/* "Novo" acompanha a aba visível — nunca cria a coisa errada por engano */}
        <button
          type="button"
          onClick={() =>
            aba === 'anamneses' ? setFichaModalAberto(true) : setOrcamentoModalAberto(true)
          }
          className="w-full sm:w-auto sm:ml-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-sm bg-[#A67C52] text-white text-xs font-semibold uppercase tracking-wider hover:bg-[#8E653D] transition-colors"
        >
          <Plus className="w-4 h-4" />
          {aba === 'anamneses' ? 'Nova anamnese' : 'Novo orçamento'}
        </button>
      </div>

      {/* Lista de anamneses */}
      {aba === 'anamneses' &&
        (records.length === 0 ? (
          <div className="glass-card rounded-sm py-14 text-center">
            <FileText className="w-8 h-8 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">
              Nenhuma anamnese para {patient.nome.split(' ')[0]} ainda.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {records.map((ficha) => (
              <div
                key={ficha.id}
                className="glass-card glass-card-hover rounded-sm p-4 flex flex-wrap items-center gap-4"
              >
                <div className="flex-1 min-w-[160px]">
                  <p className="text-sm text-[#1A1A1A] truncate">{ficha.procedimentoNome}</p>
                  <p className="flex items-center gap-1.5 text-[11px] text-gray-400 truncate">
                    <Calendar className="w-3 h-3 shrink-0" />
                    {formatarDataAtendimento(ficha.dataAtendimento)}
                    {ficha.profissionalNome && ` · ${ficha.profissionalNome}`}
                  </p>
                </div>

                {ficha.origemPreenchimento === 'online_paciente' && !ficha.profissionalPreenchidoEm && (
                  <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-xs border bg-amber-50 text-amber-700 border-amber-200">
                    Aguardando profissional
                  </span>
                )}

                <div className="flex items-center gap-0.5 ml-auto">
                  <button
                    type="button"
                    onClick={() => setFichaAberta(ficha)}
                    aria-label={`Abrir a ficha de ${ficha.procedimentoNome}`}
                    title="Ver ficha e imprimir"
                    className="p-2 text-gray-400 hover:text-[#A67C52] transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setConfirmacao({
                        titulo: 'Excluir esta ficha?',
                        mensagem: `Ficha de ${ficha.pacienteNome} — ${ficha.procedimentoNome}.\n\nTodas as respostas e anotações registradas nela são apagadas para sempre.`,
                        textoConfirmar: 'Excluir ficha',
                        onConfirmar: () => onExcluirFicha(ficha.id),
                      })
                    }
                    aria-label={`Excluir a ficha de ${ficha.procedimentoNome}`}
                    title="Excluir ficha"
                    className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}

      {/* Lista de orçamentos */}
      {aba === 'orcamentos' &&
        (quotes.length === 0 ? (
          <div className="glass-card rounded-sm py-14 text-center">
            <Receipt className="w-8 h-8 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">
              Nenhum orçamento para {patient.nome.split(' ')[0]} ainda.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {quotes.map((orcamento) => {
              const status = resolveQuoteStatus(orcamento);
              return (
                <div
                  key={orcamento.id}
                  className="glass-card glass-card-hover rounded-sm p-4 flex flex-wrap items-center gap-4"
                >
                  <div className="min-w-[110px]">
                    <p className="font-serif-luxury text-lg text-[#1A1A1A] tabular-nums">
                      {orcamento.numero}
                    </p>
                    <p className="text-[11px] text-gray-400">{formatDate(orcamento.dataEmissao)}</p>
                  </div>

                  <div className="flex-1 min-w-[140px]">
                    <p className="text-sm font-semibold text-[#1A1A1A] tabular-nums">
                      {formatBRL(orcamento.total)}
                    </p>
                    <p className="text-[11px] text-gray-400 truncate">
                      {orcamento.itens.length} procedimento
                      {orcamento.itens.length === 1 ? '' : 's'} · válido até{' '}
                      {formatDate(orcamento.dataValidade)}
                    </p>
                  </div>

                  <span
                    className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-xs border ${STATUS_CLASS[status]}`}
                  >
                    {STATUS_LABEL[status]}
                  </span>

                  <div className="flex items-center gap-0.5 ml-auto">
                    <button
                      type="button"
                      onClick={() => setOrcamentoParaCompartilhar(orcamento)}
                      aria-label={`Compartilhar ${orcamento.numero}`}
                      title="Compartilhar link com a cliente"
                      className="p-2 text-gray-400 hover:text-[#A67C52] transition-colors"
                    >
                      <Share2 className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setOrcamentoNaPrevia(orcamento)}
                      aria-label={`Ver PDF do ${orcamento.numero}`}
                      title="Ver e baixar PDF"
                      className="p-2 text-gray-400 hover:text-[#A67C52] transition-colors"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ))}

      {/* Nova anamnese — já com este paciente escolhido */}
      <AnamnesisFormFillModal
        isOpen={fichaModalAberto}
        onClose={() => setFichaModalAberto(false)}
        patients={todosPacientes}
        templates={templates}
        generalQuestions={generalQuestions}
        clinicProfile={clinic}
        initialPatientId={patient.id}
        onSavePatient={onSalvarPaciente}
        onSaveRecord={onSalvarFicha}
        onOpenRecordDetail={(rec) => setFichaAberta(rec)}
      />

      {/* Ficha aberta para leitura / impressão. A imagem orientativa e o termo vivem na
          ficha-modelo, não no registro — por isso a busca pelo template aqui. */}
      {fichaAberta &&
        (() => {
          const template = templates.find(
            (t) => t.id === (fichaAberta.templateId || fichaAberta.procedimentoId)
          );
          return (
            <PrintableAnamnesisSheet
              record={records.find((r) => r.id === fichaAberta.id) || fichaAberta}
              clinicProfile={clinic}
              onClose={() => setFichaAberta(null)}
              viewerRole="staff"
              onSaveRecord={onSalvarFicha}
              orientationImage={resolveOrientationImage(template)}
              consentSections={resolveConsentTerm(template)}
            />
          );
        })()}

      {/* Novo orçamento — já com este paciente escolhido */}
      <QuoteFormModal
        isOpen={orcamentoModalAberto}
        onClose={() => setOrcamentoModalAberto(false)}
        onSave={onSalvarOrcamento}
        quoteToEdit={null}
        seedFrom={null}
        initialPatient={patient}
        procedures={catalogProcedures}
        patients={todosPacientes}
        clinic={clinic}
      />

      <QuotePreviewModal
        quote={orcamentoNaPrevia}
        clinic={clinic}
        onClose={() => setOrcamentoNaPrevia(null)}
      />

      <QuoteShareModal
        quote={orcamentoParaCompartilhar}
        onClose={() => setOrcamentoParaCompartilhar(null)}
        onCompartilhado={onOrcamentoCompartilhado}
      />

      <ConfirmDialog pedido={confirmacao} onFechar={() => setConfirmacao(null)} />
    </div>
  );
};

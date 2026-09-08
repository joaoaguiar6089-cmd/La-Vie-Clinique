import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  FileText,
  MessageSquare,
  Sparkles,
  Calculator,
  CreditCard,
  Plus,
  AlertCircle,
} from 'lucide-react';
import {
  ClinicProfile,
  Patient,
  PaymentMethod,
  Procedure,
  Quote,
  QuoteDraft,
  QuoteItem,
} from '../../types';
import { formatBRL } from '../../utils/formatters';
import {
  calcularOrcamento,
  calcularDataValidade,
  montarTextoApresentacao,
  sugerirDescontoCombinado,
} from '../../utils/quoteCalc';
import {
  montarItemAvulso,
  montarItemDoProcedimento,
  montarSnapshotClinica,
} from '../../utils/quoteFactory';
import { PatientSearchSelect } from './PatientSearchSelect';
import { ProcedureSearchAdd } from './ProcedureSearchAdd';
import { QuoteItemEditor } from './QuoteItemEditor';

interface QuoteFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (draft: QuoteDraft, existing?: Quote) => void | Promise<void>;
  quoteToEdit?: Quote | null;
  /** Itens iniciais ao duplicar ou substituir um orçamento — o número é novo, o conteúdo vem pronto. */
  seedFrom?: Quote | null;
  procedures: Procedure[];
  patients: Patient[];
  clinic: ClinicProfile;
}

/** `input type="date"` fala YYYY-MM-DD; o documento guarda ISO. */
const toDateInput = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Meio-dia local: evita o campo de data voltar um dia ao virar para UTC. */
const fromDateInput = (value: string): string => {
  if (!value) return '';
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return '';
  return new Date(y, m - 1, d, 12, 0, 0).toISOString();
};

const SectionHeader: React.FC<{ icon: React.ReactNode; children: React.ReactNode }> = ({
  icon,
  children,
}) => (
  <h3 className="text-xs font-semibold uppercase tracking-widest text-[#A67C52] flex items-center gap-1.5 pb-1 border-b border-white/60">
    {icon}
    {children}
  </h3>
);

export const QuoteFormModal: React.FC<QuoteFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  quoteToEdit,
  seedFrom,
  procedures,
  patients,
  clinic,
}) => {
  const professionals = clinic.professionals || [];

  const [dataEmissao, setDataEmissao] = useState('');
  const [dataValidade, setDataValidade] = useState('');
  const [pacienteId, setPacienteId] = useState<string | undefined>(undefined);
  const [pacienteNome, setPacienteNome] = useState('');
  const [pacienteContato, setPacienteContato] = useState('');
  const [jaTeveAvaliacao, setJaTeveAvaliacao] = useState(false);
  const [dataAvaliacao, setDataAvaliacao] = useState('');
  const [professionalId, setProfessionalId] = useState('');
  const [textoApresentacao, setTextoApresentacao] = useState('');
  const [textoEditadoManualmente, setTextoEditadoManualmente] = useState(false);
  const [itens, setItens] = useState<QuoteItem[]>([]);
  const [temDescontoCombinado, setTemDescontoCombinado] = useState(false);
  const [descontoCombinadoPercentual, setDescontoCombinadoPercentual] = useState(0);
  const [forma, setForma] = useState<PaymentMethod>('pix');
  const [parcelas, setParcelas] = useState(1);
  const [pagamentoTemDesconto, setPagamentoTemDesconto] = useState(false);
  const [pagamentoDescontoPercentual, setPagamentoDescontoPercentual] = useState(0);
  const [negociacao, setNegociacao] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  const base = quoteToEdit || seedFrom || null;

  useEffect(() => {
    if (!isOpen) return;

    if (base) {
      const emissao = quoteToEdit ? base.dataEmissao : new Date().toISOString();
      setDataEmissao(emissao);
      setDataValidade(quoteToEdit ? base.dataValidade : calcularDataValidade(emissao, clinic));
      setPacienteId(base.pacienteId);
      setPacienteNome(base.pacienteNome);
      setPacienteContato(base.pacienteContato || '');
      setJaTeveAvaliacao(base.jaTeveAvaliacao);
      setDataAvaliacao(base.dataAvaliacao || '');
      setProfessionalId(base.professionalId);
      setTextoApresentacao(base.textoApresentacao);
      setTextoEditadoManualmente(true);
      setItens(base.itens);
      setTemDescontoCombinado(base.temDescontoCombinado);
      setDescontoCombinadoPercentual(base.descontoCombinadoPercentual || 0);
      setForma(base.pagamento.forma);
      setParcelas(base.pagamento.parcelas || 1);
      setPagamentoTemDesconto(base.pagamento.temDesconto);
      setPagamentoDescontoPercentual(base.pagamento.descontoPercentual || 0);
      setNegociacao(base.pagamento.negociacao || '');
      setObservacoes(base.observacoes || '');
    } else {
      const emissao = new Date().toISOString();
      setDataEmissao(emissao);
      setDataValidade(calcularDataValidade(emissao, clinic));
      setPacienteId(undefined);
      setPacienteNome('');
      setPacienteContato('');
      setJaTeveAvaliacao(false);
      setDataAvaliacao('');
      setProfessionalId(professionals[0]?.id || '');
      setTextoApresentacao('');
      setTextoEditadoManualmente(false);
      setItens([]);
      setTemDescontoCombinado(false);
      setDescontoCombinadoPercentual(0);
      setForma('pix');
      setParcelas(1);
      setPagamentoTemDesconto(false);
      setPagamentoDescontoPercentual(0);
      setNegociacao('');
      setObservacoes('');
    }
    setErrors({});
    setIsSaving(false);
    // `clinic` e `professionals` mudam de referência a cada sync do perfil e
    // reabririam o formulário zerado no meio da edição — por isso ficam de fora
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, quoteToEdit?.id, seedFrom?.id]);

  // A mensagem acompanha o nome enquanto ninguém a editar à mão
  useEffect(() => {
    if (textoEditadoManualmente) return;
    setTextoApresentacao(montarTextoApresentacao(pacienteNome, clinic));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pacienteNome, textoEditadoManualmente]);

  const pagamento = useMemo(
    () => ({
      forma,
      parcelas: forma === 'cartao' ? parcelas : undefined,
      temDesconto: pagamentoTemDesconto,
      descontoPercentual: pagamentoTemDesconto ? pagamentoDescontoPercentual : undefined,
      negociacao: negociacao.trim() || undefined,
    }),
    [forma, parcelas, pagamentoTemDesconto, pagamentoDescontoPercentual, negociacao]
  );

  const totais = useMemo(
    () =>
      calcularOrcamento({
        itens,
        temDescontoCombinado,
        descontoCombinadoPercentual,
        pagamento,
      }),
    [itens, temDescontoCombinado, descontoCombinadoPercentual, pagamento]
  );

  if (!isOpen) return null;

  const addProcedure = (procedure: Procedure) =>
    setItens((prev) => [
      ...prev,
      montarItemDoProcedimento(procedure, professionals, professionalId),
    ]);

  const updateItem = (item: QuoteItem) =>
    setItens((prev) => prev.map((i) => (i.id === item.id ? item : i)));

  const removeItem = (id: string) => setItens((prev) => prev.filter((i) => i.id !== id));

  const moveItem = (index: number, direction: -1 | 1) => {
    setItens((prev) => {
      const destino = index + direction;
      if (destino < 0 || destino >= prev.length) return prev;
      const copia = [...prev];
      [copia[index], copia[destino]] = [copia[destino], copia[index]];
      return copia;
    });
  };

  const handleToggleCombinado = (checked: boolean) => {
    setTemDescontoCombinado(checked);
    if (checked && descontoCombinadoPercentual === 0) {
      setDescontoCombinadoPercentual(sugerirDescontoCombinado(itens.length, clinic));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const novosErros: Record<string, string> = {};

    if (!pacienteNome.trim()) novosErros.paciente = 'Informe a paciente';
    if (!professionalId) novosErros.professional = 'Escolha o profissional responsável';
    if (itens.length === 0) novosErros.itens = 'Adicione ao menos um procedimento';
    if (itens.some((i) => !i.titulo.trim())) novosErros.itens = 'Todo procedimento precisa de um título';
    if (!dataValidade) novosErros.validade = 'Informe a data de validade';
    if (jaTeveAvaliacao && !dataAvaliacao) novosErros.avaliacao = 'Informe a data da avaliação';

    if (Object.keys(novosErros).length > 0) {
      setErrors(novosErros);
      return;
    }

    const profissional = professionals.find((p) => p.id === professionalId);

    const draft: QuoteDraft = {
      dataEmissao,
      dataValidade,
      pacienteId,
      pacienteNome: pacienteNome.trim(),
      pacienteContato: pacienteContato.trim() || undefined,
      jaTeveAvaliacao,
      dataAvaliacao: jaTeveAvaliacao ? dataAvaliacao : undefined,
      professionalId,
      profissionalNome: profissional?.name || '',
      profissionalTitulo: profissional?.specialty || profissional?.title || undefined,
      textoApresentacao: textoApresentacao.trim(),
      itens,
      temDescontoCombinado,
      descontoCombinadoPercentual: temDescontoCombinado ? descontoCombinadoPercentual : undefined,
      pagamento,
      observacoes: observacoes.trim() || undefined,
      clinica: montarSnapshotClinica(clinic),
      total: totais.total,
    };

    try {
      setIsSaving(true);
      await onSave(draft, quoteToEdit || undefined);
      onClose();
    } catch (e) {
      setIsSaving(false);
      // Mostra o motivo real: sem isso, um erro de permissão do Firestore vira
      // "tente de novo" e a pessoa fica repetindo uma ação que nunca vai funcionar
      setErrors({ salvar: `Não foi possível salvar: ${(e as Error).message}` });
    }
  };

  const tituloModal = quoteToEdit
    ? `Editar orçamento ${quoteToEdit.numero}`
    : seedFrom
      ? `Novo orçamento a partir de ${seedFrom.numero}`
      : 'Novo Orçamento';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-fadeIn">
      <div className="relative w-full max-w-3xl bg-[#F9F8F6]/95 backdrop-blur-xl rounded-sm overflow-hidden shadow-2xl border border-white/60 my-6">
        {/* Header */}
        <div className="bg-[#1A1A1A] px-6 sm:px-8 py-5 flex items-start justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#A67C52]">
              Orçamento
            </p>
            <h2 className="text-2xl text-white font-serif-luxury">{tituloModal}</h2>
            {!quoteToEdit && (
              <p className="text-[11px] text-white/50 mt-1">
                O número é gerado ao salvar — abrir e desistir não gasta numeração
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="text-white/60 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-7 max-h-[75vh] overflow-y-auto">
          {/* Seção 1 — Identificação */}
          <div className="space-y-4">
            <SectionHeader icon={<FileText className="w-3.5 h-3.5" />}>Identificação</SectionHeader>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#1A1A1A] mb-1">
                  Data de emissão
                </label>
                <input
                  type="date"
                  value={toDateInput(dataEmissao)}
                  onChange={(e) => setDataEmissao(fromDateInput(e.target.value))}
                  className="w-full glass-input px-3 py-2 rounded-sm text-sm text-[#1A1A1A] focus:outline-hidden"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#1A1A1A] mb-1">
                  Válido até *
                </label>
                <input
                  type="date"
                  value={toDateInput(dataValidade)}
                  onChange={(e) => setDataValidade(fromDateInput(e.target.value))}
                  className="w-full glass-input px-3 py-2 rounded-sm text-sm text-[#1A1A1A] focus:outline-hidden"
                />
                {errors.validade && (
                  <p className="mt-1 text-[11px] text-red-500">{errors.validade}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <PatientSearchSelect
                  patients={patients}
                  pacienteId={pacienteId}
                  pacienteNome={pacienteNome}
                  onSelect={({ id, nome, contato }) => {
                    setPacienteId(id);
                    setPacienteNome(nome);
                    if (contato !== undefined) setPacienteContato(contato);
                  }}
                />
                {errors.paciente && (
                  <p className="mt-1 text-[11px] text-red-500">{errors.paciente}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-[#1A1A1A] mb-1">
                  Contato (WhatsApp)
                </label>
                <input
                  type="text"
                  value={pacienteContato}
                  onChange={(e) => setPacienteContato(e.target.value)}
                  placeholder="(19) 99123-4567"
                  className="w-full glass-input px-3 py-2 rounded-sm text-sm text-[#1A1A1A] focus:outline-hidden"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={jaTeveAvaliacao}
                    onChange={(e) => setJaTeveAvaliacao(e.target.checked)}
                    className="w-3.5 h-3.5 accent-[#A67C52]"
                  />
                  <span className="text-xs font-medium text-[#1A1A1A]">Já teve avaliação</span>
                </label>
                {jaTeveAvaliacao && (
                  <div>
                    <input
                      type="date"
                      value={toDateInput(dataAvaliacao)}
                      onChange={(e) => setDataAvaliacao(fromDateInput(e.target.value))}
                      className="w-full glass-input px-3 py-2 rounded-sm text-sm text-[#1A1A1A] focus:outline-hidden"
                    />
                    {errors.avaliacao && (
                      <p className="mt-1 text-[11px] text-red-500">{errors.avaliacao}</p>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1A1A1A] mb-1">
                  Responsável pelo orçamento *
                </label>
                <select
                  value={professionalId}
                  onChange={(e) => setProfessionalId(e.target.value)}
                  className="w-full glass-input px-3 py-2 rounded-sm text-sm text-[#1A1A1A] focus:outline-hidden"
                >
                  <option value="">Selecione</option>
                  {professionals.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                {errors.professional ? (
                  <p className="mt-1 text-[11px] text-red-500">{errors.professional}</p>
                ) : (
                  <p className="mt-1 text-[11px] text-gray-400">
                    Padrão para os procedimentos novos — cada um pode ter outra profissional
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Seção 2 — Mensagem de abertura */}
          <div className="space-y-3">
            <SectionHeader icon={<MessageSquare className="w-3.5 h-3.5" />}>
              Mensagem de abertura
            </SectionHeader>
            <textarea
              value={textoApresentacao}
              onChange={(e) => {
                setTextoApresentacao(e.target.value);
                setTextoEditadoManualmente(true);
              }}
              rows={3}
              className="w-full glass-input px-3 py-2 rounded-sm text-sm text-[#1A1A1A] focus:outline-hidden resize-y"
            />
            {!textoEditadoManualmente && (
              <p className="text-[11px] text-gray-400">
                Sugestão automática — acompanha o nome da paciente até você editar
              </p>
            )}
          </div>

          {/* Seção 3 — Procedimentos */}
          <div className="space-y-3">
            <SectionHeader icon={<Sparkles className="w-3.5 h-3.5" />}>
              Procedimentos ({itens.length})
            </SectionHeader>

            {errors.itens && (
              <p className="text-[11px] text-red-500 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {errors.itens}
              </p>
            )}

            <div className="space-y-3">
              {itens.map((item, index) => (
                <QuoteItemEditor
                  key={item.id}
                  item={item}
                  index={index}
                  total={itens.length}
                  professionals={professionals}
                  onChange={updateItem}
                  onRemove={() => removeItem(item.id)}
                  onMove={(direction) => moveItem(index, direction)}
                />
              ))}
            </div>

            <div className="flex flex-wrap items-start gap-2">
              <ProcedureSearchAdd procedures={procedures} onAdd={addProcedure} />
              <button
                type="button"
                onClick={() =>
                  setItens((prev) => [...prev, montarItemAvulso(professionals, professionalId)])
                }
                className="px-3 py-1.5 bg-white/60 border border-white/80 text-[#1A1A1A] text-xs font-medium rounded-sm hover:bg-white/80 transition-colors flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Procedimento fora do catálogo
              </button>
            </div>
          </div>

          {/* Seção 4 — Totais */}
          <div className="space-y-3">
            <SectionHeader icon={<Calculator className="w-3.5 h-3.5" />}>Totais</SectionHeader>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={temDescontoCombinado}
                onChange={(e) => handleToggleCombinado(e.target.checked)}
                className="w-3.5 h-3.5 accent-[#A67C52]"
              />
              <span className="text-xs font-medium text-[#1A1A1A]">Desconto plano combinado</span>
            </label>

            {temDescontoCombinado && (
              <div className="flex items-end gap-3">
                <div className="w-32">
                  <label className="block text-[11px] font-medium text-[#1A1A1A] mb-1">
                    Percentual (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={descontoCombinadoPercentual}
                    onChange={(e) => setDescontoCombinadoPercentual(Number(e.target.value) || 0)}
                    className="w-full glass-input px-3 py-1.5 rounded-sm text-sm text-[#1A1A1A] tabular-nums focus:outline-hidden"
                  />
                </div>
                <p className="text-[11px] text-gray-500 pb-2">
                  Sugestão: {sugerirDescontoCombinado(itens.length, clinic)}% para {itens.length}{' '}
                  procedimentos · abate {formatBRL(totais.descontoCombinadoValor)}
                </p>
              </div>
            )}

            <div className="glass-card rounded-sm p-4 space-y-1.5 text-sm tabular-nums">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span>
                <span>{formatBRL(totais.subtotal)}</span>
              </div>
              {temDescontoCombinado && totais.descontoCombinadoValor > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>Desconto plano combinado ({descontoCombinadoPercentual}%)</span>
                  <span>− {formatBRL(totais.descontoCombinadoValor)}</span>
                </div>
              )}
              {pagamentoTemDesconto && forma !== 'cartao' && totais.descontoPagamentoValor > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>Desconto no pagamento ({pagamentoDescontoPercentual}%)</span>
                  <span>− {formatBRL(totais.descontoPagamentoValor)}</span>
                </div>
              )}
              <div className="flex justify-between pt-2 mt-1 border-t border-[#E2DFD8] text-[#1A1A1A] font-semibold">
                <span>Total</span>
                <span className="text-lg font-serif-luxury">{formatBRL(totais.total)}</span>
              </div>
              {totais.descontoEfetivoPercentual > 0 && (
                <p className="text-[11px] text-[#A67C52] pt-1">
                  Desconto efetivo de {totais.descontoEfetivoPercentual.toFixed(1).replace('.', ',')}
                  % sobre os valores de tabela
                </p>
              )}
            </div>
          </div>

          {/* Seção 5 — Pagamento */}
          <div className="space-y-4">
            <SectionHeader icon={<CreditCard className="w-3.5 h-3.5" />}>Pagamento</SectionHeader>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#1A1A1A] mb-1">Forma</label>
                <select
                  value={forma}
                  onChange={(e) => setForma(e.target.value as PaymentMethod)}
                  className="w-full glass-input px-3 py-2 rounded-sm text-sm text-[#1A1A1A] focus:outline-hidden"
                >
                  <option value="pix">Pix</option>
                  <option value="cartao">Cartão de crédito</option>
                  <option value="dinheiro">Dinheiro</option>
                </select>
              </div>

              {forma === 'cartao' && (
                <div>
                  <label className="block text-xs font-medium text-[#1A1A1A] mb-1">Parcelas</label>
                  <select
                    value={parcelas}
                    onChange={(e) => setParcelas(Number(e.target.value))}
                    className="w-full glass-input px-3 py-2 rounded-sm text-sm text-[#1A1A1A] focus:outline-hidden"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n}× sem juros
                      </option>
                    ))}
                  </select>
                  {totais.parcela !== null && (
                    <p className="mt-1 text-[11px] text-[#A67C52] tabular-nums">
                      {parcelas} × {formatBRL(totais.parcela)}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pagamentoTemDesconto}
                  onChange={(e) => setPagamentoTemDesconto(e.target.checked)}
                  className="w-3.5 h-3.5 accent-[#A67C52]"
                />
                <span className="text-xs font-medium text-[#1A1A1A]">
                  Desconto {forma === 'cartao' ? 'para pagamento à vista' : 'no pagamento'}
                </span>
              </label>

              {pagamentoTemDesconto && (
                <div className="flex items-end gap-3">
                  <div className="w-32">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={pagamentoDescontoPercentual}
                      onChange={(e) => setPagamentoDescontoPercentual(Number(e.target.value) || 0)}
                      placeholder="%"
                      className="w-full glass-input px-3 py-1.5 rounded-sm text-sm text-[#1A1A1A] tabular-nums focus:outline-hidden"
                    />
                  </div>
                  <p className="text-[11px] text-gray-500 pb-2">
                    {forma === 'cartao'
                      ? `No PDF: "se preferir Pix ou dinheiro à vista — ${pagamentoDescontoPercentual}% de desconto: ${formatBRL(totais.alternativaAVista || 0)}". O total continua sendo o do cartão.`
                      : `Abatido do total — economia de ${formatBRL(totais.descontoPagamentoValor)}`}
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-[#1A1A1A] mb-1">
                Negociação (opcional)
              </label>
              <textarea
                value={negociacao}
                onChange={(e) => setNegociacao(e.target.value)}
                rows={2}
                placeholder="Entrada de R$ 800,00 no Pix e o restante parcelado..."
                className="w-full glass-input px-3 py-2 rounded-sm text-sm text-[#1A1A1A] focus:outline-hidden resize-y"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#1A1A1A] mb-1">
                Observações (opcional)
              </label>
              <textarea
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                rows={2}
                placeholder="Você pode iniciar por um único procedimento e incluir o outro depois..."
                className="w-full glass-input px-3 py-2 rounded-sm text-sm text-[#1A1A1A] focus:outline-hidden resize-y"
              />
            </div>
          </div>

          {errors.salvar && (
            <p className="text-[11px] text-red-500 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {errors.salvar}
            </p>
          )}

          {/* Rodapé */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/60">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-xs font-semibold uppercase tracking-widest text-gray-500 hover:text-gray-700 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2.5 bg-[#A67C52] text-white text-xs font-semibold uppercase tracking-widest rounded-sm hover:bg-[#8E653D] transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Salvando...' : quoteToEdit ? 'Salvar alterações' : 'Salvar orçamento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { AnamnesisQuestion, QuestionAudience, QuestionFieldType } from '../../types';
import {
  Plus,
  Trash2,
  Edit3,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Check,
  RotateCcw,
  HelpCircle,
  AlertCircle,
  X,
} from 'lucide-react';
import { DEFAULT_GENERAL_QUESTIONS } from '../../data/anamnesisInitialData';

interface GeneralQuestionsManagerProps {
  questions: AnamnesisQuestion[];
  onSaveQuestion: (question: AnamnesisQuestion) => Promise<void>;
  onSaveAllQuestions: (questions: AnamnesisQuestion[]) => Promise<void>;
  onDeleteQuestion: (questionId: string) => Promise<void>;
}

export const GeneralQuestionsManager: React.FC<GeneralQuestionsManagerProps> = ({
  questions,
  onSaveQuestion,
  onSaveAllQuestions,
  onDeleteQuestion,
}) => {
  const [editingQuestion, setEditingQuestion] = useState<AnamnesisQuestion | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form State
  const [texto, setTexto] = useState('');
  const [tipoCampo, setTipoCampo] = useState<QuestionFieldType>('texto_curto');
  const [obrigatoria, setObrigatoria] = useState(true);
  const [ajuda, setAjuda] = useState('');
  const [opcoesInput, setOpcoesInput] = useState('');
  const [escalaMax, setEscalaMax] = useState<number>(10);
  const [publicoAlvo, setPublicoAlvo] = useState<QuestionAudience>('paciente');
  const [formError, setFormError] = useState('');

  const openNewQuestionModal = () => {
    setEditingQuestion(null);
    setTexto('');
    setTipoCampo('texto_curto');
    setObrigatoria(false);
    setAjuda('');
    setOpcoesInput('');
    setEscalaMax(10);
    setPublicoAlvo('paciente');
    setFormError('');
    setIsModalOpen(true);
  };

  const openEditModal = (q: AnamnesisQuestion) => {
    setEditingQuestion(q);
    setTexto(q.texto);
    setTipoCampo(q.tipo_campo);
    setObrigatoria(q.obrigatoria);
    setAjuda(q.ajuda || '');
    setOpcoesInput(q.opcoes ? q.opcoes.join('\n') : '');
    setEscalaMax(q.escalaMax || 10);
    setPublicoAlvo(q.publicoAlvo || 'paciente');
    setFormError('');
    setIsModalOpen(true);
  };

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!texto.trim()) {
      setFormError('Informe o enunciado da pergunta.');
      return;
    }

    // Parse options if required
    let opcoes: string[] | undefined = undefined;
    if (tipoCampo === 'unica_escolha' || tipoCampo === 'multipla_escolha') {
      const parsed = opcoesInput
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      if (parsed.length < 2) {
        setFormError('Informe ao menos 2 opções de resposta (uma por linha).');
        return;
      }
      opcoes = parsed;
    }

    setIsSaving(true);
    try {
      const questionToSave: AnamnesisQuestion = {
        id: editingQuestion ? editingQuestion.id : `gen-${Date.now()}`,
        texto: texto.trim(),
        tipo_campo: tipoCampo,
        obrigatoria,
        ordem: editingQuestion ? editingQuestion.ordem : questions.length + 1,
        ajuda: ajuda.trim() || undefined,
        opcoes,
        escalaMax: tipoCampo === 'escala' ? escalaMax : undefined,
        publicoAlvo,
      };

      await onSaveQuestion(questionToSave);
      setIsModalOpen(false);
    } catch (err) {
      console.error(err);
      setFormError('Erro ao salvar pergunta geral.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleMove = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= questions.length) return;

    const reordered = [...questions];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);

    // Re-assign 'ordem'
    const updated = reordered.map((item, idx) => ({ ...item, ordem: idx + 1 }));
    await onSaveAllQuestions(updated);
  };

  const handleResetDefaults = async () => {
    if (
      window.confirm(
        'Deseja restaurar as perguntas gerais para o padrão da La Vie (Tipo de Música preferido)?'
      )
    ) {
      await onSaveAllQuestions(DEFAULT_GENERAL_QUESTIONS);
    }
  };

  const fieldTypeLabels: Record<QuestionFieldType, string> = {
    texto_curto: 'Texto Curto',
    texto_longo: 'Texto Longo (Parágrafo)',
    numero: 'Numérico',
    data: 'Data',
    unica_escolha: 'Única Escolha (Radio)',
    multipla_escolha: 'Múltipla Escolha (Checkbox)',
    escala: 'Escala Numérica',
    sim_nao: 'Sim / Não',
  };

  return (
    <div className="space-y-6">
      {/* Header card with luxury intro */}
      <div className="bg-white/60 backdrop-blur-md rounded-sm border border-white/80 p-5 sm:p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#A67C52]" />
            <h3 className="font-serif-luxury text-xl font-medium text-[#1A1A1A]">
              Perguntas Gerais Globais
            </h3>
            <span className="px-2 py-0.5 rounded-full bg-[#A67C52]/15 text-[#A67C52] text-[10px] uppercase font-bold tracking-widest">
              Herança Automática
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1 max-w-2xl leading-relaxed">
            Este conjunto de perguntas entra automaticamente no início de toda e qualquer ficha de anamnese
            da La Vie, independente do procedimento clínico selecionado.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="flex-1 md:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 rounded-sm border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:text-[#1A1A1A] hover:bg-gray-50 transition-colors"
            title="Restaurar as 3 perguntas originais padrão"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Restaurar Padrões</span>
          </button>
          <button
            type="button"
            onClick={openNewQuestionModal}
            className="flex-1 md:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 rounded-sm bg-[#A67C52] text-white text-xs font-semibold uppercase tracking-wider hover:bg-[#8e6945] shadow-xs active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4" />
            Nova Pergunta Geral
          </button>
        </div>
      </div>

      {/* Questions List */}
      <div className="bg-white/50 backdrop-blur-md rounded-sm border border-white/70 shadow-xs overflow-hidden">
        <div className="px-5 py-3.5 bg-white/70 border-b border-white/80 flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-widest font-semibold text-gray-500">
            Perguntas Ativas ({questions.length})
          </span>
          <span className="text-[11px] text-gray-400">
            Arraste ou use as setas para alterar a ordem de exibição
          </span>
        </div>

        <div className="divide-y divide-gray-100">
          {questions.map((q, idx) => (
            <div
              key={q.id}
              className="p-4 sm:p-5 flex items-start justify-between gap-4 hover:bg-white/80 transition-colors group"
            >
              <div className="flex items-start gap-3.5 flex-1 min-w-0">
                {/* Index badge */}
                <div className="w-7 h-7 rounded-sm bg-[#1A1A1A] text-[#C49B74] font-mono text-xs font-bold flex items-center justify-center shrink-0 shadow-2xs">
                  {idx + 1}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-semibold text-sm text-[#1A1A1A] leading-snug">
                      {q.texto}
                    </h4>
                    {(q.publicoAlvo || 'paciente') === 'medico' ? (
                      <span className="px-1.5 py-0.5 rounded-xs bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] font-semibold">
                        Médico
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded-xs bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-semibold">
                        Paciente
                      </span>
                    )}
                    {q.obrigatoria ? (
                      <span className="px-1.5 py-0.5 rounded-xs bg-red-50 border border-red-200 text-red-600 text-[10px] font-semibold">
                        Obrigatória
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded-xs bg-gray-100 text-gray-500 text-[10px] font-medium">
                        Opcional
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500 flex-wrap">
                    <span className="px-2 py-0.5 rounded-xs bg-[#A67C52]/10 text-[#A67C52] font-medium text-[11px]">
                      {fieldTypeLabels[q.tipo_campo]}
                    </span>

                    {q.ajuda && <span className="text-gray-400 italic">"{q.ajuda}"</span>}

                    {q.opcoes && q.opcoes.length > 0 && (
                      <span className="text-gray-400 text-[11px]">
                        ({q.opcoes.length} opções cadastradas)
                      </span>
                    )}

                    {q.tipo_campo === 'escala' && (
                      <span className="text-gray-400 text-[11px] font-mono">
                        Escala 1 a {q.escalaMax || 10}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() => handleMove(idx, 'up')}
                  className="p-1.5 rounded-xs text-gray-400 hover:text-[#1A1A1A] hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Subir ordem"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={idx === questions.length - 1}
                  onClick={() => handleMove(idx, 'down')}
                  className="p-1.5 rounded-xs text-gray-400 hover:text-[#1A1A1A] hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Descer ordem"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => openEditModal(q)}
                  className="p-1.5 rounded-xs text-gray-500 hover:text-[#1A1A1A] hover:bg-white transition-colors"
                  title="Editar pergunta"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Deseja remover a pergunta geral "${q.texto}"?`)) {
                      onDeleteQuestion(q.id);
                    }
                  }}
                  className="p-1.5 rounded-xs text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  title="Excluir pergunta"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CREATE / EDIT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-fadeIn">
          <div className="relative w-full max-w-lg bg-[#FAF9F6] rounded-sm border border-white/80 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 bg-[#1A1A1A] text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#C49B74]" />
                <h3 className="font-serif-luxury text-lg font-medium tracking-tight">
                  {editingQuestion ? 'Editar Pergunta Geral' : 'Nova Pergunta Geral'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-xs text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveModal} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-sm text-xs text-red-600 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-800 mb-1">
                  Enunciado da Pergunta *
                </label>
                <input
                  type="text"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder="Ex: Qual seu tipo de música preferido?"
                  className="w-full px-3 py-2 text-xs rounded-sm bg-white border border-gray-200 text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52] focus:ring-1 focus:ring-[#A67C52]"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-800 mb-1">
                    Tipo de Campo de Resposta
                  </label>
                  <select
                    value={tipoCampo}
                    onChange={(e) => setTipoCampo(e.target.value as QuestionFieldType)}
                    className="w-full px-3 py-2 text-xs rounded-sm bg-white border border-gray-200 text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                  >
                    <option value="texto_curto">Texto Curto</option>
                    <option value="texto_longo">Texto Longo (Área de texto)</option>
                    <option value="numero">Número</option>
                    <option value="data">Data</option>
                    <option value="unica_escolha">Única Escolha (Radio)</option>
                    <option value="multipla_escolha">Múltipla Escolha (Checkbox)</option>
                    <option value="escala">Escala Numérica</option>
                    <option value="sim_nao">Sim / Não</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-800 mb-1">
                    Obrigatoriedade
                  </label>
                  <label className="flex items-center gap-2 h-[34px] px-3 rounded-sm bg-white border border-gray-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={obrigatoria}
                      onChange={(e) => setObrigatoria(e.target.checked)}
                      className="accent-[#A67C52] w-4 h-4 rounded-xs"
                    />
                    <span className="text-xs text-gray-700 font-medium">Resposta Obrigatória</span>
                  </label>
                </div>
              </div>

              {/* OPÇÕES (quando unica_escolha ou multipla_escolha) */}
              {(tipoCampo === 'unica_escolha' || tipoCampo === 'multipla_escolha') && (
                <div>
                  <label className="block text-xs font-semibold text-gray-800 mb-1">
                    Opções de Seleção (uma por linha) *
                  </label>
                  <textarea
                    rows={4}
                    value={opcoesInput}
                    onChange={(e) => setOpcoesInput(e.target.value)}
                    placeholder="Opção 1&#10;Opção 2&#10;Opção 3"
                    className="w-full px-3 py-2 text-xs rounded-sm bg-white border border-gray-200 text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52] font-mono"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    Insira cada alternativa de resposta em uma linha separada.
                  </p>
                </div>
              )}

              {/* ESCALA (quando escala) */}
              {tipoCampo === 'escala' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-800 mb-1">
                    Intervalo Máximo da Escala
                  </label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setEscalaMax(5)}
                      className={`px-4 py-2 rounded-sm text-xs font-semibold border ${
                        escalaMax === 5 ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]' : 'bg-white text-gray-700 border-gray-200'
                      }`}
                    >
                      1 a 5
                    </button>
                    <button
                      type="button"
                      onClick={() => setEscalaMax(10)}
                      className={`px-4 py-2 rounded-sm text-xs font-semibold border ${
                        escalaMax === 10 ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]' : 'bg-white text-gray-700 border-gray-200'
                      }`}
                    >
                      1 a 10 (Padrão)
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-800 mb-1">
                  Texto de Ajuda ou Orientação (Opcional)
                </label>
                <input
                  type="text"
                  value={ajuda}
                  onChange={(e) => setAjuda(e.target.value)}
                  placeholder="Ex: Para ambientação agradável da sala de atendimento"
                  className="w-full px-3 py-2 text-xs rounded-sm bg-white border border-gray-200 text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-800 mb-1">
                  Quem Responde Esta Pergunta?
                </label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setPublicoAlvo('paciente')}
                    className={`flex-1 px-4 py-2 rounded-sm text-xs font-semibold border transition-colors ${
                      publicoAlvo === 'paciente' ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]' : 'bg-white text-gray-700 border-gray-200'
                    }`}
                  >
                    Paciente (no link de preenchimento)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPublicoAlvo('medico')}
                    className={`flex-1 px-4 py-2 rounded-sm text-xs font-semibold border transition-colors ${
                      publicoAlvo === 'medico' ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]' : 'bg-white text-gray-700 border-gray-200'
                    }`}
                  >
                    Médico (complemento na plataforma)
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-sm border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 rounded-sm bg-[#1A1A1A] text-white text-xs font-semibold uppercase tracking-wider hover:bg-black transition-colors disabled:opacity-50"
                >
                  {isSaving ? 'Salvando...' : 'Salvar Pergunta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

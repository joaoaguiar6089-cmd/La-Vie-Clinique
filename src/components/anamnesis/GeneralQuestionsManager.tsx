import React, { useState } from 'react';
import { AnamnesisQuestion, QuestionFieldType } from '../../types';
import { ConfirmDialog, ConfirmRequest } from '../ConfirmDialog';
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

/**
 * Serve às perguntas gerais da **anamnese** e às da **avaliação**, que têm a mesma forma e as
 * mesmas operações — o que muda são os textos do cabeçalho e a coleção por trás dos callbacks.
 *
 * Deu para unificar porque o seletor "Paciente / Médico" saiu daqui: enquanto a pergunta carregava
 * público-alvo, este componente era inerentemente da anamnese. Hoje quem responde é decidido pela
 * coleção em que a pergunta mora, não por um campo dentro dela.
 */
interface GeneralQuestionsManagerProps {
  questions: AnamnesisQuestion[];
  onSaveQuestion: (question: AnamnesisQuestion) => Promise<void>;
  onSaveAllQuestions: (questions: AnamnesisQuestion[]) => Promise<void>;
  onDeleteQuestion: (questionId: string) => Promise<void>;
  titulo?: string;
  /** Explica em que fichas estas perguntas entram. */
  subtitulo?: string;
  /** Rótulo do selo ao lado do título. */
  selo?: string;
  /**
   * Conjunto padrão para o botão "Restaurar Padrões". Ausente = o botão não aparece: a avaliação
   * não tem perguntas gerais padrão, e um botão que substitui tudo por uma lista vazia seria só
   * um jeito de apagar o trabalho da equipe sem dizer isso.
   */
  defaults?: AnamnesisQuestion[];
  /** Prefixo do id de pergunta nova — mantém `gen-` na anamnese e `avg-` na avaliação. */
  idPrefixo?: string;
}

export const GeneralQuestionsManager: React.FC<GeneralQuestionsManagerProps> = ({
  questions,
  onSaveQuestion,
  onSaveAllQuestions,
  onDeleteQuestion,
  titulo = 'Perguntas Gerais Globais',
  subtitulo = 'Este conjunto de perguntas entra automaticamente no início de toda e qualquer ficha de anamnese da La Vie, independente do procedimento clínico selecionado.',
  selo = 'Herança Automática',
  defaults = DEFAULT_GENERAL_QUESTIONS,
  idPrefixo = 'gen',
}) => {
  const [editingQuestion, setEditingQuestion] = useState<AnamnesisQuestion | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmacao, setConfirmacao] = useState<ConfirmRequest | null>(null);

  // Form State
  const [texto, setTexto] = useState('');
  const [tipoCampo, setTipoCampo] = useState<QuestionFieldType>('texto_curto');
  const [obrigatoria, setObrigatoria] = useState(true);
  const [ajuda, setAjuda] = useState('');
  const [opcoesInput, setOpcoesInput] = useState('');
  const [escalaMax, setEscalaMax] = useState<number>(10);
  const [formError, setFormError] = useState('');

  const openNewQuestionModal = () => {
    setEditingQuestion(null);
    setTexto('');
    setTipoCampo('texto_curto');
    setObrigatoria(false);
    setAjuda('');
    setOpcoesInput('');
    setEscalaMax(10);
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
        id: editingQuestion ? editingQuestion.id : `${idPrefixo}-${Date.now()}`,
        texto: texto.trim(),
        tipo_campo: tipoCampo,
        obrigatoria,
        ordem: editingQuestion ? editingQuestion.ordem : questions.length + 1,
        ajuda: ajuda.trim() || undefined,
        opcoes,
        escalaMax: tipoCampo === 'escala' ? escalaMax : undefined,
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

  const handleResetDefaults = () => {
    setConfirmacao({
      titulo: 'Restaurar as perguntas padrão?',
      mensagem:
        'As perguntas gerais atuais são substituídas pelo conjunto padrão da La Vie. Perguntas que você criou aqui se perdem; as fichas já preenchidas não mudam.',
      textoConfirmar: 'Restaurar',
      onConfirmar: () => {
        onSaveAllQuestions(defaults || []);
      },
    });
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
      <div className="bg-card rounded-sm border border-white/80 p-5 sm:p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-brand" />
            <h3 className="font-serif-luxury text-xl font-medium text-ink">
              {titulo}
            </h3>
            <span className="px-2 py-0.5 rounded-full bg-brand/15 text-brand text-label uppercase font-bold tracking-widest">
              {selo}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1 max-w-2xl leading-relaxed">
            {subtitulo}
          </p>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          {defaults && defaults.length > 0 && (
            <button
              type="button"
              onClick={handleResetDefaults}
              className="flex-1 md:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 rounded-sm border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:text-ink hover:bg-gray-50 transition-colors"
              title="Restaurar o conjunto de perguntas padrão"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Restaurar Padrões</span>
            </button>
          )}
          <button
            type="button"
            onClick={openNewQuestionModal}
            className="flex-1 md:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 rounded-sm bg-brand text-white text-xs font-semibold uppercase tracking-wider hover:bg-brand-hover shadow-xs active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4" />
            Nova Pergunta Geral
          </button>
        </div>
      </div>

      {/* Questions List */}
      <div className="bg-card rounded-sm border border-white/70 shadow-xs overflow-hidden">
        <div className="px-5 py-3.5 bg-white/70 border-b border-white/80 flex items-center justify-between">
          <span className="text-label uppercase tracking-widest font-semibold text-gray-500">
            Perguntas Ativas ({questions.length})
          </span>
          <span className="text-body text-gray-400">
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
                <div className="w-7 h-7 rounded-sm bg-ink text-brand-light font-mono text-xs font-bold flex items-center justify-center shrink-0 shadow-2xs">
                  {idx + 1}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-semibold text-sm text-ink leading-snug">
                      {q.texto}
                    </h4>
                    {q.obrigatoria ? (
                      <span className="px-1.5 py-0.5 rounded-xs bg-red-50 border border-red-200 text-red-600 text-label font-semibold">
                        Obrigatória
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded-xs bg-gray-100 text-gray-500 text-label font-medium">
                        Opcional
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500 flex-wrap">
                    <span className="px-2 py-0.5 rounded-xs bg-brand/10 text-brand font-medium text-body">
                      {fieldTypeLabels[q.tipo_campo]}
                    </span>

                    {q.ajuda && <span className="text-gray-400 italic">"{q.ajuda}"</span>}

                    {q.opcoes && q.opcoes.length > 0 && (
                      <span className="text-gray-400 text-body">
                        ({q.opcoes.length} opções cadastradas)
                      </span>
                    )}

                    {q.tipo_campo === 'escala' && (
                      <span className="text-gray-400 text-body font-mono">
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
                  className="p-1.5 rounded-xs text-gray-400 hover:text-ink hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Subir ordem"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={idx === questions.length - 1}
                  onClick={() => handleMove(idx, 'down')}
                  className="p-1.5 rounded-xs text-gray-400 hover:text-ink hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Descer ordem"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => openEditModal(q)}
                  className="p-1.5 rounded-xs text-gray-500 hover:text-ink hover:bg-white transition-colors"
                  title="Editar pergunta"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setConfirmacao({
                      titulo: 'Remover esta pergunta?',
                      mensagem: `"${q.texto}"\n\nEla deixa de aparecer nas próximas fichas. As respostas já registradas continuam guardadas.`,
                      textoConfirmar: 'Remover',
                      onConfirmar: () => onDeleteQuestion(q.id),
                    })
                  }
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
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 flex items-center justify-center p-3 sm:p-6 animate-fadeIn">
          <div className="relative w-full max-w-lg bg-surface rounded-sm border border-white/80 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 bg-ink text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-brand-light" />
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
                  className="w-full px-3 py-2 text-xs rounded-sm bg-white border border-gray-200 text-ink focus:outline-hidden focus:border-brand focus:ring-1 focus:ring-brand"
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
                    className="w-full px-3 py-2 text-xs rounded-sm bg-white border border-gray-200 text-ink focus:outline-hidden focus:border-brand"
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
                      className="accent-brand w-4 h-4 rounded-xs"
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
                    className="w-full px-3 py-2 text-xs rounded-sm bg-white border border-gray-200 text-ink focus:outline-hidden focus:border-brand font-mono"
                  />
                  <p className="text-body text-gray-400 mt-1">
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
                        escalaMax === 5 ? 'bg-ink text-white border-ink' : 'bg-white text-gray-700 border-gray-200'
                      }`}
                    >
                      1 a 5
                    </button>
                    <button
                      type="button"
                      onClick={() => setEscalaMax(10)}
                      className={`px-4 py-2 rounded-sm text-xs font-semibold border ${
                        escalaMax === 10 ? 'bg-ink text-white border-ink' : 'bg-white text-gray-700 border-gray-200'
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
                  className="w-full px-3 py-2 text-xs rounded-sm bg-white border border-gray-200 text-ink focus:outline-hidden focus:border-brand"
                />
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
                  className="px-5 py-2 rounded-sm bg-ink text-white text-xs font-semibold uppercase tracking-wider hover:bg-black transition-colors disabled:opacity-50"
                >
                  {isSaving ? 'Salvando...' : 'Salvar Pergunta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog pedido={confirmacao} onFechar={() => setConfirmacao(null)} />
    </div>
  );
};

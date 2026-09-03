import React, { useState } from 'react';
import {
  AnamnesisTemplate,
  AnamnesisQuestion,
  QuestionFieldType,
  Procedure,
  ClinicProfile,
  Patient,
} from '../../types';
import { downscaleImage } from '../../utils/imageCompressor';
import { ShareAnamnesisLinkModal } from './ShareAnamnesisLinkModal';
import {
  Plus,
  Trash2,
  Edit3,
  Camera,
  ArrowUp,
  ArrowDown,
  Check,
  HelpCircle,
  FileText,
  Sparkles,
  Search,
  Filter,
  X,
  AlertCircle,
  Layers,
  ChevronRight,
  Share2,
  Upload,
  Image as ImageIcon,
} from 'lucide-react';

interface ProcedureTemplatesManagerProps {
  templates: AnamnesisTemplate[];
  catalogProcedures: Procedure[];
  generalQuestions: AnamnesisQuestion[];
  clinicProfile?: ClinicProfile;
  patients?: Patient[];
  onSaveTemplate: (template: AnamnesisTemplate) => Promise<void>;
  onDeleteTemplate: (templateId: string) => Promise<void>;
  onOpenPatientView?: (templateId: string, patientId?: string) => void;
}

export const ProcedureTemplatesManager: React.FC<ProcedureTemplatesManagerProps> = ({
  templates,
  catalogProcedures,
  generalQuestions,
  clinicProfile,
  patients = [],
  onSaveTemplate,
  onDeleteTemplate,
  onOpenPatientView,
}) => {
  const [selectedTemplate, setSelectedTemplate] = useState<AnamnesisTemplate | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');

  // Share link modal state
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareTemplateId, setShareTemplateId] = useState<string | undefined>(undefined);
  const [isUploadingFotoModelo, setIsUploadingFotoModelo] = useState(false);

  // Question editing sub-modal inside template editor
  const [questionModalOpen, setQuestionModalOpen] = useState(false);
  const [editingQuestionIndex, setEditingQuestionIndex] = useState<number | null>(null);
  const [qTexto, setQTexto] = useState('');
  const [qTipo, setQTipo] = useState<QuestionFieldType>('sim_nao');
  const [qObrigatoria, setQObrigatoria] = useState(true);
  const [qAjuda, setQAjuda] = useState('');
  const [qOpcoesInput, setQOpcoesInput] = useState('');
  const [qEscalaMax, setQEscalaMax] = useState<number>(10);
  const [qError, setQError] = useState('');

  // Draft template in editor
  const [draftTemplate, setDraftTemplate] = useState<AnamnesisTemplate | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const categories = ['Todas', ...Array.from(new Set(templates.map((t) => t.categoria || 'Geral')))];

  const filteredTemplates = templates.filter((tpl) => {
    const matchesSearch =
      tpl.procedimentoNome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (tpl.descricao && tpl.descricao.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCat = selectedCategory === 'Todas' || (tpl.categoria || 'Geral') === selectedCategory;
    return matchesSearch && matchesCat;
  });

  const handleOpenNewTemplate = () => {
    const newTpl: AnamnesisTemplate = {
      id: `tpl-${Date.now()}`,
      procedimentoNome: '',
      categoria: 'Estética Avançada',
      tem_foto: false,
      descricao: '',
      perguntasEspecificas: [],
    };
    setDraftTemplate(newTpl);
    setIsEditorOpen(true);
  };

  const handleOpenEditTemplate = (tpl: AnamnesisTemplate) => {
    setDraftTemplate(JSON.parse(JSON.stringify(tpl)));
    setIsEditorOpen(true);
  };

  // Sub-question management
  const handleOpenAddQuestion = () => {
    setEditingQuestionIndex(null);
    setQTexto('');
    setQTipo('sim_nao');
    setQObrigatoria(true);
    setQAjuda('');
    setQOpcoesInput('');
    setQEscalaMax(10);
    setQError('');
    setQuestionModalOpen(true);
  };

  const handleOpenEditQuestion = (index: number) => {
    if (!draftTemplate) return;
    const q = draftTemplate.perguntasEspecificas[index];
    setEditingQuestionIndex(index);
    setQTexto(q.texto);
    setQTipo(q.tipo_campo);
    setQObrigatoria(q.obrigatoria);
    setQAjuda(q.ajuda || '');
    setQOpcoesInput(q.opcoes ? q.opcoes.join('\n') : '');
    setQEscalaMax(q.escalaMax || 10);
    setQError('');
    setQuestionModalOpen(true);
  };

  const handleSaveSubQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftTemplate) return;
    if (!qTexto.trim()) {
      setQError('Informe o enunciado da pergunta.');
      return;
    }

    let parsedOpcoes: string[] | undefined = undefined;
    if (qTipo === 'unica_escolha' || qTipo === 'multipla_escolha') {
      const parsed = qOpcoesInput
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      if (parsed.length < 2) {
        setQError('Informe ao menos 2 opções de resposta (uma por linha).');
        return;
      }
      parsedOpcoes = parsed;
    }

    const updatedQ: AnamnesisQuestion = {
      id:
        editingQuestionIndex !== null
          ? draftTemplate.perguntasEspecificas[editingQuestionIndex].id
          : `esp-${Date.now()}`,
      texto: qTexto.trim(),
      tipo_campo: qTipo,
      obrigatoria: qObrigatoria,
      ordem:
        editingQuestionIndex !== null
          ? draftTemplate.perguntasEspecificas[editingQuestionIndex].ordem
          : draftTemplate.perguntasEspecificas.length + 1,
      ajuda: qAjuda.trim() || undefined,
      opcoes: parsedOpcoes,
      escalaMax: qTipo === 'escala' ? qEscalaMax : undefined,
    };

    const newQuestions = [...draftTemplate.perguntasEspecificas];
    if (editingQuestionIndex !== null) {
      newQuestions[editingQuestionIndex] = updatedQ;
    } else {
      newQuestions.push(updatedQ);
    }

    setDraftTemplate({
      ...draftTemplate,
      perguntasEspecificas: newQuestions,
    });
    setQuestionModalOpen(false);
  };

  const handleDeleteSubQuestion = (index: number) => {
    if (!draftTemplate) return;
    const newQuestions = draftTemplate.perguntasEspecificas.filter((_, i) => i !== index);
    // Reorder
    setDraftTemplate({
      ...draftTemplate,
      perguntasEspecificas: newQuestions.map((q, i) => ({ ...q, ordem: i + 1 })),
    });
  };

  const handleMoveSubQuestion = (index: number, direction: 'up' | 'down') => {
    if (!draftTemplate) return;
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= draftTemplate.perguntasEspecificas.length) return;

    const list = [...draftTemplate.perguntasEspecificas];
    const [moved] = list.splice(index, 1);
    list.splice(target, 0, moved);

    setDraftTemplate({
      ...draftTemplate,
      perguntasEspecificas: list.map((q, i) => ({ ...q, ordem: i + 1 })),
    });
  };

  const handleFotoModeloUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !draftTemplate) return;
    setIsUploadingFotoModelo(true);
    try {
      const compressed = await downscaleImage(file, 1200, 0.82);
      setDraftTemplate({
        ...draftTemplate,
        fotoModeloUrl: compressed,
        tem_foto: true, // Also activates photo section so patient can also upload their photo
      });
    } catch (err) {
      console.error(err);
      alert('Erro ao carregar a imagem. Tente outro arquivo.');
    } finally {
      setIsUploadingFotoModelo(false);
      e.target.value = '';
    }
  };

  const handleSaveDraftTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftTemplate) return;
    if (!draftTemplate.procedimentoNome.trim()) {
      alert('Informe o nome do procedimento.');
      return;
    }

    setIsSaving(true);
    try {
      await onSaveTemplate(draftTemplate);
      setIsEditorOpen(false);
      setDraftTemplate(null);
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar modelo de ficha.');
    } finally {
      setIsSaving(false);
    }
  };

  const fieldTypeLabels: Record<QuestionFieldType, string> = {
    texto_curto: 'Texto Curto',
    texto_longo: 'Texto Longo',
    numero: 'Numérico',
    data: 'Data',
    unica_escolha: 'Única Escolha',
    multipla_escolha: 'Múltipla Escolha',
    escala: 'Escala Numérica',
    sim_nao: 'Sim / Não',
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Actions */}
      <div className="bg-white/60 backdrop-blur-md rounded-sm border border-white/80 p-5 sm:p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#1A1A1A]" />
            <h3 className="font-serif-luxury text-xl font-medium text-[#1A1A1A]">
              Fichas-Modelo por Procedimento
            </h3>
            <span className="px-2 py-0.5 rounded-full bg-[#1A1A1A] text-[#C49B74] text-[10px] font-mono font-bold">
              {templates.length} Modelos
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1 max-w-2xl leading-relaxed">
            Cada procedimento herda automaticamente as Perguntas Gerais e possui suas próprias perguntas clínicas
            específicas, com opção de anexo de foto pré-atendimento para mapeamento manual de unidades.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenNewTemplate}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-sm bg-[#1A1A1A] text-[#C49B74] text-xs font-semibold uppercase tracking-wider hover:bg-black shadow-xs active:scale-95 transition-all"
        >
          <Plus className="w-4 h-4" />
          Novo Modelo de Procedimento
        </button>
      </div>

      {/* Search & Category Filter */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por procedimento ou objetivo..."
            className="w-full pl-9 pr-4 py-2 text-xs rounded-sm bg-white/80 border border-gray-200 text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52] focus:bg-white"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xs text-[11px] font-medium transition-all whitespace-nowrap border ${
                selectedCategory === cat
                  ? 'bg-[#A67C52] text-white border-[#A67C52] shadow-2xs'
                  : 'bg-white/80 text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTemplates.map((tpl) => (
          <div
            key={tpl.id}
            className="bg-white/70 backdrop-blur-md rounded-sm border border-white/90 p-5 shadow-xs hover:shadow-md hover:border-[#A67C52]/40 transition-all flex flex-col justify-between group"
          >
            <div>
              <div className="flex items-start justify-between gap-2">
                <span className="px-2 py-0.5 rounded-xs bg-[#A67C52]/10 text-[#A67C52] font-semibold text-[10px] uppercase tracking-wider">
                  {tpl.categoria || 'Geral'}
                </span>
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  {tpl.fotoModeloUrl ? (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-xs bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-semibold">
                      <Camera className="w-3 h-3" />
                      Foto Doutor
                    </span>
                  ) : null}
                  {tpl.tem_foto ? (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-xs bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold">
                      <Camera className="w-3 h-3" />
                      Foto Paciente
                    </span>
                  ) : (
                    <span className="text-[10px] text-gray-400">Sem Foto</span>
                  )}
                </div>
              </div>

              <h4 className="font-serif-luxury text-base font-semibold text-[#1A1A1A] mt-2 group-hover:text-[#A67C52] transition-colors">
                {tpl.procedimentoNome}
              </h4>

              {tpl.descricao && (
                <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">
                  {tpl.descricao}
                </p>
              )}

              {/* Composition badge */}
              <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-600">
                <span className="flex items-center gap-1">
                  <span className="font-bold text-[#1A1A1A]">{generalQuestions.length}</span> Gerais +{' '}
                  <span className="font-bold text-[#A67C52]">{tpl.perguntasEspecificas.length}</span> Específicas
                </span>
                <span className="text-[11px] text-gray-400 font-mono">
                  {tpl.perguntasEspecificas.length + generalQuestions.length} questões
                </span>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setShareTemplateId(tpl.id);
                  setShareModalOpen(true);
                }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xs bg-[#FAF9F6] border border-[#A67C52]/30 text-xs font-semibold text-[#A67C52] hover:bg-[#A67C52] hover:text-white transition-all shadow-2xs"
                title="Compartilhar link da ficha para preenchimento online do cliente"
              >
                <Share2 className="w-3.5 h-3.5" />
                Compartilhar Link
              </button>
              <button
                type="button"
                onClick={() => handleOpenEditTemplate(tpl)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xs bg-white border border-gray-200 text-xs font-medium text-gray-700 hover:text-[#1A1A1A] hover:border-[#A67C52] transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" />
                Configurar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (
                    window.confirm(
                      `Deseja realmente excluir o modelo de anamnese para "${tpl.procedimentoNome}"?`
                    )
                  ) {
                    onDeleteTemplate(tpl.id);
                  }
                }}
                className="p-1.5 rounded-xs text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                title="Excluir modelo"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {filteredTemplates.length === 0 && (
        <div className="text-center py-12 bg-white/40 rounded-sm border border-dashed border-gray-300">
          <FileText className="w-8 h-8 mx-auto text-gray-400 stroke-1" />
          <p className="text-sm font-medium text-gray-600 mt-2">Nenhum modelo encontrado</p>
          <p className="text-xs text-gray-400 mt-0.5">Tente outro termo de busca ou crie um novo modelo</p>
        </div>
      )}

      {/* TEMPLATE EDITOR MODAL */}
      {isEditorOpen && draftTemplate && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-fadeIn">
          <div className="relative w-full max-w-3xl bg-[#FAF9F6] rounded-sm border border-white/80 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 bg-[#1A1A1A] text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#C49B74]" />
                <div>
                  <h3 className="font-serif-luxury text-lg font-medium tracking-tight">
                    {draftTemplate.procedimentoNome ? draftTemplate.procedimentoNome : 'Novo Modelo de Procedimento'}
                  </h3>
                  <p className="text-[11px] text-gray-400">
                    Configuração da estrutura da ficha clínica de anamnese
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditorOpen(false)}
                className="p-1 rounded-xs text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleSaveDraftTemplate} className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Basic Info */}
              <div className="bg-white p-4 sm:p-5 rounded-sm border border-gray-200/80 shadow-2xs space-y-4">
                <h4 className="text-xs font-semibold uppercase tracking-widest text-gray-500 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-[#A67C52]" />
                  Dados do Procedimento
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-gray-800 mb-1">
                      Nome do Procedimento *
                    </label>
                    <input
                      type="text"
                      value={draftTemplate.procedimentoNome}
                      onChange={(e) =>
                        setDraftTemplate({ ...draftTemplate, procedimentoNome: e.target.value })
                      }
                      placeholder="Ex: Botox (Toxina Botulínica)"
                      className="w-full px-3 py-2 text-xs rounded-sm bg-[#FAF9F6] border border-gray-200 text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52] font-medium"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-800 mb-1">
                      Categoria Clínica
                    </label>
                    <input
                      type="text"
                      value={draftTemplate.categoria || ''}
                      onChange={(e) =>
                        setDraftTemplate({ ...draftTemplate, categoria: e.target.value })
                      }
                      placeholder="Ex: Injetáveis & Face"
                      className="w-full px-3 py-2 text-xs rounded-sm bg-[#FAF9F6] border border-gray-200 text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-800 mb-1">
                    Objetivo / Descrição Clínica
                  </label>
                  <textarea
                    rows={2}
                    value={draftTemplate.descricao || ''}
                    onChange={(e) =>
                      setDraftTemplate({ ...draftTemplate, descricao: e.target.value })
                    }
                    placeholder="Breve resumo clínico para orientação da equipe..."
                    className="w-full px-3 py-2 text-xs rounded-sm bg-[#FAF9F6] border border-gray-200 text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                  />
                </div>

                {/* FOTO DO DOUTOR / MAPA ANATÔMICO DE REFERÊNCIA (Requested by user) */}
                <div className="pt-3 border-t border-gray-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#A67C52]" />
                      <label className="text-xs font-bold text-[#1A1A1A]">
                        Foto de Referência do Doutor / Mapa Anatômico
                      </label>
                    </div>
                    {draftTemplate.fotoModeloUrl && (
                      <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-xs font-semibold border border-emerald-200">
                        Foto Anexada
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] text-gray-500 leading-relaxed">
                    Esta foto (ex: mapa de pontos de toxina botulínica, diagrama facial/corporal ou imagem do doutor)
                    aparecerá no <strong>início do formulário online compartilhado com o paciente</strong>, e sairá
                    no PDF / folha de impressão ou tablet para que você possa <strong>fazer anotações de doses, vetores e unidades</strong>.
                  </p>

                  {draftTemplate.fotoModeloUrl ? (
                    <div className="flex flex-col sm:flex-row items-center gap-4 p-3 bg-[#FAF9F6] rounded-sm border border-gray-200">
                      <div className="relative w-32 h-32 rounded-sm overflow-hidden border border-gray-300 bg-white shrink-0 shadow-2xs">
                        <img
                          src={draftTemplate.fotoModeloUrl}
                          alt="Foto de referência"
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <div className="flex-1 space-y-2 text-center sm:text-left">
                        <span className="text-xs font-semibold text-[#1A1A1A] block">
                          Imagem de referência carregada com sucesso
                        </span>
                        <p className="text-[11px] text-gray-500">
                          A imagem será exibida no topo da ficha do paciente e no prontuário oficial.
                        </p>
                        <div className="flex items-center gap-2 pt-1 justify-center sm:justify-start">
                          <label className="cursor-pointer px-3 py-1.5 rounded-xs bg-white border border-gray-200 hover:border-[#A67C52] text-gray-700 text-xs font-medium transition-colors shadow-2xs">
                            {isUploadingFotoModelo ? 'Processando...' : 'Substituir Imagem'}
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleFotoModeloUpload}
                              disabled={isUploadingFotoModelo}
                              className="hidden"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() =>
                              setDraftTemplate({ ...draftTemplate, fotoModeloUrl: undefined })
                            }
                            className="px-3 py-1.5 rounded-xs text-red-600 hover:bg-red-50 text-xs font-medium transition-colors"
                          >
                            Remover Imagem
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <label className="cursor-pointer flex flex-col items-center justify-center p-5 border-2 border-dashed border-gray-300 hover:border-[#A67C52] rounded-sm bg-[#FAF9F6] hover:bg-white transition-all text-center group">
                        <div className="w-10 h-10 rounded-full bg-[#A67C52]/10 text-[#A67C52] flex items-center justify-center group-hover:scale-105 transition-transform mb-2">
                          <Upload className="w-5 h-5" />
                        </div>
                        <span className="text-xs font-bold text-[#1A1A1A] group-hover:text-[#A67C52] transition-colors">
                          {isUploadingFotoModelo
                            ? 'Processando imagem...'
                            : 'Fazer upload da foto de referência / mapa de aplicação'}
                        </span>
                        <span className="text-[11px] text-gray-400 mt-0.5">
                          Formatos JPG, PNG ou WebP. Redimensionamento e compressão automáticos.
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleFotoModeloUpload}
                          disabled={isUploadingFotoModelo}
                          className="hidden"
                        />
                      </label>

                      <div className="flex items-center gap-2">
                        <input
                          type="url"
                          placeholder="Ou cole o link direto de uma imagem (URL)..."
                          value={draftTemplate.fotoModeloUrl || ''}
                          onChange={(e) =>
                            setDraftTemplate({ ...draftTemplate, fotoModeloUrl: e.target.value })
                          }
                          className="w-full px-3 py-1.5 text-xs rounded-sm bg-white border border-gray-200 text-gray-700 focus:outline-hidden focus:border-[#A67C52]"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* TEM FOTO TOGGLE */}
                <div className="pt-2 border-t border-gray-100">
                  <label className="flex items-start gap-3 p-3 rounded-sm bg-[#A67C52]/5 border border-[#A67C52]/20 cursor-pointer hover:bg-[#A67C52]/10 transition-colors">
                    <input
                      type="checkbox"
                      checked={draftTemplate.tem_foto}
                      onChange={(e) =>
                        setDraftTemplate({ ...draftTemplate, tem_foto: e.target.checked })
                      }
                      className="accent-[#A67C52] w-4 h-4 mt-0.5 rounded-xs"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Camera className="w-4 h-4 text-[#A67C52]" />
                        <span className="text-xs font-bold text-[#1A1A1A]">
                          Habilitar Envio de Foto do Paciente (tem_foto)
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">
                        Quando ativado, o formulário online exibirá logo abaixo ou ao lado da foto de referência a
                        opção para o <strong>cliente fazer o envio opcional de uma foto dele</strong> (combinado previamente via WhatsApp).
                        Ambas as fotos saem na folha para anotações manuais na consulta.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* INHERITED GENERAL QUESTIONS (Read-Only Preview) */}
              <div className="bg-white/80 p-4 sm:p-5 rounded-sm border border-gray-200/70 shadow-2xs">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-widest text-gray-500 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#A67C52]" />
                    Perguntas Gerais Herdadas ({generalQuestions.length})
                  </h4>
                  <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-xs font-medium">
                    Configuradas na aba Perguntas Gerais
                  </span>
                </div>

                <div className="mt-3 divide-y divide-gray-100 border border-gray-100 rounded-sm bg-gray-50/50">
                  {generalQuestions.map((gq, gidx) => (
                    <div key={gq.id} className="p-2.5 px-3 flex items-center justify-between text-xs">
                      <span className="text-gray-700 font-medium">
                        {gidx + 1}. {gq.texto}
                      </span>
                      <span className="text-[10px] text-[#A67C52] font-mono">
                        {fieldTypeLabels[gq.tipo_campo]} {gq.obrigatoria ? '(*)' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* SPECIFIC QUESTIONS MANAGER */}
              <div className="bg-white p-4 sm:p-5 rounded-sm border border-gray-200/80 shadow-2xs space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-widest text-[#1A1A1A] flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-[#A67C52]" />
                      Perguntas Específicas deste Procedimento ({draftTemplate.perguntasEspecificas.length})
                    </h4>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Perguntas direcionadas exclusivamente a este tratamento
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleOpenAddQuestion}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xs bg-[#A67C52] text-white text-xs font-semibold uppercase tracking-wider hover:bg-[#8e6945] transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Adicionar Pergunta
                  </button>
                </div>

                {draftTemplate.perguntasEspecificas.length === 0 ? (
                  <div className="p-6 text-center border border-dashed border-gray-200 rounded-sm">
                    <p className="text-xs text-gray-500">Nenhuma pergunta específica cadastrada ainda.</p>
                    <button
                      type="button"
                      onClick={handleOpenAddQuestion}
                      className="mt-2 text-xs font-semibold text-[#A67C52] hover:underline"
                    >
                      + Cadastrar primeira pergunta específica
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {draftTemplate.perguntasEspecificas.map((q, idx) => (
                      <div
                        key={q.id}
                        className="p-3 bg-[#FAF9F6] border border-gray-200/70 rounded-sm flex items-start justify-between gap-3 hover:border-gray-300 transition-colors"
                      >
                        <div className="flex items-start gap-2.5 flex-1 min-w-0">
                          <span className="w-5 h-5 rounded-xs bg-gray-200 text-gray-700 font-mono text-[10px] font-bold flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-semibold text-[#1A1A1A] leading-snug">
                                {q.texto}
                              </span>
                              {q.obrigatoria && (
                                <span className="text-[9px] text-red-600 bg-red-50 border border-red-200 px-1 rounded-xs font-bold">
                                  Obrigatória
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2.5 mt-1 text-[11px] text-gray-500">
                              <span className="px-1.5 py-0.5 rounded-xs bg-white border border-gray-200 text-[#A67C52] font-medium">
                                {fieldTypeLabels[q.tipo_campo]}
                              </span>
                              {q.opcoes && (
                                <span className="text-gray-400">
                                  ({q.opcoes.length} alternativas)
                                </span>
                              )}
                              {q.tipo_campo === 'escala' && (
                                <span className="text-gray-400 font-mono">
                                  1 a {q.escalaMax || 10}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => handleMoveSubQuestion(idx, 'up')}
                            className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                            title="Subir"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === draftTemplate.perguntasEspecificas.length - 1}
                            onClick={() => handleMoveSubQuestion(idx, 'down')}
                            className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                            title="Descer"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEditQuestion(idx)}
                            className="p-1 text-gray-500 hover:text-[#1A1A1A]"
                            title="Editar"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSubQuestion(idx)}
                            className="p-1 text-gray-400 hover:text-red-600"
                            title="Excluir"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Bottom Actions */}
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                  className="px-4 py-2 rounded-sm border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 rounded-sm bg-[#1A1A1A] text-white text-xs font-semibold uppercase tracking-wider hover:bg-black transition-colors disabled:opacity-50"
                >
                  {isSaving ? 'Salvando Modelo...' : 'Salvar Modelo de Ficha'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SUB-QUESTION MODAL */}
      {questionModalOpen && (
        <div className="fixed inset-0 z-60 overflow-y-auto bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-fadeIn">
          <div className="relative w-full max-w-lg bg-[#FAF9F6] rounded-sm border border-white/80 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 bg-[#1A1A1A] text-white flex items-center justify-between">
              <h4 className="font-serif-luxury text-base font-medium">
                {editingQuestionIndex !== null ? 'Editar Pergunta Específica' : 'Nova Pergunta Específica'}
              </h4>
              <button
                type="button"
                onClick={() => setQuestionModalOpen(false)}
                className="p-1 rounded-xs text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSubQuestion} className="p-6 space-y-4">
              {qError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-sm text-xs text-red-600 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{qError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-800 mb-1">
                  Enunciado da Pergunta *
                </label>
                <input
                  type="text"
                  value={qTexto}
                  onChange={(e) => setQTexto(e.target.value)}
                  placeholder="Ex: Já realizou aplicação prévia na mesma região?"
                  className="w-full px-3 py-2 text-xs rounded-sm bg-white border border-gray-200 text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-800 mb-1">
                    Tipo de Campo
                  </label>
                  <select
                    value={qTipo}
                    onChange={(e) => setQTipo(e.target.value as QuestionFieldType)}
                    className="w-full px-3 py-2 text-xs rounded-sm bg-white border border-gray-200 text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                  >
                    <option value="sim_nao">Sim / Não</option>
                    <option value="texto_curto">Texto Curto</option>
                    <option value="texto_longo">Texto Longo</option>
                    <option value="numero">Número</option>
                    <option value="data">Data</option>
                    <option value="unica_escolha">Única Escolha (Radio)</option>
                    <option value="multipla_escolha">Múltipla Escolha (Checkbox)</option>
                    <option value="escala">Escala Numérica</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-800 mb-1">
                    Obrigatoriedade
                  </label>
                  <label className="flex items-center gap-2 h-[34px] px-3 rounded-sm bg-white border border-gray-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={qObrigatoria}
                      onChange={(e) => setQObrigatoria(e.target.checked)}
                      className="accent-[#A67C52] w-4 h-4 rounded-xs"
                    />
                    <span className="text-xs text-gray-700 font-medium">Resposta Obrigatória</span>
                  </label>
                </div>
              </div>

              {(qTipo === 'unica_escolha' || qTipo === 'multipla_escolha') && (
                <div>
                  <label className="block text-xs font-semibold text-gray-800 mb-1">
                    Opções de Seleção (uma por linha) *
                  </label>
                  <textarea
                    rows={4}
                    value={qOpcoesInput}
                    onChange={(e) => setQOpcoesInput(e.target.value)}
                    placeholder="Opção A&#10;Opção B&#10;Opção C"
                    className="w-full px-3 py-2 text-xs rounded-sm bg-white border border-gray-200 text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52] font-mono"
                  />
                </div>
              )}

              {qTipo === 'escala' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-800 mb-1">
                    Intervalo Máximo da Escala
                  </label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setQEscalaMax(5)}
                      className={`px-4 py-2 rounded-sm text-xs font-semibold border ${
                        qEscalaMax === 5 ? 'bg-[#1A1A1A] text-white' : 'bg-white text-gray-700'
                      }`}
                    >
                      1 a 5
                    </button>
                    <button
                      type="button"
                      onClick={() => setQEscalaMax(10)}
                      className={`px-4 py-2 rounded-sm text-xs font-semibold border ${
                        qEscalaMax === 10 ? 'bg-[#1A1A1A] text-white' : 'bg-white text-gray-700'
                      }`}
                    >
                      1 a 10
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
                  value={qAjuda}
                  onChange={(e) => setQAjuda(e.target.value)}
                  placeholder="Ex: Especifique se houver contraindicação relativa"
                  className="w-full px-3 py-2 text-xs rounded-sm bg-white border border-gray-200 text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setQuestionModalOpen(false)}
                  className="px-4 py-2 rounded-sm border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-sm bg-[#1A1A1A] text-white text-xs font-semibold uppercase tracking-wider hover:bg-black"
                >
                  Concluir Pergunta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SHARE ANAMNESIS LINK MODAL */}
      {shareModalOpen && (
        <ShareAnamnesisLinkModal
          isOpen={shareModalOpen}
          onClose={() => {
            setShareModalOpen(false);
            setShareTemplateId(undefined);
          }}
          templates={templates}
          patients={patients}
          clinicProfile={
            clinicProfile || {
              id: 'clinic-lavie',
              name: 'La Vie Clinique',
              tagline: 'Excelência Médica e Estética Avançada',
              professionalName: 'Dra. Karoline Ferreira',
              phone: '(11) 98765-4321',
              cityState: 'São Paulo - SP',
              instagram: '@lavieclinique',
              address: 'Av. Paulista, 1000 - Jardins',
              primaryColor: '#A67C52',
            }
          }
          initialTemplateId={shareTemplateId}
          onOpenPatientView={onOpenPatientView}
        />
      )}
    </div>
  );
};

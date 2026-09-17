import React, { useState, useEffect } from 'react';
import {
  AnamnesisTemplate,
  AnamnesisQuestion,
  QuestionAudience,
  QuestionFieldType,
  Procedure,
  ClinicProfile,
  Patient,
} from '../../types';
import { downscaleImage } from '../../utils/imageCompressor';
import { subirImagemOuManter } from '../../services/imageStorage';
import { ConfirmDialog, ConfirmRequest } from '../ConfirmDialog';
import { ShareAnamnesisLinkModal } from './ShareAnamnesisLinkModal';
import { BlankAnamnesisSheet } from './BlankAnamnesisSheet';
import { CONSENT_TERM_HEADING } from './ConsentTermView';
import { criarSecaoDoTermo, criarSecoesPadraoDoTermo } from '../../utils/consentTerm';
import {
  criarIndiceDeProcedimentos,
  procedimentoDoTemplate as procedimentoDoTemplateCompartilhado,
  isLaserCategory,
} from '../../utils/templateMatching';
import { montarEspelhoPublico } from '../../utils/laserAreas';
import { ALL_LASER_PROCEDURE_QUESTIONS } from '../../data/anamnesisInitialData';
import { DEFAULT_CLINIC_PROFILE } from '../../data/initialData';
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
  Printer,
  ScrollText,
} from 'lucide-react';

interface GenderPhotoSlotProps {
  label: string;
  url?: string;
  isUploading: boolean;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onUrlChange: (url: string) => void;
  onRemove: () => void;
}

const GenderPhotoSlot: React.FC<GenderPhotoSlotProps> = ({
  label,
  url,
  isUploading,
  onUpload,
  onUrlChange,
  onRemove,
}) => (
  <div className="p-3 bg-[#FAF9F6] rounded-sm border border-gray-200 space-y-2">
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-bold text-[#1A1A1A] uppercase tracking-wider">{label}</span>
      {url && (
        <span className="text-[9px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-xs font-semibold border border-emerald-200">
          Anexada
        </span>
      )}
    </div>

    {url ? (
      <div className="space-y-2">
        <div className="relative w-full h-40 rounded-sm overflow-hidden border border-gray-300 bg-white shadow-2xs">
          <img src={url} alt={`Foto de referência — ${label}`} className="w-full h-full object-contain" />
        </div>
        <div className="flex items-center gap-2">
          <label className="cursor-pointer flex-1 text-center px-2 py-1.5 rounded-xs bg-white border border-gray-200 hover:border-[#A67C52] text-gray-700 text-[11px] font-medium transition-colors shadow-2xs">
            {isUploading ? 'Processando...' : 'Substituir'}
            <input type="file" accept="image/*" onChange={onUpload} disabled={isUploading} className="hidden" />
          </label>
          <button
            type="button"
            onClick={onRemove}
            className="px-2 py-1.5 rounded-xs text-red-600 hover:bg-red-50 text-[11px] font-medium transition-colors"
          >
            Remover
          </button>
        </div>
      </div>
    ) : (
      <div className="space-y-2">
        <label className="cursor-pointer flex flex-col items-center justify-center p-4 border-2 border-dashed border-gray-300 hover:border-[#A67C52] rounded-sm bg-white hover:bg-white transition-all text-center group h-40">
          <Upload className="w-5 h-5 text-[#A67C52] group-hover:scale-105 transition-transform mb-1.5" />
          <span className="text-[11px] font-bold text-[#1A1A1A] group-hover:text-[#A67C52] transition-colors">
            {isUploading ? 'Processando...' : `Upload foto ${label.toLowerCase()}`}
          </span>
          <span className="text-[10px] text-gray-400 mt-0.5">JPG, PNG ou WebP</span>
          <input type="file" accept="image/*" onChange={onUpload} disabled={isUploading} className="hidden" />
        </label>
        <input
          type="url"
          placeholder="Ou cole o link direto de uma imagem..."
          value={url || ''}
          onChange={(e) => onUrlChange(e.target.value)}
          className="w-full px-2.5 py-1.5 text-[11px] rounded-sm bg-white border border-gray-200 text-gray-700 focus:outline-hidden focus:border-[#A67C52]"
        />
      </div>
    )}
  </div>
);

interface ProcedureTemplatesManagerProps {
  templates: AnamnesisTemplate[];
  catalogProcedures: Procedure[];
  generalQuestions: AnamnesisQuestion[];
  clinicProfile?: ClinicProfile;
  patients?: Patient[];
  /** Procedimento que o catálogo mandou criar ficha — abre o editor já vinculado a ele. */
  criarFichaPara?: Procedure | null;
  onCriarFichaHandled?: () => void;
  onSaveTemplate: (template: AnamnesisTemplate) => Promise<void>;
  onDeleteTemplate: (templateId: string) => Promise<void>;
}

export const ProcedureTemplatesManager: React.FC<ProcedureTemplatesManagerProps> = ({
  templates,
  catalogProcedures,
  generalQuestions,
  clinicProfile,
  patients = [],
  criarFichaPara,
  onCriarFichaHandled,
  onSaveTemplate,
  onDeleteTemplate,
}) => {
  const [selectedTemplate, setSelectedTemplate] = useState<AnamnesisTemplate | null>(null);
  const [confirmacao, setConfirmacao] = useState<ConfirmRequest | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');

  // Share link modal state
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareTemplateId, setShareTemplateId] = useState<string | undefined>(undefined);
  const [isUploadingFotoModelo, setIsUploadingFotoModelo] = useState<'feminino' | 'masculino' | null>(null);
  const [isUploadingImagemOrientativa, setIsUploadingImagemOrientativa] = useState(false);
  /** Ficha-modelo cuja versão em branco (para imprimir e responder à caneta) está aberta. */
  const [blankSheetTemplate, setBlankSheetTemplate] = useState<AnamnesisTemplate | null>(null);

  // Question editing sub-modal inside template editor
  const [questionModalOpen, setQuestionModalOpen] = useState(false);
  const [editingQuestionIndex, setEditingQuestionIndex] = useState<number | null>(null);
  const [qTexto, setQTexto] = useState('');
  const [qTipo, setQTipo] = useState<QuestionFieldType>('sim_nao');
  const [qObrigatoria, setQObrigatoria] = useState(true);
  const [qAjuda, setQAjuda] = useState('');
  const [qOpcoesInput, setQOpcoesInput] = useState('');
  const [qEscalaMax, setQEscalaMax] = useState<number>(10);
  const [qPublicoAlvo, setQPublicoAlvo] = useState<QuestionAudience>('paciente');
  const [qError, setQError] = useState('');

  // Draft template in editor
  const [draftTemplate, setDraftTemplate] = useState<AnamnesisTemplate | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const categories = ['Todas', ...Array.from(new Set(templates.map((t) => t.categoria || 'Geral')))];

  // ---- Cruzamento entre o catálogo de procedimentos e as fichas-modelo ----
  // As duas listas nasceram independentes: as fichas vieram de um conjunto fixo de exemplo e nunca
  // olharam para o catálogo cadastrado, então era normal a lista da anamnese não bater com os
  // procedimentos reais da clínica. A regra do vínculo mora em `utils/templateMatching` porque o
  // card do catálogo usa a mesma para decidir se o botão "Anamnese" abre ou fica travado —
  // divergir aqui deixaria um botão travado num procedimento que esta tela jura ter ficha.
  /**
   * Mapa corporal montado do catálogo — a ficha em branco imprime os manequins de frente e costas
   * para a profissional assinalar à caneta, e o registro guarda só IDs e nomes das áreas.
   */
  const mapaDoLaser = React.useMemo(
    () => montarEspelhoPublico(catalogProcedures, clinicProfile || DEFAULT_CLINIC_PROFILE),
    [catalogProcedures, clinicProfile]
  );

  const indiceDeProcedimentos = criarIndiceDeProcedimentos(catalogProcedures);
  const procedimentoPorId = indiceDeProcedimentos.porId;

  const procedimentoDoTemplate = (tpl: AnamnesisTemplate): Procedure | undefined =>
    procedimentoDoTemplateCompartilhado(tpl, indiceDeProcedimentos);

  const idsComFicha = new Set(
    templates.map((tpl) => procedimentoDoTemplate(tpl)?.id).filter((id): id is string => !!id)
  );
  const procedimentosSemFicha = catalogProcedures.filter((p) => !idsComFicha.has(p.id));

  // Valor do seletor no editor. Fichas antigas não têm `procedimentoId`, então o casamento por
  // nome é o que faz o seletor já abrir na opção certa em vez de "Não vinculado".
  const vinculoSelecionado = draftTemplate ? procedimentoDoTemplate(draftTemplate)?.id || '' : '';

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

  /** Abre o editor já vinculado a um procedimento do catálogo, herdando nome, categoria e descrição. */
  const handleOpenNewTemplateForProcedure = (proc: Procedure) => {
    const isLaser = isLaserCategory(proc.category);
    setDraftTemplate({
      id: `tpl-${Date.now()}`,
      procedimentoId: proc.id,
      procedimentoNome: proc.title,
      categoria: proc.category || 'Geral',
      tem_foto: false,
      descricao: proc.subtitle || proc.description || '',
      perguntasEspecificas: isLaser ? [...ALL_LASER_PROCEDURE_QUESTIONS] : [],
    });
    setIsEditorOpen(true);
  };

  // "Criar ficha de anamnese" no menu do card de procedimento cai aqui: o catálogo navegou até
  // esta aba e agora o editor abre já vinculado, sem obrigar a achar o procedimento na lista.
  useEffect(() => {
    if (!criarFichaPara) return;
    handleOpenNewTemplateForProcedure(criarFichaPara);
    onCriarFichaHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [criarFichaPara]);

  /** Troca o procedimento vinculado no editor. `''` volta ao nome livre (fora do catálogo). */
  const handleSelecionarProcedimentoDoCatalogo = (procedureId: string) => {
    if (!draftTemplate) return;
    if (!procedureId) {
      // `''`, não `undefined`: marca a escolha deliberada de não vincular, senão o casamento por
      // nome reativaria o vínculo e o seletor voltaria sozinho para o procedimento anterior.
      setDraftTemplate({ ...draftTemplate, procedimentoId: '' });
      return;
    }
    const proc = procedimentoPorId.get(procedureId);
    if (!proc) return;
    setDraftTemplate({
      ...draftTemplate,
      procedimentoId: proc.id,
      procedimentoNome: proc.title,
      // Só preenche categoria/descrição quando ainda estão vazias — o texto clínico já ajustado
      // à mão na ficha vale mais do que o texto comercial do catálogo.
      categoria: draftTemplate.categoria?.trim() ? draftTemplate.categoria : proc.category || 'Geral',
      descricao: draftTemplate.descricao?.trim()
        ? draftTemplate.descricao
        : proc.subtitle || proc.description || '',
    });
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
    setQPublicoAlvo('paciente');
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
    setQPublicoAlvo(q.publicoAlvo || 'paciente');
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
      publicoAlvo: qPublicoAlvo,
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

  const handleFotoModeloUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    genero: 'feminino' | 'masculino'
  ) => {
    const file = e.target.files?.[0];
    if (!file || !draftTemplate) return;
    setIsUploadingFotoModelo(genero);
    try {
      // Resolução alta (2000px) — a imagem serve de tela para o profissional anotar depois e sai no PDF.
      const compressed = await downscaleImage(file, 2000, 0.85);
      const url = await subirImagemOuManter(compressed, `anamnese/fichas-modelo/${draftTemplate.id}`);
      const field = genero === 'feminino' ? 'fotoModeloFemininoUrl' : 'fotoModeloMasculinoUrl';
      setDraftTemplate({
        ...draftTemplate,
        [field]: url,
        tem_foto: true, // Also activates photo section so patient can also upload their photo
      });
    } catch (err) {
      console.error(err);
      alert('Erro ao carregar a imagem. Tente outro arquivo.');
    } finally {
      setIsUploadingFotoModelo(null);
      e.target.value = '';
    }
  };

  const handleImagemOrientativaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !draftTemplate) return;
    setIsUploadingImagemOrientativa(true);
    try {
      // 1800px e qualidade alta: esta imagem costuma trazer texto (nomes de músculos, medidas,
      // legendas) que o paciente precisa conseguir ler ao ampliar — compressão agressiva demais
      // borra justamente isso.
      const compressed = await downscaleImage(file, 1800, 0.92);
      const url = await subirImagemOuManter(compressed, `anamnese/fichas-modelo/${draftTemplate.id}`);
      setDraftTemplate({ ...draftTemplate, imagemOrientativaUrl: url });
    } catch (err) {
      console.error(err);
      alert('Erro ao carregar a imagem orientativa. Tente outro arquivo.');
    } finally {
      setIsUploadingImagemOrientativa(false);
      e.target.value = '';
    }
  };

  /**
   * Ligar o termo já entrega os quatro blocos padrão preenchíveis — desligar apenas esconde a
   * seção, preservando o que a equipe escreveu para o caso de religar depois.
   */
  const handleToggleTermoConsentimento = (ativo: boolean) => {
    if (!draftTemplate) return;
    setDraftTemplate({
      ...draftTemplate,
      termoConsentimentoAtivo: ativo,
      termoConsentimentoSecoes:
        ativo && (draftTemplate.termoConsentimentoSecoes || []).length === 0
          ? criarSecoesPadraoDoTermo()
          : draftTemplate.termoConsentimentoSecoes,
    });
  };

  const handleUpdateSecaoTermo = (id: string, campo: 'titulo' | 'texto', valor: string) => {
    if (!draftTemplate) return;
    setDraftTemplate({
      ...draftTemplate,
      termoConsentimentoSecoes: (draftTemplate.termoConsentimentoSecoes || []).map((s) =>
        s.id === id ? { ...s, [campo]: valor } : s
      ),
    });
  };

  const handleRemoverSecaoTermo = (id: string) => {
    if (!draftTemplate) return;
    setDraftTemplate({
      ...draftTemplate,
      termoConsentimentoSecoes: (draftTemplate.termoConsentimentoSecoes || []).filter((s) => s.id !== id),
    });
  };

  const handleAdicionarSecaoTermo = () => {
    if (!draftTemplate) return;
    setDraftTemplate({
      ...draftTemplate,
      termoConsentimentoSecoes: [...(draftTemplate.termoConsentimentoSecoes || []), criarSecaoDoTermo()],
    });
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
      // Grava o vínculo resolvido por nome: a partir daqui a ficha fica presa ao ID do
      // procedimento e sobrevive a uma renomeação no catálogo.
      await onSaveTemplate(
        draftTemplate.procedimentoId || !vinculoSelecionado
          ? draftTemplate
          : { ...draftTemplate, procedimentoId: vinculoSelecionado }
      );
      setIsEditorOpen(false);
      setDraftTemplate(null);
    } catch (err) {
      console.error(err);
      // O banco recusa a ficha quando as imagens estouram o limite de 1MB por documento, e essa
      // mensagem diz exatamente o que fazer — engolir tudo num "Erro ao salvar" deixaria o usuário
      // tentando de novo sem saber que o problema é o tamanho das imagens.
      alert(err instanceof Error && err.message ? err.message : 'Erro ao salvar modelo de ficha.');
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
              Anamneses dos Procedimentos
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

      {/* Procedimentos do catálogo que ainda não têm ficha-modelo — é o que fazia a lista da
          anamnese divergir dos procedimentos cadastrados. */}
      {procedimentosSemFicha.length > 0 && (
        <div className="bg-amber-50/70 border border-amber-200 rounded-sm p-4 sm:p-5 space-y-3">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                {procedimentosSemFicha.length}{' '}
                {procedimentosSemFicha.length === 1
                  ? 'procedimento cadastrado ainda sem ficha'
                  : 'procedimentos cadastrados ainda sem ficha'}
              </h4>
              <p className="text-[11px] text-amber-800/80 mt-0.5 leading-relaxed">
                Eles estão no catálogo, mas não aparecem na hora de preencher uma anamnese nem no link
                enviado à paciente. Clique em um deles para criar a ficha já vinculada.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {procedimentosSemFicha.map((proc) => (
              <button
                key={proc.id}
                type="button"
                onClick={() => handleOpenNewTemplateForProcedure(proc)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xs bg-white border border-amber-300 text-[11px] font-medium text-amber-900 hover:border-[#A67C52] hover:text-[#A67C52] transition-colors shadow-2xs"
                title={`Criar a ficha de anamnese de "${proc.title}"`}
              >
                <Plus className="w-3 h-3" />
                {proc.title}
              </button>
            ))}
          </div>
        </div>
      )}

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
                  {(tpl.fotoModeloUrl || tpl.fotoModeloFemininoUrl || tpl.fotoModeloMasculinoUrl) ? (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-xs bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-semibold">
                      <Camera className="w-3 h-3" />
                      {tpl.fotoModeloFemininoUrl && tpl.fotoModeloMasculinoUrl
                        ? 'Foto Fem. + Masc.'
                        : tpl.fotoModeloFemininoUrl
                        ? 'Foto Feminina'
                        : tpl.fotoModeloMasculinoUrl
                        ? 'Foto Masculina'
                        : 'Foto Doutor'}
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

              {catalogProcedures.length > 0 && !procedimentoDoTemplate(tpl) && (
                <span
                  className="inline-flex items-center gap-1 mt-1.5 px-1.5 py-0.5 rounded-xs bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-semibold"
                  title="Nenhum procedimento com este nome no catálogo. Abra 'Configurar' e vincule ao procedimento correto."
                >
                  <AlertCircle className="w-3 h-3" />
                  Fora do catálogo
                </span>
              )}

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

            <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={() => setBlankSheetTemplate(tpl)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xs bg-white border border-gray-200 text-xs font-medium text-gray-700 hover:text-[#1A1A1A] hover:border-[#A67C52] transition-colors"
                title="Ver e salvar o PDF desta ficha em branco, para imprimir e responder à caneta"
              >
                <Printer className="w-3.5 h-3.5" />
                Ficha em Branco
              </button>
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
                onClick={() =>
                  setConfirmacao({
                    titulo: 'Excluir este modelo de ficha?',
                    mensagem: `Modelo de "${tpl.procedimentoNome}".\n\nEle deixa de estar disponível para novos atendimentos. As fichas já preenchidas com ele continuam guardadas.`,
                    textoConfirmar: 'Excluir modelo',
                    onConfirmar: () => onDeleteTemplate(tpl.id),
                  })
                }
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

            {/* Corpo rolável + rodapé fixo. O editor é longo (dados, fotos, imagem orientativa,
                termo, perguntas gerais e específicas) e o botão de salvar ficava no fim da rolagem:
                quem terminava de escrever no meio do formulário fechava o modal sem salvar, e o
                trabalho sumia sem nenhum aviso. Agora "Salvar" está sempre à vista. */}
            <form onSubmit={handleSaveDraftTemplate} className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Basic Info */}
              <div className="bg-white p-4 sm:p-5 rounded-sm border border-gray-200/80 shadow-2xs space-y-4">
                <h4 className="text-xs font-semibold uppercase tracking-widest text-gray-500 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-[#A67C52]" />
                  Dados do Procedimento
                </h4>

                {/* Vínculo com o catálogo: é o que mantém a lista de procedimentos da anamnese
                    igual à dos procedimentos cadastrados. O campo de texto livre continua abaixo
                    para fichas que de propósito não correspondem a um item do catálogo. */}
                {catalogProcedures.length > 0 && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-800 mb-1">
                      Procedimento do Catálogo
                    </label>
                    <select
                      value={vinculoSelecionado}
                      onChange={(e) => handleSelecionarProcedimentoDoCatalogo(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-sm bg-[#FAF9F6] border border-gray-200 text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52] font-medium"
                    >
                      <option value="">-- Não vinculado (nome livre) --</option>
                      {catalogProcedures.map((proc) => (
                        <option key={proc.id} value={proc.id}>
                          {proc.title}
                          {proc.category ? ` — ${proc.category}` : ''}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-gray-500 mt-1 leading-relaxed">
                      {vinculoSelecionado
                        ? 'Vinculado ao catálogo: o nome acompanha o procedimento cadastrado.'
                        : 'Sem vínculo, esta ficha não conta como cobertura do procedimento no catálogo e aparece marcada como "Fora do catálogo".'}
                    </p>
                  </div>
                )}

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

                {/* FOTOS DE REFERÊNCIA / MAPA ANATÔMICO — UMA PARA CADA GÊNERO */}
                <div className="pt-3 border-t border-gray-100 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#A67C52]" />
                    <label className="text-xs font-bold text-[#1A1A1A]">
                      Fotos de Referência / Mapa Anatômico (Feminino e Masculino)
                    </label>
                  </div>

                  <p className="text-[11px] text-gray-500 leading-relaxed">
                    Ao gerar a ficha, o sistema escolhe automaticamente a foto de acordo com o gênero informado pelo
                    paciente. Ela aparece no <strong>início do formulário online</strong> e é a tela usada pelo
                    profissional para <strong>anotar doses, vetores e unidades</strong> depois. Envie em boa
                    resolução — a imagem serve de tela de anotação e sai no PDF.
                  </p>

                  {draftTemplate.fotoModeloUrl && !draftTemplate.fotoModeloFemininoUrl && !draftTemplate.fotoModeloMasculinoUrl && (
                    <div className="flex items-center gap-2 p-2.5 rounded-xs bg-amber-50 border border-amber-200 text-[11px] text-amber-800">
                      <span>
                        Este modelo ainda usa a foto única antiga (legado). Ela continua valendo como fallback até
                        você enviar as versões feminina e masculina abaixo.
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <GenderPhotoSlot
                      label="Feminino"
                      url={draftTemplate.fotoModeloFemininoUrl}
                      isUploading={isUploadingFotoModelo === 'feminino'}
                      onUpload={(e) => handleFotoModeloUpload(e, 'feminino')}
                      onUrlChange={(url) => setDraftTemplate({ ...draftTemplate, fotoModeloFemininoUrl: url })}
                      onRemove={() => setDraftTemplate({ ...draftTemplate, fotoModeloFemininoUrl: undefined })}
                    />
                    <GenderPhotoSlot
                      label="Masculino"
                      url={draftTemplate.fotoModeloMasculinoUrl}
                      isUploading={isUploadingFotoModelo === 'masculino'}
                      onUpload={(e) => handleFotoModeloUpload(e, 'masculino')}
                      onUrlChange={(url) => setDraftTemplate({ ...draftTemplate, fotoModeloMasculinoUrl: url })}
                      onRemove={() => setDraftTemplate({ ...draftTemplate, fotoModeloMasculinoUrl: undefined })}
                    />
                  </div>
                </div>

                {/* IMAGEM ORIENTATIVA — MATERIAL DIDÁTICO MOSTRADO AO PACIENTE */}
                <div className="pt-3 border-t border-gray-100 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#A67C52]" />
                    <label className="text-xs font-bold text-[#1A1A1A]">Imagem Orientativa para o Paciente</label>
                  </div>

                  <p className="text-[11px] text-gray-500 leading-relaxed">
                    Imagem que a clínica produz para <strong>explicar ao paciente</strong> a anatomia da região
                    tratada, os pontos de aplicação ou os cuidados do procedimento. Ela aparece para o paciente
                    <strong> enquanto ele preenche a ficha</strong> (com opção de ampliar) e é reproduzida no
                    <strong> PDF da ficha</strong>, sempre na proporção original do arquivo. Se a imagem tiver texto,
                    envie em boa resolução para que fique legível.
                  </p>

                  {draftTemplate.imagemOrientativaUrl ? (
                    <div className="p-3 bg-[#FAF9F6] rounded-sm border border-gray-200 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-[#1A1A1A] uppercase tracking-wider">
                          Pré-visualização
                        </span>
                        <span className="text-[9px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-xs font-semibold border border-emerald-200">
                          Anexada
                        </span>
                      </div>

                      <div className="w-full max-h-80 overflow-auto rounded-sm border border-gray-300 bg-white">
                        <img
                          src={draftTemplate.imagemOrientativaUrl}
                          alt="Imagem orientativa do procedimento"
                          className="block w-full h-auto"
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <label className="cursor-pointer flex-1 text-center px-2 py-1.5 rounded-xs bg-white border border-gray-200 hover:border-[#A67C52] text-gray-700 text-[11px] font-medium transition-colors shadow-2xs">
                          {isUploadingImagemOrientativa ? 'Processando...' : 'Substituir imagem'}
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleImagemOrientativaUpload}
                            disabled={isUploadingImagemOrientativa}
                            className="hidden"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setDraftTemplate({ ...draftTemplate, imagemOrientativaUrl: undefined })
                          }
                          className="px-2 py-1.5 rounded-xs text-red-600 hover:bg-red-50 text-[11px] font-medium transition-colors"
                        >
                          Remover
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <label className="cursor-pointer flex flex-col items-center justify-center p-4 border-2 border-dashed border-gray-300 hover:border-[#A67C52] rounded-sm bg-white transition-all text-center group h-32">
                        <ImageIcon className="w-5 h-5 text-[#A67C52] group-hover:scale-105 transition-transform mb-1.5" />
                        <span className="text-[11px] font-bold text-[#1A1A1A] group-hover:text-[#A67C52] transition-colors">
                          {isUploadingImagemOrientativa ? 'Processando...' : 'Upload da imagem orientativa'}
                        </span>
                        <span className="text-[10px] text-gray-400 mt-0.5">JPG, PNG ou WebP</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImagemOrientativaUpload}
                          disabled={isUploadingImagemOrientativa}
                          className="hidden"
                        />
                      </label>
                      <input
                        type="url"
                        placeholder="Ou cole o link direto de uma imagem..."
                        value={draftTemplate.imagemOrientativaUrl || ''}
                        onChange={(e) =>
                          setDraftTemplate({ ...draftTemplate, imagemOrientativaUrl: e.target.value })
                        }
                        className="w-full px-2.5 py-1.5 text-[11px] rounded-sm bg-white border border-gray-200 text-gray-700 focus:outline-hidden focus:border-[#A67C52]"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-800 mb-1">
                        Título exibido acima da imagem
                      </label>
                      <input
                        type="text"
                        value={draftTemplate.imagemOrientativaTitulo || ''}
                        onChange={(e) =>
                          setDraftTemplate({ ...draftTemplate, imagemOrientativaTitulo: e.target.value })
                        }
                        placeholder="Ex: Áreas de aplicação do Botox"
                        className="w-full px-3 py-2 text-xs rounded-sm bg-[#FAF9F6] border border-gray-200 text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-800 mb-1">
                        Legenda / orientação (opcional)
                      </label>
                      <input
                        type="text"
                        value={draftTemplate.imagemOrientativaDescricao || ''}
                        onChange={(e) =>
                          setDraftTemplate({ ...draftTemplate, imagemOrientativaDescricao: e.target.value })
                        }
                        placeholder="Ex: Observe os pontos marcados antes de responder..."
                        className="w-full px-3 py-2 text-xs rounded-sm bg-[#FAF9F6] border border-gray-200 text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                      />
                    </div>
                  </div>
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

                {/* TERMO DE CONSENTIMENTO E RESPONSABILIDADE */}
                <div className="pt-3 border-t border-gray-100 space-y-3">
                  <label className="flex items-start gap-3 p-3 rounded-sm bg-[#A67C52]/5 border border-[#A67C52]/20 cursor-pointer hover:bg-[#A67C52]/10 transition-colors">
                    <input
                      type="checkbox"
                      checked={!!draftTemplate.termoConsentimentoAtivo}
                      onChange={(e) => handleToggleTermoConsentimento(e.target.checked)}
                      className="accent-[#A67C52] w-4 h-4 mt-0.5 rounded-xs"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <ScrollText className="w-4 h-4 text-[#A67C52]" />
                        <span className="text-xs font-bold text-[#1A1A1A]">
                          Incluir {CONSENT_TERM_HEADING}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">
                        O termo aparece para o paciente <strong>antes de ele enviar a ficha online</strong> e sai no
                        <strong> PDF da ficha</strong> e na <strong>ficha em branco</strong> para impressão. Ao ativar,
                        os quatro blocos padrão já vêm prontos para você escrever o conteúdo.
                      </p>
                    </div>
                  </label>

                  {draftTemplate.termoConsentimentoAtivo && (
                    <div className="space-y-3">
                      {(draftTemplate.termoConsentimentoSecoes || []).map((secao, idx) => (
                        <div
                          key={secao.id}
                          className="p-3 bg-[#FAF9F6] rounded-sm border border-gray-200 space-y-2"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-[#A67C52] shrink-0">{idx + 1}.</span>
                            <input
                              type="text"
                              value={secao.titulo}
                              onChange={(e) => handleUpdateSecaoTermo(secao.id, 'titulo', e.target.value)}
                              placeholder="Título do bloco (ex: Contra indicação)"
                              className="flex-1 px-3 py-2 text-xs font-semibold rounded-sm bg-white border border-gray-200 text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoverSecaoTermo(secao.id)}
                              className="p-1.5 rounded-xs text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
                              title="Excluir este bloco do termo"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <textarea
                            rows={4}
                            value={secao.texto}
                            onChange={(e) => handleUpdateSecaoTermo(secao.id, 'texto', e.target.value)}
                            placeholder="Escreva o conteúdo deste bloco. Cada linha que você digitar aqui sai como uma linha na ficha."
                            className="w-full px-3 py-2 text-xs rounded-sm bg-white border border-gray-200 text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52] leading-relaxed resize-y"
                          />
                        </div>
                      ))}

                      <button
                        type="button"
                        onClick={handleAdicionarSecaoTermo}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xs bg-white border border-dashed border-gray-300 hover:border-[#A67C52] text-[11px] font-semibold text-gray-700 hover:text-[#A67C52] transition-colors w-full justify-center"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Acrescentar bloco ao termo
                      </button>

                      {(draftTemplate.termoConsentimentoSecoes || []).length === 0 && (
                        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xs px-2.5 py-1.5">
                          Sem nenhum bloco, o termo não aparece na ficha. Acrescente ao menos um.
                        </p>
                      )}
                    </div>
                  )}
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
                      <span className="flex items-center gap-1.5">
                        <span
                          className={`text-[9px] font-bold px-1 rounded-xs border ${
                            (gq.publicoAlvo || 'paciente') === 'medico'
                              ? 'text-indigo-700 bg-indigo-50 border-indigo-200'
                              : 'text-emerald-700 bg-emerald-50 border-emerald-200'
                          }`}
                        >
                          {(gq.publicoAlvo || 'paciente') === 'medico' ? 'Médico' : 'Paciente'}
                        </span>
                        <span className="text-[10px] text-[#A67C52] font-mono">
                          {fieldTypeLabels[gq.tipo_campo]} {gq.obrigatoria ? '(*)' : ''}
                        </span>
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
                              {(q.publicoAlvo || 'paciente') === 'medico' ? (
                                <span className="text-[9px] text-indigo-700 bg-indigo-50 border border-indigo-200 px-1 rounded-xs font-bold">
                                  Médico
                                </span>
                              ) : (
                                <span className="text-[9px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1 rounded-xs font-bold">
                                  Paciente
                                </span>
                              )}
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

              </div>

              {/* Bottom Actions — fora da área rolável, sempre visíveis */}
              <div className="shrink-0 flex items-center justify-end gap-2 px-6 py-3.5 bg-white border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,.04)]">
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
        <div
          className="fixed inset-0 z-60 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-fadeIn"
          onClick={(e) => {
            if (e.target === e.currentTarget) setQuestionModalOpen(false);
          }}
        >
          <div className="relative w-full max-w-lg bg-[#FAF9F6] rounded-2xl border border-white/80 shadow-2xl overflow-hidden max-h-[92dvh] sm:max-h-[90vh] flex flex-col">
            <div className="px-5 sm:px-6 py-3.5 sm:py-4 bg-[#1A1A1A] text-white flex items-center justify-between shrink-0">
              <h4 className="font-serif-luxury text-base font-medium">
                {editingQuestionIndex !== null ? 'Editar Pergunta Específica' : 'Nova Pergunta Específica'}
              </h4>
              <button
                type="button"
                onClick={() => setQuestionModalOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSubQuestion} className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-4">
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

              <div>
                <label className="block text-xs font-semibold text-gray-800 mb-1">
                  Quem Responde Esta Pergunta?
                </label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setQPublicoAlvo('paciente')}
                    className={`flex-1 px-4 py-2 rounded-sm text-xs font-semibold border transition-colors ${
                      qPublicoAlvo === 'paciente' ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]' : 'bg-white text-gray-700 border-gray-200'
                    }`}
                  >
                    Paciente (no link de preenchimento)
                  </button>
                  <button
                    type="button"
                    onClick={() => setQPublicoAlvo('medico')}
                    className={`flex-1 px-4 py-2 rounded-sm text-xs font-semibold border transition-colors ${
                      qPublicoAlvo === 'medico' ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]' : 'bg-white text-gray-700 border-gray-200'
                    }`}
                  >
                    Médico (complemento na plataforma)
                  </button>
                </div>
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

      {/* FICHA EM BRANCO — versão imprimível, sem registro por trás */}
      {blankSheetTemplate && (
        <BlankAnamnesisSheet
          template={blankSheetTemplate}
          generalQuestions={generalQuestions}
          clinicProfile={clinicProfile || DEFAULT_CLINIC_PROFILE}
          mapaCorporal={mapaDoLaser}
          onClose={() => setBlankSheetTemplate(null)}
        />
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
        />
      )}

      <ConfirmDialog pedido={confirmacao} onFechar={() => setConfirmacao(null)} />
    </div>
  );
};

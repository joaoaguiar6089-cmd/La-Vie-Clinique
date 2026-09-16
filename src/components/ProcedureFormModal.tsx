import React, { useState, useEffect } from 'react';
import { X, Upload, Plus, Trash2, Image as ImageIcon, Sparkles, AlertCircle, Check, Link as LinkIcon, Star, UserCheck, Stethoscope, FileText, Crop, Loader2 } from 'lucide-react';
import { ClinicProfile, LaserArea, Procedure, Professional, QuoteItemDetail } from '../types';
import { PRESET_IMAGE_LIBRARY, INITIAL_CATEGORIES } from '../data/initialData';
import { formatBRL } from '../utils/formatters';
import { downscaleDataUrl, estimateFirestoreDocBytes, FIRESTORE_DOC_SAFE_BYTES } from '../utils/imageCompressor';
import { subirImagemOuManter } from '../services/imageStorage';
import { ImageCropperModal, AspectOption } from './ImageCropperModal';
import { isLaserCategory } from '../utils/templateMatching';
import { LaserAreaEditor } from './laser/LaserAreaEditor';

/**
 * A mesma foto aparece em frames bem diferentes (card da lista e detalhe em paisagem, cartão
 * compartilhado em 16:10, catálogo em PDF em retrato). Por isso o recorte oferece formatos em vez
 * de um só: a usuária escolhe o frame onde aquela foto precisa ficar bonita e enquadra para ele.
 */
const PROCEDURE_PHOTO_ASPECTS: AspectOption[] = [
  { id: 'paisagem', label: 'Paisagem 3:2', ratio: 3 / 2 },
  { id: 'cartao', label: 'Cartão 16:10', ratio: 16 / 10 },
  { id: 'catalogo', label: 'Catálogo (retrato)', ratio: 280 / 430 },
  { id: 'quadrado', label: 'Quadrado', ratio: 1 },
  { id: 'original', label: 'Original', ratio: null },
];

interface ProcedureFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (procedure: Procedure) => Promise<void> | void;
  procedureToEdit?: Procedure | null;
  existingCategories: string[];
  availableDoctors?: Professional[];
  /** Catálogo inteiro — o mapa de laser precisa mostrar as áreas dos outros procedimentos. */
  allProcedures?: Procedure[];
  /** Manequins e padrões da categoria de laser. */
  clinic?: ClinicProfile;
  onAbrirConfiguracoes?: () => void;
}

export const ProcedureFormModal: React.FC<ProcedureFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  procedureToEdit,
  existingCategories,
  availableDoctors = [],
  allProcedures = [],
  clinic,
  onAbrirConfiguracoes,
}) => {
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [category, setCategory] = useState('Harmonização & Injetáveis');
  const [customCategory, setCustomCategory] = useState('');
  const [isAddingCustomCategory, setIsAddingCustomCategory] = useState(false);
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState<string>('');
  const [promotionalPrice, setPromotionalPrice] = useState<string>('');
  const [priceNote, setPriceNote] = useState('por sessão');
  const [isStartingPrice, setIsStartingPrice] = useState<boolean>(false);
  const [duration, setDuration] = useState('45 a 60 min');
  const [sessionsRecommended, setSessionsRecommended] = useState('1 a 3 sessões');
  const [recoveryTime, setRecoveryTime] = useState('Sem downtime');
  const [images, setImages] = useState<string[]>([]);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [benefits, setBenefits] = useState<string[]>([]);
  const [newBenefitInput, setNewBenefitInput] = useState('');
  const [extraCategories, setExtraCategories] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [savingStatus, setSavingStatus] = useState('');

  const allCategories = Array.from(
    new Set([
      ...INITIAL_CATEGORIES.filter((c) => c !== 'Todos'),
      ...existingCategories.filter((c) => c !== 'Todos'),
      ...extraCategories,
    ])
  );

  const handleConfirmCustomCategory = () => {
    const trimmed = customCategory.trim();
    if (trimmed) {
      setExtraCategories((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
      setCategory(trimmed);
      setCustomCategory('');
      setIsAddingCustomCategory(false);
    } else {
      setIsAddingCustomCategory(false);
    }
  };
  const [areasTreated, setAreasTreated] = useState<string[]>([]);
  const [newAreaInput, setNewAreaInput] = useState('');
  const [contraindications, setContraindications] = useState('');
  const [idealCandidate, setIdealCandidate] = useState('');
  const [isFeatured, setIsFeatured] = useState(false);
  const [quoteDetails, setQuoteDetails] = useState<QuoteItemDetail[]>([]);

  // Doctors assignment state
  const [assignedDoctorIds, setAssignedDoctorIds] = useState<string[]>([]);
  const [customDoctorNames, setCustomDoctorNames] = useState<string[]>([]);
  const [newCustomDoctorInput, setNewCustomDoctorInput] = useState('');

  // ---- Modo laser ----
  /** Áreas da região em edição. Vazio = nada desenhado ainda, painel de campos fechado. */
  const [laserAreas, setLaserAreas] = useState<LaserArea[]>([]);
  /**
   * Procedimento escolhido na faixa "Sem área no mapa". Diferente de `procedureToEdit`: aquele é
   * quem abriu o modal, este é quem vai receber o desenho da vez. É o que permite mapear os treze
   * já cadastrados em sequência, sem fechar o modal e sem redigitar preço.
   */
  const [procedimentoLaserAlvo, setProcedimentoLaserAlvo] = useState<Procedure | null>(null);
  const [mostrarTodosCampos, setMostrarTodosCampos] = useState(false);
  const [areaAplicada, setAreaAplicada] = useState<string | null>(null);
  const [confirmandoSaida, setConfirmandoSaida] = useState(false);

  const categoriaEfetiva =
    (isAddingCustomCategory && customCategory.trim()) || customCategory.trim() || category;
  const ehLaser = isLaserCategory(categoriaEfetiva);

  const [showPresetLibrary, setShowPresetLibrary] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploadError, setUploadError] = useState('');
  /** Fotos escolhidas no input que ainda passam pelo recorte, uma de cada vez. */
  const [cropQueue, setCropQueue] = useState<File[]>([]);
  const [cropQueueTotal, setCropQueueTotal] = useState(0);
  /** Foto já adicionada que a usuária pediu para reenquadrar (índice em `images`). */
  const [adjustingImage, setAdjustingImage] = useState<{ index: number; src: string } | null>(null);

  useEffect(() => {
    if (procedureToEdit) {
      setTitle(procedureToEdit.title || '');
      setSubtitle(procedureToEdit.subtitle || '');
      setCategory(procedureToEdit.category || 'Harmonização & Injetáveis');
      setDescription(procedureToEdit.description || '');
      setPrice(procedureToEdit.price ? String(procedureToEdit.price) : '');
      setPromotionalPrice(procedureToEdit.promotionalPrice ? String(procedureToEdit.promotionalPrice) : '');
      setPriceNote(procedureToEdit.priceNote || 'por sessão');
      setIsStartingPrice(Boolean(procedureToEdit.isStartingPrice));
      setDuration(procedureToEdit.duration || '');
      setSessionsRecommended(procedureToEdit.sessionsRecommended || '');
      setRecoveryTime(procedureToEdit.recoveryTime || '');
      setImages(procedureToEdit.images || []);
      setBenefits(procedureToEdit.benefits || []);
      setAreasTreated(procedureToEdit.areasTreated || []);
      setContraindications(procedureToEdit.contraindications || '');
      setIdealCandidate(procedureToEdit.idealCandidate || '');
      setIsFeatured(Boolean(procedureToEdit.isFeatured));
      setQuoteDetails(procedureToEdit.quoteDetails || []);
      setLaserAreas(procedureToEdit.laserAreas || []);
      setAssignedDoctorIds(procedureToEdit.assignedDoctorIds || []);
      setCustomDoctorNames(
        procedureToEdit.assignedDoctorNames
          ? procedureToEdit.assignedDoctorNames.filter(
              (name) => !availableDoctors.some((d) => `${d.name} (${d.registryNumber})` === name || d.name === name)
            )
          : []
      );
    } else {
      // Reset defaults for new procedure
      setTitle('');
      setSubtitle('');
      setCategory(existingCategories.length > 0 ? existingCategories[0] : 'Harmonização & Injetáveis');
      setDescription('');
      setPrice('');
      setPromotionalPrice('');
      setPriceNote('por sessão');
      setIsStartingPrice(false);
      setDuration('45 min');
      setSessionsRecommended('1 a 3 sessões');
      setRecoveryTime('Sem downtime');
      setImages(['https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=1000&auto=format&fit=crop&q=80']);
      setBenefits(['Rejuvenescimento visível e seguro', 'Estímulo de colágeno e viço natural']);
      setAreasTreated(['Face completa']);
      setContraindications('Gestantes e infecção ativa na área');
      setIdealCandidate('Pessoas que buscam harmonia e prevenção do envelhecimento');
      setIsFeatured(false);
      setQuoteDetails([]);
      setLaserAreas([]);
      // Default to first doctor if available
      setAssignedDoctorIds(availableDoctors.length > 0 ? [availableDoctors[0].id] : []);
      setCustomDoctorNames([]);
    }
    setProcedimentoLaserAlvo(null);
    setMostrarTodosCampos(false);
    setAreaAplicada(null);
    setConfirmandoSaida(false);
    setErrors({});
    setUploadError('');
    // Um recorte pendente pertence ao procedimento anterior — abrir outro cadastro o descarta.
    setCropQueue([]);
    setCropQueueTotal(0);
    setAdjustingImage(null);
    // availableDoctors is intentionally excluded: it's a new array reference on every
    // clinic profile sync, and including it would reset all in-progress form edits
    // (including image removals) whenever that background sync fires while editing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [procedureToEdit, isOpen]);

  const toggleDoctorSelection = (docId: string) => {
    setAssignedDoctorIds((prev) =>
      prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId]
    );
  };

  const handleAddCustomDoctor = () => {
    if (!newCustomDoctorInput.trim()) return;
    setCustomDoctorNames((prev) => [...prev, newCustomDoctorInput.trim()]);
    setNewCustomDoctorInput('');
  };

  const handleRemoveCustomDoctor = (index: number) => {
    setCustomDoctorNames((prev) => prev.filter((_, i) => i !== index));
  };

  // Handle local image file upload.
  // A foto vai para dentro do documento do procedimento no Firestore, que tem teto de 1MB — uma
  // foto de celular crua (3 a 8MB em base64) estoura esse teto sozinha. O upload sem redução era
  // exatamente o motivo de a troca de foto "funcionar" na tela e se desfazer depois: o cache local
  // aceitava, o servidor recusava. O recorte é quem reduz agora: só entra em `images` o JPEG já
  // enquadrado e redimensionado.
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    const selected: File[] = [];
    if (files) {
      for (let i = 0; i < files.length; i += 1) {
        const file = files.item(i);
        if (file && file.type.startsWith('image/')) selected.push(file);
      }
    }
    // Só depois de copiar os arquivos: limpar o value esvazia a FileList do input, e é o que
    // permite reenviar o mesmo arquivo logo depois de remover ou de cancelar o recorte.
    e.target.value = '';
    if (selected.length === 0) return;

    setUploadError('');
    setAdjustingImage(null);
    setCropQueue(selected);
    setCropQueueTotal(selected.length);
  };

  /** Foto no recorte agora: a que está sendo reajustada tem prioridade sobre a fila de uploads. */
  const cropSource: File | string | null = adjustingImage ? adjustingImage.src : cropQueue[0] ?? null;

  const handleCropConfirm = (dataUrl: string) => {
    if (adjustingImage) {
      const { index } = adjustingImage;
      setImages((prev) => prev.map((img, i) => (i === index ? dataUrl : img)));
      setAdjustingImage(null);
      return;
    }
    setImages((prev) => [...prev, dataUrl]);
    setCropQueue((prev) => prev.slice(1));
  };

  const handleCropCancel = () => {
    if (adjustingImage) {
      setAdjustingImage(null);
      return;
    }
    // Cancelar no meio de uma seleção múltipla descarta as fotos que ainda faltavam.
    setCropQueue([]);
    setCropQueueTotal(0);
  };

  const handleAddImageUrl = () => {
    if (!imageUrlInput.trim()) return;
    setImages((prev) => [...prev, imageUrlInput.trim()]);
    setImageUrlInput('');
  };

  const handleRemoveImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
    // Remover uma foto é exatamente a ação que o aviso de tamanho pede; o aviso some junto.
    setErrors((prev) => {
      if (!prev.images) return prev;
      const { images: _descartado, ...resto } = prev;
      return resto;
    });
    setUploadError('');
  };

  const handleAddBenefit = () => {
    if (!newBenefitInput.trim()) return;
    setBenefits((prev) => [...prev, newBenefitInput.trim()]);
    setNewBenefitInput('');
  };

  const handleRemoveBenefit = (index: number) => {
    setBenefits((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddArea = () => {
    if (!newAreaInput.trim()) return;
    setAreasTreated((prev) => [...prev, newAreaInput.trim()]);
    setNewAreaInput('');
  };

  const handleRemoveArea = (index: number) => {
    setAreasTreated((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddQuoteDetail = () => {
    setQuoteDetails((prev) => [
      ...prev,
      { id: `qd-${Date.now()}-${prev.length}`, titulo: '', valor: '' },
    ]);
  };

  const handleUpdateQuoteDetail = (id: string, field: 'titulo' | 'valor', value: string) => {
    setQuoteDetails((prev) => prev.map((d) => (d.id === id ? { ...d, [field]: value } : d)));
  };

  const handleRemoveQuoteDetail = (id: string) => {
    setQuoteDetails((prev) => prev.filter((d) => d.id !== id));
  };

  /**
   * Grava o procedimento. Serve aos dois caminhos do formulário: o "Salvar" de sempre, que fecha o
   * modal, e o "Aplicar" do modo laser, que mantém o modal aberto para a próxima área.
   *
   * Devolve `true` quando gravou, para que quem chamou saiba se pode seguir adiante.
   */
  const salvarProcedimento = async ({ fecharAoFim }: { fecharAoFim: boolean }): Promise<boolean> => {
    const newErrors: Record<string, string> = {};

    if (!title.trim()) newErrors.title = 'O título do procedimento é obrigatório';
    // No modo laser a descrição sai do caminho crítico: ela é a mesma nas treze áreas e vem dos
    // padrões da categoria. Exigi-la aqui obrigaria a escrever o mesmo parágrafo treze vezes.
    if (!ehLaser && !description.trim()) newErrors.description = 'A descrição é obrigatória';
    if (!price || isNaN(Number(price)) || Number(price) < 0) {
      newErrors.price = 'Informe um valor numérico válido';
    }
    if (ehLaser && laserAreas.length === 0) {
      newErrors.laser = 'Destaque ao menos uma área no manequim antes de aplicar.';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return false;
    }

    const finalCategory = (isAddingCustomCategory && customCategory.trim())
      ? customCategory.trim()
      : (customCategory.trim() || category.trim() || 'Harmonização & Injetáveis');

    // Build assigned doctors names formatted (clean name only)
    const selectedRegisteredDoctorNames = availableDoctors
      .filter((d) => assignedDoctorIds.includes(d.id))
      .map((d) => d.name);
    
    const finalDoctorNames = [...selectedRegisteredDoctorNames, ...customDoctorNames];

    const finalImages = images.length > 0
      ? images
      : ['https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=1000&auto=format&fit=crop&q=80'];

    // No modo laser, o "dono" da área pode ser um procedimento escolhido na faixa de pendentes, e
    // não o que abriu o modal — é assim que os treze já cadastrados ganham área sem virar cópia.
    const baseDoProcedimento = procedimentoLaserAlvo || procedureToEdit;
    const procedureId = baseDoProcedimento ? baseDoProcedimento.id : `proc-${Date.now()}`;

    setIsSaving(true);
    setSavingStatus('Preparando fotos...');

    let uploadedImages: string[] = [];
    try {
      uploadedImages = await Promise.all(
        finalImages.map(async (img, idx) => {
          if (img && img.startsWith('data:')) {
            setSavingStatus(`Enviando foto ${idx + 1} de ${finalImages.length} para a nuvem...`);
            const compressed = await downscaleDataUrl(img, 1000, 0.78);
            return await subirImagemOuManter(compressed, `procedimentos/${procedureId}`);
          }
          return img;
        })
      );
    } catch (uploadErr) {
      console.warn('Aviso ao preparar fotos do procedimento:', uploadErr);
      uploadedImages = finalImages;
    }

    // Linhas em branco (ou só com título) não viram detalhe: iriam para o PDF como rótulo sem resposta
    const cleanedQuoteDetails: QuoteItemDetail[] = quoteDetails
      .map((d) => ({ ...d, titulo: d.titulo.trim(), valor: d.valor.trim() }))
      .filter((d) => d.titulo && d.valor);

    const procedureData: Procedure = {
      id: procedureId,
      title: title.trim(),
      subtitle: subtitle.trim() || undefined,
      category: finalCategory,
      description: description.trim(),
      price: Number(price),
      promotionalPrice: promotionalPrice ? Number(promotionalPrice) : undefined,
      priceNote: priceNote.trim() || 'por sessão',
      isStartingPrice: isStartingPrice,
      duration: duration.trim() || undefined,
      sessionsRecommended: sessionsRecommended.trim() || undefined,
      recoveryTime: recoveryTime.trim() || undefined,
      images: uploadedImages,
      benefits: benefits.length > 0 ? benefits : ['Melhora estética e bem-estar'],
      areasTreated: areasTreated.length > 0 ? areasTreated : undefined,
      contraindications: contraindications.trim() || undefined,
      idealCandidate: idealCandidate.trim() || undefined,
      isFeatured: isFeatured,
      // Array sempre presente (mesmo vazio): saveProcedureToDb usa merge:true e descarta
      // undefined, então `undefined` deixaria os detalhes antigos gravados ao apagar todos
      quoteDetails: cleanedQuoteDetails,
      assignedDoctorIds: assignedDoctorIds.length > 0 ? assignedDoctorIds : undefined,
      assignedDoctorNames: finalDoctorNames.length > 0 ? finalDoctorNames : undefined,
      // Fora do laser o campo some do documento em vez de ir vazio: `saveProcedureToDb` grava com
      // merge, então um array vazio apagaria as áreas, mas `undefined` é descartado — e é isso que
      // faz a troca de categoria (que já limpou o estado) remover o desenho de fato.
      laserAreas: ehLaser && laserAreas.length > 0 ? laserAreas : undefined,
      order: baseDoProcedimento?.order || 99,
      createdAt: baseDoProcedimento?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Mesma checagem que saveProcedureToDb faz antes de gravar, só que aqui ela ainda dá para
    // mostrar no formulário com as fotos à vista, em vez de virar um toast depois que o modal fechou.
    const bytes = estimateFirestoreDocBytes(procedureData);
    if (bytes > FIRESTORE_DOC_SAFE_BYTES) {
      setErrors({
        images: `As imagens somam ${(bytes / 1024 / 1024).toFixed(2)} MB e passam do limite de 1 MB por procedimento. Remova alguma foto (ou use um link de imagem) antes de salvar.`,
      });
      setIsSaving(false);
      setSavingStatus('');
      return false;
    }

    setSavingStatus('Sincronizando com o servidor...');
    try {
      await onSave(procedureData);
      if (fecharAoFim) onClose();
      return true;
    } catch (saveErr) {
      console.error('Falha ao salvar procedimento:', saveErr);
      const motivo = saveErr instanceof Error ? saveErr.message : 'Erro ao persistir na nuvem.';
      setErrors((prev) => ({
        ...prev,
        images: `Não foi possível salvar na nuvem: ${motivo}`,
      }));
      return false;
    } finally {
      setIsSaving(false);
      setSavingStatus('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await salvarProcedimento({ fecharAoFim: true });
  };

  /**
   * "Aplicar" do modo laser: grava esta área e devolve o formulário limpo para a próxima.
   *
   * Grava na hora, uma área por vez, em vez de acumular tudo para um "Salvar" no fim. São treze
   * regiões numa sentada — perder o trabalho inteiro por uma aba fechada ou uma queda de rede não
   * compensa as doze gravações economizadas, que na cota do Firestore são alguns KB.
   */
  const handleAplicarArea = async () => {
    const gravou = await salvarProcedimento({ fecharAoFim: false });
    if (!gravou) return;

    setAreaAplicada(title.trim());
    window.setTimeout(() => setAreaAplicada(null), 2600);

    // Volta ao estado "nenhuma área em edição": o mapa fica pronto para o próximo laço, e a área
    // recém-aplicada já aparece como botão, vinda do catálogo.
    setLaserAreas([]);
    setProcedimentoLaserAlvo(null);
    setTitle('');
    setPrice('');
    setPromotionalPrice('');
    setMostrarTodosCampos(false);
    setErrors({});
  };

  /** Há desenho na tela que ainda não virou procedimento. */
  const temRascunhoNaoAplicado =
    ehLaser && laserAreas.length > 0 && !procedureToEdit && !procedimentoLaserAlvo;

  /**
   * Trocar a categoria para fora do laser descarta o desenho.
   *
   * Sem manequim onde aparecer, uma área vira dado invisível: ninguém a vê para apagar e ela
   * ressuscita no dia em que a categoria voltar, provavelmente já sem relação com o que o
   * procedimento virou. Descartar é a única saída que não deixa lixo escondido — e o aviso
   * aparece antes, não depois.
   */
  const handleCategoriaChange = (nova: string) => {
    const saindoDoLaser = ehLaser && !isLaserCategory(nova) && laserAreas.length > 0;
    if (saindoDoLaser) {
      const nome = (procedimentoLaserAlvo || procedureToEdit)?.title || 'esta área';
      if (
        !window.confirm(
          `Ao sair da categoria "Depilação a Laser", a área desenhada para ${nome} é apagada. Continuar?`
        )
      ) {
        return;
      }
      setLaserAreas([]);
      setProcedimentoLaserAlvo(null);
    }
    setCategory(nova);
  };

  /** Carrega no painel um procedimento que já existe, para ele receber o próximo desenho. */
  const handleSelecionarProcedimentoDoMapa = (proc: Procedure) => {
    setProcedimentoLaserAlvo(proc);
    setTitle(proc.title);
    setSubtitle(proc.subtitle || '');
    setDescription(proc.description || '');
    setPrice(proc.price ? String(proc.price) : '');
    setPromotionalPrice(proc.promotionalPrice ? String(proc.promotionalPrice) : '');
    setPriceNote(proc.priceNote || 'por sessão');
    setIsStartingPrice(Boolean(proc.isStartingPrice));
    setDuration(proc.duration || '');
    setSessionsRecommended(proc.sessionsRecommended || '');
    setRecoveryTime(proc.recoveryTime || '');
    setImages(proc.images || []);
    setBenefits(proc.benefits || []);
    setAreasTreated(proc.areasTreated || []);
    setContraindications(proc.contraindications || '');
    setIdealCandidate(proc.idealCandidate || '');
    setIsFeatured(Boolean(proc.isFeatured));
    setQuoteDetails(proc.quoteDetails || []);
    setAssignedDoctorIds(proc.assignedDoctorIds || []);
    setLaserAreas(proc.laserAreas || []);
    setErrors({});
  };

  /** Fechar com um laço desenhado e não aplicado pede confirmação — o desenho se perde. */
  const handleFechar = () => {
    if (temRascunhoNaoAplicado && !confirmandoSaida) {
      setConfirmandoSaida(true);
      return;
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-fadeIn">
      <div 
        // O modo laser precisa de um modal largo: manequim grande de um lado, painel de campos do
        // outro, e ainda o anel de botões em volta. Com os `max-w-3xl` (768px) do cadastro comum
        // não sobra largura para nada disso.
        className={`relative w-full bg-[#F9F8F6]/95 backdrop-blur-xl rounded-sm overflow-hidden shadow-2xl border border-white/60 my-6 transition-all ${
          ehLaser ? 'max-w-[1240px]' : 'max-w-3xl'
        }`}
        id="procedure-form-modal"
      >
        {/* Header */}
        <div className="bg-[#1A1A1A] text-[#E5E4E0] px-6 py-4 flex items-center justify-between border-b border-white/10">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[#C49B74]">
              Cadastro & Gestão
            </span>
            <h2 className="font-serif-luxury text-xl sm:text-2xl font-medium text-white">
              {procedureToEdit ? 'Editar Procedimento' : 'Novo Procedimento Estético'}
            </h2>
          </div>
          <button
            onClick={handleFechar}
            className="p-1.5 rounded-xs text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* ==========================================
              MODO LASER — o mapa corporal substitui a entrada normal do formulário.
              A ordem é a do fluxo pedido: categoria → destacar a área → nome → demais dados.
              ========================================== */}
          {ehLaser && (
            <div className="space-y-4">
              {!mostrarTodosCampos && (
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-[#1A1A1A] mb-1">Categoria</label>
                    <select
                      value={category}
                      onChange={(e) => handleCategoriaChange(e.target.value)}
                      className="w-full px-3 py-2 rounded-sm bg-white/70 backdrop-blur-xs border border-white/80 text-xs font-medium text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                    >
                      {allCategories.map((cat, idx) => (
                        <option key={idx} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <p className="text-[11px] text-[#8a8578] pb-2 flex-1">
                    Esta categoria abre o mapa corporal. Destaque a região no manequim para liberar
                    os campos do procedimento.
                  </p>
                </div>
              )}

              {areaAplicada && (
                <p className="text-[12px] text-[#1B5E20] bg-[#E8F5E9] border border-[#C8E6C9] rounded-sm px-3 py-2 flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" />
                  <strong>{areaAplicada}</strong> aplicada ao mapa. Destaque a próxima área.
                </p>
              )}

              {errors.laser && (
                <p className="text-[12px] text-red-600 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {errors.laser}
                </p>
              )}

              <LaserAreaEditor
                procedures={allProcedures}
                clinic={clinic || ({} as ClinicProfile)}
                procedimentoEmEdicao={procedimentoLaserAlvo || procedureToEdit}
                laserAreas={laserAreas}
                onLaserAreasChange={setLaserAreas}
                onSelecionarProcedimento={handleSelecionarProcedimentoDoMapa}
                onAbrirConfiguracoes={onAbrirConfiguracoes}
              >
                <div className="bg-white/70 border border-white/80 rounded-sm p-4 space-y-3">
                  {procedimentoLaserAlvo && (
                    <p className="text-[11px] text-[#8E5B1A] bg-[#FDF6E7] border border-[#F0DCB4] rounded-xs px-2.5 py-1.5 leading-snug">
                      Desenhando a área de um procedimento que já existe. O preço cadastrado foi
                      mantido.
                    </p>
                  )}

                  <div>
                    <label className="block text-[11px] font-medium text-[#1A1A1A] mb-1">
                      Nome do procedimento *
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Ex: Virilha Completa"
                      className={`w-full px-3 py-2 rounded-sm bg-white border text-xs text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52] ${
                        errors.title ? 'border-red-400' : 'border-gray-200'
                      }`}
                    />
                    {errors.title && (
                      <p className="text-[10px] text-red-600 mt-1">{errors.title}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-medium text-[#1A1A1A] mb-1">
                        Valor (R$) *
                      </label>
                      <input
                        type="number"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        min="0"
                        step="0.01"
                        className={`w-full px-3 py-2 rounded-sm bg-white border text-xs text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52] ${
                          errors.price ? 'border-red-400' : 'border-gray-200'
                        }`}
                      />
                      {errors.price && (
                        <p className="text-[10px] text-red-600 mt-1">{errors.price}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-[#1A1A1A] mb-1">
                        Promocional
                      </label>
                      <input
                        type="number"
                        value={promotionalPrice}
                        onChange={(e) => setPromotionalPrice(e.target.value)}
                        min="0"
                        step="0.01"
                        className="w-full px-3 py-2 rounded-sm bg-white border border-gray-200 text-xs text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-[#1A1A1A] mb-1">
                      Observação de preço
                    </label>
                    <input
                      type="text"
                      value={priceNote}
                      onChange={(e) => setPriceNote(e.target.value)}
                      placeholder="por sessão"
                      className="w-full px-3 py-2 rounded-sm bg-white border border-gray-200 text-xs text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-medium text-[#1A1A1A] mb-1">
                        Duração
                      </label>
                      <input
                        type="text"
                        value={duration}
                        onChange={(e) => setDuration(e.target.value)}
                        placeholder="20 min"
                        className="w-full px-3 py-2 rounded-sm bg-white border border-gray-200 text-xs text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-[#1A1A1A] mb-1">
                        Sessões
                      </label>
                      <input
                        type="text"
                        value={sessionsRecommended}
                        onChange={(e) => setSessionsRecommended(e.target.value)}
                        placeholder="6 a 10 sessões"
                        className="w-full px-3 py-2 rounded-sm bg-white border border-gray-200 text-xs text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleAplicarArea}
                    disabled={isSaving}
                    className="w-full px-4 py-2.5 rounded-sm bg-[#A67C52] text-white text-xs font-semibold uppercase tracking-widest hover:bg-[#8e6945] active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:active:scale-100"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {savingStatus || 'Aplicando...'}
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        Aplicar
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setMostrarTodosCampos((v) => !v)}
                    className="w-full text-[11px] text-[#A67C52] hover:text-[#8e6945] font-medium underline underline-offset-2"
                  >
                    {mostrarTodosCampos
                      ? 'Ocultar os demais campos'
                      : 'Mostrar todos os campos do cadastro'}
                  </button>

                  <p className="text-[10px] text-[#8a8578] leading-snug">
                    Descrição, contraindicações, recuperação e fotos vêm dos padrões da categoria
                    quando ficam em branco — preencha só o que for diferente nesta área.
                  </p>
                </div>
              </LaserAreaEditor>
            </div>
          )}

          {(!ehLaser || mostrarTodosCampos) && (
            <>
          {/* Section 1: Basic Information */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-[#A67C52] flex items-center gap-1.5 pb-1 border-b border-white/60">
              <Sparkles className="w-3.5 h-3.5" />
              Informações Principais
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-[#1A1A1A] mb-1">
                  Título do Procedimento *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Harmonização Facial Completa, Botox Preventivo, etc."
                  className="w-full px-3.5 py-2.5 rounded-sm bg-white/70 backdrop-blur-xs border border-white/80 text-xs font-medium text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52] transition-all"
                  required
                />
                {errors.title && <p className="text-xs text-red-600 mt-1">{errors.title}</p>}
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-[#1A1A1A] mb-1">
                  Subtítulo / Tagline de Destaque
                </label>
                <input
                  type="text"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  placeholder="Ex: Contorno escultural, eversão delicada e viço imediato"
                  className="w-full px-3.5 py-2 rounded-sm bg-white/70 backdrop-blur-xs border border-white/80 text-xs font-medium text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52] transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1A1A1A] mb-1">
                  Categoria
                </label>
                {!isAddingCustomCategory ? (
                  <div className="flex gap-2">
                    <select
                      value={category}
                      onChange={(e) => handleCategoriaChange(e.target.value)}
                      className="flex-1 px-3 py-2 rounded-sm bg-white/70 backdrop-blur-xs border border-white/80 text-xs font-medium text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                    >
                      {allCategories.map((cat, idx) => (
                        <option key={idx} value={cat}>{cat}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomCategory('');
                        setIsAddingCustomCategory(true);
                      }}
                      className="px-3 py-2 text-xs bg-white/80 border border-white/80 rounded-sm text-[#1A1A1A] hover:bg-white font-medium transition-colors"
                      title="Criar Nova Categoria"
                    >
                      + Nova
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-1.5 animate-fadeIn">
                    <input
                      type="text"
                      value={customCategory}
                      onChange={(e) => setCustomCategory(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleConfirmCustomCategory();
                        }
                      }}
                      placeholder="Nome da nova categoria (ex: Corporal)"
                      className="flex-1 px-3 py-2 rounded-sm bg-white/90 border border-[#A67C52]/50 text-xs font-medium text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={handleConfirmCustomCategory}
                      className="px-3 py-2 text-xs bg-[#1A1A1A] text-white font-semibold rounded-sm hover:bg-black transition-colors"
                    >
                      Adicionar
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsAddingCustomCategory(false)}
                      className="px-2.5 py-2 text-xs bg-gray-200 text-gray-700 rounded-sm hover:bg-gray-300 transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center pt-5">
                <label className="flex items-center gap-2.5 cursor-pointer bg-white/70 backdrop-blur-xs px-3.5 py-2 rounded-sm border border-white/80 w-full hover:border-[#A67C52]/60 transition-colors">
                  <input
                    type="checkbox"
                    checked={isFeatured}
                    onChange={(e) => setIsFeatured(e.target.checked)}
                    className="w-4 h-4 text-[#A67C52] rounded-xs border-gray-300 focus:ring-[#A67C52]"
                  />
                  <div className="flex items-center gap-1.5 text-xs font-medium text-[#1A1A1A]">
                    <Star className={`w-3.5 h-3.5 ${isFeatured ? 'text-[#A67C52] fill-[#A67C52]' : 'text-gray-400'}`} />
                    Destacar este procedimento no catálogo
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* Section: Doctor / Professional Assignment (Required by User) */}
          <div className="space-y-4 bg-white/40 p-4 rounded-sm border border-white/80 shadow-xs">
            <div className="flex items-center justify-between pb-1 border-b border-white/60">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-[#A67C52] flex items-center gap-1.5">
                <Stethoscope className="w-3.5 h-3.5" />
                Médica(s) Responsável(is) pelo Procedimento
              </h3>
              <span className="text-[10px] text-gray-500 font-medium">
                {assignedDoctorIds.length + customDoctorNames.length === 0
                  ? 'Nenhuma selecionada'
                  : assignedDoctorIds.length + customDoctorNames.length === 1
                  ? '1 Médica atribuída'
                  : `${assignedDoctorIds.length + customDoctorNames.length} Médicas atribuídas`}
              </span>
            </div>

            <p className="text-[11px] text-gray-600">
              Selecione quais profissionais realizam este procedimento na La Vie Clinique. No catálogo poderá constar 1 ou 2 médicas responsáveis:
            </p>

            {/* Doctor Selection Checkboxes / Cards */}
            {availableDoctors.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {availableDoctors.map((doc) => {
                  const isSelected = assignedDoctorIds.includes(doc.id);
                  return (
                    <div
                      key={doc.id}
                      onClick={() => toggleDoctorSelection(doc.id)}
                      className={`flex items-start gap-3 p-3 rounded-xs border cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-white border-[#A67C52] shadow-xs ring-1 ring-[#A67C52]'
                          : 'bg-white/60 border-white/80 hover:bg-white hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleDoctorSelection(doc.id)}
                        className="mt-0.5 w-4 h-4 text-[#A67C52] rounded-xs border-gray-300 focus:ring-[#A67C52] cursor-pointer"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-[#1A1A1A]">{doc.name}</p>
                          {(doc.specialty || doc.title) && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded-xs bg-[#A67C52]/15 text-[#A67C52] font-semibold truncate max-w-[140px]">
                              {doc.specialty || doc.title}
                            </span>
                          )}
                        </div>
                        {doc.title && doc.specialty && (
                          <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-1">{doc.title}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-gray-500 italic">
                Nenhuma médica cadastrada nas configurações da clínica. Você pode adicionar abaixo ou em "Configurações".
              </p>
            )}

            {/* Custom Doctor Addition */}
            <div className="pt-2">
              <label className="block text-[11px] font-medium text-gray-700 mb-1">
                Ou atribuir médica / especialista avulsa para este procedimento:
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCustomDoctorInput}
                  onChange={(e) => setNewCustomDoctorInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCustomDoctor();
                    }
                  }}
                  placeholder="Ex: Dra. Nome da Médica • Especialidade"
                  className="flex-1 px-3 py-1.5 rounded-xs bg-white border border-gray-200 text-xs text-[#1A1A1A]"
                />
                <button
                  type="button"
                  onClick={handleAddCustomDoctor}
                  className="px-3 py-1.5 bg-[#1A1A1A] text-white text-xs font-medium rounded-xs hover:bg-[#333]"
                >
                  Adicionar
                </button>
              </div>

              {customDoctorNames.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {customDoctorNames.map((name, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 text-xs bg-[#C49B74]/20 text-[#1A1A1A] px-2.5 py-0.5 rounded-xs border border-[#C49B74]/40"
                    >
                      <UserCheck className="w-3 h-3 text-[#A67C52]" />
                      {name}
                      <button
                        type="button"
                        onClick={() => handleRemoveCustomDoctor(idx)}
                        className="text-red-500 hover:text-red-700 ml-1"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Values & Investment */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-[#A67C52] flex items-center gap-1.5 pb-1 border-b border-white/60">
              <span className="font-serif-luxury text-sm">R$</span>
              Valores e Investimento
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#1A1A1A] mb-1">
                  Valor Normal (R$) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="Ex: 1500"
                  className="w-full px-3.5 py-2 rounded-sm bg-white/70 backdrop-blur-xs border border-white/80 text-xs font-medium text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                  required
                />
                {errors.price && <p className="text-xs text-red-600 mt-1">{errors.price}</p>}
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1A1A1A] mb-1">
                  Valor Promocional (R$) <span className="text-gray-500 font-normal">(Opcional)</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={promotionalPrice}
                  onChange={(e) => setPromotionalPrice(e.target.value)}
                  placeholder="Ex: 1250"
                  className="w-full px-3.5 py-2 rounded-sm bg-white/70 backdrop-blur-xs border border-white/80 text-xs font-medium text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1A1A1A] mb-1">
                  Condição / Sufixo do Valor
                </label>
                <input
                  type="text"
                  value={priceNote}
                  onChange={(e) => setPriceNote(e.target.value)}
                  placeholder="Ex: por sessão, pacote 3x, a partir de"
                  className="w-full px-3.5 py-2 rounded-sm bg-white/70 backdrop-blur-xs border border-white/80 text-xs font-medium text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                />
              </div>
            </div>

            {/* Checkbox "A partir de" */}
            <div className="bg-white/60 backdrop-blur-xs border border-white/80 rounded-sm p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <label 
                htmlFor="procedure-is-starting-price" 
                className="flex items-start sm:items-center gap-3 cursor-pointer select-none group"
              >
                <input
                  type="checkbox"
                  id="procedure-is-starting-price"
                  checked={isStartingPrice}
                  onChange={(e) => setIsStartingPrice(e.target.checked)}
                  className="w-4 h-4 mt-0.5 sm:mt-0 rounded border-gray-300 text-[#A67C52] focus:ring-[#A67C52] accent-[#A67C52] cursor-pointer"
                />
                <div>
                  <span className="text-xs font-semibold text-[#1A1A1A] group-hover:text-[#A67C52] transition-colors flex items-center gap-1.5">
                    Habilitar "A partir de" no preço
                  </span>
                  <p className="text-[11px] text-[#737373] mt-0.5">
                    Adiciona o prefixo "a partir de" antes do valor nos cards, no catálogo e nos orçamentos.
                  </p>
                </div>
              </label>

              {price && !isNaN(Number(price)) && Number(price) > 0 && (
                <div className="text-left sm:text-right shrink-0 bg-[#F5F2ED] px-3 py-1.5 rounded border border-[#E5DFD7]">
                  <span className="text-[10px] text-[#8a8578] uppercase tracking-wider block font-medium">Prévia no catálogo:</span>
                  <span className="text-xs font-semibold text-[#8E653D]">
                    {isStartingPrice ? 'a partir de ' : ''}
                    {formatBRL(promotionalPrice && Number(promotionalPrice) > 0 ? Number(promotionalPrice) : Number(price))}
                    {priceNote ? ` ${priceNote}` : ''}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Section 3: Clinical Specs */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-[#A67C52] flex items-center gap-1.5 pb-1 border-b border-white/60">
              <Sparkles className="w-3.5 h-3.5" />
              Especificações e Protocolo
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#1A1A1A] mb-1">
                  Duração do Atendimento
                </label>
                <input
                  type="text"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  placeholder="Ex: 45 min, 1h 30min"
                  className="w-full px-3.5 py-2 rounded-sm bg-white/70 backdrop-blur-xs border border-white/80 text-xs font-medium text-[#1A1A1A]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1A1A1A] mb-1">
                  Plano Recomendado
                </label>
                <input
                  type="text"
                  value={sessionsRecommended}
                  onChange={(e) => setSessionsRecommended(e.target.value)}
                  placeholder="Ex: 1 a 3 sessões anuais"
                  className="w-full px-3.5 py-2 rounded-sm bg-white/70 backdrop-blur-xs border border-white/80 text-xs font-medium text-[#1A1A1A]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1A1A1A] mb-1">
                  Recuperação / Downtime
                </label>
                <input
                  type="text"
                  value={recoveryTime}
                  onChange={(e) => setRecoveryTime(e.target.value)}
                  placeholder="Ex: Sem downtime, 48h leve edema"
                  className="w-full px-3.5 py-2 rounded-sm bg-white/70 backdrop-blur-xs border border-white/80 text-xs font-medium text-[#1A1A1A]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#1A1A1A] mb-1">
                Descrição Completa do Procedimento *
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descreva detalhadamente a técnica, substâncias utilizadas, objetivos e resultados esperados..."
                className="w-full px-3.5 py-2.5 rounded-sm bg-white/70 backdrop-blur-xs border border-white/80 text-xs font-medium text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
                required
              />
              {errors.description && <p className="text-xs text-red-600 mt-1">{errors.description}</p>}
            </div>

            {/* Interactive Benefits list */}
            <div>
              <label className="block text-xs font-medium text-[#1A1A1A] mb-1">
                Benefícios & Destaques (Tags)
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={newBenefitInput}
                  onChange={(e) => setNewBenefitInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddBenefit();
                    }
                  }}
                  placeholder="Digite um benefício e aperte Adicionar (ex: Efeito lifting sem cortes)"
                  className="flex-1 px-3 py-1.5 rounded-sm bg-white/70 border border-white/80 text-xs text-[#1A1A1A]"
                />
                <button
                  type="button"
                  onClick={handleAddBenefit}
                  className="px-3 py-1.5 bg-[#1A1A1A] text-white text-xs font-medium rounded-sm hover:bg-[#2A2A2E]"
                >
                  Adicionar
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {benefits.map((b, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 text-xs bg-white/80 backdrop-blur-xs px-2.5 py-1 rounded-xs border border-white/90 text-[#1A1A1A]"
                  >
                    ✦ {b}
                    <button
                      type="button"
                      onClick={() => handleRemoveBenefit(idx)}
                      className="text-red-500 hover:text-red-700 ml-1"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* Areas Treated */}
            <div>
              <label className="block text-xs font-medium text-[#1A1A1A] mb-1">
                Regiões Aplicadas (Opcional)
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={newAreaInput}
                  onChange={(e) => setNewAreaInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddArea();
                    }
                  }}
                  placeholder="Ex: Lábios, Mandíbula, Terço Superior"
                  className="flex-1 px-3 py-1.5 rounded-sm bg-white/70 border border-white/80 text-xs text-[#1A1A1A]"
                />
                <button
                  type="button"
                  onClick={handleAddArea}
                  className="px-3 py-1.5 bg-white/60 border border-white/80 text-[#1A1A1A] text-xs font-medium rounded-sm"
                >
                  + Região
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {areasTreated.map((a, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 text-xs bg-white/60 px-2 py-0.5 rounded-xs border border-white/70 text-gray-600"
                  >
                    {a}
                    <button
                      type="button"
                      onClick={() => handleRemoveArea(idx)}
                      className="text-red-500 hover:text-red-700"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Section 3.5: Quote Details — pré-preenchem a grade de detalhes do item no orçamento */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-[#A67C52] flex items-center gap-1.5 pb-1 border-b border-white/60">
              <FileText className="w-3.5 h-3.5" />
              Detalhes para Orçamento ({quoteDetails.length})
            </h3>

            <p className="text-[11px] leading-relaxed text-gray-500">
              Campos que já nascem preenchidos no orçamento deste procedimento — produto, unidades,
              duração do efeito, anestesia, intervalo. Quem emitir pode editar ou remover cada um.
              <span className="block mt-1 text-gray-400">
                Duração, sessões, recuperação e regiões aplicadas já entram automaticamente, não
                precisa repetir aqui.
              </span>
            </p>

            <div className="space-y-2">
              {quoteDetails.map((detail) => (
                <div key={detail.id} className="flex gap-2 items-start">
                  <input
                    type="text"
                    value={detail.titulo}
                    onChange={(e) => handleUpdateQuoteDetail(detail.id, 'titulo', e.target.value)}
                    placeholder="Produto / marca"
                    className="w-2/5 px-3 py-1.5 rounded-sm bg-white/70 border border-white/80 text-xs text-[#1A1A1A]"
                  />
                  <input
                    type="text"
                    value={detail.valor}
                    onChange={(e) => handleUpdateQuoteDetail(detail.id, 'valor', e.target.value)}
                    placeholder="Botulift® 100U"
                    className="flex-1 px-3 py-1.5 rounded-sm bg-white/70 border border-white/80 text-xs text-[#1A1A1A]"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveQuoteDetail(detail.id)}
                    aria-label={`Remover detalhe ${detail.titulo || 'sem título'}`}
                    className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-sm transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={handleAddQuoteDetail}
                className="px-3 py-1.5 bg-white/60 border border-white/80 text-[#1A1A1A] text-xs font-medium rounded-sm hover:bg-white/80 transition-colors flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Adicionar campo
              </button>
            </div>
          </div>

          {/* Section 4: Images & Visuals */}
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-1 border-b border-white/60">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-[#A67C52] flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5" />
                Imagens do Procedimento ({images.length}) *
              </h3>
              <button
                type="button"
                onClick={() => setShowPresetLibrary(!showPresetLibrary)}
                className="text-xs font-semibold text-[#A67C52] hover:text-[#8e6945] flex items-center gap-1"
              >
                {showPresetLibrary ? 'Ocultar Banco de Fotos' : 'Ver Banco de Fotos Estéticas'}
              </button>
            </div>

            {/* Preset Photo Picker */}
            {showPresetLibrary && (
              <div className="p-3 bg-white/60 backdrop-blur-md rounded-sm border border-white/80 space-y-2">
                <p className="text-xs font-medium text-gray-600">
                  Selecione fotos de estética premium com um clique:
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {PRESET_IMAGE_LIBRARY.map((preset, pIdx) => (
                    <div
                      key={pIdx}
                      onClick={() => setImages((prev) => [...prev, preset.url])}
                      className="relative aspect-4/3 rounded-xs overflow-hidden cursor-pointer group border border-white/80 hover:border-[#A67C52] transition-all"
                    >
                      <img src={preset.url} alt={preset.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 flex items-end p-1.5 transition-colors">
                        <span className="text-[10px] text-white font-medium line-clamp-1">{preset.title}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Upload Box & URL input */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex flex-col items-center justify-center p-4 border border-dashed border-white/80 rounded-sm bg-white/60 backdrop-blur-xs transition-all group hover:border-[#A67C52] cursor-pointer">
                <Upload className="w-6 h-6 text-gray-400 group-hover:text-[#A67C52] mb-1" />
                <span className="text-xs font-medium text-[#1A1A1A]">Fazer upload de foto</span>
                <span className="text-[10px] text-gray-500">PNG, JPG, WEBP — você enquadra a foto antes de salvar</span>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>

              <div className="flex flex-col justify-center gap-2 p-3 bg-white/60 backdrop-blur-xs border border-white/80 rounded-sm">
                <span className="text-xs font-medium text-[#1A1A1A] flex items-center gap-1">
                  <LinkIcon className="w-3.5 h-3.5 text-gray-400" /> Ou colar URL de imagem:
                </span>
                <div className="flex gap-1.5">
                  <input
                    type="url"
                    value={imageUrlInput}
                    onChange={(e) => setImageUrlInput(e.target.value)}
                    placeholder="https://..."
                    className="flex-1 px-2.5 py-1.5 text-xs rounded-sm border border-white/80 bg-white/80"
                  />
                  <button
                    type="button"
                    onClick={handleAddImageUrl}
                    className="px-2.5 py-1.5 text-xs bg-[#1A1A1A] text-white rounded-sm font-medium"
                  >
                    Adicionar
                  </button>
                </div>
              </div>
            </div>

            {/* Current Images List */}
            {images.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {images.map((img, idx) => (
                  <div key={idx} className="relative aspect-square rounded-xs overflow-hidden border border-white/80 group">
                    <img src={img} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    {idx === 0 && (
                      <span className="absolute top-1 left-1 text-[9px] font-bold bg-[#1A1A1A] text-[#C49B74] px-1.5 py-0.5 rounded-xs">
                        Capa
                      </span>
                    )}
                    <div className="absolute top-1 right-1 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setUploadError('');
                          setCropQueue([]);
                          setCropQueueTotal(0);
                          setAdjustingImage({ index: idx, src: img });
                        }}
                        className="p-1.5 bg-[#1A1A1A]/85 hover:bg-[#1A1A1A] text-white rounded-full shadow-sm transition-colors"
                        title="Ajustar enquadramento"
                      >
                        <Crop className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveImage(idx)}
                        className="p-1.5 bg-red-600/90 hover:bg-red-600 active:bg-red-700 text-white rounded-full shadow-sm transition-colors"
                        title="Remover imagem"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {uploadError && (
              <p className="flex items-start gap-1.5 text-xs text-red-600">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
                {uploadError}
              </p>
            )}
            {errors.images && (
              <p className="flex items-start gap-1.5 text-xs text-red-600">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
                {errors.images}
              </p>
            )}
          </div>

            </>
          )}

          {/* Form Actions Footer */}
          <div className="pt-4 border-t border-white/60 flex items-center justify-end gap-3 sticky bottom-0 bg-[#F9F8F6]/90 backdrop-blur-md py-2">
            {confirmandoSaida && (
              <p className="text-[11px] text-[#8E5B1A] mr-auto leading-snug max-w-sm">
                Há uma área desenhada que ainda não foi aplicada — ela se perde ao fechar. Toque em
                Fechar de novo para confirmar.
              </p>
            )}
            <button
              type="button"
              onClick={handleFechar}
              className={`px-4 py-2.5 rounded-sm border text-xs font-semibold uppercase tracking-wider transition-colors ${
                confirmandoSaida
                  ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100'
                  : 'border-white/80 text-gray-600 hover:bg-white'
              }`}
            >
              {/* Em modo laser quem grava é o "Aplicar" de cada área — não há o que cancelar. */}
              {ehLaser ? 'Fechar' : 'Cancelar'}
            </button>
            <button
              type="submit"
              hidden={ehLaser}
              disabled={cropSource !== null || isSaving}
              className="px-6 py-2.5 rounded-sm bg-[#A67C52] text-white text-xs font-semibold uppercase tracking-widest shadow-xs hover:bg-[#8e6945] active:scale-95 transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{savingStatus || 'Salvando...'}</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>
                    {cropSource
                      ? 'Enquadrando foto...'
                      : procedureToEdit
                      ? 'Salvar Alterações'
                      : 'Cadastrar Procedimento'}
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Fora do <form>: o recorte não pode disparar o submit do procedimento. */}
      <ImageCropperModal
        isOpen={cropSource !== null}
        source={cropSource}
        title={adjustingImage ? 'Reenquadrar foto do procedimento' : 'Enquadrar foto do procedimento'}
        description="Arraste e dê zoom até a foto ficar como você quer que apareça no card, no catálogo e nos compartilhamentos."
        aspectOptions={PROCEDURE_PHOTO_ASPECTS}
        maxOutputDim={1000}
        quality={0.78}
        confirmLabel={adjustingImage ? 'Salvar recorte' : 'Adicionar foto'}
        progressLabel={
          !adjustingImage && cropQueueTotal > 1
            ? `Foto ${cropQueueTotal - cropQueue.length + 1} de ${cropQueueTotal}`
            : undefined
        }
        onCancel={handleCropCancel}
        onConfirm={handleCropConfirm}
      />
    </div>
  );
};

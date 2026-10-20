import React, { useState, useEffect, useRef } from 'react';
import { X, Upload, Plus, Trash2, Image as ImageIcon, Sparkles, AlertCircle, Check, Link as LinkIcon, Star, UserCheck, Stethoscope, FileText, Move, Loader2, Layers } from 'lucide-react';
import {
  AreaDoProcedimento,
  ClinicProfile,
  EnquadramentosDaFoto,
  Procedure,
  Professional,
  QuoteItemDetail,
  VistaDoMapa,
} from '../types';
import { PRESET_IMAGE_LIBRARY, INITIAL_CATEGORIES } from '../data/initialData';
import { formatBRL } from '../utils/formatters';
import { downscaleDataUrl, estimateFirestoreDocBytes, FIRESTORE_DOC_SAFE_BYTES } from '../utils/imageCompressor';
import { subirImagemOuManter } from '../services/imageStorage';
import { ImageCropperModal, AspectOption } from './ImageCropperModal';
import { AjusteDaFotoModal } from './AjusteDaFotoModal';
import { compactarEnquadramentos, listaDeEnquadramentosParaGravar } from '../utils/enquadramentoDaFoto';
import { isLaserCategory } from '../utils/templateMatching';
import { sessoesDoProcedimento } from '../utils/quoteFactory';
import {
  converterProcedimentosEmAreas,
  precoDaArea,
  procedimentosParaConverter,
} from '../utils/laserAreas';
import { subirFotosDoMapa } from '../services/databaseService';
import { MapaDeAreasEditor } from './laser/MapaDeAreasEditor';
import { CampoMaisDeUmaSessao } from './common/CampoMaisDeUmaSessao';
import { SidePanel } from './common/SidePanel';
import { ConfirmDialog, ConfirmRequest } from './ConfirmDialog';

/**
 * O recorte corta o próprio arquivo — serve para girar e para tirar o que não deve aparecer em
 * lugar nenhum. O formato de cada lugar (menu, catálogo, cartão) é ajustado depois, sem cortar, no
 * `AjusteDaFotoModal`; por isso o recorte começa em "Original": quanto mais foto sobra, mais
 * liberdade cada visualização tem para se posicionar.
 */
const PROCEDURE_PHOTO_ASPECTS: AspectOption[] = [
  { id: 'original', label: 'Original', ratio: null },
  { id: 'paisagem', label: 'Paisagem 3:2', ratio: 3 / 2 },
  { id: 'retrato', label: 'Retrato 2:3', ratio: 2 / 3 },
  { id: 'quadrado', label: 'Quadrado', ratio: 1 },
];

interface ProcedureFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (procedure: Procedure) => Promise<void> | void;
  procedureToEdit?: Procedure | null;
  existingCategories: string[];
  availableDoctors?: Professional[];
  /** Catálogo inteiro — é dele que saem os procedimentos de área antigos para a conversão. */
  allProcedures?: Procedure[];
  /** Os manequins e padrões antigos do laser, que a conversão aproveita. */
  clinic?: ClinicProfile;
  /**
   * Arquiva os procedimentos de área antigos que viraram áreas deste. Chamado depois que ele foi
   * salvo — antes disso, arquivar tiraria as áreas do catálogo sem ninguém para recebê-las.
   */
  onArquivarProcedimentos?: (ids: string[], emFavorDe: string) => Promise<void>;
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
  onArquivarProcedimentos,
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
  /** "Mais de 1 sessão": o número de sessões do pacote, que o orçamento herda. Texto digitado. */
  const [maisDeUmaSessao, setMaisDeUmaSessao] = useState(false);
  const [sessoesInclusas, setSessoesInclusas] = useState('');
  const [recoveryTime, setRecoveryTime] = useState('Sem downtime');
  /** O "antes de vir" que a confirmação do WhatsApp anexa quando a clínica liga a opção. */
  const [orientacoesPreProcedimento, setOrientacoesPreProcedimento] = useState('');
  /** Dias entre sessões — a ficha da paciente usa para sugerir a data da próxima. */
  const [intervaloEntreSessoesDias, setIntervaloEntreSessoesDias] = useState('');
  const [images, setImages] = useState<string[]>([]);
  /** Ajuste de cada foto no menu, no catálogo e no cartão — mesma ordem de `images`. */
  const [enquadramentos, setEnquadramentos] = useState<(EnquadramentosDaFoto | null)[]>([]);
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

  // ---- Mapa de áreas ("Exige seleção de área") ----
  const [exigeSelecaoDeArea, setExigeSelecaoDeArea] = useState(false);
  const [vistasDoMapa, setVistasDoMapa] = useState<VistaDoMapa[]>([]);
  const [areasDoMapa, setAreasDoMapa] = useState<AreaDoProcedimento[]>([]);
  /** Há uma área aberta no editor e não concluída — salvar agora a perderia. */
  const [areaEmEdicao, setAreaEmEdicao] = useState(false);
  /** Procedimentos de área antigos trazidos para cá, a arquivar depois que este for salvo. */
  const [idsParaArquivar, setIdsParaArquivar] = useState<string[]>([]);
  /**
   * ID do procedimento novo, fixo enquanto o painel estiver aberto. Salvar de novo depois de uma
   * falha no meio do caminho (o arquivamento dos antigos, por exemplo) regrava o mesmo documento
   * em vez de criar um segundo procedimento igual.
   */
  const idDoNovoRef = useRef('');

  const paraConverter = procedimentosParaConverter(allProcedures, procedureToEdit?.id).filter(
    (p) => !idsParaArquivar.includes(p.id)
  );

  const [showPresetLibrary, setShowPresetLibrary] = useState(false);
  const [confirmacao, setConfirmacao] = useState<ConfirmRequest | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploadError, setUploadError] = useState('');
  /** Fotos escolhidas no input que ainda passam pelo recorte, uma de cada vez. */
  const [cropQueue, setCropQueue] = useState<File[]>([]);
  const [cropQueueTotal, setCropQueueTotal] = useState(0);
  /**
   * Foto já adicionada que a usuária pediu para recortar (índice em `images`). `voltarAoAjuste`:
   * o recorte foi aberto de dentro do ajuste por visualização, e é para lá que ele devolve.
   */
  const [adjustingImage, setAdjustingImage] = useState<{
    index: number;
    src: string;
    voltarAoAjuste?: boolean;
  } | null>(null);
  /** Foto aberta no ajuste por visualização (índice em `images`). */
  const [fotoEmAjuste, setFotoEmAjuste] = useState<number | null>(null);

  /** Devolve à tela o "Mais de 1 sessão" gravado no procedimento (ou o desmarcado, sem procedimento). */
  const carregarSessoesInclusas = (proc: Procedure | null) => {
    const n = proc ? sessoesDoProcedimento(proc) : 1;
    setMaisDeUmaSessao(n > 1);
    setSessoesInclusas(n > 1 ? String(n) : '');
  };

  const marcarMaisDeUmaSessao = (marcado: boolean) => {
    setMaisDeUmaSessao(marcado);
    if (marcado && !(Number(sessoesInclusas) >= 2)) setSessoesInclusas('2');
  };

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
      carregarSessoesInclusas(procedureToEdit);
      setRecoveryTime(procedureToEdit.recoveryTime || '');
      setOrientacoesPreProcedimento(procedureToEdit.orientacoesPreProcedimento || '');
      setIntervaloEntreSessoesDias(
        procedureToEdit.intervaloEntreSessoesDias ? String(procedureToEdit.intervaloEntreSessoesDias) : ''
      );
      setImages(procedureToEdit.images || []);
      setEnquadramentos(procedureToEdit.enquadramentosDasFotos || []);
      setBenefits(procedureToEdit.benefits || []);
      setAreasTreated(procedureToEdit.areasTreated || []);
      setContraindications(procedureToEdit.contraindications || '');
      setIdealCandidate(procedureToEdit.idealCandidate || '');
      setIsFeatured(Boolean(procedureToEdit.isFeatured));
      setQuoteDetails(procedureToEdit.quoteDetails || []);
      setExigeSelecaoDeArea(Boolean(procedureToEdit.exigeSelecaoDeArea));
      setVistasDoMapa(procedureToEdit.vistasDoMapa || []);
      setAreasDoMapa(procedureToEdit.areasDoMapa || []);
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
      carregarSessoesInclusas(null);
      setRecoveryTime('Sem downtime');
      setImages(['https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=1000&auto=format&fit=crop&q=80']);
      setEnquadramentos([]);
      setBenefits(['Rejuvenescimento visível e seguro', 'Estímulo de colágeno e viço natural']);
      setAreasTreated(['Face completa']);
      setContraindications('Gestantes e infecção ativa na área');
      setIdealCandidate('Pessoas que buscam harmonia e prevenção do envelhecimento');
      setIsFeatured(false);
      setQuoteDetails([]);
      setExigeSelecaoDeArea(false);
      setVistasDoMapa([]);
      setAreasDoMapa([]);
      // Default to first doctor if available
      setAssignedDoctorIds(availableDoctors.length > 0 ? [availableDoctors[0].id] : []);
      setCustomDoctorNames([]);
    }
    setAreaEmEdicao(false);
    setIdsParaArquivar([]);
    idDoNovoRef.current = `proc-${Date.now()}`;
    setErrors({});
    setUploadError('');
    // Um recorte pendente pertence ao procedimento anterior — abrir outro cadastro o descarta.
    setCropQueue([]);
    setCropQueueTotal(0);
    setAdjustingImage(null);
    setFotoEmAjuste(null);
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
      const { index, voltarAoAjuste } = adjustingImage;
      setImages((prev) => prev.map((img, i) => (i === index ? dataUrl : img)));
      // A foto recortada é outra foto: as posições salvas apontavam para pontos que mudaram de lugar.
      definirEnquadramentos(index, null);
      setAdjustingImage(null);
      if (voltarAoAjuste) setFotoEmAjuste(index);
      return;
    }
    setImages((prev) => [...prev, dataUrl]);
    setCropQueue((prev) => prev.slice(1));
  };

  const handleCropCancel = () => {
    if (adjustingImage) {
      if (adjustingImage.voltarAoAjuste) setFotoEmAjuste(adjustingImage.index);
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

  /** Grava o ajuste de uma foto, completando com `null` as fotos antes dela que não têm ajuste. */
  const definirEnquadramentos = (index: number, valor: EnquadramentosDaFoto | null) => {
    setEnquadramentos((prev) => {
      const proximo = Array.from({ length: Math.max(prev.length, index + 1) }, (_, i) => prev[i] ?? null);
      proximo[index] = compactarEnquadramentos(valor);
      return proximo;
    });
  };

  const handleRemoveImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
    // O ajuste sai junto com a foto — e o da segunda vai com ela se ela virar a capa.
    setEnquadramentos((prev) => prev.filter((_, i) => i !== index));
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

  /** Grava o procedimento e fecha o painel. Devolve `true` quando gravou. */
  const salvarProcedimento = async (): Promise<boolean> => {
    const newErrors: Record<string, string> = {};

    if (!title.trim()) newErrors.title = 'O título do procedimento é obrigatório';
    // Depilação a laser pode deixar a descrição em branco: as áreas de laser ainda cadastradas uma a
    // uma herdam a dos padrões antigos da categoria (`resolverCamposDoLaser`).
    if (!description.trim() && !isLaserCategory(customCategory.trim() || category)) {
      newErrors.description = 'A descrição é obrigatória';
    }
    // Com mapa, o valor é o de cada área — o do procedimento sai delas.
    if (!exigeSelecaoDeArea && (!price || isNaN(Number(price)) || Number(price) < 0)) {
      newErrors.price = 'Informe um valor numérico válido';
    }
    if (exigeSelecaoDeArea) {
      if (areaEmEdicao) {
        newErrors.mapa = 'Há uma área aberta no mapa. Conclua ou cancele a área antes de salvar.';
      } else if (!vistasDoMapa.some((v) => v.fotoFemininaUrl || v.fotoMasculinaUrl)) {
        newErrors.mapa = 'Envie ao menos uma foto para marcar as áreas.';
      } else if (vistasDoMapa.some((v) => !v.nome.trim())) {
        newErrors.mapa = 'Dê um nome a cada vista do mapa (ex.: Frente, Costas).';
      } else if (areasDoMapa.length === 0) {
        newErrors.mapa = 'Cadastre ao menos uma área no mapa, com nome e valor.';
      }
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

    const baseDoProcedimento = procedureToEdit;
    const procedureId = baseDoProcedimento ? baseDoProcedimento.id : idDoNovoRef.current;

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

    // As fotos do mapa sobem antes da conta de tamanho do documento: em base64 elas sozinhas
    // passariam do limite. E sem plano B — se o Storage recusar, nada é gravado.
    let vistasGravadas: VistaDoMapa[] | undefined;
    if (exigeSelecaoDeArea) {
      try {
        setSavingStatus('Enviando as fotos do mapa para a nuvem...');
        vistasGravadas = await subirFotosDoMapa(
          vistasDoMapa.map((v) => ({ ...v, nome: v.nome.trim() })),
          procedureId
        );
        setVistasDoMapa(vistasGravadas);
      } catch (erroDasFotos) {
        setErrors({
          mapa:
            erroDasFotos instanceof Error
              ? erroDasFotos.message
              : 'Não foi possível enviar as fotos do mapa. Tente novamente.',
        });
        setIsSaving(false);
        setSavingStatus('');
        return false;
      }
    }

    // Com mapa, o catálogo, a busca e a ordenação seguem lendo `price`: ele vira o da área mais
    // barata, com "a partir de" quando há mais de uma.
    const precosDasAreas = areasDoMapa.map(precoDaArea);
    const precoDoMapa = precosDasAreas.length > 0 ? Math.min(...precosDasAreas) : 0;

    // Linhas em branco (ou só com título) não viram detalhe: iriam para o PDF como rótulo sem resposta
    const cleanedQuoteDetails: QuoteItemDetail[] = quoteDetails
      .map((d) => ({ ...d, titulo: d.titulo.trim(), valor: d.valor.trim() }))
      .filter((d) => d.titulo && d.valor);

    const sessoesDoPacote = maisDeUmaSessao
      ? Math.max(2, Math.floor(Number(sessoesInclusas)) || 2)
      : undefined;

    const procedureData: Procedure = {
      id: procedureId,
      title: title.trim(),
      subtitle: subtitle.trim() || undefined,
      category: finalCategory,
      description: description.trim(),
      price: exigeSelecaoDeArea ? precoDoMapa : Number(price),
      promotionalPrice:
        !exigeSelecaoDeArea && promotionalPrice ? Number(promotionalPrice) : undefined,
      priceNote: priceNote.trim() || 'por sessão',
      isStartingPrice: exigeSelecaoDeArea ? areasDoMapa.length > 1 : isStartingPrice,
      duration: duration.trim() || undefined,
      sessionsRecommended: sessionsRecommended.trim() || undefined,
      // Desmarcado = `undefined`, e é o `saveProcedureToDb` que transforma isso em apagar o campo.
      // Com mapa, as sessões são de cada área.
      sessoesInclusas: exigeSelecaoDeArea ? undefined : sessoesDoPacote,
      recoveryTime: recoveryTime.trim() || undefined,
      orientacoesPreProcedimento: orientacoesPreProcedimento.trim() || undefined,
      intervaloEntreSessoesDias: Number(intervaloEntreSessoesDias) > 0
        ? Number(intervaloEntreSessoesDias)
        : undefined,
      images: uploadedImages,
      enquadramentosDasFotos: listaDeEnquadramentosParaGravar(enquadramentos, uploadedImages.length),
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
      // Desmarcado, o mapa vai como `undefined`, e é o `saveProcedureToDb` que apaga os campos do
      // banco. As vistas e áreas continuam no formulário até ele fechar: marcar de novo as traz de
      // volta.
      exigeSelecaoDeArea: exigeSelecaoDeArea || undefined,
      vistasDoMapa: exigeSelecaoDeArea ? vistasGravadas : undefined,
      areasDoMapa: exigeSelecaoDeArea ? areasDoMapa : undefined,
      // As áreas do formato antigo seguem em memória como estão: só a conversão as lê.
      laserAreas: baseDoProcedimento?.laserAreas,
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
    } catch (saveErr) {
      console.error('Falha ao salvar procedimento:', saveErr);
      const motivo = saveErr instanceof Error ? saveErr.message : 'Erro ao persistir na nuvem.';
      setErrors((prev) => ({
        ...prev,
        images: `Não foi possível salvar na nuvem: ${motivo}`,
      }));
      setIsSaving(false);
      setSavingStatus('');
      return false;
    }

    // Só agora, com as áreas gravadas aqui, os procedimentos antigos saem do catálogo. Falhar
    // aqui não desfaz o que foi salvo: o painel fica aberto, e salvar de novo tenta outra vez.
    if (idsParaArquivar.length > 0 && onArquivarProcedimentos) {
      try {
        setSavingStatus('Tirando do catálogo os procedimentos convertidos...');
        await onArquivarProcedimentos(idsParaArquivar, procedureId);
        setIdsParaArquivar([]);
      } catch (erroAoArquivar) {
        console.error('Falha ao arquivar os procedimentos convertidos:', erroAoArquivar);
        setErrors({
          mapa: `O procedimento foi salvo, mas ${idsParaArquivar.length === 1 ? 'o procedimento antigo não pôde sair' : `os ${idsParaArquivar.length} procedimentos antigos não puderam sair`} do catálogo. Salve de novo para tentar outra vez.`,
        });
        setIsSaving(false);
        setSavingStatus('');
        return false;
      }
    }

    setIsSaving(false);
    setSavingStatus('');
    onClose();
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await salvarProcedimento();
  };

  /** Marcar "Exige seleção de área" num procedimento sem vista já abre a primeira, "Frente". */
  const marcarExigeSelecaoDeArea = (marcado: boolean) => {
    setExigeSelecaoDeArea(marcado);
    if (marcado && vistasDoMapa.length === 0) {
      setVistasDoMapa([{ id: crypto.randomUUID(), nome: 'Frente' }]);
    }
    setErrors((prev) => {
      if (!prev.mapa) return prev;
      const { mapa: _descartado, ...resto } = prev;
      return resto;
    });
  };

  /**
   * Traz os procedimentos de área antigos para dentro deste, como áreas.
   *
   * Só preenche o formulário: nada é gravado até o "Salvar", e os antigos só são arquivados depois
   * que este for salvo. Os textos que eles herdavam das Configurações (descrição, contraindicações,
   * recuperação, candidato ideal) passam a ser deste procedimento — num cadastro novo substituem os
   * exemplos do formulário; num existente, só preenchem o que estiver vazio.
   */
  const handleConverter = () => {
    const legados = paraConverter;
    if (legados.length === 0) return;
    const resultado = converterProcedimentosEmAreas(legados, clinic || ({} as ClinicProfile), vistasDoMapa);

    setVistasDoMapa(resultado.vistas);
    setAreasDoMapa((prev) => [...prev.filter((a) => !legados.some((l) => l.id === a.id)), ...resultado.areas]);
    setIdsParaArquivar((prev) => Array.from(new Set([...prev, ...legados.map((p) => p.id)])));

    const novo = !procedureToEdit;
    const preencher = (atual: string, valor: string | undefined, definir: (v: string) => void) => {
      if (valor && (novo || !atual.trim())) definir(valor);
    };
    const padroes = resultado.padroes || {};
    preencher(description, padroes.description, setDescription);
    preencher(contraindications, padroes.contraindications, setContraindications);
    preencher(recoveryTime, padroes.recoveryTime, setRecoveryTime);
    preencher(idealCandidate, padroes.idealCandidate, setIdealCandidate);

    // Sem a categoria de laser, a ficha única de anamnese e as perguntas de segurança não acham
    // este procedimento.
    if (!isLaserCategory(category)) {
      setCategory(legados[0].category);
      setIsAddingCustomCategory(false);
      setCustomCategory('');
    }
    if (!title.trim()) setTitle('Depilação a Laser');
    if (novo && legados[0].images?.length) {
      setImages(legados[0].images);
      setEnquadramentos(legados[0].enquadramentosDasFotos || []);
    }
    setErrors({});
  };

  if (!isOpen) return null;

  /* Rodapé fixo abaixo da área que rola. */
  const rodape = (
    <div className="flex items-center justify-end gap-3">
      {errors.mapa && (
        <p className="text-body text-red-600 mr-auto leading-snug max-w-md">{errors.mapa}</p>
      )}
      <button
        type="button"
        onClick={onClose}
        className="min-h-[44px] px-4 rounded-xl border border-line text-body font-semibold uppercase tracking-wider text-muted hover:text-ink transition-colors"
      >
        Cancelar
      </button>
      <button
        type="submit"
        form="form-procedimento"
        disabled={cropSource !== null || isSaving}
        className="min-h-[44px] px-6 rounded-xl bg-brand text-white text-body font-semibold uppercase tracking-widest shadow-xs active:scale-95 transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
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
  );

  return (
    /* O mapa de áreas precisa de largura: a foto de um lado, o painel da área do outro, e ainda o
       anel de botões em volta. Nos 560px do painel padrão não sobra espaço para nada disso. */
    <SidePanel
      aberto={isOpen}
      onFechar={onClose}
      titulo={procedureToEdit ? 'Editar procedimento' : 'Novo procedimento'}
      sobretitulo="Cadastro & gestão"
      largura={exigeSelecaoDeArea ? 'mapa' : 'padrao'}
      bloqueado={isSaving}
      /* Foto adicionada, vista e área desenhada não passam por `input`/`change`. */
      alterado={images.length > 0 || (exigeSelecaoDeArea && (areasDoMapa.length > 0 || areaEmEdicao))}
      rodape={rodape}
    >
      <div id="procedure-form-modal">
        <form id="form-procedimento" onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-6">
          {/* Section 1: Basic Information */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-brand flex items-center gap-1.5 pb-1 border-b border-white/60">
              <Sparkles className="w-3.5 h-3.5" />
              Informações Principais
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-ink mb-1">
                  Título do Procedimento *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Harmonização Facial Completa, Botox Preventivo, etc."
                  className="w-full px-3.5 py-2.5 rounded-sm bg-card border border-white/80 text-xs font-medium text-ink focus:outline-hidden focus:border-brand transition-all"
                  required
                />
                {errors.title && <p className="text-xs text-red-600 mt-1">{errors.title}</p>}
              </div>

              {/* Logo abaixo do nome: é a primeira decisão sobre o procedimento — vendido inteiro
                  ou por área — e muda o que o resto do formulário pede. */}
              <div className="sm:col-span-2 space-y-4">
                <label className="flex items-start gap-2.5 cursor-pointer bg-card px-3.5 py-2.5 rounded-sm border border-white/80 hover:border-brand/60 transition-colors">
                  <input
                    type="checkbox"
                    checked={exigeSelecaoDeArea}
                    onChange={(e) => marcarExigeSelecaoDeArea(e.target.checked)}
                    className="w-4 h-4 mt-0.5 accent-brand"
                  />
                  <span>
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                      <Layers className="w-3.5 h-3.5 text-brand" />
                      Exige seleção de área
                    </span>
                    <span className="block text-body text-muted mt-0.5 leading-snug">
                      Para procedimentos vendidos por área — depilação a laser, botox por região.
                      Você envia as fotos, marca as áreas com nome e valor, e a paciente e o
                      orçamento escolhem no mapa.
                    </span>
                    {!exigeSelecaoDeArea && areasDoMapa.length > 0 && (
                      <span className="block text-body text-warn mt-1 leading-snug">
                        {areasDoMapa.length === 1
                          ? 'A área cadastrada sai do procedimento ao salvar.'
                          : `As ${areasDoMapa.length} áreas cadastradas saem do procedimento ao salvar.`}{' '}
                        Marque de novo para mantê-las.
                      </span>
                    )}
                  </span>
                </label>

                {exigeSelecaoDeArea && (
                  <MapaDeAreasEditor
                    vistas={vistasDoMapa}
                    onVistasChange={setVistasDoMapa}
                    areas={areasDoMapa}
                    onAreasChange={setAreasDoMapa}
                    onEmEdicaoChange={setAreaEmEdicao}
                    paraConverter={paraConverter}
                    onConverter={handleConverter}
                    erro={errors.mapa}
                  />
                )}
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-ink mb-1">
                  Subtítulo / Tagline de Destaque
                </label>
                <input
                  type="text"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  placeholder="Ex: Contorno escultural, eversão delicada e viço imediato"
                  className="w-full px-3.5 py-2 rounded-sm bg-card border border-white/80 text-xs font-medium text-ink focus:outline-hidden focus:border-brand transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-ink mb-1">
                  Categoria
                </label>
                {!isAddingCustomCategory ? (
                  <div className="flex gap-2">
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="flex-1 px-3 py-2 rounded-sm bg-card border border-white/80 text-xs font-medium text-ink focus:outline-hidden focus:border-brand"
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
                      className="px-3 py-2 text-xs bg-white/80 border border-white/80 rounded-sm text-ink hover:bg-white font-medium transition-colors"
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
                      className="flex-1 px-3 py-2 rounded-sm bg-white/90 border border-brand/50 text-xs font-medium text-ink focus:outline-hidden focus:border-brand"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={handleConfirmCustomCategory}
                      className="px-3 py-2 text-xs bg-ink text-white font-semibold rounded-sm hover:bg-black transition-colors"
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
                <label className="flex items-center gap-2.5 cursor-pointer bg-card px-3.5 py-2 rounded-sm border border-white/80 w-full hover:border-brand/60 transition-colors">
                  <input
                    type="checkbox"
                    checked={isFeatured}
                    onChange={(e) => setIsFeatured(e.target.checked)}
                    className="w-4 h-4 text-brand rounded-xs border-gray-300 focus:ring-brand"
                  />
                  <div className="flex items-center gap-1.5 text-xs font-medium text-ink">
                    <Star className={`w-3.5 h-3.5 ${isFeatured ? 'text-brand fill-brand' : 'text-gray-400'}`} />
                    Destacar este procedimento no catálogo
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* Section: Doctor / Professional Assignment (Required by User) */}
          <div className="space-y-4 bg-white/40 p-4 rounded-sm border border-white/80 shadow-xs">
            <div className="flex items-center justify-between pb-1 border-b border-white/60">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-brand flex items-center gap-1.5">
                <Stethoscope className="w-3.5 h-3.5" />
                Médica(s) Responsável(is) pelo Procedimento
              </h3>
              <span className="text-label text-gray-500 font-medium">
                {assignedDoctorIds.length + customDoctorNames.length === 0
                  ? 'Nenhuma selecionada'
                  : assignedDoctorIds.length + customDoctorNames.length === 1
                  ? '1 Médica atribuída'
                  : `${assignedDoctorIds.length + customDoctorNames.length} Médicas atribuídas`}
              </span>
            </div>

            <p className="text-body text-gray-600">
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
                          ? 'bg-white border-brand shadow-xs ring-1 ring-brand'
                          : 'bg-white/60 border-white/80 hover:bg-white hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleDoctorSelection(doc.id)}
                        className="mt-0.5 w-4 h-4 text-brand rounded-xs border-gray-300 focus:ring-brand cursor-pointer"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-ink">{doc.name}</p>
                          {(doc.specialty || doc.title) && (
                            <span className="text-label px-1.5 py-0.2 rounded-xs bg-brand/15 text-brand font-semibold truncate max-w-[140px]">
                              {doc.specialty || doc.title}
                            </span>
                          )}
                        </div>
                        {doc.title && doc.specialty && (
                          <p className="text-label text-gray-500 mt-0.5 line-clamp-1">{doc.title}</p>
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
              <label className="block text-body font-medium text-gray-700 mb-1">
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
                  className="flex-1 px-3 py-1.5 rounded-xs bg-white border border-gray-200 text-xs text-ink"
                />
                <button
                  type="button"
                  onClick={handleAddCustomDoctor}
                  className="px-3 py-1.5 bg-ink text-white text-xs font-medium rounded-xs hover:bg-[#333]"
                >
                  Adicionar
                </button>
              </div>

              {customDoctorNames.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {customDoctorNames.map((name, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 text-xs bg-brand-light/20 text-ink px-2.5 py-0.5 rounded-xs border border-brand-light/40"
                    >
                      <UserCheck className="w-3 h-3 text-brand" />
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
            <h3 className="text-xs font-semibold uppercase tracking-widest text-brand flex items-center gap-1.5 pb-1 border-b border-white/60">
              <span className="font-serif-luxury text-sm">R$</span>
              Valores e Investimento
            </h3>

            {exigeSelecaoDeArea && (
              <p className="text-body text-muted bg-card border border-white/80 rounded-sm px-3.5 py-2.5 leading-relaxed">
                O valor de cada área é definido no mapa, acima.{' '}
                {areasDoMapa.length > 0 && (
                  <>
                    No catálogo aparece{' '}
                    <strong className="text-ink">
                      {areasDoMapa.length > 1 ? 'a partir de ' : ''}
                      {formatBRL(Math.min(...areasDoMapa.map(precoDaArea)))}
                    </strong>
                    {areasDoMapa.length > 1 ? ' — a área mais em conta.' : '.'}
                  </>
                )}
              </p>
            )}

            <div className={`grid grid-cols-1 gap-4 ${exigeSelecaoDeArea ? '' : 'sm:grid-cols-3'}`}>
              {!exigeSelecaoDeArea && (
              <>
              <div>
                <label className="block text-xs font-medium text-ink mb-1">
                  Valor Normal (R$) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="Ex: 1500"
                  className="w-full px-3.5 py-2 rounded-sm bg-card border border-white/80 text-xs font-medium text-ink focus:outline-hidden focus:border-brand"
                  required
                />
                {errors.price && <p className="text-xs text-red-600 mt-1">{errors.price}</p>}
              </div>

              <div>
                <label className="block text-xs font-medium text-ink mb-1">
                  Valor Promocional (R$) <span className="text-gray-500 font-normal">(Opcional)</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={promotionalPrice}
                  onChange={(e) => setPromotionalPrice(e.target.value)}
                  placeholder="Ex: 1250"
                  className="w-full px-3.5 py-2 rounded-sm bg-card border border-white/80 text-xs font-medium text-ink focus:outline-hidden focus:border-brand"
                />
              </div>
              </>
              )}

              <div>
                <label className="block text-xs font-medium text-ink mb-1">
                  Condição / Sufixo do Valor
                </label>
                <input
                  type="text"
                  value={priceNote}
                  onChange={(e) => setPriceNote(e.target.value)}
                  placeholder="Ex: por sessão, pacote 3x, a partir de"
                  className="w-full px-3.5 py-2 rounded-sm bg-card border border-white/80 text-xs font-medium text-ink focus:outline-hidden focus:border-brand"
                />
              </div>
            </div>

            {/* Checkbox "A partir de" — com mapa, ele é decidido pelas áreas. */}
            {!exigeSelecaoDeArea && (
            <div className="bg-card border border-white/80 rounded-sm p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <label 
                htmlFor="procedure-is-starting-price" 
                className="flex items-start sm:items-center gap-3 cursor-pointer select-none group"
              >
                <input
                  type="checkbox"
                  id="procedure-is-starting-price"
                  checked={isStartingPrice}
                  onChange={(e) => setIsStartingPrice(e.target.checked)}
                  className="w-4 h-4 mt-0.5 sm:mt-0 rounded border-gray-300 text-brand focus:ring-brand accent-brand cursor-pointer"
                />
                <div>
                  <span className="text-xs font-semibold text-ink group-hover:text-brand transition-colors flex items-center gap-1.5">
                    Habilitar "A partir de" no preço
                  </span>
                  <p className="text-body text-muted mt-0.5">
                    Adiciona o prefixo "a partir de" antes do valor nos cards, no catálogo e nos orçamentos.
                  </p>
                </div>
              </label>

              {price && !isNaN(Number(price)) && Number(price) > 0 && (
                <div className="text-left sm:text-right shrink-0 bg-surface-2 px-3 py-1.5 rounded border border-line">
                  <span className="text-label text-muted uppercase tracking-wider block font-medium">Prévia no catálogo:</span>
                  <span className="text-xs font-semibold text-brand-hover">
                    {isStartingPrice ? 'a partir de ' : ''}
                    {formatBRL(promotionalPrice && Number(promotionalPrice) > 0 ? Number(promotionalPrice) : Number(price))}
                    {priceNote ? ` ${priceNote}` : ''}
                  </span>
                </div>
              )}
            </div>
            )}
          </div>

          {/* Section 3: Clinical Specs */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-brand flex items-center gap-1.5 pb-1 border-b border-white/60">
              <Sparkles className="w-3.5 h-3.5" />
              Especificações e Protocolo
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-ink mb-1">
                  Duração do Atendimento
                </label>
                <input
                  type="text"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  placeholder="Ex: 45 min, 1h 30min"
                  className="w-full px-3.5 py-2 rounded-sm bg-card border border-white/80 text-xs font-medium text-ink"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-ink mb-1">
                  Plano Recomendado
                </label>
                <input
                  type="text"
                  value={sessionsRecommended}
                  onChange={(e) => setSessionsRecommended(e.target.value)}
                  placeholder="Ex: 1 a 3 sessões anuais"
                  className="w-full px-3.5 py-2 rounded-sm bg-card border border-white/80 text-xs font-medium text-ink"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-ink mb-1">
                  Intervalo entre sessões (dias)
                </label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={intervaloEntreSessoesDias}
                  onChange={(e) => setIntervaloEntreSessoesDias(e.target.value)}
                  placeholder="30"
                  className="w-full px-3.5 py-2 rounded-sm bg-card border border-white/80 text-xs font-medium text-ink"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-ink mb-1">
                  Recuperação / Downtime
                </label>
                <input
                  type="text"
                  value={recoveryTime}
                  onChange={(e) => setRecoveryTime(e.target.value)}
                  placeholder="Ex: Sem downtime, 48h leve edema"
                  className="w-full px-3.5 py-2 rounded-sm bg-card border border-white/80 text-xs font-medium text-ink"
                />
              </div>

              {/* Com mapa, as sessões do pacote são de cada área. */}
              {!exigeSelecaoDeArea && (
              <div className="sm:col-span-2">
                <span className="block text-xs font-medium text-ink mb-2">Sessões do pacote</span>
                <CampoMaisDeUmaSessao
                  marcado={maisDeUmaSessao}
                  quantidade={sessoesInclusas}
                  onMarcar={marcarMaisDeUmaSessao}
                  onQuantidade={setSessoesInclusas}
                  inputClassName="px-3 py-1.5 rounded-sm bg-card border border-white/80 text-xs font-medium text-ink focus:outline-hidden focus:border-brand"
                />
              </div>
              )}
            </div>

            {/* Preparo da paciente. Diferente de "Contraindicações": aquilo é motivo para não
                fazer; isto é o que fazer antes de quem já vai. */}
            <div>
              <label className="block text-body font-medium text-ink mb-1">
                Orientações de preparo (antes de vir)
              </label>
              <textarea
                rows={2}
                value={orientacoesPreProcedimento}
                onChange={(e) => setOrientacoesPreProcedimento(e.target.value)}
                placeholder="Ex: Não depile com cera nos 30 dias anteriores. Venha sem maquiagem na área."
                className="w-full px-3.5 py-2 rounded-sm bg-card border border-line text-body font-medium text-ink focus:outline-hidden focus:border-brand"
              />
              <p className="mt-1 text-label text-muted">
                Vai junto na confirmação pelo WhatsApp, quando essa opção estiver ligada nas
                Configurações.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Descrição Completa do Procedimento *
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descreva detalhadamente a técnica, substâncias utilizadas, objetivos e resultados esperados..."
                className="w-full px-3.5 py-2.5 rounded-sm bg-card border border-white/80 text-xs font-medium text-ink focus:outline-hidden focus:border-brand"
                required={!isLaserCategory(customCategory.trim() || category)}
              />
              {errors.description && <p className="text-xs text-red-600 mt-1">{errors.description}</p>}
            </div>

            {/* Interactive Benefits list */}
            <div>
              <label className="block text-xs font-medium text-ink mb-1">
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
                  className="flex-1 px-3 py-1.5 rounded-sm bg-white/70 border border-white/80 text-xs text-ink"
                />
                <button
                  type="button"
                  onClick={handleAddBenefit}
                  className="px-3 py-1.5 bg-ink text-white text-xs font-medium rounded-sm hover:bg-ink"
                >
                  Adicionar
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {benefits.map((b, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 text-xs bg-card px-2.5 py-1 rounded-xs border border-white/90 text-ink"
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
              <label className="block text-xs font-medium text-ink mb-1">
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
                  className="flex-1 px-3 py-1.5 rounded-sm bg-white/70 border border-white/80 text-xs text-ink"
                />
                <button
                  type="button"
                  onClick={handleAddArea}
                  className="px-3 py-1.5 bg-white/60 border border-white/80 text-ink text-xs font-medium rounded-sm"
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
            <h3 className="text-xs font-semibold uppercase tracking-widest text-brand flex items-center gap-1.5 pb-1 border-b border-white/60">
              <FileText className="w-3.5 h-3.5" />
              Detalhes para Orçamento ({quoteDetails.length})
            </h3>

            <p className="text-body leading-relaxed text-gray-500">
              Campos que já nascem preenchidos no orçamento deste procedimento — produto, unidades,
              duração do efeito, anestesia, intervalo. É só aqui que eles se editam: no orçamento aparecem
              como estão, sem campo para mexer.
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
                    className="w-2/5 px-3 py-1.5 rounded-sm bg-white/70 border border-white/80 text-xs text-ink"
                  />
                  <input
                    type="text"
                    value={detail.valor}
                    onChange={(e) => handleUpdateQuoteDetail(detail.id, 'valor', e.target.value)}
                    placeholder="Botulift® 100U"
                    className="flex-1 px-3 py-1.5 rounded-sm bg-white/70 border border-white/80 text-xs text-ink"
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
                className="px-3 py-1.5 bg-white/60 border border-white/80 text-ink text-xs font-medium rounded-sm hover:bg-white/80 transition-colors flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Adicionar campo
              </button>
            </div>
          </div>

          {/* Section 4: Images & Visuals */}
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-1 border-b border-white/60">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-brand flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5" />
                Imagens do Procedimento ({images.length}) *
              </h3>
              <button
                type="button"
                onClick={() => setShowPresetLibrary(!showPresetLibrary)}
                className="text-xs font-semibold text-brand hover:text-brand-hover flex items-center gap-1"
              >
                {showPresetLibrary ? 'Ocultar Banco de Fotos' : 'Ver Banco de Fotos Estéticas'}
              </button>
            </div>

            {/* Preset Photo Picker */}
            {showPresetLibrary && (
              <div className="p-3 bg-card rounded-sm border border-white/80 space-y-2">
                <p className="text-xs font-medium text-gray-600">
                  Selecione fotos de estética premium com um clique:
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {PRESET_IMAGE_LIBRARY.map((preset, pIdx) => (
                    <div
                      key={pIdx}
                      onClick={() => setImages((prev) => [...prev, preset.url])}
                      className="relative aspect-4/3 rounded-xs overflow-hidden cursor-pointer group border border-white/80 hover:border-brand transition-all"
                    >
                      <img src={preset.url} alt={preset.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 flex items-end p-1.5 transition-colors">
                        <span className="text-label text-white font-medium line-clamp-1">{preset.title}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Upload Box & URL input */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex flex-col items-center justify-center p-4 border border-dashed border-white/80 rounded-sm bg-card transition-all group hover:border-brand cursor-pointer">
                <Upload className="w-6 h-6 text-gray-400 group-hover:text-brand mb-1" />
                <span className="text-xs font-medium text-ink">Fazer upload de foto</span>
                <span className="text-label text-gray-500">PNG, JPG, WEBP — você enquadra a foto antes de salvar</span>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>

              <div className="flex flex-col justify-center gap-2 p-3 bg-card border border-white/80 rounded-sm">
                <span className="text-xs font-medium text-ink flex items-center gap-1">
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
                    className="px-2.5 py-1.5 text-xs bg-ink text-white rounded-sm font-medium"
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
                      <span className="absolute top-1 left-1 text-label font-bold bg-ink text-brand-light px-1.5 py-0.5 rounded-xs">
                        Capa
                      </span>
                    )}
                    {enquadramentos[idx] && (
                      <span className="absolute bottom-1 left-1 text-label font-semibold bg-white/90 text-ink px-1.5 py-0.5 rounded-xs">
                        Ajustada
                      </span>
                    )}
                    <div className="absolute top-1 right-1 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setUploadError('');
                          setCropQueue([]);
                          setCropQueueTotal(0);
                          setAdjustingImage(null);
                          setFotoEmAjuste(idx);
                        }}
                        className="p-1.5 bg-ink/85 hover:bg-ink text-white rounded-full shadow-sm transition-colors"
                        title="Ajustar a foto no menu, no catálogo e no cartão"
                        aria-label="Ajustar a foto no menu, no catálogo e no cartão"
                      >
                        <Move className="w-3.5 h-3.5" />
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
            {images.length > 0 && (
              <p className="flex items-start gap-1.5 text-body text-gray-500">
                <Move className="w-3.5 h-3.5 shrink-0 mt-px text-brand" />
                A capa aparece no menu, no catálogo e no cartão. Toque no ícone de ajuste da foto para
                posicioná-la em cada um deles.
              </p>
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
        </form>
      </div>

      {/* Fora do <form>: o recorte e o ajuste não podem disparar o submit do procedimento. */}
      <AjusteDaFotoModal
        isOpen={fotoEmAjuste !== null && !!images[fotoEmAjuste]}
        src={fotoEmAjuste !== null ? images[fotoEmAjuste] ?? null : null}
        enquadramentos={fotoEmAjuste !== null ? enquadramentos[fotoEmAjuste] : null}
        ehCapa={fotoEmAjuste === 0}
        onCancel={() => setFotoEmAjuste(null)}
        onApply={(valor) => {
          if (fotoEmAjuste !== null) definirEnquadramentos(fotoEmAjuste, valor);
          setFotoEmAjuste(null);
        }}
        onRecortar={() => {
          if (fotoEmAjuste === null) return;
          const index = fotoEmAjuste;
          setFotoEmAjuste(null);
          setAdjustingImage({ index, src: images[index], voltarAoAjuste: true });
        }}
      />

      <ImageCropperModal
        isOpen={cropSource !== null}
        source={cropSource}
        title={adjustingImage ? 'Recortar ou girar a foto' : 'Adicionar foto do procedimento'}
        description={
          adjustingImage
            ? 'Corta o próprio arquivo da foto. Depois do recorte, a posição no menu, no catálogo e no cartão recomeça do centro.'
            : 'Gire ou corte o que não deve aparecer. A posição da foto no menu, no catálogo e no cartão você ajusta depois, no ícone de ajuste da foto.'
        }
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

      <ConfirmDialog pedido={confirmacao} onFechar={() => setConfirmacao(null)} />
    </SidePanel>
  );
};

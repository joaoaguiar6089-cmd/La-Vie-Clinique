import React, { useState, useEffect } from 'react';
import { X, Upload, Plus, Trash2, Image as ImageIcon, Sparkles, AlertCircle, Check, Link as LinkIcon, Star, UserCheck, Stethoscope } from 'lucide-react';
import { Procedure, Professional } from '../types';
import { PRESET_IMAGE_LIBRARY, INITIAL_CATEGORIES } from '../data/initialData';

interface ProcedureFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (procedure: Procedure) => void;
  procedureToEdit?: Procedure | null;
  existingCategories: string[];
  availableDoctors?: Professional[];
}

export const ProcedureFormModal: React.FC<ProcedureFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  procedureToEdit,
  existingCategories,
  availableDoctors = [],
}) => {
  if (!isOpen) return null;

  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [category, setCategory] = useState('Harmonização & Injetáveis');
  const [customCategory, setCustomCategory] = useState('');
  const [isAddingCustomCategory, setIsAddingCustomCategory] = useState(false);
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState<string>('');
  const [promotionalPrice, setPromotionalPrice] = useState<string>('');
  const [priceNote, setPriceNote] = useState('por sessão');
  const [duration, setDuration] = useState('45 a 60 min');
  const [sessionsRecommended, setSessionsRecommended] = useState('1 a 3 sessões');
  const [recoveryTime, setRecoveryTime] = useState('Sem downtime');
  const [images, setImages] = useState<string[]>([]);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [benefits, setBenefits] = useState<string[]>([]);
  const [newBenefitInput, setNewBenefitInput] = useState('');
  const [extraCategories, setExtraCategories] = useState<string[]>([]);

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

  // Doctors assignment state
  const [assignedDoctorIds, setAssignedDoctorIds] = useState<string[]>([]);
  const [customDoctorNames, setCustomDoctorNames] = useState<string[]>([]);
  const [newCustomDoctorInput, setNewCustomDoctorInput] = useState('');

  const [showPresetLibrary, setShowPresetLibrary] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (procedureToEdit) {
      setTitle(procedureToEdit.title || '');
      setSubtitle(procedureToEdit.subtitle || '');
      setCategory(procedureToEdit.category || 'Harmonização & Injetáveis');
      setDescription(procedureToEdit.description || '');
      setPrice(procedureToEdit.price ? String(procedureToEdit.price) : '');
      setPromotionalPrice(procedureToEdit.promotionalPrice ? String(procedureToEdit.promotionalPrice) : '');
      setPriceNote(procedureToEdit.priceNote || 'por sessão');
      setDuration(procedureToEdit.duration || '');
      setSessionsRecommended(procedureToEdit.sessionsRecommended || '');
      setRecoveryTime(procedureToEdit.recoveryTime || '');
      setImages(procedureToEdit.images || []);
      setBenefits(procedureToEdit.benefits || []);
      setAreasTreated(procedureToEdit.areasTreated || []);
      setContraindications(procedureToEdit.contraindications || '');
      setIdealCandidate(procedureToEdit.idealCandidate || '');
      setIsFeatured(Boolean(procedureToEdit.isFeatured));
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
      setDuration('45 min');
      setSessionsRecommended('1 a 3 sessões');
      setRecoveryTime('Sem downtime');
      setImages(['https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=1000&auto=format&fit=crop&q=80']);
      setBenefits(['Rejuvenescimento visível e seguro', 'Estímulo de colágeno e viço natural']);
      setAreasTreated(['Face completa']);
      setContraindications('Gestantes e infecção ativa na área');
      setIdealCandidate('Pessoas que buscam harmonia e prevenção do envelhecimento');
      setIsFeatured(false);
      // Default to first doctor if available
      setAssignedDoctorIds(availableDoctors.length > 0 ? [availableDoctors[0].id] : []);
      setCustomDoctorNames([]);
    }
    setErrors({});
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

  // Handle local image file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file: File) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (loadEvt) => {
        const base64 = loadEvt.target?.result as string;
        if (base64) {
          setImages((prev) => [...prev, base64]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleAddImageUrl = () => {
    if (!imageUrlInput.trim()) return;
    setImages((prev) => [...prev, imageUrlInput.trim()]);
    setImageUrlInput('');
  };

  const handleRemoveImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!title.trim()) newErrors.title = 'O título do procedimento é obrigatório';
    if (!description.trim()) newErrors.description = 'A descrição é obrigatória';
    if (!price || isNaN(Number(price)) || Number(price) < 0) {
      newErrors.price = 'Informe um valor numérico válido';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
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

    const procedureData: Procedure = {
      id: procedureToEdit ? procedureToEdit.id : `proc-${Date.now()}`,
      title: title.trim(),
      subtitle: subtitle.trim() || undefined,
      category: finalCategory,
      description: description.trim(),
      price: Number(price),
      promotionalPrice: promotionalPrice ? Number(promotionalPrice) : undefined,
      priceNote: priceNote.trim() || 'por sessão',
      duration: duration.trim() || undefined,
      sessionsRecommended: sessionsRecommended.trim() || undefined,
      recoveryTime: recoveryTime.trim() || undefined,
      images: finalImages,
      benefits: benefits.length > 0 ? benefits : ['Melhora estética e bem-estar'],
      areasTreated: areasTreated.length > 0 ? areasTreated : undefined,
      contraindications: contraindications.trim() || undefined,
      idealCandidate: idealCandidate.trim() || undefined,
      isFeatured: isFeatured,
      assignedDoctorIds: assignedDoctorIds.length > 0 ? assignedDoctorIds : undefined,
      assignedDoctorNames: finalDoctorNames.length > 0 ? finalDoctorNames : undefined,
      order: procedureToEdit?.order || 99,
      createdAt: procedureToEdit?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onSave(procedureData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-fadeIn">
      <div 
        className="relative w-full max-w-3xl bg-[#F9F8F6]/95 backdrop-blur-xl rounded-sm overflow-hidden shadow-2xl border border-white/60 my-6 transition-all"
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
            onClick={onClose}
            className="p-1.5 rounded-xs text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6 max-h-[80vh] overflow-y-auto">
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
                      onChange={(e) => setCategory(e.target.value)}
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
              <label className="flex flex-col items-center justify-center p-4 border border-dashed border-white/80 hover:border-[#A67C52] rounded-sm cursor-pointer bg-white/60 backdrop-blur-xs transition-all group">
                <Upload className="w-6 h-6 text-gray-400 group-hover:text-[#A67C52] mb-1" />
                <span className="text-xs font-medium text-[#1A1A1A]">Fazer upload de foto</span>
                <span className="text-[10px] text-gray-500">PNG, JPG, WEBP (armazenado seguro)</span>
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
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(idx)}
                      className="absolute top-1 right-1 p-1.5 bg-red-600/90 hover:bg-red-600 active:bg-red-700 text-white rounded-full shadow-sm transition-colors"
                      title="Remover imagem"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {errors.images && <p className="text-xs text-red-600">{errors.images}</p>}
          </div>

          {/* Form Actions Footer */}
          <div className="pt-4 border-t border-white/60 flex items-center justify-end gap-3 sticky bottom-0 bg-[#F9F8F6]/90 backdrop-blur-md py-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-sm border border-white/80 text-xs font-semibold uppercase tracking-wider text-gray-600 hover:bg-white transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-sm bg-[#A67C52] text-white text-xs font-semibold uppercase tracking-widest shadow-xs hover:bg-[#8e6945] active:scale-95 transition-all flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              {procedureToEdit ? 'Salvar Alterações' : 'Cadastrar Procedimento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

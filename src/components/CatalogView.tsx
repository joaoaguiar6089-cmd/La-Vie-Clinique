import React, { useState } from 'react';
import { Search, LayoutGrid, Rows, Table, Sparkles, Filter, Plus, Share2, MessageCircle, Star, ArrowUpDown, ChevronDown, Check } from 'lucide-react';
import { Procedure, ClinicProfile, CatalogViewMode } from '../types';
import { ProcedureCard } from './ProcedureCard';
import { buildWhatsAppCatalogShareUrl } from '../utils/exportHelpers';

interface CatalogViewProps {
  procedures: Procedure[];
  clinic: ClinicProfile;
  categories: string[];
  onViewDetails: (procedure: Procedure) => void;
  onEdit: (procedure: Procedure) => void;
  onDelete: (id: string) => void;
  onShareSingle: (procedure: Procedure) => void;
  onOpenNewProcedure: () => void;
  onOpenExport: () => void;
}

export const CatalogView: React.FC<CatalogViewProps> = ({
  procedures,
  clinic,
  categories,
  onViewDetails,
  onEdit,
  onDelete,
  onShareSingle,
  onOpenNewProcedure,
  onOpenExport,
}) => {
  const [layoutMode, setLayoutMode] = useState<CatalogViewMode>('editorial-grid');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [onlyFeatured, setOnlyFeatured] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<'featured' | 'price-asc' | 'price-desc' | 'title-asc'>('featured');

  // Filter & sort
  const filteredProcedures = procedures
    .filter((p) => {
      const matchesSearch =
        p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.subtitle && p.subtitle.toLowerCase().includes(searchTerm.toLowerCase())) ||
        p.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.benefits && p.benefits.some(b => b.toLowerCase().includes(searchTerm.toLowerCase())));
      const matchesCategory = selectedCategory === 'Todos' || p.category === selectedCategory;
      const matchesFeatured = !onlyFeatured || Boolean(p.isFeatured);
      return matchesSearch && matchesCategory && matchesFeatured;
    })
    .sort((a, b) => {
      if (sortBy === 'featured') {
        if (a.isFeatured && !b.isFeatured) return -1;
        if (!a.isFeatured && b.isFeatured) return 1;
        return a.order - b.order;
      }
      if (sortBy === 'price-asc') {
        const pA = a.promotionalPrice || a.price;
        const pB = b.promotionalPrice || b.price;
        return pA - pB;
      }
      if (sortBy === 'price-desc') {
        const pA = a.promotionalPrice || a.price;
        const pB = b.promotionalPrice || b.price;
        return pB - pA;
      }
      if (sortBy === 'title-asc') {
        return a.title.localeCompare(b.title);
      }
      return 0;
    });

  return (
    <div className="space-y-8">
      {/* Editorial Luxury Hero Banner with Frosted Glass Overlay */}
      <div className="relative rounded-sm overflow-hidden bg-[#1A1A1A] text-white border border-white/15 shadow-md">
        {/* Background glow and subtle aesthetic art */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/75 to-black/50 z-10" />
        <img
          src={clinic.coverBannerUrl || "https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=1600&auto=format&fit=crop&q=80"}
          alt={clinic.name}
          className="absolute inset-0 w-full h-full object-cover opacity-35"
        />

        <div className="relative z-20 p-6 sm:p-10 lg:p-12 max-w-4xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-sm bg-white/10 backdrop-blur-md border border-white/20 text-[#C49B74] text-[10px] font-medium tracking-[0.25em] uppercase mb-4">
            <Sparkles className="w-3 h-3 text-[#A67C52]" />
            Catálogo Exclusivo • Procedimentos Estéticos
          </div>

          <h1 className="font-serif-luxury text-3xl sm:text-5xl lg:text-6xl font-light tracking-tight text-white leading-tight">
            {clinic.name}
          </h1>

          <p className="text-sm text-gray-300 font-light mt-3 max-w-2xl leading-relaxed">
            {clinic.tagline}
          </p>

          <div className="mt-6 pt-6 border-t border-white/10 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs text-[#C49B74] font-medium tracking-wider uppercase">
              <span className="w-2 h-2 rounded-full bg-[#A67C52]"></span>
              <span>{procedures.length} Procedimentos disponíveis</span>
            </div>

            <div className="flex items-center gap-3">
              <button
                id="hero-export-btn"
                onClick={onOpenExport}
                className="px-5 py-2 rounded-sm bg-white/10 hover:bg-white/20 text-white text-xs font-semibold tracking-widest uppercase backdrop-blur-md border border-white/30 transition-all flex items-center gap-2"
              >
                <Share2 className="w-3.5 h-3.5 text-[#C49B74]" />
                Exportar PDF
              </button>

              <a
                href={buildWhatsAppCatalogShareUrl(procedures, clinic)}
                target="_blank"
                rel="noopener noreferrer"
                className="px-5 py-2 rounded-sm bg-[#A67C52] hover:bg-[#8e6945] text-white text-xs font-semibold uppercase tracking-widest transition-all flex items-center gap-2 shadow-xs"
              >
                <MessageCircle className="w-4 h-4" />
                Agendamento
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Filter and View Controls Bar (Frosted Glass Container) */}
      <div className="bg-white/40 backdrop-blur-md p-4 sm:p-5 rounded-sm border border-white/60 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar procedimento (ex: Harmonização, Bioestimulador, Peeling)..."
              className="w-full pl-10 pr-4 py-2.5 rounded-sm bg-white/60 backdrop-blur-xs border border-white/70 text-xs font-medium text-[#1A1A1A] placeholder-gray-400 focus:outline-hidden focus:border-[#A67C52] focus:bg-white/90 transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-[#1A1A1A]"
              >
                ×
              </button>
            )}
          </div>

          {/* Controls: Featured toggle, Sort & Layout Switcher */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setOnlyFeatured(!onlyFeatured)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-sm text-xs font-semibold tracking-wider uppercase border transition-all ${
                onlyFeatured
                  ? 'bg-[#1A1A1A] text-[#C49B74] border-[#1A1A1A] shadow-xs'
                  : 'bg-white/50 backdrop-blur-xs text-gray-600 border-white/70 hover:bg-white/80'
              }`}
            >
              <Star className={`w-3.5 h-3.5 ${onlyFeatured ? 'fill-[#C49B74]' : ''}`} />
              Destaques VIP
            </button>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-3.5 py-2 rounded-sm bg-white/60 backdrop-blur-xs border border-white/70 text-xs font-medium text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
            >
              <option value="featured">Ordem de Destaque</option>
              <option value="price-asc">Menor Investimento (R$)</option>
              <option value="price-desc">Maior Investimento (R$)</option>
              <option value="title-asc">Nome (A - Z)</option>
            </select>

            {/* Layout Toggle Buttons */}
            <div className="flex items-center bg-white/40 backdrop-blur-xs p-1 rounded-sm border border-white/60">
              <button
                onClick={() => setLayoutMode('editorial-grid')}
                className={`p-1.5 rounded-xs text-xs transition-all ${
                  layoutMode === 'editorial-grid'
                    ? 'bg-white text-[#1A1A1A] shadow-xs'
                    : 'text-gray-400 hover:text-[#1A1A1A]'
                }`}
                title="Grade Editorial"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setLayoutMode('lookbook-cards')}
                className={`p-1.5 rounded-xs text-xs transition-all ${
                  layoutMode === 'lookbook-cards'
                    ? 'bg-white text-[#1A1A1A] shadow-xs'
                    : 'text-gray-400 hover:text-[#1A1A1A]'
                }`}
                title="Lookbook Amplo"
              >
                <Rows className="w-4 h-4" />
              </button>
              <button
                onClick={() => setLayoutMode('minimal-table')}
                className={`p-1.5 rounded-xs text-xs transition-all ${
                  layoutMode === 'minimal-table'
                    ? 'bg-white text-[#1A1A1A] shadow-xs'
                    : 'text-gray-400 hover:text-[#1A1A1A]'
                }`}
                title="Tabela Minimalista"
              >
                <Table className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Category Pills Slider */}
        <div className="flex gap-2 overflow-x-auto pb-1 pt-1 scrollbar-none">
          {categories.map((cat, idx) => {
            const isSelected = selectedCategory === cat;
            const count = cat === 'Todos'
              ? procedures.length
              : procedures.filter(p => p.category === cat).length;

            return (
              <button
                key={idx}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3.5 py-1.5 rounded-sm text-xs uppercase tracking-wider font-semibold whitespace-nowrap transition-all flex items-center gap-2 ${
                  isSelected
                    ? 'bg-[#1A1A1A] text-white shadow-xs'
                    : 'bg-white/50 backdrop-blur-xs text-gray-600 border border-white/60 hover:bg-white/80 hover:text-[#1A1A1A]'
                }`}
              >
                {cat}
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  isSelected ? 'bg-[#A67C52] text-white' : 'bg-gray-200/80 text-gray-600'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Procedure Showcase Section */}
      <div>
        {/* Count banner */}
        <div className="flex items-center justify-between mb-5 text-xs text-gray-500">
          <span className="tracking-wide">
            Exibindo <strong className="text-[#1A1A1A]">{filteredProcedures.length}</strong> de {procedures.length} procedimento(s)
          </span>
          {selectedCategory !== 'Todos' && (
            <button
              onClick={() => setSelectedCategory('Todos')}
              className="text-[#A67C52] hover:underline font-semibold uppercase tracking-wider text-[11px]"
            >
              Limpar filtro de categoria
            </button>
          )}
        </div>

        {/* Grid/List of Procedures */}
        {filteredProcedures.length === 0 ? (
          <div className="text-center py-16 bg-white/40 backdrop-blur-md rounded-sm border border-white/60 p-8 space-y-4">
            <div className="w-16 h-16 rounded-sm bg-white/60 border border-white/80 flex items-center justify-center mx-auto text-[#A67C52] shadow-xs">
              <Sparkles className="w-7 h-7" />
            </div>
            <h3 className="font-serif-luxury text-2xl font-normal text-[#1A1A1A]">
              Nenhum procedimento encontrado
            </h3>
            <p className="text-xs text-gray-500 max-w-md mx-auto leading-relaxed">
              Não encontramos procedimentos correspondentes à sua busca ou filtro. Tente buscar por outros termos ou cadastre um novo item.
            </p>
            <div className="pt-2 flex justify-center gap-3">
              <button
                onClick={() => {
                  setSearchTerm('');
                  setSelectedCategory('Todos');
                  setOnlyFeatured(false);
                }}
                className="px-5 py-2 rounded-sm border border-[#1A1A1A] text-xs font-semibold tracking-widest uppercase text-[#1A1A1A] hover:bg-[#1A1A1A] hover:text-white transition-all"
              >
                Redefinir Filtros
              </button>
              <button
                onClick={onOpenNewProcedure}
                className="px-6 py-2 rounded-sm bg-[#A67C52] text-white text-xs font-semibold uppercase tracking-widest shadow-xs hover:bg-[#8e6945] transition-all"
              >
                + Novo Cadastro
              </button>
            </div>
          </div>
        ) : (
          <div
            className={
              layoutMode === 'editorial-grid'
                ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6'
                : layoutMode === 'lookbook-cards'
                ? 'space-y-6'
                : 'space-y-3'
            }
          >
            {filteredProcedures.map((proc) => (
              <ProcedureCard
                key={proc.id}
                procedure={proc}
                clinic={clinic}
                onViewDetails={onViewDetails}
                onEdit={onEdit}
                onDelete={onDelete}
                onShareSingle={onShareSingle}
                layoutMode={layoutMode}
              />
            ))}
          </div>
        )}
      </div>

      {/* Bottom Frosted Glass Bar */}
      <div className="bg-[#1A1A1A] text-[#E5E4E0] p-6 sm:p-8 rounded-sm border border-white/10 shadow-md flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h4 className="font-serif-luxury text-xl font-normal text-white">
            Compartilhe seu portfólio de estética
          </h4>
          <p className="text-xs text-gray-400 mt-1">
            Gere um catálogo em PDF de alta qualidade para impressão ou compartilhe no WhatsApp.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            onClick={onOpenExport}
            className="flex-1 sm:flex-none px-6 py-2.5 rounded-sm bg-[#A67C52] text-white text-xs font-semibold tracking-widest uppercase shadow-xs hover:bg-[#8e6945] transition-all flex items-center justify-center gap-2"
          >
            <Share2 className="w-4 h-4" />
            Exportar PDF
          </button>
        </div>
      </div>
    </div>
  );
};

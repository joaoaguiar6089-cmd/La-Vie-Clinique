import React, { useState } from 'react';
import { Search, Plus, Edit3, Trash2, Copy, Star, Eye, Image as ImageIcon, ArrowUpDown, Filter, Sparkles, Share2 } from 'lucide-react';
import { Procedure, ClinicProfile } from '../types';
import { formatBRL, formatDate } from '../utils/formatters';

interface ProcedureManagerProps {
  procedures: Procedure[];
  clinic: ClinicProfile;
  categories: string[];
  onOpenNewProcedure: () => void;
  onEditProcedure: (procedure: Procedure) => void;
  onDeleteProcedure: (id: string) => void;
  onDuplicateProcedure: (procedure: Procedure) => void;
  onToggleFeatured: (id: string) => void;
  onViewDetails: (procedure: Procedure) => void;
  onShareSingle: (procedure: Procedure) => void;
}

export const ProcedureManager: React.FC<ProcedureManagerProps> = ({
  procedures,
  clinic,
  categories,
  onOpenNewProcedure,
  onEditProcedure,
  onDeleteProcedure,
  onDuplicateProcedure,
  onToggleFeatured,
  onViewDetails,
  onShareSingle,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [sortBy, setSortBy] = useState<'title' | 'price' | 'date'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const filteredProcedures = procedures
    .filter((p) => {
      const matchesSearch =
        p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.subtitle && p.subtitle.toLowerCase().includes(searchTerm.toLowerCase())) ||
        p.description.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCat = selectedCategory === 'Todos' || p.category === selectedCategory;
      return matchesSearch && matchesCat;
    })
    .sort((a, b) => {
      if (sortBy === 'title') {
        return sortOrder === 'asc'
          ? a.title.localeCompare(b.title)
          : b.title.localeCompare(a.title);
      }
      if (sortBy === 'price') {
        const pA = a.promotionalPrice || a.price;
        const pB = b.promotionalPrice || b.price;
        return sortOrder === 'asc' ? pA - pB : pB - pA;
      }
      // date
      return sortOrder === 'asc'
        ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const totalValue = procedures.reduce((acc, p) => acc + p.price, 0);

  return (
    <div className="space-y-6">
      {/* Overview Metric Bar (Frosted Glass) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white/40 backdrop-blur-md p-5 rounded-sm border border-white/60 shadow-xs">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
            Total de Procedimentos
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-serif-luxury text-3xl font-medium text-[#1A1A1A]">
              {procedures.length}
            </span>
            <span className="text-xs text-[#A67C52] font-medium">cadastrados</span>
          </div>
        </div>

        <div className="bg-white/40 backdrop-blur-md p-5 rounded-sm border border-white/60 shadow-xs">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
            Procedimentos VIP
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-serif-luxury text-3xl font-medium text-[#A67C52]">
              {procedures.filter(p => p.isFeatured).length}
            </span>
            <span className="text-xs text-gray-500 font-medium">destaques</span>
          </div>
        </div>

        <div className="bg-white/40 backdrop-blur-md p-5 rounded-sm border border-white/60 shadow-xs">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
            Categorias Ativas
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-serif-luxury text-3xl font-medium text-[#1A1A1A]">
              {Array.from(new Set(procedures.map(p => p.category))).length}
            </span>
            <span className="text-xs text-gray-500 font-medium">especialidades</span>
          </div>
        </div>
      </div>

      {/* Action and Filter Controls (Frosted Glass) */}
      <div className="bg-white/40 backdrop-blur-md p-4 sm:p-5 rounded-sm border border-white/60 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por título, substância ou descrição..."
            className="w-full pl-10 pr-4 py-2 rounded-sm bg-white/60 backdrop-blur-xs border border-white/70 text-xs font-medium text-[#1A1A1A] placeholder-gray-400 focus:outline-hidden focus:border-[#A67C52]"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 rounded-sm bg-white/60 backdrop-blur-xs border border-white/70 text-xs font-medium text-[#1A1A1A] focus:outline-hidden focus:border-[#A67C52]"
          >
            {categories.map((c, idx) => (
              <option key={idx} value={c}>{c}</option>
            ))}
          </select>

          <button
            onClick={() => {
              if (sortBy === 'price') {
                setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
              } else {
                setSortBy('price');
                setSortOrder('desc');
              }
            }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-sm text-xs font-semibold uppercase tracking-wider border transition-colors ${
              sortBy === 'price'
                ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]'
                : 'bg-white/50 text-gray-600 border-white/70 hover:bg-white/80'
            }`}
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            Valor {sortBy === 'price' && (sortOrder === 'asc' ? '↑' : '↓')}
          </button>

          <button
            onClick={onOpenNewProcedure}
            className="flex items-center gap-1.5 px-4 py-2 rounded-sm bg-[#A67C52] text-white text-xs font-semibold uppercase tracking-widest shadow-xs hover:bg-[#8e6945] active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4" />
            Novo
          </button>
        </div>
      </div>

      {/* Procedures List — Mobile Cards (below sm breakpoint) */}
      <div className="sm:hidden space-y-3">
        {filteredProcedures.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-xs bg-white/50 backdrop-blur-md rounded-sm border border-white/60">
            Nenhum procedimento encontrado com os filtros selecionados.
          </div>
        ) : (
          filteredProcedures.map((proc) => {
            const hasDiscount = proc.promotionalPrice && proc.promotionalPrice < proc.price;
            const img = proc.images && proc.images.length > 0 ? proc.images[0] : '';

            return (
              <div
                key={proc.id}
                className="bg-white/60 backdrop-blur-md rounded-sm border border-white/70 shadow-xs p-3"
              >
                <div className="flex items-start gap-3">
                  <div className="w-14 h-14 rounded-xs overflow-hidden bg-gray-200 shrink-0 border border-white/60">
                    {img ? (
                      <img src={img} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        <ImageIcon className="w-4 h-4" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h4
                        onClick={() => onViewDetails(proc)}
                        className="font-medium text-sm text-[#1A1A1A] uppercase tracking-tight cursor-pointer line-clamp-2"
                      >
                        {proc.title}
                      </h4>
                      <button
                        onClick={() => onToggleFeatured(proc.id)}
                        className={`shrink-0 p-1 rounded-xs transition-colors ${
                          proc.isFeatured ? 'text-[#C49B74] bg-[#1A1A1A]' : 'text-gray-300'
                        }`}
                        title="Alternar Destaque VIP"
                      >
                        <Star className={`w-3.5 h-3.5 ${proc.isFeatured ? 'fill-[#C49B74]' : ''}`} />
                      </button>
                    </div>

                    {proc.subtitle && (
                      <p className="text-[11px] text-gray-400 line-clamp-1 mt-0.5">{proc.subtitle}</p>
                    )}

                    <div className="flex items-center flex-wrap gap-1.5 mt-1.5">
                      <span className="inline-block px-2 py-0.5 rounded-xs bg-white/70 border border-white/80 text-[#A67C52] font-semibold text-[10px] tracking-widest uppercase">
                        {proc.category}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {proc.duration || '—'} · {proc.sessionsRecommended || '1 sessão'}
                      </span>
                    </div>

                    <div className="flex items-baseline gap-1.5 font-mono mt-1.5">
                      {hasDiscount && (
                        <span className="text-[10px] text-gray-400 line-through">
                          {formatBRL(proc.price)}
                        </span>
                      )}
                      <span className="font-semibold text-[#A67C52] text-sm">
                        {formatBRL(hasDiscount ? proc.promotionalPrice : proc.price)}
                      </span>
                      {proc.priceNote && (
                        <span className="text-[10px] text-gray-400 font-sans">{proc.priceNote}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-1 mt-2.5 pt-2.5 border-t border-white/60">
                  <button
                    onClick={() => onViewDetails(proc)}
                    className="p-2 rounded-xs text-gray-400 hover:text-[#1A1A1A] hover:bg-white/80 transition-colors"
                    title="Ver Detalhes"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onShareSingle(proc)}
                    className="p-2 rounded-xs text-gray-400 hover:text-[#A67C52] hover:bg-white/80 transition-colors"
                    title="Exportar Card"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onDuplicateProcedure(proc)}
                    className="p-2 rounded-xs text-gray-400 hover:text-[#1A1A1A] hover:bg-white/80 transition-colors"
                    title="Duplicar"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onEditProcedure(proc)}
                    className="p-2 rounded-xs text-gray-400 hover:text-[#1A1A1A] hover:bg-white/80 transition-colors"
                    title="Editar"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onDeleteProcedure(proc.id)}
                    className="p-2 rounded-xs text-gray-400 hover:text-red-600 hover:bg-red-50/50 transition-colors"
                    title="Excluir"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Procedures Table (Frosted Glass) — sm and up */}
      <div className="hidden sm:block bg-white/50 backdrop-blur-md rounded-sm border border-white/60 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-600">
            <thead className="bg-white/60 text-[#1A1A1A] uppercase text-[10px] font-semibold tracking-widest border-b border-white/80">
              <tr>
                <th className="py-3 px-4">Procedimento</th>
                <th className="py-3 px-4">Categoria</th>
                <th className="py-3 px-4">Investimento</th>
                <th className="py-3 px-4">Duração & Sessões</th>
                <th className="py-3 px-4 text-center">Destaque</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredProcedures.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-gray-400">
                    Nenhum procedimento encontrado com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredProcedures.map((proc) => {
                  const hasDiscount = proc.promotionalPrice && proc.promotionalPrice < proc.price;
                  const img = proc.images && proc.images.length > 0 ? proc.images[0] : '';

                  return (
                    <tr key={proc.id} className="hover:bg-white/80 transition-colors group">
                      {/* Name & Photo */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-xs overflow-hidden bg-gray-200 shrink-0 border border-white/60">
                            {img ? (
                              <img src={img} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-gray-400">
                                <ImageIcon className="w-4 h-4" />
                              </div>
                            )}
                          </div>
                          <div>
                            <h4
                              onClick={() => onViewDetails(proc)}
                              className="font-medium text-sm text-[#1A1A1A] uppercase tracking-tight hover:text-[#A67C52] cursor-pointer"
                            >
                              {proc.title}
                            </h4>
                            {proc.subtitle && (
                              <p className="text-[11px] text-gray-400 line-clamp-1">
                                {proc.subtitle}
                              </p>
                            )}
                            {proc.assignedDoctorNames && proc.assignedDoctorNames.length > 0 && (
                              <p className="text-[10px] text-[#A67C52] font-medium mt-0.5">
                                ✦ {proc.assignedDoctorNames.join(' • ')}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="py-3 px-4">
                        <span className="inline-block px-2.5 py-0.5 rounded-xs bg-white/70 border border-white/80 text-[#A67C52] font-semibold text-[10px] tracking-widest uppercase">
                          {proc.category}
                        </span>
                      </td>

                      {/* Price */}
                      <td className="py-3 px-4">
                        <div className="flex items-baseline gap-1.5 font-mono">
                          {hasDiscount && (
                            <span className="text-[11px] text-gray-400 line-through">
                              {formatBRL(proc.price)}
                            </span>
                          )}
                          <span className="font-semibold text-[#A67C52] text-sm">
                            {formatBRL(hasDiscount ? proc.promotionalPrice : proc.price)}
                          </span>
                        </div>
                        {proc.priceNote && (
                          <span className="text-[10px] text-gray-400 block font-sans">{proc.priceNote}</span>
                        )}
                      </td>

                      {/* Specs */}
                      <td className="py-3 px-4 text-[11px]">
                        <div className="font-mono">{proc.duration || '—'}</div>
                        <div className="text-gray-400">{proc.sessionsRecommended || '1 sessão'}</div>
                      </td>

                      {/* Featured toggle */}
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => onToggleFeatured(proc.id)}
                          className={`p-1.5 rounded-xs transition-colors ${
                            proc.isFeatured
                              ? 'text-[#C49B74] bg-[#1A1A1A]'
                              : 'text-gray-300 hover:text-[#A67C52] hover:bg-white'
                          }`}
                          title="Alternar Destaque VIP"
                        >
                          <Star className={`w-4 h-4 ${proc.isFeatured ? 'fill-[#C49B74]' : ''}`} />
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => onViewDetails(proc)}
                            className="p-1.5 rounded-xs text-gray-400 hover:text-[#1A1A1A] hover:bg-white/80 transition-colors"
                            title="Ver Detalhes"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onShareSingle(proc)}
                            className="p-1.5 rounded-xs text-gray-400 hover:text-[#A67C52] hover:bg-white/80 transition-colors"
                            title="Exportar Card"
                          >
                            <Share2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onDuplicateProcedure(proc)}
                            className="p-1.5 rounded-xs text-gray-400 hover:text-[#1A1A1A] hover:bg-white/80 transition-colors"
                            title="Duplicar"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onEditProcedure(proc)}
                            className="p-1.5 rounded-xs text-gray-400 hover:text-[#1A1A1A] hover:bg-white/80 transition-colors"
                            title="Editar"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onDeleteProcedure(proc.id)}
                            className="p-1.5 rounded-xs text-gray-400 hover:text-red-600 hover:bg-red-50/50 transition-colors"
                            title="Excluir"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

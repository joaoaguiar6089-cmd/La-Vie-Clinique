import React, { useState } from 'react';
import { Sparkles, Clock, Calendar, CheckCircle2, ChevronRight, Edit3, Trash2, MessageCircle, Share2, Layers } from 'lucide-react';
import { Procedure, ClinicProfile } from '../types';
import { formatBRL } from '../utils/formatters';
import { buildSingleProcedureWhatsAppUrl } from '../utils/exportHelpers';
import { getProcedureDoctors } from '../utils/doctorHelpers';

interface ProcedureCardProps {
  procedure: Procedure;
  clinic: ClinicProfile;
  onViewDetails: (procedure: Procedure) => void;
  onEdit: (procedure: Procedure) => void;
  onDelete: (id: string) => void;
  onShareSingle: (procedure: Procedure) => void;
  layoutMode?: 'editorial-grid' | 'lookbook-cards' | 'magazine-spread' | 'minimal-table';
}

export const ProcedureCard: React.FC<ProcedureCardProps> = ({
  procedure,
  clinic,
  onViewDetails,
  onEdit,
  onDelete,
  onShareSingle,
  layoutMode = 'editorial-grid',
}) => {
  const [currentImgIndex, setCurrentImgIndex] = useState(0);
  const images = procedure.images && procedure.images.length > 0
    ? procedure.images
    : ['https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=1000&auto=format&fit=crop&q=80'];

  const hasDiscount = procedure.promotionalPrice && procedure.promotionalPrice < procedure.price;
  const discountPercent = hasDiscount
    ? Math.round(((procedure.price - procedure.promotionalPrice!) / procedure.price) * 100)
    : 0;

  const doctors = getProcedureDoctors(procedure, clinic);

  // Render Table Row if in minimal-table mode
  if (layoutMode === 'minimal-table') {
    return (
      <div 
        id={`procedure-row-${procedure.id}`}
        className="group bg-white/50 backdrop-blur-md rounded-sm p-4 border border-white/70 hover:border-[#A67C52]/50 hover:bg-white/80 shadow-xs transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
      >
        <div className="flex items-center gap-4 flex-1">
          <div className="w-14 h-14 rounded-xs overflow-hidden bg-gray-200 shrink-0 relative border border-white/60">
            <img
              src={images[0]}
              alt={procedure.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              referrerPolicy="no-referrer"
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-xs bg-white/70 text-[#A67C52] border border-white/80">
                {procedure.category}
              </span>
              {procedure.isFeatured && (
                <span className="text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-xs bg-[#1A1A1A] text-white">
                  VIP
                </span>
              )}
            </div>
            <h3 
              onClick={() => onViewDetails(procedure)}
              className="font-sans text-base font-medium text-[#1A1A1A] uppercase tracking-tight cursor-pointer hover:text-[#A67C52] transition-colors mt-0.5"
            >
              {procedure.title}
            </h3>
            {procedure.subtitle && (
              <p className="text-xs text-gray-500 line-clamp-1">{procedure.subtitle}</p>
            )}
            {doctors && doctors.length > 0 && (
              <p className="text-[10px] text-[#A67C52] font-medium mt-0.5">
                ✦ {doctors.map(d => d.specialty ? `${d.name} (${d.specialty})` : d.name).join(' • ')}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between w-full md:w-auto md:gap-8 pt-2 md:pt-0 border-t md:border-t-0 border-gray-100">
          <div className="text-left md:text-right">
            <div className="flex items-baseline md:justify-end gap-1.5 font-mono">
              {hasDiscount && (
                <span className="text-xs text-gray-400 line-through">
                  {formatBRL(procedure.price)}
                </span>
              )}
              <span className="text-base font-semibold text-[#A67C52]">
                {formatBRL(hasDiscount ? procedure.promotionalPrice : procedure.price)}
              </span>
            </div>
            {procedure.priceNote && (
              <p className="text-[10px] text-gray-400">{procedure.priceNote}</p>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onViewDetails(procedure)}
              className="px-3 py-1.5 rounded-xs text-xs font-medium bg-white/80 text-[#1A1A1A] border border-white hover:bg-white transition-colors uppercase tracking-wider"
            >
              Detalhes
            </button>
            <button
              onClick={() => onShareSingle(procedure)}
              className="p-1.5 rounded-xs text-gray-400 hover:text-[#A67C52] hover:bg-white/80 transition-colors"
              title="Compartilhar Card"
            >
              <Share2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => onEdit(procedure)}
              className="p-1.5 rounded-xs text-gray-400 hover:text-[#1A1A1A] hover:bg-white/80 transition-colors"
              title="Editar"
            >
              <Edit3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => onDelete(procedure.id)}
              className="p-1.5 rounded-xs text-gray-400 hover:text-red-600 hover:bg-red-50/50 transition-colors"
              title="Excluir"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Lookbook Cards / Magazine Spread Layout
  if (layoutMode === 'lookbook-cards' || layoutMode === 'magazine-spread') {
    return (
      <div
        id={`procedure-card-${procedure.id}`}
        className="group bg-white/40 backdrop-blur-md rounded-sm overflow-hidden border border-white/60 hover:border-[#A67C52]/40 transition-all duration-300 shadow-sm hover:shadow-md flex flex-col md:flex-row h-full"
      >
        {/* Visual Cover Section */}
        <div className="md:w-5/12 relative h-64 md:h-auto overflow-hidden bg-gray-200">
          <img
            src={images[currentImgIndex]}
            alt={procedure.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent md:hidden" />
          
          {/* Top badges */}
          <div className="absolute top-3 left-3 right-3 flex justify-between items-center pointer-events-none">
            <span className="text-[10px] font-medium uppercase tracking-widest px-2.5 py-1 rounded-xs bg-[#1A1A1A]/80 text-white backdrop-blur-md border border-white/15">
              {procedure.category}
            </span>
            {hasDiscount && (
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-xs bg-[#A67C52] text-white shadow-xs">
                -{discountPercent}% OFF
              </span>
            )}
          </div>

          {/* Multiple images indicator */}
          {images.length > 1 && (
            <div className="absolute bottom-3 left-3 flex gap-1.5 z-10">
              {images.map((_, idx) => (
                <button
                  key={idx}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentImgIndex(idx);
                  }}
                  className={`w-2 h-2 rounded-full transition-all ${
                    currentImgIndex === idx
                      ? 'w-5 bg-[#A67C52]'
                      : 'bg-white/70 hover:bg-white'
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Content Section */}
        <div className="md:w-7/12 p-6 flex flex-col justify-between bg-white/20">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-semibold tracking-widest text-[#A67C52] uppercase">
                Protocolo Exclusivo
              </span>
              {procedure.duration && (
                <span className="text-[11px] text-gray-500 flex items-center gap-1 font-mono">
                  <Clock className="w-3 h-3 text-[#A67C52]" />
                  {procedure.duration}
                </span>
              )}
            </div>

            <h3 
              onClick={() => onViewDetails(procedure)}
              className="text-lg sm:text-xl font-medium tracking-tight uppercase text-[#1A1A1A] leading-snug cursor-pointer hover:text-[#A67C52] transition-colors"
            >
              {procedure.title}
            </h3>

            {procedure.subtitle && (
              <p className="text-xs text-gray-500 font-normal mt-1 mb-3">
                {procedure.subtitle}
              </p>
            )}

            <p className="text-xs text-gray-600 leading-relaxed line-clamp-3 mb-4 font-light">
              {procedure.description}
            </p>

            {/* Benefits highlights */}
            {procedure.benefits && procedure.benefits.length > 0 && (
              <div className="space-y-1.5 mb-4">
                {procedure.benefits.slice(0, 3).map((benefit, bIdx) => (
                  <div key={bIdx} className="flex items-start gap-2 text-xs text-gray-600">
                    <Sparkles className="w-3.5 h-3.5 text-[#A67C52] shrink-0 mt-0.5" />
                    <span className="line-clamp-1">{benefit}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Assigned Doctors */}
            {doctors && doctors.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {doctors.map((doc, nIdx) => (
                  <span
                    key={nIdx}
                    className="text-[10px] px-2 py-0.5 bg-[#A67C52]/10 text-[#1A1A1A] font-medium border border-[#A67C52]/20 rounded-xs flex items-center gap-1"
                  >
                    <span>✦ {doc.name}</span>
                    {doc.specialty && (
                      <span className="text-gray-500 font-normal">({doc.specialty})</span>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Pricing & Actions */}
          <div className="pt-4 border-t border-gray-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-gray-400 font-medium">Investimento</p>
              <div className="flex items-baseline gap-2 font-mono">
                {hasDiscount && (
                  <span className="text-xs text-gray-400 line-through">
                    {formatBRL(procedure.price)}
                  </span>
                )}
                <span className="text-xl font-semibold text-[#A67C52]">
                  {formatBRL(hasDiscount ? procedure.promotionalPrice : procedure.price)}
                </span>
                {procedure.priceNote && (
                  <span className="text-[10px] text-gray-400 font-sans">
                    /{procedure.priceNote}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                onClick={() => onViewDetails(procedure)}
                className="flex-1 sm:flex-none px-4 py-2 rounded-sm bg-[#1A1A1A] hover:bg-[#333333] text-white text-xs font-semibold tracking-widest uppercase transition-all shadow-xs flex items-center justify-center gap-1.5"
              >
                Detalhes
                <ChevronRight className="w-3.5 h-3.5" />
              </button>

              <a
                href={buildSingleProcedureWhatsAppUrl(procedure, clinic)}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-sm bg-white/60 border border-white/80 text-[#1A1A1A] hover:text-[#25D366] transition-colors"
                title="Agendar via WhatsApp"
              >
                <MessageCircle className="w-4 h-4" />
              </a>

              <button
                onClick={() => onShareSingle(procedure)}
                className="p-2 rounded-sm bg-white/60 border border-white/80 text-[#1A1A1A] hover:text-[#A67C52] transition-colors"
                title="Exportar Card"
              >
                <Share2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Default: Frosted Glass Editorial Card
  return (
    <div
      id={`procedure-card-${procedure.id}`}
      className="group bg-white/40 backdrop-blur-md rounded-sm overflow-hidden border border-white/60 hover:bg-white/60 hover:border-white/90 hover:shadow-md transition-all duration-300 shadow-sm flex flex-col justify-between"
    >
      <div className="p-6 pb-0">
        {/* Card Image Container */}
        <div 
          className="h-48 bg-gray-200 mb-4 overflow-hidden rounded-xs relative cursor-pointer group-hover:shadow-xs transition-shadow"
          onClick={() => onViewDetails(procedure)}
        >
          <img
            src={images[currentImgIndex]}
            alt={procedure.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-60 group-hover:opacity-40 transition-opacity" />

          {/* Top Badges */}
          <div className="absolute top-2.5 left-2.5 right-2.5 flex justify-between items-center pointer-events-none">
            <span className="text-[9px] font-medium uppercase tracking-widest px-2 py-0.5 rounded-xs bg-[#1A1A1A]/80 text-white backdrop-blur-md border border-white/10">
              {procedure.category}
            </span>
            {hasDiscount && (
              <span className="text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-xs bg-[#A67C52] text-white shadow-xs">
                -{discountPercent}% OFF
              </span>
            )}
          </div>

          {/* Carousel dots */}
          {images.length > 1 && (
            <div className="absolute bottom-2 left-2 flex gap-1 z-10">
              {images.map((_, idx) => (
                <button
                  key={idx}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentImgIndex(idx);
                  }}
                  className={`w-1.5 h-1.5 rounded-full transition-all ${
                    currentImgIndex === idx ? 'w-4 bg-[#A67C52]' : 'bg-white/70'
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Card Body Heading & Price */}
        <div className="flex justify-between items-start mb-2 gap-2">
          <h3 
            onClick={() => onViewDetails(procedure)}
            className="text-base sm:text-lg font-medium tracking-tight uppercase text-[#1A1A1A] cursor-pointer hover:text-[#A67C52] transition-colors leading-snug"
          >
            {procedure.title}
          </h3>
          <div className="text-right shrink-0">
            {hasDiscount && (
              <span className="text-[11px] text-gray-400 line-through font-mono block">
                {formatBRL(procedure.price)}
              </span>
            )}
            <span className="text-[#A67C52] font-semibold font-mono text-base">
              {formatBRL(hasDiscount ? procedure.promotionalPrice : procedure.price)}
            </span>
          </div>
        </div>

        {procedure.subtitle && (
          <p className="text-[11px] text-gray-400 font-normal mb-2 line-clamp-1">
            {procedure.subtitle}
          </p>
        )}

        <p className="text-gray-500 text-xs leading-relaxed mb-4 line-clamp-2 font-light">
          {procedure.description}
        </p>

        {/* Benefits Badges */}
        {procedure.benefits && procedure.benefits.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {procedure.benefits.slice(0, 2).map((benefit, bIdx) => (
              <span
                key={bIdx}
                className="text-[10px] px-2 py-0.5 rounded-xs bg-white/50 text-gray-600 border border-white/60 line-clamp-1"
              >
                ✦ {benefit}
              </span>
            ))}
          </div>
        )}

        {/* Assigned Doctor(s) Badge */}
        {doctors && doctors.length > 0 && (
          <div className="pt-1 pb-3 flex flex-wrap items-center gap-1.5 border-t border-gray-100/60">
            {doctors.map((doc, dIdx) => (
              <span
                key={dIdx}
                className="inline-flex items-center gap-1 text-[10px] font-medium text-[#1A1A1A] bg-[#C49B74]/15 px-2 py-0.5 rounded-xs border border-[#A67C52]/20"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#A67C52]"></span>
                <span>{doc.name}</span>
                {doc.specialty && (
                  <span className="text-gray-500 font-normal">({doc.specialty})</span>
                )}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Frosted Card Footer */}
      <div className="mt-auto px-6 py-4 border-t border-gray-100 flex justify-between items-center">
        <span className="text-[10px] text-gray-400 uppercase tracking-widest font-mono">
          Ref: {procedure.category.slice(0, 2).toUpperCase()}-{procedure.order.toString().padStart(3, '0')}
        </span>

        <div className="flex items-center gap-2">
          <div className="flex space-x-1.5 mr-1">
            <div className="w-2 h-2 rounded-full bg-[#A67C52]"></div>
            <div className={`w-2 h-2 rounded-full ${procedure.isFeatured ? 'bg-[#A67C52]' : 'bg-gray-200'}`}></div>
          </div>

          <button
            onClick={() => onShareSingle(procedure)}
            className="p-1.5 rounded-xs text-gray-400 hover:text-[#A67C52] hover:bg-white/80 transition-colors"
            title="Compartilhar Card"
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onEdit(procedure)}
            className="p-1.5 rounded-xs text-gray-400 hover:text-[#1A1A1A] hover:bg-white/80 transition-colors"
            title="Editar"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onViewDetails(procedure)}
            className="px-2.5 py-1 rounded-xs bg-[#1A1A1A] hover:bg-[#333333] text-white text-[11px] font-medium uppercase tracking-wider transition-all"
          >
            Ver
          </button>
        </div>
      </div>
    </div>
  );
};

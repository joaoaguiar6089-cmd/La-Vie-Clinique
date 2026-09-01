import React from 'react';
import { Procedure, ClinicProfile } from '../types';
import { formatBRL } from '../utils/formatters';
import { getProcedureDoctors } from '../utils/doctorHelpers';
import { Sparkles, Clock, Calendar, CheckCircle2, ShieldCheck, Stethoscope } from 'lucide-react';

interface PrintableCardProps {
  procedure: Procedure;
  clinic: ClinicProfile;
}

export const PrintableCard: React.FC<PrintableCardProps> = ({ procedure, clinic }) => {
  const images = procedure.images && procedure.images.length > 0
    ? procedure.images
    : ['https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=1000&auto=format&fit=crop&q=80'];
  const hasDiscount = procedure.promotionalPrice && procedure.promotionalPrice < procedure.price;
  const doctors = getProcedureDoctors(procedure, clinic);

  return (
    <div
      id="printable-single-card"
      className="w-[500px] bg-[#FAF9F5] rounded-2xl overflow-hidden border-2 border-[#B88358]/30 shadow-2xl p-6 text-[#1A1A1C] font-sans"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#E8E6DE] pb-4 mb-4">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#B88358] block">
            {clinic.name}
          </span>
          {doctors.length > 0 ? (
            <span className="text-xs text-[#52525B] font-medium block mt-0.5">
              {doctors.map((d) => d.specialty ? `${d.name} (${d.specialty})` : d.name).join(' • ')}
            </span>
          ) : (
            <span className="text-xs text-[#52525B] font-medium">
              {clinic.tagline}
            </span>
          )}
        </div>
        <div className="w-8 h-8 rounded bg-[#1A1A1C] text-[#D8A47F] font-serif-luxury text-sm font-bold flex items-center justify-center">
          LV
        </div>
      </div>

      {/* Main Image */}
      <div className="relative aspect-16/10 rounded-xl overflow-hidden mb-4 bg-[#EFECE6] border border-[#E0DCD3]">
        <img
          src={images[0]}
          alt={procedure.title}
          className="w-full h-full object-cover"
          crossOrigin="anonymous"
        />
        <div className="absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded bg-[#1A1A1A]/85 text-[#FAF9F5] text-[10px] font-bold uppercase tracking-wider">
          {procedure.category}
        </div>
        {procedure.isFeatured && (
          <div className="absolute top-2.5 right-2.5 px-2.5 py-0.5 rounded bg-[#B88358] text-white text-[10px] font-bold uppercase tracking-wider">
            Destaque
          </div>
        )}
      </div>

      {/* Title & Description */}
      <div className="mb-4">
        <h2 className="font-serif-luxury text-2xl font-bold text-[#1A1A1C] leading-snug">
          {procedure.title}
        </h2>
        {procedure.subtitle && (
          <p className="text-xs text-[#8A8985] italic font-medium mt-0.5 mb-2">
            {procedure.subtitle}
          </p>
        )}
        <p className="text-xs text-[#52525B] leading-relaxed line-clamp-3">
          {procedure.description}
        </p>
      </div>

      {/* Benefits */}
      {procedure.benefits && procedure.benefits.length > 0 && (
        <div className="space-y-1.5 mb-4 bg-white p-3 rounded-xl border border-[#E8E6DE]">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#9C663D] block mb-1">
            Destaques do Procedimento:
          </span>
          {procedure.benefits.slice(0, 3).map((benefit, idx) => (
            <div key={idx} className="flex items-center gap-1.5 text-xs text-[#27272A]">
              <Sparkles className="w-3.5 h-3.5 text-[#B88358] shrink-0" />
              <span className="line-clamp-1">{benefit}</span>
            </div>
          ))}
        </div>
      )}

      {/* Specs bar */}
      <div className="grid grid-cols-2 gap-2 text-[11px] text-[#52525B] mb-4">
        {procedure.duration && (
          <div className="flex items-center gap-1 bg-[#F5F4EE] px-2.5 py-1.5 rounded-lg">
            <Clock className="w-3.5 h-3.5 text-[#B88358]" />
            <span>{procedure.duration}</span>
          </div>
        )}
        {procedure.recoveryTime && (
          <div className="flex items-center gap-1 bg-[#F5F4EE] px-2.5 py-1.5 rounded-lg">
            <ShieldCheck className="w-3.5 h-3.5 text-[#B88358]" />
            <span>{procedure.recoveryTime}</span>
          </div>
        )}
      </div>

      {/* Price block */}
      <div className="bg-[#1A1A1C] text-white p-4 rounded-xl border border-[#B88358]/30 flex items-center justify-between mb-4">
        <div>
          <span className="text-[9px] uppercase tracking-wider text-[#D8A47F] font-semibold block">
            Investimento
          </span>
          <div className="flex items-baseline gap-1.5">
            {hasDiscount && (
              <span className="text-xs text-[#A0A0A5] line-through">
                {formatBRL(procedure.price)}
              </span>
            )}
            <span className="font-serif-luxury text-2xl font-bold text-white">
              {formatBRL(hasDiscount ? procedure.promotionalPrice : procedure.price)}
            </span>
          </div>
        </div>
        {procedure.priceNote && (
          <span className="text-xs text-[#C89973] font-medium">
            {procedure.priceNote}
          </span>
        )}
      </div>

      {/* Footer */}
      <div className="text-center text-[10px] text-[#8A8985] pt-2 border-t border-[#E8E6DE]">
        <p>📱 {clinic.phone} • 📸 {clinic.instagram}</p>
        <p className="mt-0.5">{clinic.address} • {clinic.cityState}</p>
      </div>
    </div>
  );
};

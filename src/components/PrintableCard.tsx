import React from 'react';
import { Procedure, ClinicProfile } from '../types';
import { formatBRL } from '../utils/formatters';
import { getCatalogPrice, formatDiscountPercent } from '../utils/catalogPricing';
import { getProcedureDoctors } from '../utils/doctorHelpers';
import { Sparkles, Clock, Calendar, CheckCircle2, ShieldCheck, Stethoscope } from 'lucide-react';
import { ClinicLogo } from './ClinicLogo';

interface PrintableCardProps {
  procedure: Procedure;
  clinic: ClinicProfile;
  /** Desconto promocional aplicado a todo o catálogo, em % (dias especiais). */
  discountPercent?: number;
}

export const PrintableCard: React.FC<PrintableCardProps> = ({
  procedure,
  clinic,
  discountPercent = 0,
}) => {
  const images = procedure.images && procedure.images.length > 0
    ? procedure.images
    : ['https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=1000&auto=format&fit=crop&q=80'];
  const { strikePrice, finalPrice, hasDiscount } = getCatalogPrice(procedure, discountPercent);
  const isPromoDay = discountPercent > 0;
  const doctors = getProcedureDoctors(procedure, clinic);

  return (
    <div
      id="printable-single-card"
      className="w-[500px] bg-surface rounded-2xl overflow-hidden border-2 border-brand/30 shadow-2xl p-6 text-ink font-sans"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-line pb-4 mb-4">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-brand block">
            {clinic.name}
          </span>
          {doctors.length > 0 ? (
            <span className="text-xs text-ink-soft font-medium block mt-0.5">
              {doctors.map((d) => d.specialty ? `${d.name} (${d.specialty})` : d.name).join(' • ')}
            </span>
          ) : (
            <span className="text-xs text-ink-soft font-medium">
              {clinic.tagline}
            </span>
          )}
        </div>
        <ClinicLogo
          clinic={clinic}
          className="w-8 h-8 rounded shrink-0"
          monogramClassName="bg-ink text-brand-light font-serif-luxury text-sm font-bold"
        />
      </div>

      {/* Main Image */}
      <div className="relative aspect-16/10 rounded-xl overflow-hidden mb-4 bg-line-soft border border-line">
        <img
          src={images[0]}
          alt={procedure.title}
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
        />
        <div className="absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded bg-ink/85 text-surface text-[10px] font-bold uppercase tracking-wider">
          {procedure.category}
        </div>
        {(isPromoDay || procedure.isFeatured) && (
          <div className="absolute top-2.5 right-2.5 px-2.5 py-0.5 rounded bg-brand text-white text-[10px] font-bold uppercase tracking-wider">
            {isPromoDay ? `-${formatDiscountPercent(discountPercent)}% OFF` : 'Destaque'}
          </div>
        )}
      </div>

      {/* Title & Description */}
      <div className="mb-4">
        <h2 className="font-serif-luxury text-2xl font-bold text-ink leading-snug">
          {procedure.title}
        </h2>
        {procedure.subtitle && (
          <p className="text-xs text-muted italic font-medium mt-0.5 mb-2">
            {procedure.subtitle}
          </p>
        )}
        <p className="text-xs text-ink-soft leading-relaxed line-clamp-3">
          {procedure.description}
        </p>
      </div>

      {/* Benefits */}
      {procedure.benefits && procedure.benefits.length > 0 && (
        <div className="space-y-1.5 mb-4 bg-white p-3 rounded-xl border border-line">
          <span className="text-[10px] font-bold uppercase tracking-wider text-brand-hover block mb-1">
            Destaques do Procedimento:
          </span>
          {procedure.benefits.slice(0, 3).map((benefit, idx) => (
            <div key={idx} className="flex items-center gap-1.5 text-xs text-ink">
              <Sparkles className="w-3.5 h-3.5 text-brand shrink-0" />
              <span className="line-clamp-1">{benefit}</span>
            </div>
          ))}
        </div>
      )}

      {/* Specs bar */}
      <div className="grid grid-cols-2 gap-2 text-[11px] text-ink-soft mb-4">
        {procedure.duration && (
          <div className="flex items-center gap-1 bg-surface-2 px-2.5 py-1.5 rounded-lg">
            <Clock className="w-3.5 h-3.5 text-brand" />
            <span>{procedure.duration}</span>
          </div>
        )}
        {procedure.recoveryTime && (
          <div className="flex items-center gap-1 bg-surface-2 px-2.5 py-1.5 rounded-lg">
            <ShieldCheck className="w-3.5 h-3.5 text-brand" />
            <span>{procedure.recoveryTime}</span>
          </div>
        )}
      </div>

      {/* Price block */}
      <div className="bg-ink text-white p-4 rounded-xl border border-brand/30 flex items-center justify-between mb-4">
        <div>
          <span className="text-[9px] uppercase tracking-wider text-brand-light font-semibold block">
            Investimento
          </span>
          {procedure.isStartingPrice && (
            <span className="block text-xs text-brand-light font-medium">a partir de</span>
          )}
          {strikePrice !== null && (
            <div className="flex items-center gap-1.5 leading-none mb-0.5">
              <span className="text-sm text-muted-light line-through">
                {formatBRL(strikePrice)}
              </span>
              {isPromoDay && (
                <span className="px-1.5 py-0.5 rounded-xs bg-brand text-white text-[9px] font-bold tracking-wider">
                  -{formatDiscountPercent(discountPercent)}%
                </span>
              )}
            </div>
          )}
          <span className="font-serif-luxury text-2xl font-bold text-white block leading-tight">
            {formatBRL(finalPrice)}
          </span>
        </div>
        {procedure.priceNote && (
          <span className="text-xs text-brand-light font-medium">
            {procedure.priceNote}
          </span>
        )}
      </div>

      {/* Footer */}
      <div className="text-center text-[10px] text-muted pt-2 border-t border-line">
        <p>📱 {clinic.phone} • 📸 {clinic.instagram}</p>
        <p className="mt-0.5">{clinic.address} • {clinic.cityState}</p>
      </div>
    </div>
  );
};

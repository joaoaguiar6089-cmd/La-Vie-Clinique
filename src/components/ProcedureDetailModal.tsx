import React, { useState } from 'react';
import { X, Sparkles, Clock, Calendar, ShieldCheck, AlertCircle, CheckCircle2, MessageCircle, Share2, Edit3, ChevronLeft, ChevronRight, UserCheck } from 'lucide-react';
import { Procedure, ClinicProfile } from '../types';
import { formatBRL } from '../utils/formatters';
import { buildSingleProcedureWhatsAppUrl } from '../utils/exportHelpers';
import { getProcedureDoctors } from '../utils/doctorHelpers';

interface ProcedureDetailModalProps {
  procedure: Procedure | null;
  clinic: ClinicProfile;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (procedure: Procedure) => void;
  onShareSingle: (procedure: Procedure) => void;
}

export const ProcedureDetailModal: React.FC<ProcedureDetailModalProps> = ({
  procedure,
  clinic,
  isOpen,
  onClose,
  onEdit,
  onShareSingle,
}) => {
  if (!isOpen || !procedure) return null;

  const [activeImgIndex, setActiveImgIndex] = useState(0);
  const images = procedure.images && procedure.images.length > 0
    ? procedure.images
    : ['https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=1000&auto=format&fit=crop&q=80'];

  const hasDiscount = procedure.promotionalPrice && procedure.promotionalPrice < procedure.price;
  const doctors = getProcedureDoctors(procedure, clinic);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-fadeIn">
      <div 
        className="relative w-full max-w-4xl bg-[#F9F8F6]/95 backdrop-blur-xl rounded-sm overflow-hidden shadow-2xl border border-white/60 my-6 transition-all"
        id="procedure-detail-container"
      >
        {/* Top Header Bar */}
        <div className="bg-[#1A1A1A] text-[#E5E4E0] px-6 py-3.5 flex items-center justify-between border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-widest text-[#C49B74] font-semibold">
              {procedure.category}
            </span>
            {procedure.isFeatured && (
              <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-xs bg-[#A67C52] text-white">
                VIP
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xs text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            id="close-detail-modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 max-h-[85vh] overflow-y-auto">
          {/* Left Column: Gallery & Quick Highlights */}
          <div className="md:col-span-5 bg-white/30 backdrop-blur-md p-5 sm:p-6 flex flex-col justify-between border-b md:border-b-0 md:border-r border-white/60">
            <div>
              {/* Main Image */}
              <div className="relative aspect-4/3 rounded-xs overflow-hidden bg-gray-200 shadow-xs border border-white/60 mb-3 group">
                <img
                  src={images[activeImgIndex]}
                  alt={procedure.title}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
                {images.length > 1 && (
                  <>
                    <button
                      onClick={() => setActiveImgIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1))}
                      className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-xs bg-black/60 backdrop-blur-xs text-white hover:bg-black/80 transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setActiveImgIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-xs bg-black/60 backdrop-blur-xs text-white hover:bg-black/80 transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>

              {/* Thumbnails */}
              {images.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
                  {images.map((img, idx) => (
                    <button
                      key={idx}
                      onClick={() => setActiveImgIndex(idx)}
                      className={`w-14 h-14 rounded-xs overflow-hidden shrink-0 border-2 transition-all ${
                        activeImgIndex === idx
                          ? 'border-[#A67C52] scale-105 shadow-xs'
                          : 'border-transparent opacity-70 hover:opacity-100'
                      }`}
                    >
                      <img src={img} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    </button>
                  ))}
                </div>
              )}

              {/* Specification Mini Badges */}
              <div className="bg-white/50 backdrop-blur-md rounded-sm p-4 border border-white/70 space-y-2.5">
                {procedure.duration && (
                  <div className="flex items-center gap-2.5 text-xs text-gray-700">
                    <Clock className="w-4 h-4 text-[#A67C52] shrink-0" />
                    <div>
                      <span className="font-semibold text-[#1A1A1A]">Duração:</span> {procedure.duration}
                    </div>
                  </div>
                )}
                {procedure.sessionsRecommended && (
                  <div className="flex items-center gap-2.5 text-xs text-gray-700">
                    <Calendar className="w-4 h-4 text-[#A67C52] shrink-0" />
                    <div>
                      <span className="font-semibold text-[#1A1A1A]">Recomendação:</span> {procedure.sessionsRecommended}
                    </div>
                  </div>
                )}
                {procedure.recoveryTime && (
                  <div className="flex items-center gap-2.5 text-xs text-gray-700">
                    <ShieldCheck className="w-4 h-4 text-[#A67C52] shrink-0" />
                    <div>
                      <span className="font-semibold text-[#1A1A1A]">Downtime:</span> {procedure.recoveryTime}
                    </div>
                  </div>
                )}

                {/* Assigned Doctors */}
                {doctors && doctors.length > 0 && (
                  <div className="pt-2 border-t border-gray-200/60">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-[#A67C52] mb-1.5">
                      {doctors.length > 1 ? 'Médicas Responsáveis:' : 'Médica Responsável:'}
                    </p>
                    <div className="space-y-1.5">
                      {doctors.map((doc, dIdx) => (
                        <div key={dIdx} className="text-xs text-[#1A1A1A]">
                          <div className="flex items-center gap-2 font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#A67C52]"></span>
                            <span>{doc.name}</span>
                          </div>
                          {doc.specialty && (
                            <span className="text-[11px] text-gray-500 font-normal ml-3.5 block">
                              {doc.specialty}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Areas Treated */}
            {procedure.areasTreated && procedure.areasTreated.length > 0 && (
              <div className="mt-4 pt-3 border-t border-white/60">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-2">
                  Regiões de Aplicação
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {procedure.areasTreated.map((area, aIdx) => (
                    <span
                      key={aIdx}
                      className="text-[10px] font-medium uppercase tracking-wider px-2.5 py-1 rounded-xs bg-white/70 text-gray-700 border border-white/80"
                    >
                      {area}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Full Details, Benefits & CTA */}
          <div className="md:col-span-7 p-6 sm:p-8 flex flex-col justify-between space-y-6">
            <div className="space-y-5">
              <div>
                <p className="text-xs uppercase tracking-widest text-[#A67C52] font-semibold mb-1">
                  {clinic.name} • Protocolo Exclusivo
                </p>
                <h2 className="font-serif-luxury text-2xl sm:text-3xl font-medium tracking-tight text-[#1A1A1A] leading-tight">
                  {procedure.title}
                </h2>
                {procedure.subtitle && (
                  <p className="text-xs text-gray-500 mt-1 font-normal">
                    {procedure.subtitle}
                  </p>
                )}
              </div>

              {/* Description */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-widest text-[#1A1A1A] mb-2">
                  Sobre o Procedimento
                </h4>
                <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-line font-light">
                  {procedure.description}
                </p>
              </div>

              {/* Benefits list */}
              {procedure.benefits && procedure.benefits.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-widest text-[#1A1A1A] mb-2.5 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#A67C52]" />
                    Principais Benefícios
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {procedure.benefits.map((benefit, bIdx) => (
                      <div
                        key={bIdx}
                        className="flex items-start gap-2 text-xs text-gray-700 bg-white/50 backdrop-blur-xs p-2.5 rounded-xs border border-white/70"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#A67C52] shrink-0 mt-0.5" />
                        <span>{benefit}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Ideal candidate / contraindications */}
              {(procedure.idealCandidate || procedure.contraindications) && (
                <div className="space-y-3 pt-2">
                  {procedure.idealCandidate && (
                    <div className="flex items-start gap-2.5 text-xs text-gray-600 bg-white/40 p-3 rounded-xs border border-white/60">
                      <UserCheck className="w-4 h-4 text-[#A67C52] shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold text-[#1A1A1A]">Indicação Clínica:</span> {procedure.idealCandidate}
                      </div>
                    </div>
                  )}

                  {procedure.contraindications && (
                    <div className="flex items-start gap-2.5 text-xs text-gray-500 bg-white/40 p-3 rounded-xs border border-white/60">
                      <AlertCircle className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold text-[#1A1A1A]">Contraindicações:</span> {procedure.contraindications}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Bottom: Price Box & Actions */}
            <div className="pt-4 border-t border-gray-100 space-y-4">
              <div className="flex items-center justify-between bg-[#1A1A1A] text-white p-4 rounded-sm border border-white/10 shadow-md">
                <div>
                  <span className="text-[10px] uppercase tracking-widest text-[#C49B74] font-semibold block">
                    Valor de Investimento
                  </span>
                  <div className="flex items-baseline gap-2 font-mono">
                    {hasDiscount && (
                      <span className="text-xs text-gray-400 line-through">
                        {formatBRL(procedure.price)}
                      </span>
                    )}
                    <span className="text-2xl sm:text-3xl font-medium text-white">
                      {formatBRL(hasDiscount ? procedure.promotionalPrice : procedure.price)}
                    </span>
                    {procedure.priceNote && (
                      <span className="text-xs text-[#C49B74] font-sans">
                        ({procedure.priceNote})
                      </span>
                    )}
                  </div>
                </div>

                <div className="hidden sm:block text-right text-[11px] text-gray-400">
                  <p>Condições personalizadas</p>
                  <p className="text-[#C49B74]">Avaliação inclusa</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center gap-2.5">
                <a
                  href={buildSingleProcedureWhatsAppUrl(procedure, clinic)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:flex-1 py-2.5 px-4 rounded-sm bg-[#A67C52] text-white text-xs font-semibold uppercase tracking-widest text-center shadow-xs hover:bg-[#8e6945] active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <MessageCircle className="w-4 h-4" />
                  Agendar no WhatsApp
                </a>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    onClick={() => onShareSingle(procedure)}
                    className="flex-1 sm:flex-none py-2.5 px-4 rounded-sm bg-white/70 border border-white/80 hover:bg-white text-[#1A1A1A] text-xs font-semibold uppercase tracking-wider transition-all shadow-xs flex items-center justify-center gap-1.5"
                    title="Exportar Card Individual"
                  >
                    <Share2 className="w-4 h-4 text-[#A67C52]" />
                    <span>Card</span>
                  </button>

                  <button
                    onClick={() => {
                      onClose();
                      onEdit(procedure);
                    }}
                    className="py-2.5 px-4 rounded-sm bg-white/70 hover:bg-white text-[#1A1A1A] text-xs font-semibold uppercase tracking-wider transition-all border border-white/80 flex items-center justify-center gap-1.5"
                    title="Editar Procedimento"
                  >
                    <Edit3 className="w-4 h-4" />
                    <span>Editar</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

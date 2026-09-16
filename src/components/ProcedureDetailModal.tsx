import React, { useState } from 'react';
import {
  X,
  ArrowLeft,
  Sparkles,
  Clock,
  Calendar,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  MessageCircle,
  Share2,
  Edit3,
  ChevronLeft,
  ChevronRight,
  UserCheck,
} from 'lucide-react';
import { Procedure, ClinicProfile } from '../types';
import { resolverCamposDoLaser } from '../utils/laserAreas';
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
  procedure: procedureBruto,
  clinic,
  isOpen,
  onClose,
  onEdit,
  onShareSingle,
}) => {
  const [activeImgIndex, setActiveImgIndex] = useState(0);

  /**
   * Nas áreas de depilação a laser, os campos deixados em branco vêm dos padrões da categoria
   * (Configurações → Depilação a Laser). Resolver aqui, e não gravar resolvido, é o que permite
   * corrigir uma contraindicação clínica em um lugar só e alcançar as treze áreas.
   */
  const procedure = procedureBruto
    ? resolverCamposDoLaser(procedureBruto, clinic.laserPadroes)
    : null;

  if (!isOpen || !procedure) return null;

  const images = procedure.images && procedure.images.length > 0
    ? procedure.images
    : ['https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=1000&auto=format&fit=crop&q=80'];

  const hasDiscount = procedure.promotionalPrice && procedure.promotionalPrice < procedure.price;
  const doctors = getProcedureDoctors(procedure, clinic);
  const whatsAppUrl = buildSingleProcedureWhatsAppUrl(procedure, clinic);

  const specs = [
    { icon: Clock, label: 'Duração', value: procedure.duration },
    { icon: Calendar, label: 'Recomendação', value: procedure.sessionsRecommended },
    { icon: ShieldCheck, label: 'Downtime', value: procedure.recoveryTime },
  ].filter((s) => s.value);

  return (
    <div className="fixed inset-0 z-50 sm:bg-black/60 sm:backdrop-blur-md sm:flex sm:items-center sm:justify-center sm:p-6 animate-fadeIn">
      <div className="relative w-full h-full sm:h-auto sm:max-w-4xl sm:max-h-[85vh] bg-[#F9F8F6] sm:rounded-2xl overflow-hidden sm:shadow-2xl sm:border sm:border-white/60 flex flex-col">
        {/* ============ MOBILE (<640px): full-screen ============ */}
        <div className="sm:hidden flex-1 overflow-y-auto">
          <div className="relative h-[250px] bg-[#EFEDE7] shrink-0">
            <img
              src={images[activeImgIndex]}
              alt={procedure.title}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
              <button
                onClick={onClose}
                className="w-11 h-11 rounded-full bg-[rgba(26,26,26,.6)] text-white flex items-center justify-center active:scale-95 transition-all"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onShareSingle(procedureBruto!)}
                  className="w-11 h-11 rounded-full bg-[rgba(26,26,26,.6)] text-white flex items-center justify-center active:scale-95 transition-all"
                >
                  <Share2 className="w-[18px] h-[18px]" />
                </button>
                <button
                  onClick={() => {
                    onClose();
                    onEdit(procedureBruto!);
                  }}
                  className="w-11 h-11 rounded-full bg-[rgba(26,26,26,.6)] text-white flex items-center justify-center active:scale-95 transition-all"
                >
                  <Edit3 className="w-[18px] h-[18px]" />
                </button>
              </div>
            </div>
            <div className="absolute inset-x-0 bottom-3 flex items-center justify-between px-4">
              <span className="h-7 px-2.5 rounded-full bg-white/95 text-[#4a4740] text-[11px] font-semibold flex items-center">
                {procedure.category}
              </span>
              {procedure.isFeatured && (
                <span className="h-7 px-2.5 rounded-full bg-[rgba(26,26,26,.85)] text-[#E8CDAC] text-[11px] font-semibold flex items-center">
                  Destaque
                </span>
              )}
            </div>
            {images.length > 1 && (
              <div className="absolute bottom-[-18px] inset-x-0 flex items-center justify-center gap-1.5">
                {images.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveImgIndex(idx)}
                    className={`w-1.5 h-1.5 rounded-full transition-all ${
                      idx === activeImgIndex ? 'bg-[#A67C52] w-4' : 'bg-[rgba(26,26,26,.2)]'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="px-5 pt-7 pb-32">
            <h2 className="font-serif-luxury text-[29px] font-medium text-[#1A1A1A] leading-tight">
              {procedure.title}
            </h2>
            {procedure.subtitle && (
              <p className="text-[14px] text-[#8a8578] mt-1">{procedure.subtitle}</p>
            )}

            {(specs.length > 0 || (doctors && doctors.length > 0)) && (
              <div className="mt-5 bg-white rounded-2xl border border-[rgba(26,26,26,.07)] p-4 space-y-3">
                {specs.map((s) => {
                  const Icon = s.icon;
                  return (
                    <div key={s.label} className="flex items-center gap-3 text-[14px] text-[#4a4740]">
                      <Icon className="w-[18px] h-[18px] text-[#A67C52] shrink-0" />
                      <span className="font-semibold text-[#1A1A1A]">{s.label}:</span> {s.value}
                    </div>
                  );
                })}
                {doctors && doctors.length > 0 && (
                  <div className="pt-3 border-t border-[rgba(26,26,26,.07)]">
                    <p className="text-[12px] font-semibold text-[#A67C52] mb-1.5">
                      {doctors.length > 1 ? 'Profissionais responsáveis' : 'Profissional responsável'}
                    </p>
                    {doctors.map((doc, dIdx) => (
                      <p key={dIdx} className="text-[14px] text-[#1A1A1A] font-medium">{doc.name}</p>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="mt-6">
              <h4 className="text-[15px] font-semibold text-[#1A1A1A] mb-2">Sobre o procedimento</h4>
              <p className="text-[15px] text-[#4a4740] leading-[1.7] whitespace-pre-line">
                {procedure.description}
              </p>
            </div>

            {procedure.benefits && procedure.benefits.length > 0 && (
              <div className="mt-6">
                <h4 className="text-[15px] font-semibold text-[#1A1A1A] mb-2.5 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-[#A67C52]" />
                  Principais benefícios
                </h4>
                <div className="space-y-2">
                  {procedure.benefits.map((benefit, bIdx) => (
                    <div key={bIdx} className="flex items-start gap-2.5 text-[14px] text-[#4a4740]">
                      <CheckCircle2 className="w-4 h-4 text-[#A67C52] shrink-0 mt-0.5" />
                      <span>{benefit}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {procedure.areasTreated && procedure.areasTreated.length > 0 && (
              <div className="mt-6">
                <h4 className="text-[15px] font-semibold text-[#1A1A1A] mb-2.5">Regiões de aplicação</h4>
                <div className="flex flex-wrap gap-2">
                  {procedure.areasTreated.map((area, aIdx) => (
                    <span key={aIdx} className="text-[13px] font-medium px-3 py-1.5 rounded-full bg-white border border-[rgba(26,26,26,.1)] text-[#4a4740]">
                      {area}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {procedure.idealCandidate && (
              <div className="mt-6 flex items-start gap-2.5 text-[14px] text-[#4a4740] bg-[rgba(166,124,82,.07)] p-4 rounded-2xl">
                <UserCheck className="w-[18px] h-[18px] text-[#A67C52] shrink-0 mt-0.5" />
                <div><span className="font-semibold text-[#1A1A1A]">Indicação clínica:</span> {procedure.idealCandidate}</div>
              </div>
            )}

            {procedure.contraindications && (
              <div className="mt-3 flex items-start gap-2.5 text-[14px] text-[#4a4740] bg-white p-4 rounded-2xl border border-[rgba(26,26,26,.07)]">
                <AlertCircle className="w-[18px] h-[18px] text-[#a8a29a] shrink-0 mt-0.5" />
                <div><span className="font-semibold text-[#1A1A1A]">Contraindicações:</span> {procedure.contraindications}</div>
              </div>
            )}
          </div>
        </div>

        {/* Mobile fixed bottom bar */}
        <div className="sm:hidden absolute inset-x-0 bottom-0 bg-[rgba(249,248,246,.92)] backdrop-blur-xl border-t border-[rgba(26,26,26,.07)] px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <span className="block text-[11px] text-[#8a8578]">Investimento</span>
            <div className="flex items-baseline gap-1.5 flex-wrap">
              {procedure.isStartingPrice && (
                <span className="text-[11px] text-[#8a8578] font-medium">a partir de</span>
              )}
              {hasDiscount && (
                <span className="text-[11px] text-[#a8a29a] line-through">
                  {formatBRL(procedure.price)}
                </span>
              )}
              <span className="text-[20px] font-bold text-[#8E653D]">
                {formatBRL(hasDiscount ? procedure.promotionalPrice : procedure.price)}
              </span>
              <span className="text-[12px] text-[#8a8578]">
                {procedure.priceNote || 'por sessão'}
              </span>
            </div>
          </div>
          <a
            href={whatsAppUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 h-[52px] px-5 rounded-2xl bg-[#A67C52] text-white text-[15px] font-semibold active:scale-97 transition-all shrink-0"
          >
            <MessageCircle className="w-[18px] h-[18px]" />
            Agendar
          </a>
        </div>

        {/* ============ TABLET/DESKTOP (≥640px): two columns ============ */}
        <div className="hidden sm:flex sm:flex-col sm:flex-1 sm:min-h-0">
          <div className="bg-[#1A1A1A] text-[#E5E4E0] px-6 py-3.5 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-[#C49B74]">{procedure.category}</span>
              {procedure.isFeatured && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#A67C52] text-white">
                  Destaque
                </span>
              )}
            </div>
            <button
              onClick={onClose}
              className="w-11 h-11 rounded-full flex items-center justify-center text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid sm:grid-cols-12 flex-1 min-h-0 overflow-y-auto">
            {/* Left column */}
            <div className="sm:col-span-5 bg-white/40 p-6 flex flex-col border-b sm:border-b-0 sm:border-r border-[rgba(26,26,26,.07)]">
              <div className="relative h-[212px] rounded-2xl overflow-hidden bg-[#EFEDE7] mb-3">
                <img src={images[activeImgIndex]} alt={procedure.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                {images.length > 1 && (
                  <>
                    <button
                      onClick={() => setActiveImgIndex((p) => (p === 0 ? images.length - 1 : p - 1))}
                      className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-[rgba(26,26,26,.6)] text-white flex items-center justify-center hover:bg-[rgba(26,26,26,.8)] transition-colors"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setActiveImgIndex((p) => (p === images.length - 1 ? 0 : p + 1))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-[rgba(26,26,26,.6)] text-white flex items-center justify-center hover:bg-[rgba(26,26,26,.8)] transition-colors"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </>
                )}
              </div>

              {images.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
                  {images.map((img, idx) => (
                    <button
                      key={idx}
                      onClick={() => setActiveImgIndex(idx)}
                      className={`w-16 h-16 rounded-xl overflow-hidden shrink-0 border-2 transition-all ${
                        activeImgIndex === idx ? 'border-[#A67C52]' : 'border-transparent opacity-70 hover:opacity-100'
                      }`}
                    >
                      <img src={img} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    </button>
                  ))}
                </div>
              )}

              <div className="bg-white rounded-2xl p-4 border border-[rgba(26,26,26,.07)] space-y-2.5">
                {specs.map((s) => {
                  const Icon = s.icon;
                  return (
                    <div key={s.label} className="flex items-center gap-2.5 text-[14px] text-[#4a4740]">
                      <Icon className="w-4 h-4 text-[#A67C52] shrink-0" />
                      <div><span className="font-semibold text-[#1A1A1A]">{s.label}:</span> {s.value}</div>
                    </div>
                  );
                })}

                {doctors && doctors.length > 0 && (
                  <div className="pt-2 border-t border-[rgba(26,26,26,.07)]">
                    <p className="text-[12px] font-semibold text-[#A67C52] mb-1.5">
                      {doctors.length > 1 ? 'Profissionais responsáveis' : 'Profissional responsável'}
                    </p>
                    <div className="space-y-1">
                      {doctors.map((doc, dIdx) => (
                        <p key={dIdx} className="text-[14px] text-[#1A1A1A] font-medium">{doc.name}</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {procedure.areasTreated && procedure.areasTreated.length > 0 && (
                <div className="mt-4 pt-3 border-t border-[rgba(26,26,26,.07)]">
                  <p className="text-[12px] font-semibold text-[#8a8578] mb-2">Regiões de aplicação</p>
                  <div className="flex flex-wrap gap-1.5">
                    {procedure.areasTreated.map((area, aIdx) => (
                      <span key={aIdx} className="text-[12px] font-medium px-2.5 py-1 rounded-full bg-white border border-[rgba(26,26,26,.1)] text-[#4a4740]">
                        {area}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right column */}
            <div className="sm:col-span-7 p-7 lg:p-8 flex flex-col justify-between space-y-6">
              <div className="space-y-5">
                <div>
                  <p className="text-[13px] font-semibold text-[#A67C52] mb-1">
                    {clinic.name} · Protocolo exclusivo
                  </p>
                  <h2 className="font-serif-luxury text-[36px] font-medium text-[#1A1A1A] leading-tight">
                    {procedure.title}
                  </h2>
                  {procedure.subtitle && (
                    <p className="text-[14px] text-[#8a8578] mt-1.5">{procedure.subtitle}</p>
                  )}
                </div>

                <p className="text-[16px] text-[#4a4740] leading-[1.75]" style={{ maxWidth: '62ch' }}>
                  {procedure.description}
                </p>

                {procedure.benefits && procedure.benefits.length > 0 && (
                  <div>
                    <h4 className="text-[14px] font-semibold text-[#1A1A1A] mb-2.5 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-[#A67C52]" />
                      Principais benefícios
                    </h4>
                    <div className="grid grid-cols-2 gap-2.5">
                      {procedure.benefits.map((benefit, bIdx) => (
                        <div key={bIdx} className="flex items-start gap-2 text-[14px] text-[#4a4740] bg-white p-2.5 rounded-xl border border-[rgba(26,26,26,.07)]">
                          <CheckCircle2 className="w-4 h-4 text-[#A67C52] shrink-0 mt-0.5" />
                          <span>{benefit}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(procedure.idealCandidate || procedure.contraindications) && (
                  <div className="space-y-3">
                    {procedure.idealCandidate && (
                      <div className="flex items-start gap-2.5 text-[14px] text-[#4a4740] bg-[rgba(166,124,82,.07)] p-3.5 rounded-xl">
                        <UserCheck className="w-4 h-4 text-[#A67C52] shrink-0 mt-0.5" />
                        <div><span className="font-semibold text-[#1A1A1A]">Indicação clínica:</span> {procedure.idealCandidate}</div>
                      </div>
                    )}
                    {procedure.contraindications && (
                      <div className="flex items-start gap-2.5 text-[14px] text-[#4a4740] bg-white p-3.5 rounded-xl border border-[rgba(26,26,26,.07)]">
                        <AlertCircle className="w-4 h-4 text-[#a8a29a] shrink-0 mt-0.5" />
                        <div><span className="font-semibold text-[#1A1A1A]">Contraindicações:</span> {procedure.contraindications}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Investment block + actions */}
              <div className="pt-4 border-t border-[rgba(26,26,26,.07)] space-y-4">
                <div className="flex items-center justify-between bg-[#1A1A1A] text-white p-5 rounded-2xl">
                  <div>
                    <span className="text-[11px] font-semibold text-[#C49B74] block mb-1">
                      Investimento
                    </span>
                    <div className="flex items-baseline gap-2 flex-wrap">
                      {procedure.isStartingPrice && (
                        <span className="text-[13px] font-medium text-gray-300">
                          a partir de
                        </span>
                      )}
                      {hasDiscount && (
                        <span className="text-[13px] text-gray-400 line-through">{formatBRL(procedure.price)}</span>
                      )}
                      <span className="font-serif-luxury text-[38px] font-medium text-white">
                        {formatBRL(hasDiscount ? procedure.promotionalPrice : procedure.price)}
                      </span>
                      {procedure.priceNote && (
                        <span className="text-[13px] text-[#C49B74] font-medium ml-1">
                          {procedure.priceNote}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right text-[12px] text-gray-400">
                    <p>Condições personalizadas</p>
                    <p className="text-[#C49B74]">Avaliação inclusa</p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <a
                    href={whatsAppUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 h-[50px] rounded-xl bg-[#A67C52] text-white text-[14px] font-semibold flex items-center justify-center gap-2 hover:bg-[#8E653D] active:scale-97 transition-all"
                  >
                    <MessageCircle className="w-4 h-4" />
                    Agendar no WhatsApp
                  </a>
                  <button
                    onClick={() => onShareSingle(procedureBruto!)}
                    className="h-[50px] px-4 rounded-xl bg-white border border-[rgba(26,26,26,.1)] text-[#1A1A1A] text-[14px] font-semibold flex items-center justify-center gap-1.5 hover:border-[#A67C52] transition-all"
                  >
                    <Share2 className="w-4 h-4 text-[#A67C52]" />
                    Enviar card
                  </button>
                  <button
                    onClick={() => {
                      onClose();
                      onEdit(procedureBruto!);
                    }}
                    className="h-[50px] px-4 rounded-xl bg-white border border-[rgba(26,26,26,.1)] text-[#1A1A1A] text-[14px] font-semibold flex items-center justify-center gap-1.5 hover:border-[#A67C52] transition-all"
                  >
                    <Edit3 className="w-4 h-4" />
                    Editar
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

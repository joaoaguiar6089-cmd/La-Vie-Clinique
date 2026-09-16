import React from 'react';
import { Procedure, ClinicProfile } from '../types';
import { formatBRL } from '../utils/formatters';
import { getCatalogPrice, formatDiscountPercent } from '../utils/catalogPricing';
import { getProcedureDoctors, getClinicDoctors } from '../utils/doctorHelpers';
import { Sparkles, Clock, Home, ChevronRight, MessageCircle } from 'lucide-react';
import { ClinicLogo } from './ClinicLogo';
import { buildWhatsAppUrl } from '../utils/whatsapp';

interface PrintableCatalogProps {
  procedures: Procedure[];
  clinic: ClinicProfile;
  selectedCategory?: string;
  showPrices?: boolean;
  /** Desconto promocional aplicado a todos os procedimentos, em % (dias especiais). */
  discountPercent?: number;
}

interface PageGroup {
  pageNumber: number;
  categoryName: string;
  isCover?: boolean;
  procedures: Procedure[];
}

interface ProcedureCardProps {
  proc: Procedure;
  isImageLeft: boolean;
  clinic: ClinicProfile;
  showPrices: boolean;
  discountPercent: number;
}

const HorizontalProcedureCard: React.FC<ProcedureCardProps> = ({
  proc,
  isImageLeft,
  clinic,
  showPrices,
  discountPercent,
}) => {
  const imgUrl =
    proc.images && proc.images.length > 0
      ? proc.images[0]
      : 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=1000&auto=format&fit=crop&q=80';
  const { strikePrice, finalPrice, hasDiscount } = getCatalogPrice(proc, discountPercent);
  const isPromoDay = discountPercent > 0;

  const imageElement = (
    <div className="relative w-[280px] h-[430px] bg-[#F0EFEA] overflow-hidden shrink-0">
      <img
        src={imgUrl}
        alt={proc.title}
        className="w-full h-full object-cover block"
        referrerPolicy="no-referrer"
      />
      <div className="absolute top-3.5 left-3.5 px-3 py-1 rounded-sm bg-[#1A1A1C]/90 text-[#D8A47F] text-[10px] font-bold uppercase tracking-wider shadow-sm">
        {proc.category}
      </div>
      {hasDiscount && (
        <div className="absolute top-3.5 right-3.5 px-2.5 py-1 rounded-sm bg-[#B88358] text-white text-[10px] font-bold uppercase tracking-wider shadow-sm">
          {isPromoDay ? `-${formatDiscountPercent(discountPercent)}% OFF` : 'Especial'}
        </div>
      )}
    </div>
  );

  const contentElement = (
    <div className="flex-1 h-[430px] p-6 sm:p-7 flex flex-col justify-between bg-white box-border">
      {/* Upper Information Block */}
      <div>
        {/* Category & Duration header */}
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <span className="text-[11px] font-bold uppercase tracking-widest text-[#9C663D]">
            {proc.category}
          </span>
          {proc.duration && (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#71717A] bg-[#FAF9F5] px-2.5 py-0.5 rounded border border-[#E8E6DE]">
              <Clock className="w-3.5 h-3.5 text-[#B88358]" />
              {proc.duration}
            </span>
          )}
        </div>

        {/* Title & Subtitle with guaranteed separation and generous line-height */}
        <div className="mb-3">
          <h3
            className="font-serif-luxury text-[20px] font-bold text-[#1A1A1C] leading-[1.3] mb-1.5 block"
            style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
          >
            {proc.title}
          </h3>
          {proc.subtitle && (
            <p className="text-xs text-[#8A8985] italic leading-normal block">
              {proc.subtitle}
            </p>
          )}
        </div>

        {/* Description */}
        <p className="text-xs text-[#52525B] leading-relaxed mb-3 line-clamp-3">
          {proc.description}
        </p>

        {/* Benefits Highlights */}
        {proc.benefits && proc.benefits.length > 0 && (
          <div className="space-y-1.5 mb-2">
            {proc.benefits.slice(0, 2).map((benefit, bIdx) => (
              <div key={bIdx} className="flex items-start gap-2 text-[11px] text-[#3F3F46] leading-snug">
                <Sparkles className="w-3.5 h-3.5 text-[#B88358] shrink-0 mt-0.5" />
                <span className="line-clamp-1">{benefit}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Doctor & Price Footer */}
      <div className="pt-3 border-t border-[#E8E6DE] flex items-end justify-between gap-4">
        {/* Doctor Assigned (Name & Specialty Only) */}
        <div className="min-w-0 flex-1">
          {(() => {
            const doctors = getProcedureDoctors(proc, clinic);
            return (
              <div className="text-[11px] text-[#71717A] leading-tight">
                <span className="text-[#8A8985] block mb-0.5 font-medium text-[10px]">
                  {doctors.length > 1 ? 'Corpo Clínico:' : 'Profissional:'}
                </span>
                <div className="space-y-0.5">
                  {doctors.map((doc, idx) => (
                    <div key={idx} className="truncate">
                      <strong className="text-[#1A1A1C] font-semibold text-[11px] block truncate">
                        {doc.name}
                      </strong>
                      {doc.specialty && (
                        <span className="text-[10px] text-[#71717A] block truncate font-medium">
                          {doc.specialty}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Price Tag with Safe Margins */}
        {showPrices && (
          <div className="text-right shrink-0 pr-1">
            {proc.isStartingPrice && (
              <span className="block text-[10px] text-[#8A8985] font-medium uppercase tracking-wider">
                a partir de
              </span>
            )}
            {strikePrice !== null && (
              <div className="flex items-center justify-end gap-1.5 leading-none mb-0.5">
                <span className="text-sm text-[#A0A0A5] line-through">
                  {formatBRL(strikePrice)}
                </span>
                {isPromoDay && (
                  <span className="px-1.5 py-0.5 rounded-xs bg-[#B88358] text-white text-[9px] font-bold tracking-wider">
                    -{formatDiscountPercent(discountPercent)}%
                  </span>
                )}
              </div>
            )}
            <div className="flex items-baseline justify-end">
              <span
                className={`font-serif-luxury text-2xl font-bold tracking-tight whitespace-nowrap ${
                  hasDiscount ? 'text-[#9C663D]' : 'text-[#1A1A1C]'
                }`}
                style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
              >
                {formatBRL(finalPrice)}
              </span>
            </div>
            {proc.priceNote ? (
              <span className="text-[10px] text-[#8A8985] block text-right mt-0.5">
                {proc.priceNote}
              </span>
            ) : (
              <span className="text-[10px] text-[#A0A0A5] block text-right mt-0.5">
                por sessão
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="bg-white rounded-xl border border-[#E8E6DE] shadow-xs overflow-hidden flex flex-row w-full h-[430px] box-border">
      {isImageLeft ? (
        <>
          {imageElement}
          {contentElement}
        </>
      ) : (
        <>
          {contentElement}
          {imageElement}
        </>
      )}
    </div>
  );
};

export const PrintableCatalog: React.FC<PrintableCatalogProps> = ({
  procedures,
  clinic,
  selectedCategory = 'Todos',
  showPrices = true,
  discountPercent = 0,
}) => {
  const filteredProcedures = selectedCategory === 'Todos'
    ? procedures
    : procedures.filter(p => p.category === selectedCategory);

  // Group procedures into distinct categories
  const categoriesList: string[] = Array.from(new Set(filteredProcedures.map(p => p.category)));

  // Calculate pages:
  // Page 1 is always the Cover & Interactive Menu / Sumário
  // Subsequent pages contain 2 alternating horizontal procedure cards per page
  const pages: PageGroup[] = [];
  const categoryPageMap: Record<string, number> = {};

  // Page 1: Cover
  pages.push({
    pageNumber: 1,
    categoryName: 'Sumário',
    isCover: true,
    procedures: [],
  });

  let currentPageNum = 2;

  // Build page groups category by category
  categoriesList.forEach((catName) => {
    categoryPageMap[catName] = currentPageNum;
    const catProcedures = filteredProcedures.filter(p => p.category === catName);

    for (let i = 0; i < catProcedures.length; i += 2) {
      const pageProcs = catProcedures.slice(i, i + 2);
      pages.push({
        pageNumber: currentPageNum,
        categoryName: catName,
        isCover: false,
        procedures: pageProcs,
      });
      currentPageNum++;
    }
  });

  const totalPages = pages.length;

  // Retrieve clinic doctors (names & specialties without professional registry)
  const clinicDoctors = getClinicDoctors(clinic);

  const whatsAppUrl =
    buildWhatsAppUrl(clinic.phone, 'Olá! Acessei o catálogo de procedimentos e gostaria de tirar dúvidas e agendar um horário.') ||
    (clinic.phone ? `https://wa.me/55${clinic.phone.replace(/\D/g, '')}` : 'https://wa.me/');

  const instagramUrl = clinic.instagram
    ? `https://instagram.com/${clinic.instagram.trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '')}`
    : 'https://instagram.com';

  return (
    <div id="printable-catalog-root" className="w-full flex flex-col gap-10 items-start sm:items-center justify-center font-sans bg-[#E5E3DD] p-4 sm:p-8">
      {pages.map((page) => {
        if (page.isCover) {
          // ====================================================
          // PAGE 1: COVER & INTERACTIVE TABLE OF CONTENTS (SUMÁRIO)
          // ====================================================
          return (
            <div
              key="page-1"
              data-pdf-page="1"
              id="catalog-page-1"
              className="relative bg-[#F8F7F4] text-[#1A1A1C] p-10 sm:p-12 shadow-2xl rounded-xs border border-[#E0DED7] flex flex-col justify-between"
              style={{
                width: '794px',
                minWidth: '794px',
                maxWidth: '794px',
                height: '1123px',
                minHeight: '1123px',
                maxHeight: '1123px',
                boxSizing: 'border-box',
              }}
            >
              {/* Top Accent Line */}
              <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-[#8C5D38] via-[#B88358] to-[#D8A47F]" />

              {/* Cover Header */}
              <div>
                <div className="flex items-center justify-between border-b border-[#B88358]/40 pb-6 mb-7">
                  <div className="flex items-center gap-4">
                    <ClinicLogo
                      clinic={clinic}
                      className="w-16 h-16 rounded-xs shadow-md shrink-0"
                      monogramClassName="bg-[#1A1A1C] border-2 border-[#B88358] text-[#D8A47F] font-serif-luxury text-3xl font-bold"
                    />
                    <div>
                      <div className="inline-block px-2.5 py-0.5 rounded-xs bg-[#1A1A1C] text-[#D8A47F] text-[10px] uppercase font-bold tracking-widest mb-1">
                        Catálogo Exclusivo
                      </div>
                      <h1
                        className="font-serif-luxury text-3xl font-bold text-[#1A1A1C] tracking-tight leading-none"
                        style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
                      >
                        {clinic.name}
                      </h1>
                      <p className="text-xs text-[#8A8985] tracking-widest uppercase font-medium mt-1">
                        {clinic.tagline}
                      </p>
                    </div>
                  </div>

                  {/* Doctor Info (Name & Specialty Only) */}
                  <div className="text-right shrink-0 max-w-[280px]">
                    <span className="text-[10px] text-[#8A8985] uppercase tracking-widest block font-medium">
                      {clinicDoctors.length > 1 ? 'Corpo Clínico:' : 'Responsável Técnica:'}
                    </span>
                    <div className="space-y-1 mt-0.5">
                      {clinicDoctors.map((doc, idx) => (
                        <div key={idx}>
                          <span
                            className="text-sm font-bold text-[#9C663D] uppercase tracking-wider block leading-tight"
                          >
                            {doc.name}
                          </span>
                          {doc.specialty && (
                            <span className="text-[10px] text-[#71717A] uppercase tracking-wider block mt-0.5 font-medium leading-snug">
                              {doc.specialty}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Editorial Introduction Box */}
                <div className="bg-white p-5 rounded-lg border border-[#E8E6DE] shadow-xs mb-7">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-4 h-4 text-[#B88358]" />
                    <span className="text-xs font-bold uppercase tracking-wider text-[#9C663D]">
                      Apresentação Clínica
                    </span>
                  </div>
                  <p className="text-xs text-[#52525B] leading-relaxed italic">
                    "{clinic.catalogWelcomeNote || 'Nossos protocolos são cuidadosamente desenhados para proporcionar resultados estéticos refinados com máximo conforto, segurança e respaldo técnico de padrão ouro.'}"
                  </p>
                </div>

                {/* PROMO BANNER — só aparece quando há desconto geral no catálogo */}
                {discountPercent > 0 && (
                  <div className="mb-7 rounded-lg border-2 border-[#B88358] bg-[#1A1A1C] px-5 py-4 flex items-center justify-between gap-4 shadow-sm">
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-[#D8A47F] block">
                        Condição Especial por Tempo Limitado
                      </span>
                      <p
                        className="font-serif-luxury text-xl font-bold text-white leading-tight mt-0.5"
                        style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
                      >
                        {formatDiscountPercent(discountPercent)}% de desconto em todos os procedimentos
                      </p>
                      <p className="text-[10px] text-[#A0A0A5] mt-1 leading-snug">
                        Os valores deste catálogo já estão com o desconto aplicado — o preço de tabela
                        aparece riscado acima de cada valor promocional.
                      </p>
                    </div>
                    <div className="shrink-0 w-[92px] h-[92px] rounded-full bg-[#B88358] flex flex-col items-center justify-center text-white shadow-md">
                      <span
                        className="font-serif-luxury text-3xl font-bold leading-none"
                        style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
                      >
                        -{formatDiscountPercent(discountPercent)}%
                      </span>
                      <span className="text-[9px] font-bold uppercase tracking-widest mt-1">OFF</span>
                    </div>
                  </div>
                )}

                {/* CLINICAL TEAM - horizontal cards in the same format as procedure cards (photo + name/subtitle) */}
                {clinicDoctors.length > 0 && (
                  <div className="mb-7 pb-6 border-b border-[#E8E6DE]">
                    <div className="flex items-center gap-2.5 mb-3.5">
                      <span className="w-3 h-3 rounded-full bg-[#B88358] shadow-xs" />
                      <h2
                        className="font-serif-luxury text-lg font-bold text-[#1A1A1C] tracking-tight"
                        style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
                      >
                        {clinicDoctors.length > 1 ? 'Corpo Clínico Responsável' : 'Responsável Técnica'}
                      </h2>
                    </div>

                    <div className={clinicDoctors.length > 1 ? 'grid grid-cols-2 gap-4' : 'flex justify-center'}>
                      {clinicDoctors.map((doc, idx) => {
                        const isPhotoLeft = idx % 2 === 0;
                        const initials = doc.name.replace(/[^A-Za-zÀ-ÿ]/g, '').slice(0, 2).toUpperCase() || 'DR';

                        const photoBlock = (
                          <div className="relative w-[92px] h-[104px] bg-[#F0EFEA] overflow-hidden shrink-0">
                            {doc.photoUrl ? (
                              <img
                                src={doc.photoUrl}
                                alt={doc.name}
                                className="w-full h-full object-cover block"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[#D8A47F] font-serif-luxury text-xl font-bold bg-[#1A1A1C]">
                                {initials}
                              </div>
                            )}
                          </div>
                        );

                        const textBlock = (
                          <div className="flex-1 h-[104px] px-4 flex flex-col justify-center min-w-0 bg-white">
                            <p
                              className="font-serif-luxury text-[15px] font-bold text-[#1A1A1C] leading-snug truncate"
                              style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
                            >
                              {doc.name}
                            </p>
                            {doc.specialty && (
                              <p className="text-[11px] text-[#8A8985] italic leading-snug line-clamp-2 mt-0.5">
                                {doc.specialty}
                              </p>
                            )}
                          </div>
                        );

                        return (
                          <div
                            key={idx}
                            className={`flex flex-row items-stretch h-[104px] bg-white rounded-lg border border-[#E8E6DE] shadow-xs overflow-hidden ${
                              clinicDoctors.length === 1 ? 'w-[360px]' : ''
                            }`}
                          >
                            {isPhotoLeft ? (
                              <>
                                {photoBlock}
                                {textBlock}
                              </>
                            ) : (
                              <>
                                {textBlock}
                                {photoBlock}
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* INTERACTIVE TABLE OF CONTENTS / SUMÁRIO */}
                <div>
                  <div className="flex items-center justify-between mb-4 pb-2.5 border-b border-[#E8E6DE]">
                    <div className="flex items-center gap-2.5">
                      <span className="w-3 h-3 rounded-full bg-[#B88358] shadow-xs" />
                      <h2
                        className="font-serif-luxury text-2xl font-bold text-[#1A1A1C] tracking-tight"
                        style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
                      >
                        Sumário Interativo de Categorias
                      </h2>
                    </div>
                    <span className="text-xs text-[#8A8985] uppercase tracking-wider font-semibold">
                      Clique para navegar
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3.5">
                    {categoriesList.map((catName) => {
                      const targetPage = categoryPageMap[catName] || 2;
                      const countInCat = filteredProcedures.filter(p => p.category === catName).length;

                      return (
                        <a
                          key={catName}
                          href={`#catalog-page-${targetPage}`}
                          data-link-page={targetPage}
                          className="group flex items-center justify-between p-4 bg-white hover:bg-[#FAF9F5] active:bg-[#F2EFEB] rounded-xl border border-[#E8E6DE] hover:border-[#B88358] shadow-xs hover:shadow-md transition-all cursor-pointer no-underline text-[#1A1A1C]"
                        >
                          <div className="flex items-center gap-3 min-w-0 pr-2">
                            <span className="w-8 h-8 rounded-full bg-[#FAF9F5] group-hover:bg-[#1A1A1C] text-[#9C663D] group-hover:text-[#D8A47F] border border-[#E8E6DE] flex items-center justify-center text-xs font-bold transition-colors shrink-0 shadow-2xs">
                              {targetPage}
                            </span>
                            <div className="min-w-0">
                              <h3 className="text-[14px] font-bold text-[#1A1A1C] group-hover:text-[#9C663D] transition-colors leading-tight truncate">
                                {catName}
                              </h3>
                              <span className="text-xs text-[#71717A] block truncate mt-0.5 font-medium">
                                {countInCat} {countInCat === 1 ? 'procedimento' : 'procedimentos'}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 text-[#B88358] group-hover:text-[#8C5D38] group-hover:translate-x-0.5 transition-all shrink-0 bg-[#FAF9F5] px-2.5 py-1 rounded-md border border-[#E8E6DE]">
                            <span className="text-xs font-bold tracking-wider uppercase">
                              Pág. {targetPage}
                            </span>
                            <ChevronRight className="w-4 h-4" />
                          </div>
                        </a>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Cover Page Footer */}
              <div className="pt-5 border-t border-[#E8E6DE] flex items-center justify-between gap-3 text-xs text-[#71717A]">
                <div>
                  <p className="font-semibold text-[#1A1A1C]">📍 {clinic.address} • {clinic.cityState}</p>
                  <div className="text-[11px] text-[#8A8985] mt-1 flex items-center flex-wrap gap-x-2">
                    <span>📱 Agendamentos: <strong className="text-[#1A1A1C]">{clinic.phone}</strong></span>
                    <a
                      href={whatsAppUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-link-url={whatsAppUrl}
                      className="inline-flex items-center gap-1 font-semibold text-[#1A1A1C] hover:text-[#25D366] transition-colors"
                      title="Falar no WhatsApp"
                    >
                      <span className="underline underline-offset-2">entre em contato</span>
                      <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-[#25D366] text-white shadow-2xs shrink-0">
                        <MessageCircle className="w-2.5 h-2.5 fill-current" />
                      </span>
                    </a>
                    <span className="text-[#D0CECB]">|</span>
                    <span>
                      Instagram:{' '}
                      <a
                        href={instagramUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-link-url={instagramUrl}
                        className="font-bold text-[#1A1A1C] underline decoration-[#1A1A1C]/50 hover:text-[#B88358] transition-colors cursor-pointer"
                        title="Abrir Instagram da clínica"
                      >
                        {clinic.instagram}
                      </a>
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="inline-block px-3 py-1 bg-[#1A1A1C] text-[#D8A47F] text-[10px] font-bold uppercase tracking-widest rounded-xs">
                    Página 1 de {totalPages}
                  </span>
                </div>
              </div>
            </div>
          );
        }

        // ====================================================
        // PAGES 2..N: ALTERNATING HORIZONTAL PROCEDURES
        // ====================================================
        return (
          <div
            key={`page-${page.pageNumber}`}
            data-pdf-page={page.pageNumber}
            id={`catalog-page-${page.pageNumber}`}
            className="relative bg-[#F8F7F4] text-[#1A1A1C] p-10 shadow-2xl rounded-xs border border-[#E0DED7] flex flex-col justify-between"
            style={{
              width: '794px',
              minWidth: '794px',
              maxWidth: '794px',
              height: '1123px',
              minHeight: '1123px',
              maxHeight: '1123px',
              boxSizing: 'border-box',
            }}
          >
            {/* Top Accent Line */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#B88358]" />

            {/* Interior Page Header */}
            <div>
              <div className="flex items-center justify-between border-b border-[#E8E6DE] pb-3 mb-5">
                <div className="flex items-center gap-3">
                  <a
                    href="#catalog-page-1"
                    data-link-page="1"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white hover:bg-[#1A1A1C] text-[#9C663D] hover:text-[#D8A47F] border border-[#E8E6DE] text-[10px] font-bold uppercase tracking-wider transition-all no-underline shadow-2xs"
                  >
                    <Home className="w-3 h-3" />
                    <span>Sumário</span>
                  </a>
                  <span className="text-xs font-bold text-[#1A1A1C] uppercase tracking-wider">
                    {page.categoryName}
                  </span>
                </div>

                <div className="text-right flex items-center gap-3">
                  <span className="text-[10px] text-[#8A8985] uppercase tracking-wider">
                    {clinic.name}
                  </span>
                  <span className="px-2 py-0.5 bg-[#1A1A1C] text-[#D8A47F] text-[10px] font-bold rounded-xs">
                    Pág. {page.pageNumber} / {totalPages}
                  </span>
                </div>
              </div>

              {/* 2 Alternating Horizontal Procedures */}
              <div className="flex flex-col gap-5">
                {page.procedures.map((proc, index) => (
                  <HorizontalProcedureCard
                    key={proc.id || index}
                    proc={proc}
                    isImageLeft={index % 2 === 0}
                    clinic={clinic}
                    showPrices={showPrices}
                    discountPercent={discountPercent}
                  />
                ))}
              </div>
            </div>

            {/* Interior Page Footer */}
            <div className="pt-3 border-t border-[#E8E6DE] flex items-center justify-between gap-2 text-[11px] text-[#71717A]">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span>📱 {clinic.phone}</span>
                <a
                  href={whatsAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-link-url={whatsAppUrl}
                  className="inline-flex items-center gap-1 font-semibold text-[#1A1A1C] hover:text-[#25D366] transition-colors"
                  title="Falar no WhatsApp"
                >
                  <span className="underline underline-offset-2">entre em contato</span>
                  <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-[#25D366] text-white shadow-2xs shrink-0">
                    <MessageCircle className="w-2.5 h-2.5 fill-current" />
                  </span>
                </a>
                <span className="text-[#D0CECB]">|</span>
                <a
                  href={instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-link-url={instagramUrl}
                  className="inline-flex items-center gap-1 font-semibold text-[#1A1A1C] hover:text-[#B88358] transition-colors cursor-pointer"
                  title="Abrir Instagram da clínica"
                >
                  <span>📸</span>
                  <span className="underline decoration-[#1A1A1C]/50">{clinic.instagram}</span>
                </a>
              </div>
              <div className="flex items-center gap-3">
                <a
                  href="#catalog-page-1"
                  data-link-page="1"
                  className="text-[#9C663D] hover:underline font-semibold flex items-center gap-1"
                >
                  <Home className="w-3 h-3" />
                  <span>Voltar ao Sumário</span>
                </a>
                <span className="text-[#A0A0A5]">|</span>
                <span className="font-bold text-[#1A1A1C]">
                  Página {page.pageNumber} de {totalPages}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

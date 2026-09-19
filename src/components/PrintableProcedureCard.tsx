import React from 'react';
import {
  Sparkles,
  Clock,
  Calendar,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  UserCheck,
  MessageCircle,
  Instagram,
  MapPin,
} from 'lucide-react';
import { Procedure, ClinicProfile } from '../types';
import { resolverCamposDoLaser } from '../utils/laserAreas';
import { formatBRL } from '../utils/formatters';
import { getCatalogPrice, formatDiscountPercent } from '../utils/catalogPricing';
import { getProcedureDoctors } from '../utils/doctorHelpers';
import { buildSingleProcedureWhatsAppUrl } from '../utils/exportHelpers';
import { ClinicLogo } from './ClinicLogo';

const IMAGEM_PADRAO =
  'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=1000&auto=format&fit=crop&q=80';

interface PrintableProcedureCardProps {
  procedure: Procedure;
  clinic: ClinicProfile;
  /** Desconto promocional aplicado no momento da geração (dias especiais), em %. */
  discountPercent?: number;
}

/**
 * Card de um procedimento em folha A4, no mesmo desenho da tela de "Detalhes" do catálogo:
 * faixa escura com a categoria, coluna da esquerda com foto/ficha técnica/regiões e coluna da
 * direita com descrição, benefícios e o bloco de investimento.
 *
 * É a mesma página que a equipe acabou de ler na tela que vai para a paciente — o que dispensa
 * conferir se o card "bate" com o detalhe antes de enviar. A barra de ações do modal (Agendar /
 * Enviar / Editar) ocupa aqui o mesmo lugar, virando os contatos da clínica, porque num PDF um
 * botão não clica — mas o WhatsApp vira link de verdade via `data-link-url`.
 *
 * A altura é fixa em uma folha (794x1123 = A4 a 96dpi): `exportElementAsPDF` encaixa cada
 * `[data-pdf-page]` numa página inteira, então um conteúdo mais alto sairia esticado. Os textos
 * longos são cortados por `line-clamp` em vez de empurrar a folha.
 */
export const PrintableProcedureCard: React.FC<PrintableProcedureCardProps> = ({
  procedure: procedureBruto,
  clinic,
  discountPercent = 0,
}) => {
  // Mesma resolução de padrões da tela de detalhes: nas áreas de laser os campos em branco vêm
  // das Configurações, e o card precisa mostrar o que a tela mostrou.
  const procedure = resolverCamposDoLaser(procedureBruto, clinic.laserPadroes);

  const images = procedure.images && procedure.images.length > 0 ? procedure.images : [IMAGEM_PADRAO];
  const doctors = getProcedureDoctors(procedure, clinic);
  const { strikePrice, finalPrice } = getCatalogPrice(procedure, discountPercent);
  const isPromoDay = discountPercent > 0;
  const whatsAppUrl = buildSingleProcedureWhatsAppUrl(procedure, clinic, discountPercent);

  // Várias clínicas preenchem `address` já com a cidade; repetir viraria "Indaiatuba - SP · Indaiatuba - SP".
  const endereco = [clinic.address, clinic.cityState]
    .map((parte) => parte?.trim())
    .filter((parte, idx, todas) => !!parte && todas.indexOf(parte) === idx)
    .join(' · ');

  const specs = [
    { icon: Clock, label: 'Duração', value: procedure.duration },
    { icon: Calendar, label: 'Recomendação', value: procedure.sessionsRecommended },
    { icon: ShieldCheck, label: 'Downtime', value: procedure.recoveryTime },
  ].filter((s) => s.value);

  return (
    <div id="printable-single-card" className="font-sans">
      <div
        data-pdf-page="1"
        className="relative bg-[#F9F8F6] text-[#1A1A1A] overflow-hidden flex flex-col shadow-2xl"
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
        {/* Faixa superior — categoria e marca, no lugar do cabeçalho do modal */}
        <div className="bg-[#1A1A1A] text-[#E5E4E0] px-7 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-[#C49B74] uppercase tracking-wider">
              {procedure.category}
            </span>
            {procedure.isFeatured && (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#A67C52] text-white">
                Destaque
              </span>
            )}
            {isPromoDay && (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#C49B74] text-[#1A1A1A]">
                -{formatDiscountPercent(discountPercent)}% OFF
              </span>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            <span className="text-[12px] font-semibold text-[#E5E4E0] tracking-wide">{clinic.name}</span>
            <ClinicLogo
              clinic={clinic}
              className="w-9 h-9 rounded-full shrink-0"
              monogramClassName="bg-[#A67C52] text-white font-serif-luxury text-sm font-bold"
            />
          </div>
        </div>

        <div className="grid grid-cols-12 flex-1 min-h-0">
          {/* Coluna esquerda — foto, ficha técnica e regiões */}
          <div className="col-span-5 bg-[#FCFBFA] p-6 flex flex-col border-r border-[rgba(26,26,26,.07)] overflow-hidden">
            <div className="relative h-[240px] rounded-2xl overflow-hidden bg-[#EFEDE7] mb-3 shrink-0">
              <img
                src={images[0]}
                alt={procedure.title}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>

            {images.length > 1 && (
              <div className="flex gap-2 mb-4 shrink-0">
                {images.slice(1, 5).map((img, idx) => (
                  <div key={idx} className="w-16 h-16 rounded-xl overflow-hidden shrink-0">
                    <img src={img} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  </div>
                ))}
              </div>
            )}

            {(specs.length > 0 || doctors.length > 0) && (
              <div className="bg-white rounded-2xl p-4 border border-[rgba(26,26,26,.07)] space-y-2.5">
                {specs.map((s) => {
                  const Icon = s.icon;
                  return (
                    <div key={s.label} className="flex items-start gap-2.5 text-[13px] text-[#4a4740]">
                      <Icon className="w-4 h-4 text-[#A67C52] shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold text-[#1A1A1A]">{s.label}:</span> {s.value}
                      </div>
                    </div>
                  );
                })}

                {doctors.length > 0 && (
                  <div className="pt-2.5 border-t border-[rgba(26,26,26,.07)]">
                    <p className="text-[11px] font-semibold text-[#A67C52] mb-1.5 uppercase tracking-wider">
                      {doctors.length > 1 ? 'Profissionais responsáveis' : 'Profissional responsável'}
                    </p>
                    <div className="space-y-1">
                      {doctors.map((doc, dIdx) => (
                        <p key={dIdx} className="text-[13px] text-[#1A1A1A] font-medium leading-tight">
                          {doc.name}
                          {doc.specialty && (
                            <span className="block text-[11px] text-[#8a8578] font-normal">{doc.specialty}</span>
                          )}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {procedure.areasTreated && procedure.areasTreated.length > 0 && (
              <div className="mt-4 pt-3 border-t border-[rgba(26,26,26,.07)]">
                <p className="text-[11px] font-semibold text-[#8a8578] mb-2 uppercase tracking-wider">
                  Regiões de aplicação
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {procedure.areasTreated.slice(0, 14).map((area, aIdx) => (
                    <span
                      key={aIdx}
                      className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-white border border-[rgba(26,26,26,.1)] text-[#4a4740]"
                    >
                      {area}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Coluna direita — texto do procedimento e investimento */}
          <div className="col-span-7 p-7 flex flex-col justify-between gap-5 min-h-0">
            <div className="space-y-4 min-h-0 overflow-hidden">
              <div>
                <p className="text-[12px] font-semibold text-[#A67C52] mb-1 uppercase tracking-wider">
                  {clinic.name} · Protocolo exclusivo
                </p>
                <h2 className="font-serif-luxury text-[34px] font-medium text-[#1A1A1A] leading-tight">
                  {procedure.title}
                </h2>
                {procedure.subtitle && (
                  <p className="text-[13px] text-[#8a8578] mt-1.5">{procedure.subtitle}</p>
                )}
              </div>

              <p className="text-[14px] text-[#4a4740] leading-[1.7] line-clamp-[10] whitespace-pre-line">
                {procedure.description}
              </p>

              {procedure.benefits && procedure.benefits.length > 0 && (
                <div>
                  <h4 className="text-[13px] font-semibold text-[#1A1A1A] mb-2 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-[#A67C52]" />
                    Principais benefícios
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    {procedure.benefits.slice(0, 6).map((benefit, bIdx) => (
                      <div
                        key={bIdx}
                        className="flex items-start gap-2 text-[12px] text-[#4a4740] bg-white p-2.5 rounded-xl border border-[rgba(26,26,26,.07)]"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#A67C52] shrink-0 mt-0.5" />
                        <span className="line-clamp-3">{benefit}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(procedure.idealCandidate || procedure.contraindications) && (
                <div className="space-y-2.5">
                  {procedure.idealCandidate && (
                    <div className="flex items-start gap-2.5 text-[12px] text-[#4a4740] bg-[rgba(166,124,82,.07)] p-3 rounded-xl">
                      <UserCheck className="w-4 h-4 text-[#A67C52] shrink-0 mt-0.5" />
                      <div className="line-clamp-3">
                        <span className="font-semibold text-[#1A1A1A]">Indicação clínica:</span>{' '}
                        {procedure.idealCandidate}
                      </div>
                    </div>
                  )}
                  {procedure.contraindications && (
                    <div className="flex items-start gap-2.5 text-[12px] text-[#4a4740] bg-white p-3 rounded-xl border border-[rgba(26,26,26,.07)]">
                      <AlertCircle className="w-4 h-4 text-[#a8a29a] shrink-0 mt-0.5" />
                      <div className="line-clamp-3">
                        <span className="font-semibold text-[#1A1A1A]">Contraindicações:</span>{' '}
                        {procedure.contraindications}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Investimento + contatos (mesmo lugar da barra de ações do modal) */}
            <div className="pt-4 border-t border-[rgba(26,26,26,.07)] space-y-3 shrink-0">
              <div className="flex items-center justify-between bg-[#1A1A1A] text-white p-5 rounded-2xl">
                <div>
                  <span className="text-[10px] font-semibold text-[#C49B74] block mb-1 uppercase tracking-widest">
                    Investimento
                  </span>
                  <div className="flex items-baseline gap-2 flex-wrap">
                    {procedure.isStartingPrice && (
                      <span className="text-[12px] font-medium text-gray-300">a partir de</span>
                    )}
                    {strikePrice !== null && (
                      <span className="text-[13px] text-gray-400 line-through">{formatBRL(strikePrice)}</span>
                    )}
                    <span className="font-serif-luxury text-[34px] font-medium text-white leading-none">
                      {formatBRL(finalPrice)}
                    </span>
                    {procedure.priceNote && (
                      <span className="text-[12px] text-[#C49B74] font-medium ml-1">{procedure.priceNote}</span>
                    )}
                  </div>
                </div>
                <div className="text-right text-[11px] text-gray-400 shrink-0">
                  <p>Condições personalizadas</p>
                  <p className="text-[#C49B74]">Avaliação inclusa</p>
                </div>
              </div>

              <div
                data-link-url={whatsAppUrl}
                className="h-[46px] rounded-xl bg-[#A67C52] text-white text-[14px] font-semibold flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <MessageCircle className="w-4 h-4 shrink-0" />
                Agende pelo WhatsApp · {clinic.phone}
              </div>

              <p className="flex items-center justify-center gap-4 text-[11px] text-[#8a8578]">
                {clinic.instagram && (
                  <span className="inline-flex items-center gap-1">
                    <Instagram className="w-3 h-3 text-[#A67C52]" />
                    {clinic.instagram}
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-[#A67C52]" />
                  {endereco}
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

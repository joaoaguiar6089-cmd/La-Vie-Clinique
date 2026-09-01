import React, { useState, useRef } from 'react';
import { X, FileDown, Image as ImageIcon, MessageCircle, QrCode, Copy, Check, Sparkles, Share2, Layers, Download, Loader2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import confetti from 'canvas-confetti';
import { Procedure, ClinicProfile } from '../types';
import { exportElementAsPDF, exportElementAsImage, buildWhatsAppCatalogShareUrl } from '../utils/exportHelpers';
import { PrintableCatalog } from './PrintableCatalog';
import { PrintableCard } from './PrintableCard';

interface ShareExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  procedures: Procedure[];
  clinic: ClinicProfile;
  categories: string[];
  singleProcedureToExport?: Procedure | null;
}

export const ShareExportModal: React.FC<ShareExportModalProps> = ({
  isOpen,
  onClose,
  procedures,
  clinic,
  categories,
  singleProcedureToExport,
}) => {
  if (!isOpen) return null;

  const [activeTab, setActiveTab] = useState<'pdf' | 'image' | 'single-card' | 'whatsapp' | 'qrcode'>(
    singleProcedureToExport ? 'single-card' : 'pdf'
  );
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [showPrices, setShowPrices] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [selectedSingleProcedureId, setSelectedSingleProcedureId] = useState<string>(
    singleProcedureToExport ? singleProcedureToExport.id : (procedures[0]?.id || '')
  );

  const catalogPrintRef = useRef<HTMLDivElement>(null);
  const singleCardPrintRef = useRef<HTMLDivElement>(null);

  const activeSingleProcedure = procedures.find(p => p.id === selectedSingleProcedureId) || procedures[0];

  const triggerConfetti = () => {
    try {
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.7 },
        colors: ['#B88358', '#D8A47F', '#1A1A1C', '#E5E4E0'],
      });
    } catch {
      // ignore
    }
  };

  const handleExportPDF = async () => {
    const el = document.getElementById('printable-catalog-root');
    if (!el) return;
    setIsExporting(true);
    try {
      const sanitizedName = clinic.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
      await exportElementAsPDF(el, `catalogo-estetica-${sanitizedName}.pdf`);
      triggerConfetti();
    } catch (err) {
      console.error('Error generating PDF:', err);
      alert('Houve uma falha ao gerar o PDF. Tente novamente.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportImage = async () => {
    const el = document.getElementById('printable-catalog-root');
    if (!el) return;
    setIsExporting(true);
    try {
      const sanitizedName = clinic.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
      await exportElementAsImage(el, `catalogo-estetica-${sanitizedName}.png`);
      triggerConfetti();
    } catch (err) {
      console.error('Error generating image:', err);
      alert('Houve uma falha ao gerar a imagem. Tente novamente.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportSingleCard = async () => {
    const el = document.getElementById('printable-single-card');
    if (!el) return;
    setIsExporting(true);
    try {
      const sanitizedTitle = (activeSingleProcedure?.title || 'card')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-');
      await exportElementAsImage(el, `procedimento-${sanitizedTitle}.png`);
      triggerConfetti();
    } catch (err) {
      console.error('Error generating single card image:', err);
      alert('Houve uma falha ao gerar a imagem do card.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyWhatsAppText = () => {
    const text = decodeURIComponent(
      buildWhatsAppCatalogShareUrl(
        selectedCategory === 'Todos' ? procedures : procedures.filter(p => p.category === selectedCategory),
        clinic
      ).split('text=')[1] || ''
    );
    navigator.clipboard.writeText(text);
    setCopiedText(true);
    triggerConfetti();
    setTimeout(() => setCopiedText(false), 3000);
  };

  const shareCatalogUrl = window.location.href;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-fadeIn">
      <div className="relative w-full max-w-5xl bg-[#F9F8F6]/95 backdrop-blur-xl rounded-sm overflow-hidden shadow-2xl border border-white/60 my-4 transition-all">
        {/* Header */}
        <div className="bg-[#1A1A1A] text-[#E5E4E0] px-6 py-4 flex items-center justify-between border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-xs bg-white/10 text-[#C49B74]">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-[#C49B74]">
                Exportação & Compartilhamento
              </span>
              <h2 className="font-serif-luxury text-xl sm:text-2xl font-medium text-white leading-none mt-0.5">
                Compartilhar Catálogo de Procedimentos
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xs text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-white/60 bg-white/40 backdrop-blur-md px-4 sm:px-6 pt-3 gap-1 sm:gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('pdf')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-sm text-xs font-semibold uppercase tracking-wider border-t border-x transition-all ${
              activeTab === 'pdf'
                ? 'bg-[#F9F8F6] text-[#1A1A1A] border-white/80 border-b-transparent shadow-xs'
                : 'text-gray-500 border-transparent hover:text-[#1A1A1A]'
            }`}
          >
            <FileDown className="w-4 h-4 text-[#A67C52]" />
            PDF (A4)
          </button>

          <button
            onClick={() => setActiveTab('image')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-sm text-xs font-semibold uppercase tracking-wider border-t border-x transition-all ${
              activeTab === 'image'
                ? 'bg-[#F9F8F6] text-[#1A1A1A] border-white/80 border-b-transparent shadow-xs'
                : 'text-gray-500 border-transparent hover:text-[#1A1A1A]'
            }`}
          >
            <ImageIcon className="w-4 h-4 text-[#A67C52]" />
            Catálogo (PNG)
          </button>

          <button
            onClick={() => setActiveTab('single-card')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-sm text-xs font-semibold uppercase tracking-wider border-t border-x transition-all ${
              activeTab === 'single-card'
                ? 'bg-[#F9F8F6] text-[#1A1A1A] border-white/80 border-b-transparent shadow-xs'
                : 'text-gray-500 border-transparent hover:text-[#1A1A1A]'
            }`}
          >
            <Layers className="w-4 h-4 text-[#A67C52]" />
            Card Individual
          </button>

          <button
            onClick={() => setActiveTab('whatsapp')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-sm text-xs font-semibold uppercase tracking-wider border-t border-x transition-all ${
              activeTab === 'whatsapp'
                ? 'bg-[#F9F8F6] text-[#1A1A1A] border-white/80 border-b-transparent shadow-xs'
                : 'text-gray-500 border-transparent hover:text-[#1A1A1A]'
            }`}
          >
            <MessageCircle className="w-4 h-4 text-[#25D366]" />
            WhatsApp
          </button>

          <button
            onClick={() => setActiveTab('qrcode')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-sm text-xs font-semibold uppercase tracking-wider border-t border-x transition-all ${
              activeTab === 'qrcode'
                ? 'bg-[#F9F8F6] text-[#1A1A1A] border-white/80 border-b-transparent shadow-xs'
                : 'text-gray-500 border-transparent hover:text-[#1A1A1A]'
            }`}
          >
            <QrCode className="w-4 h-4 text-[#A67C52]" />
            QR Code
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-6 sm:p-8 max-h-[75vh] overflow-y-auto">
          {/* Controls Bar for PDF & Image */}
          {(activeTab === 'pdf' || activeTab === 'image') && (
            <div className="bg-white/50 backdrop-blur-md p-4 rounded-sm border border-white/60 mb-6 flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-4">
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">
                    Filtrar por Categoria
                  </label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="px-3 py-1.5 rounded-sm bg-white/70 border border-white/80 text-xs font-medium text-[#1A1A1A]"
                  >
                    {categories.map((cat, idx) => (
                      <option key={idx} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center pt-4">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-gray-600">
                    <input
                      type="checkbox"
                      checked={showPrices}
                      onChange={(e) => setShowPrices(e.target.checked)}
                      className="w-4 h-4 text-[#A67C52] rounded-xs border-gray-300"
                    />
                    Exibir valores monetários
                  </label>
                </div>
              </div>

              {/* Action Export Button */}
              <div>
                {activeTab === 'pdf' ? (
                  <button
                    onClick={handleExportPDF}
                    disabled={isExporting}
                    className="px-6 py-2.5 rounded-sm bg-[#A67C52] text-white text-xs font-semibold uppercase tracking-widest shadow-xs hover:bg-[#8e6945] active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    {isExporting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Gerando PDF...
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        Baixar Catálogo PDF
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={handleExportImage}
                    disabled={isExporting}
                    className="px-6 py-2.5 rounded-sm bg-[#1A1A1A] hover:bg-[#2A2A2E] text-white text-xs font-semibold uppercase tracking-widest shadow-xs active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    {isExporting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Renderizando Imagem...
                      </>
                    ) : (
                      <>
                        <ImageIcon className="w-4 h-4 text-[#C49B74]" />
                        Baixar Imagem PNG (HD)
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* SINGLE CARD TAB CONTROLS */}
          {activeTab === 'single-card' && (
            <div className="bg-white/50 backdrop-blur-md p-4 rounded-sm border border-white/60 mb-6 flex flex-wrap items-center justify-between gap-4">
              <div className="flex-1 max-w-sm">
                <label className="block text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">
                  Selecione o Procedimento para o Card
                </label>
                <select
                  value={selectedSingleProcedureId}
                  onChange={(e) => setSelectedSingleProcedureId(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-sm bg-white/70 border border-white/80 text-xs font-medium text-[#1A1A1A]"
                >
                  {procedures.map((p) => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleExportSingleCard}
                disabled={isExporting}
                className="px-6 py-2.5 rounded-sm bg-[#A67C52] text-white text-xs font-semibold uppercase tracking-widest shadow-xs hover:bg-[#8e6945] active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Gerando Card...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Baixar Card PNG
                  </>
                )}
              </button>
            </div>
          )}

          {/* PREVIEW CONTAINER FOR PDF & FULL IMAGE */}
          {(activeTab === 'pdf' || activeTab === 'image') && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span>Pré-visualização do Documento:</span>
                <span>Formato: A4 / 2x Retina</span>
              </div>
              <div className="border border-white/60 rounded-sm shadow-inner bg-white/30 backdrop-blur-xs p-2 sm:p-4 max-h-[500px] overflow-auto">
                <PrintableCatalog
                  procedures={procedures}
                  clinic={clinic}
                  selectedCategory={selectedCategory}
                  showPrices={showPrices}
                />
              </div>
            </div>
          )}

          {/* PREVIEW CONTAINER FOR SINGLE CARD */}
          {activeTab === 'single-card' && activeSingleProcedure && (
            <div className="flex flex-col items-center p-4 bg-white/30 backdrop-blur-xs rounded-sm border border-white/60">
              <p className="text-xs text-gray-400 mb-4 text-center">
                Card promocional formatado para envio direto ao cliente no WhatsApp ou postagem:
              </p>
              <div className="w-full flex justify-start sm:justify-center overflow-x-auto">
                <PrintableCard procedure={activeSingleProcedure} clinic={clinic} />
              </div>
            </div>
          )}

          {/* WHATSAPP SHARING TAB */}
          {activeTab === 'whatsapp' && (
            <div className="space-y-6 max-w-2xl mx-auto">
              <div className="bg-white/50 backdrop-blur-md p-6 rounded-sm border border-white/60 shadow-xs space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#25D366]/10 text-[#25D366] flex items-center justify-center">
                    <MessageCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-serif-luxury text-lg font-medium text-[#1A1A1A]">
                      Envio Rápido para Clientes no WhatsApp
                    </h3>
                    <p className="text-xs text-gray-500">
                      Texto pré-formatado com os procedimentos, benefícios e valores prontos para copiar e colar.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <a
                    href={buildWhatsAppCatalogShareUrl(
                      selectedCategory === 'Todos' ? procedures : procedures.filter(p => p.category === selectedCategory),
                      clinic
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-2.5 px-4 rounded-sm bg-[#25D366] hover:bg-[#20bd5a] text-white text-xs font-semibold uppercase tracking-wider text-center shadow-xs transition-all flex items-center justify-center gap-2"
                  >
                    <MessageCircle className="w-4 h-4" />
                    Abrir no WhatsApp
                  </a>

                  <button
                    onClick={handleCopyWhatsAppText}
                    className="py-2.5 px-5 rounded-sm bg-[#1A1A1A] hover:bg-[#2A2A2E] text-white text-xs font-semibold uppercase tracking-wider transition-all flex items-center gap-1.5"
                  >
                    {copiedText ? (
                      <>
                        <Check className="w-4 h-4 text-[#25D366]" />
                        Copiado!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Copiar Mensagem
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* QR CODE SHARING TAB */}
          {activeTab === 'qrcode' && (
            <div className="space-y-6 max-w-lg mx-auto text-center">
              <div className="bg-white/50 backdrop-blur-md p-8 rounded-sm border border-white/60 shadow-xs flex flex-col items-center space-y-4">
                <div className="p-4 bg-white rounded-sm border border-white/80 shadow-xs">
                  <QRCodeSVG
                    value={shareCatalogUrl}
                    size={220}
                    fgColor="#1A1A1A"
                    bgColor="#FFFFFF"
                    level="H"
                    includeMargin={true}
                  />
                </div>

                <div>
                  <h3 className="font-serif-luxury text-xl font-medium text-[#1A1A1A]">
                    QR Code do Catálogo
                  </h3>
                  <p className="text-xs text-gray-500 max-w-xs mx-auto mt-1">
                    Exponha na recepção para que seus pacientes acessem o catálogo completo no smartphone.
                  </p>
                </div>

                <div className="w-full pt-4 border-t border-white/60 flex items-center justify-between text-xs text-gray-600">
                  <span className="font-mono text-[11px] truncate max-w-[240px]">{shareCatalogUrl}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(shareCatalogUrl);
                      setCopiedText(true);
                      triggerConfetti();
                      setTimeout(() => setCopiedText(false), 3000);
                    }}
                    className="px-3 py-1.5 rounded-sm bg-white/70 border border-white/80 hover:bg-white text-[#1A1A1A] font-semibold text-xs uppercase tracking-wider flex items-center gap-1"
                  >
                    {copiedText ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                    Copiar Link
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

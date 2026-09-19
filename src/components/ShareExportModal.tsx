import React, { useState, useEffect } from 'react';
import { X, FileDown, Image as ImageIcon, MessageCircle, QrCode, Copy, Check, Sparkles, Share2, Layers, Download, Loader2, Percent, Tag } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import confetti from 'canvas-confetti';
import { Procedure, ClinicProfile } from '../types';
import { exportElementAsPDF, exportElementAsImage, buildWhatsAppCatalogShareUrl } from '../utils/exportHelpers';
import { normalizeDiscountPercent, formatDiscountPercent, MAX_CATALOG_DISCOUNT } from '../utils/catalogPricing';
import { buildPublicLink } from '../utils/publicLinks';
import { PrintableCatalog } from './PrintableCatalog';
import { PrintableProcedureCard } from './PrintableProcedureCard';
import { ProcedureMultiSelect } from './ProcedureMultiSelect';

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
  const [activeTab, setActiveTab] = useState<'pdf' | 'image' | 'single-card' | 'whatsapp' | 'qrcode'>(
    singleProcedureToExport ? 'single-card' : 'pdf'
  );
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [selectedProcedureIds, setSelectedProcedureIds] = useState<string[]>([]);
  const [showPrices, setShowPrices] = useState(true);
  // Desconto promocional aplicado a todo o catálogo no momento da geração (dias especiais).
  // Guardado como texto para o campo aceitar digitação livre; o valor efetivo é normalizado.
  const [discountInput, setDiscountInput] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [selectedSingleProcedureId, setSelectedSingleProcedureId] = useState<string>(
    singleProcedureToExport ? singleProcedureToExport.id : (procedures[0]?.id || '')
  );

  /**
   * "Enviar card" (detalhe do procedimento e menu do catálogo) abre este mesmo modal, mas para
   * um trabalho só: gerar o card daquele procedimento. Nesse modo as abas do catálogo somem —
   * quem pediu um card não passa pela tela de compartilhar o catálogo inteiro para chegar nele.
   */
  const isSingleCardMode = !!singleProcedureToExport;

  /**
   * O modal fica montado entre as aberturas, então o estado inicial do `useState` só valeu na
   * primeira vez: sem este sincronismo, pedir um card depois de ter aberto o catálogo caía na
   * aba de PDF do catálogo, com o procedimento errado selecionado.
   */
  useEffect(() => {
    if (!isOpen) return;
    if (singleProcedureToExport) {
      setActiveTab('single-card');
      setSelectedSingleProcedureId(singleProcedureToExport.id);
    } else {
      setActiveTab('pdf');
    }
  }, [isOpen, singleProcedureToExport]);

  const activeSingleProcedure = procedures.find(p => p.id === selectedSingleProcedureId) || procedures[0];

  const discountPercent = normalizeDiscountPercent(discountInput);

  // Procedures actually included in the PDF/PNG catalog & WhatsApp text:
  // an explicit procedure selection always wins over the category filter.
  const exportProcedures = selectedProcedureIds.length > 0
    ? procedures.filter((p) => selectedProcedureIds.includes(p.id))
    : selectedCategory === 'Todos'
    ? procedures
    : procedures.filter((p) => p.category === selectedCategory);

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
      await exportElementAsPDF(el, 'Catalogo La Vie.pdf');
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
      await exportElementAsImage(el, 'Catalogo La Vie.png');
      triggerConfetti();
    } catch (err) {
      console.error('Error generating image:', err);
      alert('Houve uma falha ao gerar a imagem. Tente novamente.');
    } finally {
      setIsExporting(false);
    }
  };

  const singleCardFileSlug = () =>
    (activeSingleProcedure?.title || 'card')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

  const handleExportSingleCardPDF = async () => {
    const el = document.getElementById('printable-single-card');
    if (!el) return;
    setIsExporting(true);
    try {
      await exportElementAsPDF(el, `card-${singleCardFileSlug()}.pdf`);
      triggerConfetti();
    } catch (err) {
      console.error('Error generating single card PDF:', err);
      alert('Houve uma falha ao gerar o PDF do card. Tente novamente.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportSingleCard = async () => {
    const el = document.getElementById('printable-single-card');
    if (!el) return;
    setIsExporting(true);
    try {
      await exportElementAsImage(el, `card-${singleCardFileSlug()}.png`);
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
      buildWhatsAppCatalogShareUrl(exportProcedures, clinic, discountPercent).split('text=')[1] || ''
    );
    navigator.clipboard.writeText(text);
    setCopiedText(true);
    triggerConfetti();
    setTimeout(() => setCopiedText(false), 3000);
  };

  // O QR fica exposto na recepção: tem de apontar para o endereço público, e sem os parâmetros
  // que por acaso estiverem na barra de endereços da equipe.
  const shareCatalogUrl = buildPublicLink(clinic, {});

  // Campo de desconto geral — reaproveitado nas abas de catálogo e de card individual.
  const discountControl = (
    <div>
      <label className="block text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">
        Desconto Promocional
      </label>
      <div className="flex items-center gap-1.5">
        <div className="relative">
          <input
            type="number"
            min={0}
            max={MAX_CATALOG_DISCOUNT}
            step={1}
            value={discountInput}
            onChange={(e) => setDiscountInput(e.target.value)}
            placeholder="0"
            className="w-[70px] pl-2.5 pr-6 py-1.5 rounded-sm bg-white/70 border border-white/80 text-xs font-medium text-[#1A1A1A]"
          />
          <Percent className="w-3 h-3 text-[#A67C52] absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        {[10, 15, 20, 30].map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => setDiscountInput(discountPercent === preset ? '' : String(preset))}
            className={`px-2 py-1.5 rounded-sm text-[11px] font-semibold border transition-all ${
              discountPercent === preset
                ? 'bg-[#A67C52] text-white border-[#A67C52]'
                : 'bg-white/70 text-gray-600 border-white/80 hover:border-[#A67C52]'
            }`}
          >
            {preset}%
          </button>
        ))}

        {discountPercent > 0 && (
          <button
            type="button"
            onClick={() => setDiscountInput('')}
            title="Remover desconto promocional"
            className="p-1.5 rounded-sm bg-white/70 border border-white/80 text-gray-500 hover:text-[#1A1A1A] transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );

  const discountHint = discountPercent > 0 && (
    <p className="w-full flex items-center gap-2 text-[11px] text-[#8e6945] bg-[#A67C52]/10 border border-[#A67C52]/30 rounded-sm px-3 py-2">
      <Tag className="w-3.5 h-3.5 shrink-0" />
      <span>
        <strong>{formatDiscountPercent(discountPercent)}% de desconto</strong> aplicado aos{' '}
        {exportProcedures.length} procedimento{exportProcedures.length !== 1 ? 's' : ''} desta
        exportação: o valor de tabela sai riscado e o novo valor aparece logo abaixo. O cadastro dos
        procedimentos não é alterado.
      </span>
    </p>
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-fadeIn">
      <div className="relative w-full max-w-5xl bg-[#F9F8F6]/95 backdrop-blur-xl rounded-sm overflow-hidden shadow-2xl border border-white/60 my-4 transition-all">
        {/* Header */}
        <div className="bg-[#1A1A1A] text-[#E5E4E0] px-6 py-4 flex items-center justify-between border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-xs bg-white/10 text-[#C49B74]">
              {isSingleCardMode ? <Layers className="w-5 h-5" /> : <Share2 className="w-5 h-5" />}
            </div>
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-[#C49B74]">
                {isSingleCardMode ? 'Card Individual · PDF' : 'Exportação & Compartilhamento'}
              </span>
              <h2 className="font-serif-luxury text-xl sm:text-2xl font-medium text-white leading-none mt-0.5">
                {isSingleCardMode
                  ? `Enviar Card · ${singleProcedureToExport?.title ?? ''}`
                  : 'Compartilhar Catálogo de Procedimentos'}
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

        {/* Tab Selector — escondido quando o modal foi aberto só para um card */}
        <div
          className={`${isSingleCardMode ? 'hidden' : 'flex'} border-b border-white/60 bg-white/40 backdrop-blur-md px-4 sm:px-6 pt-3 gap-1 sm:gap-2 overflow-x-auto`}
        >
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
              <div className="flex flex-col sm:flex-row flex-wrap sm:items-end gap-3 sm:gap-4 w-full sm:w-auto">
                <div className="w-full sm:w-auto">
                  <label className="block text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">
                    Filtrar por Categoria
                  </label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    disabled={selectedProcedureIds.length > 0}
                    title={selectedProcedureIds.length > 0 ? 'Desative a seleção específica de procedimentos para usar o filtro por categoria' : undefined}
                    className="w-full sm:w-auto px-3 py-2 rounded-sm bg-white/70 border border-white/80 text-xs font-medium text-[#1A1A1A] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {categories.map((cat, idx) => (
                      <option key={idx} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <ProcedureMultiSelect
                  procedures={procedures}
                  selectedIds={selectedProcedureIds}
                  onChange={setSelectedProcedureIds}
                  currentCategory={selectedCategory}
                />

                <div className="w-full sm:w-auto">
                  {discountControl}
                </div>

                <div className="flex items-center sm:pb-2 pt-1 sm:pt-0">
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

              {discountHint}
            </div>
          )}

          {/* SINGLE CARD TAB CONTROLS */}
          {activeTab === 'single-card' && (
            <div className="bg-white/50 backdrop-blur-md p-4 rounded-sm border border-white/60 mb-6 flex flex-wrap items-end justify-between gap-4">
              <div className="flex-1 min-w-[220px] max-w-sm">
                <label className="block text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">
                  Procedimento do Card
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

              {discountControl}

              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportSingleCardPDF}
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
                      <FileDown className="w-4 h-4" />
                      Baixar Card PDF
                    </>
                  )}
                </button>

                <button
                  onClick={handleExportSingleCard}
                  disabled={isExporting}
                  title="Mesmo card, em imagem — para postar ou enviar direto na conversa"
                  className="px-4 py-2.5 rounded-sm bg-[#1A1A1A] hover:bg-[#2A2A2E] text-white text-xs font-semibold uppercase tracking-widest shadow-xs active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  <ImageIcon className="w-4 h-4 text-[#C49B74]" />
                  PNG
                </button>
              </div>

              {discountPercent > 0 && (
                <p className="w-full flex items-center gap-2 text-[11px] text-[#8e6945] bg-[#A67C52]/10 border border-[#A67C52]/30 rounded-sm px-3 py-2">
                  <Tag className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    <strong>{formatDiscountPercent(discountPercent)}% de desconto</strong> aplicado a este
                    card: o valor de tabela sai riscado e o novo valor aparece ao lado. O cadastro do
                    procedimento não é alterado.
                  </span>
                </p>
              )}
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
                  procedures={exportProcedures}
                  clinic={clinic}
                  selectedCategory="Todos"
                  showPrices={showPrices}
                  discountPercent={discountPercent}
                />
              </div>
            </div>
          )}

          {/* PREVIEW CONTAINER FOR SINGLE CARD */}
          {activeTab === 'single-card' && activeSingleProcedure && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span>Pré-visualização do card (mesmo layout da tela de detalhes):</span>
                <span>Formato: A4 / 2x Retina</span>
              </div>
              <div className="border border-white/60 rounded-sm shadow-inner bg-[#E5E3DD] p-2 sm:p-4 max-h-[520px] overflow-auto flex justify-start sm:justify-center">
                <PrintableProcedureCard
                  procedure={activeSingleProcedure}
                  clinic={clinic}
                  discountPercent={discountPercent}
                />
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

                <p className="text-[11px] text-[#A67C52] font-medium">
                  {exportProcedures.length} procedimento{exportProcedures.length !== 1 ? 's' : ''} será
                  {exportProcedures.length !== 1 ? 'ão' : ''} incluído{exportProcedures.length !== 1 ? 's' : ''} na mensagem
                  {selectedProcedureIds.length === 0 && selectedCategory !== 'Todos' ? ` (categoria "${selectedCategory}")` : ''}.
                </p>

                {discountHint}

                <div className="flex items-center gap-3">
                  <a
                    href={buildWhatsAppCatalogShareUrl(exportProcedures, clinic, discountPercent)}
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

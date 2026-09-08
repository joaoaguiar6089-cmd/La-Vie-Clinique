import React, { useEffect, useRef, useState } from 'react';
import { X, Download, Loader2, AlertCircle } from 'lucide-react';
import { ClinicProfile, Quote } from '../../types';
import { exportElementAsPDF } from '../../utils/exportHelpers';
import { montarSnapshotClinica, SNAPSHOT_CLINICA_PADRAO } from '../../utils/quoteFactory';
import { QuotePrintable } from './QuotePrintable';

interface QuotePreviewModalProps {
  quote: Quote | null;
  /** Perfil atual da clínica; `null` na página pública, que não tem acesso a ele. */
  clinic: ClinicProfile | null;
  onClose: () => void;
}

const LARGURA_PAGINA = 794;

/** "Camila Albuquerque-2026-0148.pdf" — sem os caracteres que o sistema de arquivos rejeita. */
const nomeArquivo = (pacienteNome: string, numero: string): string => {
  const nome = pacienteNome
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return `${nome || 'Orcamento'}-${numero}.pdf`;
};

/**
 * Prévia do PDF em tamanho real, reduzida por CSS só para caber na tela. Na hora
 * de exportar a escala volta para 1: html2canvas mede o elemento como ele está,
 * e capturar algo com `transform: scale` sairia distorcido.
 */
export const QuotePreviewModal: React.FC<QuotePreviewModalProps> = ({
  quote,
  clinic,
  onClose,
}) => {
  const [escala, setEscala] = useState(1);
  const [exportando, setExportando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const paginasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!quote) return;
    const ajustar = () => {
      const disponivel = (areaRef.current?.clientWidth ?? LARGURA_PAGINA) - 24;
      setEscala(Math.min(1, disponivel / LARGURA_PAGINA));
    };
    ajustar();
    window.addEventListener('resize', ajustar);
    return () => window.removeEventListener('resize', ajustar);
  }, [quote]);

  if (!quote) return null;

  const baixarPdf = async () => {
    const alvo = paginasRef.current;
    if (!alvo) return;
    setErro(null);
    setExportando(true);
    try {
      // Deixa o navegador aplicar a escala 1 antes da captura
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await exportElementAsPDF(alvo, nomeArquivo(quote.pacienteNome, quote.numero));
    } catch (e) {
      setErro(`Não foi possível gerar o PDF: ${(e as Error).message}`);
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex flex-col animate-fadeIn">
      <div className="flex items-center justify-between px-6 py-4 bg-[#1A1A1A] shrink-0">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#A67C52]">
            Prévia do orçamento
          </p>
          <h2 className="text-xl text-white font-serif-luxury tabular-nums">
            Nº {quote.numero} · {quote.pacienteNome}
          </h2>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={baixarPdf}
            disabled={exportando}
            className="px-5 py-2.5 bg-[#A67C52] text-white text-xs font-semibold uppercase tracking-widest rounded-sm hover:bg-[#8E653D] transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {exportando ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Gerando...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Baixar PDF
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar prévia"
            className="text-white/60 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {erro && (
        <div className="px-6 py-3 bg-red-50 border-b border-red-200 text-xs text-red-700 flex items-center gap-2 shrink-0">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {erro}
        </div>
      )}

      <div ref={areaRef} className="flex-1 overflow-auto p-6 flex justify-center">
        <div
          style={{
            transform: `scale(${exportando ? 1 : escala})`,
            transformOrigin: 'top center',
            height: exportando ? 'auto' : undefined,
          }}
        >
          <div ref={paginasRef} className="flex flex-col gap-6">
            {/* Orçamentos antigos não têm o retrato da clínica: cai no perfil atual */}
            <QuotePrintable
              quote={quote}
              clinic={
                quote.clinica ||
                (clinic ? montarSnapshotClinica(clinic) : SNAPSHOT_CLINICA_PADRAO)
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
};

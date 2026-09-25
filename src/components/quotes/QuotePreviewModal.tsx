import React, { useEffect, useRef, useState } from 'react';
import { X, Download, Loader2, AlertCircle } from 'lucide-react';
import { ClinicProfile, LaserBodyMap, Quote } from '../../types';
import { exportElementAsPDF } from '../../utils/exportHelpers';
import { montarSnapshotClinica, SNAPSHOT_CLINICA_PADRAO } from '../../utils/quoteFactory';
import { QuotePrintable } from './QuotePrintable';
import { usePaginasDoComprovante } from './usePaginasDoComprovante';

interface QuotePreviewModalProps {
  quote: Quote | null;
  /** Perfil atual da clínica; `null` na página pública, que não tem acesso a ele. */
  clinic: ClinicProfile | null;
  /**
   * Mapa corporal do laser, para a página das áreas contratadas no PDF. O painel monta do
   * catálogo; a página pública lê o espelho, que é o que ela consegue ler sem login.
   */
  mapaCorporal?: LaserBodyMap | null;
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
  mapaCorporal,
  clinic,
  onClose,
}) => {
  const [escala, setEscala] = useState(1);
  const [exportando, setExportando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const paginasRef = useRef<HTMLDivElement>(null);
  // Antes do `return null` abaixo: hooks não podem depender de haver orçamento aberto
  const comprovante = usePaginasDoComprovante(quote?.comprovante);
  const carregandoComprovante = comprovante.estado === 'carregando';

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
    <div className="fixed inset-0 z-50 bg-black/70 flex flex-col animate-fadeIn">
      <div className="flex items-center justify-between px-6 py-4 bg-ink shrink-0">
        <div>
          <p className="text-label font-semibold uppercase tracking-widest text-brand">
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
            disabled={exportando || carregandoComprovante}
            title={carregandoComprovante ? 'Aguarde o comprovante carregar' : undefined}
            className="px-5 py-2.5 bg-brand text-white text-xs font-semibold uppercase tracking-widest rounded-sm hover:bg-brand-hover transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {exportando || carregandoComprovante ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {exportando ? 'Gerando...' : 'Comprovante...'}
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

      {/* O PDF sai sem o comprovante — quem baixa precisa saber antes de mandar para alguém */}
      {comprovante.estado === 'erro' && quote.comprovante && (
        <div className="px-6 py-3 bg-amber-50 border-b border-amber-200 text-xs text-amber-800 flex items-center gap-2 shrink-0">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>
            O comprovante não entrou no PDF: {comprovante.mensagem}.{' '}
            <a
              href={quote.comprovante.url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold"
            >
              Abrir o comprovante
            </a>
          </span>
        </div>
      )}
      {comprovante.estado === 'pronto' && comprovante.paginasOmitidas > 0 && (
        <div className="px-6 py-3 bg-amber-50 border-b border-amber-200 text-xs text-amber-800 flex items-center gap-2 shrink-0">
          <AlertCircle className="w-4 h-4 shrink-0" />
          O comprovante tem mais folhas do que cabem no orçamento; entraram só as{' '}
          {comprovante.paginas.length} primeiras.
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
              mapaCorporal={mapaCorporal}
              paginasDoComprovante={comprovante.estado === 'pronto' ? comprovante.paginas : undefined}
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

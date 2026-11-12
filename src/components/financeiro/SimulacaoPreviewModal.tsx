import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Download, Loader2, Pencil, Share2, X } from 'lucide-react';
import { ClinicProfile, SimulacaoDeCusto } from '../../types';
import { baixarArquivo, gerarPdfDoElemento } from '../../utils/exportHelpers';
import { formatBRL } from '../../utils/formatters';
import { nomeDoArquivoDaSimulacao } from '../../utils/simulacaoDeCusto';
import { PAGE_W } from '../documentos/estiloA4';
import { PaginasDaSimulacao } from './SimulacaoPrintable';

interface SimulacaoPreviewModalProps {
  simulacao: SimulacaoDeCusto | null;
  clinic: ClinicProfile;
  onClose: () => void;
  onEditar?: (simulacao: SimulacaoDeCusto) => void;
}

/** O compartilhamento do aparelho aceita arquivo? É o caso do celular; no computador, quase nunca. */
const podeCompartilharArquivo = (arquivo: File): boolean => {
  try {
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [arquivo] });
  } catch {
    return false;
  }
};

/**
 * A prévia da simulação em tamanho real, com o PDF para baixar ou compartilhar.
 *
 * O PDF é documento interno: "Compartilhar" abre a folha do aparelho para mandar a quem a
 * profissional quiser (a administradora, por exemplo) — não existe o "Enviar à cliente" do
 * recibo. No computador, onde o navegador não compartilha arquivo, o botão baixa.
 *
 * Mesma regra de escala da prévia do orçamento: na captura a escala volta a 1, porque o
 * html2canvas mede o elemento como ele está.
 */
export const SimulacaoPreviewModal: React.FC<SimulacaoPreviewModalProps> = ({
  simulacao,
  clinic,
  onClose,
  onEditar,
}) => {
  const [escala, setEscala] = useState(1);
  const [exportando, setExportando] = useState(false);
  const [pronta, setPronta] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /** O PDF já gerado nesta abertura — o segundo toque não espera de novo. */
  const [arquivo, setArquivo] = useState<File | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const paginasRef = useRef<HTMLDivElement>(null);

  // Simulação editada: o PDF guardado deixou de valer.
  const versao = `${simulacao?.id}|${simulacao?.updatedAt || simulacao?.createdAt}`;
  useEffect(() => {
    setArquivo(null);
    setErro(null);
  }, [versao]);

  useEffect(() => {
    if (!simulacao) return;
    const ajustar = () => {
      const disponivel = (areaRef.current?.clientWidth ?? PAGE_W) - 24;
      setEscala(Math.min(1, disponivel / PAGE_W));
    };
    ajustar();
    window.addEventListener('resize', ajustar);
    return () => window.removeEventListener('resize', ajustar);
  }, [simulacao]);

  if (!simulacao) return null;

  const nomeDoArquivo = nomeDoArquivoDaSimulacao(simulacao);
  const ocupado = exportando || !pronta;

  const gerar = async (): Promise<File | null> => {
    if (arquivo) return arquivo;
    const alvo = paginasRef.current;
    if (!alvo) return null;
    setErro(null);
    setExportando(true);
    try {
      // Deixa o navegador aplicar a escala 1 antes da captura
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const blob = await gerarPdfDoElemento(alvo);
      const novo = new File([blob], nomeDoArquivo, { type: 'application/pdf' });
      setArquivo(novo);
      return novo;
    } catch (e) {
      setErro(`Não foi possível gerar o PDF: ${(e as Error).message}`);
      return null;
    } finally {
      setExportando(false);
    }
  };

  const baixar = async () => {
    const pdf = await gerar();
    if (pdf) baixarArquivo(pdf, nomeDoArquivo);
  };

  const compartilhar = async () => {
    const pdf = await gerar();
    if (!pdf) return;
    if (!podeCompartilharArquivo(pdf)) {
      baixarArquivo(pdf, nomeDoArquivo);
      return;
    }
    try {
      await navigator.share({ files: [pdf], title: 'Simulação de custo' });
    } catch (e) {
      const nome = (e as Error).name;
      // Quem fecha a folha de compartilhamento desistiu — não é erro.
      if (nome === 'AbortError') return;
      // Gerar o PDF leva uns segundos, e o navegador só deixa compartilhar logo depois de um
      // toque. Passou do prazo: o arquivo já está pronto, e o próximo toque compartilha na hora.
      if (nome === 'NotAllowedError') {
        setErro('O PDF está pronto — toque em "Compartilhar" de novo.');
        return;
      }
      setErro(`Não foi possível compartilhar: ${(e as Error).message}`);
    }
  };

  const botao =
    'inline-flex items-center justify-center gap-2 h-10 px-4 rounded-full text-[13px] font-semibold whitespace-nowrap transition-colors disabled:opacity-50';

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex flex-col animate-fadeIn">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 sm:px-6 py-3.5 bg-ink shrink-0 pt-[max(14px,env(safe-area-inset-top))]">
        <div className="min-w-0 w-full sm:w-auto sm:flex-1">
          <p className="text-label font-semibold uppercase tracking-widest text-brand">Simulação de custo</p>
          <h2 className="text-xl text-white font-serif-luxury tabular-nums truncate">
            {simulacao.pacienteNome || 'Sem cliente'} · {formatBRL(simulacao.custoTotal)}
          </h2>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {onEditar && (
            <button
              type="button"
              onClick={() => onEditar(simulacao)}
              disabled={exportando}
              className={`${botao} border border-cream/25 text-cream hover:border-cream/50`}
            >
              <Pencil className="w-4 h-4" />
              <span className="hidden sm:inline">Editar</span>
            </button>
          )}
          <button
            type="button"
            onClick={compartilhar}
            disabled={ocupado}
            className={`${botao} border border-cream/25 text-cream hover:border-cream/50`}
          >
            <Share2 className="w-4 h-4" />
            <span className="hidden sm:inline">Compartilhar</span>
          </button>
          <button
            type="button"
            onClick={baixar}
            disabled={ocupado}
            className={`${botao} bg-brand-light text-ink hover:bg-[#B88E67]`}
          >
            {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {exportando ? 'Gerando…' : 'Baixar PDF'}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={exportando}
            aria-label="Fechar prévia"
            className="w-10 h-10 rounded-full flex items-center justify-center text-white/60 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {erro && (
        <div className="px-6 py-3 bg-danger-bg border-b border-danger-line text-[13px] text-danger flex items-center gap-2 shrink-0">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {erro}
        </div>
      )}

      <div ref={areaRef} className="flex-1 overflow-auto p-3 sm:p-6 flex justify-center">
        <div
          style={{
            transform: `scale(${exportando ? 1 : escala})`,
            transformOrigin: 'top center',
            height: exportando ? 'auto' : undefined,
          }}
        >
          <div ref={paginasRef} className="flex flex-col gap-6">
            <PaginasDaSimulacao simulacao={simulacao} clinica={clinic} onPronta={setPronta} />
          </div>
        </div>
      </div>
    </div>
  );
};

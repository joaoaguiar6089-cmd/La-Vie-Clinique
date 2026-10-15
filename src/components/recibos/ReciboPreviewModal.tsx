import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Download, Loader2, MessageCircle, Pencil, Send, X } from 'lucide-react';
import { Recibo } from '../../types';
import { baixarArquivo, gerarPdfDoElemento } from '../../utils/exportHelpers';
import { buildWhatsAppUrl } from '../../utils/whatsapp';
import { formatBRL } from '../../utils/formatters';
import { nomeDoArquivoDoRecibo } from '../../utils/recibos';
import { usePaginasDoComprovante } from '../quotes/usePaginasDoComprovante';
import { PaginasDoRecibo } from './ReciboPrintable';
import { PAGE_W } from '../documentos/estiloA4';

interface ReciboPreviewModalProps {
  recibo: Recibo | null;
  /** Telefone para a conversa do WhatsApp — o do recibo, ou o do cadastro da cliente. */
  contato?: string;
  onClose: () => void;
  onEditar?: (recibo: Recibo) => void;
}

/** A mensagem que acompanha o PDF. */
const mensagemDoEnvio = (recibo: Recibo): string => {
  const primeiroNome = recibo.pacienteNome.trim().split(/\s+/)[0] || '';
  return (
    `Olá${primeiroNome ? `, ${primeiroNome}` : ''}! Segue o recibo do seu pagamento de ` +
    `${formatBRL(recibo.valor)} (Nº ${recibo.numero}). Agradecemos a confiança! — ${recibo.clinica.name}`
  );
};

/** O compartilhamento do aparelho aceita arquivo? É o caso do celular; no computador, quase nunca. */
const podeCompartilharArquivo = (arquivo: File): boolean => {
  try {
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [arquivo] });
  } catch {
    return false;
  }
};

type Aviso =
  | { tipo: 'toque-de-novo' }
  | { tipo: 'baixado'; whatsapp: string | null };

/**
 * Prévia da nota de recibo em tamanho real, com o PDF para baixar e para mandar à cliente.
 *
 * "Enviar" tenta o caminho mais curto: no celular, abre o compartilhamento do aparelho com o PDF
 * já anexado — a recepção escolhe o WhatsApp e a conversa da cliente. Onde o navegador não
 * compartilha arquivo (o computador), o PDF é baixado e aparece o link da conversa dela no
 * WhatsApp, para anexar ali.
 *
 * Mesma regra de escala da prévia do orçamento: na captura a escala volta a 1, porque o
 * html2canvas mede o elemento como ele está.
 */
export const ReciboPreviewModal: React.FC<ReciboPreviewModalProps> = ({
  recibo,
  contato,
  onClose,
  onEditar,
}) => {
  const [escala, setEscala] = useState(1);
  const [exportando, setExportando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  /** O PDF já gerado nesta abertura — o segundo toque em "Enviar" não espera de novo. */
  const [arquivo, setArquivo] = useState<File | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const paginasRef = useRef<HTMLDivElement>(null);
  const comprovante = usePaginasDoComprovante(recibo?.comprovante);
  const carregandoComprovante = comprovante.estado === 'carregando';

  // Recibo editado, ou o comprovante terminou de carregar: o PDF guardado deixou de valer.
  const versao = `${recibo?.id}|${recibo?.updatedAt}|${comprovante.estado}`;
  useEffect(() => {
    setArquivo(null);
    setAviso(null);
    setErro(null);
  }, [versao]);

  useEffect(() => {
    if (!recibo) return;
    const ajustar = () => {
      const disponivel = (areaRef.current?.clientWidth ?? PAGE_W) - 24;
      setEscala(Math.min(1, disponivel / PAGE_W));
    };
    ajustar();
    window.addEventListener('resize', ajustar);
    return () => window.removeEventListener('resize', ajustar);
  }, [recibo]);

  if (!recibo) return null;

  const nomeDoArquivo = nomeDoArquivoDoRecibo(recibo);
  const ocupado = exportando || carregandoComprovante;

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

  const compartilhar = async (pdf: File) => {
    try {
      await navigator.share({ files: [pdf], title: `Recibo ${recibo.numero}`, text: mensagemDoEnvio(recibo) });
      setAviso(null);
    } catch (e) {
      const nome = (e as Error).name;
      // Quem fecha a folha de compartilhamento desistiu — não é erro.
      if (nome === 'AbortError') return;
      // Gerar o PDF leva uns segundos, e o navegador só deixa compartilhar logo depois de um
      // toque. Passou do prazo: o arquivo já está pronto, falta só um toque novo.
      if (nome === 'NotAllowedError') {
        setAviso({ tipo: 'toque-de-novo' });
        return;
      }
      setErro(`Não foi possível compartilhar: ${(e as Error).message}`);
    }
  };

  const enviar = async () => {
    const pdf = await gerar();
    if (!pdf) return;
    if (podeCompartilharArquivo(pdf)) {
      await compartilhar(pdf);
      return;
    }
    baixarArquivo(pdf, nomeDoArquivo);
    setAviso({
      tipo: 'baixado',
      whatsapp: buildWhatsAppUrl(recibo.pacienteContato || contato, mensagemDoEnvio(recibo)),
    });
  };

  const botao =
    'inline-flex items-center justify-center gap-2 h-10 px-4 rounded-full text-[13px] font-semibold whitespace-nowrap transition-colors disabled:opacity-50';

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex flex-col animate-fadeIn">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 sm:px-6 py-3.5 bg-ink shrink-0 pt-[max(14px,env(safe-area-inset-top))]">
        {/* No celular o título fica com a linha toda e os botões descem para a de baixo */}
        <div className="min-w-0 w-full sm:w-auto sm:flex-1">
          <p className="text-label font-semibold uppercase tracking-widest text-brand">Nota de recibo</p>
          <h2 className="text-xl text-white font-serif-luxury tabular-nums truncate">
            Nº {recibo.numero} · {recibo.pacienteNome}
          </h2>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {onEditar && (
            <button
              type="button"
              onClick={() => onEditar(recibo)}
              disabled={exportando}
              className={`${botao} border border-cream/25 text-cream hover:border-cream/50`}
            >
              <Pencil className="w-4 h-4" />
              <span className="hidden sm:inline">Editar</span>
            </button>
          )}
          <button
            type="button"
            onClick={baixar}
            disabled={ocupado}
            title={carregandoComprovante ? 'Aguarde o comprovante carregar' : 'Baixar o PDF'}
            className={`${botao} border border-cream/25 text-cream hover:border-cream/50`}
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Baixar PDF</span>
          </button>
          <button
            type="button"
            onClick={enviar}
            disabled={ocupado}
            className={`${botao} bg-brand-light text-ink hover:bg-[#B88E67]`}
          >
            {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {exportando ? 'Gerando…' : carregandoComprovante ? 'Comprovante…' : 'Enviar à cliente'}
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

      {aviso?.tipo === 'toque-de-novo' && arquivo && (
        <div className="px-6 py-3 bg-ok-bg border-b border-ok-line text-[13px] text-ok flex flex-wrap items-center gap-x-3 gap-y-2 shrink-0">
          <span>O PDF está pronto.</span>
          <button
            type="button"
            onClick={() => compartilhar(arquivo)}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-ok text-white font-semibold"
          >
            <Send className="w-4 h-4" />
            Enviar agora
          </button>
        </div>
      )}

      {aviso?.tipo === 'baixado' && (
        <div className="px-6 py-3 bg-ok-bg border-b border-ok-line text-[13px] text-ok flex flex-wrap items-center gap-x-3 gap-y-2 shrink-0">
          <span>
            O PDF foi baixado ({nomeDoArquivo}).{' '}
            {aviso.whatsapp
              ? 'Abra a conversa da cliente e anexe o arquivo.'
              : 'A cliente não tem telefone cadastrado — anexe o arquivo na conversa dela.'}
          </span>
          {aviso.whatsapp && (
            <a
              href={aviso.whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-whatsapp-strong text-white font-semibold"
            >
              <MessageCircle className="w-4 h-4" />
              Abrir conversa no WhatsApp
            </a>
          )}
        </div>
      )}

      {/* O PDF sai sem o comprovante — quem envia precisa saber antes */}
      {comprovante.estado === 'erro' && recibo.comprovante && (
        <div className="px-6 py-3 bg-warn-bg border-b border-warn-line text-[13px] text-warn flex items-center gap-2 shrink-0">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>
            O comprovante não entrou no PDF: {comprovante.mensagem}.{' '}
            <a
              href={recibo.comprovante.url}
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
        <div className="px-6 py-3 bg-warn-bg border-b border-warn-line text-[13px] text-warn flex items-center gap-2 shrink-0">
          <AlertCircle className="w-4 h-4 shrink-0" />
          O comprovante tem mais folhas do que cabem; entraram só as {comprovante.paginas.length} primeiras.
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
            <PaginasDoRecibo
              recibo={recibo}
              folhasDoComprovante={comprovante.estado === 'pronto' ? comprovante.paginas : undefined}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, FileText, Paperclip, X } from 'lucide-react';
import { QuoteComprovante } from '../../types';
import { formatDate } from '../../utils/formatters';
import { COMPROVANTE_TIPOS_ACEITOS, comprovanteEhPdf } from '../../services/comprovantes';

/**
 * O campo do comprovante de pagamento — escolher o arquivo e mostrar o que já está anexado. Usado
 * pela folha de pagamento do orçamento e pelo formulário da nota de recibo.
 */

const tamanhoLegivel = (bytes: number): string =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

// ==========================================
// ESCOLHA DO ARQUIVO
// ==========================================

/**
 * Campo do comprovante: botão que abre o seletor e, escolhido o arquivo, a miniatura com o nome.
 * Aceita foto ou PDF — no celular o seletor oferece a câmera e a galeria, que é de onde sai a
 * captura de tela do Pix.
 */
export const EscolhaDeComprovante: React.FC<{
  arquivo: File | null;
  onEscolher: (arquivo: File | null) => void;
  rotulo: string;
}> = ({ arquivo, onEscolher, rotulo }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previa, setPrevia] = useState<string | null>(null);

  useEffect(() => {
    if (!arquivo || !arquivo.type.startsWith('image/')) {
      setPrevia(null);
      return;
    }
    const url = URL.createObjectURL(arquivo);
    setPrevia(url);
    return () => URL.revokeObjectURL(url);
  }, [arquivo]);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={COMPROVANTE_TIPOS_ACEITOS}
        className="hidden"
        onChange={(e) => {
          onEscolher(e.target.files?.[0] || null);
          // Zera o campo: escolher o mesmo arquivo de novo, depois de removê-lo, precisa disparar.
          e.target.value = '';
        }}
      />

      {arquivo ? (
        <div className="flex items-center gap-3 p-2.5 rounded-xl border border-line bg-surface">
          {previa ? (
            <img src={previa} alt="" className="w-12 h-12 object-cover rounded-lg shrink-0" />
          ) : (
            <span className="w-12 h-12 rounded-lg bg-surface-2 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5 text-brand" />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block text-body-lg text-ink truncate">{arquivo.name}</span>
            <span className="block text-body text-muted">{tamanhoLegivel(arquivo.size)}</span>
          </span>
          <button
            type="button"
            onClick={() => onEscolher(null)}
            aria-label="Remover arquivo escolhido"
            className="w-11 h-11 shrink-0 flex items-center justify-center text-muted hover:text-danger transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full min-h-[52px] px-4 rounded-xl border border-dashed border-brand/50 text-brand-hover hover:bg-brand/5 transition-colors flex items-center justify-center gap-2 text-body-lg font-medium"
        >
          <Paperclip className="w-4 h-4" />
          {rotulo}
        </button>
      )}
    </>
  );
};

/** O comprovante já anexado: miniatura (ou ícone de PDF), nome e o link para abrir. */
export const ComprovanteAnexado: React.FC<{ comprovante: QuoteComprovante }> = ({ comprovante }) => (
  <a
    href={comprovante.url}
    target="_blank"
    rel="noopener noreferrer"
    className="flex items-center gap-3 p-2.5 rounded-xl border border-line bg-surface hover:border-brand transition-colors"
  >
    {comprovanteEhPdf(comprovante) ? (
      <span className="w-12 h-12 rounded-lg bg-surface-2 flex items-center justify-center shrink-0">
        <FileText className="w-5 h-5 text-brand" />
      </span>
    ) : (
      <img src={comprovante.url} alt="" className="w-12 h-12 object-cover rounded-lg shrink-0" />
    )}
    <span className="min-w-0 flex-1">
      <span className="block text-body-lg text-ink truncate">{comprovante.nome}</span>
      <span className="block text-body text-muted">anexado em {formatDate(comprovante.enviadoEm)}</span>
    </span>
    <ExternalLink className="w-4 h-4 text-muted shrink-0 mr-2" />
  </a>
);

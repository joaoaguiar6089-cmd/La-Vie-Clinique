import React, { useState } from 'react';
import { Loader2, ScrollText } from 'lucide-react';
import { aceitarDocumentos, ErroDoCadastro } from '../../services/cadastroApi';
import { mensagemDoAceite } from '../../utils/cadastro';
import { VIGENCIA_DOS_DOCUMENTOS, VERSAO_DOS_DOCUMENTOS } from '../../utils/documentosLegais';
import { MARCA_DA_PLATAFORMA } from '../../utils/marca';
import { LinkDoDocumento } from './CadastroDaClinica';

/**
 * O pedido de aceite dos documentos para a admin de uma clínica que já usa a plataforma: as
 * clínicas de antes dos documentos (a La Vie) e todas, quando a versão muda.
 *
 * Só para a admin, que aceita em nome da clínica. "Agora não" fecha até a próxima vez que o painel
 * abrir: os Termos dão 30 dias para uma versão nova valer (item 16).
 */
export const AceiteDosDocumentosModal: React.FC<{ onFechar: () => void }> = ({ onFechar }) => {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const aceitar = async () => {
    setErro(null);
    setEnviando(true);
    try {
      await aceitarDocumentos();
      // O painel fecha sozinho quando o documento da clínica mostrar o aceite.
      onFechar();
    } catch (falha) {
      const codigo = falha instanceof ErroDoCadastro ? falha.codigo : '';
      setErro(mensagemDoAceite(codigo));
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-end sm:items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="aceite-titulo">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-surface border border-[rgba(26,26,26,.1)] flex items-center justify-center shrink-0">
            <ScrollText className="w-5 h-5 text-brand" />
          </div>
          <h2 id="aceite-titulo" className="font-serif-luxury text-[20px] font-semibold text-ink leading-tight">
            Termos de uso e privacidade
          </h2>
        </div>
        <p className="text-[13.5px] text-ink-soft leading-relaxed">
          A {MARCA_DA_PLATAFORMA} publicou os documentos que regem o uso da plataforma e o tratamento dos dados das
          suas pacientes (versão {VERSAO_DOS_DOCUMENTOS}, de {VIGENCIA_DOS_DOCUMENTOS}). Como administradora, leia e
          aceite em nome da clínica:
        </p>
        <ul className="text-[13.5px] space-y-1.5 pl-1">
          <li>
            <LinkDoDocumento documento="termos-de-uso">Termos de Uso</LinkDoDocumento>
          </li>
          <li>
            <LinkDoDocumento documento="politica-de-privacidade">Política de Privacidade</LinkDoDocumento>
          </li>
          <li>
            <LinkDoDocumento documento="acordo-de-tratamento-de-dados">Acordo de Tratamento de Dados</LinkDoDocumento>
          </li>
        </ul>
        {erro && (
          <p role="alert" className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[13px]">
            {erro}
          </p>
        )}
        <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
          <button
            type="button"
            onClick={onFechar}
            disabled={enviando}
            className="w-full sm:flex-1 shrink-0 h-[46px] rounded-xl border border-[rgba(26,26,26,.12)] text-ink text-[14px] font-semibold hover:bg-surface transition-all disabled:opacity-60"
          >
            Agora não
          </button>
          <button
            type="button"
            onClick={aceitar}
            disabled={enviando}
            className="w-full sm:flex-1 shrink-0 h-[46px] rounded-xl bg-brand text-white text-[14px] font-semibold flex items-center justify-center gap-2 hover:bg-brand-hover transition-all disabled:opacity-60"
          >
            {enviando && <Loader2 className="w-4 h-4 animate-spin" />}
            Li e aceito
          </button>
        </div>
      </div>
    </div>
  );
};

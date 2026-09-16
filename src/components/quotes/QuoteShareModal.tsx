import React, { useState } from 'react';
import { X, Copy, Check, MessageCircle, Lock } from 'lucide-react';
import { ClinicProfile, Quote } from '../../types';
import { buildPublicLink } from '../../utils/publicLinks';

interface QuoteShareModalProps {
  quote: Quote | null;
  /** Só o endereço público interessa aqui — é o que decide a base do link. */
  clinic?: Pick<ClinicProfile, 'publicBaseUrl'>;
  onClose: () => void;
  /** Marca como enviado na primeira vez que o link sai daqui — o que trava a edição. */
  onCompartilhado: (quote: Quote) => void;
}

const montarLink = (quoteId: string, clinic?: Pick<ClinicProfile, 'publicBaseUrl'>): string =>
  buildPublicLink(clinic, { orcamento: quoteId });

const linkWhatsApp = (telefone: string | undefined, texto: string): string => {
  const digitos = (telefone || '').replace(/\D/g, '');
  if (!digitos) return `https://wa.me/?text=${encodeURIComponent(texto)}`;
  const numero = digitos.length >= 12 ? digitos : `55${digitos}`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
};

export const QuoteShareModal: React.FC<QuoteShareModalProps> = ({
  quote,
  clinic,
  onClose,
  onCompartilhado,
}) => {
  const [copiado, setCopiado] = useState(false);

  if (!quote) return null;

  const link = montarLink(quote.id, clinic);
  const primeiraVez = quote.status === 'rascunho';
  const mensagem = `Olá, ${quote.pacienteNome.split(' ')[0]}! Preparamos o seu orçamento (nº ${quote.numero}). É só abrir aqui: ${link}`;

  const registrarEnvio = () => onCompartilhado(quote);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
      registrarEnvio();
    } catch {
      // Sem permissão de área de transferência: o link continua visível para copiar à mão
      setCopiado(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
      <div className="w-full max-w-md bg-[#F9F8F6] rounded-sm overflow-hidden shadow-2xl border border-white/60">
        <div className="bg-[#1A1A1A] px-6 py-4 flex items-start justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#A67C52]">
              Compartilhar
            </p>
            <h2 className="text-lg text-white font-serif-luxury tabular-nums">
              Nº {quote.numero}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="text-white/60 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-xs text-gray-600 leading-relaxed">
            A cliente abre esse link no celular, sem login e sem instalar nada. O link é secreto:
            só quem recebe consegue abrir.
          </p>

          <div className="flex items-stretch gap-2">
            <input
              type="text"
              readOnly
              value={link}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 glass-input px-3 py-2 rounded-sm text-xs text-gray-600 focus:outline-hidden"
            />
            <button
              type="button"
              onClick={copiar}
              className="px-3 bg-white/70 border border-[#E2DFD8] rounded-sm text-[#1A1A1A] hover:bg-white transition-colors"
              aria-label="Copiar link"
            >
              {copiado ? (
                <Check className="w-4 h-4 text-emerald-600" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
          </div>

          <a
            href={linkWhatsApp(quote.pacienteContato, mensagem)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={registrarEnvio}
            className="w-full px-5 py-3 bg-[#A67C52] text-white text-xs font-semibold uppercase tracking-widest rounded-sm hover:bg-[#8E653D] transition-colors flex items-center justify-center gap-2"
          >
            <MessageCircle className="w-4 h-4" />
            Enviar no WhatsApp
            {quote.pacienteContato ? ` · ${quote.pacienteContato}` : ''}
          </a>

          {primeiraVez && (
            <div className="text-[11px] leading-relaxed text-[#8E653D] bg-[#A67C52]/10 border border-[#A67C52]/25 rounded-sm px-3 py-2 flex items-start gap-2">
              <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {/* O texto precisa ser um único filho do flex, senão o <strong> vira outra coluna */}
              <span>
                Ao compartilhar, este orçamento passa de rascunho para <strong>enviado</strong> e
                não poderá mais ser editado — a partir daí, ajustes viram uma substituição.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

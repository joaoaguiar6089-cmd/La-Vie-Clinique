import React, { useEffect, useState } from 'react';
import { OrientationImage } from '../../types';
import { Info, Maximize2, Minimize2, X, ZoomIn } from 'lucide-react';

interface OrientationImageLightboxProps {
  image: OrientationImage;
  onClose: () => void;
}

/**
 * Visualizador em tela cheia. O objetivo da imagem orientativa é que o paciente *leia* o que está
 * escrito nela, e no celular a largura do formulário não dá conta disso — aqui ele alterna entre
 * "caber na tela" e o tamanho real do arquivo, arrastando para percorrer a imagem.
 */
const OrientationImageLightbox: React.FC<OrientationImageLightboxProps> = ({ image, onClose }) => {
  const [naturalWidth, setNaturalWidth] = useState(0);
  const [isActualSize, setIsActualSize] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] bg-black/92 backdrop-blur-xs flex flex-col animate-fadeIn print:hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 shrink-0 border-b border-white/10">
        <span className="text-[14px] font-semibold text-white truncate">
          {image.titulo || 'Imagem orientativa'}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsActualSize((v) => !v)}
            className="flex items-center gap-1.5 px-3 h-9 rounded-full bg-white/10 border border-white/20 text-white text-[13px] font-semibold hover:bg-white/20 transition-colors"
          >
            {isActualSize ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            {isActualSize ? 'Caber na tela' : 'Tamanho real'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 border border-white/20 text-white flex items-center justify-center hover:bg-white/20 transition-colors"
            title="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3 flex items-start justify-center">
        <img
          src={image.url}
          alt={image.titulo || 'Imagem orientativa do procedimento'}
          onLoad={(e) => setNaturalWidth(e.currentTarget.naturalWidth)}
          className={isActualSize ? 'block h-auto' : 'block max-w-full max-h-full w-auto h-auto object-contain m-auto'}
          style={isActualSize ? { width: naturalWidth ? `${naturalWidth}px` : 'auto', maxWidth: 'none' } : undefined}
        />
      </div>

      {image.descricao && (
        <p className="shrink-0 px-4 py-3 text-[13px] text-white/70 border-t border-white/10 text-center">
          {image.descricao}
        </p>
      )}
    </div>
  );
};

interface OrientationImageCardProps {
  image: OrientationImage;
  /** 'paciente' = formulário online (tipografia maior, mobile-first). 'clinica' = modal interno. */
  variant?: 'paciente' | 'clinica';
  className?: string;
}

/**
 * Bloco da imagem orientativa nas telas de preenchimento. A imagem ocupa toda a largura disponível
 * com `height: auto`, ou seja, mantém a proporção exata do arquivo enviado pela clínica — nada de
 * caixa de altura fixa recortando o conteúdo, porque é justamente o texto dentro da imagem que
 * precisa ser lido.
 */
export const OrientationImageCard: React.FC<OrientationImageCardProps> = ({
  image,
  variant = 'paciente',
  className = '',
}) => {
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  const isPatient = variant === 'paciente';

  return (
    <>
      <div
        className={`${
          isPatient
            ? 'bg-white rounded-2xl p-5 shadow-[0_3px_14px_rgba(0,0,0,.04)]'
            : 'bg-[#F9F8F6] rounded-xl p-3.5'
        } ${className}`}
      >
        <div className="flex items-start gap-2.5 mb-3">
          <span
            className={`shrink-0 rounded-full bg-[#A67C52]/10 text-[#A67C52] flex items-center justify-center ${
              isPatient ? 'w-8 h-8' : 'w-7 h-7'
            }`}
          >
            <Info className={isPatient ? 'w-[18px] h-[18px]' : 'w-4 h-4'} />
          </span>
          <div className="min-w-0">
            <p
              className={`font-semibold text-[#1A1A1A] leading-tight ${
                isPatient ? 'text-[15px]' : 'text-[14px]'
              }`}
            >
              {image.titulo || 'Imagem orientativa'}
            </p>
            <p className={`text-[#8a8578] mt-0.5 ${isPatient ? 'text-[13px]' : 'text-[12px]'}`}>
              {image.descricao || 'Material de orientação enviado pela clínica. Toque para ampliar.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsLightboxOpen(true)}
          className="group block w-full rounded-xl overflow-hidden border border-[rgba(26,26,26,.1)] bg-white cursor-zoom-in"
          title="Ampliar imagem"
        >
          {/* `w-full h-auto` mantém a proporção exata do arquivo enviado pela clínica — o limite de
              altura só existe para uma imagem desproporcionalmente alta não virar uma rolagem sem
              fim dentro do formulário. O convite para ampliar fica numa faixa abaixo, e não sobre a
              imagem, porque tapar qualquer pedaço dela é tapar justamente o que precisa ser lido. */}
          <img
            src={image.url}
            alt={image.titulo || 'Imagem orientativa do procedimento'}
            className="block w-full h-auto max-h-[70vh] object-contain"
          />
          <span className="flex items-center justify-center gap-1.5 h-10 bg-[#F9F8F6] border-t border-[rgba(26,26,26,.07)] text-[#A67C52] text-[13px] font-semibold group-hover:bg-[#A67C52]/10 transition-colors">
            <ZoomIn className="w-[15px] h-[15px]" />
            Ampliar imagem
          </span>
        </button>
      </div>

      {isLightboxOpen && (
        <OrientationImageLightbox image={image} onClose={() => setIsLightboxOpen(false)} />
      )}
    </>
  );
};

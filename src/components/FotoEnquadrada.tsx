import React from 'react';
import { EnquadramentoDaFoto } from '../types';
import { estiloDaFotoEnquadrada } from '../utils/enquadramentoDaFoto';

interface FotoEnquadradaProps {
  src: string;
  alt?: string;
  /** Posição salva para a visualização onde a foto está. Ausente = centralizada. */
  enquadramento?: EnquadramentoDaFoto | null;
  /** Tamanho e cantos do recipiente — a foto sempre o cobre inteiro. Não passe posicionamento. */
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Foto que cobre o recipiente na posição ajustada para aquela visualização (menu, catálogo ou
 * cartão). Sem ajuste, o resultado é o mesmo `object-cover` centralizado de antes.
 */
export const FotoEnquadrada: React.FC<FotoEnquadradaProps> = ({
  src,
  alt = '',
  enquadramento,
  className = '',
  style,
}) => (
  <div className={`relative overflow-hidden ${className}`} style={style}>
    <img
      src={src}
      alt={alt}
      draggable={false}
      referrerPolicy="no-referrer"
      className="block"
      style={estiloDaFotoEnquadrada(enquadramento)}
    />
  </div>
);

import React from 'react';
import { EnquadramentoDaFoto } from '../types';
import { desenhoDaFoto } from '../utils/enquadramentoDaFoto';

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
 * Foto na posição ajustada para aquela visualização (lista, catálogo ou card individual). Sem
 * ajuste, o resultado é o mesmo `object-cover` centralizado de antes. Girada ou encolhida para
 * caber, o que sobra do recipiente fica preto (ver `desenhoDaFoto`).
 */
export const FotoEnquadrada: React.FC<FotoEnquadradaProps> = ({
  src,
  alt = '',
  enquadramento,
  className = '',
  style,
}) => {
  const desenho = desenhoDaFoto(enquadramento);
  const img = (
    <img
      src={src}
      alt={alt}
      draggable={false}
      referrerPolicy="no-referrer"
      className="block"
      style={desenho.foto}
    />
  );
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ ...style, ...desenho.moldura }}>
      {desenho.caixa ? <div style={desenho.caixa}>{img}</div> : img}
    </div>
  );
};

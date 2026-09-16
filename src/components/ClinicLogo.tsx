import React from 'react';

/**
 * Logo que veio no seed inicial do Firestore: uma foto de banco de imagens que nunca foi a marca
 * da clínica — o campo existia no perfil, mas nenhuma tela o exibia. Agora que o logo aparece de
 * verdade, esse valor é tratado como "sem logo", senão a foto genérica viraria a marca sozinha.
 */
const SEED_PLACEHOLDER_LOGO = 'https://images.unsplash.com/photo-1579684385127-1ef15d508118';

/** Devolve o logo realmente enviado pela clínica, ou `undefined` para cair no monograma. */
export function resolveClinicLogoUrl(logoUrl?: string): string | undefined {
  const url = logoUrl?.trim();
  if (!url || url.startsWith(SEED_PLACEHOLDER_LOGO)) return undefined;
  return url;
}

/** Iniciais das duas primeiras palavras do nome da clínica — "La Vie ..." vira "LV". */
export function clinicMonogram(name?: string): string {
  const initials = (name || '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('');
  return (initials || 'LV').toUpperCase();
}

interface ClinicLogoProps {
  clinic: { name?: string; logoUrl?: string };
  /** Classes do quadro — tamanho, cantos, alinhamento. Valem com e sem logo enviado. */
  className?: string;
  /** Classes só do monograma (fundo, borda, tipografia); somem quando há logo enviado. */
  monogramClassName?: string;
  /** Estilos do quadro, para as telas de impressão que montam o layout sem Tailwind. */
  style?: React.CSSProperties;
  /** Estilos só do monograma, mesma regra do `monogramClassName`. */
  monogramStyle?: React.CSSProperties;
  /** `contain` (padrão) preserva a arte inteira; `cover` preenche o quadro. */
  fit?: 'contain' | 'cover';
}

/**
 * Marca da clínica: o logo enviado nas configurações ou, enquanto não houver um, o monograma
 * escuro com as iniciais. As duas versões ocupam exatamente o mesmo quadro, então quem usa o
 * componente não precisa mudar o layout quando o logo entra.
 */
export const ClinicLogo: React.FC<ClinicLogoProps> = ({
  clinic,
  className = '',
  monogramClassName = '',
  style,
  monogramStyle,
  fit = 'contain',
}) => {
  const logoUrl = resolveClinicLogoUrl(clinic.logoUrl);

  if (logoUrl) {
    return (
      <span
        className={`inline-flex items-center justify-center overflow-hidden ${className}`}
        style={style}
      >
        <img
          src={logoUrl}
          alt={clinic.name ? `Logo — ${clinic.name}` : 'Logo da clínica'}
          className={`w-full h-full ${fit === 'cover' ? 'object-cover' : 'object-contain'} block`}
          referrerPolicy="no-referrer"
        />
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center justify-center overflow-hidden ${className} ${monogramClassName}`}
      style={{ ...style, ...monogramStyle }}
    >
      {clinicMonogram(clinic.name)}
    </span>
  );
};

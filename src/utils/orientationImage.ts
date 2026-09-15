import { AnamnesisTemplate, OrientationImage } from '../types';

type OrientationImageSource = Pick<
  AnamnesisTemplate,
  'imagemOrientativaUrl' | 'imagemOrientativaTitulo' | 'imagemOrientativaDescricao'
>;

/**
 * Normalizes the three loose `imagemOrientativa*` fields of a template into a single object,
 * or null when no image was configured. Every screen that shows the orientation image (formulário
 * online, ficha presencial, PDF) goes through here, so "existe imagem?" is decided in one place.
 */
export function resolveOrientationImage(
  template?: OrientationImageSource | null
): OrientationImage | null {
  const url = template?.imagemOrientativaUrl?.trim();
  if (!url) return null;

  return {
    url,
    titulo: template?.imagemOrientativaTitulo?.trim() || undefined,
    descricao: template?.imagemOrientativaDescricao?.trim() || undefined,
  };
}

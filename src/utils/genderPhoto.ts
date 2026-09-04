import { AnamnesisTemplate, PatientGender } from '../types';

/**
 * Resolves which reference photo to use for a template based on the patient's gender.
 * Falls back to the legacy single `fotoModeloUrl` when no gender-specific photo is set,
 * so templates created before the male/female split keep working.
 */
export function resolveTemplatePhoto(
  template: Pick<AnamnesisTemplate, 'fotoModeloUrl' | 'fotoModeloFemininoUrl' | 'fotoModeloMasculinoUrl'>,
  genero?: PatientGender
): string | undefined {
  if (genero === 'masculino') {
    return template.fotoModeloMasculinoUrl || template.fotoModeloUrl;
  }
  if (genero === 'feminino') {
    return template.fotoModeloFemininoUrl || template.fotoModeloUrl;
  }
  return template.fotoModeloUrl;
}

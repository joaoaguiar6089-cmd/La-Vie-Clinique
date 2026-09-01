import { Procedure, ClinicProfile, Professional } from '../types';

export interface DoctorDisplayInfo {
  name: string;
  specialty?: string;
  photoUrl?: string;
}

/**
 * Strips any professional registry text (e.g. CRM 1234, CRBM 28.450, CRO, COREN, Responsável Técnica, etc.)
 */
export function cleanDoctorNameOnly(name: string): string {
  if (!name) return '';
  return name
    .replace(/\s*\([^)]*(?:CRM|CRBM|CRO|COREN|CREFITO|Registro|Respons[aá]vel|R\.T\.|RT|\d{4,})[^)]*\)/gi, '')
    .replace(/\s*•\s*(?:CRM|CRBM|CRO|COREN|CREFITO|Registro|Respons[aá]vel|R\.T\.|RT|\d{4,}).*$/gi, '')
    .replace(/\s*-\s*(?:CRM|CRBM|CRO|COREN|CREFITO|Registro|Respons[aá]vel|R\.T\.|RT|\d{4,}).*$/gi, '')
    .trim();
}

/**
 * Resolves doctor names and their specialties for a given procedure, ensuring no registry numbers are shown.
 * Prioritizes the exact title/specialty set in clinic settings.
 */
export function getProcedureDoctors(
  proc: Procedure,
  clinic: ClinicProfile
): DoctorDisplayInfo[] {
  const result: DoctorDisplayInfo[] = [];

  // 1. By assignedDoctorIds from clinic.professionals
  if (proc.assignedDoctorIds && proc.assignedDoctorIds.length > 0 && clinic.professionals && clinic.professionals.length > 0) {
    proc.assignedDoctorIds.forEach((docId) => {
      const found = clinic.professionals.find((p) => p.id === docId);
      if (found) {
        result.push({
          name: cleanDoctorNameOnly(found.name),
          specialty: found.title || found.specialty || clinic.professionalTitle || undefined,
        });
      }
    });
  }

  // 2. By assignedDoctorNames (custom / legacy entries)
  if (result.length === 0 && proc.assignedDoctorNames && proc.assignedDoctorNames.length > 0) {
    proc.assignedDoctorNames.forEach((rawName) => {
      // Check if custom name has format "Name (Specialty)" or "Name • Specialty"
      let cleanName = cleanDoctorNameOnly(rawName);
      let specialty: string | undefined = undefined;

      const specMatch = rawName.match(/^([^(•]+?)(?:\s*\(([^)]+)\)|\s*•\s*(.+))$/);
      if (specMatch) {
        cleanName = cleanDoctorNameOnly(specMatch[1]);
        const potentialSpec = (specMatch[2] || specMatch[3] || '').trim();
        // If not a registry number, treat as specialty
        if (!/(?:CRM|CRBM|CRO|COREN|CREFITO|Registro|Respons[aá]vel|R\.T\.|RT)/i.test(potentialSpec)) {
          specialty = potentialSpec;
        }
      }

      // Try matching with clinic professionals
      const matched = clinic.professionals?.find(
        (p) => cleanDoctorNameOnly(p.name).toLowerCase() === cleanName.toLowerCase()
      );

      result.push({
        name: cleanName,
        specialty: specialty || matched?.title || matched?.specialty || clinic.professionalTitle || undefined,
      });
    });
  }

  // 3. Fallback to primary clinic professional
  if (result.length === 0) {
    if (clinic.professionals && clinic.professionals.length > 0) {
      const first = clinic.professionals[0];
      result.push({
        name: cleanDoctorNameOnly(first.name),
        specialty: first.title || first.specialty || clinic.professionalTitle || undefined,
      });
    } else if (clinic.professionalName) {
      result.push({
        name: cleanDoctorNameOnly(clinic.professionalName),
        specialty: clinic.professionalTitle || undefined,
      });
    } else {
      result.push({
        name: 'Dra. Karoline Ferreira',
        specialty: clinic.professionalTitle || 'Estética Avançada',
      });
    }
  }

  return result;
}

/**
 * Returns all clinic professionals for catalog cover / team sections with name and specialty only.
 * Follows precisely the title / specialty set in clinic settings.
 */
export function getClinicDoctors(clinic: ClinicProfile): DoctorDisplayInfo[] {
  if (clinic.professionals && clinic.professionals.length > 0) {
    return clinic.professionals.map((p) => ({
      name: cleanDoctorNameOnly(p.name),
      specialty: p.title || p.specialty || clinic.professionalTitle || undefined,
      photoUrl: p.photoUrl || undefined,
    }));
  }

  if (clinic.professionalName) {
    return [
      {
        name: cleanDoctorNameOnly(clinic.professionalName),
        specialty: clinic.professionalTitle || undefined,
      },
    ];
  }

  return [
    {
      name: 'Dra. Karoline Ferreira',
      specialty: clinic.professionalTitle || 'Estética Avançada & Tecnologias',
    },
  ];
}

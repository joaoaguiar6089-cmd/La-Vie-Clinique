export interface Professional {
  id: string;
  name: string; // e.g. "Dra. Marcella Ribeiro"
  registryNumber: string; // e.g. "CRBM 28.450" or "CRM 184.920"
  title: string; // e.g. "Biomédica Esteta" or "Dermatologista"
  specialty?: string;
  phone?: string;
  instagram?: string;
  photoUrl?: string;
}

export interface Procedure {
  id: string;
  title: string;
  subtitle?: string;
  category: string;
  description: string;
  price: number;
  promotionalPrice?: number;
  priceNote?: string; // e.g. "por sessão", "a partir de", "pacote 3 sessões", "área"
  duration?: string; // e.g. "45 min", "1h 30min"
  sessionsRecommended?: string; // e.g. "1 a 3 sessões anuais", "4 a 6 sessões quinzenais"
  recoveryTime?: string; // e.g. "Sem downtime", "24 a 48h com leve vermelhidão"
  images: string[];
  benefits: string[];
  areasTreated?: string[];
  contraindications?: string;
  idealCandidate?: string;
  isFeatured?: boolean;
  assignedDoctorIds?: string[]; // IDs of assigned doctors
  assignedDoctorNames?: string[]; // Names/credentials for display or custom entry
  order: number;
  createdAt: string;
  updatedAt?: string;
}

export interface ClinicProfile {
  name: string;
  tagline: string;
  professionalName?: string; // legacy fallback
  professionalTitle?: string;
  registryNumber?: string;
  professionals: Professional[]; // Clinical team & registered doctors
  phone: string; // WhatsApp
  email?: string;
  instagram: string;
  address: string;
  cityState: string;
  logoUrl?: string;
  watermarkEnabled?: boolean;
  coverBannerUrl?: string;
  catalogWelcomeNote?: string;
  consultationNote?: string;
}

export interface FilterState {
  search: string;
  category: string;
  sortBy: 'featured' | 'price-asc' | 'price-desc' | 'title-asc' | 'recent';
  onlyFeatured: boolean;
  minPrice?: number;
  maxPrice?: number;
}

// ==========================================
// MÓDULO DE FICHAS DE ANAMNESE — TIPOS
// ==========================================

export type QuestionFieldType =
  | 'texto_curto'
  | 'texto_longo'
  | 'numero'
  | 'data'
  | 'unica_escolha'
  | 'multipla_escolha'
  | 'escala'
  | 'sim_nao';

export interface AnamnesisQuestion {
  id: string;
  texto: string;
  tipo_campo: QuestionFieldType;
  opcoes?: string[]; // Opções para unica_escolha ou multipla_escolha
  escalaMax?: number; // 5 ou 10 para escala
  obrigatoria: boolean;
  ordem: number;
  ajuda?: string;
}

export interface AnamnesisTemplate {
  id: string; // Ex: 'tpl-botox'
  procedimentoId?: string; // ID do procedimento do catálogo (se vinculado)
  procedimentoNome: string; // Ex: 'Botox', 'HIFU - Ultrassom Microfocado'
  categoria?: string;
  tem_foto: boolean; // Se true, exibe campo de upload de foto para posterior anotação manual
  fotoModeloUrl?: string; // Foto de referência / foto do doutor / mapa anatômico carregado pelo profissional na edição da ficha
  perguntasEspecificas: AnamnesisQuestion[];
  descricao?: string;
  updatedAt?: string;
}

export interface Patient {
  id: string;
  nome: string;
  contato?: string; // Telefone / WhatsApp
  dataNascimento?: string; // YYYY-MM-DD
  cpf?: string;
  email?: string;
  observacoes?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface AnamnesisRecord {
  id: string;
  pacienteId: string;
  pacienteNome: string;
  pacienteContato?: string;
  pacienteDataNascimento?: string;
  procedimentoId?: string;
  procedimentoNome: string;
  dataAtendimento: string; // YYYY-MM-DD ou ISO
  profissionalNome?: string; // Esteticista ou médica responsável
  respostasGerais: Record<string, any>; // questionId -> valor
  respostasEspecificas: Record<string, any>; // questionId -> valor
  fotoModeloUrl?: string; // Foto do doutor / mapa anatômico de referência herdado do modelo
  fotoPacienteUrl?: string; // Foto real enviada pelo paciente online ou tirada na clínica
  fotoUrl?: string; // Retrocompatibilidade (espelha fotoPacienteUrl)
  perguntasSnapshot: {
    gerais: AnamnesisQuestion[];
    especificas: AnamnesisQuestion[];
  };
  observacoesFinais?: string;
  origemPreenchimento?: 'online_paciente' | 'presencial_clinica';
  createdAt: string;
  updatedAt?: string;
}


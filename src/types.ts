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
  isStartingPrice?: boolean; // Quando true, exibe a opção "A partir de" antes do valor
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

export type QuestionAudience = 'paciente' | 'medico';

export interface AnamnesisQuestion {
  id: string;
  texto: string;
  tipo_campo: QuestionFieldType;
  opcoes?: string[]; // Opções para unica_escolha ou multipla_escolha
  escalaMax?: number; // 5 ou 10 para escala
  obrigatoria: boolean;
  ordem: number;
  ajuda?: string;
  publicoAlvo?: QuestionAudience; // Quem responde esta pergunta. Ausente = 'paciente' (padrão retrocompatível)
}

export type PatientGender = 'feminino' | 'masculino';

export interface AnamnesisTemplate {
  id: string; // Ex: 'tpl-botox'
  procedimentoId?: string; // ID do procedimento do catálogo (se vinculado)
  procedimentoNome: string; // Ex: 'Botox', 'HIFU - Ultrassom Microfocado'
  categoria?: string;
  tem_foto: boolean; // Se true, exibe campo de upload de foto para posterior anotação manual
  fotoModeloUrl?: string; // Legado/fallback — usado quando não há foto específica por gênero
  fotoModeloFemininoUrl?: string; // Foto/mapa anatômico de referência — versão feminina
  fotoModeloMasculinoUrl?: string; // Foto/mapa anatômico de referência — versão masculina
  perguntasEspecificas: AnamnesisQuestion[];
  descricao?: string;
  updatedAt?: string;
}

export interface Patient {
  id: string;
  nome: string;
  contato?: string; // Telefone / WhatsApp
  dataNascimento?: string; // YYYY-MM-DD
  genero?: PatientGender;
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
  pacienteGenero?: PatientGender;
  procedimentoId?: string;
  templateId?: string; // ID da ficha-modelo (AnamnesisTemplate.id) usada para gerar este registro
  procedimentoNome: string;
  dataAtendimento: string; // YYYY-MM-DD ou ISO
  professionalId?: string; // ID em ClinicProfile.professionals — fonte de verdade do profissional responsável
  profissionalNome?: string; // Nome do profissional no momento do registro (espelha professionalId; mantido para fichas antigas sem ID)
  respostasGerais: Record<string, any>; // questionId -> valor (perguntas gerais, ambos os públicos)
  respostasEspecificas: Record<string, any>; // questionId -> valor (perguntas específicas, ambos os públicos)
  respostasProfissional?: Record<string, any>; // questionId -> valor, respostas exclusivas do profissional (publicoAlvo='medico')
  profissionalPreenchidoEm?: string; // ISO timestamp da 1ª vez que o profissional salvou sua parte — presença trava a edição do paciente
  fotoModeloUrl?: string; // Foto do doutor / mapa anatômico de referência, já resolvida pelo gênero do paciente no momento da criação
  fotoModeloAnotadaUrl?: string; // Versão da foto de referência com anotações do profissional (imagem "achatada", usada no PDF)
  fotoModeloAnotacoesJson?: string; // Estado do canvas de anotação (JSON do Fabric.js) para permitir reabrir e continuar editando
  fotoPacienteUrl?: string; // Foto real enviada pelo paciente online ou tirada na clínica
  fotoPacienteAnotadaUrl?: string; // Versão da foto do paciente com anotações do profissional (imagem "achatada", usada no PDF)
  fotoPacienteAnotacoesJson?: string; // Estado do canvas de anotação (JSON do Fabric.js) da foto do paciente, para permitir reabrir e continuar editando
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


export interface Professional {
  id: string;
  name: string; // e.g. "Dra. Marcella Ribeiro"
  registryNumber: string; // e.g. "CRBM 28.450" or "CRM 184.920"
  title: string; // e.g. "Biomédica Esteta" or "Dermatologista"
  specialty?: string;
  phone?: string;
  instagram?: string;
  photoUrl?: string;
  email?: string; // E-mail de login (Firebase Auth) — ausente = ainda sem conta de acesso
  uid?: string; // UID do Firebase Auth vinculado, presente somente após "Criar login"
  isAdmin?: boolean; // Concede acesso administrativo (gerenciar contas de outras profissionais)
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
  quoteDetails?: QuoteItemDetail[]; // "Detalhes para orçamento" — pares título/resposta que pré-preenchem o item no orçamento
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
  /**
   * Endereço público do app, usado como base dos links enviados à paciente (ficha de anamnese,
   * orçamento e QR Code do catálogo). Vazio = usa o endereço da janela em que a equipe está.
   * Ver `utils/publicLinks.ts`.
   */
  publicBaseUrl?: string;
  logoUrl?: string;
  watermarkEnabled?: boolean;
  coverBannerUrl?: string;
  catalogWelcomeNote?: string;
  consultationNote?: string;
  // Módulo de orçamentos — ausentes = usar QUOTE_DEFAULTS de utils/quoteCalc.ts
  quoteValidityDays?: number; // Prazo padrão de validade, em dias (padrão 30)
  quoteCombinedDiscountPerItem?: number; // % sugerido por procedimento no desconto de plano combinado (padrão 2)
  quoteCombinedDiscountCap?: number; // Teto do desconto de plano combinado, em % (padrão 10)
  quoteLegalNotice?: string; // Aviso legal do rodapé do orçamento
  quoteOpeningTemplate?: string; // Mensagem de abertura sugerida; aceita {primeiroNome}
}

/** Telas do painel autenticado — a navegação é por estado, o app não tem rotas. */
export type AppView = 'procedures' | 'patients' | 'anamnesis' | 'quotes';

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

/**
 * Imagem orientativa do procedimento — um mapa anatômico, esquema ou infográfico produzido pela
 * clínica para explicar ao paciente a região tratada. Diferente de `fotoModelo*`, que é a tela de
 * anotação do profissional: esta é material didático, exibido ao paciente enquanto ele preenche a
 * ficha e reproduzido no PDF exatamente na mesma proporção do arquivo original.
 */
export interface OrientationImage {
  url: string;
  titulo?: string;
  descricao?: string;
}

/**
 * Um bloco do Termo de Consentimento e Responsabilidade — título ("Contra indicação") seguido do
 * texto corrido que a clínica escreve. Título e texto são livres, e a lista é aberta: a equipe
 * renomeia, exclui e acrescenta blocos conforme o protocolo do ativo usado.
 */
export interface ConsentTermSection {
  id: string;
  titulo: string;
  /** Texto livre; quebras de linha são preservadas na exibição e na impressão. */
  texto: string;
}

export interface AnamnesisTemplate {
  id: string; // Ex: 'tpl-botox'
  procedimentoId?: string; // ID do procedimento do catálogo (se vinculado)
  procedimentoNome: string; // Ex: 'Botox', 'HIFU - Ultrassom Microfocado'
  categoria?: string;
  tem_foto: boolean; // Se true, exibe campo de upload de foto para posterior anotação manual
  fotoModeloUrl?: string; // Legado/fallback — usado quando não há foto específica por gênero
  fotoModeloFemininoUrl?: string; // Foto/mapa anatômico de referência — versão feminina
  fotoModeloMasculinoUrl?: string; // Foto/mapa anatômico de referência — versão masculina
  /**
   * Imagem orientativa mostrada ao paciente. Fica só aqui (não é copiada para cada
   * `AnamnesisRecord`): a ficha impressa a resolve pelo `templateId` no momento de renderizar, o
   * que evita somar mais um base64 ao documento do registro — que já carrega foto de referência,
   * foto do paciente e as versões anotadas, e tem o teto de 1MB do Firestore para respeitar.
   */
  imagemOrientativaUrl?: string;
  imagemOrientativaTitulo?: string;
  imagemOrientativaDescricao?: string;
  /** Liga o Termo de Consentimento e Responsabilidade nesta ficha. */
  termoConsentimentoAtivo?: boolean;
  /** Blocos do termo, na ordem em que saem na ficha. Vive só na ficha-modelo, como a imagem orientativa. */
  termoConsentimentoSecoes?: ConsentTermSection[];
  perguntasEspecificas: AnamnesisQuestion[];
  descricao?: string;
  /**
   * Migrações de conteúdo já aplicadas a esta ficha (ex.: 'gluteo-perguntas-profissional-v1').
   *
   * Mora no documento, e não no localStorage, porque a pergunta que ela responde é sobre a
   * clínica, não sobre o navegador: uma marca local faria a migração rodar de novo em cada
   * aparelho novo e ressuscitar perguntas que a equipe tivesse apagado de propósito.
   */
  migracoesAplicadas?: string[];
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

// ==========================================
// MÓDULO DE ORÇAMENTOS — TIPOS
// ==========================================

/** Par título/resposta exibido na grade de detalhes do procedimento. */
export interface QuoteItemDetail {
  id: string;
  titulo: string; // "Áreas tratadas", "Volume por sessão"
  valor: string; // "Testa, glabela e periorbital", "3 ml"
}

export interface QuoteItem {
  id: string;
  procedureId?: string; // Origem no catálogo; ausente quando o item foi digitado à mão
  categoria: string;
  titulo: string;
  professionalId?: string; // Quem realiza ESTE procedimento — cada item pode ter a sua
  profissionalNome?: string; // Espelha o nome no momento da emissão, para o documento
  valorTabela: number; // Nasce de Procedure.promotionalPrice ?? price, editável
  temDesconto: boolean;
  valorComDesconto?: number; // Novo valor digitado; o percentual exibido é derivado, nunca digitado
  maisDeUmaSessao: boolean;
  sessoes: number; // 1 quando maisDeUmaSessao = false. Informativo: NÃO multiplica o valor
  detalhes: QuoteItemDetail[];
}

export type PaymentMethod = 'pix' | 'cartao' | 'dinheiro';

/**
 * Uma forma de pagamento aceita para este orçamento. Pode haver mais de uma — por
 * exemplo Pix à vista OU cartão parcelado — cada uma listada como uma linha
 * independente, com seu próprio valor e desconto.
 */
export interface QuotePaymentOption {
  id: string;
  forma: PaymentMethod;
  parcelas?: number; // 1 a 12, somente quando forma === 'cartao'
  parcelasSemJuros?: number; // Até qual parcela a operadora não cobra juros; acima disso o PDF avisa
  temDesconto: boolean;
  descontoPercentual?: number; // Abate do valor desta opção
}

/** Seção de pagamento: uma ou mais formas aceitas, mais a negociação em texto livre. */
export interface QuotePayment {
  opcoes: QuotePaymentOption[]; // Sempre ao menos uma
  negociacao?: string; // Texto livre — sai como nota abaixo das formas de pagamento
}

/**
 * Status gravado no documento. `expirado` nunca é gravado: deriva da validade.
 * `cancelado` é o "excluir" de um orçamento já enviado — o registro sobrevive para
 * que o link que a paciente recebeu consiga avisar que ele não vale mais.
 */
export type QuoteStoredStatus = 'rascunho' | 'enviado' | 'aceito' | 'cancelado';

/** Status exibido na interface, já considerando a data de validade. */
export type QuoteStatus = QuoteStoredStatus | 'expirado';

/**
 * Retrato dos dados da clínica no momento da emissão. Existe por dois motivos:
 * a página pública do link não tem login e as regras não deixam ela ler
 * `clinic_settings` (que guarda e-mails e UIDs de acesso das profissionais); e um
 * orçamento já enviado deve preservar o contato que a paciente recebeu.
 */
export interface QuoteClinicSnapshot {
  name: string;
  tagline?: string;
  cityState?: string;
  phone?: string;
  email?: string;
  instagram?: string;
  legalNotice: string;
}

/** Referência a outro orçamento na cadeia de substituição. */
export interface QuoteReference {
  id: string;
  numero: string;
}

export interface Quote {
  id: string; // crypto.randomUUID() — o link público é secreto por ser imprevisível
  numero: string; // "2026-0148", gerado no 1º salvamento e imutável a partir dali
  ano: number;
  sequencia: number;
  status: QuoteStoredStatus;
  dataEmissao: string; // ISO
  dataValidade: string; // ISO — emissão + ClinicProfile.quoteValidityDays, editável
  pacienteId?: string; // Ausente quando é paciente avulso, digitado na hora
  pacienteNome: string;
  pacienteContato?: string;
  jaTeveAvaliacao: boolean;
  dataAvaliacao?: string; // Só aparece no PDF quando jaTeveAvaliacao
  // Sem "responsável pelo orçamento": cada procedimento tem sua própria profissional
  // (QuoteItem.professionalId), porque nem sempre é a mesma pessoa que faz tudo.
  textoApresentacao: string;
  itens: QuoteItem[];
  temDescontoCombinado: boolean;
  descontoCombinadoPercentual?: number; // Digitado; sugestão = 2% × nº de itens, limitada ao teto
  pagamento: QuotePayment;
  observacoes?: string;
  clinica?: QuoteClinicSnapshot; // Ausente só em orçamentos criados antes deste campo existir
  total: number; // Snapshot denormalizado apenas para a listagem — a verdade é calcularOrcamento()
  enviadoEm?: string; // ISO do 1º compartilhamento do link; presença trava a edição
  substituidoPor?: QuoteReference; // Preenchido no antigo quando um novo o substitui
  substituiu?: QuoteReference; // Preenchido no novo, apontando para o que ele substituiu
  createdAt: string;
  updatedAt?: string;
}

/**
 * Campos que o formulário edita. Fora daqui ficam id, numero, ano, sequencia e as
 * datas de controle: quem gera esses é o serviço, na transação do primeiro salvamento.
 */
export type QuoteDraft = Omit<
  Quote,
  'id' | 'numero' | 'ano' | 'sequencia' | 'status' | 'enviadoEm' | 'substituidoPor' | 'substituiu' | 'createdAt' | 'updatedAt'
>;


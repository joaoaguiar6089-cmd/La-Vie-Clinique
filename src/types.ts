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

// ==========================================
// MAPA CORPORAL DA DEPILAÇÃO A LASER — TIPOS
// ==========================================

/** Qual dos dois manequins. Uma área nunca atravessa as duas: ela é frente OU costas. */
export type LaserVista = 'frente' | 'costas';

/**
 * A região do corpo onde este procedimento de laser é aplicado, desenhada por cima do manequim.
 *
 * Mora dentro do próprio `Procedure` (e não numa coleção à parte) por três motivos: um polígono
 * simplificado ocupa ~500 bytes, longe do teto de 1 MB do documento; apagar o procedimento apaga
 * a área junto, sem órfãos; e o catálogo já vive em memória, então o mapa monta sem leitura extra.
 *
 * As coordenadas são **relativas à imagem** (0–1), não em pixels — é isso que deixa o mesmo
 * desenho servir ao manequim gigante do cadastro e ao pequeno do celular. Por consequência,
 * trocar a imagem do manequim por uma de proporção diferente desloca todas as áreas; ver
 * `LASER_MANEQUIM_MAX_LADO` e a trava de proporção em `utils/laserAreas.ts`.
 */
export interface LaserArea {
  id: string;
  vista: LaserVista;
  /**
   * Uma ou mais formas fechadas, cada uma como `[x1,y1,x2,y2,...]` em 0–1 com 3 casas decimais.
   * Mais de uma porque várias regiões são simétricas e descontínuas: "Axilas" são duas manchas,
   * "Maçã do Rosto" são duas. Um contorno em U ligando os dois lados seria mentira anatômica.
   */
  formas: number[][];
  /** Posição do botão arrastada à mão, em 0–1. Ausente = o anel calcula sozinho. */
  botao?: { x: number; y: number };
}

/**
 * Referência enxuta a uma área, para quem só precisa saber *qual* foi escolhida.
 *
 * Guarda o nome junto com o ID de propósito: a ficha de uma paciente atendida em março precisa
 * continuar dizendo "Virilha Completa" mesmo que o procedimento seja renomeado ou saia do
 * catálogo depois — mesma razão pela qual `QuoteItem` espelha `profissionalNome`.
 */
export interface LaserAreaRef {
  procedureId: string;
  nomeCurto: string;
}

/**
 * Campos que toda área de laser herda da categoria em vez de repetir. Contraindicação,
 * recuperação e candidato ideal não mudam de buço para axila, e mantê-los em 13 cópias
 * significa, na prática, que uma correção clínica nunca chega a todas.
 *
 * A herança é **viva**: o procedimento só guarda o campo quando ele é editado ali; vazio = usa o
 * padrão, resolvido na leitura por `resolverCamposDoLaser()`.
 */
export interface LaserCategoryDefaults {
  /**
   * Texto comercial do procedimento. Entra aqui, e não só nos campos clínicos, porque no laser ele
   * também é o mesmo em todas as áreas — o que muda de buço para axila é o preço, não a explicação
   * do que o laser de diodo faz.
   */
  description?: string;
  recoveryTime?: string;
  contraindications?: string;
  idealCandidate?: string;
}

/**
 * Espelho público do mapa, em `clinic_settings/laser_body_map`.
 *
 * Existe porque `procedures` exige login para leitura (`firestore.rules`) e a paciente preenche a
 * anamnese sem conta — sem este documento, a página pública não enxerga área nenhuma. Leva só o
 * necessário para desenhar e escolher: **nunca preço**, que é a mesma razão pela qual
 * `clinic_settings/public_profile` não leva os e-mails da equipe.
 */
export interface LaserBodyMapEntry {
  procedureId: string;
  nomeCurto: string;
  vista: LaserVista;
  formas: number[][];
  botao?: { x: number; y: number };
}

export interface LaserBodyMap {
  manequimFrenteUrl?: string;
  manequimCostasUrl?: string;
  areas: LaserBodyMapEntry[];
  updatedAt?: string;
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
  /**
   * Regiões deste procedimento no manequim. Só existe quando `isLaserCategory(category)` — trocar
   * a categoria para fora do laser descarta o desenho (com aviso), porque uma área sem manequim
   * onde aparecer é lixo que ninguém vê para apagar.
   */
  laserAreas?: LaserArea[];
  order: number;
  createdAt: string;
  updatedAt?: string;
}

/**
 * Um dia do expediente da clínica. `abre` ausente = fechado nesse dia.
 *
 * Lista de objetos e não matriz indexada por dia: o Firestore não aceita array dentro de array, e
 * um registro com `diaSemana` explícito sobrevive a backup reimportado fora de ordem.
 */
export interface AgendaExpedienteDia {
  diaSemana: number; // 0 = domingo … 6 = sábado
  abre?: string; // HH:MM
  fecha?: string; // HH:MM
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
  // Módulo de agenda — ausentes = usar AGENDA_DEFAULTS de utils/agenda.ts
  /** Expediente por dia da semana. Só pinta a grade: encaixe fora do horário continua permitido. */
  agendaExpediente?: AgendaExpedienteDia[];
  agendaIntervaloMin?: number; // Granularidade da grade em minutos: 15, 30 ou 60 (padrão 30)
  agendaConfirmacaoTemplate?: string; // Mensagem de confirmação no WhatsApp; ver `mensagemDeConfirmacao`
  /**
   * Mapa corporal da depilação a laser — os dois manequins sobre os quais as áreas são desenhadas.
   * Sem sexo, aproveitados para ambos os gêneros: as áreas são desenhadas uma vez só.
   *
   * As duas precisam ter a **mesma proporção**, imposta no envio. As áreas guardam coordenadas
   * relativas à imagem, então uma troca por proporção diferente jogaria a virilha na coxa.
   */
  laserManequimFrenteUrl?: string;
  laserManequimCostasUrl?: string;
  /** Campos herdados por toda área de laser. Ver `LaserCategoryDefaults`. */
  laserPadroes?: LaserCategoryDefaults;
}

/** Telas do painel autenticado — a navegação é por estado, o app não tem rotas. */
export type AppView =
  | 'hoje'
  | 'agenda'
  | 'procedures'
  | 'patients'
  | 'anamnesis'
  | 'evaluations'
  | 'quotes';

/**
 * Um pedido de navegação vindo de outra tela — da busca global, de um card da tela Hoje, de
 * um card de pendência.
 *
 * O `nonce` existe pelo mesmo motivo do `AnamnesisOpenRequest`: pedir duas vezes a mesma
 * coisa é um pedido novo, e sem ele a tela de destino não veria mudança alguma no objeto e
 * não reagiria na segunda vez.
 */
export interface PedidoDeNavegacao {
  view: AppView;
  /** Paciente a abrir, quando o destino é Pacientes. */
  pacienteId?: string;
  /** Abrir direto o formulário de criação do destino (novo agendamento, orçamento, paciente). */
  criarNovo?: boolean;
  /** Dia a focar, quando o destino é a Agenda. YYYY-MM-DD. */
  data?: string;
  /** Orçamento a abrir na prévia, quando o destino é Orçamentos. */
  quoteId?: string;
  /** Procedimento a abrir nos detalhes, quando o destino é o catálogo. */
  procedureId?: string;
  nonce: number;
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
  /**
   * Some das listas e do compartilhamento de link, mas continua existindo.
   *
   * Nasceu para aposentar as 13 fichas de laser (uma por área, todas repetindo as mesmas 19
   * perguntas de segurança) sem quebrar as fichas já preenchidas que apontam para elas por
   * `templateId` — apagar de verdade faria uma anamnese assinada deixar de renderizar.
   */
  oculta?: boolean;
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
  /**
   * Respostas exclusivas do profissional. **Legado**: as perguntas `publicoAlvo: 'medico'`
   * mudaram para `EvaluationRecord`, uma por atendimento. Ficha nova nunca escreve aqui; ficha
   * antiga exibe o que gravou, em modo somente-leitura — e só o que foi de fato respondido,
   * porque pergunta em branco que ninguém mais pode responder é só um convite a abrir chamado.
   */
  respostasProfissional?: Record<string, any>;
  /**
   * ISO da 1ª vez que o profissional salvou sua parte. **Legado**, pela mesma razão acima, mas
   * continua sendo honrado como trava: nenhuma ficha travada hoje pode destravar por causa da
   * mudança. Em ficha nova, quem fecha é `anamneseFechada()` — ver `utils/evaluations.ts`.
   */
  profissionalPreenchidoEm?: string;
  /**
   * Encerramento manual da ficha pela equipe.
   *
   * A trava automática depende de existir atendimento realizado lançado no sistema. A clínica que
   * não usa o módulo de atendimentos com disciplina deixaria o link da paciente aberto
   * indefinidamente — este botão é a saída, e não depende de inferência nenhuma.
   */
  encerradaEm?: string; // ISO
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
  /**
   * Áreas do mapa corporal que a **paciente** marcou como pretendidas. Só IDs e nomes curtos —
   * os polígonos ficam no catálogo e no espelho público, nunca copiados para cá (o registro já
   * carrega fotos e tem o teto de 1 MB do Firestore para respeitar).
   */
  areasSolicitadas?: LaserAreaRef[];
  /**
   * Áreas que a **profissional** confirmou para tratamento. Nasce como cópia de
   * `areasSolicitadas` e é editável a partir dali.
   *
   * São dois campos e não um porque o que a paciente pediu é um dado clínico por si: com um só,
   * a profissional tirar a virilha apagaria o registro de que ela foi pedida. Mesmo espírito do
   * `publicoAlvo: 'paciente' | 'medico'` das perguntas.
   */
  areasConfirmadas?: LaserAreaRef[];
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
  /**
   * Liga a página do manequim com as áreas contratadas no PDF.
   *
   * Só o interruptor mora aqui — um booleano. O mapa em si vem de fora na hora de imprimir, para
   * não copiar ~10 KB de polígonos para dentro de cada orçamento emitido. Ausente = ligado.
   */
  mostrarMapaCorporal?: boolean;
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


// ==========================================
// MÓDULO DE ATENDIMENTOS — TIPOS
// ==========================================

/**
 * Situação de um agendamento. Só existe em registro que **nasceu com data futura**: o que foi
 * lançado para hoje ou para trás é fato consumado e não tem o que resolver.
 *
 * `remarcado` é estado final — o registro morre assim e um agendamento novo nasce ao lado, o que
 * preserva o rastro de que houve remarcação. Mudar a data no mesmo documento apagaria isso.
 */
export type AttendanceStatus = 'agendado' | 'compareceu' | 'faltou' | 'remarcado';

/**
 * Plano de sessões — "10 sessões de laser axilas". Agrupa os atendimentos numa linha só na lista
 * e é quem sabe o total contratado.
 *
 * Documento próprio, e não um campo repetido em cada atendimento, porque o total precisa de um
 * lugar único: com 10 cópias do número, basta alguém digitar 8 numa delas para o "3/10" passar a
 * mentir. O número da sessão, ao contrário, **não** é gravado em lugar nenhum — é contado na
 * leitura, o que faz excluir a 3ª sessão renumerar as outras sozinha.
 */
export interface SessionPlan {
  id: string;
  pacienteId: string;
  /** Origem no catálogo. Ausente quando o procedimento foi digitado à mão. */
  procedureId?: string;
  procedimentoNome: string;
  totalSessoes: number;
  /**
   * Encerramento é manual, nunca automático ao bater o total: a 11ª sessão de um plano de 10
   * (cortesia, retoque) acontece, e fechar sozinho no 10 impediria de registrá-la.
   */
  encerradoEm?: string; // ISO — presença = encerrado
  createdAt: string;
  updatedAt?: string;
}

/**
 * Uma visita: o que aconteceu, ou o que está marcado para acontecer.
 *
 * Diferente da ficha de anamnese, que é documento clínico assinado, isto é o diário da clínica —
 * data, hora, procedimento, quem atendeu e o que foi observado. Ninguém de fora enxerga (as
 * regras exigem login, ao contrário de `patients` e `anamnesis_records`, abertos porque a
 * paciente preenche a própria ficha sem conta).
 */
export interface Attendance {
  id: string;
  pacienteId: string;
  /** Espelha o nome no momento do registro, como fazem a ficha e o orçamento. */
  pacienteNome: string;
  data: string; // YYYY-MM-DD
  hora?: string; // HH:MM — opcional no realizado, obrigatória no agendamento
  /**
   * Quanto tempo a visita ocupa na agenda, em minutos.
   *
   * Nasce do `duration` do catálogo (texto livre, lido por `duracaoDoProcedimento`) e é editável:
   * o mesmo procedimento leva 30 min numa paciente e 50 noutra. Ausente = `AGENDA_DEFAULTS.duracaoMin`.
   *
   * Opcional de propósito — todo atendimento lançado antes da agenda existir não tem como saber
   * quanto durou, e chutar um número seria pior do que assumir o padrão às claras.
   */
  duracaoMin?: number;
  procedureId?: string;
  procedimentoNome: string;
  /** Vínculo com o plano. Ausente = sessão avulsa. */
  planoId?: string;
  professionalId?: string;
  profissionalNome?: string; // Congelado no registro, para o caso de a equipe mudar depois
  observacoes?: string;
  /**
   * Presente somente em quem nasceu agendamento. Ausência é o que distingue, para sempre, o
   * registro lançado como fato consumado daquele que um dia esteve marcado.
   */
  status?: AttendanceStatus;
  /** Data e hora originais do agendamento, guardadas quando a confirmação mudou a data. */
  agendadoPara?: string; // ISO
  /**
   * Marca de que existe `EvaluationRecord` para esta visita — só o instante, nunca o conteúdo.
   *
   * Está aqui para a lista mostrar o selo de "avaliada" e para a fila de pendentes se montar sem
   * uma leitura por linha. O peso da avaliação (respostas, snapshot, URLs de foto) fica de fora
   * de propósito: `subscribeToAttendances` baixa esta coleção inteira em toda sessão.
   */
  avaliacaoPreenchidaEm?: string; // ISO
  createdAt: string;
  updatedAt?: string;
}

// ==========================================
// MÓDULO DE FICHAS DE AVALIAÇÃO — TIPOS
// ==========================================

/**
 * Perguntas que a profissional responde **depois** do atendimento.
 *
 * Nasceu de dentro da anamnese, onde vivia como `publicoAlvo: 'medico'`, e saiu de lá por um
 * motivo de cardinalidade: a anamnese é **uma por caso** e a avaliação é **uma por sessão**. Numa
 * paciente com plano de 10 sessões de laser, deixar a avaliação presa à anamnese obrigaria a criar
 * uma anamnese nova a cada sessão — dez fichas de histórico de saúde idênticas — ou a sobrescrever
 * a avaliação da sessão anterior. As duas saídas perdem informação clínica.
 *
 * O vínculo é com o `Attendance`, e a regra de liberação está em `utils/evaluations.ts`.
 */

/**
 * O modelo: quais perguntas a clínica faz ao avaliar determinado procedimento.
 *
 * O vínculo é **plural** de propósito. A depilação a laser tem treze áreas no catálogo e uma
 * única avaliação (fototipo, cor e espessura do pelo não mudam de buço para axila): ligar por
 * `categorias` resolve as treze de uma vez, como `mapearTemplatesPorProcedimento` já faz na
 * anamnese. `procedureIds` cobre o caso oposto, do procedimento avulso.
 *
 * Quando os dois alcançam o mesmo procedimento, **o específico vence** — o contrário da ordem em
 * `mapearTemplatesPorProcedimento`, onde a categoria vem primeiro porque as fichas por área
 * estavam sendo aposentadas de propósito. Aqui não: quem criou ficha para uma área só quis
 * sobrepor a da categoria. Ver `fichaDeAvaliacaoPara()`.
 */
export interface EvaluationTemplate {
  id: string;
  /** Nome exibido. Livre, porque uma ficha pode cobrir vários procedimentos e não herda nome de nenhum. */
  nome: string;
  /** Procedimentos ligados um a um. */
  procedureIds?: string[];
  /** Categorias inteiras do catálogo — todo procedimento delas herda esta ficha. */
  categorias?: string[];
  perguntas: AnamnesisQuestion[];
  /** Liga o upload da foto daquela sessão (o registro de evolução), anotável como o mapa. */
  temFotoSessao: boolean;
  /**
   * Mapa anatômico que a profissional rabisca. Mesmo trio da anamnese, resolvido pelo mesmo
   * `resolveTemplatePhoto()` — o mapa do glúteo feminino não serve ao masculino, e uma imagem só
   * faria a migração descartar metade do que a clínica já tinha cadastrado.
   */
  fotoModeloUrl?: string;
  fotoModeloFemininoUrl?: string;
  fotoModeloMasculinoUrl?: string;
  descricao?: string;
  /** Mesma trava de `AnamnesisTemplate.migracoesAplicadas`: mora no documento, não no navegador. */
  migracoesAplicadas?: string[];
  updatedAt?: string;
}

/**
 * A avaliação de **um** atendimento.
 *
 * O `id` é o próprio `atendimentoId`. Isso resolve duas coisas de uma vez: a busca vira um
 * `getDoc` direto, sem query nem índice, e "uma avaliação por atendimento" deixa de ser uma regra
 * que alguém precisa lembrar de aplicar — passa a ser impossível de violar.
 *
 * Mora em coleção própria, e não dentro do `Attendance`, porque `subscribeToAttendances` assina a
 * coleção **inteira**: respostas e URLs de foto dentro do atendimento seriam baixadas por toda a
 * clínica em toda sessão, e cada correção de observação reescreveria o documento inteiro — a cota
 * do Firestore aqui é por KB gravado.
 */
export interface EvaluationRecord {
  /** Igual ao `Attendance.id` que esta avaliação descreve. */
  id: string;
  atendimentoId: string;
  pacienteId: string;
  /** Espelham o momento do registro, como fazem a ficha e o orçamento. */
  pacienteNome: string;
  pacienteGenero?: PatientGender;
  procedureId?: string;
  procedimentoNome: string;
  dataAtendimento: string; // YYYY-MM-DD, copiada do atendimento
  professionalId?: string;
  profissionalNome?: string;
  templateId?: string;
  respostas: Record<string, any>; // questionId -> valor
  /**
   * Só as perguntas **efetivamente respondidas**, e não a ficha-modelo inteira.
   *
   * Congelar é o que impede uma pergunta reescrita hoje de mudar o sentido de uma avaliação de
   * meses atrás — mesma razão do `perguntasSnapshot` da anamnese. Guardar só as respondidas é o
   * que evita pagar KB por pergunta em branco em todo registro.
   */
  perguntasSnapshot: AnamnesisQuestion[];
  fotoModeloUrl?: string;
  fotoModeloAnotadaUrl?: string;
  fotoModeloAnotacoesJson?: string;
  /** Foto daquela sessão — o registro de evolução, tirado na clínica. */
  fotoSessaoUrl?: string;
  fotoSessaoAnotadaUrl?: string;
  fotoSessaoAnotacoesJson?: string;
  /**
   * Nota clínica da avaliação. **Não** é o `Attendance.observacoes`, que é a nota da recepção
   * escrita ao lançar a visita ("chegou atrasada, trocou de procedimento") — e que é baixada com
   * a coleção inteira de atendimentos.
   */
  observacoes?: string;
  preenchidoEm: string; // ISO do 1º salvamento
  createdAt: string;
  updatedAt?: string;
}

import { Procedure, ClinicProfile, Professional } from '../types';

export const DEFAULT_CLINIC_PROFILE: ClinicProfile = {
  name: "La Vie - Clínica de Estética Facial e Corporal",
  tagline: "Estética Avançada, Tecnologias de Alta Performance e Cuidado Personalizado",
  professionalName: "Dra. Karoline Ferreira",
  professionalTitle: "Especialista em Estética Avançada & Tecnologias",
  registryNumber: "Dra. Karoline Ferreira",
  professionals: [
    {
      id: "doc-karoline",
      name: "Dra. Karoline Ferreira",
      registryNumber: "Responsável Técnica",
      title: "Especialista em Estética Avançada & Tecnologias",
      specialty: "Especialista em Estética Avançada & Tecnologias"
    }
  ],
  phone: "(19) 99876-5432",
  email: "contato@lavieclinique.com.br",
  instagram: "@lavie.estetica",
  address: "Indaiatuba - SP",
  cityState: "Indaiatuba - SP",
  // Sem logoUrl: até a clínica enviar a arte nas configurações, a marca é o monograma "LV".
  coverBannerUrl: "https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=1600&auto=format&fit=crop&q=80",
  catalogWelcomeNote: "Bem-vindo ao catálogo oficial de procedimentos da La Vie - Clínica de Estética Facial e Corporal. Nossos protocolos são conduzidos pela Dra. Karoline Ferreira com tecnologias de padrão ouro para resultados seguros, elegantes e duradouros.",
  consultationNote: "Valores por sessão ou pacote conforme especificado. Avaliação clínica individualizada recomendada para definição de protocolos combinados.",
};

export const INITIAL_CATEGORIES = [
  "Todos",
  "Corporal & Bem-Estar",
  "Estética Íntima",
  "Capilar",
  "Ultrassom Microfocado - Facial",
  "Ultrassom Microfocado - Corporal",
  "Depilação a Laser"
];

export const PRESET_IMAGE_LIBRARY = [
  {
    title: "Tratamento Facial & Consulta",
    url: "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=1000&auto=format&fit=crop&q=80",
    category: "Facial"
  },
  {
    title: "Estética & Pele Iluminada",
    url: "https://images.unsplash.com/photo-1512290900672-1f5be669e4f2?w=1000&auto=format&fit=crop&q=80",
    category: "Facial"
  },
  {
    title: "Harmonização & Lábios",
    url: "https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?w=1000&auto=format&fit=crop&q=80",
    category: "Facial"
  },
  {
    title: "Clínica & Bem-Estar",
    url: "https://images.unsplash.com/photo-1519823551278-64ac92734fb1?w=1000&auto=format&fit=crop&q=80",
    category: "Corporal"
  },
  {
    title: "Drenagem & Massoterapia",
    url: "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=1000&auto=format&fit=crop&q=80",
    category: "Corporal"
  },
  {
    title: "Tonificação & Contorno Corporal",
    url: "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=1000&auto=format&fit=crop&q=80",
    category: "Corporal"
  },
  {
    title: "Abdômen & Definição",
    url: "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=1000&auto=format&fit=crop&q=80",
    category: "Corporal"
  },
  {
    title: "Terapia Capilar & Fios",
    url: "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=1000&auto=format&fit=crop&q=80",
    category: "Capilar"
  },
  {
    title: "Soroterapia & Nutrição EV",
    url: "https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?w=1000&auto=format&fit=crop&q=80",
    category: "Bem-Estar"
  },
  {
    title: "Consultório & Tecnologia Médica",
    url: "https://images.unsplash.com/photo-1629909615184-74f495363b67?w=1000&auto=format&fit=crop&q=80",
    category: "Tecnologia"
  }
];

export const SAMPLE_PROCEDURES: Procedure[] = [
  // ==========================================
  // 1. CORPORAL & BEM-ESTAR (Página 1 do PDF)
  // ==========================================
  {
    id: "proc-drenagem-manta",
    title: "Drenagem Corporal (Detox c/ Manta)",
    subtitle: "Termoterapia com manta térmica, desintoxicação e eliminação de líquidos",
    category: "Corporal & Bem-Estar",
    description: "Protocolo completo que combina manobras drenantes manuais com os benefícios da manta térmica infravermelha. Estimula a sudorese, vasodilatação, liberação de toxinas e aceleração do metabolismo, proporcionando redução imediata de inchaço e sensação de leveza.",
    price: 180,
    priceNote: "por sessão",
    duration: "60 min",
    sessionsRecommended: "4 a 8 sessões (1 a 2x por semana)",
    recoveryTime: "Imediato; hidratação abundante recomendada",
    images: [
      "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=1000&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1519823551278-64ac92734fb1?w=1000&auto=format&fit=crop&q=80"
    ],
    benefits: [
      "Redução visível de medidas e retenção hídrica",
      "Ativação do sistema linfático e circulação sanguínea",
      "Ação desintoxicante profunda potencializada pelo calor",
      "Alívio de cansaço muscular e sensação de bem-estar"
    ],
    areasTreated: ["Corpo todo", "Pernas", "Abdômen", "Flancos", "Braços"],
    contraindications: "Gestantes, quadros febris, hipertensão descompensada, trombose ativa.",
    idealCandidate: "Pessoas com retenção de líquidos, sensação de pernas pesadas ou que buscam auxílio no processo de emagrecimento e detox.",
    isFeatured: true,
    assignedDoctorIds: ["doc-karoline"],
    assignedDoctorNames: ["Dra. Karoline Ferreira"],
    order: 1,
    createdAt: "2026-08-01T10:00:00.000Z"
  },
  {
    id: "proc-harmonizacao-glutea",
    title: "Harmonização Glútea",
    subtitle: "Remodelamento escultural, projeção, contorno e estímulo de colágeno",
    category: "Corporal & Bem-Estar",
    description: "Procedimento consagrado para elevar, projetar e corrigir assimetrias e depressões trocantéricas nos glúteos. Combina substâncias preenchedoras biocompatíveis e bioestimuladores para devolver firmeza, volume elegante e tônus com extrema naturalidade.",
    price: 4500,
    priceNote: "protocolo completo",
    duration: "60 a 90 min",
    sessionsRecommended: "1 a 3 sessões conforme plano de tratamento",
    recoveryTime: "Retorno imediato às atividades leves; evitar treinos intensos por 7 dias",
    images: [
      "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=1000&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=1000&auto=format&fit=crop&q=80"
    ],
    benefits: [
      "Preenchimento de depressão trocantérica (lateral do glúteo)",
      "Projeção e formato arredondado sem cirurgia plástica",
      "Melhora significativa da celulite e textura da pele",
      "Efeito lifting e estímulo prolongado de colágeno"
    ],
    areasTreated: ["Região glútea superior", "Depressão trocantérica", "Polo lateral"],
    contraindications: "Infecções locais ativas, gestantes, doenças autoimunes descompensadas.",
    idealCandidate: "Quem deseja melhorar o formato, projeção, firmeza ou corrigir desníveis nos glúteos sem necessidade de prótese cirúrgica.",
    isFeatured: true,
    assignedDoctorIds: ["doc-karoline"],
    assignedDoctorNames: ["Dra. Karoline Ferreira"],
    order: 2,
    createdAt: "2026-08-01T10:01:00.000Z"
  },
  {
    id: "proc-lipedema",
    title: "Suporte Estético para Lipedema",
    subtitle: "Manejo terapêutico da dor, fibrose e redução do processo inflamatório",
    category: "Corporal & Bem-Estar",
    description: "Abordagem especializada e humanizada direcionada às particularidades do lipedema. Une manobras drenantes adaptadas, redução da estase linfática, alívio da sensibilidade tecidual e descompressão do tecido adiposo inflamado.",
    price: 250,
    priceNote: "por sessão",
    duration: "50 a 60 min",
    sessionsRecommended: "Sessões semanais contínuas para manutenção do conforto",
    recoveryTime: "Sem restrições; melhora do conforto logo após a sessão",
    images: [
      "https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=1000&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1516549655169-df83a0774514?w=1000&auto=format&fit=crop&q=80"
    ],
    benefits: [
      "Alívio da dor, peso e hipersensibilidade nas pernas",
      "Melhora da circulação venolinfática periférica",
      "Suavização de nódulos e fibroses subcutâneas",
      "Melhora da mobilidade e bem-estar diário"
    ],
    areasTreated: ["Membros inferiores (coxas, pernas, tornozelos)", "Braços"],
    contraindications: "Tromboflebite aguda, infecções cutâneas ativas.",
    idealCandidate: "Mulheres diagnosticadas ou com suspeita clínica de lipedema que buscam alívio de sintomas e melhora estética funcional.",
    isFeatured: false,
    assignedDoctorIds: ["doc-karoline"],
    assignedDoctorNames: ["Dra. Karoline Ferreira"],
    order: 3,
    createdAt: "2026-08-01T10:02:00.000Z"
  },
  {
    id: "proc-ozonioterapia",
    title: "Ozonioterapia",
    subtitle: "Ação anti-inflamatória, regeneração tecidual e oxigenação celular",
    category: "Corporal & Bem-Estar",
    description: "Terapia integrativa e estética que utiliza a mistura medicinal de oxigênio e ozônio (O2-O3). Atua na otimização da circulação sanguínea, combate a radicais livres, redução da gordura localizada, modulação da inflamação e regeneração dérmica.",
    price: 180,
    priceNote: "por sessão",
    duration: "30 a 45 min",
    sessionsRecommended: "5 a 10 sessões conforme indicação clínica",
    recoveryTime: "Imediato",
    images: [
      "https://images.unsplash.com/photo-1583912267670-6575ad4736f8?w=1000&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1629909615184-74f495363b67?w=1000&auto=format&fit=crop&q=80"
    ],
    benefits: [
      "Potente ação antioxidante, bactericida e anti-inflamatória",
      "Estímulo à quebra de gordura e melhora da celulite",
      "Aceleração da cicatrização e regeneração dos tecidos",
      "Revitalização celular e aumento da energia vital"
    ],
    areasTreated: ["Corporal", "Localizado", "Áreas com flacidez/gordura"],
    contraindications: "Deficiência de G6PD (favismo), hipertireoidismo descompensado, gestação.",
    idealCandidate: "Pacientes em busca de imunomodulação, melhora da celulite, gordura localizada ou cicatrização.",
    isFeatured: false,
    assignedDoctorIds: ["doc-karoline"],
    assignedDoctorNames: ["Dra. Karoline Ferreira"],
    order: 4,
    createdAt: "2026-08-01T10:03:00.000Z"
  },
  {
    id: "proc-soroterapia",
    title: "Soroterapia",
    subtitle: "Infusão intravenosa personalizada de vitaminas, minerais e antioxidantes",
    category: "Corporal & Bem-Estar",
    description: "Nutrição e suporte metabólico por via endovenosa com 100% de biodisponibilidade. Fórmulas individualizadas ricas em antioxidantes (como glutationa e vitamina C), aminoácidos, coenzima Q10 e complexo B para energia, imunidade, saúde da pele e longevidade.",
    price: 380,
    priceNote: "por sessão / infusão",
    duration: "40 a 50 min",
    sessionsRecommended: "Protocolos quinzenais ou mensais",
    recoveryTime: "Imediato; retorno sem restrições à rotina",
    images: [
      "https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?w=1000&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1579684385127-1ef15d508118?w=1000&auto=format&fit=crop&q=80"
    ],
    benefits: [
      "Absorção celular direta sem perdas no trato digestivo",
      "Aumento imediato da disposição física e clareza mental",
      "Ação antienvelhecimento e viço profundo da pele e cabelos",
      "Fortalecimento da imunidade e recuperação metabólica"
    ],
    areasTreated: ["Aplicação endovenosa sistêmica"],
    contraindications: "Insuficiência renal ou cardíaca grave sem liberação médica prévia.",
    idealCandidate: "Indivíduos com estresse, fadiga crônica, déficit nutricional ou que buscam potencializar os resultados de seus tratamentos estéticos de dentro para fora.",
    isFeatured: true,
    assignedDoctorIds: ["doc-karoline"],
    assignedDoctorNames: ["Dra. Karoline Ferreira"],
    order: 5,
    createdAt: "2026-08-01T10:04:00.000Z"
  },

  // ==========================================
  // 2. ESTÉTICA ÍNTIMA (Página 1 do PDF)
  // ==========================================
  {
    id: "proc-rejuvenescimento-intimo-laser",
    title: "Rejuvenescimento Íntimo a Laser",
    subtitle: "Tecnologia a laser para estímulo de colágeno, tônus e estética íntima feminina",
    category: "Estética Íntima",
    description: "Procedimento não invasivo de alta precisão que promove a neocolagênese e a retração tecidual na região íntima. Melhora a elasticidade, textura da pele, firmeza dos grandes lábios, clareamento suave e devolve o conforto e a autoestima da mulher.",
    price: 2000,
    priceNote: "por sessão",
    duration: "40 a 50 min",
    sessionsRecommended: "1 a 3 sessões anuais",
    recoveryTime: "Abstinência sexual de 5 a 7 dias; retorno imediato ao trabalho",
    images: [
      "https://images.unsplash.com/photo-1512290900672-1f5be669e4f2?w=1000&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=1000&auto=format&fit=crop&q=80"
    ],
    benefits: [
      "Estímulo intenso da produção de colágeno e elastina",
      "Retração da flacidez dos grandes lábios e introito",
      "Melhora do tônus, hidratação e trofismo da mucosa",
      "Procedimento rápido, confortável e realizado em consultório"
    ],
    areasTreated: ["Região vulvar externa", "Grandes lábios", "Monte de vênus"],
    contraindications: "Gestantes, infecções ginecológicas ativas, lesões herpéticas.",
    idealCandidate: "Mulheres que buscam restauração da firmeza, estética e conforto na região íntima no pós-parto ou menopausa.",
    isFeatured: true,
    assignedDoctorIds: ["doc-karoline"],
    assignedDoctorNames: ["Dra. Karoline Ferreira"],
    order: 6,
    createdAt: "2026-08-01T10:05:00.000Z"
  },

  // ==========================================
  // 3. CAPILAR (Página 1 do PDF)
  // ==========================================
  {
    id: "proc-capilar-prp-nutricao",
    title: "Capilar (PRP e Nutrição)",
    subtitle: "Plasma rico em plaquetas e infusão de fatores de crescimento foliculares",
    category: "Capilar",
    description: "Protocolo biológico avançado para o fortalecimento e regeneração capilar. A associação de fatores de crescimento autólogos (PRP) com mescla nutricional rica em biotina, aminoácidos e peptídeos bioativos estimula folículos enfraquecidos, reduzindo a queda e aumentando a densidade capilar.",
    price: 250,
    priceNote: "por sessão",
    duration: "45 a 60 min",
    sessionsRecommended: "4 a 6 sessões com intervalos de 21 a 30 dias",
    recoveryTime: "Lavar o couro cabeludo após 6h; sem downtime",
    images: [
      "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=1000&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?w=1000&auto=format&fit=crop&q=80"
    ],
    benefits: [
      "Interrupção do ciclo de queda capilar excessiva (eflúvio/alopecia)",
      "Estímulo à fase anágena (crescimento ativo dos fios)",
      "Espessamento do calibre dos fios finos e miniaturizados",
      "Alta biocompatibilidade e segurança biológica"
    ],
    areasTreated: ["Couro cabeludo", "Linha frontal", "Vértice", "Coroa"],
    contraindications: "Infecções ativas no couro cabeludo, coagulopatias severas.",
    idealCandidate: "Homens e mulheres que sofrem com queda de cabelo, afinamento dos fios, alopecia androgenética ou pós-estresse.",
    isFeatured: false,
    assignedDoctorIds: ["doc-karoline"],
    assignedDoctorNames: ["Dra. Karoline Ferreira"],
    order: 7,
    createdAt: "2026-08-01T10:06:00.000Z"
  },

  // ==========================================
  // 4. ULTRASSOM MICROFOCADO - HTM FACIAL (Página 1 do PDF)
  // ==========================================
  {
    id: "proc-us-face-completa",
    title: "Ultrassom Microfocado HTM - Face Completa",
    subtitle: "Lifting não-cirúrgico do SMAS, neocolagênese e ancoragem tecidual facial",
    category: "Ultrassom Microfocado - Facial",
    description: "Tecnologia padrão ouro da HTM que atinge com precisão milimétrica a camada fascial muscular (SMAS) e a derme profunda. Promove micropontos de coagulação térmica que contraem a musculatura facial e disparam uma cascata de colágeno novo, gerando lifting sem cortes.",
    price: 1050,
    priceNote: "por sessão",
    duration: "60 a 75 min",
    sessionsRecommended: "1 a 2 sessões anuais para manutenção de tônus",
    recoveryTime: "Sem downtime; leve eritema transitório por 1 a 2h",
    images: [
      "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=1000&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1516549655169-df83a0774514?w=1000&auto=format&fit=crop&q=80"
    ],
    benefits: [
      "Efeito lifting facial duradouro sem cirurgia",
      "Definição do contorno mandibular e melhora do 'buldogue'",
      "Elevação das maçãs do rosto e abertura do olhar",
      "Melhora da densidade dérmica com resultados progressivos por até 6 meses"
    ],
    areasTreated: ["Testa", "Têmporas", "Maçãs do rosto", "Região malar", "Mandíbula"],
    contraindications: "Presença de fios de sustentação não absorvíveis, implantes metálicos na área, gestantes.",
    idealCandidate: "Pessoas a partir dos 30 anos com flacidez leve a moderada, perda de firmeza ou que desejam prevenir o envelhecimento facial.",
    isFeatured: true,
    assignedDoctorIds: ["doc-karoline"],
    assignedDoctorNames: ["Dra. Karoline Ferreira"],
    order: 8,
    createdAt: "2026-08-01T10:07:00.000Z"
  },
  {
    id: "proc-us-terco-inferior",
    title: "Ultrassom Microfocado HTM - Terço Inferior da Face",
    subtitle: "Foco no contorno mandibular, jowls e afinamento do contorno inferior",
    category: "Ultrassom Microfocado - Facial",
    description: "Aplicação direcionada ao terço inferior facial para combater o aspecto de 'bochechas caídas' (jowls) e a perda da linha divisória entre a mandíbula e o pescoço, promovendo firmeza localizada de alta definição.",
    price: 800,
    priceNote: "por sessão",
    duration: "40 min",
    sessionsRecommended: "1 sessão a cada 6 a 12 meses",
    recoveryTime: "Sem restrições; vida normal imediata",
    images: [
      "https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?w=1000&auto=format&fit=crop&q=80"
    ],
    benefits: [
      "Redefinição expressiva da linha mandibular",
      "Compactação de gordura e tração da flacidez no terço inferior",
      "Recuperação do formato em 'V' do rosto jovem",
      "Zero marcas ou necessidade de afastamento social"
    ],
    areasTreated: ["Região pré-jowl", "Linha da mandíbula", "Ângulo mandibular"],
    contraindications: "Gestantes, lesões abertas no local.",
    idealCandidate: "Pacientes que sentem o terço inferior pesado ou perdendo definição.",
    isFeatured: false,
    assignedDoctorIds: ["doc-karoline"],
    assignedDoctorNames: ["Dra. Karoline Ferreira"],
    order: 9,
    createdAt: "2026-08-01T10:08:00.000Z"
  },
  {
    id: "proc-us-papada",
    title: "Ultrassom Microfocado HTM - Papada",
    subtitle: "Compactação da gordura submentoniana e retração da flacidez de pele",
    category: "Ultrassom Microfocado - Facial",
    description: "Protocolo específico para a região submentoniana (queixo duplo). Os disparos focados em profundidades combinadas promovem a lipólise seletiva das células adiposas e a ancoragem da pele ao músculo platisma.",
    price: 600,
    priceNote: "por sessão",
    duration: "30 min",
    sessionsRecommended: "1 a 2 sessões com intervalo de 60 dias",
    recoveryTime: "Retorno imediato às atividades",
    images: [
      "https://images.unsplash.com/photo-1512290900672-1f5be669e4f2?w=1000&auto=format&fit=crop&q=80"
    ],
    benefits: [
      "Redução da gordura localizada na papada sem injeções",
      "Cola a pele ao músculo platisma eliminando o efeito 'queixo duplo'",
      "Afina o perfil e valoriza o ângulo do pescoço",
      "Estimula colágeno novo na região submentoniana"
    ],
    areasTreated: ["Região submentoniana (papada)"],
    contraindications: "Infecções locais, gestantes.",
    idealCandidate: "Quem tem acúmulo de gordura e flacidez sob o queixo e busca definição do perfil.",
    isFeatured: false,
    assignedDoctorIds: ["doc-karoline"],
    assignedDoctorNames: ["Dra. Karoline Ferreira"],
    order: 10,
    createdAt: "2026-08-01T10:09:00.000Z"
  },
  {
    id: "proc-us-pescoco",
    title: "Ultrassom Microfocado HTM - Pescoço",
    subtitle: "Firmeza dérmica, redução de anéis de vênus e tônus do platisma",
    category: "Ultrassom Microfocado - Facial",
    description: "Tratamento focado na delicada pele do pescoço para suavizar linhas horizontais (colares de vênus) e contrair a flacidez muscular, rejuvenescendo o colo superior e pescoço com alta precisão térmica.",
    price: 700,
    priceNote: "por sessão",
    duration: "35 min",
    sessionsRecommended: "1 a 2 sessões anuais",
    recoveryTime: "Sem downtime",
    images: [
      "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=1000&auto=format&fit=crop&q=80"
    ],
    benefits: [
      "Redução de rugas e marcas horizontais do pescoço",
      "Estímulo profundo da derme e fáscia muscular cervical",
      "Melhora global da textura e elasticidade cutânea",
      "Harmonia do pescoço com a face rejuvenescida"
    ],
    areasTreated: ["Pescoço anterior e lateral"],
    contraindications: "Afecções na tireoide não controladas (evita-se disparos sobre a glândula), gestação.",
    idealCandidate: "Pessoas com pele frouxa ou linhas aparentes no pescoço.",
    isFeatured: false,
    assignedDoctorIds: ["doc-karoline"],
    assignedDoctorNames: ["Dra. Karoline Ferreira"],
    order: 11,
    createdAt: "2026-08-01T10:10:00.000Z"
  },
  {
    id: "proc-us-colo",
    title: "Ultrassom Microfocado HTM - Colo",
    subtitle: "Restauração da densidade dérmica e redução das rugas do 'sleep lines'",
    category: "Ultrassom Microfocado - Facial",
    description: "Revitalização e redensificação da região do colo, área muito vulnerável ao fotoenvelhecimento e rugas de posição ao dormir. Promove a recuperação do colágeno e brilho natural da pele.",
    price: 800,
    priceNote: "por sessão",
    duration: "35 min",
    sessionsRecommended: "1 a 2 sessões",
    recoveryTime: "Imediato",
    images: [
      "https://images.unsplash.com/photo-1519823551278-64ac92734fb1?w=1000&auto=format&fit=crop&q=80"
    ],
    benefits: [
      "Atenuação de rugas verticais e finas no decote",
      "Espessamento da pele fina e desidratada do colo",
      "Melhora do viço e da uniformidade do tecido",
      "Rejuvenescimento completo da área exposta"
    ],
    areasTreated: ["Região do colo e decote"],
    contraindications: "Implantes mamários muito superficiais (técnica adaptada), gestantes.",
    idealCandidate: "Mulheres com marcas de sono ou fotoenvelhecimento na região do colo.",
    isFeatured: false,
    assignedDoctorIds: ["doc-karoline"],
    assignedDoctorNames: ["Dra. Karoline Ferreira"],
    order: 12,
    createdAt: "2026-08-01T10:11:00.000Z"
  },
  {
    id: "proc-us-face-papada",
    title: "Ultrassom Microfocado HTM - Face + Papada",
    subtitle: "Combo integrado para contorno mandibular completo e sustentação facial",
    category: "Ultrassom Microfocado - Facial",
    description: "Protocolo combinado de alto impacto que une o lifting de toda a face com o tratamento da gordura e flacidez submentoniana, gerando simetria e rejuvenescimento harmônico do perfil.",
    price: 1250,
    priceNote: "por sessão",
    duration: "70 a 80 min",
    sessionsRecommended: "1 sessão anual",
    recoveryTime: "Sem downtime",
    images: [
      "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=1000&auto=format&fit=crop&q=80"
    ],
    benefits: [
      "Lifting do terço médio e superior da face",
      "Compactação e tração da gordura submentoniana (papada)",
      "Valor promocional inteligente para áreas integradas",
      "Resultados nítidos e naturais de perfil e frontal"
    ],
    areasTreated: ["Face completa", "Papada / Submento"],
    contraindications: "Gestantes, infecções dérmicas ativas.",
    idealCandidate: "Pacientes que desejam tratar a face e a papada no mesmo atendimento.",
    isFeatured: true,
    assignedDoctorIds: ["doc-karoline"],
    assignedDoctorNames: ["Dra. Karoline Ferreira"],
    order: 13,
    createdAt: "2026-08-01T10:12:00.000Z"
  },
  {
    id: "proc-us-face-papada-pescoco",
    title: "Ultrassom Microfocado HTM - Face + Papada + Pescoço",
    subtitle: "Protocolo Master de lifting facial e cervical tridimensional",
    category: "Ultrassom Microfocado - Facial",
    description: "A mais completa cobertura de ultrassom microfocado para todo o segmento cefálico e cervical. Rejuvenesce as três zonas fundamentais para uma transição elegante e sem marcas de flacidez.",
    price: 1600,
    priceNote: "por sessão",
    duration: "90 min",
    sessionsRecommended: "1 sessão anual",
    recoveryTime: "Sem downtime",
    images: [
      "https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?w=1000&auto=format&fit=crop&q=80"
    ],
    benefits: [
      "Cobertura total de face, queixo duplo e pescoço",
      "Harmonização contínua de todo o contorno",
      "Máximo estímulo de colágeno e ancoragem muscular",
      "Excelente custo-benefício comparado a sessões avulsas"
    ],
    areasTreated: ["Face completa", "Papada", "Pescoço"],
    contraindications: "Gestantes, implantes metálicos na área.",
    idealCandidate: "Quem busca rejuvenescimento global de alta intensidade sem intervenção cirúrgica.",
    isFeatured: true,
    assignedDoctorIds: ["doc-karoline"],
    assignedDoctorNames: ["Dra. Karoline Ferreira"],
    order: 14,
    createdAt: "2026-08-01T10:13:00.000Z"
  },
  {
    id: "proc-us-face-pescoco-colo",
    title: "Ultrassom Microfocado HTM - Face + Pescoço + Colo",
    subtitle: "Experiência definitiva de rejuvenescimento do terço facial ao decote",
    category: "Ultrassom Microfocado - Facial",
    description: "Tratamento de excelência máxima que engloba face, pescoço e colo em uma sessão única estruturada. Garante total rejuvenescimento e uniformidade dérmica para todas as áreas visíveis.",
    price: 2050,
    priceNote: "por sessão",
    duration: "100 a 120 min",
    sessionsRecommended: "1 sessão anual",
    recoveryTime: "Sem downtime",
    images: [
      "https://images.unsplash.com/photo-1512290900672-1f5be669e4f2?w=1000&auto=format&fit=crop&q=80"
    ],
    benefits: [
      "Lifting global facial e revitalização profunda do colo",
      "Eliminação do contraste de envelhecimento entre rosto e decote",
      "Estímulo prolongado de colágeno e sustentação das fáscias",
      "Efeito rejuvenescedor natural e sofisticado"
    ],
    areasTreated: ["Face", "Pescoço", "Colo"],
    contraindications: "Gestantes, infecções locais ativas.",
    idealCandidate: "Pacientes que desejam tratar amplamente o envelhecimento da face, pescoço e decote.",
    isFeatured: true,
    assignedDoctorIds: ["doc-karoline"],
    assignedDoctorNames: ["Dra. Karoline Ferreira"],
    order: 15,
    createdAt: "2026-08-01T10:14:00.000Z"
  },

  // ==========================================
  // 5. ULTRASSOM MICROFOCADO - HTM CORPORAL (Página 1 do PDF)
  // ==========================================
  {
    id: "proc-us-corp-abdomen",
    title: "Ultrassom Microfocado HTM - Abdômen",
    subtitle: "Compactação da gordura subcutânea e retração da flacidez abdominal (umbigo triste)",
    category: "Ultrassom Microfocado - Corporal",
    description: "Aplicação corporal com transdutores profundos HTM de alta intensidade no abdômen. Age na necrose de adipócitos e na contração do colágeno dérmico, colando a pele frouxa e tratando o efeito 'umbigo triste' comum no pós-parto ou emagrecimento.",
    price: 1200,
    priceNote: "por sessão",
    duration: "50 a 60 min",
    sessionsRecommended: "1 a 3 sessões",
    recoveryTime: "Sem downtime; retorno imediato aos treinos leves",
    images: [
      "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=1000&auto=format&fit=crop&q=80"
    ],
    benefits: [
      "Retração potente da pele frouxa do abdômen",
      "Tratamento eficaz para 'umbigo triste'",
      "Redução da camada de gordura localizada supra e infraumbilical",
      "Não invasivo, sem cicatrizes ou necessidade de cinta pós-cirúrgica"
    ],
    areasTreated: ["Abdômen total (supra e infraumbilical)"],
    contraindications: "Gestantes, hérnia abdominal não tratada na área dos disparos.",
    idealCandidate: "Mães no pós-parto ou pessoas pós-emagrecimento com flacidez e gordurinha resistente no abdômen.",
    isFeatured: true,
    assignedDoctorIds: ["doc-karoline"],
    assignedDoctorNames: ["Dra. Karoline Ferreira"],
    order: 16,
    createdAt: "2026-08-01T10:15:00.000Z"
  },
  {
    id: "proc-us-corp-flancos",
    title: "Ultrassom Microfocado HTM - Flancos",
    subtitle: "Afinamento da cintura e redução da gordura lateral resistente",
    category: "Ultrassom Microfocado - Corporal",
    description: "Foco específico na gordura lateral dos flancos para esculpir a cintura e diminuir o volume que insiste em sobrar nas roupas, promovendo firmeza dérmica imediata e contínua.",
    price: 1050,
    priceNote: "por sessão",
    duration: "45 min",
    sessionsRecommended: "1 a 3 sessões",
    recoveryTime: "Sem downtime",
    images: [
      "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=1000&auto=format&fit=crop&q=80"
    ],
    benefits: [
      "Desenho escultural e afinamento da cintura",
      "Lise de células de gordura na lateral do tronco",
      "Melhora do contorno corporal nas roupas",
      "Firmeza da pele sem flacidez residual"
    ],
    areasTreated: ["Flancos direito e esquerdo (cintura lateral)"],
    contraindications: "Gestantes, infecções locais.",
    idealCandidate: "Pessoas com acúmulo de gordura lateral resistente a dietas e treinos.",
    isFeatured: false,
    assignedDoctorIds: ["doc-karoline"],
    assignedDoctorNames: ["Dra. Karoline Ferreira"],
    order: 17,
    createdAt: "2026-08-01T10:16:00.000Z"
  },
  {
    id: "proc-us-corp-abdomen-flancos",
    title: "Ultrassom Microfocado HTM - Abdômen + Flancos",
    subtitle: "Remodelamento 360º do tronco, cintura fina e abdômen firme",
    category: "Ultrassom Microfocado - Corporal",
    description: "O combo mais procurado para esculpir todo o tronco anterior e lateral. Trata simultaneamente o abdômen e os flancos em uma única sessão estratégica de alta densidade de disparos.",
    price: 1950,
    priceNote: "por sessão",
    duration: "90 min",
    sessionsRecommended: "1 a 2 sessões",
    recoveryTime: "Sem downtime",
    images: [
      "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=1000&auto=format&fit=crop&q=80"
    ],
    benefits: [
      "Transformação do contorno abdominal e afinamento da cintura",
      "Economia significativa no pacote integrado de tronco",
      "Compactação de gordura e combate severo à flacidez",
      "Procedimento confortável e sem cortes"
    ],
    areasTreated: ["Abdômen total", "Flancos direito e esquerdo"],
    contraindications: "Gestantes, hérnias locais ativas.",
    idealCandidate: "Quem busca redefinir completamente a região média do corpo.",
    isFeatured: true,
    assignedDoctorIds: ["doc-karoline"],
    assignedDoctorNames: ["Dra. Karoline Ferreira"],
    order: 18,
    createdAt: "2026-08-01T10:17:00.000Z"
  },
  {
    id: "proc-us-corp-bracos",
    title: "Ultrassom Microfocado HTM - Braços",
    subtitle: "Tratamento da flacidez no músculo do 'tchauzinho' e melhora do contorno",
    category: "Ultrassom Microfocado - Corporal",
    description: "Foco na face interna e posterior dos braços (região do tríceps). Estimula o encurtamento das fibras colágenas e colagem da pele ao tecido muscular, eliminando o balanço indesejado ao gesticular.",
    price: 1100,
    priceNote: "por sessão (ambos os braços)",
    duration: "45 a 50 min",
    sessionsRecommended: "1 a 3 sessões",
    recoveryTime: "Sem downtime",
    images: [
      "https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=1000&auto=format&fit=crop&q=80"
    ],
    benefits: [
      "Firmeza no famoso 'músculo do tchauzinho'",
      "Redução da gordurinha localizada na face interna dos braços",
      "Pele visivelmente mais rígida e uniforme",
      "Pode ser associado a outros procedimentos de tonificação"
    ],
    areasTreated: ["Face interna e posterior dos dois braços"],
    contraindications: "Gestantes, implantes ortopédicos recentes no braço.",
    idealCandidate: "Pessoas incomodadas com a flacidez e pele frouxa nos braços ao vestir regatas ou vestidos.",
    isFeatured: false,
    assignedDoctorIds: ["doc-karoline"],
    assignedDoctorNames: ["Dra. Karoline Ferreira"],
    order: 19,
    createdAt: "2026-08-01T10:18:00.000Z"
  },
  {
    id: "proc-us-corp-coxas",
    title: "Ultrassom Microfocado HTM - Coxas",
    subtitle: "Firmeza na face interna das coxas, anterior e acima dos joelhos",
    category: "Ultrassom Microfocado - Corporal",
    description: "Aplicação direcionada para tratar a frouxidão da face interna das coxas e o aspecto de pele caída sobre os joelhos ('rugas do joelho'). Proporciona sustentação e melhora notável da firmeza da pele das pernas.",
    price: 1400,
    priceNote: "por sessão",
    duration: "60 min",
    sessionsRecommended: "1 a 3 sessões",
    recoveryTime: "Sem downtime",
    images: [
      "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=1000&auto=format&fit=crop&q=80"
    ],
    benefits: [
      "Retração da flacidez na face interna das coxas",
      "Lifting da pele sobre os joelhos",
      "Melhora da celulite associada à perda de sustentação",
      "Pernas com contorno mais firme e jovial"
    ],
    areasTreated: ["Face interna das coxas", "Região suprapatelar (acima dos joelhos)"],
    contraindications: "Gestantes, processos inflamatórios cutâneos ativos.",
    idealCandidate: "Pessoas que sentem atrito na face interna das coxas ou flacidez de pele nas pernas.",
    isFeatured: false,
    assignedDoctorIds: ["doc-karoline"],
    assignedDoctorNames: ["Dra. Karoline Ferreira"],
    order: 20,
    createdAt: "2026-08-01T10:19:00.000Z"
  },
  {
    id: "proc-us-corp-gluteos",
    title: "Ultrassom Microfocado HTM - Glúteos",
    subtitle: "Lifting glúteo não-cirúrgico, tração da bananinha e estímulo de colágeno",
    category: "Ultrassom Microfocado - Corporal",
    description: "Trabalha a junção entre o glúteo e a coxa (região subglútea/'bananinha') e a base do glúteo para tracionar o tecido para cima, sustentando a curvatura natural e melhorando o tônus dérmico.",
    price: 1100,
    priceNote: "por sessão",
    duration: "50 min",
    sessionsRecommended: "1 a 3 sessões",
    recoveryTime: "Sem downtime",
    images: [
      "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=1000&auto=format&fit=crop&q=80"
    ],
    benefits: [
      "Efeito lifting e sustentação na dobra subglútea",
      "Redução da gordurinha da 'bananinha'",
      "Melhora da textura e firmeza da pele glútea",
      "Excelente sinergia quando associado à Harmonização Glútea"
    ],
    areasTreated: ["Região subglútea", "Polo inferior e lateral dos glúteos"],
    contraindications: "Gestantes, inflamações locais ativas.",
    idealCandidate: "Quem busca empinar os glúteos e eliminar a frouxidão e marcas na dobra das pernas.",
    isFeatured: false,
    assignedDoctorIds: ["doc-karoline"],
    assignedDoctorNames: ["Dra. Karoline Ferreira"],
    order: 21,
    createdAt: "2026-08-01T10:20:00.000Z"
  },

  // ==========================================
  // 6. DEPILAÇÃO A LASER (Página 2 do PDF - 10 Sessões)
  // ==========================================
  {
    id: "proc-laser-buco",
    title: "Depilação a Laser - Buço",
    subtitle: "Pacote completo de 10 sessões para eliminação definitiva dos pelos do buço",
    category: "Depilação a Laser",
    description: "Tecnologia a laser de alta eficácia com ponteira ultrarresfriada para proteção da pele e máximo conforto. Elimina os folículos pilosos progressivamente, clareia sombras e acaba de vez com o uso de ceras e lâminas no rosto.",
    price: 550,
    priceNote: "pacote com 10 sessões",
    duration: "15 min",
    sessionsRecommended: "10 sessões inclusas no plano",
    recoveryTime: "Sem downtime; usar protetor solar FPS 50+ diariamente",
    images: [
      "https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?w=1000&auto=format&fit=crop&q=80"
    ],
    benefits: [
      "Pele lisa e livre de pelos para sempre",
      "Ponteira com resfriamento que minimiza o desconforto",
      "Fim da foliculite, manchas escuras e irritações de cera",
      "Excelente custo-benefício em 10 sessões"
    ],
    areasTreated: ["Região do buço / lábio superior"],
    contraindications: "Pele bronzeada recente, uso de isotretinoína oral ativa, gestantes.",
    idealCandidate: "Mulheres que desejam eliminar os pelos do buço de forma definitiva e segura.",
    isFeatured: false,
    assignedDoctorIds: ["doc-karoline"],
    assignedDoctorNames: ["Dra. Karoline Ferreira"],
    order: 22,
    createdAt: "2026-08-01T10:21:00.000Z"
  },
  {
    id: "proc-laser-queixo",
    title: "Depilação a Laser - Queixo",
    subtitle: "Pacote de 10 sessões para remoção definitiva de pelos no queixo e mento",
    category: "Depilação a Laser",
    description: "Tratamento a laser indicado para fios grossos ou finos na região do queixo. Destrói a raiz do pelo com precisão e segurança para todos os fototipos de pele.",
    price: 550,
    priceNote: "pacote com 10 sessões",
    duration: "15 min",
    sessionsRecommended: "10 sessões inclusas",
    recoveryTime: "Sem restrições; usar protetor solar",
    images: [
      "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=1000&auto=format&fit=crop&q=80"
    ],
    benefits: [
      "Eliminação de pelos encravados e inflamações",
      "Pele macia sem necessidade de pinças diárias",
      "Tratamento rápido em poucos minutos por sessão",
      "Prevenção de manchas pós-inflamatórias"
    ],
    areasTreated: ["Região do queixo / mento"],
    contraindications: "Gestantes, bronzeamento recente.",
    idealCandidate: "Mulheres e homens com pelos incômodos no queixo.",
    isFeatured: false,
    assignedDoctorIds: ["doc-karoline"],
    assignedDoctorNames: ["Dra. Karoline Ferreira"],
    order: 23,
    createdAt: "2026-08-01T10:22:00.000Z"
  },
  {
    id: "proc-laser-face-lateral",
    title: "Depilação a Laser - Face Lateral",
    subtitle: "Pacote de 10 sessões para as laterais da face e costeletas femininas",
    category: "Depilação a Laser",
    description: "Elimina a penugem e os pelos das laterais do rosto e contorno das orelhas, deixando a pele com acabamento aveludado e visual limpo e uniforme.",
    price: 700,
    priceNote: "pacote com 10 sessões",
    duration: "20 min",
    sessionsRecommended: "10 sessões",
    recoveryTime: "Sem downtime",
    images: [
      "https://images.unsplash.com/photo-1512290900672-1f5be669e4f2?w=1000&auto=format&fit=crop&q=80"
    ],
    benefits: [
      "Contorno facial limpo e maquiagem com aderência perfeita",
      "Ponteira resfriada que protege a epiderme",
      "Adequado para fios finos e médios",
      "Eliminação duradoura em 10 aplicações"
    ],
    areasTreated: ["Laterais da face", "Costeletas"],
    contraindications: "Gestantes, lesões herpéticas ativas.",
    idealCandidate: "Quem busca uniformizar a lateral do rosto e facilitar a aplicação de maquiagem e dermocosméticos.",
    isFeatured: false,
    assignedDoctorIds: ["doc-karoline"],
    assignedDoctorNames: ["Dra. Karoline Ferreira"],
    order: 24,
    createdAt: "2026-08-01T10:23:00.000Z"
  },
  {
    id: "proc-laser-maca-rosto",
    title: "Depilação a Laser - Maçã do Rosto",
    subtitle: "Pacote de 10 sessões para a região malar e bochechas",
    category: "Depilação a Laser",
    description: "Remoção a laser dos pelos finos ou escuros sobre as maçãs do rosto, promovendo uniformidade e luminosidade à pele facial.",
    price: 650,
    priceNote: "pacote com 10 sessões",
    duration: "15 a 20 min",
    sessionsRecommended: "10 sessões",
    recoveryTime: "Sem downtime",
    images: [
      "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=1000&auto=format&fit=crop&q=80"
    ],
    benefits: [
      "Textura de pele extremamente suave",
      "Remoção segura e indolor com tecnologia moderna",
      "Clareamento do aspecto sombreado na face",
      "Zero marcas ou irritações crônicas"
    ],
    areasTreated: ["Região malar", "Maçãs do rosto"],
    contraindications: "Gestantes, pele exposta ao sol recente.",
    idealCandidate: "Pessoas com excesso de penugem ou pelos visíveis na área das bochechas.",
    isFeatured: false,
    assignedDoctorIds: ["doc-karoline"],
    assignedDoctorNames: ["Dra. Karoline Ferreira"],
    order: 25,
    createdAt: "2026-08-01T10:24:00.000Z"
  },
  {
    id: "proc-laser-virilha-completa",
    title: "Depilação a Laser - Virilha Completa",
    subtitle: "Pacote de 10 sessões para a área íntima completa com total discrição e conforto",
    category: "Depilação a Laser",
    description: "O protocolo mais amado para liberdade absoluta na praia, academia e dia a dia. Destrói os pelos da virilha total e grandes lábios com ponteira resfriada, eliminando para sempre a foliculite, pelos encravados e o escurecimento causado pela lâmina.",
    price: 2300,
    priceNote: "pacote com 10 sessões",
    duration: "30 min",
    sessionsRecommended: "10 sessões inclusas",
    recoveryTime: "Sem restrições; evitar roupas muito apertadas no dia da aplicação",
    images: [
      "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=1000&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=1000&auto=format&fit=crop&q=80"
    ],
    benefits: [
      "Eliminação definitiva dos pelos e da foliculite íntima",
      "Clareamento progressivo da pele tratada",
      "Ponteira com resfriamento térmico de alto conforto",
      "Liberdade total sem preocupação com depilação de emergência"
    ],
    areasTreated: ["Virilha completa", "Grandes lábios", "Faixa superior"],
    contraindications: "Gestantes, infecções locais ativas.",
    idealCandidate: "Mulheres que sofrem com pelos encravados, manchas ou querem praticidade definitiva.",
    isFeatured: true,
    assignedDoctorIds: ["doc-karoline"],
    assignedDoctorNames: ["Dra. Karoline Ferreira"],
    order: 26,
    createdAt: "2026-08-01T10:25:00.000Z"
  },
  {
    id: "proc-laser-perianal",
    title: "Depilação a Laser - Perianal",
    subtitle: "Pacote de 10 sessões para a região perianal com máxima higiene e suavidade",
    category: "Depilação a Laser",
    description: "Tratamento rápido, discreto e essencial para a higiene e bem-estar. Remove os pelos da região perianal de forma definitiva e confortável.",
    price: 750,
    priceNote: "pacote com 10 sessões",
    duration: "15 min",
    sessionsRecommended: "10 sessões",
    recoveryTime: "Imediato",
    images: [
      "https://images.unsplash.com/photo-1519823551278-64ac92734fb1?w=1000&auto=format&fit=crop&q=80"
    ],
    benefits: [
      "Higiene facilitada e conforto absoluto",
      "Eliminação de coceiras e irritações por suor",
      "Procedimento rápido de 10 a 15 minutos",
      "Excelente combinação com a Virilha Completa"
    ],
    areasTreated: ["Região perianal"],
    contraindications: "Lesões anais ativas, gestação.",
    idealCandidate: "Quem busca praticidade, conforto e higiene íntima completa.",
    isFeatured: false,
    assignedDoctorIds: ["doc-karoline"],
    assignedDoctorNames: ["Dra. Karoline Ferreira"],
    order: 27,
    createdAt: "2026-08-01T10:26:00.000Z"
  },
  {
    id: "proc-laser-linha-alba",
    title: "Depilação a Laser - Linha Alba",
    subtitle: "Pacote de 10 sessões para a linha média do abdômen",
    category: "Depilação a Laser",
    description: "Elimina a faixa de pelos que se estende do umbigo ao púbis (linha alba/linha do biquíni), deixando o abdômen liso e visualmente perfeito.",
    price: 500,
    priceNote: "pacote com 10 sessões",
    duration: "15 min",
    sessionsRecommended: "10 sessões",
    recoveryTime: "Sem downtime",
    images: [
      "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=1000&auto=format&fit=crop&q=80"
    ],
    benefits: [
      "Abdômen limpo para praia e moda praia",
      "Sessões ultra rápidas e confortáveis",
      "Elimina pelos escuros ou grossos da linha média",
      "Sem riscos de marcas ou foliculite"
    ],
    areasTreated: ["Linha alba (do umbigo à região pubiana)"],
    contraindications: "Gestantes, bronzeamento recente.",
    idealCandidate: "Homens e mulheres com pelos evidentes na linha do abdômen.",
    isFeatured: false,
    assignedDoctorIds: ["doc-karoline"],
    assignedDoctorNames: ["Dra. Karoline Ferreira"],
    order: 28,
    createdAt: "2026-08-01T10:27:00.000Z"
  },
  {
    id: "proc-laser-axilas",
    title: "Depilação a Laser - Axilas",
    subtitle: "Pacote de 10 sessões para axilas lisinhas, claras e sem manchas",
    category: "Depilação a Laser",
    description: "Um dos tratamentos mais procurados e transformadores. O laser destrói a raiz dos pelos das axilas, clareia o sombreamento escuro e acaba com o atrito diário de lâminas e desodorantes irritantes.",
    price: 850,
    priceNote: "pacote com 10 sessões",
    duration: "15 min",
    sessionsRecommended: "10 sessões inclusas",
    recoveryTime: "Sem downtime; evitar desodorante com álcool no dia",
    images: [
      "https://images.unsplash.com/photo-1583912267670-6575ad4736f8?w=1000&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=1000&auto=format&fit=crop&q=80"
    ],
    benefits: [
      "Axilas claras, macias e livres de manchas escuras",
      "Zero pelos encravados e fim do odor por acúmulo bacteriano",
      "Sessão feita em apenas 10 a 15 minutos",
      "Liberdade total para usar regatas e vestidos"
    ],
    areasTreated: ["Axilas direita e esquerda"],
    contraindications: "Gestantes, desodorantes com ácidos no dia da sessão.",
    idealCandidate: "Qualquer pessoa que queira se livrar da depilação frequente e das manchas nas axilas.",
    isFeatured: true,
    assignedDoctorIds: ["doc-karoline"],
    assignedDoctorNames: ["Dra. Karoline Ferreira"],
    order: 29,
    createdAt: "2026-08-01T10:28:00.000Z"
  },
  {
    id: "proc-laser-meia-perna",
    title: "Depilação a Laser - ½ Perna",
    subtitle: "Pacote de 10 sessões para a região dos joelhos até os tornozelos",
    category: "Depilação a Laser",
    description: "Remoção a laser com cobertura total da canela, panturrilha e joelhos. Elimina os pelos grossos e a foliculite que tanto incomoda nas pernas, deixando o toque aveludado.",
    price: 2900,
    priceNote: "pacote com 10 sessões",
    duration: "30 a 40 min",
    sessionsRecommended: "10 sessões",
    recoveryTime: "Sem downtime; hidratar bem a pele",
    images: [
      "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=1000&auto=format&fit=crop&q=80"
    ],
    benefits: [
      "Canelas e panturrilhas sempre lisinhas e hidratadas",
      "Fim das 'bolinhas vermelhas' e inflamações pós-gilete",
      "Ponteira de safira resfriada para conforto superior",
      "Durabilidade definitiva em 10 aplicações"
    ],
    areasTreated: ["Joelhos até os pés (ambas as pernas)"],
    contraindications: "Bronzeamento ativo recente, gestação.",
    idealCandidate: "Mulheres e homens cansados de depilar as pernas semanalmente.",
    isFeatured: false,
    assignedDoctorIds: ["doc-karoline"],
    assignedDoctorNames: ["Dra. Karoline Ferreira"],
    order: 30,
    createdAt: "2026-08-01T10:29:00.000Z"
  },
  {
    id: "proc-laser-perna-completa",
    title: "Depilação a Laser - Perna Completa",
    subtitle: "Pacote de 10 sessões para coxas, joelhos e pernas inteiras",
    category: "Depilação a Laser",
    description: "Tratamento completo da raiz das coxas aos pés. Proporciona a experiência máxima de pernas sedosas, uniformes e com zero preocupação com pelos em qualquer estação do ano.",
    price: 5000,
    priceNote: "pacote com 10 sessões",
    duration: "60 min",
    sessionsRecommended: "10 sessões inclusas",
    recoveryTime: "Sem downtime",
    images: [
      "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=1000&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=1000&auto=format&fit=crop&q=80"
    ],
    benefits: [
      "Pernas 100% livres de pelos da raiz aos pés",
      "Pele macia com brilho sedoso e uniforme",
      "Economia permanente em relação a ceras por toda a vida",
      "Cobertura total com tecnologia a laser de ponta"
    ],
    areasTreated: ["Coxas completas", "Joelhos", "Panturrilhas e canelas"],
    contraindications: "Pele recentemente bronzeada por sol/câmaras, gestantes.",
    idealCandidate: "Quem busca a solução definitiva para todo o comprimento das pernas.",
    isFeatured: true,
    assignedDoctorIds: ["doc-karoline"],
    assignedDoctorNames: ["Dra. Karoline Ferreira"],
    order: 31,
    createdAt: "2026-08-01T10:30:00.000Z"
  },
  {
    id: "proc-laser-peitoral",
    title: "Depilação a Laser - Peitoral",
    subtitle: "Pacote de 10 sessões para a região peitoral masculina ou feminina",
    category: "Depilação a Laser",
    description: "Ideal para atletas, praticantes de musculação ou quem deseja reduzir ou eliminar totalmente os pelos do peito com precisão, higiene e conforto.",
    price: 2200,
    priceNote: "pacote com 10 sessões",
    duration: "30 min",
    sessionsRecommended: "10 sessões",
    recoveryTime: "Sem downtime",
    images: [
      "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=1000&auto=format&fit=crop&q=80"
    ],
    benefits: [
      "Destaca a definição muscular e contorno peitoral",
      "Elimina a transpiração excessiva e pelos encravados",
      "Ajuste da densidade de pelos conforme preferência do paciente",
      "Sessões rápidas e higiênicas"
    ],
    areasTreated: ["Região peitoral completa"],
    contraindications: "Gestantes, bronzeamento recente.",
    idealCandidate: "Homens e mulheres que desejam manter o peito limpo e livre de pelos encravados.",
    isFeatured: false,
    assignedDoctorIds: ["doc-karoline"],
    assignedDoctorNames: ["Dra. Karoline Ferreira"],
    order: 32,
    createdAt: "2026-08-01T10:31:00.000Z"
  },
  {
    id: "proc-laser-torax",
    title: "Depilação a Laser - Tórax",
    subtitle: "Pacote de 10 sessões com cobertura ampla do tórax e abdômen superior",
    category: "Depilação a Laser",
    description: "Tratamento a laser com ampla área de disparo para remoção de pelos densos no tórax anterior, garantindo pele lisa e sem irritações.",
    price: 2200,
    priceNote: "pacote com 10 sessões",
    duration: "30 a 35 min",
    sessionsRecommended: "10 sessões",
    recoveryTime: "Sem downtime",
    images: [
      "https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=1000&auto=format&fit=crop&q=80"
    ],
    benefits: [
      "Eliminação profunda de pelos grossos e resistentes",
      "Melhora na respiração e conforto da pele nos treinos",
      "Segurança e proteção dérmica contínua",
      "Resultado limpo e duradouro"
    ],
    areasTreated: ["Região torácica anterior"],
    contraindications: "Gestantes, pele bronzeada.",
    idealCandidate: "Pessoas que buscam praticidade e estética na região do tórax.",
    isFeatured: false,
    assignedDoctorIds: ["doc-karoline"],
    assignedDoctorNames: ["Dra. Karoline Ferreira"],
    order: 33,
    createdAt: "2026-08-01T10:32:00.000Z"
  },
  {
    id: "proc-laser-costas",
    title: "Depilação a Laser - Costas",
    subtitle: "Pacote de 10 sessões para as costas completas e ombros",
    category: "Depilação a Laser",
    description: "Elimina a dificuldade de depilar as costas sozinho. O laser alcança toda a extensão dorsal dos ombros à lombar, acabando com pelos incômodos, acne mecânica e irritações por suor.",
    price: 3200,
    priceNote: "pacote com 10 sessões",
    duration: "40 a 50 min",
    sessionsRecommended: "10 sessões",
    recoveryTime: "Sem downtime",
    images: [
      "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=1000&auto=format&fit=crop&q=80"
    ],
    benefits: [
      "Cobertura completa das costas e trapézio/ombros",
      "Fim da necessidade de ceras dolorosas nas costas",
      "Redução drástica de espinhas e pelos encravados no dorso",
      "Pele lisa e visual impecável sem camisa"
    ],
    areasTreated: ["Costas superiores", "Dorso médio", "Região lombar", "Ombros"],
    contraindications: "Gestantes, exposição solar intensa nos últimos 15 dias.",
    idealCandidate: "Homens e mulheres com pelos nas costas que buscam praticidade e alívio permanente.",
    isFeatured: true,
    assignedDoctorIds: ["doc-karoline"],
    assignedDoctorNames: ["Dra. Karoline Ferreira"],
    order: 34,
    createdAt: "2026-08-01T10:33:00.000Z"
  }
];

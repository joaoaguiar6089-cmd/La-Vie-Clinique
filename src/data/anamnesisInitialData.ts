import {
  AnamnesisQuestion,
  AnamnesisTemplate,
  Patient,
  AnamnesisRecord,
  EvaluationTemplate,
} from '../types';

/**
 * Perguntas Gerais padrão — herança obrigatória em toda ficha de anamnese
 */
export const DEFAULT_GENERAL_QUESTIONS: AnamnesisQuestion[] = [
  {
    id: 'gen-musica',
    texto: 'Qual tipo de música você gosta?',
    tipo_campo: 'texto_curto',
    obrigatoria: false,
    ordem: 1,
    ajuda: 'Para ambientação relaxante e personalizada da sala durante o atendimento',
  },
];

/**
 * Triagem de saúde da Depilação a Laser — o que a paciente responde.
 *
 * Os IDs são estáveis e descritivos de propósito. Uma ficha já preenchida guarda as respostas
 * por ID (`respostasEspecificas`), então renomear um ID desliga a resposta correspondente em todo
 * o histórico. Por isso as perguntas que continuaram existentes mantiveram o ID antigo, mesmo
 * quando a ordem mudou — e as novas ganharam nome descritivo, sem número, para que a próxima
 * reordenação não crie a tentação de renumerá-las.
 */
export const LASER_HEALTH_QUESTIONS: AnamnesisQuestion[] = [
  {
    id: 'laser-q1-doenca-saude',
    texto: 'Possui alguma doença ou condição de saúde?',
    tipo_campo: 'sim_nao',
    obrigatoria: true,
    ordem: 1,
    publicoAlvo: 'paciente',
  },
  {
    id: 'laser-q2-diabetes',
    texto: 'Possui diabetes?',
    tipo_campo: 'sim_nao',
    obrigatoria: true,
    ordem: 2,
    publicoAlvo: 'paciente',
  },
  {
    id: 'laser-q3-autoimunes',
    texto: 'Possui doenças autoimunes?',
    tipo_campo: 'sim_nao',
    obrigatoria: true,
    ordem: 3,
    publicoAlvo: 'paciente',
  },
  {
    id: 'laser-q4-hormonais',
    texto: 'Possui alterações hormonais ou endocrinológicas?',
    tipo_campo: 'sim_nao',
    obrigatoria: true,
    ordem: 4,
    publicoAlvo: 'paciente',
  },
  {
    id: 'laser-q5-sop',
    texto: 'Possui síndrome dos ovários policísticos (SOP)?',
    tipo_campo: 'sim_nao',
    obrigatoria: true,
    ordem: 5,
    publicoAlvo: 'paciente',
  },
  {
    id: 'laser-q6-investigando-hormonais',
    texto: 'Está investigando ou tratando alterações hormonais?',
    tipo_campo: 'sim_nao',
    obrigatoria: true,
    ordem: 6,
    publicoAlvo: 'paciente',
  },
  {
    id: 'laser-q7-queloide',
    texto: 'Possui histórico de queloide ou cicatrização alterada?',
    tipo_campo: 'sim_nao',
    obrigatoria: true,
    ordem: 7,
    publicoAlvo: 'paciente',
  },
  {
    id: 'laser-q8-vitiligo',
    texto: 'Possui vitiligo?',
    tipo_campo: 'sim_nao',
    obrigatoria: true,
    ordem: 8,
    publicoAlvo: 'paciente',
  },
  {
    id: 'laser-q9-herpes',
    texto: 'Possui herpes recorrente na região a ser tratada?',
    tipo_campo: 'sim_nao',
    obrigatoria: true,
    ordem: 9,
    publicoAlvo: 'paciente',
  },
  {
    id: 'laser-q10-infeccao-area',
    texto: 'Possui infecção, ferida, inflamação ou irritação na área?',
    tipo_campo: 'sim_nao',
    obrigatoria: true,
    ordem: 10,
    publicoAlvo: 'paciente',
  },
  {
    id: 'laser-q11-manchas-queimaduras',
    texto: 'Possui histórico de manchas ou queimaduras após procedimentos?',
    tipo_campo: 'sim_nao',
    obrigatoria: true,
    ordem: 11,
    publicoAlvo: 'paciente',
  },
  {
    id: 'laser-q12-reacao-luz-sol',
    texto: 'Já apresentou reação importante à luz ou ao sol?',
    tipo_campo: 'sim_nao',
    obrigatoria: true,
    ordem: 12,
    publicoAlvo: 'paciente',
  },
  {
    id: 'laser-q13-alergias',
    texto: 'Possui alergias conhecidas?',
    tipo_campo: 'sim_nao',
    obrigatoria: true,
    ordem: 13,
    publicoAlvo: 'paciente',
  },
];

/**
 * Segurança técnica e histórico recente — ainda respondidos pela paciente.
 *
 * São as perguntas que decidem se a sessão pode acontecer **hoje**: bronzeamento recente,
 * isotretinoína, método de remoção usado por último, ácidos na região, anticoagulantes, hormônios,
 * gravidez e ciclo menstrual.
 */
export const LASER_TECHNICAL_QUESTIONS: AnamnesisQuestion[] = [
  {
    id: 'laser-q16-sol',
    texto: 'Exposição solar intensa, praia ou bronzeamento artificial nos últimos 20 dias?',
    tipo_campo: 'sim_nao',
    obrigatoria: true,
    ordem: 14,
    publicoAlvo: 'paciente',
  },
  {
    id: 'laser-q17-roacutan',
    texto: 'Uso oral de isotretinoína (Roacutan) nos últimos 6 meses?',
    tipo_campo: 'sim_nao',
    obrigatoria: true,
    ordem: 15,
    publicoAlvo: 'paciente',
  },
  {
    id: 'laser-q18-metodo-anterior',
    texto: 'Método utilizado recentemente para retirada dos pelos na área:',
    tipo_campo: 'unica_escolha',
    opcoes: [
      'Lâmina de barbear (raspagem)',
      'Cera quente ou fria (arrancamento)',
      'Pinça',
      'Creme depilatório',
      'Laser anterior',
    ],
    obrigatoria: true,
    ordem: 16,
    publicoAlvo: 'paciente',
  },
  {
    id: 'laser-q19-acidos',
    texto: 'Aplicação de ácidos tópicos (glicólico, retinóico, salicílico) na região a ser tratada?',
    tipo_campo: 'sim_nao',
    obrigatoria: false,
    ordem: 17,
    publicoAlvo: 'paciente',
  },
  {
    id: 'laser-anticoagulantes',
    texto: 'Usa anticoagulantes?',
    tipo_campo: 'sim_nao',
    obrigatoria: true,
    ordem: 18,
    publicoAlvo: 'paciente',
  },
  {
    id: 'laser-medicamentos-hormonais',
    texto: 'Utiliza medicamentos hormonais ou anticoncepcionais?',
    tipo_campo: 'sim_nao',
    obrigatoria: true,
    ordem: 19,
    publicoAlvo: 'paciente',
  },
  {
    id: 'laser-gravidez',
    // O asterisco vem do formulário da clínica: gravidez é contraindicação absoluta, e a pergunta
    // é marcada para saltar aos olhos de quem confere a ficha antes da sessão.
    texto: '* Está grávida ou existe possibilidade de gravidez?',
    tipo_campo: 'sim_nao',
    obrigatoria: true,
    ordem: 20,
    publicoAlvo: 'paciente',
  },
  {
    id: 'laser-menstruada',
    texto:
      'Está menstruada? (especialmente relevante para algumas áreas e conforto, embora não seja ' +
      'contraindicação absoluta)',
    tipo_campo: 'sim_nao',
    obrigatoria: true,
    ordem: 21,
    publicoAlvo: 'paciente',
  },
];

/**
 * Avaliação da profissional — pele e pelo, o que define os parâmetros do disparo.
 *
 * Não vai ao formulário online: `publicoAlvo: 'medico'` mantém estas perguntas fora do link que a
 * paciente recebe e dentro da parte que a profissional preenche no atendimento.
 */
export const LASER_PROFESSIONAL_QUESTIONS: AnamnesisQuestion[] = [
  {
    id: 'laser-q15-fototipo',
    texto: 'Fototipo de pele estimado de acordo com a escala de Fitzpatrick:',
    tipo_campo: 'unica_escolha',
    opcoes: [
      'Fototipo I (Pele muito clara, sempre queima, nunca bronzeia)',
      'Fototipo II (Pele clara, queima com facilidade, bronzeia pouco)',
      'Fototipo III (Pele morena clara, queima moderadamente, bronzeia gradual)',
      'Fototipo IV (Pele morena média, queima raramente, bronzeia facilmente)',
      'Fototipo V (Pele morena escura, muito raramente queima)',
      'Fototipo VI (Pele negra, nunca queima)',
    ],
    obrigatoria: true,
    ordem: 22,
    publicoAlvo: 'medico',
  },
  {
    id: 'laser-fototipo-confirmado',
    texto: 'Fototipo de Fitzpatrick:',
    tipo_campo: 'multipla_escolha',
    opcoes: ['I', 'II', 'III', 'IV', 'V', 'VI'],
    obrigatoria: true,
    ordem: 23,
    publicoAlvo: 'medico',
  },
  {
    id: 'laser-cor-pelo',
    texto: 'Cor do pelo',
    tipo_campo: 'unica_escolha',
    opcoes: [
      'Preto',
      'Castanho escuro',
      'Castanho claro',
      'Ruivo',
      'Loiro',
      'Grisalho ou branco',
    ],
    obrigatoria: true,
    ordem: 24,
    publicoAlvo: 'medico',
  },
  {
    id: 'laser-espessura-pelo',
    texto: 'Espessura',
    tipo_campo: 'unica_escolha',
    opcoes: ['Fino', 'Médio', 'Grosso'],
    obrigatoria: true,
    ordem: 25,
    publicoAlvo: 'medico',
  },
  {
    id: 'laser-densidade-pelo',
    texto: 'DENSIDADE',
    tipo_campo: 'unica_escolha',
    opcoes: ['Baixa', 'Média', 'Alta'],
    obrigatoria: false,
    ordem: 26,
    publicoAlvo: 'medico',
  },
  {
    id: 'laser-pele-caracteristicas',
    texto: 'PELE',
    tipo_campo: 'multipla_escolha',
    opcoes: [
      'Normal',
      'Seca',
      'Oleosa',
      'Sensível',
      'Bronzeada',
      'Com manchas / hiperpigmentação',
      'Com foliculite',
      'Com pelos encravados',
      'Com cicatrizes',
      'Com lesões ativas',
    ],
    obrigatoria: true,
    ordem: 27,
    publicoAlvo: 'medico',
  },
];

/**
 * As 21 perguntas que a **paciente** responde na ficha de Depilação a Laser.
 *
 * As seis da profissional (22–27) saíram daqui quando a avaliação virou documento por sessão —
 * continuam exportadas acima, agora consumidas por `DEFAULT_EVALUATION_TEMPLATES` e pela migração
 * que as move nas clínicas que já estavam rodando.
 */
export const ALL_LASER_PROCEDURE_QUESTIONS: AnamnesisQuestion[] = [
  ...LASER_HEALTH_QUESTIONS,
  ...LASER_TECHNICAL_QUESTIONS,
];

/**
 * Fichas-modelo padrão para os procedimentos requisitados pela clínica La Vie
 */
/**
 * Bloco de avaliação clínica da Harmonização Glútea, respondido pela profissional (não pela
 * paciente). Fica exportado à parte porque duas coisas o consomem: a ficha-modelo padrão logo
 * abaixo, para clínicas novas, e a migração em databaseService que o acrescenta à ficha que já
 * existe no Firestore de quem começou a usar o sistema antes destas perguntas existirem.
 *
 * `ordem` sai daqui zerada de propósito — quem aplica renumera a lista inteira no fim.
 */
export const PERGUNTAS_PROFISSIONAL_GLUTEO: AnamnesisQuestion[] = [
  {
    id: 'gluteo-prof-queixa',
    texto: 'Principal queixa:',
    tipo_campo: 'texto_longo',
    obrigatoria: false,
    ordem: 0,
    publicoAlvo: 'medico',
  },
  {
    id: 'gluteo-prof-alteracao',
    texto: 'Alteração identificada:',
    tipo_campo: 'texto_longo',
    obrigatoria: false,
    ordem: 0,
    publicoAlvo: 'medico',
  },
  {
    id: 'gluteo-prof-objetivo',
    texto: 'Objetivo estético:',
    tipo_campo: 'texto_longo',
    obrigatoria: false,
    ordem: 0,
    publicoAlvo: 'medico',
  },
  {
    id: 'gluteo-prof-estrategia',
    texto: 'Estratégia proposta:',
    tipo_campo: 'multipla_escolha',
    opcoes: [
      'Glúteo Max',
      'Bioestimulador',
      'Ácido hialurônico',
      'Hexapeptídeos',
      'Associação de técnicas',
      'Hidroxiapatita de cálcio',
      'Outro',
    ],
    obrigatoria: false,
    ordem: 0,
    publicoAlvo: 'medico',
  },
  {
    id: 'gluteo-prof-estrategia-outro',
    texto: 'Se marcou "Outro" na estratégia, especifique qual:',
    tipo_campo: 'texto_curto',
    obrigatoria: false,
    ordem: 0,
    publicoAlvo: 'medico',
  },
  {
    id: 'gluteo-prof-quantidade',
    texto: 'Quantidade de produto utilizado:',
    tipo_campo: 'texto_longo',
    ajuda:
      'Registre a quantidade de cada técnica assinalada acima — ex.: Bioestimulador, 2 frascos; ' +
      'Ácido hialurônico, 10 ml.',
    obrigatoria: false,
    ordem: 0,
    publicoAlvo: 'medico',
  },
  {
    id: 'gluteo-prof-prioridade',
    texto: 'Prioridade de tratamento:',
    tipo_campo: 'texto_curto',
    obrigatoria: false,
    ordem: 0,
    publicoAlvo: 'medico',
  },
  {
    id: 'gluteo-prof-evolucao-paciente',
    texto: 'Evolução percebida pela paciente:',
    tipo_campo: 'texto_longo',
    obrigatoria: false,
    ordem: 0,
    publicoAlvo: 'medico',
  },
  {
    id: 'gluteo-prof-evolucao-profissional',
    texto: 'Evolução observada pelo profissional:',
    tipo_campo: 'texto_longo',
    obrigatoria: false,
    ordem: 0,
    publicoAlvo: 'medico',
  },
  {
    id: 'gluteo-prof-projecao',
    texto: 'Projeção',
    tipo_campo: 'escala',
    escalaMax: 10,
    obrigatoria: false,
    ordem: 0,
    publicoAlvo: 'medico',
  },
  {
    id: 'gluteo-prof-simetria',
    texto: 'Simetria',
    tipo_campo: 'escala',
    escalaMax: 10,
    obrigatoria: false,
    ordem: 0,
    publicoAlvo: 'medico',
  },
  {
    id: 'gluteo-prof-contorno',
    texto: 'Contorno',
    tipo_campo: 'escala',
    escalaMax: 10,
    obrigatoria: false,
    ordem: 0,
    publicoAlvo: 'medico',
  },
  {
    id: 'gluteo-prof-qualidade-pele',
    texto: 'Qualidade da pele',
    tipo_campo: 'escala',
    escalaMax: 10,
    obrigatoria: false,
    ordem: 0,
    publicoAlvo: 'medico',
  },
  {
    id: 'gluteo-prof-satisfacao',
    texto: 'Satisfação',
    tipo_campo: 'escala',
    escalaMax: 10,
    obrigatoria: false,
    ordem: 0,
    publicoAlvo: 'medico',
  },
];

export const DEFAULT_PROCEDURE_TEMPLATES: AnamnesisTemplate[] = [
  {
    id: 'tpl-botox',
    procedimentoNome: 'Botox (Toxina Botulínica)',
    categoria: 'Injetáveis & Face',
    tem_foto: true,
    fotoModeloUrl: 'https://images.unsplash.com/photo-1512290900672-1f5be669e4f2?w=1000&auto=format&fit=crop&q=80',
    descricao: 'Ficha para relaxamento muscular e atenuação de rugas dinâmicas. Foto frontal para mapeamento de unidades.',
    perguntasEspecificas: [
      {
        id: 'botox-historico',
        texto: 'Já realizou aplicação de toxina botulínica anteriormente?',
        tipo_campo: 'sim_nao',
        obrigatoria: true,
        ordem: 1,
      },
      {
        id: 'botox-tempo',
        texto: 'Se sim, há quanto tempo foi a última aplicação e houve alguma intercorrência?',
        tipo_campo: 'texto_curto',
        obrigatoria: false,
        ordem: 2,
      },
      {
        id: 'botox-neuromuscular',
        texto: 'Possui alguma doença neuromuscular diagnosticada (ex: Miastenia Gravis, Eaton-Lambert)?',
        tipo_campo: 'sim_nao',
        obrigatoria: true,
        ordem: 3,
      },
      {
        id: 'botox-gestante',
        texto: 'Está gestante, amamentando ou com suspeita de gravidez?',
        tipo_campo: 'sim_nao',
        obrigatoria: true,
        ordem: 4,
      },
      {
        id: 'botox-areas',
        texto: 'Regiões faciais de maior incômodo para tratamento:',
        tipo_campo: 'multipla_escolha',
        opcoes: [
          'Glabela (entre sobrancelhas)',
          'Testa (linhas frontais)',
          'Pés de galinha (orbicular dos olhos)',
          'Bunny lines (linhas no dorso nasal)',
          'Sorriso gengival',
          'Bruxismo / Masseter (afinar terço inferior)',
          'Pescoço / Linhas de Nefertiti',
        ],
        obrigatoria: true,
        ordem: 5,
      },
      {
        id: 'botox-sensibilidade',
        texto: 'Nível de sensibilidade ou receio a picadas de agulha (1 = tranquilo, 10 = muito sensível):',
        tipo_campo: 'escala',
        escalaMax: 10,
        obrigatoria: false,
        ordem: 6,
      },
      {
        id: 'botox-medicamentos',
        texto: 'Uso recente de anticoagulantes, anti-inflamatórios ou ácido acetilsalicílico (AAS)?',
        tipo_campo: 'sim_nao',
        obrigatoria: false,
        ordem: 7,
      },
    ],
  },
  {
    id: 'tpl-hifu',
    procedimentoNome: 'HIFU (Ultrassom Microfocado)',
    categoria: 'Tecnologias Avançadas',
    tem_foto: true,
    descricao: 'Lifting não cirúrgico e estímulo de SMAS. Foto facial/corporal para planejamento de vetores de tração.',
    perguntasEspecificas: [
      {
        id: 'hifu-proteses',
        texto: 'Possui implantes metálicos, marcapasso, desfibrilador ou fios definitivos na face/corpo?',
        tipo_campo: 'sim_nao',
        obrigatoria: true,
        ordem: 1,
      },
      {
        id: 'hifu-preenchedores',
        texto: 'Possui preenchedores (ácido hialurônico, bioestimuladores) aplicados na mesma região nos últimos 60 dias?',
        tipo_campo: 'sim_nao',
        obrigatoria: true,
        ordem: 2,
      },
      {
        id: 'hifu-areas',
        texto: 'Áreas de maior interesse para retração e ancoragem tecidual:',
        tipo_campo: 'multipla_escolha',
        opcoes: [
          'Terço médio / Malar (efeito bochecha erguida)',
          'Contorno Mandibular',
          'Papada / Região submentoniana',
          'Pálpebras e arqueamento de sobrancelha',
          'Pescoço / Colo',
          'Abdômen / Flacidez umbilical',
        ],
        obrigatoria: true,
        ordem: 3,
      },
      {
        id: 'hifu-dor',
        texto: 'Tolerância ao calor e dor térmica profunda (1 = muito baixa, 10 = muito resistente):',
        tipo_campo: 'escala',
        escalaMax: 10,
        obrigatoria: false,
        ordem: 4,
      },
      {
        id: 'hifu-paralisia',
        texto: 'Histórico de paralisia facial periférica ou infecções ativas no local da aplicação?',
        tipo_campo: 'sim_nao',
        obrigatoria: true,
        ordem: 5,
      },
    ],
  },
  {
    id: 'tpl-drenagem',
    procedimentoNome: 'Drenagem Corporal',
    categoria: 'Corporal & Relaxamento',
    tem_foto: false,
    descricao: 'Drenagem linfática manual ou método redutor. Estímulo do sistema linfático e eliminação de líquidos.',
    perguntasEspecificas: [
      {
        id: 'dren-trombose',
        texto: 'Diagnóstico de trombose venosa profunda (TVP), flebite aguda ou insuficiência cardíaca?',
        tipo_campo: 'sim_nao',
        obrigatoria: true,
        ordem: 1,
      },
      {
        id: 'dren-motivo',
        texto: 'Principal objetivo para a drenagem de hoje:',
        tipo_campo: 'unica_escolha',
        opcoes: [
          'Alívio de inchaço e retenção de líquidos',
          'Pós-operatório de cirurgia plástica',
          'Cansaço e sensação de peso nas pernas',
          'Relaxamento e bem-estar geral',
        ],
        obrigatoria: true,
        ordem: 2,
      },
      {
        id: 'dren-estado',
        texto: 'Condição fisiológica atual:',
        tipo_campo: 'unica_escolha',
        opcoes: [
          'Nenhuma condição específica',
          'Período menstrual',
          'Gestante (com liberação obstétrica)',
          'Pós-parto recente',
        ],
        obrigatoria: true,
        ordem: 3,
      },
      {
        id: 'dren-agua',
        texto: 'Qual é o seu consumo médio diário de água?',
        tipo_campo: 'unica_escolha',
        opcoes: ['Menos de 1 litro', '1 a 2 litros', 'Mais de 2 litros'],
        obrigatoria: false,
        ordem: 4,
      },
      {
        id: 'dren-atividade',
        texto: 'Pratica atividades físicas regularmente?',
        tipo_campo: 'sim_nao',
        obrigatoria: false,
        ordem: 5,
      },
    ],
  },
  {
    id: 'tpl-harmonizacao-glutea',
    procedimentoNome: 'Harmonização Glútea',
    categoria: 'Corporal & Injetáveis',
    tem_foto: true,
    descricao: 'Bioplastia e bioestímulo de colágeno para contorno, volumização e firmeza glútea. Foto para planejamento.',
    perguntasEspecificas: [
      {
        id: 'gluteo-procedimento-anterior',
        texto: 'Já realizou procedimentos prévios com silicone líquido, PMMA ou hidrogel na região?',
        tipo_campo: 'sim_nao',
        obrigatoria: true,
        ordem: 1,
      },
      {
        id: 'gluteo-anterior-detalhe',
        texto: 'Se sim, especifique qual substância e há quantos anos:',
        tipo_campo: 'texto_curto',
        obrigatoria: false,
        ordem: 2,
      },
      {
        id: 'gluteo-foco',
        texto: 'Foco principal desejado para a harmonização:',
        tipo_campo: 'unica_escolha',
        opcoes: [
          'Projeção central e volume superior (efeito empinado)',
          'Preenchimento de depressão trocantérica (bananinha lateral)',
          'Tratamento intensivo de celulite e flacidez dérmica',
          'Definição de contorno e arredondamento',
        ],
        obrigatoria: true,
        ordem: 3,
      },
      {
        id: 'gluteo-anestesia',
        texto: 'Possui alergia conhecida a anestésicos locais (lidocaína, prilocaína)?',
        tipo_campo: 'sim_nao',
        obrigatoria: true,
        ordem: 4,
      },
      {
        id: 'gluteo-musculacao',
        texto: 'Pratica musculação ou exercícios direcionados para glúteos?',
        tipo_campo: 'sim_nao',
        obrigatoria: false,
        ordem: 5,
      },
      // As perguntas da profissional saíram daqui para `DEFAULT_EVALUATION_TEMPLATES`: elas são
      // uma por sessão, e a anamnese é uma por caso. Ver `PERGUNTAS_PROFISSIONAL_GLUTEO`.
    ],
  },
  {
    id: 'tpl-lipedema',
    procedimentoNome: 'Suporte Estético para Lipedema',
    categoria: 'Tratamentos Especiais',
    tem_foto: true,
    descricao: 'Abordagem especializada para controle inflamatório, drenagem tecidual e alívio de peso em membros com lipedema.',
    perguntasEspecificas: [
      {
        id: 'lip-diagnostico',
        texto: 'Possui diagnóstico formal de Lipedema emitido por médico especialista?',
        tipo_campo: 'sim_nao',
        obrigatoria: true,
        ordem: 1,
      },
      {
        id: 'lip-estagio',
        texto: 'Estágio do lipedema informado pelo seu médico:',
        tipo_campo: 'unica_escolha',
        opcoes: [
          'Estágio 1 (pele homogênea, nódulos palpáveis)',
          'Estágio 2 (ondulações na pele, nódulos maiores)',
          'Estágio 3 (grandes deformidades teciduais e dobras)',
          'Em investigação / Não sabe o estágio',
        ],
        obrigatoria: false,
        ordem: 2,
      },
      {
        id: 'lip-dor',
        texto: 'Intensidade da dor ou sensibilidade ao toque nas pernas/braços (1 = sem dor, 10 = dor severa):',
        tipo_campo: 'escala',
        escalaMax: 10,
        obrigatoria: true,
        ordem: 3,
      },
      {
        id: 'lip-sintomas',
        texto: 'Sintomas frequentes vivenciados no dia a dia:',
        tipo_campo: 'multipla_escolha',
        opcoes: [
          'Sensação de peso e cansaço extremo nas pernas',
          'Manchas roxas (hematomas) que surgem espontaneamente',
          'Dor após ficar em pé por períodos prolongados',
          'Inchaço nos tornozelos preservando os pés',
          'Sensação de queimação ou calor nas coxas',
        ],
        obrigatoria: true,
        ordem: 4,
      },
      {
        id: 'lip-meia',
        texto: 'Faz uso regular de meia de compressão elástica ou terapia compressiva?',
        tipo_campo: 'sim_nao',
        obrigatoria: false,
        ordem: 5,
      },
      {
        id: 'lip-cirurgia',
        texto: 'Já realizou cirurgia de lipoaspiração específica para lipedema no passado?',
        tipo_campo: 'sim_nao',
        obrigatoria: false,
        ordem: 6,
      },
    ],
  },
  {
    id: 'tpl-rejuvenescimento-intimo',
    procedimentoNome: 'Rejuvenescimento Íntimo a Laser',
    categoria: 'Ginecologia Estética & Laser',
    tem_foto: false,
    descricao: 'Terapia a laser fracionado para melhora da firmeza, tônus muscular e mucosa íntima.',
    perguntasEspecificas: [
      {
        id: 'int-papanicolau',
        texto: 'Exame preventivo (Papanicolau) realizado no último ano com resultado normal?',
        tipo_campo: 'sim_nao',
        obrigatoria: true,
        ordem: 1,
      },
      {
        id: 'int-infeccao',
        texto: 'Presença de sangramento genital sem causa definida, lesões ou infecção ativa (corrimento atípico)?',
        tipo_campo: 'sim_nao',
        obrigatoria: true,
        ordem: 2,
      },
      {
        id: 'int-queixas',
        texto: 'Principais objetivos ou queixas para a sessão:',
        tipo_campo: 'multipla_escolha',
        opcoes: [
          'Perda involuntária de urina ao tossir/espirrar/fazer esforço',
          'Flacidez cutânea dos grandes lábios',
          'Sensação de ressecamento ou desconforto na relação íntima',
          'Clareamento da região perineal e virilha',
          'Melhora geral da tonicidade vaginal',
        ],
        obrigatoria: true,
        ordem: 3,
      },
      {
        id: 'int-menopausa',
        texto: 'Encontra-se no climatério ou menopausa?',
        tipo_campo: 'sim_nao',
        obrigatoria: false,
        ordem: 4,
      },
      {
        id: 'int-herpes',
        texto: 'Histórico de herpes genital recorrente?',
        tipo_campo: 'sim_nao',
        obrigatoria: true,
        ordem: 5,
      },
    ],
  },
  {
    id: 'tpl-ozonioterapia',
    procedimentoNome: 'Ozonioterapia',
    categoria: 'Integrativa & Bem-Estar',
    tem_foto: false,
    descricao: 'Aplicação médica de ozônio medicinal com ação anti-inflamatória, imunomoduladora e bactericida.',
    perguntasEspecificas: [
      {
        id: 'ozo-g6pd',
        texto: 'Possui diagnóstico de Favismo (deficiência congênita da enzima G6PD)?',
        tipo_campo: 'sim_nao',
        obrigatoria: true,
        ordem: 1,
      },
      {
        id: 'ozo-tireoide',
        texto: 'Diagnóstico de hipertireoidismo descompensado ou anemia falciforme?',
        tipo_campo: 'sim_nao',
        obrigatoria: true,
        ordem: 2,
      },
      {
        id: 'ozo-via',
        texto: 'Via de aplicação planejada para a sessão de hoje:',
        tipo_campo: 'unica_escolha',
        opcoes: [
          'Insuflação retal sistêmica',
          'Insuflação auricular',
          'Infiltração local / Subcutânea',
          'Bagging (bolsa de ozônio em membro)',
          'Óleo ozonizado tópico',
        ],
        obrigatoria: true,
        ordem: 3,
      },
      {
        id: 'ozo-objetivo',
        texto: 'Descreva a queixa ou objetivo de saúde para o protocolo de ozônio:',
        tipo_campo: 'texto_longo',
        obrigatoria: true,
        ordem: 4,
      },
      {
        id: 'ozo-jejum',
        texto: 'Está em jejum prolongado de mais de 4 horas no momento?',
        tipo_campo: 'sim_nao',
        obrigatoria: false,
        ordem: 5,
      },
    ],
  },
  {
    id: 'tpl-capilar',
    procedimentoNome: 'Capilar (Tricologia & Microagulhamento)',
    categoria: 'Tricologia & Capilar',
    tem_foto: true,
    descricao: 'Terapia para alopécia, queda acentuada e afinamento folicular. Foto do couro cabeludo (vértex e linha frontal).',
    perguntasEspecificas: [
      {
        id: 'cap-tempo-queda',
        texto: 'Há quanto tempo percebe o aumento na queda ou falha capilar?',
        tipo_campo: 'unica_escolha',
        opcoes: [
          'Queda aguda recente (menos de 3 meses)',
          'De 3 a 6 meses',
          'De 6 meses a 1 ano',
          'Afinamento crônico há mais de 1 ano',
        ],
        obrigatoria: true,
        ordem: 1,
      },
      {
        id: 'cap-familia',
        texto: 'Histórico familiar de calvície (mãe, pai, tios, avós)?',
        tipo_campo: 'sim_nao',
        obrigatoria: false,
        ordem: 2,
      },
      {
        id: 'cap-sintomas',
        texto: 'Sintomas no couro cabeludo relatados:',
        tipo_campo: 'multipla_escolha',
        opcoes: [
          'Oleosidade excessiva ou caspa',
          'Coceira (prurido) frequente',
          'Dor ou sensibilidade na raiz ao prender o cabelo (tricodinia)',
          'Foliculite ou espinhas no couro cabeludo',
          'Cabelos quebradiços e sem brilho',
        ],
        obrigatoria: true,
        ordem: 3,
      },
      {
        id: 'cap-medicacoes',
        texto: 'Uso de minoxidil, finasterida, espironolactona ou tônicos capilares atuais:',
        tipo_campo: 'texto_curto',
        obrigatoria: false,
        ordem: 4,
      },
      {
        id: 'cap-exames',
        texto: 'Exames laboratoriais recentes com ferritina, ferro ou tireoide alterados?',
        tipo_campo: 'sim_nao',
        obrigatoria: false,
        ordem: 5,
      },
    ],
  },
  {
    id: 'tpl-soroterapia',
    procedimentoNome: 'Soroterapia (Nutrologia Injetável)',
    categoria: 'Integrativa & Performance',
    tem_foto: false,
    descricao: 'Infusão intravenosa de aminoácidos, minerais e antioxidantes para imunidade, disposição e beleza celular.',
    perguntasEspecificas: [
      {
        id: 'soro-renal',
        texto: 'Histórico de insuficiência renal crônica, insuficiência cardíaca ou disfunção hepática severa?',
        tipo_campo: 'sim_nao',
        obrigatoria: true,
        ordem: 1,
      },
      {
        id: 'soro-alergias',
        texto: 'Alergia conhecida a medicamentos, vitaminas do complexo B ou sulfas:',
        tipo_campo: 'texto_curto',
        obrigatoria: true,
        ordem: 2,
      },
      {
        id: 'soro-blend',
        texto: 'Protocolo nutricional intravenoso recomendado para o atendimento:',
        tipo_campo: 'unica_escolha',
        opcoes: [
          'Beauty & Glow (Colágeno, Biotina e Vitamina C)',
          'Immunity & Detox (Glutationa, NAC e Minerais)',
          'Energy & Performance (Complexo B, Magnésio e Coenzima Q10)',
          'Anti-Stress & Relax (Triptofano, Gaba e Magnésio Quelato)',
          'Metabolic Burn (L-Carnitina e Picolinato)',
        ],
        obrigatoria: true,
        ordem: 3,
      },
      {
        id: 'soro-desmaio',
        texto: 'Histórico de tontura, mal-estar ou síncope (desmaio) durante coletas de sangue ou venóclise?',
        tipo_campo: 'sim_nao',
        obrigatoria: false,
        ordem: 4,
      },
      {
        id: 'soro-alimentacao',
        texto: 'Horário da última refeição sólida realizada:',
        tipo_campo: 'texto_curto',
        obrigatoria: false,
        ordem: 5,
      },
    ],
  },
  {
    id: 'tpl-epilacao-laser',
    procedimentoNome: 'Epilação a Laser',
    categoria: 'Laser & Alta Tecnologia',
    tem_foto: false,
    descricao: 'Remoção definitiva de pelos com laser de diodo/alexandrite. Verificação de fototipo, segurança térmica e histórico de saúde.',
    perguntasEspecificas: ALL_LASER_PROCEDURE_QUESTIONS,
  },

  // ==========================================
  // DEPILAÇÃO A LASER (13 procedimentos)
  // ==========================================
  {
    id: 'tpl-laser-buco',
    procedimentoId: 'proc-laser-buco',
    procedimentoNome: 'Depilação a Laser - Buço',
    categoria: 'Depilação a Laser',
    tem_foto: false,
    descricao: 'Ficha de anamnese e triagem dermatológica para epilação a laser no buço e lábio superior.',
    perguntasEspecificas: ALL_LASER_PROCEDURE_QUESTIONS,
  },
  {
    id: 'tpl-laser-queixo',
    procedimentoId: 'proc-laser-queixo',
    procedimentoNome: 'Depilação a Laser - Queixo',
    categoria: 'Depilação a Laser',
    tem_foto: false,
    descricao: 'Ficha de anamnese e triagem dermatológica para epilação a laser no queixo e mento.',
    perguntasEspecificas: ALL_LASER_PROCEDURE_QUESTIONS,
  },
  {
    id: 'tpl-laser-face-lateral',
    procedimentoId: 'proc-laser-face-lateral',
    procedimentoNome: 'Depilação a Laser - Face Lateral',
    categoria: 'Depilação a Laser',
    tem_foto: false,
    descricao: 'Ficha de anamnese e avaliação fototípica para epilação a laser nas laterais da face e costeletas.',
    perguntasEspecificas: ALL_LASER_PROCEDURE_QUESTIONS,
  },
  {
    id: 'tpl-laser-maca-rosto',
    procedimentoId: 'proc-laser-maca-rosto',
    procedimentoNome: 'Depilação a Laser - Maçã do Rosto',
    categoria: 'Depilação a Laser',
    tem_foto: false,
    descricao: 'Ficha de anamnese e triagem dermatológica para epilação a laser na região malar e bochechas.',
    perguntasEspecificas: ALL_LASER_PROCEDURE_QUESTIONS,
  },
  {
    id: 'tpl-laser-virilha-completa',
    procedimentoId: 'proc-laser-virilha-completa',
    procedimentoNome: 'Depilação a Laser - Virilha Completa',
    categoria: 'Depilação a Laser',
    tem_foto: false,
    descricao: 'Ficha de anamnese com triagem de fototipo, sensibilidade e histórico dérmico para epilação a laser na virilha completa.',
    perguntasEspecificas: ALL_LASER_PROCEDURE_QUESTIONS,
  },
  {
    id: 'tpl-laser-perianal',
    procedimentoId: 'proc-laser-perianal',
    procedimentoNome: 'Depilação a Laser - Perianal',
    categoria: 'Depilação a Laser',
    tem_foto: false,
    descricao: 'Triagem clínica para epilação a laser na região perianal com foco em integridade dérmica e segurança.',
    perguntasEspecificas: ALL_LASER_PROCEDURE_QUESTIONS,
  },
  {
    id: 'tpl-laser-linha-alba',
    procedimentoId: 'proc-laser-linha-alba',
    procedimentoNome: 'Depilação a Laser - Linha Alba',
    categoria: 'Depilação a Laser',
    tem_foto: false,
    descricao: 'Ficha de anamnese e segurança para epilação a laser na linha alba abdominal.',
    perguntasEspecificas: ALL_LASER_PROCEDURE_QUESTIONS,
  },
  {
    id: 'tpl-laser-axilas',
    procedimentoId: 'proc-laser-axilas',
    procedimentoNome: 'Depilação a Laser - Axilas',
    categoria: 'Depilação a Laser',
    tem_foto: false,
    descricao: 'Ficha de anamnese para epilação a laser nas axilas, avaliação de foliculite, atrito e sensibilidade.',
    perguntasEspecificas: ALL_LASER_PROCEDURE_QUESTIONS,
  },
  {
    id: 'tpl-laser-meia-perna',
    procedimentoId: 'proc-laser-meia-perna',
    procedimentoNome: 'Depilação a Laser - ½ Perna',
    categoria: 'Depilação a Laser',
    tem_foto: false,
    descricao: 'Ficha de anamnese para epilação a laser na meia perna (dos joelhos aos tornozelos).',
    perguntasEspecificas: ALL_LASER_PROCEDURE_QUESTIONS,
  },
  {
    id: 'tpl-laser-perna-completa',
    procedimentoId: 'proc-laser-perna-completa',
    procedimentoNome: 'Depilação a Laser - Perna Completa',
    categoria: 'Depilação a Laser',
    tem_foto: false,
    descricao: 'Ficha de anamnese e triagem dermatológica para epilação a laser em pernas completas e coxas.',
    perguntasEspecificas: ALL_LASER_PROCEDURE_QUESTIONS,
  },
  {
    id: 'tpl-laser-peitoral',
    procedimentoId: 'proc-laser-peitoral',
    procedimentoNome: 'Depilação a Laser - Peitoral',
    categoria: 'Depilação a Laser',
    tem_foto: false,
    descricao: 'Ficha de anamnese para epilação a laser na região peitoral.',
    perguntasEspecificas: ALL_LASER_PROCEDURE_QUESTIONS,
  },
  {
    id: 'tpl-laser-torax',
    procedimentoId: 'proc-laser-torax',
    procedimentoNome: 'Depilação a Laser - Tórax',
    categoria: 'Depilação a Laser',
    tem_foto: false,
    descricao: 'Ficha de anamnese para epilação a laser no tórax e abdômen anterior.',
    perguntasEspecificas: ALL_LASER_PROCEDURE_QUESTIONS,
  },
  {
    id: 'tpl-laser-costas',
    procedimentoId: 'proc-laser-costas',
    procedimentoNome: 'Depilação a Laser - Costas',
    categoria: 'Depilação a Laser',
    tem_foto: false,
    descricao: 'Ficha de anamnese para epilação a laser nas costas completas e ombros.',
    perguntasEspecificas: ALL_LASER_PROCEDURE_QUESTIONS,
  },
];

/**
 * Pacientes de demonstração com fichas preenchidas para experiência rica imediata
 */
export const SAMPLE_PATIENTS: Patient[] = [
  {
    id: 'pat-1',
    nome: 'Mariana Silveira Ramos',
    contato: '(19) 99812-4421',
    dataNascimento: '1992-06-14',
    email: 'mariana.silveira@email.com',
    observacoes: 'Paciente atenta a cuidados de pele facial e fotoproteção diária.',
    createdAt: '2026-02-15T10:00:00Z',
  },
  {
    id: 'pat-2',
    nome: 'Camila Albuquerque Prado',
    contato: '(19) 99123-8877',
    dataNascimento: '1987-11-28',
    email: 'camila.prado@email.com',
    observacoes: 'Acompanhamento de lipedema grau 1 com foco em redução de edema e alívio de peso.',
    createdAt: '2026-03-01T14:30:00Z',
  },
  {
    id: 'pat-3',
    nome: 'Dra. Beatriz Mendes Vasconcelos',
    contato: '(19) 98765-1100',
    dataNascimento: '1980-04-03',
    email: 'beatriz.mendes@email.com',
    observacoes: 'Adepta de protocolos integrativos e soroterapia de imunidade periódica.',
    createdAt: '2026-03-10T16:00:00Z',
  },
];

/**
 * Fichas respondidas de exemplo
 */
export const SAMPLE_ANAMNESIS_RECORDS: AnamnesisRecord[] = [
  {
    id: 'rec-1',
    pacienteId: 'pat-1',
    pacienteNome: 'Mariana Silveira Ramos',
    pacienteContato: '(19) 99812-4421',
    pacienteDataNascimento: '1992-06-14',
    procedimentoId: 'tpl-botox',
    procedimentoNome: 'Botox (Toxina Botulínica)',
    dataAtendimento: '2026-08-20',
    profissionalNome: 'Dra. Marcella Ribeiro',
    respostasGerais: {
      'gen-nome': 'Mariana Silveira Ramos',
      'gen-nascimento': '1992-06-14',
      'gen-musica': 'Bossa Nova & Lounge acústico suave',
    },
    respostasEspecificas: {
      'botox-historico': 'Sim',
      'botox-tempo': 'Há 7 meses, sem qualquer reação adversa',
      'botox-neuromuscular': 'Não',
      'botox-gestante': 'Não',
      'botox-areas': ['Glabela (entre sobrancelhas)', 'Testa (linhas frontais)', 'Pés de galinha (orbicular dos olhos)'],
      'botox-sensibilidade': 4,
      'botox-medicamentos': 'Não',
    },
    fotoUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=800&auto=format&fit=crop&q=80',
    perguntasSnapshot: {
      gerais: DEFAULT_GENERAL_QUESTIONS,
      especificas: DEFAULT_PROCEDURE_TEMPLATES[0].perguntasEspecificas,
    },
    observacoesFinais: 'Aplicado protocolo Full Face com foco em naturalidade do olhar. Retorno marcado para 15 dias para reavaliação de assimetrias.',
    createdAt: '2026-08-20T14:45:00Z',
  },
  {
    id: 'rec-2',
    pacienteId: 'pat-2',
    pacienteNome: 'Camila Albuquerque Prado',
    pacienteContato: '(19) 99123-8877',
    pacienteDataNascimento: '1987-11-28',
    procedimentoId: 'tpl-lipedema',
    procedimentoNome: 'Suporte Estético para Lipedema',
    dataAtendimento: '2026-08-28',
    profissionalNome: 'Dra. Karoline Ferreira',
    respostasGerais: {
      'gen-nome': 'Camila Albuquerque Prado',
      'gen-nascimento': '1987-11-28',
      'gen-musica': 'Instrumental clássico e piano',
    },
    respostasEspecificas: {
      'lip-diagnostico': 'Sim',
      'lip-estagio': 'Estágio 1 (pele homogênea, nódulos palpáveis)',
      'lip-dor': 6,
      'lip-sintomas': [
        'Sensação de peso e cansaço extremo nas pernas',
        'Manchas roxas (hematomas) que surgem espontaneamente',
        'Dor após ficar em pé por períodos prolongados',
      ],
      'lip-meia': 'Sim',
      'lip-cirurgia': 'Não',
    },
    fotoUrl: 'https://images.unsplash.com/photo-1519699047748-de8e457a634e?w=800&auto=format&fit=crop&q=80',
    perguntasSnapshot: {
      gerais: DEFAULT_GENERAL_QUESTIONS,
      especificas: DEFAULT_PROCEDURE_TEMPLATES[4].perguntasEspecificas,
    },
    observacoesFinais: 'Protocolo de descompressão linfática suave associado a pressoterapia. Orientada hidratação e continuidade no uso de meia elástica.',
    createdAt: '2026-08-28T16:10:00Z',
  },
];

/**
 * Fichas de avaliação padrão — o que a profissional responde **depois** do atendimento.
 *
 * Nasceram de dentro de `DEFAULT_PROCEDURE_TEMPLATES`, onde eram perguntas `publicoAlvo: 'medico'`
 * da anamnese. Saíram de lá porque a cardinalidade não fechava: a anamnese é uma por caso e a
 * avaliação é uma por sessão. Numa paciente com plano de 10 sessões de laser, a avaliação presa à
 * anamnese obrigaria a criar dez históricos de saúde idênticos ou a sobrescrever a avaliação da
 * sessão anterior.
 *
 * As mesmas perguntas alimentam a migração em `databaseService`, que faz esta mudança nas clínicas
 * que já estavam rodando antes de a separação existir — daí os blocos continuarem exportados à
 * parte em vez de escritos aqui dentro.
 */
export const DEFAULT_EVALUATION_TEMPLATES: EvaluationTemplate[] = [
  {
    id: 'aval-epilacao-laser',
    nome: 'Avaliação — Depilação a Laser',
    /**
     * Por **categoria**, e não pelos treze procedimentos um a um: fototipo, cor e espessura do
     * pelo não mudam de buço para axila, e é a mesma razão pela qual a anamnese do laser é uma só
     * para as treze áreas. Área nova no catálogo herda esta ficha sem ninguém precisar lembrar.
     */
    categorias: ['Depilação a Laser'],
    perguntas: LASER_PROFESSIONAL_QUESTIONS.map((q, i) => ({ ...q, ordem: i + 1 })),
    temFotoSessao: true,
    descricao:
      'Avaliação de pele e pelo que define os parâmetros do disparo. Preenchida a cada sessão.',
  },
  {
    id: 'aval-harmonizacao-glutea',
    nome: 'Avaliação — Harmonização Glútea',
    /**
     * Por procedimento, e não por categoria: a ficha da anamnese está em "Corporal & Injetáveis",
     * mas o procedimento no catálogo é "Corporal & Bem-Estar" — ligar pela categoria arrastaria
     * junto drenagem, massagem e tudo o mais que mora lá.
     */
    procedureIds: ['proc-harmonizacao-glutea'],
    perguntas: PERGUNTAS_PROFISSIONAL_GLUTEO.map((q, i) => ({ ...q, ordem: i + 1 })),
    temFotoSessao: true,
    descricao:
      'Queixa, estratégia proposta e evolução do contorno. Preenchida a cada sessão.',
  },
];

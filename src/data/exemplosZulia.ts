import { ClinicProfile, Procedure } from '../types';

/**
 * O que uma clínica nova da Zulia recebe, além das fichas padrão (perguntas gerais e fichas de
 * anamnese, avaliação e acompanhamento): dois procedimentos genéricos de exemplo, para o catálogo
 * não começar vazio. Sem fotos e sem nenhum texto da La Vie. Eles ocupam as 2 vagas de
 * procedimento do plano gratuito até a clínica apagá-los (ver docs/zulia-plataforma.md).
 *
 * Nenhuma paciente de exemplo: a clínica nova começa sem cadastro nenhum.
 */
export const PROCEDIMENTOS_DE_EXEMPLO: Procedure[] = [
  {
    id: 'exemplo-limpeza-de-pele',
    title: 'Limpeza de pele (exemplo)',
    subtitle: 'Procedimento de exemplo — edite ou apague',
    category: 'Facial',
    description:
      'Este é um procedimento de exemplo, para você ver como o catálogo funciona. Troque o nome, a descrição, o valor e as fotos pelos do seu atendimento, ou apague-o.',
    price: 150,
    priceNote: 'por sessão',
    duration: '60 min',
    images: [],
    benefits: ['Escreva aqui os benefícios do procedimento'],
    isFeatured: false,
    order: 1,
    createdAt: '2026-11-01T00:00:00.000Z',
  },
  {
    id: 'exemplo-avaliacao',
    title: 'Consulta de avaliação (exemplo)',
    subtitle: 'Procedimento de exemplo — edite ou apague',
    category: 'Avaliação',
    description:
      'Outro procedimento de exemplo. Use-o como modelo para cadastrar os seus, ou apague-o quando o catálogo estiver pronto.',
    price: 0,
    priceNote: 'consulta',
    duration: '30 min',
    images: [],
    benefits: ['Escreva aqui o que a cliente recebe na consulta'],
    isFeatured: false,
    order: 2,
    createdAt: '2026-11-01T00:00:01.000Z',
  },
];

/**
 * O perfil que o painel mostra na Zulia enquanto o da clínica não chega do banco — em branco, para
 * nunca aparecer o nome, o contato ou a equipe da La Vie para outra clínica. O perfil de verdade é
 * criado com a clínica (`scripts/criar-clinica.ts`).
 */
export const PERFIL_EM_BRANCO: ClinicProfile = {
  name: '',
  tagline: '',
  professionals: [],
  phone: '',
  instagram: '',
  address: '',
  cityState: '',
};

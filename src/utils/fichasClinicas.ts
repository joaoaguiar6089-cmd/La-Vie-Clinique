import { Attendance, EvaluationRecord, Patient } from '../types';
import { ehRealizado, hojeISO } from './attendances';

/**
 * As duas fichas clínicas da profissional — avaliação e acompanhamento — e o que as distingue.
 *
 * Elas usam os mesmos formatos, os mesmos componentes e as mesmas funções de gravação; a
 * diferença mora aqui: o vocabulário da tela, a pasta das fotos e se a ficha pertence a um
 * atendimento. Tudo o que perguntar "de qual das duas estamos falando" lê deste arquivo, para as
 * duas telas nunca discordarem sobre o nome de uma coisa.
 *
 * A ordem da jornada da paciente é Orçamento → Anamnese → **Avaliação** → Atendimento →
 * **Acompanhamento**.
 */

export type TipoDeFicha = 'avaliacao' | 'acompanhamento';

export interface RotulosDaFicha {
  /** "Ficha de avaliação" / "Acompanhamento" — o título do formulário. */
  nome: string;
  /** "Avaliação" / "Acompanhamento" — rótulo curto, de botão e de selo. */
  curto: string;
  /** "avaliação" / "acompanhamento", no meio da frase. */
  minusculo: string;
  /** "avaliações" / "acompanhamentos". */
  plural: string;
  /** Artigo definido, para as frases de confirmação: "a avaliação", "o acompanhamento". */
  artigo: 'a' | 'o';
  /** "Fichas-modelo de Avaliação" — o título do gerenciador. */
  tituloDosModelos: string;
  /** O parágrafo que explica o gerenciador. */
  descricaoDosModelos: string;
  /** Rótulo da data no cabeçalho do formulário e do documento impresso. */
  rotuloDaData: string;
  /** Rótulo do campo de foto. */
  rotuloDaFoto: string;
  /** Linha pequena sob o campo de foto vazio. */
  dicaDaFoto: string;
  /** Rótulo e sugestão do campo de observações. */
  rotuloDasObservacoes: string;
  dicaDasObservacoes: string;
  /** Linha pequena ao lado de "Perguntas" na folha em branco. */
  dicaDaFolhaEmBranco: string;
  /** Primeira pasta do Storage — cada tipo tem a sua regra em `storage.rules`. */
  pastaDoStorage: string;
  /** Prefixo do id das perguntas criadas no gerenciador. */
  prefixoDePergunta: string;
}

export const ROTULOS_DA_FICHA: Record<TipoDeFicha, RotulosDaFicha> = {
  avaliacao: {
    nome: 'Ficha de avaliação',
    curto: 'Avaliação',
    minusculo: 'avaliação',
    plural: 'avaliações',
    artigo: 'a',
    tituloDosModelos: 'Fichas-modelo de Avaliação',
    descricaoDosModelos:
      'O que a profissional avalia antes do procedimento. Cada ficha vale para um ou mais ' +
      'procedimentos — ou para uma categoria inteira — e é emitida pela aba Avaliações, para uma ' +
      'paciente, preenchida no sistema ou impressa em branco.',
    rotuloDaData: 'Data da avaliação',
    rotuloDaFoto: 'Foto da avaliação',
    dicaDaFoto: 'Registro do estado inicial, antes do procedimento',
    rotuloDasObservacoes: 'Observações da avaliação',
    dicaDasObservacoes:
      'O que foi observado, estratégia proposta, expectativas da paciente, próximos passos.',
    dicaDaFolhaEmBranco: 'Preenchido pela equipe na avaliação, antes do procedimento',
    pastaDoStorage: 'avaliacoes',
    prefixoDePergunta: 'avq',
  },
  acompanhamento: {
    nome: 'Acompanhamento',
    curto: 'Acompanhamento',
    minusculo: 'acompanhamento',
    plural: 'acompanhamentos',
    artigo: 'o',
    tituloDosModelos: 'Fichas-modelo de Acompanhamento',
    descricaoDosModelos:
      'O que a profissional registra depois de cada atendimento — o debriefing da sessão, ' +
      'com foto. Cada ficha vale para um ou mais procedimentos — ou para uma categoria inteira — ' +
      'e é preenchida uma vez por atendimento realizado.',
    rotuloDaData: 'Data do atendimento',
    rotuloDaFoto: 'Foto do atendimento',
    dicaDaFoto: 'Registro de evolução — uma por atendimento',
    rotuloDasObservacoes: 'Observações do atendimento',
    dicaDasObservacoes:
      'Parâmetros usados, resposta do tecido, intercorrências, orientações dadas, retorno.',
    dicaDaFolhaEmBranco: 'Preenchido pela equipe logo após o atendimento',
    pastaDoStorage: 'acompanhamentos',
    prefixoDePergunta: 'acq',
  },
};

// ==========================================
// QUANDO O ACOMPANHAMENTO ABRE
// ==========================================

/**
 * O atendimento aconteceu? — a trava do acompanhamento (e dos materiais usados, que vivem nele).
 *
 * São **dois** eixos, e não só a data. A data resolve o óbvio (não se registra o que ainda não
 * aconteceu), mas o corte é `<= hoje` e não `< hoje`: a recepção lança a visita no mesmo dia em
 * que ela acontece, e exigir data estritamente anterior obrigaria a profissional a esperar até
 * amanhã para escrever o que viu hoje — justamente quando ela lembra.
 *
 * O segundo eixo é o desfecho. Um agendamento marcado `faltou` ou `remarcado` tem data passada e
 * atendimento nenhum: pela data sozinha ele abriria registro de uma visita que não existiu.
 */
export const atendimentoAconteceu = (a: Attendance): boolean =>
  !!a.data && a.data <= hojeISO() && ehRealizado(a);

/**
 * Já há registro da visita — o acompanhamento, os materiais usados, ou os dois? É o que pinta o
 * caderno de verde: os dois moram no mesmo formulário, e materiais lançados sem nenhuma resposta
 * também são registro.
 */
export const acompanhamentoComRegistro = (a: Attendance): boolean =>
  !!a.acompanhamentoPreenchidoEm || !!a.materiaisRegistradosEm;

/**
 * O botão de acompanhamento aparece na linha do atendimento?
 *
 * Continua à vista mesmo com a data no futuro, uma vez que exista conteúdo: se alguém corrigir a
 * data de uma visita já registrada para a semana que vem, esconder o que está gravado faria o dado
 * sumir sem ninguém perceber — e o caminho de uma data digitada errado é corrigi-la, não fazer o
 * documento clínico desaparecer.
 *
 * Não existe fila de pendentes: o acompanhamento é opcional, como a avaliação. O ícone verde na
 * linha já diz o que foi preenchido.
 */
export const acompanhamentoVisivel = (a: Attendance): boolean =>
  acompanhamentoComRegistro(a) || atendimentoAconteceu(a);

// ==========================================
// O ALVO DE UMA FICHA
// ==========================================

/**
 * Sobre quem e sobre o quê a ficha está sendo preenchida.
 *
 * É o que o formulário precisa saber antes de existir registro: vem de um atendimento (o
 * acompanhamento), da emissão na seção (a avaliação nova) ou de um registro já gravado (reabrir).
 */
export interface AlvoDaFicha {
  /** Id do registro — o do atendimento no acompanhamento, um novo na avaliação emitida. */
  registroId: string;
  /** Registro ainda não existe no banco: dispensa a leitura ao abrir. */
  novo?: boolean;
  atendimentoId?: string;
  pacienteId: string;
  pacienteNome: string;
  procedureId?: string;
  procedimentoNome: string;
  /** YYYY-MM-DD. */
  data: string;
  professionalId?: string;
  profissionalNome?: string;
  /**
   * O atendimento já tem materiais registrados? `false` dispensa a leitura deles ao abrir o
   * acompanhamento; ausente = não se sabe (a ficha veio da lista de registros) e a leitura é feita.
   */
  materiaisRegistrados?: boolean;
}

export const alvoDoAtendimento = (a: Attendance): AlvoDaFicha => ({
  registroId: a.id,
  atendimentoId: a.id,
  pacienteId: a.pacienteId,
  pacienteNome: a.pacienteNome,
  procedureId: a.procedureId,
  procedimentoNome: a.procedimentoNome,
  data: a.data,
  professionalId: a.professionalId,
  profissionalNome: a.profissionalNome,
  materiaisRegistrados: !!a.materiaisRegistradosEm,
});

export const alvoDoRegistro = (r: EvaluationRecord): AlvoDaFicha => ({
  registroId: r.id,
  atendimentoId: r.atendimentoId,
  pacienteId: r.pacienteId,
  pacienteNome: r.pacienteNome,
  procedureId: r.procedureId,
  procedimentoNome: r.procedimentoNome,
  data: (r.dataAtendimento || '').slice(0, 10),
  professionalId: r.professionalId,
  profissionalNome: r.profissionalNome,
});

/**
 * Id de uma avaliação emitida pela seção.
 *
 * Aleatório, e não derivado de paciente + data: a mesma paciente pode ser avaliada duas vezes no
 * mesmo dia, para procedimentos diferentes.
 */
export const novoIdDeAvaliacao = (): string =>
  `aval-${
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  }`;

/**
 * O que sai junto quando o atendimento é excluído, para a frase de confirmação: ", junto com o
 * acompanhamento e os materiais registrados". Vazio quando não há nada.
 */
export const dependentesDoAtendimento = (a: Attendance): string => {
  const partes = [
    a.acompanhamentoPreenchidoEm ? 'o acompanhamento' : '',
    a.materiaisRegistradosEm ? 'os materiais registrados' : '',
  ].filter(Boolean);
  return partes.length > 0 ? `, junto com ${partes.join(' e ')}` : '';
};

/** A paciente do cadastro por trás de uma ficha — o gênero dela escolhe o mapa anatômico. */
export const pacienteDaFicha = (
  alvo: Pick<AlvoDaFicha, 'pacienteId'>,
  pacientes: Patient[]
): Patient | undefined => (pacientes || []).find((p) => p.id === alvo.pacienteId);

// ==========================================
// A LISTA DE FICHAS PREENCHIDAS
// ==========================================

/**
 * As janelas da lista de fichas preenchidas. `undefined` = tudo.
 *
 * Começa em 30 dias pelo mesmo motivo que a antiga fila de pendentes começava: sem janela, a lista
 * baixa a coleção inteira toda vez que a aba abre, e é na história recente que se procura quase
 * sempre. As maiores ficam a um toque.
 */
export const JANELAS_DA_LISTA: { rotulo: string; dias: number | undefined }[] = [
  { rotulo: '30 dias', dias: 30 },
  { rotulo: '90 dias', dias: 90 },
  { rotulo: '1 ano', dias: 365 },
  { rotulo: 'Tudo', dias: undefined },
];

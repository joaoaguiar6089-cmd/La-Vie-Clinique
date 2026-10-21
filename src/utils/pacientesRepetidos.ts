import { Patient } from '../types';
import { chaveDoNome, LinhaDePaciente } from './patientsPanel';

/**
 * Cadastros repetidos — a mesma pessoa com dois cadastros, como as duas Heloíses.
 *
 * Eles nasciam por três caminhos: a busca que não achava "Heloíse" quando se digitava "Heloise"
 * (acento contava), a agenda que cria o cadastro de todo nome digitado sem escolher da lista, e o
 * link genérico da anamnese, em que a própria paciente se cadastra. Os dois primeiros se evitam
 * na hora, com o aviso de cadastro parecido; o terceiro não — a paciente não tem login e não pode
 * ver a lista —, então ele é achado depois, pelo quadro de repetidos da lista de Pacientes.
 *
 * Mora fora dos componentes para poder ser testado sem React nem Firebase — ver
 * `scripts/verificar-pacientes-repetidos.ts`.
 */

/** Por que dois cadastros parecem ser a mesma pessoa, do mais forte para o mais fraco. */
export type MotivoDeRepeticao = 'cpf' | 'telefone' | 'nome' | 'nome_parecido';

const FORCA: Record<MotivoDeRepeticao, number> = { cpf: 0, telefone: 1, nome: 2, nome_parecido: 3 };

export const ROTULO_DO_MOTIVO: Record<MotivoDeRepeticao, string> = {
  cpf: 'mesmo CPF',
  telefone: 'mesmo telefone',
  nome: 'mesmo nome',
  nome_parecido: 'nome parecido',
};

/** O que basta de um cadastro (ou de um cadastro ainda sendo digitado) para compará-lo. */
export interface Identidade {
  nome: string;
  contato?: string;
  cpf?: string;
}

/** Palavras que não distinguem ninguém: "Maria **da** Silva" e "Maria Silva" são o mesmo nome. */
const PARTICULAS = new Set(['de', 'da', 'do', 'dos', 'das', 'e']);

const palavrasDoNome = (nome: string): string[] =>
  chaveDoNome(nome)
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(' ')
    .filter((p) => p && !PARTICULAS.has(p));

/**
 * A busca por nome das listas de paciente: acento e caixa não contam. Acha o trecho digitado em
 * qualquer ponto do nome, como antes ("issa" acha "Larissa"), e também cada palavra digitada no
 * começo de uma palavra do nome — "heloise mar" acha "Heloíse Martins".
 *
 * Antes era um `includes` com acento: quem digitava "Heloise" não achava a Heloíse, concluía que
 * ela não tinha cadastro e criava outro.
 */
export const nomeCombina = (termo: string, nome: string): boolean => {
  const chaveDoTermo = chaveDoNome(termo);
  if (!chaveDoTermo) return true;
  const chave = chaveDoNome(nome);
  if (chave.includes(chaveDoTermo)) return true;
  const doNome = chave.split(' ');
  return chaveDoTermo.split(' ').every((b) => doNome.some((p) => p.startsWith(b)));
};

/**
 * Os 8 últimos dígitos do telefone, ou `null` quando não há telefone que dê para comparar.
 *
 * Oito, e não onze, porque o mesmo número chega escrito de vários jeitos: com e sem +55, com e
 * sem DDD, com e sem o nono dígito. Os oito do fim são os que não mudam.
 */
export const finalDoTelefone = (contato?: string): string | null => {
  const digitos = (contato || '').replace(/\D/g, '');
  return digitos.length >= 8 ? digitos.slice(-8) : null;
};

const cpfDe = (cpf?: string): string | null => {
  const digitos = (cpf || '').replace(/\D/g, '');
  return digitos.length === 11 ? digitos : null;
};

/** As duas palavras diferem em no máximo uma letra — trocada, faltando ou sobrando. */
const diferemEmUmaLetra = (a: string, b: string): boolean => {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  const [curta, longa] = a.length <= b.length ? [a, b] : [b, a];
  let i = 0;
  let j = 0;
  let diferencas = 0;
  while (i < curta.length && j < longa.length) {
    if (curta[i] === longa[j]) {
      i++;
      j++;
      continue;
    }
    if (++diferencas > 1) return false;
    // Mesmo tamanho: letra trocada. Tamanhos diferentes: letra a mais na longa.
    if (curta.length === longa.length) i++;
    j++;
  }
  return diferencas + (longa.length - j) + (curta.length - i) <= 1;
};

/**
 * Palavras que contam como a mesma: iguais; a inicial e a palavra inteira ("M." e "Martins"); ou
 * uma letra de diferença, se não forem curtas — em "Ana" e "Ane" a letra é o nome todo.
 */
const mesmaPalavra = (a: string, b: string): boolean =>
  a === b ||
  (a.length === 1 && b.startsWith(a)) ||
  (b.length === 1 && a.startsWith(b)) ||
  (Math.min(a.length, b.length) >= 4 && diferemEmUmaLetra(a, b));

/**
 * "Heloíse" e "Heloíse Martins", "Larisa" e "Larissa Souza": o primeiro nome é o mesmo e o nome
 * menor cabe inteiro no maior. "Larissa Souza" e "Larissa Lima" não — são duas pessoas.
 */
const nomesParecidos = (a: string, b: string): boolean => {
  const pa = palavrasDoNome(a);
  const pb = palavrasDoNome(b);
  if (pa.length === 0 || pb.length === 0) return false;
  const [menor, maior] = pa.length <= pb.length ? [pa, pb] : [pb, pa];
  if (!mesmaPalavra(menor[0], maior[0])) return false;
  return menor.every((p) => maior.some((q) => mesmaPalavra(p, q)));
};

/** O motivo mais forte para achar que os dois são a mesma pessoa, ou `null` quando nada indica. */
export const motivoDeRepeticao = (a: Identidade, b: Identidade): MotivoDeRepeticao | null => {
  const cpfA = cpfDe(a.cpf);
  if (cpfA && cpfA === cpfDe(b.cpf)) return 'cpf';
  const telA = finalDoTelefone(a.contato);
  if (telA && telA === finalDoTelefone(b.contato)) return 'telefone';
  const chaveA = chaveDoNome(a.nome);
  if (!chaveA) return null;
  if (chaveA === chaveDoNome(b.nome)) return 'nome';
  return nomesParecidos(a.nome, b.nome) ? 'nome_parecido' : null;
};

/** A chave de um par, a mesma nos dois sentidos: os ids em ordem, separados por "|". */
export const chavePar = (idA: string, idB: string): string =>
  idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`;

export interface ParRepetido {
  chave: string;
  a: LinhaDePaciente;
  b: LinhaDePaciente;
  motivo: MotivoDeRepeticao;
}

const identidadeDaLinha = (l: LinhaDePaciente): Identidade => ({
  nome: l.nome,
  contato: l.contato,
  cpf: l.patient?.cpf,
});

/**
 * Os pares da lista que parecem ser a mesma pessoa — o quadro "Possíveis cadastros repetidos".
 *
 * Entram também os "sem cadastro": um orçamento avulso em nome de "Heloise" é a mesma Heloíse.
 * Os pares que a equipe já disse que são pessoas diferentes (`descartados`, por `chavePar`) não
 * voltam.
 *
 * Comparar todo mundo com todo mundo seria quadrático na clínica inteira. Em vez disso, CPF e
 * telefone vão por índice, e o nome só se compara dentro do grupo das três primeiras letras do
 * primeiro nome — onde moram "Larisa" e "Larissa".
 */
export const paresRepetidos = (
  linhas: LinhaDePaciente[],
  descartados: ReadonlySet<string> = new Set()
): ParRepetido[] => {
  const pares = new Map<string, ParRepetido>();

  const considerar = (a: LinhaDePaciente, b: LinhaDePaciente) => {
    if (a.id === b.id) return;
    const chave = chavePar(a.id, b.id);
    if (pares.has(chave) || descartados.has(chave)) return;
    const motivo = motivoDeRepeticao(identidadeDaLinha(a), identidadeDaLinha(b));
    if (!motivo) return;
    // Sempre na mesma ordem, para a lista não trocar os lados de um render para outro.
    const [x, y] = a.id === chave.split('|')[0] ? [a, b] : [b, a];
    pares.set(chave, { chave, a: x, b: y, motivo });
  };

  const compararDentroDe = (grupos: Map<string, LinhaDePaciente[]>) => {
    grupos.forEach((grupo) => {
      for (let i = 0; i < grupo.length; i++) {
        for (let j = i + 1; j < grupo.length; j++) considerar(grupo[i], grupo[j]);
      }
    });
  };

  const agrupar = (chaveDe: (l: LinhaDePaciente) => string | null) => {
    const grupos = new Map<string, LinhaDePaciente[]>();
    linhas.forEach((l) => {
      const chave = chaveDe(l);
      if (!chave) return;
      grupos.set(chave, [...(grupos.get(chave) || []), l]);
    });
    return grupos;
  };

  compararDentroDe(agrupar((l) => cpfDe(l.patient?.cpf)));
  compararDentroDe(agrupar((l) => finalDoTelefone(l.contato)));
  compararDentroDe(agrupar((l) => palavrasDoNome(l.nome)[0]?.slice(0, 3) || null));

  return Array.from(pares.values()).sort(
    (p, q) =>
      FORCA[p.motivo] - FORCA[q.motivo] ||
      p.a.nome.localeCompare(q.a.nome, 'pt-BR', { sensitivity: 'base' })
  );
};

export interface CadastroParecido {
  patient: Patient;
  motivo: MotivoDeRepeticao;
}

/**
 * Os cadastros que parecem ser de quem está sendo digitado agora — o aviso da hora de cadastrar.
 * No máximo três, do motivo mais forte para o mais fraco.
 */
export const cadastrosParecidos = (
  rascunho: Identidade,
  patients: Patient[],
  excetoId?: string
): CadastroParecido[] => {
  if (!chaveDoNome(rascunho.nome) && !finalDoTelefone(rascunho.contato) && !cpfDe(rascunho.cpf)) {
    return [];
  }
  const achados: CadastroParecido[] = [];
  patients.forEach((p) => {
    if (p.id === excetoId) return;
    const motivo = motivoDeRepeticao(rascunho, p);
    if (motivo) achados.push({ patient: p, motivo });
  });
  return achados.sort((x, y) => FORCA[x.motivo] - FORCA[y.motivo]).slice(0, 3);
};

import { ehZulia } from '../lib/projetoFirebase';

/**
 * O nome que aparece onde o sistema fala em nome da clínica — fichas impressas, recibos, nomes de
 * arquivo, a página da paciente.
 *
 * No modo legado é a La Vie, como sempre foi (e nada visível muda). Na Zulia, o nome vem do perfil
 * de cada clínica; nenhum texto da La Vie aparece para outra clínica.
 */

/** A marca da La Vie, como ela aparece nas fichas e no site hoje. */
export const MARCA_DA_LA_VIE = 'La Vie Clinique';

/**
 * O nome da plataforma (tela de login, título da página e links sem clínica, no modo Zulia).
 *
 * A plataforma passou a se chamar Venus JK em 10/11/2026. "Zulia" continua só nos nomes internos
 * (o projeto `zulia-plataforma` no Firebase, que não muda de id, a pasta `zulia/`, as variáveis
 * `ZULIA_*` e o modo `zulia` do `plataforma.json`): trocá-los só traria risco.
 */
export const MARCA_DA_PLATAFORMA = 'Venus JK';

/** O que a plataforma é, na frase que acompanha o nome. */
export const DESCRICAO_DA_PLATAFORMA = 'Plataforma de atendimentos estéticos';

const aparado = (texto?: string | null): string => (typeof texto === 'string' ? texto.trim() : '');

/**
 * A marca no título das fichas impressas ("Anamnese - Botox - <marca>"). No legado, "La Vie
 * Clinique" literal (o nome cadastrado no perfil é a razão social, longa demais para o título). Na
 * Zulia, o nome do perfil.
 */
export const marcaDaClinica = (clinica?: { name?: string } | null): string =>
  ehZulia ? aparado(clinica?.name) || 'Clínica' : MARCA_DA_LA_VIE;

/** O nome do perfil, ou, sem ele, a marca padrão (La Vie no legado; "Clínica" na Zulia). */
export const nomeDaClinica = (clinica?: { name?: string } | null): string =>
  aparado(clinica?.name) || (ehZulia ? 'Clínica' : MARCA_DA_LA_VIE);

/**
 * A profissional responsável quando o perfil não diz nenhuma. No legado, a Dra. Karoline; na
 * Zulia, vazio (quem chama decide o que mostrar no lugar).
 */
export const PROFISSIONAL_PADRAO = ehZulia ? '' : 'Dra. Karoline Ferreira';

/** Um nome curto para nome de arquivo ("Catalogo La Vie.pdf", "Catalogo Clínica Alfa.pdf"). */
export const nomeParaArquivo = (clinica?: { name?: string } | null): string =>
  ehZulia
    ? (aparado(clinica?.name) || 'Clinica').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').slice(0, 60).trim()
    : 'La Vie';

/** Quem assina a ficha quando não há profissional: "Equipe La Vie" no legado; "Equipe <nome>" na Zulia. */
export const equipeDaClinica = (clinica?: { name?: string } | null): string =>
  ehZulia ? `Equipe ${nomeDaClinica(clinica)}` : 'Equipe La Vie';

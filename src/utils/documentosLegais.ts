/**
 * Os documentos legais da plataforma: Termos de Uso, Política de Privacidade, Acordo de Tratamento
 * de Dados (Anexo I dos Termos) e o aviso de privacidade de cada clínica para as pacientes.
 *
 * O texto mora em `public/legal/*.md`, para ser lido e revisado como texto comum (um advogado não
 * precisa abrir código). O servidor transforma em página (`server/documentosLegais.ts`). Os
 * `{{marcadores}}` do texto são preenchidos com os valores daqui.
 *
 * Puro (sem Firebase), para valer igual no painel e no servidor.
 */
import { MARCA_DA_PLATAFORMA } from './marca';

/**
 * A versão dos Termos, da Política e do Acordo. Mudou o texto de forma relevante, mude a versão e a
 * vigência: as admins das clínicas passam a ver o pedido de aceite da nova versão no painel.
 */
export const VERSAO_DOS_DOCUMENTOS = '1.0';
export const VIGENCIA_DOS_DOCUMENTOS = '10 de novembro de 2026';

/**
 * Quem oferece a plataforma. Vazio aparece como "[a preencher: ...]" nas páginas.
 *
 * Informado em 11/2026: o nome empresarial e o CNPJ vêm da notificação da Receita Federal; o
 * endereço e o e-mail, do João. O município do CNPJ na Receita ainda aparece como Tefé/AM: ver
 * docs/zulia-plataforma.md ("Documentos legais").
 */
export const PRESTADOR = {
  razaoSocial: 'KAROLINE DA R. FERREIRA',
  cnpj: '49.464.212/0001-19',
  endereco: 'Rua Araguaia, 208, apto. 42C, Vila Almeida, Indaiatuba/SP, CEP 13330-660',
  email: 'enfesteta.karoline@gmail.com',
  encarregadoNome: 'Karoline da R. Ferreira',
  encarregadoEmail: 'enfesteta.karoline@gmail.com',
  /** A cidade e o estado do foro dos Termos. */
  foro: 'Indaiatuba/SP',
};

/** O nome de cada marcador vazio, para o "[a preencher: ...]". */
export const ROTULOS_DO_PRESTADOR: Record<keyof typeof PRESTADOR, string> = {
  razaoSocial: 'razão social',
  cnpj: 'CNPJ',
  endereco: 'endereço',
  email: 'e-mail de contato',
  encarregadoNome: 'nome do encarregado',
  encarregadoEmail: 'e-mail do encarregado',
  foro: 'cidade do foro',
};

/** Os endereços das páginas. */
export const PAGINAS_LEGAIS = {
  termos: '/termos',
  politicaDePrivacidade: '/politica-de-privacidade',
  tratamentoDeDados: '/tratamento-de-dados',
  /** O aviso de privacidade da clínica para as pacientes (`?c=<clinicaId>`). */
  avisoDaClinica: '/privacidade',
} as const;

/** O aviso de privacidade da clínica (`null` no legado e nos links antigos: a página usa a La Vie). */
export const linkDoAvisoDaClinica = (clinicaId: string | null): string =>
  clinicaId ? `${PAGINAS_LEGAIS.avisoDaClinica}?c=${encodeURIComponent(clinicaId)}` : PAGINAS_LEGAIS.avisoDaClinica;

/** Os valores comuns a todos os documentos. */
export const valoresDosDocumentos = (): Record<string, string> => ({
  marca: MARCA_DA_PLATAFORMA,
  versao: VERSAO_DOS_DOCUMENTOS,
  vigencia: VIGENCIA_DOS_DOCUMENTOS,
  ...PRESTADOR,
});

/** O aceite registrado na clínica (`clinicas/{c}.aceites.termos`). */
export interface AceiteDosTermos {
  versao: string;
  em: string;
  uid: string;
  email: string | null;
  ip: string | null;
}

/** O aceite vale para a versão em vigor? */
export const aceiteEmDia = (aceite: unknown): boolean =>
  !!aceite && typeof aceite === 'object' && (aceite as { versao?: unknown }).versao === VERSAO_DOS_DOCUMENTOS;

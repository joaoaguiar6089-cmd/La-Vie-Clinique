import { ClinicProfile } from '../types';

/**
 * Endereço dos links que saem do painel para a paciente: ficha de anamnese, orçamento, link do
 * agendamento e o QR Code do catálogo.
 *
 * Por que isso não é só `window.location.origin`: o link era montado com o endereço da janela em
 * que a equipe estava. Quando o painel era aberto pela URL de desenvolvimento da hospedagem — que
 * exige conta Google com acesso ao projeto —, a paciente recebia essa URL, caía na tela de login
 * do Google e nunca chegava na ficha. O endereço público é uma propriedade da clínica, não da aba
 * que por acaso está aberta.
 *
 * Por isso a base é, nesta ordem:
 *   - o endereço configurado no perfil (Configurações → "Endereço público do sistema"), se ele
 *     abre sem login e não é um endereço antigo do site;
 *   - senão, `ENDERECO_DO_SITE`, o endereço publicado.
 *
 * `motivoEnderecoFechado` reconhece os endereços que não servem, e o App troca sozinho, no
 * perfil, um endereço configurado que não serve pelo `ENDERECO_DO_SITE`.
 */

/**
 * O endereço publicado do site — o que o Google AI Studio mostra ao publicar. Se o site mudar de
 * endereço, troque aqui e ponha o anterior em `ENDERECOS_ANTIGOS`.
 */
export const ENDERECO_DO_SITE = 'https://drakaroline-lavie.ai.studio';

/**
 * Endereços que o site já teve. Ficam aqui para que um perfil que ainda guarde um deles não
 * continue mandando o endereço velho para a paciente.
 */
const ENDERECOS_ANTIGOS = new Set([
  'la-vie-clinique-cat-logo.ai.studio',
  'la-vie-clinique-cat-logo-125950720102.us-west1.run.app',
]);

/**
 * Normaliza o que a clínica digitou. Aceita "clinica.com.br", "https://clinica.com.br/" e
 * "https://host/app", e descarta query e hash que tenham vindo colados junto. `null` quando está
 * vazio ou não é um endereço.
 */
export function normalizarEnderecoPublico(valor?: string | null): string | null {
  const digitado = (valor || '').trim();
  if (!digitado) return null;

  const comProtocolo = /^https?:\/\//i.test(digitado) ? digitado : `https://${digitado}`;
  try {
    const url = new URL(comProtocolo);
    return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

/**
 * Por que esta base não serve para o link da paciente — ou `null` quando serve.
 *
 * O AI Studio serve o mesmo app em endereços diferentes: o de desenvolvimento (`ais-dev-…`) e o
 * de pré-visualização (`ais-pre-…`) só abrem para contas Google com acesso ao projeto, e é deles
 * que vem a tela pedindo e-mail e senha. O endereço publicado (o `….ai.studio` que o AI Studio
 * mostra ao publicar, ou um domínio próprio) é o que abre para qualquer pessoa. Os endereços
 * antigos do site também não servem: a paciente receberia o endereço que a clínica já trocou.
 */
export function motivoEnderecoFechado(base: string): string | null {
  let host: string;
  try {
    host = new URL(base).hostname.toLowerCase();
  } catch {
    return null;
  }

  if (ENDERECOS_ANTIGOS.has(host)) {
    return `é um endereço antigo do site, que agora é ${new URL(ENDERECO_DO_SITE).host}`;
  }
  if (host.startsWith('ais-dev-')) {
    return 'é o endereço de desenvolvimento do Google AI Studio, que só abre com uma conta Google autorizada no projeto';
  }
  if (host.startsWith('ais-pre-')) {
    return 'é o endereço de pré-visualização do Google AI Studio, que pede login do Google';
  }
  if (host === 'aistudio.google.com' || host.endsWith('.aistudio.google.com')) {
    return 'é uma página do Google AI Studio, que pede login do Google';
  }
  if (
    host === 'localhost' ||
    host === '[::1]' ||
    /^127\./.test(host) ||
    /^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(host)
  ) {
    return 'é um endereço local, que só funciona neste computador ou nesta rede';
  }
  return null;
}

/**
 * A base dos links da paciente: o endereço configurado no perfil, se ele serve; senão o
 * `ENDERECO_DO_SITE`. Endereço configurado inválido, fechado ou antigo não impede um envio.
 */
export function resolvePublicBase(clinic?: Pick<ClinicProfile, 'publicBaseUrl'> | null): string {
  const configurado = normalizarEnderecoPublico(clinic?.publicBaseUrl);
  if (configurado && !motivoEnderecoFechado(configurado)) return configurado;
  return ENDERECO_DO_SITE;
}

/**
 * Monta um link público a partir da base resolvida. Parâmetros vazios são descartados, e os
 * valores saem codificados.
 */
export function buildPublicLink(
  clinic: Pick<ClinicProfile, 'publicBaseUrl'> | null | undefined,
  params: Record<string, string | undefined | null>
): string {
  const base = resolvePublicBase(clinic);
  const query = Object.entries(params)
    .filter(([, valor]) => valor !== undefined && valor !== null && valor !== '')
    .map(([chave, valor]) => `${chave}=${encodeURIComponent(String(valor))}`)
    .join('&');

  return query ? `${base}?${query}` : base;
}

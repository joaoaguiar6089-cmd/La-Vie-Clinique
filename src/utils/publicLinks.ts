import { ClinicProfile } from '../types';

/**
 * Endereço dos links que saem do painel para a paciente: ficha de anamnese, orçamento e o QR Code
 * do catálogo.
 *
 * Por que isso não é só `window.location.origin`: o link era montado com o endereço da janela em
 * que a equipe estava. Quando o painel era aberto pela URL de desenvolvimento da hospedagem — que
 * exige conta Google com acesso ao projeto —, a paciente recebia essa URL, caía na tela de login
 * do Google e nunca chegava na ficha. O endereço público é uma propriedade da clínica, não da aba
 * que por acaso está aberta, então ele fica configurado no perfil.
 *
 * Só configurar não bastou: com o campo em branco (ou preenchido com o próprio endereço de
 * desenvolvimento, que é o que aparece na barra quando se trabalha pelo AI Studio), o orçamento
 * continuava saindo com um link que pede senha. Por isso agora:
 *   - `motivoEnderecoFechado` reconhece os endereços que pedem login;
 *   - `resolvePublicBase` nunca prefere um endereço fechado quando existe um aberto;
 *   - o App grava sozinho o endereço aberto da janela quando o configurado não serve
 *     (`enderecoPublicoDaJanela`), e quem compartilha é avisado quando nenhum serve.
 */

/** Base a partir da janela atual, sem barra no fim. */
function baseDaJanela(): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}${window.location.pathname}`.replace(/\/+$/, '');
}

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
 * Por que a paciente não conseguiria abrir um link com esta base — ou `null` quando ela abre.
 *
 * O AI Studio serve o mesmo app em endereços diferentes: o de desenvolvimento (`ais-dev-…`) e o
 * de pré-visualização (`ais-pre-…`) só abrem para contas Google com acesso ao projeto, e é deles
 * que vem a tela pedindo e-mail e senha. O endereço publicado (o `….run.app` que o AI Studio
 * mostra ao publicar, ou um domínio próprio) é o que abre para qualquer pessoa.
 */
export function motivoEnderecoFechado(base: string): string | null {
  let host: string;
  try {
    host = new URL(base).hostname.toLowerCase();
  } catch {
    return null;
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
 * O endereço desta janela, quando ele serve de base para os links da paciente; senão `null`.
 *
 * Fora de iframe de propósito: o AI Studio roda a pré-visualização do app dentro de um quadro, e
 * o endereço dali não é o que a paciente deve receber. Aberto direto no navegador e sem pedir
 * login, é o site publicado.
 */
export function enderecoPublicoDaJanela(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    if (window.self !== window.top) return null;
  } catch {
    // Acesso ao `top` negado: é um quadro de outra origem.
    return null;
  }
  const base = baseDaJanela();
  return base && !motivoEnderecoFechado(base) ? base : null;
}

/**
 * A base dos links da paciente, em ordem de preferência:
 *   1. o endereço configurado no perfil, se ele abre sem login;
 *   2. o endereço desta janela, se ele abre sem login;
 *   3. o que houver — e aí `motivoEnderecoFechado` diz a quem compartilha que não vai abrir.
 *
 * Endereço configurado inválido não impede um envio: cai na janela atual.
 */
export function resolvePublicBase(clinic?: Pick<ClinicProfile, 'publicBaseUrl'> | null): string {
  const configurado = normalizarEnderecoPublico(clinic?.publicBaseUrl);
  if (configurado && !motivoEnderecoFechado(configurado)) return configurado;

  const janela = baseDaJanela();
  if (janela && !motivoEnderecoFechado(janela)) return janela;

  return configurado || janela;
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

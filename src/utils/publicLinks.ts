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
 * Com o campo vazio o comportamento é o de antes (a janela atual), que é o certo para quem já
 * acessa o painel pelo endereço público.
 */

/** Base a partir da janela atual, sem barra no fim. */
function baseDaJanela(): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}${window.location.pathname}`.replace(/\/+$/, '');
}

/**
 * Normaliza o que a clínica digitou. Aceita "clinica.com.br", "https://clinica.com.br/" e
 * "https://host/app", e descarta query e hash que tenham vindo colados junto. Endereço inválido
 * não pode impedir um envio: nesse caso cai na janela atual.
 */
export function resolvePublicBase(clinic?: Pick<ClinicProfile, 'publicBaseUrl'> | null): string {
  const configurado = (clinic?.publicBaseUrl || '').trim();
  if (!configurado) return baseDaJanela();

  const comProtocolo = /^https?:\/\//i.test(configurado) ? configurado : `https://${configurado}`;
  try {
    const url = new URL(comProtocolo);
    return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
  } catch {
    return baseDaJanela();
  }
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

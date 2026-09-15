/**
 * Link de conversa no WhatsApp a partir do telefone salvo no cadastro.
 *
 * O contato é digitado de todo jeito — "(11) 98888-7777", "11988887777", "+55 11 98888-7777" —
 * então aqui sobram só os dígitos. O DDI 55 entra quando o número tem 10 ou 11 dígitos (DDD +
 * assinante, o formato brasileiro sem DDI); a partir de 12 assumimos que o DDI já veio junto,
 * o que preserva números do DDD 55 (Santa Maria/RS) em vez de tratá-los como DDI.
 *
 * Devolve `null` quando não há telefone utilizável — quem chama usa isso para desabilitar o
 * botão, em vez de abrir uma aba do WhatsApp sem destino.
 */
export const buildWhatsAppUrl = (telefone?: string, texto?: string): string | null => {
  const digitos = (telefone || '').replace(/\D/g, '');
  if (digitos.length < 10) return null;
  const comDdi = digitos.length >= 12 ? digitos : `55${digitos}`;
  const query = texto ? `?text=${encodeURIComponent(texto)}` : '';
  return `https://wa.me/${comDdi}${query}`;
};

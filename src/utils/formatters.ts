export const formatBRL = (value: number | undefined | null): string => {
  if (value === undefined || value === null || isNaN(value)) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

export const formatDate = (isoString: string): string => {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }).format(new Date(isoString));
  } catch {
    return "";
  }
};

/** "12345678901" -> "123.456.789-01". Aceita entrada já pontuada e limita a 11 dígitos. */
export const formatCpf = (raw: string): string => {
  const digits = (raw || "").replace(/\D/g, "").slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
};

/** "1998-04-27" -> "27/04/1998". O meio-dia UTC evita o fuso puxar a data um dia para trás. */
export const formatDateOnly = (yyyyMmDd?: string): string => {
  if (!yyyyMmDd) return "";
  const d = new Date(`${yyyyMmDd}T12:00:00Z`);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR");
};

/**
 * "2026-04-27" ou ISO completo -> "27/04/26". Formato curto de propósito: a legenda de última
 * interação divide a linha da lista com o nome e o telefone, e o ano em quatro dígitos é o que
 * fazia a linha quebrar no celular.
 */
export const formatDateShortYear = (valor?: string): string => {
  if (!valor) return "";
  // O meio-dia UTC evita o fuso puxar a data um dia para trás em "YYYY-MM-DD".
  const d = valor.length === 10 ? new Date(`${valor}T12:00:00Z`) : new Date(valor);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(-2)}`;
};

import { Procedure } from '../types';

/**
 * Desconto promocional aplicado sobre TODO o catálogo no momento da geração
 * (dias especiais de promoção). Não altera o cadastro do procedimento: é um
 * ajuste de exibição/exportação, calculado em cima do valor que o catálogo
 * mostraria naquele momento.
 */

/** Teto do desconto geral, em %. Acima disso o valor exibido deixa de fazer sentido comercial. */
export const MAX_CATALOG_DISCOUNT = 90;

export interface CatalogPrice {
  /** Valor riscado — o que o catálogo cobrava antes da promoção. `null` quando não há corte. */
  strikePrice: number | null;
  /** Valor final, já com o desconto geral aplicado. */
  finalPrice: number;
  /** Há algum corte de preço a exibir (promoção do procedimento ou desconto geral). */
  hasDiscount: boolean;
  /** Percentual do desconto geral efetivamente aplicado (0 quando não há). */
  discountPercent: number;
}

/** Mantém o percentual dentro de 0..MAX_CATALOG_DISCOUNT, tolerando string vazia/NaN do input. */
export const normalizeDiscountPercent = (value: number | string | undefined | null): number => {
  const parsed = typeof value === 'string' ? parseFloat(value.replace(',', '.')) : value;
  if (parsed === undefined || parsed === null || isNaN(parsed)) return 0;
  return Math.min(MAX_CATALOG_DISCOUNT, Math.max(0, parsed));
};

/** "20" / "12,5" — sem casas decimais inúteis, no padrão pt-BR. */
export const formatDiscountPercent = (percent: number): string =>
  Number.isInteger(percent) ? String(percent) : String(percent).replace('.', ',');

const roundToCents = (value: number): number => Math.round(value * 100) / 100;

/**
 * Preço a exibir para `proc` no catálogo, considerando o desconto geral da promoção.
 *
 * O desconto incide sobre o valor que o catálogo já exibiria (o promocional do
 * procedimento quando houver, senão o de tabela), de modo que o valor riscado é
 * sempre o preço anterior real e o novo valor aparece abaixo dele.
 */
export function getCatalogPrice(proc: Procedure, discountPercent: number = 0): CatalogPrice {
  const promo =
    proc.promotionalPrice && proc.promotionalPrice < proc.price ? proc.promotionalPrice : null;
  const reference = promo ?? proc.price;
  const percent = normalizeDiscountPercent(discountPercent);

  if (percent > 0) {
    return {
      strikePrice: reference,
      finalPrice: roundToCents(reference * (1 - percent / 100)),
      hasDiscount: true,
      discountPercent: percent,
    };
  }

  return {
    strikePrice: promo !== null ? proc.price : null,
    finalPrice: reference,
    hasDiscount: promo !== null,
    discountPercent: 0,
  };
}

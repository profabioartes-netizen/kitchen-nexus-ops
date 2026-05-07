/**
 * FinanceUtils — central de cálculos monetários do HuskyPDV.
 *
 * Estratégia: trabalhar internamente em centavos (inteiros) para evitar
 * imprecisões do IEEE-754 (clássico 0.1 + 0.2 = 0.30000000000000004).
 * Sem dependências externas (mais leve que big.js / decimal.js).
 *
 * Use SEMPRE estas funções para qualquer cálculo de preço, peso ou total
 * que vá para tela, recibo, NFC-e ou banco.
 */

const ROUND_HALF_EVEN = (cents: number): number => {
  // Banker's rounding — reduz viés acumulado em milhares de operações
  const floor = Math.floor(cents);
  const diff = cents - floor;
  if (diff > 0.5) return floor + 1;
  if (diff < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
};

export const FinanceUtils = {
  /**
   * Aceita number | string com vírgula ou ponto. Devolve number ou NaN.
   * Ex.: "1,5" → 1.5 ; "  2.34 " → 2.34 ; "" → NaN
   */
  parseDecimal(input: unknown): number {
    if (typeof input === "number") return input;
    if (input == null) return NaN;
    const s = String(input).trim().replace(/\s/g, "").replace(",", ".");
    if (s === "") return NaN;
    return parseFloat(s);
  },

  /** Converte valor monetário para centavos (inteiro). */
  toCents(value: number | string): number {
    const n = typeof value === "number" ? value : FinanceUtils.parseDecimal(value);
    if (!Number.isFinite(n)) return 0;
    return ROUND_HALF_EVEN(n * 100);
  },

  /** Converte centavos para reais (number 2 casas). */
  fromCents(cents: number): number {
    return Math.round(cents) / 100;
  },

  /** Arredonda para N casas (default 2) usando half-even. */
  round(value: number, decimals = 2): number {
    if (!Number.isFinite(value)) return 0;
    const f = Math.pow(10, decimals);
    return ROUND_HALF_EVEN(value * f) / f;
  },

  /** Multiplicação monetária: a × b → 2 casas. Aceita string. */
  multiply(a: number | string, b: number | string): number {
    const av = FinanceUtils.parseDecimal(a);
    const bv = FinanceUtils.parseDecimal(b);
    if (!Number.isFinite(av) || !Number.isFinite(bv)) return 0;
    return FinanceUtils.fromCents(ROUND_HALF_EVEN(av * bv * 100));
  },

  /**
   * Cálculo de produto vendido por peso.
   * peso em kg (3 casas) × preço por kg → valor em reais (2 casas).
   * Ex.: weightedPrice("0,348", 79.90) → 27.81
   */
  weightedPrice(weightKg: number | string, pricePerKg: number | string): number {
    return FinanceUtils.multiply(weightKg, pricePerKg);
  },

  /** Soma uma lista de valores monetários sem acumular erro de ponto flutuante. */
  sum(values: Array<number | string>): number {
    let cents = 0;
    for (const v of values) cents += FinanceUtils.toCents(v);
    return FinanceUtils.fromCents(cents);
  },

  /** Subtotal de item: price × quantity (quantity pode ser fracionária para peso). */
  itemSubtotal(price: number | string, quantity: number | string): number {
    return FinanceUtils.multiply(price, quantity);
  },

  /** Formata em BRL: "R$ 12,34". */
  formatBRL(value: number | string): string {
    const n = FinanceUtils.parseDecimal(value);
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(Number.isFinite(n) ? n : 0);
  },

  /** Formata peso: "0,348 kg" (3 casas, padrão balança comercial). */
  formatWeight(kg: number | string): string {
    const n = FinanceUtils.parseDecimal(kg);
    return `${(Number.isFinite(n) ? n : 0)
      .toFixed(3)
      .replace(".", ",")} kg`;
  },

  /** Compara igualdade monetária com tolerância de 1 centavo. */
  equals(a: number | string, b: number | string): boolean {
    return FinanceUtils.toCents(a) === FinanceUtils.toCents(b);
  },
};

export default FinanceUtils;

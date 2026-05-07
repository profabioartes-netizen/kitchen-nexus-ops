// Remove diacríticos (acentos) preservando o caixa original.
// Útil para impressão térmica em impressoras que não suportam UTF-8 corretamente.
export function removeAccents(input: unknown): string {
  return String(input ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

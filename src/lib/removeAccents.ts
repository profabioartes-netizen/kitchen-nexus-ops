// Remove diacríticos (acentos) preservando o caixa original.
// Útil para impressão térmica em impressoras que não suportam UTF-8 corretamente.
export function removeAccents(input: unknown): string {
  return String(input ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Higienização radical para impressoras térmicas (Elgin/Epson/Bematech).
 * - MAIÚSCULAS (térmicas leem melhor)
 * - Remove acentos e cedilhas (Ç→C, Ã→A, É→E, etc)
 * - Substitui caracteres não-ASCII restantes por espaço
 * - Colapsa espaços múltiplos
 */
export function sanitizeForThermalPrinter(input: unknown): string {
  const base = removeAccents(input)
    .toUpperCase()
    // Substituições explícitas comuns
    .replace(/[ÇÇ]/g, "C")
    .replace(/[ªº]/g, ".")
    .replace(/[“”„]/g, '"')
    .replace(/[‘’‚]/g, "'")
    .replace(/[–—−]/g, "-")
    .replace(/…/g, "...")
    .replace(/[•·]/g, "*");
  // Qualquer caractere fora do ASCII imprimível básico vira espaço
  return base
    .replace(/[^\x20-\x7E\n]/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

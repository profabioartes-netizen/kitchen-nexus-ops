/** Strip diacritics and lowercase for accent+case insensitive search */
export function normalize(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

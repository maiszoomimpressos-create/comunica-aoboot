/**
 * Valores que o sistema de fora manda quando não tem o dado (ex.: "não
 * informado", "N/A", "-") são tratados como ausentes: a linha opcional some
 * da mensagem em vez de sair "Origem: não informado" ou "(Não informado)".
 * Comparação sem maiúsculas e sem acento.
 */
const MISSING_VALUES = new Set([
  "",
  "nao informado",
  "nao informada",
  "nao informados",
  "nao disponivel",
  "sem informacao",
  "n/a",
  "na",
  "n.a.",
  "null",
  "undefined",
  "none",
]);

export function foldDetailValue(value: string): string {
  return value.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ");
}

export function isMissingDetailValue(value: string | null | undefined): boolean {
  if (value == null) return true;
  const folded = foldDetailValue(String(value));
  if (MISSING_VALUES.has(folded)) return true;
  return /^[-–—._\s]+$/.test(folded);
}

/** Valor já aparado, ou "" quando deve ser tratado como ausente. */
export function presentDetailValue(value: string | null | undefined): string {
  return isMissingDetailValue(value) ? "" : String(value).trim();
}

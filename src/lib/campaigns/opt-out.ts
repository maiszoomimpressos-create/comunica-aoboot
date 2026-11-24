import { OPT_OUT_KEYWORDS } from "../../config/whatsapp-campaign-defaults";

/** Maiúsculas, sem acento, sem pontuação/emoji nas pontas, espaços
 * internos compactados — "  Sair! " e "sáir" viram "SAIR". */
export function normalizeOptOutText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Comparação exata com a lista fechada de palavras-chave — "quero sair
 * da fila" NÃO é opt-out (fica com o atendimento normal). */
export function isOptOutKeyword(text: string): boolean {
  const normalized = normalizeOptOutText(text);
  if (!normalized) return false;
  return (OPT_OUT_KEYWORDS as readonly string[]).includes(normalized);
}

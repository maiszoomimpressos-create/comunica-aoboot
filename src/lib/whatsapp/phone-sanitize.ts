import { normalizeBrazilianMobile } from "./phone-format";

/**
 * Limpa um "telefone" vindo da Z-API (agenda, /chats, participantes de
 * grupo) antes de virar Contact. Devolve null pra tudo que não é um número
 * de telefone discável:
 *
 * - identificadores "@lid" (Linked ID): o WhatsApp tem escondido o número
 *   real de participantes de grupo/comunidade e manda um id opaco no
 *   lugar — mandar mensagem pra ele como se fosse telefone falha (ou pior,
 *   cai num número aleatório que por acaso tenha esses dígitos);
 * - JIDs de grupo/broadcast/newsletter ("-group", "@g.us", "@broadcast",
 *   "@newsletter");
 * - qualquer coisa que, só com dígitos, fique fora de 10..15 dígitos
 *   (E.164 tem no máximo 15).
 *
 * `lid` é o campo `lid` que a Z-API às vezes manda junto: se os dígitos do
 * "phone" são exatamente o lid, aquilo não é telefone.
 */
export function sanitizeWhatsappPhone(raw: unknown, lid?: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  if (
    value.includes("@lid") ||
    value.includes("@g.us") ||
    value.includes("-group") ||
    value.includes("@broadcast") ||
    value.includes("@newsletter")
  ) {
    return null;
  }
  const withoutSuffix = value.replace(/@(c\.us|s\.whatsapp\.net)$/, "");
  if (/[a-z@]/.test(withoutSuffix)) return null;
  const digits = withoutSuffix.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  if (typeof lid === "string" && lid.replace(/\D/g, "") === digits) return null;
  return digits;
}

/** Chave canônica de um telefone pra comparação (opt-out por empresa,
 * casar a resposta "SAIR" com o destinatário): só dígitos, com o 9º
 * dígito de celular BR restaurado. Nunca usada pra reescrever o telefone
 * salvo do contato — só pra comparar. */
export function phoneKey(phone: string): string {
  return normalizeBrazilianMobile(phone.replace(/\D/g, ""));
}

/** As formas em que o mesmo celular BR pode estar salvo (com e sem o 9º
 * dígito) — pra buscar no banco sem depender de como ele foi gravado. */
export function phoneVariants(phone: string): string[] {
  const key = phoneKey(phone);
  const variants = new Set<string>([phone.replace(/\D/g, ""), key]);
  if (key.length === 13 && key.startsWith("55") && key[4] === "9") {
    variants.add(key.slice(0, 4) + key.slice(5));
  }
  return [...variants].filter(Boolean);
}

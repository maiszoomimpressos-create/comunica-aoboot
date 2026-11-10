/** snake_case sem acento, só [a-z0-9_] — usado pra gerar o `key` de uma
 * função personalizada a partir do título que o tenant digitou (ver
 * create-custom-notification-type.ts). */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

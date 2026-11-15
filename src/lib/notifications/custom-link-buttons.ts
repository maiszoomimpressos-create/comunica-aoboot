import { presentDetailValue } from "./detail-value";
import type { NotificationDetails } from "@/config/whatsapp-notification-types";
import type { LinkButtonAction } from "@/lib/whatsapp/types";

/**
 * Optional "open link" buttons for a custom function, stored inside the
 * existing `fields` JSON (`{ fields, linkButtons, ... }` — no migration).
 * Each button takes its URL either from a field the external system sends
 * (`urlField`, e.g. "link_tarifas") or from a fixed `url`. Buttons whose
 * URL is missing or not http(s) are skipped at send time; if none is left,
 * the message goes out as plain text exactly as before.
 */
export interface CustomLinkButton {
  label: string;
  urlField?: string;
  url?: string;
}

/** Z-API accepts up to 3 action buttons per message. */
export const MAX_LINK_BUTTONS = 3;
/** WhatsApp truncates longer button labels. */
export const MAX_LINK_BUTTON_LABEL = 25;

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/** Tolerant decode of whatever is stored — never throws, drops bad entries. */
export function parseCustomLinkButtons(raw: unknown): CustomLinkButton[] {
  if (!Array.isArray(raw)) return [];
  const out: CustomLinkButton[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as { label?: unknown; urlField?: unknown; url?: unknown };
    const label = typeof row.label === "string" ? row.label.trim().slice(0, MAX_LINK_BUTTON_LABEL) : "";
    const urlField = typeof row.urlField === "string" && /^\w+$/.test(row.urlField.trim()) ? row.urlField.trim() : "";
    const url = typeof row.url === "string" && isHttpUrl(row.url.trim()) ? row.url.trim() : "";
    if (!label || (!urlField && !url)) continue;
    out.push({ label, ...(urlField ? { urlField } : {}), ...(url ? { url } : {}) });
    if (out.length >= MAX_LINK_BUTTONS) break;
  }
  return out;
}

/** Buttons ready to send, in the configured order. `urlField` wins over
 * `url` when both are set and the field came filled. */
export function resolveLinkButtons(buttons: CustomLinkButton[], details: NotificationDetails): LinkButtonAction[] {
  const resolved: LinkButtonAction[] = [];
  for (const button of buttons) {
    const fromField = button.urlField ? presentDetailValue(details[button.urlField]) : "";
    const url = fromField && isHttpUrl(fromField) ? fromField : button.url ?? "";
    if (!url || !isHttpUrl(url)) continue;
    resolved.push({ id: String(resolved.length + 1), label: button.label, url });
  }
  return resolved;
}

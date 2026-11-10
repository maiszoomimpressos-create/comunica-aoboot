import type { CustomGreetingNameSource, CustomGreetingStyle } from "@/generated/prisma/client";
import type { CustomNotificationField } from "@/lib/notifications/custom-message";

export const CUSTOM_NOTIFICATION_DRAFT_VERSION = 1 as const;

export type CustomNotificationDraftMode = "ia" | "pecas" | "manual";

export interface CustomNotificationDraftV1 {
  v: typeof CUSTOM_NOTIFICATION_DRAFT_VERSION;
  form: { title: string; description: string };
  mode: CustomNotificationDraftMode;
  draftKey: string | null;
  fields: CustomNotificationField[];
  messageTemplate: string;
  requiresQr: boolean;
  greetingStyle: CustomGreetingStyle;
  greetingNameSource: CustomGreetingNameSource;
  selectedBlockKeys: string[];
  openingPhrase: string;
  manualFieldLabels: string[];
  /** Synthetic preview example values only — never recipient phones or secrets. */
  sampleOverrides?: Record<string, string>;
}

export function customNotificationDraftStorageKey(tenantSlug: string, connectionId: string): string {
  return `mais-zap:custom-notification-draft:v${CUSTOM_NOTIFICATION_DRAFT_VERSION}:${tenantSlug}:${connectionId}`;
}

export function isDraftEmpty(draft: {
  form: { title: string; description: string };
  draftKey: string | null;
  fields: unknown[];
  messageTemplate: string;
  openingPhrase: string;
}): boolean {
  return (
    !draft.draftKey &&
    !draft.form.title.trim() &&
    !draft.form.description.trim() &&
    draft.fields.length === 0 &&
    !draft.messageTemplate.trim() &&
    !draft.openingPhrase.trim()
  );
}

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function isGreetingStyle(value: unknown): value is CustomGreetingStyle {
  return value === "FIXO" || value === "HORARIO";
}

function isNameSource(value: unknown): value is CustomGreetingNameSource {
  return value === "PERFIL_WHATSAPP" || value === "CADASTRO";
}

function isMode(value: unknown): value is CustomNotificationDraftMode {
  return value === "ia" || value === "pecas" || value === "manual";
}

function sanitizeFields(value: unknown): CustomNotificationField[] {
  if (!Array.isArray(value)) return [];
  const fields: CustomNotificationField[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.key !== "string" || typeof row.label !== "string") continue;
    const field: CustomNotificationField = { key: row.key, label: row.label };
    if (typeof row.description === "string") field.description = row.description;
    if (typeof row.required === "boolean") field.required = row.required;
    if (row.valueType === "texto" || row.valueType === "numero" || row.valueType === "moeda" || row.valueType === "data_hora") {
      field.valueType = row.valueType;
    }
    fields.push(field);
  }
  return fields;
}

function sanitizeOverrides(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === "string") out[key] = entry;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function loadCustomNotificationDraft(tenantSlug: string, connectionId: string): CustomNotificationDraftV1 | null {
  if (!canUseStorage() || !tenantSlug || !connectionId) return null;
  try {
    const raw = window.sessionStorage.getItem(customNotificationDraftStorageKey(tenantSlug, connectionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CustomNotificationDraftV1>;
    if (parsed.v !== CUSTOM_NOTIFICATION_DRAFT_VERSION) return null;
    const form = parsed.form ?? { title: "", description: "" };
    if (typeof form.title !== "string" || typeof form.description !== "string") return null;
    const draft: CustomNotificationDraftV1 = {
      v: CUSTOM_NOTIFICATION_DRAFT_VERSION,
      form: { title: form.title, description: form.description },
      mode: isMode(parsed.mode) ? parsed.mode : "ia",
      draftKey: typeof parsed.draftKey === "string" && parsed.draftKey ? parsed.draftKey : null,
      fields: sanitizeFields(parsed.fields),
      messageTemplate: typeof parsed.messageTemplate === "string" ? parsed.messageTemplate : "",
      requiresQr: parsed.requiresQr === true,
      greetingStyle: isGreetingStyle(parsed.greetingStyle) ? parsed.greetingStyle : "FIXO",
      greetingNameSource: isNameSource(parsed.greetingNameSource) ? parsed.greetingNameSource : "PERFIL_WHATSAPP",
      selectedBlockKeys: Array.isArray(parsed.selectedBlockKeys)
        ? parsed.selectedBlockKeys.filter((key): key is string => typeof key === "string")
        : [],
      openingPhrase: typeof parsed.openingPhrase === "string" ? parsed.openingPhrase : "",
      manualFieldLabels:
        Array.isArray(parsed.manualFieldLabels) && parsed.manualFieldLabels.length > 0
          ? parsed.manualFieldLabels.filter((label): label is string => typeof label === "string")
          : [""],
      sampleOverrides: sanitizeOverrides(parsed.sampleOverrides),
    };
    return isDraftEmpty(draft) ? null : draft;
  } catch {
    return null;
  }
}

export function saveCustomNotificationDraft(
  tenantSlug: string,
  connectionId: string,
  draft: Omit<CustomNotificationDraftV1, "v">
): void {
  if (!canUseStorage() || !tenantSlug || !connectionId) return;
  if (isDraftEmpty(draft)) return;
  try {
    const payload: CustomNotificationDraftV1 = { v: CUSTOM_NOTIFICATION_DRAFT_VERSION, ...draft };
    window.sessionStorage.setItem(customNotificationDraftStorageKey(tenantSlug, connectionId), JSON.stringify(payload));
  } catch {
    // Quota or private mode — ignore; the on-screen state remains the source of truth.
  }
}

export function clearCustomNotificationDraft(tenantSlug: string, connectionId: string): void {
  if (!canUseStorage() || !tenantSlug || !connectionId) return;
  try {
    window.sessionStorage.removeItem(customNotificationDraftStorageKey(tenantSlug, connectionId));
  } catch {
    // ignore
  }
}
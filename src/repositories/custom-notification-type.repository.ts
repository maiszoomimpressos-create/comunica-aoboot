import { prisma } from "@/lib/db/prisma";
import type { Prisma, CustomGreetingStyle, CustomGreetingNameSource } from "@/generated/prisma/client";

import type { CustomNotificationField } from "@/lib/notifications/custom-message";
export type { CustomNotificationField, FieldValueType } from "@/lib/notifications/custom-message";

/**
 * `fields` JSON is either a plain CustomNotificationField[] (legacy rows)
 * or `{ fields, aiDescription }` so the original "Descrever com IA" text
 * can be stored without a new column. Callers always receive a decoded
 * array plus `aiDescription`. Existing array-only rows are left as-is
 * until they are saved again with an AI prompt.
 */
export type StoredCustomFields =
  | CustomNotificationField[]
  | { fields: CustomNotificationField[]; aiDescription?: string };

export function parseStoredCustomFields(raw: unknown): {
  fields: CustomNotificationField[];
  aiDescription: string | null;
} {
  if (Array.isArray(raw)) {
    return { fields: raw as CustomNotificationField[], aiDescription: null };
  }
  if (raw && typeof raw === "object" && Array.isArray((raw as { fields?: unknown }).fields)) {
    const stored = raw as { fields: CustomNotificationField[]; aiDescription?: unknown };
    const text = typeof stored.aiDescription === "string" ? stored.aiDescription.trim() : "";
    return { fields: stored.fields, aiDescription: text || null };
  }
  return { fields: [], aiDescription: null };
}

export function encodeStoredCustomFields(
  fields: CustomNotificationField[],
  aiDescription?: string | null
): Prisma.InputJsonValue {
  const text = aiDescription?.trim() ?? "";
  if (!text) return fields as unknown as Prisma.InputJsonValue;
  return { fields, aiDescription: text } as unknown as Prisma.InputJsonValue;
}

function hydrateCustomNotificationType<T extends { fields: unknown }>(row: T) {
  const parsed = parseStoredCustomFields(row.fields);
  return { ...row, fields: parsed.fields, aiDescription: parsed.aiDescription };
}

/**
 * Filter for rows that are not soft-deleted.
 * Empty on purpose until migration
 * `20261110114500_add_custom_notification_type_deleted_at` is applied
 * (and `prisma generate` has been run). After that, set this to
 * `{ deletedAt: null }` so archived types disappear from the list and
 * from API matching. Do not flip this before the column exists — Prisma
 * would reject the unknown field and the Funções page would fail.
 */
export const activeCustomNotificationTypeWhere: { deletedAt: null } = { deletedAt: null };

export async function listCustomNotificationTypes(connectionId: string) {
  const rows = await prisma.customNotificationType.findMany({
    where: { connectionId, ...activeCustomNotificationTypeWhere },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((row) => hydrateCustomNotificationType(row));
}

export async function getCustomNotificationTypeByKey(connectionId: string, key: string) {
  const row = await prisma.customNotificationType.findFirst({
    where: { connectionId, key, ...activeCustomNotificationTypeWhere },
  });
  return row ? hydrateCustomNotificationType(row) : null;
}

/** Includes soft-deleted rows: the unique (connectionId, key) still applies
 * after archive, so a new function cannot reuse the same key. */
export function getCustomNotificationTypeByKeyIncludingDeleted(connectionId: string, key: string) {
  return prisma.customNotificationType.findUnique({
    where: { connectionId_key: { connectionId, key } },
  });
}

export async function isCustomNotificationTypeKeyTaken(connectionId: string, key: string) {
  const existing = await getCustomNotificationTypeByKeyIncludingDeleted(connectionId, key);
  return existing !== null;
}

export function createCustomNotificationType(
  connectionId: string,
  data: {
    key: string;
    label: string;
    description: string;
    fields: CustomNotificationField[];
    aiDescription?: string | null;
    messageTemplate: string;
    requiresQr: boolean;
    greetingStyle: CustomGreetingStyle;
    greetingNameSource: CustomGreetingNameSource;
  }
) {
  const { aiDescription, fields, ...rest } = data;
  return prisma.customNotificationType.create({
    data: {
      ...rest,
      fields: encodeStoredCustomFields(fields, aiDescription),
      connectionId,
    },
  }).then((row) => hydrateCustomNotificationType(row));
}

/** `key` nunca muda depois de criado (é o que o sistema externo já está
 * mandando em `type`) — só label/description/fields/template/requiresQr são
 * editáveis. Scoped por connectionId no próprio `where`, igual a
 * deleteSegmento/renameList — nunca edita a função de outra conexão. */
export function updateCustomNotificationType(
  connectionId: string,
  key: string,
  data: {
    label: string;
    description: string;
    fields: CustomNotificationField[];
    aiDescription?: string | null;
    messageTemplate: string;
    requiresQr: boolean;
    greetingStyle: CustomGreetingStyle;
    greetingNameSource: CustomGreetingNameSource;
  }
) {
  const { aiDescription, fields, ...rest } = data;
  return prisma.customNotificationType.updateMany({
    where: { connectionId, key, ...activeCustomNotificationTypeWhere },
    data: { ...rest, fields: encodeStoredCustomFields(fields, aiDescription) },
  });
}

/** Soft-delete: sets deletedAt and renames the key to `<key>__excluida_<ms>` so
 * the original key can be reused (unique connectionId+key); never removes the row. Uses raw SQL so this
 * compiles against the current Prisma client; it only succeeds after the
 * deletedAt migration is applied. */
export async function softDeleteCustomNotificationType(connectionId: string, key: string) {
  const result = await prisma.$executeRaw`
    UPDATE "custom_notification_type"
    SET "deletedAt" = CURRENT_TIMESTAMP,
        "key" = "key" || '__excluida_' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint::text,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "connectionId" = ${connectionId}
      AND "key" = ${key}
      AND "deletedAt" IS NULL
  `;
  return { count: Number(result) };
}

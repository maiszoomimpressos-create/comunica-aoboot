import { prisma } from "@/lib/db/prisma";
import type { Prisma, CustomGreetingStyle, CustomGreetingNameSource } from "@/generated/prisma/client";
import {
  parseCustomFunctionAiHistory,
  type CustomFunctionAiHistoryEntry,
} from "@/lib/notifications/custom-function-history";

import type { CustomNotificationField } from "@/lib/notifications/custom-message";
export type { CustomNotificationField, FieldValueType } from "@/lib/notifications/custom-message";
export type { CustomFunctionAiHistoryEntry } from "@/lib/notifications/custom-function-history";

/**
 * `fields` JSON is either a plain CustomNotificationField[] (legacy rows)
 * or `{ fields, aiDescription?, history? }` so the original "Descrever com IA"
 * text and later AI add/edit requests can be stored without a new column.
 * Callers always receive a decoded array plus `aiDescription` and `history`.
 * Existing rows are left as-is until they are saved again with a prompt or
 * a confirmed AI request — listing/hydrate never writes back.
 */
export type StoredCustomFields =
  | CustomNotificationField[]
  | {
      fields: CustomNotificationField[];
      aiDescription?: string;
      history?: CustomFunctionAiHistoryEntry[];
    };

export function parseStoredCustomFields(raw: unknown): {
  fields: CustomNotificationField[];
  aiDescription: string | null;
  history: CustomFunctionAiHistoryEntry[];
} {
  if (Array.isArray(raw)) {
    return { fields: raw as CustomNotificationField[], aiDescription: null, history: [] };
  }
  if (raw && typeof raw === "object" && Array.isArray((raw as { fields?: unknown }).fields)) {
    const stored = raw as {
      fields: CustomNotificationField[];
      aiDescription?: unknown;
      history?: unknown;
    };
    const text = typeof stored.aiDescription === "string" ? stored.aiDescription.trim() : "";
    return {
      fields: stored.fields,
      aiDescription: text || null,
      history: parseCustomFunctionAiHistory(stored.history),
    };
  }
  return { fields: [], aiDescription: null, history: [] };
}

export function encodeStoredCustomFields(
  fields: CustomNotificationField[],
  aiDescription?: string | null,
  history?: CustomFunctionAiHistoryEntry[] | null
): Prisma.InputJsonValue {
  const text = aiDescription?.trim() ?? "";
  const entries = history && history.length > 0 ? history : null;
  if (!text && !entries) return fields as unknown as Prisma.InputJsonValue;
  return {
    fields,
    ...(text ? { aiDescription: text } : {}),
    ...(entries ? { history: entries } : {}),
  } as unknown as Prisma.InputJsonValue;
}

function hydrateCustomNotificationType<T extends { fields: unknown }>(row: T) {
  const parsed = parseStoredCustomFields(row.fields);
  return { ...row, fields: parsed.fields, aiDescription: parsed.aiDescription, history: parsed.history };
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

export type UpdateCustomNotificationTypeData = {
  label: string;
  description: string;
  fields: CustomNotificationField[];
  aiDescription?: string | null;
  history?: CustomFunctionAiHistoryEntry[];
  messageTemplate: string;
  requiresQr: boolean;
  greetingStyle: CustomGreetingStyle;
  greetingNameSource: CustomGreetingNameSource;
};

/** `key` nunca muda depois de criado (é o que o sistema externo já está
 * mandando em `type`) — só label/description/fields/template/requiresQr são
 * editáveis. Scoped por connectionId no próprio `where`, igual a
 * deleteSegmento/renameList — nunca edita a função de outra conexão.
 * Se o caller não mandar `history` ou `aiDescription`, o valor já gravado
 * é preservado — uma edição manual não apaga o histórico de pedidos à IA. */
export async function updateCustomNotificationType(
  connectionId: string,
  key: string,
  data: UpdateCustomNotificationTypeData
) {
  const current = await getCustomNotificationTypeByKey(connectionId, key);
  if (!current) return { count: 0 };
  const { aiDescription, fields, history, ...rest } = data;
  const nextAi = aiDescription !== undefined ? aiDescription : current.aiDescription;
  const nextHistory = history !== undefined ? history : current.history;
  return prisma.customNotificationType.updateMany({
    where: { connectionId, key, ...activeCustomNotificationTypeWhere },
    data: { ...rest, fields: encodeStoredCustomFields(fields, nextAi, nextHistory) },
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

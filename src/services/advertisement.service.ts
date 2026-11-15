import { getConnectionSummary } from "@/repositories/channel-connection.repository";
import { listCustomNotificationTypes } from "@/repositories/custom-notification-type.repository";
import {
  countDeliveriesByAdvertisement,
  createAdvertisement,
  deleteAdvertisement,
  getAdvertisementForTenant,
  listAdvertisementsForTenant,
  setAdvertisementActive,
  updateAdvertisement,
  type AdvertisementWriteData,
} from "@/repositories/advertisement.repository";
import { NOTIFICATION_TYPES } from "@/config/whatsapp-notification-types";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/server/errors";
import {
  ADVERTISEMENT_BUTTONS_ENABLED,
  clampFrequencyValue,
  isMissingTableError,
  normalizeFrequencyMode,
  validateAdvertisementInput,
} from "@/lib/advertisements/advertisement-rules";

const NOT_READY_MESSAGE =
  "As Publicidades ainda estão sendo ativadas no sistema. Tente de novo mais tarde ou fale com o suporte.";

async function guardTable<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (isMissingTableError(err)) throw new ConflictError(NOT_READY_MESSAGE);
    throw err;
  }
}

export interface AdvertisementView {
  id: string;
  connectionId: string;
  name: string;
  imageUrl: string | null;
  messageText: string;
  buttonLabel: string | null;
  buttonUrl: string | null;
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
  triggerTypeKeys: string[];
  frequencyMode: "PER_DAY" | "EVERY_N_SENDS";
  frequencyValue: number;
  deleteAfterHours: number | null;
  lastSentAt: string | null;
  sentCount: number;
  failedCount: number;
}

/** Dados da tela. `ready: false` = migration ainda não aplicada (a tela
 * mostra um aviso em vez de quebrar). */
export async function loadAdvertisementsPage(tenantId: string, connectionIds: string[]) {
  try {
    const [rows, stats] = await Promise.all([listAdvertisementsForTenant(tenantId), countDeliveriesByAdvertisement(tenantId)]);
    const allowed = new Set(connectionIds);
    const advertisements: AdvertisementView[] = rows
      .filter((row) => allowed.has(row.connectionId))
      .map((row) => ({
        id: row.id,
        connectionId: row.connectionId,
        name: row.name,
        imageUrl: row.imageUrl,
        messageText: row.messageText,
        buttonLabel: row.buttonLabel,
        buttonUrl: row.buttonUrl,
        active: row.active,
        startsAt: row.startsAt?.toISOString() ?? null,
        endsAt: row.endsAt?.toISOString() ?? null,
        triggerTypeKeys: row.triggerTypeKeys,
        frequencyMode: normalizeFrequencyMode(row.frequencyMode),
        frequencyValue: row.frequencyValue,
        deleteAfterHours: row.deleteAfterHours,
        lastSentAt: row.lastSentAt?.toISOString() ?? null,
        sentCount: stats.get(row.id)?.sent ?? 0,
        failedCount: stats.get(row.id)?.failed ?? 0,
      }));
    return { ready: true as const, advertisements };
  } catch (err) {
    if (isMissingTableError(err)) return { ready: false as const, advertisements: [] as AdvertisementView[] };
    throw err;
  }
}

export interface SaveAdvertisementInput {
  id?: string;
  connectionId: string;
  name: string;
  imageUrl: string | null;
  messageText: string;
  buttonLabel: string | null;
  buttonUrl: string | null;
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
  triggerTypeKeys: string[];
  frequencyMode: string;
  frequencyValue: number;
  deleteAfterHours: number | null;
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ValidationError("Data inválida no período.");
  return date;
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

export async function saveAdvertisementForTenant(tenantId: string, input: SaveAdvertisementInput) {
  const connection = await getConnectionSummary(tenantId, input.connectionId);
  if (!connection) throw new NotFoundError("Conexão não encontrada.");

  const data: AdvertisementWriteData = {
    name: input.name.trim().slice(0, 120),
    imageUrl: blankToNull(input.imageUrl),
    messageText: input.messageText.replace(/\r\n?/g, "\n").trim(),
    // Botão desligado (Z-API não entrega send-button-actions): não salva.
    buttonLabel: ADVERTISEMENT_BUTTONS_ENABLED ? blankToNull(input.buttonLabel) : null,
    buttonUrl: ADVERTISEMENT_BUTTONS_ENABLED ? blankToNull(input.buttonUrl) : null,
    active: input.active,
    startsAt: parseDate(input.startsAt),
    endsAt: parseDate(input.endsAt),
    triggerTypeKeys: [...new Set(input.triggerTypeKeys.map((k) => k.trim()).filter(Boolean))],
    frequencyMode: normalizeFrequencyMode(input.frequencyMode),
    frequencyValue: clampFrequencyValue(input.frequencyValue),
    deleteAfterHours: input.deleteAfterHours,
  };
  const errors = validateAdvertisementInput({ ...data, frequencyValue: input.frequencyValue });
  if (errors.length > 0) throw new ValidationError(errors[0]);

  const customKeys = (await listCustomNotificationTypes(input.connectionId)).map((t) => t.key);
  const validKeys = new Set([...customKeys, ...NOTIFICATION_TYPES.map((t) => t.key)]);
  const unknown = data.triggerTypeKeys.find((key) => !validKeys.has(key));
  if (unknown) throw new ValidationError(`A função "${unknown}" não existe nesta conexão.`);

  return guardTable(async () => {
    if (input.id) {
      const existing = await getAdvertisementForTenant(tenantId, input.id);
      if (!existing) throw new NotFoundError("Publicidade não encontrada.");
      await updateAdvertisement(tenantId, input.id, { ...data, connectionId: input.connectionId });
      return { id: input.id };
    }
    const created = await createAdvertisement(tenantId, input.connectionId, data);
    return { id: created.id };
  });
}

export async function setAdvertisementActiveForTenant(tenantId: string, id: string, active: boolean) {
  return guardTable(async () => {
    const result = await setAdvertisementActive(tenantId, id, active);
    if (result.count === 0) throw new NotFoundError("Publicidade não encontrada.");
    return { ok: true };
  });
}

export async function deleteAdvertisementForTenant(tenantId: string, id: string) {
  return guardTable(async () => {
    const result = await deleteAdvertisement(tenantId, id);
    if (result.count === 0) throw new NotFoundError("Publicidade não encontrada.");
    return { ok: true };
  });
}

export async function getAdvertisementConnectionId(tenantId: string, id: string): Promise<string | null> {
  return guardTable(async () => (await getAdvertisementForTenant(tenantId, id))?.connectionId ?? null);
}

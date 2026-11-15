"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { assertConnectionAccess } from "@/lib/rbac/connection-scope";
import {
  deleteAdvertisementForTenant,
  getAdvertisementConnectionId,
  saveAdvertisementForTenant,
  setAdvertisementActiveForTenant,
} from "@/services/advertisement.service";
import { NotFoundError } from "@/lib/server/errors";

const schema = z.object({
  id: z.string().optional(),
  connectionId: z.string().min(1),
  name: z.string().max(120),
  imageUrl: z.string().max(2000).nullable(),
  messageText: z.string().max(1100),
  buttonLabel: z.string().max(40).nullable(),
  buttonUrl: z.string().max(2000).nullable(),
  active: z.boolean(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  triggerTypeKeys: z.array(z.string().max(120)).max(30),
  frequencyMode: z.enum(["PER_DAY", "EVERY_N_SENDS"]),
  frequencyValue: z.number(),
  deleteAfterHours: z.number().nullable(),
});

/** Tenant-facing: cria ou edita uma publicidade (WhatsApp > Publicidades).
 * Mesma permissão de quem pode enviar mensagens pela conexão. */
export const saveAdvertisementAction = defineTenantAction(
  "whatsapp.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    assertConnectionAccess(ctx, parsed.connectionId);
    if (parsed.id) {
      const currentConnection = await getAdvertisementConnectionId(ctx.tenantId, parsed.id);
      if (!currentConnection) throw new NotFoundError("Publicidade não encontrada.");
      assertConnectionAccess(ctx, currentConnection);
    }
    return saveAdvertisementForTenant(ctx.tenantId, parsed);
  }
);

export const setAdvertisementActiveAction = defineTenantAction(
  "whatsapp.manage",
  async (ctx, input: { id: string; active: boolean }) => {
    const parsed = z.object({ id: z.string().min(1), active: z.boolean() }).parse(input);
    const connectionId = await getAdvertisementConnectionId(ctx.tenantId, parsed.id);
    if (!connectionId) throw new NotFoundError("Publicidade não encontrada.");
    assertConnectionAccess(ctx, connectionId);
    return setAdvertisementActiveForTenant(ctx.tenantId, parsed.id, parsed.active);
  }
);

export const deleteAdvertisementAction = defineTenantAction(
  "whatsapp.manage",
  async (ctx, input: { id: string }) => {
    const parsed = z.object({ id: z.string().min(1) }).parse(input);
    const connectionId = await getAdvertisementConnectionId(ctx.tenantId, parsed.id);
    if (!connectionId) throw new NotFoundError("Publicidade não encontrada.");
    assertConnectionAccess(ctx, connectionId);
    return deleteAdvertisementForTenant(ctx.tenantId, parsed.id);
  }
);

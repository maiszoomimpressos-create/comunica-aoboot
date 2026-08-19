"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { updateConnectionBalanceAlertPhones } from "@/services/whatsapp-connection.service";

const schema = z.object({
  connectionId: z.string().min(1),
  phones: z.array(z.string()).max(3, "No máximo 3 números."),
});

/** Tenant-facing: sets the up-to-3 fixed numbers that receive the
 * balance-alert message triggered by the tenant's own external system (see
 * app/api/v1/whatsapp/balance-alert/route.ts). */
export const updateBalanceAlertPhonesAction = defineTenantAction(
  "whatsapp.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    return updateConnectionBalanceAlertPhones(ctx.tenantId, parsed.connectionId, parsed.phones);
  }
);

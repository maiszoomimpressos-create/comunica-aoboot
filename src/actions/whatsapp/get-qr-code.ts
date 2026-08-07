"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { getConnectionQrCode } from "@/services/whatsapp-connection.service";

const schema = z.object({ connectionId: z.string().min(1) });

/** Fetches the QR code image for the tenant to scan with the phone that
 * owns the WhatsApp number — this is the one setup step nobody but the
 * tenant (or whoever has the phone) can do. */
export const getWhatsappQrCodeAction = defineTenantAction(
  "whatsapp.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    return getConnectionQrCode(ctx.tenantId, parsed.connectionId);
  }
);

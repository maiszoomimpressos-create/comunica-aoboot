"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { testConnection } from "@/services/whatsapp-connection.service";

const schema = z.object({
  providerKey: z.string().min(1),
  apiUrl: z.string().min(1, "Informe a URL da instância."),
  apiToken: z.string().optional().default(""),
  phoneNumber: z.string().min(1, "Informe o número do WhatsApp."),
});

/** Tests credentials typed into the wizard's config step — no persistence. */
export const testWhatsappConnectionAction = defineTenantAction(
  "whatsapp.manage",
  async (_ctx, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    return testConnection(parsed.providerKey, parsed);
  }
);

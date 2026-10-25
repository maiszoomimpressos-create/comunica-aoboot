"use server";

import { z } from "zod";
import { definePlatformAction } from "@/lib/server/actions/define-platform-action";
import { upsertBusinessIntegration } from "@/repositories/business-integration.repository";

const schema = z.object({
  connectionId: z.string().min(1),
  provider: z.string().trim().min(1, "Informe o provider."),
  baseUrl: z.string().trim().min(1, "Informe a URL base da API."),
  apiKey: z.string().trim().optional(),
  enabled: z.boolean(),
});

/** Platform-admin-only: cria/edita a integração MAIS ZAP ↔ app de negócio
 * (hoje: MAI Drive) de uma conexão — ver docs/INTEGRACAO-MAIDRIVE.md.
 * `apiKey` em branco mantém a chave já salva (ver upsertBusinessIntegration). */
export const updateBusinessIntegrationAction = definePlatformAction(
  async (_user, input: z.infer<typeof schema>) => {
    const { connectionId, apiKey, ...data } = schema.parse(input);
    await upsertBusinessIntegration(connectionId, { ...data, apiKey: apiKey || undefined });
    return { ok: true };
  }
);

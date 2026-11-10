"use server";

import { z } from "zod";
import { definePlatformAction } from "@/lib/server/actions/define-platform-action";
import { createNotificationFieldBlockForPlatform } from "@/services/notification-field-block.service";

const nicheEnum = z.enum(["EVENTOS_INGRESSOS", "ESTACIONAMENTO", "MOBILIDADE_CORRIDAS", "GENERICO_2FA"]);

const schema = z.object({
  key: z.string().min(1, "Informe uma chave."),
  label: z.string().min(1, "Informe um nome."),
  messageLine: z.string().min(1, "Informe a linha de mensagem."),
  description: z.string().optional(),
  defaultRequired: z.boolean(),
  niches: z.array(nicheEnum),
});

export const createNotificationFieldBlockAction = definePlatformAction(
  async (_user, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    await createNotificationFieldBlockForPlatform(parsed);
    return { ok: true };
  }
);

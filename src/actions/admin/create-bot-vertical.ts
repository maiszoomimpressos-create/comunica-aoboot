"use server";

import { z } from "zod";
import { definePlatformAction } from "@/lib/server/actions/define-platform-action";
import { createBotVertical } from "@/repositories/bot-vertical.repository";

const schema = z.object({
  key: z
    .string()
    .trim()
    .min(1, "Informe uma chave.")
    .regex(/^[a-z0-9_]+$/, "Use apenas letras minúsculas, números e underscore."),
  label: z.string().trim().min(1, "Informe um nome."),
  systemPrompt: z.string().trim().min(1, "Informe o treino (prompt) desse nicho."),
  requiresFixedLocation: z.boolean(),
});

export const createBotVerticalAction = definePlatformAction(
  async (_user, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    await createBotVertical(parsed);
    return { ok: true };
  }
);

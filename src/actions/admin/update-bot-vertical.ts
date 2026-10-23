"use server";

import { z } from "zod";
import { definePlatformAction } from "@/lib/server/actions/define-platform-action";
import { updateBotVertical } from "@/repositories/bot-vertical.repository";

const schema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1, "Informe um nome."),
  systemPrompt: z.string().trim().min(1, "Informe o treino (prompt) desse nicho."),
  requiresFixedLocation: z.boolean(),
  active: z.boolean(),
});

export const updateBotVerticalAction = definePlatformAction(
  async (_user, input: z.infer<typeof schema>) => {
    const { id, ...data } = schema.parse(input);
    await updateBotVertical(id, data);
    return { ok: true };
  }
);

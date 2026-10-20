"use server";

import { z } from "zod";
import { definePlatformAction } from "@/lib/server/actions/define-platform-action";
import { updateAiAttendantModel } from "@/repositories/ai-attendant-settings.repository";

const schema = z.object({
  model: z.string().min(1, "Informe o modelo (ex: anthropic/claude-sonnet-5.5)."),
});

export const updateAiAttendantModelAction = definePlatformAction(
  async (_user, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    await updateAiAttendantModel(parsed.model);
    return { ok: true };
  }
);

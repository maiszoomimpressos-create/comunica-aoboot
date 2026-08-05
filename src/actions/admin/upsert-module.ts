"use server";

import { z } from "zod";
import { definePlatformAction } from "@/lib/server/actions/define-platform-action";
import { adminCreateModule, adminUpdateModule } from "@/repositories/module.repository";

const schema = z.object({
  moduleId: z.string().optional(),
  key: z.string().min(2, "Informe a chave do módulo (ex: whatsapp)."),
  name: z.string().min(2, "Informe o nome do módulo."),
  description: z.string().min(2, "Informe uma descrição."),
  category: z.string().min(2, "Informe a categoria."),
  isComingSoon: z.boolean(),
});

export const upsertModuleAction = definePlatformAction(
  async (_user, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    if (parsed.moduleId) {
      await adminUpdateModule(parsed.moduleId, {
        name: parsed.name,
        description: parsed.description,
        category: parsed.category,
        isComingSoon: parsed.isComingSoon,
      });
    } else {
      await adminCreateModule({
        key: parsed.key,
        name: parsed.name,
        description: parsed.description,
        category: parsed.category,
        isComingSoon: parsed.isComingSoon,
        sortOrder: 99,
      });
    }
    return { ok: true };
  }
);

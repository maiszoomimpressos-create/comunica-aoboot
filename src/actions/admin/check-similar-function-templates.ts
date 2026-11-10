"use server";

import { z } from "zod";
import { definePlatformAction } from "@/lib/server/actions/define-platform-action";
import { findSimilarFunctionTemplates } from "@/services/function-template.service";

const schema = z.object({
  label: z.string(),
  description: z.string(),
});

/** Regra pedida: antes de criar uma função nova no catálogo global, avisa
 * se já existe uma parecida — não bloqueia, só notifica (ver
 * findSimilarFunctionTemplates em function-template.service.ts). */
export const checkSimilarFunctionTemplatesAction = definePlatformAction(
  async (_user, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    const duplicates = await findSimilarFunctionTemplates(parsed.label, parsed.description);
    return { duplicates };
  }
);

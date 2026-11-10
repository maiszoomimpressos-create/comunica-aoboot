"use server";

import { z } from "zod";
import { definePlatformAction } from "@/lib/server/actions/define-platform-action";
import { generateFunctionTemplateDraftForPlatform } from "@/services/function-template.service";

const schema = z.object({
  title: z.string(),
  description: z.string(),
});

export const generateFunctionTemplateDraftAction = definePlatformAction(
  async (_user, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    return generateFunctionTemplateDraftForPlatform(parsed.title, parsed.description);
  }
);

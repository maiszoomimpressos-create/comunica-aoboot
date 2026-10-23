"use server";

import { z } from "zod";
import { definePlatformAction } from "@/lib/server/actions/define-platform-action";
import { getAiUsageDetailForConnection } from "@/repositories/ai-usage.repository";

const schema = z.object({ connectionId: z.string().min(1) });

export const getConnectionAiUsageAction = definePlatformAction(
  async (_user, input: z.infer<typeof schema>) => {
    const { connectionId } = schema.parse(input);
    return getAiUsageDetailForConnection(connectionId);
  }
);

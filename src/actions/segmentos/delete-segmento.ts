"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { deleteSegmento } from "@/repositories/segmento.repository";
import { NotFoundError } from "@/lib/server/errors";

const schema = z.object({ segmentoId: z.string().min(1) });

/** Apaga só o rótulo de Segmento — nunca a ChannelConnection por baixo, que
 * pode estar em uso por outro segmento ou diretamente (ver comentário em
 * segmento.repository.ts). */
export const deleteSegmentoAction = defineTenantAction(
  "whatsapp.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    const result = await deleteSegmento(ctx.tenantId, parsed.segmentoId);
    if (result.count === 0) throw new NotFoundError("Segmento não encontrado.");
    return { ok: true };
  }
);

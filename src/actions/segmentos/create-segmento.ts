"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { prisma } from "@/lib/db/prisma";
import { requestConnection } from "@/services/whatsapp-connection.service";
import { createSegmento } from "@/repositories/segmento.repository";
import { addConnectionToRoleScope } from "@/repositories/role.repository";
import { hasConnectionAccess } from "@/lib/rbac/connection-scope";
import { NotFoundError } from "@/lib/server/errors";
import { SEGMENTO_NICHES } from "@/config/segmento-niches";
import type { SegmentoNiche } from "@/generated/prisma/client";

const nicheKeys = SEGMENTO_NICHES.map((n) => n.key) as [SegmentoNiche, ...SegmentoNiche[]];

const schema = z.object({
  name: z.string().min(1, "Dê um nome pro segmento."),
  niche: z.enum(nicheKeys),
  connection: z.union([
    z.object({
      mode: z.literal("new"),
      productKeys: z.array(z.string()).min(1, "Selecione ao menos um produto."),
      phoneNumber: z.string().min(1, "Informe o número do WhatsApp."),
    }),
    z.object({
      mode: z.literal("existing"),
      connectionId: z.string().min(1),
    }),
  ]),
});

/** Tenant-facing: cria um Segmento (nicho de negócio) apontando pra uma
 * ChannelConnection — nova (mesmo fluxo de pedido de
 * actions/whatsapp/request-connection.ts) ou já existente. Ver Segmento em
 * schema.prisma: vários segmentos podem compartilhar a mesma conexão. */
export const createSegmentoAction = defineTenantAction(
  "whatsapp.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);

    let connectionId: string;
    let justCreatedConnection = false;

    if (parsed.connection.mode === "new") {
      const summary = await requestConnection(ctx.tenantId, {
        productKeys: parsed.connection.productKeys,
        phoneNumber: parsed.connection.phoneNumber,
      });
      connectionId = summary.id;
      justCreatedConnection = true;
    } else {
      if (!hasConnectionAccess(ctx, parsed.connection.connectionId)) {
        throw new NotFoundError("Conexão não encontrada.");
      }
      const connection = await prisma.channelConnection.findFirst({
        where: { id: parsed.connection.connectionId, tenantId: ctx.tenantId },
        select: { id: true },
      });
      if (!connection) throw new NotFoundError("Conexão não encontrada.");
      connectionId = connection.id;
    }

    const segmento = await createSegmento({
      tenantId: ctx.tenantId,
      connectionId,
      name: parsed.name,
      niche: parsed.niche,
    });

    // Quem criou (e todo mundo com o mesmo papel) não pode perder acesso ao
    // que acabou de criar — no-op se o papel não for restrito.
    if (justCreatedConnection) {
      const role = await prisma.role.findUnique({
        where: { tenantId_key: { tenantId: ctx.tenantId, key: ctx.roleKey } },
        select: { id: true },
      });
      if (role) await addConnectionToRoleScope(role.id, connectionId);
    }

    return segmento;
  }
);

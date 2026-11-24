import { prisma } from "@/lib/db/prisma";

/** Config do envio pós-corrida (imagem + link da Play Store) por conexão —
 * ver AppPromoSettings em schema.prisma. */
export function getAppPromoSettings(connectionId: string) {
  return prisma.appPromoSettings.findUnique({ where: { connectionId } });
}

export function listAppPromoSettings(connectionIds: string[]) {
  if (connectionIds.length === 0) return Promise.resolve([]);
  return prisma.appPromoSettings.findMany({ where: { connectionId: { in: connectionIds } } });
}

export interface AppPromoSettingsInput {
  enabled: boolean;
  imageUrl: string | null;
  playStoreUrl: string | null;
  caption: string | null;
  linkMessage: string | null;
  linkTitle: string | null;
  linkDescription: string | null;
  linkImageUrl: string | null;
  shortLinkSlug: string | null;
  shortLinkUrl: string | null;
}

export function upsertAppPromoSettings(connectionId: string, input: AppPromoSettingsInput) {
  return prisma.appPromoSettings.upsert({
    where: { connectionId },
    create: { connectionId, ...input },
    update: input,
  });
}

/** Nome do negócio da conta (fallback quando a conexão não tem
 * `businessName` próprio) — só pra prévia da legenda no painel; o envio de
 * verdade resolve igual a sendPurchaseConfirmation. */
export function getTenantMessageNames(tenantId: string) {
  return prisma.organization.findUnique({
    where: { id: tenantId },
    select: { name: true, messageBusinessName: true },
  });
}

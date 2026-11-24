import { prisma } from "@/lib/db/prisma";

/** Links curtos — sempre filtrados por tenantId (cada empresa só vê os seus);
 * slug é único no sistema todo. */
export function listShortLinks(tenantId: string) {
  return prisma.shortLink.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } });
}

export function getShortLinkForTenant(tenantId: string, id: string) {
  return prisma.shortLink.findFirst({ where: { id, tenantId } });
}

export function getShortLinkBySlug(slug: string) {
  return prisma.shortLink.findUnique({ where: { slug } });
}

export interface ShortLinkData {
  slug: string;
  targetUrl: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  connectionId?: string | null;
}

export function createShortLink(tenantId: string, data: ShortLinkData) {
  return prisma.shortLink.create({ data: { tenantId, ...data } });
}

export function updateShortLink(id: string, data: ShortLinkData) {
  return prisma.shortLink.update({ where: { id }, data });
}

export async function deleteShortLink(tenantId: string, id: string) {
  const link = await prisma.shortLink.findFirst({ where: { id, tenantId } });
  if (!link) return null;
  await prisma.$transaction([
    // o convite pós-corrida que usava esse slug volta pro link longo
    prisma.appPromoSettings.updateMany({
      where: { shortLinkSlug: link.slug, connection: { tenantId } },
      data: { shortLinkSlug: null, shortLinkUrl: null },
    }),
    prisma.shortLink.delete({ where: { id: link.id } }),
  ]);
  return link;
}

import { prisma } from "@/lib/db/prisma";
import type { SegmentoNiche } from "@/generated/prisma/client";

/** Super Admin-facing — todo o catálogo, incluindo inativos, pra edição em
 * /admin/whatsapp. */
export function listAllNotificationFieldBlocks() {
  return prisma.notificationFieldBlock.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
}

/** Tenant-facing — só os ativos, pro checklist de "montar com peças
 * prontas" ao criar uma função personalizada. */
export function listActiveNotificationFieldBlocks() {
  return prisma.notificationFieldBlock.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

export function getNotificationFieldBlockByKey(key: string) {
  return prisma.notificationFieldBlock.findUnique({ where: { key } });
}

export function createNotificationFieldBlock(data: {
  key: string;
  label: string;
  messageLine: string;
  description?: string;
  defaultRequired: boolean;
  niches: SegmentoNiche[];
}) {
  return prisma.notificationFieldBlock.create({ data });
}

export function updateNotificationFieldBlock(
  id: string,
  data: Partial<{
    label: string;
    messageLine: string;
    description: string | null;
    defaultRequired: boolean;
    niches: SegmentoNiche[];
    active: boolean;
    sortOrder: number;
  }>
) {
  return prisma.notificationFieldBlock.update({ where: { id }, data });
}

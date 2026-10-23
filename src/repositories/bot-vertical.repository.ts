import { prisma } from "@/lib/db/prisma";

/** Tenant-facing — only active verticals, just enough to populate the
 * selector in BotAttendantSection (see connection-card.tsx). */
export function listActiveBotVerticals() {
  return prisma.botVertical.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, key: true, label: true },
  });
}

/** Super Admin-facing — every vertical, including inactive ones, with the
 * full `systemPrompt` ("treino") for editing in /admin/whatsapp. */
export function listAllBotVerticals() {
  return prisma.botVertical.findMany({ orderBy: { sortOrder: "asc" } });
}

export function createBotVertical(data: {
  key: string;
  label: string;
  systemPrompt: string;
  requiresFixedLocation: boolean;
}) {
  return prisma.botVertical.create({ data });
}

export function updateBotVertical(
  id: string,
  data: Partial<{
    label: string;
    systemPrompt: string;
    requiresFixedLocation: boolean;
    active: boolean;
  }>
) {
  return prisma.botVertical.update({ where: { id }, data });
}

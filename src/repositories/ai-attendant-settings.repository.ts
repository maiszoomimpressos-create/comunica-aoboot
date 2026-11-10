import { prisma } from "@/lib/db/prisma";

const DEFAULT_MODEL = "anthropic/claude-haiku-5.5";

/** Singleton row (no natural key to scope by — platform-wide, not
 * per-tenant) controlling which AI Gateway model the attendant bot uses.
 * Seeded once in prisma/seed.ts; this falls back to create-on-read so a
 * missing seed never breaks the bot. */
/** Read-only: never creates the singleton row. Used when we only need the
 * configured model string and must not write to the database. */
export async function peekAiAttendantModel(): Promise<string | null> {
  const existing = await prisma.aiAttendantSettings.findFirst({ select: { model: true } });
  return existing?.model ?? null;
}
export async function getAiAttendantSettings() {
  const existing = await prisma.aiAttendantSettings.findFirst();
  if (existing) return existing;
  return prisma.aiAttendantSettings.create({ data: { model: DEFAULT_MODEL } });
}

export async function updateAiAttendantModel(model: string) {
  const existing = await prisma.aiAttendantSettings.findFirst();
  if (!existing) {
    return prisma.aiAttendantSettings.create({ data: { model } });
  }
  return prisma.aiAttendantSettings.update({ where: { id: existing.id }, data: { model } });
}

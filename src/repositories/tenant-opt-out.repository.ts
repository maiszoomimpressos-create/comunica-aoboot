import { prisma } from "@/lib/db/prisma";
import { phoneKey, phoneVariants } from "@/lib/whatsapp/phone-sanitize";

/** Opt-out por empresa — ver TenantOptOut em schema.prisma. Sempre pela
 * chave normalizada do telefone (phoneKey). */

export async function isPhoneOptedOutForTenant(tenantId: string, phone: string): Promise<boolean> {
  const row = await prisma.tenantOptOut.findUnique({
    where: { tenantId_phone: { tenantId, phone: phoneKey(phone) } },
    select: { id: true },
  });
  return !!row;
}

export async function listOptedOutPhoneKeys(tenantId: string): Promise<Set<string>> {
  const rows = await prisma.tenantOptOut.findMany({ where: { tenantId }, select: { phone: true } });
  return new Set(rows.map((r) => r.phone));
}

/** Registra o opt-out na empresa e propaga pra TODO contato do tenant com
 * esse telefone (qualquer conexão, com ou sem o 9º dígito) e pros
 * destinatários ainda pendentes de qualquer campanha do tenant. */
export async function optOutPhoneForTenant(tenantId: string, phone: string, source: "keyword" | "manual") {
  const key = phoneKey(phone);
  const variants = phoneVariants(phone);
  const now = new Date();
  await prisma.$transaction([
    prisma.tenantOptOut.upsert({
      where: { tenantId_phone: { tenantId, phone: key } },
      create: { tenantId, phone: key, source },
      update: {},
    }),
    prisma.contact.updateMany({
      where: { tenantId, phone: { in: variants }, optedOut: false },
      data: { optedOut: true, optedOutAt: now, optedOutSource: source },
    }),
    prisma.campaignRecipient.updateMany({
      where: { status: "PENDING", campaign: { tenantId }, contact: { phone: { in: variants } } },
      data: { status: "OPTED_OUT" },
    }),
  ]);
}

/** Desfaz (só pelo painel, ação manual explícita) — remove da empresa e
 * reativa os contatos com esse telefone. */
export async function removeTenantOptOut(tenantId: string, phone: string) {
  const variants = phoneVariants(phone);
  await prisma.$transaction([
    prisma.tenantOptOut.deleteMany({ where: { tenantId, phone: phoneKey(phone) } }),
    prisma.contact.updateMany({
      where: { tenantId, phone: { in: variants } },
      data: { optedOut: false, optedOutAt: null, optedOutSource: null },
    }),
  ]);
}

/** Depois de criar contatos (sync/import/manual): marca como opt-out os
 * que já estão na lista de descadastro da empresa. */
export async function applyTenantOptOutsToContacts(tenantId: string, contactIds?: string[]) {
  const rows = await prisma.tenantOptOut.findMany({ where: { tenantId }, select: { phone: true, source: true } });
  if (rows.length === 0) return 0;
  const sourceByKey = new Map(rows.map((r) => [r.phone, r.source]));
  const contacts = await prisma.contact.findMany({
    where: { tenantId, optedOut: false, ...(contactIds ? { id: { in: contactIds } } : {}) },
    select: { id: true, phone: true },
  });
  const now = new Date();
  let count = 0;
  for (const source of new Set(sourceByKey.values())) {
    const ids = contacts.filter((c) => sourceByKey.get(phoneKey(c.phone)) === source).map((c) => c.id);
    if (ids.length === 0) continue;
    const result = await prisma.contact.updateMany({
      where: { id: { in: ids } },
      data: { optedOut: true, optedOutAt: now, optedOutSource: source },
    });
    count += result.count;
  }
  return count;
}

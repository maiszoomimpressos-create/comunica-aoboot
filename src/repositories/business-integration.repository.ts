import { prisma } from "@/lib/db/prisma";
import { encryptSecret, decryptSecret } from "@/lib/crypto/secret-box";

export interface BusinessIntegrationCredentials {
  id: string;
  provider: string;
  baseUrl: string;
  apiKey: string;
  catalogJson: unknown;
  catalogFetchedAt: Date | null;
}

export interface AdminBusinessIntegrationRow {
  connectionId: string;
  tenantName: string;
  tenantSlug: string;
  connectionName: string;
  provider: string | null;
  baseUrl: string | null;
  enabled: boolean;
  hasApiKey: boolean;
  catalogFetchedAt: Date | null;
}

/** Every `ChannelConnection` across every tenant, left-joined with its
 * `BusinessIntegration` row (most don't have one yet) — feeds the Super
 * Admin table at /admin/whatsapp. `hasApiKey` lets the UI tell "never
 * configured" apart from "configured but disabled" without ever exposing
 * the decrypted key. */
export async function listBusinessIntegrationsForAdmin(): Promise<AdminBusinessIntegrationRow[]> {
  const connections = await prisma.channelConnection.findMany({
    orderBy: [{ createdAt: "desc" }],
    include: {
      organization: { select: { name: true, slug: true } },
      businessIntegration: true,
    },
  });

  return connections.map((c) => ({
    connectionId: c.id,
    tenantName: c.organization.name,
    tenantSlug: c.organization.slug,
    connectionName: c.connectionName,
    provider: c.businessIntegration?.provider ?? null,
    baseUrl: c.businessIntegration?.baseUrl ?? null,
    enabled: c.businessIntegration?.enabled ?? false,
    hasApiKey: !!c.businessIntegration,
    catalogFetchedAt: c.businessIntegration?.catalogFetchedAt ?? null,
  }));
}

/** Decrypted, ready-to-call shape — never exposed outside the server (no
 * action/route should ever return `apiKey` to the client). `null` when the
 * connection has no integration configured, or it's disabled. */
export async function getEnabledBusinessIntegration(
  connectionId: string
): Promise<BusinessIntegrationCredentials | null> {
  const row = await prisma.businessIntegration.findUnique({ where: { connectionId } });
  if (!row || !row.enabled) return null;
  return {
    id: row.id,
    provider: row.provider,
    baseUrl: row.baseUrl,
    apiKey: decryptSecret(row.apiKeyCipher),
    catalogJson: row.catalogJson,
    catalogFetchedAt: row.catalogFetchedAt,
  };
}

/** Super Admin-facing upsert (see docs/INTEGRACAO-MAIDRIVE.md) — one row
 * per connection ("chave por central"). `apiKey` is encrypted at rest with
 * the same `secret-box.ts` convention as `ChannelConnection.apiTokenCipher`,
 * never stored or logged in plain text.
 *
 * `apiKey` is optional on purpose: the contract with the business app is
 * still being built out, so provider/baseUrl/enabled need to be editable
 * independently without forcing the admin to re-paste the key every time
 * (which would also mean the key briefly round-trips to the client in
 * plain text just to be re-sent unchanged). Omitting it keeps whatever
 * cipher is already stored — only valid when a row already exists; there
 * is no key to keep on first creation, so that path still requires one. */
export function upsertBusinessIntegration(
  connectionId: string,
  data: { provider: string; baseUrl: string; apiKey?: string; enabled: boolean }
) {
  if (data.apiKey) {
    const apiKeyCipher = encryptSecret(data.apiKey);
    return prisma.businessIntegration.upsert({
      where: { connectionId },
      create: { connectionId, provider: data.provider, baseUrl: data.baseUrl, apiKeyCipher, enabled: data.enabled },
      update: { provider: data.provider, baseUrl: data.baseUrl, apiKeyCipher, enabled: data.enabled },
    });
  }

  return prisma.businessIntegration.update({
    where: { connectionId },
    data: { provider: data.provider, baseUrl: data.baseUrl, enabled: data.enabled },
  });
}

/** Persists a freshly-fetched catalog (see mai-drive-client.ts) as the new
 * cache entry — `catalogFetchedAt` drives the TTL check on the read side. */
export function cacheBusinessIntegrationCatalog(id: string, catalogJson: unknown) {
  return prisma.businessIntegration.update({
    where: { id },
    data: { catalogJson: catalogJson as object, catalogFetchedAt: new Date() },
  });
}

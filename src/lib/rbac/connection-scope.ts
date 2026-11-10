import { notFound } from "next/navigation";
import type { TenantContext } from "@/lib/server/tenant-context";
import { NotFoundError } from "@/lib/server/errors";

/** `ctx.accessibleConnectionIds === null` means the role is unrestricted —
 * see TenantContext and Role.connectionScopeEnabled in schema.prisma. */
export function hasConnectionAccess(ctx: TenantContext, connectionId: string): boolean {
  return ctx.accessibleConnectionIds === null || ctx.accessibleConnectionIds.includes(connectionId);
}

/** For pages that list every connection of the tenant (funcoes, campanhas,
 * atendimento, fluxos, listas, modulos/whatsapp) — drops whatever a
 * connection-scoped role can't see, no-op for unrestricted roles. */
export function filterAccessibleConnections<T extends { id: string }>(
  connections: T[],
  ctx: TenantContext
): T[] {
  if (ctx.accessibleConnectionIds === null) return connections;
  const allowed = new Set(ctx.accessibleConnectionIds);
  return connections.filter((c) => allowed.has(c.id));
}

/** For Server Component pages that fetch a single connection by id
 * (`[connectionId]/**`) — same "never leak existence" posture as
 * getRequestContext's membership check: a connection outside the role's
 * scope renders as not-found, not forbidden. */
export function assertConnectionAccessOrNotFound(ctx: TenantContext, connectionId: string): void {
  if (!hasConnectionAccess(ctx, connectionId)) notFound();
}

/** Same check for Server Actions, where `notFound()` (a Next.js
 * render-boundary signal) isn't the right tool — throws so it flows through
 * defineTenantAction's toErrorPayload into a normal ActionResult error. */
export function assertConnectionAccess(ctx: TenantContext, connectionId: string): void {
  if (!hasConnectionAccess(ctx, connectionId)) throw new NotFoundError("Conexão não encontrada.");
}

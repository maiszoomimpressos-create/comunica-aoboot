import { cache } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";
import type { TenantContext } from "@/lib/server/tenant-context";
import type { PermissionCode } from "@/lib/rbac/permissions";

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
  isPlatformAdmin: boolean;
}

/** Session + user, or redirects to /login. Dedup'd per request via React cache(). */
export const getAuthenticatedUser = cache(async (): Promise<AuthenticatedUser> => {
  const user = await getOptionalAuthenticatedUser();
  if (!user) redirect("/login");
  return user;
});

/** Same as getAuthenticatedUser, but returns null instead of redirecting — for pages that work both logged-in and anonymous (e.g. accepting an invitation). */
export const getOptionalAuthenticatedUser = cache(
  async (): Promise<AuthenticatedUser | null> => {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return null;
    return {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      image: session.user.image ?? null,
      isPlatformAdmin: session.user.role === "admin",
    };
  }
);

/**
 * Resolves and validates the tenant context for `/app/[tenantSlug]/**`.
 * Always re-checks membership against the database for the *current*
 * request — never trusts a cached "active org" from the session/cookie —
 * so a user with a stale tab open on another tenant's slug is redirected,
 * never shown data. Dedup'd per request via React cache().
 */
export const getRequestContext = cache(
  async (tenantSlug: string): Promise<TenantContext> => {
    const user = await getAuthenticatedUser();

    const membership = await prisma.member.findFirst({
      where: { userId: user.id, organization: { slug: tenantSlug } },
      include: { organization: true },
    });

    if (!membership) {
      // Authenticated, but not a member of this tenant — never leak
      // whether the slug exists.
      redirect("/app");
    }

    const role = await prisma.role.findUnique({
      where: { tenantId_key: { tenantId: membership.organizationId, key: membership.role } },
      include: { rolePermissions: { include: { permission: true } } },
    });

    const permissions = (role?.rolePermissions.map((rp) => rp.permission.code) ??
      []) as PermissionCode[];

    return {
      userId: user.id,
      tenantId: membership.organizationId,
      tenantSlug,
      roleKey: membership.role,
      permissions,
      isPlatformAdmin: user.isPlatformAdmin,
    };
  }
);

/** Gate for `/admin/**` Server Components — proxy.ts already redirects non-admins, this re-checks server-side. */
export const requirePlatformAdmin = cache(async (): Promise<AuthenticatedUser> => {
  const user = await getAuthenticatedUser();
  if (!user.isPlatformAdmin) redirect("/app");
  return user;
});

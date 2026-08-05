import { prisma } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";
import { DEFAULT_TENANT_ROLES } from "@/lib/rbac/default-roles";
import { slugify, randomSuffix } from "@/lib/utils/slug";
import { ConflictError } from "@/lib/server/errors";

export interface CreateTenantWithOwnerInput {
  companyName: string;
  userName: string;
  email: string;
  password: string;
}

export interface CreateTenantWithOwnerResult {
  userId: string;
  tenantId: string;
  tenantSlug: string;
}

async function generateUniqueSlug(companyName: string): Promise<string> {
  const base = slugify(companyName);
  let slug = base;
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await prisma.organization.findUnique({ where: { slug } });
    if (!existing) return slug;
    slug = `${base}-${randomSuffix()}`;
  }
  throw new ConflictError("Não foi possível gerar um identificador único para a empresa.");
}

export interface CreateTenantForUserInput {
  userId: string;
  companyName: string;
}

export interface CreateTenantForUserResult {
  tenantId: string;
  tenantSlug: string;
}

/**
 * Creates an Organization (tenant) with `userId` as "owner" member (via
 * Better Auth's organization plugin), this tenant's own copy of the 4
 * default Roles + their permissions, and a trialing Subscription on the
 * free plan. Used both right after signup (new user) and by "Nova empresa"
 * for an already-authenticated user creating an additional tenant.
 *
 * Note: this runs *before* any tenant context exists for this org (it's
 * what creates it), so it talks to `prisma` directly rather than the
 * tenant-scoped client — same as platform-admin code, this is an
 * intentionally cross-cutting bootstrap path.
 */
export async function createTenantForUser(
  input: CreateTenantForUserInput
): Promise<CreateTenantForUserResult> {
  const slug = await generateUniqueSlug(input.companyName);

  const org = await auth.api.createOrganization({
    body: { name: input.companyName, slug, userId: input.userId },
  });
  if (!org) {
    throw new ConflictError("Não foi possível criar a empresa.");
  }
  const tenantId = org.id;

  const permissions = await prisma.permission.findMany();
  const permissionIdByCode = new Map(permissions.map((p) => [p.code, p.id]));
  const freePlan = await prisma.plan.findUnique({ where: { slug: "free" } });

  await prisma.$transaction(async (tx) => {
    for (const roleDef of DEFAULT_TENANT_ROLES) {
      await tx.role.create({
        data: {
          tenantId,
          key: roleDef.key,
          name: roleDef.name,
          isSystem: true,
          rolePermissions: {
            create: roleDef.permissions
              .map((code) => permissionIdByCode.get(code))
              .filter((id): id is string => Boolean(id))
              .map((permissionId) => ({ permissionId })),
          },
        },
      });
    }

    if (freePlan) {
      const now = new Date();
      const trialEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
      await tx.subscription.create({
        data: {
          tenantId,
          planId: freePlan.id,
          status: "TRIALING",
          currentPeriodStart: now,
          currentPeriodEnd: trialEnd,
        },
      });
    }
  });

  return { tenantId, tenantSlug: slug };
}

/**
 * Full signup flow: creates the Better Auth user, then delegates to
 * `createTenantForUser`. Called right after `/cadastro` submits — see
 * actions/auth/sign-up.ts.
 */
export async function createTenantWithOwner(
  input: CreateTenantWithOwnerInput
): Promise<CreateTenantWithOwnerResult> {
  const signUpResult = await auth.api.signUpEmail({
    body: { name: input.userName, email: input.email, password: input.password },
  });
  const userId = signUpResult.user.id;

  const { tenantId, tenantSlug } = await createTenantForUser({
    userId,
    companyName: input.companyName,
  });

  return { userId, tenantId, tenantSlug };
}

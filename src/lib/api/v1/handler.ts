import type { NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { withTenantContext, type TenantContext } from "@/lib/server/tenant-context";
import { requirePermission } from "@/lib/rbac/require-permission";
import { AppError, UnauthorizedError, ForbiddenError, ValidationError } from "@/lib/server/errors";
import type { PermissionCode } from "@/lib/rbac/permissions";
import { apiOk, apiFail } from "./response";

/**
 * Resolves tenant context for an API request. Unlike
 * lib/server/request-context.ts (which redirects Server Components away
 * from invalid tenants), this throws — API routes must always return JSON,
 * never a redirect. The tenant is identified via `?tenantSlug=` or the
 * `X-Tenant-Slug` header, since REST callers have no `[tenantSlug]` URL
 * segment to read it from.
 */
async function resolveApiTenantContext(request: NextRequest): Promise<TenantContext> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) throw new UnauthorizedError();

  const tenantSlug =
    request.nextUrl.searchParams.get("tenantSlug") ?? request.headers.get("x-tenant-slug");
  if (!tenantSlug) {
    throw new ValidationError(
      "Informe o tenant via ?tenantSlug= ou pelo header X-Tenant-Slug."
    );
  }

  const membership = await prisma.member.findFirst({
    where: { userId: session.user.id, organization: { slug: tenantSlug } },
  });
  if (!membership) throw new ForbiddenError("Você não tem acesso a esta empresa.");

  const role = await prisma.role.findUnique({
    where: { tenantId_key: { tenantId: membership.organizationId, key: membership.role } },
    include: { rolePermissions: { include: { permission: true } } },
  });
  const permissions = (role?.rolePermissions.map((rp) => rp.permission.code) ??
    []) as PermissionCode[];

  return {
    userId: session.user.id,
    tenantId: membership.organizationId,
    tenantSlug,
    roleKey: membership.role,
    permissions,
    isPlatformAdmin: session.user.role === "admin",
  };
}

interface ApiHandlerConfig<TBody, TQuery, TOutput> {
  bodySchema?: ZodType<TBody>;
  querySchema?: ZodType<TQuery>;
  /** If set, the request must belong to a tenant (see resolveApiTenantContext) and hold this permission. */
  requiredPermission?: PermissionCode;
  /** If set (requires requiredPermission too), the tenant must have this module key INSTALLED. */
  requiredModule?: string;
  handler: (args: {
    body: TBody;
    query: TQuery;
    request: NextRequest;
    ctx?: TenantContext;
  }) => Promise<TOutput>;
}

/**
 * Standard wrapper for every `/api/v1/**` route: resolves auth/tenant/
 * permission/module gates, validates input with zod, serializes the result
 * (or any thrown AppError) into the `{ success, data | error }` envelope.
 *
 * A future module (e.g. "whatsapp") adds its own routes under
 * `app/api/v1/whatsapp/**` using this same helper with
 * `requiredModule: "whatsapp"` — no change needed here.
 */
export function createApiHandler<TBody = undefined, TQuery = undefined, TOutput = unknown>(
  config: ApiHandlerConfig<TBody, TQuery, TOutput>
) {
  return async (request: NextRequest) => {
    try {
      let ctx: TenantContext | undefined;

      if (config.requiredPermission) {
        ctx = await resolveApiTenantContext(request);
        requirePermission(ctx, config.requiredPermission);

        if (config.requiredModule) {
          const tenantModule = await prisma.tenantModule.findFirst({
            where: {
              tenantId: ctx.tenantId,
              status: "INSTALLED",
              module: { key: config.requiredModule },
            },
          });
          if (!tenantModule) {
            return apiFail(
              "TENANT_MODULE_NOT_INSTALLED",
              `O módulo "${config.requiredModule}" não está instalado nesta empresa.`,
              403
            );
          }
        }
      }

      let body = undefined as TBody;
      if (config.bodySchema) {
        const raw = await request.json().catch(() => ({}));
        body = config.bodySchema.parse(raw);
      }

      let query = undefined as TQuery;
      if (config.querySchema) {
        query = config.querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
      }

      const run = () => config.handler({ body, query, request, ctx });
      const data = ctx ? await withTenantContext(ctx, run) : await run();

      return apiOk(data);
    } catch (err) {
      if (err instanceof ZodError) {
        return apiFail("VALIDATION_ERROR", "Dados inválidos.", 422, err.flatten());
      }
      if (err instanceof AppError) {
        return apiFail(err.code, err.message, err.status, (err as { details?: unknown }).details);
      }
      console.error(err);
      return apiFail("INTERNAL_ERROR", "Algo deu errado. Tente novamente.", 500);
    }
  };
}

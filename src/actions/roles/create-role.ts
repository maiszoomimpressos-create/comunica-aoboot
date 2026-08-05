"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { createRole } from "@/repositories/role.repository";
import { PERMISSIONS, type PermissionCode } from "@/lib/rbac/permissions";
import { slugify } from "@/lib/utils/slug";
import { prisma } from "@/lib/db/prisma";
import { ConflictError } from "@/lib/server/errors";

const permissionCodes = PERMISSIONS.map((p) => p.code) as [PermissionCode, ...PermissionCode[]];
const schema = z.object({
  name: z.string().min(2, "Informe o nome do papel."),
  permissions: z.array(z.enum(permissionCodes)),
});

export const createRoleAction = defineTenantAction(
  "roles.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    const key = slugify(parsed.name);

    const existing = await prisma.role.findUnique({
      where: { tenantId_key: { tenantId: ctx.tenantId, key } },
    });
    if (existing) {
      throw new ConflictError("Já existe um papel com esse nome.");
    }

    const role = await createRole({
      tenantId: ctx.tenantId,
      key,
      name: parsed.name,
      permissionCodes: parsed.permissions,
    });
    return { roleId: role.id };
  }
);

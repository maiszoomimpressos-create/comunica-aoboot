"use server";

import { z } from "zod";
import { defineTenantAction } from "@/lib/server/actions/define-tenant-action";
import { updateRolePermissions } from "@/repositories/role.repository";
import { PERMISSIONS, type PermissionCode } from "@/lib/rbac/permissions";
import { NotFoundError } from "@/lib/server/errors";

const permissionCodes = PERMISSIONS.map((p) => p.code) as [PermissionCode, ...PermissionCode[]];
const schema = z.object({
  roleId: z.string().min(1),
  permissions: z.array(z.enum(permissionCodes)),
});

export const updateRolePermissionsAction = defineTenantAction(
  "roles.manage",
  async (ctx, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    const result = await updateRolePermissions(ctx.tenantId, parsed.roleId, parsed.permissions);
    if (!result) throw new NotFoundError("Papel não encontrado.");
    return { ok: true };
  }
);

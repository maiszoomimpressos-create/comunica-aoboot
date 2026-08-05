import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth/auth";
import { listMembershipsForUser } from "@/repositories/membership.repository";
import { apiOk, apiFail } from "@/lib/api/v1/response";

/**
 * First real /api/v1 route — validates the createApiHandler pattern end to
 * end. Session-only (no tenant/permission gate): returns the caller's
 * identity and which tenants they belong to.
 */
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return apiFail("UNAUTHORIZED", "Autenticação necessária.", 401);
  }

  const memberships = await listMembershipsForUser(session.user.id);

  return apiOk({
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      isPlatformAdmin: session.user.role === "admin",
    },
    memberships,
  });
}

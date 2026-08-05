import { unstable_rethrow } from "next/navigation";
import { requirePlatformAdmin, type AuthenticatedUser } from "@/lib/server/request-context";
import { toErrorPayload } from "@/lib/server/errors";
import { actionOk, actionFail, type ActionResult } from "@/types/action";

/**
 * Wraps a Server Action for `/admin/**`: requires `user.role === "admin"`.
 * Deliberately cross-tenant — handlers use the plain `prisma` client (not
 * `tenantScopedPrisma`), since there is no single tenant context here by
 * design (see plan section E).
 */
export function definePlatformAction<TInput, TOutput>(
  handler: (user: AuthenticatedUser, input: TInput) => Promise<TOutput>
) {
  return async (input: TInput): Promise<ActionResult<TOutput>> => {
    try {
      const user = await requirePlatformAdmin();
      const data = await handler(user, input);
      return actionOk(data);
    } catch (err) {
      unstable_rethrow(err);
      return actionFail(toErrorPayload(err));
    }
  };
}

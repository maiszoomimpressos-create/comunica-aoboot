import type { NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { AppError, UnauthorizedError } from "@/lib/server/errors";
import { apiOk, apiFail } from "./response";

interface ApiKeyHandlerConfig<TBody, TOutput> {
  bodySchema?: ZodType<TBody>;
  handler: (args: { body: TBody; apiKey: string; request: NextRequest }) => Promise<TOutput>;
}

/**
 * Wrapper for machine-to-machine `/api/v1/**` routes authenticated by a
 * bearer API key instead of a Better Auth session — e.g. an external
 * e-commerce site triggering a WhatsApp send. Sibling to `createApiHandler`
 * (session + tenant-permission RBAC), not a replacement for it: this one
 * just extracts the `Authorization: Bearer <key>` header and hands it to
 * the handler, which resolves whatever it identifies (a ChannelConnection,
 * etc. — see whatsapp-connection.service.ts's `sendPurchaseConfirmation`).
 * Same `{ success, data | error }` response envelope and error mapping as
 * `createApiHandler`, so callers of either family of endpoints see a
 * consistent shape.
 */
export function createApiKeyHandler<TBody = undefined, TOutput = unknown>(
  config: ApiKeyHandlerConfig<TBody, TOutput>
) {
  return async (request: NextRequest) => {
    try {
      const authHeader = request.headers.get("authorization");
      const apiKey = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
      if (!apiKey) {
        throw new UnauthorizedError(
          "Chave de API ausente. Envie o header 'Authorization: Bearer <chave>'."
        );
      }

      let body = undefined as TBody;
      if (config.bodySchema) {
        const raw = await request.json().catch(() => ({}));
        body = config.bodySchema.parse(raw);
      }

      const data = await config.handler({ body, apiKey, request });
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

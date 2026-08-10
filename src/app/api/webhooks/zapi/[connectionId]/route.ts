import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getConnectionForWebhook } from "@/repositories/channel-connection.repository";
import { recordWebhookEvent } from "@/services/whatsapp-connection.service";

/**
 * Public webhook receiver for Z-API — the opposite direction of every
 * other route under /api: here Z-API calls us, not the other way around.
 * Registered per-connection via whatsapp-connection.service.ts's
 * ensureWebhookUrl (secret embedded as a `?secret=` query param, since
 * Z-API's webhook config has no support for custom auth headers).
 *
 * Deliberately does nothing with the payload shape yet beyond logging it
 * (see WebhookEvent) — Z-API sends different shapes depending on which
 * event fired (message received, delivery/read status, connected,
 * disconnected, ...) and interpreting those is future work once there's a
 * concrete feature consuming them. A webhook endpoint's only real job is
 * to ack fast and never lose the event, so this stays intentionally thin.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  const { connectionId } = await params;
  const secret = request.nextUrl.searchParams.get("secret");

  const connection = await getConnectionForWebhook(connectionId);
  if (!connection || !connection.webhookSecret || connection.webhookSecret !== secret) {
    // Deliberately generic — never reveal whether the connectionId itself
    // is valid to an unauthenticated caller.
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const payload = await request.json().catch(() => null);
  await recordWebhookEvent(connectionId, payload);

  return NextResponse.json({ ok: true });
}

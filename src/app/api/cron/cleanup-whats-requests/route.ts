import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { deleteExpiredWhatsappRequests } from "@/services/data-retention.service";

/**
 * Ticado pelo mesmo pinger externo (cron-job.org) que já bate em
 * /api/cron/campaign-dispatcher, só que basta uma vez por dia — apaga
 * todo pedido via WhatsApp (conversa + mensagens) com mais de 90 dias.
 * Ver data-retention.service.ts pra regra e deleteExpiredWhatsappRequests.
 *
 * Auth: mesmo segredo compartilhado (CRON_DISPATCH_SECRET) do outro cron,
 * nunca sessão de tenant/admin — o chamador é um serviço externo.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_DISPATCH_SECRET;
  if (!secret) {
    console.error("[cron/cleanup-whats-requests] CRON_DISPATCH_SECRET não configurada.");
    return NextResponse.json({ error: "not configured" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const summary = await deleteExpiredWhatsappRequests();
  return NextResponse.json({ ok: true, ...summary });
}

// Mesmo motivo do campaign-dispatcher: a maioria dos pingers externos usa
// GET por padrão.
export const GET = POST;

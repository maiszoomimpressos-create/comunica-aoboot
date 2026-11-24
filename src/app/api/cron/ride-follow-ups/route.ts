import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { dispatchDueRideReceiptFollowUps } from "@/services/ride-receipt-follow-up.service";

/**
 * Envia as imagens pós-corrida (link do app na Play Store) que já venceram
 * — agendadas 3-5 min depois do recibo de corrida (`corrida_concluida` / `corrida_mai_drive`), ver
 * ride-receipt-follow-up.service.ts. O mesmo processamento também roda a
 * cada tick de /api/cron/campaign-dispatcher (pinger externo, ~1x/min),
 * então esta rota é opcional: serve pra disparar à mão ou pra um pinger
 * dedicado, se um dia quiserem separar.
 *
 * Auth: mesmo segredo compartilhado (CRON_DISPATCH_SECRET) dos outros crons.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_DISPATCH_SECRET;
  if (!secret) {
    console.error("[cron/ride-follow-ups] CRON_DISPATCH_SECRET não configurada.");
    return NextResponse.json({ error: "not configured" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const summary = await dispatchDueRideReceiptFollowUps();
  return NextResponse.json({ ok: true, ...summary });
}

// Mesmo motivo dos outros crons: a maioria dos pingers externos usa GET.
export const GET = POST;

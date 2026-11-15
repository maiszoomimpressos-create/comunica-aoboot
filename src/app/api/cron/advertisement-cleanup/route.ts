import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  deleteExpiredAdvertisementMessages,
  processPendingAdvertisements,
} from "@/services/advertisement-dispatch.service";

/**
 * Publicidades: envia as da fila cujo recibo já chegou (RECEIVED + 30 s),
 * expira as sem entrega em 30 min e faz o "Apagar depois de" (apaga para
 * todos as vencidas). Também roda a cada tique do
 * /api/cron/campaign-dispatcher (mesmo pinger externo, ~1x por minuto),
 * então esta rota é só para chamar manualmente ou por outro pinger.
 * Auth: mesmo segredo compartilhado (CRON_DISPATCH_SECRET).
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_DISPATCH_SECRET;
  if (!secret) {
    console.error("[cron/advertisement-cleanup] CRON_DISPATCH_SECRET não configurada.");
    return NextResponse.json({ error: "not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const queue = await processPendingAdvertisements();
  const summary = await deleteExpiredAdvertisementMessages();
  return NextResponse.json({ ok: true, queue, ...summary });
}

export const GET = POST;

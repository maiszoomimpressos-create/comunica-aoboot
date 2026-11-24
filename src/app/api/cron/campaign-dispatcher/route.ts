import { NextResponse, after } from "next/server";
import type { NextRequest } from "next/server";
import { dispatchDueCampaigns } from "@/services/campaign-dispatcher.service";
import {
  deleteExpiredAdvertisementMessages,
  processPendingAdvertisements,
} from "@/services/advertisement-dispatch.service";
import { dispatchDueRideReceiptFollowUps } from "@/services/ride-receipt-follow-up.service";
import { logBotEvent, serializeError } from "@/lib/logging/bot-attendant-logger";

/**
 * Ticked by an external pinger (e.g. cron-job.org) roughly once a minute —
 * there's no long-running worker process in this deployment (Supabase +
 * Vercel serverless). See campaign-dispatcher.service.ts's
 * dispatchDueCampaigns for the actual logic.
 *
 * Cada execução agora trabalha por até CAMPAIGN_TICK_BUDGET_MS (padrão
 * 45 s) mandando uma mensagem por vez com o intervalo real entre elas. Pra
 * não estourar o timeout do pinger (cron-job.org desativa o job depois de
 * várias falhas seguidas), a resposta sai NA HORA (202) e o trabalho roda
 * em `after()`, que a Vercel mantém vivo até o maxDuration abaixo. Pra
 * testar manualmente e ver o resumo: `?sync=1` (espera terminar).
 *
 * Auth: a shared secret (CRON_DISPATCH_SECRET), never a tenant/admin
 * session — the caller is an external cron service, not a logged-in user.
 */
export const maxDuration = 60;
export const dynamic = "force-dynamic";

async function runTick() {
  // Mesmo tick (~1x/min) também envia as imagens pós-corrida vencidas (ver
  // ride-receipt-follow-up.service.ts) — assim não precisa de um segundo
  // pinger. Isolado: uma falha ali nunca derruba o disparo de campanhas.
  const [summary, rideFollowUps] = await Promise.all([
    dispatchDueCampaigns(),
    dispatchDueRideReceiptFollowUps().catch((err) => {
      console.error("[cron/campaign-dispatcher] ride follow-ups falhou:", err);
      return { error: true as const };
    }),
  ]);
  // Publicidades "Apagar depois de" pegam carona neste tique (~1x/min).
  // Best-effort: um erro aqui nunca afeta as campanhas.
  const advertisementCleanup = await deleteExpiredAdvertisementMessages().catch((err) => {
    console.error("[cron/campaign-dispatcher] advertisement cleanup failed", err);
    return null;
  });
  // Publicidades na fila: envia as que o recibo já chegou (RECEIVED + 30 s)
  // e expira as sem entrega em 30 min. Garantia do after() do webhook.
  const advertisementQueue = await processPendingAdvertisements().catch((err) => {
    console.error("[cron/campaign-dispatcher] advertisement queue failed", err);
    return null;
  });
  return { ...summary, rideFollowUps, advertisementCleanup, advertisementQueue };
}

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_DISPATCH_SECRET;
  if (!secret) {
    console.error("[cron/campaign-dispatcher] CRON_DISPATCH_SECRET não configurada.");
    return NextResponse.json({ error: "not configured" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (request.nextUrl.searchParams.get("sync") === "1") {
    return NextResponse.json({ ok: true, ...(await runTick()) });
  }

  after(() =>
    runTick().catch((err) => {
      console.error("[cron/campaign-dispatcher] tick falhou:", err);
      void logBotEvent("error", "campaign_dispatch_tick_failed", { error: serializeError(err) });
    })
  );
  return NextResponse.json({ ok: true, accepted: true }, { status: 202 });
}

// Most external cron/pinger services default to GET — accept it too so
// setup doesn't depend on the provider supporting a POST-with-body cron.
export const GET = POST;

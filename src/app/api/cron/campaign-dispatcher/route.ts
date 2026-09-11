import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { dispatchDueCampaigns } from "@/services/campaign-dispatcher.service";

/**
 * Ticked by an external pinger (e.g. cron-job.org) roughly once a minute —
 * there's no long-running worker process in this deployment (Supabase +
 * Vercel serverless), so pacing is entirely reconstructed from
 * CampaignRecipient.scheduledAt on each stateless call. See
 * campaign-dispatcher.service.ts's dispatchDueCampaigns for the actual
 * logic; this route is deliberately thin (auth + delegate + respond), same
 * shape as the Z-API webhook receiver.
 *
 * Auth: a shared secret (CRON_DISPATCH_SECRET), never a tenant/admin
 * session — the caller is an external cron service, not a logged-in user.
 */
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

  const summary = await dispatchDueCampaigns();
  return NextResponse.json({ ok: true, ...summary });
}

// Most external cron/pinger services default to GET — accept it too so
// setup doesn't depend on the provider supporting a POST-with-body cron.
export const GET = POST;

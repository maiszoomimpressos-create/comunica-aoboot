import { NextResponse } from "next/server";
import { getRequestContext } from "@/lib/server/request-context";
import { requirePermission } from "@/lib/rbac/require-permission";
import { getListDetail } from "@/services/whatsapp-contacts.service";
import { getConnectionSummary } from "@/repositories/channel-connection.repository";
import { NotFoundError } from "@/lib/server/errors";
import { toCsv } from "@/lib/csv";

/**
 * Downloads a contact list as CSV (Nome, Telefone, Lista, Número de
 * origem) — a Route Handler, not a Server Action, since the point is a
 * browser-triggered file download (Content-Disposition), which actions
 * can't produce directly. Same auth/permission check as the page itself
 * (campaigns.view is enough — this is a read, not a management action).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tenantSlug: string; connectionId: string; listId: string }> }
) {
  const { tenantSlug, listId } = await params;
  const ctx = await getRequestContext(tenantSlug);
  requirePermission(ctx, "campaigns.view");

  const detail = await getListDetail(ctx.tenantId, listId).catch((err) => {
    if (err instanceof NotFoundError) return null;
    throw err;
  });
  if (!detail) return NextResponse.json({ error: "not found" }, { status: 404 });

  const connection = await getConnectionSummary(ctx.tenantId, detail.list.connectionId);
  const originPhone = connection?.phoneNumber ?? "";

  const rows: string[][] = [
    ["Nome", "Telefone", "Lista", "Número de origem"],
    ...detail.members.map((m) => [m.name ?? "", m.phone, detail.list.name, originPhone]),
  ];

  const filename = `${detail.list.name.replace(/[^\p{L}\p{N}_-]+/gu, "_")}.csv`;

  return new NextResponse(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

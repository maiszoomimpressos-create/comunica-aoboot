import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getRequestContext } from "@/lib/server/request-context";
import { requirePermission } from "@/lib/rbac/require-permission";
import { getConnectionSummary } from "@/repositories/channel-connection.repository";
import { getFlow } from "@/services/flow.service";
import { isFlowGraph } from "@/lib/flow/types";
import { FlowEditor } from "@/components/dashboard/whatsapp/fluxos/flow-editor";

export const metadata: Metadata = { title: "Editor de Fluxo" };

export default async function FlowEditorPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; connectionId: string; flowId: string }>;
}) {
  const { tenantSlug, connectionId, flowId } = await params;

  const ctx = await getRequestContext(tenantSlug);
  requirePermission(ctx, "whatsapp.flows.manage");

  const connection = await getConnectionSummary(ctx.tenantId, connectionId);
  if (!connection) notFound();

  const flow = await getFlow(ctx.tenantId, flowId).catch(() => null);
  if (!flow || flow.connectionId !== connectionId) notFound();

  const graph = isFlowGraph(flow.draftGraph) ? flow.draftGraph : { nodes: [], edges: [] };

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <FlowEditor
        tenantSlug={tenantSlug}
        connectionId={connectionId}
        flowId={flow.id}
        flowName={flow.name}
        flowStatus={flow.status}
        initialGraph={graph}
      />
    </div>
  );
}

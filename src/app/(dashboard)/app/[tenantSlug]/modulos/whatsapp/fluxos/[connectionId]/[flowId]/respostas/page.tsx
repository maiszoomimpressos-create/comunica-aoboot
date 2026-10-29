import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { getRequestContext } from "@/lib/server/request-context";
import { requirePermission } from "@/lib/rbac/require-permission";
import { getConnectionSummary } from "@/repositories/channel-connection.repository";
import { getFlow, listFormSubmissions } from "@/services/flow.service";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Respostas" };

export default async function FlowRespostasPage({
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

  const submissions = await listFormSubmissions(ctx.tenantId, flowId);

  return (
    <div className="max-w-4xl space-y-6">
      <Link
        href={`/app/${tenantSlug}/modulos/whatsapp/fluxos/${connectionId}/${flowId}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {flow.name}
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Respostas</h1>
        <p className="text-muted-foreground">Formulários preenchidos neste fluxo, mais recentes primeiro.</p>
      </div>

      {submissions.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma resposta recebida ainda.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Formulário</TableHead>
              <TableHead>Contato</TableHead>
              <TableHead>Recebido em</TableHead>
              <TableHead className="text-right">Documento</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {submissions.map((submission) => (
              <TableRow key={submission.id}>
                <TableCell className="font-medium">{submission.title}</TableCell>
                <TableCell>{submission.contactPhone}</TableCell>
                <TableCell>
                  {submission.createdAt.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                </TableCell>
                <TableCell className="text-right">
                  {submission.pdfUrl ? (
                    <Button variant="outline" size="sm" render={<a href={submission.pdfUrl} target="_blank" rel="noopener noreferrer" />}>
                      <Download className="size-3.5" />
                      Baixar PDF
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">Indisponível</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { getRequestContext } from "@/lib/server/request-context";
import { requirePermission } from "@/lib/rbac/require-permission";
import { getListDetail } from "@/services/whatsapp-contacts.service";
import { NotFoundError } from "@/lib/server/errors";
import { Button } from "@/components/ui/button";
import { AddContactsDialog } from "@/components/dashboard/whatsapp/campaigns/add-contacts-dialog";
import { ListMembersTable } from "@/components/dashboard/whatsapp/campaigns/list-members-table";

export const metadata: Metadata = { title: "Lista de contatos" };

export default async function ContactListDetailPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; connectionId: string; listId: string }>;
}) {
  const { tenantSlug, connectionId, listId } = await params;
  const ctx = await getRequestContext(tenantSlug);
  requirePermission(ctx, "campaigns.view");
  const canManage = ctx.permissions.includes("campaigns.manage");

  // getListDetail throws NotFoundError (our own AppError, not Next's) when
  // the list doesn't exist or belongs to another tenant — translated here
  // into a proper 404 instead of falling through to the default generic
  // error boundary (this route tree has no error.tsx of its own).
  const detail = await getListDetail(ctx.tenantId, listId).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  const { list, members, availableContacts } = detail;

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href={`/app/${tenantSlug}/modulos/whatsapp/campanhas/${connectionId}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Campanhas
      </Link>

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{list.name}</h1>
          <p className="text-muted-foreground">{members.length} contato(s) nesta lista.</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<a href={`/app/${tenantSlug}/modulos/whatsapp/campanhas/${connectionId}/listas/${listId}/export`} />}
          >
            <Download className="size-4" />
            Baixar lista
          </Button>
          {canManage && (
            <AddContactsDialog tenantSlug={tenantSlug} listId={listId} availableContacts={availableContacts} />
          )}
        </div>
      </div>

      <ListMembersTable tenantSlug={tenantSlug} listId={listId} members={members} canManage={canManage} />
    </div>
  );
}

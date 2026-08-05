import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTenantDetail } from "@/repositories/admin.repository";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TenantStatusActions } from "@/components/admin/empresas/tenant-status-actions";

export const metadata: Metadata = { title: "Detalhes da empresa · Admin" };

export default async function AdminEmpresaDetailPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  const tenant = await getTenantDetail(tenantId);
  if (!tenant) notFound();

  return (
    <div className="max-w-3xl space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{tenant.name}</h1>
          <p className="text-muted-foreground">
            <code className="text-xs">{tenant.slug}</code> · Plano:{" "}
            {tenant.subscription?.plan.name ?? "—"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={tenant.status === "ACTIVE" ? "default" : "destructive"}>
            {tenant.status}
          </Badge>
          <TenantStatusActions tenantId={tenant.id} status={tenant.status} />
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">
          Usuários ({tenant.members.length})
        </h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Papel</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tenant.members.map((member) => (
              <TableRow key={member.id}>
                <TableCell>{member.user.name}</TableCell>
                <TableCell>{member.user.email}</TableCell>
                <TableCell className="capitalize">{member.role}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Módulos instalados</h2>
        <p className="text-sm text-muted-foreground">
          {tenant.tenantModules.filter((tm) => tm.status === "INSTALLED").length === 0
            ? "Nenhum módulo instalado."
            : tenant.tenantModules
                .filter((tm) => tm.status === "INSTALLED")
                .map((tm) => tm.module.name)
                .join(", ")}
        </p>
      </div>
    </div>
  );
}

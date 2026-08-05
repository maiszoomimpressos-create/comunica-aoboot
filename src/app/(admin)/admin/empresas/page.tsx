import type { Metadata } from "next";
import Link from "next/link";
import { listAllTenants } from "@/repositories/admin.repository";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Empresas · Admin" };

export default async function AdminEmpresasPage() {
  const tenants = await listAllTenants();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Empresas</h1>
        <p className="text-muted-foreground">{tenants.length} empresas na plataforma.</p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Empresa</TableHead>
            <TableHead>Plano</TableHead>
            <TableHead>Usuários</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tenants.map((tenant) => (
            <TableRow key={tenant.id}>
              <TableCell>
                <Link
                  href={`/admin/empresas/${tenant.id}`}
                  className="font-medium hover:underline"
                >
                  {tenant.name}
                </Link>
                <p className="text-xs text-muted-foreground">{tenant.slug}</p>
              </TableCell>
              <TableCell>{tenant.subscription?.plan.name ?? "—"}</TableCell>
              <TableCell>{tenant._count.members}</TableCell>
              <TableCell>
                <Badge variant={tenant.status === "ACTIVE" ? "default" : "destructive"}>
                  {tenant.status}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

import type { Metadata } from "next";
import { listAllUsers } from "@/repositories/admin.repository";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Usuários · Admin" };

export default async function AdminUsuariosPage() {
  const users = await listAllUsers();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Usuários</h1>
        <p className="text-muted-foreground">{users.length} usuários na plataforma.</p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>E-mail</TableHead>
            <TableHead>Empresas</TableHead>
            <TableHead>Plataforma</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell>{user.name}</TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell>{user._count.members}</TableCell>
              <TableCell>
                {user.role === "admin" && <Badge>Admin</Badge>}
                {user.banned && (
                  <Badge variant="destructive" className="ml-1">
                    Banido
                  </Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { TenantMember } from "@/repositories/membership.repository";
import type { TenantInvitation } from "@/repositories/invitation.repository";
import { updateMemberRoleAction } from "@/actions/users/update-member-role";
import { removeUserAction } from "@/actions/users/remove-user";
import { revokeInvitationAction } from "@/actions/users/revoke-invitation";

export function MembersTable({
  tenantSlug,
  members,
  invitations,
  roles,
  currentUserId,
  canManage,
}: {
  tenantSlug: string;
  members: TenantMember[];
  invitations: TenantInvitation[];
  roles: { key: string; name: string }[];
  currentUserId: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleRoleChange(memberId: string, roleKey: string) {
    setError(null);
    startTransition(async () => {
      const result = await updateMemberRoleAction(tenantSlug, { memberId, roleKey });
      if (!result.success) setError(result.error.message);
      router.refresh();
    });
  }

  function handleRemove(memberId: string) {
    setError(null);
    startTransition(async () => {
      const result = await removeUserAction(tenantSlug, { memberId });
      if (!result.success) setError(result.error.message);
      router.refresh();
    });
  }

  function handleRevoke(invitationId: string) {
    startTransition(async () => {
      await revokeInvitationAction(tenantSlug, { invitationId });
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Usuário</TableHead>
            <TableHead>Papel</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => {
            const initials = member.name
              .split(" ")
              .map((p) => p[0])
              .slice(0, 2)
              .join("")
              .toUpperCase();
            const isSelf = member.userId === currentUserId;
            return (
              <TableRow key={member.id}>
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <Avatar className="size-7">
                      {member.image && <AvatarImage src={member.image} alt={member.name} />}
                      <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">
                        {member.name} {isSelf && <span className="text-muted-foreground">(você)</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">{member.email}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {canManage ? (
                    <Select
                      value={member.roleKey}
                      onValueChange={(value) => value && handleRoleChange(member.id, value)}
                      disabled={isPending}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {roles.map((role) => (
                          <SelectItem key={role.key} value={role.key}>
                            {role.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="secondary" className="capitalize">
                      {member.roleKey}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {canManage && (
                    <AlertDialog>
                      <AlertDialogTrigger
                        render={<Button variant="ghost" size="sm" disabled={isPending} />}
                      >
                        Remover
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remover {member.name}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Essa pessoa perderá acesso a esta empresa imediatamente.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleRemove(member.id)}>
                            Remover
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {invitations.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">Convites pendentes</h3>
          <Table>
            <TableBody>
              {invitations.map((invitation) => (
                <TableRow key={invitation.id}>
                  <TableCell>{invitation.email}</TableCell>
                  <TableCell className="capitalize text-muted-foreground">{invitation.role}</TableCell>
                  <TableCell className="text-right">
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isPending}
                        onClick={() => handleRevoke(invitation.id)}
                      >
                        Revogar
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

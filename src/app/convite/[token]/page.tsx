import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { findPendingInvitationById } from "@/repositories/invitation.repository";
import { prisma } from "@/lib/db/prisma";
import { getOptionalAuthenticatedUser } from "@/lib/server/request-context";
import { AcceptInvitationForm } from "@/components/invitations/accept-invitation-form";

export const metadata: Metadata = { title: "Aceitar convite" };

export default async function ConvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token: invitationId } = await params;
  const invitation = await findPendingInvitationById(invitationId);
  if (!invitation) notFound();

  const existingUser = await prisma.user.findUnique({ where: { email: invitation.email } });
  const currentUser = await getOptionalAuthenticatedUser();

  let mode: "new-user" | "existing-user-signed-in" | "existing-user-needs-login" = "new-user";
  if (existingUser) {
    mode =
      currentUser && currentUser.email.toLowerCase() === invitation.email.toLowerCase()
        ? "existing-user-signed-in"
        : "existing-user-needs-login";
  }

  return (
    <div className="mx-auto flex min-h-svh max-w-sm flex-col justify-center px-6">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Convite para empresa</h1>
      <AcceptInvitationForm
        invitationId={invitationId}
        email={invitation.email}
        tenantName={invitation.organization.name}
        mode={mode}
      />
    </div>
  );
}

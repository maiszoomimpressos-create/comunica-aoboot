import { prisma } from "@/lib/db/prisma";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface TenantInvitation {
  id: string;
  email: string;
  role: string;
  status: string;
  createdAt: Date;
  expiresAt: Date | null;
}

export async function listInvitationsForTenant(tenantId: string): Promise<TenantInvitation[]> {
  const invitations = await prisma.invitation.findMany({
    where: { organizationId: tenantId, status: "pending" },
    orderBy: { createdAt: "desc" },
  });
  return invitations.map((i) => ({
    id: i.id,
    email: i.email,
    role: i.role,
    status: i.status,
    createdAt: i.createdAt,
    expiresAt: i.expiresAt,
  }));
}

export async function createInvitation(params: {
  tenantId: string;
  email: string;
  role: string;
  inviterId: string;
}) {
  return prisma.invitation.create({
    data: {
      organizationId: params.tenantId,
      email: params.email.toLowerCase(),
      role: params.role,
      inviterId: params.inviterId,
      status: "pending",
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
    },
    // token isn't a column on `invitation` in our schema (it doesn't need to
    // be, since the invitation `id` itself is an unguessable cuid) — the
    // accept link uses the invitation id as the "token".
  });
}

export function revokeInvitation(tenantId: string, invitationId: string) {
  return prisma.invitation.updateMany({
    where: { id: invitationId, organizationId: tenantId, status: "pending" },
    data: { status: "canceled" },
  });
}

export async function findPendingInvitationById(invitationId: string) {
  const invitation = await prisma.invitation.findUnique({
    where: { id: invitationId },
    include: { organization: true },
  });
  if (!invitation || invitation.status !== "pending") return null;
  if (invitation.expiresAt && invitation.expiresAt < new Date()) return null;
  return invitation;
}

export function markInvitationAccepted(invitationId: string) {
  return prisma.invitation.update({
    where: { id: invitationId },
    data: { status: "accepted" },
  });
}

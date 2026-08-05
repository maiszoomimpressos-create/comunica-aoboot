import type { MailMessage } from "@/lib/notifications/mailer";

export function inviteMemberTemplate(params: {
  to: string;
  inviterName: string;
  tenantName: string;
  url: string;
}): MailMessage {
  return {
    to: params.to,
    subject: `${params.inviterName} convidou você para ${params.tenantName}`,
    text: `${params.inviterName} convidou você para participar de ${params.tenantName}.\n\nAceite o convite (válido por 7 dias):\n\n${params.url}`,
    html: `<p>${params.inviterName} convidou você para participar de <strong>${params.tenantName}</strong>.</p><p>Aceite o convite (válido por 7 dias):</p><p><a href="${params.url}">${params.url}</a></p>`,
  };
}

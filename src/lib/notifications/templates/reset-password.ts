import type { MailMessage } from "@/lib/notifications/mailer";

export function resetPasswordTemplate(params: {
  to: string;
  userName: string;
  url: string;
}): MailMessage {
  return {
    to: params.to,
    subject: "Redefinir sua senha",
    text: `Olá, ${params.userName}.\n\nRecebemos um pedido para redefinir sua senha. Acesse o link abaixo (válido por 1 hora):\n\n${params.url}\n\nSe você não pediu isso, ignore este e-mail.`,
    html: `<p>Olá, ${params.userName}.</p><p>Recebemos um pedido para redefinir sua senha. Acesse o link abaixo (válido por 1 hora):</p><p><a href="${params.url}">${params.url}</a></p><p>Se você não pediu isso, ignore este e-mail.</p>`,
  };
}

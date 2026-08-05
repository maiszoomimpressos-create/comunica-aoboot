export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface MailProvider {
  send(message: MailMessage): Promise<void>;
}

/**
 * Dev-only provider: logs the e-mail to the terminal instead of sending it.
 * Swap `mailer` below for a real provider (Resend, SES, Postmark, ...) when
 * one is wired up — nothing else in the app needs to change, every caller
 * only knows about the `MailProvider` interface.
 */
class ConsoleMailProvider implements MailProvider {
  async send(message: MailMessage): Promise<void> {
    console.log(
      `\n--- 📧 e-mail (console provider) ---\nPara: ${message.to}\nAssunto: ${message.subject}\n\n${message.text ?? message.html}\n--- fim do e-mail ---\n`
    );
  }
}

export const mailer: MailProvider = new ConsoleMailProvider();

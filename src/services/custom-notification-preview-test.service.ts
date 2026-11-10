import { getConnectionSummary, getConnectionWithSecret } from "@/repositories/channel-connection.repository";
import { sendTestMessage } from "@/services/whatsapp-connection.service";
import { decryptSecret } from "@/lib/crypto/secret-box";
import { getWhatsappProvider } from "@/lib/whatsapp/registry";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/server/errors";
import { parseBrazilianWhatsappNumber } from "@/lib/whatsapp/phone-format";
import { isRecipientNameField, isUsablePersonName } from "@/lib/notifications/greeting-name";
import {
  buildCustomMessagePreview,
  buildSampleDetails,
  SAMPLE_BUSINESS_NAME,
  type CustomNotificationField,
} from "@/lib/notifications/custom-message";
import type { CustomGreetingNameSource, CustomGreetingStyle } from "@/generated/prisma/client";
import type { SendMessageResult } from "@/lib/whatsapp/types";

const CONTACT_NAME_TIMEOUT_MS = 3_000;

export interface SendCustomNotificationPreviewTestInput {
  connectionId: string;
  to: string;
  messageTemplate: string;
  fields: CustomNotificationField[];
  greetingStyle: CustomGreetingStyle;
  greetingNameSource: CustomGreetingNameSource;
  details?: Record<string, string>;
}

async function fetchWhatsappProfileName(
  tenantId: string,
  connectionId: string,
  digits: string
): Promise<string | null> {
  const connection = await getConnectionWithSecret(tenantId, connectionId);
  if (!connection) {
    throw new NotFoundError("Conexão não encontrada.");
  }
  if (connection.status !== "CONNECTED") {
    throw new ConflictError(
      "Esta conexão não está ativa no momento. Reconecte em Conexões antes de enviar o teste."
    );
  }
  if (!connection.apiUrl || !connection.apiTokenCipher) {
    throw new ConflictError("Esta conexão ainda não foi configurada.");
  }

  const apiToken = decryptSecret(connection.apiTokenCipher);
  const provider = getWhatsappProvider(connection.provider.key);
  const result = await Promise.race([
    provider
      .getContactName(
        { apiUrl: connection.apiUrl, apiToken, phoneNumber: connection.phoneNumber },
        digits
      )
      .catch(() => ({ ok: false as const })),
    new Promise<{ ok: false }>((resolve) => {
      setTimeout(() => resolve({ ok: false as const }), CONTACT_NAME_TIMEOUT_MS);
    }),
  ]);

  const raw = result.ok ? result.name?.trim() || null : null;
  if (!isUsablePersonName(raw)) return null;
  return raw;
}

/** Só consulta o nome do perfil no WhatsApp deste número — não envia mensagem. */
export async function lookupWhatsappContactName(
  tenantId: string,
  connectionId: string,
  to: string
): Promise<{ name: string | null }> {
  const parsed = parseBrazilianWhatsappNumber(to);
  if (!parsed.ok) {
    throw new ValidationError(parsed.error);
  }
  const name = await fetchWhatsappProfileName(tenantId, connectionId, parsed.digits);
  return { name };
}

/** Envia a prévia atual por esta conexão, autenticado pela sessão.
 * A saudação (e o placeholder de nome, se houver) usa o perfil WhatsApp
 * do número de teste — não o nome de exemplo da prévia. */
export async function sendCustomNotificationPreviewTest(
  tenantId: string,
  input: SendCustomNotificationPreviewTestInput
): Promise<SendMessageResult> {
  const connection = await getConnectionSummary(tenantId, input.connectionId);
  if (!connection) {
    throw new NotFoundError("Conexão não encontrada.");
  }
  if (connection.status !== "CONNECTED") {
    throw new ConflictError(
      "Esta conexão não está ativa no momento. Reconecte em Conexões antes de enviar o teste."
    );
  }

  const parsed = parseBrazilianWhatsappNumber(input.to);
  if (!parsed.ok) {
    throw new ValidationError(parsed.error);
  }

  const template = input.messageTemplate ?? "";
  if (!template.trim()) {
    throw new ValidationError("Informe o texto da mensagem.");
  }

  const profileName = await fetchWhatsappProfileName(tenantId, input.connectionId, parsed.digits);
  const businessName = connection.businessName?.trim() || SAMPLE_BUSINESS_NAME;
  const details = { ...buildSampleDetails(input.fields), ...(input.details ?? {}) };
  if (profileName) {
    for (const field of input.fields) {
      if (isRecipientNameField(field.key, field.label)) {
        details[field.key] = profileName;
      }
    }
  }

  const body = buildCustomMessagePreview({
    messageTemplate: template,
    fields: input.fields,
    details,
    businessName,
    greetingStyle: input.greetingStyle,
    greetingNameSource: input.greetingNameSource,
    whatsappName: profileName,
    recipientName: "",
    whatsappNameOnly: true,
  });
  const text = `[TESTE]\n\n${body}`;

  return sendTestMessage(tenantId, input.connectionId, parsed.digits, text);
}

import { prisma } from "@/lib/db/prisma";
import { decryptSecret } from "@/lib/crypto/secret-box";
import { getWhatsappProvider } from "@/lib/whatsapp/registry";
import { phoneVariants } from "@/lib/whatsapp/phone-sanitize";
import { pickWebhookContactName } from "@/lib/whatsapp/contact-name";
import { applyZapiNameToContacts } from "@/repositories/contact.repository";
import { isOptOutKeyword } from "@/lib/campaigns/opt-out";
import { parseMessageStatusCallback } from "@/lib/campaigns/delivery-status";
import {
  OPT_OUT_CAMPAIGN_LOOKBACK_DAYS,
  OPT_OUT_CONFIRMATION_MESSAGE,
} from "@/config/whatsapp-campaign-defaults";
import { optOutPhoneForTenant } from "@/repositories/tenant-opt-out.repository";
import { applyDeliveryUpdate } from "@/repositories/campaign.repository";
import { getConnectionCredentialsById } from "@/repositories/channel-connection.repository";
import { logBotEvent, serializeError } from "@/lib/logging/bot-attendant-logger";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Opt-out por palavra-chave ("SAIR", "PARAR"...) — chamado pelo webhook da
 * Z-API ANTES do repasse humano / fluxo / IA (ver
 * maybeHandleInboundBotMessage em whatsapp-connection.service.ts).
 *
 * Só age se o telefone recebeu mensagem de campanha DESTA conexão nos
 * últimos OPT_OUT_CAMPAIGN_LOOKBACK_DAYS dias — fora disso devolve false e
 * a mensagem segue o caminho normal (um passageiro que manda "parar" no
 * meio de uma conversa de corrida não é descadastrado do nada).
 *
 * Quando age: registra opt-out da EMPRESA (todas as conexões), tira o
 * telefone dos envios pendentes e responde uma confirmação. Devolve true =
 * "já tratei, não passa pro bot".
 */
export async function tryHandleCampaignOptOut(input: {
  connectionId: string;
  fromPhone: string;
  text: string;
}): Promise<boolean> {
  if (!isOptOutKeyword(input.text)) return false;

  const variants = phoneVariants(input.fromPhone);
  const since = new Date(Date.now() - OPT_OUT_CAMPAIGN_LOOKBACK_DAYS * DAY_MS);
  const recent = await prisma.campaignRecipient.findFirst({
    where: {
      campaign: { connectionId: input.connectionId },
      status: { in: ["SENT", "DELIVERED", "READ"] },
      sentAt: { gte: since },
      contact: { phone: { in: variants } },
    },
    select: { id: true, campaign: { select: { tenantId: true } } },
  });
  if (!recent) return false;

  const tenantId = recent.campaign.tenantId;
  await optOutPhoneForTenant(tenantId, input.fromPhone, "keyword");
  await logBotEvent("info", "campaign_opt_out_keyword", {
    connectionId: input.connectionId,
    fromPhone: input.fromPhone,
    recipientId: recent.id,
  });

  // Confirmação best-effort — o opt-out já está gravado mesmo se falhar.
  try {
    const connection = await getConnectionCredentialsById(input.connectionId);
    if (connection?.apiUrl && connection.apiTokenCipher) {
      const provider = getWhatsappProvider(connection.provider.key);
      await provider.sendMessage(
        {
          apiUrl: connection.apiUrl,
          apiToken: decryptSecret(connection.apiTokenCipher),
          phoneNumber: connection.phoneNumber,
        },
        input.fromPhone,
        OPT_OUT_CONFIRMATION_MESSAGE
      );
    }
  } catch (err) {
    await logBotEvent("warn", "campaign_opt_out_confirmation_failed", {
      connectionId: input.connectionId,
      error: serializeError(err),
    });
  }
  return true;
}

/** MessageStatusCallback (entregue / lido / falha) → destinatário de
 * campanha com esse messageId nesta conexão. Silencioso pra callbacks que
 * não são de campanha (recibos, IA...): simplesmente não casa nada. */
export async function applyCampaignMessageStatus(connectionId: string, payload: unknown): Promise<number> {
  const parsed = parseMessageStatusCallback(payload);
  if (!parsed) return 0;
  return applyDeliveryUpdate(connectionId, parsed.messageIds, parsed.update, parsed.at);
}

/** Mensagem recebida (ReceivedCallback): se a pessoa já é contato desta
 * conexão e está sem nome (ou só com nome de perfil), grava o `chatName`
 * que a Z-API manda — nome do chat no aparelho conectado (agenda quando
 * salvo, senão o perfil). Nunca troca nome de CSV/manual. Best-effort. */
export async function rememberInboundContactName(
  connectionId: string,
  fromPhone: string,
  payload: Record<string, unknown>
): Promise<number> {
  const picked = pickWebhookContactName(payload);
  if (!picked) return 0;
  return applyZapiNameToContacts({ connectionId, phones: phoneVariants(fromPhone) }, picked);
}

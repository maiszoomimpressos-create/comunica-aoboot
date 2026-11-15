import type { WhatsappProvider } from "./provider";
import type { LinkButtonAction, SendMessageResult, WhatsappConnectionConfig } from "./types";

export type LinkButtonsSendVia = "text" | "buttons" | "text_fallback";

export interface SendWithLinkButtonsResult extends SendMessageResult {
  via: LinkButtonsSendVia;
  /** Why the button send didn't go through, when it was tried and failed. */
  buttonsError?: string;
}

/**
 * Sends `text` with link buttons when there are any and the provider
 * supports them; otherwise plain text. If the button send is refused by the
 * provider (HTTP error — `fallbackSafe`), resends the same text without
 * buttons. A timeout/dropped connection is NOT retried, so the recipient
 * never gets the message twice. The links must already be in `text`.
 */
export async function sendTextWithLinkButtons(
  provider: WhatsappProvider,
  config: WhatsappConnectionConfig,
  to: string,
  text: string,
  buttons: LinkButtonAction[]
): Promise<SendWithLinkButtonsResult> {
  if (buttons.length === 0 || !provider.sendLinkButtons) {
    return { ...(await provider.sendMessage(config, to, text)), via: "text" };
  }

  const withButtons = await provider.sendLinkButtons(config, to, text, buttons);
  const result: SendMessageResult = { ok: withButtons.ok, message: withButtons.message, raw: withButtons.raw };
  if (withButtons.ok) return { ...result, via: "buttons" };
  if (!withButtons.fallbackSafe) return { ...result, via: "buttons", buttonsError: withButtons.message };

  const plain = await provider.sendMessage(config, to, text);
  return { ...plain, via: "text_fallback", buttonsError: withButtons.message };
}

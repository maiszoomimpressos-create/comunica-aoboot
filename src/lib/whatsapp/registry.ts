import type { WhatsappProvider } from "./provider";
import { ZApiProvider } from "./providers/z-api.provider";

/**
 * Maps `ChannelProvider.key` (DB catalog) to a concrete provider
 * implementation. Adding a new provider (Meta Cloud API, Evolution API):
 * write the class in ./providers, register it here, and seed a matching
 * `ChannelProvider` row — nothing else in the app changes.
 */
const WHATSAPP_PROVIDERS: Record<string, WhatsappProvider> = {
  "z-api": new ZApiProvider(),
};

export function getWhatsappProvider(key: string): WhatsappProvider {
  const provider = WHATSAPP_PROVIDERS[key];
  if (!provider) {
    throw new Error(
      `Provedor de WhatsApp desconhecido: "${key}". Verifique o catálogo ChannelProvider e o registry.`
    );
  }
  return provider;
}

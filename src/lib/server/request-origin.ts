import { headers } from "next/headers";

/** Origem pública (https://domínio) da requisição atual — pra montar links
 * curtos com o mesmo domínio do painel. Fallback: NEXT_PUBLIC_APP_URL. */
export async function getRequestOrigin(): Promise<string | null> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) {
      const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
      return `${proto.split(",")[0].trim()}://${host.split(",")[0].trim()}`;
    }
  } catch {
    // fora de request (script/cron)
  }
  return process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "") || null;
}

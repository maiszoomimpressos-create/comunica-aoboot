/**
 * Encurtador de link próprio: https://<domínio>/l/<slug> → targetUrl.
 * Ver ShortLink em schema.prisma e src/app/l/[slug]/route.ts.
 */

export const SHORT_LINK_PATH_PREFIX = "/l/";

/** Domínio público dos links curtos (alias do projeto na Vercel; o
 * comunica-aoboot.vercel.app continua respondendo também). */
export const SHORT_LINK_PUBLIC_ORIGIN = "https://maiszap.vercel.app";
export const SHORT_LINK_SLUG_MAX_LENGTH = 40;
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

/** Normaliza o que a pessoa digitou ("App", "/l/app", "https://x/l/app") pro slug. */
export function normalizeShortLinkSlug(value: string | null | undefined): string | null {
  let v = (value ?? "").trim().toLowerCase();
  if (!v) return null;
  const idx = v.lastIndexOf(SHORT_LINK_PATH_PREFIX);
  if (idx >= 0) v = v.slice(idx + SHORT_LINK_PATH_PREFIX.length);
  v = v.replace(/^\/+|\/+$/g, "");
  return v;
}

export function isValidShortLinkSlug(slug: string): boolean {
  return slug.length <= SHORT_LINK_SLUG_MAX_LENGTH && SLUG_RE.test(slug);
}

const SLUG_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** Slug aleatório curto (sem 0/o/1/l/i pra não confundir quem digita). */
export function generateShortLinkSlug(length = 6): string {
  let out = "";
  for (let i = 0; i < length; i++) out += SLUG_ALPHABET[Math.floor(Math.random() * SLUG_ALPHABET.length)];
  return out;
}

export const SHORT_LINK_TITLE_MAX_LENGTH = 120;
export const SHORT_LINK_DESCRIPTION_MAX_LENGTH = 300;

/** Só http(s) — nada de javascript:, data: etc. */
export function normalizeShortLinkTarget(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  try {
    const url = new URL(v);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function buildShortLinkUrl(origin: string, slug: string): string {
  return `${origin.replace(/\/+$/, "")}${SHORT_LINK_PATH_PREFIX}${slug}`;
}

/** Crawlers que montam prévia de link — recebem HTML com Open Graph em vez do 302. */
const PREVIEW_BOT_RE =
  /whatsapp|facebookexternalhit|facebot|meta-externalagent|twitterbot|telegrambot|slackbot|linkedinbot|discordbot|skypeuripreview|applebot|googlebot|bingbot|pinterest|redditbot|embedly|vkshare|iframely|bot\b|crawler|spider|preview/i;

export function isLinkPreviewBot(userAgent: string | null | undefined): boolean {
  return !!userAgent && PREVIEW_BOT_RE.test(userAgent);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface ShortLinkPreview {
  url: string;
  targetUrl: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
}

/** HTML mínimo com Open Graph + redirecionamento (meta refresh) pra quem cair aqui sem ser bot. */
export function renderShortLinkPreviewHtml(link: ShortLinkPreview): string {
  const title = escapeHtml(link.title || "Abrir link");
  const description = link.description ? escapeHtml(link.description) : "";
  const target = escapeHtml(link.targetUrl);
  const meta = [
    `<meta property="og:type" content="website">`,
    `<meta property="og:url" content="${escapeHtml(link.url)}">`,
    `<meta property="og:title" content="${title}">`,
    description ? `<meta property="og:description" content="${description}">` : "",
    description ? `<meta name="description" content="${description}">` : "",
    link.imageUrl ? `<meta property="og:image" content="${escapeHtml(link.imageUrl)}">` : "",
    link.imageUrl ? `<meta name="twitter:image" content="${escapeHtml(link.imageUrl)}">` : "",
    `<meta name="twitter:card" content="summary">`,
    `<meta name="twitter:title" content="${title}">`,
    `<meta http-equiv="refresh" content="0; url=${target}">`,
  ]
    .filter(Boolean)
    .join("\n");
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${title}</title>
${meta}
<link rel="canonical" href="${target}">
</head>
<body>
<p><a href="${target}">${title}</a></p>
</body>
</html>`;
}

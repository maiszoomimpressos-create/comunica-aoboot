import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildShortLinkUrl,
  generateShortLinkSlug,
  isLinkPreviewBot,
  isValidShortLinkSlug,
  normalizeShortLinkSlug,
  normalizeShortLinkTarget,
  renderShortLinkPreviewHtml,
} from "@/config/short-links";

test("slug: normaliza o que a pessoa digita", () => {
  assert.equal(normalizeShortLinkSlug(" App "), "app");
  assert.equal(normalizeShortLinkSlug("/l/app"), "app");
  assert.equal(normalizeShortLinkSlug("https://comunica-aoboot.vercel.app/l/app/"), "app");
  assert.equal(normalizeShortLinkSlug(""), null);
  assert.equal(normalizeShortLinkSlug(null), null);
});

test("slug: só minúsculas, números e hífen; sem hífen nas pontas", () => {
  for (const ok of ["app", "a", "mai-drive", "promo2026"]) assert.ok(isValidShortLinkSlug(ok), ok);
  for (const bad of ["-app", "app-", "a b", "ação", "a/b", "x".repeat(41)]) assert.ok(!isValidShortLinkSlug(bad), bad);
});

test("slug gerado é válido", () => {
  for (let i = 0; i < 50; i++) assert.ok(isValidShortLinkSlug(generateShortLinkSlug()));
});

test("URL curta", () => {
  assert.equal(buildShortLinkUrl("https://comunica-aoboot.vercel.app/", "app"), "https://comunica-aoboot.vercel.app/l/app");
});

test("destino: só http(s)", () => {
  assert.equal(normalizeShortLinkTarget("javascript:alert(1)"), null);
  assert.equal(normalizeShortLinkTarget("data:text/html,x"), null);
  assert.equal(normalizeShortLinkTarget("não é url"), null);
  assert.ok(normalizeShortLinkTarget("https://play.google.com/store/apps/details?id=x")?.startsWith("https://play.google.com"));
});

test("crawlers de prévia x humanos", () => {
  assert.ok(isLinkPreviewBot("WhatsApp/2.23.20.0 A"));
  assert.ok(isLinkPreviewBot("facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"));
  assert.ok(isLinkPreviewBot("TelegramBot (like TwitterBot)"));
  assert.ok(!isLinkPreviewBot("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36"));
  assert.ok(!isLinkPreviewBot(null));
});

test("HTML da prévia tem OG e escapa valores", () => {
  const html = renderShortLinkPreviewHtml({
    url: "https://x/l/app",
    targetUrl: "https://play.google.com/store/apps/details?id=a&b=1",
    title: 'MAI "Drive"',
    description: "<b>grátis</b>",
    imageUrl: "https://img/icon.png",
  });
  assert.ok(html.includes('<meta property="og:title" content="MAI &quot;Drive&quot;">'));
  assert.ok(html.includes("&lt;b&gt;grátis&lt;/b&gt;"));
  assert.ok(html.includes('<meta property="og:image" content="https://img/icon.png">'));
  assert.ok(html.includes("id=a&amp;b=1"));
  assert.ok(!html.includes("<b>"));
});

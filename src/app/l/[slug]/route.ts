import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  buildShortLinkUrl,
  isLinkPreviewBot,
  isValidShortLinkSlug,
  normalizeShortLinkSlug,
  renderShortLinkPreviewHtml,
} from "@/config/short-links";

export const dynamic = "force-dynamic";

/**
 * Encurtador público: /l/<slug> (ferramenta "Links curtos" do painel).
 *  - Crawler de prévia (WhatsApp, facebookexternalhit…) → 200 com Open Graph
 *    (título/descrição/ícone), pra prévia ficar boa mesmo lendo a URL curta.
 *  - Humano → 302 pro destino (+1 clique).
 */
async function handle(request: NextRequest, slugParam: string, countClick: boolean) {
  const slug = normalizeShortLinkSlug(slugParam);
  if (!slug || !isValidShortLinkSlug(slug)) {
    return new NextResponse("Link não encontrado.", { status: 404 });
  }
  const link = await prisma.shortLink.findUnique({ where: { slug } });
  if (!link) return new NextResponse("Link não encontrado.", { status: 404 });

  if (isLinkPreviewBot(request.headers.get("user-agent"))) {
    const html = renderShortLinkPreviewHtml({
      url: buildShortLinkUrl(request.nextUrl.origin, slug),
      targetUrl: link.targetUrl,
      title: link.title,
      description: link.description,
      imageUrl: link.imageUrl,
    });
    return new NextResponse(html, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  }

  if (countClick) {
    await prisma.shortLink
      .update({ where: { id: link.id }, data: { clicks: { increment: 1 }, lastClickAt: new Date() } })
      .catch(() => undefined);
  }
  return NextResponse.redirect(link.targetUrl, {
    status: 302,
    headers: { "cache-control": "no-store" },
  });
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  return handle(request, slug, true);
}

export async function HEAD(request: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  return handle(request, slug, false);
}

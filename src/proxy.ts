import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth/auth";

/**
 * Tenant-facing module sections hidden from standard users while being
 * rebuilt — only platform admins can reach them (via admin > Testar), until
 * each one is flipped back on. Must mirror `ready: false` entries in
 * `src/components/dashboard/shell/nav-config.ts`.
 */
const BLOCKED_TENANT_SEGMENTS = [
  "modulos",
  "empresa",
  "usuarios",
  "papeis",
  "integracoes",
  "assinatura",
];

/**
 * Coarse gate only: authenticated? platform admin? Whether the caller is
 * actually a member of the `[tenantSlug]` in the URL, and whether they hold
 * a given Permission, is always re-checked server-side via
 * `getRequestContext` (layouts / Server Actions) — never here. Proxy runs
 * on the Node.js runtime by default in Next.js 16 and cannot be configured
 * to run elsewhere.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname.startsWith("/admin") && session.user.role !== "admin") {
    return NextResponse.redirect(new URL("/app", request.url));
  }

  if (session.user.role !== "admin") {
    const [, root, tenantSlug, section] = pathname.split("/");
    if (root === "app" && tenantSlug && BLOCKED_TENANT_SEGMENTS.includes(section)) {
      return NextResponse.redirect(new URL(`/app/${tenantSlug}/dashboard`, request.url));
    }
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);
  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: ["/app/:path*", "/admin/:path*"],
};

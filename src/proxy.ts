import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth/auth";

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

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/admin/:path*"],
};

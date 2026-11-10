import { headers } from "next/headers";

/**
 * When a platform admin is validating a tenant function under
 * `/admin/testar/[tenantSlug]/...`, rewrite a tenant-app href so the
 * next navigation stays in the admin shell. No-op for regular `/app/`
 * requests.
 */
export async function tenantAwareHref(href: string): Promise<string> {
  const pathname = (await headers()).get("x-pathname") ?? "";
  if (!pathname.startsWith("/admin/testar/")) return href;
  return href.replace(/^\/app\//, "/admin/testar/");
}
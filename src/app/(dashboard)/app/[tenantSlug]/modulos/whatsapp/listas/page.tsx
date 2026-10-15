import { redirect } from "next/navigation";

/** "Listas" deixou de ser uma página própria — virou uma aba dentro de
 * Campanhas (ver [connectionId]/page.tsx). Mantido como redirect pra não
 * quebrar abas/favoritos apontando pra essa URL antiga. */
export default async function ListsRedirectPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  redirect(`/app/${tenantSlug}/modulos/whatsapp/campanhas?tab=listas`);
}

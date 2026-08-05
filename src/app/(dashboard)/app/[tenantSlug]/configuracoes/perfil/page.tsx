import type { Metadata } from "next";
import { getAuthenticatedUser } from "@/lib/server/request-context";
import { ProfileForm } from "@/components/dashboard/configuracoes/profile-form";

export const metadata: Metadata = { title: "Perfil" };

export default async function PerfilPage() {
  const user = await getAuthenticatedUser();
  return <ProfileForm defaultValues={{ name: user.name }} email={user.email} />;
}

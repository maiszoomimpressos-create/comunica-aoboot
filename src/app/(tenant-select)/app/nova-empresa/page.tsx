import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAuthenticatedUser } from "@/lib/server/request-context";
import { listMembershipsForUser } from "@/repositories/membership.repository";
import { NovaEmpresaForm } from "@/components/dashboard/nova-empresa-form";

export const metadata: Metadata = { title: "Nova empresa" };

export default async function NovaEmpresaPage() {
  // Only show a back link when there's somewhere sensible to go back to: a
  // user with zero memberships was redirected here from "/app" as a
  // mandatory first step, and "/app" would just redirect them right back.
  const user = await getAuthenticatedUser();
  const memberships = await listMembershipsForUser(user.id);
  const canGoBack = memberships.length > 0;

  return (
    <div className="mx-auto max-w-sm py-16">
      {canGoBack && (
        <Link
          href="/app"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Voltar
        </Link>
      )}
      <h1 className="text-2xl font-semibold tracking-tight">Criar empresa</h1>
      <p className="mt-2 text-muted-foreground">
        Você será o Owner desta empresa na plataforma.
      </p>
      <div className="mt-8">
        <NovaEmpresaForm />
      </div>
    </div>
  );
}

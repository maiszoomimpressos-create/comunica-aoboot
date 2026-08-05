import type { Metadata } from "next";
import { NovaEmpresaForm } from "@/components/dashboard/nova-empresa-form";

export const metadata: Metadata = { title: "Nova empresa" };

export default function NovaEmpresaPage() {
  return (
    <div className="mx-auto max-w-sm py-16">
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

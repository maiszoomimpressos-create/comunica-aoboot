import type { Metadata } from "next";
import { adminListModules } from "@/repositories/module.repository";
import { ModuleManager } from "@/components/admin/modulos/module-manager";

export const metadata: Metadata = { title: "Módulos · Admin" };

export default async function AdminModulosPage() {
  const modules = await adminListModules();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Catálogo de módulos</h1>
        <p className="text-muted-foreground">
          Controla o que aparece no marketplace de módulos de cada empresa.
        </p>
      </div>
      <ModuleManager modules={modules} />
    </div>
  );
}

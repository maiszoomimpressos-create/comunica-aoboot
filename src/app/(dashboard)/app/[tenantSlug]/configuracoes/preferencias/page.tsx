import type { Metadata } from "next";
import { ThemeToggle } from "@/components/dashboard/configuracoes/theme-toggle";

export const metadata: Metadata = { title: "Preferências" };

export default function PreferenciasPage() {
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium">Tema</h2>
      <ThemeToggle />
    </div>
  );
}

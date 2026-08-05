import type { Metadata } from "next";
import { SecurityForm } from "@/components/dashboard/configuracoes/security-form";

export const metadata: Metadata = { title: "Segurança" };

export default function SegurancaPage() {
  return <SecurityForm />;
}

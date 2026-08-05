import type { Metadata } from "next";
import { RequestPasswordResetForm } from "@/components/auth/request-password-reset-form";

export const metadata: Metadata = { title: "Recuperar senha" };

export default function RecuperarSenhaPage() {
  return <RequestPasswordResetForm />;
}

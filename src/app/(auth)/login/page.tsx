import type { Metadata } from "next";
import { SignInForm } from "@/components/auth/sign-in-form";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return <SignInForm />;
}

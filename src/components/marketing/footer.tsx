import Link from "next/link";
import { siteConfig } from "@/config/site";

export function Footer() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>
          © {new Date().getFullYear()} {siteConfig.legalName}. Todos os direitos
          reservados.
        </p>
        <div className="flex gap-6">
          <Link href="/login" className="transition-colors hover:text-foreground">
            Entrar
          </Link>
          <Link href="/cadastro" className="transition-colors hover:text-foreground">
            Criar conta
          </Link>
        </div>
      </div>
    </footer>
  );
}

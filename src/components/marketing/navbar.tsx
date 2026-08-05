import Link from "next/link";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="text-base font-semibold tracking-tight">
          {siteConfig.name}
        </Link>

        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          <Link href="/#recursos" className="transition-colors hover:text-foreground">
            Recursos
          </Link>
          <Link href="/precos" className="transition-colors hover:text-foreground">
            Preços
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <Button variant="ghost" nativeButton={false} render={<Link href="/login" />}>
            Entrar
          </Button>
          <Button nativeButton={false} render={<Link href="/cadastro" />}>
            Criar conta
          </Button>
        </div>
      </div>
    </header>
  );
}

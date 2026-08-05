import Link from "next/link";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(55% 45% at 50% -10%, color-mix(in oklch, var(--primary) 20%, transparent), transparent 70%)",
        }}
      />
      <div className="relative mx-auto flex max-w-4xl flex-col items-center px-6 py-24 text-center sm:py-32">
        <span className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
          Fundação da plataforma — canais chegam em breve
        </span>
        <h1 className="mt-6 text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
          {siteConfig.tagline}
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground text-balance">
          {siteConfig.description}
        </p>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Button size="lg" render={<Link href="/cadastro" />}>
            Criar conta grátis
          </Button>
          <Button size="lg" variant="outline" render={<Link href="/precos" />}>
            Ver planos
          </Button>
        </div>
      </div>
    </section>
  );
}

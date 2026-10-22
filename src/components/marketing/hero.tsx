import Link from "next/link";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";

function Bubble({ from, children }: { from: "client" | "bot"; children: string }) {
  return (
    <div className={`flex ${from === "bot" ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm leading-snug ${
          from === "bot" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

function ChatMockup() {
  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2 pb-4">
        <span className="size-2 rounded-full bg-success" aria-hidden />
        <span className="text-xs font-medium text-muted-foreground">
          Central de Mobilidade · online
        </span>
      </div>
      <div className="flex flex-col gap-2.5">
        <Bubble from="client">Oi, quero chamar uma corrida</Bubble>
        <Bubble from="bot">Claro! Qual o endereço de origem?</Bubble>
        <Bubble from="client">Av. Paulista, 1000</Bubble>
        <Bubble from="bot">Endereço confirmado ✓ E o destino?</Bubble>
      </div>
    </div>
  );
}

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
      <div className="relative mx-auto flex max-w-6xl flex-col items-center gap-16 px-6 py-24 lg:flex-row lg:items-center lg:py-32">
        <div className="flex max-w-xl flex-col items-start text-left">
          <span className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            Fundação da plataforma — canais chegam em breve
          </span>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            {siteConfig.tagline}
          </h1>
          <p className="mt-6 max-w-lg text-lg text-muted-foreground text-balance">
            {siteConfig.description}
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" nativeButton={false} render={<Link href="/cadastro" />}>
              Criar conta grátis
            </Button>
            <Button size="lg" variant="outline" nativeButton={false} render={<Link href="/precos" />}>
              Ver planos
            </Button>
          </div>
        </div>

        <div className="flex w-full justify-center lg:justify-end">
          <ChatMockup />
        </div>
      </div>
    </section>
  );
}

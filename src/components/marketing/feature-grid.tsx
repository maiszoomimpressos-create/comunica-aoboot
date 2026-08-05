import { Building2, ShieldCheck, LayoutGrid, Users } from "lucide-react";

const FEATURES = [
  {
    icon: Building2,
    title: "Multiempresa",
    description:
      "Uma conta, várias empresas. Cada uma com seus próprios usuários, papéis e dados isolados.",
  },
  {
    icon: ShieldCheck,
    title: "Papéis e permissões",
    description:
      "Owner, Admin, Member e Billing prontos — e você pode criar papéis customizados com o conjunto exato de permissões que precisar.",
  },
  {
    icon: LayoutGrid,
    title: "Marketplace de módulos",
    description:
      "Estrutura pronta para instalar canais (WhatsApp, Telegram, Instagram, e-mail, SMS) assim que forem lançados.",
  },
  {
    icon: Users,
    title: "Convites e onboarding",
    description:
      "Convide sua equipe, atribua papéis e acompanhe tudo num painel único por empresa.",
  },
] as const;

export function FeatureGrid() {
  return (
    <section id="recursos" className="mx-auto max-w-6xl px-6 py-20">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-semibold tracking-tight">
          A base para crescer sem retrabalho
        </h2>
        <p className="mt-4 text-muted-foreground text-balance">
          Multiempresa, RBAC e um marketplace de módulos já fazem parte da fundação —
          não são promessas para depois.
        </p>
      </div>

      <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((feature) => (
          <div
            key={feature.title}
            className="rounded-xl border border-border bg-card p-6"
          >
            <feature.icon className="size-6 text-primary" />
            <h3 className="mt-4 font-medium">{feature.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{feature.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

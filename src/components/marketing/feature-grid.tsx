import { Building2, ShieldCheck, LayoutGrid, Users, type LucideIcon } from "lucide-react";

const FEATURES: Array<{ icon: LucideIcon; title: string; description: string }> = [
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
];

function FeatureVisual({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <div className="flex aspect-[4/3] w-full items-center justify-center rounded-2xl border border-border bg-card">
      <Icon className="size-14 text-primary" strokeWidth={1.5} />
    </div>
  );
}

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

      <div className="mt-16 flex flex-col gap-20">
        {FEATURES.map((feature, index) => {
          const reversed = index % 2 === 1;
          return (
            <div
              key={feature.title}
              className={`flex flex-col items-center gap-10 lg:flex-row lg:gap-16 ${
                reversed ? "lg:flex-row-reverse" : ""
              }`}
            >
              <div className="w-full max-w-md flex-1">
                <FeatureVisual icon={feature.icon} />
              </div>
              <div className="w-full max-w-md flex-1 text-left">
                <h3 className="text-xl font-semibold tracking-tight">{feature.title}</h3>
                <p className="mt-3 text-muted-foreground">{feature.description}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

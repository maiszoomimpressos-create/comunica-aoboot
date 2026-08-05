import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { key: "provider", label: "Provedor" },
  { key: "config", label: "Configuração" },
  { key: "summary", label: "Conclusão" },
] as const;

export type WizardStepKey = (typeof STEPS)[number]["key"];

export function WizardSteps({ current }: { current: WizardStepKey }) {
  const currentIndex = STEPS.findIndex((s) => s.key === current);

  return (
    <ol className="flex items-center">
      {STEPS.map((step, index) => {
        const isDone = index < currentIndex;
        const isCurrent = index === currentIndex;
        return (
          <li key={step.key} className="flex flex-1 items-center gap-2 last:flex-none">
            <div
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                isDone && "bg-success text-success-foreground",
                isCurrent && "bg-primary text-primary-foreground",
                !isDone && !isCurrent && "bg-muted text-muted-foreground"
              )}
            >
              {isDone ? <Check className="size-3.5" /> : index + 1}
            </div>
            <span
              className={cn(
                "text-sm whitespace-nowrap",
                isCurrent ? "font-medium text-foreground" : "text-muted-foreground"
              )}
            >
              {step.label}
            </span>
            {index < STEPS.length - 1 && <div className="mx-2 h-px flex-1 bg-border" />}
          </li>
        );
      })}
    </ol>
  );
}

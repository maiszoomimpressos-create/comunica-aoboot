import type { RecipientCounts } from "@/repositories/campaign.repository";
import { computeMetrics } from "./campaign-status";

function pct(part: number, whole: number) {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

/** Números + barra de progresso de uma campanha. "Entregue" e "lida" só
 * aparecem quando a Z-API manda o MessageStatusCallback (webhook "Ao
 * receber status da mensagem" configurado na instância). */
export function CampaignMetrics({
  counts,
  total,
  compact = false,
}: {
  counts: RecipientCounts;
  total: number;
  compact?: boolean;
}) {
  const m = computeMetrics(counts, total);
  const progress = pct(m.done, m.total);

  const items: { label: string; value: number; hint?: string; tone?: string }[] = [
    { label: "Enviadas", value: m.sent },
    { label: "Entregues", value: m.delivered, hint: `${pct(m.delivered, m.sent)}%` },
    { label: "Lidas", value: m.read, hint: `${pct(m.read, m.sent)}%` },
    { label: "Falhas", value: m.failed, tone: m.failed ? "text-destructive" : undefined },
    { label: "Sem WhatsApp", value: m.invalid, tone: m.invalid ? "text-destructive" : undefined },
    { label: "Opt-out", value: m.optedOut },
    { label: "Pendentes", value: m.pending },
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">
          {m.done}/{m.total} ({progress}%)
        </span>
      </div>
      {compact ? (
        <p className="text-sm text-muted-foreground">
          {items
            .filter((i) => i.value > 0 || i.label === "Enviadas" || i.label === "Pendentes")
            .map((i) => `${i.value} ${i.label.toLowerCase()}`)
            .join(" · ")}
        </p>
      ) : (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {items.map((i) => (
            <div key={i.label} className="rounded-md border p-3">
              <dt className="text-xs text-muted-foreground">{i.label}</dt>
              <dd className={`text-lg font-semibold tabular-nums ${i.tone ?? ""}`}>
                {i.value}
                {i.hint && i.value > 0 && <span className="ml-1 text-xs font-normal text-muted-foreground">{i.hint}</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

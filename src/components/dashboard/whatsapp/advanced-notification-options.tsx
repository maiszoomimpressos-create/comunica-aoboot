"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Erros cuja correção está nas opções avançadas (campos, identificador, título). */
export function isAdvancedOptionsError(message: string | null | undefined): boolean {
  if (!message?.trim()) return false;
  const lower = message.toLowerCase();
  if (lower.includes("informe o texto da mensagem")) return false;
  return (
    lower.includes("campo") ||
    lower.includes("identificador") ||
    lower.includes("já é um tipo") ||
    lower.includes("já existe uma função") ||
    lower.includes("informe um título") ||
    /\{\{/.test(message)
  );
}

/** Seção recolhida por padrão; abre sozinha se o erro de validação for dela. */
export function AdvancedNotificationOptions({
  error,
  children,
}: {
  error?: string | null;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (isAdvancedOptionsError(error)) setOpen(true);
  }, [error]);

  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium text-foreground hover:bg-muted/40"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        Opções avançadas (campos que o sistema envia)
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="space-y-4 border-t border-border p-3">{children}</div>}
    </div>
  );
}

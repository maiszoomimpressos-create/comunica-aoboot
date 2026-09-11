"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleTrigger, CollapsiblePanel } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

/** A page section with a chevron to collapse/expand its content — used for
 * the "Listas" section on the campaigns page, which can get long once a
 * connection has many lists. Defaults open so nothing hides by surprise on
 * first load. */
export function CollapsibleSection({
  title,
  subtitle,
  actions,
  defaultOpen = true,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <CollapsibleTrigger className="flex items-center gap-2 rounded-md text-left hover:text-foreground">
          <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")} />
          <div>
            <h2 className="text-lg font-medium">{title}</h2>
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
        </CollapsibleTrigger>
        {actions}
      </div>
      <CollapsiblePanel>{children}</CollapsiblePanel>
    </Collapsible>
  );
}

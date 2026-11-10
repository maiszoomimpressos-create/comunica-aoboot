"use client";

import { ListOrdered } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Botão de destaque para reorganizar o texto da mensagem (uma informação
 * por linha). Só altera o texto no editor — o usuário revisa e salva. */
export function OrganizeTemplateLinesButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
      <Button
        type="button"
        size="lg"
        onClick={onClick}
        disabled={disabled}
        className="h-10 gap-2 bg-emerald-600 px-4 text-sm font-semibold text-white shadow-md hover:bg-emerald-500 focus-visible:ring-emerald-400 dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400 dark:focus-visible:ring-emerald-300"
      >
        <ListOrdered className="size-5 shrink-0" />
        Organizar uma informação por linha
      </Button>
      <p className="text-xs text-muted-foreground sm:max-w-xs">
        Separa cada informação em uma linha pra ficar fácil de ler no WhatsApp.
      </p>
    </div>
  );
}

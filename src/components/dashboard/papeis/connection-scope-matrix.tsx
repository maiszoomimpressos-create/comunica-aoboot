"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { SegmentoSummary } from "@/repositories/segmento.repository";

interface ConnectionOption {
  id: string;
  connectionName: string;
  phoneNumber: string;
}

/** Sibling of PermissionMatrix, same controlled-component shape — restrição
 * real é por conexão (ver Role.connectionScopeEnabled em schema.prisma), os
 * segmentos de cada uma só aparecem anotados pra deixar visível quando uma
 * conexão é compartilhada por mais de um. */
export function ConnectionScopeMatrix({
  connections,
  segmentos,
  selected,
  onChange,
  disabled,
}: {
  connections: ConnectionOption[];
  segmentos: SegmentoSummary[];
  selected: string[];
  onChange: (connectionIds: string[]) => void;
  disabled?: boolean;
}) {
  function toggle(connectionId: string, checked: boolean) {
    if (checked) onChange([...selected, connectionId]);
    else onChange(selected.filter((id) => id !== connectionId));
  }

  if (connections.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Nenhuma conexão de WhatsApp nesta empresa ainda.</p>
    );
  }

  return (
    <div className="space-y-2">
      {connections.map((connection) => {
        const names = segmentos
          .filter((s) => s.connectionId === connection.id)
          .map((s) => s.name);
        return (
          <Label
            key={connection.id}
            className="flex items-start gap-2 text-sm font-normal"
          >
            <Checkbox
              checked={selected.includes(connection.id)}
              disabled={disabled}
              onCheckedChange={(checked) => toggle(connection.id, checked === true)}
              className="mt-0.5"
            />
            <span>
              {connection.connectionName} ({connection.phoneNumber})
              {names.length > 1 && (
                <span className="block text-xs text-muted-foreground">
                  Compartilhada por: {names.join(", ")}
                </span>
              )}
            </span>
          </Label>
        );
      })}
    </div>
  );
}

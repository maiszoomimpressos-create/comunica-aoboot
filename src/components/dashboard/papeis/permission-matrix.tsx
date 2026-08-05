"use client";

import { PERMISSIONS, type PermissionCode } from "@/lib/rbac/permissions";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

const CATEGORY_LABEL: Record<string, string> = {
  tenant: "Empresa",
  members: "Usuários",
  roles: "Papéis",
  billing: "Assinatura",
  modules: "Módulos",
  integrations: "Integrações",
  settings: "Configurações",
  audit: "Auditoria",
};

function groupByCategory() {
  const groups = new Map<string, typeof PERMISSIONS extends readonly (infer T)[] ? T[] : never>();
  for (const permission of PERMISSIONS) {
    const list = groups.get(permission.category) ?? [];
    list.push(permission);
    groups.set(permission.category, list);
  }
  return groups;
}

export function PermissionMatrix({
  selected,
  onChange,
  disabled,
}: {
  selected: PermissionCode[];
  onChange: (codes: PermissionCode[]) => void;
  disabled?: boolean;
}) {
  const groups = groupByCategory();

  function toggle(code: PermissionCode, checked: boolean) {
    if (checked) onChange([...selected, code]);
    else onChange(selected.filter((c) => c !== code));
  }

  return (
    <div className="space-y-5">
      {[...groups.entries()].map(([category, permissions]) => (
        <div key={category}>
          <h4 className="mb-2 text-sm font-medium">{CATEGORY_LABEL[category] ?? category}</h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {permissions.map((permission) => (
              <Label
                key={permission.code}
                className="flex items-center gap-2 text-sm font-normal"
              >
                <Checkbox
                  checked={selected.includes(permission.code)}
                  disabled={disabled}
                  onCheckedChange={(checked) => toggle(permission.code, checked === true)}
                />
                {permission.description}
              </Label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

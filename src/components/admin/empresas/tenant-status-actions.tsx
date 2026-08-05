"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { setTenantStatusAction } from "@/actions/admin/set-tenant-status";

export function TenantStatusActions({
  tenantId,
  status,
}: {
  tenantId: string;
  status: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function setStatus(next: "ACTIVE" | "SUSPENDED" | "CANCELED") {
    setLoading(true);
    await setTenantStatusAction({ tenantId, status: next });
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="flex gap-2">
      {status !== "ACTIVE" && (
        <Button variant="outline" size="sm" disabled={loading} onClick={() => setStatus("ACTIVE")}>
          Reativar
        </Button>
      )}
      {status !== "SUSPENDED" && (
        <Button variant="outline" size="sm" disabled={loading} onClick={() => setStatus("SUSPENDED")}>
          Suspender
        </Button>
      )}
      {status !== "CANCELED" && (
        <Button variant="destructive" size="sm" disabled={loading} onClick={() => setStatus("CANCELED")}>
          Cancelar
        </Button>
      )}
    </div>
  );
}

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Progresso "ao vivo": enquanto alguma campanha da tela está agendada ou
 * em andamento, recarrega os dados do servidor a cada `intervalMs`
 * (router.refresh mantém estado de formulários/diálogos abertos). Pausa
 * com a aba em segundo plano. */
export function CampaignLiveRefresh({ active, intervalMs = 15_000 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [active, intervalMs, router]);
  return null;
}

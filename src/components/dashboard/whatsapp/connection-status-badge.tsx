import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ChannelConnectionStatus } from "@/generated/prisma/client";

const STATUS_LABEL: Record<ChannelConnectionStatus, string> = {
  PENDING: "Aguardando configuração",
  CONNECTING: "Conectando…",
  AWAITING_QR_SCAN: "Aguardando leitura do QR Code",
  CONNECTED: "Conectado",
  AUTH_ERROR: "Erro de autenticação",
  UNAVAILABLE: "Instância indisponível",
  INVALID_TOKEN: "Token inválido",
  ERROR: "Erro",
};

const STATUS_CLASS: Record<ChannelConnectionStatus, string> = {
  PENDING: "bg-muted text-muted-foreground",
  CONNECTING: "bg-warning/10 text-warning",
  AWAITING_QR_SCAN: "bg-warning/10 text-warning",
  CONNECTED: "bg-success/10 text-success",
  AUTH_ERROR: "bg-destructive/10 text-destructive",
  UNAVAILABLE: "bg-warning/10 text-warning",
  INVALID_TOKEN: "bg-destructive/10 text-destructive",
  ERROR: "bg-destructive/10 text-destructive",
};

export function ConnectionStatusBadge({ status }: { status: ChannelConnectionStatus }) {
  return (
    <Badge variant="outline" className={cn("border-transparent", STATUS_CLASS[status])}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

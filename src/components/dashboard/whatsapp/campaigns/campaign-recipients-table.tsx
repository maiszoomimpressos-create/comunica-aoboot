import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { CampaignRecipientRow } from "@/repositories/campaign.repository";

const STATUS_LABEL: Record<CampaignRecipientRow["status"], string> = {
  PENDING: "Pendente",
  PROCESSING: "Processando",
  SENT: "Enviada",
  DELIVERED: "Entregue",
  FAILED: "Falhou",
  CANCELLED: "Cancelada",
  OPTED_OUT: "Opt-out",
};

const STATUS_VARIANT: Record<CampaignRecipientRow["status"], "default" | "secondary" | "outline" | "destructive"> = {
  PENDING: "outline",
  PROCESSING: "outline",
  SENT: "default",
  DELIVERED: "default",
  FAILED: "destructive",
  CANCELLED: "secondary",
  OPTED_OUT: "secondary",
};

export function CampaignRecipientsTable({ recipients }: { recipients: CampaignRecipientRow[] }) {
  if (recipients.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum destinatário.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Contato</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Agendado para</TableHead>
          <TableHead>Detalhe</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {recipients.map((r) => (
          <TableRow key={r.id}>
            <TableCell>
              <p className="font-medium">{r.name ?? r.phone}</p>
              {r.name && <p className="text-xs text-muted-foreground">{r.phone}</p>}
            </TableCell>
            <TableCell>
              <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {r.scheduledAt ? new Date(r.scheduledAt).toLocaleString("pt-BR") : "—"}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {r.status === "FAILED" ? (r.errorMessage ?? "Falha não especificada.") : r.attempts > 0 ? `${r.attempts} tentativa(s)` : "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

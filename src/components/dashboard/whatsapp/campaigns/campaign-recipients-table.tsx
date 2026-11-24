import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { CampaignRecipientRow } from "@/repositories/campaign.repository";
import { RECIPIENT_STATUS_LABEL, RECIPIENT_STATUS_VARIANT, formatSpDateTime } from "./campaign-status";

function whenLabel(r: CampaignRecipientRow): string {
  if (r.readAt) return `Lida ${formatSpDateTime(r.readAt)}`;
  if (r.deliveredAt) return `Entregue ${formatSpDateTime(r.deliveredAt)}`;
  if (r.sentAt) return `Enviada ${formatSpDateTime(r.sentAt)}`;
  if (r.failedAt) return formatSpDateTime(r.failedAt);
  if (r.scheduledAt && (r.status === "PENDING" || r.status === "PROCESSING")) {
    return `Previsto ${formatSpDateTime(r.scheduledAt)}`;
  }
  return "—";
}

function detailLabel(r: CampaignRecipientRow): string {
  if (r.status === "FAILED" || r.status === "INVALID_NUMBER") return r.errorMessage ?? "Falha não especificada.";
  if (r.status === "PENDING" && r.errorMessage) return r.errorMessage; // aguardando nova tentativa
  return r.attempts > 1 ? `${r.attempts} tentativas` : "—";
}

/** Progresso na sequência ("2/3 mensagens") — só quando há mais de uma
 * parte e o envio está no meio (ou parou no meio). */
function progressLabel(r: CampaignRecipientRow, totalParts: number): string | null {
  if (totalParts <= 1 || r.nextPartIndex <= 0) return null;
  if (r.status === "SENT" || r.status === "DELIVERED" || r.status === "READ") return null;
  return `${Math.min(r.nextPartIndex, totalParts)}/${totalParts} mensagens já enviadas`;
}

export function CampaignRecipientsTable({
  recipients,
  totalParts = 1,
}: {
  recipients: CampaignRecipientRow[];
  /** Nº de mensagens da sequência da campanha. */
  totalParts?: number;
}) {
  if (recipients.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum destinatário.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Contato</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Quando (Brasília)</TableHead>
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
              <Badge variant={RECIPIENT_STATUS_VARIANT[r.status]}>{RECIPIENT_STATUS_LABEL[r.status]}</Badge>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">{whenLabel(r)}</TableCell>
            <TableCell className="max-w-xs whitespace-normal text-sm text-muted-foreground">
              {detailLabel(r)}
              {progressLabel(r, totalParts) && <p className="text-xs">{progressLabel(r, totalParts)}</p>}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

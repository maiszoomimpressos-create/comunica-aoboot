import { createElement as h } from "react";
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { put } from "@vercel/blob";
import { createFormSubmission } from "@/repositories/form-submission.repository";
import type { FormFieldDef } from "@/lib/flow/types";
import { logBotEvent, serializeError } from "@/lib/logging/bot-attendant-logger";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 11, fontFamily: "Helvetica" },
  title: { fontSize: 18, marginBottom: 4, fontWeight: "bold" },
  subtitle: { fontSize: 10, color: "#666666", marginBottom: 20 },
  row: {
    flexDirection: "row",
    marginBottom: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#eeeeee",
    borderBottomStyle: "solid",
  },
  label: { width: 160, color: "#555555" },
  value: { flex: 1, fontWeight: "bold" },
});

function buildDocument(title: string, fields: FormFieldDef[], answers: Record<string, unknown>) {
  const generatedAt = new Date().toLocaleString("pt-BR");
  return h(
    Document,
    null,
    h(
      Page,
      { size: "A4", style: styles.page },
      h(Text, { style: styles.title }, title),
      h(Text, { style: styles.subtitle }, `Gerado em ${generatedAt}`),
      ...fields.map((field) =>
        h(
          View,
          { key: field.id, style: styles.row },
          h(Text, { style: styles.label }, field.label),
          h(Text, { style: styles.value }, String(answers[field.variable] ?? ""))
        )
      )
    )
  );
}

async function generateFormSubmissionPdfBuffer(
  title: string,
  fields: FormFieldDef[],
  answers: Record<string, unknown>
): Promise<Buffer> {
  return renderToBuffer(buildDocument(title, fields, answers));
}

/** Chamado pelo motor de fluxo (flow-engine.service.ts) quando o contato
 * confirma ("ENVIAR") um nó `form`. Gera o PDF e sobe pro Vercel Blob, mas
 * nunca deixa isso travar o atendimento: se a geração/upload falhar, loga e
 * grava a submissão sem `pdfUrl` em vez de lançar — mesma convenção de
 * "canal lateral nunca derruba a conversa" usada nos providers de
 * WhatsApp. */
export async function createFormSubmissionDocument(params: {
  connectionId: string;
  flowId: string;
  nodeId: string;
  title: string;
  contactPhone: string;
  fields: FormFieldDef[];
  answers: Record<string, unknown>;
}) {
  const { connectionId, flowId, nodeId, title, contactPhone, fields, answers } = params;
  let pdfUrl: string | null = null;
  try {
    const buffer = await generateFormSubmissionPdfBuffer(title, fields, answers);
    const filename = `formularios/${flowId}/${nodeId}-${Date.now()}.pdf`;
    const blob = await put(filename, buffer, { access: "public", contentType: "application/pdf" });
    pdfUrl = blob.url;
  } catch (err) {
    await logBotEvent("error", "form_submission_pdf_failed", {
      connectionId,
      flowId,
      nodeId,
      error: serializeError(err),
    });
  }
  return createFormSubmission({ connectionId, flowId, nodeId, title, contactPhone, answers, pdfUrl });
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import { importCsvListAction } from "@/actions/campaigns/import-csv-list";
import { parseContactsCsv } from "@/lib/csv/parse-contacts-csv";

/** Mesmo valor de CSV_IMPORT_CHUNK_SIZE (whatsapp-contacts.service.ts) —
 * não importado de lá pra não puxar código de servidor pro navegador. */
const CHUNK_SIZE = 1000;
/** Arquivo lido no navegador; o limite é só pra não travar a aba. */
const MAX_FILE_BYTES = 20 * 1024 * 1024;

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

interface ImportSummary {
  imported: number;
  skippedInvalid: number;
  skippedOptOut: number;
  duplicates: number;
}

/** Cria uma lista montada a partir de um CSV (telefone + nome opcional).
 * O arquivo é lido e parseado AQUI no navegador e enviado em pedaços de
 * 1000 linhas — antes o texto inteiro ia numa Server Action e arquivos
 * acima de ~1 MB falhavam. Contatos em opt-out (do contato ou da empresa)
 * não entram; nome de contato já existente não é sobrescrito. */
export function ImportCsvListDialog({
  tenantSlug,
  connectionId,
}: {
  tenantSlug: string;
  connectionId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName("");
    setFile(null);
    setError(null);
    setProgress(null);
    setSummary(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Informe um nome para a lista.");
      return;
    }
    if (!file) {
      setError("Selecione um arquivo CSV.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("Arquivo grande demais (máx. 20 MB) — divida em mais de um CSV.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const parsed = parseContactsCsv(await readFileAsText(file));
      if (parsed.contacts.length === 0) {
        setError("Nenhum telefone válido encontrado no arquivo.");
        return;
      }
      const unique = new Map<string, { phone: string; name: string | null }>();
      for (const c of parsed.contacts) if (!unique.has(c.phone)) unique.set(c.phone, c);
      const rows = [...unique.values()];
      const totals: ImportSummary = {
        imported: 0,
        skippedInvalid: parsed.skipped,
        skippedOptOut: 0,
        duplicates: parsed.contacts.length - rows.length,
      };

      let listId: string | null = null;
      setProgress({ done: 0, total: rows.length });
      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const chunk = rows.slice(i, i + CHUNK_SIZE);
        const result = await importCsvListAction(tenantSlug, { connectionId, listId, name, rows: chunk });
        if (!result.success) {
          setError(
            listId
              ? `Parou em ${i} de ${rows.length} linhas: ${result.error.message} (o que já entrou ficou na lista).`
              : result.error.message
          );
          if (listId) router.refresh();
          return;
        }
        listId = result.data.listId;
        totals.imported += result.data.imported;
        totals.skippedInvalid += result.data.skippedInvalid;
        totals.skippedOptOut += result.data.skippedOptOut;
        setProgress({ done: Math.min(i + CHUNK_SIZE, rows.length), total: rows.length });
      }
      setSummary(totals);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao ler o arquivo.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && submitting) return; // não fecha no meio da importação
        setOpen(next);
        if (next) setError(null);
        else reset();
      }}
    >
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Upload className="size-4" />
        Importar CSV
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importar lista (CSV)</DialogTitle>
          <DialogDescription>
            Arquivo com telefone (e nome, opcional) por linha — com ou sem cabeçalho, separado por
            vírgula ou ponto e vírgula. Cria uma lista montada nova com esses contatos.
          </DialogDescription>
        </DialogHeader>

        {summary ? (
          <>
            <ul className="space-y-1 text-sm">
              <li>
                <strong>{summary.imported}</strong> contato(s) na lista
              </li>
              {summary.skippedOptOut > 0 && <li>{summary.skippedOptOut} ignorado(s) por opt-out (pediram pra não receber)</li>}
              {summary.skippedInvalid > 0 && <li>{summary.skippedInvalid} linha(s) sem telefone válido</li>}
              {summary.duplicates > 0 && <li>{summary.duplicates} telefone(s) repetido(s) no arquivo</li>}
            </ul>
            <DialogFooter className="mt-4">
              <Button onClick={() => setOpen(false)}>Fechar</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={onSubmit} noValidate>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="import-csv-list-name">Nome da lista</FieldLabel>
                <Input
                  id="import-csv-list-name"
                  placeholder="Clientes da planilha"
                  value={name}
                  disabled={submitting}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="import-csv-list-file">Arquivo CSV</FieldLabel>
                <Input
                  id="import-csv-list-file"
                  type="file"
                  accept=".csv,text/csv"
                  disabled={submitting}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <FieldDescription>
                  Até 20 MB. Contatos já cadastrados mantêm o nome atual; quem pediu opt-out fica de fora.
                </FieldDescription>
              </Field>
              {progress && (
                <p className="text-sm text-muted-foreground">
                  Importando {progress.done} de {progress.total}…
                </p>
              )}
              {error && <FieldError errors={[{ message: error }]} />}
            </FieldGroup>
            <DialogFooter className="mt-4">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Importando…" : "Importar"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

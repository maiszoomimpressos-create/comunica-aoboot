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
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { importCsvListAction } from "@/actions/campaigns/import-csv-list";

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/** Cria uma lista montada a partir de um CSV (telefone + nome opcional) —
 * os contatos novos entram presos a este número (ver
 * importContactsFromCsv), mas a lista resultante é montada, igual à criada
 * à mão, podendo depois ganhar contatos de qualquer outro número do
 * tenant. */
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
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName("");
    setFile(null);
    setError(null);
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

    setSubmitting(true);
    setError(null);
    try {
      const csvText = await readFileAsText(file);
      const result = await importCsvListAction(tenantSlug, { connectionId, name, csvText });
      if (!result.success) {
        setError(result.error.message);
        return;
      }
      setOpen(false);
      reset();
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
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
            Arquivo com telefone (e nome, opcional) por linha — com ou sem cabeçalho,
            separado por vírgula ou ponto e vírgula. Cria uma lista montada nova com
            esses contatos.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="import-csv-list-name">Nome da lista</FieldLabel>
              <Input
                id="import-csv-list-name"
                placeholder="Clientes da planilha"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="import-csv-list-file">Arquivo CSV</FieldLabel>
              <Input
                id="import-csv-list-file"
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </Field>
            {error && <FieldError errors={[{ message: error }]} />}
          </FieldGroup>
          <DialogFooter className="mt-4">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Importando…" : "Importar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

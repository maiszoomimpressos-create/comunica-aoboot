"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, FieldGroup, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { searchGooglePlacesAction } from "@/actions/campaigns/search-google-places";
import { saveGoogleCaptureAction } from "@/actions/campaigns/save-google-capture";
import {
  BR_UFS,
  CATEGORY_SUGGESTIONS,
  estimateSearchCalls,
  MAX_RESULTS_PER_SEARCH,
  PLACES_PAGE_SIZE,
} from "@/lib/google-places/places";
import type { GoogleCaptureSearchResult } from "@/services/google-capture.service";

/** "Captar contatos do Google": busca na Google Places API (New) por
 * categoria + cidade, mostra a prévia (com atribuição "Dados do Google") e
 * salva os marcados como contatos FRIOS numa lista montada. */
export function GoogleCaptureDialog({
  tenantSlug,
  connectionId,
  enabled,
}: {
  tenantSlug: string;
  connectionId: string;
  /** false = GOOGLE_PLACES_API_KEY não configurada (botão desabilitado). */
  enabled: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("");
  const [city, setCity] = useState("");
  const [uf, setUf] = useState("");
  const [limit, setLimit] = useState(PLACES_PAGE_SIZE);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GoogleCaptureSearchResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [listName, setListName] = useState("");
  const [saved, setSaved] = useState<string | null>(null);

  const safeLimit = Math.min(MAX_RESULTS_PER_SEARCH, Math.max(1, Number.isFinite(limit) ? limit : 1));
  const calls = estimateSearchCalls(safeLimit);
  const selectedRows = useMemo(
    () => result?.rows.filter((r) => selected.has(r.placeId)) ?? [],
    [result, selected]
  );

  async function onSearch() {
    setError(null);
    setSaved(null);
    if (!category.trim() || !city.trim() || uf.length !== 2) {
      setError("Informe categoria, cidade e UF.");
      return;
    }
    setSearching(true);
    const response = await searchGooglePlacesAction(tenantSlug, {
      connectionId,
      category: category.trim(),
      city: city.trim(),
      uf,
      limit: safeLimit,
    });
    setSearching(false);
    if (!response.success) {
      setError(response.error.message);
      return;
    }
    setResult(response.data);
    setSelected(new Set(response.data.rows.filter((r) => r.selectedByDefault).map((r) => r.placeId)));
    setListName(`Google · ${category.trim()} · ${city.trim()}/${uf}`);
  }

  function toggle(placeId: string, on: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(placeId);
      else next.delete(placeId);
      return next;
    });
  }

  async function onSave() {
    if (!result || selectedRows.length === 0) return;
    setError(null);
    setSaving(true);
    const response = await saveGoogleCaptureAction(tenantSlug, {
      connectionId,
      listName,
      query: result.query,
      items: selectedRows.map((r) => ({ placeId: r.placeId, name: r.name, phone: r.phone })),
    });
    setSaving(false);
    if (!response.success) {
      setError(response.error.message);
      return;
    }
    const d = response.data;
    setSaved(
      `Lista criada com ${d.added} contato(s) (${d.created} novo(s) frio(s), ${d.reusedExisting} que já eram contatos)` +
        (d.skippedOptOut > 0 ? ` · ${d.skippedOptOut} em opt-out ficaram de fora` : "") +
        "."
    );
    setResult(null);
    setSelected(new Set());
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setError(null);
          setSaved(null);
        }
      }}
    >
      <DialogTrigger
        render={
          <Button
            size="sm"
            variant="outline"
            disabled={!enabled}
            title={enabled ? undefined : "Configure GOOGLE_PLACES_API_KEY no servidor para usar."}
          />
        }
      >
        <MapPin className="size-4" />
        Captar contatos do Google
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Captar contatos do Google</DialogTitle>
          <DialogDescription>
            Busca empresas e autônomos com telefone público no Google (Perfil da Empresa / Maps) pela API
            oficial. Viram <strong>contatos frios</strong>: campanhas para eles sempre levam a instrução de
            SAIR, têm limite diário baixo e intervalo maior.
          </DialogDescription>
        </DialogHeader>

        {!enabled && (
          <p className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">
            A captação não está configurada: falta a variável <code>GOOGLE_PLACES_API_KEY</code> no servidor.
          </p>
        )}

        <FieldGroup>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_6rem_7rem]">
            <Field>
              <FieldLabel htmlFor="gp-category">Categoria</FieldLabel>
              <Input
                id="gp-category"
                list="gp-category-suggestions"
                placeholder="restaurantes, eletricistas…"
                value={category}
                maxLength={80}
                onChange={(e) => setCategory(e.target.value)}
              />
              <datalist id="gp-category-suggestions">
                {CATEGORY_SUGGESTIONS.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field>
              <FieldLabel htmlFor="gp-city">Cidade</FieldLabel>
              <Input id="gp-city" placeholder="Curitiba" value={city} maxLength={80} onChange={(e) => setCity(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel>UF</FieldLabel>
              <Select value={uf} onValueChange={(v) => setUf(typeof v === "string" ? v : "")}>
                <SelectTrigger className="w-full" aria-label="UF">
                  <SelectValue placeholder="UF" />
                </SelectTrigger>
                <SelectContent>
                  {BR_UFS.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="gp-limit">Máx. resultados</FieldLabel>
              <Input
                id="gp-limit"
                type="number"
                min={1}
                max={MAX_RESULTS_PER_SEARCH}
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
              />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={onSearch} disabled={!enabled || searching}>
              <Search className="size-4" />
              {searching ? "Buscando…" : "Buscar"}
            </Button>
            <FieldDescription>
              Até {MAX_RESULTS_PER_SEARCH} resultados por busca ({PLACES_PAGE_SIZE} por página). Esta busca faz no
              máximo <strong>{calls}</strong> chamada(s) à API do Google, cada uma cobrada como &ldquo;Text Search
              Enterprise&rdquo; (o telefone é um campo Enterprise) — veja o custo no Google Cloud.
            </FieldDescription>
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {saved && <p className="text-sm text-emerald-600">{saved}</p>}

          {result && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                &ldquo;{result.query}&rdquo;: {result.totalFound} encontrado(s) em {result.calls} chamada(s) ·{" "}
                {result.rows.length} com telefone utilizável
                {result.skippedNoPhone > 0 && ` · ${result.skippedNoPhone} sem telefone (ou 0800/exterior)`}
                {result.skippedOptOut > 0 && ` · ${result.skippedOptOut} em opt-out na empresa (nunca entram)`}
                {result.skippedDuplicate > 0 && ` · ${result.skippedDuplicate} telefone(s) repetido(s)`}.
              </p>
              <p className="text-xs text-muted-foreground">
                Celulares novos vêm marcados. Fixos vêm desmarcados (raramente têm WhatsApp — o envio confere antes)
                e quem já é contato também (não vira contato frio).
              </p>

              {result.rows.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">
                        <Checkbox
                          aria-label="Marcar todos"
                          checked={selectedRows.length === result.rows.length}
                          onCheckedChange={(v) =>
                            setSelected(v === true ? new Set(result.rows.map((r) => r.placeId)) : new Set())
                          }
                        />
                      </TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Endereço</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.rows.map((row) => (
                      <TableRow key={row.placeId}>
                        <TableCell>
                          <Checkbox
                            aria-label={`Marcar ${row.name}`}
                            checked={selected.has(row.placeId)}
                            onCheckedChange={(v) => toggle(row.placeId, v === true)}
                          />
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          {row.googleMapsUri ? (
                            <a href={row.googleMapsUri} target="_blank" rel="noreferrer" className="font-medium underline">
                              {row.name}
                            </a>
                          ) : (
                            <span className="font-medium">{row.name}</span>
                          )}
                          {row.alreadyContact && (
                            <Badge variant="secondary" className="ml-1">
                              já é contato
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {row.displayPhone}{" "}
                          <Badge variant={row.phoneKind === "mobile" ? "default" : "outline"}>
                            {row.phoneKind === "mobile" ? "celular" : "fixo"}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-normal text-sm text-muted-foreground">{row.category ?? "—"}</TableCell>
                        <TableCell className="max-w-56 whitespace-normal text-xs text-muted-foreground">
                          {row.address ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              <p className="text-xs text-muted-foreground">
                Dados do Google. Endereço, categoria e site aparecem só nesta prévia e não são guardados; do Google,
                o contato guarda o nome, o telefone e o identificador do lugar (place id).
              </p>

              {result.rows.length > 0 && (
                <Field>
                  <FieldLabel htmlFor="gp-list-name">Nome da lista (montada)</FieldLabel>
                  <Input id="gp-list-name" value={listName} maxLength={120} onChange={(e) => setListName(e.target.value)} />
                </Field>
              )}
            </div>
          )}
        </FieldGroup>

        <DialogFooter className="mt-4">
          <p className="mr-auto self-center text-xs text-muted-foreground">Dados do Google</p>
          <Button type="button" onClick={onSave} disabled={!result || selectedRows.length === 0 || saving || !listName.trim()}>
            {saving ? "Salvando…" : `Salvar ${selectedRows.length} como lista`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

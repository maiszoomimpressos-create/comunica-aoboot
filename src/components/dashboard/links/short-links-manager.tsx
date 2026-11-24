"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, Link2, Loader2, MousePointerClick, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  SHORT_LINK_DESCRIPTION_MAX_LENGTH,
  SHORT_LINK_PATH_PREFIX,
  SHORT_LINK_SLUG_MAX_LENGTH,
  SHORT_LINK_TITLE_MAX_LENGTH,
} from "@/config/short-links";
import type { ShortLinkView } from "@/services/short-link.service";
import { deleteShortLinkAction, saveShortLinkAction } from "@/actions/links/save-short-link";

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="xs"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check /> : <Copy />} {copied ? "Copiado" : "Copiar"}
    </Button>
  );
}

function ShortLinkFormDialog({
  tenantSlug,
  origin,
  link,
  onClose,
  onSaved,
}: {
  tenantSlug: string;
  origin: string;
  link: ShortLinkView | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [slug, setSlug] = useState(link?.slug ?? "");
  const [targetUrl, setTargetUrl] = useState(link?.targetUrl ?? "");
  const [title, setTitle] = useState(link?.title ?? "");
  const [description, setDescription] = useState(link?.description ?? "");
  const [imageUrl, setImageUrl] = useState(link?.imageUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await saveShortLinkAction(tenantSlug, {
      id: link?.id,
      slug: slug.trim() || null,
      targetUrl: targetUrl.trim(),
      title: title.trim() || null,
      description: description.trim() || null,
      imageUrl: imageUrl.trim() || null,
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    onSaved();
  }

  const domain = origin.replace(/^https?:\/\//, "");

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{link ? "Editar link curto" : "Novo link curto"}</DialogTitle>
          <DialogDescription>
            Só a URL de destino é obrigatória. Título, descrição e imagem aparecem na prévia do WhatsApp.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="short-link-target">URL de destino</Label>
            <Input
              id="short-link-target"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="short-link-slug">Link curto</Label>
            <div className="flex items-center gap-1">
              <span className="shrink-0 text-sm text-muted-foreground">
                {domain}
                {SHORT_LINK_PATH_PREFIX}
              </span>
              <Input
                id="short-link-slug"
                value={slug}
                maxLength={SHORT_LINK_SLUG_MAX_LENGTH}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="em branco = gerado"
              />
            </div>
            <p className="text-xs text-muted-foreground">Letras minúsculas, números e hífen. Precisa ser único.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="short-link-title">Título da prévia (opcional)</Label>
            <Input
              id="short-link-title"
              value={title}
              maxLength={SHORT_LINK_TITLE_MAX_LENGTH}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="short-link-description">Descrição da prévia (opcional)</Label>
            <Textarea
              id="short-link-description"
              rows={2}
              value={description}
              maxLength={SHORT_LINK_DESCRIPTION_MAX_LENGTH}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="short-link-image">Imagem da prévia (opcional)</Label>
            <Input
              id="short-link-image"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://… (PNG/JPG público)"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving || !targetUrl.trim()}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              Salvar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Ferramenta "Links curtos": lista os links da empresa (com cliques) e
 * cria/edita/exclui. Público em /l/<slug>. */
export function ShortLinksManager({
  tenantSlug,
  origin,
  canManage,
  links,
}: {
  tenantSlug: string;
  origin: string;
  canManage: boolean;
  links: ShortLinkView[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<ShortLinkView | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<ShortLinkView | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function confirmDelete() {
    if (!deleting) return;
    const result = await deleteShortLinkAction(tenantSlug, { id: deleting.id });
    setDeleting(null);
    if (!result.success) setError(result.error.message);
    else router.refresh();
  }

  const totalClicks = links.reduce((sum, l) => sum + l.clicks, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <div className="rounded-lg border border-border bg-card px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Links</p>
            <p className="text-lg font-semibold">{links.length}</p>
          </div>
          <div className="rounded-lg border border-border bg-card px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Cliques</p>
            <p className="text-lg font-semibold">{totalClicks}</p>
          </div>
        </div>
        {canManage && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            Novo link curto
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {links.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border p-10 text-center">
          <Link2 className="size-8 text-muted-foreground" />
          <p className="font-medium">Nenhum link curto ainda</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Cole um link comprido (Play Store, site, cardápio…) e ganhe um link curto para mandar nas mensagens.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {links.map((link) => (
            <div key={link.id} className="flex gap-3 rounded-xl border border-border bg-card p-3">
              <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                {link.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- imagem externa da prévia
                  <img src={link.imageUrl} alt="" className="size-full object-cover" />
                ) : (
                  <Link2 className="size-5 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={link.shortUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-primary hover:underline"
                  >
                    {link.shortUrl.replace(/^https?:\/\//, "")}
                  </a>
                  {link.title && <span className="truncate text-sm text-muted-foreground">· {link.title}</span>}
                </div>
                <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                  <ExternalLink className="size-3.5 shrink-0" />
                  <span className="truncate">{link.targetUrl}</span>
                </p>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MousePointerClick className="size-3.5" /> {link.clicks} clique(s) · último: {formatDate(link.lastClickAt)}
                </p>
                <div className="flex flex-wrap gap-1 pt-1">
                  <CopyButton value={link.shortUrl} />
                  {canManage && (
                    <>
                      <Button variant="outline" size="xs" onClick={() => setEditing(link)}>
                        <Pencil /> Editar
                      </Button>
                      <Button variant="ghost" size="xs" onClick={() => setDeleting(link)}>
                        <Trash2 /> Excluir
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <ShortLinkFormDialog
          tenantSlug={tenantSlug}
          origin={origin}
          link={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            router.refresh();
          }}
        />
      )}

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir o link {deleting?.slug}?</AlertDialogTitle>
            <AlertDialogDescription>
              Quem clicar nesse link curto depois disso vai ver &quot;Link não encontrado&quot;. Se ele estiver no
              convite pós-corrida, o convite volta a mandar o link comprido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

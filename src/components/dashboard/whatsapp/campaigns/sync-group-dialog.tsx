"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Users2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { listWhatsappGroupsAction } from "@/actions/campaigns/list-whatsapp-groups";
import { syncGroupContactsAction } from "@/actions/campaigns/sync-group-contacts";
import type { ProviderGroup } from "@/lib/whatsapp/types";
import { cn } from "@/lib/utils";

/** Puxa a lista de grupos do WhatsApp conectado (chamada à API a cada
 * abertura — grupos não ficam salvos no banco, só os contatos e a lista
 * extraída resultante) e deixa escolher um pra sincronizar os
 * participantes como uma lista extraída dedicada a esse grupo. */
export function SyncGroupDialog({ tenantSlug, connectionId }: { tenantSlug: string; connectionId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<ProviderGroup[] | null>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadGroups() {
    setLoading(true);
    setError(null);
    const res = await listWhatsappGroupsAction(tenantSlug, { connectionId });
    setLoading(false);
    if (!res.success) {
      setError(res.error.message);
      return;
    }
    setGroups(res.data);
  }

  const filtered = useMemo(() => {
    if (!groups) return [];
    const query = search.trim().toLowerCase();
    if (!query) return groups;
    return groups.filter((g) => g.name.toLowerCase().includes(query));
  }, [groups, search]);

  const selectedGroup = groups?.find((g) => g.id === selectedId) ?? null;

  async function handleSync() {
    if (!selectedGroup) return;
    setSyncing(true);
    setError(null);
    setResult(null);
    const res = await syncGroupContactsAction(tenantSlug, {
      connectionId,
      groupId: selectedGroup.id,
      groupName: selectedGroup.name,
    });
    setSyncing(false);
    if (!res.success) {
      setError(res.error.message);
      return;
    }
    setResult(
      `"${res.data.listName}" — ${res.data.total} participante(s), ${res.data.created} contato(s) novo(s).`
    );
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setGroups(null);
          setSearch("");
          setSelectedId(null);
          setResult(null);
          setError(null);
          loadGroups();
        }
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Users2 className="size-4" />
        Sincronizar de um grupo
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sincronizar contatos de um grupo</DialogTitle>
          <DialogDescription>
            Escolha um grupo desse número — os participantes entram na lista desse grupo (pra campanha
            só pra eles) e também na lista geral do número, junto com o resto da agenda.
          </DialogDescription>
        </DialogHeader>

        {loading && <p className="text-sm text-muted-foreground">Buscando grupos…</p>}

        {!loading && groups && groups.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhum grupo encontrado nesse número.
          </p>
        )}

        {!loading && groups && groups.length > 0 && (
          <>
            <Input placeholder="Buscar grupo…" value={search} onChange={(e) => setSearch(e.target.value)} />
            {/* min-w-0: DialogContent é um grid — sem isso, este item
            calcula a própria largura mínima pelo conteúdo mais largo lá
            dentro (o min-w-0 do <span> sozinho não resolve, porque esse
            cálculo acontece de novo em cada nível que ainda tem overflow
            visível) e estufa o modal inteiro. */}
            <ScrollArea className="max-h-72 min-w-0 rounded-md border border-border">
              <div className="divide-y divide-border">
                {filtered.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => setSelectedId(group.id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted/50",
                      selectedId === group.id && "bg-muted"
                    )}
                  >
                    {/* min-w-0: item de flex não encolhe abaixo do
                    conteúdo por padrão — sem isso, um nome sem espaço
                    (id de grupo tipo "12036...-group") ignora o truncate
                    e estoura a largura do modal inteiro. */}
                    <span className="min-w-0 truncate">{group.name}</span>
                    {selectedId === group.id && <Check className="size-4 shrink-0 text-primary" />}
                  </button>
                ))}
              </div>
            </ScrollArea>
          </>
        )}

        {result && <p className="text-sm text-muted-foreground">{result}</p>}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <DialogFooter className="mt-2">
          <Button onClick={handleSync} disabled={!selectedGroup || syncing}>
            {syncing ? "Sincronizando…" : "Sincronizar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

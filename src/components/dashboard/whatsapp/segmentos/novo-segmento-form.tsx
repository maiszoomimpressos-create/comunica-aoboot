"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { WhatsappProductCard } from "../whatsapp-product-card";
import { WHATSAPP_PRODUCTS } from "@/config/whatsapp-products";
import { SEGMENTO_NICHES } from "@/config/segmento-niches";
import { createSegmentoAction } from "@/actions/segmentos/create-segmento";

interface ConnectionOption {
  id: string;
  connectionName: string;
  phoneNumber: string;
}

export function NovoSegmentoForm({
  tenantSlug,
  connections,
}: {
  tenantSlug: string;
  connections: ConnectionOption[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [niche, setNiche] = useState(SEGMENTO_NICHES[0].key);
  const [mode, setMode] = useState<"new" | "existing">(connections.length > 0 ? "existing" : "new");

  const [productKeys, setProductKeys] = useState<string[]>([]);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [connectionId, setConnectionId] = useState(connections[0]?.id ?? "");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function toggleProduct(key: string, checked: boolean) {
    setProductKeys((prev) => (checked ? [...prev, key] : prev.filter((k) => k !== key)));
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    const result = await createSegmentoAction(tenantSlug, {
      name,
      niche,
      connection:
        mode === "new"
          ? { mode: "new", productKeys, phoneNumber }
          : { mode: "existing", connectionId },
    });
    setSubmitting(false);
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    setDone(true);
    router.refresh();
  }

  if (done) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center">
        <h2 className="text-lg font-medium">Segmento criado</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {mode === "new"
            ? "A conexão nova foi solicitada — nossa equipe vai configurá-la em breve."
            : "O segmento já está pronto, apontando pra conexão escolhida."}{" "}
          Acompanhe em{" "}
          <a
            href={`/app/${tenantSlug}/modulos/whatsapp/segmentos`}
            className="underline underline-offset-4 hover:text-foreground"
          >
            Segmentos
          </a>
          .
        </p>
      </div>
    );
  }

  const canSubmit =
    name.trim().length > 0 &&
    (mode === "new" ? productKeys.length > 0 && phoneNumber.trim().length > 0 : connectionId.length > 0);

  return (
    <div className="space-y-6">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="segmento-name">Nome do segmento</FieldLabel>
          <Input
            id="segmento-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Estacionamento Shopping ABC"
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="segmento-niche">Nicho</FieldLabel>
          <Select value={niche} onValueChange={(v) => setNiche(v as typeof niche)}>
            <SelectTrigger id="segmento-niche" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEGMENTO_NICHES.map((n) => (
                <SelectItem key={n.key} value={n.key}>
                  {n.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </FieldGroup>

      <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
        <TabsList>
          <TabsTrigger value="existing" disabled={connections.length === 0}>
            Usar conexão existente
          </TabsTrigger>
          <TabsTrigger value="new">Criar conexão nova</TabsTrigger>
        </TabsList>

        <TabsContent value="existing" className="mt-4">
          {connections.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Você ainda não tem nenhuma conexão de WhatsApp disponível — crie uma nova ao lado.
            </p>
          ) : (
            <Field>
              <FieldLabel htmlFor="segmento-connection">Conexão</FieldLabel>
              <Select value={connectionId} onValueChange={(v) => setConnectionId(v ?? "")}>
                <SelectTrigger id="segmento-connection" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {connections.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.connectionName} ({c.phoneNumber})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>
                Esse segmento vai compartilhar a mesma conexão com qualquer outro que já aponte pra ela.
              </FieldDescription>
            </Field>
          )}
        </TabsContent>

        <TabsContent value="new" className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {WHATSAPP_PRODUCTS.map((product) => (
              <WhatsappProductCard
                key={product.key}
                product={product}
                checked={productKeys.includes(product.key)}
                onCheckedChange={(checked) => toggleProduct(product.key, checked)}
              />
            ))}
          </div>
          <Field>
            <FieldLabel htmlFor="segmento-phone">Número do WhatsApp</FieldLabel>
            <Input
              id="segmento-phone"
              placeholder="5511999999999"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
            />
            <FieldDescription>
              Código do país + DDD + número, sem espaço nem traço. Nossa equipe configura a conexão depois
              de solicitada.
            </FieldDescription>
          </Field>
        </TabsContent>
      </Tabs>

      {error && <FieldError className="block">{error}</FieldError>}

      <Button onClick={handleSubmit} disabled={submitting || !canSubmit}>
        {submitting ? "Criando…" : "Criar segmento"}
      </Button>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { WhatsappProductCard } from "./whatsapp-product-card";
import { WHATSAPP_PRODUCTS } from "@/config/whatsapp-products";
import { requestWhatsappConnectionAction } from "@/actions/whatsapp/request-connection";

/**
 * Tenant no longer enters Z-API credentials — they just say which
 * product(s) they want and which number to connect. A platform admin
 * provisions the real connection afterward from /admin/whatsapp.
 */
export function WhatsappProductRequestForm({ tenantSlug }: { tenantSlug: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function toggle(key: string, checked: boolean) {
    setSelected((prev) => (checked ? [...prev, key] : prev.filter((k) => k !== key)));
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    const result = await requestWhatsappConnectionAction(tenantSlug, {
      productKeys: selected,
      phoneNumber,
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
        <h2 className="text-lg font-medium">Solicitação recebida</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Nossa equipe vai configurar sua conexão em breve. Você pode acompanhar o status em{" "}
          <Link
            href={`/app/${tenantSlug}/modulos/whatsapp`}
            className="underline underline-offset-4 hover:text-foreground"
          >
            Módulos → WhatsApp
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        {WHATSAPP_PRODUCTS.map((product) => (
          <WhatsappProductCard
            key={product.key}
            product={product}
            checked={selected.includes(product.key)}
            onCheckedChange={(checked) => toggle(product.key, checked)}
          />
        ))}
      </div>

      <FieldGroup>
        <Field data-invalid={!!error}>
          <FieldLabel htmlFor="phoneNumber">Número do WhatsApp</FieldLabel>
          <Input
            id="phoneNumber"
            placeholder="5511999999999"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
          />
          <FieldError>{error}</FieldError>
        </Field>
      </FieldGroup>

      <Button
        onClick={handleSubmit}
        disabled={submitting || selected.length === 0 || !phoneNumber.trim()}
      >
        {submitting ? "Enviando…" : "Solicitar conexão"}
      </Button>
    </div>
  );
}

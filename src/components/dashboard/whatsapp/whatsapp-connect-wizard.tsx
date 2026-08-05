"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, FieldGroup, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { WizardSteps, type WizardStepKey } from "./wizard-steps";
import { SendTestMessageForm } from "./send-test-message-form";
import { testWhatsappConnectionAction } from "@/actions/whatsapp/test-connection";
import { createWhatsappConnectionAction } from "@/actions/whatsapp/create-connection";
import type { ChannelProviderDto } from "@/repositories/channel-provider.repository";
import type { ChannelConnectionSummary } from "@/repositories/channel-connection.repository";
import type { ConnectionTestStatus } from "@/lib/whatsapp/types";

const configSchema = z.object({
  connectionName: z.string().min(2, "Informe um nome para a conexão."),
  phoneNumber: z.string().min(8, "Informe o número do WhatsApp (DDI + DDD + número)."),
  apiUrl: z.string().min(1, "Informe a URL da instância."),
  apiToken: z.string().optional(),
});
type ConfigFormValues = z.infer<typeof configSchema>;

type TestState =
  | { phase: "idle" }
  | { phase: "testing" }
  | { phase: "done"; ok: boolean; status: ConnectionTestStatus; message: string };

const TEST_STATUS_LABEL: Record<ConnectionTestStatus, string> = {
  CONNECTED: "Conectado com sucesso.",
  AUTH_ERROR: "Erro de autenticação.",
  UNAVAILABLE: "Instância indisponível.",
  INVALID_TOKEN: "Token inválido.",
  ERROR: "Erro ao testar a conexão.",
};

export function WhatsappConnectWizard({
  tenantSlug,
  providers,
}: {
  tenantSlug: string;
  providers: ChannelProviderDto[];
}) {
  const [step, setStep] = useState<WizardStepKey>("provider");
  const [selectedProvider, setSelectedProvider] = useState<ChannelProviderDto | null>(
    providers.find((p) => p.isActive) ?? null
  );
  const [testState, setTestState] = useState<TestState>({ phase: "idle" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [connection, setConnection] = useState<ChannelConnectionSummary | null>(null);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<ConfigFormValues>({ resolver: zodResolver(configSchema) });

  async function handleTest(values: ConfigFormValues) {
    if (!selectedProvider) return;
    setTestState({ phase: "testing" });
    const result = await testWhatsappConnectionAction(tenantSlug, {
      providerKey: selectedProvider.key,
      apiUrl: values.apiUrl,
      apiToken: values.apiToken ?? "",
      phoneNumber: values.phoneNumber,
    });
    if (!result.success) {
      setTestState({ phase: "done", ok: false, status: "ERROR", message: result.error.message });
      return;
    }
    setTestState({
      phase: "done",
      ok: result.data.ok,
      status: result.data.status,
      message: result.data.message,
    });
  }

  async function handleSave() {
    if (!selectedProvider || testState.phase !== "done" || !testState.ok) return;
    setSaving(true);
    setSaveError(null);
    const values = getValues();
    const result = await createWhatsappConnectionAction(tenantSlug, {
      providerId: selectedProvider.id,
      connectionName: values.connectionName,
      phoneNumber: values.phoneNumber,
      apiUrl: values.apiUrl,
      apiToken: values.apiToken ?? "",
    });
    setSaving(false);
    if (!result.success) {
      setSaveError(result.error.message);
      return;
    }
    setConnection(result.data);
    setStep("summary");
  }

  return (
    <div className="max-w-2xl space-y-8">
      <Link
        href={`/app/${tenantSlug}/modulos/whatsapp`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        WhatsApp
      </Link>

      <WizardSteps current={step} />

      {step === "provider" && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-medium">Escolha o provedor</h2>
            <p className="text-sm text-muted-foreground">
              A conexão com o WhatsApp acontece através de um provedor. Novos provedores chegam em
              breve.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {providers.map((provider) => (
              <Card
                key={provider.id}
                onClick={() => provider.isActive && setSelectedProvider(provider)}
                className={cn(
                  "p-4",
                  provider.isActive ? "cursor-pointer" : "cursor-not-allowed opacity-60",
                  selectedProvider?.id === provider.id && "ring-2 ring-primary"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{provider.name}</p>
                  {!provider.isActive && <Badge variant="secondary">Em breve</Badge>}
                </div>
              </Card>
            ))}
          </div>
          <Button disabled={!selectedProvider} onClick={() => setStep("config")}>
            Continuar
          </Button>
        </div>
      )}

      {step === "config" && selectedProvider && (
        <form onSubmit={handleSubmit(handleTest)} noValidate className="space-y-6">
          <div>
            <h2 className="text-lg font-medium">Configuração da conexão</h2>
            <p className="text-sm text-muted-foreground">
              Provedor selecionado: {selectedProvider.name}
            </p>
          </div>

          <FieldGroup>
            <Field data-invalid={!!errors.connectionName}>
              <FieldLabel htmlFor="connectionName">Nome da conexão</FieldLabel>
              <Input
                id="connectionName"
                placeholder="Atendimento principal"
                {...register("connectionName")}
              />
              <FieldError errors={[errors.connectionName]} />
            </Field>
            <Field data-invalid={!!errors.phoneNumber}>
              <FieldLabel htmlFor="phoneNumber">Número do WhatsApp</FieldLabel>
              <Input id="phoneNumber" placeholder="5511999999999" {...register("phoneNumber")} />
              <FieldError errors={[errors.phoneNumber]} />
            </Field>
            <Field data-invalid={!!errors.apiUrl}>
              <FieldLabel htmlFor="apiUrl">URL da instância</FieldLabel>
              <Input
                id="apiUrl"
                placeholder="https://api.z-api.io/instances/xxxx/token/yyyy"
                {...register("apiUrl")}
              />
              <FieldError errors={[errors.apiUrl]} />
            </Field>
            <Field data-invalid={!!errors.apiToken}>
              <FieldLabel htmlFor="apiToken">Token da API</FieldLabel>
              <Input id="apiToken" type="password" placeholder="Opcional" {...register("apiToken")} />
              <FieldDescription>
                Token de segurança da conta (Client-Token), se ativado no seu provedor.
              </FieldDescription>
              <FieldError errors={[errors.apiToken]} />
            </Field>
          </FieldGroup>

          <div className="space-y-3">
            <Button type="submit" variant="outline" disabled={testState.phase === "testing"}>
              {testState.phase === "testing" ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Conectando…
                </>
              ) : (
                "Testar conexão"
              )}
            </Button>

            {testState.phase === "done" && (
              <p
                className={cn(
                  "flex items-center gap-1.5 text-sm",
                  testState.ok ? "text-success" : "text-destructive"
                )}
                aria-live="polite"
              >
                {testState.ok ? (
                  <CheckCircle2 className="size-4 shrink-0" />
                ) : (
                  <XCircle className="size-4 shrink-0" />
                )}
                {testState.message || TEST_STATUS_LABEL[testState.status]}
              </p>
            )}
          </div>

          {saveError && <p className="text-sm text-destructive">{saveError}</p>}

          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => setStep("provider")}>
              Voltar
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={testState.phase !== "done" || !testState.ok || saving}
            >
              {saving ? "Salvando…" : "Concluir"}
            </Button>
          </div>
        </form>
      )}

      {step === "summary" && connection && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-medium">Conexão concluída</h2>
            <p className="text-sm text-muted-foreground">
              O WhatsApp da sua empresa está pronto para enviar mensagens.
            </p>
          </div>

          <Card className="p-6">
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Nome da conexão</dt>
                <dd className="font-medium">{connection.connectionName}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Número conectado</dt>
                <dd className="font-medium">{connection.phoneNumber}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Provedor</dt>
                <dd className="font-medium">{connection.provider.name}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Status</dt>
                <dd className="font-medium text-success">Conectado</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Data da conexão</dt>
                <dd className="font-medium">
                  {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(
                    new Date(connection.createdAt)
                  )}
                </dd>
              </div>
            </dl>
          </Card>

          <SendTestMessageForm tenantSlug={tenantSlug} connectionId={connection.id} />

          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={`/app/${tenantSlug}/modulos/whatsapp`} />}
          >
            Ir para gerenciamento
          </Button>
        </div>
      )}
    </div>
  );
}

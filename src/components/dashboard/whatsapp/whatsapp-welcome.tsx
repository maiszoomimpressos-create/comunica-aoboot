import Link from "next/link";
import { MessageCircle, QrCode, KeyRound, Code2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const STEPS = [
  {
    icon: QrCode,
    title: "1. Conecte o WhatsApp da empresa",
    description: "Escaneie um QR code com o celular que vai enviar as mensagens. Leva menos de um minuto.",
  },
  {
    icon: KeyRound,
    title: "2. Gere sua chave de API",
    description: "Depois de conectado, gere uma chave — é ela que autoriza seu sistema a disparar mensagens por aqui.",
  },
  {
    icon: Code2,
    title: "3. Chame nossa API do seu sistema",
    description:
      "Sempre que algo acontecer (uma compra, um ingresso, um agendamento), seu sistema chama nossa API com essa chave e a gente envia a mensagem pro cliente.",
  },
];

export function WhatsappWelcome({ tenantSlug }: { tenantSlug: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border py-12 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10">
        <MessageCircle className="size-6 text-primary" />
      </div>
      <h2 className="mt-4 text-lg font-medium">Envie mensagens automáticas no WhatsApp</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Avise seus clientes por WhatsApp assim que algo acontecer no seu sistema — compra
        aprovada, ingresso emitido, comprovante de estacionamento, agendamento confirmado, entre
        outros. Você chama nossa API, a gente escreve e envia a mensagem certa.
      </p>

      <div className="mx-auto mt-8 grid max-w-2xl gap-4 px-6 text-left sm:grid-cols-3">
        {STEPS.map((step) => (
          <div key={step.title} className="rounded-lg border border-border bg-muted/40 p-4">
            <step.icon className="size-5 text-primary" />
            <p className="mt-2 text-sm font-medium">{step.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{step.description}</p>
          </div>
        ))}
      </div>

      <Button
        className="mt-8"
        nativeButton={false}
        render={<Link href={`/app/${tenantSlug}/modulos/whatsapp/conectar`} />}
      >
        Conectar WhatsApp
      </Button>
    </div>
  );
}

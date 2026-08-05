import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function WhatsappWelcome({ tenantSlug }: { tenantSlug: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
        <MessageCircle className="size-6 text-primary" />
      </div>
      <h2 className="mt-4 text-lg font-medium">Nenhum canal WhatsApp configurado</h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Conecte o WhatsApp da sua empresa para começar a enviar mensagens automáticas aos seus
        clientes.
      </p>
      <Button
        className="mt-6"
        nativeButton={false}
        render={<Link href={`/app/${tenantSlug}/modulos/whatsapp/conectar`} />}
      >
        Conectar WhatsApp
      </Button>
    </div>
  );
}

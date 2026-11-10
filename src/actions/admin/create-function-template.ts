"use server";

import { z } from "zod";
import { definePlatformAction } from "@/lib/server/actions/define-platform-action";
import { createFunctionTemplateForPlatform } from "@/services/function-template.service";

const nicheEnum = z.enum(["EVENTOS_INGRESSOS", "ESTACIONAMENTO", "MOBILIDADE_CORRIDAS", "GENERICO_2FA"]);

const schema = z.object({
  key: z.string().min(1, "Informe um identificador."),
  label: z.string().min(1, "Informe um nome."),
  description: z.string().min(1, "Informe uma descrição."),
  fields: z.array(
    z.object({
      key: z.string().min(1),
      label: z.string().min(1),
      description: z.string().optional(),
      required: z.boolean().optional(),
    })
  ),
  messageTemplate: z.string().min(1, "Informe o texto da mensagem."),
  requiresQr: z.boolean(),
  niches: z.array(nicheEnum),
  greetingStyle: z.enum(["FIXO", "HORARIO"]),
  greetingNameSource: z.enum(["PERFIL_WHATSAPP", "CADASTRO"]),
});

export const createFunctionTemplateAction = definePlatformAction(
  async (_user, input: z.infer<typeof schema>) => {
    const parsed = schema.parse(input);
    await createFunctionTemplateForPlatform(parsed);
    return { ok: true };
  }
);

import { generateObject } from "ai";
import { z } from "zod";
import { resolveModel } from "@/lib/ai/resolve-model";
import { peekAiAttendantModel } from "@/repositories/ai-attendant-settings.repository";
import type { CustomNotificationField } from "@/repositories/custom-notification-type.repository";

const fieldSchema = z.object({
  key: z.string().describe("snake_case, sem acento, identifica o campo tecnicamente"),
  label: z.string().describe("rótulo curto em português pra mostrar ao tenant"),
  description: z
    .string()
    .optional()
    .describe("Legenda curta opcional — só quando não for óbvio pelo label."),
  required: z
    .boolean()
    .describe(
      'true por padrão. Só marque false quando o pedido indicar que o dado pode não vir em todo disparo (ex: "opcional", "quando tiver"). Campo false faz a linha inteira que usa {{chave}} sumir quando o valor não for enviado.'
    ),
  valueType: z
    .enum(["texto", "numero", "moeda", "data_hora"])
    .describe("texto = frase livre; numero = quantidade ou medida; moeda = valor em dinheiro; data_hora = data e/ou horario."),
});

const additionSchema = z.object({
  newFields: z.array(fieldSchema).default([]),
  newLines: z
    .array(z.string())
    .default([])
    .describe("Somente as linhas NOVAS a inserir no template, uma informação por linha, no formato *Rótulo:* {{chave}}. Nunca devolva o template inteiro."),
  insertAfterFieldKey: z
    .string()
    .nullable()
    .optional()
    .describe("Chave de um campo JÁ EXISTENTE depois do qual os novos campos e linhas devem entrar. Use null só se não houver âncora clara."),
  insertAfterLine: z
    .string()
    .nullable()
    .optional()
    .describe("Cópia exata de uma linha já existente depois da qual inserir, se não houver insertAfterFieldKey."),
  positionNote: z.string().describe("Frase curta em português explicando onde o acréscimo entra, para o usuário revisar."),
});

const editSchema = z.object({
  fieldUpdates: z
    .array(
      z.object({
        key: z.string().describe("Chave de um campo que JÁ existe e deve ser alterado"),
        label: z.string().optional(),
        description: z.string().nullable().optional(),
        required: z.boolean().optional(),
        valueType: z.enum(["texto", "numero", "moeda", "data_hora"]).optional(),
      })
    )
    .default([]),
  newFields: z.array(fieldSchema).default([]).describe("Só campos realmente novos. Não repita campos existentes."),
  lineReplacements: z
    .array(
      z.object({
        from: z.string().describe("Cópia EXATA de uma linha atual que deve ser trocada"),
        to: z.string().describe("A linha no lugar dela"),
      })
    )
    .default([]),
  lineInsertions: z
    .array(
      z.object({
        afterFieldKey: z.string().nullable().optional(),
        afterLine: z.string().nullable().optional(),
        lines: z.array(z.string()).min(1),
      })
    )
    .default([]),
  lineDeletions: z
    .array(z.string())
    .default([])
    .describe("Cópia exata de linhas atuais a remover, só se o usuário pediu para tirar."),
  positionNote: z.string().describe("Frase curta em português resumindo o que muda, para o usuário revisar."),
});

export type GeneratedAddition = z.infer<typeof additionSchema>;
export type GeneratedEditPatch = z.infer<typeof editSchema>;

function currentFunctionContext(fields: CustomNotificationField[], messageTemplate: string): string {
  return JSON.stringify(
    {
      fields: fields.map((f) => ({
        key: f.key,
        label: f.label,
        required: f.required,
        valueType: f.valueType ?? "texto",
        description: f.description,
      })),
      messageTemplate,
    },
    null,
    2
  );
}

async function model() {
  const configuredModel = (await peekAiAttendantModel()) ?? "anthropic/claude-haiku-5.5";
  return resolveModel(configuredModel);
}

/** A IA devolve SÓ o acréscimo. O merge no código é quem insere no texto atual. */
export async function generateCustomNotificationAddition(input: {
  prompt: string;
  fields: CustomNotificationField[];
  messageTemplate: string;
}): Promise<GeneratedAddition> {
  const { object } = await generateObject({
    model: await model(),
    schema: additionSchema,
    prompt: `O usuário quer ACRESCENTAR algo a uma função de mensagem automática de WhatsApp já existente.
Peça do usuário: "${input.prompt}"

Função atual (contexto — NÃO reescreva nada disto):
${currentFunctionContext(input.fields, input.messageTemplate)}

Regras obrigatórias:
- Devolva APENAS campos novos e APENAS as linhas novas do template, mais a posição sugerida (insertAfterFieldKey ou insertAfterLine, copiando uma chave ou linha que já existe).
- NÃO devolva o template completo. NÃO altere campos ou linhas que já existem. NÃO repita o que já está na função.
- Uma informação por linha, no formato *Rótulo:* {{chave}}. Pode usar *texto* para negrito do WhatsApp.
- Todo dado variável novo deve ser um campo declarado em newFields e referenciado como {{chave}}.
- Não declare nome_empresa como campo — use {{nome_empresa}} se precisar citar o negócio.
- Só marque required=false quando o pedido deixar claro que o dado pode faltar.`,
  });
  return object;
}

/** A IA devolve um patch estruturado. Só as linhas/campos indicados são alterados no código. */
export async function generateCustomNotificationEditPatch(input: {
  prompt: string;
  fields: CustomNotificationField[];
  messageTemplate: string;
}): Promise<GeneratedEditPatch> {
  const { object } = await generateObject({
    model: await model(),
    schema: editSchema,
    prompt: `O usuário quer EDITAR um trecho de uma função de mensagem automática de WhatsApp já existente.
Peça do usuário: "${input.prompt}"

Função atual (contexto — só altere o que foi pedido):
${currentFunctionContext(input.fields, input.messageTemplate)}

Regras obrigatórias:
- Devolva um PATCH: fieldUpdates só para campos existentes citados, lineReplacements com a cópia EXATA da linha atual em "from", lineInsertions/newFields só para acréscimos, lineDeletions só se o usuário pediu para remover.
- NÃO devolva o template completo. NÃO inclua no patch linhas ou campos que devem permanecer iguais.
- Em lineReplacements.from use o texto exato da linha atual, incluindo espaços e markdown.
- Não declare nome_empresa como campo — use {{nome_empresa}} se precisar citar o negócio.`,
  });
  return object;
}

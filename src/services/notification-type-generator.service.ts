import { generateObject } from "ai";
import { z } from "zod";
import { resolveModel } from "@/lib/ai/resolve-model";
import { peekAiAttendantModel } from "@/repositories/ai-attendant-settings.repository";
import type { CustomGreetingStyle, CustomGreetingNameSource } from "@/generated/prisma/client";

const draftSchema = z.object({
  fields: z
    .array(
      z.object({
        key: z.string().describe("snake_case, sem acento, identifica o campo tecnicamente"),
        label: z.string().describe("rótulo curto em português pra mostrar ao tenant"),
        description: z
          .string()
          .optional()
          .describe(
            "Legenda curta opcional explicando pra que serve o campo — só quando não for óbvio pelo label."
          ),
        required: z
          .boolean()
          .describe(
            'true por padrão. Só marque false quando o tenant indicar explicitamente que esse dado pode não vir em todo disparo (ex: "opcional", "nem sempre", "quando tiver", "ainda estou desenvolvendo isso", "pode não vir preenchido"). Campo false faz a linha inteira da mensagem que usa {{chave}} sumir quando o valor não for enviado — nunca marque false em campos centrais ao evento (ex: valor, nome do motorista) só porque não foram citados como opcionais.'
          ),
        valueType: z
          .enum(["texto", "numero", "moeda", "data_hora"])
          .describe(
            "texto = frase livre; numero = quantidade ou medida; moeda = valor em dinheiro; data_hora = data e/ou horario. Escolha pelo significado do campo, nao pelo nicho do negocio."
          ),
      })
    )
    .min(1),
  messageTemplate: z
    .string()
    .describe(
      'Corpo da mensagem em português natural usando {{chave}} pra cada campo — SEM saudação nem assinatura (isso é adicionado automaticamente). FORMATO OBRIGATÓRIO, uma informação por linha, com quebras de linha reais (caractere newline, não o texto \\n): (1) frase(s) de abertura sozinhas no começo; (2) uma linha em branco; (3) cada dado em sua própria linha no formato *Rótulo:* {{chave}}; (4) se houver frase que introduz um link ("acesse:", "para acompanhar"), ela vai sozinha, com uma linha em branco antes; (5) uma linha em branco; (6) frase de encerramento ("Volte sempre!") sozinha no final. Pode usar *texto* pra negrito do WhatsApp. Nunca junte vários *Rótulo:* na mesma linha, nunca faça um parágrafo único, nunca use lista com tópicos ("- Isso: {{algo}}"). CRÍTICO: todo dado que varia de um disparo pro outro (data, hora, nome, valor, duração, distância, qualquer coisa específica daquele evento) TEM que ser um campo declarado em `fields` e referenciado como {{chave}} — nunca escreva um valor de exemplo fixo no texto (ex: nunca "06/11/2026 às 12:05" ou "R$ 9,55" direto no corpo; sempre {{data}}, {{valor}}). Um texto com dado inventado fixo é inútil, porque vai sair igual em toda mensagem real. Exceção: pra citar o nome do negócio/empresa, use sempre o placeholder reservado {{nome_empresa}} — é preenchido automaticamente a partir da conexão, NUNCA declare "nome_empresa" (ou similar) como campo em `fields`.'
    ),
  greetingStyle: z
    .enum(["FIXO", "HORARIO"])
    .describe(
      'FIXO = "Olá, {nome}!" sempre igual. HORARIO = "Bom dia/Boa tarde/Boa noite, {nome}!" variando pelo horário do envio — use HORARIO só quando o tenant pedir explicitamente algo do tipo "bom dia, boa tarde, boa noite dependendo do horário"; caso contrário FIXO.'
    ),
  greetingNameSource: z
    .enum(["PERFIL_WHATSAPP", "CADASTRO"])
    .describe(
      "PERFIL_WHATSAPP = usa o nome do perfil do WhatsApp da pessoa (pode vir vazio/estranho). CADASTRO = usa o nome que o sistema que chama a API registrou pro destinatário (sempre preenchido, mais confiável) — use CADASTRO quando o tenant mencionar algo como 'nome do passageiro/cliente cadastrado' explicitamente; caso contrário PERFIL_WHATSAPP."
    ),
});

export interface NotificationTypeDraft {
  fields: { key: string; label: string; description?: string; required: boolean; valueType: "texto" | "numero" | "moeda" | "data_hora" }[];
  messageTemplate: string;
  greetingStyle: CustomGreetingStyle;
  greetingNameSource: CustomGreetingNameSource;
}

/** Transforma a descrição livre que o tenant digitou (ex: "hora inicial,
 * destino, tarifa, nome do motorista") num rascunho estruturado — campos +
 * texto de mensagem — que ele revisa e edita antes de salvar como função
 * personalizada (ver create-custom-notification-type.ts). Usa resolveModel
 * (lib/ai/resolve-model.ts) — mesmo escape hatch já usado em
 * bot-attendant.service.ts pra chamar a Anthropic direto quando
 * ANTHROPIC_API_KEY está configurada, em vez de depender do AI Gateway
 * (confirmado em produção: a conta do Gateway é free tier e bloqueia esse
 * modelo). Primeiro uso de generateObject no repo. */
export async function generateCustomNotificationTypeDraft(
  description: string
): Promise<NotificationTypeDraft> {
  const configuredModel = (await peekAiAttendantModel()) ?? "anthropic/claude-haiku-5.5";
  const { object } = await generateObject({
    model: resolveModel(configuredModel),
    schema: draftSchema,
    prompt: `O tenant descreveu o que quer mandar numa mensagem automatica de WhatsApp: "${description}". Extraia os campos de dados variaveis e monte o texto da mensagem. Sirva qualquer tipo de evento (compra, servico concluido, viagem, agendamento, etc.) sem inventar campos de um nicho que o tenant nao pediu. Todo dado que muda a cada disparo deve ser um campo com {{chave}} e um valueType adequado (texto, numero, moeda ou data_hora). O messageTemplate DEVE vir com uma informacao por linha: abertura, linha em branco, cada *Rotulo:* {{chave}} em linha propria, linha em branco ao redor de frases de link, linha em branco, encerramento. Use quebras de linha de verdade.`,
  });
  return object;
}

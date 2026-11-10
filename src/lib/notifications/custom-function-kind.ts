/**
 * Tipo de função base de uma função personalizada. Todas usam o mesmo
 * motor genérico de notificação; isto só agrupa visualmente os vários usos
 * (ex.: "Corrida concluída MAI Drive" -> "Notificação de conclusão").
 * Derivado do identificador/título/descrição; nada fica gravado no banco.
 */
export interface CustomFunctionKind {
  id: string;
  label: string;
}

const KINDS: (CustomFunctionKind & { pattern: RegExp })[] = [
  { id: "conclusao", label: "Notificação de conclusão", pattern: /conclu|finaliz|termin|encerr|corrida|entregue|pronto/ },
  { id: "compra", label: "Confirmação de compra", pattern: /compra|pedido|pagamento|pago|ingresso|venda|fatura|boleto|pix/ },
  { id: "agendamento", label: "Agendamento e lembrete", pattern: /agend|consulta|reserva|lembrete|horario|visita/ },
  { id: "verificacao", label: "Código de verificação", pattern: /codigo|verifica|2fa|otp|token|senha/ },
  { id: "status", label: "Atualização de status", pattern: /status|saiu|caminho|chegou|enviado|despach|aprovad|cancel/ },
];

export const FALLBACK_CUSTOM_FUNCTION_KIND: CustomFunctionKind = {
  id: "personalizada",
  label: "Notificação personalizada",
};

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function getCustomFunctionKind(type: { key: string; label: string; description?: string | null }): CustomFunctionKind {
  const primary = normalize(type.key + " " + type.label);
  const secondary = normalize(type.description ?? "");
  const match = KINDS.find((k) => k.pattern.test(primary)) ?? KINDS.find((k) => k.pattern.test(secondary));
  return match ? { id: match.id, label: match.label } : FALLBACK_CUSTOM_FUNCTION_KIND;
}

export function groupCustomTypesByKind<T extends { key: string; label: string; description?: string | null }>(
  types: T[]
): { kind: CustomFunctionKind; items: T[] }[] {
  const groups = new Map<string, { kind: CustomFunctionKind; items: T[] }>();
  for (const type of types) {
    const kind = getCustomFunctionKind(type);
    const group = groups.get(kind.id) ?? { kind, items: [] };
    group.items.push(type);
    groups.set(kind.id, group);
  }
  return [...groups.values()];
}

import type { FormFieldType } from "./types";

export interface FormFieldValidationResult {
  valid: boolean;
  /** Valor normalizado a salvar na variável — só presente quando `valid`. */
  normalized?: string;
  /** Mensagem pra reenviar ao contato junto com o campo, só quando inválido. */
  error?: string;
}

function isValidCpf(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false; // 11111111111 etc. — formalmente "válido" pelo checksum, mas sempre falso
  const checkDigit = (base: string, firstFactor: number): number => {
    let sum = 0;
    let factor = firstFactor;
    for (const char of base) sum += Number(char) * factor--;
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  const d1 = checkDigit(digits.slice(0, 9), 10);
  const d2 = checkDigit(digits.slice(0, 9) + d1, 11);
  return digits.endsWith(`${d1}${d2}`);
}

function isValidCalendarDate(day: number, month: number, year: number): boolean {
  if (month < 1 || month > 12) return false;
  if (year < 1900 || year > 2100) return false;
  const daysInMonth = new Date(year, month, 0).getDate();
  return day >= 1 && day <= daysInMonth;
}

/** Valida/normaliza a resposta de um campo de nó `form` de acordo com o seu
 * `fieldType` (ver flow-engine.service.ts) — chamado uma vez por resposta,
 * nunca lança: qualquer entrada que não bate com o formato esperado volta
 * `{ valid: false, error }` pra o motor reenviar o campo com a mensagem. */
export function validateFormField(fieldType: FormFieldType, rawText: string): FormFieldValidationResult {
  const text = rawText.trim();

  if (fieldType === "text") {
    if (!text) return { valid: false, error: "Não entendi, pode escrever de novo?" };
    return { valid: true, normalized: text };
  }

  if (fieldType === "email") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
      return { valid: false, error: "Esse e-mail não parece válido. Pode conferir e mandar de novo?" };
    }
    return { valid: true, normalized: text.toLowerCase() };
  }

  if (fieldType === "number") {
    const normalized = text.replace(/\./g, "").replace(",", ".");
    if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
      return { valid: false, error: "Preciso de um número aqui. Pode mandar de novo?" };
    }
    return { valid: true, normalized };
  }

  if (fieldType === "phone") {
    const digits = text.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 11) {
      return { valid: false, error: "Esse telefone não parece válido — manda com DDD, só números." };
    }
    return { valid: true, normalized: digits };
  }

  if (fieldType === "cpf") {
    if (!isValidCpf(text)) {
      return { valid: false, error: "Esse CPF não parece válido. Pode conferir e mandar de novo?" };
    }
    return { valid: true, normalized: text.replace(/\D/g, "") };
  }

  if (fieldType === "date") {
    const match = text.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/);
    if (!match) {
      return { valid: false, error: "Manda a data no formato DD/MM/AAAA, por favor." };
    }
    const [, d, m, y] = match;
    const day = Number(d);
    const month = Number(m);
    const year = Number(y);
    if (!isValidCalendarDate(day, month, year)) {
      return { valid: false, error: "Essa data não parece válida. Pode conferir e mandar de novo?" };
    }
    return { valid: true, normalized: `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}` };
  }

  return { valid: false, error: "Não consegui validar esse campo." };
}

import { normalizeBrazilianMobile } from "@/lib/whatsapp/phone-format";

export interface ParsedContactRow {
  phone: string;
  name: string | null;
}

export interface ParseContactsCsvResult {
  contacts: ParsedContactRow[];
  skipped: number;
}

const PHONE_HEADER_RE = /telefone|celular|whatsapp|phone|numero|n[uú]mero|number/i;
const NAME_HEADER_RE = /nome|name/i;

function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === delimiter) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells.map((c) => c.trim());
}

/** Excel BR exporta CSV com `;` (porque `,` já é o separador decimal do
 * locale); planilhas "internacionais"/Google Contacts usam `,`. Conta qual
 * aparece mais na primeira linha em vez de assumir um dos dois. */
function detectDelimiter(firstLine: string): string {
  const commas = (firstLine.match(/,/g) || []).length;
  const semicolons = (firstLine.match(/;/g) || []).length;
  return semicolons > commas ? ";" : ",";
}

function looksLikePhone(value: string): boolean {
  return value.replace(/\D/g, "").length >= 8;
}

/** Normaliza pra E.164 BR: adiciona o DDI 55 quando o número veio só com
 * DDD (10 ou 11 dígitos, caso comum de agenda pessoal/Excel sem o país) e
 * então reaplica normalizeBrazilianMobile pra restaurar o 9º dígito quando
 * faltar — mesma regra já usada pro fromPhone do Z-API (ver phone-format.ts). */
function toE164Br(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("55")) return normalizeBrazilianMobile(digits);
  if (digits.length === 10 || digits.length === 11) {
    return normalizeBrazilianMobile(`55${digits}`);
  }
  return digits;
}

/**
 * Parseia um CSV de contatos (telefone + nome opcional), tolerante aos dois
 * delimitadores que Excel/Google Contacts realmente exportam e a um
 * cabeçalho opcional — reconhecido pelo nome da coluna (telefone/phone/
 * nome/name) quando presente, ou por posição (telefone na 1ª coluna, nome
 * na 2ª) quando não. Linhas sem nada que pareça telefone são descartadas e
 * contadas em `skipped` em vez de derrubar a importação inteira; telefones
 * duplicados no arquivo são deduplicados silenciosamente.
 */
export function parseContactsCsv(csvText: string): ParseContactsCsvResult {
  const lines = csvText
    .split(/\r\n|\r|\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return { contacts: [], skipped: 0 };

  const delimiter = detectDelimiter(lines[0]);
  const rows = lines.map((line) => splitCsvLine(line, delimiter));

  const header = rows[0];
  const headerHasPhoneWord = header.some((cell) => PHONE_HEADER_RE.test(cell));
  const firstCellLooksLikeData = looksLikePhone(header[0] ?? "");

  let phoneIndex = 0;
  let nameIndex: number | null = header.length > 1 ? 1 : null;
  let startRow = 0;

  if (headerHasPhoneWord || !firstCellLooksLikeData) {
    const foundPhoneIndex = header.findIndex((cell) => PHONE_HEADER_RE.test(cell));
    const foundNameIndex = header.findIndex((cell) => NAME_HEADER_RE.test(cell));
    phoneIndex = foundPhoneIndex >= 0 ? foundPhoneIndex : 0;
    nameIndex = foundNameIndex >= 0 ? foundNameIndex : header.length > 1 ? 1 : null;
    startRow = 1;
  }

  const contacts: ParsedContactRow[] = [];
  const seen = new Set<string>();
  let skipped = 0;

  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    const rawPhone = row[phoneIndex] ?? "";
    if (!looksLikePhone(rawPhone)) {
      skipped++;
      continue;
    }
    const phone = toE164Br(rawPhone);
    if (phone.length < 10 || seen.has(phone)) {
      if (!seen.has(phone)) skipped++;
      continue;
    }
    seen.add(phone);
    const name = nameIndex !== null ? row[nameIndex]?.trim() || null : null;
    contacts.push({ phone, name });
  }

  return { contacts, skipped };
}

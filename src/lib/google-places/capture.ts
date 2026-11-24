/**
 * Prévia da captação do Google → contatos. Puro (sem I/O), usado no
 * servidor (busca e de novo no salvar) e testado em
 * tests/google-places/capture.test.ts.
 *
 * Regras:
 * - telefone normalizado pra 55 + DDD + número (classifyBrazilianPhone);
 * - quem está em opt-out da empresa (tenant_opt_out / contato com
 *   optedOut) NUNCA entra — nem aparece na prévia, só no contador;
 * - telefone repetido na mesma busca (filiais com o mesmo número) entra
 *   uma vez só;
 * - já é contato da empresa → aparece marcado "já é contato" e desmarcado
 *   (não vira contato frio; se marcar, entra na lista como está);
 * - fixo → desmarcado por padrão (fixo raramente tem WhatsApp; o envio
 *   ainda confere com phone-exists antes de mandar);
 * - sem telefone ou telefone que não dá pra usar (0800, exterior) → fora.
 */
import { phoneKey } from "@/lib/whatsapp/phone-sanitize";
import { classifyBrazilianPhone, type BrPhoneKind, type PlaceResult } from "./places";

export interface CapturePreviewRow {
  placeId: string;
  name: string;
  phone: string;
  phoneKind: BrPhoneKind;
  /** Exibido só na prévia — não é gravado (termos da Google). */
  displayPhone: string;
  address: string | null;
  category: string | null;
  googleMapsUri: string | null;
  websiteUri: string | null;
  alreadyContact: boolean;
  selectedByDefault: boolean;
}

export interface CapturePreview {
  rows: CapturePreviewRow[];
  totalFound: number;
  skippedNoPhone: number;
  skippedOptOut: number;
  skippedDuplicate: number;
}

export function buildCapturePreview(
  places: PlaceResult[],
  existingPhoneKeys: ReadonlySet<string>,
  optedOutPhoneKeys: ReadonlySet<string>
): CapturePreview {
  const rows: CapturePreviewRow[] = [];
  const seen = new Set<string>();
  let skippedNoPhone = 0;
  let skippedOptOut = 0;
  let skippedDuplicate = 0;

  for (const place of places) {
    const classified = classifyBrazilianPhone(place.nationalPhone, place.internationalPhone);
    if (!classified) {
      skippedNoPhone++;
      continue;
    }
    const key = phoneKey(classified.phone);
    if (optedOutPhoneKeys.has(key)) {
      skippedOptOut++;
      continue;
    }
    if (seen.has(key)) {
      skippedDuplicate++;
      continue;
    }
    seen.add(key);
    const alreadyContact = existingPhoneKeys.has(key);
    rows.push({
      placeId: place.placeId,
      name: place.name,
      phone: classified.phone,
      phoneKind: classified.kind,
      displayPhone: place.nationalPhone ?? place.internationalPhone ?? classified.phone,
      address: place.address,
      category: place.categoryLabel ?? place.primaryType,
      googleMapsUri: place.googleMapsUri,
      websiteUri: place.websiteUri,
      alreadyContact,
      selectedByDefault: classified.kind === "mobile" && !alreadyContact,
    });
  }

  return { rows, totalFound: places.length, skippedNoPhone, skippedOptOut, skippedDuplicate };
}

export interface CaptureSaveItem {
  placeId: string;
  name: string;
  phone: string;
}

export interface CaptureSavePlan {
  /** Novos contatos frios (source google_places). */
  toCreate: (CaptureSaveItem & { phoneKind: BrPhoneKind })[];
  /** Telefones que já são contato desta conexão — só entram na lista. */
  existingPhones: string[];
  skippedInvalid: number;
  skippedOptOut: number;
}

/** Revalida no servidor o que o navegador mandou salvar (nunca confia no
 * cliente): telefone de novo pelo classificador, opt-out de novo, dedupe. */
export function planCaptureSave(
  items: CaptureSaveItem[],
  existingPhonesOnConnection: ReadonlyMap<string, string>,
  optedOutPhoneKeys: ReadonlySet<string>
): CaptureSavePlan {
  const toCreate: CaptureSavePlan["toCreate"] = [];
  const existingPhones: string[] = [];
  const seen = new Set<string>();
  let skippedInvalid = 0;
  let skippedOptOut = 0;
  for (const item of items) {
    // O telefone já vem normalizado (55...) da prévia; reclassifica como
    // "internacional" pra garantir o formato e o tipo.
    const classified = classifyBrazilianPhone(null, `+${item.phone.replace(/\D/g, "")}`);
    const name = item.name.trim().slice(0, 200);
    if (!classified || !item.placeId.trim() || !name) {
      skippedInvalid++;
      continue;
    }
    const key = phoneKey(classified.phone);
    if (optedOutPhoneKeys.has(key)) {
      skippedOptOut++;
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    const existing = existingPhonesOnConnection.get(key);
    if (existing) {
      existingPhones.push(existing);
      continue;
    }
    toCreate.push({ placeId: item.placeId.trim(), name, phone: classified.phone, phoneKind: classified.kind });
  }
  return { toCreate, existingPhones, skippedInvalid, skippedOptOut };
}

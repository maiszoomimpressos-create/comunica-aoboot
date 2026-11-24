import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCapturePreview, planCaptureSave } from "@/lib/google-places/capture";
import type { PlaceResult } from "@/lib/google-places/places";
import { phoneKey } from "@/lib/whatsapp/phone-sanitize";

function place(id: string, national: string | null, name = `Empresa ${id}`): PlaceResult {
  return {
    placeId: id,
    name,
    address: "Centro, Curitiba - PR",
    nationalPhone: national,
    internationalPhone: null,
    primaryType: "restaurant",
    categoryLabel: "Restaurante",
    types: [],
    websiteUri: null,
    googleMapsUri: null,
  };
}

test("prévia: celular marcado, fixo desmarcado, sem telefone fora", () => {
  const preview = buildCapturePreview(
    [place("cel", "(41) 99111-2222"), place("fixo", "(41) 3333-4444"), place("sem", null), place("0800", "0800 777 0000")],
    new Set(),
    new Set()
  );
  assert.equal(preview.totalFound, 4);
  assert.equal(preview.skippedNoPhone, 2);
  assert.deepEqual(
    preview.rows.map((r) => [r.placeId, r.phone, r.phoneKind, r.selectedByDefault]),
    [
      ["cel", "5541991112222", "mobile", true],
      ["fixo", "554133334444", "landline", false],
    ]
  );
});

test("prévia: opt-out da empresa NUNCA aparece (com ou sem o 9º dígito)", () => {
  const optedOut = new Set([phoneKey("554191112222")]); // salvo sem o 9
  const preview = buildCapturePreview([place("a", "(41) 99111-2222"), place("b", "(41) 99999-0000")], new Set(), optedOut);
  assert.equal(preview.skippedOptOut, 1);
  assert.deepEqual(preview.rows.map((r) => r.placeId), ["b"]);
});

test("prévia: dedupe com contatos existentes e dentro da própria busca", () => {
  const existing = new Set([phoneKey("5541991112222")]);
  const preview = buildCapturePreview(
    [place("a", "(41) 99111-2222"), place("b", "(41) 99999-0000"), place("filial", "(41) 99999-0000")],
    existing,
    new Set()
  );
  assert.equal(preview.skippedDuplicate, 1);
  const a = preview.rows.find((r) => r.placeId === "a")!;
  assert.equal(a.alreadyContact, true);
  assert.equal(a.selectedByDefault, false);
  assert.equal(preview.rows.find((r) => r.placeId === "b")!.selectedByDefault, true);
});

test("salvar: revalida no servidor — opt-out, inválido, repetido e já existente", () => {
  const optedOut = new Set([phoneKey("5541988887777")]);
  const existing = new Map([[phoneKey("5541977776666"), "554177776666"]]); // salvo sem o 9
  const plan = planCaptureSave(
    [
      { placeId: "ok", name: "Hotel Central", phone: "5541991112222" },
      { placeId: "fixo", name: "Oficina", phone: "554133334444" },
      { placeId: "opt", name: "Saiu", phone: "5541988887777" },
      { placeId: "dup", name: "Hotel Central filial", phone: "5541991112222" },
      { placeId: "existe", name: "Já cliente", phone: "5541977776666" },
      { placeId: "lixo", name: "X", phone: "123" },
      { placeId: "", name: "sem id", phone: "5541990001111" },
    ],
    existing,
    optedOut
  );
  assert.deepEqual(
    plan.toCreate.map((c) => [c.placeId, c.phone, c.phoneKind]),
    [
      ["ok", "5541991112222", "mobile"],
      ["fixo", "554133334444", "landline"],
    ]
  );
  assert.deepEqual(plan.existingPhones, ["554177776666"]);
  assert.equal(plan.skippedOptOut, 1);
  assert.equal(plan.skippedInvalid, 2);
});

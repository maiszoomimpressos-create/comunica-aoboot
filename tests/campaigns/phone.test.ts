import { test } from "node:test";
import assert from "node:assert/strict";
import { phoneKey, phoneVariants, sanitizeWhatsappPhone } from "@/lib/whatsapp/phone-sanitize";
import { normalizeCsvPhone, parseContactsCsv } from "@/lib/csv/parse-contacts-csv";

test("sanitizeWhatsappPhone recusa @lid, grupos e lixo", () => {
  assert.equal(sanitizeWhatsappPhone("5511912345678"), "5511912345678");
  assert.equal(sanitizeWhatsappPhone("5511912345678@c.us"), "5511912345678");
  assert.equal(sanitizeWhatsappPhone("5511912345678@s.whatsapp.net"), "5511912345678");
  assert.equal(sanitizeWhatsappPhone("123456789012345@lid"), null);
  assert.equal(sanitizeWhatsappPhone("120363000000000000-group"), null);
  assert.equal(sanitizeWhatsappPhone("120363000000000000@g.us"), null);
  assert.equal(sanitizeWhatsappPhone("status@broadcast"), null);
  assert.equal(sanitizeWhatsappPhone("12345"), null);
  assert.equal(sanitizeWhatsappPhone("98765432101234", "98765432101234"), null);
  assert.equal(sanitizeWhatsappPhone(undefined), null);
});

test("phoneKey/phoneVariants casam celular com e sem o 9º dígito", () => {
  assert.equal(phoneKey("554688212387"), "5546988212387");
  assert.equal(phoneKey("+55 (46) 98821-2387"), "5546988212387");
  assert.deepEqual(new Set(phoneVariants("5546988212387")), new Set(["5546988212387", "554688212387"]));
});

test("normalizeCsvPhone", () => {
  assert.equal(normalizeCsvPhone("(11) 91234-5678"), "5511912345678");
  assert.equal(normalizeCsvPhone("55 11 91234-5678"), "5511912345678");
  assert.equal(normalizeCsvPhone("(55) 99123-4567"), "5555991234567"); // DDD 55 (RS) sem DDI
  assert.equal(normalizeCsvPhone("1234"), null);
  assert.equal(normalizeCsvPhone("abc@lid"), null);
});

test("parseContactsCsv: cabeçalho, ; do Excel BR e duplicados", () => {
  const csv = "Nome;Telefone\nMaria;(11) 91234-5678\nJoão;11912345678\nSem fone;abc\n";
  const result = parseContactsCsv(csv);
  assert.deepEqual(result.contacts, [{ phone: "5511912345678", name: "Maria" }]);
  assert.equal(result.skipped, 1);
});

test("parseContactsCsv sem cabeçalho", () => {
  const result = parseContactsCsv("11912345678,Ana\n21998765432,Bruno");
  assert.deepEqual(
    result.contacts.map((c) => c.phone),
    ["5511912345678", "5521998765432"]
  );
});

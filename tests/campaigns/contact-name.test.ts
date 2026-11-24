import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isRealName,
  pickWebhookContactName,
  pickZapiContactName,
  shouldReplaceContactName,
} from "@/lib/whatsapp/contact-name";

test("pickZapiContactName: agenda (name/short) antes do perfil (vname/notify)", () => {
  assert.deepEqual(pickZapiContactName({ name: "Maria Silva", notify: "Mari 🌸" }), { name: "Maria Silva", source: "agenda" });
  assert.deepEqual(pickZapiContactName({ short: "Maria", notify: "Mari" }), { name: "Maria", source: "agenda" });
  assert.deepEqual(pickZapiContactName({ name: "+55 46 8821-2387", notify: "João" }), { name: "João", source: "perfil" });
  assert.deepEqual(pickZapiContactName({ vname: "  Ana   Souza " }), { name: "Ana Souza", source: "perfil" });
  assert.equal(pickZapiContactName({ name: "+55 11 91234-5678", vname: "5511912345678" }), null);
  assert.equal(pickZapiContactName({}), null);
});

test("pickWebhookContactName usa chatName (não senderName)", () => {
  assert.deepEqual(pickWebhookContactName({ chatName: "Carlos", senderName: "Minha Empresa" }), {
    name: "Carlos",
    source: "whatsapp",
  });
  assert.equal(pickWebhookContactName({ senderName: "Minha Empresa" }), null);
  assert.equal(pickWebhookContactName({ chatName: "5511912345678" }), null);
});

test("isRealName descarta telefone formatado", () => {
  assert.equal(isRealName("+55 (11) 91234-5678"), false);
  assert.equal(isRealName("Maria"), true);
});

test("shouldReplaceContactName: nunca troca nome de CSV/manual", () => {
  const agenda = { name: "Maria Z-API", source: "agenda" as const };
  assert.equal(shouldReplaceContactName({ name: "Maria do CSV", nameSource: "csv" }, agenda), false);
  assert.equal(shouldReplaceContactName({ name: "Maria digitada", nameSource: "manual" }, agenda), false);
});

test("shouldReplaceContactName: preenche vazio e respeita agenda > perfil", () => {
  assert.equal(shouldReplaceContactName({ name: null, nameSource: null }, { name: "Ana", source: "perfil" }), true);
  assert.equal(shouldReplaceContactName({ name: "  ", nameSource: null }, { name: "Ana", source: "csv" }), true);
  assert.equal(shouldReplaceContactName({ name: "Ana Agenda", nameSource: "agenda" }, { name: "Aninha", source: "perfil" }), false);
  assert.equal(shouldReplaceContactName({ name: "Aninha", nameSource: "perfil" }, { name: "Ana Souza", source: "agenda" }), true);
  assert.equal(shouldReplaceContactName({ name: "Ana", nameSource: "agenda" }, { name: "Ana", source: "agenda" }), false);
  // CSV não sobrescreve nome existente vindo da Z-API; manual sim.
  assert.equal(shouldReplaceContactName({ name: "Ana", nameSource: "agenda" }, { name: "Ana CSV", source: "csv" }), false);
  assert.equal(shouldReplaceContactName({ name: "Ana", nameSource: "agenda" }, { name: "Ana M.", source: "manual" }), true);
  // Contato antigo sem origem registrada conta como "whatsapp".
  assert.equal(shouldReplaceContactName({ name: "Velho", nameSource: null }, { name: "Novo", source: "agenda" }), true);
});

test("cadastro manual sempre vale (corrige até nome de CSV)", () => {
  assert.equal(shouldReplaceContactName({ name: "Maria CSV", nameSource: "csv" }, { name: "Maria", source: "manual" }), true);
});

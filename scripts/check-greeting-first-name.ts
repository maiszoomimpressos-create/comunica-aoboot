import {
  extractGreetingFirstName,
  resolveGreetingFirstName,
} from "../src/lib/notifications/greeting-name";

const firstNameCases: [string | null | undefined, string | null][] = [
  ["MARIA SILVA", "Maria"],
  ["maria silva", "Maria"],
  ["Maria Silva", "Maria"],
  ["José da Silva", "José"],
  ["joão pedro", "João"],
  ["JOÃO", "João"],
  ["LUÍS CARLOS", "Luís"],
  ["Maria-Clara Souza", "Maria-Clara"],
  ["Sra. Maria Silva", "Maria"],
  ["Dr. João", "João"],
  ["✨ Maria Silva", "Maria"],
  ["Maria 💚", "Maria"],
  ["🔥🔥🔥", null],
  ["!!!", null],
  ["", null],
  ["   ", null],
  [null, null],
  [undefined, null],
  ["+55 11 99999-9999", null],
  ["5511999999999", null],
  ["(11) 99999-9999", null],
  ["11 99999-9999", null],
  ["Ana", "Ana"],
  ["D'ANGELO SILVA", "D'Angelo"],
];

const resolutionCases: { name: string; input: Parameters<typeof resolveGreetingFirstName>[0]; expected: string | null }[] = [
  {
    name: "client recipientName wins over WhatsApp",
    input: { recipientName: "MARIA SILVA", whatsappName: "Ana Costa" },
    expected: "Maria",
  },
  {
    name: "nome_passageiro used when recipientName missing",
    input: {
      recipientName: "",
      whatsappName: "Ana Costa",
      details: { nome_passageiro: "joão pedro", tarifa: "12,50" },
      fields: [{ key: "nome_passageiro", label: "Nome do passageiro" }, { key: "tarifa", label: "Tarifa" }],
    },
    expected: "João",
  },
  {
    name: "invalid recipientName falls back to name field then WhatsApp",
    input: {
      recipientName: "5511999999999",
      whatsappName: "ana costa",
      details: { nome_motorista: "Carlos" },
      fields: [{ key: "nome_motorista", label: "Nome do motorista" }],
    },
    expected: "Ana",
  },
  {
    name: "emoji-only client name falls back to WhatsApp",
    input: { recipientName: "🔥🔥🔥", whatsappName: "Ana" },
    expected: "Ana",
  },
  {
    name: "no usable name",
    input: { recipientName: "(11) 99999-9999", whatsappName: "✨✨" },
    expected: null,
  },
];

let failed = 0;
for (const [input, expected] of firstNameCases) {
  const actual = extractGreetingFirstName(input);
  if (actual !== expected) {
    failed += 1;
    console.error("FAIL extract", JSON.stringify(input), "=>", actual, "expected", expected);
  } else {
    console.log("OK   extract", JSON.stringify(input), "=>", actual);
  }
}

for (const test of resolutionCases) {
  const actual = resolveGreetingFirstName(test.input);
  if (actual !== test.expected) {
    failed += 1;
    console.error("FAIL resolve", test.name, "=>", actual, "expected", test.expected);
  } else {
    console.log("OK   resolve", test.name, "=>", actual);
  }
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nAll greeting first-name checks passed.");

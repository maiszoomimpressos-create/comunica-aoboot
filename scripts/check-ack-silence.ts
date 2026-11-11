import {
  ACK_SILENCE_WINDOW_MS,
  canonicalContactDigits,
  classifyAckReply,
  normalizeAckText,
} from "../src/lib/whatsapp/ack-reply";

let failures = 0;
let total = 0;

function expectAck(text: string, expected: boolean) {
  total++;
  const result = classifyAckReply(text);
  if (result.ack !== expected) {
    failures++;
    console.error(`FALHOU: ${JSON.stringify(text)} -> ${JSON.stringify(result)} (esperado ack=${expected})`);
  }
}

// Deve silenciar (agradecimento/cumprimento/ok)
const silence = [
  "obrigado", "Obrigado!", "obrigada", "OBRIGADOOO", "Muito obrigado!!", "muito obrigada pela informação",
  "Obrigado pelo aviso", "obg", "vlw", "Valeu!", "valeu mano", "brigado", "grato", "agradeço",
  "ok", "Ok", "OK!", "okk", "okay", "blz", "beleza", "Certo", "certinho", "ta bom", "Tá bom",
  "tá ok", "ta certo", "entendi", "combinado", "show", "show de bola", "top", "perfeito", "ótimo",
  "Bom dia", "bom dia!", "Boa tarde", "boa noite", "oi", "Olá", "opa", "e aí",
  "Bom dia, obrigado", "ok obrigado", "Ok, obrigado!", "beleza, valeu", "Obrigado, bom dia",
  "Certo, obrigada 🙏", "Obrigado 👍", "👍", "👍🏽", "🙏", "🙏🙏🙏", "❤️", "😊", "👏👏", "🤝", "😀👍",
  "Deus abençoe", "Amém 🙏", "kkk obrigado", "ok kkkk", "tudo certo", "joia", "Joinha 👍",
  "sim", "isso", "recebido", "confirmado", "de acordo", "pode deixar", "tmj", "Obrigado amigo",
  "obrigado, você também", "tchau", "ate mais", "boa viagem",
];

// NÃO deve silenciar (algo real ou na dúvida)
const keep = [
  "", "   ", "?", "ok?", "obrigado, mas o motorista não chegou", "bom dia, preciso de uma corrida",
  "quero cancelar", "cancelar", "não", "nao recebi", "errado", "Bom dia, qual o valor?",
  "obrigado mas cobrou errado", "oi, tudo bem? preciso de ajuda", "tudo bem?", "Quanto custa",
  "ok, mas quero mudar o endereço", "👎", "😡", "😢", "🤔", "obrigado 😡", "Rua das Flores 123",
  "123", "https://exemplo.com", "obrigado João", "bom dia quero falar com atendente",
  "atendente", "ajuda", "kkkk", "rs", "e", "a", "muito", "obrigado ".repeat(12),
  "Bom dia! Gostaria de saber se a corrida de amanhã está confirmada",
  "o motorista é educado, obrigado", "ok mudei de ideia", "pix", "Oi Fibra",
];

for (const text of silence) expectAck(text, true);
for (const text of keep) expectAck(text, false);

total++;
if (normalizeAckText("Tá BÕM!!! Obrigadooo") !== "ta bom obrigado") {
  failures++;
  console.error("FALHOU: normalizeAckText", normalizeAckText("Tá BÕM!!! Obrigadooo"));
}
total++;
if (canonicalContactDigits("554688212387") !== "5546988212387") {
  failures++;
  console.error("FALHOU: canonicalContactDigits sem 9");
}
total++;
if (canonicalContactDigits("+55 (46) 98821-2387") !== "5546988212387") {
  failures++;
  console.error("FALHOU: canonicalContactDigits com máscara");
}
total++;
if (ACK_SILENCE_WINDOW_MS !== 6 * 60 * 60_000) {
  failures++;
  console.error("FALHOU: janela deveria ser 6h");
}

if (failures > 0) {
  console.error(`${failures}/${total} casos falharam`);
  process.exit(1);
}
console.log(`check-ack-silence: ${total} casos OK`);

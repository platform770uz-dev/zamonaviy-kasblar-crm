// «Qo‘ng‘iroq natijasi» for Telegram, laid out like the lead card in the CRM (app.js: leadCallDetailsHtml, leadAdviceHtml):
// the call summary («Xulosa» of the AI tip) first, then the operator's record line by line without the survey's unfilled
// items («narx —, to‘langan —, qolgan —»), then the rest of the AI tip under its own labels. Plain text, no markup.
// Used by teachnova-bot (owner and admins) and operator-notify (operators).

// Labels of the lines the CRM survey writes (composeSurveyText in app.js); other lines are the operator's free text.
const NOTE_LABELS = ["Kim bilan", "Farzand", "Maqsad", "Qaror qiluvchi", "E’tiroz", "Kelishuv", "To‘lov", "Keyingi qo‘ng‘iroq", "Izoh"];
// An unfilled piece of a survey line: «—», «narx —», «yoshi —», «qiziqishi: —».
const EMPTY_PART = /^(?:[^\s—:][^—:]*?:?\s*)?—\.?$/u;

// The operator's record as «Label: value» lines, unfilled pieces and lines left out, ISO dates as DD.MM.
export function noteLines(note: string): string[] {
  const out: string[] = [];
  for (const raw of String(note ?? "").split(/\n+/)) {
    const line = raw.trim();
    if (!line) continue;
    const label = NOTE_LABELS.find((name) => line.startsWith(name + ":"));
    if (!label) {
      out.push(line);
      continue;
    }
    let value = line.slice(label.length + 1).trim().replace(/\.$/, "");
    // No price: «to‘langan», «qolgan» and the due date mean nothing yet (the AI tip asks about the payment anyway).
    if (label === "To‘lov" && /^narx\s*—/u.test(value)) continue;
    value = value.split(/;\s*/)
      .map((group) => group.split(/,\s*/).filter((part) => !EMPTY_PART.test(part.trim())).join(", "))
      .filter((group) => group.trim())
      .join("; ")
      .replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, "$3.$2");
    if (!/[\p{L}\p{N}]/u.test(value)) continue;
    out.push(`${label}: ${value}`);
  }
  return out;
}

// The AI tip: «Xulosa», «Keyingi qadam», «So‘rang», «Holat» (older tips: «Qadam», «Tanqid», «Baho»).
type TipKind = "sum" | "next" | "ask" | "state" | "plain";
const TIP_KINDS: { re: RegExp; kind: TipKind }[] = [
  { re: /^Xulosa\s*:\s*(.+)$/i, kind: "sum" },
  { re: /^(?:Keyingi qadam|Qadam)\s*:\s*(.+)$/i, kind: "next" },
  { re: /^(?:So[‘’ʻ'`´]?rang|Tanqid)\s*:\s*(.+)$/i, kind: "ask" },
  { re: /^(?:Holat|Baho)\s*:\s*(.+)$/i, kind: "state" },
];
export function tipParts(ai: string): { kind: TipKind; text: string }[] {
  const parts: { kind: TipKind; text: string }[] = [];
  for (const raw of String(ai ?? "").split(/\n+/)) {
    const line = raw.replace(/\*\*/g, "").trim();
    if (!line) continue;
    const found = TIP_KINDS.find((item) => item.re.test(line));
    parts.push(found ? { kind: found.kind, text: line.replace(found.re, "$1").trim() } : { kind: "plain", text: line });
  }
  return parts.filter((part) => part.text);
}

const LABELS = {
  uz: {
    head: "📞 Qo‘ng‘iroq natijasi", late: "🕐 Yozilgan vaqti", sum: "🧾 Xulosa", record: "📝 Operator yozuvi", tip: "🤖 AI maslahat",
    next: "➡️ Keyingi qadam", ask: "❓ Nimani aniqlash kerak", state: "🌡 Holat",
  },
  ru: {
    head: "📞 Результат звонка", late: "🕐 Записан", sum: "🧾 Итог звонка", record: "📝 Запись оператора", tip: "🤖 Совет ИИ",
    next: "➡️ Следующий шаг", ask: "❓ Что уточнить", state: "🌡 Состояние",
  },
};

export type CallCard = { name: string; phone: string; status: string; editor?: string; note: string; ai?: string; late?: string };

export function callCardText(card: CallCard, lang: "uz" | "ru"): string {
  const L = LABELS[lang];
  const lines = [L.head, `👤 ${card.name} · ${card.phone}`, `📌 ${card.status}${card.editor ? ` · 👷 ${card.editor}` : ""}`];
  if (card.late) lines.push(`${L.late}: ${card.late}`);
  const tips = tipParts(card.ai ?? "");
  const sum = tips.find((tip) => tip.kind === "sum");
  if (sum) lines.push("", `${L.sum}: ${sum.text}`);
  const record = noteLines(card.note);
  if (record.length) lines.push("", `${L.record}:`, ...record.map((line) => `• ${line}`));
  const rest = tips.filter((tip) => tip.kind !== "sum");
  if (rest.length) {
    lines.push("", `${L.tip}:`);
    for (const tip of rest) {
      lines.push(tip.kind === "plain" ? tip.text : `${L[tip.kind]}: ${tip.text}`);
    }
  }
  return lines.join("\n");
}

// Уведомления операторам колл-центра (@eduteachuz_bot): новые лиды из Facebook, результаты звонков, напоминания
// «Qayta aloqa» (перезвонить) и ежедневный список «кому звонить сегодня» (функция lead-queue, по правилам очереди CRM).
// Напоминание перед отправкой сверяется с карточкой лида: если время перезвона перенесли или убрали, старое не шлём.
// Владелец и админы получают их сразу, круглосуточно, через @teachnova_bot. Операторам (skript_operatorlar.holat = 'faol')
// — только в рабочее время: пн–сб 13:00–19:00 по Ташкенту. Пришедшее ночью и в воскресенье ждёт в очереди
// operator_notifications и уходит в начале рабочего времени по одному сообщению, начиная со старых.
// Очередь пополняют meta-yba-webhook (лиды) и teachnova-bot (результаты звонков и напоминания). pg_cron (задача operator-notify-deliver,
// каждую минуту пн–сб 08:00–13:59 UTC) вызывает POST ?deliver=1 с x-crm-secret = crm_maxfiy.tg_ichki.
// Токен бота операторов — секрет EDUTEACH_BOT_TOKEN (общий с eduteach-bot).
import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
const HEAD = { "Content-Type": "application/json; charset=utf-8" };
const json = (o: Record<string, unknown>, status = 200) => new Response(JSON.stringify(o), { status, headers: HEAD });

const WORK_DAYS = [1, 2, 3, 4, 5, 6]; // пн–сб (0 — воскресенье)
const WORK_FROM = 13; // с 13:00 по Ташкенту
const WORK_TO = 19; // до 19:00
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000; // UTC+5, летнего времени нет
const BATCH = 20; // событий за один вызов (каждое уходит всем операторам)
const MAX_ATTEMPTS = 5;
const KEEP_DAYS = 7; // более старые события не шлём: очередь могла простоять из-за сбоя
const LATE_MS = 10 * 60 * 1000; // если событие ждало дольше, в сообщении пишем, когда оно пришло
const PAUSE_MS = 250; // пауза между сообщениями (лимиты Telegram)

function isWorkingTime(nowMs: number): boolean {
  const local = new Date(nowMs + TASHKENT_OFFSET_MS);
  const hour = local.getUTCHours();
  return WORK_DAYS.includes(local.getUTCDay()) && hour >= WORK_FROM && hour < WORK_TO;
}

const pad = (n: number) => String(n).padStart(2, "0");
function tashkentTime(iso: string): string {
  const d = new Date(Date.parse(iso) + TASHKENT_OFFSET_MS);
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

const str = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);
const STATUS: Record<"uz" | "ru", Record<string, string>> = {
  uz: { booked: "Yozilgan", attended: "Kelgan", no_answer: "Javob bermagan", callback: "Qayta aloqa" },
  ru: { booked: "Записан", attended: "Пришёл", no_answer: "Не ответил", callback: "Перезвонить" },
};

// Список звонков на сегодня (lead-queue): одно сообщение, в него — сколько лидов влезает в лимит Telegram (4096 символов).
// Порядок задают постоянные правила — те же, что у очереди в CRM. Причина — подпись правила, «что сказать» — готовая
// фраза ИИ по прошлому разговору; обе приходят по-узбекски и не переводятся. Фразы может не быть — тогда строки нет.
const TELEGRAM_LIMIT = 3900;
function queueText(p: Record<string, unknown>, ru: boolean): string {
  const items = (Array.isArray(p.items) ? p.items : []) as Record<string, unknown>[];
  const total = Math.max(items.length, Math.floor(Number(p.total) || 0)); // всего ждут звонка; в сообщении — первые
  const lines = [ru ? `🔥 Кому звонить сегодня — в очереди ${total}` : `🔥 Bugun kimga qo‘ng‘iroq qilish kerak — navbatda ${total} ta`];
  const at = str(p.at, 40);
  if (Number.isFinite(Date.parse(at))) lines.push(`🕐 ${ru ? "Составлена" : "Tuzildi"}: ${tashkentTime(at)}`);
  let length = lines.join("\n").length;
  let shown = 0;
  for (const item of items) {
    const say = str(item.say, 200);
    const block = [
      "",
      `${Number(item.rank) || shown + 1}. ${str(item.name, 80) || (ru ? "Без имени" : "Ismsiz")} · ${str(item.phone, 40) || "—"}`,
      `❓ ${str(item.reason, 120)}`,
      ...(say ? [`💬 ${say}`] : []),
    ].join("\n");
    if (length + block.length + 1 > TELEGRAM_LIMIT - 60) break; // 60 — запас на строку «… yana N ta — CRM’da»
    lines.push(block);
    length += block.length + 1;
    shown++;
  }
  if (shown < total) lines.push("", ru ? `… и ещё ${total - shown} — в CRM` : `… yana ${total - shown} ta — CRM’da`);
  return lines.join("\n");
}

// Текст для оператора: язык — как в eduteach-bot (til из Telegram: «ru…» — русский, иначе узбекский).
function messageText(kind: string, p: Record<string, unknown>, ru: boolean, nowMs: number): string {
  if (kind === "queue") return queueText(p, ru);
  const at = str(p.at, 40);
  const atMs = Date.parse(at);
  const late = Number.isFinite(atMs) && nowMs - atMs > LATE_MS ? tashkentTime(at) : "";
  const name = str(p.name, 160) || (ru ? "Без имени" : "Ismsiz");
  const phone = str(p.phone, 40) || "—";
  if (kind === "callback") {
    const lines = [ru ? "🔔 Пора перезвонить" : "🔔 Qayta aloqa vaqti", `👤 ${name}`, `📞 ${phone}`];
    const due = str(p.due_at, 40);
    if (Number.isFinite(Date.parse(due))) lines.push(`🕒 ${ru ? "План" : "Reja"}: ${tashkentTime(due)}`);
    if (str(p.note, 300)) lines.push(`📝 ${str(p.note, 300)}`);
    return lines.join("\n");
  }
  if (kind === "lead") {
    const lines = [ru ? "🆕 Новый лид из Facebook" : "🆕 Yangi lid (Facebook)", `👤 ${name}`, `📞 ${phone}`];
    if (str(p.form, 160)) lines.push(`📋 ${str(p.form, 160)}`);
    if (p.repeat === true) lines.push(ru ? "🔁 Повторная заявка с этого номера" : "🔁 Shu raqamdan qayta ariza");
    if (late) lines.push(ru ? `🕐 Пришёл: ${late}` : `🕐 Kelgan vaqti: ${late}`);
    return lines.join("\n");
  }
  const status = STATUS[ru ? "ru" : "uz"][str(p.status, 40)] ?? (ru ? "не указан" : "belgilanmagan");
  const lines = [ru ? "📞 Результат звонка" : "📞 Qo‘ng‘iroq natijasi", `👤 ${name} · ${phone}`, `📌 ${ru ? "Статус" : "Holat"}: ${status}`];
  if (str(p.editor, 120)) lines.push(`👷 ${ru ? "Оператор" : "Operator"}: ${str(p.editor, 120)}`);
  if (late) lines.push(ru ? `🕐 Записан: ${late}` : `🕐 Yozilgan vaqti: ${late}`);
  lines.push("", ru ? "📝 Комментарий оператора:" : "📝 Operator izohi:", str(p.note, 1500));
  if (str(p.ai, 900)) lines.push("", ru ? "🤖 Совет ИИ:" : "🤖 AI maslahat:", str(p.ai, 900));
  return lines.join("\n");
}

// ok — доставлено; gone — повтор не поможет (оператор заблокировал бота, чат не найден);
// retry — временный сбой; slow — Telegram просит подождать (429), прерываем этот вызов.
async function sendToOperator(chatId: number, text: string): Promise<"ok" | "gone" | "retry" | "slow"> {
  const token = Deno.env.get("EDUTEACH_BOT_TOKEN") ?? "";
  if (!token) return "retry";
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, link_preview_options: { is_disabled: true } }),
      signal: AbortSignal.timeout(10000),
    });
    const result = await response.json().catch(() => ({}));
    if (result?.ok === true) return "ok";
    const code = Number(result?.error_code ?? response.status);
    if (code === 429) return "slow";
    return code === 400 || code === 403 ? "gone" : "retry";
  } catch {
    return "retry";
  }
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Напоминание ещё в силе, если в карточке лида то же «Время повторной связи» (как проверяет teachnova-bot).
// CRM меняет или удаляет это поле, когда перезвон переносят, отменяют или меняют статус лида.
async function callbackStillPlanned(p: Record<string, unknown>): Promise<boolean> {
  const recordId = str(p.record_id, 64);
  const dueMs = Date.parse(str(p.due_at, 40));
  if (!recordId || !Number.isFinite(dueMs)) return false;
  const { data: record, error } = await sb.from("custom_records").select("values").eq("id", recordId).maybeSingle();
  if (error) return true; // не смогли прочитать карточку — лучше напомнить
  const planned = Date.parse(String((record?.values as Record<string, unknown> | undefined)?.["Время повторной связи"] || ""));
  return !!record && Number.isFinite(planned) && Math.abs(planned - dueMs) <= 1000;
}

async function deliver(nowMs = Date.now()) {
  if (!isWorkingTime(nowMs)) return { ok: true, working_time: false };
  const nowIso = new Date(nowMs).toISOString();
  await sb.from("operator_notifications").update({ status: "expired" })
    .eq("status", "pending").lt("created_at", new Date(nowMs - KEEP_DAYS * 86400000).toISOString());
  const { data: ops, error: opsError } = await sb.from("skript_operatorlar").select("chat_id,til").eq("holat", "faol");
  if (opsError) return { ok: false, error: "operators" };
  const operators = (ops ?? [])
    .map((o) => ({ chatId: Number(o.chat_id), ru: String(o.til ?? "").toLowerCase().startsWith("ru") }))
    .filter((o) => Number.isSafeInteger(o.chatId));
  const stale = new Date(nowMs - 10 * 60 * 1000).toISOString();
  const { data: due, error: dueError } = await sb.from("operator_notifications")
    .select("id,kind,payload,status,attempts,sent_to,created_at")
    .or(`status.eq.pending,and(status.eq.sending,claimed_at.lt.${stale})`)
    .order("created_at").order("id").limit(BATCH);
  if (dueError) return { ok: false, error: "queue" };

  let sent = 0, skipped = 0, retry = 0, failed = 0, messages = 0;
  for (const item of due ?? []) {
    // Берём событие себе: параллельный вызов его уже не отправит.
    const attempts = (Number(item.attempts) || 0) + 1;
    const claim = await sb.from("operator_notifications")
      .update({ status: "sending", claimed_at: nowIso, attempts })
      .eq("id", item.id).eq("status", item.status).select("id").maybeSingle();
    if (!claim.data) continue;
    if (!operators.length) {
      await sb.from("operator_notifications").update({ status: "skipped", last_error: "no active operators" }).eq("id", item.id);
      skipped++;
      continue;
    }
    if (item.kind === "callback" && !(await callbackStillPlanned((item.payload ?? {}) as Record<string, unknown>))) {
      await sb.from("operator_notifications").update({ status: "skipped", last_error: "callback moved or cancelled" }).eq("id", item.id);
      skipped++;
      continue;
    }
    const done = new Set((Array.isArray(item.sent_to) ? item.sent_to : []).map(Number)); // кому уже ушло — повторно не шлём
    let gone = 0, again = 0, slow = false;
    for (const op of operators) {
      if (done.has(op.chatId)) continue;
      const result = await sendToOperator(op.chatId, messageText(String(item.kind), (item.payload ?? {}) as Record<string, unknown>, op.ru, nowMs));
      messages++;
      if (result === "ok") done.add(op.chatId);
      else if (result === "gone") gone++;
      else again++;
      if (result === "slow") { slow = true; break; }
      await pause(PAUSE_MS);
    }
    const finished = again === 0 || attempts >= MAX_ATTEMPTS;
    const status = finished ? (done.size ? "sent" : "failed") : "pending";
    await sb.from("operator_notifications").update({
      status,
      sent_to: [...done],
      sent_at: done.size ? nowIso : null,
      last_error: gone || again ? `gone ${gone}, retry ${again}` : null,
    }).eq("id", item.id);
    if (status === "sent") sent++;
    else if (status === "failed") failed++;
    else retry++;
    if (slow) break;
  }
  return { ok: true, working_time: true, due: due?.length ?? 0, sent, skipped, retry, failed, messages };
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function isInternal(req: Request) {
  const secret = req.headers.get("x-crm-secret") ?? "";
  if (!secret) return false;
  const { data } = await sb.from("crm_maxfiy").select("qiymat").eq("kalit", "tg_ichki").maybeSingle();
  return !!data?.qiymat && safeEqual(secret, String(data.qiymat));
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST" || new URL(req.url).searchParams.get("deliver") !== "1") return json({ error: "POST ?deliver=1 only" }, 405);
  if (!await isInternal(req)) return json({ error: "unauthorized" }, 401);
  try {
    return json(await deliver());
  } catch (error) {
    console.error("operator-notify:", String(error).slice(0, 200));
    return json({ ok: false, error: "failed" }, 500);
  }
});

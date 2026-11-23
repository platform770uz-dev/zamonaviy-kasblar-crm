// Ежедневный список звонков для операторов в Telegram: «кому звонить сегодня».
// Очередь в CRM считается прямо на странице по постоянным правилам (app.js: leadQueueItem, leadQueueOrder). Эта функция
// раз в день собирает по тем же правилам первые 20 лидов и кладёт список в operator_notifications (kind = 'queue'):
// operator-notify доставит его операторам в рабочее время. ИИ здесь нет: порядок задают правила, а «что сказать» —
// готовая фраза из подсказки ИИ по прошлому разговору (строка «Ayting» поля «ИИ-комментарий», её пишет teachnova-bot).
// До 2026-11-23 очередь составлял ИИ и хранил её партиями в lead_call_batches / lead_call_queue — эти таблицы больше
// никто не пишет и не читает.
// Вызовы — только POST с x-crm-secret = crm_maxfiy.tg_ichki:
//   • pg_cron lead-queue-daily, пн–сб 07:55 UTC (12:55 Ташкент): {"action":"build","auto":true};
//   • проверка без записи и без Telegram: {"dry":true} — в ответе список без имён и телефонов.
import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false, autoRefreshToken: false } });
const HEAD = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: HEAD });

const LEADS_TAB_ID = "20b419be-7a75-4051-9993-6c755c4a5d68";
const LIST_SIZE = 20; // лидов в сообщении; про остальных — строка «ещё N — в CRM»
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000; // UTC+5, летнего времени нет

const str = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);
const pad = (n: number) => String(n).padStart(2, "0");
function tashkentTime(ms: number): string {
  const d = new Date(ms + TASHKENT_OFFSET_MS);
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

// <queue-rules> Правила очереди звонков. Блок одинаков в app.js и в supabase/functions/lead-queue/index.ts (там у
// параметров дописан тип any) — менять обе стороны вместе.
const LEAD_QUEUE_GROUPS = ["callback", "new", "meeting", "no_show", "attended", "idle"];
const LEAD_QUEUE_DAY_MS = 24 * 60 * 60 * 1000;
const leadQueueDay = (ms: any) => Math.floor((ms + 5 * 60 * 60 * 1000) / LEAD_QUEUE_DAY_MS); // номер дня по Ташкенту (UTC+5)
// Строка ИИ-подсказки по метке: «Xulosa», «Ayting», «Holat».
function leadTipLine(tip: any, label: any) {
  for (const raw of String(tip || "").split(/\n+/)) {
    const line = raw.replace(/\*/g, "").trim();
    if (line.toLowerCase().startsWith(label.toLowerCase() + ":")) return line.slice(label.length + 1).trim();
  }
  return "";
}
// Что сейчас делать с лидом. null — в очереди ему не место: ученик или ждёт назначенного времени.
function leadQueueItem(record: any, nowMs: any, isStudent: any) {
  const values = record.values || {};
  const status = String(values["Статус консультации"] || "new");
  if (isStudent || status === "student") return null;
  const survey = values["Опрос"] && typeof values["Опрос"] === "object" ? values["Опрос"] : {};
  const note = String(values["Результат последнего звонка"] || "").trim();
  const tip = String(values["ИИ-комментарий"] || "");
  const log = Array.isArray(values["Звонки"]) ? values["Звонки"] : [];
  const updatedMs = Date.parse(record.updated_at || record.created_at || "") || 0;
  const lastLogMs = log.length ? Date.parse(String(log[log.length - 1].at || "")) || 0 : 0;
  const lastCallMs = lastLogMs || (note ? updatedMs : 0);
  const appliedMs = Date.parse(String(values.latest_submission_time || values.created_time || "")) || Date.parse(record.created_at || "") || 0;
  const applications = Math.max(1, Math.floor(Number(values.submission_count) || 1));
  const callbackMs = Date.parse(String(values["Время повторной связи"] || ""));
  const meetingMs = Date.parse(String(survey.meetingAt || ""));
  const heat = /^(issiq|iliq|sovuq)/i.exec(leadTipLine(tip, "Holat"));
  const item = (group: any, at: any, extra: any) => ({ group, at, hot: heat ? heat[1].toLowerCase() : "", say: leadTipLine(tip, "Ayting"), applications, ...(extra || {}) });
  // 1. Подошло время перезвона: обещанный звонок, повтор после недозвона, «думает».
  if (Number.isFinite(callbackMs) && callbackMs <= nowMs) return item("callback", callbackMs, null);
  // 2. Заявка: ещё ни разу не звонили — или человек оставил заявку ещё раз после последнего звонка.
  if (!note && status === "new") return item("new", appliedMs, null);
  if (note && applications >= 2 && (lastLogMs ? appliedMs > lastLogMs : appliedMs >= updatedMs - 15 * 60 * 1000)) return item("new", appliedMs, { repeat: true });
  // Звонок назначен на потом — лид ждёт своего времени.
  if (Number.isFinite(callbackMs)) return null;
  if (status === "booked") {
    if (Number.isFinite(meetingMs)) {
      // 3. Консультация сегодня — напомнить. Если сегодня уже звонили, второй раз не дёргаем.
      if (meetingMs > nowMs) return leadQueueDay(meetingMs) === leadQueueDay(nowMs) && !(lastLogMs && leadQueueDay(lastLogMs) === leadQueueDay(nowMs)) ? item("meeting", meetingMs, null) : null;
      // 4. Время консультации прошло больше часа назад, а приход не отмечен.
      return nowMs - meetingMs > 60 * 60 * 1000 ? item("no_show", meetingMs, null) : null;
    }
    // Записан без времени встречи (старые записи): через сутки спрашиваем, пришёл ли.
    return nowMs - lastCallMs > LEAD_QUEUE_DAY_MS ? item("no_show", lastCallMs, { noTime: true }) : null;
  }
  // 5. Был на консультации, но ещё не ученик.
  if (status === "attended") return item("attended", lastCallMs, null);
  // 6. Разговор был, а следующего шага нет: позвонить ещё раз или отправить в архив.
  return item("idle", lastCallMs || updatedMs, null);
}
// Порядок очереди: группы — по списку LEAD_QUEUE_GROUPS, внутри группы — как удобнее звонить.
function leadQueueOrder(a: any, b: any, nowMs: any) {
  const byGroup = LEAD_QUEUE_GROUPS.indexOf(a.group) - LEAD_QUEUE_GROUPS.indexOf(b.group);
  if (byGroup) return byGroup;
  if (a.group === "callback") {
    // Сначала обещанные на сегодня — по времени; за ними просроченные с прошлых дней — самые недавние первыми.
    const aToday = leadQueueDay(a.at) === leadQueueDay(nowMs), bToday = leadQueueDay(b.at) === leadQueueDay(nowMs);
    if (aToday !== bToday) return aToday ? -1 : 1;
    return aToday ? a.at - b.at : b.at - a.at;
  }
  if (a.group === "meeting") return a.at - b.at; // ближайшая консультация первой
  if (a.group === "idle") {
    // Внутри «нет следующего шага» — по оценке ИИ: горячие, тёплые, без оценки, холодные.
    const heat: any = { issiq: 0, iliq: 1, "": 2, sovuq: 3 };
    if (heat[a.hot] !== heat[b.hot]) return heat[a.hot] - heat[b.hot];
  }
  return b.at - a.at; // заявки, пропущенные консультации и остальные — самые свежие первыми
}
// </queue-rules>

// Почему лид в списке и что сказать — по-узбекски, как всё, что получают операторы. Подписи групп — те же, что в CRM
// (leadQueueReason в app.js и их перевод в uz-phrases.js), тексты для новых заявок — те же, что leadQueueOpeners.
function reasonUz(item: any): string {
  const time = item.at ? tashkentTime(item.at) : "";
  if (item.group === "callback") return `Qayta aloqa vaqti keldi · ${time}`;
  if (item.group === "new") return item.repeat ? `Qayta ariza · ${item.applications}-marta` : `Yangi ariza · ${time}`;
  if (item.group === "meeting") return `Bugun konsultatsiya · ${time.slice(6)}`;
  if (item.group === "no_show") return item.noTime ? "Yozilgan, kelgani belgilanmagan" : `Kelgani belgilanmagan · ${time}`;
  if (item.group === "attended") return "Konsultatsiyaga kelgan, hali o‘quvchi emas";
  return "Keyingi qadam belgilanmagan";
}
const OPENERS: Record<string, string> = {
  new: "Tanishing, farzandning yoshi va qiziqishini so‘rang, sinov darsiga taklif qiling",
  repeat: "Qayta ariza qoldirgan — qiziqishi yuqori, sinov darsiga yozing",
};
const sayUz = (item: any): string => item.say || (item.group === "new" ? OPENERS[item.repeat ? "repeat" : "new"] : "");

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function isInternal(req: Request): Promise<boolean> {
  const secret = req.headers.get("x-crm-secret") ?? "";
  if (!secret) return false;
  const { data } = await sb.from("crm_maxfiy").select("qiymat").eq("kalit", "tg_ichki").maybeSingle();
  return !!data?.qiymat && safeEqual(secret, String(data.qiymat));
}

async function buildList(dry: boolean) {
  const nowMs = Date.now();
  const [leads, studentRows] = await Promise.all([
    sb.from("custom_records").select("id,values,created_at,updated_at").eq("tab_id", LEADS_TAB_ID),
    sb.from("lead_students").select("record_id").eq("tab_id", LEADS_TAB_ID),
  ]);
  if (leads.error || studentRows.error) return { ok: false, error: "load" };
  const students = new Set((studentRows.data ?? []).map((row) => String(row.record_id)));
  const isStudent = (lead: any) => students.has(String(lead.id)) || String(lead.values?.["Статус консультации"] || "") === "student";
  const active = (leads.data ?? []).filter((lead) => !isStudent(lead));
  const entries = active
    .map((lead) => ({ lead, item: leadQueueItem(lead, nowMs, false) }))
    .filter((entry) => entry.item !== null)
    .sort((a, b) => leadQueueOrder(a.item, b.item, nowMs));
  const groups: Record<string, number> = {};
  for (const entry of entries) groups[entry.item.group] = (groups[entry.item.group] ?? 0) + 1;
  const top = entries.slice(0, LIST_SIZE);
  // total — сколько лидов ждут звонка сейчас, later — сколько ждут назначенного времени.
  const result = { ok: true, count: top.length, total: entries.length, later: active.length - entries.length, groups };
  if (dry) {
    return { ...result, dry: true, items: top.map((entry, index) => ({ rank: index + 1, group: entry.item.group, reason: reasonUz(entry.item), say: sayUz(entry.item) })) };
  }
  if (!top.length) return { ...result, ok: false, error: "empty" };

  // Один список в день: повторный вызов в тот же день ничего не шлёт и прежний список не трогает.
  const day = new Date(nowMs + TASHKENT_OFFSET_MS).toISOString().slice(0, 10);
  const key = `queue:${day}`;
  const placed = await sb.from("operator_notifications").upsert({
    dedupe_key: key,
    kind: "queue",
    payload: {
      at: new Date(nowMs).toISOString(),
      by: "Avto",
      rules: true,
      total: entries.length,
      items: top.map((entry, index) => ({
        rank: index + 1,
        name: str(entry.lead.values?.["Имя"], 80),
        phone: str(entry.lead.values?.["Телефон"], 40),
        reason: reasonUz(entry.item),
        say: sayUz(entry.item),
      })),
    },
  }, { onConflict: "dedupe_key", ignoreDuplicates: true }).select("id");
  if (placed.error) { console.error("lead-queue notify:", placed.error.code); return { ...result, notified: false }; }
  if (!placed.data?.length) return { ...result, notified: false, already: true };
  // Вчерашний список, который так и не ушёл, устарел.
  await sb.from("operator_notifications").update({ status: "skipped", last_error: "superseded by a newer queue" })
    .eq("kind", "queue").eq("status", "pending").neq("dedupe_key", key);
  return { ...result, notified: true };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return respond({ ok: false, error: "method" }, 405);
  if (!await isInternal(req)) return respond({ ok: false, error: "unauthorized" }, 401);
  let body: Record<string, unknown> = {};
  try {
    const raw = await req.text();
    if (raw.length > 2048) return respond({ ok: false, error: "too_large" }, 413);
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return respond({ ok: false, error: "invalid_json" }, 400);
  }
  if ((body.action ?? "build") !== "build") return respond({ ok: false, error: "action" }, 400);
  const dry = body.dry === true;
  // Либо проверка (dry), либо ежедневный список (auto). Ничего другого не делаем.
  if (!dry && body.auto !== true) return respond({ ok: false, error: "forbidden" }, 403);
  try {
    return respond(await buildList(dry));
  } catch (error) {
    console.error("lead-queue:", String(error).slice(0, 200));
    return respond({ ok: false, error: "failed" }, 500);
  }
});

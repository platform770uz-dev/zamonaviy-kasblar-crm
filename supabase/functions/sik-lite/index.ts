// sik-lite — Super Intellekt Kids: the parents' bot @SuperIntellektBot, its Mini App API and the 5-minute tick
// (project zamonaviy-kasblar). One bot with access levels: guest → signed up → paid trial (Lite) → student.
//
// The parent's Mini App is a small fintech-style screen: the living polar bear «Super Ayiq» grows from the child's
// points (ball), a wallet of coins (tanga, only from B2B orders, referrals and prizes; 1 tanga = 100 so'm; the academy
// never holds money), and ONE button for the child: today's DZ, one tongue twister with the voice check. The check runs
// in the Tez aytish trainer (tez-aytish-api, project yba-family-platform), which reports the result here (?dz=1).
//
// Doors:
//   POST /sik-lite              Telegram webhook (X-Telegram-Bot-Api-Secret-Token = sha256('sik-lite-webhook:'+token));
//   POST /sik-lite/api/<action> the Mini App (X-Telegram-Init-Data signed by the bot);
//   POST /sik-lite?dz=1         tez-aytish-api reports a checked DZ (x-sik-dz = sha256('sik-dz:'+token));
//   POST /sik-lite?tick=1       pg_cron every 5 minutes (holds, reminders, offers, evening DZ nudge, Monday summary);
//   POST /sik-lite?setup=1|0    webhook, commands and menu button (1) or only the status (0).
// tick and setup need x-crm-secret = crm_maxfiy.tg_ichki. With that header the webhook and the API also take test
// calls: x-selftest-dry: 1 returns the outgoing Telegram calls instead of sending them; x-selftest-as: <telegram id>
// acts as that user in the API.
//
// Ways in: (1) a parent from an ad signs up in the bot (phone, names, a lesson, card transfer + receipt the owner
// confirms); (2) the administrator enters the family at a meeting and shows a QR of t.me/<bot>?start=f_<code>; the
// parent can also open the link sent in Telegram or type the 6-digit code to the bot.
// Secrets: SIK_LITE_BOT_TOKEN (the owner pastes it, the same token also goes to yba-family-platform for
// tez-aytish-api), TEACHNOVA_BOT_TOKEN (owner alerts), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Personal data never goes to the logs.
import { createClient } from "npm:@supabase/supabase-js@2";
import { AsyncLocalStorage } from "node:async_hooks";

const TOKEN = (Deno.env.get("SIK_LITE_BOT_TOKEN") ?? "").trim();
const TEACHNOVA = (Deno.env.get("TEACHNOVA_BOT_TOKEN") ?? "").trim();
const SUPA_URL = Deno.env.get("SUPABASE_URL") ?? "";
const FN_URL = `${SUPA_URL}/functions/v1/sik-lite`;
const APP_URL = "https://platform770uz-dev.github.io/yba-public-miniapp/sik-lite/";
const CRM_SITE = "https://platform770uz-dev.github.io/zamonaviy-kasblar-crm/";
const CRM_TAB = "a7c4e2f1-5b3d-4c8e-9f21-6d0b8e3a4c57";
const ORIGINS = new Set(["https://platform770uz-dev.github.io", "http://localhost:8768", "http://127.0.0.1:8768"]);
const TZ_MS = 5 * 3600_000; // Asia/Tashkent, UTC+5 all year
const HOLD_MIN = 120; // an unpaid seat is held this long
const BOOK_BEFORE_MIN = 60; // a lesson can be booked until an hour before it starts
const MOVE_BEFORE_MIN = 180; // the free reschedule: at least 3 hours before the lesson
const AFTER_MS = 48 * 3600_000; // Lite and the 99 000 credit: until 48 hours after the lesson
const LEVELS = [0, 150, 350, 600, 900]; // points needed for levels 1..5 (a diligent child reaches 5 in ~3 months)
const LEVEL_NAMES = ["Gapiradi", "Hisoblaydi", "Video oladi", "Bloger", "Buyurtma oladi"];
const DZ_BASE = 5, STREAK_DAYS = 7, STREAK_BONUS = 20, ATTEND_POINTS = 10, WELCOME_POINTS = 10, ORDER_POINTS = 30;
const B2B_POINTS = 300; // monthly points that open B2B orders (plus the teacher's decision)
const COIN_SOM = 100, DISCOUNT_MAX_PCT = 10, PRIZE_SOM = 100000;
const CODE_TRIES = 10, INVITE_DAYS = 14; // wrong invite codes a day per parent; an unused invite lives two weeks
const SETTING_KEYS = ["card", "center", "prices", "discounts", "referral", "bot"];
const CHECK_MAX_BYTES = 4_000_000, PENDING_MAX = 5; // a check photo from the Mini App; open checks a parent may have
// Receipts go to the academy's Kvitansiya book; its purposes, the verification page and the footer of its receipts.
const KV_TRIAL = "Sinov mashgʻuloti", KV_OTHER = "Boshqa", KV_PREPAY = "Oʻqish uchun oldindan toʻlov (Super Intellekt Kids)";
const KV_VERIFY = "https://platform770uz-dev.github.io/yba-kvitansiya/v.html?c=";
const KV_FOOTER = "Bu toʻlov kvitansiyasi. Davlat soliq xizmatining fiskal cheki emas.";
const LIVE = ["pending_payment", "check_sent", "paid", "attended", "no_show", "converted"];
const PAID = ["paid", "attended", "no_show", "converted"];
const SHORT_DESCRIPTION = "Super Intellekt Kids: bloging, matematika va tez aytish. Super Ayiq har kuni o‘sadi!";
const DESCRIPTION = "Farzandingizning Super Ayiq’i: har kuni 1 ta tez aytish — ayiqcha o‘sadi, ball yig‘iladi. Sinov paketi 99 000 so‘m: markazda ochiq dars + 48 soat ilova. Ro‘yxatdan o‘tish 1 daqiqa.";

// The first REST calls of a freshly started instance are sometimes refused with 401 (PGRST303). A refused call
// never ran, so one retry is safe for reads and writes alike.
const retry401: typeof fetch = async (input, init) => {
  const r = await fetch(input, init);
  if (r.status !== 401) return r;
  await r.body?.cancel();
  await new Promise((ok) => setTimeout(ok, 400));
  return await fetch(input, init);
};
const db = createClient(SUPA_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: retry401 },
});

type Row = Record<string, any>;
type Settings = {
  card: { number: string; holder: string };
  center: { address: string; landmark: string; map_url: string };
  prices: { price: number; course_price: number };
  discounts: { until: string; pct: number; name: string }[];
  referral: { inviter_coins: number; friend_discount: number };
  bot: { username?: string; name?: string };
};
class HttpError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}
// A test call (x-selftest-dry with the internal secret) collects its outgoing Telegram calls instead of sending them
// and skips CRM, operator and ledger writes. Kept per request: concurrent real requests must still send.
const dryStore = new AsyncLocalStorage<Row[] | null>();
const dryOut = (): Row[] | null => dryStore.getStore() ?? null;
const enc = new TextEncoder();

// ---------- helpers ----------
const pad = (n: number) => String(n).padStart(2, "0");
const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const sum = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const iso = (ms: number) => new Date(ms).toISOString();
const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const DAYS = ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"];
const loc = (t: string | number) => new Date((typeof t === "number" ? t : Date.parse(t)) + TZ_MS);
const fmtDay = (t: string) => { const d = loc(t); return `${DAYS[d.getUTCDay()]}, ${d.getUTCDate()}-${MONTHS[d.getUTCMonth()]}`; };
const fmtTime = (t: string) => { const d = loc(t); return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };
const fmtWhen = (t: string) => `${fmtDay(t)}, ${fmtTime(t)}`;
const fmtShort = (t: string) => { const d = loc(t); return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };
const tday = (ms = Date.now()) => new Date(ms + TZ_MS).toISOString().slice(0, 10);
const lessonEnd = (l: Row) => Date.parse(l.starts_at) + Number(l.duration_min || 45) * 60000;
const stars5 = (n: number) => "★".repeat(n) + "☆".repeat(Math.max(0, 5 - n));
const intIn = (v: unknown, lo: number, hi: number): number | null => {
  const n = Number(v);
  return Number.isInteger(n) && n >= lo && n <= hi ? n : null;
};
function phoneKey(raw: unknown): string {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("998") && d.length === 12) d = d.slice(3);
  return /^[2-9]\d{8}$/.test(d) ? d : "";
}
const NAME_RE = /^[\p{L}][\p{L}\p{M} '‘’ʻʼ`.-]{1,39}$/u;
const cleanName = (raw: unknown) => { const s = String(raw ?? "").replace(/\s+/g, " ").trim(); return NAME_RE.test(s) ? s : ""; };
async function hmac(key: Uint8Array, data: Uint8Array) {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
const sha256Hex = async (s: string) => hex(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s))));
function constEq(a: string, b: string) {
  const x = enc.encode(a), y = enc.encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}
const randCode = (n: number, abc = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ") =>
  [...crypto.getRandomValues(new Uint8Array(n))].map((x) => abc[x % abc.length]).join("");
const levelOf = (pts: number) => { let l = 1; for (let i = 0; i < LEVELS.length; i++) if (pts >= LEVELS[i]) l = i + 1; return l; };

// ---------- HTTP ----------
const cors = (origin: string): Record<string, string> => ORIGINS.has(origin)
  ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type, x-telegram-init-data", "Access-Control-Max-Age": "86400", "Vary": "Origin" }
  : { "Vary": "Origin" };
const json = (body: Row, status = 200, origin = "") =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...cors(origin) } });

// The secret is cached only once read; a failed read is retried on the next call.
let internalSecret = "";
async function isInternal(req: Request) {
  const got = req.headers.get("x-crm-secret") ?? "";
  if (!got) return false;
  if (!internalSecret) {
    const { data, error } = await db.from("crm_maxfiy").select("qiymat").eq("kalit", "tg_ichki").maybeSingle();
    if (error) console.error("internal secret read failed", error.code);
    internalSecret = String(data?.qiymat ?? "");
  }
  return !!internalSecret && constEq(got, internalSecret);
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const origin = req.headers.get("origin") ?? "";
  if (req.method === "OPTIONS") return new Response(null, { status: ORIGINS.has(origin) ? 204 : 403, headers: cors(origin) });
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405, origin);
  const dry = req.headers.get("x-selftest-dry") === "1" && (await isInternal(req)) ? [] : null;
  return await dryStore.run(dry, () => route(req, url, origin));
});
async function route(req: Request, url: URL, origin: string): Promise<Response> {
  const parts = url.pathname.split("/").filter(Boolean);
  const apiAt = parts.indexOf("api");
  try {
    if (url.searchParams.has("dz")) return await dzHook(req);
    if (url.searchParams.has("tick") || url.searchParams.has("setup")) {
      if (!(await isInternal(req))) throw new HttpError(403, "forbidden");
      const result = url.searchParams.has("tick") ? await tick() : await setup(url.searchParams.get("setup") === "1");
      const out = dryOut();
      return json({ ...result, ...(out ? { out } : {}) });
    }
    if (apiAt >= 0) return await api(req, parts[apiAt + 1] ?? "", origin);
    return await webhook(req);
  } catch (error) {
    if (error instanceof HttpError) return json({ ok: false, error: error.code }, error.status, origin);
    console.error("sik-lite failed", String(error).slice(0, 200));
    const out = dryOut();
    return json({ ok: false, error: "server", ...(out ? { detail: String(error).slice(0, 300), out } : {}) }, 500, origin);
  }
}

// ---------- Telegram ----------
async function tg(method: string, body: Row, token = TOKEN): Promise<Row> {
  const out = dryOut();
  if (out) { out.push({ method, ...body }); return { ok: true, result: { message_id: out.length } }; }
  if (!token) return { ok: false, description: "no_token" };
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000),
    });
    const j = await r.json().catch(() => ({ ok: false, description: `http ${r.status}` }));
    if (!j.ok) console.error("telegram", method, String(j.description ?? "").slice(0, 120));
    return j;
  } catch {
    console.error("telegram failed", method);
    return { ok: false, description: "network" };
  }
}
const send = (chatId: number, text: string, extra: Row = {}) =>
  tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", link_preview_options: { is_disabled: true }, ...extra });
const inline = (rows: Row[][]) => ({ reply_markup: { inline_keyboard: rows } });
const cb = (text: string, data: string) => ({ text, callback_data: data });
const app = (text: string, hash = "") => ({ text, web_app: { url: APP_URL + hash } });
const answer = (cq: Row, text = "") => tg("answerCallbackQuery", { callback_query_id: cq.id, text });

// ---------- settings and people ----------
let settingsMemo: { at: number; v: Settings } | null = null;
async function settings(): Promise<Settings> {
  if (settingsMemo && Date.now() - settingsMemo.at < 15000) return settingsMemo.v;
  const { data } = await db.from("sik_settings").select("key,value").in("key", SETTING_KEYS);
  const m: Row = Object.fromEntries((data ?? []).map((r: Row) => [r.key, r.value]));
  const v: Settings = {
    card: { number: String(m.card?.number ?? ""), holder: String(m.card?.holder ?? "") },
    center: { address: String(m.center?.address ?? ""), landmark: String(m.center?.landmark ?? ""), map_url: String(m.center?.map_url ?? "") },
    prices: { price: Number(m.prices?.price) || 99000, course_price: Number(m.prices?.course_price) || 600000 },
    discounts: Array.isArray(m.discounts) ? m.discounts : [],
    referral: { inviter_coins: Number(m.referral?.inviter_coins ?? 500), friend_discount: Number(m.referral?.friend_discount ?? 20000) },
    bot: m.bot && typeof m.bot === "object" ? m.bot : {},
  };
  settingsMemo = { at: Date.now(), v };
  return v;
}
async function setSetting(key: string, value: unknown, by: number | null = null) {
  const { error } = await db.from("sik_settings").upsert({ key, value, updated_at: new Date().toISOString(), updated_by: by });
  if (error) throw new HttpError(500, "db");
  settingsMemo = null;
}
let ownersMemo: { at: number; ids: number[] } | null = null;
async function ownerIds(): Promise<number[]> {
  if (ownersMemo && Date.now() - ownersMemo.at < 60000) return ownersMemo.ids;
  const { data } = await db.from("tg_chatlar").select("chat_id").eq("rol", "owner").eq("tasdiqlangan", true).eq("bloklangan", false);
  const ids = (data ?? []).map((r: Row) => Number(r.chat_id)).filter((n: number) => Number.isSafeInteger(n) && n > 0);
  ownersMemo = { at: Date.now(), ids };
  return ids;
}
async function roleOf(id: number): Promise<"owner" | "admin" | "teacher" | null> {
  if ((await ownerIds()).includes(id)) return "owner";
  const { data } = await db.from("sik_staff").select("status,role").eq("telegram_id", id).maybeSingle();
  return data?.status === "active" ? (data.role === "admin" ? "admin" : "teacher") : null;
}
async function touchParent(from: Row): Promise<Row> {
  const name = [from.first_name, from.last_name].filter(Boolean).join(" ").slice(0, 80) || null;
  const username = from.username ? String(from.username).slice(0, 64) : null;
  const { data: found } = await db.from("sik_parents").select("*").eq("telegram_id", from.id).maybeSingle();
  if (found) {
    if (found.tg_name !== name || found.username !== username) await db.from("sik_parents").update({ tg_name: name, username }).eq("telegram_id", from.id);
    return { ...found, tg_name: name, username, state_data: found.state_data ?? {} };
  }
  const row = { telegram_id: from.id, tg_name: name, username, state_data: {} };
  const { data } = await db.from("sik_parents").upsert(row, { onConflict: "telegram_id" }).select("*").single();
  return data ?? row;
}
async function saveParent(p: Row, patch: Row) {
  Object.assign(p, patch);
  await db.from("sik_parents").update({ ...patch, updated_at: new Date().toISOString() }).eq("telegram_id", p.telegram_id);
}
async function parentOf(id: number): Promise<Row | null> {
  const { data } = await db.from("sik_parents").select("*").eq("telegram_id", id).maybeSingle();
  return data ?? null;
}
const parentName = (p: Row) => String(p?.parent_name ?? p?.tg_name ?? "").trim() || "Ismsiz";
async function refCodeOf(p: Row): Promise<string> {
  if (p.ref_code) return p.ref_code;
  for (let i = 0; i < 4; i++) {
    const code = randCode(6);
    const { error } = await db.from("sik_parents").update({ ref_code: code }).eq("telegram_id", p.telegram_id).is("ref_code", null);
    if (!error) { const fresh = await parentOf(p.telegram_id); p.ref_code = fresh?.ref_code ?? code; return p.ref_code; }
  }
  return "";
}

// ---------- children, points, coins ----------
const childOpen = (c: Row, now = Date.now()) => c.status === "student" || (c.status === "trial" && !!c.access_until && Date.parse(c.access_until) > now);
async function childrenOf(parentId: number): Promise<Row[]> {
  const { data } = await db.from("sik_children").select("*").eq("parent_id", parentId).neq("status", "left").order("created_at");
  return data ?? [];
}
async function childById(id: string): Promise<Row | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const { data } = await db.from("sik_children").select("*").eq("id", id).maybeSingle();
  return data ?? null;
}
async function newChild(parentId: number, name: string, age: number): Promise<Row> {
  const { data, error } = await db.from("sik_children").insert({ parent_id: parentId, name, age }).select("*").single();
  if (error || !data) throw new Error(`child insert ${error?.code}`);
  return data;
}
// Opens Lite for a child until the given moment (never shortens it; a student stays a student).
async function openTrial(child: Row, until: number) {
  if (child.status === "student") return;
  const cur = child.access_until ? Date.parse(child.access_until) : 0;
  const patch = { status: "trial", access_until: iso(Math.max(cur, until)), updated_at: new Date().toISOString() };
  await db.from("sik_children").update(patch).eq("id", child.id);
  Object.assign(child, patch);
  await award(child.id, "welcome", WELCOME_POINTS, "welcome", "Xush kelibsiz");
}
async function award(childId: string, kind: string, points: number, ref: string, note = "", by: number | null = null): Promise<boolean> {
  if (dryOut()) return true;
  const { error } = await db.from("sik_points").insert({ child_id: childId, kind, points, ref, note: note.slice(0, 120), created_by: by });
  if (error && error.code !== "23505") console.error("points insert", error.code);
  return !error;
}
// ---------- the bell, the so'm balance, receipts ----------
// A notice in the parent's bell (the Mini App); the Telegram message, if any, is sent by the caller.
async function notice(parentId: number, kind: string, title: string, body = "", data: Row = {}, childId: string | null = null) {
  const out = dryOut();
  if (out) { out.push({ method: "notice", parent_id: parentId, kind, title, body }); return; }
  const { error } = await db.from("sik_notices").insert({ parent_id: parentId, child_id: childId, kind, title: title.slice(0, 120), body: body.slice(0, 600) || null, data });
  if (error) console.error("notice failed", error.code);
}
async function moneyBalance(parentId: number): Promise<number> {
  const { data, error } = await db.rpc("sik_money_balance", { p_parent: parentId });
  if (error) throw new Error(`balance ${error.code}`);
  return Number(data) || 0;
}
// One line of the family's so'm ledger; false when a line with that ref exists already.
async function moneyLine(row: Row): Promise<boolean> {
  if (dryOut()) return true;
  const { error } = await db.from("sik_money").insert(row);
  if (error && error.code !== "23505") throw new Error(`money ${error.code}`);
  return !error;
}
type Receipt = { id: string; number: number; code: string; view: Row };
const kvNo = (n: number) => String(n).padStart(6, "0");
// An official receipt in the academy's Kvitansiya book (the same numbering and verification code as the Kvitansiya
// app), and what the Mini App shows of it. null when the book refuses it (the payment itself still counts).
async function kvReceipt(o: { payer: string; child: string; phone: string | null; trial: boolean; amount: number; method: "Karta" | "Naqd"; paidAt: string }): Promise<Receipt | null> {
  const name = (s: string, fallback: string) => (s && s.trim().length >= 2 ? s.trim().slice(0, 160) : fallback);
  const payer = name(o.payer, "Ota-ona"), child = name(o.child, "Farzand");
  const view = (number: number, code: string) => ({ no: kvNo(number), code, url: KV_VERIFY + code, paid_at: o.paidAt, payer, child, purpose: o.trial ? KV_TRIAL : KV_PREPAY, amount: o.amount, method: o.method, footer: KV_FOOTER });
  if (dryOut()) return { id: "dry", number: 0, code: "DRYRUN0000", view: view(0, "DRYRUN0000") };
  const { data, error } = await db.rpc("sik_kv_receipt", {
    p_payer_name: payer, p_child_name: child, p_phone: o.phone && o.phone.length >= 7 ? o.phone : null,
    p_purpose: o.trial ? KV_TRIAL : KV_OTHER, p_purpose_other: o.trial ? null : KV_PREPAY, p_amount: o.amount, p_method: o.method, p_paid_at: o.paidAt,
  });
  const r = Array.isArray(data) ? data[0] : data;
  if (error || !r) { console.error("receipt failed", error?.code); return null; }
  return { id: String(r.receipt_id), number: Number(r.receipt_number), code: String(r.receipt_code), view: view(Number(r.receipt_number), String(r.receipt_code)) };
}
const realReceiptId = (r: Receipt | null) => (r && r.id !== "dry" ? r.id : null);
const receiptOut = (k: Row) => ({
  no: kvNo(k.number), code: k.code, url: KV_VERIFY + k.code, paid_at: k.paid_at, payer: k.payer_name, child: k.child_name,
  purpose: k.purpose === KV_OTHER ? k.purpose_other : k.purpose, amount: Number(k.amount), method: k.method, status: k.status, footer: KV_FOOTER,
});
// The family's so'm statement, newest first, with the receipt of each payment.
async function moneyLines(parentId: number, n = 50) {
  const { data } = await db.from("sik_money").select("id,kind,amount,note,child_id,receipt_id,created_at").eq("parent_id", parentId).order("created_at", { ascending: false }).limit(n);
  const rids = [...new Set((data ?? []).map((r: Row) => r.receipt_id).filter(Boolean))];
  const { data: rs } = rids.length ? await db.from("kv_receipts").select("id,number,code,paid_at,payer_name,child_name,purpose,purpose_other,amount,method,status").in("id", rids) : { data: [] };
  const byId = new Map<string, Row>((rs ?? []).map((r: Row) => [String(r.id), r]));
  return (data ?? []).map((r: Row) => {
    const k = r.receipt_id ? byId.get(String(r.receipt_id)) : null;
    return { kind: r.kind, amount: Number(r.amount), note: r.note, at: r.created_at, child_id: r.child_id, receipt: k ? receiptOut(k) : null };
  });
}

// Ledger sums come from the database (PostgREST returns at most 1000 rows per request).
type Totals = { points: number; period: number; coins: number };
async function totals(ids: string[], since = leagueStart(true)): Promise<Record<string, Totals>> {
  if (!ids.length) return {};
  const { data, error } = await db.rpc("sik_totals", { p_ids: ids, p_since: since });
  if (error) throw new Error(`totals ${error.code}`);
  return Object.fromEntries((data ?? []).map((r: Row) => [r.child_id, { points: Number(r.points) || 0, period: Number(r.period_points) || 0, coins: Number(r.coins) || 0 }]));
}
const pointsOf = async (id: string) => (await totals([id]))[id]?.points ?? 0;
const coinsOf = async (id: string) => (await totals([id]))[id]?.coins ?? 0;
async function streakOf(childId: string, today = tday()): Promise<number> {
  const { data } = await db.from("sik_dz").select("day").eq("child_id", childId).order("day", { ascending: false }).limit(120);
  const days = new Set((data ?? []).map((r: Row) => String(r.day)));
  let n = 0, t = Date.parse(today + "T00:00:00Z");
  while (days.has(new Date(t).toISOString().slice(0, 10))) { n++; t -= 86400000; }
  return n;
}
// Rating: students compete over the Tashkent month (the top one gets the 100 000 prize), trial children over the week.
function leagueStart(student: boolean, now = Date.now()): string {
  const d = loc(now);
  if (student) return iso(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - TZ_MS);
  const back = (d.getUTCDay() + 6) % 7;
  return iso(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back) - TZ_MS);
}
// The rating board from the database: the top places plus the given child's own place.
type Place = { place: number; id: string; name: string; points: number };
async function board(student: boolean, o: { child?: string | null; top?: number; since?: string; until?: string | null } = {}, now = Date.now()): Promise<Place[]> {
  const { data, error } = await db.rpc("sik_rating", {
    p_student: student, p_since: o.since ?? leagueStart(student, now), p_until: o.until ?? null, p_child: o.child ?? null, p_top: o.top ?? 10,
  });
  if (error) throw new Error(`rating ${error.code}`);
  return (data ?? []).map((r: Row) => ({ place: Number(r.place), id: String(r.child_id), name: String(r.name ?? ""), points: Number(r.points) || 0 }));
}
const prevMonth = (now = Date.now()) => {
  const until = leagueStart(true, now), since = leagueStart(true, Date.parse(until) - 86400000), d = loc(since);
  return { since, until, label: MONTHS[d.getUTCMonth()], key: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}` };
};
async function childView(c: Row, s: Settings, now = Date.now()) {
  const student = c.status === "student";
  const [t, streak, dzToday, mine] = await Promise.all([
    totals([c.id], leagueStart(true, now)), streakOf(c.id, tday(now)),
    db.from("sik_dz").select("stars,points").eq("child_id", c.id).eq("day", tday(now)).maybeSingle().then((r: Row) => r.data),
    board(student, { child: c.id, top: 0 }, now),
  ]);
  const { points, period, coins } = t[c.id] ?? { points: 0, period: 0, coins: 0 };
  const level = levelOf(points);
  const discount = Math.min(Math.max(0, coins) * COIN_SOM, Math.round(s.prices.course_price * DISCOUNT_MAX_PCT / 100));
  return {
    id: c.id, name: c.name, age: c.age, bear: c.bear_name, status: c.status, open: childOpen(c, now), access_until: c.access_until,
    points, level, level_name: LEVEL_NAMES[level - 1], next: LEVELS[level] ?? null, prev: LEVELS[level - 1],
    streak, dz_today: dzToday ? { stars: dzToday.stars, points: dzToday.points } : null,
    month_points: period, b2b_points: B2B_POINTS,
    coins, coins_som: coins * COIN_SOM, discount, rank: mine[0]?.place ?? null, league: student ? "month" : "week",
  };
}

// ---------- lessons and bookings ----------
async function lessonsById(ids: unknown[]): Promise<Record<string, Row>> {
  const uniq = [...new Set(ids.filter(Boolean).map(String))];
  if (!uniq.length) return {};
  const { data } = await db.from("sik_lessons").select("*").in("id", uniq);
  return Object.fromEntries((data ?? []).map((l: Row) => [l.id, l]));
}
const holds = (b: Row, now: number) => b.status !== "pending_payment" || (!!b.hold_until && Date.parse(b.hold_until) > now);
async function seatsTaken(ids: string[]): Promise<Record<string, number>> {
  if (!ids.length) return {};
  const { data } = await db.from("sik_bookings").select("lesson_id,status,hold_until").in("lesson_id", ids).in("status", LIVE);
  const now = Date.now(), out: Record<string, number> = {};
  for (const b of data ?? []) if (holds(b, now)) out[b.lesson_id] = (out[b.lesson_id] ?? 0) + 1;
  return out;
}
async function openLessons(exceptId: string | null = null): Promise<Row[]> {
  const { data } = await db.from("sik_lessons").select("*").eq("status", "open").gt("starts_at", iso(Date.now() + BOOK_BEFORE_MIN * 60000)).order("starts_at").limit(15);
  const lessons = (data ?? []).filter((l: Row) => l.id !== exceptId);
  const taken = await seatsTaken(lessons.map((l: Row) => l.id));
  return lessons.map((l: Row) => ({ ...l, free: l.seats - (taken[l.id] ?? 0) })).filter((l: Row) => l.free > 0).slice(0, 8);
}
async function parentBookings(id: number): Promise<Row[]> {
  const { data } = await db.from("sik_bookings").select("*").eq("parent_id", id).neq("status", "cancelled").order("created_at", { ascending: false }).limit(10);
  const lessons = await lessonsById((data ?? []).map((b: Row) => b.lesson_id));
  return (data ?? []).map((b: Row) => ({ ...b, lesson: lessons[b.lesson_id] ?? null }));
}
async function bookingByCode(code: string, parentId: number | null = null): Promise<Row | null> {
  if (!/^[A-Z0-9]{5}$/.test(code)) return null;
  let q = db.from("sik_bookings").select("*").eq("code", code);
  if (parentId !== null) q = q.eq("parent_id", parentId);
  const { data } = await q.maybeSingle();
  if (!data) return null;
  return { ...data, lesson: (await lessonsById([data.lesson_id]))[data.lesson_id] ?? null };
}
// A child's booking that still holds a seat in a lesson that has not ended (one trial per child at a time).
async function liveBookingOf(childId: string): Promise<Row | null> {
  const { data } = await db.from("sik_bookings").select("*").eq("child_id", childId).in("status", ["pending_payment", "check_sent", "paid"]).order("created_at", { ascending: false }).limit(5);
  const now = Date.now();
  const list = (data ?? []).filter((b: Row) => holds(b, now));
  if (!list.length) return null;
  const lessons = await lessonsById(list.map((b: Row) => b.lesson_id));
  return list.map((b: Row) => ({ ...b, lesson: lessons[b.lesson_id] ?? null })).find((b: Row) => !b.lesson || lessonEnd(b.lesson) > now) ?? null;
}
function canMove(b: Row, now = Date.now()) {
  if (!["pending_payment", "check_sent", "paid"].includes(b.status) || !b.lesson) return false;
  if (Date.parse(b.lesson.starts_at) - now < MOVE_BEFORE_MIN * 60000) return false;
  return b.status !== "paid" || (b.reschedules ?? 0) < 1;
}
async function createBooking(row: Row): Promise<Row> {
  for (let i = 0; i < 4; i++) {
    const { data, error } = await db.from("sik_bookings").insert({ ...row, code: randCode(5) }).select("*").single();
    if (!error && data) return data;
    if (error?.code !== "23505") throw new Error(`booking insert ${error?.code}`);
  }
  throw new Error("booking code");
}
async function claim(id: string, kind: string) {
  if (dryOut()) return true;
  const { error } = await db.from("sik_sent").insert({ booking_id: id, kind });
  return !error;
}
async function claimChild(id: string, kind: string) {
  if (dryOut()) return true;
  const { error } = await db.from("sik_child_sent").insert({ child_id: id, kind });
  return !error;
}
// A booking became paid: Lite opens for its child until the lesson end + 48 h, and a friend's invitation pays off.
// The price paid for it stays on the family's so'm balance until then and pays for the first month, or for the trial.
async function bookingPaid(b: Row, l: Row | null, by: number | null, amount: number | null = null, paymentId: string | null = null) {
  const until = l ? lessonEnd(l) + AFTER_MS : Date.now() + AFTER_MS;
  const patch = {
    status: "paid", paid_at: new Date().toISOString(), confirmed_by: by, access_until: iso(until), credit_until: iso(until), updated_at: new Date().toISOString(),
    ...(amount ? { paid_amount: amount } : {}), ...(paymentId ? { payment_id: paymentId } : {}),
  };
  await db.from("sik_bookings").update(patch).eq("id", b.id);
  Object.assign(b, patch);
  const child = b.child_id ? await childById(b.child_id) : null;
  if (child) await openTrial(child, until);
  await rewardReferral(b.parent_id);
}

// ---------- offer ----------
function offer(s: Settings, b: Row, now = Date.now()) {
  const d = s.discounts.filter((x) => Date.parse(x.until) > now).sort((a, z) => Date.parse(a.until) - Date.parse(z.until))[0] ?? null;
  const pct = d ? Math.max(0, Math.min(90, Number(d.pct) || 0)) : 0;
  const after = Math.round(s.prices.course_price * (100 - pct) / 100);
  const creditOk = b.status !== "converted" && PAID.includes(b.status) && !!b.credit_until && Date.parse(b.credit_until) > now;
  const credit = creditOk ? s.prices.price : 0;
  return { course: s.prices.course_price, pct, season: d?.name ?? null, after, credit, final: Math.max(0, after - credit), until: creditOk ? String(b.credit_until) : null };
}
function offerText(o: ReturnType<typeof offer>) {
  const lines = ["🎁 <b>Asosiy kurs</b> — oyiga 8 dars (haftada 2 marta, 90 daqiqa):"];
  lines.push(o.pct ? `${sum(o.course)} → ${sum(o.after)} so‘m (−${o.pct}%${o.season ? `, «${esc(o.season)}» mavsumi` : ""})` : `${sum(o.course)} so‘m`);
  if (o.credit && o.until) {
    lines.push(`Sinov uchun to‘langan ${sum(o.credit)} so‘m hisobga olinadi → <b>1-oy ${sum(o.final)} so‘m</b>`);
    lines.push(`⏳ Taklif ${fmtWhen(o.until)} gacha amal qiladi`);
  }
  return lines.join("\n");
}
function centerLines(s: Settings) {
  const out: string[] = [];
  if (s.center.address) out.push(`📍 Manzil: ${esc(s.center.address)}`);
  if (s.center.landmark) out.push(`🧭 Mo‘ljal: ${esc(s.center.landmark)}`);
  if (/^https:\/\/\S+$/.test(s.center.map_url)) out.push(`🗺 <a href="${esc(s.center.map_url)}">Xaritada ochish</a>`);
  return out;
}

// ---------- CRM, operators, owner alerts ----------
const CRM_HOLAT: Record<string, string> = {
  pending_payment: "To‘lov kutilmoqda", check_sent: "Chek yuborildi", paid: "To‘langan", attended: "Darsga keldi",
  no_show: "Darsga kelmadi", converted: "O‘quvchi (asosiy kurs)", expired: "Bron muddati o‘tdi", cancelled: "Bekor qilindi",
};
async function crmPut(externalId: string, patch: Row) {
  if (dryOut()) return;
  const { error } = await db.rpc("sik_crm_put", { p_external_id: externalId, p_patch: patch });
  if (error) console.error("crm put failed", error.code);
}
async function crmBooking(b: Row, p: Row, l: Row | null) {
  const s = await settings();
  const r = b.report?.ratings;
  await crmPut(`sik:${b.id}`, {
    "Ota-ona ismi": parentName(p), "Telefon": p.phone ?? "", "Farzand": b.child_name, "Yoshi": String(b.child_age),
    "Dars": l ? fmtShort(l.starts_at) : "",
    "Holat": b.status !== "converted" && b.want_main_at ? "Asosiy kursga yozilmoqchi" : CRM_HOLAT[b.status] ?? b.status,
    "To‘lov": b.paid_at ? `${sum(s.prices.price)} so‘m · ${fmtShort(b.paid_at)}` : "",
    "Manba": b.source ?? "", "Natija": r ? `Nutq ${r.nutq}/5 · Kamera ${r.kamera}/5 · Matematika ${r.matematika}/5` : "",
    "Kod": b.code, "Telegram": p.username ? `@${p.username}` : String(p.telegram_id), created_time: b.created_at,
  });
}
async function crmProspect(p: Row) {
  await crmPut(`sikp:${p.telegram_id}`, {
    "Ota-ona ismi": parentName(p), "Telefon": p.phone ?? "", "Holat": "Anketa to‘ldirilmoqda", "Manba": p.source ?? "",
    "Telegram": p.username ? `@${p.username}` : String(p.telegram_id), created_time: new Date().toISOString(),
  });
}
async function toOperators(key: string, p: Row, form: string) {
  const out = dryOut();
  if (out) { out.push({ method: "operator_notifications", dedupe_key: key, form }); return; }
  const { error } = await db.from("operator_notifications").upsert(
    { dedupe_key: key, kind: "lead", payload: { name: parentName(p), phone: p.phone ?? "", form: form.slice(0, 160), repeat: false, at: new Date().toISOString() } },
    { onConflict: "dedupe_key", ignoreDuplicates: true },
  );
  if (error) console.error("operator queue failed", error.code);
}
async function ownersAlert(text: string, onceKey: string | null) {
  if (onceKey && !dryOut()) {
    const { error } = await db.from("sik_settings").insert({ key: `alert:${onceKey}`, value: { at: new Date().toISOString() } });
    if (error) return;
  }
  const { data: people } = await db.from("tg_chatlar").select("chat_id,rol").in("rol", ["owner", "admin"]).eq("tasdiqlangan", true).eq("bloklangan", false);
  const { data: ops } = await db.from("skript_operatorlar").select("chat_id").eq("holat", "faol");
  const operators = new Set((ops ?? []).map((r: Row) => Number(r.chat_id)));
  for (const person of people ?? []) {
    if (person.rol !== "owner" && operators.has(Number(person.chat_id))) continue;
    await tg("sendMessage", { chat_id: person.chat_id, text, parse_mode: "HTML", link_preview_options: { is_disabled: true } }, TEACHNOVA);
  }
}

// ---------- referrals ----------
async function noteReferral(p: Row, code: string) {
  if (p.referred_by || !/^[A-Z0-9]{6}$/.test(code)) return;
  const { count } = await db.from("sik_bookings").select("id", { count: "exact", head: true }).eq("parent_id", p.telegram_id);
  if (count) return;
  const { data: inviter } = await db.from("sik_parents").select("telegram_id").eq("ref_code", code).maybeSingle();
  if (!inviter || Number(inviter.telegram_id) === Number(p.telegram_id)) return;
  await saveParent(p, { referred_by: inviter.telegram_id });
  await db.from("sik_referrals").upsert({ invitee: p.telegram_id, inviter: inviter.telegram_id }, { onConflict: "invitee", ignoreDuplicates: true });
}
async function rewardReferral(inviteeId: number) {
  const { data: r } = await db.from("sik_referrals").select("*").eq("invitee", inviteeId).maybeSingle();
  if (!r || r.rewarded_at) return;
  const kids = await childrenOf(r.inviter);
  const target = kids.find((c) => childOpen(c)) ?? kids[0];
  const s = await settings();
  const at = new Date().toISOString();
  await db.from("sik_referrals").update({ paid_at: r.paid_at ?? at, ...(target ? { rewarded_at: at } : {}) }).eq("invitee", inviteeId);
  if (!target || !s.referral.inviter_coins) return;
  const { error } = dryOut() ? { error: null } : await db.from("sik_coins").insert({ child_id: target.id, kind: "referral", amount: s.referral.inviter_coins, note: "Do‘st taklifi", ref: `ref:${inviteeId}` });
  if (error) return;
  await send(r.inviter, `🎁 Do‘stingiz to‘lov qildi — <b>${esc(target.name)}</b> hamyoniga <b>+${s.referral.inviter_coins} tanga</b> (${sum(s.referral.inviter_coins * COIN_SOM)} so‘m)!`, inline([[app("🐻 Hamyonni ochish", "#wallet")]]));
  await notice(r.inviter, "coins", `+${s.referral.inviter_coins} tanga`, `Do‘st taklifi: ${target.name} hamyoniga`, {}, target.id);
}
async function priceFor(p: Row, s: Settings) {
  return Math.max(0, s.prices.price - (p.referred_by ? s.referral.friend_discount : 0));
}

// ---------- webhook ----------
async function webhook(req: Request): Promise<Response> {
  const internal = await isInternal(req);
  if (!internal) {
    const got = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
    if (!TOKEN || !constEq(got, await sha256Hex(`sik-lite-webhook:${TOKEN}`))) return new Response("forbidden", { status: 403 });
  }
  const update = await req.json().catch(() => null);
  const out = dryOut();
  if (update && typeof update === "object") {
    try {
      await onUpdate(update);
    } catch (error) {
      console.error("update failed", String(error).slice(0, 200));
      out?.push({ error: String(error).slice(0, 300) });
    }
  }
  return json(out ? { ok: true, out } : { ok: true });
}

async function onUpdate(u: Row) {
  if (u.callback_query) return await onCallback(u.callback_query);
  const m = u.message;
  if (!m?.from || m.chat?.type !== "private" || m.from.is_bot) return;
  const p = await touchParent(m.from);
  const text = typeof m.text === "string" ? m.text.trim() : "";
  if (text.startsWith("/start")) return await onStart(p, text.split(/\s+/)[1] ?? "");
  if (text === "/menu") return await showMenu(p);
  if (text === "/ustoz") return await teacherRequest(p);
  if (text === "/admin") return await adminButton(p);
  if (m.contact) {
    if (m.contact.user_id && m.contact.user_id !== m.from.id) return await send(p.telegram_id, "Iltimos, o‘zingizning raqamingizni yuboring — pastdagi tugma orqali.", phoneKeyboard());
    // Shared from the Mini App's «Raqamni ulash»: the app goes on by itself, the chat stays quiet.
    if (p.state === "app") { await savePhone(p, m.contact.phone_number); return; }
    if (p.state === "phone" || !p.phone) {
      const k = phoneKey(m.contact.phone_number);
      return k ? await gotPhone(p, k) : await send(p.telegram_id, "Bu raqam O‘zbekiston raqamiga o‘xshamayapti. Raqamni yozib yuboring: masalan, 90 123 45 67.");
    }
    return await showMenu(p);
  }
  if (m.photo || m.document) return await onCheck(p, m);
  if (/^\d{6}$/.test(text) && (p.state === "code" || !p.state || p.state === "done")) return await redeemInvite(p, text);
  if (text) return await onText(p, text);
  return await resumeOrMenu(p);
}

async function onStart(p: Row, payload: string) {
  if (payload === "ustoz") return await teacherRequest(p);
  if (/^f_\d{6}$/.test(payload)) return await redeemInvite(p, payload.slice(2));
  if (/^r_[A-Z0-9]{6}$/.test(payload)) await noteReferral(p, payload.slice(2));
  else if (payload && /^[\w-]{1,40}$/.test(payload) && !p.source) await saveParent(p, { source: payload });
  const role = await roleOf(p.telegram_id);
  if (role) await send(p.telegram_id, role === "owner" ? "📋 Siz egasiz: darslar, oilalar, tangalar va sozlamalar — «Boshqaruv»da." : "📋 «Boshqaruv»: darslar, davomat va hisobotlar.", inline([[app("📋 Boshqaruv", "#staff")]]));
  return await resumeOrMenu(p);
}
async function resumeOrMenu(p: Row) {
  if (p.state && !["done", "code"].includes(p.state)) return await resume(p);
  const kids = await childrenOf(p.telegram_id);
  return kids.length ? await showMenu(p) : await welcome(p);
}
async function welcome(p: Row) {
  const s = await settings();
  const price = await priceFor(p, s);
  const text = [
    "Assalomu alaykum! 👋",
    "<b>Super Intellekt Kids</b> — farzandingiz uchun bloging, matematika va tez aytish.",
    "",
    "🐻 Farzandingizning <b>Super Ayiq</b>i bor: har kuni 1 ta tez aytish (30 soniya) — ayiqcha o‘sadi, ball yig‘iladi.",
    `🏫 Sinov paketi — <b>${sum(price)} so‘m</b>${price < s.prices.price ? ` (do‘st taklifi bilan, odatda ${sum(s.prices.price)})` : ""}: markazda ochiq dars + 48 soat Super Ayiq ilovasi.`,
    `🎁 Asosiy kursga dars kunidan keyingi 48 soat ichida yozilsangiz, ${sum(s.prices.price)} so‘m birinchi oydan chegiriladi.`,
    "",
    "Boshlash 1 daqiqa: farzandingiz ismi va yoshi — keyin Super Ayiq 👇",
  ].join("\n");
  return await send(p.telegram_id, text, inline([[app("🐻 Boshlash")], [cb("🔢 Menda kod bor", "CODE")]]));
}
// The parent's phone, shared with the Telegram button (the bot chat or the Mini App); a non-Uzbek number is kept as is.
async function savePhone(p: Row, raw: unknown): Promise<boolean> {
  const k = phoneKey(raw), digits = String(raw ?? "").replace(/\D/g, "");
  const phone = k ? `+998${k}` : digits.length >= 10 && digits.length <= 15 ? `+${digits}` : "";
  if (!phone) return false;
  await saveParent(p, { phone, phone_key: k || digits });
  const { count } = await db.from("sik_bookings").select("id", { count: "exact", head: true }).eq("parent_id", p.telegram_id);
  if (!count) await crmProspect(p);
  return true;
}

const phoneKeyboard = () => ({ reply_markup: { keyboard: [[{ text: "📱 Raqamni yuborish", request_contact: true }]], resize_keyboard: true, one_time_keyboard: true } });
const AGE_ROWS = [[7, 8, 9], [10, 11, 12], [13, 14, 15]].map((row) => row.map((n) => cb(String(n), `AGE:${n}`)));
async function startReg(p: Row) {
  if (!p.phone) {
    await saveParent(p, { state: "phone", state_data: {} });
    return await send(p.telegram_id, "📱 Telefon raqamingizni yuboring: pastdagi tugmani bosing yoki raqamni yozing (masalan, 90 123 45 67).", phoneKeyboard());
  }
  if (!p.parent_name) return await askParentName(p);
  return await askChild(p);
}
async function askParentName(p: Row) {
  await saveParent(p, { state: "parent_name" });
  const first = cleanName(String(p.tg_name ?? "").split(" ")[0]);
  return await send(p.telegram_id, "🙂 Ismingiz nima?", first ? inline([[cb(`✅ ${first}`, "NAME")]]) : {});
}
async function askChild(p: Row) {
  await saveParent(p, { state: "child_name", state_data: {} });
  return await send(p.telegram_id, "👦 Farzandingizning ismi?");
}
const askAge = (p: Row) => send(p.telegram_id, `🎂 ${esc(p.state_data?.child_name ?? "Farzandingiz")} necha yoshda?`, inline(AGE_ROWS));
async function gotPhone(p: Row, k: string) {
  await savePhone(p, k);
  await send(p.telegram_id, "✅ Raqam qabul qilindi.", { reply_markup: { remove_keyboard: true } });
  return p.parent_name ? await askChild(p) : await askParentName(p);
}
async function gotAge(p: Row, age: number) {
  await saveParent(p, { state: "lesson", state_data: { ...(p.state_data ?? {}), child_age: age } });
  return await askLessons(p);
}
async function resume(p: Row) {
  switch (p.state) {
    case "phone": return await startReg(p);
    case "parent_name": return await askParentName(p);
    case "child_name": return await askChild(p);
    case "child_age": return await askAge(p);
    case "lesson": return await askLessons(p);
    default:
      await saveParent(p, { state: "done" });
      return await showMenu(p);
  }
}
async function onText(p: Row, text: string) {
  switch (p.state) {
    case "phone": {
      const k = phoneKey(text);
      return k ? await gotPhone(p, k) : await send(p.telegram_id, "Raqamni tushunmadim. Masalan: 90 123 45 67 — yoki «📱 Raqamni yuborish» tugmasini bosing.", phoneKeyboard());
    }
    case "parent_name": {
      const n = cleanName(text);
      if (!n) return await send(p.telegram_id, "Ismni harflar bilan yozing (masalan: Dilnoza).");
      await saveParent(p, { parent_name: n });
      return await askChild(p);
    }
    case "child_name": {
      const n = cleanName(text);
      if (!n) return await send(p.telegram_id, "Farzandingiz ismini harflar bilan yozing (masalan: Ali).");
      await saveParent(p, { state: "child_age", state_data: { child_name: n } });
      return await askAge(p);
    }
    case "child_age": {
      const age = intIn(text.replace(/\D/g, ""), 3, 18);
      return age ? await gotAge(p, age) : await askAge(p);
    }
    case "lesson": return await askLessons(p);
    case "code": return await send(p.telegram_id, "Kod 6 ta raqamdan iborat (masalan, 482193). Administrator bergan kodni yuboring.");
    default: return await showMenu(p);
  }
}

async function askLessons(p: Row, move: Row | null = null, intro = "") {
  const lessons = await openLessons(move ? move.lesson_id : null);
  if (!lessons.length) {
    if (move) return await send(p.telegram_id, "Hozircha boshqa bo‘sh dars yo‘q.", inline([[cb("📋 Mening yozuvlarim", "MENU")]]));
    await toOperators(`sik-nolesson:${p.telegram_id}:${tday()}`, p, "⭐ SIK: yozilmoqchi, lekin bo‘sh sinov darsi yo‘q");
    await ownersAlert("⚠️ <b>Super Intellekt Kids</b>: ota-ona yozilmoqchi, lekin bo‘sh sinov darsi yo‘q.\nBot → «Boshqaruv» → «+ Yangi dars».", `nolesson:${new Date().toISOString().slice(0, 13)}`);
    return await send(p.telegram_id, "😔 Hozircha bo‘sh sinov darsi yo‘q. Yangi kun qo‘shilishi bilan shu yerga xabar beramiz.");
  }
  const rows = lessons.map((l) => [cb(`${fmtDay(l.starts_at)}, ${fmtTime(l.starts_at)} · ${l.free} joy`, move ? `RL:${move.code}:${l.id.slice(0, 8)}` : `L:${l.id.slice(0, 8)}`)]);
  if (move) rows.push([cb("↩️ Orqaga", "MENU")]);
  const head = move ? `🔁 <b>${esc(move.child_name)}</b> uchun yangi kunni tanlang:` : "📅 Sinov darsi kunini tanlang:";
  return await send(p.telegram_id, intro ? `${intro}\n\n${head}` : head, inline(rows));
}
async function pickLesson(p: Row, id8: string) {
  const name = String(p.state_data?.child_name ?? ""), age = intIn(p.state_data?.child_age, 3, 18);
  if (p.state !== "lesson" || !name || !age) return await resumeOrMenu(p);
  const lesson = (await openLessons()).find((l) => l.id.startsWith(id8));
  if (!lesson) return await askLessons(p, null, "Bu darsda joy qolmadi yoki vaqti o‘tdi.");
  const kids = await childrenOf(p.telegram_id);
  const known = kids.find((c) => c.name.toLowerCase() === name.toLowerCase()) ?? null;
  if (known) {
    const live = known.status === "student" ? null : await liveBookingOf(known.id);
    if (known.status === "student" || live) {
      await saveParent(p, { state: "done", state_data: {} });
      return await send(p.telegram_id, known.status === "student" ? `${esc(name)} — allaqachon Super Intellekt Kids o‘quvchisi 🎉` : `${esc(name)} allaqachon yozilgan${live?.lesson ? `: ${fmtWhen(live.lesson.starts_at)}` : ""}. Kunni o‘zgartirish — «Mening yozuvlarim»da.`, inline([[cb("📋 Mening yozuvlarim", "MENU")]]));
    }
  }
  const child = known ?? await newChild(p.telegram_id, name, age);
  const b = await createBooking({
    parent_id: p.telegram_id, child_id: child.id, child_name: name, child_age: age, lesson_id: lesson.id,
    status: "pending_payment", hold_until: iso(Date.now() + HOLD_MIN * 60000), source: p.source ?? null,
  });
  await saveParent(p, { state: "done", state_data: {} });
  if (!dryOut()) await db.from("custom_records").delete().eq("tab_id", CRM_TAB).eq("external_id", `sikp:${p.telegram_id}`);
  await crmBooking(b, p, lesson);
  return await paymentInfo(p, b, lesson);
}
async function paymentInfo(p: Row, b: Row, lesson: Row | null) {
  const s = await settings();
  const price = await priceFor(p, s);
  const { data: pending } = await db.from("sik_bookings").select("id").eq("parent_id", p.telegram_id).eq("status", "pending_payment");
  const n = Math.max(1, (pending ?? []).length);
  const lines = [b.hold_until ? `✅ <b>Joy band qilindi!</b> U ${fmtTime(b.hold_until)} gacha saqlanadi.` : "✅ <b>Joy band qilindi!</b>", "", `👦 ${esc(b.child_name)}, ${b.child_age} yosh`];
  if (lesson) lines.push(`📅 ${fmtWhen(lesson.starts_at)}`);
  if (s.center.address) lines.push(`📍 ${esc(s.center.address)}`);
  lines.push("", `💳 To‘lov: <b>${sum(price)} so‘m</b>${n > 1 ? ` · ${n} ta farzand uchun jami <b>${sum(price * n)} so‘m</b>` : ""}`);
  if (s.card.number) {
    lines.push(`Karta: <code>${esc(s.card.number)}</code>`);
    if (s.card.holder) lines.push(`Egasi: ${esc(s.card.holder)}`);
    lines.push("", "To‘lov qilgach, chek skrinshotini shu chatga yuboring 📸");
  } else {
    lines.push("Karta raqami tez orada shu yerga yuboriladi.");
    await ownersAlert("⚠️ <b>Super Intellekt Kids</b>: karta raqami kiritilmagan — ota-onalar to‘lov qila olmayapti.\nBot → «Boshqaruv» → «Sozlamalar».", `nocard:${new Date().toISOString().slice(0, 13)}`);
  }
  return await send(p.telegram_id, lines.join("\n"), inline([[cb("➕ Yana bir farzandni yozish", "NEW")], [cb("🔁 Boshqa kunni tanlash", `RS:${b.code}`)]]));
}

// ---------- card payments with a check (the Mini App or the bot chat) ----------
// Trial bookings of this parent that wait for the money: held seats, or a lapsed hold whose lesson is still ahead.
async function dueBookings(parentId: number): Promise<Row[]> {
  const { data } = await db.from("sik_bookings").select("*").eq("parent_id", parentId).in("status", ["pending_payment", "expired"]).gte("created_at", iso(Date.now() - 7 * 86400000)).order("created_at");
  const lessons = await lessonsById((data ?? []).map((b: Row) => b.lesson_id));
  const now = Date.now();
  return (data ?? []).filter((b: Row) => b.status === "pending_payment" || (lessons[b.lesson_id] && Date.parse(lessons[b.lesson_id].starts_at) > now));
}
// A reported transfer: trial = the price of every due booking (they wait as check_sent), course = the amount given.
async function newPayment(p: Row, purpose: "trial" | "course", bookings: Row[], o: Row): Promise<Row> {
  const s = await settings();
  const amount = purpose === "trial" ? (await priceFor(p, s)) * bookings.length : Number(o.amount);
  const { data, error } = await db.from("sik_payments").insert({
    parent_id: p.telegram_id, purpose, amount, booking_ids: bookings.map((b) => b.id), source: o.source, method: o.method === "cash" ? "cash" : "card",
    file_path: o.file_path ?? null, file_id: o.file_id ?? null, file_kind: o.file_kind ?? null,
  }).select("*").single();
  if (error || !data) throw new Error(`payment insert ${error?.code}`);
  if (bookings.length) {
    const at = new Date().toISOString();
    await db.from("sik_bookings").update({ status: "check_sent", check_id: data.id, payment_id: data.id, check_sent_at: at, hold_until: null, updated_at: at }).in("id", bookings.map((b) => b.id));
    const lessons = await lessonsById(bookings.map((b) => b.lesson_id));
    for (const b of bookings) await crmBooking({ ...b, status: "check_sent" }, p, lessons[b.lesson_id] ?? null);
  }
  return data;
}
async function payCaption(p: Row, pay: Row) {
  const cash = pay.method === "cash";
  const lines = [`${cash ? "💵" : "💳"} <b>Super Intellekt Kids: ${cash ? "naqd to‘lov so‘rovi" : pay.purpose === "trial" ? "sinov darsi to‘lovi" : "o‘qish uchun to‘lov"}</b>`, `👤 ${esc(parentName(p))} · ${esc(p.phone ?? "")}`];
  if (Array.isArray(pay.booking_ids) && pay.booking_ids.length) {
    const { data: bs } = await db.from("sik_bookings").select("child_name,child_age,code,lesson_id").in("id", pay.booking_ids);
    const lessons = await lessonsById((bs ?? []).map((b: Row) => b.lesson_id));
    for (const b of bs ?? []) { const l = lessons[b.lesson_id]; lines.push(`👦 ${esc(b.child_name)}, ${b.child_age} yosh${l ? ` — ${fmtShort(l.starts_at)}` : ""} · №${b.code}`); }
  }
  lines.push(`💰 Summa: <b>${sum(pay.amount)} so‘m</b>${pay.purpose === "trial" && p.referred_by ? " (do‘st taklifi chegirmasi bilan)" : ""}`, "",
    cash ? "Ota-ona markazda naqd to‘laydi. Pulni qabul qilganingizda tasdiqlang — summa uning balansiga tushadi." : "Kartaga pul tushganini tekshirib, tasdiqlang.");
  return lines.join("\n").slice(0, 900);
}
// Who may take a parent's cash: the owners and the active administrators of «Boshqaruv».
async function cashStaff(): Promise<number[]> {
  const { data } = await db.from("sik_staff").select("telegram_id").eq("status", "active").eq("role", "admin");
  return [...new Set([...(await ownerIds()), ...(data ?? []).map((r: Row) => Number(r.telegram_id))])];
}
// A parent's cash request goes to them with «Qabul qilindi / Rad etish» (also in Boshqaruv → To‘lovlar).
async function sendCashToStaff(p: Row, pay: Row) {
  const text = await payCaption(p, pay);
  const buttons = { inline_keyboard: [[cb("✅ Qabul qilindi", `PAY:OK:${pay.id}`), cb("❌ Rad etish", `PAY:NO:${pay.id}`)]] };
  const sent: Row[] = [];
  for (const chat of await cashStaff()) {
    const r = await send(chat, text, { reply_markup: buttons });
    if (r.ok && r.result?.message_id) sent.push({ chat_id: chat, message_id: r.result.message_id, text: true });
  }
  if (!dryOut()) await db.from("sik_payments").update({ messages: sent }).eq("id", pay.id);
  if (!sent.length) await ownersAlert(`💵 <b>Super Intellekt Kids</b>: naqd to‘lov so‘rovi — ${esc(parentName(p))}, ${sum(pay.amount)} so‘m. Tasdiqlash: ilovada «Boshqaruv» → «To‘lovlar».`, null);
}
const canDecide = (role: string | null, pay: Row | null) => role === "owner" || (role === "admin" && pay?.method === "cash");
// A file for Telegram as multipart (the check photo uploaded in the Mini App).
async function tgUpload(method: string, field: string, bytes: Uint8Array, filename: string, mime: string, fields: Row): Promise<Row> {
  const out = dryOut();
  if (out) { out.push({ method, ...fields, [field]: `<${bytes.length} bytes>` }); return { ok: true, result: { message_id: out.length, photo: [{ file_id: "dry" }] } }; }
  if (!TOKEN) return { ok: false, description: "no_token" };
  try {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, typeof v === "string" ? v : JSON.stringify(v));
    fd.append(field, new Blob([bytes], { type: mime }), filename);
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, { method: "POST", body: fd, signal: AbortSignal.timeout(20000) });
    const j = await r.json().catch(() => ({ ok: false, description: `http ${r.status}` }));
    if (!j.ok) console.error("telegram", method, String(j.description ?? "").slice(0, 120));
    return j;
  } catch {
    console.error("telegram upload failed", method);
    return { ok: false, description: "network" };
  }
}
// The check goes to every owner with «Tasdiqlash / Rad etish» (also in Boshqaruv → To‘lovlar).
async function sendCheckToOwners(p: Row, pay: Row, f: { fileId?: string; kind?: string; bytes?: Uint8Array; mime?: string; ext?: string }) {
  const caption = await payCaption(p, pay);
  const buttons = { inline_keyboard: [[cb("✅ Tasdiqlash", `PAY:OK:${pay.id}`), cb("❌ Rad etish", `PAY:NO:${pay.id}`)]] };
  const sent: Row[] = [];
  let fileId = f.fileId ?? null, kind = f.kind ?? "photo";
  for (const chat of await ownerIds()) {
    let r: Row;
    if (!fileId && f.bytes) {
      r = await tgUpload("sendPhoto", "photo", f.bytes, `chek.${f.ext ?? "jpg"}`, f.mime ?? "image/jpeg", { chat_id: String(chat), caption, parse_mode: "HTML", reply_markup: buttons });
      const ph = r.result?.photo;
      if (r.ok && Array.isArray(ph) && ph.length) { fileId = String(ph[ph.length - 1].file_id); kind = "photo"; }
    } else if (fileId) {
      r = await tg(kind === "photo" ? "sendPhoto" : "sendDocument", { chat_id: chat, [kind]: fileId, caption, parse_mode: "HTML", reply_markup: buttons });
    } else continue;
    if (r.ok && r.result?.message_id) sent.push({ chat_id: chat, message_id: r.result.message_id });
  }
  if (!dryOut()) await db.from("sik_payments").update({ messages: sent, ...(fileId && !pay.file_id ? { file_id: fileId, file_kind: kind } : {}) }).eq("id", pay.id);
  if (!sent.length) await ownersAlert(`💳 <b>Super Intellekt Kids</b>: to‘lov cheki (${sum(pay.amount)} so‘m) tasdiqlashni kutmoqda, lekin bot sizga yoza olmadi. Botni oching va /start bosing — yoki ilovada «Boshqaruv» → «To‘lovlar».`, null);
}
// A check photo or file sent to the bot chat covers every booking of this parent that waits for payment.
async function onCheck(p: Row, m: Row) {
  const kind = m.photo ? "photo" : "document";
  const fileId = m.photo ? m.photo[m.photo.length - 1]?.file_id : m.document?.file_id;
  if (!fileId) return;
  const due = await dueBookings(p.telegram_id);
  if (!due.length) {
    const { data: waiting } = await db.from("sik_payments").select("id").eq("parent_id", p.telegram_id).eq("status", "pending").limit(1);
    return await send(p.telegram_id, waiting?.length ? "Chekingiz tekshirilmoqda — biroz kuting 🙏" : "Hozir to‘lov kutilayotgan yozuv yo‘q. O‘qish uchun to‘lov — ilovada: «Hamyon» → «To‘ldirish».", inline([[app("💼 Hamyon", "#wallet")]]));
  }
  const pay = await newPayment(p, "trial", due, { source: "chat", file_id: fileId, file_kind: kind });
  await send(p.telegram_id, "🙏 Rahmat! Chek tekshirilmoqda — odatda 30 daqiqagacha. Tasdiqlangach, shu yerga xabar keladi va Super Ayiq uyg‘onadi.");
  await sendCheckToOwners(p, pay, { fileId, kind });
}
// The owner's word on a check: confirmed = the receipt in the Kvitansiya book, the money on the family's balance,
// the trial bookings paid (Lite opens); rejected = the bookings wait for a new check (2 more hours).
async function decidePayment(id: string, ok: boolean, by: number, byName: string): Promise<{ done: boolean; status: string; receipt?: Row | null }> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return { done: false, status: "missing" };
  const at = new Date().toISOString();
  const { data: rows } = await db.from("sik_payments").update({ status: ok ? "confirmed" : "rejected", decided_by: by, decided_at: at }).eq("id", id).eq("status", "pending").select("*");
  const pay = rows?.[0];
  if (!pay) {
    const { data: was } = await db.from("sik_payments").select("status").eq("id", id).maybeSingle();
    return { done: false, status: was?.status ?? "missing" };
  }
  const p = await parentOf(pay.parent_id) ?? { telegram_id: pay.parent_id };
  const ids: string[] = Array.isArray(pay.booking_ids) ? pay.booking_ids : [];
  const { data: found } = ids.length ? await db.from("sik_bookings").select("*").in("id", ids) : { data: [] };
  const bs: Row[] = (found ?? []).filter((b: Row) => b.status === "check_sent" && b.check_id === pay.id);
  const lessons = await lessonsById(bs.map((b) => b.lesson_id));
  const amount = Number(pay.amount), cash = pay.method === "cash";
  let receipt: Receipt | null = null;
  if (ok) {
    const kids = bs.length ? bs.map((b) => b.child_name) : (await childrenOf(pay.parent_id)).map((c) => c.name);
    receipt = await kvReceipt({ payer: parentName(p), child: kids.join(", "), phone: p.phone ?? null, trial: pay.purpose === "trial", amount, method: cash ? "Naqd" : "Karta", paidAt: cash ? at : pay.created_at });
    if (realReceiptId(receipt)) await db.from("sik_payments").update({ receipt_id: realReceiptId(receipt) }).eq("id", pay.id);
    await moneyLine({
      parent_id: pay.parent_id, kind: cash ? "cash" : "payment", amount, ref: `pay:${pay.id}`, payment_id: pay.id, receipt_id: realReceiptId(receipt), created_by: by,
      note: `${pay.purpose === "trial" ? "Sinov darsi to‘lovi" : "O‘qish uchun to‘lov"} (${cash ? "naqd" : "karta"})`,
    });
    const each = bs.length ? Math.round(amount / bs.length) : 0;
    for (const b of bs) { await bookingPaid(b, lessons[b.lesson_id] ?? null, by, each, pay.id); await crmBooking(b, p, lessons[b.lesson_id] ?? null); }
    const balance = dryOut() ? 0 : await moneyBalance(pay.parent_id);
    if (pay.purpose === "trial" && bs.length) await paidMessage(p, bs, lessons, receipt, balance);
    else await send(pay.parent_id, [`✅ <b>To‘lov qabul qilindi:</b> +${sum(amount)} so‘m${cash ? " (naqd)" : ""}`, `💼 Balans: <b>${sum(balance)} so‘m</b>`, receipt ? `🧾 Kvitansiya №${kvNo(receipt.number)}` : ""].filter(Boolean).join("\n"), inline([[app("💼 Hamyon", "#wallet")]]));
    await notice(pay.parent_id, "payment", pay.purpose === "trial" ? "Sinov darsi to‘lovi tasdiqlandi" : cash ? "Naqd to‘lov qabul qilindi" : "To‘lov qabul qilindi", `+${sum(amount)} so‘m · balans ${sum(balance)} so‘m`, { amount, receipt: receipt?.view ?? null });
  } else if (cash) {
    await send(pay.parent_id, `😔 Naqd to‘lov so‘rovi (${sum(amount)} so‘m) bekor qilindi. Savol bo‘lsa, administratorga murojaat qiling.`, inline([[app("💼 Hamyon", "#wallet")]]));
    await notice(pay.parent_id, "payment_rejected", "Naqd to‘lov so‘rovi bekor qilindi", `${sum(amount)} so‘m · savol bo‘lsa, administratorga murojaat qiling.`, { amount });
  } else {
    const hold = iso(Date.now() + HOLD_MIN * 60000);
    for (const b of bs) {
      const patch = { status: "pending_payment", check_id: null, hold_until: hold, rejected_count: (b.rejected_count ?? 0) + 1, updated_at: at };
      await db.from("sik_bookings").update(patch).eq("id", b.id).eq("status", "check_sent");
      Object.assign(b, patch);
      await crmBooking(b, p, lessons[b.lesson_id] ?? null);
    }
    await send(pay.parent_id, `😔 To‘lov tasdiqlanmadi — kartaga mablag‘ tushgani ko‘rinmadi. Chekni tekshirib, qayta yuboring.${bs.length ? " Joy yana 2 soat saqlanadi." : ""}`, inline([[app("💳 Qayta yuborish", pay.purpose === "trial" ? "" : "#wallet")]]));
    await notice(pay.parent_id, "payment_rejected", "To‘lov tasdiqlanmadi", `${sum(amount)} so‘m: kartaga mablag‘ tushgani ko‘rinmadi. Chekni tekshirib, qayta yuboring.`, { amount });
  }
  const caption = `${await payCaption(p, pay)}\n\n${ok ? (cash ? "✅ Pul qabul qilindi" : "✅ Tasdiqlandi") : "❌ Rad etildi"} — ${esc(byName)}, ${fmtShort(at)}${receipt ? ` · Kvitansiya №${kvNo(receipt.number)}` : ""}`;
  await closeStaffMessages(pay, caption);
  return { done: true, status: ok ? "confirmed" : "rejected", receipt: receipt?.view ?? null };
}
// The copies the owners and administrators got (a photo with a caption, or a text for a cash request) lose their buttons.
async function closeStaffMessages(pay: Row, text: string) {
  for (const c of Array.isArray(pay.messages) ? pay.messages : []) {
    if (c.text) await tg("editMessageText", { chat_id: c.chat_id, message_id: c.message_id, text: text.slice(0, 4096), parse_mode: "HTML", reply_markup: { inline_keyboard: [] } });
    else await tg("editMessageCaption", { chat_id: c.chat_id, message_id: c.message_id, caption: text.slice(0, 1024), parse_mode: "HTML", reply_markup: { inline_keyboard: [] } });
  }
}
// An administrator took cash: the owners hear about it (the money is in the administrator's hands).
async function cashTakenAlert(byName: string, pay: Row | null, r: Row) {
  if (!pay || pay.method !== "cash" || r.status !== "confirmed") return;
  const p = await parentOf(Number(pay.parent_id));
  await ownersAlert(`💵 <b>Super Intellekt Kids</b>: administrator ${esc(byName)} naqd pul qabul qildi — ${esc(parentName(p ?? {}))}, ${sum(Number(pay.amount))} so‘m${r.receipt ? ` (Kvitansiya №${esc(r.receipt.no)})` : ""}. Pul sizga yetib kelganini tekshiring.`, null);
}

async function onCallback(cq: Row) {
  const data = String(cq.data ?? "");
  if (!cq.from) return;
  if (data.startsWith("PAY:")) { const [, d, id] = data.split(":"); return await payDecision(cq, d === "OK", id ?? ""); }
  if (data.startsWith("ST:")) { const [, d, id] = data.split(":"); return await staffDecision(cq, d === "OK", Number(id)); }
  await answer(cq);
  const p = await touchParent(cq.from);
  if (data === "REG") return await startReg(p);
  if (data === "CODE") { await saveParent(p, { state: "code" }); return await send(p.telegram_id, "🔢 Administrator bergan 6 xonali kodni yuboring."); }
  if (data === "NEW") return p.phone && p.parent_name ? await askChild(p) : await startReg(p);
  if (data === "MENU") return await showMenu(p);
  if (data === "NAME") {
    const n = cleanName(String(p.tg_name ?? "").split(" ")[0]);
    if (p.state !== "parent_name" || !n) return await resumeOrMenu(p);
    await saveParent(p, { parent_name: n });
    return await askChild(p);
  }
  if (data.startsWith("AGE:")) { const age = intIn(data.slice(4), 3, 18); return p.state === "child_age" && age ? await gotAge(p, age) : await resumeOrMenu(p); }
  if (data.startsWith("L:")) return await pickLesson(p, data.slice(2));
  const [kind, code, extra] = data.split(":");
  const b = code ? await bookingByCode(code, p.telegram_id) : null;
  if (!b) return await showMenu(p);
  if (kind === "RS") return await startMove(p, b);
  if (kind === "RL") return await doMove(p, b, extra ?? "");
  if (kind === "PI") return b.status === "pending_payment" ? await paymentInfo(p, b, b.lesson) : await showMenu(p);
  if (kind === "MAIN") return await wantMain(p, b);
  if (kind === "RB") return await rebook(p, b);
  return await showMenu(p);
}

// A card check: the owner only. A cash request: the owner or an administrator (who then holds the money).
async function payDecision(cq: Row, ok: boolean, id: string) {
  const role = await roleOf(cq.from.id);
  const { data: pay } = /^[0-9a-f-]{36}$/.test(id) ? await db.from("sik_payments").select("method,amount,parent_id").eq("id", id).maybeSingle() : { data: null };
  if (!canDecide(role, pay)) return await answer(cq, pay?.method === "cash" ? "Faqat administrator yoki egasi" : "Faqat egasi tasdiqlaydi");
  const who = [cq.from.first_name, cq.from.last_name].filter(Boolean).join(" ") || (role === "owner" ? "Egasi" : "Administrator");
  const r = await decidePayment(id, ok, cq.from.id, who);
  if (cq.message) await tg("editMessageReplyMarkup", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [] } });
  if (!r.done) return await answer(cq, r.status === "missing" ? "To‘lov topilmadi" : "Bu to‘lov allaqachon ko‘rib chiqilgan");
  if (role !== "owner") await cashTakenAlert(who, pay, r);
  return await answer(cq, ok ? "Tasdiqlandi ✅" : "Rad etildi");
}
async function paidMessage(p: Row, list: Row[], lessons: Record<string, Row>, receipt: Receipt | null, balance: number) {
  const s = await settings();
  const lines = ["🎉 <b>To‘lov tasdiqlandi!</b>", ""];
  for (const b of list) { const l = lessons[b.lesson_id]; lines.push(`👦 ${esc(b.child_name)} — ${l ? fmtWhen(l.starts_at) : "dars kuni keyinroq aytiladi"}`); }
  lines.push(...centerLines(s));
  if (receipt) lines.push("", `🧾 Kvitansiya №${kvNo(receipt.number)} · balans ${sum(balance)} so‘m (1-oy to‘loviga hisoblanadi)`);
  if (list[0]?.access_until) lines.push("", `🐻 Super Ayiq uyg‘ondi! Har kuni 1 ta tez aytish — ayiqcha o‘sadi. Ilova ${fmtWhen(list[0].access_until)} gacha ochiq.`);
  return await send(p.telegram_id, lines.join("\n"), inline([[app("🐻 Super Ayiq’ni ochish")]]));
}

const STATUS_LINE: Record<string, string> = {
  pending_payment: "⏳ To‘lov kutilmoqda", check_sent: "🔎 Chek tekshirilmoqda", paid: "✅ To‘langan", attended: "🎓 Darsga keldi",
  no_show: "😔 Darsga kelmadi", converted: "🎉 Asosiy kursda", expired: "⌛ Bron muddati o‘tdi",
};
async function showMenu(p: Row) {
  const [list, kids] = await Promise.all([parentBookings(p.telegram_id), childrenOf(p.telegram_id)]);
  if (!list.length && !kids.length) return await welcome(p);
  const now = Date.now();
  const lines = ["📋 <b>Yozuvlaringiz</b>", ""];
  const rows: Row[][] = [];
  let open = false;
  for (const c of kids) {
    const ok = childOpen(c, now);
    if (ok) open = true;
    lines.push(`🐻 <b>${esc(c.name)}</b> — ${c.status === "student" ? "o‘quvchi" : ok ? `Super Ayiq ${fmtShort(c.access_until)} gacha ochiq` : c.status === "trial" ? "sinov muddati tugadi" : "to‘lovdan keyin ochiladi"}`);
  }
  if (list.length) lines.push("");
  for (const b of list.slice(0, 6)) {
    let st = STATUS_LINE[b.status] ?? b.status;
    if (b.status === "pending_payment" && b.hold_until) st += ` (${fmtTime(b.hold_until)} gacha)`;
    if (b.want_main_at && b.status !== "converted") st += " · asosiy kursga ariza berilgan";
    lines.push(`📅 ${esc(b.child_name)}${b.lesson ? ` — ${fmtWhen(b.lesson.starts_at)}` : ""}`, `    ${st}`);
    if (b.status === "pending_payment") rows.push([cb(`💳 ${b.child_name}: to‘lov ma’lumoti`, `PI:${b.code}`)]);
    if (canMove(b, now)) rows.push([cb(`🔁 ${b.child_name}: darsni ko‘chirish`, `RS:${b.code}`)]);
    if (["attended", "no_show"].includes(b.status) && !b.want_main_at) rows.push([cb(`✅ ${b.child_name}: asosiy kursga yozilish`, `MAIN:${b.code}`)]);
    if (b.status === "expired") rows.push([cb(`🔄 ${b.child_name}: qayta band qilish`, `RB:${b.code}`)]);
  }
  if (open) rows.unshift([app("🐻 Super Ayiq’ni ochish")]);
  rows.push([cb("➕ Yana bir farzandni yozish", "NEW")]);
  return await send(p.telegram_id, lines.join("\n"), inline(rows));
}
async function startMove(p: Row, b: Row) {
  if (!canMove(b)) {
    const late = b.lesson && Date.parse(b.lesson.starts_at) - Date.now() < MOVE_BEFORE_MIN * 60000;
    return await send(p.telegram_id, b.status === "paid" && !late && (b.reschedules ?? 0) >= 1 ? "Bepul ko‘chirish allaqachon ishlatilgan. Savol bo‘lsa, operatorimiz yordam beradi." : late ? "Darsga 3 soatdan kam vaqt qoldi — endi ko‘chirib bo‘lmaydi." : "Bu yozuvni ko‘chirib bo‘lmaydi.");
  }
  return await askLessons(p, b);
}
async function doMove(p: Row, b: Row, id8: string) {
  if (!canMove(b)) return await startMove(p, b);
  const lesson = (await openLessons(b.lesson_id)).find((l) => l.id.startsWith(id8));
  if (!lesson) return await askLessons(p, b, "Bu darsda joy qolmadi.");
  await moveBooking(b, lesson);
  await crmBooking(b, p, lesson);
  return await send(p.telegram_id, `✅ Dars ko‘chirildi: <b>${esc(b.child_name)}</b> — ${fmtWhen(lesson.starts_at)}${b.status === "paid" ? "\nBepul ko‘chirish ishlatildi." : ""}`, inline([[cb("📋 Mening yozuvlarim", "MENU")]]));
}
// Another lesson for a booking (the one free reschedule of a paid one moves Lite and the credit along).
async function moveBooking(b: Row, lesson: Row) {
  const patch: Row = { lesson_id: lesson.id, updated_at: new Date().toISOString() };
  if (b.status === "paid") {
    const until = lessonEnd(lesson) + AFTER_MS;
    Object.assign(patch, { reschedules: (b.reschedules ?? 0) + 1, access_until: iso(until), credit_until: iso(until) });
    const child = b.child_id ? await childById(b.child_id) : null;
    if (child) await openTrial(child, until);
  }
  await db.from("sik_bookings").update(patch).eq("id", b.id);
  await db.from("sik_sent").delete().eq("booking_id", b.id).in("kind", ["r24", "r2"]);
  Object.assign(b, patch, { lesson });
}
async function rebook(p: Row, b: Row) {
  if (b.status !== "expired") return await showMenu(p);
  await saveParent(p, { state: "lesson", state_data: { child_name: b.child_name, child_age: b.child_age } });
  return await askLessons(p);
}
async function wantMain(p: Row, b: Row) {
  if (b.status === "converted") return await send(p.telegram_id, "Farzandingiz allaqachon asosiy kursda 🎉");
  if (!PAID.includes(b.status)) return await send(p.telegram_id, "Avval sinov paketini to‘lang — keyin asosiy kursga yozilish mumkin.");
  const s = await settings();
  const o = offer(s, b);
  if (!b.want_main_at) {
    const at = new Date().toISOString();
    await db.from("sik_bookings").update({ want_main_at: at, updated_at: at }).eq("id", b.id);
    b.want_main_at = at;
    await crmBooking(b, p, b.lesson ?? null);
    await toOperators(`sik-main:${b.id}`, p, `⭐ SIK: ASOSIY KURSGA YOZILMOQCHI · ${b.child_name}, ${b.child_age} yosh · 1-oy ${sum(o.final)} so‘m`);
    await ownersAlert(["⭐ <b>Super Intellekt Kids → asosiy kurs</b>", `👤 ${esc(parentName(p))} · ${esc(p.phone ?? "")}`, `👦 ${esc(b.child_name)}, ${b.child_age} yosh`, `💰 1-oy: ${sum(o.final)} so‘m${o.credit ? " (99 000 hisobga olingan)" : ""}`, "", `<a href="${CRM_SITE}">CRM</a> → «Super Intellekt Kids»`].join("\n"), null);
  }
  return await send(p.telegram_id, `✅ Rahmat! Operatorimiz tez orada qo‘ng‘iroq qilib, guruh va vaqtni kelishib oladi.${o.credit && o.until ? `\n🎁 ${sum(o.credit)} so‘m chegirma ${fmtWhen(o.until)} gacha saqlanadi.` : ""}`);
}

// ---------- the administrator's family invite (QR / link / 6-digit code) ----------
async function redeemInvite(p: Row, code: string) {
  const day = tday();
  if (p.code_fail_day === day && Number(p.code_fails) >= CODE_TRIES) return await send(p.telegram_id, "Bugun juda ko‘p noto‘g‘ri kod yuborildi. Ertaga qayta urinib ko‘ring yoki administratordan havolani Telegram orqali yuborishni so‘rang.");
  const { data: inv } = await db.from("sik_invites").select("*").eq("code", code).maybeSingle();
  const mine = !!inv?.used_by && Number(inv.used_by) === Number(p.telegram_id);
  if (!inv || (inv.used_by && !mine)) {
    await saveParent(p, { code_fails: p.code_fail_day === day ? Number(p.code_fails || 0) + 1 : 1, code_fail_day: day });
    return await send(p.telegram_id, inv ? "Bu kod allaqachon ishlatilgan. Administratordan yangi kod so‘rang." : "Bunday kod topilmadi. Kodni tekshirib qayta yuboring yoki administratordan so‘rang.");
  }
  if (mine) return await showMenu(p);
  if (Date.parse(inv.created_at) < Date.now() - INVITE_DAYS * 86400000) return await send(p.telegram_id, "Bu kodning muddati o‘tgan. Administratordan yangi kod so‘rang.");
  const kidsBefore = await childrenOf(p.telegram_id);
  const at = new Date().toISOString();
  const { data: took } = await db.from("sik_invites").update({ used_by: p.telegram_id, used_at: at }).eq("code", code).is("used_by", null).select("code");
  if (!took?.length) return await send(p.telegram_id, "Bu kod allaqachon ishlatilgan. Administratordan yangi kod so‘rang.");
  const k = phoneKey(inv.phone);
  await saveParent(p, { parent_name: p.parent_name ?? inv.parent_name ?? null, ...(k && !p.phone ? { phone: `+998${k}`, phone_key: k } : {}), source: p.source ?? "admin", state: "done", state_data: {} });
  const lesson = inv.lesson_id ? (await lessonsById([inv.lesson_id]))[inv.lesson_id] ?? null : null;
  const price = (await settings()).prices.price;
  const made: Row[] = [];
  let paidCount = 0;
  for (const raw of Array.isArray(inv.children) ? inv.children : []) {
    const name = cleanName(raw?.name), age = intIn(raw?.age, 3, 18);
    if (!name || !age) continue;
    const child = kidsBefore.find((c) => c.name.toLowerCase() === name.toLowerCase()) ?? await newChild(p.telegram_id, name, age);
    let b: Row | null = child.status === "student" ? null : await liveBookingOf(child.id);
    if (child.status === "student" || b) { made.push({ child, b }); continue; }
    if (lesson) {
      b = await createBooking({ parent_id: p.telegram_id, child_id: child.id, child_name: name, child_age: age, lesson_id: lesson.id, status: inv.paid ? "paid" : "pending_payment", hold_until: inv.paid ? null : iso(Date.now() + HOLD_MIN * 60000), source: "admin" });
      if (inv.paid) { await bookingPaid(b, lesson, Number(inv.created_by) || null, price); paidCount++; }
      await crmBooking(b, p, lesson);
    } else if (inv.paid) { await openTrial(child, Date.now() + AFTER_MS); paidCount++; }
    made.push({ child, b });
  }
  if (!made.length) return await showMenu(p);
  const names = made.map((x) => esc(x.child.name)).join(", ");
  if (inv.paid) {
    // The cash the administrator took at the meeting: a receipt and the family's balance (as a card payment would).
    if (paidCount) {
      const amount = price * paidCount;
      const receipt = await kvReceipt({ payer: parentName(p), child: made.map((x) => x.child.name).join(", "), phone: p.phone ?? null, trial: true, amount, method: "Naqd", paidAt: inv.created_at });
      if (await moneyLine({ parent_id: p.telegram_id, kind: "cash", amount, note: "Sinov darsi to‘lovi (naqd)", ref: `inv:${inv.code}`, receipt_id: realReceiptId(receipt), created_by: Number(inv.created_by) || null })) {
        await notice(p.telegram_id, "payment", "Sinov darsi to‘lovi qabul qilindi", `+${sum(amount)} so‘m (naqd)`, { amount, receipt: receipt?.view ?? null });
      }
    }
    const until = made.map((x) => x.child.access_until).filter(Boolean).sort().pop();
    return await send(p.telegram_id, [`✅ Xush kelibsiz, ${esc(parentName(p))}!`, `<b>${names}</b> — Super Intellekt Kids oilasida.`, lesson ? `📅 Sinov darsi: ${fmtWhen(lesson.starts_at)}` : "", "", `🐻 Super Ayiq uyg‘ondi! Har kuni 1 ta tez aytish — ayiqcha o‘sadi.${until ? ` Ilova ${fmtWhen(until)} gacha ochiq.` : ""}`].filter((x) => x !== "").join("\n"), inline([[app("🐻 Super Ayiq’ni ochish")]]));
  }
  return await send(p.telegram_id, `✅ Xush kelibsiz, ${esc(parentName(p))}! <b>${names}</b> ro‘yxatga olindi.\n${made[0].b ? "📅 Joy band qilindi — to‘lov va chek ilovada." : "📅 Sinov darsi kuni va to‘lov — ilovada."}`, inline([[app("🐻 Super Ayiq’ni ochish")]]));
}

// ---------- staff ----------
async function teacherRequest(p: Row) {
  if (await roleOf(p.telegram_id)) return await send(p.telegram_id, "Sizda «Boshqaruv» ochiq ✅", inline([[app("📋 Boshqaruv", "#staff")]]));
  const { data: found } = await db.from("sik_staff").select("status").eq("telegram_id", p.telegram_id).maybeSingle();
  if (found?.status === "pending") return await send(p.telegram_id, "So‘rovingiz egasiga yuborilgan — tasdiqlashini kuting 🙏");
  await db.from("sik_staff").upsert({ telegram_id: p.telegram_id, role: "teacher", name: p.tg_name, username: p.username, status: "pending", created_at: new Date().toISOString(), decided_at: null, decided_by: null });
  const text = `👩‍🏫 <b>Super Intellekt Kids: xodim so‘rovi</b>\n${esc(p.tg_name ?? "")}${p.username ? ` (@${esc(p.username)})` : ""}\n\nTasdiqlasangiz, u darslarni ko‘rib, «Keldi» belgilab, hisobot yubora oladi. Administrator qilish — «Boshqaruv» → «Xodimlar».`;
  let delivered = 0;
  for (const chat of await ownerIds()) { const r = await send(chat, text, inline([[cb("✅ Tasdiqlash", `ST:OK:${p.telegram_id}`), cb("❌ Rad etish", `ST:NO:${p.telegram_id}`)]])); if (r.ok) delivered++; }
  if (!delivered) await ownersAlert(`${text}\n\nTasdiqlash: bot → «Boshqaruv» → «Xodimlar».`, null);
  return await send(p.telegram_id, "✅ So‘rov yuborildi. Egasi tasdiqlagach, «Boshqaruv» ochiladi.");
}
async function staffDecision(cq: Row, ok: boolean, id: number) {
  if (!(await ownerIds()).includes(cq.from.id)) return await answer(cq, "Faqat egasi");
  if (!Number.isSafeInteger(id) || id <= 0) return await answer(cq);
  await setStaff(id, ok ? "active" : "removed", null, cq.from.id);
  if (cq.message) await tg("editMessageText", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, text: `${esc(cq.message.text ?? "")}\n\n${ok ? "✅ Tasdiqlandi" : "❌ Rad etildi"}`, parse_mode: "HTML" });
  return await answer(cq, ok ? "Tasdiqlandi" : "Rad etildi");
}
async function setStaff(id: number, status: string, role: string | null, by: number) {
  await db.from("sik_staff").update({ status, ...(role ? { role } : {}), decided_at: new Date().toISOString(), decided_by: by }).eq("telegram_id", id);
  if (status === "active") await send(id, "✅ Siz Super Intellekt Kids xodimisiz. Darslar, «Keldi» va hisobotlar — «Boshqaruv»da.", inline([[app("📋 Boshqaruv", "#staff")]]));
}
async function adminButton(p: Row) {
  return (await roleOf(p.telegram_id)) ? await send(p.telegram_id, "📋 Boshqaruv:", inline([[app("📋 Boshqaruv", "#staff")]])) : await send(p.telegram_id, "Bu bo‘lim faqat xodimlar uchun. Xodim bo‘lsangiz, /ustoz yuboring.");
}

// ---------- the daily DZ, reported by tez-aytish-api ----------
// probe: may this Telegram user run a voice check now (an open child), and is today's DZ done?
// Otherwise a checked try: the first passed try of the Tashkent day counts (5 + stars); a better try later the same
// day adds the missing stars, so a day gives at most 8 points; every 7th day in a row adds 20.
async function dzHook(req: Request): Promise<Response> {
  if (!TOKEN || !constEq(req.headers.get("x-sik-dz") ?? "", await sha256Hex(`sik-dz:${TOKEN}`))) return json({ ok: false, error: "forbidden" }, 403);
  const body = await req.json().catch(() => null);
  const tgId = Number(body?.tg);
  if (!body || typeof body !== "object" || !Number.isSafeInteger(tgId) || tgId <= 0) return json({ ok: false, error: "bad" }, 400);
  const childId = String(body.child ?? "");
  if (body.probe === true) return json(await probeDz(tgId, childId));
  const stars = intIn(body.stars, 0, 3), twister = intIn(body.twister, 1, 100000);
  if (stars === null) return json({ ok: false, error: "bad" }, 400);
  return json(await recordDz(tgId, childId, twister, stars, body.passed === true));
}
async function openChildFor(tgId: number, childId: string, now = Date.now()): Promise<Row | null> {
  const kids = (await childrenOf(tgId)).filter((c) => childOpen(c, now));
  return childId ? kids.find((k) => k.id === childId) ?? null : kids[0] ?? null;
}
async function probeDz(tgId: number, childId: string) {
  const c = await openChildFor(tgId, childId);
  if (!c) return { ok: true, open: false };
  const { data: had } = await db.from("sik_dz").select("stars").eq("child_id", c.id).eq("day", tday()).maybeSingle();
  return { ok: true, open: true, child: c.id, name: c.name, age: c.age, done: had ? Number(had.stars) : null };
}
async function recordDz(tgId: number, childId: string, twister: number | null, stars: number, passed: boolean) {
  const now = Date.now();
  const c = await openChildFor(tgId, childId, now);
  if (!c) return { ok: false, error: "no_access" };
  if (stars < 1 && !passed) return { ok: true, recorded: false, retry: true, child: c.id };
  const day = tday(now);
  const before = await pointsOf(c.id);
  const { data: had } = await db.from("sik_dz").select("stars,points").eq("child_id", c.id).eq("day", day).maybeSingle();
  if (had) {
    if (stars <= Number(had.stars)) return { ok: true, recorded: false, already: true, child: c.id, stars: had.stars, total: before, level: levelOf(before) };
    const { data: up } = await db.from("sik_dz").update({ stars, points: DZ_BASE + stars, twister_id: twister }).eq("child_id", c.id).eq("day", day).lt("stars", stars).select("child_id");
    if (!up?.length) return { ok: true, recorded: false, already: true, child: c.id, total: before, level: levelOf(before) };
    const add = stars - Number(had.stars);
    await award(c.id, "dz", add, `dz:${day}:${stars}`, `Tez aytish ${stars}⭐`);
    const total = before + add, level = levelOf(total), levelUp = level > levelOf(before);
    if (levelUp) {
      await send(tgId, `🐻 ${esc(c.bear_name)} o‘sdi: <b>${level}-daraja — ${LEVEL_NAMES[level - 1]}</b>! (${esc(c.name)}, ${stars}⭐)`, inline([[app("🐻 Super Ayiq")]]));
      await notice(tgId, "level", `${level}-daraja: ${LEVEL_NAMES[level - 1]}`, `${c.bear_name} o‘sdi (${c.name})`, { level }, c.id);
    }
    return { ok: true, recorded: true, upgraded: true, child: c.id, stars, points: add, total, level, levelUp };
  }
  const pts = DZ_BASE + stars;
  const { error } = await db.from("sik_dz").insert({ child_id: c.id, day, twister_id: twister, stars, points: pts });
  if (error) return { ok: true, recorded: false, already: true, child: c.id, total: before, level: levelOf(before) };
  await award(c.id, "dz", pts, `dz:${day}`, `Tez aytish ${stars}⭐`);
  const streak = await streakOf(c.id, day);
  let bonus = 0;
  if (streak > 0 && streak % STREAK_DAYS === 0 && await award(c.id, "streak", STREAK_BONUS, `streak:${day}`, `${streak} kun ketma-ket`)) bonus = STREAK_BONUS;
  const total = before + pts + bonus, level = levelOf(total), levelUp = level > levelOf(before);
  const lines = [`🎙 <b>${esc(c.name)}</b> bugungi tez aytishni ${stars ? `${"⭐".repeat(stars)} bilan aytdi` : "aytdi"}: <b>+${pts} ball</b>`];
  if (bonus) lines.push(`🔥 ${streak} kun ketma-ket — yana <b>+${bonus} ball</b>!`);
  else if (streak > 1) lines.push(`🔥 ${streak} kun ketma-ket`);
  lines.push(levelUp ? `🐻 ${esc(c.bear_name)} o‘sdi: <b>${level}-daraja — ${LEVEL_NAMES[level - 1]}</b>!` : `🐻 ${esc(c.bear_name)}: ${level}-daraja · jami ${total} ball`);
  await send(tgId, lines.join("\n"), inline([[app("🐻 Super Ayiq")]]));
  await notice(tgId, "dz", `+${pts + bonus} ball`, `${c.name}: bugungi tez aytish ${stars ? "⭐".repeat(stars) : "aytildi"}${bonus ? ` · ${streak} kun ketma-ket +${bonus}` : ""}${levelUp ? ` · ${level}-daraja: ${LEVEL_NAMES[level - 1]}!` : ""}`, { stars, points: pts + bonus }, c.id);
  return { ok: true, recorded: true, child: c.id, stars, points: pts, bonus, streak, total, level, levelUp };
}

// ---------- tick (pg_cron, every 5 minutes) ----------
async function tick() {
  const now = Date.now();
  const out: Record<string, number> = { expired: 0, hold1: 0, r24: 0, r2: 0, offer0: 0, offer12: 0, closed: 0, abandoned: 0, evening: 0, weekly: 0, referrals: 0, prize: 0, trial: 0 };
  const s = await settings();
  const parents = new Map<number, Row | null>();
  const parent = async (id: number) => { if (!parents.has(id)) parents.set(id, await parentOf(id)); return parents.get(id) ?? null; };

  const { data: held } = await db.from("sik_bookings").select("*").eq("status", "pending_payment").lt("hold_until", iso(now + 60 * 60000)).limit(100);
  const heldLessons = await lessonsById((held ?? []).map((b: Row) => b.lesson_id));
  for (const b of held ?? []) {
    const p = await parent(b.parent_id);
    if (!p) continue;
    if (Date.parse(b.hold_until) <= now) {
      if (!dryOut()) {
        const { data: done } = await db.from("sik_bookings").update({ status: "expired", updated_at: iso(now) }).eq("id", b.id).eq("status", "pending_payment").select("id");
        if (!done?.length) continue;
      }
      b.status = "expired";
      out.expired++;
      await crmBooking(b, p, heldLessons[b.lesson_id] ?? null);
      await send(p.telegram_id, `⌛ <b>${esc(b.child_name)}</b> uchun bron muddati tugadi va joy bo‘shatildi.\nTo‘lov qilgan bo‘lsangiz, chekni ilovada yoki shu yerga yuboring — tekshiramiz.`, inline([[app("🐻 Qayta band qilish")]]));
      await notice(p.telegram_id, "lesson", "Bron muddati tugadi", `${b.child_name}: joy bo‘shatildi. To‘lov qilgan bo‘lsangiz, chekni yuboring.`, {}, b.child_id ?? null);
      await toOperators(`sik-unpaid:${b.id}`, p, `⭐ SIK: to‘lov qilmadi (bron muddati o‘tdi) · ${b.child_name}, ${b.child_age} yosh`);
    } else if (await claim(b.id, "hold1")) {
      out.hold1++;
      await send(p.telegram_id, `⏳ <b>${esc(b.child_name)}</b> uchun joy yana 1 soat saqlanadi. To‘lov chekini yuborishni unutmang 📸`, inline([[cb("💳 To‘lov ma’lumoti", `PI:${b.code}`)]]));
    }
  }

  // Paid trials whose Lite is open or closed less than a day ago (access_until = lesson end + 48 h).
  const { data: active } = await db.from("sik_bookings").select("*").in("status", ["paid", "attended", "no_show"]).gt("access_until", iso(now - 24 * 3600_000)).order("access_until").limit(500);
  const lessons = await lessonsById((active ?? []).map((b: Row) => b.lesson_id));
  for (const b of active ?? []) {
    const l = lessons[b.lesson_id];
    if (!l || l.status === "cancelled") continue;
    const start = Date.parse(l.starts_at), end = lessonEnd(l);
    if (b.status === "paid" && start > now) {
      const p = await parent(b.parent_id);
      if (!p) continue;
      if (start - now <= 2 * 3600_000) {
        if (await claim(b.id, "r2")) { out.r2++; await send(p.telegram_id, [`🔔 <b>2 soatdan keyin sinov darsi!</b>`, `👦 ${esc(b.child_name)} — bugun ${fmtTime(l.starts_at)}`, ...centerLines(s), "", "Kechikmang — dars o‘z vaqtida boshlanadi 🙂"].join("\n")); }
      } else if (start - now <= 24 * 3600_000 && start - Date.parse(b.paid_at ?? b.created_at) > 26 * 3600_000) {
        if (await claim(b.id, "r24")) {
          out.r24++;
          await send(p.telegram_id, [`⏰ <b>Eslatma: sinov darsi yaqin!</b>`, `👦 ${esc(b.child_name)} — ${fmtWhen(l.starts_at)}`, ...centerLines(s), "", "Super Ayiq bilan bugungi tez aytishni ham unutmang 😉"].join("\n"), inline([[app("🐻 Super Ayiq")]]));
          await notice(p.telegram_id, "lesson", "Sinov darsi yaqin", `${b.child_name} — ${fmtWhen(l.starts_at)}${s.center.address ? ` · ${s.center.address}` : ""}`, {}, b.child_id ?? null);
        }
      }
      continue;
    }
    if (start > now) continue;
    const offerButtons = inline([...(b.want_main_at ? [] : [[cb("✅ Asosiy kursga yozilish", `MAIN:${b.code}`)]]), [app("🐻 Super Ayiq")]]);
    if (b.access_until && Date.parse(b.access_until) <= now) {
      const child = b.child_id ? await childById(b.child_id) : null;
      if (child && childOpen(child, now)) continue; // still open: a later booking or the main course
      if (await claim(b.id, "closed")) {
        const p = await parent(b.parent_id);
        if (!p) continue;
        out.closed++;
        await send(p.telegram_id, `📱 <b>${esc(b.child_name)}</b> uchun sinov muddati tugadi. Super Ayiq kutib qoladi 🐻\n\nAsosiy kursda bloging, matematika va tez aytish davom etadi — guruhlarda joy cheklangan.`, b.want_main_at ? {} : inline([[cb("✅ Asosiy kursga yozilish", `MAIN:${b.code}`)]]));
        await notice(p.telegram_id, "trial_end", "Sinov muddati tugadi", `${b.child_name}: Super Ayiq asosiy kursda davom etadi.`, {}, b.child_id ?? null);
      }
      continue;
    }
    if (b.want_main_at) continue;
    if (end + 2 * 3600_000 <= now && b.status !== "no_show" && !b.report && await claim(b.id, "offer0")) {
      const p = await parent(b.parent_id);
      if (p) { out.offer0++; await send(p.telegram_id, `${b.status === "attended" ? `🙏 ${esc(b.child_name)} sinov darsiga kelgani uchun rahmat!` : "🙏 Sinov darsi uchun rahmat!"} Taassurotlaringiz qanday?\n\n${offerText(offer(s, b))}`, offerButtons); }
    }
    const left = b.credit_until ? Date.parse(b.credit_until) - now : -1;
    if (end <= now && left > 0 && left <= 12 * 3600_000 && await claim(b.id, "offer12")) {
      const p = await parent(b.parent_id);
      if (p) { out.offer12++; await send(p.telegram_id, `⏳ <b>${esc(b.child_name)}</b> uchun ${sum(s.prices.price)} so‘m chegirma 12 soatdan keyin tugaydi.\n\n${offerText(offer(s, b))}`, offerButtons); }
    }
  }

  // The evening nudge (19:00 Tashkent, only without today's DZ) and the Monday summary (09:00), once per child;
  // at most 150 children a tick, the hour has 12 ticks.
  const local = loc(now), hh = local.getUTCHours(), today = tday(now);
  const evening = hh === 19, monday = hh === 9 && local.getUTCDay() === 1;
  if (evening || monday) {
    const kind = evening ? `eve:${today}` : `week:${today}`;
    const [{ data: kids }, { data: sent }, { data: doneToday }] = await Promise.all([
      db.from("sik_children").select("*").in("status", ["trial", "student"]).limit(1000),
      db.from("sik_child_sent").select("child_id").eq("kind", kind).limit(1000),
      evening ? db.from("sik_dz").select("child_id").eq("day", today).limit(1000) : Promise.resolve({ data: [] }),
    ]);
    const skip = new Set([...(sent ?? []), ...(doneToday ?? [])].map((r: Row) => r.child_id));
    const due = (kids ?? []).filter((c: Row) => childOpen(c, now) && !skip.has(c.id)).slice(0, 150);
    const week = monday && due.length ? await totals(due.map((c: Row) => c.id), iso(now - 7 * 86400000)) : {};
    for (const c of due) {
      if (!(await claimChild(c.id, kind))) continue;
      if (evening) {
        out.evening++;
        await send(c.parent_id, `🐻 ${esc(c.bear_name)} uxlab qoldi… <b>${esc(c.name)}</b>, bugungi tez aytish atigi 30 soniya!`, inline([[app("🐻 Uyg‘otish")]]));
        continue;
      }
      const { data: dzs } = await db.from("sik_dz").select("day").eq("child_id", c.id).gte("day", tday(now - 7 * 86400000)).lt("day", today);
      const t = week[c.id] ?? { points: 0, period: 0, coins: 0 }, level = levelOf(t.points);
      out.weekly++;
      await send(c.parent_id, `📊 <b>${esc(c.name)}</b> o‘tgan haftada: <b>+${t.period} ball</b>, ${(dzs ?? []).length} kun tez aytish.\n🐻 ${esc(c.bear_name)} — ${level}-daraja (${LEVEL_NAMES[level - 1]}), jami ${t.points} ball.`, inline([[app("🐻 Super Ayiq")]]));
      await notice(c.parent_id, "weekly", "Haftalik natija", `${c.name}: +${t.period} ball, ${(dzs ?? []).length} kun tez aytish · ${level}-daraja`, {}, c.id);
    }
  }

  // The trial's price stays on the family's balance as a credit for the first month; when the course was not bought
  // with it (48 h after the lesson; 14 days more when the parent asked for the course), it pays for the trial lesson.
  const DAY = 86400000;
  const [{ data: plain }, { data: asked }] = await Promise.all([
    db.from("sik_bookings").select("id,parent_id,child_id,child_name,paid_amount,credit_until").in("status", ["paid", "attended", "no_show"]).not("paid_amount", "is", null).is("want_main_at", null).lt("credit_until", iso(now)).gt("credit_until", iso(now - 2 * DAY)).limit(200),
    db.from("sik_bookings").select("id,parent_id,child_id,child_name,paid_amount,credit_until").in("status", ["paid", "attended", "no_show"]).not("paid_amount", "is", null).not("want_main_at", "is", null).lt("credit_until", iso(now - 14 * DAY)).gt("credit_until", iso(now - 16 * DAY)).limit(200),
  ]);
  const trials = [...(plain ?? []), ...(asked ?? [])];
  for (let i = 0; i < trials.length; i += 100) {
    const part = trials.slice(i, i + 100);
    const { data: done } = await db.from("sik_money").select("ref").in("ref", part.map((b: Row) => `trial:${b.id}`));
    const had = new Set((done ?? []).map((r: Row) => r.ref));
    for (const b of part) {
      if (had.has(`trial:${b.id}`) || !(Number(b.paid_amount) > 0)) continue;
      if (!(await moneyLine({ parent_id: b.parent_id, child_id: b.child_id, kind: "trial", amount: -Number(b.paid_amount), note: `Sinov darsi: ${b.child_name}`, ref: `trial:${b.id}` }))) continue;
      out.trial++;
      await notice(b.parent_id, "money", "Sinov darsi hisobdan yechildi", `${b.child_name}: −${sum(Number(b.paid_amount))} so‘m (asosiy kursga yozilmadingiz)`, {}, b.child_id);
    }
  }

  // A cash request nobody confirmed in 14 days is closed (the parent can send a new one).
  const { data: stale } = await db.from("sik_payments").select("*").eq("status", "pending").eq("method", "cash").lt("created_at", iso(now - 14 * 86400000)).limit(50);
  for (const pay of stale ?? []) {
    if (!dryOut()) {
      const { data: done } = await db.from("sik_payments").update({ status: "rejected", decided_at: iso(now) }).eq("id", pay.id).eq("status", "pending").select("id");
      if (!done?.length) continue;
    }
    out.cash_stale = (out.cash_stale ?? 0) + 1;
    await closeStaffMessages(pay, `💵 Naqd to‘lov so‘rovi (${sum(Number(pay.amount))} so‘m) — 14 kun ichida tasdiqlanmadi, yopildi.`);
    await notice(Number(pay.parent_id), "payment_rejected", "Naqd to‘lov so‘rovi yopildi", `${sum(Number(pay.amount))} so‘m: 14 kun ichida to‘lanmadi. Kerak bo‘lsa, yangi so‘rov yuboring.`, { amount: Number(pay.amount) });
  }

  // An invitation whose friend paid while the inviter had no child yet is rewarded later.
  const { data: unpaid } = await db.from("sik_referrals").select("invitee").not("paid_at", "is", null).is("rewarded_at", null).limit(20);
  for (const r of unpaid ?? []) { out.referrals++; await rewardReferral(Number(r.invitee)); }

  // On the 1st at 10:00 the owner gets last month's top students (the first place wins 100 000 so'm).
  if (local.getUTCDate() === 1 && hh === 10) {
    const pm = prevMonth(now);
    const top = await board(true, { since: pm.since, until: pm.until, top: 3 }, now);
    if (top.length && top[0].points > 0) {
      out.prize = 1;
      await ownersAlert([`🏆 <b>Super Intellekt Kids: ${pm.label} oyi reytingi</b>`, ...top.map((r) => `${r.place}. ${esc(r.name)} — ${r.points} ball`), "", `1-o‘rin sovrini — ${sum(PRIZE_SOM)} so‘m. Tanga sifatida berish: bot → «Boshqaruv» → «Tangalar» → «Sovrin».`].join("\n"), `prize:${pm.key}`);
    }
  }

  const { data: quiet } = await db.from("sik_parents").select("*").not("phone", "is", null).is("abandon_notified_at", null).neq("state", "done").neq("state", "code").lt("updated_at", iso(now - 60 * 60000)).limit(50);
  for (const p of quiet ?? []) {
    if (!dryOut()) await db.from("sik_parents").update({ abandon_notified_at: iso(now) }).eq("telegram_id", p.telegram_id);
    const { count } = await db.from("sik_bookings").select("id", { count: "exact", head: true }).eq("parent_id", p.telegram_id);
    if (count) continue;
    out.abandoned++;
    await toOperators(`sik-abandon:${p.telegram_id}`, p, `⭐ SIK: raqam qoldirdi, lekin yozilmadi${p.state === "lesson" ? " (dars tanlamadi)" : ""}`);
  }
  return { ok: true, ...out };
}

// ---------- setup ----------
async function setup(apply: boolean) {
  if (!TOKEN) return { ok: false, error: "SIK_LITE_BOT_TOKEN is not set" };
  const me = await tg("getMe", {});
  const info = await tg("getWebhookInfo", {});
  if (me.ok && me.result?.username && !dryOut()) await setSetting("bot", { username: me.result.username, name: me.result.first_name ?? "" });
  const status: Row = { ok: !!me.ok, username: me.result?.username ?? null, webhook: info.result?.url ?? null, webhookOk: info.result?.url === FN_URL, pending: info.result?.pending_update_count ?? null, lastError: info.result?.last_error_message ?? null };
  if (!apply || !me.ok) return status;
  const hook = await tg("setWebhook", { url: FN_URL, secret_token: await sha256Hex(`sik-lite-webhook:${TOKEN}`), allowed_updates: ["message", "callback_query"], max_connections: 20 });
  const cmds = await tg("setMyCommands", { commands: [{ command: "start", description: "Boshlash" }, { command: "menu", description: "Mening yozuvlarim" }] });
  const menu = await tg("setChatMenuButton", { menu_button: { type: "web_app", text: "Super Ayiq", web_app: { url: APP_URL } } });
  const desc = await tg("getMyDescription", {});
  if (desc.ok && !desc.result?.description) await tg("setMyDescription", { description: DESCRIPTION });
  const short = await tg("getMyShortDescription", {});
  if (short.ok && !short.result?.short_description) await tg("setMyShortDescription", { short_description: SHORT_DESCRIPTION });
  return { ...status, setWebhook: !!hook.ok, commands: !!cmds.ok, menuButton: !!menu.ok };
}

// ---------- Mini App API ----------
// A string Telegram signed for this bot's Mini App (initData, or the answer of requestContact): its fields, or null.
async function signedParams(raw: string, maxAge = 86400): Promise<URLSearchParams | null> {
  if (!raw || raw.length > 8192 || !TOKEN) return null;
  const params = new URLSearchParams(raw);
  const hash = (params.get("hash") ?? "").toLowerCase();
  const authDate = Number(params.get("auth_date"));
  const age = Date.now() / 1000 - authDate;
  if (!/^[a-f0-9]{64}$/.test(hash) || !Number.isFinite(authDate) || age > maxAge || age < -60) return null;
  params.delete("hash");
  const check = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = await hmac(enc.encode("WebAppData"), enc.encode(TOKEN));
  return constEq(hex(await hmac(secret, enc.encode(check))), hash) ? params : null;
}
async function verifyInit(raw: string): Promise<Row | null> {
  const params = await signedParams(raw);
  const userText = params?.get("user");
  if (!params || !userText) return null;
  try {
    const u = JSON.parse(userText);
    if (!Number.isSafeInteger(u.id) || u.id <= 0) return null;
    return { id: u.id, name: [u.first_name, u.last_name].filter(Boolean).join(" ").slice(0, 80), username: u.username ?? null };
  } catch {
    return null;
  }
}

async function api(req: Request, action: string, origin: string): Promise<Response> {
  const internal = await isInternal(req);
  if (!internal && !ORIGINS.has(origin)) throw new HttpError(403, "origin");
  const raw = await req.text();
  if (raw.length > (action === "pay_check" ? 6_000_000 : 20000)) throw new HttpError(413, "size");
  let user: Row | null;
  const as = Number(req.headers.get("x-selftest-as"));
  if (internal && Number.isSafeInteger(as) && as > 0) {
    user = { id: as, name: "Selftest", username: null };
  } else user = await verifyInit(req.headers.get("x-telegram-init-data") ?? "");
  if (!user) throw new HttpError(401, "init_data");
  let body: Row = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { throw new HttpError(400, "json"); }
  if (!body || typeof body !== "object" || Array.isArray(body)) body = {};
  const role = await roleOf(user.id);
  const need = (...roles: string[]) => { if (!role || !roles.includes(role)) throw new HttpError(403, "forbidden"); };
  const ACTIONS: Record<string, () => Promise<Row>> = {
    state: () => apiState(user!, role),
    history: () => apiHistory(user!, body),
    rating: () => apiRating(user!, body),
    bear_name: () => apiBearName(user!, body),
    want_main: () => apiWantMain(user!, body),
    lessons: async () => { need("owner", "admin", "teacher"); return await apiLessons(); },
    lesson: async () => { need("owner", "admin", "teacher"); return await apiLesson(body); },
    attend: async () => { need("owner", "admin", "teacher"); return await apiAttend(user!, body); },
    report: async () => { need("owner", "admin", "teacher"); return await apiReport(user!, body); },
    convert: async () => { need("owner", "admin"); return await apiConvert(body); },
    invite: async () => { need("owner", "admin"); return await apiInvite(user!, body, role); },
    invites: async () => { need("owner", "admin"); return await apiInvites(); },
    kids: async () => { need("owner", "admin"); return await apiKids(body); },
    rating_admin: async () => { need("owner", "admin"); return await apiRatingAdmin(); },
    coins_add: async () => { need("owner"); return await apiCoinsAdd(user!, body); },
    lesson_save: async () => { need("owner", "admin"); return await apiLessonSave(user!, body); },
    lesson_cancel: async () => { need("owner", "admin"); return await apiLessonCancel(body); },
    settings: async () => { need("owner"); return await apiSettings(); },
    settings_save: async () => { need("owner"); return await apiSettingsSave(user!, body); },
    staff: async () => { need("owner"); return await apiStaff(); },
    staff_set: async () => { need("owner"); return await apiStaffSet(user!, body); },
    // the parent: sign-up, booking and paying inside the Mini App, the bell, the so'm balance
    onboard: () => apiOnboard(user!, body),
    contact: () => apiContact(user!, body),
    redeem: () => apiRedeem(user!, body),
    slots: () => apiSlots(),
    book: () => apiBook(user!, body),
    move: () => apiMove(user!, body),
    pay_check: () => apiPayCheck(user!, body),
    pay_cash: () => apiPayCash(user!, body),
    pay_cancel: () => apiPayCancel(user!, body),
    notices: () => apiNotices(user!),
    notices_read: () => apiNoticesRead(user!),
    money: () => apiMoney(user!),
    coins_to_money: () => apiCoinsToMoney(user!, body),
    // staff: checks, cash, the months of the course
    payments: async () => { need("owner", "admin"); return await apiPayments(); },
    pay_decide: async () => { need("owner", "admin"); return await apiPayDecide(user!, body, role); },
    families: async () => { need("owner", "admin"); return await apiFamilies(body); },
    family: async () => { need("owner", "admin"); return await apiFamily(body); },
    cash_add: async () => { need("owner", "admin"); return await apiCashAdd(user!, body, role); },
    month_quote: async () => { need("owner", "admin"); return await apiMonthQuote(body); },
    month_charge: async () => { need("owner"); return await apiMonthCharge(user!, body); },
    money_adjust: async () => { need("owner"); return await apiMoneyAdjust(user!, body); },
  };
  const fn = Object.prototype.hasOwnProperty.call(ACTIONS, action) ? ACTIONS[action] : null;
  if (!fn) throw new HttpError(404, "action");
  const result = await fn();
  const out = dryOut();
  return json({ ok: true, ...result, ...(out ? { out } : {}) }, 200, origin);
}

async function apiState(user: Row, role: string | null) {
  const s = await settings();
  const p = await parentOf(user.id);
  const now = Date.now();
  const kids = p ? await childrenOf(user.id) : [];
  const children = [];
  for (const c of kids) children.push(await childView(c, s, now));
  const bookings = p ? (await parentBookings(user.id)).map((b) => ({
    code: b.code, child: b.child_name, child_id: b.child_id, status: b.status, hold_until: b.hold_until, access_until: b.access_until,
    lesson: b.lesson ? { starts_at: b.lesson.starts_at, duration_min: b.lesson.duration_min } : null,
    can_move: canMove(b, now), want_main: !!b.want_main_at, report: b.report?.ratings ? b.report : null,
    offer: offer(s, b, now),
  })) : [];
  let referral = null;
  if (p) {
    const code = await refCodeOf(p);
    const { data: refs } = await db.from("sik_referrals").select("paid_at").eq("inviter", user.id);
    referral = { code, link: s.bot.username ? `https://t.me/${s.bot.username}?start=r_${code}` : null, invited: (refs ?? []).length, paid: (refs ?? []).filter((r: Row) => r.paid_at).length, coins: s.referral.inviter_coins, friend_discount: s.referral.friend_discount };
  }
  const [balance, unread, pending] = p ? await Promise.all([
    moneyBalance(user.id),
    db.from("sik_notices").select("id", { count: "exact", head: true }).eq("parent_id", user.id).is("read_at", null).then((r: Row) => r.count ?? 0),
    db.from("sik_payments").select("id,purpose,amount,method,created_at").eq("parent_id", user.id).eq("status", "pending").order("created_at").then((r: Row) => r.data ?? []),
  ]) : [0, 0, []];
  return {
    me: { id: user.id, name: parentName(p ?? { tg_name: user.name }), first: String(p?.parent_name ?? user.name ?? "").split(" ")[0], phone: !!p?.phone },
    role, children, bookings, referral, money: { balance }, unread, pending,
    card: s.card, price: p ? await priceFor(p, s) : s.prices.price,
    center: s.center, prices: s.prices, bot: s.bot.username ?? null, levels: LEVELS, level_names: LEVEL_NAMES,
    coin_som: COIN_SOM, discount_max_pct: DISCOUNT_MAX_PCT, month_cap: Math.round(s.prices.course_price * DISCOUNT_MAX_PCT / 100),
    now: iso(now), today: tday(now),
  };
}

// ---------- the parent in the Mini App: sign-up, booking, paying, the bell, the so'm balance ----------
async function apiOnboard(user: Row, body: Row) {
  const child = cleanName(body.child_name), age = intIn(body.age, 3, 18), name = cleanName(body.parent_name);
  if (!child || !age) throw new HttpError(400, "child");
  const p = await touchParent({ id: user.id, first_name: user.name, username: user.username });
  const patch: Row = {};
  if (name) patch.parent_name = name;
  if (!p.phone) patch.state = "app"; // the phone comes next, shared with Telegram's button
  if (Object.keys(patch).length) await saveParent(p, patch);
  const kids = await childrenOf(user.id);
  const c = kids.find((k) => k.name.toLowerCase() === child.toLowerCase()) ?? await newChild(user.id, child, age);
  return { child: c.id };
}
// The answer of Telegram's requestContact, signed for this bot; without it the phone still arrives in the bot chat.
async function apiContact(user: Row, body: Row) {
  const p = await parentOf(user.id);
  if (!p) throw new HttpError(404, "parent");
  const params = await signedParams(String(body.response ?? ""), 3600);
  let saved = false;
  if (params) {
    try {
      const c = JSON.parse(params.get("contact") ?? "{}");
      if (Number(c.user_id) === Number(user.id)) saved = await savePhone(p, c.phone_number);
    } catch { /* the bot chat still gets the contact */ }
  }
  return { phone: saved || !!p.phone };
}
async function apiRedeem(user: Row, body: Row) {
  const code = String(body.code ?? "").replace(/\D/g, "");
  if (!/^\d{6}$/.test(code)) throw new HttpError(400, "code");
  const p = await touchParent({ id: user.id, first_name: user.name, username: user.username });
  const day = tday();
  if (p.code_fail_day === day && Number(p.code_fails) >= CODE_TRIES) throw new HttpError(429, "tries");
  const { data: inv } = await db.from("sik_invites").select("code,used_by").eq("code", code).maybeSingle();
  if (!inv || (inv.used_by && Number(inv.used_by) !== Number(user.id))) {
    await saveParent(p, { code_fails: p.code_fail_day === day ? Number(p.code_fails || 0) + 1 : 1, code_fail_day: day });
    throw new HttpError(inv ? 409 : 404, inv ? "code_used" : "code");
  }
  await redeemInvite(p, code);
  return { redeemed: true };
}
async function apiSlots() {
  return { slots: (await openLessons()).map((l) => ({ id: l.id, starts_at: l.starts_at, duration_min: l.duration_min, free: l.free, title: l.title })) };
}
async function apiBook(user: Row, body: Row) {
  const p = await parentOf(user.id);
  if (!p) throw new HttpError(404, "parent");
  if (!p.phone) throw new HttpError(409, "phone");
  const c = await ownChild(user, body.child);
  if (c.status === "student") throw new HttpError(409, "student");
  if (await liveBookingOf(c.id)) throw new HttpError(409, "booked");
  const lesson = (await openLessons()).find((l) => l.id === String(body.lesson ?? ""));
  if (!lesson) throw new HttpError(409, "full");
  const b = await createBooking({
    parent_id: user.id, child_id: c.id, child_name: c.name, child_age: c.age, lesson_id: lesson.id,
    status: "pending_payment", hold_until: iso(Date.now() + HOLD_MIN * 60000), source: p.source ?? "app",
  });
  if (!dryOut()) await db.from("custom_records").delete().eq("tab_id", CRM_TAB).eq("external_id", `sikp:${user.id}`);
  await crmBooking(b, p, lesson);
  return { booking: { code: b.code, hold_until: b.hold_until, lesson: { starts_at: lesson.starts_at, duration_min: lesson.duration_min } }, price: await priceFor(p, await settings()) };
}
async function apiMove(user: Row, body: Row) {
  const b = await bookingByCode(String(body.code ?? ""), user.id);
  if (!b) throw new HttpError(404, "booking");
  if (!canMove(b)) throw new HttpError(409, "move");
  const lesson = (await openLessons(b.lesson_id)).find((l) => l.id === String(body.lesson ?? ""));
  if (!lesson) throw new HttpError(409, "full");
  await moveBooking(b, lesson);
  const p = await parentOf(user.id);
  if (p) await crmBooking(b, p, lesson);
  return { lesson: { starts_at: lesson.starts_at, duration_min: lesson.duration_min } };
}
// The check photo of a card transfer, already shrunk by the page (JPEG data URL): kept privately, sent to the owner.
async function apiPayCheck(user: Row, body: Row) {
  const p = await parentOf(user.id);
  if (!p) throw new HttpError(404, "parent");
  const purpose = body.purpose === "course" ? "course" : "trial";
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(body.image ?? ""));
  if (!m) throw new HttpError(400, "image");
  const bin = atob(m[2]);
  if (bin.length < 2000 || bin.length > CHECK_MAX_BYTES) throw new HttpError(400, "image");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const { count } = await db.from("sik_payments").select("id", { count: "exact", head: true }).eq("parent_id", user.id).eq("status", "pending");
  if ((count ?? 0) >= PENDING_MAX) throw new HttpError(429, "pending");
  let due: Row[] = [], amount = 0;
  if (purpose === "trial") {
    due = await dueBookings(user.id);
    if (!due.length) throw new HttpError(409, "nothing_due");
  } else {
    const a = intIn(body.amount, 10000, 50000000);
    if (a === null) throw new HttpError(400, "amount");
    amount = a;
  }
  const ext = m[1] === "image/png" ? "png" : m[1] === "image/webp" ? "webp" : "jpg";
  const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
  if (!dryOut()) {
    const { error } = await db.storage.from("sik-checks").upload(path, bytes, { contentType: m[1], upsert: false });
    if (error) throw new HttpError(500, "upload");
  }
  const pay = await newPayment(p, purpose, due, { amount, source: "app", file_path: path, file_kind: "photo" });
  await sendCheckToOwners(p, pay, { bytes, mime: m[1], ext });
  return { payment: { id: pay.id, purpose, amount: Number(pay.amount), status: "pending" } };
}
// Cash for the studies: the parent pays at the center; an administrator or the owner confirms, and only then the
// balance grows (with a Kvitansiya receipt «Naqd»).
async function apiPayCash(user: Row, body: Row) {
  const p = await parentOf(user.id);
  if (!p) throw new HttpError(404, "parent");
  const amount = intIn(body.amount, 10000, 50000000);
  if (amount === null) throw new HttpError(400, "amount");
  const { count } = await db.from("sik_payments").select("id", { count: "exact", head: true }).eq("parent_id", user.id).eq("status", "pending");
  if ((count ?? 0) >= PENDING_MAX) throw new HttpError(429, "pending");
  const pay = await newPayment(p, "course", [], { amount, source: "app", method: "cash" });
  await sendCashToStaff(p, pay);
  return { payment: { id: pay.id, purpose: "course", method: "cash", amount, status: "pending" } };
}
// The parent withdraws a cash request that nobody confirmed yet (a card check cannot be withdrawn: the money moved).
async function apiPayCancel(user: Row, body: Row) {
  const id = String(body.id ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new HttpError(400, "payment");
  const { data: rows } = await db.from("sik_payments").update({ status: "rejected", decided_by: user.id, decided_at: new Date().toISOString() })
    .eq("id", id).eq("parent_id", user.id).eq("status", "pending").eq("method", "cash").select("*");
  const pay = rows?.[0];
  if (!pay) throw new HttpError(409, "decided");
  await closeStaffMessages(pay, `💵 Naqd to‘lov so‘rovi (${sum(Number(pay.amount))} so‘m) — ota-ona bekor qildi.`);
  return { cancelled: true };
}
async function apiNotices(user: Row) {
  const { data } = await db.from("sik_notices").select("id,kind,title,body,data,child_id,read_at,created_at").eq("parent_id", user.id).order("created_at", { ascending: false }).limit(50);
  return { notices: data ?? [], unread: (data ?? []).filter((n: Row) => !n.read_at).length };
}
async function apiNoticesRead(user: Row) {
  if (!dryOut()) await db.from("sik_notices").update({ read_at: new Date().toISOString() }).eq("parent_id", user.id).is("read_at", null);
  return { unread: 0 };
}
async function apiMoney(user: Row) {
  const [balance, lines, { data: pending }] = await Promise.all([
    moneyBalance(user.id), moneyLines(user.id, 50),
    db.from("sik_payments").select("id,purpose,amount,method,created_at").eq("parent_id", user.id).eq("status", "pending").order("created_at"),
  ]);
  return { balance, lines, pending: pending ?? [] };
}
// The parent turns a child's coins into so'm on the family balance (a discount on the studies, at most 10% of a month).
async function apiCoinsToMoney(user: Row, body: Row) {
  const c = await ownChild(user, body.child);
  const coins = intIn(body.coins, 1, 1000000);
  if (coins === null) throw new HttpError(400, "amount");
  const s = await settings();
  if (dryOut()) return { balance: 0 };
  const { data, error } = await db.rpc("sik_coins_to_money", {
    p_parent: user.id, p_child: c.id, p_coins: coins, p_rate: COIN_SOM, p_cap: Math.round(s.prices.course_price * DISCOUNT_MAX_PCT / 100), p_month_start: leagueStart(true),
  });
  if (error) {
    const msg = String(error.message ?? "");
    throw new HttpError(409, ["cap", "balance", "amount", "child"].find((k) => msg.includes(k)) ?? "db");
  }
  return { balance: Number(data) || 0 };
}

// ---------- staff: checks, cash, the months of the course ----------
async function apiPayments() {
  const { data } = await db.from("sik_payments").select("*").eq("status", "pending").order("created_at").limit(30);
  const ids = [...new Set((data ?? []).map((x: Row) => Number(x.parent_id)))];
  const { data: ps } = ids.length ? await db.from("sik_parents").select("telegram_id,parent_name,tg_name,phone").in("telegram_id", ids) : { data: [] };
  const byId = new Map<number, Row>((ps ?? []).map((p: Row) => [Number(p.telegram_id), p]));
  const list = [];
  for (const x of data ?? []) {
    let photo: string | null = null;
    if (x.file_path) { const { data: u } = await db.storage.from("sik-checks").createSignedUrl(x.file_path, 900); photo = u?.signedUrl ?? null; }
    const { data: bs } = Array.isArray(x.booking_ids) && x.booking_ids.length ? await db.from("sik_bookings").select("child_name,child_age,code").in("id", x.booking_ids) : { data: [] };
    const p = byId.get(Number(x.parent_id)) ?? {};
    list.push({ id: x.id, purpose: x.purpose, method: x.method, amount: Number(x.amount), created_at: x.created_at, source: x.source, photo, parent_id: Number(x.parent_id), parent: parentName(p), phone: p.phone ?? "", children: (bs ?? []).map((b: Row) => `${b.child_name} (${b.child_age})`) });
  }
  return { payments: list };
}
async function apiPayDecide(user: Row, body: Row, role: string | null) {
  const id = String(body.id ?? "");
  const { data: pay } = /^[0-9a-f-]{36}$/.test(id) ? await db.from("sik_payments").select("method,amount,parent_id").eq("id", id).maybeSingle() : { data: null };
  if (!pay) throw new HttpError(404, "payment");
  if (!canDecide(role, pay)) throw new HttpError(403, "forbidden");
  const who = user.name || (role === "owner" ? "Egasi" : "Administrator");
  const r = await decidePayment(id, body.ok === true, user.id, who);
  if (!r.done) throw new HttpError(409, r.status === "missing" ? "payment" : "decided");
  if (role !== "owner") await cashTakenAlert(who, pay, r);
  return r;
}
async function apiFamilies(body: Row) {
  const q = String(body.q ?? "").trim().toLowerCase(), digits = q.replace(/\D/g, "");
  const [{ data: ps }, { data: kids }] = await Promise.all([
    db.from("sik_parents").select("telegram_id,parent_name,tg_name,phone,created_at").order("created_at", { ascending: false }).limit(500),
    db.from("sik_children").select("id,parent_id,name,age,status").neq("status", "left").limit(1000),
  ]);
  const byParent = new Map<number, Row[]>();
  for (const c of kids ?? []) byParent.set(Number(c.parent_id), [...(byParent.get(Number(c.parent_id)) ?? []), c]);
  const list = (ps ?? []).map((p: Row) => ({ p, kids: byParent.get(Number(p.telegram_id)) ?? [] }))
    .filter(({ p, kids }: Row) => kids.length && (!q || parentName(p).toLowerCase().includes(q) || kids.some((c: Row) => c.name.toLowerCase().includes(q)) || (digits.length >= 3 && String(p.phone ?? "").includes(digits))))
    .slice(0, 25);
  const ids = list.map(({ p }: Row) => Number(p.telegram_id));
  const bal: Record<number, number> = {};
  if (ids.length) {
    const { data: m } = await db.from("sik_money").select("parent_id,amount").in("parent_id", ids).limit(1000);
    for (const r of m ?? []) bal[Number(r.parent_id)] = (bal[Number(r.parent_id)] ?? 0) + Number(r.amount);
  }
  return { families: list.map(({ p, kids }: Row) => ({ parent_id: Number(p.telegram_id), parent: parentName(p), phone: p.phone ?? "", balance: bal[Number(p.telegram_id)] ?? 0, children: kids.map((c: Row) => ({ id: c.id, name: c.name, age: c.age, status: c.status })) })) };
}
async function familyOf(body: Row): Promise<Row> {
  const id = Number(body.parent);
  const p = Number.isSafeInteger(id) && id > 0 ? await parentOf(id) : null;
  if (!p) throw new HttpError(404, "parent");
  return p;
}
async function apiFamily(body: Row) {
  const p = await familyOf(body);
  const id = Number(p.telegram_id);
  const [kids, balance, lines, { data: due }] = await Promise.all([
    childrenOf(id), moneyBalance(id), moneyLines(id, 30),
    db.from("sik_bookings").select("id").eq("parent_id", id).eq("status", "pending_payment"),
  ]);
  return { parent_id: id, parent: parentName(p), phone: p.phone ?? "", balance, lines, trial_due: (due ?? []).length, children: kids.map((c) => ({ id: c.id, name: c.name, age: c.age, status: c.status })) };
}
// Cash taken at the center: for the studies (any amount), or the trial of the family's held bookings (its price each).
async function apiCashAdd(user: Row, body: Row, role: string | null) {
  const p = await familyOf(body);
  const id = Number(p.telegram_id);
  const kids = await childrenOf(id);
  const trial = body.purpose === "trial";
  const due = trial ? await dueBookings(id) : [];
  if (trial && !due.length) throw new HttpError(409, "nothing_due");
  const s = await settings();
  const price = await priceFor(p, s);
  const amount = trial ? price * due.length : intIn(body.amount, 1000, 100000000);
  if (!amount) throw new HttpError(400, "amount");
  const note = String(body.note ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  const at = new Date().toISOString();
  const receipt = await kvReceipt({ payer: parentName(p), child: (trial ? due.map((b) => b.child_name) : kids.map((c) => c.name)).join(", "), phone: p.phone ?? null, trial, amount, method: "Naqd", paidAt: at });
  await moneyLine({ parent_id: id, kind: "cash", amount, note: note || (trial ? "Sinov darsi to‘lovi (naqd)" : "Naqd to‘lov"), ref: `cash:${crypto.randomUUID()}`, receipt_id: realReceiptId(receipt), created_by: user.id });
  if (trial) {
    const lessons = await lessonsById(due.map((b) => b.lesson_id));
    for (const b of due) { await bookingPaid(b, lessons[b.lesson_id] ?? null, user.id, price); await crmBooking(b, p, lessons[b.lesson_id] ?? null); }
  }
  const balance = dryOut() ? 0 : await moneyBalance(id);
  await send(id, [`✅ <b>To‘lov qabul qilindi:</b> +${sum(amount)} so‘m (naqd)`, `💼 Balans: <b>${sum(balance)} so‘m</b>`, receipt ? `🧾 Kvitansiya №${kvNo(receipt.number)}` : "", trial ? "🐻 Super Ayiq uyg‘ondi!" : ""].filter(Boolean).join("\n"), inline([[app(trial ? "🐻 Super Ayiq’ni ochish" : "💼 Hamyon", trial ? "" : "#wallet")]]));
  await notice(id, "payment", trial ? "Sinov darsi to‘lovi qabul qilindi" : "Naqd to‘lov qabul qilindi", `+${sum(amount)} so‘m · balans ${sum(balance)} so‘m`, { amount, receipt: receipt?.view ?? null });
  if (role !== "owner") await ownersAlert(`💵 <b>Super Intellekt Kids</b>: ${esc(user.name || user.id)} naqd to‘lov kiritdi — ${esc(parentName(p))}, ${sum(amount)} so‘m${receipt ? ` (Kvitansiya №${kvNo(receipt.number)})` : ""}. Pul sizga yetib kelganini tekshiring.`, null);
  return { balance, receipt: receipt?.view ?? null };
}
// The price of a month of the course today: the course price with the running season discount.
async function apiMonthQuote(body: Row) {
  const c = await childById(String(body.child ?? ""));
  if (!c) throw new HttpError(404, "child");
  const s = await settings();
  const o = offer(s, {});
  return { child: c.id, name: c.name, status: c.status, price: o.after, course: o.course, pct: o.pct, season: o.season, balance: await moneyBalance(Number(c.parent_id)) };
}
// A month of the course started: its price comes off the family's balance (a debt shows as a minus).
async function apiMonthCharge(user: Row, body: Row) {
  const c = await childById(String(body.child ?? ""));
  if (!c) throw new HttpError(404, "child");
  if (c.status !== "student") throw new HttpError(409, "not_student");
  const amount = intIn(body.amount, 1000, 100000000);
  if (amount === null) throw new HttpError(400, "amount");
  const note = String(body.note ?? "").replace(/\s+/g, " ").trim().slice(0, 120) || `O‘qish oyi: ${c.name}`;
  await moneyLine({ parent_id: c.parent_id, child_id: c.id, kind: "month", amount: -amount, note, ref: `month:${crypto.randomUUID()}`, created_by: user.id });
  const balance = dryOut() ? 0 : await moneyBalance(Number(c.parent_id));
  await send(c.parent_id, [`📚 <b>${esc(c.name)}</b>: o‘qish oyi boshlandi — −${sum(amount)} so‘m`, `💼 Balans: <b>${sum(balance)} so‘m</b>${balance < 0 ? " (to‘lov kerak)" : ""}`].join("\n"), inline([[app("💼 Hamyon", "#wallet")]]));
  await notice(c.parent_id, "money", "O‘qish oyi boshlandi", `${c.name}: −${sum(amount)} so‘m · balans ${sum(balance)} so‘m`, { amount: -amount }, c.id);
  return { balance };
}
// A refund handed back to the parent, or a correction (+ or −), on the family's balance.
async function apiMoneyAdjust(user: Row, body: Row) {
  const p = await familyOf(body);
  const id = Number(p.telegram_id);
  const refund = body.kind === "refund";
  const amount = refund ? intIn(body.amount, 1000, 100000000) : intIn(body.amount, -100000000, 100000000);
  if (!amount) throw new HttpError(400, "amount");
  const note = String(body.note ?? "").replace(/\s+/g, " ").trim().slice(0, 120) || (refund ? "Pul qaytarildi" : "Tuzatish");
  await moneyLine({ parent_id: id, kind: refund ? "refund" : "adjust", amount: refund ? -amount : amount, note, ref: `adj:${crypto.randomUUID()}`, created_by: user.id });
  const balance = dryOut() ? 0 : await moneyBalance(id);
  await notice(id, "money", refund ? "Pul qaytarildi" : "Balans tuzatildi", `${refund ? "−" : amount > 0 ? "+" : "−"}${sum(Math.abs(amount))} so‘m · ${note} · balans ${sum(balance)} so‘m`, {});
  return { balance };
}
async function ownChild(user: Row, id: unknown): Promise<Row> {
  const c = await childById(String(id ?? ""));
  if (!c || Number(c.parent_id) !== Number(user.id)) throw new HttpError(404, "child");
  return c;
}
async function apiHistory(user: Row, body: Row) {
  const c = await ownChild(user, body.child);
  const [{ data: pts }, { data: coins }] = await Promise.all([
    db.from("sik_points").select("kind,points,note,created_at").eq("child_id", c.id).order("created_at", { ascending: false }).limit(40),
    db.from("sik_coins").select("kind,amount,note,created_at").eq("child_id", c.id).order("created_at", { ascending: false }).limit(40),
  ]);
  const items = [
    ...(pts ?? []).map((r: Row) => ({ type: "ball", kind: r.kind, amount: r.points, note: r.note, at: r.created_at })),
    ...(coins ?? []).map((r: Row) => ({ type: "tanga", kind: r.kind, amount: r.amount, note: r.note, at: r.created_at })),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 50);
  return { items };
}
// Other children appear by first name only.
async function apiRating(user: Row, body: Row) {
  const c = await ownChild(user, body.child);
  const student = c.status === "student";
  const rows = await board(student, { child: c.id, top: 10 });
  const me = rows.find((r) => r.id === c.id);
  return {
    league: student ? "month" : "week", prize: student ? PRIZE_SOM : 0, me: me ? { place: me.place, points: me.points } : null,
    top: rows.filter((r) => r.place <= 10).map((r) => ({ place: r.place, name: r.name.split(" ")[0], points: r.points, me: r.id === c.id })),
  };
}
async function apiRatingAdmin() {
  const now = Date.now(), pm = prevMonth(now);
  const [month, prev, week] = await Promise.all([board(true, { top: 10 }, now), board(true, { since: pm.since, until: pm.until, top: 10 }, now), board(false, { top: 10 }, now)]);
  return { month, prev, prev_label: pm.label, week, prize: PRIZE_SOM };
}
async function apiBearName(user: Row, body: Row) {
  const c = await ownChild(user, body.child);
  const name = cleanName(body.name);
  if (!name) throw new HttpError(400, "name");
  await db.from("sik_children").update({ bear_name: name, updated_at: new Date().toISOString() }).eq("id", c.id);
  return { bear: name };
}
async function apiWantMain(user: Row, body: Row) {
  const b = await bookingByCode(String(body.code ?? ""), user.id);
  const p = await parentOf(user.id);
  if (!b || !p) throw new HttpError(404, "booking");
  if (!PAID.includes(b.status)) throw new HttpError(409, "not_paid");
  await wantMain(p, b);
  return { want_main: true };
}

const lessonView = (l: Row) => ({ id: l.id, starts_at: l.starts_at, duration_min: l.duration_min, seats: l.seats, title: l.title, teacher_id: l.teacher_id, status: l.status });
async function apiLessons() {
  const { data: lessons } = await db.from("sik_lessons").select("*").gte("starts_at", iso(Date.now() - 14 * 86400000)).order("starts_at").limit(100);
  const ids = (lessons ?? []).map((l: Row) => l.id);
  const { data: bs } = ids.length ? await db.from("sik_bookings").select("lesson_id,status,hold_until").in("lesson_id", ids) : { data: [] };
  const now = Date.now(), stats: Record<string, Row> = {};
  for (const b of bs ?? []) {
    const st = stats[b.lesson_id] ??= { booked: 0, paid: 0, came: 0 };
    if (LIVE.includes(b.status) && holds(b, now)) st.booked++;
    if (PAID.includes(b.status)) st.paid++;
    if (b.status === "attended" || b.status === "converted") st.came++;
  }
  const { data: teachers } = await db.from("sik_staff").select("telegram_id,name,username,role").eq("status", "active");
  return { lessons: (lessons ?? []).map((l: Row) => ({ ...lessonView(l), ...(stats[l.id] ?? { booked: 0, paid: 0, came: 0 }) })), teachers: teachers ?? [] };
}
async function apiLesson(body: Row) {
  const id = String(body.id ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new HttpError(400, "id");
  const { data: l } = await db.from("sik_lessons").select("*").eq("id", id).maybeSingle();
  if (!l) throw new HttpError(404, "lesson");
  const { data: bs } = await db.from("sik_bookings").select("*").eq("lesson_id", id).in("status", LIVE).order("created_at");
  const now = Date.now();
  const list = (bs ?? []).filter((b: Row) => holds(b, now));
  const ids = [...new Set(list.map((b: Row) => b.parent_id))];
  const { data: ps } = ids.length ? await db.from("sik_parents").select("telegram_id,parent_name,tg_name,phone").in("telegram_id", ids) : { data: [] };
  const byId = new Map<number, Row>((ps ?? []).map((p: Row) => [Number(p.telegram_id), p]));
  return {
    lesson: lessonView(l), can_mark: Date.parse(l.starts_at) - now <= 30 * 60000,
    bookings: list.map((b: Row) => { const p = byId.get(b.parent_id) ?? {}; return { code: b.code, child: b.child_name, age: b.child_age, status: b.status, parent: parentName(p), phone: p.phone ?? "", report: b.report?.ratings ? b.report : null, want_main: !!b.want_main_at }; }),
  };
}
async function apiAttend(user: Row, body: Row) {
  const b = await bookingByCode(String(body.code ?? ""));
  if (!b || !["paid", "attended", "no_show"].includes(b.status)) throw new HttpError(409, "status");
  if (!b.lesson || Date.parse(b.lesson.starts_at) - Date.now() > 30 * 60000) throw new HttpError(409, "too_early");
  const present = body.present === true;
  const at = new Date().toISOString();
  const patch = { status: present ? "attended" : "no_show", attended_at: present ? at : null, marked_by: user.id, updated_at: at };
  await db.from("sik_bookings").update(patch).eq("id", b.id);
  Object.assign(b, patch);
  if (present && b.child_id) await award(b.child_id, "attend", ATTEND_POINTS, `attend:${b.id}`, "Darsga keldi", user.id);
  const p = await parentOf(b.parent_id);
  if (p) {
    await crmBooking(b, p, b.lesson);
    if (present) await toOperators(`sik-attended:${b.id}`, p, `⭐ SIK: darsga keldi — asosiy kursga taklif qiling · ${b.child_name}, ${b.child_age} yosh${b.credit_until ? ` · chegirma ${fmtShort(b.credit_until)} gacha` : ""}`);
    else if (await claim(b.id, "noshow")) {
      await send(p.telegram_id, `😔 <b>${esc(b.child_name)}</b> bugungi sinov darsida ko‘rinmadi.${b.access_until && Date.parse(b.access_until) > Date.now() ? ` Super Ayiq ${fmtWhen(b.access_until)} gacha ochiq.` : ""}\nOperatorimiz siz bilan bog‘lanadi.`);
      await notice(p.telegram_id, "lesson", "Darsda ko‘rinmadi", `${b.child_name}: bugungi sinov darsiga kelmadi. Operatorimiz bog‘lanadi.`, {}, b.child_id ?? null);
      await toOperators(`sik-noshow:${b.id}`, p, `⭐ SIK: darsga kelmadi · ${b.child_name}, ${b.child_age} yosh`);
    }
  }
  return { status: b.status };
}
function reportText(b: Row, s: Settings, again: boolean) {
  const r = b.report.ratings;
  const lines = [`📝 <b>${esc(b.child_name)} sinov darsida</b>${again ? " (yangilandi)" : ""}`, `🎤 Nutq: ${stars5(r.nutq)}`, `🎬 Kamera oldida: ${stars5(r.kamera)}`, `➗ Matematika: ${stars5(r.matematika)}`];
  if (b.report.comment) lines.push(`💬 Ustoz: «${esc(b.report.comment)}»`);
  if (!b.want_main_at && b.status !== "converted") lines.push("", offerText(offer(s, b)));
  return lines.join("\n");
}
async function apiReport(user: Row, body: Row) {
  const b = await bookingByCode(String(body.code ?? ""));
  if (!b || !["paid", "attended", "converted"].includes(b.status)) throw new HttpError(409, "status");
  if (!b.lesson || Date.parse(b.lesson.starts_at) - Date.now() > 30 * 60000) throw new HttpError(409, "too_early");
  const r = body.ratings && typeof body.ratings === "object" ? body.ratings : {};
  const ratings = { nutq: intIn(r.nutq, 1, 5), kamera: intIn(r.kamera, 1, 5), matematika: intIn(r.matematika, 1, 5) };
  if (ratings.nutq === null || ratings.kamera === null || ratings.matematika === null) throw new HttpError(400, "ratings");
  const comment = String(body.comment ?? "").replace(/\s+/g, " ").trim().slice(0, 500);
  const at = new Date().toISOString();
  const patch: Row = { report: { ratings, comment, by: user.id, at }, updated_at: at };
  const marking = b.status === "paid";
  if (marking) Object.assign(patch, { status: "attended", attended_at: at, marked_by: user.id });
  await db.from("sik_bookings").update(patch).eq("id", b.id);
  Object.assign(b, patch);
  if (b.child_id) {
    if (marking) await award(b.child_id, "attend", ATTEND_POINTS, `attend:${b.id}`, "Darsga keldi", user.id);
    await award(b.child_id, "report", ratings.nutq + ratings.kamera + ratings.matematika, `report:${b.id}`, "Ustoz bahosi", user.id);
  }
  const p = await parentOf(b.parent_id);
  if (p) {
    await crmBooking(b, p, b.lesson);
    const first = await claim(b.id, "report");
    await send(p.telegram_id, reportText(b, await settings(), !first), inline([...(b.want_main_at || b.status === "converted" ? [] : [[cb("✅ Asosiy kursga yozilish", `MAIN:${b.code}`)]]), [app("🐻 Super Ayiq")]]));
    await notice(p.telegram_id, "report", `Ustoz bahosi: ${b.child_name}`, `Nutq ${ratings.nutq}/5 · kamera ${ratings.kamera}/5 · matematika ${ratings.matematika}/5${comment ? ` · «${comment}»` : ""}`, { ratings }, b.child_id ?? null);
    if (marking) await toOperators(`sik-attended:${b.id}`, p, `⭐ SIK: darsga keldi — asosiy kursga taklif qiling · ${b.child_name}, ${b.child_age} yosh`);
  }
  return { status: b.status, report: patch.report };
}
// The child moved to the main course: the bear stays open for good.
async function apiConvert(body: Row) {
  const b = await bookingByCode(String(body.code ?? ""));
  if (!b || !PAID.includes(b.status)) throw new HttpError(409, "status");
  const at = new Date().toISOString();
  await db.from("sik_bookings").update({ status: "converted", converted_at: at, updated_at: at }).eq("id", b.id);
  b.status = "converted";
  if (b.child_id) await db.from("sik_children").update({ status: "student", access_until: null, updated_at: at }).eq("id", b.child_id);
  const p = await parentOf(b.parent_id);
  if (p) {
    await crmBooking(b, p, b.lesson);
    await send(p.telegram_id, `🎉 <b>${esc(b.child_name)}</b> — endi Super Intellekt Kids o‘quvchisi! Super Ayiq doim ochiq, ballar va tangalar saqlanadi.`, inline([[app("🐻 Super Ayiq")]]));
    await notice(p.telegram_id, "student", `${b.child_name} — o‘quvchi!`, "Super Ayiq doim ochiq, ballar va tangalar saqlanadi.", {}, b.child_id ?? null);
  }
  return { status: "converted" };
}
async function apiInvite(user: Row, body: Row, role: string | null) {
  const kids = (Array.isArray(body.children) ? body.children : []).slice(0, 5)
    .map((k: Row) => ({ name: cleanName(k?.name), age: intIn(k?.age, 3, 18) })).filter((k: Row) => k.name && k.age);
  if (!kids.length) throw new HttpError(400, "children");
  const k = phoneKey(body.phone);
  const lessonId = String(body.lesson_id ?? "");
  const row: Row = {
    parent_name: cleanName(body.parent_name) || null, phone: k ? `+998${k}` : null, children: kids, paid: body.paid === true,
    lesson_id: /^[0-9a-f-]{36}$/.test(lessonId) ? lessonId : null, note: String(body.note ?? "").slice(0, 200) || null, created_by: user.id,
  };
  for (let i = 0; i < 5; i++) {
    const code = randCode(6, "0123456789");
    const { error } = await db.from("sik_invites").insert({ ...row, code });
    if (!error) {
      const s = await settings();
      if (row.paid && role !== "owner") await ownersAlert(`💳 <b>Super Intellekt Kids</b>: administrator ${esc(user.name || user.id)} oilani <b>to‘langan</b> deb kiritdi — ${esc(row.parent_name ?? "")}${row.parent_name ? ", " : ""}${kids.map((x: Row) => esc(x.name)).join(", ")}. Pul sizga yetib kelganini tekshiring.`, null);
      return { code, link: s.bot.username ? `https://t.me/${s.bot.username}?start=f_${code}` : null, bot: s.bot.username ?? null };
    }
    if (error.code !== "23505") throw new HttpError(500, "db");
  }
  throw new HttpError(500, "code");
}
async function apiInvites() {
  const { data } = await db.from("sik_invites").select("code,parent_name,children,paid,created_at,used_at").order("created_at", { ascending: false }).limit(20);
  const s = await settings();
  return { invites: data ?? [], bot: s.bot.username ?? null };
}
async function apiKids(body: Row) {
  const q = String(body.q ?? "").trim().toLowerCase();
  const { data } = await db.from("sik_children").select("id,name,age,status,parent_id,bear_name").neq("status", "left").order("created_at", { ascending: false }).limit(300);
  const pids = [...new Set((data ?? []).map((c: Row) => c.parent_id))];
  const { data: ps } = pids.length ? await db.from("sik_parents").select("telegram_id,parent_name,tg_name,phone").in("telegram_id", pids) : { data: [] };
  const byId = new Map<number, Row>((ps ?? []).map((p: Row) => [Number(p.telegram_id), p]));
  const list = (data ?? []).map((c: Row) => { const p = byId.get(c.parent_id) ?? {}; return { id: c.id, name: c.name, age: c.age, status: c.status, parent: parentName(p), phone: p.phone ?? "" }; })
    .filter((c: Row) => !q || c.name.toLowerCase().includes(q) || c.parent.toLowerCase().includes(q) || String(c.phone).includes(q.replace(/\D/g, "") || "~"));
  const page = list.slice(0, 30);
  const t = await totals(page.map((c: Row) => c.id));
  return { kids: page.map((c: Row) => ({ ...c, coins: t[c.id]?.coins ?? 0, points: t[c.id]?.points ?? 0, month_points: t[c.id]?.period ?? 0 })) };
}
// Coins: credits from B2B orders and prizes, debits when the owner paid cash or counted them as a discount.
async function apiCoinsAdd(user: Row, body: Row) {
  const c = await childById(String(body.child ?? ""));
  if (!c) throw new HttpError(404, "child");
  const kind = String(body.kind ?? "");
  if (!["order", "prize", "payout", "discount", "adjust"].includes(kind)) throw new HttpError(400, "kind");
  let amount = kind === "adjust" ? intIn(body.amount, -1000000, 1000000) : intIn(body.amount, 1, 1000000);
  if (amount === null || amount === 0) throw new HttpError(400, "amount");
  const note = String(body.note ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  const balance = await coinsOf(c.id);
  if (kind === "payout" || kind === "discount") {
    if (amount > balance) throw new HttpError(409, "balance");
    if (kind === "discount" && amount * COIN_SOM > Math.round((await settings()).prices.course_price * DISCOUNT_MAX_PCT / 100)) throw new HttpError(409, "discount_max");
    amount = -amount;
  }
  if (balance + amount < 0) throw new HttpError(409, "balance");
  const ref = crypto.randomUUID();
  const { error } = await db.from("sik_coins").insert({ child_id: c.id, kind, amount, note: note || null, ref: `${kind}:${ref}`, created_by: user.id });
  if (error) throw new HttpError(500, "db");
  if (kind === "order") await award(c.id, "order", ORDER_POINTS, `order:${ref}`, note || "B2B buyurtma", user.id);
  const nb = balance + amount;
  const label: Record<string, string> = { order: "B2B buyurtma", prize: "Sovrin", payout: "Pulga aylantirildi", discount: "Kurs to‘loviga chegirma", adjust: "Tuzatish" };
  await send(c.parent_id, `💰 <b>${esc(c.name)}</b>: ${amount > 0 ? "+" : "−"}${Math.abs(amount)} tanga — ${esc(note || label[kind])}.\nBalans: <b>${nb} tanga</b> (${sum(nb * COIN_SOM)} so‘m).`, inline([[app("🐻 Hamyon", "#wallet")]]));
  await notice(c.parent_id, "coins", `${amount > 0 ? "+" : "−"}${Math.abs(amount)} tanga`, `${c.name}: ${note || label[kind]} · balans ${nb} tanga`, { amount }, c.id);
  return { balance: nb };
}
async function apiLessonSave(user: Row, body: Row) {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(body.date ?? "")), t = /^(\d{2}):(\d{2})$/.exec(String(body.time ?? ""));
  if (!d || !t || +t[1] > 23 || +t[2] > 59) throw new HttpError(400, "datetime");
  const startMs = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]) - TZ_MS;
  if (!Number.isFinite(startMs)) throw new HttpError(400, "datetime");
  const teacher = Number(body.teacher_id);
  const row = {
    starts_at: iso(startMs), duration_min: intIn(body.duration_min ?? 45, 15, 240) ?? 45, seats: intIn(body.seats ?? 15, 1, 200) ?? 15,
    title: String(body.title ?? "").replace(/\s+/g, " ").trim().slice(0, 80) || "Ochiq sinov darsi",
    teacher_id: Number.isSafeInteger(teacher) && teacher > 0 ? teacher : null, updated_at: new Date().toISOString(),
  };
  const id = String(body.id ?? "");
  if (id) {
    const { data: was } = await db.from("sik_lessons").select("*").eq("id", id).maybeSingle();
    if (!was) throw new HttpError(404, "lesson");
    await db.from("sik_lessons").update(row).eq("id", id);
    if (Date.parse(was.starts_at) !== startMs || was.duration_min !== row.duration_min) await lessonMoved({ ...was, ...row });
    return { id };
  }
  if (startMs < Date.now()) throw new HttpError(400, "past");
  const { data, error } = await db.from("sik_lessons").insert({ ...row, created_by: user.id }).select("id").single();
  if (error || !data) throw new HttpError(500, "db");
  const { data: ps } = await db.from("sik_parents").select("*").eq("state", "lesson").limit(30);
  for (const p of ps ?? []) await askLessons(p, null, "🆕 Yangi sinov darsi qo‘shildi!");
  return { id: data.id };
}
async function lessonMoved(l: Row) {
  const { data: bs } = await db.from("sik_bookings").select("*").eq("lesson_id", l.id).in("status", ["pending_payment", "check_sent", "paid", "attended", "no_show"]);
  const until = lessonEnd(l) + AFTER_MS;
  for (const b of bs ?? []) {
    if (PAID.includes(b.status)) {
      await db.from("sik_bookings").update({ access_until: iso(until), credit_until: iso(until), updated_at: new Date().toISOString() }).eq("id", b.id);
      const child = b.child_id ? await childById(b.child_id) : null;
      if (child) await openTrial(child, until);
    }
    await db.from("sik_sent").delete().eq("booking_id", b.id).in("kind", ["r24", "r2"]);
    if (b.status === "pending_payment" && !holds(b, Date.now())) continue;
    await send(b.parent_id, `🔔 Sinov darsi vaqti o‘zgardi: <b>${esc(b.child_name)}</b> — ${fmtWhen(l.starts_at)}`);
    await notice(b.parent_id, "lesson", "Dars vaqti o‘zgardi", `${b.child_name} — ${fmtWhen(l.starts_at)}`, {}, b.child_id ?? null);
  }
}
async function apiLessonCancel(body: Row) {
  const id = String(body.id ?? "");
  const { data: bs } = await db.from("sik_bookings").select("status,hold_until").eq("lesson_id", id).in("status", LIVE);
  if ((bs ?? []).some((b: Row) => holds(b, Date.now()))) throw new HttpError(409, "has_bookings");
  await db.from("sik_lessons").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", id);
  return { cancelled: true };
}
async function apiSettings() {
  const s = await settings();
  return { card: s.card, center: s.center, prices: s.prices, discounts: s.discounts, referral: s.referral, bot: s.bot.username ?? null };
}
// Each section is saved only when sent.
async function apiSettingsSave(user: Row, body: Row) {
  const obj = (v: unknown): Row | null => (v && typeof v === "object" && !Array.isArray(v) ? v as Row : null);
  const line = (v: unknown, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
  const c = obj(body.card), z = obj(body.center), pr = obj(body.prices), rf = obj(body.referral);
  if (c) await setSetting("card", { number: String(c.number ?? "").replace(/[^\d ]/g, "").replace(/\s+/g, " ").trim().slice(0, 23), holder: line(c.holder, 60) }, user.id);
  if (z) {
    const map = String(z.map_url ?? "").trim();
    await setSetting("center", { address: line(z.address, 200), landmark: line(z.landmark, 200), map_url: /^https:\/\/\S+$/.test(map) ? map.slice(0, 300) : "" }, user.id);
  }
  if (pr) {
    const price = intIn(pr.price, 1000, 10000000), course = intIn(pr.course_price, 1000, 100000000);
    if (price === null || course === null) throw new HttpError(400, "prices");
    await setSetting("prices", { price, course_price: course }, user.id);
  }
  if (rf) {
    const coins = intIn(rf.inviter_coins, 0, 100000), discount = intIn(rf.friend_discount, 0, 10000000);
    if (coins === null || discount === null) throw new HttpError(400, "referral");
    await setSetting("referral", { inviter_coins: coins, friend_discount: discount }, user.id);
  }
  return await apiSettings();
}
async function apiStaff() {
  const { data } = await db.from("sik_staff").select("telegram_id,name,username,status,role,created_at").in("status", ["pending", "active"]).order("created_at");
  return { staff: data ?? [] };
}
async function apiStaffSet(user: Row, body: Row) {
  const id = Number(body.telegram_id), status = String(body.status ?? "");
  const role = body.role === "admin" ? "admin" : body.role === "teacher" ? "teacher" : null;
  if (!Number.isSafeInteger(id) || id <= 0 || !["active", "removed"].includes(status)) throw new HttpError(400, "staff");
  await setStaff(id, status, role, user.id);
  return { telegram_id: id, status, role };
}

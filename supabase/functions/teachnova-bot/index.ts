import { createClient } from "npm:@supabase/supabase-js@2.117.2";

// @teachnova_bot: rahbar uchun "cho'ntak" paneli — CRM va Kvitansiya Mini App sifatida bot ichida ochiladi.
// Bot tokeni faqat Supabase → Edge Functions → Secrets → TEACHNOVA_BOT_TOKEN da (kodda ham, bazada ham yoʻq).
// Webhook siri tokendan hosil qilinadi (alohida secret kerak emas). Hozircha faqat rol "owner" (tg_chatlar) ishlaydi;
// boshqalarga bot hech narsa javob bermaydi.

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const HEAD = { "Content-Type": "application/json; charset=utf-8" };
const json = (o: Record<string, unknown>, status = 200) => new Response(JSON.stringify(o), { status, headers: HEAD });
const CRM_SITE = "https://platform770uz-dev.github.io/zamonaviy-kasblar-crm/";
const KV_SITE = "https://platform770uz-dev.github.io/yba-kvitansiya/";
const BTN_CRM = "📊 CRM";
const BTN_KV = "🧾 Kvitansiya";
const BTN_LOGIN = "🔑 CRM’ga kirish havolasi";

const hex = (bytes: ArrayBuffer | Uint8Array) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha256 = async (s: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const botToken = () => Deno.env.get("TEACHNOVA_BOT_TOKEN") ?? "";
const webhookSecret = async (token: string) => (await sha256("teachnova-webhook:" + token)).slice(0, 48);

// Xato matnida token boʻlib qolmasin.
async function tg(method: string, payload: Record<string, unknown> = {}): Promise<any> {
  const token = botToken();
  if (!token) return { ok: false, description: "TEACHNOVA_BOT_TOKEN yoʻq" };
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return await r.json();
  } catch (e) {
    return { ok: false, description: String(e).replaceAll(token, "***").slice(0, 200) };
  }
}

const send = (chat_id: number, text: string, reply_markup?: unknown) =>
  tg("sendMessage", { chat_id, text, link_preview_options: { is_disabled: true }, ...(reply_markup ? { reply_markup } : {}) });

const mainKeyboard = {
  keyboard: [
    [{ text: BTN_CRM, web_app: { url: CRM_SITE } }, { text: BTN_KV, web_app: { url: KV_SITE } }],
    [{ text: BTN_LOGIN }],
  ],
  resize_keyboard: true,
  is_persistent: true,
};

async function isOwner(id: number) {
  const { data, error } = await sb.from("tg_chatlar").select("rol,tasdiqlangan,bloklangan").eq("chat_id", id).maybeSingle();
  return !error && !!data?.tasdiqlangan && !data.bloklangan && data.rol === "owner";
}

// Bir martalik (5 daqiqa) CRM kirish havolasi — tg-bot bilan bir xil crm_browser_login_tokens jadvali.
async function sendLoginLink(chatId: number) {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const saved = await sb.from("crm_browser_login_tokens").insert({
    token_hash: await sha256(token), chat_id: chatId, expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  });
  if (saved.error) return send(chatId, "Havolani hozir yaratib boʻlmadi. Birozdan keyin qayta urinib koʻring.");
  return send(chatId, "CRM’ga kirish uchun tugmani bosing. Havola 5 daqiqada tugaydi va bir marta ishlaydi.", {
    inline_keyboard: [[{ text: "📊 CRM’ni ochish", web_app: { url: CRM_SITE + "#crm-login=" + token } }]],
  });
}

async function onMessage(m: any) {
  if (!m?.chat || m.chat.type !== "private" || !m.from || m.from.is_bot) return;
  const id = Number(m.from.id);
  if (!Number.isSafeInteger(id) || id !== Number(m.chat.id)) return;
  if (!await isOwner(id)) return; // begona odamga hech qanday javob yoʻq
  const text = typeof m.text === "string" ? m.text.trim() : "";
  if (text === BTN_LOGIN || /^\/login(?:@\S+)?$/i.test(text)) return void await sendLoginLink(id);
  await send(id, "Boshqaruv paneli. CRM va Kvitansiya pastdagi tugmalarda.", mainKeyboard);
}

// Webhookni oʻrnatish: token qoʻshilgandan soʻng bir marta chaqiriladi. Faqat shu funksiyaning oʻziga ulaydi.
async function setup() {
  const token = botToken();
  if (!token) return json({ ok: false, qadam: "TEACHNOVA_BOT_TOKEN secret yoʻq" }, 503);
  const me = await tg("getMe");
  if (!me.ok) return json({ ok: false, qadam: "getMe", xato: me.description }, 400);
  const hook = `${Deno.env.get("SUPABASE_URL")}/functions/v1/teachnova-bot`;
  const wh = await tg("setWebhook", { url: hook, secret_token: await webhookSecret(token), allowed_updates: ["message"], drop_pending_updates: true });
  const cmd = await tg("setMyCommands", { commands: [{ command: "start", description: "Boshqaruv paneli" }, { command: "login", description: "CRM’ga kirish havolasi" }] });
  const mb = await tg("setChatMenuButton", { menu_button: { type: "web_app", text: "CRM", web_app: { url: CRM_SITE } } });
  return json({ ok: wh.ok === true, bot: me.result.username, webhook: wh.description ?? "ok", commands: cmd.ok === true, menu_button: mb.ok === true });
}

Deno.serve(async (req: Request) => {
  const token = botToken();
  if (new URL(req.url).searchParams.get("setup") === "1") return await setup();
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!token) return json({ error: "not_configured" }, 503);
  const got = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!got || !safeEqual(got, await webhookSecret(token))) return json({ error: "unauthorized" }, 401);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  try { await onMessage(body?.message); } catch (e) { console.error("teachnova update:", String(e).replaceAll(token, "***").slice(0, 200)); }
  return json({ ok: true }); // Telegram'ga doim 200
});

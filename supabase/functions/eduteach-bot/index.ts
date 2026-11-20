// @ts-nocheck
// @eduteachuz_bot — markaz operatorlari uchun qoʻngʻiroq skripti (Mini App: https://platform770uz-dev.github.io/operator-skript/).
// Operator Start bosadi → raqamini yuboradi → rahbarga @teachnova_bot orqali «Qabul qilish / Rad etish» soʻrovi boradi.
// Rahbar tugmalari («sk:…»), «🎧 Operatorlar», CRM ruxsati va oʻchirish teachnova-bot ga keladi va bu yerga
// ?owner_cb=1 / ?owner_list=1 bilan uzatiladi (x-crm-secret = crm_maxfiy.tg_ichki).
// Soʻrovsiz faqat rahbar (tg_chatlar, rol=owner) ochadi. CRM ruxsati berilgan operator tg_chatlar da admin boʻladi.
// Tokenlar faqat Supabase → Edge Functions → Secrets da: EDUTEACH_BOT_TOKEN (operator boti), TEACHNOVA_BOT_TOKEN (rahbar boti).
// Webhook siri tokendan hosil qilinadi. Ulash: token qoʻshilgach ?setup=1 ni bir marta oching.
// Mini App ?access=1 ga Telegram initData yuboradi: imzo EDUTEACH_BOT_TOKEN bilan tekshiriladi.
import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const APP_URL = "https://platform770uz-dev.github.io/operator-skript/";
const APP_ORIGIN = "https://platform770uz-dev.github.io";
const CRM_SITE = "https://platform770uz-dev.github.io/zamonaviy-kasblar-crm/";
const BTN_CRM = "📊 CRM";
const FN = "eduteach-bot";

// Yangi secret kalit (sb_secret_…) boʻlsa — u, boʻlmasa eski service_role.
function dbKey() {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    if (keys && typeof keys.default === "string" && keys.default) return { key: keys.default, kind: "secret" };
  } catch (_) { /* eski kalitga oʻtamiz */ }
  return { key: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", kind: "legacy" };
}
const DB = dbKey();
const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", DB.key, { auth: { persistSession: false } });

const HEAD = { "Content-Type": "application/json; charset=utf-8" };
const CORS = {
  "Access-Control-Allow-Origin": APP_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin",
};
const json = (o, status = 200, extra = {}) => new Response(JSON.stringify(o), { status, headers: { ...HEAD, ...extra } });

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha256 = async (s) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
async function hmac(key, data) {
  const raw = typeof key === "string" ? enc.encode(key) : key;
  const k = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
}
function safeEqual(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
const short = (s, n) => { s = String(s ?? ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const nowIso = () => new Date().toISOString();
const tashkent = (iso) => iso
  ? new Date(iso).toLocaleString("ru-RU", { timeZone: "Asia/Tashkent", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
  : "—";

/* ---------- Telegram ---------- */
const opToken = () => Deno.env.get("EDUTEACH_BOT_TOKEN") ?? "";
const novaToken = () => Deno.env.get("TEACHNOVA_BOT_TOKEN") ?? "";
const webhookSecret = async (token) => (await sha256("eduteach-webhook:" + token)).slice(0, 48);

// Xato matnida token boʻlib qolmasin.
async function tgCall(token, method, payload = {}) {
  if (!token) return { ok: false, description: "token yoʻq" };
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
const op = (method, payload = {}) => tgCall(opToken(), method, payload);
const nova = (method, payload = {}) => tgCall(novaToken(), method, payload);

/* ---------- Operatorga matnlar (Telegram tili ru boʻlsa — ruscha) ---------- */
const TXT = {
  uz: {
    hello: (name) => `Assalomu alaykum${name ? ", " + name : ""}! 👋\nBu — markaz operatorlari uchun qoʻngʻiroq skripti va trenajyor.\n\nKirish uchun pastdagi «📱 Raqamni yuborish» tugmasini bosing — soʻrovingiz rahbarga boradi.`,
    phoneBtn: "📱 Raqamni yuborish",
    ownPhone: "Iltimos, oʻzingizning raqamingizni yuboring: pastdagi «📱 Raqamni yuborish» tugmasini bosing.",
    sent: "✅ Soʻrov rahbarga yuborildi. Tasdiqlangach, shu yerga xabar keladi.",
    wait: "⏳ Soʻrovingiz rahbarga yuborilgan. Tasdiqlashni kuting.",
    approved: "✅ Ruxsat berildi! Skriptni pastdagi tugma yoki «Skript» menyusi orqali oching.\n\nBirinchi qoʻngʻiroqdan oldin «Trenajyor» boʻlimidan oʻting — 10 daqiqa.",
    ready: "📖 Skript tayyor: pastdagi tugma yoki «Skript» menyusi orqali oching.",
    openBtn: "📖 Skriptni ochish",
    rejected: "Afsuski, rahbar soʻrovni rad etdi. Savol boʻlsa, rahbarga murojaat qiling.",
    revoked: "Skriptga kirish yopildi. Savol boʻlsa, rahbarga murojaat qiling.",
    crmLink: "CRM’ga kirish uchun tugmani bosing. Havola 5 daqiqada tugaydi va bir marta ishlaydi.",
    crmOpen: "📊 CRM’ni ochish",
    crmFail: "Havolani hozir yaratib boʻlmadi. Birozdan keyin qayta urinib koʻring.",
    crmNo: "CRM sizga hali ochilmagan. Rahbardan ruxsat soʻrang.",
    crmGiven: "📊 CRM ochildi. Pastdagi «📊 CRM» tugmasi orqali kiring.",
  },
  ru: {
    hello: (name) => `Здравствуйте${name ? ", " + name : ""}! 👋\nЭто скрипт звонков и тренажёр для операторов центра.\n\nЧтобы получить доступ, нажмите кнопку «📱 Отправить номер» внизу — заявка уйдёт руководителю.`,
    phoneBtn: "📱 Отправить номер",
    ownPhone: "Пожалуйста, отправьте свой номер: нажмите кнопку «📱 Отправить номер» внизу.",
    sent: "✅ Заявка отправлена руководителю. Когда её примут, сюда придёт сообщение.",
    wait: "⏳ Заявка уже у руководителя. Дождитесь подтверждения.",
    approved: "✅ Доступ открыт! Откройте скрипт кнопкой ниже или через меню «Skript».\n\nПеред первым звонком пройдите «Тренажёр» — это 10 минут.",
    ready: "📖 Скрипт готов: откройте его кнопкой ниже или через меню «Skript».",
    openBtn: "📖 Открыть скрипт",
    rejected: "К сожалению, руководитель отклонил заявку. Если есть вопросы, напишите руководителю.",
    revoked: "Доступ к скрипту закрыт. Если есть вопросы, напишите руководителю.",
    crmLink: "Нажмите кнопку, чтобы войти в CRM. Ссылка действует 5 минут и срабатывает один раз.",
    crmOpen: "📊 Открыть CRM",
    crmFail: "Не удалось создать ссылку. Попробуйте ещё раз чуть позже.",
    crmNo: "CRM вам пока не открыта. Попросите доступ у руководителя.",
    crmGiven: "📊 CRM открыта. Входите кнопкой «📊 CRM» внизу.",
  },
};
const L = (til) => (String(til || "").toLowerCase().startsWith("ru") ? TXT.ru : TXT.uz);
const MENU_TEXT = "Skript";

/* ---------- Baza ---------- */
const COLS = "chat_id,ism,username,telefon,til,holat,sorov_vaqti,hal_vaqti,oxirgi_kirish,xabarlar,created_at";
const ICON = { yangi: "📵", kutilmoqda: "⏳", faol: "✅", rad: "⛔", olingan: "🚫" };
const STATUS = { yangi: "raqam yubormagan", kutilmoqda: "soʻrov kutilmoqda", faol: "faol", rad: "rad etilgan", olingan: "ruxsat olingan" };

async function getOperator(id) {
  const { data, error } = await sb.from("skript_operatorlar").select(COLS).eq("chat_id", id).maybeSingle();
  if (error) throw new Error("db " + error.message);
  return data;
}
// teachnova-bot dagi faol rol: "owner" (rahbar) yoki "admin" (CRM ruxsati bor odam).
async function staffRole(id) {
  const { data } = await sb.from("tg_chatlar").select("rol,tasdiqlangan,bloklangan").eq("chat_id", id).maybeSingle();
  return data && data.tasdiqlangan && !data.bloklangan && (data.rol === "owner" || data.rol === "admin") ? data.rol : "";
}
async function ownerIds() {
  const { data } = await sb.from("tg_chatlar").select("chat_id").eq("rol", "owner").eq("tasdiqlangan", true).eq("bloklangan", false);
  return (data ?? []).map((r) => Number(r.chat_id));
}

/* ---------- Operator boti (@eduteachuz_bot) ---------- */
// Operatorda CRM bormi: tg_chatlar da tasdiqlangan yozuv bo'lsa — bor (rahbar «📊 CRM» tugmasi bilan beradi).
const hasCrm = async (id) => (await staffRole(id)) !== "";

const opKeyboard = (til, crm) => ({
  keyboard: crm ? [[{ text: L(til).openBtn, web_app: { url: APP_URL } }], [{ text: BTN_CRM }]]
                : [[{ text: L(til).openBtn, web_app: { url: APP_URL } }]],
  resize_keyboard: true,
  is_persistent: true,
});

async function giveScript(chatId, til, text, crm) {
  await op("setChatMenuButton", { chat_id: chatId, menu_button: { type: "web_app", text: MENU_TEXT, web_app: { url: APP_URL } } });
  return op("sendMessage", { chat_id: chatId, text, reply_markup: opKeyboard(til, crm) });
}
async function closeScript(chatId, text) {
  await op("setChatMenuButton", { chat_id: chatId, menu_button: { type: "commands" } });
  return op("sendMessage", { chat_id: chatId, text, reply_markup: { remove_keyboard: true } });
}

// Bir martalik (5 daqiqa) CRM havolasi — teachnova-bot bilan bir xil crm_browser_login_tokens jadvali.
async function sendCrmLink(chatId, til) {
  const t = L(til);
  if (!(await hasCrm(chatId))) return op("sendMessage", { chat_id: chatId, text: t.crmNo });
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const saved = await sb.from("crm_browser_login_tokens").insert({
    token_hash: await sha256(token), chat_id: chatId, expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  });
  if (saved.error) return op("sendMessage", { chat_id: chatId, text: t.crmFail });
  return op("sendMessage", {
    chat_id: chatId, text: t.crmLink,
    reply_markup: { inline_keyboard: [[{ text: t.crmOpen, web_app: { url: CRM_SITE + "#crm-login=" + token } }]] },
  });
}

async function onOperatorMessage(m) {
  if (!m || !m.chat || m.chat.type !== "private" || !m.from || m.from.is_bot) return;
  const id = Number(m.from.id);
  if (!Number.isSafeInteger(id) || id !== Number(m.chat.id)) return;
  const tilNow = m.from.language_code ? String(m.from.language_code).slice(0, 10) : null;
  const text0 = typeof m.text === "string" ? m.text.trim() : "";
  if ((await staffRole(id)) === "owner") {
    if (text0 === BTN_CRM) return void await sendCrmLink(id, tilNow);
    return void await giveScript(id, tilNow, L(tilNow).ready, true);
  }

  const ism = [m.from.first_name, m.from.last_name].filter(Boolean).join(" ").slice(0, 120) || null;
  const username = m.from.username ? String(m.from.username).slice(0, 64) : null;
  let o = await getOperator(id);
  if (!o) {
    const ins = await sb.from("skript_operatorlar").insert({ chat_id: id, ism, username, til: tilNow, holat: "yangi" });
    if (ins.error && ins.error.code !== "23505") throw new Error("db " + ins.error.message);
    o = await getOperator(id);
    if (!o) return;
  }
  const til = tilNow || o.til;
  const t = L(til);
  if (o.holat === "faol") {
    if (text0 === BTN_CRM) return void await sendCrmLink(id, til);
    return void await giveScript(id, til, t.ready, await hasCrm(id));
  }
  if (o.holat === "kutilmoqda") return void await op("sendMessage", { chat_id: id, text: t.wait });
  if (o.holat === "rad") return void await op("sendMessage", { chat_id: id, text: t.rejected });
  if (o.holat === "olingan") return void await op("sendMessage", { chat_id: id, text: t.revoked });

  // holat = yangi: raqamini kutamiz.
  const phoneKb = { keyboard: [[{ text: t.phoneBtn, request_contact: true }]], resize_keyboard: true, is_persistent: true };
  if (m.contact) {
    if (Number(m.contact.user_id) !== id) return void await op("sendMessage", { chat_id: id, text: t.ownPhone, reply_markup: phoneKb });
    const digits = String(m.contact.phone_number || "").replace(/\D/g, "").slice(0, 15);
    const upd = await sb.from("skript_operatorlar")
      .update({ ism, username, til, telefon: digits ? "+" + digits : null, holat: "kutilmoqda", sorov_vaqti: nowIso(), updated_at: nowIso() })
      .eq("chat_id", id).eq("holat", "yangi").select(COLS).maybeSingle();
    if (upd.error) throw new Error("db " + upd.error.message);
    if (!upd.data) return; // parallel xabar: soʻrov allaqachon ketgan
    await op("sendMessage", { chat_id: id, text: t.sent, reply_markup: { remove_keyboard: true } });
    await notifyOwners(upd.data);
    return;
  }
  await sb.from("skript_operatorlar").update({ ism, username, til, updated_at: nowIso() }).eq("chat_id", id).eq("holat", "yangi");
  await op("sendMessage", { chat_id: id, text: t.hello(m.from.first_name ? short(m.from.first_name, 40) : ""), reply_markup: phoneKb });
}

/* ---------- Rahbar tomoni (@teachnova_bot orqali) ---------- */
const who = (o) => `${o.ism || "—"}${o.username ? ` (@${o.username})` : ""} · ${o.chat_id}`;

function cardText(o) {
  const head = o.holat === "kutilmoqda" || o.holat === "yangi"
    ? `🎧 Yangi operator: skriptga kirish soʻrovi\n🕒 ${tashkent(o.sorov_vaqti || o.created_at)}`
    : `${ICON[o.holat]} ${o.holat === "faol" ? "Qabul qilindi — skript ochiq" : o.holat === "rad" ? "Rad etildi" : "Ruxsat olib tashlandi"} · ${tashkent(o.hal_vaqti)}\n🎧 Skript operatori`;
  return `${head}\n👤 ${who(o)}\n📱 ${o.telefon || "raqam yoʻq"}`;
}
function cardKb(o) {
  const id = o.chat_id;
  const row = o.holat === "faol"
    ? [{ text: "🚫 Ruxsatni olish", callback_data: `sk:off:${id}` }]
    : o.holat === "rad" || o.holat === "olingan"
      ? [{ text: "✅ Ruxsat berish", callback_data: `sk:ok:${id}` }]
      : [{ text: "✅ Qabul qilish", callback_data: `sk:ok:${id}` }, { text: "⛔ Rad etish", callback_data: `sk:no:${id}` }];
  return { inline_keyboard: [row, [{ text: "🎧 Barcha operatorlar", callback_data: "sk:list" }]] };
}
async function notifyOwners(o) {
  const msgs = [];
  for (const chatId of await ownerIds()) {
    const r = await nova("sendMessage", { chat_id: chatId, text: cardText(o), link_preview_options: { is_disabled: true }, reply_markup: cardKb(o) });
    if (r && r.ok) msgs.push({ chat_id: chatId, message_id: r.result.message_id });
    else console.error("owner notify:", r && r.description);
  }
  await sb.from("skript_operatorlar").update({ xabarlar: msgs }).eq("chat_id", o.chat_id);
}
// Qarordan keyin rahbarlardagi soʻrov xabarlarini (bosilganini ham) yangilaymiz.
async function refreshCards(o, pressed) {
  const list = (Array.isArray(o.xabarlar) ? o.xabarlar : []).slice();
  if (pressed && !list.some((x) => x.chat_id === pressed.chat_id && x.message_id === pressed.message_id)) list.push(pressed);
  for (const x of list) {
    await nova("editMessageText", { chat_id: x.chat_id, message_id: x.message_id, text: cardText(o), link_preview_options: { is_disabled: true }, reply_markup: cardKb(o) });
  }
}

const RANK = { kutilmoqda: 0, yangi: 1, faol: 2, olingan: 3, rad: 4 };
async function listView() {
  const { data, error } = await sb.from("skript_operatorlar").select(COLS).order("created_at", { ascending: false }).limit(40);
  if (error) return { text: "Roʻyxatni hozir ochib boʻlmadi. Birozdan keyin qayta urinib koʻring." };
  const rows = (data ?? []).slice().sort((a, b) => (RANK[a.holat] ?? 9) - (RANK[b.holat] ?? 9));
  const { data: staff } = await sb.from("tg_chatlar").select("chat_id").eq("tasdiqlangan", true).eq("bloklangan", false);
  const crmSet = new Set((staff ?? []).map((r) => Number(r.chat_id)));
  const foot = "ℹ️ Skriptni soʻrovsiz faqat rahbar ochadi. CRM ruxsatini «👥 Adminlar» boʻlimidan olib tashlash mumkin.";
  if (!rows.length) {
    return { text: `🎧 Skript operatorlari: hozircha yoʻq.\n\nOperatorga @eduteachuz_bot havolasini yuboring: u Start bosib, raqamini yuborsa, sizga shu yerga soʻrov keladi.\n\n${foot}` };
  }
  const n = (h) => rows.filter((r) => r.holat === h).length;
  const lines = rows.map((r) => {
    const when = r.holat === "faol" ? (r.oxirgi_kirish ? `oxirgi kirish ${tashkent(r.oxirgi_kirish)}` : "skriptni hali ochmagan")
      : r.holat === "kutilmoqda" ? `soʻrov ${tashkent(r.sorov_vaqti)}`
      : STATUS[r.holat] || r.holat;
    return `${ICON[r.holat] || "•"} ${short(r.ism || (r.username ? "@" + r.username : r.chat_id), 32)}${r.telefon ? " · " + r.telefon : ""} · ${when}${crmSet.has(Number(r.chat_id)) ? " · 📊 CRM" : ""}`;
  });
  const kb = rows.map((r) => {
    const name = short(r.ism || r.username || r.chat_id, 18);
    const trash = { text: "🗑", callback_data: `sk:del:${r.chat_id}` };
    if (r.holat === "faol") {
      const row = [{ text: `🚫 ${name}`, callback_data: `sk:off:${r.chat_id}:l` }];
      if (!crmSet.has(Number(r.chat_id))) row.push({ text: "📊 CRM", callback_data: `sk:crm:${r.chat_id}` });
      row.push(trash);
      return row;
    }
    if (r.holat === "rad" || r.holat === "olingan") return [{ text: `↩️ ${name}`, callback_data: `sk:ok:${r.chat_id}:l` }, trash];
    return [{ text: `✅ ${name}`, callback_data: `sk:ok:${r.chat_id}:l` }, { text: `⛔ ${name}`, callback_data: `sk:no:${r.chat_id}:l` }, trash];
  });
  const head = `🎧 Skript operatorlari: ${rows.length}\n✅ faol ${n("faol")} · ⏳ kutilmoqda ${n("kutilmoqda")} · 📵 raqamsiz ${n("yangi")} · ⛔ yopiq ${n("rad") + n("olingan")}`;
  const help = "Tugmalar: 🚫 — ruxsatni olish, ↩️ — qaytarish, ✅ / ⛔ — soʻrovga javob, 📊 CRM — CRM ni ochish, 🗑 — roʻyxatdan oʻchirish.";
  return { text: `${head}\n\n${lines.join("\n")}\n\n${help}\n${foot}`.slice(0, 4000), kb: { inline_keyboard: kb } };
}
async function sendList(chatId) {
  const v = await listView();
  return nova("sendMessage", { chat_id: chatId, text: v.text, link_preview_options: { is_disabled: true }, ...(v.kb ? { reply_markup: v.kb } : {}) });
}
async function editList(chatId, messageId) {
  const v = await listView();
  return nova("editMessageText", { chat_id: chatId, message_id: messageId, text: v.text, link_preview_options: { is_disabled: true }, ...(v.kb ? { reply_markup: v.kb } : {}) });
}

const RULES = {
  ok: { to: "faol", from: ["yangi", "kutilmoqda", "rad", "olingan"], done: "Qabul qilindi" },
  no: { to: "rad", from: ["yangi", "kutilmoqda"], done: "Rad etildi" },
  off: { to: "olingan", from: ["faol"], done: "Ruxsat olindi" },
};
async function onOwnerCallback(cb) {
  if (!cb || !cb.id) return;
  const answer = (text) => nova("answerCallbackQuery", { callback_query_id: cb.id, ...(text ? { text } : {}) });
  const from = Number(cb.from && cb.from.id);
  if (!Number.isSafeInteger(from) || (await staffRole(from)) !== "owner") return void await answer();
  const data = String(cb.data ?? "");
  if (data === "sk:list") { await answer(); return void await sendList(from); }

  // CRM ruxsati: operatorni tg_chatlar ga admin sifatida qo'shamiz — CRM shu jadval orqali kiritadi.
  // Olib tashlash «👥 Adminlar» bo'limida (bir joyda kim CRM ga kirishi ko'rinib tursin).
  const crmM = /^sk:crm:(\d{1,15})$/.exec(data);
  if (crmM) {
    const target = Number(crmM[1]);
    const msg = cb.message && cb.message.chat ? { chat_id: cb.message.chat.id, message_id: cb.message.message_id } : null;
    const o = await getOperator(target);
    if (!o || o.holat !== "faol") return void await answer("Avval operatorni qabul qiling");
    if (await hasCrm(target)) {
      await answer("CRM allaqachon ochiq");
      if (msg) await editList(msg.chat_id, msg.message_id);
      return;
    }
    const up = await sb.from("tg_chatlar").upsert(
      { chat_id: target, ism: o.ism, username: o.username, rol: "admin", requested_rol: "admin", tasdiqlangan: true, bloklangan: false },
      { onConflict: "chat_id" },
    );
    if (up.error) return void await answer("Xato, qayta urining");
    await answer("CRM ochildi");
    await giveScript(target, o.til, L(o.til).crmGiven, true);
    if (msg) await editList(msg.chat_id, msg.message_id);
    return;
  }

  // Oʻchirish: avval tasdiq soʻraymiz. Tasdiqlansa, yozuv butunlay oʻchadi va odam qaytadan soʻrov yubora oladi.
  const delM = /^sk:(del|delok|delno):(\d{1,15})$/.exec(data);
  if (delM) {
    const target = Number(delM[2]);
    const msg = cb.message && cb.message.chat ? { chat_id: cb.message.chat.id, message_id: cb.message.message_id } : null;
    const o = await getOperator(target);
    if (!o) {
      await answer("Topilmadi");
      if (msg) await editList(msg.chat_id, msg.message_id);
      return;
    }
    if (delM[1] === "del") {
      await answer();
      if (msg) {
        await nova("editMessageText", {
          chat_id: msg.chat_id, message_id: msg.message_id,
          text: `🗑 Oʻchirilsinmi?\n👤 ${who(o)}\n📱 ${o.telefon || "raqam yoʻq"}\n\nYozuv butunlay oʻchadi. Bu odam keyin qaytadan Start bosib, yangi soʻrov yubora oladi.`,
          reply_markup: { inline_keyboard: [[{ text: "🗑 Ha, oʻchirish", callback_data: `sk:delok:${target}` }, { text: "Bekor qilish", callback_data: `sk:delno:${target}` }]] },
        });
      }
      return;
    }
    if (delM[1] === "delno") {
      await answer("Bekor qilindi");
      if (msg) await editList(msg.chat_id, msg.message_id);
      return;
    }
    const wasActive = o.holat === "faol";
    const del = await sb.from("skript_operatorlar").delete().eq("chat_id", target);
    if (del.error) return void await answer("Xato, qayta urining");
    await answer("Oʻchirildi");
    if (wasActive) await closeScript(target, L(o.til).revoked);
    // Rahbardagi eski soʻrov kartalari endi mavjud boʻlmagan yozuvga ishora qilmasin.
    for (const x of (Array.isArray(o.xabarlar) ? o.xabarlar : [])) {
      await nova("editMessageText", { chat_id: x.chat_id, message_id: x.message_id, text: `🗑 Oʻchirildi · ${who(o)}` });
    }
    if (msg) await editList(msg.chat_id, msg.message_id);
    return;
  }

  const m = /^sk:(ok|no|off):(\d{1,15})(:l)?$/.exec(data);
  if (!m) return void await answer();
  const target = Number(m[2]);
  const rule = RULES[m[1]];
  const upd = await sb.from("skript_operatorlar")
    .update({ holat: rule.to, hal_qildi: from, hal_vaqti: nowIso(), updated_at: nowIso() })
    .eq("chat_id", target).in("holat", rule.from).select(COLS).maybeSingle();
  if (upd.error) return void await answer("Xato, qayta urining");
  let o = upd.data;
  if (o) {
    await answer(rule.done);
    const t = L(o.til);
    if (rule.to === "faol") await giveScript(target, o.til, t.approved, await hasCrm(target));
    else await closeScript(target, rule.to === "rad" ? t.rejected : t.revoked);
  } else {
    o = await getOperator(target); // holat allaqachon oʻzgargan
    await answer(o ? `Holat: ${STATUS[o.holat] || o.holat}` : "Topilmadi");
    if (!o) return;
  }
  const msg = cb.message && cb.message.chat ? { chat_id: cb.message.chat.id, message_id: cb.message.message_id } : null;
  if (m[3]) {
    await refreshCards(o, null);
    if (msg) await editList(msg.chat_id, msg.message_id);
  } else {
    await refreshCards(o, msg);
  }
}

/* ---------- Mini App: kirishni tekshirish ---------- */
async function verifyInitData(initData, token) {
  if (!initData || !token || initData.length > 8192) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash") || "";
  if (!/^[0-9a-f]{64}$/.test(hash)) return null;
  const secret = await hmac("WebAppData", token);
  const pairs = [];
  params.forEach((v, k) => pairs.push([k, v]));
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const sign = async (skip) => hex(await hmac(secret, pairs.filter((p) => !skip.includes(p[0])).map((p) => p[0] + "=" + p[1]).join("\n")));
  // Telegram hash ni hash dan boshqa hamma maydonlar boʻyicha hisoblaydi; ehtiyot uchun signature siz variant ham.
  if (!safeEqual(await sign(["hash"]), hash) && !safeEqual(await sign(["hash", "signature"]), hash)) return null;
  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate) || Date.now() / 1000 - authDate > 7 * 86400) return null;
  try {
    const user = JSON.parse(params.get("user") || "null");
    return user && Number.isSafeInteger(Number(user.id)) ? user : null;
  } catch (_) {
    return null;
  }
}

async function access(req) {
  if (!opToken()) return json({ ok: false, status: "error", error: "not_configured" }, 503, CORS);
  let body = null;
  try { body = JSON.parse(await req.text()); } catch (_) { body = null; }
  const user = await verifyInitData(String((body && body.initData) || ""), opToken());
  if (!user) return json({ ok: false, status: "invalid" }, 401, CORS);
  const id = Number(user.id);
  if ((await staffRole(id)) === "owner") return json({ ok: true, status: "faol", owner: true }, 200, CORS);
  const o = await getOperator(id);
  const status = o ? o.holat : "yangi";
  if (status === "faol") await sb.from("skript_operatorlar").update({ oxirgi_kirish: nowIso() }).eq("chat_id", id);
  return json({ ok: true, status }, 200, CORS);
}

/* ---------- Xizmat ---------- */
async function isInternal(req) {
  const secret = req.headers.get("x-crm-secret") ?? "";
  if (!secret) return false;
  const { data } = await sb.from("crm_maxfiy").select("qiymat").eq("kalit", "tg_ichki").maybeSingle();
  return !!(data && data.qiymat) && safeEqual(secret, String(data.qiymat));
}

// Webhookni oʻrnatish: EDUTEACH_BOT_TOKEN qoʻshilgandan soʻng bir marta. Bot boshqa serverga ulangan boʻlsa — toʻxtaydi (force=1 siz).
async function setup(force) {
  const token = opToken();
  if (!token) return json({ ok: false, qadam: "EDUTEACH_BOT_TOKEN secret yoʻq" }, 503);
  const me = await op("getMe");
  if (!me.ok) return json({ ok: false, qadam: "getMe", xato: me.description }, 400);
  const hook = `${Deno.env.get("SUPABASE_URL")}/functions/v1/${FN}`;
  const info = await op("getWebhookInfo");
  const current = (info && info.result && info.result.url) || "";
  if (current && current !== hook && !force) {
    return json({ ok: false, bot: me.result.username, qadam: "webhook band", hozirgi_webhook: current.replace(/bot\d+:[\w-]+/g, "bot***"), maslahat: "Bot boshqa serverga ulangan. Ishonchingiz komil boʻlsa: ?setup=1&force=1" }, 409);
  }
  const wh = await op("setWebhook", { url: hook, secret_token: await webhookSecret(token), allowed_updates: ["message"], drop_pending_updates: true });
  const cmd = await op("setMyCommands", { commands: [{ command: "start", description: "Skriptga kirish · Доступ к скрипту" }] });
  const mb = await op("setChatMenuButton", { menu_button: { type: "commands" } });
  const desc = await op("setMyDescription", { description: "Markaz operatorlari uchun qoʻngʻiroq skripti va trenajyor. Start bosing va raqamingizni yuboring — rahbar tasdiqlagach, skript ochiladi.\n\nСкрипт звонков и тренажёр для операторов центра. Нажмите «Старт» и отправьте номер — после подтверждения руководителя скрипт откроется." });
  const sdesc = await op("setMyShortDescription", { short_description: "Operatorlar uchun qoʻngʻiroq skripti · Скрипт звонков для операторов" });
  return json({ ok: wh.ok === true, bot: me.result.username, webhook: wh.description ?? "ok", commands: cmd.ok === true, menu_button: mb.ok === true, description: desc.ok === true, short_description: sdesc.ok === true, teachnova_token: !!novaToken() });
}

async function health() {
  const r = await sb.from("skript_operatorlar").select("chat_id", { count: "exact", head: true });
  return json({ ok: !r.error, db: r.error ? String(r.error.message).slice(0, 120) : "ok", db_key: DB.kind, operator_bot_token: !!opToken(), teachnova_bot_token: !!novaToken() });
}

Deno.serve(async (req) => {
  const q = new URL(req.url).searchParams;
  const isAccess = q.get("access") === "1";
  try {
    if (isAccess) {
      if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
      if (req.method !== "POST") return json({ error: "POST only" }, 405, CORS);
      return await access(req);
    }
    if (q.get("health") === "1") return await health();
    if (q.get("setup") === "1") return await setup(q.get("force") === "1");
    if (q.get("owner_cb") === "1" || q.get("owner_list") === "1") {
      if (req.method !== "POST") return json({ error: "POST only" }, 405);
      if (!await isInternal(req)) return json({ error: "unauthorized" }, 401);
      const body = await req.json().catch(() => ({}));
      if (q.get("owner_cb") === "1") await onOwnerCallback(body && body.callback_query);
      else {
        const chatId = Number(body && body.chat_id);
        if (Number.isSafeInteger(chatId) && (await staffRole(chatId)) === "owner") await sendList(chatId);
      }
      return json({ ok: true });
    }
    if (req.method !== "POST") return json({ error: "POST only" }, 405);
    const token = opToken();
    if (!token) return json({ error: "not_configured" }, 503);
    const got = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
    if (!got || !safeEqual(got, await webhookSecret(token))) return json({ error: "unauthorized" }, 401);
    const update = await req.json().catch(() => null);
    try {
      await onOperatorMessage(update && update.message);
    } catch (e) {
      console.error("eduteach update:", String(e).replaceAll(token, "***").slice(0, 300));
    }
    return json({ ok: true }); // Telegram'ga doim 200
  } catch (e) {
    console.error("eduteach:", String(e).slice(0, 300));
    return json({ ok: false, status: "error" }, 500, isAccess ? CORS : {});
  }
});

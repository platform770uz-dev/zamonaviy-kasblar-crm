import { createClient } from "npm:@supabase/supabase-js@2.117.2";

// 1924 admin-bot: Telegram'da havolalar menyusi + CRM'da yangi bitim yaratilsa xabar.
// Bot tokeni faqat Supabase → Edge Functions → Secrets → TELEGRAM_BOT_TOKEN da (kodda ham, bazada ham yoʻq).
// Rollar (tg_chatlar.rol): owner — hamma havola, adminlarni tasdiqlaydi/oladi (/adminlar); admin — faqat CRM va lid xabarlari.
// Yangi odam Start bosadi → owner'ga tasdiqlash tugmali soʻrov boradi; tasdiqlanmaguncha bot unga hech narsa koʻrsatmaydi.

const HEAD = { "Content-Type": "application/json; charset=utf-8" };
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const json = (o: Record<string, unknown>, status = 200) => new Response(JSON.stringify(o), { status, headers: HEAD });
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const SITE = "https://platform770uz-dev.github.io/zamonaviy-kasblar-crm/";

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// Token har chaqiruvda oʻqiladi — secret keyin qoʻshilsa ham qayta deploy kerak emas.
// Xato matnida URL (tokeni bilan) boʻlishi mumkin — tashqariga chiqmasin.
async function tg(method: string, payload: Record<string, unknown> = {}): Promise<any> {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
  if (!token) return { ok: false, description: "TELEGRAM_BOT_TOKEN yoʻq" };
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
  tg("sendMessage", { chat_id, text, parse_mode: "HTML", link_preview_options: { is_disabled: true }, ...(reply_markup ? { reply_markup } : {}) });

const setCrmMenu = (chat_id: number) => tg("setChatMenuButton", {
  chat_id, menu_button: { type: "default" },
});

async function issueCrmAccess(chatId: number) {
  const { data: person, error } = await sb.from("tg_chatlar")
    .select("rol,tasdiqlangan,bloklangan")
    .eq("chat_id", chatId).maybeSingle();
  if (error || !person?.tasdiqlangan || person.bloklangan || !["owner", "admin"].includes(String(person.rol))) {
    return { ok: false };
  }
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
  const tokenHash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)))]
    .map((value) => value.toString(16).padStart(2, "0")).join("");
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const saved = await sb.from("crm_browser_login_tokens").insert({
    token_hash: tokenHash, chat_id: chatId, expires_at: expiresAt,
  });
  if (saved.error) {
    await send(chatId, "CRM havolasini hozir yaratib bo‘lmadi. Birozdan keyin /start ni bosing.");
    return { ok: false };
  }
  const url = SITE + "#crm-login=" + encodeURIComponent(token);
  return await send(chatId, "CRM’ga kirish uchun tugmani bosing. Havola 5 daqiqada tugaydi va bir marta ishlaydi.", {
    inline_keyboard: [[{ text: "CRM", url }]],
  });
}

const who = (r: { ism: string | null; username: string | null }, id: number) =>
  `${esc(r.ism || "—")}${r.username ? ` (@${esc(r.username)})` : ""} · <code>${id}</code>`;

async function askOwners(id: number, r: { ism: string | null; username: string | null }, requestedRole: string) {
  const { data: owners } = await sb.from("tg_chatlar").select("chat_id").eq("rol", "owner").eq("tasdiqlangan", true).eq("bloklangan", false);
  const roleName = requestedRole === "owner" ? "rahbar" : "администратор CRM";
  const buttons = { inline_keyboard: [[{ text: "✅ Tasdiqlash", callback_data: `ok:${id}` }, { text: "⛔ Rad etish", callback_data: `no:${id}` }]] };
  for (const o of owners ?? []) await send(o.chat_id, `🔔 <b>Botga kirish so‘rovi</b>\n👤 ${who(r, id)}\n🎭 So‘ralgan rol: ${roleName}`, buttons);
}

async function listPeople(chatId: number) {
  const { data: rows } = await sb.from("tg_chatlar").select("chat_id, ism, username, rol, tasdiqlangan, bloklangan").order("created_at").limit(30);
  const others = (rows ?? []).filter((r) => r.rol !== "owner");
  if (!others.length) return await send(chatId, "Пока никого нет. Человек нажимает Start у бота — вам приходит заявка.");
  await send(chatId, `👥 Людей в боте: ${others.length}`);
  for (const r of others) {
    const st = r.tasdiqlangan ? (r.rol === "owner" ? "✅ rahbar" : "✅ koordinator") : r.bloklangan ? "⛔ rad etildi" : "⏳ tasdiq kutilmoqda";
    const btns = r.tasdiqlangan
      ? [{ text: "🚫 Убрать доступ", callback_data: `no:${r.chat_id}` }]
      : r.bloklangan
      ? [{ text: "✅ Подтвердить", callback_data: `ok:${r.chat_id}` }]
      : [{ text: "✅ Подтвердить", callback_data: `ok:${r.chat_id}` }, { text: "🚫 Отклонить", callback_data: `no:${r.chat_id}` }];
    await send(chatId, `${st}\n👤 ${who(r, r.chat_id)}`, { inline_keyboard: [btns] });
  }
}

async function notifyOlimpiada(chatId: number, payload: any) {
  const allowed = ["olimpiada_payment_request", "olimpiada_coordinator_contact"];
  if (!allowed.includes(String(payload?.type ?? ""))) return;
  const clean = (value: unknown, max = 160) => esc(String(value ?? "").trim().slice(0, max) || "—");
  const title = payload.type === "olimpiada_payment_request" ? "💳 Запрос по оплате олимпиады" : "💬 Запрос связи с координатором";
  const details = [
    title, `👤 Ученик: ${clean(payload.name)}`,
    `🏫 Класс / школа: ${clean(payload.grade, 40)} / ${clean(payload.school)}`,
    `📞 Контакт родителя: ${clean(payload.parent)}`, `🌐 Язык: ${clean(payload.language, 12)}`,
    `Telegram ID: <code>${chatId}</code>`,
  ].join("\n");
  const { data: owners } = await sb.from("tg_chatlar").select("chat_id").eq("rol", "owner").eq("tasdiqlangan", true);
  for (const owner of owners ?? []) await send(owner.chat_id, details);
  await send(chatId, owners?.length ? "✅ Запрос отправлен администратору. Ответ придёт сюда в Telegram." : "Не удалось доставить запрос администратору. Напишите ему позже.");
}

async function onMessage(m: any) {
  if (!m?.chat || m.chat.type !== "private") return;
  const chatId = Number(m.chat.id);
  const ism = [m.from?.first_name, m.from?.last_name].filter(Boolean).join(" ").slice(0, 120) || null;
  const username = m.from?.username ? String(m.from.username).slice(0, 64) : null;
  if (m.web_app_data?.data) {
    try { await notifyOlimpiada(chatId, JSON.parse(String(m.web_app_data.data).slice(0, 4000))); }
    catch { await send(chatId, "Не получилось прочитать запрос. Попробуйте ещё раз через кнопку связи."); }
    return;
  }
  const text = typeof m.text === "string" ? m.text.trim() : "";
  let { data: row } = await sb.from("tg_chatlar")
    .select("rol, requested_rol, tasdiqlangan, bloklangan").eq("chat_id", chatId).maybeSingle();
  if (!row) {
    const ins = await sb.from("tg_chatlar")
      .insert({ chat_id: chatId, ism, username, requested_rol: null })
      .select("rol, requested_rol, tasdiqlangan, bloklangan").maybeSingle();
    if (ins.error) {
      console.error("tg user insert:", String(ins.error.message ?? "").slice(0, 160));
      return;
    }
    row = ins.data;
  } else {
    await sb.from("tg_chatlar").update({ ism, username }).eq("chat_id", chatId);
  }
  const replyText = String(m.reply_to_message?.text ?? "");
  if (/\[payment-question\]/.test(replyText) && text) {
    const { data: owners } = await sb.from("tg_chatlar").select("chat_id").eq("rol", "owner").eq("tasdiqlangan", true);
    const note = [`💬 <b>Вопрос по оплате от ${who({ ism, username }, chatId)}</b>`, esc(text.slice(0, 2000))].join("\n");
    for (const owner of owners ?? []) await send(owner.chat_id, note);
    await send(chatId, owners?.length ? "✅ Вопрос отправлен администратору. Ответ придёт сюда в Telegram." : "Не удалось доставить вопрос администратору.");
    return;
  }
  const replyMatch = /\[payment-reply:(\d{1,15})\]/.exec(replyText);
  if (["owner", "admin"].includes(String(row?.rol)) && row?.tasdiqlangan && replyMatch && text) {
    await send(Number(replyMatch[1]), `💬 <b>Ответ администратора по оплате:</b>\n${esc(text.slice(0, 3000))}`);
    await send(chatId, "✅ Ответ отправлен родителю.");
    return;
  }
  if (row?.rol === "owner" && /^\/adminlar(@\w+)?$/.test(text)) return await listPeople(chatId);

  const startCommand = /^\/(start|menu)(@\w+)?(?:\s|$)/.test(text) || text === "📋 Меню" || text.toLowerCase() === "crm";
  if (row?.bloklangan) {
    if (startCommand) await send(chatId, "Доступ к CRM отклонён. Свяжитесь с руководителем.");
    return;
  }
  if (startCommand) {
    await tg("deleteMyCommands", { scope: { type: "default" } });
    await tg("deleteMyCommands", { scope: { type: "chat", chat_id: chatId } });
    await setCrmMenu(chatId);
    if (row?.tasdiqlangan && ["owner", "admin"].includes(String(row.rol))) {
      await issueCrmAccess(chatId);
      return;
    }
    if (!row?.tasdiqlangan) {
      if (row?.requested_rol !== "admin") {
        const saved = await sb.from("tg_chatlar").update({ requested_rol: "admin" })
          .eq("chat_id", chatId).eq("tasdiqlangan", false).eq("bloklangan", false)
          .select("chat_id").maybeSingle();
        if (saved.error) { await send(chatId, "Не удалось отправить запрос. Нажмите /start ещё раз."); return; }
        if (saved.data) await askOwners(chatId, { ism, username }, "admin");
      }
      await send(chatId, "Запрос на доступ к CRM отправлен руководителю. После одобрения бот пришлёт кнопку входа.");
      return;
    }
  }
  if (!row?.tasdiqlangan) {
    await setCrmMenu(chatId);
    if (text) await send(chatId, "Чтобы запросить доступ к CRM, нажмите /start.");
    return;
  }
  if (text) await send(chatId, "Для входа в CRM нажмите кнопку CRM в этом чате или отправьте /start, чтобы получить новую ссылку.");
}
async function onCallback(cq: any) {
  const answer = (text: string) => tg("answerCallbackQuery", { callback_query_id: cq.id, text });
  const { data: me } = await sb.from("tg_chatlar").select("rol, tasdiqlangan, bloklangan").eq("chat_id", Number(cq.from?.id)).maybeSingle();
  const data = String(cq.data ?? "");
  const roleMatch = /^role:(owner|admin)$/.exec(data);
  if (roleMatch) {
    await answer("Нажмите /start, чтобы запросить доступ. Руководитель выдаёт права отдельно.");
    return;
  }
  const report = /^contract:(approve|reject):([0-9a-f-]{36})$/i.exec(data);
  if (report) {
    if (me?.rol !== "owner" || !me.tasdiqlangan || me.bloklangan) { await answer("Ruxsat yo‘q"); return; }
    const approved = report[1] === "approve";
    const result = await sb.from("orders").update({ manager_review_status: approved ? "approved" : "rejected", manager_reviewed_at: new Date().toISOString(), manager_reviewed_by_chat_id: Number(cq.from.id) }).eq("id", report[2]).eq("status", "signed").eq("manager_review_status", "pending").select("order_number");
    if (result.error) { await answer("Saqlashda xato"); return; }
    if (!result.data?.length) { await answer("Hisobot avval ko‘rib chiqilgan"); return; }
    if (cq.message?.chat?.id && cq.message?.message_id) await tg("editMessageText", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, parse_mode: "HTML", text: (approved ? "✅ TASDIQLANDI" : "⛔ RAD ETILDI") + "\n📄 Buyurtma: " + esc(result.data[0].order_number), reply_markup: { inline_keyboard: [] } });
    await answer(approved ? "Hisobot tasdiqlandi" : "Hisobot rad etildi");
    return;
  }
  if (data === "payment:help") {
    await send(Number(cq.from.id), "Напишите вопрос по оплате ответом на это сообщение — я передам его администратору.\n[payment-question]", {
      force_reply: true, input_field_placeholder: "Ваш вопрос по оплате",
    });
    await answer("Напишите вопрос по оплате");
    return;
  }
  const paymentReply = /^payment:reply:(\d{1,15})$/.exec(data);
  if (paymentReply) {
    if (!me?.tasdiqlangan || me.bloklangan || !["owner", "admin"].includes(String(me.rol))) { await answer("Нет доступа"); return; }
    const targetId = Number(paymentReply[1]);
    await send(Number(cq.from.id), `Введите ответ для родителя (ID ${targetId}) ответом на это сообщение.\n[payment-reply:${targetId}]`, {
      force_reply: true, input_field_placeholder: "Ответ по оплате",
    });
    await answer("Напишите ответ");
    return;
  }
  if (me?.rol !== "owner" || !me.tasdiqlangan || me.bloklangan) { await answer("Нет доступа"); return; }
  const m = /^(ok|no):(\d{1,15})$/.exec(data);
  if (!m) { await answer("?"); return; }
  const id = Number(m[2]);
  const { data: t } = await sb.from("tg_chatlar").select("ism, username, rol, requested_rol").eq("chat_id", id).maybeSingle();
  if (!t || t.rol === "owner") { await answer("Не найдено"); return; }
  const yes = m[1] === "ok";
  const updated = await sb.from("tg_chatlar").update({ rol: yes ? "admin" : t.rol, tasdiqlangan: yes, bloklangan: !yes }).eq("chat_id", id);
  if (updated.error) { await answer("Не удалось сохранить. Попробуйте ещё раз."); return; }
  await setCrmMenu(id);
  if (yes) await issueCrmAccess(id);
  if (cq.message?.chat?.id && cq.message?.message_id) {
    await tg("editMessageText", {
      chat_id: cq.message.chat.id, message_id: cq.message.message_id, parse_mode: "HTML",
      text: `${yes ? "✅ Tasdiqlandi" : "⛔ Rad etildi"}\n👤 ${who(t, id)}\n🎭 ${yes ? (t.requested_rol === "owner" ? "Rahbar" : "Koordinator") : "So‘rov"}`,
      reply_markup: { inline_keyboard: [] },
    });
  }
  await answer(yes ? "Подтверждён" : "Отклонён");
}

function card(d: any, note: string | undefined, test: boolean) {
  const k = d.crm_kontaktlar ?? {};
  const out = [`${test ? "🧪 TEST · " : ""}🆕 <b>Yangi lid</b>`, `👤 ${esc(k.ism || d.nom)}`];
  if (k.telefon) out.push(`📞 ${esc(k.telefon)}`);
  const tgu = String(k.telegram ?? "").trim().replace(/^(https?:\/\/)?((t|telegram)\.me\/)?@?/i, "");
  if (/^[A-Za-z0-9_]{5,32}$/.test(tgu)) out.push(`✈️ <a href="https://t.me/${tgu}">@${tgu}</a>`);
  else if (k.telegram) out.push(`✈️ ${esc(k.telegram)}`);
  out.push(`🗂 ${esc(d.crm_voronkalar?.nom ?? "—")} → ${esc(d.crm_bosqichlar?.nom ?? "—")}`);
  if (d.manba) out.push(`📍 ${esc(d.manba)}`);
  if (Number(d.byudjet) > 0) out.push(`💰 ${Number(d.byudjet).toLocaleString("ru-RU")}`);
  if (note) out.push("", esc(note.slice(0, 1500)));
  return out.join("\n");
}

async function notify(body: any) {
  const ids: number[] = (Array.isArray(body.ids) ? body.ids : []).map(Number).filter((x: number) => Number.isSafeInteger(x) && x > 0).slice(0, 20);
  const soni = Math.max(Number(body.soni) || 0, ids.length);
  const { data: chats } = await sb.from("tg_chatlar").select("chat_id").eq("tasdiqlangan", true);
  if (!chats?.length || !soni) return json({ ok: true, kartalar: 0, sent: 0 });

  const texts: string[] = [];
  if (soni > 5) texts.push(`📥 CRM'ga birdaniga <b>${soni}</b> ta yangi lid tushdi.`);
  else {
    // crm-lead forma javoblarini crm_tarix'ga bitimdan keyin yozadi — biroz kutamiz
    await new Promise((r) => setTimeout(r, 2000));
    const [{ data: deals }, { data: notes }] = await Promise.all([
      sb.from("crm_bitimlar").select("id, nom, byudjet, manba, crm_voronkalar(nom), crm_bosqichlar(nom), crm_kontaktlar(ism, telefon, telegram)").in("id", ids).order("id"),
      sb.from("crm_tarix").select("bitim_id, matn").in("bitim_id", ids).eq("turi", "tizim").order("id"),
    ]);
    for (const d of deals ?? []) texts.push(card(d, notes?.find((n) => n.bitim_id === d.id)?.matn, body.test === true));
  }
  let sent = 0;
  for (const c of chats) for (const t of texts) if ((await send(c.chat_id, t)).ok) sent++;
  return json({ ok: true, kartalar: texts.length, sent });
}

// ishga.html testini topshirgan nomzod — faqat owner'ga (bu yollash masalasi, adminlarga koʻrsatilmaydi)
async function notifyNomzod(body: any) {
  const id = Number(body.id);
  if (!Number.isSafeInteger(id) || id <= 0) return json({ error: "bad id" }, 400);
  const { data: n } = await sb.from("nomzodlar").select("ism, telefon, vakansiya, test_sek").eq("id", id).maybeSingle();
  const { data: owners } = await sb.from("tg_chatlar").select("chat_id").eq("rol", "owner").eq("tasdiqlangan", true);
  if (!n || !owners?.length) return json({ ok: true, sent: 0 });
  const sek = Number(n.test_sek);
  const text = [
    "🧑‍💼 <b>Новый кандидат — тест пройден</b>",
    `👤 ${esc(n.ism)}`,
    `📞 ${esc(n.telefon)}`,
    `💼 ${esc(n.vakansiya)}`,
    ...(Number.isFinite(sek) && n.test_sek != null ? [`⏱ Время теста: ${Math.floor(sek / 60)}:${String(sek % 60).padStart(2, "0")}`] : []),
    "",
    "Баллы и красные флаги — в разделе «Nomzodlar».",
  ].join("\n");
  let sent = 0;
  for (const o of owners) if ((await send(o.chat_id, text)).ok) sent++;
  return json({ ok: true, sent });
}

async function notifyContractSigned(orderId: unknown) {
  const id = String(orderId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "bad order id" }, 400);
  const { data: order } = await sb.from("orders").select("id, order_number, owner_name, business_name, phone, total_amount, paid_amount, status, accepted_at, manager_review_status").eq("id", id).maybeSingle();
  if (!order || order.status !== "signed") return json({ error: "signed order not found" }, 404);
  const { data: managers } = await sb.from("tg_chatlar").select("chat_id").eq("rol", "owner").eq("tasdiqlangan", true).eq("bloklangan", false);
  if (!managers?.length) return json({ ok: true, sent: 0 });
  const amount = (value: unknown) => Number(value ?? 0).toLocaleString("uz-UZ");
  const body = [
    "📝 <b>Yangi shartnoma imzolandi</b>",
    "📄 Buyurtma: " + esc(order.order_number),
    "👤 Mijoz: " + esc(order.owner_name),
    "🏫 Biznes/maktab: " + esc(order.business_name),
    "📞 Telefon: " + esc(order.phone),
    "💰 Kelishilgan summa: " + amount(order.total_amount) + " so‘m",
    "✅ To‘langan: " + amount(order.paid_amount) + " so‘m",
    "🖊 Imzo holati: imzolangan (" + esc(new Date(order.accepted_at).toLocaleString("uz-UZ")) + ")",
    "📌 Ko‘rib chiqish: " + (order.manager_review_status === "pending" ? "kutilmoqda" : esc(order.manager_review_status)),
  ].join("\n");
  const controls = { inline_keyboard: [[
    { text: "✅ Tasdiqlash", callback_data: "contract:approve:" + id },
    { text: "⛔ Rad etish", callback_data: "contract:reject:" + id },
  ]] };
  let sent = 0;
  for (const manager of managers) if ((await send(manager.chat_id, body, controls)).ok) sent++;
  return json({ ok: true, sent });
}
async function setup(body: any, webhookSecret: string | undefined) {
  if (!webhookSecret) return json({ ok: false, qadam: "tg_webhook kaliti yoʻq" }, 500);
  const me = await tg("getMe");
  if (!me.ok) return json({ ok: false, qadam: "getMe", xato: me.description }, 400);
  const hook = `${Deno.env.get("SUPABASE_URL")}/functions/v1/tg-bot`;
  const info = await tg("getWebhookInfo");
  const cur = String(info.result?.url ?? "");
  // Bot boshqa joyga ulangan boʻlsa — ustidan yozmaymiz (faqat majburiy: true bilan)
  if (cur && cur !== hook && body.majburiy !== true) {
    let host = "?";
    try { host = new URL(cur).host; } catch { /* notoʻgʻri URL */ }
    return json({ ok: false, qadam: "band", bot: me.result.username, webhook_host: host }, 409);
  }
  const wh = await tg("setWebhook", { url: hook, secret_token: webhookSecret, allowed_updates: ["message", "callback_query"], drop_pending_updates: false });
  // Boshqa loyihadan qolgan buyruqlar va menyu tugmasini tozalaymiz
  for (const scope of [{ type: "default" }, { type: "all_private_chats" }]) {
    for (const language_code of ["", "ru", "uz", "en"]) await tg("deleteMyCommands", { scope, ...(language_code ? { language_code } : {}) });
  }
  const cmd = await tg("deleteMyCommands", { scope: { type: "default" } });
  const { data: owners } = await sb.from("tg_chatlar").select("chat_id").eq("rol", "owner");
  for (const o of owners ?? []) await tg("deleteMyCommands", { scope: { type: "chat", chat_id: o.chat_id } });
  const mb = await tg("setChatMenuButton", { menu_button: { type: "default" } });
  const { data: activePeople } = await sb.from("tg_chatlar").select("chat_id").eq("tasdiqlangan", true).eq("bloklangan", false);
  let siteButtonsSent = 0;
  for (const person of activePeople ?? []) {
    if ((await issueCrmAccess(person.chat_id)).ok) siteButtonsSent++;
  }
  const { data: existingChats } = await sb.from("tg_chatlar").select("chat_id");
  for (const person of existingChats ?? []) { await setCrmMenu(person.chat_id); await tg("deleteMyCommands", { scope: { type: "chat", chat_id: person.chat_id } }); }
  const desc = await tg("getMyDescription");
  const sdesc = await tg("getMyShortDescription");
  return json({
    ok: wh.ok === true, bot: me.result.username, nom: me.result.first_name, webhook: wh.description,
    commands: cmd.ok === true, menu_button: mb.ok === true, site_buttons_sent: siteButtonsSent,
    tavsif: desc.result?.description ?? "", qisqa_tavsif: sdesc.result?.short_description ?? "",
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const { data: rows } = await sb.from("crm_maxfiy").select("kalit, qiymat").in("kalit", ["tg_webhook", "tg_ichki"]);
  const sec: Record<string, string> = Object.fromEntries((rows ?? []).map((r) => [r.kalit, r.qiymat]));
  const tgSecret = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  const crmSecret = req.headers.get("x-crm-secret") ?? "";
  const fromTelegram = !!tgSecret && !!sec.tg_webhook && safeEqual(tgSecret, sec.tg_webhook);
  const internal = !!crmSecret && !!sec.tg_ichki && safeEqual(crmSecret, sec.tg_ichki);
  if (!fromTelegram && !internal) return json({ error: "unauthorized" }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  if (fromTelegram) {
    try {
      if (body?.callback_query) await onCallback(body.callback_query);
      else await onMessage(body?.message);
    } catch (e) { console.error("tg update:", String(e).slice(0, 200)); }
    return json({ ok: true }); // Telegram'ga doim 200 — aks holda u shu yangilanishni qayta-qayta yuboradi
  }
  if (body?.turi === "contract_signed") return await notifyContractSigned(body.order_id);
  if (body?.turi === "setup") return await setup(body, sec.tg_webhook);
  if (body?.turi === "yangi_lid") return await notify(body);
  if (body?.turi === "yangi_nomzod") return await notifyNomzod(body);
  return json({ error: "nomaʼlum turi" }, 400);
});

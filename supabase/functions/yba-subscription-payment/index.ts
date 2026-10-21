import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PUBLIC_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? (() => {
  try { return JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}").default ?? ""; }
  catch { return ""; }
})();
const BOT_TOKEN = Deno.env.get("YBA_PUBLIC_BOT_TOKEN") ?? "";
const ALLOWED_ORIGIN = "https://platform770uz-dev.github.io";
const AMOUNT_SUM = 99_000;
const jsonHeaders = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };

function response(body: unknown, status: number, origin: string | null) {
  const headers = new Headers(jsonHeaders);
  if (origin === ALLOWED_ORIGIN) {
    headers.set("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
    headers.set("Vary", "Origin");
    headers.set("Access-Control-Allow-Headers", "authorization, apikey, content-type, x-client-info");
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  }
  return new Response(JSON.stringify(body), { status, headers });
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char] ?? char));

function formatDate(value: string) {
  return new Intl.DateTimeFormat("uz-UZ", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tashkent",
  }).format(new Date(value));
}

async function telegramReceipt(payment: Record<string, any>) {
  const method = payment.payment_method === "cash" ? "Naqd pul" : "Karta orqali";
  const text = [
    "✅ <b>TO‘LOV TASDIQLANDI</b>",
    "",
    "Assalomu alaykum! Yosh blogerlar akademiyasining Mini App nazariy obunasi uchun to‘lovingiz qabul qilindi.",
    "",
    `👤 Bola: <b>${escapeHtml(payment.child_name)}</b>`,
    `💳 To‘lov: <b>${AMOUNT_SUM.toLocaleString("uz-UZ")} so‘m</b>`,
    `📥 Usul: <b>${method}</b>`,
    `🕒 Qabul qilingan vaqt: <b>${formatDate(payment.confirmed_at)}</b>`,
    `📅 Obuna muddati: <b>${formatDate(payment.access_starts_at)} — ${formatDate(payment.access_ends_at)}</b>`,
    `🧾 Tasdiqnoma raqami: <b>${escapeHtml(payment.receipt_number)}</b>`,
    "",
    "Bu 30 kunlik mustaqil nazariy obuna (4 modul va testlar), mentorga shaxsiy tekshiruv kirmaydi. 800 000 so‘mlik amaliy kurs alohida xizmat hisoblanadi.",
    "",
    "Ushbu Telegram xabari to‘lov tasdig‘i, rasmiy fiskal chek emas. Fiskal chek administrator tomonidan alohida taqdim etiladi.",
  ].join("\n");

  const result = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: payment.telegram_user_id, text, parse_mode: "HTML", link_preview_options: { is_disabled: true } }),
  });
  const payload = await result.json().catch(() => ({}));
  if (!result.ok || payload?.ok !== true) {
    const errorCode = typeof payload?.error_code === "number" ? String(payload.error_code) : "telegram_delivery_failed";
    throw new Error(errorCode);
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") {
    if (origin !== ALLOWED_ORIGIN) return response({ error: "origin_not_allowed" }, 403, origin);
    return response({ ok: true }, 200, origin);
  }
  if (req.method !== "POST") return response({ error: "method_not_allowed" }, 405, origin);
  if (origin !== ALLOWED_ORIGIN) return response({ error: "origin_not_allowed" }, 403, origin);
  if (!SUPABASE_URL || !SERVICE_KEY || !PUBLIC_KEY || !BOT_TOKEN) {
    return response({ error: "payment_service_not_configured" }, 503, origin);
  }

  const declaredLength = Number(req.headers.get("Content-Length") || 0);
  if (declaredLength > 4096) return response({ error: "request_too_large" }, 413, origin);
  const auth = req.headers.get("Authorization") || "";
  const match = auth.match(/^Bearer\s+([\w.-]+)$/);
  if (!match) return response({ error: "unauthorized" }, 401, origin);

  const userClient = createClient(SUPABASE_URL, PUBLIC_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${match[1]}` } },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser(match[1]);
  if (authError || !authData.user) return response({ error: "unauthorized" }, 401, origin);
  const { data: manager, error: managerError } = await userClient.rpc("crm_is_manager");
  if (managerError || manager !== true) return response({ error: "manager_access_required" }, 403, origin);

  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > 4096) return response({ error: "request_too_large" }, 413, origin);
    body = JSON.parse(raw);
  } catch {
    return response({ error: "invalid_json" }, 400, origin);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  if (body.action === "retry_delivery") {
    if (typeof body.payment_id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.payment_id)) {
      return response({ error: "invalid_payment_id" }, 400, origin);
    }
    const { data: payment, error } = await admin.from("yba_subscription_payments").select("*").eq("id", body.payment_id).maybeSingle();
    if (error || !payment) return response({ error: "payment_not_found" }, 404, origin);
    if (payment.telegram_status === "sent") return response({ ok: true, payment_id: payment.id, telegram_status: "sent", already_sent: true }, 200, origin);
    try {
      await telegramReceipt(payment);
      const update = await admin.from("yba_subscription_payments").update({ telegram_status: "sent", telegram_error: null }).eq("id", payment.id);
      if (update.error) throw new Error("delivery_status_update_failed");
      return response({ ok: true, payment_id: payment.id, telegram_status: "sent" }, 200, origin);
    } catch (error) {
      const code = error instanceof Error ? error.message.slice(0, 80) : "telegram_delivery_failed";
      await admin.from("yba_subscription_payments").update({ telegram_status: "failed", telegram_error: code }).eq("id", payment.id);
      return response({ error: "receipt_delivery_failed", payment_id: payment.id }, 502, origin);
    }
  }

  if (body.action !== "confirm" || typeof body.result_id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.result_id)
    || typeof body.request_id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.request_id)
    || !["cash", "card"].includes(String(body.payment_method))) {
    return response({ error: "invalid_request" }, 400, origin);
  }

  const { data: existingRequest } = await admin.from("yba_subscription_payments").select("id,telegram_status,access_ends_at").eq("request_id", body.request_id).maybeSingle();
  if (existingRequest) return response({ ok: true, payment_id: existingRequest.id, telegram_status: existingRequest.telegram_status, repeated_request: true }, 200, origin);

  const { data: result, error: resultError } = await userClient.from("yba_public_intro_results")
    .select("id,telegram_user_id,child_name,progress,consent_given")
    .eq("id", body.result_id).maybeSingle();
  if (resultError || !result || result.progress !== 4 || result.consent_given !== true) {
    return response({ error: "consented_result_not_found" }, 404, origin);
  }

  const now = new Date();
  const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const { data: active } = await admin.from("yba_subscription_payments").select("id,access_ends_at,telegram_status")
    .eq("result_id", result.id).eq("payment_status", "confirmed").gt("access_ends_at", now.toISOString())
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (active) return response({ error: "subscription_already_active", payment_id: active.id, access_ends_at: active.access_ends_at }, 409, origin);

  const receiptNumber = `YBA-${now.toISOString().slice(2, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  const payment = {
    request_id: body.request_id,
    result_id: result.id,
    telegram_user_id: result.telegram_user_id,
    child_name: result.child_name,
    amount_sum: AMOUNT_SUM,
    payment_method: body.payment_method,
    payment_status: "confirmed",
    confirmed_by: authData.user.id,
    confirmed_at: now.toISOString(),
    access_starts_at: now.toISOString(),
    access_ends_at: end.toISOString(),
    receipt_number: receiptNumber,
    telegram_status: "pending",
  };
  const { data: saved, error: saveError } = await admin.from("yba_subscription_payments").insert(payment).select("*").single();
  if (saveError || !saved) {
    if (saveError?.code === "23505") return response({ error: "duplicate_confirmation" }, 409, origin);
    return response({ error: "payment_record_failed" }, 500, origin);
  }

  try {
    await telegramReceipt(saved);
    const update = await admin.from("yba_subscription_payments").update({ telegram_status: "sent", telegram_error: null }).eq("id", saved.id);
    if (update.error) throw new Error("delivery_status_update_failed");
    return response({ ok: true, payment_id: saved.id, receipt_number: saved.receipt_number, telegram_status: "sent", access_ends_at: saved.access_ends_at }, 200, origin);
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 80) : "telegram_delivery_failed";
    await admin.from("yba_subscription_payments").update({ telegram_status: "failed", telegram_error: code }).eq("id", saved.id);
    return response({ ok: true, payment_id: saved.id, receipt_number: saved.receipt_number, telegram_status: "failed", access_ends_at: saved.access_ends_at }, 200, origin);
  }
});


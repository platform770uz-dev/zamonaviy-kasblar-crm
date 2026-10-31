// Прямой вебхук Meta Lead Ads для академии (Yosh Blogerlar Akademiyasi).
// Источник: развёрнутая версия v11 из Supabase, с тремя изменениями:
//  1) ID форм берутся из META_YBA_FORM_IDS (через запятую), а не из одной константы;
//  2) повторная доставка не перезаписывает уже сохранённый лид (статус «Holat» не сбрасывается);
//  3) при ошибке Graph API в журнал пишутся код и подкод ошибки Meta (без токенов).
// Секреты (Supabase Function secrets): META_WEBHOOK_VERIFY_TOKEN, META_APP_SECRET,
// META_PAGE_ACCESS_TOKEN, META_GRAPH_API_VERSION (например 21.0), META_YBA_FORM_IDS (необязательно).
import { createClient } from "npm:@supabase/supabase-js@2";

const HEADERS = { "Content-Type": "application/json; charset=utf-8" };
const PAGE_ID = "1239005935955148";
const FORM_IDS = new Set(
  (Deno.env.get("META_YBA_FORM_IDS") ?? "1657196732409379").split(",").map((value) => value.trim()).filter(Boolean),
);
const YBA_TAB_ID = "d52d616c-a91f-47f4-a151-8bb9c069d06d"; // вкладка CRM «Blogerlik leadlari bolalar»

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: HEADERS });

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function validSignature(rawBody: string, signature: string, appSecret: string): Promise<boolean> {
  if (!signature.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  return safeEqual(hex(new Uint8Array(digest)), signature.slice(7).toLowerCase());
}

const norm = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "")
  .replace(/[’‘ʻʼ']/g, "").toLowerCase().replace(/[_\s]+/g, " ").trim();

function fieldValues(fieldData: unknown): Map<string, string> {
  const fields = new Map<string, string>();
  if (!Array.isArray(fieldData)) return fields;
  for (const raw of fieldData) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const label = String(item.name ?? "").trim();
    const values = item.values;
    const value = Array.isArray(values) ? values.map(String).join(", ") : String(values ?? "");
    if (label && value.trim()) fields.set(norm(label), value.trim().slice(0, 2000));
  }
  return fields;
}

function findValue(fields: Map<string, string>, exact: string[], contains: string[] = []): string {
  for (const label of exact) {
    const value = fields.get(norm(label));
    if (value) return value;
  }
  for (const [label, value] of fields) {
    if (contains.some((needle) => label.includes(norm(needle)))) return value;
  }
  return "";
}

function cleanAnswers(fields: Map<string, string>): Record<string, string> {
  const contactTerms = ["name", "ism", "phone", "telefon", "mobile", "raqam"];
  return Object.fromEntries([...fields].filter(([label]) => !contactTerms.some((term) => label.includes(term))));
}

async function getLead(leadId: string): Promise<Record<string, unknown>> {
  const accessToken = Deno.env.get("META_PAGE_ACCESS_TOKEN") ?? "";
  const version = Deno.env.get("META_GRAPH_API_VERSION") ?? "";
  if (!accessToken || !/^\d+\.\d+$/.test(version)) throw new Error("Meta API configuration unavailable");
  const url = new URL(`https://graph.facebook.com/v${version}/${encodeURIComponent(leadId)}`);
  url.searchParams.set("fields", "id,created_time,field_data,form_id,page_id");
  url.searchParams.set("access_token", accessToken);
  const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body || typeof body !== "object" || !(body as Record<string, unknown>).id) {
    // Код и подкод ошибки Meta помогают понять причину (например 190 — токен, 200 — нет прав). Токен не логируется.
    const metaError = (body as { error?: { code?: unknown; error_subcode?: unknown } } | null)?.error;
    console.error("Meta lead retrieval failed", response.status, String(metaError?.code ?? ""), String(metaError?.error_subcode ?? ""));
    throw new Error("Meta lead retrieval failed");
  }
  return body as Record<string, unknown>;
}

async function saveAndNotify(lead: Record<string, unknown>) {
  const leadId = String(lead.id ?? "");
  if (!/^\d{1,128}$/.test(leadId) || !FORM_IDS.has(String(lead.form_id ?? ""))) {
    return { ignored: true };
  }
  const createdAt = String(lead.created_time ?? "");
  if (!createdAt || Number.isNaN(Date.parse(createdAt))) throw new Error("Invalid Meta lead timestamp");
  const fields = fieldValues(lead.field_data);
  const fullName = findValue(fields, ["full_name", "name", "ism", "parent name", "ota-ona ismi", "ota onaning ismi"]);
  const phone = findValue(fields, ["phone_number", "phone", "telefon", "telefon raqami", "mobile_number", "mobil raqam"]);
  if (!fullName || !phone || !/\d/.test(phone)) throw new Error("Required lead fields are missing");

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) throw new Error("Database configuration unavailable");
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  const age = findValue(fields, ["age", "farzand yoshi", "bola yoshi"], ["yosh", "возраст"]);
  const area = findValue(fields, ["city", "district", "shahar", "tuman", "yashash hududi"], ["shahar", "tuman", "hudud", "manzil", "qayerda", "city", "district", "город", "район"]);
  const safeAnswers = cleanAnswers(fields);
  const values = {
    "Ota-ona ismi": fullName.slice(0, 160),
    "Telefon": phone.slice(0, 40),
    "Farzand yoshi": age.slice(0, 200),
    "Yashash hududi": area.slice(0, 500),
    "Forma javoblari": JSON.stringify(safeAnswers).slice(0, 4000),
    "Holat": "Yangi",
  };

  // ignoreDuplicates: повторная доставка того же лида не перезаписывает запись и не сбрасывает статус «Holat».
  const { error: recordError } = await supabase.from("custom_records").upsert(
    { tab_id: YBA_TAB_ID, external_id: leadId, values },
    { onConflict: "tab_id,external_id", ignoreDuplicates: true },
  );
  if (recordError) {
    console.error("YBA CRM save failed", recordError.code);
    throw new Error("CRM save failed");
  }
  const { error: queueError } = await supabase.from("yba_lead_notifications").upsert(
    { meta_lead_id: leadId, status: "pending" },
    { onConflict: "meta_lead_id", ignoreDuplicates: true },
  );
  if (queueError) {
    console.error("YBA notification queue failed", queueError.code);
    throw new Error("Notification queue failed");
  }

  const { data: secretRow, error: secretError } = await supabase.from("crm_maxfiy")
    .select("qiymat").eq("kalit", "tg_ichki").maybeSingle();
  if (secretError || !secretRow?.qiymat) throw new Error("Telegram internal key unavailable");
  const response = await fetch(`${url.replace(/\/$/, "")}/functions/v1/tg-bot`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-crm-secret": String(secretRow.qiymat) },
    body: JSON.stringify({ turi: "yangi_blogger_lid", meta_lead_id: leadId }),
    signal: AbortSignal.timeout(18000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.ok !== true) {
    console.error("YBA notification delivery pending", response.status);
    throw new Error("Telegram notification pending");
  }
  return { saved: true, notified: true };
}

Deno.serve(async (req: Request) => {
  const verifyToken = Deno.env.get("META_WEBHOOK_VERIFY_TOKEN") ?? "";
  const appSecret = Deno.env.get("META_APP_SECRET") ?? "";
  if (!verifyToken || !appSecret) return json({ error: "Webhook configuration incomplete" }, 503);

  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode") ?? "";
    const supplied = url.searchParams.get("hub.verify_token") ?? "";
    const challenge = url.searchParams.get("hub.challenge") ?? "";
    if (mode === "subscribe" && challenge && safeEqual(supplied, verifyToken)) {
      return new Response(challenge, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
    return new Response("Forbidden", { status: 403 });
  }
  if (req.method !== "POST") return json({ error: "GET or POST only" }, 405);

  const rawBody = await req.text();
  if (rawBody.length > 256_000) return json({ error: "Payload too large" }, 413);
  const signature = req.headers.get("x-hub-signature-256") ?? "";
  if (!(await validSignature(rawBody, signature, appSecret))) return json({ error: "Invalid signature" }, 401);
  let event: Record<string, unknown>;
  try {
    const parsed = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid payload");
    event = parsed as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (event.object !== "page" || !Array.isArray(event.entry)) return json({ received: true, ignored: true });

  let accepted = 0;
  let ignored = 0;
  try {
    for (const rawEntry of event.entry) {
      if (!rawEntry || typeof rawEntry !== "object") continue;
      const entry = rawEntry as Record<string, unknown>;
      if (String(entry.id ?? "") !== PAGE_ID || !Array.isArray(entry.changes)) continue;
      for (const rawChange of entry.changes) {
        if (!rawChange || typeof rawChange !== "object") continue;
        const change = rawChange as Record<string, unknown>;
        const value = change.value && typeof change.value === "object" ? change.value as Record<string, unknown> : {};
        if (change.field !== "leadgen" || !FORM_IDS.has(String(value.form_id ?? "")) || String(value.page_id ?? PAGE_ID) !== PAGE_ID) {
          ignored++;
          continue;
        }
        const leadId = String(value.leadgen_id ?? "");
        if (!/^\d{1,128}$/.test(leadId)) throw new Error("Invalid lead event");
        await saveAndNotify(await getLead(leadId));
        accepted++;
      }
    }
  } catch (error) {
    console.error("Meta YBA webhook processing failed", String(error).slice(0, 160));
    return json({ error: "Lead processing failed; Meta may retry" }, 503);
  }
  return json({ received: true, processed: accepted, ignored });
});

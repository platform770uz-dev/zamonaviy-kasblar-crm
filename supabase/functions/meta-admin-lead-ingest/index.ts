import { createClient } from "npm:@supabase/supabase-js@2";
// SHA-256 токена Make. В публичный репозиторий значение не кладём: оно задано в развёрнутой функции
// (или в секрете MAKE_TOKEN_SHA256). Пустое значение закрывает доступ (все запросы получают 401).
const TOKEN_SHA256 = Deno.env.get("MAKE_TOKEN_SHA256") ?? "";
const DRIVER_FORM_ID = "1116743630843921";
const ADMIN_FORM_ID = "1471428244799477";
const YBA_FORM_ID = "1657196732409379";
// Маршрутизация по ID формы. Формы академии идут во вкладку CRM, формы вакансий в meta_admin_leads,
// любая другая форма отклоняется (422), чтобы лиды академии не попадали в таблицу вакансий.
const idList = (value: string | undefined) => (value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
const YBA_FORM_IDS = new Set([YBA_FORM_ID, ...idList(Deno.env.get("META_YBA_FORM_IDS"))]);
const HR_FORM_IDS = new Set([DRIVER_FORM_ID, ADMIN_FORM_ID, ...idList(Deno.env.get("META_HR_FORM_IDS"))]);
const YBA_TAB_ID = "d52d616c-a91f-47f4-a151-8bb9c069d06d";
const HEADERS = { "Content-Type": "application/json; charset=utf-8" };
function safeEqual(a: string, b: string): boolean { if (a.length !== b.length) return false; let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i); return diff === 0; }
async function sha256(value: string): Promise<string> { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join(""); }
function response(body: Record<string, unknown>, status = 200) { return new Response(JSON.stringify(body), { status, headers: HEADERS }); }
const norm = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[’‘ʻʼ']/g, "").toLowerCase().replace(/[_\s]+/g, " ").trim();
function asText(value: unknown): string | null { if (value === null || value === undefined) return null; const text = Array.isArray(value) ? value.map(x => String(x)).join(", ") : String(value); return text.trim() || null; }
Deno.serve(async (req: Request) => {
 if (req.method !== "POST") return response({ error: "POST only" }, 405);
 const authorization = req.headers.get("authorization") ?? "";
 const supplied = req.headers.get("x-make-token") ?? (authorization.startsWith("Bearer ") ? authorization.slice(7) : "");
 if (!supplied || !safeEqual(await sha256(supplied), TOKEN_SHA256)) return response({ error: "unauthorized" }, 401);
 let body: Record<string, unknown>;
 try { const raw = await req.text(); if (raw.length > 20_000) return response({ error: "payload too large" }, 413); body = JSON.parse(raw); } catch { return response({ error: "invalid JSON" }, 400); }
 if (!body || typeof body !== "object" || Array.isArray(body)) return response({ error: "invalid body" }, 400);
 const fieldMap = new Map<string, string>();
 const add = (key: unknown, val: unknown) => { const k = asText(key); const v = asText(val); if (k && v) fieldMap.set(norm(k), v.slice(0, 2000)); };
 const fieldData = body.field_data ?? body.fields ?? body.fieldData;
 if (Array.isArray(fieldData)) for (const item of fieldData) { if (item && typeof item === "object") { const entry = item as Record<string, unknown>; add(entry.name ?? entry.key, entry.values ?? entry.value); } }
 else if (fieldData && typeof fieldData === "object") for (const [key, val] of Object.entries(fieldData)) add(key, val);
 for (const [key, val] of Object.entries(body)) if (!["field_data", "fields", "fieldData"].includes(key)) add(key, val);
 const pickExact = (keys: string[]) => { for (const key of keys) { const result = fieldMap.get(norm(key)); if (result) return result; } return null; };
 const pickContains = (needles: string[]) => { for (const [key, value] of fieldMap) if (needles.some(needle => key.includes(norm(needle)))) return value; return null; };
 const answers: Record<string, string> = {};
 if (Array.isArray(fieldData)) for (const item of fieldData) {
  if (item && typeof item === "object") {
   const entry = item as Record<string, unknown>;
   const label = asText(entry.name ?? entry.key); const value = asText(entry.values ?? entry.value);
   if (label && value) answers[label.slice(0, 180)] = value.slice(0, 2000);
  }
 } else if (fieldData && typeof fieldData === "object") {
  for (const [label, rawValue] of Object.entries(fieldData)) {
   const value = asText(rawValue); if (value) answers[label.slice(0, 180)] = value.slice(0, 2000);
  }
 }
 const row: Record<string, unknown> = {
  meta_lead_id: pickExact(["meta_lead_id", "lead_id", "leadgen_id", "id"]),
  meta_form_id: pickExact(["meta_form_id", "form_id"]),
  full_name: pickExact(["full_name", "name", "ism", "first_name"]),
  phone: pickExact(["phone", "phone_number", "telefon", "telefon raqami", "mobile_number"]),
  kirgili_answer: pickExact(["kirgili_answer"]) ?? pickContains(["kirgili", "kirguli", "qirguli"]) ?? "",
  study_answer: pickExact(["study_answer"]) ?? pickContains(["student", "talaba", "study", "education"]) ?? "",
  availability: pickExact(["availability"]) ?? pickContains(["bosh vaqt", "grafik", "availability"]) ?? "",
  meta_created_at: pickExact(["meta_created_at", "created_time"]),
  meta_answers: answers,
 };
 const limits: Record<string, number> = { meta_lead_id:128, meta_form_id:128, full_name:160, phone:40, kirgili_answer:300, study_answer:300, availability:2000, meta_created_at:80 };
 for (const key of ["meta_lead_id", "meta_form_id", "full_name", "phone", "meta_created_at"]) {
  const value = row[key];
  if (typeof value !== "string" || !value.trim()) return response({ error:"missing " + key },422);
  if (value.length > limits[key]) return response({ error:"too long " + key },422);
 }
 if (Number.isNaN(Date.parse(String(row.meta_created_at)))) return response({ error:"invalid meta_created_at" },422);
 if (!/\d/.test(String(row.phone))) return response({ error:"invalid phone" },422);
 const url = Deno.env.get("SUPABASE_URL"); const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if (!url || !serviceKey) return response({ error:"server configuration error" },500);
 const supabase = createClient(url, serviceKey, { auth:{persistSession:false} });
 if (YBA_FORM_IDS.has(String(row.meta_form_id))) {
  const ageAnswer = pickContains(["yosh", "возраст", "age"]) ?? "";
  const areaAnswer = pickContains(["shahar", "tuman", "hudud", "manzil", "qayerda", "city", "district", "район", "город"]) ?? "";
  const contactLabels = ["full name", "name", "ism", "phone", "phone number", "telefon", "mobile number", "mobil raqam"];
  const publicAnswers = Object.fromEntries(Object.entries(answers).filter(([label]) => !contactLabels.some(term => norm(label).includes(norm(term)))));
  const values = {
   "Ota-ona ismi": String(row.full_name),
   "Telefon": String(row.phone),
   "Farzand yoshi": ageAnswer,
   "Yashash hududi": areaAnswer,
   "Forma javoblari": JSON.stringify(publicAnswers).slice(0, 4000),
   "Holat": "Yangi"
  };
  const { error: childLeadError } = await supabase.from("custom_records").upsert(
   { tab_id: YBA_TAB_ID, external_id: String(row.meta_lead_id), values },
   { onConflict: "tab_id,external_id", ignoreDuplicates: true } // повтор от Make не сбрасывает статус «Holat»
  );
  if (childLeadError) { console.error("blogger child lead database error", childLeadError.code); return response({error:"database write failed"},500); }
  const { error: notifyQueueError } = await supabase.from("yba_lead_notifications").upsert(
   { meta_lead_id: String(row.meta_lead_id), status: "pending" },
   { onConflict: "meta_lead_id", ignoreDuplicates: true },
  );
  if (notifyQueueError) { console.error("blogger notification queue error", notifyQueueError.code); return response({error:"notification queue unavailable"},503); }
  const { data: secretRow, error: secretError } = await supabase.from("crm_maxfiy").select("qiymat").eq("kalit","tg_ichki").maybeSingle();
  if (secretError || !secretRow?.qiymat) { console.error("blogger notification secret unavailable", secretError?.code ?? "missing"); return response({error:"notification service unavailable"},503); }
  try {
   const endpoint = (url.endsWith("/") ? url.slice(0,-1) : url) + "/functions/v1/tg-bot";
   const notifyResponse = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-crm-secret": String(secretRow.qiymat) },
    body: JSON.stringify({ turi: "yangi_blogger_lid", meta_lead_id: String(row.meta_lead_id) }),
    signal: AbortSignal.timeout(20000),
   });
   const notifyResult = await notifyResponse.json().catch(() => ({}));
   if (!notifyResponse.ok || notifyResult?.ok !== true) { console.error("blogger notification not confirmed", notifyResponse.status); return response({error:"notification delivery pending"},503); }
  } catch (e) {
   console.error("blogger notification request failed", String(e).slice(0,120));
   return response({error:"notification delivery pending"},503);
  }
  return response({ok:true,routed:"Blogerlik leadlari bolalar",notification:"sent_or_duplicate"});
 }
 if (!HR_FORM_IDS.has(String(row.meta_form_id))) {
  console.error("meta-admin-lead-ingest unknown form", String(row.meta_form_id).slice(0, 40));
  return response({ error: "unknown_form_id", form_id: String(row.meta_form_id), hint: "Add the form ID to META_YBA_FORM_IDS (academy) or META_HR_FORM_IDS (vacancies)" }, 422);
 }
 const { error } = await supabase.from("meta_admin_leads").upsert(row as any,{onConflict:"meta_lead_id"});
 if (error) { console.error("meta-admin-lead-ingest database error",error.code); return response({error:"database write failed"},500); }
 if (row.meta_form_id === DRIVER_FORM_ID) {
  const { error: queueError } = await supabase.from("meta_driver_notifications").upsert(
   { meta_lead_id: String(row.meta_lead_id), status: "pending" },
   { onConflict: "meta_lead_id", ignoreDuplicates: true },
  );
  if (queueError) { console.error("driver notification queue error",queueError.code); return response({error:"notification queue unavailable"},503); }
  const { data: secretRow, error: secretError } = await supabase.from("crm_maxfiy").select("qiymat").eq("kalit","tg_ichki").maybeSingle();
  if (secretError || !secretRow?.qiymat) { console.error("driver notification secret unavailable",secretError?.code ?? "missing"); return response({error:"notification service unavailable"},503); }
  try {
   const endpoint = (url.endsWith("/") ? url.slice(0,-1) : url) + "/functions/v1/tg-bot";
   const notifyResponse = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-crm-secret": String(secretRow.qiymat) },
    body: JSON.stringify({ turi: "yangi_haydovchi", meta_lead_id: String(row.meta_lead_id) }),
    signal: AbortSignal.timeout(20000),
   });
   const notifyResult = await notifyResponse.json().catch(() => ({}));
   if (!notifyResponse.ok || notifyResult?.ok !== true) { console.error("driver notification not confirmed",notifyResponse.status); return response({error:"notification delivery pending"},503); }
  } catch (e) {
   console.error("driver notification request failed",String(e).slice(0,120));
   return response({error:"notification delivery pending"},503);
  }
 }
 return response({ok:true,lead:row});
});

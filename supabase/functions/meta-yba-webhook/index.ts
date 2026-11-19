// Прямой вебхук Meta Lead Ads (страница «Zamonaviy Kasblar»): новый лид сразу попадает в рабочий список CRM
// «Загрузка лидов через Excel» с пометкой «Facebook» и приходит уведомлением в Telegram владельцам CRM.
// Правила:
//  1) формы академии берутся из секрета META_YBA_FORM_IDS и таблицы meta_lead_forms (route = 'academy');
//     вакансии (route = 'hr') сохраняются в отдельную вкладку «Вакансии Facebook» (уведомление только владельцу),
//     route = 'ignore' пропускается;
//     незнакомая форма страницы регистрируется автоматически по вопросам анкеты первого лида: есть вопросы о работе
//     (ish, ishlay olasizmi, vakansiya, работа…) → 'hr', иначе → 'academy'; в Telegram пометка о новой форме,
//     а у лидов ещё не проверенных форм академии сохраняются ответы анкеты, чтобы при ошибке перенести их без потерь;
//  2) повторная доставка того же лида ничего не меняет; тот же телефон в списке не дублируется, а увеличивает
//     счётчик заявок (как при загрузке Excel);
//  3) при отказе в meta_webhook_debug пишется этап и причина (без токенов и данных лида);
//  4) лиды академии владелец и админы получают сразу, круглосуточно; операторы колл-центра (skript_operatorlar,
//     @eduteachuz_bot) — через очередь operator_notifications только в рабочее время (функция operator-notify).
// Секреты (Supabase Function secrets): META_WEBHOOK_VERIFY_TOKEN, META_APP_SECRET, META_PAGE_ACCESS_TOKEN,
// META_GRAPH_API_VERSION (например 21.0), TEACHNOVA_BOT_TOKEN (бот @teachnova_bot), META_YBA_FORM_IDS (необязательно).
import { createClient } from "npm:@supabase/supabase-js@2";

const HEADERS = { "Content-Type": "application/json; charset=utf-8" };
const PAGE_ID = "1239005935955148";
const ENV_FORM_IDS = (Deno.env.get("META_YBA_FORM_IDS") ?? "1657196732409379").split(",").map((value) => value.trim()).filter(Boolean);
const LEADS_TAB_ID = "20b419be-7a75-4051-9993-6c755c4a5d68"; // вкладка CRM «Загрузка лидов через Excel» — рабочий список лидов
const CRM_SITE = "https://platform770uz-dev.github.io/zamonaviy-kasblar-crm/";

const CANDIDATES_TAB_ID = "5631f830-18bd-41dd-9fac-dc7c21baff7b"; // вкладка CRM «Вакансии Facebook» (только owner и manager)

type FormRoutes = { academy: Set<string>; hr: Set<string>; known: Set<string>; names: Map<string, string>; newForms: Set<string> };

// Формы академии: секрет META_YBA_FORM_IDS плюс таблица meta_lead_forms (route = 'academy'),
// чтобы новую форму можно было подключить записью в таблицу, без правки секрета.
async function loadFormRoutes(): Promise<FormRoutes> {
  const academy = new Set(ENV_FORM_IDS);
  const hr = new Set<string>();
  const known = new Set(ENV_FORM_IDS);
  const names = new Map<string, string>();
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (url && serviceKey) {
      const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
      const { data } = await supabase.from("meta_lead_forms").select("form_id,route,name");
      for (const row of data ?? []) {
        known.add(String(row.form_id));
        if (row.name) names.set(String(row.form_id), String(row.name));
        if (row.route === "academy") academy.add(String(row.form_id));
        if (row.route === "hr") hr.add(String(row.form_id));
      }
    }
  } catch {
    // при недоступности таблицы остаются формы из секрета
  }
  return { academy, hr, known, names, newForms: new Set<string>() };
}

// Незнакомая форма страницы: регистрируем её сами, чтобы лид не потерялся. Маршрут выбирают вопросы анкеты первого
// лида (looksLikeVacancy): вакансия → 'hr', иначе → 'academy'. Имя «… (авто)» значит, что форму ещё никто не проверял;
// в Telegram будет пометка. Если решение неверное, route в meta_lead_forms меняется одной командой.
async function registerNewForm(routes: FormRoutes, formId: string, route: "academy" | "hr") {
  const name = route === "hr" ? `Новая вакансия ${formId} (авто)` : `Новая форма ${formId} (авто)`;
  (route === "hr" ? routes.hr : routes.academy).add(formId);
  routes.known.add(formId);
  routes.names.set(formId, name);
  routes.newForms.add(formId);
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (url && serviceKey) {
      const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
      await supabase.from("meta_lead_forms").upsert({ form_id: formId, route, name }, { onConflict: "form_id", ignoreDuplicates: true });
    }
  } catch {
    // регистрация формы не должна мешать сохранению лида
  }
  await trace("unknown_form", `registered as ${route}: form_id ${formId.slice(0, 40)}`);
}

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: HEADERS });

const esc = (value: unknown) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Диагностика: этап и причина отказа в таблицу meta_webhook_debug (только service_role; без токенов и данных лида).
async function trace(stage: string, detail = "") {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return;
    const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
    await supabase.from("meta_webhook_debug").insert({ stage, detail: detail.slice(0, 300) });
  } catch {
    // диагностика не должна ломать обработку вебхука
  }
}

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

// Стандартные поля Meta (контакты и профиль) — не вопросы анкеты, в определении вакансии не участвуют
// (иначе, например, «job_title» в анкете для родителей выглядел бы как вакансия).
const STANDARD_FIELDS = new Set([
  "full_name", "first_name", "last_name", "phone_number", "email", "city", "state", "province", "country", "zip_code",
  "post_code", "street_address", "date_of_birth", "gender", "marital_status", "relationship_status", "military_status",
  "job_title", "company_name", "work_email", "work_phone_number",
].map(norm));

// Слова о работе в подписях вопросов (после norm(): нижний регистр, без апострофов и диакритики, «_» → пробел).
// Слово должно с них начинаться: «o‘qishga», «kirish» не считаются; «ishonch», «ishtirok», «ishq», «ishkal»,
// «ishlatasizmi» («пользуетесь ли»), «ishlov» исключены. «oylik» (бывает «oylik to‘lov» за курс) и «tajriba»
// (опыт блогинга у ребёнка) не берём: в анкетах вакансий рядом всё равно есть «ish…».
const JOB_WORD = new RegExp(
  "(?<![\\p{L}\\p{N}])(?:" + [
    "ish(?!o|t|q|k|lat|lov)\\p{L}*", "иш(?!о|т|қ|к|лат|лов)\\p{L}*",
    "vakansi\\p{L}*", "ваканси\\p{L}*", "rezyume\\p{L}*", "резюме\\p{L}*", "maosh\\p{L}*", "маош\\p{L}*",
    "lavozim\\p{L}*", "лавозим\\p{L}*",
    "(?:за|под)?работ\\p{L}*", "зарплат\\p{L}*", "трудоустр\\p{L}*",
    "jobs?", "vacanc\\p{L}*", "salary", "salaries", "resume", "hiring", "employment",
  ].join("|") + ")(?![\\p{L}\\p{N}])",
  "u",
);

// Вакансия ли это: в подписях вопросов анкеты (не в ответах и не в стандартных полях) есть слова о работе.
function looksLikeVacancy(fieldData: unknown): boolean {
  if (!Array.isArray(fieldData)) return false;
  return fieldData.some((raw) => {
    const label = raw && typeof raw === "object" ? norm(String((raw as Record<string, unknown>).name ?? "")) : "";
    return label !== "" && !STANDARD_FIELDS.has(label) && JOB_WORD.test(label);
  });
}

// Ответы на вопросы анкеты без контактных полей (имя, телефон).
function formAnswers(fields: Map<string, string>): Record<string, string> {
  const contactTerms = ["name", "ism", "fio", "phone", "telefon", "mobile", "raqam"];
  return Object.fromEntries([...fields].filter(([label]) => !contactTerms.some((term) => label.includes(term))));
}

// Та же нормализация, что при загрузке Excel в CRM (normalizeLeadPhone в app.js).
function normalizePhone(value: string): string {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("998") && digits.length === 12) digits = digits.slice(3);
  return digits;
}

async function getLead(leadId: string): Promise<Record<string, unknown>> {
  const accessToken = Deno.env.get("META_PAGE_ACCESS_TOKEN") ?? "";
  const version = Deno.env.get("META_GRAPH_API_VERSION") ?? "";
  if (!accessToken || !/^\d+\.\d+$/.test(version)) throw new Error("Meta API configuration unavailable");
  const url = new URL(`https://graph.facebook.com/v${version}/${encodeURIComponent(leadId)}`);
  // page_id у объекта лида в Graph API нет (запрос с ним даёт ошибку 100); страницу проверяем по событию вебхука.
  url.searchParams.set("fields", "id,created_time,field_data,form_id");
  url.searchParams.set("access_token", accessToken);
  const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body || typeof body !== "object" || !(body as Record<string, unknown>).id) {
    // Код и подкод ошибки Meta помогают понять причину (например 190 — токен истёк, 200 — нет прав). Токен не логируется.
    const metaError = (body as { error?: { code?: unknown; error_subcode?: unknown } } | null)?.error;
    console.error("Meta lead retrieval failed", response.status, String(metaError?.code ?? ""), String(metaError?.error_subcode ?? ""));
    await trace("graph_error", `http ${response.status} code ${String(metaError?.code ?? "")} subcode ${String(metaError?.error_subcode ?? "")}`);
    throw new Error("Meta lead retrieval failed");
  }
  return body as Record<string, unknown>;
}

// Активные операторы колл-центра (@eduteachuz_bot). При сбое чтения — пустой список: уведомления уйдут как раньше.
// deno-lint-ignore no-explicit-any
async function activeOperatorIds(supabase: any): Promise<Set<number>> {
  const { data, error } = await supabase.from("skript_operatorlar").select("chat_id").eq("holat", "faol");
  if (error) console.error("Operator list read failed", error.code);
  return new Set((data ?? []).map((row: { chat_id: unknown }) => Number(row.chat_id)));
}

// Событие для операторов колл-центра: operator-notify доставит его в рабочее время (пн–сб 13:00–19:00), по одному.
// Сбой очереди не мешает уведомить владельца: причину пишем в meta_webhook_debug и идём дальше.
// deno-lint-ignore no-explicit-any
async function queueForOperators(supabase: any, dedupeKey: string, kind: string, payload: Record<string, unknown>) {
  const { error } = await supabase.from("operator_notifications").upsert(
    { dedupe_key: dedupeKey, kind, payload },
    { onConflict: "dedupe_key", ignoreDuplicates: true },
  );
  if (error) {
    console.error("Operator queue failed", error.code);
    await trace("operator_queue_error", `${kind} ${String(error.code ?? "")}`);
  }
}

// Уведомление владельцам CRM в Telegram; статус хранится в yba_lead_notifications, повтор вебхука не шлёт дубль.
// deno-lint-ignore no-explicit-any
async function notifyOwners(supabase: any, leadId: string, text: string, roles: string[] = ["owner", "admin"]) {
  const { error: queueError } = await supabase.from("yba_lead_notifications").upsert(
    { meta_lead_id: leadId, status: "pending" },
    { onConflict: "meta_lead_id", ignoreDuplicates: true },
  );
  if (queueError) {
    console.error("Lead notification queue failed", queueError.code);
    throw new Error("Notification queue failed");
  }
  const { data: job } = await supabase.from("yba_lead_notifications").select("status").eq("meta_lead_id", leadId).maybeSingle();
  if (job?.status === "sent") return;

  // Уведомления шлёт @teachnova_bot (как и напоминания о звонках): тем же людям — владельцу и подтверждённым админам.
  // Админы, которые работают операторами колл-центра, получают лиды отдельно и только в рабочее время (operator-notify).
  const botToken = Deno.env.get("TEACHNOVA_BOT_TOKEN") ?? "";
  const { data: people } = await supabase.from("tg_chatlar").select("chat_id,rol")
    .in("rol", roles).eq("tasdiqlangan", true).eq("bloklangan", false);
  const operatorIds = await activeOperatorIds(supabase);
  const owners = (people ?? []).filter((person: { chat_id: unknown; rol: unknown }) => person.rol === "owner" || !operatorIds.has(Number(person.chat_id)));
  if (!botToken || !owners.length) throw new Error("Telegram recipients unavailable");
  let sent = 0;
  let lastProblem = "";
  for (const owner of owners) {
    try {
      const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: owner.chat_id, text, parse_mode: "HTML", link_preview_options: { is_disabled: true } }),
        signal: AbortSignal.timeout(10000),
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result?.ok === true) sent++;
      else lastProblem = `http ${response.status} ${String(result?.description ?? "").replaceAll(botToken, "***")}`.slice(0, 200);
    } catch (error) {
      // ошибка конкретного чата не должна останавливать остальных; токен в тексте ошибки скрываем
      lastProblem = `fetch error ${String(error).replaceAll(botToken, "***")}`.slice(0, 200);
    }
  }
  if (sent === 0) {
    await trace("telegram_error", lastProblem || "no response");
    await supabase.from("yba_lead_notifications").update({ status: "pending", last_error: `Telegram: ${lastProblem}`.slice(0, 250), updated_at: new Date().toISOString() }).eq("meta_lead_id", leadId);
    throw new Error("Telegram notification pending");
  }
  await supabase.from("yba_lead_notifications").update({ status: "sent", sent_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }).eq("meta_lead_id", leadId);
}

// Заявка на вакансию (формы route = 'hr'): отдельная вкладка CRM «Вакансии Facebook»; о найме уведомляем только владельца.
async function saveCandidate(lead: Record<string, unknown>, routes: FormRoutes) {
  const leadId = String(lead.id ?? "");
  const formId = String(lead.form_id ?? "");
  if (!/^\d{1,128}$/.test(leadId) || !routes.hr.has(formId)) return { ignored: true };
  const fields = fieldValues(lead.field_data);
  const fullName = findValue(fields, ["full_name", "name", "ism", "ism familiya", "fio"]);
  const phone = findValue(fields, ["phone_number", "phone", "telefon", "telefon raqami", "mobile_number", "mobil raqam"]);
  const isTestLead = /<test lead/i.test(`${fullName} ${phone}`);
  if (!fullName || !phone || (!isTestLead && !/\d/.test(phone))) throw new Error("Required lead fields are missing");
  const candidateName = isTestLead ? "TEST Facebook кандидат" : fullName;
  const candidatePhone = isTestLead ? "+998000000000" : phone;
  const vacancy = routes.names.get(formId) ?? `форма ${formId}`;
  const answers = formAnswers(fields);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) throw new Error("Database configuration unavailable");
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: tabRow, error: tabError } = await supabase.from("custom_tabs").select("created_by").eq("id", CANDIDATES_TAB_ID).maybeSingle();
  if (tabError || !tabRow?.created_by) {
    console.error("Candidates tab owner lookup failed", tabError?.code ?? "no owner");
    throw new Error("CRM save failed");
  }
  const values = {
    "Имя": candidateName.slice(0, 160),
    "Телефон": candidatePhone.slice(0, 40),
    "Вакансия": vacancy.slice(0, 200),
    "Ответы формы": JSON.stringify(answers).slice(0, 4000),
    "Holat": "Yangi",
  };
  const { error: insertError } = await supabase.from("custom_records").upsert(
    { tab_id: CANDIDATES_TAB_ID, external_id: leadId, values, created_by: tabRow.created_by },
    { onConflict: "tab_id,external_id", ignoreDuplicates: true },
  );
  if (insertError) {
    console.error("Candidate save failed", insertError.code);
    throw new Error("CRM save failed");
  }
  const lines = [
    `${isTestLead ? "🧪 TEST · " : ""}🧑‍💼 <b>Новая заявка на вакансию (Facebook)</b>`,
    `👤 ${esc(candidateName.slice(0, 160))}`,
    `📞 ${esc(candidatePhone.slice(0, 40))}`,
    `💼 ${esc(vacancy)}`,
  ];
  if (routes.newForms.has(formId)) lines.push("⚠️ Новая форма: по вопросам анкеты определена как вакансия. Если это не вакансия, скажите.");
  lines.push("", `<a href="${CRM_SITE}">Открыть CRM</a> → «Вакансии Facebook»`);
  await notifyOwners(supabase, leadId, lines.join("\n"), ["owner"]);
  return { saved: true, notified: true };
}

async function saveAndNotify(lead: Record<string, unknown>, routes: FormRoutes) {
  const leadId = String(lead.id ?? "");
  const formId = String(lead.form_id ?? "");
  if (!/^\d{1,128}$/.test(leadId) || !routes.academy.has(formId)) return { ignored: true };
  const createdAtRaw = String(lead.created_time ?? "");
  if (!createdAtRaw || Number.isNaN(Date.parse(createdAtRaw))) throw new Error("Invalid Meta lead timestamp");
  const createdAt = new Date(createdAtRaw).toISOString();
  const fields = fieldValues(lead.field_data);
  const fullName = findValue(fields, ["full_name", "name", "ism", "parent name", "ota-ona ismi", "ota onaning ismi"]);
  const phone = findValue(fields, ["phone_number", "phone", "telefon", "telefon raqami", "mobile_number", "mobil raqam"]);
  // Тестовая заявка из Lead Ads Testing содержит заглушки «<test lead: dummy data ...>»: сохраняем её
  // как «TEST Facebook lead» с фиктивным номером, чтобы проверить всю цепочку; в Telegram она с пометкой 🧪.
  const isTestLead = /<test lead/i.test(`${fullName} ${phone}`);
  if (!fullName || !phone || (!isTestLead && !/\d/.test(phone))) throw new Error("Required lead fields are missing");
  const leadName = isTestLead ? "TEST Facebook lead" : fullName;
  const leadPhone = isTestLead ? "+998000000000" : phone;
  const phoneKey = normalizePhone(leadPhone);
  if (phoneKey.length < 7 || phoneKey.length > 15) throw new Error("Required lead fields are missing");

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) throw new Error("Database configuration unavailable");
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Тот же лид уже обработан (повторная доставка вебхука)?
  const { data: sameLead, error: sameLeadError } = await supabase.from("custom_records").select("id")
    .eq("tab_id", LEADS_TAB_ID).eq("external_id", leadId).maybeSingle();
  if (sameLeadError) {
    console.error("Lead lookup failed", sameLeadError.code);
    throw new Error("CRM lookup failed");
  }

  let submissionCount = 1;
  if (!sameLead) {
    // Тот же телефон уже есть в списке? Тогда обновляем счётчик заявок, как при загрузке Excel.
    const { data: rows, error: rowsError } = await supabase.from("custom_records").select("id,values")
      .eq("tab_id", LEADS_TAB_ID).limit(5000);
    if (rowsError) {
      console.error("Lead list read failed", rowsError.code);
      throw new Error("CRM lookup failed");
    }
    const found = (rows ?? []).find((row) => normalizePhone(String((row.values as Record<string, unknown> | null)?.["Телефон"] ?? "")) === phoneKey);
    if (found) {
      const values = { ...(found.values as Record<string, unknown>) };
      const seen = Array.isArray(values.meta_lead_ids) ? values.meta_lead_ids.map(String) : [];
      if (!seen.includes(leadId)) {
        const hadHistory = Array.isArray(values.lead_submission_times);
        let times: string[] = hadHistory ? (values.lead_submission_times as unknown[]).map(String) : (values.created_time ? [String(values.created_time)] : []);
        if (!times.includes(createdAt)) times.push(createdAt);
        times = [...new Set(times)].sort();
        values.lead_submission_times = times;
        values.submission_count = Math.max(Number(values.submission_count) || 1, times.length);
        values.created_time = times[0];
        values.latest_submission_time = times[times.length - 1];
        values.meta_lead_ids = [...seen, leadId];
        if (!values["Источник"]) values["Источник"] = "Facebook";
        const { error: updateError } = await supabase.from("custom_records").update({ values, updated_at: new Date().toISOString() }).eq("id", found.id);
        if (updateError) {
          console.error("Lead update failed", updateError.code);
          throw new Error("CRM save failed");
        }
      }
      submissionCount = Math.max(Number(values.submission_count) || 1, 2);
    } else {
      // Новый лид: те же поля, что у остальных лидов списка, плюс пометка «Facebook».
      const values: Record<string, unknown> = {
        "Имя": leadName.slice(0, 160),
        "Телефон": leadPhone.slice(0, 40),
        "Результат последнего звонка": "",
        "Последний изменивший": "Facebook",
        "Источник": "Facebook",
        "Статус консультации": "new",
        created_time: createdAt,
        latest_submission_time: createdAt,
        lead_submission_times: [createdAt],
        submission_count: 1,
        meta_lead_ids: [leadId],
      };
      const formName = routes.names.get(formId);
      if (formName) values["Форма Facebook"] = formName.slice(0, 160);
      // Форма ещё не проверена («… (авто)»): сохраняем ответы анкеты, чтобы при переносе в вакансии они не потерялись.
      if (formName?.endsWith("(авто)")) values["Ответы формы"] = JSON.stringify(formAnswers(fields)).slice(0, 4000);
      // created_by в custom_records обязателен: записи создаёт владелец вкладки (автор самой вкладки CRM).
      const { data: tabRow, error: tabError } = await supabase.from("custom_tabs").select("created_by").eq("id", LEADS_TAB_ID).maybeSingle();
      if (tabError || !tabRow?.created_by) {
        console.error("Lead tab owner lookup failed", tabError?.code ?? "no owner");
        throw new Error("CRM save failed");
      }
      const { error: insertError } = await supabase.from("custom_records").upsert(
        { tab_id: LEADS_TAB_ID, external_id: leadId, values, created_by: tabRow.created_by },
        { onConflict: "tab_id,external_id", ignoreDuplicates: true },
      );
      if (insertError) {
        console.error("Lead save failed", insertError.code);
        throw new Error("CRM save failed");
      }
    }
  }

  const formLabel = routes.names.get(formId) ?? `форма ${formId}`;
  const lines = [
    `${isTestLead ? "🧪 TEST · " : ""}🆕 <b>Новый лид из Facebook</b>`,
    `👤 ${esc(leadName.slice(0, 160))}`,
    `📞 ${esc(leadPhone.slice(0, 40))}`,
    `📋 ${esc(formLabel)}`,
  ];
  if (routes.newForms.has(formId)) lines.push("⚠️ Новая форма: вопросов о работе в анкете нет, поэтому она записана как академия. Если это вакансия, скажите.");
  if (submissionCount > 1) lines.push("🔁 Повторная заявка с этого номера");
  lines.push("", `<a href="${CRM_SITE}">Открыть CRM</a> → «Загрузка лидов через Excel»`);
  if (!isTestLead) {
    await queueForOperators(supabase, `lead:${leadId}`, "lead", {
      name: leadName.slice(0, 160), phone: leadPhone.slice(0, 40), form: formLabel.slice(0, 160), repeat: submissionCount > 1, at: createdAt,
    });
  }
  await notifyOwners(supabase, leadId, lines.join("\n"));
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
  if (!(await validSignature(rawBody, signature, appSecret))) {
    await trace("bad_signature", `signature header ${signature ? "present" : "missing"}, body ${rawBody.length} bytes`);
    return json({ error: "Invalid signature" }, 401);
  }
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
  const routes = await loadFormRoutes();
  try {
    for (const rawEntry of event.entry) {
      if (!rawEntry || typeof rawEntry !== "object") continue;
      const entry = rawEntry as Record<string, unknown>;
      if (String(entry.id ?? "") !== PAGE_ID || !Array.isArray(entry.changes)) continue;
      for (const rawChange of entry.changes) {
        if (!rawChange || typeof rawChange !== "object") continue;
        const change = rawChange as Record<string, unknown>;
        const value = change.value && typeof change.value === "object" ? change.value as Record<string, unknown> : {};
        const eventFormId = String(value.form_id ?? "");
        if (change.field !== "leadgen" || String(value.page_id ?? PAGE_ID) !== PAGE_ID) {
          // Не лид или чужая страница: ничего не сохраняем.
          ignored++;
          continue;
        }
        const leadId = String(value.leadgen_id ?? "");
        let lead: Record<string, unknown> | null = null;
        if (/^\d{1,40}$/.test(eventFormId) && !routes.known.has(eventFormId)) {
          // Незнакомая форма: сначала читаем лид и по вопросам анкеты решаем, вакансия это или академия.
          if (!/^\d{1,128}$/.test(leadId)) throw new Error("Invalid lead event");
          lead = await getLead(leadId);
          await registerNewForm(routes, eventFormId, looksLikeVacancy(lead.field_data) ? "hr" : "academy");
        }
        const isHrForm = routes.hr.has(eventFormId);
        if (!isHrForm && !routes.academy.has(eventFormId)) {
          // Форма с route = 'ignore': ничего не сохраняем.
          ignored++;
          continue;
        }
        if (!/^\d{1,128}$/.test(leadId)) throw new Error("Invalid lead event");
        lead ??= await getLead(leadId);
        if (isHrForm) await saveCandidate(lead, routes);
        else await saveAndNotify(lead, routes);
        accepted++;
      }
    }
  } catch (error) {
    console.error("Meta YBA webhook processing failed", String(error).slice(0, 160));
    await trace("processing_failed", String(error).slice(0, 160));
    return json({ error: "Lead processing failed; Meta may retry" }, 503);
  }
  return json({ received: true, accepted, ignored });
});

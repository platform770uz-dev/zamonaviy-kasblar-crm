import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ALLOWED_ORIGINS = new Set([
  "https://platform770uz-dev.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);
const ANSWER_KEY = [1, 1, 0, 1, 1];
const commonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Vary": "Origin",
};

function json(body: Record<string, unknown>, status: number, origin: string | null) {
  const cors = origin && ALLOWED_ORIGINS.has(origin)
    ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type, apikey" }
    : {};
  return new Response(JSON.stringify(body), { status, headers: { ...commonHeaders, ...cors } });
}

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, max) : "";
}

function isChoice(value: unknown, choices: string[]) {
  return typeof value === "string" && choices.includes(value);
}

async function hash(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    if (!origin || !ALLOWED_ORIGINS.has(origin)) return json({ error: "origin_not_allowed" }, 403, null);
    return json({ ok: true }, 200, origin);
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, origin);
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return json({ error: "origin_not_allowed" }, 403, null);
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: "server_not_configured" }, 503, origin);
  const contentLength = Number(req.headers.get("content-length") || "0");
  if (contentLength > 12_000) return json({ error: "request_too_large" }, 413, origin);

  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > 12_000) return json({ error: "request_too_large" }, 413, origin);
    body = JSON.parse(raw);
  } catch {
    return json({ error: "invalid_json" }, 400, origin);
  }
  if (cleanText(body.honeypot, 200)) return json({ ok: true }, 200, origin);

  const name = cleanText(body.full_name, 80);
  const phone = cleanText(body.phone, 30);
  const digits = phone.replace(/\D/g, "");
  const city = cleanText(body.city, 80);
  const fuel = cleanText(body.fuel, 40);
  const language = body.language === "ru" ? "ru" : body.language === "uz" ? "uz" : "";
  const answers = Array.isArray(body.answers) ? body.answers : [];
  if (name.length < 2 || digits.length < 9 || digits.length > 15 || city.length < 2 || fuel.length < 2 || !language || body.consent !== true || answers.length !== 5 || !answers.every((answer) => Number.isInteger(answer) && answer >= 0 && answer <= 3)) {
    return json({ error: "invalid_application" }, 400, origin);
  }
  if (!isChoice(body.license, ["yes", "no"]) || !isChoice(body.car, ["yes", "no"]) || !isChoice(body.schedule, ["yes", "discuss", "no"])) {
    return json({ error: "invalid_profile" }, 400, origin);
  }

  const correct = answers.map((answer, i) => answer === ANSWER_KEY[i]);
  const score = correct.filter(Boolean).length;
  const communication = Number(correct[1]) + Number(correct[4]);
  const flexibility = Number(correct[2]) + Number(correct[4]);
  const answerLabels = language === "ru"
    ? ["Роль", "Общение с занятым клиентом", "Гибкость маршрута", "Условия комиссии", "Работа с возражением"]
    : ["Lavozimni tushunish", "Band mijoz bilan muloqot", "Yo‘nalishda moslashuv", "Komissiya sharti", "E’tiroz bilan ishlash"];
  const answerStates = language === "ru" ? ["верно", "неверно"] : ["to‘g‘ri", "noto‘g‘ri"];
  const summary = language === "ru"
    ? `Город: ${city}; права B: ${body.license === "yes" ? "да" : "нет"}; авто: ${body.car === "yes" ? fuel : "нет"}; график: ${body.schedule}`
    : `Shahar: ${city}; B toifa: ${body.license === "yes" ? "bor" : "yo‘q"}; mashina: ${body.car === "yes" ? fuel : "yo‘q"}; grafik: ${body.schedule}`;

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const clientIp = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rate = await supabase.rpc("vacancy_assessment_take_rate_limit", { p_ip_hash: await hash(clientIp) });
  if (rate.error) {
    console.error("vacancy assessment rate limit unavailable", rate.error.code || "db_error");
    return json({ error: "temporarily_unavailable" }, 503, origin);
  }
  if (rate.data !== true) return json({ error: "rate_limited" }, 429, origin);
  const metaAnswers = {
    source: "Zamonaviy Kasb public assessment",
    total_score: score,
    total_max: 5,
    communication_score: communication,
    communication_max: 2,
    flexibility_score: flexibility,
    flexibility_max: 2,
    city,
    license: body.license,
    car: body.car,
    fuel,
    schedule: body.schedule,
    language,
    ...Object.fromEntries(answerLabels.map((label, i) => [`answer_${i + 1}_${label}`, `${String.fromCharCode(65 + Number(answers[i]))} — ${answerStates[correct[i] ? 0 : 1]}`])),
    consent: true,
    submitted_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("meta_admin_leads").insert({
    meta_lead_id: `zk-${crypto.randomUUID()}`,
    meta_form_id: "zamonaviy-kasb-vakansiya",
    full_name: name,
    phone,
    kirgili_answer: language === "ru" ? "Отклик через сайт вакансии" : "Vakansiya sayti orqali ariza",
    study_answer: language === "ru" ? "Три коротких урока и ситуационный тест" : "Uchta qisqa dars va vaziyatli test",
    availability: summary,
    meta_created_at: new Date().toISOString(),
    meta_answers: metaAnswers,
  });
  if (error) {
    console.error("vacancy assessment insert failed", error.code || "db_error");
    return json({ error: "save_failed" }, 500, origin);
  }
  return json({ ok: true, score, communication, flexibility }, 200, origin);
});


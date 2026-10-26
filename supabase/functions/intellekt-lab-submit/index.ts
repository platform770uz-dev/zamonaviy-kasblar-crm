import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigin = "https://platform770uz-dev.github.io";
const consentVersion = "intellekt-lab-crm-v1";
const consentText = "Men bolaning ota-onasi yoki qonuniy vakiliman. Bolaning ismi yoki taxallusi, yosh guruhi, 30 ta test javobi va mantiqiy hamda tanqidiy fikrlash ballarini Intellekt Lab o‘qituvchilari ko‘rishi uchun CRM tizimiga yuborishga roziman. Kreativ javoblarni o‘qituvchi baholaydi. Rozilik bermaslik testdan foydalanishga ta’sir qilmaydi.";
const answerKey = [1,1,0,2,0,3,2,1,1,2,1,2,2,3,0,2,1,3,0,2];
const requestsByAddress = new Map<string, { startedAt: number; count: number }>();
const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function isRateLimited(req: Request): Promise<boolean> {
  const address = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(address));
  const key = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const now = Date.now();
  const old = requestsByAddress.get(key);
  if (!old || now - old.startedAt >= 60 * 60 * 1000) {
    requestsByAddress.set(key, { startedAt: now, count: 1 });
    return false;
  }
  old.count += 1;
  return old.count > 5;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.headers.get("origin") !== allowedOrigin) return reply({ error: "origin_not_allowed" }, 403);
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
  if (await isRateLimited(req)) return reply({ error: "rate_limited" }, 429);

  try {
    const raw = await req.text();
    if (raw.length > 40000) return reply({ error: "payload_too_large" }, 413);
    const body = JSON.parse(raw);
    if (body?.parent_confirmed !== true || body?.consent_version !== consentVersion || body?.consent_text !== consentText) {
      return reply({ error: "explicit_parent_consent_required" }, 400);
    }
    if (!["7-10", "11-14"].includes(body?.age_group)) return reply({ error: "invalid_age_group" }, 400);
    if (typeof body?.child_name !== "string" || body.child_name.trim().length > 50) {
      return reply({ error: "invalid_child_name" }, 400);
    }
    if (typeof body?.submission_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.submission_id)) {
      return reply({ error: "invalid_submission_id" }, 400);
    }
    const answers = body?.answers;
    if (!Array.isArray(answers) || answers.length !== 30) return reply({ error: "invalid_answers" }, 400);
    if (answers.slice(0, 20).some((value) => !Number.isInteger(value) || value < 0 || value > 3)) {
      return reply({ error: "invalid_choice_answers" }, 400);
    }
    if (answers.slice(20).some((value) => typeof value !== "string" || value.length > 10000)) {
      return reply({ error: "invalid_written_answers" }, 400);
    }
    if (answers.slice(20).reduce((n, value) => n + value.length, 0) > 25000) {
      return reply({ error: "written_answers_too_long" }, 413);
    }

    const logicScore = answers.slice(0, 10).reduce((n, value, i) => n + (value === answerKey[i] ? 1 : 0), 0);
    const criticalScore = answers.slice(10, 20).reduce((n, value, i) => n + (value === answerKey[i + 10] ? 1 : 0), 0);
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return reply({ error: "server_not_configured" }, 503);
    const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await db.from("intellekt_lab_results").upsert({
      submission_id: body.submission_id,
      child_name: body.child_name.trim(),
      age_group: body.age_group,
      answers,
      logic_score: logicScore,
      critical_score: criticalScore,
      consent_version: consentVersion,
      consent_text: consentText,
      consent_at: new Date().toISOString(),
    }, { onConflict: "submission_id", ignoreDuplicates: true });
    if (error) return reply({ error: "save_failed" }, 500);
    return reply({ ok: true, logic_score: logicScore, critical_score: criticalScore });
  } catch {
    return reply({ error: "invalid_request" }, 400);
  }
});

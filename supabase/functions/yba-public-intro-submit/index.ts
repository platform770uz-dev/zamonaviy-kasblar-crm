import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigin = "https://platform770uz-dev.github.io";
const consentVersion = "yba-parent-intro-results-v1";
const consentText = "Men bolaning ota-onasi yoki qonuniy vakiliman. Bola ismi yoki taxallusi, yosh guruhi, qiziqishlari, yoqtirgan blog videolari va tanishuv progressini Yosh blogerlar akademiyasi CRM tizimiga yuborishga roziman. Bu ma’lumotlar kurs bo‘yicha murojaatni ko‘rib chiqish uchun saqlanadi. Rozilik bermaslik tanishuv natijasiga ta’sir qilmaydi.";
const interestsAllowed = new Set(["Hayvonlar", "Sport", "Rasm va ijod", "O‘yinlar", "Tabiat va sayohat", "Kitoblar va ilm", "Pazandachilik"]);
const stylesAllowed = new Set(["Foydali maslahatlar", "Kulgili videolar", "Vlog va sayohat", "Sinov va o‘yinlar", "Hikoya va ertaklar", "Ijodiy videolar"]);
const requestsByAddress = new Map<string, { startedAt: number; count: number }>();
const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function validChoices(value: unknown, allowed: Set<string>, max: number): string[] | null {
  if (!Array.isArray(value) || value.length > max || value.some((item) => typeof item !== "string" || !allowed.has(item))) return null;
  return [...new Set(value as string[])];
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
  if (Number(req.headers.get("content-length") || "0") > 4000) return reply({ error: "payload_too_large" }, 413);
  if (await isRateLimited(req)) return reply({ error: "rate_limited" }, 429);

  try {
    const body = await req.json();
    if (body?.parent_confirmed !== true || body?.consent_version !== consentVersion || body?.consent_text !== consentText) {
      return reply({ error: "explicit_parent_consent_required" }, 400);
    }
    if (body?.progress !== 4 || !["7-10", "11-14"].includes(body?.age_group)) return reply({ error: "invalid_result" }, 400);
    if (typeof body?.child_name !== "string" || body.child_name.trim().length < 1 || body.child_name.trim().length > 24) {
      return reply({ error: "invalid_profile" }, 400);
    }
    if (typeof body?.submission_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.submission_id)) {
      return reply({ error: "invalid_submission_id" }, 400);
    }
    const interests = validChoices(body.interests, interestsAllowed, 7);
    const blogStyles = validChoices(body.blog_styles, stylesAllowed, 6);
    if (!interests?.length || !blogStyles?.length) return reply({ error: "invalid_profile" }, 400);

    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return reply({ error: "server_not_configured" }, 503);
    const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await db.from("yba_public_intro_results").upsert({
      submission_id: body.submission_id,
      child_name: body.child_name.trim(),
      age_group: body.age_group,
      interests,
      blog_styles: blogStyles,
      progress: 4,
      consent_version: consentVersion,
      consent_text: consentText,
      consent_at: new Date().toISOString(),
    }, { onConflict: "submission_id", ignoreDuplicates: true });
    if (error) return reply({ error: "save_failed" }, 500);
    return reply({ ok: true });
  } catch {
    return reply({ error: "invalid_request" }, 400);
  }
});


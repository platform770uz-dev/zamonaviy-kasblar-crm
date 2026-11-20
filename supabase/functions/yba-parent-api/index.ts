import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY") || "sb_publishable_8z5WQbInjqHDvigfDSOcuQ_FOq7LQWJ";
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const MINI_APP = "https://platform770uz-dev.github.io/yosh-blogerlar-miniapp/";
const LEADS_TAB_ID = "d52d616c-a91f-47f4-a151-8bb9c069d06d";
const RESULTS_TAB_NAME = "Детский блогинг";
const allowedOrigins = new Set([MINI_APP.replace(/\/$/, ""), "http://127.0.0.1:8765", "http://localhost:8765"]);
const headersFor = (origin: string) => ({
  "Access-Control-Allow-Origin": allowedOrigins.has(origin.replace(/\/$/, "")) ? origin : MINI_APP.replace(/\/$/, ""),
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Cache-Control": "no-store",
  "Vary": "Origin",
});
const json = (body: unknown, status = 200, origin = "") => new Response(JSON.stringify(body), {
  status,
  headers: { ...headersFor(origin), "Content-Type": "application/json; charset=utf-8", "Referrer-Policy": "no-referrer" },
});
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function randomToken() {
  return [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function cleanList(value: unknown, allowed: string[]) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((x) => String(x).trim()).filter((x) => allowed.includes(x)))].slice(0, 7);
}

async function makeInvite(body: any, req: Request, origin: string) {
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  if (!bearer) return json({ error: "login_required" }, 401, origin);
  const userClient = createClient(URL, ANON, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${bearer}` } } });
  const { data: auth, error: authError } = await userClient.auth.getUser(bearer);
  if (authError || !auth.user) return json({ error: "login_required" }, 401, origin);
  const [{ data: member }, { data: role }] = await Promise.all([
    userClient.rpc("crm_is_member"),
    userClient.rpc("crm_user_role"),
  ]);
  if (member !== true || !["manager", "admin"].includes(String(role))) return json({ error: "forbidden" }, 403, origin);
  const recordId = String(body?.lead_record_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(recordId)) return json({ error: "bad_lead" }, 400, origin);
  const { data: lead } = await admin.from("custom_records").select("id,tab_id").eq("id", recordId).eq("tab_id", LEADS_TAB_ID).maybeSingle();
  if (!lead) return json({ error: "lead_not_found" }, 404, origin);
  if (!BOT_TOKEN) return json({ error: "bot_not_configured" }, 503, origin);
  const botInfo = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`, { method: "POST" }).then((r) => r.json()).catch(() => null);
  const botUsername = String(botInfo?.result?.username ?? "");
  if (!botInfo?.ok || !/^[A-Za-z0-9_]{5,32}$/.test(botUsername)) return json({ error: "bot_unavailable" }, 503, origin);
  const token = randomToken();
  const expires = new Date(Date.now() + 7 * 86400000).toISOString();
  const { error } = await admin.from("yba_parent_invites").insert({
    token_hash: await sha256(token), lead_record_id: lead.id, created_by: auth.user.id, expires_at: expires,
  });
  if (error) return json({ error: "invite_create_failed" }, 503, origin);
  const link = `https://t.me/${botUsername}?start=ybp_${token}`;
  return json({ link, expires_at: expires }, 200, origin);
}

async function appAction(body: any, origin: string) {
  const token = String(body?.session_token ?? "");
  if (!/^[a-f0-9]{48}$/i.test(token)) return json({ error: "invalid_session" }, 401, origin);
  const hash = await sha256(token);
  const { data: session, error } = await admin.from("yba_parent_sessions").select("*").eq("token_hash", hash).maybeSingle();
  if (error || !session) return json({ error: "invalid_session" }, 401, origin);
  if (body.action === "load") {
    return json({ consented: !!session.parent_consent_at, age_group: session.age_group, child_name: session.child_name,
      interests: session.interests, blog_styles: session.blog_styles, progress: session.progress }, 200, origin);
  }
  if (body.action === "consent") {
    const { error: saved } = await admin.from("yba_parent_sessions").update({ parent_consent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", session.id);
    return saved ? json({ error: "consent_save_failed" }, 503, origin) : json({ ok: true }, 200, origin);
  }
  if (body.action !== "save_room" || !session.parent_consent_at) return json({ error: "parent_consent_required" }, 403, origin);
  const profile = body.profile ?? {};
  const name = String(profile.child_name ?? "").trim().slice(0, 24);
  const age = String(profile.age_group ?? "");
  const interests = cleanList(profile.interests, ["Hayvonlar","Sport","Rasm va ijod","O‘yinlar","Tabiat va sayohat","Kitoblar va ilm","Pazandachilik"]);
  const styles = cleanList(profile.blog_styles, ["Foydali maslahatlar","Kulgili videolar","Vlog va sayohat","Sinov va o‘yinlar","Hikoya va ertaklar","Ijodiy videolar"]);
  const progress = Number(body.progress);
  if (!name || !["7-10","11-14"].includes(age) || !interests.length || !styles.length || !Number.isInteger(progress) || progress < 1 || progress > 4) {
    return json({ error: "invalid_profile_or_progress" }, 400, origin);
  }
  const patch = { child_name: name, age_group: age, interests, blog_styles: styles, progress, updated_at: new Date().toISOString() };
  const { data: tab } = await admin.from("custom_tabs").select("id,created_by").eq("name", RESULTS_TAB_NAME).maybeSingle();
  if (!tab) return json({ error: "results_tab_missing" }, 503, origin);
  const values = {
    "Лид CRM": session.lead_record_id,
    "Родитель Telegram": String(session.telegram_chat_id),
    "Имя ребёнка": name,
    "Возрастная группа": age === "7-10" ? "7–10 лет" : "11–14 лет",
    "Интересы": interests.join(", "),
    "Любимый стиль блога": styles.join(", "),
    "Комнаты пройдены": `${progress}/4`,
    "Согласие родителя": session.parent_consent_at,
    "Последнее обновление": new Date().toISOString().slice(0, 10),
  };
  const externalId = `yba:${session.id}`;
  const { data: existing } = await admin.from("custom_records").select("id").eq("tab_id", tab.id).eq("external_id", externalId).maybeSingle();
  const write = existing
    ? await admin.from("custom_records").update({ values, updated_at: new Date().toISOString() }).eq("id", existing.id)
    : await admin.from("custom_records").insert({ tab_id: tab.id, values, external_id: externalId, created_by: tab.created_by });
  if (write.error) return json({ error: "crm_write_failed" }, 503, origin);
  const saved = await admin.from("yba_parent_sessions").update(patch).eq("id", session.id);
  if (saved.error) return json({ error: "progress_save_failed" }, 503, origin);
  return json({ ok: true, progress }, 200, origin);
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  if (req.method === "OPTIONS") return new Response("ok", { headers: headersFor(origin) });
  if (req.method !== "POST") return json({ error: "POST_only" }, 405, origin);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400, origin); }
  if (body?.action === "create_invite") return await makeInvite(body, req, origin);
  if (["load","consent","save_room"].includes(String(body?.action))) return await appAction(body, origin);
  return json({ error: "unknown_action" }, 400, origin);
});


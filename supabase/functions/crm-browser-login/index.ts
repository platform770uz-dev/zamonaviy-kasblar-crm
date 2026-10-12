import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const ORIGIN = "https://platform770uz-dev.github.io";
const headers = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
  "Vary": "Origin",
};
const reply = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });

function hex(bytes: Uint8Array) {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string) {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}

async function createOrLoadUser(chatId: number, name: string) {
  const read = () => admin.from("tg_chatlar")
    .select("auth_user_id,ism,rol,tasdiqlangan,bloklangan")
    .eq("chat_id", chatId).maybeSingle();
  let result = await read();
  if (result.error || !result.data) throw new Error("approval_required");
  const person = result.data;
  if (!person.tasdiqlangan || person.bloklangan || !["admin", "owner"].includes(person.rol)) {
    throw new Error("approval_required");
  }
  let userId = person.auth_user_id;
  if (!userId) {
    const email = `tg${chatId}-${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}@crm.invalid`;
    const created = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      app_metadata: { crm_telegram_chat_id: String(chatId) },
      user_metadata: { full_name: (person.ism || name || "Администратор").slice(0, 120) },
    });
    if (created.error || !created.data?.user?.id) throw new Error("login_unavailable");
    const newId = created.data.user.id;
    const bound = await admin.from("tg_chatlar")
      .update({ auth_user_id: newId })
      .eq("chat_id", chatId).eq("tasdiqlangan", true).eq("bloklangan", false)
      .in("rol", ["admin", "owner"]).is("auth_user_id", null)
      .select("auth_user_id").maybeSingle();
    if (bound.error) {
      await admin.auth.admin.deleteUser(newId);
      throw new Error("login_unavailable");
    }
    if (bound.data?.auth_user_id) userId = bound.data.auth_user_id;
    else {
      await admin.auth.admin.deleteUser(newId);
      result = await read();
      if (result.error || !result.data?.tasdiqlangan || result.data.bloklangan || !["admin", "owner"].includes(result.data.rol)) {
        throw new Error("approval_required");
      }
      userId = result.data.auth_user_id;
    }
  }
  if (!userId) throw new Error("login_unavailable");
  const account = await admin.auth.admin.getUserById(userId);
  const user = account.data?.user;
  if (account.error || !user?.email || user.app_metadata?.crm_telegram_chat_id !== String(chatId)) {
    throw new Error("login_unavailable");
  }
  return { userId, email: user.email };
}

Deno.serve(async (req: Request) => {
  if (req.headers.get("origin") && req.headers.get("origin") !== ORIGIN) return reply({ error: "origin_denied" }, 403);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405);

  let token: unknown;
  try {
    const raw = await req.text();
    if (raw.length > 1024) return reply({ error: "invalid_request" }, 400);
    token = JSON.parse(raw)?.token;
  } catch { return reply({ error: "invalid_request" }, 400); }
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{40,64}$/.test(token)) return reply({ error: "link_invalid" }, 401);

  try {
    const tokenHash = await sha256(token);
    const now = new Date().toISOString();
    const found = await admin.from("crm_browser_login_tokens")
      .select("chat_id").eq("token_hash", tokenHash)
      .is("consumed_at", null).gt("expires_at", now).maybeSingle();
    if (found.error || !found.data) return reply({ error: "link_invalid" }, 401);

    const chatId = Number(found.data.chat_id);
    const consumed = await admin.from("crm_browser_login_tokens")
      .update({ consumed_at: now }).eq("token_hash", tokenHash)
      .eq("chat_id", chatId).is("consumed_at", null).gt("expires_at", now)
      .select("token_hash").maybeSingle();
    if (consumed.error || !consumed.data) return reply({ error: "link_invalid" }, 401);

    const person = await admin.from("tg_chatlar").select("ism,tasdiqlangan,bloklangan,rol")
      .eq("chat_id", chatId).maybeSingle();
    if (person.error || !person.data?.tasdiqlangan || person.data.bloklangan || !["admin", "owner"].includes(person.data.rol)) {
      return reply({ error: "approval_required" }, 403);
    }
    const account = await createOrLoadUser(chatId, person.data.ism || "");
    const link = await admin.auth.admin.generateLink({ type: "magiclink", email: account.email });
    if (link.error || !link.data?.properties?.hashed_token || link.data.user?.id !== account.userId) {
      return reply({ error: "login_unavailable" }, 503);
    }
    const stillApproved = await admin.from("tg_chatlar").select("auth_user_id,tasdiqlangan,bloklangan,rol")
      .eq("chat_id", chatId).maybeSingle();
    if (stillApproved.error || !stillApproved.data?.tasdiqlangan || stillApproved.data.bloklangan ||
      !["admin", "owner"].includes(stillApproved.data.rol) || stillApproved.data.auth_user_id !== account.userId) {
      return reply({ error: "approval_required" }, 403);
    }
    return reply({ token_hash: link.data.properties.hashed_token });
  } catch (error) {
    const message = error instanceof Error ? error.message : "login_unavailable";
    if (message === "approval_required") return reply({ error: message }, 403);
    return reply({ error: "login_unavailable" }, 503);
  }
});

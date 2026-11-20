import { createClient } from "npm:@supabase/supabase-js@2";

const origin = "https://platform770uz-dev.github.io";
const cors = {
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

function equalSecret(a: string, b: string): boolean {
  let mismatch = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) mismatch |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return mismatch === 0;
}

async function hashIp(ip: string): Promise<string> {
  const bytes = new TextEncoder().encode(ip);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST" || req.headers.get("origin") !== origin) return json({ error: "Soʻrov qabul qilinmadi" }, 403);

  const expectedPin = Deno.env.get("KV_ADMIN_PIN") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!/^\d{4}$/.test(expectedPin) || !supabaseUrl || !serviceKey) return json({ error: "Xizmat sozlanmagan" }, 503);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Soʻrov notoʻgʻri" }, 400); }
  const pin = typeof body.pin === "string" ? body.pin : "";
  const action = typeof body.action === "string" ? body.action : "";
  if (!/^\d{4}$/.test(pin)) return json({ error: "PIN notoʻgʻri" }, 401);

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const ip = (req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
  const { data: allowed, error: rateError } = await supabase.rpc("kv_pin_attempt", {
    p_ip_hash: await hashIp(ip),
    p_success: equalSecret(pin, expectedPin),
  });
  if (rateError) return json({ error: "Xizmat vaqtincha ishlamayapti" }, 503);
  if (allowed === false) return json({ error: "Urinishlar vaqtincha bloklandi" }, 429);
  if (!equalSecret(pin, expectedPin)) return json({ error: "PIN notoʻgʻri" }, 401);

  if (action === "check") return json({ ok: true });
  if (action === "list") {
    const { data, error } = await supabase.from("kv_receipts").select("*").order("paid_at", { ascending: false }).limit(1000);
    return error ? json({ error: "Roʻyxat yuklanmadi" }, 500) : json({ data });
  }
  if (action === "duplicates") {
    const payer = typeof body.payer === "string" ? body.payer : "";
    const amount = Number(body.amount);
    const purpose = typeof body.purpose === "string" ? body.purpose : "";
    const since = typeof body.since === "string" ? body.since : "";
    if (!payer || !Number.isSafeInteger(amount) || !since) return json({ error: "Soʻrov notoʻgʻri" }, 400);
    const { data, error } = await supabase.from("kv_receipts").select("id,number").eq("payer_name", payer).eq("amount", amount).eq("purpose", purpose).gte("created_at", since).limit(1);
    return error ? json({ error: "Tekshirib boʻlmadi" }, 500) : json({ data });
  }
  if (action === "create") {
    const receipt = body.receipt as Record<string, unknown> | undefined;
    if (!receipt) return json({ error: "Maʼlumotlar topilmadi" }, 400);
    const { data, error } = await supabase.rpc("kv_create_receipt", receipt);
    return error ? json({ error: "Kvitansiya yaratilmadi" }, 400) : json({ data });
  }
  if (action === "cancel") {
    const receiptId = typeof body.receipt_id === "string" ? body.receipt_id : "";
    const reason = typeof body.reason === "string" ? body.reason : "";
    const { data, error } = await supabase.rpc("kv_cancel_receipt", { p_receipt_id: receiptId, p_reason: reason });
    return error ? json({ error: "Kvitansiya bekor qilinmadi" }, 400) : json({ data });
  }
  return json({ error: "Amal nomaʼlum" }, 400);
});


const allowedOrigins = new Set([
  "https://platform770uz-dev.github.io",
  "https://uzivivmrixstxjvzkksz.supabase.co",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);

const headersFor = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && allowedOrigins.has(origin) ? origin : "https://platform770uz-dev.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin",
});

const response = (body: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
const digest = async (token: string) => hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))));

async function notifyManager(url: string, serviceKey: string, orderId: string) {
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  const secretResponse = await fetch(`${url}/rest/v1/crm_maxfiy?select=qiymat&kalit=eq.tg_ichki`, { headers });
  if (!secretResponse.ok) return false;
  const secretRows = await secretResponse.json();
  const secret = Array.isArray(secretRows) ? secretRows[0]?.qiymat : null;
  if (typeof secret !== "string" || secret.length < 16) return false;
  const response = await fetch(`${url}/functions/v1/tg-bot`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json", "x-crm-secret": secret },
    body: JSON.stringify({ turi: "contract_signed", order_id: orderId }),
  });
  if (!response.ok) return false;
  const result = await response.json();
  return result?.ok === true && Number(result?.sent) > 0;
}

const ownerFields = "id,order_number,owner_name,business_name,phone,stir,package_name,details,total_amount,paid_amount,payment_schedule,delivery_deadline,status,signature_data,accepted_at,created_at,telegram_notified_at";

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const cors = headersFor(origin);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405, cors);
  if (origin && !allowedOrigins.has(origin)) return response({ error: "Origin not allowed" }, 403, cors);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return response({ error: "Server configuration is incomplete" }, 500, cors);

  let body: { action?: unknown; token?: unknown; signature?: unknown };
  try { body = await req.json(); } catch { return response({ error: "Invalid JSON" }, 400, cors); }
  if (typeof body.token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(body.token)) {
    return response({ error: "Invalid or expired link" }, 404, cors);
  }

  const apiHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };
  const tokenHash = await digest(body.token);
  const findUrl = `${url}/rest/v1/orders?select=${ownerFields}&owner_token_hash=eq.${tokenHash}&limit=1`;
  const found = await fetch(findUrl, { headers: apiHeaders });
  if (!found.ok) return response({ error: "Could not load order" }, 502, cors);
  const rows = await found.json();
  const order = Array.isArray(rows) ? rows[0] : null;
  if (!order) return response({ error: "Invalid or expired link" }, 404, cors);

  if (body.action === "load") {
    if (order.status === "signed" && !order.telegram_notified_at && await notifyManager(url, serviceKey, order.id)) {
      await fetch(`${url}/rest/v1/orders?id=eq.${encodeURIComponent(order.id)}&telegram_notified_at=is.null`, {
        method: "PATCH", headers: { ...apiHeaders, Prefer: "return=minimal" }, body: JSON.stringify({ telegram_notified_at: new Date().toISOString() }),
      });
      order.telegram_notified_at = new Date().toISOString();
    }
    return response({ order }, 200, cors);
  }
  if (body.action !== "sign") return response({ error: "Unknown action" }, 400, cors);
  if (order.status === "signed") {
    const sent = order.telegram_notified_at ? true : await notifyManager(url, serviceKey, order.id);
    if (sent && !order.telegram_notified_at) await fetch(`${url}/rest/v1/orders?id=eq.${encodeURIComponent(order.id)}&telegram_notified_at=is.null`, {
      method: "PATCH", headers: { ...apiHeaders, Prefer: "return=minimal" }, body: JSON.stringify({ telegram_notified_at: new Date().toISOString() }),
    });
    return response({ signed: true, notification_sent: sent, order_number: order.order_number }, 200, cors);
  }
  if (typeof body.signature !== "string" || body.signature.length > 500_000 || !/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(body.signature)) {
    return response({ error: "Invalid signature image" }, 400, cors);
  }

  const acceptedAt = new Date().toISOString();
  const updateUrl = `${url}/rest/v1/orders?id=eq.${encodeURIComponent(order.id)}&status=eq.awaiting_signature`;
  const saved = await fetch(updateUrl, {
    method: "PATCH",
    headers: { ...apiHeaders, Prefer: "return=representation" },
    body: JSON.stringify({ status: "signed", signature_data: body.signature, accepted_at: acceptedAt }),
  });
  if (!saved.ok) return response({ error: "Could not save signature" }, 502, cors);
  const updated = await saved.json();
  if (Array.isArray(updated) && updated.length === 1) {
    const sent = await notifyManager(url, serviceKey, order.id);
    if (sent) await fetch(`${url}/rest/v1/orders?id=eq.${encodeURIComponent(order.id)}&telegram_notified_at=is.null`, {
      method: "PATCH", headers: { ...apiHeaders, Prefer: "return=minimal" }, body: JSON.stringify({ telegram_notified_at: new Date().toISOString() }),
    });
    return response({ signed: true, notification_sent: sent, accepted_at: acceptedAt, order_number: order.order_number }, 200, cors);
  }
  return response({ error: "This order has already been signed" }, 409, cors);
});
// Supabase function yba-public-parent-bot (project uzivivmrixstxjvzkksz): webhook of @zamonaviykasbuz_bot
// ("Zamonaviy Kasblar Kids"). On /start it offers the Tez aytish trainer Mini App. Until 2026-11-11 it offered the
// parent intro test instead (see index.v9-backup.ts).
// Secrets: YBA_PUBLIC_BOT_TOKEN, YBA_PUBLIC_WEBHOOK_SECRET, SUPABASE_URL. Optional: YBA_KIDS_TRAINER_URL.
const BOT_TOKEN = Deno.env.get("YBA_PUBLIC_BOT_TOKEN") ?? "";
const TRAINER_URL = Deno.env.get("YBA_KIDS_TRAINER_URL") ?? "https://platform770uz-dev.github.io/yba-public-miniapp/tez-aytish/";
const WEBHOOK_SECRET = Deno.env.get("YBA_PUBLIC_WEBHOOK_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!BOT_TOKEN || !WEBHOOK_SECRET) return json({ error: "bot_not_configured" }, 503);

  // One-time operational setup, protected by the secret known only to the owner.
  // The destination is fixed to this function so this endpoint cannot redirect the bot.
  if (req.headers.get("x-yba-setup-secret") === WEBHOOK_SECRET) {
    let setup: any;
    try {
      setup = await req.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    if (setup?.action !== "setup_webhook") return json({ error: "unsupported_setup_action" }, 400);
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(SUPABASE_URL)) {
      return json({ error: "supabase_url_invalid" }, 503);
    }

    const webhookUrl = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/yba-public-parent-bot`;
    const setupResponse = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: WEBHOOK_SECRET,
        allowed_updates: ["message"],
      }),
    });
    const setupResult = await setupResponse.json().catch(() => ({}));
    if (!setupResponse.ok || setupResult?.ok !== true) {
      return json({ error: "telegram_webhook_setup_failed", description: setupResult?.description ?? "Telegram API request failed" }, 502);
    }
    return json({ ok: true, webhook_configured: true });
  }

  if (req.headers.get("x-telegram-bot-api-secret-token") !== WEBHOOK_SECRET) {
    return json({ error: "unauthorized" }, 401);
  }

  let update: any;
  try {
    update = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const message = update?.message;
  if (typeof message?.text !== "string" || !/^\/start(?:@\w+)?(?:\s|$)/.test(message.text)) {
    return json({ ok: true });
  }

  const chatId = message?.chat?.id;
  if (typeof chatId !== "number" && typeof chatId !== "string") return json({ ok: true });

  let appUrl: URL;
  try {
    appUrl = new URL(TRAINER_URL);
    if (appUrl.protocol !== "https:") return json({ error: "trainer_url_must_use_https" }, 503);
  } catch {
    return json({ error: "trainer_url_invalid" }, 503);
  }

  const telegramResponse = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: "Assalomu alaykum! 🎙 «Tez aytish» trenajyorida tez aytishlarni sekin, oʻrta va tez aytib, nutqingni charxla. Boshlash uchun pastdagi tugmani bos.",
      reply_markup: {
        inline_keyboard: [[{ text: "🎙 Tez aytish trenajyori", web_app: { url: appUrl.toString() } }]],
      },
    }),
  });

  if (!telegramResponse.ok) return json({ error: "telegram_delivery_failed" }, 502);
  return json({ ok: true });
});

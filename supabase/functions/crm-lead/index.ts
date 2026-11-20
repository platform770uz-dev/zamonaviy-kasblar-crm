import { createClient } from "npm:@supabase/supabase-js@2";

// 1924 CRM: tashqi lidlarni qabul qiladi (Make.com / Meta lid-formalar).
// Himoya: x-crm-secret sarlavhasi (yoki ?key=) crm_maxfiy.lead_webhook bilan mos boʻlishi shart.
// Forma nomi body.form_name yoki ?form_name= orqali keladi. Har bir soʻrov crm_webhook_log ga yoziladi (7 kun saqlanadi).

const HEAD = { "Content-Type": "application/json; charset=utf-8" };

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// Kalitlarni solishtirish uchun: kichik harf, "_" -> boʻsh joy
const norm = (s: string) => s.toLowerCase().replace(/[_\s]+/g, " ").trim();
const NAME_KEYS = ["full name", "name", "ism", "to'liq ism", "toʻliq ism", "ism familiya", "полное имя", "имя", "фио"];
const FIRST_KEYS = ["first name", "имя"];
const LAST_KEYS = ["last name", "фамилия"];
const PHONE_KEYS = ["phone number", "phone", "telefon", "telefon raqami", "номер телефона", "телефон"];
const SKIP = new Set([...NAME_KEYS, ...FIRST_KEYS, ...LAST_KEYS, ...PHONE_KEYS, "email", "эл. адрес", "электронная почта"].map(norm));

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: HEAD });
  const url = new URL(req.url);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  let raw = "";
  let authed = false;
  const reply = async (o: Record<string, unknown>, status = 200) => {
    if (authed) {
      try {
        let sorov: unknown = null;
        try { sorov = JSON.parse(raw); } catch { sorov = { raw: raw.slice(0, 4000) }; }
        const q: Record<string, string> = {};
        url.searchParams.forEach((v, k) => { if (k !== "key") q[k] = v.slice(0, 200); });
        await sb.from("crm_webhook_log").insert({ status, natija: JSON.stringify(o).slice(0, 500), sorov: { query: q, body: sorov } });
        await sb.from("crm_webhook_log").delete().lt("created_at", new Date(Date.now() - 7 * 86400000).toISOString());
      } catch (_) { /* log xatosi asosiy ishni toʻxtatmaydi */ }
    }
    return new Response(JSON.stringify(o), { status, headers: HEAD });
  };

  const given = req.headers.get("x-crm-secret") || url.searchParams.get("key") || "";
  const { data: sec } = await sb.from("crm_maxfiy").select("qiymat").eq("kalit", "lead_webhook").maybeSingle();
  if (!sec || !given || !safeEqual(given, sec.qiymat)) return reply({ error: "unauthorized" }, 401);
  authed = true;

  raw = await req.text();
  let body: Record<string, any>;
  try { body = JSON.parse(raw); } catch { return reply({ error: "bad json" }, 400); }
  if (!body || typeof body !== "object") return reply({ error: "bad body" }, 400);

  const fields: Record<string, string> = {};
  const add = (k: unknown, v: unknown) => {
    if (k == null || v == null) return;
    let val = Array.isArray(v) ? v.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(", ")
      : typeof v === "object" ? JSON.stringify(v) : String(v);
    val = val.trim();
    if (val) fields[String(k).trim().slice(0, 80)] = val.slice(0, 500);
  };
  const takeBag = (bag: unknown) => {
    if (!bag) return;
    if (typeof bag === "string") { try { takeBag(JSON.parse(bag)); } catch { /* matn */ } return; }
    if (Array.isArray(bag)) {
      for (const f of bag) if (f && typeof f === "object") {
        const o = f as Record<string, unknown>;
        if ("name" in o) add(o.name, o.values ?? o.value);
        else takeBag(o);
      }
      return;
    }
    if (typeof bag === "object") {
      const o = bag as Record<string, unknown>;
      if (Array.isArray(o.field_data)) { takeBag(o.field_data); return; }
      if (o.data && typeof o.data === "object") { takeBag(o.data); return; }
      for (const [k, v] of Object.entries(o)) add(k, v);
    }
  };
  takeBag(body.field_data);
  takeBag(body.fields);
  takeBag(body.javoblar);
  for (const k of ["full_name", "name", "first_name", "last_name", "phone_number", "phone", "ism", "telefon"]) if (body[k] != null) add(k, body[k]);

  const pick = (keys: string[]) => {
    for (const want of keys) {
      const w = norm(want);
      const hit = Object.keys(fields).find((x) => norm(x) === w);
      if (hit) return fields[hit];
    }
    return "";
  };
  let ism = pick(NAME_KEYS);
  if (!ism) ism = [pick(FIRST_KEYS), pick(LAST_KEYS)].filter(Boolean).join(" ");
  const tel = pick(PHONE_KEYS);
  if (!ism && !tel) return reply({ error: "ism yoki telefon yoʻq", keys: Object.keys(fields).slice(0, 20) }, 422);

  const formName = String(body.form_name ?? body.form ?? url.searchParams.get("form_name") ?? "").slice(0, 120);
  const adName = String(body.ad_name ?? url.searchParams.get("ad_name") ?? "").slice(0, 120);
  const campName = String(body.campaign_name ?? url.searchParams.get("campaign_name") ?? "").slice(0, 120);
  const leadId = String(body.leadgen_id ?? body.lead_id ?? body.id ?? "").slice(0, 64) || null;

  if (leadId) {
    const { data: ex } = await sb.from("crm_bitimlar").select("id").eq("tashqi_id", leadId).maybeSingle();
    if (ex) return reply({ ok: true, duplicate: true, bitim_id: ex.id });
  }

  const { data: rules } = await sb.from("crm_forma_qoidalar").select("kalit_soz, voronka_id").order("id");
  const findIn = (text: string) => (rules || []).find((r: any) => text.includes(String(r.kalit_soz).toLowerCase()))?.voronka_id ?? null;
  let vid: number | null = findIn(`${formName} ${campName} ${adName}`.toLowerCase());
  if (!vid) vid = findIn(Object.keys(fields).join(" ").toLowerCase());
  if (!vid) {
    const { data: v0 } = await sb.from("crm_voronkalar").select("id").order("tartib").order("id").limit(1).maybeSingle();
    vid = v0?.id ?? null;
  }
  if (!vid) return reply({ error: "voronka yoʻq" }, 500);
  const { data: st } = await sb.from("crm_bosqichlar").select("id").eq("voronka_id", vid).eq("turi", "oddiy").order("tartib").order("id").limit(1).maybeSingle();
  if (!st) return reply({ error: "bosqich yoʻq" }, 500);

  const key = tel.replace(/\D/g, "").slice(-9);
  let kid: number | null = null;
  let existed = false;
  if (key) {
    const { data: k } = await sb.from("crm_kontaktlar").select("id").eq("tel_key", key).maybeSingle();
    if (k) { kid = k.id; existed = true; }
  }
  if (!kid) {
    const ins = await sb.from("crm_kontaktlar").insert({ ism: (ism || tel).slice(0, 80), telefon: tel ? tel.slice(0, 30) : null }).select("id").single();
    if (ins.error) {
      if (key) {
        const { data: k2 } = await sb.from("crm_kontaktlar").select("id").eq("tel_key", key).maybeSingle();
        if (k2) { kid = k2.id; existed = true; }
      }
      if (!kid) return reply({ error: ins.error.message }, 500);
    } else kid = ins.data.id;
  }

  const d = await sb.from("crm_bitimlar").insert({
    voronka_id: vid, bosqich_id: st.id, nom: (ism || tel).slice(0, 120), kontakt_id: kid,
    manba: "Instagram forma", teglar: ["meta"], tashqi_id: leadId,
  }).select("id").single();
  if (d.error) {
    if ((d.error as any).code === "23505") return reply({ ok: true, duplicate: true });
    return reply({ error: d.error.message }, 500);
  }

  const lines = Object.entries(fields).filter(([k]) => !SKIP.has(norm(k))).map(([k, v]) => `• ${k.replace(/_/g, " ")}: ${v}`);
  let head = `Meta lid-forma: ${formName || "nomaʼlum"}`;
  if (adName) head += ` · eʼlon: ${adName}`;
  if (existed) head += ` · mavjud kontakt`;
  const matn = (head + (lines.length ? "\n" + lines.join("\n") : "")).slice(0, 2000);
  await sb.from("crm_tarix").insert({ bitim_id: d.data.id, turi: "tizim", matn });

  return reply({ ok: true, bitim_id: d.data.id, voronka_id: vid });
});

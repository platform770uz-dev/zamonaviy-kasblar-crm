// Supabase Edge Function: tez-aytish-api (v20)
// Tez aytish trainer for the YBA Mini App. All routes are POST:
//   /mic-check  device and microphone diagnostics (audio stored only for active admins)
//   /session    who is asking (admin or not), which speech services are ready, the tongue-twister list with the
//               narrator sample of each one that has it (a WAV in the public bucket tez-aytish-tts) and the time a
//               fast reading may take (targetMs)
//   /tts        narrator audio (Azure uz-UZ-MadinaNeural, only when Azure keys exist), cached in bucket tez-aytish-tts
//   /check      speech recognition of one attempt (16 kHz mono WAV) and a word-by-word verdict of the one reading found
//               in it (see judge), with the stars of a 'tez' card, the time of that reading (readMs) and the target
//               (targetMs). A teacher running a lesson
//               (teacher mode, see tez-aytish-teacher) names the student (meta.studentId, meta.lessonKey): the student
//               must be in one of the teacher's groups (the owner: any group) with the parents' consent ticked; the
//               result is stored with the student, the group, the lesson date and its stars, and the voice is not kept.
//               meta.home marks the homework said at home from the family bot @kidscast_bot: whoever is linked to the
//               student there may send it, the tongue twister must belong to the module of that lesson's week, the
//               group's next lesson must not have opened yet, and each tongue twister is checked once (kind 'home';
//               what counts as homework and the mass it gives are decided by tez-aytish-profile).
//               A check from the parents' bot of Super Intellekt Kids (@SuperIntellektBot, Mini App data signed with
//               SIK_LITE_BOT_TOKEN) is the child's one daily tongue twister (page ?lite=1): sik-lite (project
//               zamonaviy-kasblar) says whether the child's Lite is open, the tongue twister must be the day's one
//               (liteTwister), and the stars of the 'tez' check go back to sik-lite for the points and the bear (?dz=1,
//               header x-sik-dz = sha256('sik-dz:' + token)); the voice is not kept.
//   /selftest   ?limit=0: provider status only. Multipart (expected, audio): STT of an uploaded 16 kHz WAV.
//               Otherwise a TTS->STT round trip of the test cards (VoiceLab or Azure voice, ?limit=N&offset=M,
//               default 3 cards). ?preflight=ms,ms asks VoiceLab what recognising audio of those lengths would cost.
//               ?notify=admins sends each active admin a bot message with a Mini App button for the trainer.
//               ?bot=me names the bot the trainer runs in; ?menu=get shows its menu button, ?menu=set points that
//               button at the trainer (kids' bot only). ?voice=voices lists the VoiceLab voices; ?voice=list shows
//               which tongue twisters have a narrator sample; ?voice=build&ids=1,2 makes the missing ones (1 credit
//               per character); &narrator=NAME does it for another voice; ?voice=upload&narrator=ustoz&id=N stores
//               a studio recording (the body: a 16-bit PCM mono WAV) for a narrator from STUDIO_NARRATORS;
//               ?voice=use&narrator=NAME makes that voice the one the app plays (kept in the table
//               tez_aytish_settings; a studio narrator needs a recording of every tongue twister first). ?unit=1
//               judges canned transcripts without any speech service (a free check that a deploy did not damage the
//               judge). ?rejudge=FROM,TO re-judges the stored lesson checks of those lesson dates with today's
//               rules and reports the difference; &apply=1 also saves it (the old verdicts go to the table
//               tez_aytish_rejudge_log). Protected by a token whose sha256 is in SELFTEST_SHA256.
// The trainer runs in the kids' bot @zamonaviykasbuz_bot once TELEGRAM_KIDS_BOT_TOKEN is set (then only that bot's
// Mini App data is accepted); until then it runs in the parents' bot (TELEGRAM_BOT_TOKEN).
// Speech recognition, the first one configured wins:
//   VoiceLab / Aisha (AISHA_API_KEY holds a VoiceLab vlk_ key, api.voicelab.uz), Google Cloud Speech-to-Text v2
//   (GOOGLE_SA_JSON, model chirp_3, location eu), Azure Speech (AZURE_SPEECH_KEY + AZURE_SPEECH_REGION).
// Each VoiceLab job is deleted together with its audio right after the result is read. Children (non-admins) still
// get no speech check through VoiceLab until TEZ_AYTISH_CHILDREN_OK=1 is set, once the consent text names it.
// Secrets: TELEGRAM_BOT_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, plus one speech provider. Optional:
// GOOGLE_STT_MODEL, GOOGLE_STT_LOCATION, TEZ_AYTISH_NARRATOR (VoiceLab voice name, "rustam" unless set),
// VOICELAB_VOICE_ID, TEZ_AYTISH_CHILDREN_OK, TEZ_AYTISH_ORIGINS (comma-separated), TEZ_AYTISH_SELFTEST_SHA256,
// SIK_LITE_BOT_TOKEN (the same token as in project zamonaviy-kasblar).
import { createClient } from 'npm:@supabase/supabase-js@2.95.0';

const enc = new TextEncoder();
const API = Deno.env.get('SUPABASE_URL') ?? '';
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
const KIDS_BOT_TOKEN = (Deno.env.get('TELEGRAM_KIDS_BOT_TOKEN') ?? '').trim();
const APP_BOT_TOKEN = KIDS_BOT_TOKEN || BOT_TOKEN;
// The homework is opened from the family bot, so its Mini App data is accepted as well (for /session and a home check).
const FAMILY_BOT_TOKEN = (Deno.env.get('KIDSCAST_BOT_TOKEN') ?? '').trim();
// Super Intellekt Kids: its parents' bot opens the trainer for the child's one daily tongue twister (see the header).
const LITE_BOT_TOKEN = (Deno.env.get('SIK_LITE_BOT_TOKEN') ?? '').trim();
const SIK_DZ_URL = 'https://uzivivmrixstxjvzkksz.supabase.co/functions/v1/sik-lite?dz=1';
const LITE_DAILY_CHECKS = 30;
const TZ_MS = 5 * 3600_000; // Asia/Tashkent is UTC+5 all year
const AZ_KEY = Deno.env.get('AZURE_SPEECH_KEY') ?? '';
const AZ_REGION = (Deno.env.get('AZURE_SPEECH_REGION') ?? '').trim().toLowerCase().replace(/\s+/g, '');
const GOOGLE_SA_JSON = (Deno.env.get('GOOGLE_SA_JSON') ?? '').trim();
const G_MODEL = (Deno.env.get('GOOGLE_STT_MODEL') ?? 'chirp_3').trim();
const G_LOCATION = (Deno.env.get('GOOGLE_STT_LOCATION') ?? 'eu').trim();
const AISHA_KEY = (Deno.env.get('AISHA_API_KEY') ?? '').trim();
const VL_API = 'https://api.voicelab.uz';
const STT_PROVIDER: '' | 'aisha' | 'google' | 'azure' = AISHA_KEY ? 'aisha' : GOOGLE_SA_JSON ? 'google' : AZ_KEY && AZ_REGION ? 'azure' : '';
const PROVIDER_NAME: Record<string, string> = { aisha: 'VoiceLab (Aisha)', google: 'Google Cloud', azure: 'Microsoft Azure' };
// Children's voices go to VoiceLab only after a separate go-ahead, once the consent text names the service.
const CHILDREN_OK = STT_PROVIDER !== 'aisha' || Deno.env.get('TEZ_AYTISH_CHILDREN_OK') === '1';
const TTS_READY = !!(AZ_KEY && AZ_REGION);
// sha256 of the /selftest token: the TEZ_AYTISH_SELFTEST_SHA256 secret, plus those the deploy wrapper hands over in
// globalThis.__TEZ_SELFTEST_SHA256 (the public repository keeps no hashes).
const SELFTEST_SHA256 = [...(Array.isArray((globalThis as any).__TEZ_SELFTEST_SHA256) ? (globalThis as any).__TEZ_SELFTEST_SHA256 : []), Deno.env.get('TEZ_AYTISH_SELFTEST_SHA256') ?? '']
  .map((x: unknown) => String(x).trim().toLowerCase()).filter((x: string) => /^[0-9a-f]{64}$/.test(x));
const ORIGINS = new Set(
  (Deno.env.get('TEZ_AYTISH_ORIGINS') ?? 'https://platform770uz-dev.github.io')
    .split(',').map((s) => s.trim()).filter(Boolean),
);
const TRAINER_URL = 'https://platform770uz-dev.github.io/yba-public-miniapp/tez-aytish/';
const AUDIO_BUCKET = 'tez-aytish-audio';
const TTS_BUCKET = 'tez-aytish-tts';
// The default narrator of the samples (a VoiceLab voice picked by name) until /selftest?voice=use names another.
// Each voice keeps its files in its own folder.
const NARRATOR = (Deno.env.get('TEZ_AYTISH_NARRATOR') ?? '').trim().toLowerCase().replace(/[^a-z]/g, '') || 'rustam';
// Narrators recorded in a studio rather than made by VoiceLab: their files come in through /selftest?voice=upload.
const STUDIO_NARRATORS = new Set(['ustoz']);
const VOICE = 'uz-UZ-MadinaNeural';
const MAX_BODY = 1_600_000;
const MAX_AUDIO = 1_500_000;
const MAX_META = 12_000;
const MAX_WAV_SECONDS = 20;
const AUDIO_EXT: Record<string, string> = {
  'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/wav': 'wav',
};
const OUTCOMES = new Set(['opened', 'recorded', 'error']);
const STAGES = ['sekin', 'orta', 'tez'] as const;
type Stage = typeof STAGES[number];
const RATE: Record<Stage, string> = { sekin: '-30%', orta: '0%', tez: '+20%' };

// Tongue twisters: 1-4-grade reading books and the Uzbek Wikipedia article "Tez aytish" (see the teacher doc).
// 16-20 are the doc's reserve Z4, Z2, Z3, Z7, Z5, added for the month-1 plan (one module of 5 a week).
// 6 ends with «gʻildiratdi», the variant the teacher chose and recorded; the books' «gʻiltiratdi» still passes as near.
// ms: how long the teacher's studio sample (voice «ustoz») of the tongue twister is spoken, from its first to its
// last loud sample (measured 2026-11-16); the time allowed for a fast reading comes from it, see targetMs.
const TWISTERS: { id: number; level: number; text: string; active: boolean; ms?: number }[] = [
  { id: 1, level: 1, text: 'Togʻdan tosh tushdi.', active: true, ms: 2080 },
  { id: 2, level: 1, text: 'Soat soatiga soatlab qaradi.', active: true, ms: 2870 },
  { id: 3, level: 1, text: 'Qora-qura qoʻzilar qirda quvonib oʻtlar.', active: true, ms: 3890 },
  { id: 4, level: 1, text: 'Raʼno rasmlariga rang-barang rang tanladi.', active: true, ms: 3610 },
  { id: 5, level: 1, text: 'Kitob kitobxonlarga kerak, kitobxonlarga kitob kerak.', active: true, ms: 4840 },
  { id: 6, level: 2, text: 'Gʻani gʻildirakni gʻizillatib gʻildiratdi.', active: true, ms: 3380 },
  { id: 7, level: 2, text: 'Chori chayilgan choynakka choyni chamalab soldi.', active: true, ms: 3570 },
  { id: 8, level: 2, text: 'Turgʻun toʻrtta toʻrgʻayni toʻrga tushirdi.', active: true, ms: 3480 },
  { id: 9, level: 2, text: 'Tovuq sovuqda sovqotadimi? Sovuqda tovuq sovqotadimi?', active: true, ms: 5180 },
  { id: 10, level: 2, text: 'Oq choynakka koʻk qopqoq, koʻk choynakka oq qopqoq.', active: true, ms: 4410 },
  { id: 11, level: 3, text: 'Belbogʻini belga bogʻlab, bogʻbon bobo bogʻga bordi.', active: true, ms: 4500 },
  { id: 12, level: 3, text: 'Shokir shifokorlarning shart-sharoitini shoshilmasdan sharhladi.', active: true, ms: 4370 },
  { id: 13, level: 3, text: 'Bahodir bayroqni Botirga berdimi, Botir Bahodirga bayroqni berdimi?', active: true, ms: 5660 },
  { id: 14, level: 3, text: 'Paxta qattiqmi, taxta qattiq? Sodiq momiq paxtani terdi.', active: true, ms: 4330 },
  { id: 15, level: 3, text: 'Besh mis barkash, besh mis barkashning ichida besh ming mis barkash.', active: true, ms: 5480 },
  { id: 16, level: 2, text: 'Oʻroq oʻxshar soʻroqqa, soʻroq oʻxshar oʻroqqa.', active: true, ms: 4410 },
  { id: 17, level: 2, text: 'Koʻm-koʻk kurtak, koʻkatlar koʻklamga koʻrk koʻrsatar.', active: true, ms: 4540 },
  { id: 18, level: 3, text: 'Uchuvchi suzuvchini uchratdimi, suzuvchi uchuvchini uchratdimi?', active: true, ms: 4670 },
  { id: 19, level: 3, text: 'Temur bilan Yoʻlchi — temiryoʻlchi, temiryoʻlchiga aytib koʻr-chi.', active: true, ms: 4870 },
  { id: 20, level: 2, text: 'Darsda Nasim rasm soldi, Nasim rasmga razm soldi.', active: true, ms: 4620 },
];
// The time a 'tez' reading may take for full stars: the teacher's own sample plus a fifth, and never less than the
// rule used before v19 (0.6 s a word, at least 1.5 s). That rule alone was stricter than the teacher's samples for
// 12 of the 20 tongue twisters, so most right readings got one star as "slow".
function targetMs(t: { text: string; ms?: number }) {
  const words = t.text.replace(/[.,!?;:—–-]/g, ' ').split(/\s+/).filter(Boolean).length;
  return Math.round(Math.max(1500, words * 600, (t.ms ?? 0) * 1.2) / 100) * 100;
}
const PHRASES: Record<string, string> = {
  listen: 'Diqqat bilan tingla, keyin takrorla.',
  your_turn: 'Endi sen ayt!',
  great: 'Barakalla! Zoʻr chiqdi!',
  almost: 'Deyarli toʻgʻri! Yana bir marta urinib koʻr.',
  retry: 'Hechqisi yoʻq. Yana bir marta urinib koʻr.',
  faster: 'Toʻgʻri! Endi biroz tezroq ayt.',
  later: 'Bu tez aytishga keyinroq qaytamiz.',
  done: 'Ajoyib! Hammasini aytib chiqding!',
};

// Self-test phrases: the doc's test cards T1-T5, said correctly and with the planned errors.
const SELFTEST: { id: number; label: string; said: string }[] = [
  { id: 6, label: 'T1 togri', said: 'Gʻani gʻildirakni gʻizillatib gʻildiratdi.' },
  { id: 6, label: 'T1 xato1 (gʻ->g)', said: 'Gʻani gildirakni gʻizillatib gʻildiratdi.' },
  { id: 6, label: 'T1 xato2 (tushib qolgan)', said: 'Gʻani gʻildirakni gʻildiratdi.' },
  { id: 10, label: 'T2 togri', said: 'Oq choynakka koʻk qopqoq, koʻk choynakka oq qopqoq.' },
  { id: 10, label: 'T2 xato1 (q->k)', said: 'Oq choynakka koʻk qopqoq, koʻk choynakka oq kopkok.' },
  { id: 10, label: 'T2 xato2 (ranglar)', said: 'Oq choynakka oq qopqoq, koʻk choynakka koʻk qopqoq.' },
  { id: 7, label: 'T3 togri', said: 'Chori chayilgan choynakka choyni chamalab soldi.' },
  { id: 7, label: 'T3 xato1 (ch->sh)', said: 'Chori shayilgan choynakka choyni chamalab soldi.' },
  { id: 7, label: 'T3 xato2 (tushib qolgan)', said: 'Chori choynakka choyni chamalab soldi.' },
  { id: 4, label: 'T4 togri', said: 'Raʼno rasmlariga rang-barang rang tanladi.' },
  { id: 4, label: 'T4 xato1 (r->l)', said: 'Raʼno rasmlariga lang-barang rang tanladi.' },
  { id: 4, label: 'T4 xato2 (tushib qolgan)', said: 'Raʼno rasmlariga rang tanladi.' },
  { id: 14, label: 'T5 togri', said: 'Paxta qattiqmi, taxta qattiq? Sodiq momiq paxtani terdi.' },
  { id: 14, label: 'T5 xato1 (x->h)', said: 'Pahta qattiqmi, taxta qattiq? Sodiq momiq paxtani terdi.' },
  { id: 14, label: 'T5 xato2 (oʻrni almashgan)', said: 'Taxta qattiqmi, paxta qattiq? Sodiq momiq paxtani terdi.' },
];

const db = createClient(API, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') ?? '';
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== 'POST') return reply(origin, { error: 'method_not_allowed' }, 405);
  if (!API || !KEY || !APP_BOT_TOKEN) return reply(origin, { error: 'server_not_configured' }, 500);
  const path = new URL(req.url).pathname.split('/').filter(Boolean).at(-1) ?? '';
  try {
    if (path === 'selftest') return await selftest(req);
    if (!ORIGINS.has(origin)) return reply(origin, { error: 'origin_not_allowed' }, 403);
    if (!['mic-check', 'session', 'tts', 'check'].includes(path)) return reply(origin, { error: 'not_found' }, 404);
    if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY) return reply(origin, { error: 'body_too_large' }, 413);
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    if (!await limit(`tez-ip:${ip}`, 60, 60)) return reply(origin, { error: 'rate_limited' }, 429);
    const user = await verifyInitData(req.headers.get('x-telegram-init-data') ?? '');
    if (!user) return reply(origin, { error: 'invalid_or_expired_init_data' }, 401);
    if (!await limit(`tez-tg:${user.id}`, 40, 60)) return reply(origin, { error: 'rate_limited' }, 429);
    if (path === 'mic-check') return await micCheck(req, origin, user.id);
    if (path === 'session') return await session(req, origin, user);
    if (path === 'tts') return await tts(req, origin);
    return await check(req, origin, user);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'request_failed';
    return reply(origin, { error: message }, message === 'body_too_large' ? 413 : 400);
  }
});

// ---------- routes ----------

async function session(req: Request, origin: string, user: { id: number; via: string }) {
  const telegramId = user.id;
  const isAdmin = await isActiveAdmin(telegramId);
  // The parents' bot of Super Intellekt Kids: is the child's Lite open, and which tongue twister is the day's one.
  let lite: Record<string, unknown> | null = null;
  if (user.via === 'lite') {
    const body = await readJson(req).catch(() => ({}));
    const p = await sikDz({ tg: telegramId, probe: true, child: typeof body?.child === 'string' ? body.child : '' });
    lite = p?.open
      ? { open: true, child: p.child, name: p.name, age: p.age, done: p.done ?? null, twisterId: liteTwister(String(p.child), Number(p.age) || 9, tashkentDay(Date.now())).id }
      : { open: false, reason: p ? 'closed' : 'unavailable' };
  }
  const narrator = await activeNarrator();
  const samples = await sampleNames(narrator).catch(() => new Set<string>());
  const twisters: { id: number; level: number; text: string; audio: string | null; targetMs: number }[] = [];
  for (const t of TWISTERS.filter((x) => x.active)) {
    const file = findSample(samples, await sampleFile(t, narrator));
    twisters.push({ id: t.id, level: t.level, text: t.text, audio: file ? sampleUrl(file, narrator) : null, targetMs: targetMs(t) });
  }
  return reply(origin, {
    ok: true,
    isAdmin,
    sttReady: !!STT_PROVIDER && (isAdmin || CHILDREN_OK || lite?.open === true),
    ttsReady: TTS_READY,
    sttProvider: PROVIDER_NAME[STT_PROVIDER] ?? null,
    twisters,
    phrases: Object.keys(PHRASES),
    ...(lite ? { lite } : {}),
  });
}

async function tts(req: Request, origin: string) {
  if (!TTS_READY) return reply(origin, { error: 'tts_not_configured' }, 503);
  const body = await readJson(req);
  const items: unknown = body?.items;
  if (!Array.isArray(items) || items.length < 1 || items.length > 12) throw new Error('invalid_items');
  const urls: Record<string, string> = {};
  for (const item of items) {
    if (typeof item !== 'string') throw new Error('invalid_items');
    const spec = ttsSpec(item);
    if (!spec) throw new Error('invalid_items');
    urls[item] = await cachedTts(spec.key, spec.text, spec.rate);
  }
  return reply(origin, { ok: true, urls });
}

async function check(req: Request, origin: string, user: { id: number; via: string }) {
  const telegramId = user.id;
  if (!STT_PROVIDER) return reply(origin, { error: 'speech_not_configured' }, 503);
  const form = await readForm(req);
  const meta = parseMeta(form.get('meta'));
  const twister = TWISTERS.find((t) => t.id === meta.twisterId);
  if (!twister || !STAGES.includes(meta.stage)) throw new Error('invalid_meta');
  const isAdmin = await isActiveAdmin(telegramId);
  // The day's tongue twister from the parents' bot of Super Intellekt Kids: the parent agreed in the app (the
  // consent names the speech service), the child's Lite is open, and it is today's tongue twister.
  if (user.via === 'lite') {
    if (!isAdmin && meta.consent !== true) return reply(origin, { error: 'consent_required' }, 403);
    const p = await sikDz({ tg: telegramId, probe: true, child: meta.child ?? '' });
    if (!p) return reply(origin, { error: 'lite_unavailable' }, 503);
    if (!p.open) return reply(origin, { error: 'lite_closed' }, 403);
    if (liteTwister(String(p.child), Number(p.age) || 9, tashkentDay(Date.now())).id !== twister.id) return reply(origin, { error: 'not_today' }, 409);
    if (!await limit(`tez-lite:${telegramId}`, LITE_DAILY_CHECKS, 86400)) return reply(origin, { error: 'rate_limited' }, 429);
    return await judgeAndStore(form, origin, { telegramId, isAdmin, meta, twister, student: null, home: false, lite: String(p.child) });
  }
  // Homework said at home, sent by an account linked to the student in the family bot.
  if (meta.home) {
    if (!meta.studentId || !meta.lessonKey) throw new Error('invalid_meta');
    const at = await homeStudent(telegramId, meta.studentId, meta.lessonKey, twister.id);
    if ('error' in at) return reply(origin, { error: at.error }, at.error === 'student_not_allowed' || at.error === 'student_consent_missing' ? 403 : 409);
    return await judgeAndStore(form, origin, { telegramId, isAdmin, meta, twister, student: at, home: true });
  }
  // A teacher's lesson: the student must be the teacher's and the parents must have agreed (ticked by the teacher).
  const lesson = meta.studentId ? await lessonStudent(telegramId, isAdmin, meta.studentId) : null;
  if (meta.studentId && !lesson) return reply(origin, { error: 'student_not_allowed' }, 403);
  if (lesson && !lesson.consent) return reply(origin, { error: 'student_consent_missing' }, 403);
  if (lesson && !meta.lessonKey) throw new Error('invalid_meta');
  if (!lesson) {
    if (!isAdmin && !CHILDREN_OK) return reply(origin, { error: 'speech_not_configured' }, 503);
    // Children's voices go to the speech service only with the parent's consent given in the app.
    if (!isAdmin && meta.consent !== true) return reply(origin, { error: 'consent_required' }, 403);
  }
  return await judgeAndStore(form, origin, { telegramId, isAdmin, meta, twister, student: lesson, home: false });
}

// The audio of one attempt through the speech service and the judge, and the row it leaves behind. A student's voice
// is never kept, neither from a lesson nor from home; only an admin's own practice may be saved for tuning.
type Checked = { id: string; groupId: string } | null;
async function judgeAndStore(form: FormData, origin: string, o: {
  telegramId: number; isAdmin: boolean; meta: ReturnType<typeof parseMeta>; twister: { id: number; text: string; ms?: number }; student: Checked; home: boolean;
  lite?: string;
}) {
  const audio = form.get('audio');
  if (!(audio instanceof File) || audio.size < 1000 || audio.size > MAX_AUDIO) throw new Error('invalid_audio');
  const wav = new Uint8Array(await audio.arrayBuffer());
  if (!isWav16kMono(wav)) throw new Error('wav_16k_mono_required');

  const stt = await recognize(wav);
  const result = judge(o.twister.text, stt, { aliases: ALIASES[o.twister.id], speechMs: o.meta.speechMs });
  const target = targetMs(o.twister);
  const stars = o.meta.stage === 'tez' ? starsOf(result, target) : null;

  let audioPath: string | null = null;
  if (o.isAdmin && !o.student) {
    audioPath = `attempts/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.wav`;
    const { error } = await db.storage.from(AUDIO_BUCKET).upload(audioPath, wav, { contentType: 'audio/wav', upsert: false });
    if (error) audioPath = null;
  }
  await db.from('tez_aytish_attempts').insert({
    tg_user_hash: await sha256Hex(`tez:${o.telegramId}`),
    is_admin: o.isAdmin,
    twister_id: o.twister.id,
    stage: o.meta.stage,
    attempt_no: o.meta.attempt,
    passed: result.passed,
    stt_status: result.status,
    recognized: result.recognized,
    confidence: result.confidence,
    words: result.words,
    extras: result.extras,
    speech_ms: o.meta.speechMs,
    duration_ms: o.meta.durationMs,
    platform: o.lite ? `sik ${o.meta.platform ?? ''}`.trim().slice(0, 40) : o.meta.platform,
    audio_path: audioPath,
    student_id: o.student?.id ?? null,
    group_id: o.student?.groupId ?? null,
    lesson_key: o.student ? o.meta.lessonKey : null,
    stars: o.student ? stars : null,
    kind: o.home ? 'home' : 'lesson',
  });
  // The day's tongue twister of Super Intellekt Kids: the stars of the 'tez' check go to sik-lite (points, the bear).
  const lite = o.lite && stars !== null ? await sikDz({ tg: o.telegramId, child: o.lite, twister: o.twister.id, stars, passed: result.passed }) : null;
  return reply(origin, { ok: true, ...result, stars, targetMs: target, audioSaved: !!audioPath, home: o.home, ...(o.lite ? { lite } : {}) });
}

// The student of a teacher's lesson, if the caller may check them: an active student in a live group of the caller
// (an active teacher), or in any group for the owner (an admin).
async function lessonStudent(telegramId: number, isAdmin: boolean, studentId: string) {
  const { data: s } = await db.from('tez_aytish_students').select('id,group_id,consent,active').eq('id', studentId).maybeSingle();
  if (!s || !s.active) return null;
  const { data: g } = await db.from('tez_aytish_groups').select('teacher_id,archived_at').eq('id', s.group_id).maybeSingle();
  if (!g || g.archived_at) return null;
  if (!isAdmin) {
    if (Number(g.teacher_id) !== telegramId) return null;
    const { data: t } = await db.from('tez_aytish_teachers').select('status').eq('telegram_user_id', telegramId).maybeSingle();
    if (t?.status !== 'active') return null;
  }
  return { id: String(s.id), groupId: String(s.group_id), consent: !!s.consent };
}

// A tongue twister said at home. The caller must be linked to the student in the family bot and the parents' consent
// must be ticked; the tongue twister must belong to the module of that lesson's week; the group's next lesson must
// not have opened yet (that is the deadline), and each tongue twister of a homework is checked once. What exactly is
// homework for this student, and the mass it gives, is decided by tez-aytish-profile.
const tashkentDay = (ms: number) => new Date(ms + TZ_MS).toISOString().slice(0, 10);
function dayPlus(key: string, n: number) {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const isoWeekday = (key: string) => (new Date(`${key}T00:00:00Z`).getUTCDay() || 7); // Monday 1 ... Sunday 7
async function homeStudent(telegramId: number, studentId: string, lessonKey: string, twisterId: number) {
  const { data: link } = await db.from('tez_aytish_family_links').select('student_id')
    .eq('student_id', studentId).eq('telegram_user_id', telegramId).eq('active', true).maybeSingle();
  if (!link) return { error: 'student_not_allowed' };
  const { data: s } = await db.from('tez_aytish_students').select('id,group_id,consent,active').eq('id', studentId).maybeSingle();
  if (!s || !s.active) return { error: 'student_not_allowed' };
  if (!s.consent) return { error: 'student_consent_missing' };
  const { data: g } = await db.from('tez_aytish_groups').select('id,lesson_days,archived_at').eq('id', s.group_id).maybeSingle();
  if (!g || g.archived_at) return { error: 'student_not_allowed' };
  const today = tashkentDay(Date.now());
  if (lessonKey > today) return { error: 'homework_closed' };
  const days = (g.lesson_days ?? []).map(Number);
  for (let i = 1; i <= 7; i++) { // the group's next lesson after that one closes the homework
    const k = dayPlus(lessonKey, i);
    if (!days.includes(isoWeekday(k))) continue;
    if (k <= today) return { error: 'homework_closed' };
    break;
  }
  const weekStart = dayPlus(lessonKey, 1 - isoWeekday(lessonKey));
  const { data: w } = await db.from('tez_aytish_group_weeks').select('module_id').eq('group_id', g.id).eq('week_start', weekStart).maybeSingle();
  if (!w) return { error: 'homework_closed' };
  const { data: m } = await db.from('tez_aytish_modules').select('twister_ids').eq('id', w.module_id).maybeSingle();
  if (!((m?.twister_ids ?? []).map(Number).includes(twisterId))) return { error: 'not_in_homework' };
  const { data: old } = await db.from('tez_aytish_attempts').select('id').eq('student_id', s.id).eq('lesson_key', lessonKey)
    .eq('twister_id', twisterId).eq('kind', 'home').eq('stt_status', 'Success').limit(1);
  if (old?.length) return { error: 'already_checked' };
  return { id: String(s.id), groupId: String(s.group_id) };
}
// Stars of a 'tez' card: every word right in time 3, right with a word only nearly right 2, right but slower than
// the target (targetMs) 1, otherwise 0. The time is that of the one reading that was judged (readMs), so a second
// reading or talk after it does not make the child "slow". The page shows these stars as they come from here.
function starsOf(r: { passed: boolean; words: { v: string }[]; readMs: number | null }, target: number) {
  if (!r.passed) return 0;
  if (r.readMs !== null && r.readMs > target) return 1;
  return r.words.some((w) => w.v === 'near') ? 2 : 3;
}

// Super Intellekt Kids: the day's tongue twister of a child, the same all day: an easy one for the youngest (age 8
// and under: level 1; 9-11: up to level 2; older: any).
function liteTwister(childId: string, age: number, day: string) {
  const top = age <= 8 ? 1 : age <= 11 ? 2 : 3;
  const easy = TWISTERS.filter((t) => t.active && t.level <= top);
  const pool = easy.length ? easy : TWISTERS.filter((t) => t.active);
  let h = 2166136261;
  for (const ch of `${childId}|${day}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return pool[h % pool.length];
}
// A call to sik-lite (project zamonaviy-kasblar): {probe: true} asks whether the child's Lite is open, otherwise it
// records the day's check. null when the bot is not set up or sik-lite does not answer.
let sikSecret = '';
async function sikDz(body: Record<string, unknown>): Promise<any> {
  if (!LITE_BOT_TOKEN) return null;
  try {
    if (!sikSecret) sikSecret = await sha256Hex(`sik-dz:${LITE_BOT_TOKEN}`);
    const r = await fetch(SIK_DZ_URL, { method: 'POST', headers: { 'content-type': 'application/json', 'x-sik-dz': sikSecret }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
    return await r.json().catch(() => null);
  } catch {
    return null;
  }
}

async function selftest(req: Request) {
  const token = req.headers.get('x-selftest-token') ?? '';
  const tokenSha = token ? await sha256Hex(token) : '';
  if (!token || !SELFTEST_SHA256.some((s) => constantTimeEqual(tokenSha, s))) return reply('', { error: 'forbidden' }, 403);
  const url = new URL(req.url);
  const status = {
    sttProvider: STT_PROVIDER || null, ttsReady: TTS_READY, childrenOk: CHILDREN_OK,
    voicelab: AISHA_KEY ? { configured: true, keyPrefix: AISHA_KEY.slice(0, 4) } : null,
    google: GOOGLE_SA_JSON ? googleStatus() : null,
    azureRegion: AZ_REGION || null,
  };
  // Judge checks on canned transcripts: no speech service is called and nothing is charged. A case is the tongue
  // twister, what was heard and whether it must pass; it may also name the status, or the speech time (ms) with the
  // stars it must give.
  if (url.searchParams.get('unit') === '1') {
    const u18 = 'Uchuvchi suzuvchini uchratdimi, suzuvchi uchuvchini uchratdimi?';
    const cases: [number, string, boolean, { status?: string; ms?: number; stars?: number }?][] = [
      [6, 'Gʻani gʻildirakni gʻizillatib gʻildiratdi.', true],
      [6, "G'ani gildirakni g'izillatib g'ildiratdi", false],
      [6, "G'ani g'ildirakni g'izillatib g'iltiratdi", true],
      [4, 'Ra’no rasmlariga rangbarang rang tanladi', true],
      [4, "Ra'no rasmlariga langbarang rang tanladi.", false],
      [10, 'Oq choynakka koʻk qopqoq, koʻk choynakka oq kopkok.', false],
      [14, 'Pahta qattiqmi, taxta qattiq? Sodiq momiq paxtani terdi.', false],
      [3, 'Қора-қура қўзилар қирда қувониб ўтлар', true],
      [3, "Qora-qura qo'zilar qirida quvonib o'tlar.", true],
      [19, "Temur bilan Yo'lchi temiryo'lchi, temiryo'lchiga aytib ko'rchi", true],
      // planned errors of the test cards: a swapped sound, a dropped word, swapped words
      [7, 'Chori shayilgan choynakka choyni chamalab soldi.', false],
      [7, 'Chori choynakka choyni chamalab soldi.', false],
      [4, 'Raʼno rasmlariga rang tanladi.', false],
      [14, 'Taxta qattiqmi, paxta qattiq? Sodiq momiq paxtani terdi.', false],
      [10, 'Oq choynakka oq qopqoq, koʻk choynakka koʻk qopqoq.', false],
      // what the recogniser wrote for the teacher's own studio samples: each must get full stars
      [7, "Cho'ri chayilgan choynakka choyini chamalab soldi.", true, { ms: 3570, stars: 3 }],
      [8, "Turg'un to'rtta to'rag'ayni to'rga tushirdi.", true, { ms: 3480, stars: 3 }],
      [9, 'Tovuq sovuqda sovuq qotadimi? Sovuqda tovuq sovuq qotadimi?', true, { ms: 5180, stars: 3 }],
      [11, "Belbog'ini belga bog'lab, bog'bon-bobbo bog'ga bordi.", true, { ms: 4500, stars: 3 }],
      [12, 'Shokir shifokorlarning shart-sharoitini shoshilmasdan shartladi.', true, { ms: 4370, stars: 3 }],
      [14, 'Paxta qattiqmi, taxta qattiqmi, Sodiq momiq paxtari terdi.', true, { ms: 4330, stars: 3 }],
      [17, "Ko'm-ko'k kurtak, ko'katlar ko'klamga cho'rk ko'rsatar.", true, { ms: 4540, stars: 3 }],
      [19, "Temur bilan yo'lchi, temir yo'lchi, temir yo'lchiga aytib ko'r-chi.", true, { ms: 4870, stars: 3 }],
      // real lesson readings: said several times or with talk around it, words written as one, the everyday -ni
      [7, "Ketdi. Cho'ri chayilgan choynakka choyni chamalab soldi. Cho'ri chayilgan choynakka choyni chamalab soldi. Cho'ri chay...", true, { ms: 9783, stars: 3 }],
      [12, Array(4).fill('Shokir shifokorlarning shart-sharoitini shoshilmasdan sharqladi.').join(' '), true, { ms: 14702, stars: 3 }],
      [18, 'Uchuvchi suzuvchini uchratdimi? Suzuvchi uchuvchini uchratdimi? Uchuvchi suzuvchini uchratdimi? Suzuvchi uchuvchini uchratdimi?', true, { ms: 11735, stars: 1 }],
      [18, `${u18} Ha, men vndan qilaman.`, true, { ms: 14684, stars: 1 }],
      [15, 'Besh misbarkash, besh misbarkashning ichida besh ming misbarkash.', true, { ms: 4501, stars: 3 }],
      [15, 'Besh misbarkash, besh misbarkashni ichida besh ming misbarkash.', true, { ms: 4401, stars: 2 }],
      [15, 'Besh mis bargash, besh mis bargashning ichida besh ming mis bargash.', true, { ms: 4700, stars: 2 }],
      [18, u18, true, { ms: 3983, stars: 3 }],
      [18, u18, true, { ms: 6801, stars: 1 }],
      // real lesson readings that stay wrong, and someone else's voice (no word of the tongue twister: not an attempt)
      [7, "Bo'ldi, bo'ldi.", false, { status: 'NoMatch' }],
      [7, "Cho'ri tayilgan choynakka choyni shamalab soldi.", false, { status: 'Success' }],
      [7, "Cho'g'ri chayilgan choynakka choyni chamalab soldi.", false],
      [18, 'Suvchi suzuvchini uchratdimi, suzuvchi uchuvchini uchratdimi?', false],
      [15, 'Besh mis barkash, besh, besh mis barkashning ichida besh ming bark, mis barkash.', false],
      [12, 'Shokir shifokorlarning shax-sharoitini...', false],
      [15, 'Beshmiz parkash, beshmiz parkashni ichida besh mingmiz parkash.', false],
      [18, 'Uchuvchi suzuvchini uchratdimi?', false, { status: 'Success' }],
    ];
    const results = cases.map(([id, heard, want, x]) => {
      const t = TWISTERS.find((tw) => tw.id === id)!;
      const r = judge(t.text, { status: 'Success', display: heard, lexical: heard, confidence: null }, { aliases: ALIASES[id], speechMs: x?.ms ?? null });
      const stars = starsOf(r, targetMs(t));
      const ok = r.passed === want && (x?.status === undefined || r.status === x.status) && (x?.stars === undefined || stars === x.stars);
      return { id, heard, want, passed: r.passed, status: r.status, stars, readMs: r.readMs, ok };
    });
    return reply('', { ok: results.every((r) => r.ok), total: results.length, results });
  }
  // Re-judge the stored lesson checks with today's rules, after the judge has changed: ?rejudge=FROM,TO names the
  // first and the last lesson date (YYYY-MM-DD). Without &apply=1 it only reports. A row that changes keeps its old
  // verdict in tez_aytish_rejudge_log. Only clear checks can be re-judged: the text the recogniser wrote is stored,
  // the voice is not.
  const rejudge = url.searchParams.get('rejudge');
  if (rejudge !== null) {
    const [from, to] = rejudge.split(',').map((s) => s.trim());
    const day = /^\d{4}-\d{2}-\d{2}$/;
    if (!day.test(from ?? '') || !day.test(to ?? '')) return reply('', { ok: false, error: 'rejudge_needs_from_and_to' }, 400);
    const apply = url.searchParams.get('apply') === '1';
    const { data, error } = await db.from('tez_aytish_attempts')
      .select('id,student_id,lesson_key,twister_id,passed,stt_status,stars,words,extras,recognized,speech_ms')
      .eq('stage', 'tez').eq('stt_status', 'Success').not('student_id', 'is', null).gte('lesson_key', from).lte('lesson_key', to).order('created_at');
    if (error) return reply('', { ok: false, error: 'attempts_query_failed' }, 500);
    const sig = (ws: unknown) => (Array.isArray(ws) ? ws : []).map((w) => (typeof w === 'string' ? w : `${w?.t}|${w?.h ?? ''}|${w?.v}`)).join(' ');
    const days: Record<string, { checks: number; oldStars: number; newStars: number; oldPassed: number; newPassed: number; unclear: number }> = {};
    const changes: { lesson: string; student: string; twister: number; old: number | null; now: number | string }[] = [];
    let saved = 0;
    for (const a of data ?? []) {
      const t = TWISTERS.find((x) => x.id === a.twister_id);
      if (!t || !a.recognized) continue;
      const r = judge(t.text, { status: 'Success', display: a.recognized, lexical: a.recognized, confidence: null }, { aliases: ALIASES[t.id], speechMs: a.speech_ms });
      const stars = starsOf(r, targetMs(t));
      const d = days[a.lesson_key] ??= { checks: 0, oldStars: 0, newStars: 0, oldPassed: 0, newPassed: 0, unclear: 0 };
      d.checks++; d.oldStars += a.stars ?? 0; d.oldPassed += a.passed ? 1 : 0;
      if (r.status === 'Success') { d.newStars += stars; d.newPassed += r.passed ? 1 : 0; } else d.unclear++;
      if (r.passed === a.passed && r.status === a.stt_status && stars === a.stars && sig(r.words) === sig(a.words) && sig(r.extras) === sig(a.extras)) continue;
      if (stars !== a.stars || r.status !== a.stt_status) changes.push({ lesson: a.lesson_key, student: String(a.student_id).slice(0, 4), twister: t.id, old: a.stars, now: r.status === 'Success' ? stars : r.status });
      if (!apply) continue;
      const log = await db.from('tez_aytish_rejudge_log').insert({
        attempt_id: a.id, rule: 'v19', old_passed: a.passed, old_stt_status: a.stt_status, old_stars: a.stars, old_words: a.words, old_extras: a.extras,
        new_passed: r.passed, new_stt_status: r.status, new_stars: stars,
      });
      if (log.error) return reply('', { ok: false, error: 'rejudge_log_failed', saved, changes }, 500);
      const up = await db.from('tez_aytish_attempts').update({ passed: r.passed, stt_status: r.status, stars, words: r.words, extras: r.extras }).eq('id', a.id);
      if (up.error) return reply('', { ok: false, error: 'rejudge_update_failed', saved, changes }, 500);
      saved++;
    }
    return reply('', { ok: true, applied: apply, saved, days, changes });
  }
  // The bot the trainer runs in (username only) and its menu button: read it, or point it at the trainer.
  const tgApi = (method: string, body?: unknown): Promise<any> => fetch(`https://api.telegram.org/bot${APP_BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}),
  }).then((r) => r.json()).catch(() => ({ ok: false, description: 'telegram_unreachable' }));
  const appBot = KIDS_BOT_TOKEN ? 'kids' : 'parents';
  if (url.searchParams.get('bot') === 'me') {
    const me = await tgApi('getMe');
    // Where the bot's updates go (host and path only: a webhook URL can carry a secret in its query).
    const wh = await tgApi('getWebhookInfo');
    let webhook: unknown = null;
    if (wh?.ok) {
      let where: string | null = null;
      try { const u = new URL(String(wh.result?.url ?? '')); where = u.host + u.pathname; } catch { /* no webhook set */ }
      webhook = { where, pending: wh.result?.pending_update_count ?? 0, lastError: wh.result?.last_error_message ?? null };
    }
    return reply('', { ok: !!me?.ok, appBot, username: me?.result?.username ?? null, name: me?.result?.first_name ?? null, webhook, error: me?.ok ? null : me?.description ?? null });
  }
  const menu = url.searchParams.get('menu');
  if (menu === 'get' || menu === 'set') {
    const button = { type: 'web_app', text: 'Tez aytish', web_app: { url: TRAINER_URL } };
    const { data: admins } = await db.from('admins').select('telegram_user_id').eq('active', true);
    if (menu === 'set') {
      // Never repoint the parents' bot menu (it opens the family Mini App).
      if (!KIDS_BOT_TOKEN) return reply('', { ok: false, appBot, error: 'kids_bot_token_missing' }, 400);
      const r = await tgApi('setChatMenuButton', { menu_button: button });
      if (!r?.ok) return reply('', { ok: false, appBot, error: r?.description ?? 'set_failed' }, 502);
      // A button set for one chat overrides the default, so the admins' own chats get it explicitly too.
      for (const a of admins ?? []) await tgApi('setChatMenuButton', { chat_id: a.telegram_user_id, menu_button: button });
    }
    const cur = await tgApi('getChatMenuButton');
    const adminChats: unknown[] = [];
    for (const a of admins ?? []) {
      const r = await tgApi('getChatMenuButton', { chat_id: a.telegram_user_id });
      adminChats.push(r?.ok ? r.result : { error: r?.description ?? 'failed' });
    }
    return reply('', { ok: !!cur?.ok, appBot, menuButton: cur?.result ?? null, adminChats, error: cur?.ok ? null : cur?.description ?? null });
  }
  // Each active admin gets a bot message with a button that opens the trainer as a real Telegram Mini App
  // (a web_app button always hands the page signed initData, unlike a plain link).
  if (url.searchParams.get('notify') === 'admins') {
    const { data: admins, error } = await db.from('admins').select('telegram_user_id').eq('active', true);
    if (error) return reply('', { ok: false, error: 'admins_query_failed' }, 500);
    const sent: { ok: boolean; error: string | null }[] = [];
    for (const a of admins ?? []) {
      const res = await fetch(`https://api.telegram.org/bot${APP_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: a.telegram_user_id,
          text: 'Tez aytish trenajyori — sinov (faqat adminlar uchun). Pastdagi tugmani bosing.',
          reply_markup: { inline_keyboard: [[{ text: '🗣 Tez aytish trenajyori', web_app: { url: TRAINER_URL } }]] },
        }),
      });
      const j: any = await res.json().catch(() => ({}));
      sent.push({ ok: !!j?.ok, error: j?.ok ? null : String(j?.description ?? res.status) });
    }
    return reply('', { ok: true, sent });
  }
  // Narrator samples: the voices to choose from, which voice the app plays, which tongue twisters have a sample,
  // make the missing ones (1 VoiceLab credit per character) or store a studio recording. &narrator=NAME works on a
  // voice other than the app's one; ?voice=use&narrator=NAME switches the app to it.
  const voiceMode = url.searchParams.get('voice');
  if (voiceMode === 'voices' || voiceMode === 'use' || voiceMode === 'list' || voiceMode === 'build' || voiceMode === 'upload') {
    const active = await activeNarrator(true);
    const narrator = norm(url.searchParams.get('narrator') ?? '') || active;
    const studio = STUDIO_NARRATORS.has(narrator);
    if (!AISHA_KEY && (voiceMode === 'voices' || voiceMode === 'build' || (voiceMode === 'use' && !studio))) {
      return reply('', { ok: false, error: 'voice_needs_voicelab' }, 400);
    }
    if (voiceMode === 'build' && studio) return reply('', { ok: false, error: 'studio_narrator_is_recorded_not_built' }, 400);
    try {
      if (voiceMode === 'voices') {
        return reply('', { ok: true, narrator: active, voices: (await voicelabVoices()).map((v) => ({ name: v.name, model: v.model })) });
      }
      if (voiceMode === 'upload') {
        if (!studio) return reply('', { ok: false, error: 'upload_is_for_studio_narrators' }, 400);
        const t = TWISTERS.find((x) => x.active && x.id === Number(url.searchParams.get('id')));
        if (!t) return reply('', { ok: false, error: 'unknown_id' }, 400);
        const wav = await readBody(req);
        const ms = samplePcmMs(wav);
        if (!ms) return reply('', { ok: false, error: 'wav_pcm16_mono_up_to_15s_required' }, 400);
        // The name also carries a hash of the audio, so a new take gets a new address and no cache keeps the old one.
        const base = await sampleFile(t, narrator);
        const file = `${base.slice(0, -4)}-${(await sha256Hex(wav)).slice(0, 8)}.wav`;
        const folder = sampleFolder(narrator);
        const { error } = await db.storage.from(TTS_BUCKET).upload(`${folder}/${file}`, wav, { contentType: 'audio/wav', cacheControl: '31536000', upsert: true });
        if (error) throw new Error(`sample_upload_failed: ${error.message}`);
        const old = [...await sampleNames(narrator, true)].filter((n) => n !== file && sampleMatches(n, base));
        if (old.length) await db.storage.from(TTS_BUCKET).remove(old.map((n) => `${folder}/${n}`));
        sampleCache.delete(narrator);
        return reply('', { ok: true, narrator, id: t.id, file, bytes: wav.length, ms, replaced: old.length, url: sampleUrl(file, narrator) });
      }
      if (voiceMode === 'use') {
        let voice = 'studio';
        if (studio) {
          // A recorded voice cannot fill gaps by itself, so the app switches to it only once every tongue twister has one.
          const have = await sampleNames(narrator, true);
          const missing: number[] = [];
          for (const t of TWISTERS.filter((x) => x.active)) if (!findSample(have, await sampleFile(t, narrator))) missing.push(t.id);
          if (missing.length) return reply('', { ok: false, error: 'studio_samples_missing', missing }, 400);
        } else voice = (await voicelabVoice(narrator)).name;
        const { error } = await db.from('tez_aytish_settings').upsert({ key: 'narrator', value: narrator, updated_at: new Date().toISOString() });
        if (error) throw new Error(`narrator_save_failed: ${error.message}`);
        narratorCache = null;
        return reply('', { ok: true, narrator, voice, was: active });
      }
    } catch (e) {
      return reply('', { ok: false, error: e instanceof Error ? e.message : String(e) }, 502);
    }
    const ids = (url.searchParams.get('ids') ?? '').split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0).slice(0, 10);
    if (voiceMode === 'build' && !ids.length) return reply('', { ok: false, error: 'ids_required' }, 400);
    const have = await sampleNames(narrator, true);
    const samples: Record<string, unknown>[] = [];
    for (const t of TWISTERS.filter((x) => x.active && (voiceMode === 'list' || ids.includes(x.id)))) {
      const base = await sampleFile(t, narrator);
      const found = findSample(have, base);
      const row: Record<string, unknown> = { id: t.id, chars: [...t.text].length, file: found ?? base, exists: !!found };
      if (voiceMode === 'build' && !found) {
        try {
          const made = await voicelabTts(t.text, narrator);
          const wav = tidyWav(made.wav);
          const { error } = await db.storage.from(TTS_BUCKET).upload(`${sampleFolder(narrator)}/${base}`, wav, { contentType: 'audio/wav', cacheControl: '31536000', upsert: true });
          if (error) throw new Error(`sample_upload_failed: ${error.message}`);
          Object.assign(row, { exists: true, built: true, voice: made.voice, bytes: wav.length, ms: wavDurationMs(wav), charged: made.chars });
        } catch (e) {
          row.error = e instanceof Error ? e.message : String(e);
        }
      }
      if (row.exists) row.url = sampleUrl(String(row.file), narrator);
      samples.push(row);
    }
    sampleCache.delete(narrator);
    return reply('', { ok: true, narrator, active: narrator === active, samples });
  }
  if (!STT_PROVIDER) return reply('', { error: 'speech_not_configured', ...status }, 503);
  // What recognising audio of the given lengths would cost at VoiceLab (nothing is reserved or charged).
  const pre = url.searchParams.get('preflight');
  if (pre !== null) {
    if (STT_PROVIDER !== 'aisha') return reply('', { ok: false, ...status, error: 'preflight_needs_voicelab' }, 400);
    const out: unknown[] = [];
    for (const v of pre.split(',').map((s) => Math.round(Number(s))).filter((n) => n > 0 && n <= 3_600_000).slice(0, 6)) {
      const res = await fetch(`${VL_API}/v1/stt/preflight?duration_ms=${v}&language=uz`, {
        headers: { Authorization: `Bearer ${AISHA_KEY}`, 'X-Audio-Duration-Ms': String(v) },
      });
      out.push({ durationMs: v, http: res.status, body: (await res.text()).slice(0, 500) });
    }
    return reply('', { ok: true, ...status, preflight: out });
  }
  // Mode 1: an uploaded 16 kHz WAV checked against the expected text.
  if ((req.headers.get('content-type') ?? '').toLowerCase().startsWith('multipart/form-data')) {
    const form = await readForm(req);
    const expected = form.get('expected');
    const audio = form.get('audio');
    if (typeof expected !== 'string' || !(audio instanceof File)) return reply('', { error: 'expected_and_audio_required' }, 400);
    const wav = new Uint8Array(await audio.arrayBuffer());
    if (!isWav16kMono(wav)) return reply('', { error: 'wav_16k_mono_required' }, 400);
    try {
      const t0 = Date.now();
      const stt = await recognize(wav);
      const ms = Date.now() - t0;
      const r = judge(expected, stt, { aliases: ALIASES[TWISTERS.find((t) => t.text === expected)?.id ?? 0] });
      return reply('', { ok: true, ...status, expected, heard: r.recognized, status: r.status, confidence: r.confidence, passed: r.passed, ms, provider: stt.extra ?? null, issues: r.words.filter((w) => w.v !== 'ok').map((w) => `${w.d}${w.h ? '→' + w.h : ''}:${w.v}`), extras: r.extras, before: r.before, after: r.after });
    } catch (e) {
      return reply('', { ok: false, ...status, error: e instanceof Error ? e.message : String(e) }, 502);
    }
  }
  if (url.searchParams.get('limit') === '0') return reply('', { ok: true, ...status });
  // Mode 2: synthesise the test cards and recognise them (VoiceLab voice with VoiceLab STT, or the Azure voice).
  const voice = STT_PROVIDER === 'aisha' ? 'voicelab' : TTS_READY ? 'azure' : '';
  if (!voice) return reply('', { ok: true, ...status, note: 'no TTS provider: upload a WAV (multipart: expected, audio) to test recognition' });
  const count = Math.max(1, Math.min(SELFTEST.length, Number(url.searchParams.get('limit')) || 3));
  const offset = Math.max(0, Math.min(SELFTEST.length - 1, Number(url.searchParams.get('offset')) || 0));
  const out: unknown[] = [];
  for (const c of SELFTEST.slice(offset, offset + count)) {
    const target = TWISTERS.find((t) => t.id === c.id)!.text;
    try {
      const audio = voice === 'voicelab' ? (await voicelabTts(c.said, await activeNarrator())).wav : wavFromPcm16k(await azureTts(c.said, RATE.orta, 'raw-16khz-16bit-mono-pcm'));
      const t0 = Date.now();
      const stt = await recognize(audio);
      const ms = Date.now() - t0;
      const r = judge(target, stt, { aliases: ALIASES[c.id] });
      out.push({ case: c.label, said: c.said, heard: r.recognized, status: r.status, confidence: r.confidence, passed: r.passed, ms, provider: stt.extra ?? null, wrong: r.words.filter((w) => w.v !== 'ok').map((w) => `${w.t}${w.h ? '→' + w.h : ''}:${w.v}`), extras: r.extras });
    } catch (e) {
      out.push({ case: c.label, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return reply('', { ok: true, ...status, voice: voice === 'voicelab' ? `VoiceLab ${await activeNarrator()}` : VOICE, results: out });
}

async function micCheck(req: Request, origin: string, telegramId: number) {
  const form = await readForm(req);
  const metaRaw = form.get('meta');
  if (typeof metaRaw !== 'string' || metaRaw.length > MAX_META) throw new Error('invalid_meta');
  let meta: any;
  try { meta = JSON.parse(metaRaw); } catch { throw new Error('invalid_meta'); }
  if (!meta || typeof meta !== 'object' || Array.isArray(meta) || !OUTCOMES.has(meta.outcome)) throw new Error('invalid_meta');
  const diagnostics = meta.diagnostics && typeof meta.diagnostics === 'object' && !Array.isArray(meta.diagnostics) ? meta.diagnostics : {};
  const isAdmin = await isActiveAdmin(telegramId);
  let audioPath: string | null = null;
  let audioBytes: number | null = null;
  const audio = form.get('audio');
  if (audio instanceof File && audio.size > 0) {
    if (!isAdmin) throw new Error('audio_not_allowed');
    const baseType = audio.type.split(';')[0].trim().toLowerCase();
    const ext = AUDIO_EXT[baseType];
    if (!ext) throw new Error('unsupported_audio_type');
    if (audio.size > MAX_AUDIO) throw new Error('body_too_large');
    audioPath = `mic-checks/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
    const { error } = await db.storage.from(AUDIO_BUCKET).upload(audioPath, new Uint8Array(await audio.arrayBuffer()), { contentType: baseType, upsert: false });
    if (error) throw new Error('audio_save_failed');
    audioBytes = audio.size;
  }
  const { data, error } = await db.from('tez_aytish_mic_checks').insert({
    tg_user_hash: await sha256Hex(`tez:${telegramId}`),
    is_admin: isAdmin,
    outcome: meta.outcome,
    platform: text(meta.platform, 40),
    tg_version: text(meta.tgVersion, 20),
    user_agent: text(meta.userAgent, 400),
    mime_type: text(meta.mimeType, 80),
    diagnostics,
    audio_path: audioPath,
    audio_bytes: audioBytes,
  }).select('id').single();
  if (error) {
    if (audioPath) await db.storage.from(AUDIO_BUCKET).remove([audioPath]);
    throw new Error('save_failed');
  }
  return reply(origin, { ok: true, id: data.id, isAdmin, audioSaved: !!audioPath, sttReady: !!STT_PROVIDER && (isAdmin || CHILDREN_OK) });
}

// ---------- Azure Speech ----------

function ttsSpec(item: string): { key: string; text: string; rate: string } | null {
  const tw = /^tw:(\d{1,3}):(sekin|orta|tez)$/.exec(item);
  if (tw) {
    const t = TWISTERS.find((x) => x.id === Number(tw[1]) && x.active);
    return t ? { key: `tw-${t.id}-${tw[2]}`, text: t.text, rate: RATE[tw[2] as Stage] } : null;
  }
  const ph = /^ph:([a-z_]{2,20})$/.exec(item);
  if (ph && PHRASES[ph[1]]) return { key: `ph-${ph[1]}`, text: PHRASES[ph[1]], rate: '0%' };
  return null;
}

async function cachedTts(key: string, textValue: string, rate: string) {
  const version = (await sha256Hex(`${VOICE}|${rate}|${textValue}`)).slice(0, 10);
  const folder = `v1/${VOICE}`;
  const file = `${key}-${version}.mp3`;
  const publicUrl = `${API}/storage/v1/object/public/${TTS_BUCKET}/${folder}/${file}`;
  const { data: found } = await db.storage.from(TTS_BUCKET).list(folder, { search: file, limit: 1 });
  if (found?.some((f) => f.name === file)) return publicUrl;
  const mp3 = await azureTts(textValue, rate, 'audio-24khz-48kbitrate-mono-mp3');
  const { error } = await db.storage.from(TTS_BUCKET).upload(`${folder}/${file}`, mp3, { contentType: 'audio/mpeg', upsert: true });
  if (error) throw new Error('tts_cache_failed');
  return publicUrl;
}

async function azureTts(textValue: string, rate: string, format: string) {
  const ssml = `<speak version='1.0' xml:lang='uz-UZ'><voice name='${VOICE}'><prosody rate='${rate}'>${xmlEscape(textValue)}</prosody></voice></speak>`;
  const res = await fetch(`https://${AZ_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: { 'Ocp-Apim-Subscription-Key': AZ_KEY, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': format, 'User-Agent': 'yba-tez-aytish' },
    body: ssml,
  });
  if (!res.ok) throw new Error(`tts_failed_${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

type Stt = { status: string; display: string; lexical: string; confidence: number | null; extra?: Record<string, unknown> };
async function azureStt(wav: Uint8Array): Promise<Stt> {
  const url = `https://${AZ_REGION}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=uz-UZ&format=detailed&profanity=raw`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Ocp-Apim-Subscription-Key': AZ_KEY, 'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000', Accept: 'application/json' },
    body: wav,
  });
  if (!res.ok) throw new Error(`stt_failed_${res.status}`);
  const data = await res.json();
  const best = Array.isArray(data?.NBest) && data.NBest.length ? data.NBest[0] : null;
  return {
    status: String(data?.RecognitionStatus ?? 'Error'),
    display: String(best?.Display ?? data?.DisplayText ?? ''),
    lexical: String(best?.Lexical ?? ''),
    confidence: typeof best?.Confidence === 'number' ? Math.round(best.Confidence * 1000) / 1000 : null,
  };
}

// ---------- VoiceLab (Aisha) ----------

function recognize(wav: Uint8Array): Promise<Stt> {
  if (STT_PROVIDER === 'aisha') return voicelabStt(wav);
  return STT_PROVIDER === 'google' ? googleStt(wav) : azureStt(wav);
}

// Async API: POST /v1/stt answers 202 with a job id; the job is polled, then deleted together with its audio.
async function voicelabStt(audio: Uint8Array): Promise<Stt> {
  const t0 = Date.now();
  const form = new FormData();
  form.append('audio', new File([audio], 'attempt.wav', { type: 'audio/wav' }));
  form.append('language', 'uz');
  form.append('include_speakers', 'false');
  const headers: Record<string, string> = { Authorization: `Bearer ${AISHA_KEY}`, 'Idempotency-Key': crypto.randomUUID() };
  const audioMs = wavDurationMs(audio);
  if (audioMs) headers['X-Audio-Duration-Ms'] = String(audioMs);
  const res = await fetch(`${VL_API}/v1/stt`, { method: 'POST', headers, body: form });
  const sub = await vlJson(res);
  if (res.status === 422 && sub.code === 'no_speech_detected') return vlNoSpeech();
  if (!res.ok) throw vlError('stt', res.status, sub);
  const id = String(sub.body?.id ?? '');
  if (!id) throw new Error('stt_no_job_id');
  const jobUrl = `${VL_API}/v1/stt/transcriptions/${encodeURIComponent(id)}`;
  try {
    let job: any = sub.body;
    while (job?.status !== 'completed' && job?.status !== 'failed') {
      if (Date.now() - t0 > 25_000) throw new Error('stt_timeout');
      await new Promise((r) => setTimeout(r, 400));
      const poll = await fetch(jobUrl, { headers: { Authorization: `Bearer ${AISHA_KEY}` } });
      const p = await vlJson(poll);
      if (!poll.ok) throw vlError('stt_poll', poll.status, p);
      job = p.body;
    }
    if (job.status === 'failed') {
      const code = vlCode(job);
      if (code === 'no_speech_detected') return vlNoSpeech(id);
      throw new Error(`stt_job_failed${code ? '_' + code : ''}`);
    }
    const transcript = String(job?.transcript ?? '').replace(/\s+/g, ' ').trim();
    return {
      status: transcript ? 'Success' : 'NoMatch', display: transcript, lexical: transcript, confidence: null,
      extra: { id, audioMs: job?.duration_ms ?? audioMs, waitMs: Date.now() - t0 },
    };
  } finally {
    // Nothing of the voice stays at VoiceLab: delete the transcription and its retained audio.
    try {
      const del = await fetch(jobUrl, { method: 'DELETE', headers: { Authorization: `Bearer ${AISHA_KEY}` } });
      if (!del.ok && del.status !== 404) console.error('voicelab delete failed', del.status, (await del.text()).slice(0, 200));
    } catch (e) {
      console.error('voicelab delete error', String(e));
    }
  }
}
function vlNoSpeech(id?: string): Stt {
  return { status: 'NoMatch', display: '', lexical: '', confidence: null, extra: id ? { id } : undefined };
}
async function vlJson(res: Response) {
  const text = await res.text();
  let body: any = null;
  try { body = JSON.parse(text); } catch { /* not JSON */ }
  return { body, code: vlCode(body), text };
}
function vlCode(body: any) {
  const e = body?.error;
  return String((e && typeof e === 'object' ? e.code : e) ?? body?.code ?? body?.error_code ?? body?.error_key ?? '');
}
function vlError(what: string, status: number, r: { code: string; text: string }) {
  console.error(`voicelab ${what} error`, status, r.text.slice(0, 300));
  return new Error(status === 402 ? `${what}_no_credits` : `${what}_failed_${status}${r.code ? '_' + r.code : ''}`);
}
function wavDurationMs(b: Uint8Array): number | null {
  if (b.length < 44 || String.fromCharCode(b[0], b[1], b[2], b[3]) !== 'RIFF') return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let byteRate = 0;
  for (let o = 12; o + 8 <= b.length;) {
    const id = String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
    const size = dv.getUint32(o + 4, true);
    if (id === 'fmt ' && o + 20 <= b.length) byteRate = dv.getUint32(o + 16, true);
    if (id === 'data') return byteRate ? Math.round((Math.min(size, b.length - o - 8) * 1000) / byteRate) : null;
    o += 8 + size + (size % 2);
  }
  return null;
}

// The narrator's voice is picked by name among the VoiceLab voices that speak Uzbek; the samples in the app and
// /selftest use it. Each voice is listed with the model it belongs to.
type VlVoice = { id: string; name: string; model: string };
let vlVoices: VlVoice[] | null = null;
async function voicelabVoices() {
  if (vlVoices) return vlVoices;
  const auth = { headers: { Authorization: `Bearer ${AISHA_KEY}` } };
  // The model list needs a scope the key may lack; "lison" is the default model and is always asked.
  const langs = await fetch(`${VL_API}/v1/tts/languages`, auth).then(vlJson).catch(() => null);
  const models: string[] = ['lison'];
  for (const m of Array.isArray(langs?.body?.models) ? langs.body.models : []) {
    const id = String(m?.id ?? '');
    if (id && !models.includes(id) && models.length < 4) models.push(id);
  }
  const out: VlVoice[] = [];
  for (const model of models) {
    const res = await fetch(`${VL_API}/v1/voices?language=uz&model_id=${encodeURIComponent(model)}`, auth);
    const r = await vlJson(res);
    if (!res.ok) { if (model === 'lison') throw vlError('voices', res.status, r); continue; }
    const list: any[] = Array.isArray(r.body?.data) ? r.body.data : Array.isArray(r.body) ? r.body : [];
    for (const v of list) if (v?.id && !out.some((x) => x.id === String(v.id))) out.push({ id: String(v.id), name: String(v.name ?? ''), model });
  }
  if (!out.length) throw new Error('voices_none_for_uz');
  vlVoices = out;
  return out;
}
async function voicelabVoice(narrator = NARRATOR): Promise<VlVoice> {
  const override = (Deno.env.get('VOICELAB_VOICE_ID') ?? '').trim();
  if (override && narrator === NARRATOR) return { id: override, name: 'VOICELAB_VOICE_ID', model: 'lison' };
  const pick = (await voicelabVoices()).find((v) => norm(v.name).includes(narrator));
  if (!pick) throw new Error(`narrator_not_found_${narrator}`);
  return pick;
}
async function voicelabTts(textValue: string, narrator = NARRATOR): Promise<{ wav: Uint8Array; chars: number | null; voice: string }> {
  const voice = await voicelabVoice(narrator);
  const res = await fetch(`${VL_API}/v1/tts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${AISHA_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify({ text: textValue, language: 'uz', voice_id: voice.id, model_id: voice.model, speed: 1 }),
  });
  if (res.status === 200) {
    const chars = Number(res.headers.get('x-voicelab-characters-used'));
    return { wav: new Uint8Array(await res.arrayBuffer()), chars: Number.isFinite(chars) && chars > 0 ? chars : null, voice: voice.name };
  }
  const r = await vlJson(res);
  if (res.status === 202) throw new Error('tts_async_not_handled');
  throw vlError('tts', res.status, r);
}
// Narrator samples: one WAV per tongue twister at a normal tempo, in the public bucket, a folder per voice. The
// file name carries a hash of the voice and the text, so a changed text simply has no sample until a new one is made.
const sampleFolder = (narrator: string) => `${narrator}/v1`;
async function sampleFile(t: { id: number; text: string }, narrator = NARRATOR) {
  return `tw-${t.id}-${(await sha256Hex(`${narrator}|1|${t.text}`)).slice(0, 10)}.wav`;
}
const sampleUrl = (file: string, narrator = NARRATOR) => `${API}/storage/v1/object/public/${TTS_BUCKET}/${sampleFolder(narrator)}/${file}`;
// A tongue twister's sample in a folder listing: the exact name, or a studio take of it (that name plus a hash of the audio).
function sampleMatches(name: string, base: string) {
  return name === base || (name.startsWith(`${base.slice(0, -4)}-`) && name.endsWith('.wav'));
}
function findSample(names: Set<string>, base: string) {
  if (names.has(base)) return base;
  for (const n of names) if (sampleMatches(n, base)) return n;
  return null;
}
// Length in ms of a studio take: a 16-bit PCM mono WAV of 8-48 kHz, 0.3-15 seconds long; anything else is null.
function samplePcmMs(b: Uint8Array): number | null {
  const tag = (o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
  if (b.length < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let fmt = -1;
  for (let o = 12; o + 8 <= b.length;) {
    const size = dv.getUint32(o + 4, true);
    if (tag(o) === 'fmt ' && o + 24 <= b.length) fmt = o + 8;
    if (tag(o) === 'data') {
      if (fmt < 0 || dv.getUint16(fmt, true) !== 1 || dv.getUint16(fmt + 2, true) !== 1 || dv.getUint16(fmt + 14, true) !== 16) return null;
      const rate = dv.getUint32(fmt + 4, true);
      if (rate < 8000 || rate > 48000) return null;
      const ms = Math.round((Math.min(size, b.length - o - 8) / 2 / rate) * 1000);
      return ms >= 300 && ms <= 15_000 ? ms : null;
    }
    o += 8 + size + (size % 2);
  }
  return null;
}
const sampleCache = new Map<string, { at: number; names: Set<string> }>();
async function sampleNames(narrator = NARRATOR, fresh = false) {
  const hit = sampleCache.get(narrator);
  if (!fresh && hit && Date.now() - hit.at < 60_000) return hit.names;
  const { data, error } = await db.storage.from(TTS_BUCKET).list(sampleFolder(narrator), { limit: 500 });
  if (error) throw new Error('samples_list_failed');
  const names = new Set((data ?? []).map((f) => f.name));
  sampleCache.set(narrator, { at: Date.now(), names });
  return names;
}
// Which narrator the app plays: the one set with /selftest?voice=use (table tez_aytish_settings), else the default.
let narratorCache: { at: number; name: string } | null = null;
async function activeNarrator(fresh = false) {
  if (!fresh && narratorCache && Date.now() - narratorCache.at < 60_000) return narratorCache.name;
  const { data } = await db.from('tez_aytish_settings').select('value').eq('key', 'narrator').maybeSingle();
  const name = norm(String(data?.value ?? '')) || NARRATOR;
  narratorCache = { at: Date.now(), name };
  return name;
}
// Tidy a sample: cut the silence before and after the speech down to short margins and bring the peak to about
// -1 dBFS (at most 4 times up), so every sample starts at once and sounds equally loud. 16-bit PCM only.
function tidyWav(wav: Uint8Array) {
  if (wav.length < 44 || String.fromCharCode(wav[0], wav[1], wav[2], wav[3]) !== 'RIFF') return wav;
  const dv = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  let fmt = -1;
  for (let o = 12; o + 8 <= wav.length;) {
    const id = String.fromCharCode(wav[o], wav[o + 1], wav[o + 2], wav[o + 3]);
    const size = dv.getUint32(o + 4, true);
    if (id === 'fmt ' && o + 24 <= wav.length) fmt = o + 8;
    if (id === 'data') {
      if (fmt < 0 || dv.getUint16(fmt, true) !== 1 || dv.getUint16(fmt + 14, true) !== 16) return wav;
      const channels = dv.getUint16(fmt + 2, true), rate = dv.getUint32(fmt + 4, true), frame = channels * 2;
      const start = o + 8, frames = frame ? Math.floor(Math.min(size, wav.length - start) / frame) : 0;
      if (!frames || !rate) return wav;
      let peak = 0;
      for (let i = 0; i < frames * channels; i++) peak = Math.max(peak, Math.abs(dv.getInt16(start + i * 2, true)));
      if (!peak) return wav;
      const loud = (f: number) => {
        for (let c = 0; c < channels; c++) if (Math.abs(dv.getInt16(start + (f * channels + c) * 2, true)) > peak * 0.05) return true;
        return false;
      };
      let first = 0, last = frames - 1;
      while (first < last && !loud(first)) first++;
      while (last > first && !loud(last)) last--;
      const from = Math.max(0, first - Math.round(rate * 0.12)), to = Math.min(frames, last + 1 + Math.round(rate * 0.2));
      const gain = Math.min(4, 29000 / peak), bytes = (to - from) * frame;
      const out = new Uint8Array(44 + bytes), ov = new DataView(out.buffer);
      const put = (at: number, s: string) => { for (let i = 0; i < 4; i++) out[at + i] = s.charCodeAt(i); };
      put(0, 'RIFF'); ov.setUint32(4, 36 + bytes, true); put(8, 'WAVE'); put(12, 'fmt ');
      ov.setUint32(16, 16, true); ov.setUint16(20, 1, true); ov.setUint16(22, channels, true); ov.setUint32(24, rate, true);
      ov.setUint32(28, rate * frame, true); ov.setUint16(32, frame, true); ov.setUint16(34, 16, true); put(36, 'data'); ov.setUint32(40, bytes, true);
      for (let i = 0; i < bytes / 2; i++) {
        ov.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, Math.round(dv.getInt16(start + from * frame + i * 2, true) * gain))), true);
      }
      return out;
    }
    o += 8 + size + (size % 2);
  }
  return wav;
}

// ---------- Google Cloud Speech-to-Text v2 ----------

let saCache: { client_email: string; private_key: string; project_id: string; token_uri?: string; private_key_id?: string } | null = null;
function serviceAccount() {
  if (saCache) return saCache;
  const sa = parseServiceAccount(GOOGLE_SA_JSON);
  if (!sa) throw new Error('google_sa_invalid_json');
  if (!sa.client_email || !sa.private_key || !sa.project_id) throw new Error('google_sa_missing_fields');
  saCache = sa;
  return sa;
}
function googleStatus() {
  const base = { model: G_MODEL, location: G_LOCATION };
  try {
    const sa = serviceAccount();
    return { ...base, project: sa.project_id, account: sa.client_email, keyId: String(sa.private_key_id ?? '').slice(0, 12) };
  } catch (e) {
    // The pasted key cannot be used: describe its shape (never its content) so the paste can be fixed.
    return { ...base, error: e instanceof Error ? e.message : 'invalid', shape: saShape(GOOGLE_SA_JSON) };
  }
}

// The key JSON is pasted by hand into the dashboard, so accept the usual paste damage: wrapping quotes,
// escaped quotes, a JSON string holding the JSON, base64 of the file, raw line breaks inside the private key.
function parseServiceAccount(raw: string): any {
  const s = raw.replace(/^\uFEFF/, '').trim();
  const candidates = [s];
  const q = s[0];
  if (s.length > 1 && (q === "'" || q === '"' || q === '`') && s.endsWith(q)) candidates.push(s.slice(1, -1).trim());
  if (!s.startsWith('{') && /^[A-Za-z0-9+/=_\s-]+$/.test(s)) {
    try {
      const bin = atob(s.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/'));
      candidates.push(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))).trim());
    } catch { /* not base64 */ }
  }
  for (const c of candidates) {
    for (const textValue of [c, escapeLineBreaksInStrings(c), `"${c}"`]) {
      try {
        let v = JSON.parse(textValue);
        if (typeof v === 'string') v = JSON.parse(v);
        if (v && typeof v === 'object' && !Array.isArray(v)) return v;
      } catch { /* try the next form */ }
    }
  }
  return null;
}
function escapeLineBreaksInStrings(s: string) {
  let out = '';
  let inString = false, escaped = false;
  for (const ch of s) {
    if (!inString) { if (ch === '"') inString = true; out += ch; continue; }
    if (escaped) { escaped = false; out += ch; continue; }
    if (ch === '\\') { escaped = true; out += ch; continue; }
    if (ch === '"') { inString = false; out += ch; continue; }
    if (ch === '\n') { out += '\\n'; continue; }
    if (ch === '\r') continue;
    out += ch;
  }
  return out;
}
function saShape(s: string) {
  return {
    chars: s.length,
    lines: s.split(/\r\n|\r|\n/).length,
    first: s.slice(0, 1),
    last: s.slice(-1),
    serviceAccount: s.includes('service_account'),
    privateKey: s.includes('private_key'),
    clientEmail: s.includes('client_email'),
    looksLikePath: /\.json["'\s]*$/i.test(s) || /^["']?[a-z]:[\\/]/i.test(s),
  };
}

let tokenCache: { token: string; exp: number } | null = null;
async function googleAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.exp - 120 > now) return tokenCache.token;
  const sa = serviceAccount();
  const aud = sa.token_uri || 'https://oauth2.googleapis.com/token';
  const unsigned = `${b64url(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })))}.${b64url(enc.encode(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform', aud, iat: now, exp: now + 3600,
  })))}`;
  const pem = sa.private_key.replace(/\\n/g, '\n').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(unsigned)));
  const res = await fetch(aud, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${b64url(signature)}` }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    console.error('google token error', res.status, JSON.stringify(data).slice(0, 300));
    throw new Error(`google_auth_failed_${res.status}`);
  }
  tokenCache = { token: data.access_token, exp: now + Number(data.expires_in ?? 3600) };
  return tokenCache.token;
}

async function googleStt(wav: Uint8Array): Promise<Stt> {
  const sa = serviceAccount();
  const token = await googleAccessToken();
  const url = `https://${G_LOCATION}-speech.googleapis.com/v2/projects/${sa.project_id}/locations/${G_LOCATION}/recognizers/_:recognize`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ config: { autoDecodingConfig: {}, languageCodes: ['uz-UZ'], model: G_MODEL }, content: base64(wav) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('google stt error', res.status, JSON.stringify(data).slice(0, 500));
    throw new Error(`stt_failed_${res.status}`);
  }
  const alts = (Array.isArray(data?.results) ? data.results : []).map((r: any) => r?.alternatives?.[0]).filter(Boolean);
  const transcript = alts.map((a: any) => String(a.transcript ?? '')).join(' ').replace(/\s+/g, ' ').trim();
  const confs = alts.map((a: any) => a.confidence).filter((c: unknown) => typeof c === 'number' && c > 0) as number[];
  return {
    status: transcript ? 'Success' : 'NoMatch',
    display: transcript,
    lexical: transcript,
    confidence: confs.length ? Math.round((confs.reduce((s, c) => s + c, 0) / confs.length) * 1000) / 1000 : null,
  };
}

function b64url(bytes: Uint8Array) {
  return base64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function base64(bytes: Uint8Array) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

// ---------- judging ----------

type Verdict = 'ok' | 'near' | 'wrong' | 'missing';
type Heard = Exclude<Verdict, 'missing'>;
type WordResult = { t: string; d: string; h: string | null; v: Verdict };
type Aliases = Record<string, string[]>;
// What the recogniser writes for some words even when they are said right: seen on the teacher's own studio samples
// (with these all 20 pass with full stars; without them 5 failed and 3 lost a star) and, for «sharqladi», in most of
// the children's readings. Such a form counts as the word said right. A form with a space is one word written as two.
const ALIASES: Record<number, Aliases> = {
  7: { chori: ["cho'ri"], choyni: ['choyini'] },
  8: { "to'rg'ayni": ["to'rag'ayni"] },
  9: { sovqotadimi: ['sovuq qotadimi'] },
  11: { bobo: ['bobbo'] },
  12: { sharhladi: ['shartladi', 'sharqladi'] },
  14: { qattiq: ['qattiqmi'], paxtani: ['paxtari'] },
  17: { "ko'rk": ["cho'rk"] },
};
// One reading of the tongue twister is looked for inside everything that was heard. Words before it (a start
// signal, a false start) and after it (a second reading, talk) cost nothing, and of equally good readings the first
// is taken; `before` and `after` count those words. Inside the reading two neighbouring words written as one
// (mis barkash -> misbarkash, rang-barang -> rangbarang) or one word written as two (temiryo'lchi -> temir yo'lchi)
// are judged part by part, and more than one stray word still fails it. readMs is the share of the speech time
// that belongs to the reading, by its share of the letters heard. If not one word of the tongue twister was heard
// (someone else's voice, another text), it was not an attempt: the status becomes NoMatch, which the page and the
// lesson results treat as unclear audio, so the check is not used up.
function judge(target: string, stt: Stt, opt: { aliases?: Aliases; speechMs?: number | null } = {}) {
  const display = displayTokens(target);
  const tgt = display.map(norm);
  const none = { passed: false, confidence: null as number | null, extras: [] as string[], before: 0, after: 0, readMs: null as number | null };
  if (stt.status !== 'Success') {
    return { ...none, status: stt.status, recognized: '', words: display.map((d, i) => ({ t: tgt[i], d, h: null, v: 'missing' as Verdict })) };
  }
  const heard = tokens(stt.lexical || stt.display);
  const a = align(tgt, heard, opt.aliases ?? {});
  const words: WordResult[] = a.words.map((w, i) => ({ ...w, d: display[i] }));
  const letters = (ws: string[]) => ws.reduce((s, w) => s + w.replace(/'/g, '').length, 0);
  const all = letters(heard);
  const readMs = typeof opt.speechMs === 'number' ? Math.round(opt.speechMs * (all ? letters(heard.slice(a.start, a.end)) / all : 1)) : null;
  const matched = words.some((w) => w.v === 'ok' || w.v === 'near');
  const passed = matched && words.every((w) => w.v === 'ok' || w.v === 'near') && a.extras.length <= 1;
  return {
    status: matched ? 'Success' : 'NoMatch', passed, recognized: stt.display || stt.lexical, confidence: stt.confidence,
    words, extras: a.extras, before: a.start, after: heard.length - a.end, readMs,
  };
}

const APOS = /[ʻʼ‘’`´'ʹ′]/g;
const CYR: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', ғ: "g'", д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', қ: 'q', л: 'l',
  м: 'm', н: 'n', о: 'o', ў: "o'", п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ҳ: 'h', ц: 's', ч: 'ch', ш: 'sh',
  ъ: "'", ь: '', ы: 'i', э: 'e', ю: 'yu', я: 'ya',
};
function norm(word: string) {
  let w = word.toLowerCase().replace(/[Ѐ-ӿ]/g, (ch) => CYR[ch] ?? ch).replace(APOS, "'");
  w = w.replace(/[^a-z']/g, '').replace(/^'+/, '');
  if (/'$/.test(w) && !/[og]'$/.test(w)) w = w.replace(/'+$/, '');
  return w;
}
function displayTokens(textValue: string) {
  return textValue.split(/[\s\-–—]+/).map((w) => w.replace(/[.,!?;:«»"()]/g, '')).filter((w) => norm(w).length > 0);
}
function tokens(textValue: string) {
  return displayTokens(textValue).map(norm).filter(Boolean);
}
function lev(a: string, b: string) {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}
// Swaps a diction coach counts as errors even when the spelling is only one letter off.
const DICTION_SWAPS = [['q', 'k'], ['x', 'h'], ['ch', 'sh'], ['r', 'l'], ['s', 'sh']];
function isDictionSwap(t: string, h: string) {
  for (const [a, b] of DICTION_SWAPS) {
    for (const [from, to] of [[a, b], [b, a]]) {
      for (let i = t.indexOf(from); i >= 0; i = t.indexOf(from, i + 1)) {
        if (t.slice(0, i) + to + t.slice(i + from.length) === h) return true;
      }
    }
  }
  return false;
}
// Slow, syllable-by-syllable reading often puts a short vowel between two consonants (qir-da -> qi-ri-da) and the
// recogniser writes it down; one such extra vowel is not a diction error.
const VOWELS = 'aeiou';
function isExtraVowel(t: string, h: string) {
  if (h.length !== t.length + 1) return false;
  for (let i = 1; i < h.length - 1; i++) {
    if (VOWELS.includes(h[i]) && !VOWELS.includes(h[i - 1]) && !VOWELS.includes(h[i + 1]) && h.slice(0, i) + h.slice(i + 1) === t) return true;
  }
  return false;
}
function wordVerdict(t: string, h: string, al: Aliases = {}): Heard {
  if (t === h || (Object.hasOwn(al, t) && al[t].includes(h))) return 'ok';
  // Only the apostrophe differs. A gʻ/oʻ of the target that was not heard is a real error (a different sound in
  // Uzbek); an extra apostrophe the target lacks is usually the recogniser's spelling, so it only counts as near.
  if (t.replace(/'/g, '') === h.replace(/'/g, '')) {
    return (h.match(/'/g)?.length ?? 0) > (t.match(/'/g)?.length ?? 0) ? 'near' : 'wrong';
  }
  if (isExtraVowel(t, h)) return 'near';
  if (isDictionSwap(t, h)) return 'wrong';
  if (lev(t, h) === 1 && Math.min(t.length, h.length) >= 6) return 'near';
  // The everyday -ni for the bookish -ning (barkashni ichida): the word is understood, the ending is to be said out.
  if (t.endsWith('ning') && wordVerdict(t.slice(0, -2), h, al) !== 'wrong') return 'near';
  return 'wrong';
}
// One target word written as two heard words: only when they join into the word exactly or are a known spelling.
function isSplitWord(t: string, h1: string, h2: string, al: Aliases) {
  return h1 + h2 === t || (Object.hasOwn(al, t) && al[t].includes(`${h1} ${h2}`));
}
// Two neighbouring target words written as one heard word: the cut that judges the two parts best, as long as
// at least one part is right or nearly right (otherwise the word is simply a wrong one).
function bestCut(t1: string, t2: string, h: string, al: Aliases) {
  let best: { c: number; at: number; v1: Heard; v2: Heard } | null = null;
  for (let at = 1; at < h.length; at++) {
    const v1 = wordVerdict(t1, h.slice(0, at), al), v2 = wordVerdict(t2, h.slice(at), al);
    const c = COST[v1] + COST[v2];
    if (c < 2 * COST.wrong && (!best || c < best.c)) best = { c, at, v1, v2 };
  }
  return best;
}
const COST: Record<Heard, number> = { ok: 0, near: 30, wrong: 100 };
// A missing word costs a little more than a wrong one, so a word said wrongly at the edge of the reading is shown
// with what was heard instead of as missing.
const MISS = 105, EXTRA = 100;
type Move = { k: 'sub'; v: Heard } | { k: 'two' } | { k: 'cut'; at: number; v1: Heard; v2: Heard } | { k: 'miss' } | { k: 'extra' };
// The cheapest way to read the target out of the heard words. Heard words before the first and after the last
// word of the reading are free: `start` and `end` bound the reading inside `heard`.
function align(tgt: string[], heard: string[], al: Aliases) {
  const n = tgt.length, m = heard.length;
  const cost: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  const back: (Move | null)[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(null));
  for (let i = 1; i <= n; i++) {
    for (let j = 0; j <= m; j++) {
      let best = Infinity, mv: Move | null = null;
      const take = (c: number, move: Move) => { if (c < best) { best = c; mv = move; } };
      if (j >= 1) {
        const v = wordVerdict(tgt[i - 1], heard[j - 1], al);
        take(cost[i - 1][j - 1] + COST[v], { k: 'sub', v });
      }
      if (j >= 2 && isSplitWord(tgt[i - 1], heard[j - 2], heard[j - 1], al)) take(cost[i - 1][j - 2], { k: 'two' });
      if (i >= 2 && j >= 1) {
        const cut = bestCut(tgt[i - 2], tgt[i - 1], heard[j - 1], al);
        if (cut) take(cost[i - 2][j - 1] + cut.c, { k: 'cut', at: cut.at, v1: cut.v1, v2: cut.v2 });
      }
      take(cost[i - 1][j] + MISS, { k: 'miss' });
      if (j >= 1) take(cost[i][j - 1] + EXTRA, { k: 'extra' });
      cost[i][j] = best;
      back[i][j] = mv;
    }
  }
  let end = 0;
  for (let j = 1; j <= m; j++) if (cost[n][j] < cost[n][end]) end = j;
  const words: { t: string; h: string | null; v: Verdict }[] = [];
  const extras: string[] = [];
  let i = n, j = end;
  while (i > 0) {
    const mv = back[i][j] as Move;
    if (mv.k === 'sub') {
      words.unshift({ t: tgt[i - 1], h: heard[j - 1], v: mv.v });
      i--; j--;
    } else if (mv.k === 'two') {
      words.unshift({ t: tgt[i - 1], h: `${heard[j - 2]} ${heard[j - 1]}`, v: 'ok' });
      i--; j -= 2;
    } else if (mv.k === 'cut') {
      const h = heard[j - 1];
      words.unshift({ t: tgt[i - 2], h: h.slice(0, mv.at), v: mv.v1 }, { t: tgt[i - 1], h: h.slice(mv.at), v: mv.v2 });
      i -= 2; j--;
    } else if (mv.k === 'miss') {
      words.unshift({ t: tgt[i - 1], h: null, v: 'missing' });
      i--;
    } else {
      extras.unshift(heard[j - 1]);
      j--;
    }
  }
  return { words, extras, start: j, end };
}

// ---------- helpers ----------

function parseMeta(raw: FormDataEntryValue | null) {
  if (typeof raw !== 'string' || raw.length > MAX_META) throw new Error('invalid_meta');
  let m: any;
  try { m = JSON.parse(raw); } catch { throw new Error('invalid_meta'); }
  if (!m || typeof m !== 'object' || Array.isArray(m)) throw new Error('invalid_meta');
  const int = (v: unknown, max: number) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max ? (v as number) : null);
  return {
    twisterId: Number(m.twisterId),
    stage: m.stage as Stage,
    attempt: int(m.attempt, 50) ?? 1,
    consent: m.consent === true,
    home: m.home === true,
    speechMs: int(m.speechMs, 60_000),
    durationMs: int(m.durationMs, 60_000),
    platform: text(m.platform, 40),
    studentId: typeof m.studentId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(m.studentId) ? m.studentId : null,
    lessonKey: typeof m.lessonKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(m.lessonKey) ? m.lessonKey : null,
    child: typeof m.child === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(m.child) ? m.child : null,
  };
}
function isWav16kMono(b: Uint8Array) {
  if (b.length < 44) return false;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const tag = (o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE' || tag(12) !== 'fmt ') return false;
  const format = dv.getUint16(20, true), channels = dv.getUint16(22, true), rate = dv.getUint32(24, true), bits = dv.getUint16(34, true);
  return format === 1 && channels === 1 && rate === 16000 && bits === 16 && b.length <= 44 + 32000 * MAX_WAV_SECONDS;
}
function wavFromPcm16k(pcm: Uint8Array) {
  const out = new Uint8Array(44 + pcm.length);
  const dv = new DataView(out.buffer);
  const put = (o: number, s: string) => { for (let i = 0; i < 4; i++) out[o + i] = s.charCodeAt(i); };
  put(0, 'RIFF'); dv.setUint32(4, 36 + pcm.length, true); put(8, 'WAVE'); put(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, 16000, true);
  dv.setUint32(28, 32000, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); put(36, 'data'); dv.setUint32(40, pcm.length, true);
  out.set(pcm, 44);
  return out;
}
function xmlEscape(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
async function isActiveAdmin(telegramId: number) {
  const { data, error } = await db.from('admins').select('id').eq('telegram_user_id', telegramId).eq('active', true).maybeSingle();
  return !error && !!data;
}
async function readBody(req: Request) {
  if (!req.body) throw new Error('empty_body');
  const reader = req.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BODY) { await reader.cancel(); throw new Error('body_too_large'); }
    parts.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const p of parts) { all.set(p, at); at += p.length; }
  return all;
}
async function readForm(req: Request) {
  const type = req.headers.get('content-type') ?? '';
  if (!type.toLowerCase().startsWith('multipart/form-data')) throw new Error('multipart_required');
  return await new Response(await readBody(req), { headers: { 'content-type': type } }).formData();
}
async function readJson(req: Request) {
  try { return JSON.parse(new TextDecoder().decode(await readBody(req))); } catch { throw new Error('bad_json'); }
}

// Telegram WebApp initData, valid for 1 hour, signed with the token of the bot the page was opened from: the app's
// own bot, the family bot @kidscast_bot when a child says the homework at home, or the parents' bot of Super
// Intellekt Kids for the child's daily tongue twister.
async function verifyInitData(raw: string): Promise<{ id: number; via: string } | null> {
  if (!raw || raw.length > 8192 || !APP_BOT_TOKEN) return null;
  const params = new URLSearchParams(raw);
  const supplied = (params.get('hash') ?? '').toLowerCase();
  const authDate = Number(params.get('auth_date'));
  const userText = params.get('user');
  if (!/^[a-f0-9]{64}$/.test(supplied) || !Number.isFinite(authDate) || Date.now() / 1000 - authDate > 3600 || authDate > Date.now() / 1000 + 30 || !userText) return null;
  params.delete('hash');
  const checkString = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  let via = '';
  for (const [name, token] of [['app', APP_BOT_TOKEN], ['family', FAMILY_BOT_TOKEN], ['lite', LITE_BOT_TOKEN]]) {
    if (!token || via) continue;
    const secret = await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', enc.encode('WebAppData'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), enc.encode(token));
    const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(checkString)));
    if (constantTimeEqual([...digest].map((x) => x.toString(16).padStart(2, '0')).join(''), supplied)) via = name;
  }
  if (!via) return null;
  try {
    const user = JSON.parse(userText);
    return Number.isSafeInteger(user.id) && user.id > 0 ? { id: user.id, via } : null;
  } catch { return null; }
}
async function limit(key: string, max: number, seconds: number) {
  const { data, error } = await db.rpc('yba_consume_rate_limit_internal', { p_bucket_hash: await sha256Hex(key), p_max_requests: max, p_window_seconds: seconds });
  return !error && data === true;
}
function text(value: unknown, max: number) { return typeof value === 'string' ? value.slice(0, max) : null; }
function constantTimeEqual(a: string, b: string) {
  const aa = enc.encode(a), bb = enc.encode(b);
  let d = aa.length ^ bb.length;
  for (let i = 0; i < Math.max(aa.length, bb.length); i++) d |= (aa[i] ?? 0) ^ (bb[i] ?? 0);
  return d === 0;
}
async function sha256Hex(v: string | Uint8Array) {
  const x = new Uint8Array(await crypto.subtle.digest('SHA-256', typeof v === 'string' ? enc.encode(v) : v));
  return [...x].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function cors(origin: string) {
  return {
    'access-control-allow-origin': ORIGINS.has(origin) ? origin : 'null',
    'access-control-allow-headers': 'content-type,x-telegram-init-data',
    'access-control-allow-methods': 'POST,OPTIONS',
    'access-control-max-age': '600',
    'vary': 'Origin',
  };
}
function reply(origin: string, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors(origin), 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

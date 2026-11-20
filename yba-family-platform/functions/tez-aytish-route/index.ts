// Supabase Edge Function: tez-aytish-route (v2) — project trxnsqpdekokqvtefxlt; source kept in zamonaviy-kasblar-crm/yba-family-platform/
// «Dars yoʻli»: the teacher's lesson route for the Tez aytish groups. A lesson is 90 minutes in 5 stages; the platform
// shows the teacher what to do now and opens the next stage only when the current one is done:
//   1 Darsni boshlash (5 min)  the course lesson for today is chosen, the week's module is set, at least one «Keldi»
//   2 Tez aytish (25)          every child marked «Keldi» passed the lesson's 4 tongue twisters in the trainer
//   3 Mavzu darsi (30)         the course lesson with its printed worksheet; every child present got a score 0-5
//   4 Kamera oldida (20)       every child present filmed a 30-second video
//   5 Yakun (10)               praise, homework; «Darsni yakunlash» finishes the run and sends the owner the report
// Stages 2-4 can be passed without the condition once their planned time is over, with a reason written down.
// POST /tez-aytish-route/{action} with the header x-telegram-init-data (the kids' bot Mini App):
//   state  { groupId? }                   the teacher's groups, the course lessons, the lesson days, today's run + gate
//   start  { groupId, lessonId }          start today's run with that course lesson (or change it during stage 1)
//   next   { groupId, reason? }           finish the current stage and open the next one (stage 5: finish the lesson)
//   check  { groupId, stage, studentId, value }   stage 3: score 0-5 or null; stage 4: filmed true / false
// POST /tez-aytish-route/tick with x-cron-secret (pg_cron, every 5 minutes, secret in tez_aytish_settings.cron_secret):
//   15 min before the lesson a reminder to the teacher; 10 min after the start with no run an alert to the owner and the
//   teacher; a stage running 10+ min over plan an alert to the owner; a report 150 min after the start if the teacher
//   did not finish; on Sunday from 20:00 the week's summary to the owner; and the bot menu button «Dars yoʻli» for
//   every active teacher and admin (removed again when they stop being one). Owner = an active row of `admins`.
// Testing: x-selftest-token (sha256 below) acts as the Telegram user in x-selftest-as and never sends bot messages;
// on /tick it makes a dry run ({ now: ISO } sets the clock) that changes nothing and returns what it would send.
import { createClient } from 'npm:@supabase/supabase-js@2.95.0';

const enc = new TextEncoder();
const API = Deno.env.get('SUPABASE_URL') ?? '';
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const APP_BOT_TOKEN = (Deno.env.get('TELEGRAM_KIDS_BOT_TOKEN') ?? '').trim() || (Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '').trim();
const ORIGINS = new Set(
  (Deno.env.get('TEZ_AYTISH_ORIGINS') ?? 'https://platform770uz-dev.github.io').split(',').map((s) => s.trim()).filter(Boolean),
);
// The deployed version also lists the trainer team's selftest hash here (as tez-aytish-teacher does); the public
// repository keeps only the secret.
const SELFTEST_SHA256 = [
  (Deno.env.get('TEZ_AYTISH_SELFTEST_SHA256') ?? '').trim(),
].filter(Boolean);
const ROUTE_URL = 'https://platform770uz-dev.github.io/zamonaviy-kasblar-crm/dars-yoli/';
const MENU_TEXT = 'Dars yoʻli';
const TZ_MS = 5 * 3600_000; // Asia/Tashkent is UTC+5 all year
const CLASS_SIZE = 4; // tongue twisters done in class, as in tez-aytish-teacher
const MAX_BODY = 16_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STAGES = [
  { n: 1, title: 'Darsni boshlash', min: 5 },
  { n: 2, title: 'Tez aytish', min: 25 },
  { n: 3, title: 'Mavzu darsi', min: 30 },
  { n: 4, title: 'Kamera oldida', min: 20 },
  { n: 5, title: 'Yakun', min: 10 },
];
const OVERRIDABLE = new Set([2, 3, 4]);
const REMIND_BEFORE_MIN = 15, LATE_AFTER_MIN = 10, OVERRUN_MIN = 10, REPORT_AFTER_MIN = 150, WEEKLY_AT_MIN = 20 * 60;
const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];

const db = createClient(API, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
function fail(status: number, message: string): never { throw new HttpError(status, message); }

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') ?? '';
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== 'POST') return reply(origin, { error: 'method_not_allowed' }, 405);
  if (!API || !KEY) return reply(origin, { error: 'server_not_configured' }, 500);
  const action = new URL(req.url).pathname.split('/').filter(Boolean).at(-1) ?? '';
  try {
    if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY) fail(413, 'body_too_large');
    if (action === 'tick') {
      const cron = await cronAllowed(req);
      const test = cron ? false : await selftestOk(req);
      if (!cron && !test) fail(403, 'forbidden');
      const body = await readJson(req);
      const now = test && typeof body?.now === 'string' && Number.isFinite(Date.parse(body.now)) ? Date.parse(body.now) : Date.now();
      return reply(origin, await tick(test || body?.dry === true, now));
    }
    let user = await selftestUser(req);
    if (!user) {
      if (!APP_BOT_TOKEN) fail(500, 'server_not_configured');
      if (!ORIGINS.has(origin)) fail(403, 'origin_not_allowed');
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
      if (!await limit(`tezr-ip:${ip}`, 90, 60)) fail(429, 'rate_limited');
      user = await verifyInitData(req.headers.get('x-telegram-init-data') ?? '');
      if (!user) fail(401, 'invalid_or_expired_init_data');
      if (!await limit(`tezr-tg:${user.id}`, 60, 60)) fail(429, 'rate_limited');
    }
    const body = await readJson(req);
    const me = await whoAmI(user);
    if (!me.owner && !me.teacher) fail(403, 'not_a_teacher');
    if (action === 'state') return reply(origin, await state(me, body));
    if (action === 'start') return reply(origin, await start(me, body));
    if (action === 'next') return reply(origin, await next(me, body));
    if (action === 'check') return reply(origin, await check(me, body));
    fail(404, 'not_found');
  } catch (e) {
    if (e instanceof HttpError) return reply(origin, { error: e.message }, e.status);
    const message = e instanceof Error ? e.message : String(e);
    console.error('tez-aytish-route', action, message);
    return reply(origin, { error: message || 'request_failed' }, 500);
  }
});

// ---------- who is asking ----------

type TgUser = { id: number; name: string; username: string | null; selftest?: boolean };
type Me = TgUser & { owner: boolean; teacher: boolean };

async function whoAmI(user: TgUser): Promise<Me> {
  const [admin, teacher] = await Promise.all([
    db.from('admins').select('id').eq('telegram_user_id', user.id).eq('active', true).maybeSingle(),
    db.from('tez_aytish_teachers').select('status').eq('telegram_user_id', user.id).maybeSingle(),
  ]);
  return { ...user, owner: !admin.error && !!admin.data, teacher: teacher.data?.status === 'active' };
}

// ---------- dates (Tashkent calendar days as 'YYYY-MM-DD') ----------

const dayOf = (ms: number) => new Date(ms + TZ_MS).toISOString().slice(0, 10);
function addDays(key: string, n: number) {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function weekday(key: string) { const w = new Date(`${key}T00:00:00Z`).getUTCDay(); return w === 0 ? 7 : w; } // Monday 1 ... Sunday 7
const weekStart = (key: string) => addDays(key, 1 - weekday(key));
const dateLabel = (key: string) => { const d = new Date(`${key}T00:00:00Z`); return `${d.getUTCDate()}-${MONTHS[d.getUTCMonth()]}`; };
const clock = (ms: number) => new Date(ms + TZ_MS).toISOString().slice(11, 16);
const minutesOfDay = (ms: number) => { const d = new Date(ms + TZ_MS); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
// The lesson's start as a UTC instant: the group's lesson_time on that Tashkent day.
function lessonStart(key: string, time: string | null) {
  if (!time) return null;
  const t = /^(\d{2}):(\d{2})/.exec(time);
  return t ? Date.parse(`${key}T${t[1]}:${t[2]}:00Z`) - TZ_MS : null;
}

// ---------- loading ----------

type Group = { id: string; teacher_id: number; name: string; lesson_days: number[]; lesson_time: string | null; taught_before: number; created_at: string };
type StageLog = { n: number; started_at: string; finished_at?: string | null; override?: string | null };
type Run = {
  group_id: string; lesson_key: string; course_lesson_id: string | null; teacher_id: number; stage: number; stages: StageLog[];
  checks: Record<string, Record<string, unknown>>; alerts: Record<string, string>; started_at: string; finished_at: string | null;
  report_sent_at: string | null; updated_at: string;
};
type Lesson = { id: string; num: number; title: string | null; kind: string | null; sheet_url: string | null; plan: { min: number; text: string }[]; homework: string | null };
type Kid = { id: string; name: string; present: boolean; done: number; score: number | null; filmed: boolean };

const GROUP_COLS = 'id,teacher_id,name,lesson_days,lesson_time,taught_before,created_at';
const normGroup = (g: any): Group => ({ ...g, teacher_id: Number(g.teacher_id), lesson_days: (g.lesson_days ?? []).map(Number), taught_before: Number(g.taught_before ?? 0) });

async function visibleGroups(me: Me) {
  let q = db.from('tez_aytish_groups').select(GROUP_COLS).is('archived_at', null).order('created_at');
  if (!me.owner) q = q.eq('teacher_id', me.id);
  const { data, error } = await q;
  if (error) throw new Error('groups_query_failed');
  return (data ?? []).map(normGroup);
}
async function groupFor(me: Me, id: unknown) {
  if (typeof id !== 'string' || !UUID.test(id)) fail(400, 'bad_group');
  const { data } = await db.from('tez_aytish_groups').select(`${GROUP_COLS},archived_at`).eq('id', id).maybeSingle();
  if (!data || data.archived_at || (!me.owner && Number(data.teacher_id) !== me.id)) fail(404, 'group_not_found');
  return normGroup(data);
}
async function loadLessons() {
  const { data, error } = await db.from('tez_aytish_course_lessons').select('id,num,title,kind,sheet_url,plan,homework').eq('active', true).order('num');
  if (error) throw new Error('lessons_query_failed');
  return (data ?? []).map((l) => ({ ...l, num: Number(l.num), plan: Array.isArray(l.plan) ? l.plan : [] })) as Lesson[];
}
async function loadRun(groupId: string, key: string) {
  const { data, error } = await db.from('tez_aytish_lesson_runs').select('*').eq('group_id', groupId).eq('lesson_key', key).maybeSingle();
  if (error) throw new Error('run_query_failed');
  return data ? { ...data, stage: Number(data.stage), teacher_id: Number(data.teacher_id), stages: data.stages ?? [], checks: data.checks ?? {}, alerts: data.alerts ?? {} } as Run : null;
}
async function teacherName(id: number) {
  const { data } = await db.from('tez_aytish_teachers').select('name,username').eq('telegram_user_id', id).maybeSingle();
  return data?.name || (data?.username ? `@${data.username}` : `ID ${id}`);
}

// The day of a group: its students with «Keldi», the lesson's tongue twisters each passed (as in tez-aytish-teacher:
// a clear check of the «tez» stage with the student's id), the score and the camera mark of the run.
async function groupDay(g: Group, key: string, run: Run | null) {
  const [students, attendance, week] = await Promise.all([
    db.from('tez_aytish_students').select('id,first_name,last_name').eq('group_id', g.id).eq('active', true).order('first_name').order('last_name'),
    db.from('tez_aytish_attendance').select('student_id,status').eq('group_id', g.id).eq('lesson_key', key),
    db.from('tez_aytish_group_weeks').select('module_id').eq('group_id', g.id).eq('week_start', weekStart(key)).maybeSingle(),
  ]);
  if (students.error || attendance.error) throw new Error('day_query_failed');
  const moduleId: string | null = week.data?.module_id ?? null;
  let module: { id: string; title: string; ids: number[] } | null = null;
  if (moduleId) {
    const { data: m } = await db.from('tez_aytish_modules').select('id,title,twister_ids').eq('id', moduleId).maybeSingle();
    if (m) module = { id: m.id, title: m.title, ids: (m.twister_ids ?? []).map(Number).slice(0, CLASS_SIZE) };
  }
  const passed = new Map<string, Set<number>>();
  if (module?.ids.length) {
    const { data: tries, error } = await db.from('tez_aytish_attempts').select('student_id,twister_id')
      .eq('group_id', g.id).eq('lesson_key', key).eq('stage', 'tez').eq('stt_status', 'Success').not('student_id', 'is', null).limit(5000);
    if (error) throw new Error('attempts_query_failed');
    for (const t of tries ?? []) {
      if (!module.ids.includes(Number(t.twister_id))) continue;
      const s = passed.get(t.student_id) ?? new Set<number>();
      s.add(Number(t.twister_id));
      passed.set(t.student_id, s);
    }
  }
  const present = new Set((attendance.data ?? []).filter((a) => a.status === 'keldi').map((a) => a.student_id));
  const scores = (run?.checks?.['3'] ?? {}) as Record<string, unknown>;
  const filmed = (run?.checks?.['4'] ?? {}) as Record<string, unknown>;
  const kids: Kid[] = (students.data ?? []).map((s) => ({
    id: s.id, name: `${s.first_name}${s.last_name ? ` ${s.last_name}` : ''}`, present: present.has(s.id),
    done: passed.get(s.id)?.size ?? 0, score: typeof scores[s.id] === 'number' ? scores[s.id] as number : null, filmed: filmed[s.id] === true,
  }));
  return { kids, module };
}

// Whether the current stage may close: what is still missing.
function gateOf(stage: number, run: Run | null, kids: Kid[], module: { ids: number[] } | null) {
  const present = kids.filter((k) => k.present);
  const need: string[] = [];
  let left: string[] = [];
  if (stage === 1) {
    if (!run?.course_lesson_id) need.push('lesson');
    if (!module || !module.ids.length) need.push('module');
    if (!present.length) need.push('attendance');
  } else if (stage === 2) {
    if (!module || !module.ids.length) need.push('module');
    if (!present.length) need.push('attendance');
    left = present.filter((k) => k.done < (module?.ids.length ?? CLASS_SIZE)).map((k) => k.name);
  } else if (stage === 3) {
    left = present.filter((k) => k.score === null).map((k) => k.name);
  } else if (stage === 4) {
    left = present.filter((k) => !k.filmed).map((k) => k.name);
  }
  if (left.length) need.push('kids');
  return { ok: !need.length, need, left, present: present.length, total: kids.length };
}
function currentLog(run: Run) { return run.stages.find((s) => s.n === run.stage && !s.finished_at) ?? null; }

// ---------- actions ----------

async function state(me: Me, b: any) {
  const now = Date.now();
  const today = dayOf(now);
  const [groups, lessons] = await Promise.all([visibleGroups(me), loadLessons()]);
  const base = { ok: true, role: me.owner ? 'owner' : 'teacher', name: me.name, today, now: new Date(now).toISOString(), stages: STAGES, lessons };
  const brief = groups.map((g) => ({ id: g.id, name: g.name, days: g.lesson_days, lessonTime: g.lesson_time?.slice(0, 5) ?? null, mine: g.teacher_id === me.id }));
  const g = groups.find((x) => x.id === b?.groupId)
    ?? groups.find((x) => x.teacher_id === me.id && x.lesson_days.includes(weekday(today)))
    ?? groups.find((x) => x.lesson_days.includes(weekday(today)) && x.lesson_time)
    ?? groups.find((x) => x.teacher_id === me.id) ?? groups[0];
  if (!g) return { ...base, groups: brief, group: null };
  return { ...base, groups: brief, group: await groupView(g, today, now, lessons) };
}

async function groupView(g: Group, today: string, now: number, lessons: Lesson[]) {
  const run = await loadRun(g.id, today);
  const [{ kids, module }, history] = await Promise.all([groupDay(g, today, run), historyOf(g, today, lessons)]);
  const stage = run && run.stage <= 5 ? run.stage : null;
  const log = run ? currentLog(run) : null;
  const gate = stage ? gateOf(stage, run, kids, module) : gateOf(1, run, kids, module);
  const spec = stage ? STAGES[stage - 1] : null;
  const elapsedMin = log ? Math.floor((now - Date.parse(log.started_at)) / 60000) : 0;
  const taught = new Set<number>(lessons.filter((l) => l.num <= g.taught_before).map((l) => l.num));
  for (const h of history.past) if (h.lessonNum && h.status !== 'trainer') taught.add(h.lessonNum);
  const lessonOfRun = run?.course_lesson_id ? lessons.find((l) => l.id === run.course_lesson_id) ?? null : null;
  const suggested = lessonOfRun ?? lessons.find((l) => !taught.has(l.num)) ?? null;
  const start = lessonStart(today, g.lesson_time);
  return {
    id: g.id, name: g.name, days: g.lesson_days, lessonTime: g.lesson_time?.slice(0, 5) ?? null, taughtBefore: g.taught_before,
    isLessonDay: g.lesson_days.includes(weekday(today)), startsAt: start ? new Date(start).toISOString() : null,
    taught: [...taught].sort((a, b) => a - b), suggestedLessonId: suggested?.id ?? null,
    module: module ? { id: module.id, title: module.title, count: module.ids.length } : null, weekStart: weekStart(today),
    kids, history,
    run: run ? {
      lessonKey: run.lesson_key, lessonId: run.course_lesson_id, stage: run.stage, stages: run.stages, startedAt: run.started_at,
      finishedAt: run.finished_at, teacherId: run.teacher_id,
    } : null,
    gate: { ...gate, stage: stage ?? 1, elapsedMin, planMin: spec?.min ?? 5,
      canOverride: !!stage && OVERRIDABLE.has(stage) && !gate.ok && elapsedMin >= (spec?.min ?? 0),
      overrideInMin: stage && OVERRIDABLE.has(stage) ? Math.max(0, (spec?.min ?? 0) - elapsedMin) : null },
  };
}

// Lesson days of the group: past days (with the route's run, or trainer activity before the route existed), and the
// next 4 lesson days.
async function historyOf(g: Group, today: string, lessons: Lesson[]) {
  const [runs, att, tries] = await Promise.all([
    db.from('tez_aytish_lesson_runs').select('lesson_key,course_lesson_id,stage,started_at,finished_at').eq('group_id', g.id).lt('lesson_key', today)
      .order('lesson_key', { ascending: false }).limit(30),
    db.from('tez_aytish_attendance').select('lesson_key').eq('group_id', g.id).lt('lesson_key', today).limit(2000),
    db.from('tez_aytish_attempts').select('lesson_key').eq('group_id', g.id).lt('lesson_key', today).not('student_id', 'is', null).limit(5000),
  ]);
  const byId = new Map(lessons.map((l) => [l.id, l]));
  const past = new Map<string, { date: string; lessonNum: number | null; title: string | null; status: 'done' | 'unfinished' | 'trainer'; startedAt: string | null }>();
  for (const k of [...(att.data ?? []), ...(tries.data ?? [])].map((r) => String(r.lesson_key))) {
    if (!past.has(k)) past.set(k, { date: k, lessonNum: null, title: null, status: 'trainer', startedAt: null });
  }
  for (const r of runs.data ?? []) {
    const l = r.course_lesson_id ? byId.get(r.course_lesson_id) : undefined;
    past.set(String(r.lesson_key), { date: String(r.lesson_key), lessonNum: l?.num ?? null, title: l?.title ?? null, status: r.finished_at ? 'done' : 'unfinished', startedAt: r.started_at });
  }
  const upcoming: string[] = [];
  for (let k = addDays(today, 1); upcoming.length < 4 && g.lesson_days.length; k = addDays(k, 1)) if (g.lesson_days.includes(weekday(k))) upcoming.push(k);
  return { past: [...past.values()].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 12), upcoming };
}

async function start(me: Me, b: any) {
  const g = await groupFor(me, b?.groupId);
  const lessons = await loadLessons();
  const lesson = lessons.find((l) => l.id === b?.lessonId);
  if (!lesson) fail(400, 'bad_lesson');
  const now = Date.now();
  const key = dayOf(now);
  const run = await loadRun(g.id, key);
  if (run) {
    if (run.course_lesson_id !== lesson.id) {
      if (run.stage !== 1) fail(409, 'already_started');
      const { error } = await db.from('tez_aytish_lesson_runs').update({ course_lesson_id: lesson.id, updated_at: new Date(now).toISOString() })
        .eq('group_id', g.id).eq('lesson_key', key).eq('stage', 1);
      if (error) throw new Error('run_update_failed');
    }
  } else {
    const at = new Date(now).toISOString();
    const { error } = await db.from('tez_aytish_lesson_runs').insert({
      group_id: g.id, lesson_key: key, course_lesson_id: lesson.id, teacher_id: me.id, stage: 1,
      stages: [{ n: 1, started_at: at, finished_at: null, override: null }], started_at: at, updated_at: at,
    });
    if (error && error.code !== '23505') throw new Error('run_insert_failed');
  }
  return { ok: true, group: await groupView(g, key, now, lessons) };
}

async function next(me: Me, b: any) {
  const g = await groupFor(me, b?.groupId);
  const now = Date.now();
  const key = dayOf(now);
  const run = await loadRun(g.id, key);
  if (!run) fail(400, 'not_started');
  if (run.stage > 5) fail(400, 'finished');
  const { kids, module } = await groupDay(g, key, run);
  const gate = gateOf(run.stage, run, kids, module);
  const log = currentLog(run);
  const spec = STAGES[run.stage - 1];
  const elapsedMin = log ? (now - Date.parse(log.started_at)) / 60000 : 0;
  let override: string | null = null;
  if (!gate.ok) {
    if (!OVERRIDABLE.has(run.stage) || elapsedMin < spec.min) {
      return { ok: false, error: 'gate', gate, overrideInMin: OVERRIDABLE.has(run.stage) ? Math.ceil(spec.min - elapsedMin) : null };
    }
    override = clean(b?.reason, 200);
    if (override.length < 3) return { ok: false, error: 'reason_required', gate };
  }
  const at = new Date(now).toISOString();
  const stages = run.stages.map((s) => (s.n === run.stage && !s.finished_at ? { ...s, finished_at: at, override } : s));
  const nextStage = run.stage + 1;
  if (nextStage <= 5) stages.push({ n: nextStage, started_at: at, finished_at: null, override: null });
  const patch: Record<string, unknown> = { stage: nextStage, stages, updated_at: at };
  if (nextStage > 5) patch.finished_at = at;
  const { data: saved, error } = await db.from('tez_aytish_lesson_runs').update(patch)
    .eq('group_id', g.id).eq('lesson_key', key).eq('stage', run.stage).select('*');
  if (error) throw new Error('run_update_failed');
  if (!saved?.length) fail(409, 'conflict'); // another tap or device moved it first
  let report: unknown = null;
  if (nextStage > 5) {
    const fresh = await loadRun(g.id, key);
    if (fresh) report = await sendReport(g, fresh, me.selftest === true, now);
  }
  const lessons = await loadLessons();
  return { ok: true, report, group: await groupView(g, key, now, lessons) };
}

async function check(me: Me, b: any) {
  const g = await groupFor(me, b?.groupId);
  const stage = Number(b?.stage);
  if (stage !== 3 && stage !== 4) fail(400, 'bad_stage');
  const now = Date.now();
  const key = dayOf(now);
  const sid = String(b?.studentId ?? '');
  if (!UUID.test(sid)) fail(400, 'bad_student');
  const { data: s } = await db.from('tez_aytish_students').select('id').eq('id', sid).eq('group_id', g.id).eq('active', true).maybeSingle();
  if (!s) fail(404, 'student_not_found');
  let value: number | boolean | null;
  if (stage === 3) {
    if (b?.value === null) value = null;
    else { value = Number(b?.value); if (!Number.isInteger(value) || value < 0 || value > 5) fail(400, 'bad_score'); }
  } else value = b?.value === true;
  for (let i = 0; i < 3; i++) {
    const run = await loadRun(g.id, key);
    if (!run) fail(400, 'not_started');
    if (run.stage > 5) fail(400, 'finished');
    if (run.stage < stage) fail(400, 'stage_not_open');
    const checks = { ...run.checks, [String(stage)]: { ...(run.checks[String(stage)] ?? {}) } };
    if (value === null || value === false) delete checks[String(stage)][sid];
    else checks[String(stage)][sid] = value;
    const at = new Date().toISOString();
    const { data: saved, error } = await db.from('tez_aytish_lesson_runs').update({ checks, updated_at: at })
      .eq('group_id', g.id).eq('lesson_key', key).eq('updated_at', run.updated_at).select('lesson_key');
    if (error) throw new Error('check_failed');
    if (saved?.length) {
      const lessons = await loadLessons();
      return { ok: true, group: await groupView(g, key, now, lessons) };
    }
  }
  fail(409, 'conflict');
}

// ---------- the owner's report ----------

async function ownerIds() {
  const { data } = await db.from('admins').select('telegram_user_id').eq('active', true);
  return [...new Set((data ?? []).map((a) => Number(a.telegram_user_id)).filter((x) => x > 0))];
}
const mins = (a: string, b: string | null | undefined, now: number) => Math.max(0, Math.round(((b ? Date.parse(b) : now) - Date.parse(a)) / 60000));

async function reportText(g: Group, run: Run, now: number) {
  const lessons = await loadLessons();
  const lesson = lessons.find((l) => l.id === run.course_lesson_id);
  const { kids, module } = await groupDay(g, run.lesson_key, run);
  const present = kids.filter((k) => k.present);
  const absent = kids.filter((k) => !k.present).map((k) => k.name);
  const start = lessonStart(run.lesson_key, g.lesson_time);
  const twisters = module?.ids.length ?? CLASS_SIZE;
  const scores = present.map((k) => k.score).filter((x): x is number => x !== null);
  const avg = scores.length ? (scores.reduce((a, x) => a + x, 0) / scores.length).toFixed(1).replace('.', ',') : null;
  const lines: string[] = [];
  lines.push(`📋 Dars hisoboti · «${g.name}» · ${dateLabel(run.lesson_key)}`);
  lines.push(`Oʻqituvchi: ${await teacherName(run.teacher_id)}`);
  lines.push(`Dars: ${lesson ? `${lesson.num}-dars${lesson.title ? ` — ${lesson.title}` : ''}` : 'tanlanmagan'}`);
  lines.push(`Boshlandi: ${clock(Date.parse(run.started_at))}${start ? ` (reja ${clock(start)})` : ''}${run.finished_at ? ` · tugadi: ${clock(Date.parse(run.finished_at))}` : ''}`);
  if (!run.finished_at) lines.push(`⚠️ Dars yakunlanmadi: ${run.stage}-bosqichda qoldi («${STAGES[Math.min(run.stage, 5) - 1].title}»).`);
  lines.push('');
  for (const s of STAGES) {
    const log = run.stages.find((x) => x.n === s.n);
    if (!log) { lines.push(`${s.n}. ${s.title} — oʻtilmadi`); continue; }
    let extra = '';
    if (s.n === 2) extra = `: ${present.filter((k) => k.done >= twisters).length}/${present.length} bola ${twisters}/${twisters}`;
    if (s.n === 3) extra = `: baho ${scores.length}/${present.length}${avg ? `, oʻrtacha ${avg}/5` : ''}`;
    if (s.n === 4) extra = `: ${present.filter((k) => k.filmed).length}/${present.length} bola suratga oldi`;
    lines.push(`${s.n}. ${s.title} — ${mins(log.started_at, log.finished_at, now)} daq (reja ${s.min})${extra}${log.override ? `\n    sabab: «${log.override}»` : ''}`);
  }
  lines.push('');
  lines.push(`Keldi: ${present.length}/${kids.length}${absent.length ? ` · kelmadi: ${absent.join(', ')}` : ''}`);
  return lines.join('\n');
}

async function sendReport(g: Group, run: Run, dry: boolean, now: number) {
  const text = await reportText(g, run, now);
  if (dry) return { preview: text };
  let sent = 0;
  for (const id of await ownerIds()) if (await send(id, text)) sent++;
  await db.from('tez_aytish_lesson_runs').update({ report_sent_at: new Date().toISOString() }).eq('group_id', g.id).eq('lesson_key', run.lesson_key);
  return { sent };
}

// ---------- tick (pg_cron every 5 minutes) ----------

async function tick(dry: boolean, now: number) {
  const out: { now: string; dry: boolean; actions: { kind: string; group?: string; to: number[]; text: string }[]; menu: unknown } = { now: new Date(now).toISOString(), dry, actions: [], menu: null };
  const today = dayOf(now);
  const wd = weekday(today);
  const { data: rows, error } = await db.from('tez_aytish_groups').select(GROUP_COLS).is('archived_at', null).not('lesson_time', 'is', null);
  if (error) throw new Error('groups_query_failed');
  const groups = (rows ?? []).map(normGroup);
  const owners = await ownerIds();
  const button = { text: '📋 Dars yoʻli', url: ROUTE_URL };
  const act = async (kind: string, g: Group | null, to: number[], text: string, withButton: boolean, record?: () => PromiseLike<unknown>) => {
    out.actions.push({ kind, group: g?.name, to, text });
    if (dry) return;
    for (const id of to) await send(id, text, withButton ? button : undefined);
    if (record) await record();
  };
  const alertSent = async (g: Group, key: string, kind: string) => {
    const { data } = await db.from('tez_aytish_route_alerts').select('kind').eq('group_id', g.id).eq('lesson_key', key).eq('kind', kind).maybeSingle();
    return !!data;
  };
  const recordAlert = (g: Group, key: string, kind: string) => () => db.from('tez_aytish_route_alerts').upsert({ group_id: g.id, lesson_key: key, kind }, { ignoreDuplicates: true });

  for (const g of groups) {
    if (!g.lesson_days.includes(wd)) continue;
    const start = lessonStart(today, g.lesson_time);
    if (!start) continue;
    const run = await loadRun(g.id, today);
    const sinceStart = (now - start) / 60000;
    if (!run && sinceStart >= -REMIND_BEFORE_MIN && sinceStart < LATE_AFTER_MIN && !await alertSent(g, today, 'remind_teacher')) {
      const { kids } = await groupDay(g, today, null);
      const lessons = await loadLessons();
      const view = await historyOf(g, today, lessons);
      const taught = new Set<number>(lessons.filter((l) => l.num <= g.taught_before).map((l) => l.num));
      for (const h of view.past) if (h.lessonNum && h.status !== 'trainer') taught.add(h.lessonNum);
      const next = lessons.find((l) => !taught.has(l.num));
      await act('remind_teacher', g, [g.teacher_id],
        `⏰ ${Math.max(0, Math.round(-sinceStart))} daqiqadan keyin dars: «${g.name}», ${clock(start)}.\n`
        + (next ? `Navbatdagi dars: ${next.num}-dars${next.title ? ` — ${next.title}` : ''}.${next.sheet_url ? ` Varaqani chop eting: ${kids.length} nusxa.` : ''}\n` : '')
        + 'Darsni «Dars yoʻli» tugmasi bilan boshlang.', true, recordAlert(g, today, 'remind_teacher'));
    }
    if (!run && sinceStart >= LATE_AFTER_MIN && sinceStart < REPORT_AFTER_MIN && !await alertSent(g, today, 'not_started')) {
      const who = await teacherName(g.teacher_id);
      await act('not_started_owner', g, owners, `⚠️ «${g.name}» darsi ${clock(start)} da boshlanishi kerak edi — hali boshlanmadi.\nOʻqituvchi: ${who}.`, true);
      await act('not_started_teacher', g, [g.teacher_id], `⚠️ Dars ${clock(start)} da boshlanishi kerak edi. «Dars yoʻli»ni oching va darsni boshlang.`, true, recordAlert(g, today, 'not_started'));
    }
    if (run && run.stage <= 5 && !run.finished_at) {
      const log = currentLog(run);
      const spec = STAGES[run.stage - 1];
      const elapsed = log ? (now - Date.parse(log.started_at)) / 60000 : 0;
      const flag = `overrun_${run.stage}`;
      if (log && elapsed >= spec.min + OVERRUN_MIN && !run.alerts[flag]) {
        await act('overrun', g, owners, `⏳ «${g.name}»: ${run.stage}-bosqich «${spec.title}» ${Math.round(elapsed)} daqiqa davom etmoqda (reja ${spec.min}).`, true,
          () => db.from('tez_aytish_lesson_runs').update({ alerts: { ...run.alerts, [flag]: new Date(now).toISOString() } }).eq('group_id', g.id).eq('lesson_key', today));
      }
    }
    if (run && !run.report_sent_at && sinceStart >= REPORT_AFTER_MIN) {
      const text = await reportText(g, run, now);
      await act('report_auto', g, owners, text, false,
        () => db.from('tez_aytish_lesson_runs').update({ report_sent_at: new Date(now).toISOString() }).eq('group_id', g.id).eq('lesson_key', today));
    }
  }

  if (wd === 7 && minutesOfDay(now) >= WEEKLY_AT_MIN) {
    for (const g of groups) {
      if (await alertSent(g, today, 'weekly')) continue;
      await act('weekly', g, owners, await weeklyText(g, today, now), true, recordAlert(g, today, 'weekly'));
    }
  }
  out.menu = await syncMenus(dry, now);
  return out;
}

// The week Monday..Sunday of `sunday`: each lesson day with its run, attendance, the trainer's stars and the scores.
async function weeklyText(g: Group, sunday: string, now: number) {
  const monday = weekStart(sunday);
  const lessons = await loadLessons();
  const byId = new Map(lessons.map((l) => [l.id, l]));
  const [runs, att, tries, kidsRes] = await Promise.all([
    db.from('tez_aytish_lesson_runs').select('*').eq('group_id', g.id).gte('lesson_key', monday).lte('lesson_key', sunday),
    db.from('tez_aytish_attendance').select('lesson_key,student_id,status').eq('group_id', g.id).gte('lesson_key', monday).lte('lesson_key', sunday),
    db.from('tez_aytish_attempts').select('lesson_key,student_id,twister_id,stars').eq('group_id', g.id).eq('stage', 'tez').eq('stt_status', 'Success')
      .not('student_id', 'is', null).gte('lesson_key', monday).lte('lesson_key', sunday).limit(5000),
    db.from('tez_aytish_students').select('id').eq('group_id', g.id).eq('active', true),
  ]);
  const total = kidsRes.data?.length ?? 0;
  const lines = [`🗓 Hafta yakuni · «${g.name}» · ${dateLabel(monday)} – ${dateLabel(sunday)}`, ''];
  let missed = 0;
  for (let k = monday; k <= sunday; k = addDays(k, 1)) {
    if (!g.lesson_days.includes(weekday(k))) continue;
    const run = (runs.data ?? []).find((r) => String(r.lesson_key) === k);
    const came = new Set((att.data ?? []).filter((a) => String(a.lesson_key) === k && a.status === 'keldi').map((a) => a.student_id)).size;
    const first = new Map<string, number>();
    for (const t of (tries.data ?? []).filter((x) => String(x.lesson_key) === k)) {
      const id = `${t.student_id}|${t.twister_id}`;
      if (!first.has(id)) first.set(id, Number(t.stars ?? 0));
    }
    const stars = [...first.values()];
    const starAvg = stars.length ? (stars.reduce((a, x) => a + x, 0) / stars.length).toFixed(1).replace('.', ',') : null;
    const scores = Object.values((run?.checks?.['3'] ?? {}) as Record<string, number>).filter((x) => typeof x === 'number');
    const scoreAvg = scores.length ? (scores.reduce((a, x) => a + x, 0) / scores.length).toFixed(1).replace('.', ',') : null;
    const lesson = run?.course_lesson_id ? byId.get(run.course_lesson_id) : undefined;
    if (!run && !came && !stars.length) { missed++; lines.push(`• ${dateLabel(k)}: dars oʻtmagan`); continue; }
    const time = run ? `${clock(Date.parse(run.started_at))}–${run.finished_at ? clock(Date.parse(run.finished_at)) : '…'}` : 'Dars yoʻlisiz';
    lines.push(`• ${dateLabel(k)}: ${lesson ? `${lesson.num}-dars` : 'dars'} · ${time} · keldi ${came}/${total}`
      + `${starAvg ? ` · tez aytish ${starAvg}⭐` : ''}${scoreAvg ? ` · varaqa ${scoreAvg}/5` : ''}${run && !run.finished_at ? ' · yakunlanmagan' : ''}`);
  }
  if (missed) lines.push('', `Oʻtmagan darslar: ${missed}`);
  void now;
  return lines.join('\n');
}

// The «Dars yoʻli» menu button: set for active teachers and admins, put back to the default for everyone else who had it.
// A chat Telegram refused (never opened the bot) is tried again after 6 hours.
async function syncMenus(dry: boolean, now: number) {
  const [teachers, admins, have] = await Promise.all([
    db.from('tez_aytish_teachers').select('telegram_user_id').eq('status', 'active'),
    db.from('admins').select('telegram_user_id').eq('active', true),
    db.from('tez_aytish_menu_buttons').select('telegram_user_id,url,set_at'),
  ]);
  if (teachers.error || admins.error || have.error) return { error: 'menu_query_failed' };
  const want = new Set([...(teachers.data ?? []), ...(admins.data ?? [])].map((r) => Number(r.telegram_user_id)).filter((x) => x > 0));
  const rows = new Map((have.data ?? []).map((r) => [Number(r.telegram_user_id), r]));
  const retryAfter = 6 * 3600_000;
  const toSet = [...want].filter((id) => {
    const r = rows.get(id);
    if (!r) return true;
    if (r.url === ROUTE_URL) return false;
    return r.url !== 'error' || now - Date.parse(r.set_at) > retryAfter;
  });
  const toUnset = [...rows.keys()].filter((id) => !want.has(id));
  if (dry || !APP_BOT_TOKEN) return { set: toSet, unset: toUnset, dry: true };
  const done = { set: 0, unset: 0, failed: 0 };
  for (const id of toSet.slice(0, 25)) {
    const r = await telegram('setChatMenuButton', { chat_id: id, menu_button: { type: 'web_app', text: MENU_TEXT, web_app: { url: ROUTE_URL } } });
    await db.from('tez_aytish_menu_buttons').upsert({ telegram_user_id: id, url: r?.ok ? ROUTE_URL : 'error', set_at: new Date(now).toISOString() });
    if (r?.ok) done.set++; else done.failed++;
  }
  for (const id of toUnset.slice(0, 25)) {
    const r = await telegram('setChatMenuButton', { chat_id: id, menu_button: { type: 'default' } });
    if (r?.ok || /chat not found|bot was blocked|user is deactivated/i.test(String(r?.description ?? ''))) {
      await db.from('tez_aytish_menu_buttons').delete().eq('telegram_user_id', id);
      done.unset++;
    } else done.failed++;
  }
  return done;
}

// ---------- the bot ----------

async function telegram(method: string, body: Record<string, unknown>) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8000);
  try {
    const res = await fetch(`https://api.telegram.org/bot${APP_BOT_TOKEN}/${method}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ac.signal,
    });
    const j: any = await res.json().catch(() => ({}));
    if (!j?.ok) console.error('tez-aytish-route telegram', method, res.status, String(j?.description ?? '').slice(0, 160));
    return j;
  } catch (e) {
    console.error('tez-aytish-route telegram', method, e instanceof Error ? e.message : String(e));
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}
// A message with an optional web_app button (private chats only). A failure is logged and never fails the caller.
async function send(chatId: number, text: string, button?: { text: string; url: string }) {
  if (!APP_BOT_TOKEN || !chatId) return false;
  const j = await telegram('sendMessage', {
    chat_id: chatId, text, disable_web_page_preview: true,
    ...(button ? { reply_markup: { inline_keyboard: [[{ text: button.text, web_app: { url: button.url } }]] } } : {}),
  });
  return !!j?.ok;
}

// ---------- helpers ----------

function clean(v: unknown, max: number) { return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : ''; }
async function readJson(req: Request) {
  const text = await req.text();
  if (text.length > MAX_BODY) fail(413, 'body_too_large');
  if (!text.trim()) return {};
  try { return JSON.parse(text); } catch { fail(400, 'bad_json'); }
}
async function cronAllowed(req: Request) {
  const given = req.headers.get('x-cron-secret') ?? '';
  if (!given) return false;
  const { data } = await db.from('tez_aytish_settings').select('value').eq('key', 'cron_secret').maybeSingle();
  const want = typeof data?.value === 'string' ? data.value : '';
  return !!want && constantTimeEqual(given, want);
}
async function selftestOk(req: Request) {
  const token = req.headers.get('x-selftest-token') ?? '';
  if (!token) return false;
  const sha = await sha256Hex(token);
  if (!SELFTEST_SHA256.some((s) => constantTimeEqual(sha, s))) fail(403, 'forbidden');
  return true;
}
async function selftestUser(req: Request): Promise<TgUser | null> {
  if (!await selftestOk(req)) return null;
  const id = Number(req.headers.get('x-selftest-as'));
  if (!Number.isSafeInteger(id) || id <= 0) fail(400, 'selftest_as_required');
  return { id, name: 'Selftest', username: null, selftest: true };
}
// Same check as tez-aytish-teacher: Telegram WebApp initData signed with the kids' bot token, valid for 1 hour.
async function verifyInitData(raw: string): Promise<TgUser | null> {
  if (!raw || raw.length > 8192 || !APP_BOT_TOKEN) return null;
  const params = new URLSearchParams(raw);
  const supplied = params.get('hash') ?? '';
  const authDate = Number(params.get('auth_date'));
  const userText = params.get('user');
  if (!/^[a-f0-9]{64}$/i.test(supplied) || !Number.isFinite(authDate) || Date.now() / 1000 - authDate > 3600 || authDate > Date.now() / 1000 + 30 || !userText) return null;
  params.delete('hash');
  const checkString = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', enc.encode('WebAppData'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), enc.encode(APP_BOT_TOKEN));
  const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(checkString)));
  if (!constantTimeEqual([...digest].map((x) => x.toString(16).padStart(2, '0')).join(''), supplied.toLowerCase())) return null;
  try {
    const u = JSON.parse(userText);
    if (!Number.isSafeInteger(u.id) || u.id <= 0) return null;
    const name = [u.first_name, u.last_name].filter((x: unknown) => typeof x === 'string' && x.trim()).join(' ').trim().slice(0, 80);
    return { id: u.id, name, username: typeof u.username === 'string' ? u.username.slice(0, 64) : null };
  } catch { return null; }
}
async function limit(key: string, max: number, seconds: number) {
  const { data, error } = await db.rpc('yba_consume_rate_limit_internal', { p_bucket_hash: await sha256Hex(key), p_max_requests: max, p_window_seconds: seconds });
  return !error && data === true;
}
function constantTimeEqual(a: string, b: string) {
  const aa = enc.encode(a), bb = enc.encode(b);
  let d = aa.length ^ bb.length;
  for (let i = 0; i < Math.max(aa.length, bb.length); i++) d |= (aa[i] ?? 0) ^ (bb[i] ?? 0);
  return d === 0;
}
async function sha256Hex(v: string) {
  const x = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(v)));
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

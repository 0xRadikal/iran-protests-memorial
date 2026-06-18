// ============================================================================
//  مسیرهای عمومی (سمتِ کاربر) — بدونِ احراز هویت، با حفاظتِ Turnstile
//   • GET  /api/comments/:personId      دریافتِ کامنت‌های تأییدشده
//   • POST /api/comments                ثبتِ کامنتِ جدید
//   • POST /api/comments/:id/report     گزارشِ یک کامنت
//   • POST /api/reports                 گزارشِ یک جاویدنام (تکراری/غلط/…)
//   • POST /api/photo-suggestions       پیشنهادِ عکس
//   • POST /api/submissions             پیشنهادِ جاویدنامِ جدید
//   • GET  /api/stats                   آمارِ عمومیِ مشارکت‌ها
// ============================================================================
import { Hono } from 'hono';
import type { Bindings, Variables } from './types';
import { verifyTurnstile, reqInfo, clean, isValidUrl, ok, fail, rateLimit } from './helpers';

const pub = new Hono<{ Bindings: Bindings; Variables: Variables }>();

async function getSetting(db: D1Database, key: string, def: string): Promise<string> {
  const r = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first<{ value: string }>();
  return r?.value ?? def;
}

const RL = { comment: [5, 60_000] as const, report: [10, 60_000] as const, photo: [5, 60_000] as const, submission: [3, 60_000] as const };
const RL_MSG = 'درخواست‌های بیش از حد؛ کمی بعد دوباره تلاش کنید';

// --- دریافتِ کامنت‌های یک جاویدنام (فقط تأییدشده) ---
pub.get('/comments/:personId', async (c) => {
  const personId = clean(c.req.param('personId'), 40);
  const { results } = await c.env.DB.prepare(
    `SELECT id, author_name, body, created_at
       FROM comments
      WHERE person_id = ? AND status = 'approved'
      ORDER BY created_at DESC
      LIMIT 200`
  )
    .bind(personId)
    .all();
  return ok(c, { comments: results });
});

// --- ثبتِ کامنتِ جدید ---
pub.post('/comments', async (c) => {
  if ((await getSetting(c.env.DB, 'comments_enabled', '1')) !== '1') return fail(c, 'کامنت‌ها غیرفعال است', 403);
  const body = await c.req.json().catch(() => ({}));
  const personId = clean(body.person_id, 40);
  const text = clean(body.body, 2000);
  const author = clean(body.author_name, 60) || 'ناشناس';
  if (!personId || text.length < 2) return fail(c, 'متنِ کامنت کوتاه است');

  const { ip, country, ua } = reqInfo(c);
  if (!(await rateLimit(c.env.DB, 'comment', ip, RL.comment[0], RL.comment[1]))) return fail(c, RL_MSG, 429);
  if (!(await verifyTurnstile(body.turnstile_token, c.env.TURNSTILE_SECRET, ip)))
    return fail(c, 'تأییدِ امنیتی ناموفق بود (Turnstile)', 403);

  // مطمئن شویم person وجود دارد (یا حداقل ثبتش کنیم)
  const exists = await c.env.DB.prepare('SELECT id FROM people WHERE id = ?').bind(personId).first();
  if (!exists) return fail(c, 'جاویدنامِ موردنظر یافت نشد', 404);

  const mode = await getSetting(c.env.DB, 'comment_moderation', 'post_then_review');
  const status = mode === 'pre_approve' ? 'pending' : 'approved';

  const res = await c.env.DB.prepare(
    `INSERT INTO comments (person_id, author_name, body, status, ip, country, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(personId, author, text, status, ip, country, ua)
    .run();

  return ok(c, { id: res.meta.last_row_id, status }, 201);
});

// --- گزارشِ یک کامنت ---
pub.post('/comments/:id/report', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (!id) return fail(c, 'شناسهٔ نامعتبر');
  const body = await c.req.json().catch(() => ({}));
  const reason = clean(body.reason, 500);
  const { ip } = reqInfo(c);
  if (!(await rateLimit(c.env.DB, 'report', ip, RL.report[0], RL.report[1]))) return fail(c, RL_MSG, 429);
  if (!(await verifyTurnstile(body.turnstile_token, c.env.TURNSTILE_SECRET, ip)))
    return fail(c, 'تأییدِ امنیتی ناموفق بود', 403);

  const cm = await c.env.DB.prepare('SELECT id FROM comments WHERE id = ?').bind(id).first();
  if (!cm) return fail(c, 'کامنت یافت نشد', 404);

  await c.env.DB.prepare('INSERT INTO comment_reports (comment_id, reason, ip) VALUES (?, ?, ?)')
    .bind(id, reason, ip)
    .run();
  await c.env.DB.prepare('UPDATE comments SET report_count = report_count + 1 WHERE id = ?').bind(id).run();

  // مخفی‌سازیِ خودکار اگر از آستانه گذشت
  const threshold = parseInt(await getSetting(c.env.DB, 'auto_hide_threshold', '3'), 10);
  await c.env.DB.prepare(
    `UPDATE comments SET status = 'pending'
      WHERE id = ? AND status = 'approved' AND report_count >= ?`
  )
    .bind(id, threshold)
    .run();

  return ok(c, { reported: true });
});

// --- گزارشِ یک جاویدنام ---
pub.post('/reports', async (c) => {
  if ((await getSetting(c.env.DB, 'reports_enabled', '1')) !== '1') return fail(c, 'گزارش‌ها غیرفعال است', 403);
  const body = await c.req.json().catch(() => ({}));
  const personId = clean(body.person_id, 40);
  const type = clean(body.report_type, 30) || 'other';
  const desc = clean(body.description, 2000);
  const dupOf = clean(body.duplicate_of, 40);
  const reporter = clean(body.reporter_name, 60);
  const validTypes = ['duplicate', 'wrong_info', 'inappropriate', 'other'];
  if (!personId) return fail(c, 'شناسهٔ جاویدنام لازم است');
  if (!validTypes.includes(type)) return fail(c, 'نوعِ گزارشِ نامعتبر');

  const { ip, country } = reqInfo(c);
  if (!(await rateLimit(c.env.DB, 'report', ip, RL.report[0], RL.report[1]))) return fail(c, RL_MSG, 429);
  if (!(await verifyTurnstile(body.turnstile_token, c.env.TURNSTILE_SECRET, ip)))
    return fail(c, 'تأییدِ امنیتی ناموفق بود', 403);

  const exists = await c.env.DB.prepare('SELECT id FROM people WHERE id = ?').bind(personId).first();
  if (!exists) return fail(c, 'جاویدنام یافت نشد', 404);

  const res = await c.env.DB.prepare(
    `INSERT INTO reports (person_id, report_type, description, duplicate_of, reporter_name, ip, country)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(personId, type, desc, dupOf || null, reporter, ip, country)
    .run();
  return ok(c, { id: res.meta.last_row_id }, 201);
});

// --- پیشنهادِ عکس ---
pub.post('/photo-suggestions', async (c) => {
  if ((await getSetting(c.env.DB, 'photo_sug_enabled', '1')) !== '1') return fail(c, 'پیشنهادِ عکس غیرفعال است', 403);
  const body = await c.req.json().catch(() => ({}));
  const personId = clean(body.person_id, 40);
  const url = clean(body.photo_url, 1000);
  const note = clean(body.source_note, 1000);
  const suggester = clean(body.suggester_name, 60);
  if (!personId || !url) return fail(c, 'شناسهٔ جاویدنام و URLِ عکس لازم است');
  if (!isValidUrl(url)) return fail(c, 'URLِ عکس نامعتبر است');

  const { ip, country } = reqInfo(c);
  if (!(await rateLimit(c.env.DB, 'photo', ip, RL.photo[0], RL.photo[1]))) return fail(c, RL_MSG, 429);
  if (!(await verifyTurnstile(body.turnstile_token, c.env.TURNSTILE_SECRET, ip)))
    return fail(c, 'تأییدِ امنیتی ناموفق بود', 403);

  const exists = await c.env.DB.prepare('SELECT id FROM people WHERE id = ?').bind(personId).first();
  if (!exists) return fail(c, 'جاویدنام یافت نشد', 404);

  const res = await c.env.DB.prepare(
    `INSERT INTO photo_suggestions (person_id, photo_url, source_note, suggester_name, ip, country)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(personId, url, note, suggester, ip, country)
    .run();
  return ok(c, { id: res.meta.last_row_id }, 201);
});

// --- پیشنهادِ جاویدنامِ جدید ---
pub.post('/submissions', async (c) => {
  if ((await getSetting(c.env.DB, 'submissions_enabled', '1')) !== '1')
    return fail(c, 'افزودنِ جاویدنام غیرفعال است', 403);
  const body = await c.req.json().catch(() => ({}));
  const name = clean(body.name, 100);
  if (name.length < 2) return fail(c, 'نام لازم است');

  const { ip, country } = reqInfo(c);
  if (!(await rateLimit(c.env.DB, 'submission', ip, RL.submission[0], RL.submission[1]))) return fail(c, RL_MSG, 429);
  if (!(await verifyTurnstile(body.turnstile_token, c.env.TURNSTILE_SECRET, ip)))
    return fail(c, 'تأییدِ امنیتی ناموفق بود', 403);

  const ageRaw = parseInt(body.age, 10);
  const age = Number.isFinite(ageRaw) && ageRaw > 0 && ageRaw < 130 ? ageRaw : null;
  const photo = clean(body.photo_url, 1000);
  if (photo && !isValidUrl(photo)) return fail(c, 'URLِ عکس نامعتبر است');

  const res = await c.env.DB.prepare(
    `INSERT INTO submissions
      (name, name_en, age, gender, event, city, province, date_jalali, cause, occupation,
       story, photo_url, sources, submitter_name, submitter_contact, ip, country)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      name,
      clean(body.name_en, 100),
      age,
      clean(body.gender, 20),
      clean(body.event, 40),
      clean(body.city, 60),
      clean(body.province, 60),
      clean(body.date_jalali, 30),
      clean(body.cause, 200),
      clean(body.occupation, 100),
      clean(body.story, 5000),
      photo || null,
      clean(body.sources, 2000),
      clean(body.submitter_name, 60),
      clean(body.submitter_contact, 120),
      ip,
      country
    )
    .run();
  return ok(c, { id: res.meta.last_row_id }, 201);
});

// --- آمارِ عمومی (تعدادِ کامنت‌های تأییدشده برای نمایشِ شمارنده) ---
pub.get('/stats', async (c) => {
  const r = await c.env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM comments WHERE status='approved') AS comments,
       (SELECT COUNT(DISTINCT person_id) FROM comments WHERE status='approved') AS commented_people`
  ).first();
  return ok(c, r);
});

export default pub;

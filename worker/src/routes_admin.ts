// ============================================================================
//  مسیرهای ادمین — محافظت‌شده با میان‌افزارِ requireAdmin
//  ورود، داشبورد، صف‌های بازبینی (کامنت/گزارش/عکس/افزودن)، تنظیمات
// ============================================================================
import { Hono } from 'hono';
import type { Bindings, Variables } from './types';
import { verifyPassword, randomHex } from './auth';
import { requireAdmin, audit } from './middleware';
import { reqInfo, clean, isValidUrl, ok, fail } from './helpers';

const admin = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// --------------------------- ورود / خروج ---------------------------
admin.post('/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const username = clean(body.username, 60);
  const password = typeof body.password === 'string' ? body.password : '';
  if (!username || !password) return fail(c, 'نام کاربری و رمز لازم است');

  const a = await c.env.DB.prepare(
    'SELECT id, username, password_hash, salt, role, is_active, display_name FROM admins WHERE username = ?'
  )
    .bind(username)
    .first<{ id: number; username: string; password_hash: string; salt: string; role: string; is_active: number; display_name: string }>();

  // پاسخِ یکسان برای جلوگیری از افشای وجود/عدمِ کاربر
  if (!a || !a.is_active) return fail(c, 'نام کاربری یا رمز نادرست است', 401);
  const valid = await verifyPassword(password, a.password_hash, a.salt);
  if (!valid) return fail(c, 'نام کاربری یا رمز نادرست است', 401);

  const ttlH = parseInt(c.env.SESSION_TTL_HOURS || '12', 10);
  const token = randomHex(32);
  const expires = new Date(Date.now() + ttlH * 3600_000).toISOString();
  const { ip, ua } = reqInfo(c);
  await c.env.DB.prepare(
    'INSERT INTO admin_sessions (token, admin_id, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?)'
  )
    .bind(token, a.id, expires, ip, ua)
    .run();
  await c.env.DB.prepare("UPDATE admins SET last_login_at = datetime('now') WHERE id = ?").bind(a.id).run();
  await audit(c.env.DB, a.id, 'login', 'admin', a.id);

  return ok(c, {
    token,
    expires_at: expires,
    admin: { username: a.username, role: a.role, display_name: a.display_name },
  });
});

admin.post('/logout', requireAdmin, async (c) => {
  const token = (c.req.header('Authorization') || '').slice(7);
  await c.env.DB.prepare('DELETE FROM admin_sessions WHERE token = ?').bind(token).run();
  return ok(c, { loggedOut: true });
});

admin.get('/me', requireAdmin, async (c) =>
  ok(c, { username: c.get('adminUsername'), role: c.get('adminRole'), adminId: c.get('adminId') })
);

// --------------------------- داشبورد (آمار) ---------------------------
admin.get('/dashboard', requireAdmin, async (c) => {
  const stats = await c.env.DB.prepare(
    `SELECT
      (SELECT COUNT(*) FROM comments WHERE status='pending')                AS comments_pending,
      (SELECT COUNT(*) FROM comments WHERE status='approved')               AS comments_approved,
      (SELECT COUNT(*) FROM comments WHERE report_count>0 AND status!='rejected') AS comments_reported,
      (SELECT COUNT(*) FROM reports  WHERE status='open')                   AS reports_open,
      (SELECT COUNT(*) FROM reports  WHERE report_type='duplicate' AND status='open') AS reports_duplicate,
      (SELECT COUNT(*) FROM photo_suggestions WHERE status='pending')       AS photos_pending,
      (SELECT COUNT(*) FROM submissions WHERE status='pending')             AS submissions_pending,
      (SELECT COUNT(*) FROM people)                                         AS people_total`
  ).first();
  const recent = await c.env.DB.prepare(
    `SELECT action, entity_type, entity_id, detail, created_at FROM audit_log ORDER BY id DESC LIMIT 15`
  ).all();
  return ok(c, { stats, recent: recent.results });
});

// =====================================================================
//  کامنت‌ها
// =====================================================================
admin.get('/comments', requireAdmin, async (c) => {
  const status = clean(c.req.query('status') || 'pending', 20);
  const reported = c.req.query('reported') === '1';
  let sql = `SELECT c.*, p.name AS person_name
               FROM comments c LEFT JOIN people p ON p.id = c.person_id`;
  const where: string[] = [];
  const binds: any[] = [];
  if (reported) {
    where.push('c.report_count > 0');
  } else if (status && status !== 'all') {
    where.push('c.status = ?');
    binds.push(status);
  }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY c.report_count DESC, c.id DESC LIMIT 300';
  const { results } = await c.env.DB.prepare(sql).bind(...binds).all();
  return ok(c, { comments: results });
});

// تأیید/رد/اسپم/حذفِ کامنت
admin.post('/comments/:id/:action', requireAdmin, async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const action = c.req.param('action');
  const map: Record<string, string> = { approve: 'approved', reject: 'rejected', spam: 'spam' };
  const adminId = c.get('adminId');
  if (action === 'delete') {
    await c.env.DB.prepare('DELETE FROM comments WHERE id = ?').bind(id).run();
    await audit(c.env.DB, adminId, 'delete_comment', 'comment', id);
    return ok(c, { deleted: true });
  }
  const newStatus = map[action];
  if (!newStatus) return fail(c, 'عملیاتِ نامعتبر');
  await c.env.DB.prepare(
    "UPDATE comments SET status = ?, reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?"
  )
    .bind(newStatus, adminId, id)
    .run();
  await audit(c.env.DB, adminId, `comment_${action}`, 'comment', id);
  return ok(c, { status: newStatus });
});

// =====================================================================
//  گزارش‌ها (شاملِ تکراری‌ها)
// =====================================================================
admin.get('/reports', requireAdmin, async (c) => {
  const status = clean(c.req.query('status') || 'open', 20);
  const type = clean(c.req.query('type') || '', 30);
  let sql = `SELECT r.*, p.name AS person_name, p.photo_url AS person_photo,
                    d.name AS duplicate_name
               FROM reports r
               LEFT JOIN people p ON p.id = r.person_id
               LEFT JOIN people d ON d.id = r.duplicate_of`;
  const where: string[] = [];
  const binds: any[] = [];
  if (status && status !== 'all') { where.push('r.status = ?'); binds.push(status); }
  if (type) { where.push('r.report_type = ?'); binds.push(type); }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY r.id DESC LIMIT 300';
  const { results } = await c.env.DB.prepare(sql).bind(...binds).all();
  return ok(c, { reports: results });
});

// رسیدگی به گزارش: resolve | dismiss
admin.post('/reports/:id/:action', requireAdmin, async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const action = c.req.param('action');
  const body = await c.req.json().catch(() => ({}));
  const note = clean(body.admin_note, 1000);
  const map: Record<string, string> = { resolve: 'resolved', dismiss: 'dismissed' };
  const newStatus = map[action];
  if (!newStatus) return fail(c, 'عملیاتِ نامعتبر');
  const adminId = c.get('adminId');
  await c.env.DB.prepare(
    "UPDATE reports SET status = ?, resolved_by = ?, resolved_at = datetime('now'), admin_note = ? WHERE id = ?"
  )
    .bind(newStatus, adminId, note, id)
    .run();
  await audit(c.env.DB, adminId, `report_${action}`, 'report', id, note);
  return ok(c, { status: newStatus });
});

// =====================================================================
//  پیشنهادهای عکس
// =====================================================================
admin.get('/photo-suggestions', requireAdmin, async (c) => {
  const status = clean(c.req.query('status') || 'pending', 20);
  let sql = `SELECT ps.*, p.name AS person_name, p.photo_url AS current_photo
               FROM photo_suggestions ps LEFT JOIN people p ON p.id = ps.person_id`;
  const binds: any[] = [];
  if (status && status !== 'all') { sql += ' WHERE ps.status = ?'; binds.push(status); }
  sql += ' ORDER BY ps.id DESC LIMIT 300';
  const { results } = await c.env.DB.prepare(sql).bind(...binds).all();
  return ok(c, { suggestions: results });
});

// تأیید عکس (روی people اعمال می‌شود) یا رد
admin.post('/photo-suggestions/:id/:action', requireAdmin, async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const action = c.req.param('action');
  const body = await c.req.json().catch(() => ({}));
  const note = clean(body.admin_note, 1000);
  const adminId = c.get('adminId');

  const sug = await c.env.DB.prepare('SELECT * FROM photo_suggestions WHERE id = ?').bind(id).first<any>();
  if (!sug) return fail(c, 'پیشنهاد یافت نشد', 404);

  if (action === 'approve') {
    if (!isValidUrl(sug.photo_url)) return fail(c, 'URLِ عکس نامعتبر است');
    // عکس را روی رکوردِ people ذخیره می‌کنیم (برای export بعدی به JSON)
    await c.env.DB.prepare("UPDATE people SET photo_url = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(sug.photo_url, sug.person_id)
      .run();
    await c.env.DB.prepare(
      "UPDATE photo_suggestions SET status='approved', reviewed_by=?, reviewed_at=datetime('now'), admin_note=? WHERE id=?"
    ).bind(adminId, note, id).run();
    await audit(c.env.DB, adminId, 'photo_approve', 'photo', id, sug.person_id);
    return ok(c, { approved: true, person_id: sug.person_id, photo_url: sug.photo_url });
  }
  if (action === 'reject') {
    await c.env.DB.prepare(
      "UPDATE photo_suggestions SET status='rejected', reviewed_by=?, reviewed_at=datetime('now'), admin_note=? WHERE id=?"
    ).bind(adminId, note, id).run();
    await audit(c.env.DB, adminId, 'photo_reject', 'photo', id);
    return ok(c, { rejected: true });
  }
  return fail(c, 'عملیاتِ نامعتبر');
});

// =====================================================================
//  پیشنهادهای افزودنِ جاویدنام
// =====================================================================
admin.get('/submissions', requireAdmin, async (c) => {
  const status = clean(c.req.query('status') || 'pending', 20);
  let sql = 'SELECT * FROM submissions';
  const binds: any[] = [];
  if (status && status !== 'all') { sql += ' WHERE status = ?'; binds.push(status); }
  sql += ' ORDER BY id DESC LIMIT 300';
  const { results } = await c.env.DB.prepare(sql).bind(...binds).all();
  return ok(c, { submissions: results });
});

// تأیید (ایجادِ رکوردِ people) یا رد
admin.post('/submissions/:id/:action', requireAdmin, async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const action = c.req.param('action');
  const body = await c.req.json().catch(() => ({}));
  const note = clean(body.admin_note, 1000);
  const adminId = c.get('adminId');

  const s = await c.env.DB.prepare('SELECT * FROM submissions WHERE id = ?').bind(id).first<any>();
  if (!s) return fail(c, 'پیشنهاد یافت نشد', 404);

  if (action === 'approve') {
    // ساختِ شناسهٔ یکتا مطابقِ الگوی jvn_ + 10 hex
    const newId = 'jvn_' + randomHex(5);
    await c.env.DB.prepare(
      `INSERT INTO people (id, name, name_en, event, city, photo_url, notable, data_json)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)`
    )
      .bind(
        newId,
        s.name,
        s.name_en || null,
        s.event || null,
        s.city || null,
        s.photo_url || null,
        JSON.stringify({
          n: s.name, ne: s.name_en, a: s.age, g: s.gender, e: s.event, c: s.city,
          pr: s.province, dj: s.date_jalali, ca: s.cause, oc: s.occupation,
          s: s.story, ph: s.photo_url, src_text: s.sources, v: 'reported',
          _source: 'community_submission', _submission_id: id,
        })
      )
      .run();
    await c.env.DB.prepare(
      "UPDATE submissions SET status='approved', reviewed_by=?, reviewed_at=datetime('now'), admin_note=?, approved_person_id=? WHERE id=?"
    ).bind(adminId, note, newId, id).run();
    await audit(c.env.DB, adminId, 'submission_approve', 'submission', id, newId);
    return ok(c, { approved: true, person_id: newId });
  }
  if (action === 'reject') {
    await c.env.DB.prepare(
      "UPDATE submissions SET status='rejected', reviewed_by=?, reviewed_at=datetime('now'), admin_note=? WHERE id=?"
    ).bind(adminId, note, id).run();
    await audit(c.env.DB, adminId, 'submission_reject', 'submission', id);
    return ok(c, { rejected: true });
  }
  return fail(c, 'عملیاتِ نامعتبر');
});

// =====================================================================
//  ادغامِ تکراری‌ها: حذفِ رکوردِ تکراری و انتقالِ کامنت‌ها به مرجع
// =====================================================================
admin.post('/people/merge', requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const dupId = clean(body.duplicate_id, 40);   // رکوردی که حذف می‌شود
  const keepId = clean(body.keep_id, 40);        // رکوردِ مرجع
  if (!dupId || !keepId || dupId === keepId) return fail(c, 'شناسه‌های نامعتبر');
  const adminId = c.get('adminId');

  // انتقالِ کامنت‌ها و گزارش‌ها
  await c.env.DB.prepare('UPDATE comments SET person_id = ? WHERE person_id = ?').bind(keepId, dupId).run();
  await c.env.DB.prepare('UPDATE photo_suggestions SET person_id = ? WHERE person_id = ?').bind(keepId, dupId).run();
  await c.env.DB.prepare("UPDATE reports SET status='resolved', admin_note='merged' WHERE person_id = ?").bind(dupId).run();
  await c.env.DB.prepare('DELETE FROM people WHERE id = ?').bind(dupId).run();
  await audit(c.env.DB, adminId, 'merge_duplicate', 'person', dupId, `merged into ${keepId}`);
  return ok(c, { merged: true, kept: keepId, removed: dupId });
});

// جست‌وجوی جاویدنام (برای انتخابِ مرجعِ ادغام)
admin.get('/people/search', requireAdmin, async (c) => {
  const q = clean(c.req.query('q') || '', 60);
  if (q.length < 2) return ok(c, { results: [] });
  const { results } = await c.env.DB.prepare(
    `SELECT id, name, name_en, event, city, photo_url FROM people
      WHERE name LIKE ? OR name_en LIKE ? LIMIT 25`
  )
    .bind(`%${q}%`, `%${q}%`)
    .all();
  return ok(c, { results });
});

// =====================================================================
//  تنظیمات
// =====================================================================
admin.get('/settings', requireAdmin, async (c) => {
  const { results } = await c.env.DB.prepare('SELECT key, value FROM settings').all();
  return ok(c, { settings: results });
});
admin.post('/settings', requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const entries = Object.entries(body || {});
  for (const [k, v] of entries) {
    await c.env.DB.prepare(
      "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')"
    ).bind(clean(k, 50), clean(String(v), 200)).run();
  }
  await audit(c.env.DB, c.get('adminId'), 'update_settings', 'settings', 0, JSON.stringify(body));
  return ok(c, { updated: true });
});

export default admin;

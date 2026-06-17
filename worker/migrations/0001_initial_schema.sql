-- ============================================================================
--  جاویدنام — اسکیمای پایگاه‌دادهٔ پنل مدیریت و مشارکت کاربران (Cloudflare D1)
--  Javidnaman — Admin Panel & Community Contribution Schema
-- ============================================================================
--  اصول طراحی:
--   • هیچ داده‌ای پاک نمی‌شود مگر با تصمیمِ ادمین (soft-delete با status).
--   • همهٔ ورودی‌های کاربر ابتدا در صفِ بازبینی (pending) قرار می‌گیرند.
--   • ردگیریِ کامل: چه کسی، چه زمانی، از چه IP/کشور، تصمیمِ ادمین چه بود.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) ادمین‌ها  /  admins
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admins (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,            -- PBKDF2 (Web Crypto) — هرگز رمزِ خام
  salt          TEXT    NOT NULL,
  display_name  TEXT,
  role          TEXT    NOT NULL DEFAULT 'admin',   -- admin | superadmin
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

-- نشست‌های ادمین  /  admin sessions (توکنِ امنِ تصادفی)
CREATE TABLE IF NOT EXISTS admin_sessions (
  token       TEXT    PRIMARY KEY,
  admin_id    INTEGER NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT    NOT NULL,
  ip          TEXT,
  user_agent  TEXT,
  FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sessions_admin   ON admin_sessions(admin_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON admin_sessions(expires_at);

-- ---------------------------------------------------------------------------
-- 2) جاویدنام‌ها  /  people  (آینهٔ سبک از داده‌ها برای اتصالِ کامنت/گزارش)
--    منبعِ حقیقت همچنان فایل JSON است؛ این جدول فقط برای ارجاع و مدیریت است.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS people (
  id          TEXT PRIMARY KEY,              -- jvn_xxxxxxxxxx
  name        TEXT NOT NULL,
  name_en     TEXT,
  event       TEXT,
  city        TEXT,
  photo_url   TEXT,
  slug        TEXT,
  notable     INTEGER NOT NULL DEFAULT 0,
  data_json   TEXT,                          -- snapshot کاملِ رکورد (اختیاری)
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_people_name    ON people(name);
CREATE INDEX IF NOT EXISTS idx_people_notable ON people(notable);
CREATE INDEX IF NOT EXISTS idx_people_event   ON people(event);

-- ---------------------------------------------------------------------------
-- 3) کامنت‌ها  /  comments
--    حالت‌ها: pending (در انتظار) | approved (تأییدشده) | rejected | spam
--    سیاستِ نمایش: قابلِ تنظیم — یا «همه آزاد سپس حذفِ بد» یا «تأیید پیش از نمایش»
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id     TEXT    NOT NULL,
  author_name   TEXT    NOT NULL DEFAULT 'ناشناس',
  body          TEXT    NOT NULL,
  status        TEXT    NOT NULL DEFAULT 'approved',   -- pending|approved|rejected|spam
  report_count  INTEGER NOT NULL DEFAULT 0,            -- چند بار گزارش شده
  ip            TEXT,
  country       TEXT,
  user_agent    TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  reviewed_by   INTEGER,
  reviewed_at   TEXT,
  FOREIGN KEY (person_id)   REFERENCES people(id)  ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES admins(id)  ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_person ON comments(person_id);
CREATE INDEX IF NOT EXISTS idx_comments_status ON comments(status);
CREATE INDEX IF NOT EXISTS idx_comments_reportc ON comments(report_count);

-- گزارشِ کامنت‌ها  /  comment reports (کاربر یک کامنت را گزارش می‌کند)
CREATE TABLE IF NOT EXISTS comment_reports (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  comment_id  INTEGER NOT NULL,
  reason      TEXT,
  ip          TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_creports_comment ON comment_reports(comment_id);

-- ---------------------------------------------------------------------------
-- 4) گزارشِ جاویدنام  /  reports
--    انواع: duplicate (تکراری) | wrong_info (اطلاعاتِ غلط) | inappropriate | other
--    حالت‌ها: open (باز) | resolved (رسیدگی‌شده) | dismissed (رد)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reports (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id     TEXT    NOT NULL,
  report_type   TEXT    NOT NULL DEFAULT 'other',   -- duplicate|wrong_info|inappropriate|other
  description   TEXT,
  duplicate_of  TEXT,                                -- اگر تکراری: id جاویدنامِ مرجع
  status        TEXT    NOT NULL DEFAULT 'open',     -- open|resolved|dismissed
  reporter_name TEXT,
  ip            TEXT,
  country       TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  resolved_by   INTEGER,
  resolved_at   TEXT,
  admin_note    TEXT,
  FOREIGN KEY (person_id)   REFERENCES people(id) ON DELETE CASCADE,
  FOREIGN KEY (resolved_by) REFERENCES admins(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_reports_person ON reports(person_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_type   ON reports(report_type);

-- ---------------------------------------------------------------------------
-- 5) پیشنهادِ عکس  /  photo_suggestions
--    کاربر فقط URLِ عکس می‌دهد؛ ادمین تأیید/رد می‌کند.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS photo_suggestions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id     TEXT    NOT NULL,
  photo_url     TEXT    NOT NULL,
  source_note   TEXT,                                -- منبع/توضیحِ کاربر
  status        TEXT    NOT NULL DEFAULT 'pending',  -- pending|approved|rejected
  suggester_name TEXT,
  ip            TEXT,
  country       TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  reviewed_by   INTEGER,
  reviewed_at   TEXT,
  admin_note    TEXT,
  FOREIGN KEY (person_id)   REFERENCES people(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES admins(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_photosug_person ON photo_suggestions(person_id);
CREATE INDEX IF NOT EXISTS idx_photosug_status ON photo_suggestions(status);

-- ---------------------------------------------------------------------------
-- 6) پیشنهادِ جاویدنامِ جدید  /  submissions
--    کاربر نام و مشخصات را وارد می‌کند؛ ادمین صحت‌سنجی و سپس اضافه می‌کند.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS submissions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  name_en       TEXT,
  age           INTEGER,
  gender        TEXT,
  event         TEXT,
  city          TEXT,
  province      TEXT,
  date_jalali   TEXT,
  cause         TEXT,
  occupation    TEXT,
  story         TEXT,
  photo_url     TEXT,
  sources       TEXT,                                -- لینکِ منابع (متن چندخطی)
  status        TEXT    NOT NULL DEFAULT 'pending',  -- pending|approved|rejected
  submitter_name TEXT,
  submitter_contact TEXT,
  ip            TEXT,
  country       TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  reviewed_by   INTEGER,
  reviewed_at   TEXT,
  admin_note    TEXT,
  approved_person_id TEXT,                            -- اگر تأیید شد: id ساخته‌شده
  FOREIGN KEY (reviewed_by) REFERENCES admins(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);

-- ---------------------------------------------------------------------------
-- 7) لاگِ فعالیتِ ادمین  /  audit log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id    INTEGER,
  action      TEXT    NOT NULL,           -- مثلاً: approve_comment, merge_duplicate
  entity_type TEXT,                       -- comment|report|photo|submission|person
  entity_id   TEXT,
  detail      TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_admin ON audit_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_time  ON audit_log(created_at);

-- ---------------------------------------------------------------------------
-- 8) تنظیماتِ سایت  /  settings (key-value)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- مقادیر پیش‌فرض
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('comment_moderation', 'post_then_review'),   -- post_then_review | pre_approve
  ('comments_enabled',   '1'),
  ('reports_enabled',    '1'),
  ('photo_sug_enabled',  '1'),
  ('submissions_enabled','1'),
  ('auto_hide_threshold','3');                   -- اگر کامنت ≥۳ گزارش، خودکار مخفی

-- ============================================================================
--  محدودسازیِ نرخِ درخواست (Rate limiting) مبتنی بر D1
--  هر ردیف یک «سطل» (bucket) برای ترکیبِ IP + اکشن در یک پنجرهٔ زمانی است.
-- ============================================================================
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket_key TEXT PRIMARY KEY,        -- مثلا: "comment:1.2.3.4"
  count      INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL       -- زمانِ شروعِ پنجره (epoch ms)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits(window_start);

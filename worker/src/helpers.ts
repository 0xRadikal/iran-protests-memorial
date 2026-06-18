// ============================================================================
//  ابزارهای کمکی: تأییدِ Turnstile، پاک‌سازیِ ورودی، اعتبارسنجی
// ============================================================================
import type { Context } from 'hono';

// --- تأییدِ کپچای Cloudflare Turnstile ---
export async function verifyTurnstile(
  token: string | undefined,
  secret: string | undefined,
  ip?: string
): Promise<boolean> {
  // اگر کلیدِ مخفی تنظیم نشده باشد (محیطِ توسعه)، عبور می‌دهیم.
  if (!secret) return true;
  if (!token) return false;
  try {
    const form = new FormData();
    form.append('secret', secret);
    form.append('response', token);
    if (ip) form.append('remoteip', ip);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
    });
    const data = (await res.json()) as { success: boolean };
    return !!data.success;
  } catch {
    return false;
  }
}

// --- اطلاعاتِ درخواست (IP/کشور/UA) ---
export function reqInfo(c: Context) {
  const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || '';
  const country = c.req.header('CF-IPCountry') || '';
  const ua = (c.req.header('User-Agent') || '').slice(0, 300);
  return { ip, country, ua };
}

// --- پاک‌سازیِ متن (جلوگیری از تزریق و کنترلِ طول) ---
export function clean(s: unknown, maxLen = 2000): string {
  if (typeof s !== 'string') return '';
  return s.replace(/\u0000/g, '').trim().slice(0, maxLen);
}

export function isValidUrl(u: string): boolean {
  try {
    const url = new URL(u);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

// --- پاسخِ استاندارد ---
export function ok(c: Context, data: unknown = {}, status = 200) {
  return c.json({ success: true, data }, status as any);
}
export function fail(c: Context, message: string, status = 400) {
  return c.json({ success: false, error: message }, status as any);
}

// ============================================================================
//  محدودسازیِ نرخِ درخواست (Rate limiting) مبتنی بر D1 — پنجرهٔ ثابت
//  بازگشت true اگر مجاز، false اگر از حد گذشته. در خطای DB، fail-open.
// ============================================================================
export async function rateLimit(
  db: D1Database,
  action: string,
  ip: string,
  max: number,
  windowMs: number
): Promise<boolean> {
  if (!ip) return true;
  const key = `${action}:${ip}`;
  const now = Date.now();
  try {
    const row = await db
      .prepare('SELECT count, window_start FROM rate_limits WHERE bucket_key = ?')
      .bind(key)
      .first<{ count: number; window_start: number }>();
    if (!row || now - row.window_start >= windowMs) {
      await db
        .prepare(
          `INSERT INTO rate_limits (bucket_key, count, window_start) VALUES (?, 1, ?)
           ON CONFLICT(bucket_key) DO UPDATE SET count = 1, window_start = excluded.window_start`
        )
        .bind(key, now)
        .run();
      return true;
    }
    if (row.count >= max) return false;
    await db.prepare('UPDATE rate_limits SET count = count + 1 WHERE bucket_key = ?').bind(key).run();
    return true;
  } catch {
    return true;
  }
}

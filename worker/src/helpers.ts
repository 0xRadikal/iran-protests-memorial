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

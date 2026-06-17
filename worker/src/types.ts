// انواع و bindingهای محیطِ Cloudflare Worker
export type Bindings = {
  DB: D1Database;
  ENVIRONMENT: string;
  // اسرار (با wrangler secret put تنظیم می‌شوند)
  TURNSTILE_SECRET?: string;     // کلیدِ مخفیِ Turnstile
  ALLOWED_ORIGINS?: string;      // دامنه‌های مجاز برای CORS (با کاما)
  SESSION_TTL_HOURS?: string;    // مدتِ اعتبارِ نشست (پیش‌فرض ۱۲)
};

export type Variables = {
  adminId?: number;
  adminUsername?: string;
  adminRole?: string;
};

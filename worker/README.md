# جاویدنام — پنلِ مدیریت و API مشارکتِ مردمی

این پوشه، **بک‌اِندِ مستقل** پروژهٔ جاویدنام است که روی **Cloudflare Workers + D1**
اجرا می‌شود. سایتِ عمومی روی **GitHub Pages** میزبانی می‌شود و فقط «ظاهر» است؛
همهٔ منطق، پایگاه‌داده و پنلِ مدیریت اینجا (Worker) قرار دارد.

```
┌────────────────────────┐        fetch (CORS)        ┌──────────────────────────────┐
│   GitHub Pages (public) │ ─────────────────────────▶ │  Cloudflare Worker (Hono)      │
│   index.html + JS/CSS   │                            │  • API عمومی  /api/*           │
│   community.js          │ ◀───────────────────────── │  • API ادمین  /api/admin/*     │
└────────────────────────┘         JSON                │  • پنل ادمین  /admin           │
                                                        │            │ D1 (SQLite)       │
                                                        └────────────┴───────────────────┘
```

## معماری و امنیت

- **Hono v4** روی Cloudflare Workers (لبه، جهانی، سریع).
- **Cloudflare D1** (SQLite) برای ذخیره‌سازیِ پایدار — ۱۰ جدول.
- **احراز هویتِ ادمین:** رمز با **PBKDF2 (۱۰۰٬۰۰۰ تکرار، SHA‑256)** هش می‌شود
  (Web Crypto API، بدونِ کتابخانهٔ خارجی). نشست‌ها مبتنی بر توکن (`Bearer`) با
  انقضای ۱۲ ساعته در جدولِ `admin_sessions`.
- **Cloudflare Turnstile** (اختیاری) برای محافظت از فرم‌های عمومی در برابرِ ربات/اسپم.
  در نبودِ `TURNSTILE_SECRET`، سامانه بدونِ کپچا کار می‌کند (مناسبِ توسعه).
- **CORS** فقط به دامنهٔ GitHub Pages اجازهٔ فراخوانی می‌دهد (`ALLOWED_ORIGINS`).
- **ثبتِ ممیزی (audit log):** همهٔ کنش‌های ادمین در `audit_log` ثبت می‌شود.
- **الگوی صفِ بازبینی (moderation queue):** همهٔ ورودی‌های کاربر در وضعیتِ
  `pending`/`open` آغاز می‌شوند و مدیر تأیید/رد می‌کند.

## امکانات

| امکان | کاربر | مدیر |
|---|---|---|
| **کامنت‌ها** | پیامِ یادبود می‌گذارد؛ کامنتِ نامناسب را گزارش می‌کند | پیش‌تأیید یا پس‌تأیید؛ حذف؛ رسیدگی به گزارش‌ها |
| **گزارشِ جاویدنام** | تکراری / اطلاعاتِ نادرست / … را گزارش می‌کند | بررسی؛ در صورتِ تکراری **ادغام (merge)** |
| **پیشنهادِ عکس** | برای جاویدنامِ بدونِ عکس، URL می‌فرستد | بررسی؛ در صورتِ صحت روی رکورد اعمال می‌کند |
| **افزودنِ جاویدنام** | نام و جزئیاتِ جان‌باختهٔ تازه را می‌فرستد | صحت‌سنجی؛ در صورتِ تأیید رکوردِ تازه می‌سازد |

## مسیرهای API

### عمومی (`/api`) — بدونِ احراز هویت، محافظت‌شده با Turnstile
- `GET  /api/health` — سلامت + اتصالِ DB
- `GET  /api/stats` — شمارندهٔ عمومیِ کامنت‌ها
- `GET  /api/comments/:personId` — کامنت‌های تأییدشدهٔ یک جاویدنام
- `POST /api/comments` — ثبتِ کامنت `{person_id, author_name?, body, turnstile_token?}`
- `POST /api/comments/:id/report` — گزارشِ کامنت `{reason?, turnstile_token?}`
- `POST /api/reports` — گزارشِ جاویدنام `{person_id, report_type, description?, reporter_name?, …}`
- `POST /api/photo-suggestions` — پیشنهادِ عکس `{person_id, photo_url, source_note?, …}`
- `POST /api/submissions` — افزودنِ جاویدنام `{name, name_en?, age?, …}`

### ادمین (`/api/admin`) — محافظت‌شده با `Authorization: Bearer <token>`
- `POST /api/admin/login` `{username, password}` → `{token, expires_at, admin}`
- `POST /api/admin/logout` · `GET /api/admin/me`
- `GET  /api/admin/dashboard` — آمار + ۱۵ کنشِ اخیر
- `GET  /api/admin/comments?status=|reported=1` · `POST /api/admin/comments/:id/:action` (`approve|reject|spam|delete`)
- `GET  /api/admin/reports?status=|type=` · `POST /api/admin/reports/:id/:action` (`resolve|dismiss`)
- `GET  /api/admin/photo-suggestions?status=` · `POST /api/admin/photo-suggestions/:id/:action` (`approve|reject`)
- `GET  /api/admin/submissions?status=` · `POST /api/admin/submissions/:id/:action` (`approve|reject`)
- `POST /api/admin/people/merge` `{keep_id, duplicate_id}` — ادغامِ تکراری
- `GET  /api/admin/people/search?q=` — جست‌وجو برای انتخابِ مرجعِ ادغام
- `GET  /api/admin/settings` · `POST /api/admin/settings` (key/value)

### پنلِ ادمین (تک‌صفحه‌ایِ SPA)
- `GET /admin` — رابطِ کاربری (HTML)
- `GET /admin-app.js` — منطقِ سمتِ کاربر (Vanilla JS)

## استقرار (Deployment)

```bash
cd worker
npm install
export CLOUDFLARE_API_TOKEN=...        # توکنِ حساب
export CLOUDFLARE_ACCOUNT_ID=...

# ۱) ساختِ پایگاه‌داده (یک‌بار)
npx wrangler d1 create javidnaman-db    # database_id را در wrangler.jsonc بگذارید

# ۲) اعمالِ مهاجرت روی تولید
npx wrangler d1 migrations apply javidnaman-db --remote

# ۳) ورودِ ۵۲۰۲ جاویدنام (آینهٔ سبک برای اتصالِ کامنت/گزارش)
node scripts/import_people.mjs --remote

# ۴) ساختِ کاربرِ ادمین
node scripts/make_admin.mjs admin 'YOUR_STRONG_PASSWORD' 'مدیر سایت' superadmin > /tmp/a.sql
npx wrangler d1 execute javidnaman-db --remote --file=/tmp/a.sql && rm /tmp/a.sql

# ۵) استقرار
npx wrangler deploy
```

### تنظیمِ Turnstile (اختیاری ولی توصیه‌شده)
1. در داشبوردِ Cloudflare → Turnstile یک ویجتِ تازه بسازید (نوع: Managed).
   دامنه: `0xradikal.github.io`.
2. **Site Key** را در `assets/js/community.js` در `TURNSTILE_SITEKEY` بگذارید.
3. **Secret Key** را به‌صورتِ secret روی Worker تنظیم کنید:
   ```bash
   npx wrangler secret put TURNSTILE_SECRET
   ```
4. دوباره deploy کنید. از این پس همهٔ فرم‌های عمومی کپچا می‌خواهند.

## توسعهٔ محلی

```bash
cd worker
cp .dev.vars.example .dev.vars
cp ecosystem.config.example.cjs ecosystem.config.cjs   # سپس توکن را از env بخوانید
npx wrangler d1 migrations apply javidnaman-db --local
node scripts/import_people.mjs --local
node scripts/make_admin.mjs admin 'JavidNaman@2024' > /tmp/a.sql
npx wrangler d1 execute javidnaman-db --local --file=/tmp/a.sql
pm2 start ecosystem.config.cjs
curl http://localhost:3000/api/health
```

## نشانی‌های زنده
- **Worker / API:** https://javidnaman-admin.radikalradikal1.workers.dev
- **پنلِ ادمین:** https://javidnaman-admin.radikalradikal1.workers.dev/admin
- **سایتِ عمومی:** https://0xradikal.github.io/Javid-Naman/

## نکاتِ امنیتی
- فایل‌های `.dev.vars` و `ecosystem.config.cjs` (حاویِ توکن) در `.gitignore` هستند و **نباید** commit شوند.
- رمزِ ادمین را پس از نخستین ورود تغییر دهید.
- پس از پایانِ راه‌اندازی، توکنِ موقتِ Cloudflare را از داشبورد **باطل (revoke)** کنید و
  در صورتِ نیاز توکنِ تازه با کمترین دسترسی بسازید.

## ممیزیِ امنیتی و رفعِ اشکال (Security Audit)

ممیزیِ کاملِ کد انجام شد و موارد زیر اصلاح و در پروداکشن مستقر شدند:

1. **رفعِ آسیب‌پذیریِ XSS (تزریقِ JS) در پنلِ ادمین** — همهٔ ۱۸ هندلرِ
   inline `onclick` با مقادیرِ پویا به الگوی `data-action` + `data-*` و
   event delegation (`handleClick` روی `#content` و `#modalBody`) تبدیل شدند.
   دیگر دادهٔ کاربر داخلِ کانتکستِ JS قرار نمی‌گیرد.
2. **محدودسازیِ نرخ (Rate Limiting)** — محدودکنندهٔ پنجره‌ثابتِ مبتنی بر D1
   (`helpers.rateLimit` + جدولِ `rate_limits`، fail-open) روی هر ۵ مسیرِ POSTِ عمومی
   (کامنت/گزارش/عکس/ثبت) اعمال شد؛ سقف‌ها: کامنت ۵، گزارش ۱۰، عکس ۵، ثبت ۳ در دقیقه.
   در صورتِ تجاوز، پاسخِ `429` بازگردانده می‌شود.
3. **اعتبارسنجیِ شناسه و idempotency در مسیرهای ادمین** — بررسیِ `Number.isFinite`
   برای شناسه‌ها (۴۰۰)، بررسیِ `res.meta.changes` برای رکوردِ نایافته (۴۰۴)،
   بررسیِ `status !== 'pending'` برای جلوگیری از پردازشِ دوباره (۴۰۹).
4. **بررسیِ وجودِ رکورد در ادغام (merge)** — پیش از ادغام، وجودِ هر دو رکوردِ
   `keep_id` و `duplicate_of` بررسی می‌شود (۴۰۴ در صورتِ نبود).

> همهٔ موارد با تستِ زندهٔ پروداکشن تأیید شدند (مثلاً درخواستِ ششمِ کامنت ⇐ `429`).
> commit مرجع: `131b529`.

// ============================================================================
//  جاویدنام — Worker اصلی (Hono)
//  • API عمومی (کامنت/گزارش/عکس/افزودن) با حفاظتِ Turnstile
//  • API ادمین (محافظت‌شده با نشست)
//  • CORS برای فراخوانی از GitHub Pages
// ============================================================================
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { Bindings, Variables } from './types';
import { ok, fail } from './helpers';
import pub from './routes_public';
import adminRoutes from './routes_admin';
import { ADMIN_HTML } from './admin_html';
import { ADMIN_JS } from './admin_js';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use('*', logger());

// --- CORS: دامنه‌های مجاز از متغیرِ محیطی (با کاما) خوانده می‌شود ---
app.use('/api/*', async (c, next) => {
  const allowed = (c.env.ALLOWED_ORIGINS || '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const handler = cors({
    origin: (origin) => {
      if (allowed.includes('*')) return origin || '*';
      return allowed.includes(origin) ? origin : '';
    },
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  });
  return handler(c, next);
});

// --- سلامت ---
app.get('/', (c) =>
  c.json({
    name: 'Javidnaman Admin API',
    status: 'ok',
    time: new Date().toISOString(),
    docs: '/api/health',
  })
);
app.get('/api/health', async (c) => {
  try {
    const r = await c.env.DB.prepare('SELECT 1 AS ok').first();
    return ok(c, { db: r?.ok === 1 });
  } catch (e: any) {
    return fail(c, 'DB error: ' + (e?.message || e), 500);
  }
});

// --- مسیرها ---
app.route('/api', pub);
app.route('/api/admin', adminRoutes);

// --- پنلِ ادمین (تک‌صفحه) ---
app.get('/admin', (c) => c.html(ADMIN_HTML));
app.get('/admin/', (c) => c.html(ADMIN_HTML));
app.get('/admin-app.js', (c) => {
  c.header('Content-Type', 'text/javascript; charset=utf-8');
  return c.body(ADMIN_JS);
});

// --- favicon (نمادِ سبک به‌صورت SVG تا 404 نگیریم) ---
app.get('/favicon.ico', (c) => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#0f172a"/><text x="32" y="44" font-size="36" text-anchor="middle" fill="#fbbf24" font-family="serif">ج</text></svg>';
  c.header('Content-Type', 'image/svg+xml');
  c.header('Cache-Control', 'public, max-age=86400');
  return c.body(svg);
});

app.notFound((c) => fail(c, 'مسیر یافت نشد', 404));
app.onError((err, c) => {
  console.error(err);
  return fail(c, 'خطای داخلی سرور', 500);
});

export default app;

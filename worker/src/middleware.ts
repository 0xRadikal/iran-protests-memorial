// ============================================================================
//  میان‌افزارِ احراز هویتِ ادمین — بررسیِ توکنِ نشست از هدر Authorization
// ============================================================================
import type { Context, Next } from 'hono';
import type { Bindings, Variables } from './types';
import { fail } from './helpers';

export async function requireAdmin(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  next: Next
) {
  const auth = c.req.header('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return fail(c, 'احراز هویت لازم است', 401);

  const row = await c.env.DB.prepare(
    `SELECT s.admin_id, s.expires_at, a.username, a.role, a.is_active
       FROM admin_sessions s
       JOIN admins a ON a.id = s.admin_id
      WHERE s.token = ?`
  )
    .bind(token)
    .first<{ admin_id: number; expires_at: string; username: string; role: string; is_active: number }>();

  if (!row) return fail(c, 'نشستِ نامعتبر', 401);
  if (!row.is_active) return fail(c, 'حسابِ ادمین غیرفعال است', 403);
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await c.env.DB.prepare('DELETE FROM admin_sessions WHERE token = ?').bind(token).run();
    return fail(c, 'نشست منقضی شده است', 401);
  }

  c.set('adminId', row.admin_id);
  c.set('adminUsername', row.username);
  c.set('adminRole', row.role);
  await next();
}

// ثبتِ فعالیتِ ادمین در audit_log
export async function audit(
  db: D1Database,
  adminId: number | undefined,
  action: string,
  entityType: string,
  entityId: string | number,
  detail = ''
) {
  try {
    await db
      .prepare(
        `INSERT INTO audit_log (admin_id, action, entity_type, entity_id, detail)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(adminId ?? null, action, entityType, String(entityId), detail)
      .run();
  } catch {
    /* لاگ نباید جریانِ اصلی را بشکند */
  }
}

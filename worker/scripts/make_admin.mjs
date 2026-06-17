#!/usr/bin/env node
/**
 * make_admin.mjs — تولیدِ SQL برای ساختِ ادمینِ اولیه با هشِ امن (PBKDF2).
 * استفاده:
 *   node scripts/make_admin.mjs <username> <password> [display_name] [role]
 * خروجی: یک دستورِ SQL که باید با wrangler اجرا شود.
 */
import { webcrypto as crypto } from 'node:crypto';

const [, , username, password, displayName = 'مدیر', role = 'superadmin'] = process.argv;
if (!username || !password) {
  console.error('استفاده: node scripts/make_admin.mjs <username> <password> [display_name] [role]');
  process.exit(1);
}

const PBKDF2_ITERATIONS = 100_000;
function buf2hex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function randomHex(bytes = 16) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function hex2buf(hex) {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(hex.substr(i * 2, 2), 16);
  return arr;
}

const salt = randomHex(16);
const enc = new TextEncoder();
const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
const bits = await crypto.subtle.deriveBits(
  { name: 'PBKDF2', salt: hex2buf(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
  keyMaterial,
  256
);
const hash = buf2hex(bits);

const esc = (s) => String(s).replace(/'/g, "''");
const sql = `INSERT OR REPLACE INTO admins (username, password_hash, salt, display_name, role, is_active)
VALUES ('${esc(username)}', '${hash}', '${salt}', '${esc(displayName)}', '${esc(role)}', 1);`;

console.log(sql);

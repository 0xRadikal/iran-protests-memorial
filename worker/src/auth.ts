// ============================================================================
//  احراز هویتِ ادمین — رمزنگاری با Web Crypto (PBKDF2) و نشستِ توکنی
//  هیچ کتابخانهٔ خارجیِ رمز لازم نیست؛ همه با Web Crypto استانداردِ Workers.
// ============================================================================

const PBKDF2_ITERATIONS = 100_000;
const KEY_LEN_BITS = 256;

function buf2hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hex2buf(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(hex.substr(i * 2, 2), 16);
  return arr;
}

export function randomHex(bytes = 32): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// تولیدِ هشِ رمز با نمکِ تصادفی
export async function hashPassword(password: string, saltHex?: string): Promise<{ hash: string; salt: string }> {
  const salt = saltHex || randomHex(16);
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: hex2buf(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    KEY_LEN_BITS
  );
  return { hash: buf2hex(bits), salt };
}

// بررسیِ رمز به‌صورتِ مقاوم در برابرِ حملهٔ زمانی (constant-time)
export async function verifyPassword(password: string, hashHex: string, saltHex: string): Promise<boolean> {
  const { hash } = await hashPassword(password, saltHex);
  if (hash.length !== hashHex.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ hashHex.charCodeAt(i);
  return diff === 0;
}

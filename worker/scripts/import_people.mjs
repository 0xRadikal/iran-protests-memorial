#!/usr/bin/env node
/**
 * import_people.mjs
 * ورودِ ۵۲۰۲ جاویدنام از assets/data/javidnam.full.json به جدولِ people در D1.
 * این جدول فقط آینهٔ سبک برای اتصالِ کامنت/گزارش است؛ منبعِ حقیقت همان JSON می‌ماند.
 *
 * استفاده:
 *   node scripts/import_people.mjs --local
 *   node scripts/import_people.mjs --remote
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const FULL = join(ROOT, 'assets', 'data', 'javidnam.full.json');

const isRemote = process.argv.includes('--remote');
const flag = isRemote ? '--remote' : '--local';
const DB = 'javidnaman-db';

function esc(v) {
  if (v === null || v === undefined) return 'NULL';
  return "'" + String(v).replace(/'/g, "''") + "'";
}

const data = JSON.parse(readFileSync(FULL, 'utf-8'));
const people = data.people || [];
console.log(`خواندنِ ${people.length} رکورد از full.json`);

const rows = people.map((p) => {
  const id = p.id;
  const name = p.n || '';
  const nameEn = p.ne || null;
  const event = p.e || null;
  const city = p.c || null;
  const photo = p.ph || null;
  const slug = p.sl || null;
  const notable = p.nt ? 1 : 0;
  return `(${esc(id)}, ${esc(name)}, ${esc(nameEn)}, ${esc(event)}, ${esc(city)}, ${esc(photo)}, ${esc(slug)}, ${notable})`;
});

// در دسته‌های ۱۰۰‌تایی برای جلوگیری از محدودیتِ اندازهٔ کوئریِ SQLite (SQLITE_TOOBIG)
const BATCH = 100;
const tmpDir = mkdtempSync(join(tmpdir(), 'jvn-import-'));
let fileIdx = 0;
const files = [];
for (let i = 0; i < rows.length; i += BATCH) {
  const chunk = rows.slice(i, i + BATCH);
  const sql =
    `INSERT OR REPLACE INTO people (id, name, name_en, event, city, photo_url, slug, notable) VALUES\n` +
    chunk.join(',\n') +
    ';\n';
  const f = join(tmpDir, `batch_${String(fileIdx).padStart(3, '0')}.sql`);
  writeFileSync(f, sql, 'utf-8');
  files.push(f);
  fileIdx++;
}
console.log(`ساختِ ${files.length} فایلِ دسته‌ای در ${tmpDir}`);

let done = 0;
for (const f of files) {
  process.stdout.write(`اعمالِ ${++done}/${files.length} ... `);
  try {
    execSync(`npx wrangler d1 execute ${DB} ${flag} --file="${f}"`, {
      cwd: join(__dirname, '..'),
      stdio: ['ignore', 'ignore', 'inherit'],
      env: process.env,
    });
    console.log('✓');
  } catch (e) {
    console.error('✗ خطا در دسته', f);
    throw e;
  }
}
console.log(`✅ پایان: ${people.length} رکورد وارد شد (${flag}).`);

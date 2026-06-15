#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fix_event_assignment.py  (نسخهٔ جامع)
-------------------------------------
اصلاح هوشمند، قطعی و محافظه‌کارانهٔ تخصیص رویداد (event) به جاویدنام‌ها.

ترتیب اعتماد به منابع برای تعیین «سالِ جان‌باختن»:
  1) فیلد ساختاریافتهٔ dj (تاریخ جلالی) — قوی‌ترین و قابل‌اعتمادترین.
  2) فیلد ساختاریافتهٔ dg (تاریخ میلادی) — وقتی dj نامعتبر است.
  3) تاریخِ صریحِ «روز+ماه+سال» داخل روایت (story) — به‌عنوان پشتیبان.

قواعد ایمنی:
  - رویدادهای «نوع‌مرگ» (executions / deaths_in_custody) بر اساس سال جابه‌جا نمی‌شوند.
  - فقط زمانی رویداد عوض می‌شود که سالِ قطعیِ جان‌باختن با رویدادِ زمان‌مندِ دیگری
    یکتا منطبق باشد.
  - برای 1396 (که هم dey_96 و هم darvish_96 است) بر اساس کلیدواژهٔ «دراویش/گنابادی»
    تصمیم گرفته می‌شود.
  - همهٔ تغییرات لاگ و نسخهٔ پشتیبان ساخته می‌شود.
"""
import json, re, sys, os, datetime
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'assets', 'data')
SRC = os.path.join(DATA, 'javidnam.full.json')

FA = str.maketrans('۰۱۲۳۴۵۶۷۸۹', '0123456789')
def norm(s):
    return (s or '').translate(FA)

EVENT_YEAR = {
    'kuye_daneshgah_78': 1378, 'green_88': 1388, 'dey_96': 1396,
    'darvish_96': 1396, 'mordad_97': 1397, 'kazerun_97': 1397,
    'aban_98': 1398, 'khuzestan_1400': 1400, 'khizesh_1401': 1401,
    'khizesh_1404': 1404,
}
YEAR_TO_EVENT = {
    1378: 'kuye_daneshgah_78', 1388: 'green_88', 1396: 'dey_96',
    1397: 'mordad_97', 1398: 'aban_98', 1400: 'khuzestan_1400',
    1401: 'khizesh_1401', 1404: 'khizesh_1404',
}
TYPE_EVENTS = {'executions', 'deaths_in_custody'}

MONTHS = 'فروردین|اردیبهشت|خرداد|تیر|مرداد|شهریور|مهر|آبان|آذر|دی|بهمن|اسفند'
DAY_MONTH_YEAR_RE = re.compile(r'\d{1,2}\s*(?:' + MONTHS + r')\s*(13[7-9][0-9]|140[0-9])')
BIRTH_CTX_BEFORE = re.compile(r'(?:متولد|زاده|زادهٔ|تولد)')
BIRTH_CTX_AFTER = re.compile(r'(?:به دنیا آمد|متولد شد|زاده شد)')
ANNIV_CTX = re.compile(r'(?:سالگرد|سالروز|ورودی|دانشجوی?\s*ورودی)')
OTHER_PERSON_CTX = re.compile(r'(?:مزار|آرامگاه|جان‌باختگان|جانباختگان)\s')


def jalali_year_from_dj(p):
    """سال جلالیِ معتبر را از فیلد dj برمی‌گرداند (فقط بازهٔ معقول 1370..1410).

    اصلاح خطای تایپی: قیام تشنگانِ خوزستان ۱۴۰۰ در تابستان (تیر/مرداد) رخ داد؛
    پس هر تاریخِ «۱۴۰۰/دی یا بهمن یا اسفند» در عمل خطای تایپِ «۱۴۰۴» است
    (خیزش دی‌ماه ۱۴۰۴) و به همان سال نگاشت می‌شود. (آذر را به‌خاطر ابهام دست نمی‌زنیم.)
    """
    dj = norm(p.get('dj') or '')
    m = re.match(r'(1[34]\d\d)\s*/\s*(\d{1,2})', dj)
    if m:
        y = int(m.group(1))
        mo = int(m.group(2))
        if 1370 <= y <= 1410:
            if y == 1400 and mo >= 10:  # دی/بهمن/اسفندِ ۱۴۰۰ → خطای تایپِ ۱۴۰۴
                return 1404
            return y
    return None


def jalali_year_from_dg(p):
    """تخمین سال جلالی از تاریخ میلادیِ معتبر (فیلد dg)."""
    dg = p.get('dg') or ''
    m = re.match(r'(\d{4})-(\d{2})-(\d{2})', dg)
    if not m:
        return None
    gy, gm, gd = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if gy < 1990 or gy > 2030:
        return None  # احتمالاً مقدار خراب (مثلاً تاریخ جلالی در فیلد میلادی)
    # تخمین ساده: سال جلالی ≈ میلادی - 621 (بعد از فروردین) یا -622 (قبل)
    jy = gy - 621 if gm >= 4 else gy - 622
    return jy


def death_year_from_story(p):
    """سالِ قطعیِ جان‌باختن را از روایت استخراج می‌کند (تنها روز+ماه+سال)."""
    s = norm(p.get('s') or '')
    if not s:
        return None
    years = set()
    for m in DAY_MONTH_YEAR_RE.finditer(s):
        start, end = m.start(), m.end()
        cb = s[max(0, start - 28):start]
        ca = s[end:end + 18]
        if BIRTH_CTX_BEFORE.search(cb) or BIRTH_CTX_AFTER.search(ca):
            continue
        if ANNIV_CTX.search(cb) or OTHER_PERSON_CTX.search(cb):
            continue
        years.add(int(m.group(1)))
    if len(years) == 1:
        return next(iter(years))
    return None


def best_year(p):
    """بهترین تخمینِ سالِ جان‌باختن را با ترتیب اعتماد برمی‌گرداند (year, source)."""
    y = jalali_year_from_dj(p)
    if y is not None:
        return y, 'dj'
    y = jalali_year_from_dg(p)
    if y is not None:
        return y, 'dg'
    y = death_year_from_story(p)
    if y is not None:
        return y, 'story'
    return None, None


def decide(p):
    e = p.get('e')
    if e in TYPE_EVENTS or e not in EVENT_YEAR:
        return None
    y, src = best_year(p)
    if y is None:
        return None
    if y == EVENT_YEAR[e]:
        return None
    target = YEAR_TO_EVENT.get(y)
    if not target or target == e:
        return None
    # نگاشت ویژهٔ 1396
    if y == 1396 and re.search('دراویش|درویش|گنابادی', norm(p.get('s') or '')):
        target = 'darvish_96'
    return (target, src, y)


def fix_broken_dates(people):
    """اصلاح رکوردهایی که تاریخ جلالی در فیلد dg و مقدار خرابِ dj دارند.

    در این رکوردها فیلد dg در واقع تاریخِ جلالی است (مثلاً 1401-06-30) و dj خراب
    است (مثلاً ۰۷۸۰/۰۴/۰۹). تاریخ صحیح را بازسازی می‌کند: dj جلالی، dg میلادیِ معادل.
    """
    try:
        import jdatetime
    except ImportError:
        return []
    fixed = []
    EN = str.maketrans('0123456789', '۰۱۲۳۴۵۶۷۸۹')
    for p in people:
        dj = norm(p.get('dj') or '')
        dg = p.get('dg') or ''
        m = re.match(r'(\d{3,4})/', dj)
        if not m:
            continue
        y = int(m.group(1))
        if 1370 <= y <= 1410:
            continue  # dj معتبر است
        # dj خراب؛ آیا dg یک تاریخِ جلالیِ جامانده است؟
        gm = re.match(r'(\d{4})-(\d{2})-(\d{2})$', dg)
        if not gm:
            continue
        jy, jmo, jd = int(gm.group(1)), int(gm.group(2)), int(gm.group(3))
        if not (1370 <= jy <= 1410 and 1 <= jmo <= 12 and 1 <= jd <= 31):
            continue
        try:
            greg = jdatetime.date(jy, jmo, jd).togregorian()
        except Exception:
            continue
        old_dj, old_dg = p.get('dj'), p.get('dg')
        new_dj = f'{jy:04d}/{jmo:02d}/{jd:02d}'.translate(EN)
        new_dg = greg.strftime('%Y-%m-%d')
        p['dj'] = new_dj
        p['dg'] = new_dg
        fixed.append({'id': p['id'], 'name': p.get('n'),
                      'old_dj': old_dj, 'new_dj': new_dj,
                      'old_dg': old_dg, 'new_dg': new_dg})
    return fixed


def main():
    apply = '--apply' in sys.argv
    with open(SRC, 'r', encoding='utf-8') as f:
        data = json.load(f)
    people = data['people']

    # مرحلهٔ ۱: اصلاح تاریخ‌های خراب (تا فیلد dj برای تصمیم رویداد قابل‌اعتماد شود)
    date_fixes = fix_broken_dates(people)
    print(f'=== اصلاح تاریخ‌های خراب: {len(date_fixes)} مورد ===')
    for c in date_fixes:
        print(f"  {c['name']}: dj {c['old_dj']} -> {c['new_dj']} | dg {c['old_dg']} -> {c['new_dg']}")
    print()

    changes = []
    for p in people:
        d = decide(p)
        if d:
            target, src, y = d
            changes.append({'id': p['id'], 'name': p.get('n'), 'from': p['e'],
                            'to': target, 'src': src, 'year': y,
                            'dj': p.get('dj'), 'dg': p.get('dg')})

    by_src = Counter(c['src'] for c in changes)
    by_pair = Counter((c['from'], c['to']) for c in changes)
    print(f'=== مجموع اصلاحاتِ رویداد: {len(changes)} مورد ===')
    print('منبع تصمیم:', dict(by_src))
    print('جفت‌های تغییر:')
    for (a, b), n in by_pair.most_common():
        print(f'   {a} -> {b}: {n}')
    print()
    for c in changes[:25]:
        print(f"  {c['id']} | {c['name']} | {c['from']} -> {c['to']} "
              f"(year={c['year']}, src={c['src']}, dj={c['dj']})")
    if len(changes) > 25:
        print(f'  ... و {len(changes)-25} مورد دیگر')

    if apply and (changes or date_fixes):
        ts = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
        # نسخهٔ پشتیبان از فایلِ روی دیسک (قبل از هر تغییری)
        with open(SRC, 'r', encoding='utf-8') as f:
            orig = f.read()
        bak = SRC + f'.bak_{ts}'
        with open(bak, 'w', encoding='utf-8') as f:
            f.write(orig)
        print(f'\nنسخهٔ پشتیبان: {bak}')

        idmap = {c['id']: c['to'] for c in changes}
        for p in people:
            if p['id'] in idmap:
                p['e'] = idmap[p['id']]

        by_event = Counter(p.get('e') for p in people)
        data['meta']['by_event'] = {k: by_event.get(k, 0) for k in data['events'].keys()}
        data['meta']['generated'] = datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S.000Z')

        with open(SRC, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
        print(f'✅ اعمال شد: {len(changes)} رکورد')
        print('by_event جدید:', dict(data['meta']['by_event']))
        # ذخیرهٔ گزارش اصلاحات
        rep = os.path.join(ROOT, 'scripts', 'event_fix_report.json')
        with open(rep, 'w', encoding='utf-8') as f:
            json.dump(changes, f, ensure_ascii=False, indent=2)
        print('گزارش کامل:', rep)
    elif not apply:
        print('\n(پیش‌نمایش — برای اعمال --apply بدهید)')


if __name__ == '__main__':
    main()

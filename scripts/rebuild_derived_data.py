#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
rebuild_derived_data.py
-----------------------
بازسازی همهٔ فایل‌های مشتقِ دیتا از روی منبعِ حقیقت (javidnam.full.json)،
تا پس از اصلاحِ رویداد/تاریخ، همهٔ فرمت‌ها (json / lite / min / csv / by-event /
statistics) با هم سازگار و قابل‌استناد بمانند.

نگاشتِ کلیدهای کوتاه (در full) به کلیدهای کاملِ schema:
    n→name, ne→name_en, e→event, g→gender, a→age, by→birth_year,
    dj→date_jalali, dg→date_gregorian, c→city, pr→province, ca→cause,
    oc→occupation, s→story, se→story_en, ph→photo_url, ml→memorial_links,
    nt→notable, v→verification, sl→slug, src→sources
"""
import json, os, csv, datetime
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'assets', 'data')
SRC = os.path.join(DATA, 'javidnam.full.json')

SHORT2LONG = {
    'n': 'name', 'ne': 'name_en', 'e': 'event', 'g': 'gender', 'a': 'age',
    'by': 'birth_year', 'dj': 'date_jalali', 'dg': 'date_gregorian',
    'c': 'city', 'pr': 'province', 'ca': 'cause', 'oc': 'occupation',
    's': 'story', 'se': 'story_en', 'ph': 'photo_url', 'ml': 'memorial_links',
    'nt': 'notable', 'v': 'verification', 'sl': 'slug', 'src': 'sources',
}
# ترتیب کاملِ فیلدها در فرمتِ long (مطابق فایل‌های موجود)
LONG_ORDER = ['id', 'slug', 'name', 'name_en', 'event', 'gender', 'age',
              'birth_year', 'date_jalali', 'date_gregorian', 'city', 'province',
              'cause', 'occupation', 'story', 'story_en', 'photo_url',
              'memorial_links', 'notable', 'verification', 'flagged_review',
              'sources']
# فیلدهای فرمتِ lite (کلیدهای کوتاه)
LITE_KEYS = ['id', 'n', 'ne', 'e', 'g', 'a', 'dj', 'c', 'pr', 'ca', 'oc', 'nt', 'v', 's']
CSV_COLS = ['id', 'name', 'name_en', 'event', 'gender', 'age', 'birth_year',
            'date_jalali', 'date_gregorian', 'city', 'province', 'cause',
            'occupation', 'notable', 'verification', 'sources']


def to_long(p):
    """تبدیل رکوردِ کوتاه به رکوردِ کاملِ schema با ترتیب ثابت."""
    out = {}
    for k in LONG_ORDER:
        if k == 'id':
            out['id'] = p.get('id')
        elif k == 'flagged_review':
            out['flagged_review'] = p.get('fr')  # ممکن است وجود نداشته باشد
        else:
            # کلیدِ کوتاهِ متناظر را پیدا کن
            short = next((s for s, l in SHORT2LONG.items() if l == k), None)
            v = p.get(short) if short else None
            if k == 'notable':
                v = bool(v) if v is not None else False
            if k in ('memorial_links', 'sources') and v is None:
                v = []
            out[k] = v
    return out


def main():
    with open(SRC, 'r', encoding='utf-8') as f:
        data = json.load(f)
    people = data['people']
    events = data['events']
    meta = data['meta']

    # حفظِ فیلدِ flagged_review از فایلِ long قبلی (در full ذخیره نمی‌شود)
    flagged = {}
    prev_long = os.path.join(DATA, 'javidnam.json')
    if os.path.exists(prev_long):
        try:
            with open(prev_long, 'r', encoding='utf-8') as f:
                for p in json.load(f).get('people', []):
                    if p.get('flagged_review'):
                        flagged[p['id']] = p['flagged_review']
        except Exception:
            pass

    long_people = [to_long(p) for p in people]
    for lp in long_people:
        if lp['id'] in flagged:
            lp['flagged_review'] = flagged[lp['id']]

    # ---- javidnam.json (long, pretty) ----
    obj_json = {'metadata': meta, 'events': events, 'people': long_people}
    with open(os.path.join(DATA, 'javidnam.json'), 'w', encoding='utf-8') as f:
        json.dump(obj_json, f, ensure_ascii=False, indent=2)

    # ---- javidnam.min.json (long, minified) ----
    with open(os.path.join(DATA, 'javidnam.min.json'), 'w', encoding='utf-8') as f:
        json.dump(obj_json, f, ensure_ascii=False, separators=(',', ':'))

    # ---- javidnam.lite.json (short keys, minified) ----
    lite_people = []
    for p in people:
        lp = {}
        for k in LITE_KEYS:
            if k in p:
                lp[k] = p[k]
        lite_people.append(lp)
    obj_lite = {'meta': meta, 'events': events, 'people': lite_people}
    with open(os.path.join(DATA, 'javidnam.lite.json'), 'w', encoding='utf-8') as f:
        json.dump(obj_lite, f, ensure_ascii=False, separators=(',', ':'))

    # ---- javidnam.csv ----
    csv_path = os.path.join(DATA, 'javidnam.csv')
    with open(csv_path, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f)
        w.writerow(CSV_COLS)
        for lp in long_people:
            row = []
            for c in CSV_COLS:
                v = lp.get(c)
                if c == 'sources' and isinstance(v, list):
                    v = '; '.join(v)
                if c == 'notable':
                    v = 'true' if v else 'false'
                row.append('' if v is None else v)
            w.writerow(row)

    # ---- by-event/*.json ----
    be_dir = os.path.join(DATA, 'by-event')
    os.makedirs(be_dir, exist_ok=True)
    by_ev = {}
    for lp in long_people:
        by_ev.setdefault(lp['event'], []).append(lp)
    for ev_key, info in events.items():
        plist = by_ev.get(ev_key, [])
        obj = {'event': ev_key, 'info': info, 'count': len(plist), 'people': plist}
        with open(os.path.join(be_dir, f'{ev_key}.json'), 'w', encoding='utf-8') as f:
            json.dump(obj, f, ensure_ascii=False, indent=2)

    # ---- statistics.json ----
    stats_path = os.path.join(DATA, 'statistics.json')
    with open(stats_path, 'r', encoding='utf-8') as f:
        stats = json.load(f)
    by_event = Counter(p.get('e') for p in people)
    stats['by_event'] = {k: by_event.get(k, 0) for k in events.keys()}
    stats['total'] = len(people)
    stats['by_verification'] = dict(Counter(p.get('v') for p in people))
    stats['by_gender'] = {g: c for g, c in Counter(p.get('g') for p in people).items() if g}
    stats['notable'] = sum(1 for p in people if p.get('nt'))
    stats['generated'] = datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S.000Z')
    with open(stats_path, 'w', encoding='utf-8') as f:
        json.dump(stats, f, ensure_ascii=False, indent=2)

    print('✅ بازسازی شد:')
    print('   javidnam.json, javidnam.min.json, javidnam.lite.json, javidnam.csv')
    print(f'   by-event/*.json ({len(events)} رویداد)')
    print('   statistics.json')
    print('by_event:', dict(stats['by_event']))
    print('total:', stats['total'], '| notable:', stats['notable'])


if __name__ == '__main__':
    main()

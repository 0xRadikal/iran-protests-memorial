#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fix_1404_misfiled.py — Correct 6 records whose STORY unambiguously describes the
18–19 Dey 1404 uprising but were misfiled in khizesh_1401 with wrong dj/dg
(year mis-keyed 1404 -> 1401, with dg auto-derived from the wrong dj).

Evidence per record: story text states "(18|19) Dey 1404", city + source confirm
the 1404 national uprising. We correct event -> khizesh_1404 and set dj/dg to the
story-stated date.

Each correction is hard-coded (no heuristics) so it is fully auditable / citable.
"""
import json, os, sys, datetime, shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FULL = os.path.join(ROOT, 'assets', 'data', 'javidnam.full.json')

# id -> (correct dj jalali, correct dg gregorian) from the story text.
# 18 Dey 1404 = 2026-01-08 ; 19 Dey 1404 = 2026-01-09
CORRECTIONS = {
    'jvn_df0947d425': ('۱۴۰۴/۱۰/۱۸', '2026-01-08', 'میلاد بهادری — story: 18 Dey 1404, Fardis/Karaj'),
    'jvn_6dce97a95c': ('۱۴۰۴/۱۰/۱۸', '2026-01-08', 'امیرحسین راستینه — story: 18 Dey 1404, Tehran'),
    'jvn_0d94f64d6b': ('۱۴۰۴/۱۰/۱۸', '2026-01-08', 'مهین بهروز — story: 18 Dey 1404, Tehran'),
    'jvn_e3fff60dff': ('۱۴۰۴/۱۰/۱۹', '2026-01-09', 'امید عباسی — story: 19 Dey 1404, Tehran'),
    'jvn_6f550543a5': ('۱۴۰۴/۱۰/۱۸', '2026-01-08', 'سجاد سعیدی رامیانی — story: 18 Dey 1404, Haft-Howz Tehran'),
    'jvn_9da9c1e57a': ('۱۴۰۴/۱۰/۱۹', '2026-01-09', 'ماهان مردانی — story: 19 Dey 1404, Tehran'),
}

def main(apply=False):
    data = json.load(open(FULL, encoding='utf-8'))
    idx = {p['id']: p for p in data['people']}
    report = []
    for pid, (dj, dg, why) in CORRECTIONS.items():
        p = idx.get(pid)
        if not p:
            report.append({'id': pid, 'status': 'NOT FOUND'})
            continue
        before = {'e': p.get('e'), 'dj': p.get('dj'), 'dg': p.get('dg')}
        after = {'e': 'khizesh_1404', 'dj': dj, 'dg': dg}
        report.append({'id': pid, 'name': p.get('n'), 'before': before, 'after': after, 'reason': why})
        if apply:
            p['e'] = 'khizesh_1404'
            p['dj'] = dj
            p['dg'] = dg

    # rebuild meta
    by_event = {}
    for p in data['people']:
        by_event[p['e']] = by_event.get(p['e'], 0) + 1
    if apply:
        data['meta']['by_event'] = dict(sorted(by_event.items()))
        data['meta']['total'] = len(data['people'])
        data['meta']['generated'] = datetime.datetime.now(datetime.timezone.utc).isoformat()

    print(json.dumps({'corrections': report, 'by_event_after': dict(sorted(by_event.items())),
                      'total': len(data['people'])}, ensure_ascii=False, indent=2))

    if apply:
        ts = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
        shutil.copy(FULL, FULL + '.bak_1404_' + ts)
        json.dump(data, open(FULL, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
        print('\n>> APPLIED. backup at', FULL + '.bak_1404_' + ts)

if __name__ == '__main__':
    main(apply='--apply' in sys.argv)

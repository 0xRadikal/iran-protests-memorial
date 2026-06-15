#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fix_event_assignment_v2.py  —  Corrective, evidence-based event assignment.

Background
----------
A previous pass (fix_event_assignment.py) introduced a FLAWED rule that treated
any dj == 1400 / month >= 10 as a typo for 1404 and moved those records into
khizesh_1404.  That was WRONG: Dey 1400 (Jan 2022) deaths are genuine and are
NOT part of the "Iran National Uprising 2025-26" (khizesh_1404, year=1404).

This script:
  1. Loads the CURRENT full.json and the ORIGINAL backup.
  2. Reverts ONLY the 3 erroneous 1400-Dey -> khizesh_1404 moves
     (restoring them to their original event from the backup).
  3. Keeps every other previously-applied correction (the 138 valid
     1404->1401 moves, the 8 broken-date fixes, etc.) untouched.
  4. Optionally removes obvious test/junk records (--drop-test).
  5. Rebuilds meta.by_event and writes a report.

Authoritative event-year map comes from data['events'][*]['year'].
TYPE_EVENTS (executions / deaths_in_custody) are never year-reassigned.
"""
import json, re, sys, datetime, shutil, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FULL = os.path.join(ROOT, 'assets', 'data', 'javidnam.full.json')

DIGITS = str.maketrans('۰۱۲۳۴۵۶۷۸۹', '0123456789')
def fa2en(s): return (s or '').translate(DIGITS)

def dj_year(p):
    m = re.match(r'(\d{3,4})/(\d{1,2})/(\d{1,2})', fa2en(p.get('dj') or ''))
    return int(m.group(1)) if m else None

def find_backup():
    data_dir = os.path.join(ROOT, 'assets', 'data')
    baks = sorted([f for f in os.listdir(data_dir) if f.startswith('javidnam.full.json.bak_')])
    return os.path.join(data_dir, baks[-1]) if baks else None

def main(apply=False, drop_test=False):
    data = json.load(open(FULL, encoding='utf-8'))
    bak_path = find_backup()
    if not bak_path:
        print('!! no backup found, aborting'); sys.exit(1)
    bak = json.load(open(bak_path, encoding='utf-8'))
    bakm = {p['id']: p for p in bak['people']}

    reverts = []
    # 1) Revert erroneous 1400-Dey -> khizesh_1404 moves.
    for p in data['people']:
        b = bakm.get(p['id'])
        if not b:
            continue
        y = dj_year(p)
        # Was moved INTO khizesh_1404 by us, but its real year is 1400.
        if (p.get('e') == 'khizesh_1404' and b.get('e') != 'khizesh_1404'
                and y == 1400):
            reverts.append({
                'id': p['id'], 'name': p.get('n'),
                'from': p.get('e'), 'to': b.get('e'),
                'dj': p.get('dj'), 'dg': p.get('dg'),
                'reason': 'Dey 1400 death wrongly moved to 1404; restored to original event'
            })
            if apply:
                p['e'] = b.get('e')

    dropped = []
    if drop_test:
        keep = []
        for p in data['people']:
            nm = (p.get('n') or '')
            if 'تست' in nm or nm.strip().lower() in ('test', 'تست نام'):
                dropped.append({'id': p['id'], 'name': nm})
                if not apply:
                    keep.append(p)  # keep when previewing
                # when applying, skip (drop)
            else:
                keep.append(p)
        if apply:
            data['people'] = keep

    # Rebuild meta.by_event
    by_event = {}
    for p in data['people']:
        by_event[p['e']] = by_event.get(p['e'], 0) + 1
    if apply:
        data['meta']['by_event'] = dict(sorted(by_event.items()))
        data['meta']['total'] = len(data['people'])
        data['meta']['generated'] = datetime.datetime.now(datetime.timezone.utc).isoformat()

    report = {
        'reverts': reverts,
        'reverts_count': len(reverts),
        'dropped': dropped,
        'dropped_count': len(dropped),
        'by_event_after': dict(sorted(by_event.items())),
        'total_after': len(data['people']) - (len(dropped) if apply and drop_test else 0),
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))

    if apply:
        # safety backup of current state before rewrite
        ts = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
        shutil.copy(FULL, FULL + '.bak_v2_' + ts)
        json.dump(data, open(FULL, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
        json.dump(report, open(os.path.join(ROOT, 'scripts', 'event_fix_report_v2.json'), 'w', encoding='utf-8'),
                  ensure_ascii=False, indent=2)
        print('\n>> APPLIED. full.json rewritten; backup at', FULL + '.bak_v2_' + ts)

if __name__ == '__main__':
    main(apply='--apply' in sys.argv, drop_test='--drop-test' in sys.argv)

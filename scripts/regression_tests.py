#!/usr/bin/env python3
"""Regression test suite for YK Dynasty Basketball History site data.

62 tests covering:
- Owner naming (no HaleTrager in canonical positions)
- Vlandis/Kelley/Baden attribution by season
- Fantasy-point correctness in seasons.json
- Structural integrity of all JSON data files
"""

import json
import os
import re
import sys

DATA = os.path.join(os.path.dirname(__file__), '..', 'docs', 'data')
JS   = os.path.join(os.path.dirname(__file__), '..', 'docs', 'js')

passed = 0
failed = 0
errors = []

def load(name):
    with open(os.path.join(DATA, name)) as f:
        return json.load(f)

def read_text(path):
    with open(path) as f:
        return f.read()

def test(name, condition, detail=""):
    global passed, failed
    if condition:
        passed += 1
        print(f"  PASS  {name}")
    else:
        failed += 1
        msg = f"  FAIL  {name}"
        if detail:
            msg += f" — {detail}"
        print(msg)
        errors.append(name)

# System-B files we must NOT have modified
SYSTEM_B = ['trade_details.json', 'trade_leaderboard.json',
            'trade_value_over_time.json', 'trades.json']

# ── 1. JSON structural integrity (5 tests) ────────────────────────────

print("\n── JSON Structural Integrity ──")

# T1: All JSON files parse
all_json_ok = True
for fn in os.listdir(DATA):
    if fn.endswith('.json'):
        try:
            load(fn)
        except Exception as e:
            all_json_ok = False
test("T01: All JSON files parse without error", all_json_ok)

# T2: seasons.json has 4 seasons
seasons = load('seasons.json')
test("T02: seasons.json has 4 seasons", len(seasons['seasons']) == 4)

# T3: owners.json has 10 owners
owners = load('owners.json')
test("T03: owners.json has 10 owners", len(owners['owners']) == 10)

# T4: scoring_periods.json has 4 seasons
sp = load('scoring_periods.json')
test("T04: scoring_periods.json has 4 seasons", len(sp) == 4)

# T5: Each season has 10 standings entries
all_10 = all(len(s['standings']) == 10 for s in seasons['seasons'])
test("T05: Every season has 10 standings entries", all_10)

# ── 2. No HaleTrager in data files (14 tests) ─────────────────────────

print("\n── HaleTrager Removal ──")

check_files = [
    'head_to_head.json', 'matchups.json', 'owners.json',
    'pick_ledger.json', 'picks.json', 'player_movement.json',
    'rankings.json', 'rosters_2022_23.json', 'rosters_2023_24.json',
    'rosters_2024_25.json', 'rosters_2025_26.json',
    'scoring_periods.json', 'team_name_history.json', 'trade_grades.json',
]
for i, fn in enumerate(check_files):
    txt = read_text(os.path.join(DATA, fn))
    # Allow HaleTrager ONLY inside altNames arrays and fantraxUsername
    # Strip those before checking
    stripped = re.sub(r'"altNames"\s*:\s*\[[^\]]*\]', '', txt)
    stripped = re.sub(r'"fantraxUsername"\s*:\s*"[^"]*"', '', stripped)
    count = stripped.count('HaleTrager')
    test(f"T{6+i:02d}: No HaleTrager in {fn}", count == 0,
         f"found {count}")

# T20: core.js OWNERS_ALPHA contains Trager not HaleTrager
core_txt = read_text(os.path.join(JS, 'core.js'))
test("T20: core.js OWNERS_ALPHA has 'Trager'",
     "'Trager'" in core_txt and "'HaleTrager'" not in
     core_txt.split('OWNERS_ALPHA')[1].split('];')[0])

# ── 3. Trager correctness (5 tests) ───────────────────────────────────

print("\n── Trager Correctness ──")

test("T21: core.js TRAG maps to Trager",
     "TRAG:  'Trager'" in core_txt or "TRAG: 'Trager'" in core_txt)

test("T22: core.js HALE maps to Trager",
     "HALE:  'Trager'" in core_txt or "HALE: 'Trager'" in core_txt)

trager_owner = [o for o in owners['owners'] if o['id'] == 'trager']
test("T23: owners.json has id='trager' with realName='Ryan Trager'",
     len(trager_owner) == 1 and trager_owner[0]['realName'] == 'Ryan Trager')

test("T24: owners.json trager fantraxUsername preserved as 'HaleTrager'",
     len(trager_owner) == 1 and trager_owner[0]['fantraxUsername'] == 'HaleTrager')

test("T25: core.js OWNER_ALT_NAMES HaleTrager → Trager",
     "'HaleTrager':    'Trager'" in core_txt or
     "'HaleTrager': 'Trager'" in core_txt)

# ── 4. Vlandis/Kelley/Baden attribution (12 tests) ────────────────────

print("\n── Baden/Vlandis/Kelley Attribution ──")

test("T26: scoring_periods 2022-23 has Vlandis key",
     'Vlandis' in sp['2022-23']['teams'])

test("T27: scoring_periods 2023-24 has Kelley key",
     'Kelley' in sp['2023-24']['teams'])

test("T28: scoring_periods 2024-25 has Kelley key",
     'Kelley' in sp['2024-25']['teams'])

test("T29: scoring_periods 2025-26 has Baden key",
     'Baden' in sp['2025-26']['teams'])

r22 = load('rosters_2022_23.json')
test("T30: rosters_2022_23 has Vlandis key (not Baden)",
     'Vlandis' in r22['teams'] and 'Baden' not in r22['teams'])

r23 = load('rosters_2023_24.json')
test("T31: rosters_2023_24 has Kelley key (not Baden)",
     'Kelley' in r23['teams'] and 'Baden' not in r23['teams'])

r24 = load('rosters_2024_25.json')
test("T32: rosters_2024_25 has Kelley key (not Baden)",
     'Kelley' in r24['teams'] and 'Baden' not in r24['teams'])

# owners.json franchise dates
baden_owner = [o for o in owners['owners'] if o['id'] == 'baden'][0]
fh = baden_owner['franchiseHistory']
test("T33: Vlandis period starts at 2020",
     any('2020' in h['period'] for h in fh if h['owner'] == 'Spencer Vlandis'))

test("T34: Kelley period is 2023-2025",
     any(h['period'] == '2023-2025' for h in fh if h['owner'] == 'Brendan Kelley'))

test("T35: Baden period is 2025-present",
     any(h['period'] == '2025-present' for h in fh if h['owner'] == 'Sam Baden'))

# No Baden as owner in pre-2025 trade sides
tg = load('trade_grades.json')
pre2025_baden = 0
for trade in tg['trades']:
    season = trade.get('season', '')
    if season in ('2020-21', '2021-22', '2022-23'):
        for side_key in ('side_a', 'side_b'):
            if trade.get(side_key, {}).get('owner') == 'Baden':
                pre2025_baden += 1
test("T36: No Baden owner in 2020-23 trade_grades",
     pre2025_baden == 0, f"found {pre2025_baden}")

pre2025_baden_2324 = 0
for trade in tg['trades']:
    if trade.get('season') == '2023-24':
        for side_key in ('side_a', 'side_b'):
            if trade.get(side_key, {}).get('owner') == 'Baden':
                pre2025_baden_2324 += 1
test("T37: No Baden owner in 2023-24 trade_grades",
     pre2025_baden_2324 == 0, f"found {pre2025_baden_2324}")

# ── 5. Fantasy points fix (12 tests) ──────────────────────────────────

print("\n── Fantasy Points Fix ──")

def get_season(year):
    for s in seasons['seasons']:
        if s['year'] == year:
            return s
    return None

def get_team_fpts(year, team):
    s = get_season(year)
    if not s:
        return None, None
    for t in s['standings']:
        if t['team'] == team:
            return t['fpts'], t['fpts_against']
    return None, None

# T38-39: fpts != fpts_against for 2024-25 and 2025-26
s2425 = get_season('2024-25')
all_diff_2425 = all(t['fpts'] != t['fpts_against'] for t in s2425['standings'])
test("T38: 2024-25 fpts != fpts_against for all teams", all_diff_2425)

s2526 = get_season('2025-26')
all_diff_2526 = all(t['fpts'] != t['fpts_against'] for t in s2526['standings'])
test("T39: 2025-26 fpts != fpts_against for all teams", all_diff_2526)

# T40-42: specific 2024-25 fpts values match scoring_periods
fpts_bdl_2425, _ = get_team_fpts('2024-25', "Ball Don't Lie")
test("T40: 2024-25 Ball Don't Lie fpts=28688", fpts_bdl_2425 == 28688,
     f"got {fpts_bdl_2425}")

fpts_tt_2425, _ = get_team_fpts('2024-25', 'Twin Towers')
test("T41: 2024-25 Twin Towers fpts=27702", fpts_tt_2425 == 27702,
     f"got {fpts_tt_2425}")

fpts_bkw_2425, _ = get_team_fpts('2024-25', 'BKs Whoppers')
test("T42: 2024-25 BKs Whoppers fpts=14472", fpts_bkw_2425 == 14472,
     f"got {fpts_bkw_2425}")

# T43-45: specific 2025-26 fpts values
fpts_bdl_2526, _ = get_team_fpts('2025-26', "Ball Don't Lie")
test("T43: 2025-26 Ball Don't Lie fpts=29010", fpts_bdl_2526 == 29010,
     f"got {fpts_bdl_2526}")

fpts_tt_2526, _ = get_team_fpts('2025-26', 'Twin Towers')
test("T44: 2025-26 Twin Towers fpts=27033", fpts_tt_2526 == 27033,
     f"got {fpts_tt_2526}")

fpts_ff_2526, _ = get_team_fpts('2025-26', 'Flaming Flaggs')
test("T45: 2025-26 Flaming Flaggs fpts=18238", fpts_ff_2526 == 18238,
     f"got {fpts_ff_2526}")

# T46-47: 2022-23 and 2023-24 fpts unchanged (spot check)
fpts_add_2223, _ = get_team_fpts('2022-23', 'Always Droppin Dimes')
test("T46: 2022-23 Always Droppin Dimes fpts=34645 (unchanged)",
     fpts_add_2223 == 34645, f"got {fpts_add_2223}")

fpts_add_2324, _ = get_team_fpts('2023-24', 'Always Droppin Dimes')
test("T47: 2023-24 Always Droppin Dimes fpts=31260 (unchanged)",
     fpts_add_2324 == 31260, f"got {fpts_add_2324}")

# T48-49: fpts_against values preserved correctly
_, fa_bdl_2425 = get_team_fpts('2024-25', "Ball Don't Lie")
test("T48: 2024-25 Ball Don't Lie fpts_against=23539",
     fa_bdl_2425 == 23539.0, f"got {fa_bdl_2425}")

_, fa_bdl_2526 = get_team_fpts('2025-26', "Ball Don't Lie")
test("T49: 2025-26 Ball Don't Lie fpts_against=23358",
     fa_bdl_2526 == 23358.0, f"got {fa_bdl_2526}")

# ── 6. Trade grades report cards (5 tests) ────────────────────────────

print("\n── Trade Grades Report Cards ──")

cards = tg.get('meta', {}).get('owner_report_cards', {})

test("T50: trade_grades has Vlandis report card",
     'Vlandis' in cards)

test("T51: trade_grades has Kelley report card",
     'Kelley' in cards)

test("T52: trade_grades has Baden report card",
     'Baden' in cards)

test("T53: trade_grades has Trager report card (not HaleTrager)",
     'Trager' in cards and 'HaleTrager' not in cards)

expected_owners = {'Baden', 'Berke', 'Delaney', 'Gold', 'Green',
                   'Trager', 'Jowkar', 'Moss', 'Peterson', 'Zujewski',
                   'Vlandis', 'Kelley', 'Unknown'}
test("T54: trade_grades report cards has exactly 13 keys",
     set(cards.keys()) == expected_owners,
     f"got {sorted(cards.keys())}")

# ── 7. Player movement (3 tests) ──────────────────────────────────────

print("\n── Player Movement ──")

pm = load('player_movement.json')
pm_text = json.dumps(pm)

pm_players = pm.get('players', {})

def check_pm_no_baden_trade(seasons_to_check):
    bad = 0
    for pname, pdata in pm_players.items():
        for h in pdata.get('history', []):
            season = h.get('season', '')
            if season not in seasons_to_check:
                continue
            if h.get('from') == 'Baden' or h.get('to') == 'Baden':
                bad += 1
    return bad

bad_2021 = check_pm_no_baden_trade(['2020-21'])
test("T55: No Baden in 2020-21 player_movement trades", bad_2021 == 0,
     f"found {bad_2021}")

bad_2122 = check_pm_no_baden_trade(['2021-22'])
test("T56: No Baden in 2021-22 player_movement trades", bad_2122 == 0,
     f"found {bad_2122}")

bad_2223 = check_pm_no_baden_trade(['2022-23', '2023-24'])
test("T57: No Baden in 2022-24 player_movement trades", bad_2223 == 0,
     f"found {bad_2223}")

# ── 8. Pick ledger (3 tests) ──────────────────────────────────────────

print("\n── Pick Ledger ──")

pl = load('pick_ledger.json')

def check_pl_no_baden_pre2425():
    bad = 0
    for pick_id, pdata in pl.get('picks', {}).items():
        for trade in pdata.get('trades', []):
            season = trade.get('season', '')
            if season in ('2020-21', '2021-22', '2022-23', '2023-24'):
                if trade.get('from') == 'Baden':
                    bad += 1
                if trade.get('to') == 'Baden':
                    bad += 1
    return bad

bad_pl = check_pl_no_baden_pre2425()
test("T58: No Baden from/to in pre-2024-25 pick_ledger trades",
     bad_pl == 0, f"found {bad_pl}")

pl_summary = pl.get('owner_summary', {})
test("T59: pick_ledger owner_summary has Vlandis key",
     'Vlandis' in pl_summary)

test("T60: pick_ledger owner_summary has Trager (not HaleTrager)",
     'Trager' in pl_summary and 'HaleTrager' not in pl_summary)

# ── 9. Core.js consistency (2 tests) ──────────────────────────────────

print("\n── Core.js Consistency ──")

# Extract OWNERS_ALPHA from core.js
alpha_match = re.search(r'OWNERS_ALPHA\s*=\s*\[(.*?)\]', core_txt, re.DOTALL)
if alpha_match:
    alpha_str = alpha_match.group(1)
    alpha_list = re.findall(r"'(\w+)'", alpha_str)
else:
    alpha_list = []

test("T61: core.js OWNERS_ALPHA has exactly 10 entries",
     len(alpha_list) == 10, f"got {len(alpha_list)}: {alpha_list}")

test("T62: core.js OWNERS_ALPHA is sorted alphabetically",
     alpha_list == sorted(alpha_list), f"got {alpha_list}")

# ── Summary ───────────────────────────────────────────────────────────

print(f"\n{'='*50}")
print(f"Results: {passed} passed, {failed} failed, {passed+failed} total")
if errors:
    print(f"\nFailed tests:")
    for e in errors:
        print(f"  - {e}")
print(f"{'='*50}")

sys.exit(0 if failed == 0 else 1)

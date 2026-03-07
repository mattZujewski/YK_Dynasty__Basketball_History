#!/usr/bin/env python3
"""Regression test suite for YK Dynasty Basketball History site data.

Tests covering:
- Owner naming (no HaleTrager in canonical positions)
- Vlandis/Kelley/Baden attribution by season
- Fantasy-point correctness in seasons.json
- Structural integrity of all JSON data files
- Phase 11.8: flipped badges, inactive labels, sort options, year filter sync
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
test("T02: seasons.json has 6 seasons", len(seasons['seasons']) == 6)

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

# ── 10. Phase 11.8 — Flipped badges, inactive labels, UI checks ─────

print("\n── Phase 11.8 Checks ──")

# T63: TVOT data has winner_changed field on every trade
tvot = load('trade_value_over_time.json')
tvot_trades = tvot.get('trades', [])
all_have_wc = all('winner_changed' in t for t in tvot_trades)
test("T63: TVOT trades all have winner_changed field", all_have_wc)

# T64: Flipped trades have first_winner != last_winner
flipped_trades = [t for t in tvot_trades if t.get('winner_changed')]
all_flipped_correct = all(
    t.get('first_winner') != t.get('last_winner') and
    t.get('first_winner') is not None and
    t.get('last_winner') is not None
    for t in flipped_trades
)
test("T64: Flipped trades have first_winner != last_winner",
     all_flipped_correct and len(flipped_trades) > 0,
     f"{len(flipped_trades)} flipped trades found")

# T65: Non-flipped trades have consistent winners
non_flipped = [t for t in tvot_trades if not t.get('winner_changed')]
all_stable = all(
    t.get('first_winner') == t.get('last_winner')
    for t in non_flipped if t.get('first_winner') is not None
)
test("T65: Non-flipped trades have first_winner == last_winner", all_stable)

# T66: trade_cards.js has INACTIVE_PLAYERS Set with 6 players
tc_path = os.path.join(JS, 'dashboards', 'trade_cards.js')
tc_txt = read_text(tc_path)
inactive_names = ['Kyrie Irving', 'Fred VanVleet', 'Damian Lillard', 'Cam Thomas',
                  'Kemba Walker', 'John Wall']
has_inactive_set = 'INACTIVE_PLAYERS' in tc_txt
all_inactive_present = all(name in tc_txt for name in inactive_names)
test("T66: trade_cards.js has INACTIVE_PLAYERS with 6 players",
     has_inactive_set and all_inactive_present)

# T67: trade_cards.js has stacked flipped badge logic (Dynasty Winner + Flipped)
has_dynasty_winner = 'Dynasty Winner' in tc_txt
has_flipped_badge = 'winner-flipped-badge' in tc_txt
test("T67: trade_cards.js has stacked Dynasty Winner + Flipped badges",
     has_dynasty_winner and has_flipped_badge)

# T68: trade_cards.js has oldest sort option
has_oldest_sort = "sortBy === 'oldest'" in tc_txt or 'sortBy==="oldest"' in tc_txt
test("T68: trade_cards.js has oldest sort option", has_oldest_sort)

# T69: trade-cards.html has inline season filter row
tc_html = read_text(os.path.join(os.path.dirname(JS), 'trade-cards.html'))
has_inline_filter = 'inline-season-filter-row' in tc_html
test("T69: trade-cards.html has inline season filter row", has_inline_filter)

# T70: trade-cards.html has Oldest First button
has_oldest_btn = 'Oldest First' in tc_html or 'data-sortby="oldest"' in tc_html
test("T70: trade-cards.html has Oldest First button", has_oldest_btn)

# T71: standings.html column header says "Team Name" not "Teams"
standings_html = read_text(os.path.join(os.path.dirname(JS), 'standings.html'))
has_team_name_header = 'Team Name' in standings_html
no_old_teams_header = '>Teams<' not in standings_html
test("T71: standings.html uses 'Team Name' column header",
     has_team_name_header and no_old_teams_header)

# T72: references.html has Swap Rights section
refs_html = read_text(os.path.join(os.path.dirname(JS), 'references.html'))
has_swap_section = 'Swap Rights' in refs_html
has_swap_table = 'WITH' in refs_html and 'SUBJECT TO' in refs_html
test("T72: references.html has Swap Rights section with table",
     has_swap_section and has_swap_table)

# T73: On page load with no filters, trade card count > 0
# Simulates: trade_details.json has renderable trades (non-collusion, non-2020-21, id>23)
td = load('trade_details.json')
renderable = [t for t in td.get('trades', [])
              if not t.get('is_collusion') and t.get('season') != '2020-21'
              and t.get('trade_id', 0) > 23 and t.get('trade_id') != 20]
test("T73: trade_details has >0 renderable trades (no-filter page load)",
     len(renderable) > 0, f"got {len(renderable)}")

# T74: INACTIVE_PLAYERS defined before first buildCard call (hoisting fix)
tc_lines = tc_txt.split('\n')
inactive_line = next((i for i, l in enumerate(tc_lines) if 'INACTIVE_PLAYERS' in l and 'new Set' in l), None)
render_featured_call = next((i for i, l in enumerate(tc_lines) if 'renderFeatured(' in l and 'sortedByMargin' in l), None)
apply_initial_call = next((i for i, l in enumerate(tc_lines) if 'applyFiltersAndSort()' in l), None)
test("T74: INACTIVE_PLAYERS defined before renderFeatured/applyFiltersAndSort",
     inactive_line is not None and render_featured_call is not None
     and inactive_line < render_featured_call,
     f"INACTIVE_PLAYERS at line {inactive_line}, renderFeatured at {render_featured_call}")

# T75-T76: Kemba Walker and John Wall have 0 dynasty value in trade_details
def find_player_values(player_name):
    vals = []
    for t in td.get('trades', []):
        for side in t.get('sides', []):
            for a in side.get('assets', []):
                if a.get('name') == player_name:
                    vals.append((t['trade_id'], a.get('value', -1)))
    return vals

kemba_vals = find_player_values('Kemba Walker')
test("T75: Kemba Walker dynasty value = 0 in all trades",
     len(kemba_vals) > 0 and all(v == 0 for _, v in kemba_vals),
     f"values: {kemba_vals}")

wall_vals = find_player_values('John Wall')
test("T76: John Wall dynasty value = 0 in all trades",
     len(wall_vals) > 0 and all(v == 0 for _, v in wall_vals),
     f"values: {wall_vals}")

# T77: nav.js has References/About link, no Stats link
nav_txt = read_text(os.path.join(JS, 'nav.js'))
test("T77: nav.js has About link, no Stats main nav link",
     'references.html' in nav_txt and "stats.html'>Stats" not in nav_txt)

# ── Summary ───────────────────────────────────────────────────────────

print(f"\n{'='*50}")
print(f"Results: {passed} passed, {failed} failed, {passed+failed} total")
if errors:
    print(f"\nFailed tests:")
    for e in errors:
        print(f"  - {e}")
print(f"{'='*50}")

sys.exit(0 if failed == 0 else 1)

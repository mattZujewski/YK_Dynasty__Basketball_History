# Step 8 REVISED: Trade Grades — Final Report

Generated: 2026-02-21

---

## Overview

Step 8 rebuilt the trade grading pipeline from scratch following the hard rule:
- **ALL player data** comes from Fantrax (rosters, fantasy points, who was on what team when)
- **ALL pick data** comes from Excel sheets (Fantrax doesn't have pick details)

### Pipeline

| Step | Script | Output | Status |
|------|--------|--------|--------|
| 8.1 | `rebuild_trade_players.py` | Clean `trades.json` (29 name corrections) | Done |
| 8.2 | `fetch_fantrax_scoring.py` | `fantrax_scoring.json` (1071 players, 6 seasons) | Done |
| 8.3 | `compute_trade_windows.py` | `trade_grades.json` (player delta grades) | Done |
| 8.4 | `track_pick_outcomes.py` | `pick_ledger.json` (138 picks tracked) | Done |
| 8.5 | `combine_trade_grades.py` | `trade_grades.json` (combined 60/40 grades) | Done |
| 8.6 | grades.js, trade.js updates | Dashboard uses combined grades | Done |
| 8.7 | This report | Final audit | Done |

---

## 1. Trade Player Validation (8.1)

**Script:** `rebuild_trade_players.py`

Validated all 253 trade items from 120 trades against Fantrax roster data across 4 seasons.

- **Players:** 187 (validated against Fantrax rosters)
- **Picks:** 66 (detected by pattern matching)
- **Name corrections:** 29 (fuzzy match + overrides)
- **Fuzzy matches:** 4 (threshold 0.85)
- **Unmatched:** 0

Key corrections: Kristaps Porzingus -> Porzingis, Brandon Podziemski -> Brandin Podziemski, Cam Johnson -> Cameron Johnson, Zach Lavine -> Zach LaVine, etc.

Retired player overrides added for: Reggie Jackson, Kendrick Nunn, Kemba Walker, Montrezl Harrell, Thaddeus Young, Derrick Rose, Lou Williams, etc.

---

## 2. Fantrax Fantasy Scoring (8.2)

**Script:** `fetch_fantrax_scoring.py`

Scraped basketball-reference.com for per-game stats across 6 seasons (2019-20 through 2024-25) and computed accurate Fantrax FPts using the **real scoring formula** discovered from `getLeagueInfo.json`:

```
FPts = PTS*1 + REB*1 + AST*2 + STL*4 + BLK*4 + FGM*2 - FGA*1 + FTM*1 - FTA*1 + 3PM*1 - TO*2
```

**Previous (incorrect) formula was:** `PTS + REB*1.2 + AST*1.5 + STL*3 + BLK*3 - TO*1`

- **Players:** 1,071 unique
- **Player-seasons:** 3,359
- **Top FPts/g (2024-25):** Nikola Jokic (66.5), Anthony Davis (55.2), Karl-Anthony Towns (52.2)

Also updated `player_stats_historical.json` with FGM/FGA/FTM/FTA/3PM per-game fields.

---

## 3. Trade Windows (8.3)

**Script:** `compute_trade_windows.py`

Computed pre/post trade performance windows for each traded player using Fantrax FPts.

- **Pre window:** Trade season FPts/g
- **Post window:** Next season FPts/g

### Grade Scale (adjusted for Fantrax FPts magnitude)

| Grade | Delta Threshold |
|-------|-----------------|
| A+ | >= +8.0 FPts/g |
| A | >= +4.0 |
| B | >= +1.0 |
| C | >= -1.0 |
| D | >= -4.0 |
| F | < -4.0 |

### Results

- **Graded sides:** 176
- **Incomplete sides:** 64

| Grade | Count |
|-------|-------|
| A+ | 6 |
| A | 14 |
| B | 28 |
| C | 20 |
| D | 38 |
| F | 70 |

---

## 4. Pick Outcome Tracking (8.4)

**Script:** `track_pick_outcomes.py`

Traces every draft pick through trades using:
- `trades.json` for pick trade events
- `picks.json` for future pick ownership (2027-2031)
- `getDraftResults.json` + `getFantasyTeams.json` for draft slot mapping

### Pick Grade Scale

| Draft Slot | Grade |
|-----------|-------|
| 1-2 | A+ |
| 3-4 | A |
| 5-6 | B |
| 7-8 | C |
| 9 | D |
| 10 | F |
| Rd2 11-12 | C |
| Rd2 13-14 | D |
| Rd2 15-20 | F |

### Results

- **Total picks tracked:** 138
- **Completed (have draft slot):** 34
- **Projected (future, based on standings):** 101
- **Pending/no data:** 3 (2021 draft year, no getDraftResults data)
- **Picks with trade history:** 53

### Completed Pick Grade Distribution

| Grade | Count |
|-------|-------|
| A+ | 5 |
| A | 4 |
| B | 3 |
| C | 6 |
| D | 3 |
| F | 13 |

### Pick Portfolio by Owner

| Owner | Total Held | Own | Acquired | Traded Away |
|-------|-----------|-----|----------|-------------|
| Delaney | 31 | 9 | 22 | 7 |
| Jowkar | 27 | 7 | 20 | 8 |
| HaleTrager | 25 | 10 | 15 | 9 |
| Green | 22 | 8 | 14 | 3 |
| Berke | 15 | 3 | 12 | 8 |
| Peterson | 7 | 1 | 6 | 12 |
| Baden | 4 | 0 | 4 | 9 |
| Gold | 4 | 1 | 3 | 4 |
| Moss | 2 | 1 | 1 | 3 |
| Zujewski | 1 | 0 | 1 | 0 |

**Key insight:** Delaney has aggressively accumulated picks (31 total, 22 acquired). Peterson has traded the most picks away (12). Zujewski and Moss have minimal pick holdings.

---

## 5. Combined Trade Grades (8.5)

**Script:** `combine_trade_grades.py`

Merged player grades (60%) with pick grades (40%) for trades involving both.

### Weighting Rules

| Trade Type | Weighting |
|------------|-----------|
| Players only | 100% player grade |
| Picks only | 100% pick grade |
| Mixed (players + picks) | 60% players + 40% picks |

### Results

- **Player-only sides:** 172
- **Pick-only sides:** 30
- **Mixed (60/40) sides:** 4
- **Still incomplete:** 34
- **Newly graded (was INC):** 30

### Combined Grade Distribution

| Grade | Count |
|-------|-------|
| A+ | 8 |
| A | 19 |
| B | 33 |
| C | 25 |
| D | 46 |
| F | 75 |
| INC | 34 |

### Owner Report Cards (Combined Grades)

| Owner | Avg GPA | Grade | Graded Sides |
|-------|---------|-------|-------------|
| Gold | 3.27 | B | 6 |
| Green | 2.83 | B | 4 |
| Baden | 2.57 | B | 11 |
| Delaney | 2.36 | C | 23 |
| Peterson | 2.18 | C | 31 |
| Berke | 2.15 | C | 13 |
| Jowkar | 2.14 | C | 28 |
| Moss | 2.00 | C | 7 |
| HaleTrager | 1.52 | C | 10 |
| Zujewski | 1.40 | D | 6 |

---

## 6. Dashboard Updates (8.6)

Updated `grades.js` and `trade.js` to use combined grades:

- **grades.js:** Uses `combined_grade` and `combined_gpa` for all displays; shows pick grade details in trade detail view; adds "Basis" badge (Players/Picks/Mixed); uses `meta.owner_report_cards` for report cards
- **trade.js:** Grade badges now show combined grade instead of player-only grade
- **grades.html:** Updated subtitle to reflect combined methodology

---

## Data Files Modified/Created

| File | Description |
|------|-------------|
| `docs/data/trades.json` | 29 name corrections, 66 picks properly classified |
| `docs/data/fantrax_scoring.json` | 1,071 players, 3,359 player-seasons with accurate FPts |
| `docs/data/player_stats_historical.json` | Added FGM/FGA/FTM/FTA/3PM/FPts fields |
| `docs/data/trade_grades.json` | Combined grades with pick components |
| `docs/data/pick_ledger.json` | 138 picks tracked with ownership chains |

## Scripts Created

| Script | Purpose |
|--------|---------|
| `scripts/rebuild_trade_players.py` | Validate player names + split players/picks |
| `scripts/fetch_fantrax_scoring.py` | Compute FPts from basketball-reference stats |
| `scripts/compute_trade_windows.py` | Pre/post trade delta grading |
| `scripts/track_pick_outcomes.py` | Pick ledger with draft slot mapping |
| `scripts/combine_trade_grades.py` | Merge player (60%) + pick (40%) grades |

---

## Known Limitations

1. **2020-21 and 2021-22 draft data missing:** No getDraftResults for these seasons. 3 picks from 2021 draft year have `no_draft_data` status.
2. **getDraftResults has no player names:** We know which team held each draft slot but not which player was selected. Pick grades are based on slot value only.
3. **Fantrax internal API inaccessible:** The `/fxpa/req` endpoint returns INVALID_REQUEST. All stats computed from basketball-reference.com instead.
4. **34 trade sides still incomplete:** Mostly due to missing pre/post stats for retired players or rookies with no prior history.
5. **Future pick projections based on current standings:** 101 picks projected from 2025-26 standings. These will shift as seasons play out.

---

## Commits (develop branch)

| Hash | Message |
|------|---------|
| 3dcbb7f | 8.1: Trades rebuilt — player names validated, picks cleanly split |
| 6f5bfa6 | 8.2: Fantrax fantasy scoring computed — 1071 players, 3359 player-seasons |
| 4c0b77c | 8.3: Trade windows computed with accurate Fantrax FPts |
| 059200b | 8.4: Pick outcome tracking — 138 picks, 34 graded by draft slot |
| dc9132f | 8.5: Combined trade grades — 60% players + 40% picks, 206 graded sides |
| e8aab3b | 8.6: Dashboard updates — combined grades, pick grade details, basis badges |

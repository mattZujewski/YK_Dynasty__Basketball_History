# YK Dynasty — Audit Log

## Step 7 Findings

### Issue 1: Standings (ALREADY FIXED)
- seasons.json already has all 10 teams per season (fixed in Step 5)
- All TEAM_TO_OWNER mappings verified against Fantrax shortNames
- Owner mapping contradictions in user spec: Charlotte Wobnets=Gold and Kelvin got No Dimes=Peterson
  are incorrect — Fantrax shortNames confirm Wobnets=Vlandis(Baden) and KGND=Berke
- Peterson can't own both "Always Droppin Dimes" AND "Kelvin got No Dimes" — confirms Berke owns KGND

### Issue 2: Picks (DATA IS CORRECT — USER EXPECTATION MAY BE WRONG)
- picks.json structure: key=current owner, pick label=original owner
- Zujewski has 0 picks across 2027-2031 (all traded to Berke/Delaney)
  - 2027-2031: "1st Round Zujewski" appears under Berke (all 5 years)
  - 2027: "2nd Round Zujewski" under Delaney; 2028-2031: under Berke
- User expected 6 firsts + 5 seconds — this contradicts the Info/picks.json source data
- Possible explanations: (1) picks.json was parsed wrong from Excel, (2) user is thinking
  of a different time period, or (3) recent trades changed ownership
- FLAGGED FOR MANUAL REVIEW: picks data kept as-is from original source

### Issue 3: Rankings (COMPLETE)
- Parsed 527 players from ALL ACCESS rankings Excel (Categories sheet, 9-cat dynasty)
- Cross-referenced with rosters_2025_26.json: 243/527 owned, 284 unowned
- Name matching: stripped suffixes (Jr./III/II), apostrophes, diacritics
- Top unmatched: all draft prospects with no NBA team (Peterson, Boozer, Dybantsa, etc.)

### Issue 4: Matchup Scraping (PARTIAL)
- getMatchupScores API returns empty matchups dict for all periods
- getStandings only shows last 2 scoring periods per season (cannot get all periods)
- Captured: 2022-23 P16-17, 2023-24 P15-16, 2024-25 P15-16, 2025-26 P14-15
- Total: 40 individual matchup scores across 4 seasons (partial)
- Built scoring_periods.json with per-season aggregate stats (FPtsFor, FPtsAgainst, avg)

### Issue 4b: Transaction Scraping (FAILED)
- HTML pages are JS-rendered (minimal content via requests)
- All API methods return empty: getTransactionHistory, getTransactionLog, getTransactions,
  getRecentActivity, getLeagueTransactions, getTradeHistory, getCompletedTrades, getWaiverResults
- League history page (leagueHistory.go) also JS-rendered, no usable data
- Trade reconciliation not possible — keeping Excel-sourced 120 trades

---

## Step 5 Audit Log (Previous)

## Data Corrections Made

### Owner-Team Mapping Fixes (from Fantrax shortNames)
These mappings were **incorrect** in the original data and have been corrected:

| Team Name | Old Mapping | Correct Mapping | Source |
|-----------|-------------|-----------------|--------|
| Charlotte Wobnets | Jowkar | Baden (Vlandis franchise) | Fantrax shortName "Vlandis" (2022-23) |
| Giddey Up | Berke | Gold | Fantrax shortName "Gold" (2022-23) |
| Kelvin got No Dimes | Gold | Berke | Fantrax shortName "Berke" (2022-23, 2023-24) |

### New Team Names Discovered
| Team Name | Owner | Season | Notes |
|-----------|-------|--------|-------|
| Lob Land | HaleTrager | 2022-23 | Not in original data |
| No Shaime | Gold | 2023-24 | Not in original data |
| Charlotte Wobnets | Baden (Vlandis) | 2022-23 | Was mapped to wrong owner |

### Team Name Spelling
- **"Pure Sweat Fam"** is the correct Fantrax spelling (not "Pure Sweat Farm")
- Both spellings are accepted in TEAM_TO_OWNER for backward compatibility

### Standings Data Fixed
- 2022-23: Added 3 missing teams (Ice Trae #8, Ball Don't Lie #9, Lob Land #10)
- 2023-24: Added 3 missing teams (Pure Sweat Fam #8, Only Franz #9, No Shaime #10)
- 2024-25: Added 3 missing teams (Kentucky Fried Guards #8, Freshly Washed Kings #9, BKs Whoppers #10)
- Fantasy points values updated from correct league IDs

## Data Gaps

### Matchup Data
- `getMatchupScores` only returns current-week scores for the logged-in user
- No historical matchup data available from Fantrax API
- `getScoreboard` and `getSchedule` returned empty data
- **Impact**: Cannot compute H2H records, weekly scores, or streaks from Fantrax

### Transaction/Trade Data
- `getTransactionLog` and `getTransactions` returned empty data for all 4 seasons
- Trade reconciliation between Excel and Fantrax is not possible
- All 120 trades remain sourced from Excel only

### Other Available Endpoints
- `getTradeBlock` — returns current trade block data (not trade history)
- `getDraftResults` — returns draft pick data for all seasons
- `getPlayerStats` — returns fantasy stats for all players per season

## Files Updated
- `scripts/config.yaml` — Fresh auth cookies
- `scripts/fantrax_yk.py` — Corrected league IDs + team name mappings
- `docs/data/seasons.json` — All 4 seasons now have 10 teams
- `docs/data/owners.json` — Corrected team assignments per season
- `docs/data/rosters_*.json` — All 4 seasons with full rosters
- `docs/js/core.js` — Updated TEAM_TO_OWNER + added FLAGGS abbrev
- `docs/data/raw/` — Raw Fantrax API responses cached


## rebuild_trade_players.py
- Total items: 253 (190 players, 63 picks)
- Name corrections: 29
- Fuzzy matches: 8
- Unmatched: 14
  - Trade #0: Kendrick Nunn
  - Trade #3: Berke 2023 1st
  - Trade #4: Peterson 2022 2nd
  - Trade #4: Delaney 2021 2nd (#17)
  - Trade #5: Kemba Walker
  - Trade #6: Montrezl Harrell
  - Trade #15: Thaddeus Young
  - Trade #18: Derrick Rose
  - Trade #18: Lou Williams
  - Trade #19: Kendrick Nunn
  - Trade #38: Kemba Walker
  - Trade #44: Alec Burks
  - Trade #44: Patrick Beverly
  - Trade #51: Andre Drummond


## rebuild_trade_players.py
- Total items: 253 (187 players, 66 picks)
- Name corrections: 29
- Fuzzy matches: 4
- Unmatched: 0


## track_pick_outcomes.py (8.4)
- Total picks: 53 (34 completed, 16 projected, 3 pending)
- Picks with trades: 53
- Grade distribution: {'A+': 5, 'F': 13, 'A': 4, 'B': 3, 'C': 6, 'D': 3}
  - Baden: holds 6, traded 9
  - Berke: holds 2, traded 8
  - Delaney: holds 6, traded 7
  - Gold: holds 4, traded 4
  - Green: holds 3, traded 3
  - HaleTrager: holds 9, traded 9
  - Jowkar: holds 11, traded 8
  - Moss: holds 2, traded 3
  - Peterson: holds 9, traded 12
  - Zujewski: holds 1, traded 0


## track_pick_outcomes.py (8.4)
- Total picks: 138 (34 completed, 101 projected, 3 pending)
- Picks with trades: 53
- Grade distribution: {'A+': 5, 'F': 13, 'A': 4, 'B': 3, 'C': 6, 'D': 3}
  - Baden: holds 4, traded 9
  - Berke: holds 15, traded 8
  - Delaney: holds 31, traded 7
  - Gold: holds 4, traded 4
  - Green: holds 22, traded 3
  - HaleTrager: holds 25, traded 9
  - Jowkar: holds 27, traded 8
  - Moss: holds 2, traded 3
  - Peterson: holds 7, traded 12
  - Zujewski: holds 1, traded 0


## combine_trade_grades.py (8.5)
- Player-only: 172, Pick-only: 30, Mixed: 4
- Newly graded: 30, Still INC: 34
- Distribution: {'F': 75, 'INC': 34, 'B': 33, 'A': 19, 'D': 46, 'C': 25, 'A+': 8}
  - Baden: GPA 2.57 (B)
  - Berke: GPA 2.15 (C)
  - Delaney: GPA 2.36 (C)
  - Gold: GPA 3.27 (B)
  - Green: GPA 2.83 (B)
  - HaleTrager: GPA 1.52 (C)
  - Jowkar: GPA 2.14 (C)
  - Moss: GPA 2.0 (C)
  - Peterson: GPA 2.18 (C)
  - Zujewski: GPA 1.4 (D)


## load_trade_csvs.py (8A)
- Total trades: 170
- Matched CSV→Excel: 45
- CSV-only (new): 50
- Excel-only: 19
- Multi-player trades (2+): 38
- Fantrax-confirmed: 95


## load_trade_csvs.py (8A)
- Total trades: 170
- Excel trades matched: 47
- CSV-only new: 50
- Excel-only: 17
- Empty CSV groups skipped: 0
- Multi-player improved: 26


## rebuild_trade_players.py
- Total items: 377 (311 players, 66 picks)
- Name corrections: 0
- Fuzzy matches: 0
- Unmatched: 2
  - Trade #44: Patrick Beverley
  - Trade #72: Will Barton


## track_pick_outcomes.py (8.4)
- Total picks: 138 (34 completed, 101 projected, 3 pending)
- Picks with trades: 53
- Grade distribution: {'A+': 5, 'F': 13, 'A': 4, 'B': 3, 'C': 6, 'D': 3}
  - Baden: holds 6, traded 9
  - Berke: holds 15, traded 8
  - Delaney: holds 30, traded 7
  - Gold: holds 4, traded 4
  - Green: holds 22, traded 3
  - HaleTrager: holds 25, traded 9
  - Jowkar: holds 26, traded 8
  - Moss: holds 2, traded 3
  - Peterson: holds 6, traded 12
  - Zujewski: holds 1, traded 0


## combine_trade_grades.py (8.5)
- Player-only: 215, Pick-only: 30, Mixed: 4
- Newly graded: 30, Still INC: 49
- Distribution: {'F': 89, 'INC': 49, 'B': 39, 'A': 24, 'D': 53, 'C': 31, 'A+': 13}
  - Baden: GPA 2.24 (C)
  - Berke: GPA 2.14 (C)
  - Delaney: GPA 2.53 (B)
  - Gold: GPA 2.73 (B)
  - Green: GPA 2.83 (B)
  - HaleTrager: GPA 1.77 (C)
  - Jowkar: GPA 2.27 (C)
  - Moss: GPA 2.59 (B)
  - Peterson: GPA 2.38 (C)
  - Zujewski: GPA 1.75 (C)

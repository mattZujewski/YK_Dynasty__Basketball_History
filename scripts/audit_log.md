# YK Dynasty — Step 5 Audit Log

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

# YK Dynasty Basketball

A static dashboard site for the YK Dynasty Fantasy Basketball league. Tracks standings, trades, rosters, draft picks, player stats, and dynasty rankings across all seasons.

**Live site:** Served via GitHub Pages from the `docs/` directory.

---

## Quick Start

```bash
# Clone the repo
git clone https://github.com/mattZujewski/YK_Dynasty__Basketball_History.git
cd YK_Dynasty__Basketball_History

# Serve locally
cd docs
python3 -m http.server 8888
# Open http://localhost:8888
```

No build step, no npm install, no bundler. It's a static site — just serve the `docs/` folder.

---

## Project Structure

```
YK_Dynasty__Basketball_History/
├── docs/                        # Static site (served by GitHub Pages)
│   ├── index.html               # Home — season overview + charts
│   ├── standings.html           # Standings — season-by-season records
│   ├── trade.html               # Trades — full log, filters, partner matrix
│   ├── roster.html              # Rosters — all 10 teams with stats
│   ├── picks.html               # Draft Picks — pick grid by year/owner
│   ├── team.html                # Teams — individual owner profiles
│   ├── players.html             # Players — search + player profiles
│   ├── rankings.html            # Rankings — dynasty rankings table
│   ├── stats.html               # Stats — trade analysis + value meter
│   ├── css/style.css            # All styles + dark mode
│   ├── js/
│   │   ├── core.js              # Shared utilities + Chart.js defaults
│   │   ├── nav.js               # Navigation bar (injected on all pages)
│   │   ├── chart.umd.min.js     # Chart.js library
│   │   ├── chartjs-fix.js       # Chart.js NaN base value patch
│   │   └── dashboards/          # One JS module per page
│   │       ├── index.js
│   │       ├── standings.js
│   │       ├── trade.js
│   │       ├── roster.js
│   │       ├── picks.js
│   │       ├── team.js
│   │       ├── players.js
│   │       ├── rankings.js
│   │       └── stats.js
│   └── data/                    # JSON data files
│       ├── seasons.json         # Season standings + results
│       ├── trades.json          # All trades across seasons
│       ├── picks.json           # Draft pick ownership by year
│       ├── owners.json          # Owner metadata + franchise history
│       ├── rosters_2025_26.json # Current rosters (246 players)
│       ├── rankings.json        # Dynasty rankings (49 players)
│       ├── player_stats.json    # NBA stats (244 players matched)
│       └── player_movement.json # Ownership history (56 traded, 190 startup)
├── scripts/                     # Data pipeline scripts
│   ├── fantrax_yk.py            # Fetch rosters from Fantrax API
│   ├── fetch_player_stats.py    # Scrape NBA stats from basketball-reference
│   ├── build_player_movement.py # Build player ownership history from trades
│   ├── config.yaml              # Fantrax auth cookies (gitignored)
│   └── requirements.txt         # Python dependencies (stdlib only)
└── Info/                        # Source spreadsheets + reference data
```

---

## Pages

| Page | Description |
|------|-------------|
| **Home** | Season snapshot with stat cards, trades-per-season chart, and recent trade activity |
| **Standings** | Season-by-season standings with win %, fantasy points, and champion badges |
| **Trades** | Full trade log with season/owner filters, volume chart, and partner matrix heatmap |
| **Rosters** | All 10 teams displayed as cards with player stats (PPG/RPG/APG) and rank badges |
| **Picks** | Draft pick ownership grid color-coded by pick type (own/acquired/swap) |
| **Teams** | Deep-dive profiles per owner: record, trade log, picks, roster with team strength |
| **Players** | Search any player — profile with NBA stats, dynasty rank, ownership history |
| **Rankings** | Dynasty rankings table with position/owner filters, sortable columns |
| **Stats** | Trade analysis — select a trade to see player context, stats, and a value meter |

---

## Data Pipeline

The `scripts/` directory contains Python scripts for refreshing data. All scripts use **Python 3.10+ stdlib only** — no pip install required.

### Refresh Rosters (Fantrax)

```bash
# First time: set up Fantrax auth cookies
cp scripts/config.yaml.example scripts/config.yaml
# Edit config.yaml with your JSESSIONID and FX_RM cookies from Chrome DevTools

# Fetch current season rosters
python3 scripts/fantrax_yk.py
```

### Refresh Player Stats (Basketball Reference)

```bash
# Scrapes per-game stats for all rostered players
# Tries 2024-25 season first, then 2025-26 for rookies
python3 scripts/fetch_player_stats.py
```

**Output:** `docs/data/player_stats.json` — 244 of 246 players matched with stats.

### Rebuild Player Movement History

```bash
# Cross-references trades.json with rosters to build ownership timelines
python3 scripts/build_player_movement.py
```

**Output:** `docs/data/player_movement.json` — 56 traded players with full trade chains, 190 startup acquisitions.

---

## Architecture

- **No framework, no bundler** — vanilla HTML/CSS/JS served as static files
- **`window.YK` namespace** — shared utilities exported from `core.js`
- **Dashboard modules** — each page has a dedicated IIFE in `docs/js/dashboards/`
- **Dark mode** — toggle via `localStorage('yk_theme')` + CSS custom properties
- **10 owners** — mapped through `OWNER_ABBREVS` + `OWNER_ALT_NAMES` in `core.js`
- **Name normalization** — accent stripping via NFD + diacritic removal for player matching

---

## Updating Data

All data lives in `docs/data/*.json`. To update:

1. **New season/trades/picks** — edit `seasons.json`, `trades.json`, `picks.json` directly
2. **New rosters** — run `fantrax_yk.py` (requires fresh Fantrax cookies)
3. **New player stats** — run `fetch_player_stats.py` (scrapes basketball-reference.com)
4. **New player movement** — run `build_player_movement.py` (rebuilds from trades.json)
5. **New rankings** — edit `rankings.json` directly (rank + player name)
6. **Commit & push** — GitHub Pages deploys automatically from `docs/`

# Scripts

Data pipeline scripts for refreshing YK Dynasty Basketball data. All scripts use **Python 3.10+ stdlib only** — no virtual environment or pip install needed.

---

## Scripts

### `fantrax_yk.py` — Fetch Rosters from Fantrax

Pulls current roster data from the Fantrax API using session cookies.

```bash
# Basic usage (current season)
python3 scripts/fantrax_yk.py

# Specific season
python3 scripts/fantrax_yk.py --season 2025-26

# All seasons
python3 scripts/fantrax_yk.py --all-seasons
```

**Auth setup:** Requires Fantrax session cookies in `scripts/config.yaml`:

1. Log into [fantrax.com](https://fantrax.com) in Chrome
2. Open DevTools → Application → Cookies → fantrax.com
3. Copy `JSESSIONID` and `FX_RM` values
4. Create `scripts/config.yaml`:
   ```yaml
   jsessionid: "your-jsessionid-here"
   fx_rm: "your-fx-rm-here"
   current_league_id: "sz7vm5xwmancf4tr"
   request_delay: 0.5
   ```

> `config.yaml` is gitignored — never commit it.

**Output:** `docs/data/rosters_2025_26.json`

---

### `fetch_player_stats.py` — Scrape NBA Stats

Scrapes per-game stats from basketball-reference.com and matches against rostered players. Uses a single page load per season (no per-player API calls).

```bash
python3 scripts/fetch_player_stats.py
```

**How it works:**
1. Reads `docs/data/rosters_2025_26.json` for 246 player names
2. Fetches the NBA per-game stats table from basketball-reference.com (2024-25 season)
3. Matches players by normalized name (accent stripping, suffix removal)
4. Retries missed players against the 2025-26 season (catches rookies)
5. Manual name overrides handle mismatches (e.g., `DAngelo Russell` → `D'Angelo Russell`)

**Output:** `docs/data/player_stats.json`
- 244 of 246 players matched
- Stats: GP, MPG, PPG, RPG, APG, SPG, BPG, TO, FG%, 3P%, FT%
- 2 misses: international/G-League players without bbref entries

**Adding name overrides:** If a player isn't matching, add an entry to the `NAME_OVERRIDES` dict at the top of the script:
```python
NAME_OVERRIDES = {
    "RosterName": "Basketball-Reference Name",
    ...
}
```

---

### `build_player_movement.py` — Build Ownership History

Cross-references `trades.json` with `rosters_2025_26.json` to build ownership timelines for every player.

```bash
python3 scripts/build_player_movement.py
```

**How it works:**
1. Reads all trades and identifies which players were involved
2. For each rostered player, traces their ownership chain through trades
3. Players never appearing in trades are marked as "startup" acquisitions

**Output:** `docs/data/player_movement.json`
- 246 players total
- 56 traded (with full `from → to` chains and dates)
- 190 startup (originally rostered, never traded)

---

## Typical Refresh Workflow

```bash
# 1. Update rosters from Fantrax (need fresh cookies)
python3 scripts/fantrax_yk.py

# 2. Refresh NBA stats
python3 scripts/fetch_player_stats.py

# 3. Rebuild ownership history
python3 scripts/build_player_movement.py

# 4. Commit and push
git add docs/data/
git commit -m "Refresh data"
git push
```

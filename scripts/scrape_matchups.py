"""
scrape_matchups.py — Scrape Fantrax matchup/livescoring data
=============================================================

Attempts multiple approaches to get historical matchup data:
1. Internal API getMatchupScores for each period
2. HTML scraping of livescoring pages
3. Internal API getStandings with period-specific data

Usage:
    python scripts/scrape_matchups.py
"""

from __future__ import annotations

import json
import logging
import os
import re
import sys
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup

try:
    import yaml
    HAS_YAML = True
except ImportError:
    HAS_YAML = False

# =============================================================================
# CONSTANTS
# =============================================================================

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
DOCS_DATA = PROJECT_ROOT / "docs" / "data"
RAW_DIR = DOCS_DATA / "raw"

LEAGUE_IDS = {
    "2022-23": "n7exgxhpl1ydddam",
    "2023-24": "tz7m8b61lhphjz9w",
    "2024-25": "26ihddrglvclsxav",
    "2025-26": "sz7vm5xwmancf4tr",
}

INTERNAL_API_URL = "https://www.fantrax.com/fxpa/req"

# Team name → canonical owner mapping
TEAM_TO_OWNER = {
    "Always Droppin Dimes": "Peterson",
    "Ball Don't Lie": "Jowkar",
    "BKs Whoppers": "Baden",
    "Burner account": "Berke",
    "Charlotte Wobnets": "Baden",
    "Flaming Flaggs": "Baden",
    "Freshly Washed Kings": "Delaney",
    "Giddey Up": "Gold",
    "Ice Trae": "Green",
    "Kelvin got No Dimes": "Berke",
    "Kentucky Fried Guards": "Gold",
    "Lob Land": "HaleTrager",
    "No Shaime": "Gold",
    "Only Franz": "Zujewski",
    "Pure Sweat Farm": "Moss",
    "Pure Sweat Fam": "Moss",
    "Twin Towers": "HaleTrager",
}

log = logging.getLogger("scrape_matchups")


def setup_logging():
    log.setLevel(logging.DEBUG)
    log.handlers.clear()
    fmt = logging.Formatter("%(asctime)s | %(levelname)-7s | %(message)s")
    ch = logging.StreamHandler(sys.stdout)
    ch.setLevel(logging.DEBUG)
    ch.setFormatter(fmt)
    log.addHandler(ch)


def load_config():
    config_path = SCRIPT_DIR / "config.yaml"
    if config_path.exists() and HAS_YAML:
        with open(config_path) as f:
            cfg = yaml.safe_load(f) or {}
        return cfg
    return {}


def internal_request(session, league_id, method, data=None, cfg=None):
    """POST request to internal /fxpa API."""
    url = f"{INTERNAL_API_URL}?leagueId={league_id}"
    payload = {
        "uiv": 3,
        "refUrl": f"https://www.fantrax.com/fantasy/league/{league_id}/livescoring",
        "dt": 2,
        "at": 0,
        "av": "0.0",
        "tz": "America/New_York",
        "v": "182.0.1",
        "msgs": [{"method": method, "data": data or {}}],
    }
    headers = {
        "accept": "application/json, text/plain, */*",
        "content-type": "text/plain",
        "origin": "https://www.fantrax.com",
        "referer": f"https://www.fantrax.com/fantasy/league/{league_id}/livescoring",
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    }
    cookies = {}
    if cfg and cfg.get("jsessionid"):
        cookies["JSESSIONID"] = cfg["jsessionid"]
    if cfg and cfg.get("fx_rm"):
        cookies["FX_RM"] = cfg["fx_rm"]

    resp = session.post(url, headers=headers, cookies=cookies, json=payload, timeout=30)
    resp.raise_for_status()
    return resp.json()


def get_matchup_scores_for_period(session, league_id, period, cfg):
    """Try to get matchup scores for a specific scoring period."""
    try:
        data = {"scoringPeriodId": period}
        resp = internal_request(session, league_id, "getMatchupScores", data, cfg)

        for r in resp.get("responses", []):
            d = r.get("data", {})
            if d.get("pageError"):
                return None

            # Look for matchup data
            matchups = d.get("matchups", [])
            tables = d.get("tableList", d.get("tables", []))
            fantasy_team_info = d.get("fantasyTeamInfo", {})

            if matchups:
                return {"matchups": matchups, "fantasyTeamInfo": fantasy_team_info}

            # Try parsing from tableList/tables
            if tables:
                return {"tables": tables, "fantasyTeamInfo": fantasy_team_info}

            # Check if there's any scoring data
            scoring = d.get("scoringPeriodScores", d.get("scores", {}))
            if scoring:
                return {"scores": scoring, "fantasyTeamInfo": fantasy_team_info}

            # Return raw data if it has content
            keys_with_data = {k: type(v).__name__ for k, v in d.items()
                            if k not in ("goBackDays", "displayedSelections", "miscData")
                            and isinstance(v, (list, dict)) and len(v) > 0}
            if keys_with_data:
                return {"raw_keys": keys_with_data, "data": d, "fantasyTeamInfo": fantasy_team_info}

        return None

    except Exception as e:
        log.warning(f"  Period {period}: {e}")
        return None


def try_standings_with_period(session, league_id, period, cfg):
    """Try getStandings with a specific period — may contain period scores."""
    try:
        data = {"scoringPeriodId": period, "view": "SCORING_PERIOD"}
        resp = internal_request(session, league_id, "getStandings", data, cfg)

        for r in resp.get("responses", []):
            d = r.get("data", {})
            if d.get("pageError"):
                return None

            tables = d.get("tableList", [])
            fti = d.get("fantasyTeamInfo", {})

            if tables:
                # Parse the scoring period table
                period_data = []
                for table in tables:
                    caption = table.get("caption", "")
                    rows = table.get("rows", [])
                    for row in rows:
                        fixed = row.get("fixedCells", [])
                        cells = row.get("cells", [])
                        if len(fixed) >= 2:
                            team_name = fixed[1] if isinstance(fixed[1], str) else fixed[1].get("content", "?")
                            # Extract score from cells
                            fpts = None
                            if cells:
                                for cell in cells:
                                    if isinstance(cell, (int, float)):
                                        fpts = cell
                                        break
                                    elif isinstance(cell, str):
                                        try:
                                            fpts = float(cell.replace(",", ""))
                                            break
                                        except ValueError:
                                            continue
                                    elif isinstance(cell, dict):
                                        content = cell.get("content", "")
                                        try:
                                            fpts = float(str(content).replace(",", ""))
                                            break
                                        except ValueError:
                                            continue

                            period_data.append({
                                "team": team_name,
                                "owner": TEAM_TO_OWNER.get(team_name, "?"),
                                "fpts": fpts,
                                "caption": caption,
                            })

                if period_data:
                    return period_data

        return None

    except Exception as e:
        log.warning(f"  Standings period {period}: {e}")
        return None


def scrape_season(session, league_id, season, cfg):
    """Scrape all available matchup data for a season."""
    log.info(f"\n{'='*60}")
    log.info(f"Scraping matchups for {season} (league_id={league_id})")
    log.info(f"{'='*60}")

    season_data = {
        "season": season,
        "league_id": league_id,
        "periods": {},
        "standings_periods": {},
    }

    # Determine number of periods — NBA fantasy typically runs ~22 weeks
    max_periods = 22
    if season == "2025-26":
        max_periods = 16  # Current season, may not be complete

    # Strategy 1: Try getMatchupScores for each period
    log.info(f"[{season}] Trying getMatchupScores for periods 1-{max_periods}...")
    consecutive_empty = 0
    for period in range(1, max_periods + 1):
        result = get_matchup_scores_for_period(session, league_id, period, cfg)
        if result:
            season_data["periods"][str(period)] = result
            log.info(f"  Period {period}: GOT DATA")
            consecutive_empty = 0
        else:
            consecutive_empty += 1
            log.debug(f"  Period {period}: empty")

        if consecutive_empty >= 3 and period > 5:
            log.info(f"  Stopping after {consecutive_empty} consecutive empty periods")
            break

        time.sleep(0.3)

    # Strategy 2: Try getStandings with period-specific view
    log.info(f"[{season}] Trying getStandings per period...")
    consecutive_empty = 0
    for period in range(1, max_periods + 1):
        result = try_standings_with_period(session, league_id, period, cfg)
        if result:
            season_data["standings_periods"][str(period)] = result
            log.info(f"  Standings period {period}: GOT DATA ({len(result)} entries)")
            consecutive_empty = 0
        else:
            consecutive_empty += 1

        if consecutive_empty >= 3 and period > 5:
            log.info(f"  Stopping after {consecutive_empty} consecutive empty periods")
            break

        time.sleep(0.3)

    return season_data


def main():
    setup_logging()
    cfg = load_config()
    session = requests.Session()

    all_data = {}

    for season, league_id in LEAGUE_IDS.items():
        season_data = scrape_season(session, league_id, season, cfg)
        all_data[season] = season_data

        # Save raw data per season
        raw_dir = RAW_DIR / season.replace("-", "_")
        raw_dir.mkdir(parents=True, exist_ok=True)
        with open(raw_dir / "matchups_scraped.json", "w") as f:
            json.dump(season_data, f, indent=2)

        log.info(f"[{season}] Saved: {len(season_data['periods'])} matchup periods, {len(season_data['standings_periods'])} standings periods")

    # Build summary
    log.info(f"\n{'='*60}")
    log.info("SUMMARY")
    log.info(f"{'='*60}")

    for season, data in all_data.items():
        mp = len(data.get("periods", {}))
        sp = len(data.get("standings_periods", {}))
        log.info(f"  {season}: {mp} matchup periods, {sp} standings periods")

    # Save overall summary
    summary = {}
    for season, data in all_data.items():
        summary[season] = {
            "matchup_periods": len(data.get("periods", {})),
            "standings_periods": len(data.get("standings_periods", {})),
            "matchup_period_ids": sorted(data.get("periods", {}).keys()),
            "standings_period_ids": sorted(data.get("standings_periods", {}).keys()),
        }

    with open(RAW_DIR / "matchup_scrape_summary.json", "w") as f:
        json.dump(summary, f, indent=2)


if __name__ == "__main__":
    main()

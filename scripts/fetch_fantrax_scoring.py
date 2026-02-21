#!/usr/bin/env python3
"""
fetch_fantrax_scoring.py — Compute accurate Fantrax fantasy points from basketball-reference stats.

The YK Dynasty Fantrax scoring formula (from getLeagueInfo.json):
  PTS*1 + REB*1 + AST*2 + STL*4 + BLK*4 + FGM*2 - FGA*1 + FTM*1 - FTA*1 + 3PM*1 - TO*2

This script:
  1. Re-scrapes basketball-reference per-game stats (6 seasons) with full stat lines
  2. Computes accurate Fantrax FPts per game for every player
  3. Saves to docs/data/fantrax_scoring.json

Usage:
    python3 scripts/fetch_fantrax_scoring.py
"""

import json
import re
import sys
import time
import unicodedata
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "docs" / "data"
OUTPUT_PATH = DATA / "fantrax_scoring.json"
HISTORICAL_PATH = DATA / "player_stats_historical.json"

SEASONS_TO_FETCH = {
    2021: "2020-21",
    2022: "2021-22",
    2023: "2022-23",
    2024: "2023-24",
    2025: "2024-25",
    2026: "2025-26",
}

NAME_OVERRIDES = {
    "DAngelo Russell": "D'Angelo Russell",
    "Nic Claxton": "Nicolas Claxton",
    "Jabari Smith": "Jabari Smith Jr.",
    "GG Jackson": "GG Jackson II",
    "Trey Murphy": "Trey Murphy III",
    "Herb Jones": "Herbert Jones",
    "PJ Washington": "P.J. Washington",
    "KJ Martin": "Kenyon Martin Jr.",
    "Dereck Lively": "Dereck Lively II",
    "Cameron Thomas": "Cam Thomas",
    "Moe Wagner": "Moritz Wagner",
    "Scotty Pippen": "Scotty Pippen Jr.",
    "Tim Hardaway": "Tim Hardaway Jr.",
    "Wendell Carter": "Wendell Carter Jr.",
    "Michael Porter": "Michael Porter Jr.",
    "Jaren Jackson": "Jaren Jackson Jr.",
    "Kevin Porter": "Kevin Porter Jr.",
    "Robert Williams": "Robert Williams III",
    "DeAaron Fox": "De'Aaron Fox",
    "DayRon Sharpe": "Day'Ron Sharpe",
    "JaKobe Walter": "Ja'Kobe Walter",
    "Kelel Ware": "Kel'el Ware",
    "Carlton Carrington": "Bub Carrington",
    "Robert Dillingham": "Rob Dillingham",
    "Brandom Ingram": "Brandon Ingram",
}


def normalize(name):
    nfkd = unicodedata.normalize("NFD", name)
    clean = "".join(c for c in nfkd if unicodedata.category(c) != "Mn").lower().strip()
    clean = clean.replace("\u2019", "'").replace("\u2018", "'")
    clean = clean.replace(".", "").replace("'", "")
    for suffix in [" jr", " iii", " ii", " iv", " sr"]:
        if clean.endswith(suffix):
            clean = clean[: -len(suffix)]
    return clean.strip()


def fetch_bbref(year):
    url = f"https://www.basketball-reference.com/leagues/NBA_{year}_per_game.html"
    req = Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                      "AppleWebKit/537.36 (KHTML, like Gecko) "
                      "Chrome/120.0.0.0 Safari/537.36",
    })
    with urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8")


def compute_fpts(stats):
    """Compute Fantrax fantasy points per game from basketball-reference stats."""
    pts = stats.get("ppg", 0)
    reb = stats.get("rpg", 0)
    ast = stats.get("apg", 0)
    stl = stats.get("spg", 0)
    blk = stats.get("bpg", 0)
    to = stats.get("topg", 0)
    fgm = stats.get("fgm_pg", 0)
    fga = stats.get("fga_pg", 0)
    ftm = stats.get("ftm_pg", 0)
    fta = stats.get("fta_pg", 0)
    tpm = stats.get("fg3m_pg", 0)

    return round(
        pts * 1 + reb * 1 + ast * 2 + stl * 4 + blk * 4
        + fgm * 2 - fga * 1 + ftm * 1 - fta * 1 + tpm * 1 - to * 2,
        1
    )


def parse_full_stats(html):
    """Parse per-game stats table with full stat lines (including FGM/FGA/FTM/FTA/3PM)."""
    players = {}
    match = re.search(
        r'id="per_game_stats".*?<tbody>(.*?)</tbody>',
        html, re.DOTALL
    )
    if not match:
        print("  ERROR: Could not find per_game_stats tbody")
        return players

    tbody = match.group(1)
    rows = re.findall(r'<tr[^>]*>(.*?)</tr>', tbody, re.DOTALL)

    for row_html in rows:
        if 'class="thead"' in row_html or 'class="over_header"' in row_html:
            continue

        cells = re.findall(
            r'data-stat="([^"]*)"[^>]*>(.*?)</t[dh]>',
            row_html, re.DOTALL
        )
        if not cells:
            continue

        row_data = {}
        for stat, value in cells:
            clean_val = re.sub(r'<[^>]+>', '', value).strip()
            row_data[stat] = clean_val

        player_name = row_data.get("name_display", "")
        if not player_name:
            continue

        try:
            gp = int(row_data.get("games", "0"))
        except ValueError:
            continue
        if gp == 0:
            continue

        def sf(key, default=0.0):
            try:
                return round(float(row_data.get(key, str(default))), 1)
            except (ValueError, TypeError):
                return default

        norm = normalize(player_name)

        # Keep entry with most games (TOT row for traded players)
        if norm in players and gp <= players[norm]["gp"]:
            continue

        stats = {
            "player_name": player_name,
            "team": row_data.get("team_name_abbr", ""),
            "pos": row_data.get("pos", ""),
            "gp": gp,
            "mpg": sf("mp_per_g"),
            "ppg": sf("pts_per_g"),
            "rpg": sf("trb_per_g"),
            "apg": sf("ast_per_g"),
            "spg": sf("stl_per_g"),
            "bpg": sf("blk_per_g"),
            "topg": sf("tov_per_g"),
            "fgm_pg": sf("fg_per_g"),
            "fga_pg": sf("fga_per_g"),
            "ftm_pg": sf("ft_per_g"),
            "fta_pg": sf("fta_per_g"),
            "fg3m_pg": sf("fg3_per_g"),
        }

        stats["fpts_pg"] = compute_fpts(stats)
        stats["total_fpts"] = round(stats["fpts_pg"] * gp, 0)
        players[norm] = stats

    return players


def main():
    print("=== Fetch Fantrax Scoring ===\n")
    print("Fantrax formula: PTS + REB + AST*2 + STL*4 + BLK*4 + FGM*2 - FGA + FTM - FTA + 3PM - TO*2\n")

    all_seasons = {}

    # Check if we already have cached HTML or need to re-fetch
    for year, season_label in sorted(SEASONS_TO_FETCH.items()):
        print(f"Fetching {season_label} (bbref year {year})...")
        try:
            html = fetch_bbref(year)
            players = parse_full_stats(html)
            all_seasons[season_label] = players
            print(f"  Parsed {len(players)} players")

            # Show top 5 by FPts/g
            top = sorted(players.values(), key=lambda p: p["fpts_pg"], reverse=True)[:5]
            for p in top:
                print(f"    {p['player_name']}: {p['fpts_pg']} FPts/g ({p['total_fpts']:.0f} total, {p['gp']} GP)")

            time.sleep(3)  # Rate limiting
        except Exception as e:
            print(f"  ERROR: {e}")
            all_seasons[season_label] = {}

    # Save output
    output = {}
    for season, players in all_seasons.items():
        for norm, stats in players.items():
            name = stats["player_name"]
            if name not in output:
                output[name] = {}
            output[name][season] = {
                "total_fpts": stats["total_fpts"],
                "fpts_per_game": stats["fpts_pg"],
                "gp": stats["gp"],
                "ppg": stats["ppg"],
                "rpg": stats["rpg"],
                "apg": stats["apg"],
                "spg": stats["spg"],
                "bpg": stats["bpg"],
                "topg": stats["topg"],
                "fgm_pg": stats["fgm_pg"],
                "fga_pg": stats["fga_pg"],
                "ftm_pg": stats["ftm_pg"],
                "fta_pg": stats["fta_pg"],
                "fg3m_pg": stats["fg3m_pg"],
            }

    with open(OUTPUT_PATH, "w") as f:
        json.dump(output, f, indent=2)

    # Also update the historical stats file with FPts data
    if HISTORICAL_PATH.exists():
        with open(HISTORICAL_PATH) as f:
            hist = json.load(f)
        updated = 0
        for season in hist:
            if season not in all_seasons:
                continue
            for norm, stats in hist[season].items():
                if norm in all_seasons[season]:
                    new_data = all_seasons[season][norm]
                    stats["fgm_pg"] = new_data["fgm_pg"]
                    stats["fga_pg"] = new_data["fga_pg"]
                    stats["ftm_pg"] = new_data["ftm_pg"]
                    stats["fta_pg"] = new_data["fta_pg"]
                    stats["fg3m_pg"] = new_data["fg3m_pg"]
                    stats["fpts_pg"] = new_data["fpts_pg"]
                    stats["total_fpts"] = new_data["total_fpts"]
                    updated += 1
        with open(HISTORICAL_PATH, "w") as f:
            json.dump(hist, f, indent=2)
        print(f"\nUpdated {updated} player-season entries in historical stats")

    total_players = len(output)
    total_seasons = sum(len(v) for v in output.values())
    print(f"\nSaved {total_players} players ({total_seasons} player-seasons) to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()

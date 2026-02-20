#!/usr/bin/env python3
"""
fetch_player_stats.py — Pull NBA stats for all rostered dynasty players.

Scrapes basketball-reference.com per-game stats table and matches against
our roster data. Uses a single page load instead of per-player API calls.

Usage:
    python3 scripts/fetch_player_stats.py
"""

import json
import re
import sys
import unicodedata
from datetime import datetime
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
ROSTER_PATH = ROOT / "docs" / "data" / "rosters_2025_26.json"
OUTPUT_PATH = ROOT / "docs" / "data" / "player_stats.json"

SEASON_YEAR = 2025  # basketball-reference uses end year (2024-25 → 2025)
SEASON_LABEL = "2024-25"

# Manual name mappings for roster names → basketball-reference names
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
    "Nicolas Claxton": "Nic Claxton",
    "Scotty Pippen": "Scotty Pippen Jr.",
    "Tim Hardaway": "Tim Hardaway Jr.",
    "Wendell Carter": "Wendell Carter Jr.",
    "Michael Porter": "Michael Porter Jr.",
    "Kelly Oubre Jr.": "Kelly Oubre Jr.",
    "Jaren Jackson": "Jaren Jackson Jr.",
    "Kevin Porter": "Kevin Porter Jr.",
    "Robert Williams": "Robert Williams III",
    "DeAaron Fox": "De'Aaron Fox",
    "DayRon Sharpe": "Day'Ron Sharpe",
    "JaKobe Walter": "Ja'Kobe Walter",
    "Kelel Ware": "Kel'el Ware",
    "Carlton Carrington": "Bub Carrington",
    "Robert Dillingham": "Rob Dillingham",
}


def normalize(name):
    """Strip accents, lowercase, remove suffixes for matching."""
    nfkd = unicodedata.normalize("NFD", name)
    clean = "".join(c for c in nfkd if unicodedata.category(c) != "Mn").lower().strip()
    # Normalize apostrophes
    clean = clean.replace("\u2019", "'").replace("\u2018", "'")
    # Remove periods from initials
    clean = clean.replace(".", "")
    # Remove common suffixes for matching
    for suffix in [" jr", " iii", " ii", " iv", " sr"]:
        if clean.endswith(suffix):
            clean = clean[: -len(suffix)]
    return clean.strip()


def fetch_bbref_stats(year):
    """Fetch per-game stats from basketball-reference.com."""
    url = f"https://www.basketball-reference.com/leagues/NBA_{year}_per_game.html"
    req = Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                      "AppleWebKit/537.36 (KHTML, like Gecko) "
                      "Chrome/120.0.0.0 Safari/537.36",
    })
    with urlopen(req, timeout=30) as resp:
        html = resp.read().decode("utf-8")
    return html


def parse_stats_table(html):
    """Parse the per-game stats table from basketball-reference HTML."""
    players = {}

    # Find the per_game_stats table body
    match = re.search(
        r'id="per_game_stats".*?<tbody>(.*?)</tbody>',
        html, re.DOTALL
    )
    if not match:
        print("ERROR: Could not find per_game_stats tbody")
        return players

    tbody = match.group(1)
    rows = re.findall(r'<tr[^>]*>(.*?)</tr>', tbody, re.DOTALL)

    for row_html in rows:
        # Skip separator/header rows
        if 'class="thead"' in row_html or 'class="over_header"' in row_html:
            continue

        # Extract data-stat → value pairs
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

        team = row_data.get("team_name_abbr", "")
        pos = row_data.get("pos", "")

        try:
            gp_int = int(row_data.get("games", "0"))
        except ValueError:
            continue

        if gp_int == 0:
            continue

        def safe_float(key, default=0.0):
            try:
                return float(row_data.get(key, str(default)))
            except (ValueError, TypeError):
                return default

        norm = normalize(player_name)

        # Keep entry with most games (handles TOT rows for traded players)
        if norm in players:
            if gp_int <= players[norm]["gp"]:
                continue

        # bbref percentages are decimal (e.g. .519)
        fg_pct = safe_float("fg_pct")
        fg3_pct = safe_float("fg3_pct")
        ft_pct = safe_float("ft_pct")

        players[norm] = {
            "player_name": player_name,
            "team": team,
            "pos": pos,
            "gp": gp_int,
            "mpg": safe_float("mp_per_g"),
            "ppg": safe_float("pts_per_g"),
            "rpg": safe_float("trb_per_g"),
            "apg": safe_float("ast_per_g"),
            "spg": safe_float("stl_per_g"),
            "bpg": safe_float("blk_per_g"),
            "topg": safe_float("tov_per_g"),
            "fg_pct": fg_pct * 100 if fg_pct < 1 else fg_pct,
            "fg3_pct": fg3_pct * 100 if fg3_pct < 1 else fg3_pct,
            "ft_pct": ft_pct * 100 if ft_pct < 1 else ft_pct,
        }

    return players


def main():
    if not ROSTER_PATH.exists():
        print(f"Error: {ROSTER_PATH} not found")
        sys.exit(1)

    with open(ROSTER_PATH) as f:
        roster_data = json.load(f)

    teams = roster_data.get("teams", {})

    # Collect all unique player names and metadata
    player_meta = {}
    for owner, team_data in teams.items():
        for player in team_data.get("players", []):
            name = player["name"]
            player_meta[name] = {
                "owner": owner,
                "nba_team": player.get("nbaTeam", ""),
                "pos": player.get("pos", ""),
            }

    print(f"Found {len(player_meta)} unique players across {len(teams)} teams")

    # Fetch stats from basketball-reference
    print(f"Fetching {SEASON_LABEL} stats from basketball-reference.com...")
    try:
        html = fetch_bbref_stats(SEASON_YEAR)
        bbref_stats = parse_stats_table(html)
        print(f"  Parsed {len(bbref_stats)} player stat lines")
    except Exception as e:
        print(f"Error fetching stats: {e}")
        sys.exit(1)

    # Match roster players to bbref stats
    result = {}
    missed = []

    for count, name in enumerate(sorted(player_meta.keys()), 1):
        meta = player_meta[name]

        # Try override name first
        override = NAME_OVERRIDES.get(name, name)
        norm = normalize(override)

        row = bbref_stats.get(norm)

        # If not found and override differs, try original
        if row is None and override != name:
            row = bbref_stats.get(normalize(name))

        if row is None:
            missed.append(name)
            print(f"  [{count}/{len(player_meta)}] MISS: {name}")
            continue

        result[name] = {
            "nba_team": row["team"] or meta["nba_team"],
            "pos": meta["pos"] or row["pos"],
            "stats": {
                "gp": row["gp"],
                "mpg": round(row["mpg"], 1),
                "ppg": round(row["ppg"], 1),
                "rpg": round(row["rpg"], 1),
                "apg": round(row["apg"], 1),
                "spg": round(row["spg"], 1),
                "bpg": round(row["bpg"], 1),
                "topg": round(row["topg"], 1),
                "fg_pct": round(row["fg_pct"], 1),
                "fg3_pct": round(row["fg3_pct"], 1),
                "ft_pct": round(row["ft_pct"], 1),
                "season": SEASON_LABEL,
            },
        }
        ppg = result[name]["stats"]["ppg"]
        print(f"  [{count}/{len(player_meta)}] OK: {name} ({ppg} ppg)")

    # Retry missed players with current season (2025-26)
    if missed:
        print(f"\nRetrying {len(missed)} missed players with 2025-26 season...")
        try:
            html2 = fetch_bbref_stats(2026)
            bbref_stats2 = parse_stats_table(html2)
            print(f"  Parsed {len(bbref_stats2)} player stat lines (2025-26)")

            still_missed = []
            for name in missed:
                override = NAME_OVERRIDES.get(name, name)
                norm = normalize(override)
                row = bbref_stats2.get(norm)
                if row is None and override != name:
                    row = bbref_stats2.get(normalize(name))

                if row is None:
                    still_missed.append(name)
                    continue

                meta = player_meta[name]
                result[name] = {
                    "nba_team": row["team"] or meta["nba_team"],
                    "pos": meta["pos"] or row["pos"],
                    "stats": {
                        "gp": row["gp"],
                        "mpg": round(row["mpg"], 1),
                        "ppg": round(row["ppg"], 1),
                        "rpg": round(row["rpg"], 1),
                        "apg": round(row["apg"], 1),
                        "spg": round(row["spg"], 1),
                        "bpg": round(row["bpg"], 1),
                        "topg": round(row["topg"], 1),
                        "fg_pct": round(row["fg_pct"], 1),
                        "fg3_pct": round(row["fg3_pct"], 1),
                        "ft_pct": round(row["ft_pct"], 1),
                        "season": "2025-26",
                    },
                }
                ppg = result[name]["stats"]["ppg"]
                print(f"  RETRY OK: {name} ({ppg} ppg, 2025-26)")

            missed = still_missed
        except Exception as e:
            print(f"  Error fetching 2025-26 stats: {e}")

    # Write output
    output = {
        "meta": {
            "fetched": datetime.now().strftime("%Y-%m-%d"),
            "season": SEASON_LABEL,
            "source": "basketball-reference.com",
            "total_players": len(player_meta),
            "matched": len(result),
            "missed": len(missed),
        },
        "players": result,
        "missed": missed,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\nDone! {len(result)}/{len(player_meta)} players matched")
    print(f"Missed: {len(missed)} players")
    if missed:
        print("  " + ", ".join(missed[:20]))
        if len(missed) > 20:
            print(f"  ... and {len(missed) - 20} more")
    print(f"Output: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()

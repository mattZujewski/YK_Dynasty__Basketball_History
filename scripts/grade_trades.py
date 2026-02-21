#!/usr/bin/env python3
"""
grade_trades.py — Grade every trade based on player production before/after.

Since exact trade dates are unavailable for 118/120 trades, we use season-level
stats as our grading window:
  - PRE-TRADE:  stats from the season the trade occurred
  - POST-TRADE: stats from the NEXT full season

For each player traded, we compare their post-trade production to pre-trade
and assign a delta. Each side of the trade gets a grade based on total delta
of players received.

Data sources:
  - docs/data/trades.json         — all 120 trades
  - docs/data/player_stats_historical.json — multi-season stats (built first)
  - docs/data/player_movement.json — ownership chain
  - docs/data/rankings.json        — current dynasty rankings
  - docs/data/rosters_*.json       — who owned what

Usage:
    python3 scripts/grade_trades.py
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

# Basketball-reference scraping constants
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
    "LaMarcus Aldridge": "LaMarcus Aldridge",
}

GRADE_SCALE = [
    (5.0, "A+"),
    (3.0, "A"),
    (1.0, "B"),
    (-1.0, "C"),
    (-3.0, "D"),
    (float("-inf"), "F"),
]

SEASON_ORDER = [
    "2020-21", "2021-22", "2022-23", "2023-24", "2024-25", "2025-26"
]


def normalize(name):
    """Strip accents, lowercase, remove suffixes for matching."""
    nfkd = unicodedata.normalize("NFD", name)
    clean = "".join(c for c in nfkd if unicodedata.category(c) != "Mn").lower().strip()
    clean = clean.replace("\u2019", "'").replace("\u2018", "'")
    clean = clean.replace(".", "").replace("'", "")
    for suffix in [" jr", " iii", " ii", " iv", " sr"]:
        if clean.endswith(suffix):
            clean = clean[: -len(suffix)]
    return clean.strip()


def delta_to_grade(delta):
    """Convert a production delta to a letter grade."""
    for threshold, grade in GRADE_SCALE:
        if delta >= threshold:
            return grade
    return "F"


def next_season(season):
    """Return the season AFTER the given one, or None."""
    idx = SEASON_ORDER.index(season) if season in SEASON_ORDER else -1
    if idx >= 0 and idx < len(SEASON_ORDER) - 1:
        return SEASON_ORDER[idx + 1]
    return None


def fetch_bbref_stats(year):
    """Fetch per-game stats from basketball-reference.com for a given year."""
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

        fg_pct = sf("fg_pct")
        fg3_pct = sf("fg3_pct")
        ft_pct = sf("ft_pct")

        players[norm] = {
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
            "fg_pct": round(fg_pct * 100, 1) if fg_pct < 1 else fg_pct,
            "fg3_pct": round(fg3_pct * 100, 1) if fg3_pct < 1 else fg3_pct,
            "ft_pct": round(ft_pct * 100, 1) if ft_pct < 1 else ft_pct,
        }

    return players


def build_historical_stats():
    """Fetch and cache multi-season stats from basketball-reference."""
    cache_path = DATA / "player_stats_historical.json"
    if cache_path.exists():
        print("Loading cached historical stats...")
        with open(cache_path) as f:
            return json.load(f)

    print("Building historical stats from basketball-reference.com...")
    all_stats = {}

    for year, label in sorted(SEASONS_TO_FETCH.items()):
        print(f"  Fetching {label} (year={year})...")
        try:
            html = fetch_bbref_stats(year)
            season_stats = parse_stats_table(html)
            print(f"    → {len(season_stats)} players parsed")
            all_stats[label] = season_stats
            time.sleep(3)  # Respect rate limits
        except Exception as e:
            print(f"    ERROR: {e}")
            all_stats[label] = {}

    # Save cache
    with open(cache_path, "w") as f:
        json.dump(all_stats, f, indent=2)
    print(f"  Saved to {cache_path}")
    return all_stats


def parse_trade_item(item):
    """Parse a trade item like 'JOWK SF/PF Deandre Hunter' into (owner_abbr, asset_name)."""
    parts = item.strip().split()
    if not parts:
        return ("", "")
    abbr = parts[0]
    rest = parts[1:]
    # Strip position prefix
    if len(rest) > 1 and re.match(
        r"^(?:PG|SG|SF|PF|C)(?:/(?:PG|SG|SF|PF|C))?$", rest[0], re.I
    ):
        rest = rest[1:]
    return (abbr, " ".join(rest))


def is_pick(asset):
    """Check if a trade asset is a draft pick."""
    lower = asset.lower()
    return bool(re.search(r"(?:1st|2nd)\s*(?:round|rd)", lower)) or "pick" in lower or "swap" in lower


# Owner abbreviation → canonical name
OWNER_MAP = {
    "TRAG": "HaleTrager", "HALE": "HaleTrager",
    "JOWK": "Jowkar",
    "DELA": "Delaney",
    "GREEN": "Green",
    "BERK": "Berke",
    "PETE": "Peterson", "DIME": "Peterson",
    "MOSS": "Moss",
    "ZJEW": "Zujewski",
    "GOLD": "Gold",
    "KELL": "Baden", "VLAND": "Baden", "BADEN": "Baden", "FLAGGS": "Baden",
}


def resolve_owner(abbr):
    """Resolve an owner abbreviation to canonical name."""
    return OWNER_MAP.get(abbr.upper(), abbr)


def get_player_stats_for_season(historical, player_name, season):
    """Look up a player's stats for a given season."""
    if season not in historical:
        return None

    # Try the trade name directly
    norm = normalize(player_name)
    season_data = historical[season]
    if norm in season_data:
        return season_data[norm]

    # Try name overrides
    override = NAME_OVERRIDES.get(player_name)
    if override:
        norm2 = normalize(override)
        if norm2 in season_data:
            return season_data[norm2]

    return None


def compute_fantasy_points(stats):
    """Compute a simple fantasy points per game from stats."""
    if not stats:
        return 0.0
    ppg = stats.get("ppg", 0)
    rpg = stats.get("rpg", 0)
    apg = stats.get("apg", 0)
    spg = stats.get("spg", 0)
    bpg = stats.get("bpg", 0)
    topg = stats.get("topg", 0)
    # Standard fantasy scoring: PTS*1 + REB*1.2 + AST*1.5 + STL*3 + BLK*3 - TO*1
    fpg = ppg + rpg * 1.2 + apg * 1.5 + spg * 3 + bpg * 3 - topg * 1.0
    return round(fpg, 1)


def main():
    # Load all data
    print("=" * 60)
    print("TRADE GRADING PIPELINE")
    print("=" * 60)

    trades = json.load(open(DATA / "trades.json"))
    rankings_raw = json.load(open(DATA / "rankings.json"))
    rankings = rankings_raw if isinstance(rankings_raw, list) else rankings_raw.get("rankings", [])

    # Build rank lookup
    rank_map = {}
    for r in rankings:
        name = r.get("player_name") or r.get("player", "")
        rank_map[normalize(name)] = r.get("rank", 999)

    # Build historical stats
    historical = build_historical_stats()
    print(f"\nHistorical stats loaded for {len(historical)} seasons")

    # Grade each trade
    trade_grades = []
    ungraded = []
    grade_counts = {"A+": 0, "A": 0, "B": 0, "C": 0, "D": 0, "F": 0}

    for idx, trade in enumerate(trades):
        season = trade["season"]
        date = trade.get("date")
        post_season = next_season(season)

        # Parse give/get items
        give_items = []
        get_items = []
        give_owners = set()
        get_owners = set()

        for item in trade.get("give", []):
            abbr, asset = parse_trade_item(item)
            owner = resolve_owner(abbr)
            give_owners.add(owner)
            give_items.append({"owner": owner, "asset": asset, "is_pick": is_pick(asset)})

        for item in trade.get("get", []):
            abbr, asset = parse_trade_item(item)
            owner = resolve_owner(abbr)
            get_owners.add(owner)
            get_items.append({"owner": owner, "asset": asset, "is_pick": is_pick(asset)})

        # Identify the two sides
        all_owners = list(give_owners | get_owners)
        if len(all_owners) < 2:
            ungraded.append({
                "trade_index": idx,
                "season": season,
                "reason": "Could not identify two sides"
            })
            continue

        # Side A = owners from give side, Side B = owners from get side
        # In a trade, Side A GIVES give_items and RECEIVES get_items
        side_a_owners = list(give_owners)
        side_b_owners = list(get_owners)
        side_a_owner = side_a_owners[0] if side_a_owners else all_owners[0]
        side_b_owner = side_b_owners[0] if side_b_owners else all_owners[1]

        # Side A receives get_items, Side B receives give_items
        side_a_received = [i for i in get_items if not i["is_pick"]]
        side_b_received = [i for i in give_items if not i["is_pick"]]
        side_a_picks = [i for i in get_items if i["is_pick"]]
        side_b_picks = [i for i in give_items if i["is_pick"]]

        # If both sides only have picks, skip player grading
        if not side_a_received and not side_b_received:
            pick_components = []
            for p in side_a_picks:
                pick_components.append({"received_by": side_a_owner, "pick": p["asset"]})
            for p in side_b_picks:
                pick_components.append({"received_by": side_b_owner, "pick": p["asset"]})

            trade_grades.append({
                "trade_index": idx,
                "season": season,
                "date": date,
                "side_a": {
                    "owner": side_a_owner,
                    "gave": [i["asset"] for i in give_items],
                    "received": [i["asset"] for i in get_items],
                    "received_players": [],
                    "received_delta": 0,
                    "grade": "INC",
                    "grade_reason": "pick-only trade",
                    "injury_affected": False,
                },
                "side_b": {
                    "owner": side_b_owner,
                    "gave": [i["asset"] for i in get_items],
                    "received": [i["asset"] for i in give_items],
                    "received_players": [],
                    "received_delta": 0,
                    "grade": "INC",
                    "grade_reason": "pick-only trade",
                    "injury_affected": False,
                },
                "pick_components": pick_components,
                "summary": "Pick-only trade — graded on pick outcomes only.",
                "grade_confidence": "incomplete",
            })
            continue

        # Grade player production for each side
        def grade_side(received_players, label):
            total_delta = 0.0
            player_details = []
            any_injury = False
            any_incomplete = False

            for item in received_players:
                player_name = item["asset"]
                norm_name = normalize(player_name)

                # Get pre-trade stats (the season of the trade)
                pre_stats = get_player_stats_for_season(historical, player_name, season)
                pre_fpg = compute_fantasy_points(pre_stats) if pre_stats else None

                # Get post-trade stats (the NEXT season)
                post_stats = None
                post_fpg = None
                if post_season:
                    post_stats = get_player_stats_for_season(historical, player_name, post_season)
                    post_fpg = compute_fantasy_points(post_stats) if post_stats else None

                # Compute delta
                delta = None
                status = "graded"

                if pre_fpg is not None and post_fpg is not None:
                    delta = round(post_fpg - pre_fpg, 1)
                elif pre_fpg is None and post_fpg is not None:
                    # No baseline (rookie or new to league)
                    delta = 0.0
                    status = "no_baseline"
                    any_incomplete = True
                elif pre_fpg is not None and post_fpg is None:
                    # Player disappeared after trade (injury, retirement, etc.)
                    delta = round(-pre_fpg * 0.5, 1)  # Assume 50% loss
                    status = "no_post_data"
                    any_injury = True
                else:
                    # No data at all
                    delta = 0.0
                    status = "no_data"
                    any_incomplete = True

                if delta is not None:
                    total_delta += delta

                rank = rank_map.get(norm_name, None)
                player_details.append({
                    "player": player_name,
                    "pre_fpg": pre_fpg,
                    "post_fpg": post_fpg,
                    "delta": delta,
                    "pre_ppg": pre_stats.get("ppg") if pre_stats else None,
                    "post_ppg": post_stats.get("ppg") if post_stats else None,
                    "dynasty_rank": rank,
                    "status": status,
                })

            grade = delta_to_grade(total_delta)
            confidence = "high"
            if any_injury:
                confidence = "medium"
            if any_incomplete:
                confidence = "low"
            if not player_details:
                confidence = "incomplete"
                grade = "INC"

            return {
                "total_delta": round(total_delta, 1),
                "grade": grade,
                "player_details": player_details,
                "injury_affected": any_injury,
                "confidence": confidence,
            }

        result_a = grade_side(side_a_received, "Side A")
        result_b = grade_side(side_b_received, "Side B")

        # Determine overall confidence
        conf_levels = {"high": 3, "medium": 2, "low": 1, "incomplete": 0}
        min_conf = min(conf_levels.get(result_a["confidence"], 0),
                       conf_levels.get(result_b["confidence"], 0))
        overall_conf = {3: "high", 2: "medium", 1: "low", 0: "incomplete"}[min_conf]

        # Build summary
        if result_a["grade"] == "INC" or result_b["grade"] == "INC":
            summary = "Insufficient data to grade this trade."
        elif result_a["total_delta"] > result_b["total_delta"] + 1.0:
            summary = f"{side_a_owner} won this trade (received {result_a['total_delta']:+.1f} FPts/g net). {side_b_owner} got the short end."
        elif result_b["total_delta"] > result_a["total_delta"] + 1.0:
            summary = f"{side_b_owner} won this trade (received {result_b['total_delta']:+.1f} FPts/g net). {side_a_owner} got the short end."
        else:
            summary = "Roughly even trade — both sides got comparable production."

        # Pick components
        pick_components = []
        for p in side_a_picks:
            pick_components.append({"received_by": side_a_owner, "pick": p["asset"]})
        for p in side_b_picks:
            pick_components.append({"received_by": side_b_owner, "pick": p["asset"]})

        trade_grade = {
            "trade_index": idx,
            "season": season,
            "date": date,
            "side_a": {
                "owner": side_a_owner,
                "gave": [i["asset"] for i in give_items],
                "received": [i["asset"] for i in get_items],
                "received_players": result_a["player_details"],
                "received_delta": result_a["total_delta"],
                "grade": result_a["grade"],
                "injury_affected": result_a["injury_affected"],
            },
            "side_b": {
                "owner": side_b_owner,
                "gave": [i["asset"] for i in get_items],
                "received": [i["asset"] for i in give_items],
                "received_players": result_b["player_details"],
                "received_delta": result_b["total_delta"],
                "grade": result_b["grade"],
                "injury_affected": result_b["injury_affected"],
            },
            "pick_components": pick_components,
            "summary": summary,
            "grade_confidence": overall_conf,
        }

        trade_grades.append(trade_grade)

        # Count grades
        for side in ["side_a", "side_b"]:
            g = trade_grade[side]["grade"]
            if g in grade_counts:
                grade_counts[g] += 1

    # Save output
    output = {
        "meta": {
            "total_trades": len(trades),
            "graded": sum(1 for t in trade_grades if t["grade_confidence"] != "incomplete"),
            "incomplete": sum(1 for t in trade_grades if t["grade_confidence"] == "incomplete"),
            "grade_distribution": grade_counts,
            "methodology": "Season-level stats comparison. Pre=trade season, Post=next full season. FPts = PTS + REB*1.2 + AST*1.5 + STL*3 + BLK*3 - TO*1",
        },
        "trades": trade_grades,
    }

    output_path = DATA / "trade_grades.json"
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2)
    print(f"\n{'='*60}")
    print(f"RESULTS")
    print(f"{'='*60}")
    print(f"Total trades processed: {len(trade_grades)}")
    print(f"Grade distribution: {grade_counts}")
    print(f"Ungraded: {len(ungraded)}")
    print(f"Saved to: {output_path}")

    # Save ungraded list
    if ungraded:
        ungraded_path = ROOT / "scripts" / "ungraded_trades.md"
        with open(ungraded_path, "w") as f:
            f.write("# Ungraded Trades\n\n")
            for u in ungraded:
                f.write(f"- Trade #{u['trade_index']} ({u['season']}): {u['reason']}\n")
        print(f"Ungraded list saved to: {ungraded_path}")


if __name__ == "__main__":
    main()

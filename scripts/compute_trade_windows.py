#!/usr/bin/env python3
"""
compute_trade_windows.py — Compute pre/post trade windows and grade all trades.

For every player in every trade:
  PRE window:  FPts/game from the trade season
  POST window: FPts/game from the next full season
  Delta:       POST - PRE

Each side of the trade gets a grade based on total delta of received players.

Uses the accurate Fantrax scoring formula:
  PTS + REB + AST*2 + STL*4 + BLK*4 + FGM*2 - FGA + FTM - FTA + 3PM - TO*2

Usage:
    python3 scripts/compute_trade_windows.py
"""

import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "docs" / "data"

SEASON_ORDER = [
    "2020-21", "2021-22", "2022-23", "2023-24", "2024-25", "2025-26"
]

GRADE_SCALE = [
    (8.0, "A+"),
    (4.0, "A"),
    (1.0, "B"),
    (-1.0, "C"),
    (-4.0, "D"),
    (float("-inf"), "F"),
]

OWNER_ABBREVS = {
    "BADEN": "Baden", "VLAND": "Baden", "SAM": "Baden", "VLAD": "Baden",
    "BERK": "Berke", "LOGAN": "Berke",
    "DELA": "Delaney", "DAVE": "Delaney", "DAVID": "Delaney",
    "GOLD": "Gold",
    "GREEN": "Green", "MAX": "Green", "MAXG": "Green",
    "TRAG": "HaleTrager", "HALE": "HaleTrager", "RYAN": "HaleTrager",
    "JOWK": "Jowkar", "NICK": "Jowkar",
    "MOSS": "Moss",
    "PETE": "Peterson", "KELL": "Peterson", "KELV": "Peterson", "DIME": "Peterson",
    "ZJEW": "Zujewski", "MATT": "Zujewski", "ZUJE": "Zujewski",
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


def next_season(season):
    idx = SEASON_ORDER.index(season) if season in SEASON_ORDER else -1
    if 0 <= idx < len(SEASON_ORDER) - 1:
        return SEASON_ORDER[idx + 1]
    return None


def delta_to_grade(delta):
    for threshold, grade in GRADE_SCALE:
        if delta >= threshold:
            return grade
    return "F"


def parse_owner(item):
    parts = item.split(" ", 1)
    if len(parts) < 2:
        return None
    return OWNER_ABBREVS.get(parts[0].upper())


def parse_asset(item):
    parts = item.split(" ", 1)
    if len(parts) < 2:
        return item
    if parts[0].upper() in OWNER_ABBREVS:
        return parts[1].strip()
    return item


def is_pick(item):
    lower = item.lower()
    parts = lower.split(" ", 1)
    if len(parts) > 1 and parts[0].upper() in OWNER_ABBREVS:
        asset = parts[1]
    else:
        asset = lower
    return bool(re.search(r"(round|\d{4}\s+(1st|2nd)|right to swap|swap rights)", asset))


def main():
    print("=== Compute Trade Windows + Grade Trades ===\n")

    # Load data
    with open(DATA / "trades.json") as f:
        trades = json.load(f)
    with open(DATA / "fantrax_scoring.json") as f:
        scoring = json.load(f)
    with open(DATA / "player_stats_historical.json") as f:
        historical = json.load(f)

    # Load rankings for dynasty rank
    try:
        with open(DATA / "rankings.json") as f:
            rankings_raw = json.load(f)
        rankings_arr = rankings_raw if isinstance(rankings_raw, list) else rankings_raw.get("rankings", [])
        rank_map = {}
        for r in rankings_arr:
            name = r.get("player_name", r.get("player", ""))
            rank_map[normalize(name)] = r.get("rank")
    except Exception:
        rank_map = {}

    # Build normalized scoring lookup: norm_name -> {season -> fpts_pg}
    scoring_lookup = {}
    for name, seasons in scoring.items():
        norm = normalize(name)
        scoring_lookup[norm] = seasons

    # Also build from historical stats as fallback
    hist_lookup = {}
    for season, players in historical.items():
        for norm, stats in players.items():
            if norm not in hist_lookup:
                hist_lookup[norm] = {}
            fpts = stats.get("fpts_pg")
            if fpts is not None:
                hist_lookup[norm][season] = fpts

    def get_fpts(player_name, season):
        """Get FPts/game for a player in a season. Try scoring data first, then historical."""
        norm = normalize(player_name)

        # Try fantrax_scoring.json first
        if norm in scoring_lookup and season in scoring_lookup[norm]:
            return scoring_lookup[norm][season].get("fpts_per_game")

        # Try direct name match
        for name, seasons in scoring.items():
            if normalize(name) == norm and season in seasons:
                return seasons[season].get("fpts_per_game")

        # Try historical stats
        if norm in hist_lookup and season in hist_lookup[norm]:
            return hist_lookup[norm][season]

        return None

    def get_gp(player_name, season):
        """Get games played for a player in a season."""
        norm = normalize(player_name)
        if norm in scoring_lookup and season in scoring_lookup[norm]:
            return scoring_lookup[norm][season].get("gp", 0)
        return 0

    # Process each trade
    graded_trades = []
    stats = {
        "total": len(trades),
        "graded": 0,
        "incomplete": 0,
        "grade_distribution": {},
    }

    for i, trade in enumerate(trades):
        season = trade.get("season", "")
        date = trade.get("date")
        post_season = next_season(season)

        # Split give/get into sides
        give_items = trade.get("give", [])
        get_items = trade.get("get", [])

        # Determine owners for each side
        side_a_owner = None
        side_b_owner = None
        for item in give_items:
            o = parse_owner(item)
            if o:
                side_a_owner = o
                break
        for item in get_items:
            o = parse_owner(item)
            if o:
                side_b_owner = o
                break

        if not side_a_owner:
            side_a_owner = "Unknown"
        if not side_b_owner:
            side_b_owner = "Unknown"

        # Side A gave give_items, received get_items
        # Side B gave get_items, received give_items
        def process_side(received_items, owner):
            players_received = []
            picks_received = []
            total_delta = 0
            has_graded_player = False

            for item in received_items:
                if is_pick(item):
                    picks_received.append(parse_asset(item))
                    continue

                player_name = parse_asset(item)
                pre_fpts = get_fpts(player_name, season)
                post_fpts = get_fpts(player_name, post_season) if post_season else None

                player_entry = {
                    "player": player_name,
                    "pre_fpg": pre_fpts,
                    "post_fpg": post_fpts,
                    "delta": None,
                    "pre_season": season,
                    "post_season": post_season,
                    "gp_pre": get_gp(player_name, season),
                    "gp_post": get_gp(player_name, post_season) if post_season else 0,
                    "dynasty_rank": rank_map.get(normalize(player_name)),
                    "status": "graded",
                    "injury_affected": False,
                }

                if pre_fpts is not None and post_fpts is not None:
                    delta = round(post_fpts - pre_fpts, 1)
                    player_entry["delta"] = delta
                    total_delta += delta
                    has_graded_player = True
                elif pre_fpts is not None and post_fpts is None:
                    # Player disappeared post-trade (injury, retirement, left league)
                    if post_season:
                        player_entry["delta"] = round(-pre_fpts * 0.5, 1)
                        player_entry["status"] = "no_post_data"
                        player_entry["injury_affected"] = True
                        total_delta += player_entry["delta"]
                        has_graded_player = True
                    else:
                        player_entry["status"] = "current_season"
                elif pre_fpts is None and post_fpts is not None:
                    # Rookie or new to league
                    player_entry["delta"] = round(post_fpts * 0.5, 1)
                    player_entry["status"] = "no_pre_data"
                    total_delta += player_entry["delta"]
                    has_graded_player = True
                else:
                    player_entry["status"] = "no_data"

                players_received.append(player_entry)

            total_delta = round(total_delta, 1)

            if not has_graded_player and not picks_received:
                grade = "INC"
                grade_reason = "no gradeable data"
                confidence = "incomplete"
            elif not has_graded_player:
                grade = "INC"
                grade_reason = "pick-only trade"
                confidence = "incomplete"
            else:
                grade = delta_to_grade(total_delta)
                grade_reason = None
                # Confidence based on data quality
                fully_graded = sum(1 for p in players_received if p["status"] == "graded")
                total_players = len(players_received)
                if total_players > 0 and fully_graded == total_players:
                    confidence = "high"
                elif fully_graded > 0:
                    confidence = "medium"
                else:
                    confidence = "low"

            result = {
                "owner": owner,
                "gave": [parse_asset(item) for item in (get_items if received_items is give_items else give_items)],
                "received": [parse_asset(item) for item in received_items],
                "received_players": players_received,
                "received_picks": picks_received,
                "received_delta": total_delta,
                "grade": grade,
                "confidence": confidence,
                "injury_affected": any(p.get("injury_affected") for p in players_received),
            }
            if grade_reason:
                result["grade_reason"] = grade_reason
            return result

        side_a = process_side(get_items, side_a_owner)
        side_b = process_side(give_items, side_b_owner)

        # Fix the gave/received for correct direction
        side_a["gave"] = [parse_asset(item) for item in give_items]
        side_a["received"] = [parse_asset(item) for item in get_items]
        side_b["gave"] = [parse_asset(item) for item in get_items]
        side_b["received"] = [parse_asset(item) for item in give_items]

        # Determine winner
        if side_a["grade"] != "INC" and side_b["grade"] != "INC":
            if side_a["received_delta"] > side_b["received_delta"]:
                winner = side_a["owner"]
                loser = side_b["owner"]
            elif side_b["received_delta"] > side_a["received_delta"]:
                winner = side_b["owner"]
                loser = side_a["owner"]
            else:
                winner = "tie"
                loser = "tie"
        else:
            winner = None
            loser = None

        # Summary sentence
        if winner and winner != "tie":
            best_player = ""
            best_delta = -999
            winner_side = side_a if side_a["owner"] == winner else side_b
            for p in winner_side["received_players"]:
                if p.get("delta") is not None and p["delta"] > best_delta:
                    best_delta = p["delta"]
                    best_player = p["player"]
            summary = f"{winner} won this trade"
            if best_player:
                summary += f", receiving {best_player} (+{best_delta} FPts/g)"
            summary += f". {loser} got the short end."
        elif winner == "tie":
            summary = "Even trade — both sides came out roughly equal."
        else:
            summary = "Incomplete — not enough data to determine a winner."

        # Confidence for entire trade
        confs = [side_a.get("confidence", "incomplete"), side_b.get("confidence", "incomplete")]
        if "incomplete" in confs:
            grade_confidence = "incomplete"
        elif all(c == "high" for c in confs):
            grade_confidence = "high"
        elif "low" in confs:
            grade_confidence = "low"
        else:
            grade_confidence = "medium"

        graded_trade = {
            "trade_index": i,
            "season": season,
            "date": date,
            "side_a": side_a,
            "side_b": side_b,
            "pick_components": [],
            "summary": summary,
            "grade_confidence": grade_confidence,
        }

        graded_trades.append(graded_trade)

        # Track stats
        for side in [side_a, side_b]:
            g = side["grade"]
            if g != "INC":
                stats["grade_distribution"][g] = stats["grade_distribution"].get(g, 0) + 1
                stats["graded"] += 1
            else:
                stats["incomplete"] += 1

    # Divide graded/incomplete by 2 since we count both sides
    # Actually, graded counts SIDES not trades, so keep as-is

    # Save
    output = {
        "meta": {
            "total_trades": len(trades),
            "graded_sides": stats["graded"],
            "incomplete_sides": stats["incomplete"],
            "grade_distribution": stats["grade_distribution"],
            "methodology": "Fantrax FPts formula: PTS + REB + AST*2 + STL*4 + BLK*4 + FGM*2 - FGA + FTM - FTA + 3PM - TO*2. Pre=trade season, Post=next full season.",
            "scoring_source": "basketball-reference.com per-game stats, converted to Fantrax scoring",
        },
        "trades": graded_trades,
    }

    with open(DATA / "trade_grades.json", "w") as f:
        json.dump(output, f, indent=2)

    print(f"Total trades: {len(trades)}")
    print(f"Graded sides: {stats['graded']}")
    print(f"Incomplete sides: {stats['incomplete']}")
    print(f"\nGrade distribution:")
    for g in ["A+", "A", "B", "C", "D", "F"]:
        count = stats["grade_distribution"].get(g, 0)
        print(f"  {g}: {count}")

    # Owner report cards
    print(f"\n--- Owner Report Cards ---")
    GRADE_VALUES = {"A+": 4.3, "A": 4.0, "B": 3.0, "C": 2.0, "D": 1.0, "F": 0.0}
    owner_stats = {}
    for t in graded_trades:
        for side_key in ["side_a", "side_b"]:
            side = t[side_key]
            owner = side["owner"]
            grade = side["grade"]
            if grade == "INC":
                continue
            if owner not in owner_stats:
                owner_stats[owner] = {"grades": [], "total_delta": 0}
            owner_stats[owner]["grades"].append(grade)
            owner_stats[owner]["total_delta"] += side["received_delta"]

    for owner in sorted(owner_stats.keys()):
        os_data = owner_stats[owner]
        total = len(os_data["grades"])
        gpa = sum(GRADE_VALUES.get(g, 0) for g in os_data["grades"]) / total if total else 0
        wins = sum(1 for g in os_data["grades"] if GRADE_VALUES.get(g, 0) >= 3.0)
        losses = sum(1 for g in os_data["grades"] if GRADE_VALUES.get(g, 0) <= 1.0)
        even = sum(1 for g in os_data["grades"] if GRADE_VALUES.get(g, 0) == 2.0)
        avg_delta = os_data["total_delta"] / total if total else 0
        print(f"  {owner}: GPA={gpa:.2f}, W={wins}, L={losses}, E={even}, Avg Delta={avg_delta:+.1f}")

    print(f"\nSaved to {DATA / 'trade_grades.json'}")


if __name__ == "__main__":
    main()

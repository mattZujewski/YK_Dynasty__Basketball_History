#!/usr/bin/env python3
"""
combine_trade_grades.py — Merge player grades (60%) + pick grades (40%) into final trade grades.

Reads:
  - trade_grades.json (from compute_trade_windows.py — player delta grades)
  - pick_ledger.json (from track_pick_outcomes.py — pick slot grades)

Writes:
  - trade_grades.json (updated with combined grades)

Weighting:
  - Players only: 100% player grade
  - Picks only: 100% pick grade
  - Mixed: 60% players + 40% picks

Usage:
    python3 scripts/combine_trade_grades.py
"""

import json
import re
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "docs" / "data"

# Grade GPA scale
GRADE_GPA = {"A+": 4.3, "A": 4.0, "B": 3.0, "C": 2.0, "D": 1.0, "F": 0.0, "INC": None}

# Player delta grade scale (from compute_trade_windows.py)
PLAYER_GRADE_SCALE = [
    (8.0, "A+"),
    (4.0, "A"),
    (1.0, "B"),
    (-1.0, "C"),
    (-4.0, "D"),
    (float("-inf"), "F"),
]

# Owner name resolution (for parsing pick strings in received_picks)
OWNER_MAP = {
    "TRAG": "HaleTrager", "HALE": "HaleTrager",
    "JOWK": "Jowkar",
    "DELA": "Delaney",
    "GREEN": "Green", "MAX": "Green",
    "BERK": "Berke", "LOGAN": "Berke",
    "PETE": "Peterson", "DIME": "Peterson", "KELL": "Peterson", "KELV": "Peterson",
    "MOSS": "Moss",
    "ZJEW": "Zujewski", "MATT": "Zujewski",
    "GOLD": "Gold",
    "VLAND": "Baden", "BADEN": "Baden", "SAM": "Baden", "VLAD": "Baden",
    "FLAGGS": "Baden",
}

OWNER_NAME_MAP = {
    "berke": "Berke", "vlandis": "Baden", "kelley": "Baden", "baden": "Baden",
    "kelvin": "Peterson", "peterson": "Peterson", "green": "Green",
    "jowkar": "Jowkar", "delaney": "Delaney", "gold": "Gold",
    "trager": "HaleTrager", "haletrager": "HaleTrager", "hale": "HaleTrager",
    "moss": "Moss", "zujewski": "Zujewski",
}

CANONICAL_OWNERS = [
    "Baden", "Berke", "Delaney", "Gold", "Green",
    "HaleTrager", "Jowkar", "Moss", "Peterson", "Zujewski"
]


def resolve_owner(abbr):
    up = abbr.upper()
    if up in OWNER_MAP:
        return OWNER_MAP[up]
    low = abbr.lower()
    if low in OWNER_NAME_MAP:
        return OWNER_NAME_MAP[low]
    for co in CANONICAL_OWNERS:
        if co.lower() == low:
            return co
    return abbr


def gpa_to_grade(gpa):
    """Convert GPA back to letter grade."""
    if gpa >= 4.15:
        return "A+"
    elif gpa >= 3.5:
        return "A"
    elif gpa >= 2.5:
        return "B"
    elif gpa >= 1.5:
        return "C"
    elif gpa >= 0.5:
        return "D"
    else:
        return "F"


def delta_to_grade(delta):
    """Convert FPts delta to letter grade."""
    for threshold, grade in PLAYER_GRADE_SCALE:
        if delta >= threshold:
            return grade
    return "F"


def parse_pick_id_from_string(pick_str, trade_season=None):
    """
    Parse a pick string from trade_grades.json received_picks array.
    Format is like 'Berke 2023 1st round', 'Vlandis 2021 2nd round',
    'DIME Kelvin 2023 1st Round', 'Peterson 2022 2nd', etc.
    Returns pick_id like 'Berke_2023_R1' or None.
    """
    s = pick_str.strip()

    # Extract year
    year_match = re.search(r'(20\d{2})', s)
    if not year_match:
        return None
    year = int(year_match.group(1))

    # Extract round
    round_match = re.search(r'(1st|2nd|first|second)', s, re.I)
    if not round_match:
        return None
    rtext = round_match.group(1).lower()
    round_num = 1 if rtext in ("1st", "first") else 2

    # Extract owner name
    cleaned = s
    cleaned = re.sub(r'20\d{2}', '', cleaned)
    cleaned = re.sub(r'(?:1st|2nd|first|second)\s*(?:round|rd)?', '', cleaned, flags=re.I)
    cleaned = re.sub(r'#\d+\s*(?:overall)?', '', cleaned, flags=re.I)
    cleaned = re.sub(r'\(.*?\)', '', cleaned)
    cleaned = re.sub(
        r'\b(?:swap|rights?|pick|draft|if|it|doesn\'t|convey|with|the|frp|srp)\b',
        '', cleaned, flags=re.I)
    cleaned = cleaned.strip()

    words = [w.strip() for w in cleaned.split() if w.strip()]
    original_owner = None
    for w in words:
        resolved = resolve_owner(w)
        if resolved in CANONICAL_OWNERS:
            original_owner = resolved
            break

    if not original_owner:
        return None

    return f"{original_owner}_{year}_R{round_num}"


def main():
    print("=" * 60)
    print("COMBINE TRADE GRADES (Players 60% + Picks 40%)")
    print("=" * 60)

    # Load data
    trade_grades = json.load(open(DATA / "trade_grades.json"))
    pick_ledger = json.load(open(DATA / "pick_ledger.json"))

    picks = pick_ledger["picks"]

    stats = {
        "player_only": 0,
        "pick_only": 0,
        "mixed": 0,
        "upgraded": 0,
        "downgraded": 0,
        "unchanged": 0,
        "now_graded": 0,  # previously INC, now has a grade
        "still_inc": 0,
    }

    # Process each trade
    for trade in trade_grades["trades"]:
        trade_idx = trade["trade_index"]
        season = trade["season"]

        for side_key in ["side_a", "side_b"]:
            side = trade[side_key]
            old_grade = side.get("grade", "INC")

            # Get player GPA
            player_delta = side.get("received_delta", 0)
            player_grade = side.get("grade", "INC")
            player_gpa = GRADE_GPA.get(player_grade)

            has_players = len(side.get("received_players", [])) > 0
            has_picks = len(side.get("received_picks", [])) > 0

            # Look up pick grades
            pick_gpas = []
            pick_details = []
            for pick_str in side.get("received_picks", []):
                pick_id = parse_pick_id_from_string(pick_str, season)
                if not pick_id or pick_id not in picks:
                    continue

                pick_data = picks[pick_id]
                grade = pick_data.get("pick_grade") or pick_data.get("projected_grade")
                gpa = pick_data.get("pick_gpa") or pick_data.get("projected_gpa")

                if grade and gpa is not None:
                    pick_gpas.append(gpa)
                    pick_details.append({
                        "pick_id": pick_id,
                        "grade": grade,
                        "gpa": gpa,
                        "slot": pick_data.get("draft_slot") or pick_data.get("projected_slot"),
                        "status": pick_data.get("status", "unknown"),
                    })

            # Store pick component data on the trade
            side["pick_grades"] = pick_details

            # Calculate combined grade
            avg_pick_gpa = sum(pick_gpas) / len(pick_gpas) if pick_gpas else None

            if has_players and has_picks and player_gpa is not None and avg_pick_gpa is not None:
                # Mixed: 60% players + 40% picks
                combined_gpa = player_gpa * 0.6 + avg_pick_gpa * 0.4
                combined_grade = gpa_to_grade(combined_gpa)
                side["combined_grade"] = combined_grade
                side["combined_gpa"] = round(combined_gpa, 2)
                side["grade_basis"] = "mixed"
                stats["mixed"] += 1
            elif has_picks and avg_pick_gpa is not None and (not has_players or player_gpa is None):
                # Pick-only: 100% pick grade
                combined_gpa = avg_pick_gpa
                combined_grade = gpa_to_grade(combined_gpa)
                side["combined_grade"] = combined_grade
                side["combined_gpa"] = round(combined_gpa, 2)
                side["grade_basis"] = "picks_only"
                stats["pick_only"] += 1
            elif has_players and player_gpa is not None:
                # Player-only: 100% player grade
                combined_gpa = player_gpa
                combined_grade = player_grade
                side["combined_grade"] = combined_grade
                side["combined_gpa"] = round(combined_gpa, 2) if combined_gpa else None
                side["grade_basis"] = "players_only"
                stats["player_only"] += 1
            else:
                # Still incomplete
                side["combined_grade"] = "INC"
                side["combined_gpa"] = None
                side["grade_basis"] = "incomplete"
                stats["still_inc"] += 1
                continue

            # Track changes
            if old_grade == "INC" and combined_grade != "INC":
                stats["now_graded"] += 1
            elif old_grade != "INC":
                old_gpa = GRADE_GPA.get(old_grade, 0)
                if combined_gpa > old_gpa + 0.1:
                    stats["upgraded"] += 1
                elif combined_gpa < old_gpa - 0.1:
                    stats["downgraded"] += 1
                else:
                    stats["unchanged"] += 1

        # Update trade-level summary based on combined grades
        side_a = trade["side_a"]
        side_b = trade["side_b"]
        a_grade = side_a.get("combined_grade", side_a.get("grade", "INC"))
        b_grade = side_b.get("combined_grade", side_b.get("grade", "INC"))
        a_gpa = side_a.get("combined_gpa")
        b_gpa = side_b.get("combined_gpa")

        if a_gpa is not None and b_gpa is not None:
            if a_gpa > b_gpa + 0.5:
                winner = side_a["owner"]
                loser = side_b["owner"]
            elif b_gpa > a_gpa + 0.5:
                winner = side_b["owner"]
                loser = side_a["owner"]
            else:
                winner = None

            if winner:
                trade["summary"] = f"{winner} won this trade ({a_grade} vs {b_grade}). Combined grade considers both players and picks."
            else:
                trade["summary"] = f"Even trade ({a_grade} vs {b_grade}). Both sides got comparable value."
        elif a_grade == "INC" and b_grade == "INC":
            trade["summary"] = "Incomplete — not enough data to grade either side."
        else:
            trade["summary"] = f"Partial data ({side_a['owner']}: {a_grade}, {side_b['owner']}: {b_grade})."

    # Update combined grade distribution
    combined_dist = defaultdict(int)
    for trade in trade_grades["trades"]:
        for side_key in ["side_a", "side_b"]:
            g = trade[side_key].get("combined_grade", trade[side_key].get("grade", "INC"))
            combined_dist[g] += 1

    # Owner report cards with combined grades
    owner_grades = defaultdict(list)
    for trade in trade_grades["trades"]:
        for side_key in ["side_a", "side_b"]:
            side = trade[side_key]
            owner = side["owner"]
            grade = side.get("combined_grade", side.get("grade", "INC"))
            gpa = side.get("combined_gpa")
            if gpa is not None:
                owner_grades[owner].append(gpa)

    # Update meta
    trade_grades["meta"]["combined_grade_distribution"] = dict(combined_dist)
    trade_grades["meta"]["methodology"] += " Combined: 60% player delta + 40% pick slot grade (mixed), 100% for player-only or pick-only."
    trade_grades["meta"]["combined_stats"] = {
        "player_only_sides": stats["player_only"],
        "pick_only_sides": stats["pick_only"],
        "mixed_sides": stats["mixed"],
        "still_incomplete": stats["still_inc"],
        "newly_graded": stats["now_graded"],
    }

    # Owner report cards
    owner_report = {}
    for owner in sorted(CANONICAL_OWNERS):
        gpas = owner_grades.get(owner, [])
        if gpas:
            avg = round(sum(gpas) / len(gpas), 2)
            owner_report[owner] = {
                "avg_gpa": avg,
                "avg_grade": gpa_to_grade(avg),
                "total_sides": len(gpas),
            }
        else:
            owner_report[owner] = {"avg_gpa": None, "avg_grade": "N/A", "total_sides": 0}
    trade_grades["meta"]["owner_report_cards"] = owner_report

    # Save
    with open(DATA / "trade_grades.json", "w") as f:
        json.dump(trade_grades, f, indent=2)

    # Print results
    print(f"\n{'='*60}")
    print(f"COMBINED GRADE RESULTS")
    print(f"{'='*60}")
    print(f"Player-only sides: {stats['player_only']}")
    print(f"Pick-only sides: {stats['pick_only']}")
    print(f"Mixed (60/40) sides: {stats['mixed']}")
    print(f"Still incomplete: {stats['still_inc']}")
    print(f"Newly graded (was INC): {stats['now_graded']}")
    print(f"Upgraded from player-only: {stats['upgraded']}")
    print(f"Downgraded from player-only: {stats['downgraded']}")
    print(f"Unchanged: {stats['unchanged']}")

    print(f"\nCombined grade distribution:")
    for g in ["A+", "A", "B", "C", "D", "F", "INC"]:
        if combined_dist[g]:
            print(f"  {g}: {combined_dist[g]}")

    print(f"\nOwner report cards (combined grades):")
    for owner in sorted(CANONICAL_OWNERS):
        r = owner_report[owner]
        if r["avg_gpa"] is not None:
            print(f"  {owner}: GPA {r['avg_gpa']} ({r['avg_grade']}) — {r['total_sides']} graded sides")
        else:
            print(f"  {owner}: N/A")

    # Audit log
    audit_path = ROOT / "scripts" / "audit_log.md"
    with open(audit_path, "a") as f:
        f.write(f"\n\n## combine_trade_grades.py (8.5)\n")
        f.write(f"- Player-only: {stats['player_only']}, Pick-only: {stats['pick_only']}, Mixed: {stats['mixed']}\n")
        f.write(f"- Newly graded: {stats['now_graded']}, Still INC: {stats['still_inc']}\n")
        f.write(f"- Distribution: {dict(combined_dist)}\n")
        for owner in sorted(CANONICAL_OWNERS):
            r = owner_report[owner]
            f.write(f"  - {owner}: GPA {r['avg_gpa']} ({r['avg_grade']})\n")

    print(f"\nSaved to: {DATA / 'trade_grades.json'}")
    print("Done.\n")


if __name__ == "__main__":
    main()

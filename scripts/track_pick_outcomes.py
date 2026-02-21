#!/usr/bin/env python3
"""
track_pick_outcomes.py — Build pick ledger tracing every draft pick through trades.

For each traded pick:
  1. Parse pick items from trades.json
  2. Build ownership chains showing who traded what to whom
  3. Map completed picks to draft slots using getDraftResults + getFantasyTeams
  4. Assign pick grades based on draft slot (1st=A+, 10th=F)
  5. Project future pick values from latest standings

Output: docs/data/pick_ledger.json

Usage:
    python3 scripts/track_pick_outcomes.py
"""

import json
import re
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "docs" / "data"
RAW = DATA / "raw"

# ── Owner Resolution ──────────────────────────────────────────────

OWNER_MAP = {
    "TRAG": "HaleTrager", "HALE": "HaleTrager", "RYAN": "HaleTrager",
    "JOWK": "Jowkar", "NICK": "Jowkar",
    "DELA": "Delaney", "DAVE": "Delaney", "DAVID": "Delaney",
    "GREEN": "Green", "MAX": "Green", "MAXG": "Green",
    "BERK": "Berke", "LOGAN": "Berke",
    "PETE": "Peterson", "DIME": "Peterson", "KELL": "Peterson", "KELV": "Peterson",
    "MOSS": "Moss",
    "ZJEW": "Zujewski", "MATT": "Zujewski", "ZUJE": "Zujewski",
    "GOLD": "Gold",
    "VLAND": "Baden", "BADEN": "Baden", "SAM": "Baden", "VLAD": "Baden",
    "FLAGGS": "Baden",
}

OWNER_NAME_MAP = {
    "berke": "Berke",
    "vlandis": "Baden", "kelley": "Baden", "baden": "Baden",
    "kelvin": "Peterson", "peterson": "Peterson",
    "green": "Green", "max": "Green",
    "jowkar": "Jowkar", "jowk": "Jowkar",
    "delaney": "Delaney",
    "gold": "Gold",
    "trager": "HaleTrager", "haletrager": "HaleTrager", "hale": "HaleTrager",
    "moss": "Moss",
    "zujewski": "Zujewski", "franz": "Zujewski",
}

CANONICAL_OWNERS = [
    "Baden", "Berke", "Delaney", "Gold", "Green",
    "HaleTrager", "Jowkar", "Moss", "Peterson", "Zujewski"
]

# shortName from Fantrax → canonical owner
SHORTNAME_MAP = {
    "Kelvin": "Peterson",
    "Jowk": "Jowkar",
    "Berke": "Berke",
    "Vlandis": "Baden", "FLAGGS": "Baden", "Whoppers": "Baden",
    "DELA": "Delaney",
    "Max": "Green",
    "Gold": "Gold",
    "Franz": "Zujewski",
    "Moss": "Moss",
    "Hale": "HaleTrager",
}

# Draft seasons that have getDraftResults data
DRAFT_SEASONS = {
    "2022-23": "2022_23",
    "2023-24": "2023_24",
    "2024-25": "2024_25",
    "2025-26": "2025_26",
}

# Pick grade scale: draft slot → grade
# 10-team league, 2 rounds
# Round 1: slots 1-10
# Round 2: slots 11-20
PICK_GRADE_SCALE = {
    1: "A+", 2: "A+",
    3: "A",  4: "A",
    5: "B",  6: "B",
    7: "C",  8: "C",
    9: "D",  10: "F",
    # Round 2 picks are less valuable
    11: "C", 12: "C",
    13: "D", 14: "D",
    15: "F", 16: "F",
    17: "F", 18: "F",
    19: "F", 20: "F",
}

GRADE_GPA = {"A+": 4.3, "A": 4.0, "B": 3.0, "C": 2.0, "D": 1.0, "F": 0.0}


def resolve_owner(abbr):
    """Resolve abbreviation to canonical owner name."""
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


def parse_pick_string(text):
    """
    Parse a pick string like 'Berke 2023 1st round' or '2023 Green 2nd round'.
    Returns dict with original_owner, draft_year, round, is_swap — or None.
    """
    s = text.strip()
    is_swap = "swap" in s.lower()

    year_match = re.search(r'(20\d{2})', s)
    if not year_match:
        return None
    draft_year = int(year_match.group(1))

    round_match = re.search(r'(1st|2nd|first|second)', s, re.I)
    if not round_match:
        return None
    rtext = round_match.group(1).lower()
    round_num = 1 if rtext in ("1st", "first") else 2

    # Clean string to isolate owner name
    cleaned = s
    cleaned = re.sub(r'20\d{2}', '', cleaned)
    cleaned = re.sub(r'(?:1st|2nd|first|second)\s*(?:round|rd)?', '', cleaned, flags=re.I)
    cleaned = re.sub(r'#\d+\s*(?:overall)?', '', cleaned, flags=re.I)
    cleaned = re.sub(r'\(.*?\)', '', cleaned)
    cleaned = re.sub(
        r'\b(?:swap|rights?|pick|draft|if|it|doesn\'t|convey|with|the|frp|srp|1rp|2rp)\b',
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

    return {
        "original_owner": original_owner,
        "draft_year": draft_year,
        "round": round_num,
        "is_swap": is_swap,
    }


def is_pick_item(item_text):
    """Check if a trade item is a draft pick."""
    lower = item_text.lower()
    parts = lower.split(" ", 1)
    if len(parts) > 1 and parts[0].upper() in OWNER_MAP:
        asset_lower = parts[1].strip()
    else:
        asset_lower = lower

    if re.search(r'\d{4}\s*(1st|2nd|first|second)\s*round', asset_lower):
        return True
    if re.search(r'(1st|2nd|first|second)\s*round', asset_lower):
        return True
    if "round" in asset_lower:
        return True
    if re.search(r'\d{4}\s*(frp|srp|1rp|2rp)', asset_lower):
        return True
    if "right to swap" in asset_lower or "swap rights" in asset_lower:
        return True
    if re.search(r'\w+\s+\d{4}\s+(1st|2nd)', asset_lower):
        return True
    if re.search(r'\d{4}\s+(1st|2nd)\s*\(', asset_lower):
        return True
    return False


def build_team_id_maps():
    """
    Build teamId → canonical owner mapping for each season.
    Uses getFantasyTeams.json for each season.
    """
    season_maps = {}  # season_key → {teamId: owner}

    for season, folder in DRAFT_SEASONS.items():
        teams_file = RAW / folder / "getFantasyTeams.json"
        if not teams_file.exists():
            continue
        data = json.load(open(teams_file))
        teams = data["responses"][0]["data"]["fantasyTeams"]
        team_map = {}
        for t in teams:
            short = t.get("shortName", "")
            owner = SHORTNAME_MAP.get(short)
            if owner:
                team_map[t["id"]] = owner
        season_maps[season] = team_map

    return season_maps


def build_draft_slot_maps(team_id_maps):
    """
    Build {season → {(round, pick_num) → {owner, overall_slot}}} from getDraftResults.
    The draft order in getDraftResults reflects the actual draft order used.
    """
    draft_maps = {}

    for season, folder in DRAFT_SEASONS.items():
        draft_file = RAW / folder / "getDraftResults.json"
        if not draft_file.exists():
            continue
        data = json.load(open(draft_file))
        picks = data["responses"][0]["data"]["draftPicksOrdered"]
        team_map = team_id_maps.get(season, {})

        slot_map = {}
        for p in picks:
            rnd = p["round"]
            pick_num = p["pickNumber"]
            team_id = p["teamId"]
            owner = team_map.get(team_id, "Unknown")
            overall = (rnd - 1) * 10 + pick_num
            slot_map[(rnd, pick_num)] = {
                "owner": owner,
                "overall_slot": overall,
                "round": rnd,
                "pick_number": pick_num,
            }
        draft_maps[season] = slot_map

    return draft_maps


def season_to_draft_year(season):
    """Convert '2022-23' to 2022 (the draft year for that season)."""
    return int(season.split("-")[0])


def draft_year_to_season(year):
    """Convert 2022 to '2022-23'."""
    short = str(year + 1)[-2:]
    return f"{year}-{short}"


def main():
    print("=" * 60)
    print("PICK OUTCOME TRACKING (Revised)")
    print("=" * 60)

    # Load data
    trades = json.load(open(DATA / "trades.json"))
    picks_json = json.load(open(DATA / "picks.json"))
    owners_data = json.load(open(DATA / "owners.json"))
    seasons_data = json.load(open(DATA / "seasons.json"))

    # Build Fantrax team ID mappings
    team_id_maps = build_team_id_maps()
    draft_slot_maps = build_draft_slot_maps(team_id_maps)

    # Build team name → owner lookup from owners.json
    team_to_owner = {}
    for o in owners_data["owners"]:
        for sk, tn in o["teams"].items():
            team_to_owner[tn] = o["id"]

    # Build owner ID → canonical name
    owner_id_to_canonical = {}
    for o in owners_data["owners"]:
        canonical = o["id"][0].upper() + o["id"][1:]
        # Special case
        if o["id"] == "haletrager":
            canonical = "HaleTrager"
        elif o["id"] == "peterson":
            canonical = "Peterson"
        elif o["id"] == "jowkar":
            canonical = "Jowkar"
        elif o["id"] == "delaney":
            canonical = "Delaney"
        elif o["id"] == "green":
            canonical = "Green"
        elif o["id"] == "gold":
            canonical = "Gold"
        elif o["id"] == "berke":
            canonical = "Berke"
        elif o["id"] == "baden":
            canonical = "Baden"
        elif o["id"] == "zujewski":
            canonical = "Zujewski"
        elif o["id"] == "moss":
            canonical = "Moss"
        owner_id_to_canonical[o["id"]] = canonical

    # ── Step 1: Parse all pick items from trades ──
    print("\n─── Step 1: Parse pick items from trades ───")
    pick_trades = []

    for idx, trade in enumerate(trades):
        season = trade["season"]
        give_items = trade.get("give", [])
        get_items = trade.get("get", [])

        # Determine sides
        give_owners = set()
        get_owners = set()
        for item in give_items:
            parts = item.strip().split()
            if parts:
                resolved = resolve_owner(parts[0])
                if resolved in CANONICAL_OWNERS:
                    give_owners.add(resolved)
        for item in get_items:
            parts = item.strip().split()
            if parts:
                resolved = resolve_owner(parts[0])
                if resolved in CANONICAL_OWNERS:
                    get_owners.add(resolved)

        # Process "give" picks — give_owner sends pick TO get_owner
        for item in give_items:
            if not is_pick_item(item):
                continue
            parts = item.strip().split()
            if not parts:
                continue
            abbr = parts[0]
            from_owner = resolve_owner(abbr)
            if from_owner not in CANONICAL_OWNERS:
                continue

            # Parse the pick details from the full item (after the owner prefix)
            asset = " ".join(parts[1:]) if len(parts) > 1 else item
            pick_info = parse_pick_string(item)  # Use full item for parsing
            if not pick_info:
                continue

            to_owners = list(get_owners)
            to_owner = to_owners[0] if to_owners else "Unknown"

            pick_trades.append({
                "trade_index": idx,
                "season": season,
                "from": from_owner,
                "to": to_owner,
                "pick": pick_info,
                "raw": item.strip(),
            })

        # Process "get" picks — get_owner sends pick TO give_owner
        for item in get_items:
            if not is_pick_item(item):
                continue
            parts = item.strip().split()
            if not parts:
                continue
            abbr = parts[0]
            from_owner = resolve_owner(abbr)
            if from_owner not in CANONICAL_OWNERS:
                continue

            pick_info = parse_pick_string(item)
            if not pick_info:
                continue

            to_owners = list(give_owners)
            to_owner = to_owners[0] if to_owners else "Unknown"

            pick_trades.append({
                "trade_index": idx,
                "season": season,
                "from": from_owner,
                "to": to_owner,
                "pick": pick_info,
                "raw": item.strip(),
            })

    print(f"  Found {len(pick_trades)} pick trade events")

    # ── Step 2: Build pick ledger ──
    print("\n─── Step 2: Build pick ledger ───")
    ledger = {}

    for pt in pick_trades:
        pi = pt["pick"]
        pick_id = f"{pi['original_owner']}_{pi['draft_year']}_R{pi['round']}"

        if pick_id not in ledger:
            ledger[pick_id] = {
                "pick_id": pick_id,
                "original_owner": pi["original_owner"],
                "draft_year": pi["draft_year"],
                "round": pi["round"],
                "is_swap": pi["is_swap"],
                "trades": [],
                "current_owner": pi["original_owner"],
            }

        # Update swap flag if any trade involves swap
        if pi["is_swap"]:
            ledger[pick_id]["is_swap"] = True

        ledger[pick_id]["trades"].append({
            "trade_index": pt["trade_index"],
            "season": pt["season"],
            "from": pt["from"],
            "to": pt["to"],
            "raw": pt["raw"],
        })
        ledger[pick_id]["current_owner"] = pt["to"]

    print(f"  {len(ledger)} unique picks in ledger from trades")

    # ── Step 3: Merge future picks from picks.json ──
    print("\n─── Step 3: Merge future picks from picks.json ───")
    merged_count = 0
    new_count = 0

    for year_str, year_data in picks_json.items():
        year = int(year_str)
        for owner, pick_list in year_data.items():
            canonical_owner = resolve_owner(owner)
            if canonical_owner not in CANONICAL_OWNERS:
                canonical_owner = owner

            for pick_str in pick_list:
                # Inject year into the string if not present (picks.json format: "1st Round Trager")
                augmented = pick_str if re.search(r'20\d{2}', pick_str) else f"{year} {pick_str}"
                pick_info = parse_pick_string(augmented)
                if not pick_info:
                    continue

                pick_id = f"{pick_info['original_owner']}_{year}_R{pick_info['round']}"

                if pick_id not in ledger:
                    ledger[pick_id] = {
                        "pick_id": pick_id,
                        "original_owner": pick_info["original_owner"],
                        "draft_year": year,
                        "round": pick_info["round"],
                        "is_swap": pick_info["is_swap"],
                        "trades": [],
                        "current_owner": canonical_owner,
                    }
                    new_count += 1
                else:
                    merged_count += 1

                # picks.json is authoritative for current ownership of future picks
                ledger[pick_id]["current_owner"] = canonical_owner

    print(f"  Merged {merged_count} existing, added {new_count} new picks from picks.json")

    # ── Step 4: Map completed picks to draft slots ──
    print("\n─── Step 4: Map picks to draft slots ───")

    # For each draft season, figure out which pick slot each original owner's pick became
    # The getDraftResults fantasyTeamsOrdered = draft order (1st pick team is index 0)
    # The draftPicksOrdered shows round/pickNumber/teamId

    completed_count = 0
    for pick_id, pick_data in ledger.items():
        year = pick_data["draft_year"]
        season = draft_year_to_season(year)
        rnd = pick_data["round"]

        if season not in draft_slot_maps:
            # No draft data for this season
            pick_data["status"] = "pending" if year > 2025 else "no_draft_data"
            continue

        slot_map = draft_slot_maps[season]
        orig_owner = pick_data["original_owner"]

        # Find which pick slot this owner's pick ended up as
        found_slot = None
        for (r, pn), slot_info in slot_map.items():
            if r == rnd and slot_info["owner"] == orig_owner:
                found_slot = slot_info
                break

        if found_slot:
            overall = found_slot["overall_slot"]
            grade = PICK_GRADE_SCALE.get(overall, "F")
            pick_data["status"] = "completed"
            pick_data["draft_slot"] = found_slot["pick_number"]
            pick_data["overall_slot"] = overall
            pick_data["pick_grade"] = grade
            pick_data["pick_gpa"] = GRADE_GPA.get(grade, 0.0)
            completed_count += 1
        else:
            pick_data["status"] = "pending" if year > 2025 else "unresolved"

    print(f"  Mapped {completed_count} picks to draft slots")

    # ── Step 5: Project future pick values ──
    print("\n─── Step 5: Project future pick values ───")

    # Use latest standings to project future pick values
    latest = seasons_data["seasons"][-1]
    latest_year = latest["year"]
    standings = latest["standings"]

    # Build team → rank
    team_to_rank = {}
    for entry in standings:
        team_name = entry["team"]
        owner_id = team_to_owner.get(team_name)
        if owner_id:
            canonical = owner_id_to_canonical.get(owner_id, owner_id)
            team_to_rank[canonical] = entry["rank"]

    projected_count = 0
    for pick_id, pick_data in ledger.items():
        if pick_data["status"] not in ("pending", "no_draft_data"):
            continue
        if pick_data["draft_year"] <= 2025:
            continue

        orig_owner = pick_data["original_owner"]
        orig_rank = team_to_rank.get(orig_owner, 5)
        # Draft order = reverse standings (10th place picks 1st)
        pick_slot = 11 - orig_rank
        rnd = pick_data["round"]
        overall = (rnd - 1) * 10 + pick_slot

        grade = PICK_GRADE_SCALE.get(overall, "F")

        pick_data["status"] = "projected"
        pick_data["projected_slot"] = pick_slot
        pick_data["projected_overall"] = overall
        pick_data["projected_grade"] = grade
        pick_data["projected_gpa"] = GRADE_GPA.get(grade, 0.0)
        pick_data["projection_basis"] = f"{latest_year} standings (rank #{orig_rank})"
        projected_count += 1

    print(f"  Projected {projected_count} future picks")

    # ── Step 6: Per-owner analysis ──
    print("\n─── Step 6: Per-owner pick portfolio ───")
    owner_stats = {o: {
        "own_picks": 0,
        "acquired_picks": 0,
        "traded_away_count": 0,
        "picks_received_grades": [],
        "picks_sent_grades": [],
    } for o in CANONICAL_OWNERS}

    for pick_data in ledger.values():
        current = pick_data["current_owner"]
        original = pick_data["original_owner"]

        if current in owner_stats:
            if current == original:
                owner_stats[current]["own_picks"] += 1
            else:
                owner_stats[current]["acquired_picks"] += 1

        # Grade tracking for traded picks
        grade = pick_data.get("pick_grade") or pick_data.get("projected_grade")
        if grade and len(pick_data["trades"]) > 0:
            # The receiver gets credit for the grade
            final_receiver = pick_data["current_owner"]
            if final_receiver in owner_stats:
                owner_stats[final_receiver]["picks_received_grades"].append(grade)
            # The sender loses the pick
            for t in pick_data["trades"]:
                if t["from"] in owner_stats:
                    owner_stats[t["from"]]["traded_away_count"] += 1
                    owner_stats[t["from"]]["picks_sent_grades"].append(grade)

    # ── Step 7: Summary ──
    total_picks = len(ledger)
    traded_picks = sum(1 for p in ledger.values() if len(p["trades"]) > 0)
    completed = sum(1 for p in ledger.values() if p["status"] == "completed")
    projected = sum(1 for p in ledger.values() if p["status"] == "projected")
    pending = sum(1 for p in ledger.values() if p["status"] in ("pending", "no_draft_data"))

    print(f"\n{'='*60}")
    print(f"PICK LEDGER RESULTS")
    print(f"{'='*60}")
    print(f"Total unique picks tracked: {total_picks}")
    print(f"  Completed (have draft slot): {completed}")
    print(f"  Projected (future, based on standings): {projected}")
    print(f"  Pending/no data: {pending}")
    print(f"Picks with trade history: {traded_picks}")

    # Grade distribution for completed picks
    grade_dist = defaultdict(int)
    for p in ledger.values():
        g = p.get("pick_grade")
        if g:
            grade_dist[g] += 1
    print(f"\nCompleted pick grade distribution:")
    for g in ["A+", "A", "B", "C", "D", "F"]:
        if grade_dist[g]:
            print(f"  {g}: {grade_dist[g]}")

    print(f"\nPer-owner pick portfolio:")
    for owner in sorted(CANONICAL_OWNERS):
        s = owner_stats[owner]
        total_held = s["own_picks"] + s["acquired_picks"]
        recv_gpas = [GRADE_GPA.get(g, 0) for g in s["picks_received_grades"]]
        avg_recv = round(sum(recv_gpas) / len(recv_gpas), 2) if recv_gpas else "N/A"
        print(f"  {owner}: holds {total_held} ({s['own_picks']} own + {s['acquired_picks']} acq), "
              f"traded away {s['traded_away_count']}, "
              f"avg received grade: {avg_recv}")

    # ── Save output ──
    output = {
        "meta": {
            "total_picks": total_picks,
            "traded": traded_picks,
            "completed": completed,
            "projected": projected,
            "pending": pending,
            "grade_distribution": dict(grade_dist),
            "pick_grade_scale": "1-2=A+, 3-4=A, 5-6=B, 7-8=C, 9=D, 10=F (Rd1); "
                                "11-12=C, 13-14=D, 15-20=F (Rd2)",
            "projection_basis": f"{latest_year} standings",
        },
        "picks": {k: v for k, v in sorted(ledger.items())},
        "owner_summary": {
            owner: {
                "total_held": owner_stats[owner]["own_picks"] + owner_stats[owner]["acquired_picks"],
                "own_picks": owner_stats[owner]["own_picks"],
                "acquired_picks": owner_stats[owner]["acquired_picks"],
                "traded_away": owner_stats[owner]["traded_away_count"],
                "received_grades": owner_stats[owner]["picks_received_grades"],
                "sent_grades": owner_stats[owner]["picks_sent_grades"],
            }
            for owner in sorted(CANONICAL_OWNERS)
        },
    }

    output_path = DATA / "pick_ledger.json"
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2)
    print(f"\nSaved to: {output_path}")

    # Append to audit log
    audit_path = ROOT / "scripts" / "audit_log.md"
    with open(audit_path, "a") as f:
        f.write(f"\n\n## track_pick_outcomes.py (8.4)\n")
        f.write(f"- Total picks: {total_picks} ({completed} completed, {projected} projected, {pending} pending)\n")
        f.write(f"- Picks with trades: {traded_picks}\n")
        f.write(f"- Grade distribution: {dict(grade_dist)}\n")
        for owner in sorted(CANONICAL_OWNERS):
            s = owner_stats[owner]
            f.write(f"  - {owner}: holds {s['own_picks']+s['acquired_picks']}, traded {s['traded_away_count']}\n")

    print("Done.\n")


if __name__ == "__main__":
    main()

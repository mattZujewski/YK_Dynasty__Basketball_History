#!/usr/bin/env python3
"""
track_pick_outcomes.py — Build pick ledger tracing every draft pick through trades.

1. Parse all pick items from trades.json to build ownership chains
2. Build pick_ledger.json with each pick's trade history
3. Use standings data to compute projected pick slots for pending picks

Usage:
    python3 scripts/track_pick_outcomes.py
"""

import json
import re
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "docs" / "data"

# Owner abbreviation resolution
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

# Also resolve owner names appearing in pick strings
OWNER_NAME_MAP = {
    "berke": "Berke",
    "vlandis": "Baden",
    "kelvin": "Peterson",
    "peterson": "Peterson",
    "green": "Green",
    "jowkar": "Jowkar",
    "delaney": "Delaney",
    "gold": "Gold",
    "trager": "HaleTrager",
    "haletrager": "HaleTrager",
    "moss": "Moss",
    "zujewski": "Zujewski",
    "baden": "Baden",
    "kelley": "Baden",
}

CANONICAL_OWNERS = [
    "Baden", "Berke", "Delaney", "Gold", "Green",
    "HaleTrager", "Jowkar", "Moss", "Peterson", "Zujewski"
]


def resolve_owner(abbr):
    """Resolve abbreviation to canonical owner name."""
    up = abbr.upper()
    if up in OWNER_MAP:
        return OWNER_MAP[up]
    low = abbr.lower()
    if low in OWNER_NAME_MAP:
        return OWNER_NAME_MAP[low]
    # Check if it's already canonical
    for co in CANONICAL_OWNERS:
        if co.lower() == low:
            return co
    return abbr


def parse_pick_string(asset_str):
    """
    Parse a pick string like 'Berke 2023 1st round' or '2023 Green 2nd round'
    Returns (original_owner, draft_year, round_num) or None.
    """
    s = asset_str.strip()

    # Handle swap rights — mark but still extract
    is_swap = "swap" in s.lower()

    # Extract year (4 digits)
    year_match = re.search(r'(20\d{2})', s)
    if not year_match:
        return None
    draft_year = int(year_match.group(1))

    # Extract round
    round_match = re.search(r'(1st|2nd)', s, re.I)
    if not round_match:
        return None
    round_num = 1 if round_match.group(1).lower() == "1st" else 2

    # Extract original owner name — the name that appears near the pick
    # Remove year, round, and common words to isolate owner
    cleaned = s
    cleaned = re.sub(r'20\d{2}', '', cleaned)
    cleaned = re.sub(r'(?:1st|2nd)\s*(?:round|rd)', '', cleaned, flags=re.I)
    cleaned = re.sub(r'#\d+\s*overall', '', cleaned, flags=re.I)
    cleaned = re.sub(r'\(.*?\)', '', cleaned)
    cleaned = re.sub(r'(?:swap|rights?|pick|draft|if|it|doesn\'t|convey|with|the)', '', cleaned, flags=re.I)
    cleaned = cleaned.strip()

    # The remaining word(s) should be an owner name
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


def main():
    print("=" * 60)
    print("PICK OUTCOME TRACKING")
    print("=" * 60)

    trades = json.load(open(DATA / "trades.json"))
    picks_json = json.load(open(DATA / "picks.json"))
    seasons = json.load(open(DATA / "seasons.json"))
    rankings_raw = json.load(open(DATA / "rankings.json"))
    rankings = rankings_raw if isinstance(rankings_raw, list) else rankings_raw.get("rankings", [])

    # Build rank lookup
    rank_map = {}
    for r in rankings:
        name = r.get("player_name") or r.get("player", "")
        rank_map[name.lower().strip()] = r.get("rank", 999)

    # Get standings for projected pick values
    standings = {}
    for s in seasons["seasons"]:
        year = s["year"]
        standings[year] = []
        for entry in s["standings"]:
            from_team = entry["team"]
            standings[year].append({
                "rank": entry["rank"],
                "team": from_team,
                "fpts": entry.get("fpts", 0),
            })

    # ── Step 1: Parse all pick items from trades ──
    print("\nParsing pick items from trades...")
    pick_trades = []  # (trade_index, season, from_owner, to_owner, pick_info)

    for idx, trade in enumerate(trades):
        season = trade["season"]
        give_items = trade.get("give", [])
        get_items = trade.get("get", [])

        # Determine who is giving and who is getting
        give_owners = set()
        get_owners = set()
        for item in give_items:
            parts = item.strip().split()
            if parts:
                give_owners.add(resolve_owner(parts[0]))
        for item in get_items:
            parts = item.strip().split()
            if parts:
                get_owners.add(resolve_owner(parts[0]))

        # For pick items in "give": the give_owner is trading the pick TO the get_owner
        for item in give_items:
            parts = item.strip().split()
            if not parts:
                continue
            abbr = parts[0]
            asset = " ".join(parts[1:])
            # Strip position prefix
            if len(parts) > 2 and re.match(r"^(?:PG|SG|SF|PF|C)(?:/(?:PG|SG|SF|PF|C))?$", parts[1], re.I):
                asset = " ".join(parts[2:])

            if re.search(r"(?:1st|2nd)\s*(?:round|rd)", asset, re.I):
                pick_info = parse_pick_string(asset)
                if pick_info:
                    from_owner = resolve_owner(abbr)
                    # The pick goes TO the other side
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

        # For pick items in "get": the get_owner is trading the pick TO the give_owner
        for item in get_items:
            parts = item.strip().split()
            if not parts:
                continue
            abbr = parts[0]
            asset = " ".join(parts[1:])
            if len(parts) > 2 and re.match(r"^(?:PG|SG|SF|PF|C)(?:/(?:PG|SG|SF|PF|C))?$", parts[1], re.I):
                asset = " ".join(parts[2:])

            if re.search(r"(?:1st|2nd)\s*(?:round|rd)", asset, re.I):
                pick_info = parse_pick_string(asset)
                if pick_info:
                    from_owner = resolve_owner(abbr)
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
    print("\nBuilding pick ledger...")
    ledger = {}

    for pt in pick_trades:
        pi = pt["pick"]
        pick_id = f"{pi['original_owner'].lower()}_{pi['draft_year']}_{pi['round']}"

        if pick_id not in ledger:
            ledger[pick_id] = {
                "pick_id": pick_id,
                "original_owner": pi["original_owner"],
                "draft_year": pi["draft_year"],
                "round": pi["round"],
                "is_swap": pi["is_swap"],
                "trades": [],
                "current_owner": pi["original_owner"],  # Start with original
                "status": "pending" if pi["draft_year"] > 2026 else "used",
            }

        # Add trade event
        ledger[pick_id]["trades"].append({
            "trade_index": pt["trade_index"],
            "season": pt["season"],
            "from": pt["from"],
            "to": pt["to"],
            "raw": pt["raw"],
        })
        ledger[pick_id]["current_owner"] = pt["to"]

    # ── Step 3: Add future picks from picks.json ──
    print("\nMerging future picks from picks.json...")
    for year_str, year_data in picks_json.items():
        year = int(year_str)
        for owner, pick_list in year_data.items():
            for pick_str in pick_list:
                pick_info = parse_pick_string(pick_str)
                if not pick_info:
                    continue
                pick_id = f"{pick_info['original_owner'].lower()}_{year}_{pick_info['round']}"
                if pick_id not in ledger:
                    ledger[pick_id] = {
                        "pick_id": pick_id,
                        "original_owner": pick_info["original_owner"],
                        "draft_year": year,
                        "round": pick_info["round"],
                        "is_swap": pick_info["is_swap"],
                        "trades": [],
                        "current_owner": owner,
                        "status": "pending",
                    }
                # Update current owner based on picks.json (most reliable for future)
                ledger[pick_id]["current_owner"] = owner

    # ── Step 4: Compute projected pick value for pending picks ──
    print("\nComputing projected values...")
    # Use most recent standings to project pick slots
    latest_season = sorted(standings.keys())[-1]
    latest_standings = standings[latest_season]
    # Worst record = best pick. Build owner -> standing rank
    # We need team->owner mapping
    team_to_owner_raw = json.load(open(DATA / "seasons.json"))
    owners_data = json.load(open(DATA / "owners.json"))
    team_to_owner = {}
    for o in owners_data["owners"]:
        for sk, tn in o["teams"].items():
            team_to_owner[tn] = o["id"]

    owner_to_rank = {}
    for entry in latest_standings:
        owner = team_to_owner.get(entry["team"])
        if owner:
            owner_to_rank[owner] = entry["rank"]

    for pick_id, pick_data in ledger.items():
        if pick_data["status"] == "pending" and pick_data["draft_year"] > 2026:
            orig_owner = pick_data["original_owner"]
            orig_rank = owner_to_rank.get(orig_owner, 5)
            # Draft order = reverse standings (10th place = 1st pick)
            pick_slot = 11 - orig_rank
            if pick_data["round"] == 2:
                pick_slot += 10

            tier = "lottery" if pick_slot <= 3 else "high" if pick_slot <= 6 else "mid" if pick_slot <= 8 else "late"

            pick_data["projected"] = {
                "pick_slot": pick_slot,
                "value_tier": tier,
                "based_on": f"{latest_season} standings (rank #{orig_rank})",
            }

    # ── Step 5: Summary stats ──
    total_picks = len(ledger)
    traded_picks = sum(1 for p in ledger.values() if len(p["trades"]) > 0)
    pending_picks = sum(1 for p in ledger.values() if p["status"] == "pending")
    used_picks = sum(1 for p in ledger.values() if p["status"] == "used")

    print(f"\n{'='*60}")
    print(f"PICK LEDGER RESULTS")
    print(f"{'='*60}")
    print(f"Total unique picks tracked: {total_picks}")
    print(f"Picks with trade history: {traded_picks}")
    print(f"Pending (future drafts): {pending_picks}")
    print(f"Used (completed drafts): {used_picks}")

    # Per-owner summary
    owner_picks = defaultdict(lambda: {"own": 0, "acquired": 0, "traded_away": 0})
    for pick_data in ledger.values():
        current = pick_data["current_owner"]
        original = pick_data["original_owner"]
        owner_picks[current]["own" if current == original else "acquired"] += 1
        for t in pick_data["trades"]:
            owner_picks[t["from"]]["traded_away"] += 1

    print("\nPer-owner pick portfolio:")
    for owner in sorted(CANONICAL_OWNERS):
        p = owner_picks.get(owner, {"own": 0, "acquired": 0, "traded_away": 0})
        print(f"  {owner}: owns {p['own']} original + {p['acquired']} acquired, traded away {p['traded_away']}")

    # Save output
    output = {
        "meta": {
            "total_picks": total_picks,
            "traded": traded_picks,
            "pending": pending_picks,
            "used": used_picks,
        },
        "picks": ledger,
    }

    output_path = DATA / "pick_ledger.json"
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2)
    print(f"\nSaved to: {output_path}")


if __name__ == "__main__":
    main()

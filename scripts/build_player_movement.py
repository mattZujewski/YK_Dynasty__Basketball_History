#!/usr/bin/env python3
"""
build_player_movement.py — Build player ownership history from trades + rosters.

Cross-references trades.json with rosters_2025_26.json to build a timeline
of each player's dynasty ownership. Players not found in any trade are
classified as "startup" acquisitions.

Usage:
    python3 scripts/build_player_movement.py
"""

import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TRADES_PATH = ROOT / "docs" / "data" / "trades.json"
ROSTER_PATH = ROOT / "docs" / "data" / "rosters_2025_26.json"
OUTPUT_PATH = ROOT / "docs" / "data" / "player_movement.json"

# Owner abbreviation → canonical owner (matches core.js)
OWNER_ABBREVS = {
    "TRAG": "HaleTrager", "HALE": "HaleTrager",
    "JOWK": "Jowkar",
    "DELA": "Delaney",
    "GREEN": "Green",
    "BERK": "Berke",
    "PETE": "Peterson", "DIME": "Peterson",
    "MOSS": "Moss",
    "ZJEW": "Zujewski",
    "GOLD": "Gold",
    "KELL": "Baden", "VLAND": "Baden", "BADEN": "Baden",
}

OWNER_ALT_NAMES = {
    "Kelvin": "Peterson", "Peterson": "Peterson", "AlwaysDroppin": "Peterson",
    "Jowkar": "Jowkar", "Delaney": "Delaney",
    "Green": "Green", "Max": "Green",
    "Logan": "Berke", "Berke": "Berke",
    "Moss": "Moss",
    "Trager": "HaleTrager", "Hale": "HaleTrager", "HaleTrager": "HaleTrager",
    "Vlandis": "Baden", "Kelley": "Baden", "Baden": "Baden",
    "Zujewski": "Zujewski", "Franz": "Zujewski",
    "Gold": "Gold",
}

OWNERS_CANONICAL = {
    "Baden", "Berke", "Delaney", "Gold", "Green",
    "HaleTrager", "Jowkar", "Moss", "Peterson", "Zujewski",
}


def resolve_owner(abbrev_or_name):
    if abbrev_or_name in OWNER_ABBREVS:
        return OWNER_ABBREVS[abbrev_or_name]
    if abbrev_or_name in OWNER_ALT_NAMES:
        return OWNER_ALT_NAMES[abbrev_or_name]
    if abbrev_or_name in OWNERS_CANONICAL:
        return abbrev_or_name
    return abbrev_or_name


def normalize(name):
    """Strip accents and lowercase for matching."""
    nfkd = unicodedata.normalize("NFD", name)
    return "".join(c for c in nfkd if unicodedata.category(c) != "Mn").lower().strip()


def parse_trade_item(item_str):
    """Parse 'ABBREV Player Name' → (canonical_owner, asset_name)."""
    parts = item_str.strip().split()
    if not parts:
        return None, None
    owner = resolve_owner(parts[0])
    asset = " ".join(parts[1:])
    return owner, asset


def is_pick(asset_name):
    """Check if an asset is a draft pick, not a player."""
    lower = asset_name.lower()
    return bool(re.search(r'(1st|2nd)\s*(round|rd)', lower) or
                "pick" in lower or "swap" in lower)


def main():
    with open(TRADES_PATH) as f:
        trades = json.load(f)
    with open(ROSTER_PATH) as f:
        roster_data = json.load(f)

    teams = roster_data.get("teams", {})

    # Collect all rostered players: name → current_owner
    rostered_players = {}
    for owner, team_data in teams.items():
        for player in team_data.get("players", []):
            rostered_players[player["name"]] = owner

    # Build normalized name → original name lookup
    norm_to_name = {}
    for name in rostered_players:
        norm_to_name[normalize(name)] = name

    # Scan all trades for player movements
    # trade_events[normalized_name] = [(season, date, from_owner, to_owner)]
    trade_events = {}

    for trade in trades:
        season = trade.get("season", "")
        date = trade.get("date")

        # Parse all items in give and get
        give_items = []
        get_items = []

        for item in trade.get("give", []):
            owner, asset = parse_trade_item(item)
            if owner and asset and not is_pick(asset):
                give_items.append((owner, asset))

        for item in trade.get("get", []):
            owner, asset = parse_trade_item(item)
            if owner and asset and not is_pick(asset):
                get_items.append((owner, asset))

        # For each player asset, record the movement
        # In a trade: "give" items are being sent BY that owner
        # "get" items are being received BY that owner
        all_items = give_items + get_items
        for from_owner, player_name in all_items:
            norm = normalize(player_name)

            # Determine to_owner: the "other side" of the trade
            # The player is listed under from_owner, meaning from_owner is sending them
            # The receiver is any other owner in the trade
            all_owners = set()
            for o, _ in give_items:
                all_owners.add(o)
            for o, _ in get_items:
                all_owners.add(o)

            to_owners = all_owners - {from_owner}
            to_owner = list(to_owners)[0] if to_owners else None

            if to_owner:
                if norm not in trade_events:
                    trade_events[norm] = []
                trade_events[norm].append({
                    "season": season,
                    "date": date,
                    "from": from_owner,
                    "to": to_owner,
                    "player_name": player_name,
                })

    # Build movement history for each rostered player
    result = {}
    traded_count = 0
    startup_count = 0

    for player_name, current_owner in sorted(rostered_players.items()):
        norm = normalize(player_name)
        events = trade_events.get(norm, [])

        if events:
            # Sort by season, then date
            events.sort(key=lambda e: (e["season"], e["date"] or ""))
            history = []
            for event in events:
                history.append({
                    "type": "trade",
                    "from": event["from"],
                    "to": event["to"],
                    "season": event["season"],
                    "date": event["date"],
                })
            result[player_name] = {
                "current_owner": current_owner,
                "history": history,
                "traded": True,
            }
            traded_count += 1
        else:
            # No trade history found — startup player
            result[player_name] = {
                "current_owner": current_owner,
                "history": [
                    {
                        "type": "startup",
                        "owner": current_owner,
                        "season": "unknown",
                    }
                ],
                "traded": False,
            }
            startup_count += 1

    output = {
        "meta": {
            "total_players": len(rostered_players),
            "traded": traded_count,
            "startup": startup_count,
            "total_trade_events": sum(len(v) for v in trade_events.values()),
        },
        "players": result,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(output, f, indent=2)

    print(f"Done! {len(result)} players processed")
    print(f"  Traded: {traded_count}")
    print(f"  Startup: {startup_count}")
    print(f"  Total trade events: {output['meta']['total_trade_events']}")
    print(f"Output: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()

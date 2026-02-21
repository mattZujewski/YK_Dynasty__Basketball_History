#!/usr/bin/env python3
"""
rebuild_trade_players.py — Validate & clean all trade entries.

For each trade in trades.json:
  1. Split give/get into players vs picks
  2. Validate player names against Fantrax roster data (fuzzy match)
  3. Flag picks that were mis-parsed as players
  4. Output updated trades.json with clean splits

Usage:
    python3 scripts/rebuild_trade_players.py
"""

import json
import re
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TRADES_PATH = ROOT / "docs" / "data" / "trades.json"
OUTPUT_PATH = ROOT / "docs" / "data" / "trades.json"  # overwrite in place

ROSTER_FILES = [
    ROOT / "docs" / "data" / "rosters_2022_23.json",
    ROOT / "docs" / "data" / "rosters_2023_24.json",
    ROOT / "docs" / "data" / "rosters_2024_25.json",
    ROOT / "docs" / "data" / "rosters_2025_26.json",
]

# Owner abbreviation mappings (from trades.json give/get format: "ABBREV PlayerName")
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

# Name overrides for known mismatches
NAME_OVERRIDES = {
    "D'Angelo Russell": "D'Angelo Russell",
    "De'Angelo Russell": "D'Angelo Russell",
    "DAngelo Russell": "D'Angelo Russell",
    "De'Aaron Fox": "De'Aaron Fox",
    "DeAaron Fox": "De'Aaron Fox",
    "Demar Derozan": "DeMar DeRozan",
    "De'Andre Hunter": "De'Andre Hunter",
    "De'andre Hunter": "De'Andre Hunter",
    "Deandre Hunter": "De'Andre Hunter",
    "Cj McCollum": "CJ McCollum",
    "CJ McCollum": "CJ McCollum",
    "Lamelo Ball": "LaMelo Ball",
    "Lebron James": "LeBron James",
    "Kristaps Porzingus": "Kristaps Porzingis",
    "Donte Divincenzo": "Donte DiVincenzo",
    "Fred Vanvleet": "Fred VanVleet",
    "Brandom Ingram": "Brandon Ingram",
    "Jemai Grant": "Jerami Grant",
    "Dennis Schroeder": "Dennis Schroder",
    "Jae'Sean Tate": "Jae'Sean Tate",
    "Brandon Podziemski": "Brandin Podziemski",
    "Ayo Dosumnu": "Ayo Dosunmu",
    "Bilal Couliably": "Bilal Coulibaly",
    "Cam Johnson": "Cameron Johnson",
    "Bojan Bogdanovic": "Bojan Bogdanovic",
    "Gabe Vincent": "Gabe Vincent",
    "Steph Curry": "Stephen Curry",
    "Zach Lavine": "Zach LaVine",
    "Caris Levert": "Caris LeVert",
    # Retired/out-of-league players — keep as-is (not on any roster)
    "Reggie Jackson": "Reggie Jackson",
    "Kendrick Nunn": "Kendrick Nunn",
    "Kemba Walker": "Kemba Walker",
    "Montrezl Harrell": "Montrezl Harrell",
    "Thaddeus Young": "Thaddeus Young",
    "Derrick Rose": "Derrick Rose",
    "Lou Williams": "Lou Williams",
    "Alec Burks": "Alec Burks",
    "Patrick Beverly": "Patrick Beverley",
    "Andre Drummond": "Andre Drummond",
    "Nicolas Batum": "Nicolas Batum",
    "Bismack Biyombo": "Bismack Biyombo",
    "Dario Saric": "Dario Saric",
    "Jonas Valanciunas": "Jonas Valanciunas",
    "Russell Westbrook": "Russell Westbrook",
    "Nicholas Claxton": "Nicolas Claxton",
    "Wendall Carter Jr.": "Wendell Carter Jr.",
}

# Players with position prefixes in old trade data
POSITION_PREFIXES = re.compile(r"^(PG|SG|SF|PF|C)(/(?:PG|SG|SF|PF|C))*\s+")


def normalize(name):
    """Normalize a name for matching: lowercase, strip diacritics, remove suffixes."""
    name = unicodedata.normalize("NFD", name)
    name = "".join(c for c in name if unicodedata.category(c) != "Mn")
    name = name.lower().strip()
    # Remove common suffixes
    name = re.sub(r"\s+(jr\.?|sr\.?|iii?|iv)$", "", name)
    return name


def build_canonical_player_set():
    """Build set of all known player names from roster files."""
    players = {}  # normalized → canonical name
    for rf in ROSTER_FILES:
        if not rf.exists():
            continue
        with open(rf) as f:
            data = json.load(f)
        for owner, team in data.get("teams", {}).items():
            for p in team.get("players", []):
                norm = normalize(p["name"])
                if norm not in players:
                    players[norm] = p["name"]
    return players


def is_pick_item(item_text):
    """Determine if a trade item is a draft pick (not a player)."""
    lower = item_text.lower()
    # Strip owner prefix for pattern matching
    parts = lower.split(" ", 1)
    if len(parts) > 1 and parts[0].upper() in OWNER_ABBREVS:
        asset_lower = parts[1].strip()
    else:
        asset_lower = lower

    # Definitive pick patterns
    if re.search(r"\d{4}\s*(1st|2nd|first|second)\s*round", asset_lower):
        return True
    if re.search(r"(1st|2nd|first|second)\s*round", asset_lower):
        return True
    if "round" in asset_lower:
        return True
    if re.search(r"\d{4}\s*(frp|srp|1rp|2rp)", asset_lower):
        return True
    if "right to swap" in asset_lower or "swap rights" in asset_lower:
        return True
    # Catch patterns like "Berke 2023 1st" or "Peterson 2022 2nd"
    if re.search(r"\w+\s+\d{4}\s+(1st|2nd)", asset_lower):
        return True
    # Catch "2021 2nd (#17)" patterns
    if re.search(r"\d{4}\s+(1st|2nd)\s*\(", asset_lower):
        return True
    return False


def parse_trade_item(item_text):
    """Parse a trade item string into owner + asset."""
    parts = item_text.split(" ", 1)
    if len(parts) < 2:
        return None, item_text
    abbrev = parts[0].upper()
    asset = parts[1].strip()
    owner = OWNER_ABBREVS.get(abbrev)
    if not owner:
        # Try the full string as asset
        return None, item_text
    return owner, asset


def strip_position_prefix(name):
    """Remove position prefixes like 'SF/PF ' from player names."""
    return POSITION_PREFIXES.sub("", name)


def fuzzy_match(name, canonical_players, threshold=0.85):
    """Find best fuzzy match for a player name in the canonical set."""
    # Strip position prefix
    name = strip_position_prefix(name)
    norm = normalize(name)

    # Check name overrides FIRST (before any fuzzy matching)
    override = NAME_OVERRIDES.get(name)
    if override:
        override_norm = normalize(override)
        if override_norm in canonical_players:
            return canonical_players[override_norm], 1.0
        return override, 0.95  # Keep the override even if not on any roster

    # Direct match
    if norm in canonical_players:
        return canonical_players[norm], 1.0

    # Fuzzy match — require high confidence to avoid false positives
    best_match = None
    best_score = 0
    for canon_norm, canon_name in canonical_players.items():
        score = SequenceMatcher(None, norm, canon_norm).ratio()
        if score > best_score:
            best_score = score
            best_match = canon_name

    if best_score >= threshold:
        return best_match, best_score
    return name, best_score


def main():
    print("=== Rebuild Trade Players ===\n")

    # Load data
    with open(TRADES_PATH) as f:
        trades = json.load(f)
    canonical_players = build_canonical_player_set()
    print(f"Loaded {len(trades)} trades")
    print(f"Canonical player names: {len(canonical_players)}")

    stats = {
        "total_items": 0,
        "players": 0,
        "picks": 0,
        "name_corrections": 0,
        "fuzzy_matches": 0,
        "unmatched": [],
        "corrections": [],
    }

    # Process each trade
    for i, trade in enumerate(trades):
        for key in ["give", "get"]:
            items = trade.get(key, [])
            new_items = []
            for item in items:
                stats["total_items"] += 1
                owner, asset = parse_trade_item(item)

                if is_pick_item(item):
                    stats["picks"] += 1
                    new_items.append(item)  # Keep picks as-is
                    continue

                stats["players"] += 1

                # Try to validate/correct the player name
                original_name = asset
                matched_name, score = fuzzy_match(asset, canonical_players)

                if matched_name != asset:
                    stats["name_corrections"] += 1
                    if score < 1.0:
                        stats["fuzzy_matches"] += 1
                    stats["corrections"].append({
                        "trade": i,
                        "original": asset,
                        "corrected": matched_name,
                        "score": round(score, 3),
                    })
                    # Rebuild the item with corrected name
                    prefix = item.split(" ", 1)[0]
                    new_item = f"{prefix} {matched_name}"
                    new_items.append(new_item)
                else:
                    if score < 0.82:
                        stats["unmatched"].append({
                            "trade": i,
                            "season": trade.get("season"),
                            "name": asset,
                            "best_match": matched_name,
                            "score": round(score, 3),
                        })
                    new_items.append(item)

            trade[key] = new_items

    # Save updated trades
    with open(OUTPUT_PATH, "w") as f:
        json.dump(trades, f, indent=2)

    # Report
    print(f"\n--- Results ---")
    print(f"Total trade items: {stats['total_items']}")
    print(f"  Players: {stats['players']}")
    print(f"  Picks: {stats['picks']}")
    print(f"  Name corrections: {stats['name_corrections']}")
    print(f"  Fuzzy matches: {stats['fuzzy_matches']}")
    print(f"  Unmatched: {len(stats['unmatched'])}")

    if stats["corrections"]:
        print(f"\n--- Name Corrections ({len(stats['corrections'])}) ---")
        for c in stats["corrections"]:
            print(f"  Trade #{c['trade']}: '{c['original']}' → '{c['corrected']}' (score: {c['score']})")

    if stats["unmatched"]:
        print(f"\n--- Unmatched Players ({len(stats['unmatched'])}) ---")
        for u in stats["unmatched"]:
            print(f"  Trade #{u['trade']} ({u['season']}): '{u['name']}' (best: '{u['best_match']}', score: {u['score']})")

    # Save audit log
    audit_path = ROOT / "scripts" / "audit_log.md"
    with open(audit_path, "a") as f:
        f.write(f"\n\n## rebuild_trade_players.py\n")
        f.write(f"- Total items: {stats['total_items']} ({stats['players']} players, {stats['picks']} picks)\n")
        f.write(f"- Name corrections: {stats['name_corrections']}\n")
        f.write(f"- Fuzzy matches: {stats['fuzzy_matches']}\n")
        f.write(f"- Unmatched: {len(stats['unmatched'])}\n")
        if stats["unmatched"]:
            for u in stats["unmatched"]:
                f.write(f"  - Trade #{u['trade']}: {u['name']}\n")

    print(f"\nDone. Updated trades saved to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()

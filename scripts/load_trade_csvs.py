#!/usr/bin/env python3
"""
load_trade_csvs.py — Load ALL Fantrax trade CSV files, reconcile against
Excel-sourced trades.json, and rebuild a complete trade dataset.

APPROACH (revised):
  The Excel trades.json is the STRUCTURAL backbone — it has the correct
  trade-by-trade breakdown with proper side assignments (who gave what).

  The CSV is used to:
  1. Add dates to Excel trades that lack them
  2. Improve player name spellings (CSV → canonical Fantrax names)
  3. Add genuinely new CSV-only trades (not in Excel)
  4. Confirm trades as fantrax_confirmed

  We NEVER replace the Excel's side assignments with CSV data, because
  CSV keeper-day bundles merge multiple trades into one group and cannot
  reliably determine which player belongs to which distinct trade.

Hard rules:
  - picks_given = ONLY from Excel (Fantrax CSV pick data is incomplete)
  - Side assignments (who gave/got) = from Excel (authoritative)
  - Player name spellings = prefer CSV where matched
  - Dates = from CSV where available

Usage:
    python3 scripts/load_trade_csvs.py
"""

import csv
import json
import re
import unicodedata
from collections import defaultdict
from datetime import datetime
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "docs" / "data"
INFO = ROOT / "Info"
TRADES_PATH = DATA / "trades.json"

# ── Fantrax team name → canonical owner ──────────────────────────────────
TEAM_TO_OWNER = {
    "Always Droppin Dimes": "Peterson",
    "Ball Don't Lie": "Jowkar",
    "BKs Whoppers": "Baden",
    "Burner account": "Berke",
    "Charlotte Wobnets": "Baden",
    "Freshly Washed Kings": "Delaney",
    "Giddey Up": "Gold",
    "Ice Trae": "Green",
    "Kelvin got No Dimes": "Berke",
    "Kentucky Fried Guards": "Gold",
    "Lob Land": "HaleTrager",
    "No Shaime": "Gold",
    "Only Franz": "Zujewski",
    "Pure Sweat Fam": "Moss",
    "Twin Towers": "HaleTrager",
    "Flaming Flaggs": "Baden",
}

ABBREV_TO_OWNER = {
    "BADEN": "Baden", "VLAND": "Baden", "SAM": "Baden", "VLAD": "Baden",
    "KELL": "Baden", "FLAGGS": "Baden",
    "BERK": "Berke", "LOGAN": "Berke",
    "DELA": "Delaney", "DAVE": "Delaney", "DAVID": "Delaney",
    "GOLD": "Gold",
    "GREEN": "Green", "MAX": "Green", "MAXG": "Green",
    "TRAG": "HaleTrager", "HALE": "HaleTrager", "RYAN": "HaleTrager",
    "JOWK": "Jowkar", "NICK": "Jowkar",
    "MOSS": "Moss",
    "PETE": "Peterson", "KELV": "Peterson", "DIME": "Peterson",
    "ZJEW": "Zujewski", "MATT": "Zujewski", "ZUJE": "Zujewski",
}


def date_to_season(date_str):
    """Convert a Fantrax date string to NBA season string."""
    for fmt in ["%a %b %d, %Y, %I:%M%p", "%a %b %d, %Y, %I:%M %p"]:
        try:
            dt = datetime.strptime(date_str.strip(), fmt)
            if dt.month >= 7:
                return f"{dt.year}-{str(dt.year + 1)[-2:]}"
            else:
                return f"{dt.year - 1}-{str(dt.year)[-2:]}"
        except ValueError:
            continue
    return None


def parse_date_iso(date_str):
    """Parse Fantrax date to ISO format string."""
    for fmt in ["%a %b %d, %Y, %I:%M%p", "%a %b %d, %Y, %I:%M %p"]:
        try:
            dt = datetime.strptime(date_str.strip(), fmt)
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def normalize(name):
    """Normalize player name for matching."""
    nfkd = unicodedata.normalize("NFD", name)
    clean = "".join(c for c in nfkd if unicodedata.category(c) != "Mn").lower().strip()
    clean = clean.replace("\u2019", "'").replace("\u2018", "'")
    clean = clean.replace(".", "").replace("'", "")
    # Remove position prefixes like "SF/PF "
    clean = re.sub(r"^[A-Z]{1,2}/[A-Z]{1,2}\s+", "", clean)
    for suffix in [" jr", " iii", " ii", " iv", " sr"]:
        if clean.endswith(suffix):
            clean = clean[: -len(suffix)]
    return clean.strip()


def fuzzy_match_name(name_a, name_b, threshold=0.80):
    """Check if two player names fuzzy-match."""
    na = normalize(name_a)
    nb = normalize(name_b)
    if na == nb:
        return True
    return SequenceMatcher(None, na, nb).ratio() >= threshold


def is_pick_excel(item):
    """Check if a trades.json item is a pick."""
    lower = item.lower()
    parts = lower.split(" ", 1)
    if len(parts) > 1 and parts[0].upper() in ABBREV_TO_OWNER:
        asset = parts[1]
    else:
        asset = lower
    return bool(re.search(
        r"(round|\d{4}\s+(1st|2nd)|right to swap|swap rights|frp|srp)",
        asset
    ))


def get_owner_from_item(item):
    """Extract canonical owner from a trades.json item like 'DELA Pascal Siakam'."""
    parts = item.split(" ", 1)
    if len(parts) >= 2:
        return ABBREV_TO_OWNER.get(parts[0].upper())
    return None


def get_player_from_item(item):
    """Extract player name from a trades.json item."""
    if is_pick_excel(item):
        return None
    parts = item.split(" ", 1)
    if len(parts) >= 2 and ABBREV_TO_OWNER.get(parts[0].upper()):
        return parts[1].strip()
    # Items without a recognized abbreviation prefix (e.g., just "Kelvin")
    # or position-prefixed items
    return None


# ── Load CSV files into a per-player lookup ──────────────────────────────
def load_csv_player_index():
    """
    Build an index of every player transaction from CSV files.
    Returns:
      csv_players: dict[normalized_name] → list of {date, season, from_owner, to_owner, raw_name}
      csv_trade_dates: dict[(season, frozenset(owners))] → set of ISO dates
    """
    csv_files = sorted(INFO.glob("Fantrax-Transaction-History-Trades*.csv"))
    csv_players = defaultdict(list)
    csv_trade_dates = defaultdict(set)
    csv_trade_groups = []

    for csv_file in csv_files:
        print(f"\n  Loading {csv_file.name}...")
        with open(csv_file) as f:
            reader = csv.DictReader(f)
            rows = list(reader)

        # Group by trade (same date + same two teams)
        groups = defaultdict(list)
        for r in rows:
            key = (r["Date (EST)"], tuple(sorted([r["From"], r["To"]])))
            groups[key].append(r)

        player_count = 0
        pick_count = 0

        for (date_str, _), trade_rows in groups.items():
            iso_date = parse_date_iso(date_str)
            season = date_to_season(date_str)
            if not season:
                continue

            # Determine the two owners
            owners_in_group = set()
            group_players = []

            for r in trade_rows:
                from_owner = TEAM_TO_OWNER.get(r["From"])
                to_owner = TEAM_TO_OWNER.get(r["To"])
                if from_owner:
                    owners_in_group.add(from_owner)
                if to_owner:
                    owners_in_group.add(to_owner)

                if "Draft Pick" in r["Player"]:
                    pick_count += 1
                    continue

                player_name = re.sub(r'<[^>]+>', '', r["Player"]).strip()
                norm_name = normalize(player_name)

                entry = {
                    "date": iso_date,
                    "season": season,
                    "from_owner": from_owner,
                    "to_owner": to_owner,
                    "raw_name": player_name,
                }
                csv_players[norm_name].append(entry)
                group_players.append(entry)
                player_count += 1

            if owners_in_group and iso_date:
                csv_trade_dates[(season, frozenset(owners_in_group))].add(iso_date)
                csv_trade_groups.append({
                    "date": iso_date,
                    "season": season,
                    "owners": owners_in_group,
                    "players": group_players,
                })

        print(f"    {player_count} player rows, {pick_count} pick rows, "
              f"{len(groups)} trade groups")

    return csv_players, csv_trade_dates, csv_trade_groups


def main():
    print("=" * 60)
    print("LOAD TRADE CSVS — Excel Backbone + CSV Enrichment")
    print("=" * 60)

    # ── Step 1: Load CSV player index ──
    print("\n--- Step 1: Load CSV files ---")
    csv_players, csv_trade_dates, csv_trade_groups = load_csv_player_index()
    print(f"\nCSV player index: {len(csv_players)} unique players")
    print(f"CSV trade date groups: {len(csv_trade_groups)}")

    # ── Step 2: Load and process Excel trades ──
    print("\n--- Step 2: Process Excel trades ---")
    with open(TRADES_PATH) as f:
        excel_trades = json.load(f)
    print(f"Excel trades: {len(excel_trades)}")

    csv_seasons = set()
    for entries in csv_players.values():
        for e in entries:
            csv_seasons.add(e["season"])
    print(f"CSV covers seasons: {sorted(csv_seasons)}")

    OWNER_ABBREV = {
        "Baden": "BADEN", "Berke": "BERK", "Delaney": "DELA",
        "Gold": "GOLD", "Green": "GREEN", "HaleTrager": "TRAG",
        "Jowkar": "JOWK", "Moss": "MOSS", "Peterson": "PETE",
        "Zujewski": "ZJEW",
    }

    # ── Step 3: For each Excel trade, enrich with CSV data ──
    print("\n--- Step 3: Enrich Excel trades with CSV data ---")

    name_corrections = 0
    dates_added = 0
    trades_confirmed = 0
    duplicate_removed = 0
    players_added_total = 0

    # Track seen trades for duplicate detection
    seen_trades = {}

    enriched_trades = []
    for i, trade in enumerate(excel_trades):
        season = trade.get("season", "")
        give = trade.get("give", [])
        get_items = trade.get("get", [])

        # Check for duplicate
        owners = set()
        for item in give + get_items:
            o = get_owner_from_item(item)
            if o:
                owners.add(o)

        give_players = sorted([normalize(get_player_from_item(x) or "")
                               for x in give if get_player_from_item(x)])
        get_players_n = sorted([normalize(get_player_from_item(x) or "")
                                for x in get_items if get_player_from_item(x)])
        give_picks = sorted([x for x in give if is_pick_excel(x)])
        get_picks = sorted([x for x in get_items if is_pick_excel(x)])

        dup_key = (season, frozenset(owners), tuple(give_players),
                   tuple(get_players_n), tuple(give_picks), tuple(get_picks))
        if dup_key in seen_trades:
            print(f"  DUPLICATE REMOVED: #{i} same as #{seen_trades[dup_key]} "
                  f"({season} {owners})")
            duplicate_removed += 1
            continue
        seen_trades[dup_key] = i

        # Only enrich trades in CSV-covered seasons
        if season not in csv_seasons:
            enriched_trades.append(trade)
            continue

        # Try to add/improve date
        date = trade.get("date")
        if not date and owners:
            # Look for matching CSV trade dates
            possible_dates = csv_trade_dates.get((season, frozenset(owners)), set())
            if len(possible_dates) == 1:
                date = list(possible_dates)[0]
                dates_added += 1
            elif len(possible_dates) > 1:
                # Multiple dates — try to find which date matches by player overlap
                best_date = None
                best_overlap = 0
                for d in possible_dates:
                    overlap = 0
                    for item in give + get_items:
                        pname = get_player_from_item(item)
                        if not pname:
                            continue
                        norm_p = normalize(pname)
                        if norm_p in csv_players:
                            for entry in csv_players[norm_p]:
                                if entry["date"] == d and entry["season"] == season:
                                    if entry["from_owner"] in owners or entry["to_owner"] in owners:
                                        overlap += 1
                                        break
                    if overlap > best_overlap:
                        best_overlap = overlap
                        best_date = d
                if best_date and best_overlap > 0:
                    date = best_date
                    dates_added += 1

        # Improve player name spellings from CSV
        new_give = []
        new_get = []
        confirmed = False

        for item in give:
            pname = get_player_from_item(item)
            if not pname:
                new_give.append(item)
                continue

            norm_p = normalize(pname)
            owner = get_owner_from_item(item)
            abbrev = item.split(" ", 1)[0]

            # Look for CSV match
            if norm_p in csv_players:
                # Direct match — use CSV spelling
                csv_name = csv_players[norm_p][0]["raw_name"]
                new_give.append(f"{abbrev} {csv_name}")
                confirmed = True
                if csv_name != pname:
                    name_corrections += 1
            else:
                # Try fuzzy match
                best_match = None
                best_score = 0
                for csv_norm, entries in csv_players.items():
                    score = SequenceMatcher(None, norm_p, csv_norm).ratio()
                    if score > best_score and score >= 0.80:
                        best_score = score
                        best_match = entries[0]["raw_name"]
                if best_match:
                    new_give.append(f"{abbrev} {best_match}")
                    confirmed = True
                    if best_match != pname:
                        name_corrections += 1
                else:
                    new_give.append(item)

        for item in get_items:
            pname = get_player_from_item(item)
            if not pname:
                new_get.append(item)
                continue

            norm_p = normalize(pname)
            owner = get_owner_from_item(item)
            abbrev = item.split(" ", 1)[0]

            if norm_p in csv_players:
                csv_name = csv_players[norm_p][0]["raw_name"]
                new_get.append(f"{abbrev} {csv_name}")
                confirmed = True
                if csv_name != pname:
                    name_corrections += 1
            else:
                best_match = None
                best_score = 0
                for csv_norm, entries in csv_players.items():
                    score = SequenceMatcher(None, norm_p, csv_norm).ratio()
                    if score > best_score and score >= 0.80:
                        best_score = score
                        best_match = entries[0]["raw_name"]
                if best_match:
                    new_get.append(f"{abbrev} {best_match}")
                    confirmed = True
                    if best_match != pname:
                        name_corrections += 1
                else:
                    new_get.append(item)

        if confirmed:
            trades_confirmed += 1

        # ── Add missing players from the same CSV trade group ──
        # If we have a date and owners, find the CSV group for this date+owners
        # and add any players that aren't already in the trade
        players_added = 0
        if date and owners:
            # Find matching CSV group(s)
            existing_norm = set()
            for item in new_give + new_get:
                p = get_player_from_item(item)
                if p:
                    existing_norm.add(normalize(p))

            for group in csv_trade_groups:
                if group["date"] != date or group["season"] != season:
                    continue
                if not group["owners"].issubset(owners) and not owners.issubset(group["owners"]):
                    continue
                # Check if this group has the same owner pair
                if frozenset(group["owners"]) != frozenset(owners):
                    continue

                for p in group["players"]:
                    norm_name = normalize(p["raw_name"])
                    if norm_name in existing_norm:
                        continue
                    # This player is in the CSV group but not in the Excel trade
                    from_owner = p["from_owner"]
                    if from_owner and from_owner in OWNER_ABBREV:
                        abbrev = OWNER_ABBREV.get(from_owner, from_owner[:4].upper())
                        item_str = f"{abbrev} {p['raw_name']}"
                        # Determine which side: items from from_owner go to
                        # whichever side already has that owner's items
                        give_owners_set = set(
                            get_owner_from_item(x) for x in new_give
                            if get_owner_from_item(x)
                        )
                        if from_owner in give_owners_set:
                            new_give.append(item_str)
                        else:
                            new_get.append(item_str)
                        existing_norm.add(norm_name)
                        players_added += 1
                        confirmed = True

        if players_added > 0:
            players_added_total += players_added
            print(f"  Trade #{i}: added {players_added} missing players from CSV")

        enriched_trade = {
            "season": season,
            "date": date,
            "give": new_give,
            "get": new_get,
        }
        if confirmed:
            enriched_trade["fantrax_confirmed"] = True
        enriched_trades.append(enriched_trade)

    print(f"  Name corrections: {name_corrections}")
    print(f"  Dates added: {dates_added}")
    print(f"  Players added from CSV: {players_added_total}")
    print(f"  Trades confirmed by CSV: {trades_confirmed}")
    print(f"  Duplicates removed: {duplicate_removed}")

    # ── Step 4: Add CSV-only trades ──
    # Only add CSV trades where NONE of the group's players appear in ANY
    # Excel trade for the same season+owner-pair. This prevents duplication
    # of keeper-day bundles while allowing genuinely missing trades through.
    #
    # CSV groups are bilateral: rows within a group go both directions
    # (From→To and To→From), so we can build proper give/get sides.
    print("\n--- Step 4: Find CSV-only trades ---")

    # Build a set of all player names per (season, frozenset(owners))
    existing_players_by_key = defaultdict(set)
    for t in enriched_trades:
        season = t.get("season", "")
        trade_owners = set()
        for item in t.get("give", []) + t.get("get", []):
            o = get_owner_from_item(item)
            if o:
                trade_owners.add(o)
            p = get_player_from_item(item)
            if p:
                existing_players_by_key[(season, frozenset(trade_owners))].add(normalize(p))

    # Also build a global per-season set for fuzzy checking
    existing_players_global = defaultdict(set)
    for t in enriched_trades:
        season = t.get("season", "")
        for item in t.get("give", []) + t.get("get", []):
            p = get_player_from_item(item)
            if p:
                existing_players_global[season].add(normalize(p))

    csv_only_added = 0
    csv_only_empty = 0
    csv_only_skipped = 0

    for group in csv_trade_groups:
        season = group["season"]
        owners = group["owners"]
        players = group["players"]

        if not players:
            csv_only_empty += 1
            continue

        # Must have exactly two owners
        all_owners = list(owners)
        if len(all_owners) != 2:
            csv_only_skipped += 1
            continue

        # Check: do ANY of this group's players appear in an existing
        # Excel trade for the same season + owner pair?
        key = (season, frozenset(owners))
        existing = existing_players_by_key.get(key, set())
        global_existing = existing_players_global.get(season, set())

        overlap_count = sum(1 for p in players
                           if normalize(p["raw_name"]) in existing
                           or normalize(p["raw_name"]) in global_existing)

        if overlap_count > 0:
            # At least one player already tracked — this is part of a known
            # Excel trade or keeper-day bundle. Skip entirely.
            csv_only_skipped += 1
            continue

        # Genuinely new CSV-only trade: build bilateral give/get
        owner_a, owner_b = sorted(all_owners)

        # CSV direction: From = the owner giving the player away
        # "give" = items FROM owner_a, "get" = items FROM owner_b
        # (owner_a sends to owner_b = give, owner_b sends to owner_a = get)
        give_items = []
        get_items = []
        for p in players:
            from_owner = p["from_owner"]
            to_owner = p["to_owner"]
            if from_owner and to_owner and from_owner in OWNER_ABBREV:
                abbrev = OWNER_ABBREV[from_owner]
                item = f"{abbrev} {p['raw_name']}"
                # Player goes FROM from_owner TO to_owner
                # Convention: "give" = what owner_a sends, "get" = what owner_b sends
                if from_owner == owner_a:
                    give_items.append(item)
                else:
                    get_items.append(item)

        if not give_items and not get_items:
            csv_only_empty += 1
            continue

        trade_entry = {
            "season": season,
            "date": group["date"],
            "give": give_items,
            "get": get_items,
            "source": "fantrax_csv_only",
            "fantrax_confirmed": True,
        }
        enriched_trades.append(trade_entry)
        csv_only_added += 1

        # Update existing sets so we don't double-add
        for p in players:
            existing_players_global[season].add(normalize(p["raw_name"]))
            existing_players_by_key[key].add(normalize(p["raw_name"]))

    print(f"  CSV-only trades added: {csv_only_added}")
    print(f"  CSV groups skipped (overlap with Excel): {csv_only_skipped}")
    print(f"  Empty CSV groups skipped: {csv_only_empty}")

    # ── Step 5: Sort and write ──
    SEASON_ORDER = ["2020-21", "2021-22", "2022-23", "2023-24", "2024-25", "2025-26"]

    def sort_key(t):
        s = t.get("season", "")
        si = SEASON_ORDER.index(s) if s in SEASON_ORDER else 99
        d = t.get("date") or "9999-99-99"
        return (si, d)

    enriched_trades.sort(key=sort_key)

    # Print final summary
    print(f"\n{'='*60}")
    print("FINAL SUMMARY")
    print(f"{'='*60}")
    print(f"Total trades: {len(enriched_trades)}")

    by_season = defaultdict(int)
    with_date = 0
    confirmed = 0
    pick_only = 0
    player_count = 0
    multi_player = 0
    player_and_picks = 0

    for t in enriched_trades:
        by_season[t["season"]] += 1
        if t.get("date"):
            with_date += 1
        if t.get("fantrax_confirmed"):
            confirmed += 1

        give = t.get("give", [])
        get_items = t.get("get", [])
        gp = [x for x in give if not is_pick_excel(x)]
        rp = [x for x in get_items if not is_pick_excel(x)]
        gpk = [x for x in give if is_pick_excel(x)]
        rpk = [x for x in get_items if is_pick_excel(x)]
        tp = len(gp) + len(rp)
        tk = len(gpk) + len(rpk)
        if tp == 0:
            pick_only += 1
        elif tp >= 3:
            multi_player += 1
        if tp > 0 and tk > 0:
            player_and_picks += 1
        player_count += tp

    for s in sorted(by_season):
        print(f"  {s}: {by_season[s]} trades")
    print(f"\nTrades with dates: {with_date}")
    print(f"Fantrax confirmed: {confirmed}")
    print(f"Pick-only: {pick_only}")
    print(f"Multi-player (3+): {multi_player}")
    print(f"Players + picks combined: {player_and_picks}")
    print(f"Total player items: {player_count}")

    # Write
    with open(TRADES_PATH, "w") as f:
        json.dump(enriched_trades, f, indent=2)
    print(f"\nSaved to {TRADES_PATH}")

    # Audit log
    audit_path = ROOT / "scripts" / "audit_log.md"
    with open(audit_path, "a") as f:
        f.write(f"\n\n## load_trade_csvs.py (8A revised)\n")
        f.write(f"- Total trades: {len(enriched_trades)}\n")
        f.write(f"- Confirmed by CSV: {confirmed}\n")
        f.write(f"- Name corrections: {name_corrections}\n")
        f.write(f"- Dates added: {dates_added}\n")
        f.write(f"- CSV-only added: {csv_only_added}\n")
        f.write(f"- Duplicates removed: {duplicate_removed}\n")

    print(f"\n{'='*60}")
    print("DONE — trades.json enriched (Excel backbone + CSV names/dates)")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()

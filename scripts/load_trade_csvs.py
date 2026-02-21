#!/usr/bin/env python3
"""
load_trade_csvs.py — Load ALL Fantrax trade CSV files, reconcile against
Excel-sourced trades.json, and rebuild a complete trade dataset.

Hard rules:
  - players_given = ONLY from Fantrax CSV (never from Excel)
  - picks_given = ONLY from Excel/trades.json (never from Fantrax)
  - Both arrays populated if a side has both players + picks

Key insight: Fantrax CSVs bundle ALL transactions on the same date between the
same two teams into one "super-trade" row group. This means keeper-day transactions
(Oct 17/23/21/20) combine multiple distinct Excel trades into a single CSV grouping.
We handle this by allowing one CSV trade to match MULTIPLE Excel trades between the
same owners in the same season.

Sections:
  1. Load all CSV files, group rows into trades
  2. Reconcile CSV trades against existing trades.json
  3. Write final merged trades.json

Usage:
    python3 scripts/load_trade_csvs.py
"""

import csv
import json
import re
import unicodedata
from collections import defaultdict
from datetime import datetime, timedelta
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

# Excel abbreviation → canonical owner (for parsing existing trades.json)
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
    try:
        dt = datetime.strptime(date_str.strip(), "%a %b %d, %Y, %I:%M%p")
    except ValueError:
        try:
            dt = datetime.strptime(date_str.strip(), "%a %b %d, %Y, %I:%M %p")
        except ValueError:
            return None
    if dt.month >= 7:
        return f"{dt.year}-{str(dt.year + 1)[-2:]}"
    else:
        return f"{dt.year - 1}-{str(dt.year)[-2:]}"


def parse_date(date_str):
    """Parse Fantrax date to ISO format."""
    try:
        dt = datetime.strptime(date_str.strip(), "%a %b %d, %Y, %I:%M%p")
        return dt.strftime("%Y-%m-%d"), dt
    except ValueError:
        try:
            dt = datetime.strptime(date_str.strip(), "%a %b %d, %Y, %I:%M %p")
            return dt.strftime("%Y-%m-%d"), dt
        except ValueError:
            return None, None


def normalize(name):
    """Normalize player name for matching."""
    nfkd = unicodedata.normalize("NFD", name)
    clean = "".join(c for c in nfkd if unicodedata.category(c) != "Mn").lower().strip()
    clean = clean.replace("\u2019", "'").replace("\u2018", "'")
    clean = clean.replace(".", "").replace("'", "")
    for suffix in [" jr", " iii", " ii", " iv", " sr"]:
        if clean.endswith(suffix):
            clean = clean[: -len(suffix)]
    return clean.strip()


def clean_player_name(raw):
    """Clean a player name from CSV — strip HTML tags."""
    name = raw.strip()
    name = re.sub(r'<[^>]+>', '', name)
    return name.strip()


def is_pick_row(player_text):
    """Check if this CSV row is a draft pick."""
    return "Draft Pick" in player_text


def is_pick_excel(item):
    """Check if a trades.json item is a pick."""
    lower = item.lower()
    parts = lower.split(" ", 1)
    if len(parts) > 1 and parts[0].upper() in ABBREV_TO_OWNER:
        asset = parts[1]
    else:
        asset = lower
    return bool(re.search(r"(round|\d{4}\s+(1st|2nd)|right to swap|swap rights|frp|srp)", asset))


def fuzzy_match_name(name_a, name_b, threshold=0.80):
    """Check if two player names fuzzy-match."""
    na = normalize(name_a)
    nb = normalize(name_b)
    if na == nb:
        return True
    return SequenceMatcher(None, na, nb).ratio() >= threshold


def get_abbrev_for_owner(owner):
    """Get the primary abbreviation for an owner."""
    primary = {
        "Baden": "BADEN", "Berke": "BERK", "Delaney": "DELA",
        "Gold": "GOLD", "Green": "GREEN", "HaleTrager": "TRAG",
        "Jowkar": "JOWK", "Moss": "MOSS", "Peterson": "PETE",
        "Zujewski": "ZJEW",
    }
    return primary.get(owner, "UNKN")


# ── SECTION 1: Load CSV files ────────────────────────────────────────────
def load_all_csvs():
    """Load all Fantrax trade CSV files, group into trades."""
    csv_files = sorted(INFO.glob("Fantrax-Transaction-History-Trades*.csv"))

    if not csv_files:
        print("ERROR: No CSV files found!")
        return []

    all_trades = []

    for csv_file in csv_files:
        print(f"\n{'='*60}")
        print(f"FILE: {csv_file.name}")
        print(f"{'='*60}")

        with open(csv_file) as f:
            reader = csv.DictReader(f)
            rows = list(reader)

        print(f"Rows: {len(rows)}")
        print(f"Columns: {list(rows[0].keys()) if rows else 'N/A'}")

        seasons = set()
        for r in rows:
            s = date_to_season(r["Date (EST)"])
            if s:
                seasons.add(s)
        print(f"Seasons detected: {sorted(seasons)}")

        players = sum(1 for r in rows if not is_pick_row(r["Player"]))
        picks = sum(1 for r in rows if is_pick_row(r["Player"]))
        print(f"Player rows: {players}, Pick rows: {picks}")

        # Group rows into trades: same date + same two teams = same trade
        trade_groups = defaultdict(list)
        for r in rows:
            key = (r["Date (EST)"], tuple(sorted([r["From"], r["To"]])))
            trade_groups[key].append(r)

        print(f"Unique trade groups: {len(trade_groups)}")

        # Parse each trade group
        for (date_str, teams_key), trade_rows in trade_groups.items():
            iso_date, dt = parse_date(date_str)
            season = date_to_season(date_str)

            team_a = trade_rows[0]["From"]
            team_b = trade_rows[0]["To"]

            side_a_gave_players = []
            side_a_gave_picks = []
            side_b_gave_players = []
            side_b_gave_picks = []

            for r in trade_rows:
                player = clean_player_name(r["Player"])
                from_team = r["From"]

                if is_pick_row(r["Player"]):
                    pick_text = r["Player"].strip()
                    if from_team == team_a:
                        side_a_gave_picks.append(pick_text)
                    else:
                        side_b_gave_picks.append(pick_text)
                else:
                    if from_team == team_a:
                        side_a_gave_players.append(player)
                    else:
                        side_b_gave_players.append(player)

            owner_a = TEAM_TO_OWNER.get(team_a, team_a)
            owner_b = TEAM_TO_OWNER.get(team_b, team_b)

            trade = {
                "csv_file": csv_file.name,
                "date": iso_date,
                "date_raw": date_str,
                "season": season,
                "team_a": team_a,
                "team_b": team_b,
                "owner_a": owner_a,
                "owner_b": owner_b,
                "side_a_players": side_a_gave_players,
                "side_a_picks": side_a_gave_picks,
                "side_b_players": side_b_gave_players,
                "side_b_picks": side_b_gave_picks,
            }
            all_trades.append(trade)

        # Print sample trades
        print(f"\n--- Sample trades from {csv_file.name} ---")
        file_trades = [t for t in all_trades if t["csv_file"] == csv_file.name]
        for t in file_trades[:5]:
            total = len(t["side_a_players"]) + len(t["side_b_players"]) + \
                    len(t["side_a_picks"]) + len(t["side_b_picks"])
            print(f"\n  Date: {t['date']} | {t['owner_a']} ↔ {t['owner_b']} ({total} items)")
            if t["side_a_players"] or t["side_a_picks"]:
                print(f"    {t['owner_a']} gave: {t['side_a_players'][:3]}"
                      f"{' + picks' if t['side_a_picks'] else ''}")
            if t["side_b_players"] or t["side_b_picks"]:
                print(f"    {t['owner_b']} gave: {t['side_b_players'][:3]}"
                      f"{' + picks' if t['side_b_picks'] else ''}")

    print(f"\n{'='*60}")
    print(f"TOTAL CSV TRADE GROUPS LOADED: {len(all_trades)}")
    print(f"{'='*60}")

    return all_trades


# ── SECTION 2: Parse existing trades.json ─────────────────────────────────
def parse_existing_trades():
    """Parse existing trades.json into structured format for matching."""
    with open(TRADES_PATH) as f:
        trades = json.load(f)

    parsed = []
    for i, t in enumerate(trades):
        season = t.get("season", "")
        date = t.get("date")

        give_items = t.get("give", [])
        get_items = t.get("get", [])

        side_a_owner = None
        side_b_owner = None
        for item in give_items:
            parts = item.split(" ", 1)
            if len(parts) >= 2:
                o = ABBREV_TO_OWNER.get(parts[0].upper())
                if o:
                    side_a_owner = o
                    break
        for item in get_items:
            parts = item.split(" ", 1)
            if len(parts) >= 2:
                o = ABBREV_TO_OWNER.get(parts[0].upper())
                if o:
                    side_b_owner = o
                    break

        def extract_players(items):
            players = []
            for item in items:
                parts = item.split(" ", 1)
                if len(parts) < 2:
                    continue
                if not is_pick_excel(item):
                    players.append(parts[1].strip())
            return players

        def extract_picks(items):
            picks = []
            for item in items:
                if is_pick_excel(item):
                    picks.append(item)
            return picks

        give_players = extract_players(give_items)
        give_picks = extract_picks(give_items)
        get_players = extract_players(get_items)
        get_picks = extract_picks(get_items)

        parsed.append({
            "index": i,
            "season": season,
            "date": date,
            "owner_a": side_a_owner or "Unknown",
            "owner_b": side_b_owner or "Unknown",
            "give_players": give_players,
            "give_picks": give_picks,
            "get_players": get_players,
            "get_picks": get_picks,
            "raw": t,
        })

    return parsed


# ── SECTION 2: Reconcile ─────────────────────────────────────────────────
def reconcile(csv_trades, excel_trades):
    """
    Match CSV trades to Excel trades. Key insight: one CSV trade group (especially
    on keeper day) can contain players from MULTIPLE Excel trades between the same
    two owners. So we allow many-to-one matching (many Excel → one CSV group).
    """
    # matched: list of (csv_idx, excel_idx, match_info)
    matched = []
    excel_unmatched = set(range(len(excel_trades)))
    csv_used_for = defaultdict(list)  # csv_idx → [excel_idxs]

    # For each Excel trade, find the CSV trade that contains its players
    for ei, et in enumerate(excel_trades):
        excel_all_players = et["give_players"] + et["get_players"]

        # Skip pick-only Excel trades (no players to match against CSV)
        if not excel_all_players:
            continue

        best_csv = None
        best_overlap = 0

        for ci, ct in enumerate(csv_trades):
            # Must be same season
            if ct["season"] != et["season"]:
                continue

            # Must have same two owners
            csv_owners = {ct["owner_a"], ct["owner_b"]}
            excel_owners = {et["owner_a"], et["owner_b"]}
            if csv_owners != excel_owners:
                continue

            csv_all_players = ct["side_a_players"] + ct["side_b_players"]
            if not csv_all_players:
                continue

            # Count how many Excel players appear in this CSV trade
            overlap = 0
            for ep in excel_all_players:
                for cp in csv_all_players:
                    if fuzzy_match_name(ep, cp):
                        overlap += 1
                        break

            if overlap > best_overlap:
                best_overlap = overlap
                best_csv = ci

        if best_csv is not None and best_overlap > 0:
            matched.append((best_csv, ei, f"{best_overlap}/{len(excel_all_players)} players"))
            csv_used_for[best_csv].append(ei)
            excel_unmatched.discard(ei)

    # Find CSV trades that didn't match ANY Excel trade
    csv_unmatched = set()
    for ci in range(len(csv_trades)):
        if ci not in csv_used_for:
            csv_unmatched.add(ci)

    return matched, csv_unmatched, excel_unmatched, csv_used_for


def main():
    print("=" * 60)
    print("LOAD TRADE CSVS — Complete Trade Dataset Builder")
    print("=" * 60)

    # ── Section 1: Load CSVs ──
    csv_trades = load_all_csvs()

    # ── Section 2: Parse existing trades.json and reconcile ──
    print(f"\n\n{'='*60}")
    print("RECONCILIATION: CSV vs trades.json")
    print(f"{'='*60}")

    excel_trades = parse_existing_trades()
    print(f"\nExcel trades.json: {len(excel_trades)} trades")
    print(f"CSV trade groups: {len(csv_trades)}")

    csv_seasons = set(t["season"] for t in csv_trades if t.get("season"))
    print(f"CSV covers seasons: {sorted(csv_seasons)}")

    excel_in_scope = [t for t in excel_trades if t["season"] in csv_seasons]
    excel_out_of_scope = [t for t in excel_trades if t["season"] not in csv_seasons]
    print(f"Excel trades in CSV-covered seasons: {len(excel_in_scope)}")
    print(f"Excel trades in earlier seasons (no CSV): {len(excel_out_of_scope)}")

    matched, csv_unmatched_idx, excel_unmatched_idx, csv_used_for = \
        reconcile(csv_trades, excel_in_scope)

    # Print reconciliation summary
    unique_excel_matched = len(set(ei for _, ei, _ in matched))
    unique_csv_matched = len(csv_used_for)
    print(f"\n--- Reconciliation Summary ---")
    print(f"Excel trades matched: {unique_excel_matched}")
    print(f"CSV groups used: {unique_csv_matched}")
    print(f"CSV groups with multiple Excel matches: "
          f"{sum(1 for v in csv_used_for.values() if len(v) > 1)}")
    print(f"CSV-only (no Excel match): {len(csv_unmatched_idx)}")
    print(f"Excel-only (no CSV match): {len(excel_unmatched_idx)}")

    # Show multi-match CSV groups
    print(f"\n--- CSV groups matching multiple Excel trades ---")
    for ci, excel_idxs in sorted(csv_used_for.items()):
        if len(excel_idxs) > 1:
            ct = csv_trades[ci]
            print(f"\n  CSV: {ct['date']} {ct['owner_a']} ↔ {ct['owner_b']} "
                  f"({len(ct['side_a_players'])+len(ct['side_b_players'])} players)")
            for ei in excel_idxs:
                et = excel_in_scope[ei]
                print(f"    Excel #{et['index']}: give={et['raw']['give'][:2]}, "
                      f"get={et['raw']['get'][:2]}")

    # Break down by season
    for season in sorted(csv_seasons):
        csv_s = [i for i, t in enumerate(csv_trades) if t["season"] == season]
        matched_excel_in_s = [ei for _, ei, _ in matched if excel_in_scope[ei]["season"] == season]
        unmatched_csv_in_s = [i for i in csv_unmatched_idx if csv_trades[i]["season"] == season]
        unmatched_excel_in_s = [i for i in excel_unmatched_idx
                                if excel_in_scope[i]["season"] == season]

        print(f"\n  Season {season}:")
        print(f"    CSV groups: {len(csv_s)}")
        print(f"    Excel trades matched: {len(matched_excel_in_s)}")
        print(f"    CSV-only groups: {len(unmatched_csv_in_s)}")
        if unmatched_csv_in_s:
            for i in unmatched_csv_in_s:
                t = csv_trades[i]
                total_players = len(t["side_a_players"]) + len(t["side_b_players"])
                total_picks = len(t["side_a_picks"]) + len(t["side_b_picks"])
                if total_players > 0 or total_picks > 0:
                    print(f"      → {t['date']} {t['owner_a']} ↔ {t['owner_b']}: "
                          f"{total_players} players, {total_picks} picks")
                    if t["side_a_players"]:
                        print(f"        A gave: {t['side_a_players'][:4]}")
                    if t["side_b_players"]:
                        print(f"        B gave: {t['side_b_players'][:4]}")
                else:
                    print(f"      → {t['date']} {t['owner_a']} ↔ {t['owner_b']}: "
                          f"[pick-only swap, 0 players]")
        print(f"    Excel-only: {len(unmatched_excel_in_s)}")
        if unmatched_excel_in_s:
            for i in unmatched_excel_in_s:
                t = excel_in_scope[i]
                pick_only = not t["give_players"] and not t["get_players"]
                print(f"      → {t['date'] or 'no-date'} {t['owner_a']} ↔ {t['owner_b']}: "
                      f"give={t['raw']['give'][:2]}, get={t['raw']['get'][:2]}"
                      f" {'[pick-only]' if pick_only else ''}")

    # Multi-player trade analysis
    print(f"\n--- Multi-player Trade Completeness ---")
    # For each matched Excel trade, compare player counts
    improved_count = 0
    improved_details = []
    for ci, ei, reason in matched:
        ct = csv_trades[ci]
        et = excel_in_scope[ei]

        csv_all = ct["side_a_players"] + ct["side_b_players"]
        excel_all = et["give_players"] + et["get_players"]

        # Players in CSV but not in Excel (for THIS specific Excel trade's context)
        # We need to be careful: the CSV group might serve multiple Excel trades
        # So we just note if the CSV has MORE players total
        new_for_this = []
        for cp in csv_all:
            found_in_excel = False
            for ep in excel_all:
                if fuzzy_match_name(cp, ep):
                    found_in_excel = True
                    break
            if not found_in_excel:
                new_for_this.append(cp)

        if new_for_this:
            improved_count += 1
            improved_details.append((ct, et, new_for_this))

    print(f"Matched trades where CSV has additional players: {improved_count}")
    for ct, et, new_players in improved_details[:10]:
        print(f"  {ct['date']} {ct['owner_a']} ↔ {ct['owner_b']}: "
              f"+{len(new_players)} → {new_players[:4]}")

    # ── Section 3: Rebuild trades.json ──
    print(f"\n\n{'='*60}")
    print("REBUILDING trades.json")
    print(f"{'='*60}")

    final_trades = []

    # 1. Keep all out-of-scope Excel trades (2020-21, 2021-22) as-is
    for et in excel_out_of_scope:
        final_trades.append(et["raw"])

    # 2. For each matched Excel trade: use CSV players + Excel picks
    # The Excel trade structure stays as the "unit" — one Excel trade = one output trade.
    # But we REPLACE the player names from CSV and keep picks from Excel.
    processed_excel = set()

    for ci, ei, reason in matched:
        if ei in processed_excel:
            continue
        processed_excel.add(ei)

        ct = csv_trades[ci]
        et = excel_in_scope[ei]

        # Determine side alignment between CSV and Excel
        # The CSV has owner_a giving side_a_players and owner_b giving side_b_players
        # The Excel has owner_a's items in 'give' and owner_b's items in 'get'
        # We need to figure out which CSV side corresponds to which Excel side.

        csv_owner_a = ct["owner_a"]
        csv_owner_b = ct["owner_b"]
        excel_owner_a = et["owner_a"]

        # Figure out which CSV players correspond to the Excel give side
        if csv_owner_a == excel_owner_a:
            # CSV side_a = Excel give (owner_a gave)
            csv_give_players = ct["side_a_players"]
            csv_get_players = ct["side_b_players"]
        else:
            # CSV side_b = Excel give (owner_a gave)
            csv_give_players = ct["side_b_players"]
            csv_get_players = ct["side_a_players"]

        # For multi-match CSV groups, we need to identify which CSV players
        # belong to THIS specific Excel trade
        # Strategy: match Excel players to CSV players, then check for extras

        # Match Excel give players to CSV give players
        excel_give_matched = set()
        csv_give_used = set()
        for ep_idx, ep in enumerate(et["give_players"]):
            for cp_idx, cp in enumerate(csv_give_players):
                if cp_idx not in csv_give_used and fuzzy_match_name(ep, cp):
                    excel_give_matched.add(ep_idx)
                    csv_give_used.add(cp_idx)
                    break

        # Match Excel get players to CSV get players
        excel_get_matched = set()
        csv_get_used = set()
        for ep_idx, ep in enumerate(et["get_players"]):
            for cp_idx, cp in enumerate(csv_get_players):
                if cp_idx not in csv_get_used and fuzzy_match_name(ep, cp):
                    excel_get_matched.add(ep_idx)
                    csv_get_used.add(cp_idx)
                    break

        # If this CSV group serves multiple Excel trades, only assign
        # the MATCHED players plus any extras that aren't claimed by other Excel trades
        other_excel_idxs = [oei for oei in csv_used_for[ci] if oei != ei]

        # Collect all players claimed by other Excel trades in this CSV group
        other_claimed_give = set()
        other_claimed_get = set()
        for oei in other_excel_idxs:
            oet = excel_in_scope[oei]
            other_give_align = oet["give_players"] if csv_owner_a == oet["owner_a"] else oet["get_players"]
            other_get_align = oet["get_players"] if csv_owner_a == oet["owner_a"] else oet["give_players"]
            for op in other_give_align:
                for cp_idx, cp in enumerate(csv_give_players):
                    if fuzzy_match_name(op, cp):
                        other_claimed_give.add(cp_idx)
                        break
            for op in other_get_align:
                for cp_idx, cp in enumerate(csv_get_players):
                    if fuzzy_match_name(op, cp):
                        other_claimed_get.add(cp_idx)
                        break

        # Build final player lists for this trade:
        # Include matched players (from CSV names) + unclaimed extras
        final_give_players = []
        for cp_idx, cp in enumerate(csv_give_players):
            if cp_idx in csv_give_used:
                final_give_players.append(cp)  # Matched to this Excel trade
            elif cp_idx not in other_claimed_give and len(other_excel_idxs) == 0:
                # Extra player only if no other Excel trades claim from this CSV
                final_give_players.append(cp)

        final_get_players = []
        for cp_idx, cp in enumerate(csv_get_players):
            if cp_idx in csv_get_used:
                final_get_players.append(cp)
            elif cp_idx not in other_claimed_get and len(other_excel_idxs) == 0:
                final_get_players.append(cp)

        # If this is the only Excel trade for this CSV group, include ALL CSV players
        if len(csv_used_for[ci]) == 1:
            final_give_players = list(csv_give_players)
            final_get_players = list(csv_get_players)

        # Build output trade
        abbrev_a = get_abbrev_for_owner(et["owner_a"])
        abbrev_b = get_abbrev_for_owner(et["owner_b"])

        give = [f"{abbrev_a} {p}" for p in final_give_players] + et["give_picks"]
        get = [f"{abbrev_b} {p}" for p in final_get_players] + et["get_picks"]

        trade_entry = {
            "season": et["season"],
            "date": ct["date"],  # CSV date (more reliable, always present)
            "give": give,
            "get": get,
            "fantrax_confirmed": True,
            "sources": {"players": "fantrax_csv", "picks": "excel"},
        }
        final_trades.append(trade_entry)

    # 3. Excel-only unmatched trades — keep as-is
    for ei in sorted(excel_unmatched_idx):
        et = excel_in_scope[ei]
        entry = dict(et["raw"])
        pick_only = not et["give_players"] and not et["get_players"]
        if pick_only:
            entry["source"] = "excel_only_picks"
        else:
            entry["source"] = "excel_only"
            entry["needs_review"] = True
        final_trades.append(entry)

    # 4. CSV-only trades (missing from Excel) — add as new
    # But filter out empty pick-only swap entries (keeper day placeholders)
    csv_only_count = 0
    csv_only_empty = 0
    for ci in sorted(csv_unmatched_idx):
        ct = csv_trades[ci]
        total_players = len(ct["side_a_players"]) + len(ct["side_b_players"])
        total_picks = len(ct["side_a_picks"]) + len(ct["side_b_picks"])

        if total_players == 0 and total_picks == 0:
            csv_only_empty += 1
            continue  # Skip empty keeper-day placeholder swaps

        abbrev_a = get_abbrev_for_owner(ct["owner_a"])
        abbrev_b = get_abbrev_for_owner(ct["owner_b"])

        give = [f"{abbrev_a} {p}" for p in ct["side_a_players"]]
        get = [f"{abbrev_b} {p}" for p in ct["side_b_players"]]

        trade_entry = {
            "season": ct["season"],
            "date": ct["date"],
            "give": give,
            "get": get,
            "source": "fantrax_csv_only",
            "picks_unknown": True,
            "fantrax_confirmed": True,
        }
        final_trades.append(trade_entry)
        csv_only_count += 1

    # Sort by season, then date
    SEASON_ORDER = ["2020-21", "2021-22", "2022-23", "2023-24", "2024-25", "2025-26"]

    def sort_key(t):
        s = t.get("season", "")
        si = SEASON_ORDER.index(s) if s in SEASON_ORDER else 99
        d = t.get("date") or "9999-99-99"
        return (si, d)

    final_trades.sort(key=sort_key)

    # Print final counts
    print(f"\n--- Final Trade Counts ---")
    print(f"Total trades: {len(final_trades)}")

    one_player = 0
    multi_player = 0
    player_and_picks = 0
    pick_only_count = 0
    csv_source = 0
    excel_source = 0

    for t in final_trades:
        give = t.get("give", [])
        get_items = t.get("get", [])

        give_players = [i for i in give if not is_pick_excel(i)]
        give_picks = [i for i in give if is_pick_excel(i)]
        get_players = [i for i in get_items if not is_pick_excel(i)]
        get_picks = [i for i in get_items if is_pick_excel(i)]

        total_players = len(give_players) + len(get_players)
        total_picks = len(give_picks) + len(get_picks)

        if total_players == 0:
            pick_only_count += 1
        elif total_players == 2:
            one_player += 1
        elif total_players >= 3:
            multi_player += 1

        if total_players > 0 and total_picks > 0:
            player_and_picks += 1

        if t.get("fantrax_confirmed"):
            csv_source += 1
        else:
            excel_source += 1

    print(f"Trades with 1 player per side: {one_player}")
    print(f"Trades with 2+ players on at least one side: {multi_player}")
    print(f"Trades with picks + players combined: {player_and_picks}")
    print(f"Pick-only trades: {pick_only_count}")
    print(f"Fantrax CSV confirmed: {csv_source}")
    print(f"Excel-only sourced: {excel_source}")
    print(f"CSV-only new trades: {csv_only_count}")
    print(f"Empty CSV groups skipped: {csv_only_empty}")

    # Check for needs_review
    needs_review = [t for t in final_trades if t.get("needs_review")]
    if needs_review:
        print(f"\n⚠ Trades needing review: {len(needs_review)}")
        for t in needs_review:
            print(f"  → {t.get('season')} {t.get('give',[])} ↔ {t.get('get',[])}")
    else:
        print(f"\nNo trades flagged for review.")

    # Write
    with open(TRADES_PATH, "w") as f:
        json.dump(final_trades, f, indent=2)
    print(f"\nSaved to {TRADES_PATH}")

    # Audit log
    audit_path = ROOT / "scripts" / "audit_log.md"
    with open(audit_path, "a") as f:
        f.write(f"\n\n## load_trade_csvs.py (8A)\n")
        f.write(f"- Total trades: {len(final_trades)}\n")
        f.write(f"- Excel trades matched: {unique_excel_matched}\n")
        f.write(f"- CSV-only new: {csv_only_count}\n")
        f.write(f"- Excel-only: {len(excel_unmatched_idx)}\n")
        f.write(f"- Empty CSV groups skipped: {csv_only_empty}\n")
        f.write(f"- Multi-player improved: {improved_count}\n")

    print(f"\n{'='*60}")
    print("DONE — trades.json rebuilt with complete CSV player data")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()

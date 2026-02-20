"""
audit_owners.py — Owner + Team Mapping Audit
=============================================

Scans all JSON files in docs/data/ for:
1. Team names not in TEAM_TO_OWNER map
2. Raw abbreviations appearing as owner names
3. Owner name inconsistencies

Usage:
    python scripts/audit_owners.py

Output: scripts/mapping_audit.md
"""

import json
import os
import re
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
DOCS_DATA = PROJECT_ROOT / "docs" / "data"

# Canonical owner keys
CANONICAL_OWNERS = {
    'Baden', 'Berke', 'Delaney', 'Gold', 'Green',
    'HaleTrager', 'Jowkar', 'Moss', 'Peterson', 'Zujewski',
}

# All known team names -> owner
TEAM_TO_OWNER = {
    'Always Droppin Dimes': 'Peterson',
    "Ball Don't Lie": 'Jowkar',
    'BKs Whoppers': 'Baden',
    'Burner account': 'Berke',
    'Charlotte Wobnets': 'Baden',
    'Flaming Flaggs': 'Baden',
    'Freshly Washed Kings': 'Delaney',
    'Giddey Up': 'Gold',
    'Ice Trae': 'Green',
    'Kelvin got No Dimes': 'Berke',
    'Kentucky Fried Guards': 'Gold',
    'Lob Land': 'HaleTrager',
    'No Shaime': 'Gold',
    'Only Franz': 'Zujewski',
    'Pure Sweat Farm': 'Moss',
    'Pure Sweat Fam': 'Moss',
    'Twin Towers': 'HaleTrager',
}

# Known abbreviations that should resolve to canonical owners
KNOWN_ABBREVS = {
    'TRAG', 'HALE', 'JOWK', 'DELA', 'GREEN', 'BERK', 'PETE', 'DIME',
    'MOSS', 'ZJEW', 'GOLD', 'KELL', 'VLAND', 'BADEN', 'FLAGGS',
}

violations = []
warnings = []


def check_json_file(filepath: Path):
    """Scan a JSON file for mapping violations."""
    try:
        with open(filepath, encoding='utf-8') as f:
            data = json.load(f)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return

    rel_path = filepath.relative_to(PROJECT_ROOT)
    scan_value(data, str(rel_path), [])


def scan_value(obj, filepath, path):
    """Recursively scan JSON values for team names and owner references."""
    if isinstance(obj, dict):
        for key, val in obj.items():
            # Check if key is "team" or "team_name" and value is a string
            if key in ('team', 'team_name', 'teamName') and isinstance(val, str):
                if val and val not in TEAM_TO_OWNER and val != '—':
                    violations.append(f"  [{filepath}] Unknown team name: '{val}' at {'.'.join(path + [key])}")

            # Check if key is "owner" and value is not canonical
            if key == 'owner' and isinstance(val, str):
                if val and val not in CANONICAL_OWNERS and val not in TEAM_TO_OWNER:
                    # Check if it looks like a display name (e.g., "Sam Baden")
                    if not any(c in val for c in CANONICAL_OWNERS):
                        warnings.append(f"  [{filepath}] Non-canonical owner: '{val}' at {'.'.join(path + [key])}")

            scan_value(val, filepath, path + [key])

    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            scan_value(item, filepath, path + [str(i)])

    elif isinstance(obj, str):
        # Check for raw abbreviations appearing as values in owner-related contexts
        stripped = obj.strip()
        if stripped in KNOWN_ABBREVS and len(path) > 0:
            parent_key = path[-1] if path else ''
            if parent_key in ('owner', 'team', 'team_name'):
                violations.append(f"  [{filepath}] Raw abbreviation '{stripped}' used as {parent_key} at {'.'.join(path)}")


def check_trades_owners():
    """Check that trade give/get arrays use resolvable owner refs."""
    trades_path = DOCS_DATA / "trades.json"
    if not trades_path.exists():
        return

    with open(trades_path) as f:
        trades = json.load(f)

    if not isinstance(trades, list):
        trades = trades.get('trades', [])

    # Trade format: each item in give/get is "ABBREV [Pos] Player Name"
    unknown_abbrevs = set()
    all_abbrevs = set()

    for i, trade in enumerate(trades):
        for side in ['give', 'get']:
            for item in trade.get(side, []):
                parts = item.strip().split()
                if parts:
                    abbrev = parts[0]
                    all_abbrevs.add(abbrev)
                    # Check if it resolves
                    if abbrev not in KNOWN_ABBREVS and abbrev not in CANONICAL_OWNERS:
                        # It might be a position or round
                        if not re.match(r'^(1st|2nd|PG|SG|SF|PF|C|PG/SG|SG/SF|SF/PF|PF/C)$', abbrev):
                            unknown_abbrevs.add(abbrev)

    if unknown_abbrevs:
        for a in sorted(unknown_abbrevs):
            violations.append(f"  [trades.json] Unknown abbreviation in trade data: '{a}'")


def main():
    print("Running owner mapping audit...")
    print()

    # Scan all JSON files in docs/data/
    json_files = sorted(DOCS_DATA.glob("*.json"))
    for filepath in json_files:
        if filepath.name.startswith('.'):
            continue
        check_json_file(filepath)

    # Check trades specifically
    check_trades_owners()

    # Generate report
    report = ["# Owner Mapping Audit Report\n"]
    report.append(f"Files scanned: {len(json_files)}")
    report.append(f"Violations: {len(violations)}")
    report.append(f"Warnings: {len(warnings)}")
    report.append("")

    if violations:
        report.append("## Violations")
        for v in violations:
            report.append(v)
        report.append("")

    if warnings:
        report.append("## Warnings")
        for w in warnings:
            report.append(w)
        report.append("")

    if not violations and not warnings:
        report.append("## Result: CLEAN")
        report.append("No mapping violations or warnings found.")
        report.append("")

    report.append("## Canonical Owners")
    for owner in sorted(CANONICAL_OWNERS):
        teams = [t for t, o in TEAM_TO_OWNER.items() if o == owner]
        report.append(f"  {owner}: {', '.join(sorted(teams))}")

    report_text = "\n".join(report) + "\n"

    # Write report
    report_path = SCRIPT_DIR / "mapping_audit.md"
    with open(report_path, "w") as f:
        f.write(report_text)

    print(report_text)
    print(f"\nReport saved to {report_path}")


if __name__ == "__main__":
    main()

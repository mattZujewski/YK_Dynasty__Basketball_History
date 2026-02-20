"""
Fantrax YK Dynasty Basketball — Roster & Standings Fetcher
==========================================================

Fetches roster data from Fantrax for the YK Dynasty Basketball league.
Outputs JSON to docs/data/ for use by the static site.

Usage:
    python scripts/fantrax_yk.py
    python scripts/fantrax_yk.py --season 2025-26
    python scripts/fantrax_yk.py --all-seasons

Auth:
    Copy scripts/config.yaml.example to scripts/config.yaml and fill in
    JSESSIONID + FX_RM cookies from Chrome DevTools -> Application -> Cookies.
    config.yaml is gitignored.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests

try:
    import yaml
    HAS_YAML = True
except ImportError:
    HAS_YAML = False

# =============================================================================
# CONSTANTS
# =============================================================================

BASE_URL = "https://www.fantrax.com/fxea/general"
INTERNAL_API_URL = "https://www.fantrax.com/fxpa/req"

# YK Dynasty league IDs by season
LEAGUE_IDS = {
    "2022-23": "onh4f1waliy86zii",
    "2023-24": "h2dbi0ocliy86zii",
    "2024-25": "7bfjhrbxlmancf4t",
    "2025-26": "sz7vm5xwmancf4tr",
}

# Owner mapping: Fantrax username → canonical owner key
FANTRAX_TO_OWNER = {
    "kpcrispy3":    "Peterson",
    "NickJowkar":   "Jowkar",
    "lbtape":       "Berke",
    "BadenBaden":   "Baden",
    "Daviddjd16":   "Delaney",
    "maxgreen9":    "Green",
    "sgold58":      "Gold",
    "MattZujewski": "Zujewski",
    "mmoss11":      "Moss",
    "HaleTrager":   "HaleTrager",
}

# Owner display names
OWNER_DISPLAY = {
    "Baden":       "Sam Baden",
    "Berke":       "Logan Berke",
    "Delaney":     "David Delaney",
    "Gold":        "Sam Gold",
    "Green":       "Max Green",
    "HaleTrager":  "Ryan HaleTrager",
    "Jowkar":      "Nick Jowkar",
    "Moss":        "Max Moss",
    "Peterson":    "Kelvin Peterson",
    "Zujewski":    "Matthew Zujewski",
}

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
DOCS_DATA = PROJECT_ROOT / "docs" / "data"

# =============================================================================
# LOGGING
# =============================================================================

log = logging.getLogger("fantrax_yk")


def setup_logging(verbose: bool = False):
    log.setLevel(logging.DEBUG)
    log.handlers.clear()
    fmt = logging.Formatter("%(asctime)s | %(levelname)-7s | %(message)s")
    ch = logging.StreamHandler(sys.stdout)
    ch.setLevel(logging.DEBUG if verbose else logging.INFO)
    ch.setFormatter(fmt)
    log.addHandler(ch)


# =============================================================================
# CONFIG
# =============================================================================

def load_config(config_path: Path, args: argparse.Namespace) -> Dict:
    cfg = {}
    if config_path.exists():
        if HAS_YAML and config_path.suffix in ('.yaml', '.yml'):
            with open(config_path) as f:
                cfg = yaml.safe_load(f) or {}
        elif config_path.suffix == '.json':
            with open(config_path) as f:
                cfg = json.load(f)
        log.info(f"Loaded config from {config_path}")
    else:
        log.warning(f"Config file not found: {config_path}. Using CLI args / env vars only.")

    return {
        "jsessionid": args.jsessionid or cfg.get("jsessionid") or os.getenv("FANTRAX_JSESSIONID", ""),
        "fx_rm": args.fx_rm or cfg.get("fx_rm") or os.getenv("FANTRAX_FX_RM", ""),
        "current_league_id": cfg.get("current_league_id", LEAGUE_IDS.get("2025-26", "")),
        "request_delay": cfg.get("request_delay", 0.5),
    }


# =============================================================================
# API CLIENT
# =============================================================================

class FantraxAPI:
    """Minimal Fantrax API client for roster fetching."""

    def __init__(self, config: Dict):
        self.config = config
        self.session = requests.Session()
        self.request_count = 0

    def _headers(self, league_id: str) -> Dict[str, str]:
        return {
            "accept": "application/json, text/plain, */*",
            "content-type": "text/plain",
            "origin": "https://www.fantrax.com",
            "referer": f"https://www.fantrax.com/fantasy/league/{league_id}/team/roster",
            "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        }

    def _cookies(self) -> Dict[str, str]:
        cookies = {}
        if self.config["jsessionid"]:
            cookies["JSESSIONID"] = self.config["jsessionid"]
        if self.config["fx_rm"]:
            cookies["FX_RM"] = self.config["fx_rm"]
        return cookies

    def _sleep(self):
        delay = self.config.get("request_delay", 0.5)
        if delay > 0:
            time.sleep(delay)

    def public_request(self, endpoint: str, params: Dict) -> Dict:
        """GET request to public /fxea API."""
        url = f"{BASE_URL}/{endpoint}"
        self.request_count += 1
        log.debug(f"Request #{self.request_count}: GET {endpoint} params={params}")

        resp = self.session.get(url, params=params, timeout=30)
        resp.raise_for_status()
        self._sleep()
        return resp.json()

    def internal_request(self, league_id: str, msgs: List[Dict]) -> Dict:
        """POST request to internal /fxpa API."""
        url = f"{INTERNAL_API_URL}?leagueId={league_id}"
        payload = {
            "uiv": 3,
            "refUrl": f"https://www.fantrax.com/fantasy/league/{league_id}/home",
            "dt": 2,
            "at": 0,
            "av": "0.0",
            "tz": "America/New_York",
            "v": "182.0.1",
            "msgs": msgs,
        }

        self.request_count += 1
        method = msgs[0].get("method", "unknown") if msgs else "unknown"
        log.debug(f"Request #{self.request_count}: POST {method}")

        resp = self.session.post(
            url,
            headers=self._headers(league_id),
            cookies=self._cookies(),
            json=payload,
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()

        # Check for auth errors
        self._check_auth(data, method)
        self._sleep()
        return data

    def _check_auth(self, data: Dict, context: str):
        """Check for NOT_LOGGED_IN error."""
        def has_auth_error(obj):
            if isinstance(obj, dict):
                if obj.get("pageError", {}).get("code") == "WARNING_NOT_LOGGED_IN":
                    return True
                return any(has_auth_error(v) for v in obj.values())
            elif isinstance(obj, list):
                return any(has_auth_error(x) for x in obj)
            return False

        if has_auth_error(data):
            raise RuntimeError(
                f"Session expired (context: {context}). "
                "Get a fresh JSESSIONID from Chrome DevTools -> Application -> Cookies -> fantrax.com"
            )

    # --- High-level methods ---

    def get_team_rosters_public(self, league_id: str) -> Dict:
        """Fetch rosters via public API."""
        try:
            data = self.public_request("getTeamRosters", {"leagueId": league_id})
            log.info(f"Public roster API returned data for league {league_id}")
            return data
        except Exception as e:
            log.warning(f"Public roster API failed: {e}")
            return {}

    def get_league_info(self, league_id: str) -> Dict:
        """Fetch league info."""
        try:
            data = self.public_request("getLeagueInfo", {"leagueId": league_id})
            log.info(f"League info: {data.get('leagueName', 'unknown')}")
            return data
        except Exception as e:
            log.warning(f"League info API failed: {e}")
            return {}

    def get_fantasy_teams(self, league_id: str) -> List[Dict]:
        """Fetch fantasy teams via internal API."""
        msgs = [{"method": "getFantasyTeams", "data": {}}]
        data = self.internal_request(league_id, msgs)

        teams = []
        for resp in data.get("responses", []):
            d = resp.get("data", {})
            if isinstance(d.get("fantasyTeams"), list):
                teams.extend(d["fantasyTeams"])
        return teams

    def get_player_ids(self, league_id: str) -> Dict:
        """Fetch player ID → name/position/team mapping (public, no auth)."""
        try:
            data = self.public_request("getPlayerIds", {"leagueId": league_id, "sport": "NBA"})
            log.info(f"Player IDs: {len(data)} entries")
            return data
        except Exception as e:
            log.warning(f"Player IDs API failed: {e}")
            return {}

    def get_league_team_info(self, league_id: str) -> Dict:
        """Fetch league info including teamInfo mapping."""
        try:
            data = self.public_request("getLeagueInfo", {"leagueId": league_id})
            return data.get("teamInfo", {})
        except Exception as e:
            log.warning(f"League team info API failed: {e}")
            return {}

    def get_standings(self, league_id: str) -> Dict:
        """Fetch standings via internal API."""
        msgs = [{"method": "getStandings", "data": {}}]
        return self.internal_request(league_id, msgs)


# =============================================================================
# ROSTER PARSING
# =============================================================================

def parse_rosters_with_players(roster_data: Dict, player_ids: Dict, team_info: Dict) -> Dict:
    """
    Combine getTeamRosters + getPlayerIds + teamInfo into clean roster structure.

    roster_data from getTeamRosters:
      { "rosters": { teamId: { "teamName": str, "rosterItems": [{ "id": playerId, "position": str, "status": str }] } } }

    player_ids from getPlayerIds:
      { playerId: { "name": "Last, First", "team": "LAL", "position": "PG", ... } }

    team_info from getLeagueInfo:
      { teamId: { "name": str, "id": str } }

    Returns: { "owner_key": { "team_name": str, "owner": str, "players": [...] } }
    """
    result = {}
    rosters = roster_data.get("rosters", {})

    for team_id, team_roster in rosters.items():
        team_name = team_roster.get("teamName", "")
        if not team_name and team_id in team_info:
            team_name = team_info[team_id].get("name", "")

        # Map team name → owner
        owner_key = match_team_to_owner(team_name)
        if not owner_key:
            log.warning(f"Could not match team '{team_name}' (id={team_id}) to any owner")
            owner_key = team_name
        display_name = OWNER_DISPLAY.get(owner_key, owner_key)

        players = []
        for item in team_roster.get("rosterItems", []):
            pid = item.get("id", "")
            status = item.get("status", "")
            roster_pos = item.get("position", "")

            # Look up player details from getPlayerIds
            player_info = player_ids.get(pid, {})
            raw_name = player_info.get("name", pid)

            # Names come as "Last, First" — convert to "First Last"
            if ", " in raw_name:
                parts = raw_name.split(", ", 1)
                player_name = f"{parts[1]} {parts[0]}"
            else:
                player_name = raw_name

            nba_team = player_info.get("team", "")
            if nba_team == "(N/A)":
                nba_team = ""
            pos = player_info.get("position", roster_pos)

            players.append({
                "name": player_name,
                "pos": pos,
                "nbaTeam": nba_team,
                "status": status,
            })

        # Sort: active players first, then by name
        players.sort(key=lambda p: (0 if p["status"] != "MINORS" else 1, p["name"]))

        result[owner_key] = {
            "team_name": team_name,
            "owner": display_name,
            "fantrax_id": team_id,
            "players": players,
        }

    return result


# Team name → owner key (fallback when username not available)
TEAM_NAME_TO_OWNER = {
    "Always Droppin Dimes": "Peterson",
    "Ball Don't Lie": "Jowkar",
    "BKs Whoppers": "Baden",
    "Burner account": "Berke",
    "Charlotte Wobnets": "Jowkar",
    "Flaming Flaggs": "Baden",
    "Freshly Washed Kings": "Delaney",
    "Giddey Up": "Berke",
    "Ice Trae": "Green",
    "Kelvin got No Dimes": "Gold",
    "Kentucky Fried Guards": "Gold",
    "Only Franz": "Zujewski",
    "Pure Sweat Farm": "Moss",
    "Pure Sweat Fam": "Moss",
    "Twin Towers": "HaleTrager",
}


def match_team_to_owner(team_name: str) -> Optional[str]:
    """Match a team name to an owner key."""
    if team_name in TEAM_NAME_TO_OWNER:
        return TEAM_NAME_TO_OWNER[team_name]
    # Fuzzy match: check if team name contains a key
    for name, owner in TEAM_NAME_TO_OWNER.items():
        if name.lower() in team_name.lower() or team_name.lower() in name.lower():
            return owner
    return None


# =============================================================================
# MAIN
# =============================================================================

def fetch_season(api: FantraxAPI, season: str, league_id: str) -> Dict:
    """Fetch roster data for a single season."""
    log.info(f"=== Fetching {season} (league_id={league_id}) ===")

    # Step 1: Get rosters (public, no auth needed)
    roster_data = api.get_team_rosters_public(league_id)

    # Step 2: Get player name lookup (public, no auth needed)
    player_ids = api.get_player_ids(league_id)

    # Step 3: Get team info for name mapping
    team_info = api.get_league_team_info(league_id)

    if roster_data and roster_data.get("rosters") and player_ids:
        parsed = parse_rosters_with_players(roster_data, player_ids, team_info)
        if parsed:
            total_players = sum(len(t["players"]) for t in parsed.values())
            log.info(f"Got {len(parsed)} teams, {total_players} players via public API")
            return {"season": season, "league_id": league_id, "teams": parsed, "source": "public_api"}

    # Fallback to internal API (teams only, no player rosters)
    log.info("Public API incomplete, trying internal API (requires auth cookies)...")
    try:
        teams_raw = api.get_fantasy_teams(league_id)
        if teams_raw:
            parsed = {}
            for t in teams_raw:
                team_id = t.get("id", "")
                team_name = t.get("name", "Unknown")
                owner_username = t.get("ownerName", "")
                owner_key = FANTRAX_TO_OWNER.get(owner_username, match_team_to_owner(team_name) or owner_username)
                display_name = OWNER_DISPLAY.get(owner_key, owner_key)

                parsed[owner_key] = {
                    "team_name": team_name,
                    "owner": display_name,
                    "fantrax_id": team_id,
                    "players": [],
                }

            log.info(f"Got {len(parsed)} teams via internal API (no player rosters)")
            return {"season": season, "league_id": league_id, "teams": parsed, "source": "internal_api"}

    except RuntimeError as e:
        log.error(f"Auth failed: {e}")
    except Exception as e:
        log.error(f"Internal API failed: {e}")

    log.warning(f"Could not fetch data for {season}")
    return {"season": season, "league_id": league_id, "teams": {}, "source": "failed"}


def main():
    parser = argparse.ArgumentParser(description="Fantrax YK Dynasty Basketball roster fetcher")
    parser.add_argument("--season", default="2025-26", help="Season to fetch (e.g. 2025-26)")
    parser.add_argument("--all-seasons", action="store_true", help="Fetch all available seasons")
    parser.add_argument("--jsessionid", default="", help="JSESSIONID cookie")
    parser.add_argument("--fx-rm", default="", dest="fx_rm", help="FX_RM cookie")
    parser.add_argument("--verbose", action="store_true", help="Verbose logging")
    parser.add_argument("--config", default=str(SCRIPT_DIR / "config.yaml"), help="Config file path")
    args = parser.parse_args()

    setup_logging(args.verbose)

    # Load config
    config = load_config(Path(args.config), args)

    if not config["jsessionid"]:
        log.warning(
            "No JSESSIONID configured. Will try public API only.\n"
            "For full data, create scripts/config.yaml with your cookies.\n"
            "See: Chrome DevTools -> Application -> Cookies -> fantrax.com"
        )

    api = FantraxAPI(config)

    # Determine which seasons to fetch
    if args.all_seasons:
        seasons_to_fetch = list(LEAGUE_IDS.items())
    else:
        season = args.season
        league_id = LEAGUE_IDS.get(season, config["current_league_id"])
        if not league_id:
            log.error(f"No league ID found for season {season}")
            sys.exit(1)
        seasons_to_fetch = [(season, league_id)]

    # Fetch each season
    all_results = {}
    for season, league_id in seasons_to_fetch:
        result = fetch_season(api, season, league_id)
        all_results[season] = result

        # Write individual season file
        out_path = DOCS_DATA / f"rosters_{season.replace('-', '_')}.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2)
        log.info(f"Wrote {out_path}")

    # Summary
    log.info("\n=== SUMMARY ===")
    for season, result in all_results.items():
        teams = result.get("teams", {})
        total_players = sum(len(t.get("players", [])) for t in teams.values())
        log.info(f"  {season}: {len(teams)} teams, {total_players} players (source: {result.get('source', '?')})")

    log.info("Done!")


if __name__ == "__main__":
    main()

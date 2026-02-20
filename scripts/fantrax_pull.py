"""
fantrax_pull.py — Comprehensive Fantrax Data Puller
====================================================

Hits every available Fantrax API endpoint for all 4 YK Dynasty seasons.
Saves raw responses to docs/data/raw/ and parses key data into docs/data/.

Usage:
    python scripts/fantrax_pull.py
    python scripts/fantrax_pull.py --season 2025-26
    python scripts/fantrax_pull.py --verbose

Requires: requests, pyyaml (pip install requests pyyaml)
Auth: scripts/config.yaml with JSESSIONID + FX_RM cookies
"""

from __future__ import annotations

import json
import logging
import os
import sys
import time
import traceback
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests

try:
    import yaml
    HAS_YAML = True
except ImportError:
    HAS_YAML = False

# =============================================================================
# CONSTANTS
# =============================================================================

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
DOCS_DATA = PROJECT_ROOT / "docs" / "data"
RAW_DIR = DOCS_DATA / "raw"
ERROR_LOG = SCRIPT_DIR / "errors.log"

BASE_URL = "https://www.fantrax.com/fxea/general"
INTERNAL_API_URL = "https://www.fantrax.com/fxpa/req"

LEAGUE_IDS = {
    "2022-23": "n7exgxhpl1ydddam",
    "2023-24": "tz7m8b61lhphjz9w",
    "2024-25": "26ihddrglvclsxav",
    "2025-26": "sz7vm5xwmancf4tr",
}

# Owner mapping: Fantrax username -> canonical owner key
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

# Public endpoints (GET, no auth)
PUBLIC_ENDPOINTS = [
    "getTeamRosters",
    "getPlayerIds",
    "getLeagueInfo",
]

# Internal endpoints to try (POST, need auth)
INTERNAL_METHODS = [
    "getStandings",
    "getFantasyTeams",
    "getTransactionLog",
    "getTransactions",
    "getScoreboard",
    "getMatchupScores",
    "getLeaguePlayers",
    "getPlayerStats",
    "getSchedule",
    "getTradeBlock",
    "getDraftResults",
    "getLeagueRosters",
    "getWaiverWirePlayersPending",
]

# =============================================================================
# LOGGING
# =============================================================================

log = logging.getLogger("fantrax_pull")


def setup_logging(verbose: bool = False):
    log.setLevel(logging.DEBUG)
    log.handlers.clear()
    fmt = logging.Formatter("%(asctime)s | %(levelname)-7s | %(message)s")
    ch = logging.StreamHandler(sys.stdout)
    ch.setLevel(logging.DEBUG if verbose else logging.INFO)
    ch.setFormatter(fmt)
    log.addHandler(ch)


def log_error(msg: str):
    """Append error to scripts/errors.log"""
    with open(ERROR_LOG, "a", encoding="utf-8") as f:
        f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} | {msg}\n")


# =============================================================================
# API CLIENT
# =============================================================================

class FantraxPuller:
    def __init__(self, config: Dict):
        self.config = config
        self.session = requests.Session()
        self.request_count = 0
        self.results: Dict[str, Any] = {}  # season -> { endpoint -> data }
        self.errors: List[str] = []
        self.working_endpoints: List[str] = []
        self.failed_endpoints: List[str] = []

    def _headers(self, league_id: str) -> Dict[str, str]:
        return {
            "accept": "application/json, text/plain, */*",
            "content-type": "text/plain",
            "origin": "https://www.fantrax.com",
            "referer": f"https://www.fantrax.com/fantasy/league/{league_id}/home",
            "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        }

    def _cookies(self) -> Dict[str, str]:
        cookies = {}
        if self.config.get("jsessionid"):
            cookies["JSESSIONID"] = self.config["jsessionid"]
        if self.config.get("fx_rm"):
            cookies["FX_RM"] = self.config["fx_rm"]
        return cookies

    def _sleep(self):
        delay = self.config.get("request_delay", 0.5)
        if delay > 0:
            time.sleep(delay)

    def _is_auth_error(self, data: Any) -> bool:
        if isinstance(data, dict):
            if data.get("pageError", {}).get("code") == "WARNING_NOT_LOGGED_IN":
                return True
            return any(self._is_auth_error(v) for v in data.values())
        elif isinstance(data, list):
            return any(self._is_auth_error(x) for x in data)
        return False

    def public_get(self, endpoint: str, league_id: str) -> Optional[Dict]:
        """GET request to public /fxea API."""
        url = f"{BASE_URL}/{endpoint}"
        params = {"leagueId": league_id}
        if endpoint == "getPlayerIds":
            params["sport"] = "NBA"

        self.request_count += 1
        try:
            resp = self.session.get(url, params=params, timeout=30)
            resp.raise_for_status()
            data = resp.json()
            self._sleep()
            return data
        except Exception as e:
            msg = f"Public {endpoint} failed for {league_id}: {e}"
            log.warning(msg)
            log_error(msg)
            self.errors.append(msg)
            return None

    def internal_post(self, method: str, league_id: str, extra_data: Dict = None) -> Optional[Dict]:
        """POST request to internal /fxpa API."""
        url = f"{INTERNAL_API_URL}?leagueId={league_id}"
        msg_data = extra_data or {}
        payload = {
            "uiv": 3,
            "refUrl": f"https://www.fantrax.com/fantasy/league/{league_id}/home",
            "dt": 2,
            "at": 0,
            "av": "0.0",
            "tz": "America/New_York",
            "v": "182.0.1",
            "msgs": [{"method": method, "data": msg_data}],
        }

        self.request_count += 1
        try:
            resp = self.session.post(
                url,
                headers=self._headers(league_id),
                cookies=self._cookies(),
                json=payload,
                timeout=30,
            )
            resp.raise_for_status()
            data = resp.json()

            if self._is_auth_error(data):
                msg = f"Auth error on {method} for {league_id} — cookies expired"
                log.error(msg)
                log_error(msg)
                self.errors.append(msg)
                return None

            self._sleep()
            return data
        except Exception as e:
            msg = f"Internal {method} failed for {league_id}: {e}"
            log.warning(msg)
            log_error(msg)
            self.errors.append(msg)
            return None

    def pull_season(self, season: str, league_id: str):
        """Pull all available data for a single season."""
        log.info(f"\n{'='*60}")
        log.info(f"Pulling data for {season} (league_id={league_id})")
        log.info(f"{'='*60}")

        season_data = {}
        season_key = season.replace("-", "_")
        season_raw_dir = RAW_DIR / season_key
        season_raw_dir.mkdir(parents=True, exist_ok=True)

        # --- Public endpoints ---
        for endpoint in PUBLIC_ENDPOINTS:
            log.info(f"  [{season}] Public: {endpoint}...")
            data = self.public_get(endpoint, league_id)
            if data:
                season_data[endpoint] = data
                out_path = season_raw_dir / f"{endpoint}.json"
                with open(out_path, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=2)
                log.info(f"    -> Saved {out_path.name} ({len(json.dumps(data))} bytes)")
                if endpoint not in self.working_endpoints:
                    self.working_endpoints.append(endpoint)
            else:
                if endpoint not in self.failed_endpoints:
                    self.failed_endpoints.append(endpoint)

        # --- Internal endpoints ---
        for method in INTERNAL_METHODS:
            log.info(f"  [{season}] Internal: {method}...")
            data = self.internal_post(method, league_id)
            if data:
                # Check if it has useful data (not just an empty response)
                responses = data.get("responses", [])
                has_data = False
                has_error = False
                for resp in responses:
                    if resp.get("data"):
                        has_data = True
                    err = resp.get("errorCode") or resp.get("error")
                    if err:
                        has_error = True
                        log.info(f"    -> Error response: {err}")

                if has_data and not has_error:
                    season_data[method] = data
                    out_path = season_raw_dir / f"{method}.json"
                    with open(out_path, "w", encoding="utf-8") as f:
                        json.dump(data, f, indent=2)
                    log.info(f"    -> Saved {out_path.name} ({len(json.dumps(data))} bytes)")
                    if method not in self.working_endpoints:
                        self.working_endpoints.append(method)
                elif has_error:
                    log.info(f"    -> Skipped (error response)")
                    if method not in self.failed_endpoints:
                        self.failed_endpoints.append(method)
                else:
                    log.info(f"    -> Skipped (empty data)")
                    if method not in self.failed_endpoints:
                        self.failed_endpoints.append(method)
            else:
                if method not in self.failed_endpoints:
                    self.failed_endpoints.append(method)

        self.results[season] = season_data

    def pull_all(self, seasons: Optional[List[str]] = None):
        """Pull data for all (or specified) seasons."""
        if seasons is None:
            seasons = list(LEAGUE_IDS.keys())

        RAW_DIR.mkdir(parents=True, exist_ok=True)

        for season in seasons:
            league_id = LEAGUE_IDS.get(season)
            if not league_id:
                log.error(f"No league ID for season {season}")
                continue
            self.pull_season(season, league_id)

        self._print_summary()

    def _print_summary(self):
        log.info(f"\n{'='*60}")
        log.info("PULL SUMMARY")
        log.info(f"{'='*60}")
        log.info(f"Total requests: {self.request_count}")
        log.info(f"Working endpoints: {', '.join(self.working_endpoints) or 'none'}")
        log.info(f"Failed endpoints: {', '.join(self.failed_endpoints) or 'none'}")
        log.info(f"Errors: {len(self.errors)}")
        for season, data in self.results.items():
            log.info(f"  {season}: {len(data)} endpoints returned data")
            for endpoint in data:
                log.info(f"    - {endpoint}")

    # =========================================================================
    # PARSERS
    # =========================================================================

    def parse_standings(self) -> Dict[str, List[Dict]]:
        """Parse standings from all seasons into structured format."""
        all_standings = {}

        for season, data in self.results.items():
            standings_data = data.get("getStandings")
            if not standings_data:
                log.warning(f"No standings data for {season}")
                continue

            responses = standings_data.get("responses", [])
            if not responses:
                continue

            resp_data = responses[0].get("data", {})
            table_list = resp_data.get("tableList", [])

            # Also get team info for mapping
            team_info = resp_data.get("fantasyTeamInfo", {})

            standings = []
            if table_list:
                # tableList contains rows of standings data
                rows = table_list[0].get("rows", []) if table_list else []

                for row in rows:
                    cells = row.get("cells", {})
                    team_id = row.get("fixedCells", {}).get("teamId", "")

                    # Get team name from fantasyTeamInfo
                    team_name = ""
                    owner_username = ""
                    if team_id in team_info:
                        ti = team_info[team_id]
                        team_name = ti.get("name", "")
                        owner_username = ti.get("ownerName", "")

                    # Parse W/L/T and fantasy points from cells
                    # The structure varies — try common patterns
                    w = self._extract_cell_int(cells, "w", "wins")
                    l = self._extract_cell_int(cells, "l", "losses")
                    t = self._extract_cell_int(cells, "t", "ties")
                    fpts = self._extract_cell_float(cells, "fpts", "fp", "fantasyPoints", "totalFP")
                    win_pct = self._extract_cell_float(cells, "winPct", "pct", "win_pct")

                    # Rank from row position
                    rank_val = row.get("rank", len(standings) + 1)

                    # Map to owner
                    owner_key = FANTRAX_TO_OWNER.get(owner_username)
                    if not owner_key:
                        owner_key = TEAM_NAME_TO_OWNER.get(team_name)

                    standings.append({
                        "rank": rank_val,
                        "team": team_name,
                        "owner": owner_key,
                        "w": w,
                        "l": l,
                        "t": t,
                        "win_pct": round(win_pct, 3) if win_pct else 0,
                        "fpts": int(fpts) if fpts else 0,
                        "fantrax_team_id": team_id,
                    })

            # Sort by rank
            standings.sort(key=lambda x: x.get("rank", 99))
            all_standings[season] = standings
            log.info(f"  Parsed {len(standings)} teams for {season} standings")

        return all_standings

    def _extract_cell_int(self, cells: Dict, *keys: str) -> int:
        """Extract integer value from cells dict, trying multiple key names."""
        for key in keys:
            if key in cells:
                val = cells[key]
                if isinstance(val, dict):
                    val = val.get("content", val.get("value", 0))
                try:
                    return int(float(str(val).replace(",", "")))
                except (ValueError, TypeError):
                    pass
        return 0

    def _extract_cell_float(self, cells: Dict, *keys: str) -> float:
        """Extract float value from cells dict, trying multiple key names."""
        for key in keys:
            if key in cells:
                val = cells[key]
                if isinstance(val, dict):
                    val = val.get("content", val.get("value", 0))
                try:
                    return float(str(val).replace(",", "").replace("%", ""))
                except (ValueError, TypeError):
                    pass
        return 0.0

    def parse_transactions(self) -> Dict[str, List[Dict]]:
        """Parse transaction log from all seasons."""
        all_transactions = {}

        for season, data in self.results.items():
            trans_data = data.get("getTransactionLog") or data.get("getTransactions")
            if not trans_data:
                log.info(f"No transaction data for {season}")
                continue

            responses = trans_data.get("responses", [])
            if not responses:
                continue

            resp_data = responses[0].get("data", {})
            all_transactions[season] = resp_data
            log.info(f"  Got transaction data for {season}")

        return all_transactions

    def parse_matchups(self) -> Dict[str, Any]:
        """Parse matchup/scoreboard data from all seasons."""
        all_matchups = {}

        for season, data in self.results.items():
            matchup_data = data.get("getScoreboard") or data.get("getMatchupScores") or data.get("getSchedule")
            if not matchup_data:
                log.info(f"No matchup data for {season}")
                continue

            responses = matchup_data.get("responses", [])
            if not responses:
                continue

            resp_data = responses[0].get("data", {})
            all_matchups[season] = resp_data
            log.info(f"  Got matchup data for {season}")

        return all_matchups


# =============================================================================
# MAIN
# =============================================================================

def load_config() -> Dict:
    config_path = SCRIPT_DIR / "config.yaml"
    cfg = {}
    if config_path.exists() and HAS_YAML:
        with open(config_path) as f:
            cfg = yaml.safe_load(f) or {}
    return {
        "jsessionid": cfg.get("jsessionid", ""),
        "fx_rm": cfg.get("fx_rm", ""),
        "request_delay": cfg.get("request_delay", 0.5),
    }


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Comprehensive Fantrax data puller")
    parser.add_argument("--season", default=None, help="Pull only this season (e.g. 2025-26)")
    parser.add_argument("--verbose", action="store_true", help="Verbose logging")
    args = parser.parse_args()

    setup_logging(args.verbose)

    # Clear error log
    if ERROR_LOG.exists():
        ERROR_LOG.unlink()

    config = load_config()
    if not config.get("jsessionid"):
        log.error("No JSESSIONID in config.yaml. Update scripts/config.yaml with fresh cookies.")
        sys.exit(1)

    puller = FantraxPuller(config)

    seasons = [args.season] if args.season else None
    puller.pull_all(seasons)

    # Save endpoint discovery results
    discovery = {
        "working": puller.working_endpoints,
        "failed": puller.failed_endpoints,
        "total_requests": puller.request_count,
        "errors_count": len(puller.errors),
    }
    disc_path = RAW_DIR / "endpoint_discovery.json"
    with open(disc_path, "w", encoding="utf-8") as f:
        json.dump(discovery, f, indent=2)
    log.info(f"\nEndpoint discovery saved to {disc_path}")

    return puller


if __name__ == "__main__":
    main()

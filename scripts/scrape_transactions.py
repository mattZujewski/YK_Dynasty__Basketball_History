"""
scrape_transactions.py — Scrape Fantrax transaction history pages
=================================================================

Attempts to scrape transaction history from Fantrax for all 4 seasons.
Falls back to API endpoints if page scraping fails.

Usage:
    python scripts/scrape_transactions.py
"""

from __future__ import annotations

import json
import logging
import os
import re
import sys
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup

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

LEAGUE_IDS = {
    "2022-23": "n7exgxhpl1ydddam",
    "2023-24": "tz7m8b61lhphjz9w",
    "2024-25": "26ihddrglvclsxav",
    "2025-26": "sz7vm5xwmancf4tr",
}

INTERNAL_API_URL = "https://www.fantrax.com/fxpa/req"

log = logging.getLogger("scrape_transactions")


def setup_logging():
    log.setLevel(logging.DEBUG)
    log.handlers.clear()
    fmt = logging.Formatter("%(asctime)s | %(levelname)-7s | %(message)s")
    ch = logging.StreamHandler(sys.stdout)
    ch.setLevel(logging.DEBUG)
    ch.setFormatter(fmt)
    log.addHandler(ch)


def load_config():
    config_path = SCRIPT_DIR / "config.yaml"
    if config_path.exists() and HAS_YAML:
        with open(config_path) as f:
            cfg = yaml.safe_load(f) or {}
        return cfg
    return {}


def get_session(cfg):
    session = requests.Session()
    session.headers.update({
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "accept-language": "en-US,en;q=0.9",
    })
    if cfg.get("jsessionid"):
        session.cookies.set("JSESSIONID", cfg["jsessionid"], domain=".fantrax.com")
    if cfg.get("fx_rm"):
        session.cookies.set("FX_RM", cfg["fx_rm"], domain=".fantrax.com")
    return session


def internal_request(session, league_id, method, data=None, cfg=None):
    """POST request to internal /fxpa API."""
    url = f"{INTERNAL_API_URL}?leagueId={league_id}"
    payload = {
        "uiv": 3,
        "refUrl": f"https://www.fantrax.com/fantasy/league/{league_id}/transactions/history",
        "dt": 2,
        "at": 0,
        "av": "0.0",
        "tz": "America/New_York",
        "v": "182.0.1",
        "msgs": [{"method": method, "data": data or {}}],
    }
    headers = {
        "accept": "application/json, text/plain, */*",
        "content-type": "text/plain",
        "origin": "https://www.fantrax.com",
        "referer": f"https://www.fantrax.com/fantasy/league/{league_id}/transactions/history",
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    }
    cookies = {}
    if cfg and cfg.get("jsessionid"):
        cookies["JSESSIONID"] = cfg["jsessionid"]
    if cfg and cfg.get("fx_rm"):
        cookies["FX_RM"] = cfg["fx_rm"]

    resp = session.post(url, headers=headers, cookies=cookies, json=payload, timeout=30)
    resp.raise_for_status()
    return resp.json()


def try_scrape_html(session, league_id, season):
    """Try to scrape transaction history HTML page."""
    url = f"https://www.fantrax.com/fantasy/league/{league_id}/transactions/history"
    log.info(f"[{season}] Trying HTML scrape: {url}")

    try:
        resp = session.get(url, timeout=30)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "lxml")

        # Check if we got actual content or a JS-rendered shell
        body_text = soup.get_text(strip=True)
        if len(body_text) < 500 or "Loading" in body_text[:200]:
            log.warning(f"[{season}] HTML page appears to be JS-rendered (minimal content)")
            return None

        # Try to find transaction rows
        tables = soup.find_all("table")
        log.info(f"[{season}] Found {len(tables)} tables in HTML")

        # Look for transaction data
        transactions = []
        for table in tables:
            rows = table.find_all("tr")
            for row in rows:
                cells = row.find_all(["td", "th"])
                if cells:
                    cell_texts = [c.get_text(strip=True) for c in cells]
                    transactions.append(cell_texts)

        if transactions:
            log.info(f"[{season}] Found {len(transactions)} transaction rows")
            return transactions
        else:
            log.warning(f"[{season}] No transaction data found in HTML")
            return None

    except Exception as e:
        log.error(f"[{season}] HTML scrape failed: {e}")
        return None


def try_api_methods(session, league_id, season, cfg):
    """Try various API methods to get transaction data."""
    methods_to_try = [
        ("getTransactionHistory", {}),
        ("getTransactionHistory", {"transType": "TRADE"}),
        ("getTransactionLog", {}),
        ("getTransactionLog", {"transType": "ALL"}),
        ("getTransactions", {}),
        ("getTransactions", {"transType": "ALL"}),
        ("getTransactionResults", {}),
        ("getRecentActivity", {}),
        ("getRecentActivity", {"numDays": 365}),
        ("getLeagueTransactions", {}),
        ("getTradeHistory", {}),
        ("getCompletedTrades", {}),
        ("getWaiverResults", {}),
        ("getClaimResults", {}),
    ]

    results = {}
    for method, data in methods_to_try:
        try:
            log.info(f"[{season}] Trying API method: {method} data={data}")
            resp = internal_request(session, league_id, method, data, cfg)

            # Check for errors
            for r in resp.get("responses", []):
                if r.get("data", {}).get("pageError"):
                    error = r["data"]["pageError"]
                    log.warning(f"[{season}] {method}: error={error.get('code','?')}")
                    continue

                d = r.get("data", {})
                # Check if response has meaningful data
                if d and not d.get("pageError"):
                    # Look for transaction-like data
                    has_data = False
                    for key in d:
                        val = d[key]
                        if isinstance(val, (list, dict)) and len(val) > 0:
                            if key not in ("goBackDays", "displayedSelections", "miscData"):
                                has_data = True
                                log.info(f"[{season}] {method}: found data in key '{key}' ({type(val).__name__}, len={len(val)})")

                    if has_data:
                        results[method] = d
                        # Save raw response
                        raw_dir = RAW_DIR / season.replace("-", "_")
                        raw_dir.mkdir(parents=True, exist_ok=True)
                        with open(raw_dir / f"{method}.json", "w") as f:
                            json.dump(resp, f, indent=2)
                        log.info(f"[{season}] {method}: saved raw response")

        except Exception as e:
            log.warning(f"[{season}] {method}: failed ({e})")

        time.sleep(0.3)

    return results


def try_league_history(session, league_id, season, cfg):
    """Try to scrape the league history page."""
    url = f"https://www.fantrax.com/newui/fantasy/leagueHistory.go?leagueId={league_id}&appType=0&appVersion=undefined"
    log.info(f"[{season}] Trying league history: {url}")

    try:
        resp = session.get(url, timeout=30)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "lxml")
        body_text = soup.get_text(strip=True)

        if len(body_text) < 100:
            log.warning(f"[{season}] League history page is empty/JS-rendered")
            return None

        log.info(f"[{season}] League history page: {len(body_text)} chars of text")

        # Save raw HTML for analysis
        raw_dir = RAW_DIR / season.replace("-", "_")
        raw_dir.mkdir(parents=True, exist_ok=True)
        with open(raw_dir / "leagueHistory.html", "w") as f:
            f.write(resp.text)

        # Try to extract data
        tables = soup.find_all("table")
        data = {"text_length": len(body_text), "tables": len(tables)}

        if tables:
            for i, table in enumerate(tables):
                rows = table.find_all("tr")
                table_data = []
                for row in rows:
                    cells = row.find_all(["td", "th"])
                    table_data.append([c.get_text(strip=True) for c in cells])
                data[f"table_{i}"] = table_data

        # Also look for any JSON data embedded in scripts
        scripts = soup.find_all("script")
        for script in scripts:
            text = script.string or ""
            if "leagueHistory" in text or "champion" in text or "winner" in text:
                data["script_with_history"] = text[:2000]

        return data

    except Exception as e:
        log.error(f"[{season}] League history failed: {e}")
        return None


def main():
    setup_logging()
    cfg = load_config()
    session = get_session(cfg)

    all_results = {}
    league_history_data = None

    for season, league_id in LEAGUE_IDS.items():
        log.info(f"\n{'='*60}")
        log.info(f"Processing {season} (league_id={league_id})")
        log.info(f"{'='*60}")

        season_result = {
            "html_scrape": None,
            "api_results": {},
            "league_history": None,
        }

        # 1. Try HTML scrape
        html_data = try_scrape_html(session, league_id, season)
        if html_data:
            season_result["html_scrape"] = html_data

        time.sleep(0.5)

        # 2. Try API methods
        api_data = try_api_methods(session, league_id, season, cfg)
        if api_data:
            season_result["api_results"] = {k: "has_data" for k in api_data}

        time.sleep(0.5)

        # 3. Try league history (only for first season — it's league-wide)
        if season == "2022-23":
            lh = try_league_history(session, league_id, season, cfg)
            if lh:
                season_result["league_history"] = lh
                league_history_data = lh

        all_results[season] = season_result

    # Save summary
    summary = {
        "seasons_processed": list(LEAGUE_IDS.keys()),
        "results": {},
    }
    for season, result in all_results.items():
        summary["results"][season] = {
            "html_scrape": "found" if result["html_scrape"] else "empty/failed",
            "api_methods_with_data": list(result.get("api_results", {}).keys()),
            "league_history": "found" if result.get("league_history") else "not_attempted" if season != "2022-23" else "empty/failed",
        }

    with open(RAW_DIR / "transaction_scrape_summary.json", "w") as f:
        json.dump(summary, f, indent=2)

    log.info(f"\n{'='*60}")
    log.info("SUMMARY")
    log.info(f"{'='*60}")
    for season, result in summary["results"].items():
        log.info(f"  {season}: html={result['html_scrape']}, api={result['api_methods_with_data']}, history={result['league_history']}")

    if league_history_data:
        log.info(f"\nLeague History Data Keys: {list(league_history_data.keys())}")
        if "text_length" in league_history_data:
            log.info(f"  Text length: {league_history_data['text_length']}")


if __name__ == "__main__":
    main()

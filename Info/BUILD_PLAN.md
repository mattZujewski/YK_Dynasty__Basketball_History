# YK Dynasty Basketball — Build Plan

## The Data Is Already Done
All JSON files are pre-extracted and ready to drop in. No parsing work tonight.

- `seasons.json` — 4 seasons of standings (120 trades extracted)
- `trades.json` — 120 trades across 2021-2026
- `picks.json` — Pick ownership 2027-2031 by owner
- `rankings.json` — Jan 2026 dynasty rankings (top 50)

---

## Opening Prompt for Claude Code (copy-paste this)

```
Build a static GitHub Pages site called "YK Dynasty Basketball" modeled after 
https://mattzujewski.github.io/DOTP/index.html (source: https://github.com/mattZujewski/DOTP).
Also See File path for project info /Users/Mattzujewski/Projects/fun_coding/Dynasty_Baseball_Content_2026/files

Pre-extracted JSON data is in /files/data/. Repo structure should mirror DOTP exactly:
- /docs/ as GitHub Pages root
- /files/data/ for JSON

Build in this exact order, get each page working before moving to next:
1. index.html — champion history table, 4 stat cards (seasons/teams/trades/champions), 
   season-by-season standings table with year switcher
2. trade.html — trade log table filterable by season/owner, trade count bar chart by owner
3. picks.html — pick ownership grid (owners as rows, 2027-2031 as columns)
4. standings.html — all-time W-L table sorted by win%

Reuse DOTP's CSS/chart patterns exactly. Start with index.html.
```

---

## Key Data Facts to Know

**Owners (abbreviation → name used in trades.json):**
| Abbrev | Name | Current Team (2025-26) |
|---|---|---|
| TRAG | Trager | Twin Towers |
| JOWK | Jowkar | — |
| DELA | Delaney | Freshly Washed Kings |
| GREEN | Green | — |
| BERK | Berke | — |
| PETE | Peterson | Kentucky Fried Guards |
| MOSS | Moss | Pure Sweat Farm |
| ZJEW | Zujewski | Only Franz ← you |
| GOLD | Gold | — |
| KELL | Kelley | — |
| VLAND | Vlandis | — |
| DIME | AlwaysDroppin | Always Droppin Dimes |

**Champions:**
- 2022-23: Always Droppin Dimes (16-1)
- 2023-24: Always Droppin Dimes (15-1)
- 2024-25: Twin Towers (12-4, won from 3 seed)
- 2025-26: In progress — Ball Don't Lie at 15-0

**Pick hoarder:** Delaney owns a comical number of picks (8+ in 2027, 9+ in 2028)

**Trade note:** trades.json `give`/`get` arrays contain strings like `"ZJEW Jamal Murray"` — parse the owner abbrev as the first word.

---

## Build Order Rationale
1. **index.html first** — hardest to mess up, most visual payoff, proves the template works
2. **trade.html second** — trades.json is the richest data, easy bar chart win
3. **picks.html third** — unique to basketball, simple grid layout
4. **standings.html last** — mostly a reformatted version of what's already on index

Skip team.html and rankings.html for now — get the 4 core pages working first.

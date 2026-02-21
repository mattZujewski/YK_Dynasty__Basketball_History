/**
 * players.js — Dashboard module for players.html
 * YK Dynasty Basketball
 */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', async function () {
    const YK = window.YK;

    let rosterData, statsData, movementData, rankingsData, tradesData;
    try {
      [rosterData, rankingsData, tradesData] = await Promise.all([
        YK.loadJSON('data/rosters_2025_26.json'),
        YK.loadJSON('data/rankings.json'),
        YK.loadJSON('data/trades.json'),
      ]);
      // These may not exist yet
      statsData = await YK.loadJSON('data/player_stats.json').catch(function() { return null; });
      movementData = await YK.loadJSON('data/player_movement.json').catch(function() { return null; });
    } catch (e) {
      console.error('Failed to load data:', e);
      return;
    }

    var teams = rosterData.teams || {};
    var stats = (statsData && statsData.players) || {};
    var movement = (movementData && movementData.players) || {};
    var rankingsArr = Array.isArray(rankingsData) ? rankingsData : (rankingsData.rankings || []);

    // Build all players list: {name, owner, pos, nbaTeam, rank, stats}
    var allPlayers = [];
    var rankMap = {};
    rankingsArr.forEach(function(r) {
      var name = r.player_name || r.player;
      rankMap[YK.normalizeName(name)] = r.rank;
    });

    Object.keys(teams).forEach(function(owner) {
      var team = teams[owner];
      (team.players || []).forEach(function(p) {
        var norm = YK.normalizeName(p.name);
        var rank = rankMap[norm];
        var playerStats = stats[p.name] || null;
        allPlayers.push({
          name: p.name,
          owner: owner,
          teamName: team.team_name,
          pos: p.pos || '',
          nbaTeam: p.nbaTeam || '',
          status: p.status || '',
          rank: rank,
          stats: playerStats,
          movement: movement[p.name] || null,
        });
      });
    });

    // Sort by rank (ranked first, then alpha)
    allPlayers.sort(function(a, b) {
      if (a.rank !== undefined && b.rank !== undefined) return a.rank - b.rank;
      if (a.rank !== undefined) return -1;
      if (b.rank !== undefined) return 1;
      return a.name.localeCompare(b.name);
    });

    // ── Journey helpers ─────────────────────────────────────────

    var CURRENT_SEASON = '2025-26';
    var ALL_SEASONS = ['2020-21','2021-22','2022-23','2023-24','2024-25','2025-26'];

    function computeJourneyStats(mov) {
      if (!mov || !mov.history || mov.history.length === 0) return null;
      var hist = mov.history;
      var seen = {};
      var chain = [];
      var tradeCount = 0;

      hist.forEach(function(h) {
        if (h.type === 'startup') {
          if (!seen[h.owner]) { seen[h.owner] = true; }
          chain.push({ owner: h.owner, season: h.season, type: 'startup' });
        } else if (h.type === 'trade') {
          tradeCount++;
          if (!seen[h.from]) { seen[h.from] = true; }
          if (!seen[h.to]) { seen[h.to] = true; }
          // If chain is empty, add the "from" as the origin
          if (chain.length === 0) {
            chain.push({ owner: h.from, season: h.season, type: 'origin' });
          }
          chain.push({ owner: h.to, season: h.season, type: 'trade' });
        }
      });

      var numOwners = Object.keys(seen).length;

      // Years with current owner: count from last acquisition season to current
      var ywc = 1;
      if (chain.length > 0) {
        var lastSeason = chain[chain.length - 1].season;
        var lastIdx = ALL_SEASONS.indexOf(lastSeason);
        var curIdx = ALL_SEASONS.indexOf(CURRENT_SEASON);
        if (lastIdx >= 0 && curIdx >= 0) {
          ywc = curIdx - lastIdx + 1;
        }
      }

      return {
        numOwners: numOwners,
        numTrades: tradeCount,
        ownerChain: chain,
        yearsWithCurrent: ywc,
        currentOwner: mov.current_owner,
      };
    }

    // ── DOM refs ────────────────────────────────────────────────

    var searchInput = document.getElementById('player-search');
    var profileDiv = document.getElementById('player-profile');
    var topSection = document.getElementById('top-players-section');
    var resultsSection = document.getElementById('search-results-section');
    var resultsDiv = document.getElementById('search-results');
    var viewTitle = document.getElementById('view-title');
    var viewDesc = document.getElementById('view-description');
    var grid = document.getElementById('top-players-grid');

    var currentView = 'ranked';

    // ── Render: Top Ranked ──────────────────────────────────────

    function renderTopPlayers() {
      viewTitle.innerHTML = '&#x1F451; Top Dynasty Players';
      viewDesc.textContent = 'Top 20 dynasty-ranked players on rosters';

      var top20 = allPlayers.filter(function(p) { return p.rank !== undefined; }).slice(0, 20);
      if (top20.length === 0) {
        grid.innerHTML = '<p class="text-muted" style="padding:20px">No ranked players found.</p>';
        return;
      }
      grid.innerHTML = top20.map(function(p) {
        var color = YK.ownerColor(p.owner);
        var ownerName = YK.ownerDisplayName(p.owner);
        var ppg = p.stats ? p.stats.stats.ppg : '\u2014';
        var rpg = p.stats ? p.stats.stats.rpg : '\u2014';
        var apg = p.stats ? p.stats.stats.apg : '\u2014';
        return '<div class="roster-card player-card" style="border-top:3px solid ' + color + ';cursor:pointer" data-player="' + YK.escapeHtml(p.name) + '">' +
          '<div class="roster-card-header">' +
            '<span style="background:rgba(232,184,75,0.18);color:#c7960a;font-size:0.72rem;font-weight:800;padding:2px 8px;border-radius:99px;margin-right:8px">#' + p.rank + '</span>' +
            '<strong>' + YK.escapeHtml(p.name) + '</strong>' +
            '<span style="margin-left:auto;color:var(--text-muted);font-size:0.78rem">' + YK.escapeHtml(p.pos) + '</span>' +
          '</div>' +
          '<div style="padding:12px 18px;font-size:0.82rem">' +
            '<div style="display:flex;gap:16px;margin-bottom:8px">' +
              '<span><strong>' + ppg + '</strong> <span style="color:var(--text-muted);font-size:0.72rem">PPG</span></span>' +
              '<span><strong>' + rpg + '</strong> <span style="color:var(--text-muted);font-size:0.72rem">RPG</span></span>' +
              '<span><strong>' + apg + '</strong> <span style="color:var(--text-muted);font-size:0.72rem">APG</span></span>' +
            '</div>' +
            '<div style="color:var(--text-muted);font-size:0.78rem">' +
              '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + color + ';margin-right:4px;vertical-align:middle"></span>' +
              ownerName + ' &middot; ' + YK.escapeHtml(p.nbaTeam) +
            '</div>' +
          '</div>' +
        '</div>';
      }).join('');
      bindCardClicks();
    }

    // ── Render: Most Traveled ───────────────────────────────────

    function renderMostTraveled() {
      viewTitle.innerHTML = '&#x1F504; Most Traveled Players';
      viewDesc.textContent = 'Players with the most owners and trade history';

      var traveled = allPlayers.filter(function(p) {
        return p.movement && p.movement.traded === true;
      }).map(function(p) {
        var j = computeJourneyStats(p.movement);
        return { player: p, journey: j };
      }).filter(function(item) {
        return item.journey !== null;
      });

      // Sort by numOwners desc, then numTrades desc
      traveled.sort(function(a, b) {
        if (b.journey.numOwners !== a.journey.numOwners) return b.journey.numOwners - a.journey.numOwners;
        return b.journey.numTrades - a.journey.numTrades;
      });

      var top = traveled.slice(0, 20);
      if (top.length === 0) {
        grid.innerHTML = '<p class="text-muted" style="padding:20px">No traded players found.</p>';
        return;
      }

      grid.innerHTML = top.map(function(item) {
        var p = item.player;
        var j = item.journey;
        var color = YK.ownerColor(p.owner);
        var ownerName = YK.ownerDisplayName(p.owner);

        // Build dot trail
        var dotTrail = '<div class="dot-trail">';
        j.ownerChain.forEach(function(era, idx) {
          if (idx > 0) {
            dotTrail += '<span class="dot-trail-arrow">\u25B8</span>';
          }
          dotTrail += '<span class="dot-trail-dot" style="background:' + YK.ownerColor(era.owner) + '" title="' + YK.escapeHtml(YK.ownerDisplayName(era.owner)) + ' (' + era.season + ')"></span>';
        });
        dotTrail += '</div>';

        return '<div class="roster-card player-card" style="border-top:3px solid ' + color + ';cursor:pointer" data-player="' + YK.escapeHtml(p.name) + '">' +
          '<div class="roster-card-header">' +
            '<span style="background:rgba(231,111,81,0.15);color:#c0513a;font-size:0.72rem;font-weight:800;padding:2px 8px;border-radius:99px;margin-right:8px">' + j.numTrades + ' trade' + (j.numTrades !== 1 ? 's' : '') + '</span>' +
            '<strong>' + YK.escapeHtml(p.name) + '</strong>' +
            '<span style="margin-left:auto;color:var(--text-muted);font-size:0.78rem">' + YK.escapeHtml(p.pos) + '</span>' +
          '</div>' +
          '<div style="padding:12px 18px;font-size:0.82rem">' +
            '<div style="display:flex;gap:12px;margin-bottom:6px">' +
              '<span style="font-weight:700;color:var(--text-primary)">' + j.numOwners + ' owner' + (j.numOwners !== 1 ? 's' : '') + '</span>' +
              '<span style="color:var(--text-muted);font-size:0.78rem">' + j.yearsWithCurrent + ' yr' + (j.yearsWithCurrent !== 1 ? 's' : '') + ' w/ current</span>' +
            '</div>' +
            dotTrail +
            '<div style="color:var(--text-muted);font-size:0.78rem;margin-top:8px">' +
              '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + color + ';margin-right:4px;vertical-align:middle"></span>' +
              ownerName +
              (p.rank !== undefined ? ' &middot; <span style="color:#c7960a;font-weight:700">#' + p.rank + '</span>' : '') +
            '</div>' +
          '</div>' +
        '</div>';
      }).join('');
      bindCardClicks();
    }

    // ── Card click binding ──────────────────────────────────────

    function bindCardClicks() {
      grid.querySelectorAll('.player-card').forEach(function(card) {
        card.addEventListener('click', function() {
          var name = card.dataset.player;
          searchInput.value = name;
          showProfile(name);
        });
      });
    }

    // ── View toggle ─────────────────────────────────────────────

    var toggleBtns = document.querySelectorAll('#view-toggle .filter-btn');
    toggleBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        toggleBtns.forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        currentView = btn.dataset.view;
        if (currentView === 'traveled') {
          renderMostTraveled();
        } else {
          renderTopPlayers();
        }
      });
    });

    // ── Show player profile ─────────────────────────────────────

    function showProfile(playerName) {
      var player = allPlayers.find(function(p) { return p.name === playerName; });
      if (!player) {
        profileDiv.style.display = 'none';
        return;
      }

      topSection.style.display = 'none';
      resultsSection.style.display = 'none';
      profileDiv.style.display = 'block';

      var color = YK.ownerColor(player.owner);
      var ownerName = YK.ownerDisplayName(player.owner);
      var journey = computeJourneyStats(player.movement);

      var html = '';

      // ── Header ──
      html += '<div class="team-profile-header">';
      html += '<div class="color-bar" style="background:' + color + '"></div>';
      html += '<div class="profile-info" style="padding-left:14px">';
      html += '<div class="profile-name">' + YK.escapeHtml(player.name);
      if (player.rank !== undefined) {
        html += ' <span style="background:rgba(232,184,75,0.18);color:#c7960a;font-size:0.72rem;font-weight:800;padding:2px 8px;border-radius:99px;margin-left:8px">#' + player.rank + '</span>';
      }
      html += '</div>';
      html += '<div class="profile-meta">' + YK.escapeHtml(player.pos) + ' &middot; ' + YK.escapeHtml(player.nbaTeam) + ' &middot; ' + YK.statusBadge(player.status) + '</div>';
      html += '<div style="margin-top:4px;font-size:0.82rem">';
      html += '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + color + ';margin-right:4px;vertical-align:middle"></span>';
      html += ownerName + ' (' + YK.escapeHtml(player.teamName || '') + ')';
      html += '</div>';

      // Journey summary badges
      if (journey) {
        html += '<div class="journey-badges">';
        html += '<span class="journey-badge" style="background:rgba(78,154,241,0.12);color:#4e9af1">' + journey.numOwners + ' Owner' + (journey.numOwners !== 1 ? 's' : '') + '</span>';
        html += '<span class="journey-badge" style="background:rgba(231,111,81,0.12);color:#e76f51">' + journey.numTrades + ' Trade' + (journey.numTrades !== 1 ? 's' : '') + '</span>';
        html += '<span class="journey-badge" style="background:rgba(42,157,143,0.12);color:#2a9d8f">' + journey.yearsWithCurrent + ' yr' + (journey.yearsWithCurrent !== 1 ? 's' : '') + ' w/ current</span>';
        html += '</div>';
      }

      // Ownership timeline bar
      if (journey && journey.ownerChain.length > 0) {
        html += '<div class="ownership-timeline" style="margin-top:10px">';
        // Compute proportional widths based on season spans
        var chain = journey.ownerChain;
        for (var ci = 0; ci < chain.length; ci++) {
          var eraOwner = chain[ci].owner;
          var eraColor = YK.ownerColor(eraOwner);
          var eraLabel = (YK.ownerDisplayName(eraOwner) || eraOwner).split(' ').pop();
          var startIdx = ALL_SEASONS.indexOf(chain[ci].season);
          var endIdx;
          if (ci < chain.length - 1) {
            endIdx = ALL_SEASONS.indexOf(chain[ci + 1].season);
          } else {
            endIdx = ALL_SEASONS.indexOf(CURRENT_SEASON) + 1;
          }
          var span = Math.max(1, endIdx - startIdx);
          html += '<div class="ownership-era" style="background:' + eraColor + ';flex:' + span + '">' + YK.escapeHtml(eraLabel) + '</div>';
        }
        html += '</div>';
      }

      html += '</div>'; // close profile-info

      // Stats box in header
      if (player.stats && player.stats.stats && player.stats.stats.ppg) {
        html += '<div class="profile-record" style="text-align:center">';
        html += '<div class="big-num" style="font-size:1.8rem">' + player.stats.stats.ppg + '</div>';
        html += '<div class="rec-label">PPG (' + (player.stats.season || '2024-25') + ')</div>';
        html += '</div>';
      }
      html += '</div>'; // close team-profile-header

      // ── Stats Detail ──
      if (player.stats) {
        var s = player.stats.stats;
        var displaySeason = player.stats.season || '2024-25';
        html += '<div class="chart-section">';
        html += '<h2>&#x1F4CA; Season Stats (' + displaySeason + ')</h2>';
        if (player.stats.note) {
          html += '<p class="chart-description" style="color:var(--text-muted);font-style:italic">' + YK.escapeHtml(player.stats.note) + '</p>';
        }
        html += '<div class="stat-bar">';
        var statPairs = [
          ['GP', s.games || s.gp || '\u2014'],
          ['MPG', s.mpg || '\u2014'],
          ['PPG', s.ppg || '\u2014'],
          ['RPG', s.rpg || '\u2014'],
          ['APG', s.apg || '\u2014'],
          ['SPG', s.spg || '\u2014'],
          ['BPG', s.bpg || '\u2014'],
          ['TO', s.topg || '\u2014'],
          ['FG%', s.fg_pct ? s.fg_pct + '%' : '\u2014'],
          ['3P%', (s.fg3_pct || s['3p_pct']) ? (s.fg3_pct || s['3p_pct']) + '%' : '\u2014'],
          ['FT%', s.ft_pct ? s.ft_pct + '%' : '\u2014'],
        ];
        statPairs.forEach(function(pair) {
          if (pair[1] && pair[1] !== '\u2014' && pair[1] !== '0' && pair[1] !== '0%') {
            html += '<div class="stat-card"><span class="stat-label">' + pair[0] + '</span><span class="stat-value">' + pair[1] + '</span></div>';
          }
        });
        html += '</div></div>';
      }

      // ── Ownership Journey ──
      if (player.movement) {
        html += '<div class="chart-section">';
        html += '<h2>&#x1F504; Ownership Journey</h2>';
        var hist = player.movement.history || [];
        if (hist.length === 0) {
          html += '<p class="text-muted" style="padding:16px">No movement history.</p>';
        } else {
          // Visual journey timeline
          html += '<div class="journey-timeline">';
          hist.forEach(function(h) {
            if (h.type === 'startup') {
              var nodeColor = YK.ownerColor(h.owner);
              html += '<div class="journey-node">';
              html += '<div class="journey-dot" style="background:' + nodeColor + '"></div>';
              html += '<div class="journey-season">' + (h.season || 'Startup') + '</div>';
              html += '<div class="journey-detail">';
              html += '<span class="badge badge-active" style="font-size:0.68rem;margin-right:6px">Drafted</span>';
              html += 'Rostered by <strong>';
              html += '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + nodeColor + ';margin-right:4px;vertical-align:middle"></span>';
              html += YK.ownerDisplayName(h.owner) + '</strong>';
              html += '</div></div>';
            } else if (h.type === 'trade') {
              var fromColor = YK.ownerColor(h.from);
              var toColor = YK.ownerColor(h.to);
              html += '<div class="journey-node">';
              html += '<div class="journey-dot" style="background:' + toColor + '"></div>';
              html += '<div class="journey-season">' + h.season + (h.date ? ' &middot; ' + h.date : '') + '</div>';
              html += '<div class="journey-detail">';
              html += '<span class="badge badge-reserve" style="font-size:0.68rem;margin-right:6px">Traded</span>';
              html += '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + fromColor + ';margin-right:3px;vertical-align:middle"></span>';
              html += YK.ownerDisplayName(h.from);
              html += '<span class="journey-arrow">&rarr;</span>';
              html += '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + toColor + ';margin-right:3px;vertical-align:middle"></span>';
              html += '<strong>' + YK.ownerDisplayName(h.to) + '</strong>';
              html += '</div></div>';
            }
          });

          // "Current" node at the end
          if (player.movement.current_owner) {
            var curColor = YK.ownerColor(player.movement.current_owner);
            html += '<div class="journey-node">';
            html += '<div class="journey-dot" style="background:' + curColor + ';box-shadow:0 0 0 3px ' + curColor + '40"></div>';
            html += '<div class="journey-season">' + CURRENT_SEASON + '</div>';
            html += '<div class="journey-detail">';
            html += '<span class="badge badge-active" style="font-size:0.68rem;margin-right:6px">Current</span>';
            html += '<strong>';
            html += '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + curColor + ';margin-right:4px;vertical-align:middle"></span>';
            html += YK.ownerDisplayName(player.movement.current_owner) + '</strong>';
            if (journey) {
              html += '<span style="color:var(--text-muted);font-size:0.78rem;margin-left:8px">(' + journey.yearsWithCurrent + ' season' + (journey.yearsWithCurrent !== 1 ? 's' : '') + ')</span>';
            }
            html += '</div></div>';
          }

          html += '</div>'; // close journey-timeline
        }
        html += '</div>'; // close chart-section
      }

      // ── Trade Appearances ──
      var playerTrades = tradesData.filter(function(trade) {
        var norm = YK.normalizeName(player.name);
        var found = false;
        (trade.give || []).concat(trade.get || []).forEach(function(item) {
          if (YK.normalizeName(YK.parseAsset(item)) === norm) found = true;
        });
        return found;
      });

      if (playerTrades.length > 0) {
        html += '<div class="chart-section">';
        html += '<h2>&#x1F4DD; Trade Appearances (' + playerTrades.length + ')</h2>';
        html += '<div class="data-table-wrapper"><table class="data-table">';
        html += '<thead><tr><th>Season</th><th>Date</th><th>Give</th><th>Get</th></tr></thead>';
        html += '<tbody>';
        playerTrades.forEach(function(trade) {
          var giveStr = (trade.give || []).map(function(g) {
            var owner = YK.parseOwner(g);
            var clr = YK.ownerColor(owner);
            var last = (YK.ownerDisplayName(owner) || '').split(' ').pop();
            return '<div style="margin-bottom:2px"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:' + clr + ';margin-right:4px;vertical-align:middle"></span><span style="color:var(--text-muted);font-weight:600;font-size:0.75rem">' + YK.escapeHtml(last) + '</span> ' + YK.escapeHtml(YK.parseAsset(g)) + '</div>';
          }).join('');
          var getStr = (trade.get || []).map(function(g) {
            var owner = YK.parseOwner(g);
            var clr = YK.ownerColor(owner);
            var last = (YK.ownerDisplayName(owner) || '').split(' ').pop();
            return '<div style="margin-bottom:2px"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:' + clr + ';margin-right:4px;vertical-align:middle"></span><span style="color:var(--text-muted);font-weight:600;font-size:0.75rem">' + YK.escapeHtml(last) + '</span> ' + YK.escapeHtml(YK.parseAsset(g)) + '</div>';
          }).join('');
          html += '<tr>';
          html += '<td><strong>' + trade.season + '</strong></td>';
          html += '<td style="white-space:nowrap;color:var(--text-muted);font-size:0.8rem">' + (trade.date || '&mdash;') + '</td>';
          html += '<td style="font-size:0.82rem">' + giveStr + '</td>';
          html += '<td style="font-size:0.82rem">' + getStr + '</td>';
          html += '</tr>';
        });
        html += '</tbody></table></div></div>';
      }

      profileDiv.innerHTML = html;
    }

    // ── Search ──────────────────────────────────────────────────

    function doSearch(query) {
      if (!query || query.length < 2) {
        resultsSection.style.display = 'none';
        profileDiv.style.display = 'none';
        topSection.style.display = 'block';
        return;
      }

      var norm = YK.normalizeName(query);
      var matches = allPlayers.filter(function(p) {
        return YK.normalizeName(p.name).includes(norm);
      });

      if (matches.length === 1) {
        showProfile(matches[0].name);
        return;
      }

      topSection.style.display = 'none';
      profileDiv.style.display = 'none';
      resultsSection.style.display = 'block';

      if (matches.length === 0) {
        resultsDiv.innerHTML = '<p class="text-muted" style="padding:16px">No players found matching "' + YK.escapeHtml(query) + '".</p>';
        return;
      }

      resultsDiv.innerHTML = '<div class="data-table-wrapper"><table class="data-table"><thead><tr><th>Player</th><th>Pos</th><th>Team</th><th>Owner</th><th>Rank</th></tr></thead><tbody>' +
        matches.map(function(p) {
          var color = YK.ownerColor(p.owner);
          return '<tr class="clickable" style="cursor:pointer" data-player="' + YK.escapeHtml(p.name) + '">' +
            '<td><strong>' + YK.escapeHtml(p.name) + '</strong></td>' +
            '<td style="color:var(--text-muted)">' + YK.escapeHtml(p.pos) + '</td>' +
            '<td style="color:var(--text-muted)">' + YK.escapeHtml(p.nbaTeam) + '</td>' +
            '<td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + color + ';margin-right:4px;vertical-align:middle"></span>' + YK.ownerDisplayName(p.owner) + '</td>' +
            '<td style="text-align:center">' + (p.rank !== undefined ? '#' + p.rank : '&mdash;') + '</td>' +
          '</tr>';
        }).join('') +
        '</tbody></table></div>';

      resultsDiv.querySelectorAll('tr.clickable').forEach(function(row) {
        row.addEventListener('click', function() {
          var name = row.dataset.player;
          searchInput.value = name;
          showProfile(name);
        });
      });
    }

    var debounceTimer;
    searchInput.addEventListener('input', function() {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function() {
        doSearch(searchInput.value.trim());
      }, 250);
    });

    renderTopPlayers();
  });
})();

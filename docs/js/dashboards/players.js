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
    var rankings = rankingsData.rankings || [];

    // Build all players list: {name, owner, pos, nbaTeam, rank, stats}
    var allPlayers = [];
    var rankMap = {};
    rankings.forEach(function(r) {
      rankMap[YK.normalizeName(r.player)] = r.rank;
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

    var searchInput = document.getElementById('player-search');
    var profileDiv = document.getElementById('player-profile');
    var topSection = document.getElementById('top-players-section');
    var resultsSection = document.getElementById('search-results-section');
    var resultsDiv = document.getElementById('search-results');

    // Render top 20 ranked players
    function renderTopPlayers() {
      var top20 = allPlayers.filter(function(p) { return p.rank !== undefined; }).slice(0, 20);
      var grid = document.getElementById('top-players-grid');
      if (top20.length === 0) {
        grid.innerHTML = '<p class="text-muted" style="padding:20px">No ranked players found.</p>';
        return;
      }
      grid.innerHTML = top20.map(function(p) {
        var color = YK.ownerColor(p.owner);
        var ownerName = YK.ownerDisplayName(p.owner);
        var ppg = p.stats ? p.stats.stats.ppg : '—';
        var rpg = p.stats ? p.stats.stats.rpg : '—';
        var apg = p.stats ? p.stats.stats.apg : '—';
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

      // Click handlers for cards
      grid.querySelectorAll('.player-card').forEach(function(card) {
        card.addEventListener('click', function() {
          var name = card.dataset.player;
          searchInput.value = name;
          showProfile(name);
        });
      });
    }

    // Show player profile
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

      var html = '';

      // Header
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
      html += '</div>';

      // Stats box
      if (player.stats && player.stats.stats && player.stats.stats.ppg) {
        html += '<div class="profile-record" style="text-align:center">';
        html += '<div class="big-num" style="font-size:1.8rem">' + player.stats.stats.ppg + '</div>';
        html += '<div class="rec-label">PPG (' + (player.stats.season || '2024-25') + ')</div>';
        html += '</div>';
      }
      html += '</div>';

      // Stats Detail
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
          ['GP', s.games || s.gp || '—'],
          ['MPG', s.mpg || '—'],
          ['PPG', s.ppg || '—'],
          ['RPG', s.rpg || '—'],
          ['APG', s.apg || '—'],
          ['SPG', s.spg || '—'],
          ['BPG', s.bpg || '—'],
          ['TO', s.topg || '—'],
          ['FG%', s.fg_pct ? s.fg_pct + '%' : '—'],
          ['3P%', (s.fg3_pct || s['3p_pct']) ? (s.fg3_pct || s['3p_pct']) + '%' : '—'],
          ['FT%', s.ft_pct ? s.ft_pct + '%' : '—'],
        ];
        statPairs.forEach(function(pair) {
          if (pair[1] && pair[1] !== '—' && pair[1] !== '0' && pair[1] !== '0%') {
            html += '<div class="stat-card"><span class="stat-label">' + pair[0] + '</span><span class="stat-value">' + pair[1] + '</span></div>';
          }
        });
        html += '</div></div>';
      }

      // Ownership History
      if (player.movement) {
        html += '<div class="chart-section">';
        html += '<h2>&#x1F504; Ownership History</h2>';
        var hist = player.movement.history || [];
        if (hist.length === 0) {
          html += '<p class="text-muted" style="padding:16px">No movement history.</p>';
        } else {
          html += '<div class="data-table-wrapper"><table class="data-table">';
          html += '<thead><tr><th>Type</th><th>Season</th><th>Details</th></tr></thead>';
          html += '<tbody>';
          hist.forEach(function(h) {
            html += '<tr>';
            if (h.type === 'startup') {
              html += '<td><span class="badge badge-active">Startup</span></td>';
              html += '<td>' + (h.season || '—') + '</td>';
              html += '<td>Originally rostered by ' + YK.ownerDisplayName(h.owner) + '</td>';
            } else {
              var fromColor = YK.ownerColor(h.from);
              var toColor = YK.ownerColor(h.to);
              html += '<td><span class="badge badge-reserve">Trade</span></td>';
              html += '<td>' + h.season + (h.date ? ' (' + h.date + ')' : '') + '</td>';
              html += '<td>';
              html += '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:' + fromColor + ';margin-right:3px;vertical-align:middle"></span>' + YK.ownerDisplayName(h.from);
              html += ' &rarr; ';
              html += '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:' + toColor + ';margin-right:3px;vertical-align:middle"></span>' + YK.ownerDisplayName(h.to);
              html += '</td>';
            }
            html += '</tr>';
          });
          html += '</tbody></table></div>';
        }
        html += '</div>';
      }

      // Related Trades
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

    // Search
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

/**
 * team.js — Dashboard module for team.html
 * YK Dynasty Basketball
 */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', async function () {
    const YK = window.YK;

    let seasonsData, tradesData, picksData, rosterData, ownersData, rankingsData, statsData;
    try {
      [seasonsData, tradesData, picksData, rosterData, ownersData, rankingsData] = await Promise.all([
        YK.loadJSON('data/seasons.json'),
        YK.loadJSON('data/trades.json'),
        YK.loadJSON('data/picks.json'),
        YK.loadJSON('data/rosters_2025_26.json').catch(function() { return null; }),
        YK.loadJSON('data/owners.json'),
        YK.loadJSON('data/rankings.json'),
      ]);
      statsData = await YK.loadJSON('data/player_stats.json').catch(function() { return null; });
    } catch (e) {
      console.error('Failed to load data:', e);
      document.getElementById('team-profile').innerHTML = '<div class="error-msg">Failed to load data.</div>';
      return;
    }

    var playerStats = (statsData && statsData.players) || {};

    var seasons = seasonsData.seasons;
    var owners = YK.OWNERS_ALPHA.slice();

    // Build rankings lookup — rankings.json is now a flat array
    var rankMap = {};
    var rankingsArr = Array.isArray(rankingsData) ? rankingsData : (rankingsData.rankings || []);
    rankingsArr.forEach(function(r) {
      var name = r.player_name || r.player;
      rankMap[YK.normalizeName(name)] = r.rank;
    });

    // Build owner select dropdown
    var select = document.getElementById('owner-select');
    owners.forEach(function(o) {
      var opt = document.createElement('option');
      opt.value = o;
      opt.textContent = YK.ownerDisplayName(o);
      select.appendChild(opt);
    });

    // Read from URL param
    var params = new URLSearchParams(window.location.search);
    var initialOwner = params.get('owner');
    if (initialOwner && owners.includes(initialOwner)) {
      select.value = initialOwner;
    }

    select.addEventListener('change', function() {
      renderProfile(select.value);
      history.pushState(null, '', '?owner=' + select.value);
    });

    // Handle back/forward
    window.addEventListener('popstate', function() {
      var p = new URLSearchParams(window.location.search);
      var o = p.get('owner');
      if (o && owners.includes(o)) {
        select.value = o;
        renderProfile(o);
      }
    });

    function renderProfile(ownerKey) {
      var container = document.getElementById('team-profile');
      var color = YK.ownerColor(ownerKey);
      var displayName = YK.ownerDisplayName(ownerKey);

      // Find owner data from owners.json
      var ownerObj = (ownersData.owners || []).find(function(o) {
        return YK.resolveOwner(o.id) === ownerKey;
      });

      // === A. Profile Header ===
      var totalW = 0, totalL = 0, totalSeasons = 0, totalTitles = 0;
      var currentTeam = '';
      seasons.forEach(function(s) {
        s.standings.forEach(function(entry) {
          if (YK.teamToOwner(entry.team) === ownerKey) {
            totalW += entry.w;
            totalL += entry.l;
            totalSeasons++;
            if (s.champion === entry.team) totalTitles++;
            if (s.year === '2025-26') currentTeam = entry.team;
          }
        });
      });
      var totalPct = (totalW + totalL) > 0 ? totalW / (totalW + totalL) : 0;

      var headerHtml = '<div class="team-profile-header">';
      headerHtml += '<div class="color-bar" style="background:' + color + '"></div>';
      headerHtml += '<div class="profile-info">';
      headerHtml += '<div class="profile-name">' + displayName + '</div>';
      headerHtml += '<div class="profile-meta">' + (currentTeam || 'No current team') + ' &middot; ' + totalSeasons + ' season' + (totalSeasons !== 1 ? 's' : '');
      if (totalTitles > 0) headerHtml += ' &middot; ' + totalTitles + ' title' + (totalTitles !== 1 ? 's' : '');
      headerHtml += '</div>';

      // Ownership timeline for Baden
      if (ownerObj && ownerObj.franchiseHistory && ownerObj.franchiseHistory.length > 1) {
        headerHtml += '<div class="ownership-timeline">';
        var timelineColors = ['#4e79a7', '#f28e2b', '#59a14f'];
        ownerObj.franchiseHistory.forEach(function(era, idx) {
          headerHtml += '<div class="ownership-era" style="background:' + timelineColors[idx % 3] + ';flex:1">';
          headerHtml += era.owner + ' (' + era.period + ')';
          headerHtml += '</div>';
        });
        headerHtml += '</div>';
      }
      headerHtml += '</div>';
      headerHtml += '<div class="profile-record">';
      headerHtml += '<div class="big-num">' + totalW + '-' + totalL + '</div>';
      headerHtml += '<div class="rec-label">' + (totalPct * 100).toFixed(1) + '% All-Time</div>';
      headerHtml += '</div>';
      headerHtml += '</div>';

      // === B. Season-by-Season Record Table ===
      var seasonHtml = '<div class="chart-section">';
      seasonHtml += '<h2>&#x1F4C5; Season-by-Season Record</h2>';
      seasonHtml += '<div class="data-table-wrapper"><table class="data-table">';
      seasonHtml += '<thead><tr><th>Season</th><th>Team</th><th>Finish</th><th>Record</th><th>Win %</th><th>FPTS</th><th></th></tr></thead>';
      seasonHtml += '<tbody>';

      var seasonRows = [];
      seasons.forEach(function(s) {
        s.standings.forEach(function(entry) {
          if (YK.teamToOwner(entry.team) === ownerKey) {
            var isChamp = s.champion === entry.team;
            seasonRows.push({
              year: s.year,
              team: entry.team,
              rank: entry.rank,
              w: entry.w,
              l: entry.l,
              pct: entry.win_pct,
              fpts: entry.fpts,
              isChamp: isChamp,
              inProgress: s.in_progress,
            });
          }
        });
      });

      seasonRows.forEach(function(r) {
        seasonHtml += '<tr>';
        seasonHtml += '<td><strong>' + r.year + '</strong></td>';
        seasonHtml += '<td>' + r.team + '</td>';
        seasonHtml += '<td style="text-align:center">' + r.rank + (r.rank === 1 ? 'st' : r.rank === 2 ? 'nd' : r.rank === 3 ? 'rd' : 'th') + '</td>';
        seasonHtml += '<td style="text-align:center;font-weight:600">' + r.w + '-' + r.l + '</td>';
        seasonHtml += '<td style="text-align:center">' + (r.pct * 100).toFixed(1) + '%</td>';
        seasonHtml += '<td style="text-align:right">' + r.fpts.toLocaleString() + '</td>';
        seasonHtml += '<td style="text-align:center">';
        if (r.isChamp) seasonHtml += '<span class="badge badge-champ">Champ</span>';
        if (r.inProgress) seasonHtml += '<span class="badge badge-active">In Progress</span>';
        seasonHtml += '</td>';
        seasonHtml += '</tr>';
      });

      // Totals row
      if (seasonRows.length > 0) {
        seasonHtml += '<tr style="background:var(--bg-primary);font-weight:700;border-top:2px solid var(--border-strong)">';
        seasonHtml += '<td colspan="3"><strong>TOTAL</strong></td>';
        seasonHtml += '<td style="text-align:center">' + totalW + '-' + totalL + '</td>';
        seasonHtml += '<td style="text-align:center">' + (totalPct * 100).toFixed(1) + '%</td>';
        var totalFpts = seasonRows.reduce(function(sum, r) { return sum + r.fpts; }, 0);
        seasonHtml += '<td style="text-align:right">' + totalFpts.toLocaleString() + '</td>';
        seasonHtml += '<td>' + (totalTitles > 0 ? totalTitles + 'x Champ' : '') + '</td>';
        seasonHtml += '</tr>';
      }
      seasonHtml += '</tbody></table></div></div>';

      // === C. Trade Log ===
      var ownerTrades = tradesData.filter(function(trade) {
        var involved = false;
        (trade.give || []).concat(trade.get || []).forEach(function(item) {
          if (YK.parseOwner(item) === ownerKey) involved = true;
        });
        return involved;
      });

      var tradeHtml = '<div class="chart-section">';
      tradeHtml += '<h2>&#x1F504; Trade Log (' + ownerTrades.length + ' trades)</h2>';
      if (ownerTrades.length === 0) {
        tradeHtml += '<p class="text-muted" style="padding:16px">No trades on record.</p>';
      } else {
        tradeHtml += '<div class="data-table-wrapper"><table class="data-table">';
        tradeHtml += '<thead><tr><th>Season</th><th>Date</th><th>Give</th><th>Get</th></tr></thead>';
        tradeHtml += '<tbody>';
        ownerTrades.forEach(function(trade) {
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
          tradeHtml += '<tr>';
          tradeHtml += '<td><strong>' + trade.season + '</strong></td>';
          tradeHtml += '<td style="white-space:nowrap;color:var(--text-muted);font-size:0.8rem">' + (trade.date || '&mdash;') + '</td>';
          tradeHtml += '<td style="font-size:0.82rem">' + giveStr + '</td>';
          tradeHtml += '<td style="font-size:0.82rem">' + getStr + '</td>';
          tradeHtml += '</tr>';
        });
        tradeHtml += '</tbody></table></div>';
      }
      tradeHtml += '</div>';

      // === D. Draft Picks Owned ===
      var pickYears = Object.keys(picksData).sort();
      var picksHtml = '<div class="chart-section">';
      picksHtml += '<h2>&#x1F4CB; Draft Picks Owned</h2>';
      picksHtml += '<div class="data-table-wrapper" style="border:none">';
      picksHtml += '<div class="pick-grid" style="grid-template-columns: 100px repeat(' + pickYears.length + ', 1fr);">';

      // Header
      picksHtml += '<div class="pick-cell header">Year</div>';
      pickYears.forEach(function(yr) {
        picksHtml += '<div class="pick-cell header" style="text-align:center">' + yr + '</div>';
      });

      // Single row for this owner
      picksHtml += '<div class="pick-cell owner-name">Picks</div>';
      var totalOwnerPicks = 0;
      pickYears.forEach(function(yr) {
        var picks = (picksData[yr] && picksData[yr][ownerKey]) || [];
        totalOwnerPicks += picks.length;
        if (picks.length === 0) {
          picksHtml += '<div class="pick-cell pick-content" style="text-align:center;color:var(--text-muted)">&mdash;</div>';
        } else {
          var items = picks.map(function(p) {
            var is1st = p.toLowerCase().includes('1st');
            var cls = is1st ? 'pick-1st' : 'pick-2nd';
            var colorCls = YK.classifyPick(p, ownerKey);
            return '<div class="pick-item ' + cls + ' ' + colorCls + '">' + YK.escapeHtml(p) + '</div>';
          }).join('');
          picksHtml += '<div class="pick-cell pick-content">' + items + '</div>';
        }
      });

      picksHtml += '</div></div>';
      picksHtml += '<p class="chart-insight"><strong>' + totalOwnerPicks + '</strong> total picks across ' + pickYears[0] + '&ndash;' + pickYears[pickYears.length - 1] + '.</p>';
      picksHtml += '</div>';

      // === E. Dynasty Assets ===
      var assetsHtml = '<div class="chart-section">';
      assetsHtml += '<h2>&#x2B50; Dynasty Assets</h2>';

      var rankedOnRoster = [];
      var teamPlayers = teamData && teamData.players ? teamData.players : [];
      teamPlayers.forEach(function(p) {
        var rank = rankMap[YK.normalizeName(p.name)];
        if (rank !== undefined) {
          rankedOnRoster.push({ name: p.name, rank: rank, pos: p.pos || '', nbaTeam: p.nbaTeam || '' });
        }
      });
      rankedOnRoster.sort(function(a, b) { return a.rank - b.rank; });

      if (rankedOnRoster.length === 0) {
        assetsHtml += '<p class="text-muted" style="padding:16px">No dynasty-ranked players on this roster.</p>';
      } else {
        assetsHtml += '<div style="display:flex;flex-wrap:wrap;gap:8px;padding:8px 0">';
        rankedOnRoster.forEach(function(p) {
          var tierColor, tierLabel;
          if (p.rank <= 10) { tierColor = 'var(--brand-gold)'; tierLabel = 'T1'; }
          else if (p.rank <= 25) { tierColor = '#c0c0c0'; tierLabel = 'T2'; }
          else if (p.rank <= 50) { tierColor = '#cd7f32'; tierLabel = 'T3'; }
          else { tierColor = 'var(--text-muted)'; tierLabel = ''; }

          assetsHtml += '<div style="display:flex;align-items:center;gap:6px;padding:6px 12px;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;font-size:0.85rem">';
          assetsHtml += '<span style="background:' + tierColor + ';color:' + (p.rank <= 50 ? '#000' : '#fff') + ';font-size:0.65rem;font-weight:800;padding:2px 6px;border-radius:99px">#' + p.rank + '</span>';
          assetsHtml += '<strong>' + YK.escapeHtml(p.name) + '</strong>';
          assetsHtml += '<span style="color:var(--text-muted);font-size:0.75rem">' + YK.escapeHtml(p.pos) + '</span>';
          assetsHtml += '</div>';
        });
        assetsHtml += '</div>';
      }
      assetsHtml += '</div>';

      // === F. Current Roster ===
      var rosterHtml = '<div class="chart-section">';
      rosterHtml += '<h2>&#x1F4DD; Current Roster (2025-26)</h2>';

      var teamData = rosterData && rosterData.teams && rosterData.teams[ownerKey];
      if (!teamData || !teamData.players || teamData.players.length === 0) {
        rosterHtml += '<p class="text-muted" style="padding:16px">No roster data available.</p>';
      } else {
        var players = teamData.players.slice();
        // Sort by dynasty rank
        players.sort(function(a, b) {
          var ra = rankMap[YK.normalizeName(a.name)];
          var rb = rankMap[YK.normalizeName(b.name)];
          if (ra !== undefined && rb !== undefined) return ra - rb;
          if (ra !== undefined) return -1;
          if (rb !== undefined) return 1;
          return a.name.localeCompare(b.name);
        });

        // Team strength summary
        var rankedCount = 0;
        var totalRankScore = 0;
        var totalPpg = 0;
        var ppgCount = 0;
        players.forEach(function(p) {
          var rank = rankMap[YK.normalizeName(p.name)];
          if (rank !== undefined) { rankedCount++; totalRankScore += rank; }
          var ps = playerStats[p.name];
          if (ps && ps.stats) { totalPpg += ps.stats.ppg; ppgCount++; }
        });
        var avgRank = rankedCount > 0 ? (totalRankScore / rankedCount).toFixed(1) : '—';
        var avgPpg = ppgCount > 0 ? (totalPpg / ppgCount).toFixed(1) : '—';

        rosterHtml += '<div class="stat-bar" style="margin-bottom:16px">';
        rosterHtml += '<div class="stat-card"><span class="stat-label">Players</span><span class="stat-value">' + players.length + '</span></div>';
        rosterHtml += '<div class="stat-card"><span class="stat-label">Dynasty Ranked</span><span class="stat-value">' + rankedCount + '</span></div>';
        rosterHtml += '<div class="stat-card"><span class="stat-label">Avg Rank</span><span class="stat-value">' + avgRank + '</span></div>';
        rosterHtml += '<div class="stat-card"><span class="stat-label">Avg PPG</span><span class="stat-value">' + avgPpg + '</span></div>';
        rosterHtml += '</div>';

        rosterHtml += '<p class="chart-description">' + teamData.team_name + ' &middot; ' + players.length + ' players</p>';
        rosterHtml += '<div class="data-table-wrapper"><table class="data-table">';
        rosterHtml += '<thead><tr><th>Player</th><th>Pos</th><th>NBA Team</th><th style="text-align:center">PPG</th><th style="text-align:center">RPG</th><th style="text-align:center">APG</th><th>Status</th></tr></thead>';
        rosterHtml += '<tbody>';
        players.forEach(function(p) {
          var rank = rankMap[YK.normalizeName(p.name)];
          var rankBadge = rank !== undefined
            ? ' <span style="background:rgba(232,184,75,0.18);color:#c7960a;font-size:0.68rem;font-weight:800;padding:1px 5px;border-radius:99px;margin-left:4px">#' + rank + '</span>'
            : '';
          var ps = playerStats[p.name];
          var ppg = ps ? ps.stats.ppg : '—';
          var rpg = ps ? ps.stats.rpg : '—';
          var apg = ps ? ps.stats.apg : '—';
          rosterHtml += '<tr>';
          rosterHtml += '<td><strong>' + YK.escapeHtml(p.name) + '</strong>' + rankBadge + '</td>';
          rosterHtml += '<td style="color:var(--text-muted)">' + YK.escapeHtml(p.pos || '—') + '</td>';
          rosterHtml += '<td style="color:var(--text-muted)">' + YK.escapeHtml(p.nbaTeam || '—') + '</td>';
          rosterHtml += '<td style="text-align:center">' + ppg + '</td>';
          rosterHtml += '<td style="text-align:center">' + rpg + '</td>';
          rosterHtml += '<td style="text-align:center">' + apg + '</td>';
          rosterHtml += '<td>' + YK.statusBadge(p.status) + '</td>';
          rosterHtml += '</tr>';
        });
        rosterHtml += '</tbody></table></div>';
      }
      rosterHtml += '</div>';

      // Combine all sections
      container.innerHTML = headerHtml + seasonHtml + tradeHtml + picksHtml + assetsHtml + rosterHtml;
    }

    // Render initial profile
    renderProfile(select.value);
  });
})();

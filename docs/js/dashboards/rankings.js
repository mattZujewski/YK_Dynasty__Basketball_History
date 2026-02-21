/**
 * rankings.js — Dashboard module for rankings.html
 * YK Dynasty Basketball
 */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', async function () {
    var YK = window.YK;

    var rankingsData, statsData;
    try {
      [rankingsData, statsData] = await Promise.all([
        YK.loadJSON('data/rankings.json'),
        YK.loadJSON('data/player_stats.json').catch(function() { return null; }),
      ]);
    } catch (e) {
      console.error('Failed to load data:', e);
      return;
    }

    var stats = (statsData && statsData.players) || {};

    // Rankings now is a flat array with owned_by, fantasy_team, position, nba_team, age
    var rankings = Array.isArray(rankingsData) ? rankingsData : (rankingsData.rankings || []);

    // Build ranked players with stats
    var rankedPlayers = rankings.map(function(r) {
      var playerStats = stats[r.player_name] || null;
      var pos = r.position || (playerStats ? playerStats.pos : '') || '';
      var nbaTeam = r.nba_team || (playerStats ? playerStats.nba_team : '') || '';

      return {
        rank: r.rank,
        player: r.player_name,
        owner: r.owned_by || null,
        fantasyTeam: r.fantasy_team || null,
        pos: pos,
        nbaTeam: nbaTeam,
        age: r.age || null,
        ppg: playerStats ? playerStats.stats.ppg : null,
        rpg: playerStats ? playerStats.stats.rpg : null,
        apg: playerStats ? playerStats.stats.apg : null,
      };
    });

    // Populate owner filter
    var ownerFilter = document.getElementById('owner-filter');
    var uniqueOwners = [];
    rankedPlayers.forEach(function(p) {
      if (p.owner && uniqueOwners.indexOf(p.owner) === -1) uniqueOwners.push(p.owner);
    });
    uniqueOwners.sort();
    uniqueOwners.forEach(function(o) {
      var opt = document.createElement('option');
      opt.value = o;
      opt.textContent = YK.ownerDisplayName(o);
      ownerFilter.appendChild(opt);
    });

    var posFilter = document.getElementById('pos-filter');
    var statusFilter = document.getElementById('status-filter');
    var statsBar = document.getElementById('rankings-stats');
    var tbody = document.getElementById('rankings-tbody');
    var desc = document.getElementById('rankings-desc');

    function tierBadge(rank) {
      if (rank <= 10) return '<span class="badge" style="background:var(--brand-gold);color:#000;font-size:0.65rem;margin-left:6px">T1</span>';
      if (rank <= 25) return '<span class="badge" style="background:#c0c0c0;color:#000;font-size:0.65rem;margin-left:6px">T2</span>';
      if (rank <= 50) return '<span class="badge" style="background:#cd7f32;color:#fff;font-size:0.65rem;margin-left:6px">T3</span>';
      return '';
    }

    function render() {
      var posVal = posFilter.value;
      var ownerVal = ownerFilter.value;
      var statusVal = statusFilter ? statusFilter.value : 'all';

      var filtered = rankedPlayers.filter(function(p) {
        if (posVal !== 'all' && p.pos !== posVal) return false;
        if (ownerVal !== 'all' && p.owner !== ownerVal) return false;
        if (statusVal === 'owned' && !p.owner) return false;
        if (statusVal === 'available' && p.owner) return false;
        return true;
      });

      // Stats bar
      var ownedCount = filtered.filter(function(p) { return p.owner; }).length;
      var freeAgents = filtered.filter(function(p) { return !p.owner; }).length;
      var avgPpg = 0;
      var ppgCount = 0;
      filtered.forEach(function(p) {
        if (p.ppg !== null) { avgPpg += p.ppg; ppgCount++; }
      });
      avgPpg = ppgCount > 0 ? (avgPpg / ppgCount).toFixed(1) : '—';

      statsBar.innerHTML =
        '<div class="stat-card"><span class="stat-label">Showing</span><span class="stat-value">' + filtered.length + '</span></div>' +
        '<div class="stat-card"><span class="stat-label">Rostered</span><span class="stat-value">' + ownedCount + '</span></div>' +
        '<div class="stat-card"><span class="stat-label">Free Agents</span><span class="stat-value">' + freeAgents + '</span></div>' +
        '<div class="stat-card"><span class="stat-label">Avg PPG</span><span class="stat-value">' + avgPpg + '</span></div>';

      desc.textContent = filtered.length + ' ranked players' +
        (posVal !== 'all' ? ' at ' + posVal : '') +
        (ownerVal !== 'all' ? ' owned by ' + YK.ownerDisplayName(ownerVal) : '') +
        (statusVal === 'owned' ? ' (rostered only)' : '') +
        (statusVal === 'available' ? ' (free agents only)' : '');

      // Table
      if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted" style="padding:24px">No ranked players match your filters.</td></tr>';
        return;
      }

      tbody.innerHTML = filtered.map(function(p) {
        var ownerCell;
        if (p.owner) {
          var color = YK.ownerColor(p.owner);
          ownerCell = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + color + ';margin-right:6px;vertical-align:middle"></span>' + YK.ownerDisplayName(p.owner);
        } else {
          ownerCell = '<span style="color:var(--text-muted);font-style:italic">Free Agent</span>';
        }

        return '<tr data-rank="' + p.rank + '" data-player="' + YK.escapeHtml(p.player) + '" data-pos="' + YK.escapeHtml(p.pos) + '" data-team="' + YK.escapeHtml(p.nbaTeam) + '" data-owner="' + (p.owner || '') + '" data-ppg="' + (p.ppg || 0) + '" data-rpg="' + (p.rpg || 0) + '" data-apg="' + (p.apg || 0) + '" data-age="' + (p.age || 0) + '">' +
          '<td style="text-align:center;font-weight:700;color:var(--text-muted)">' + p.rank + tierBadge(p.rank) + '</td>' +
          '<td><strong>' + YK.escapeHtml(p.player) + '</strong></td>' +
          '<td style="color:var(--text-muted)">' + YK.escapeHtml(p.pos) + '</td>' +
          '<td style="color:var(--text-muted)">' + YK.escapeHtml(p.nbaTeam || '') + '</td>' +
          '<td>' + ownerCell + '</td>' +
          '<td style="text-align:center">' + (p.age || '—') + '</td>' +
          '<td style="text-align:center">' + (p.ppg !== null ? p.ppg : '—') + '</td>' +
          '<td style="text-align:center">' + (p.rpg !== null ? p.rpg : '—') + '</td>' +
          '<td style="text-align:center">' + (p.apg !== null ? p.apg : '—') + '</td>' +
        '</tr>';
      }).join('');
    }

    posFilter.addEventListener('change', render);
    ownerFilter.addEventListener('change', render);
    if (statusFilter) statusFilter.addEventListener('change', render);

    render();

    // Make table sortable
    YK.makeSortable(document.getElementById('rankings-table'));
  });
})();

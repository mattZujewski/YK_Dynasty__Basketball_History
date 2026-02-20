/**
 * rankings.js — Dashboard module for rankings.html
 * YK Dynasty Basketball
 */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', async function () {
    var YK = window.YK;

    var rosterData, statsData, rankingsData;
    try {
      [rosterData, rankingsData] = await Promise.all([
        YK.loadJSON('data/rosters_2025_26.json'),
        YK.loadJSON('data/rankings.json'),
      ]);
      statsData = await YK.loadJSON('data/player_stats.json').catch(function() { return null; });
    } catch (e) {
      console.error('Failed to load data:', e);
      return;
    }

    var teams = rosterData.teams || {};
    var stats = (statsData && statsData.players) || {};
    var rankings = rankingsData.rankings || [];

    // Build player → owner lookup
    var playerOwner = {};
    var playerMeta = {};
    Object.keys(teams).forEach(function(owner) {
      (teams[owner].players || []).forEach(function(p) {
        var norm = YK.normalizeName(p.name);
        playerOwner[norm] = owner;
        playerMeta[norm] = { pos: p.pos || '', nbaTeam: p.nbaTeam || '' };
      });
    });

    // Build ranked players with enriched data
    var rankedPlayers = rankings.map(function(r) {
      var norm = YK.normalizeName(r.player);
      var owner = playerOwner[norm] || null;
      var meta = playerMeta[norm] || {};
      var playerStats = stats[r.player] || null;
      return {
        rank: r.rank,
        player: r.player,
        owner: owner,
        pos: meta.pos || (playerStats ? playerStats.pos : ''),
        nbaTeam: meta.nbaTeam || (playerStats ? playerStats.nba_team : ''),
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
    var statsBar = document.getElementById('rankings-stats');
    var tbody = document.getElementById('rankings-tbody');
    var desc = document.getElementById('rankings-desc');

    function render() {
      var posVal = posFilter.value;
      var ownerVal = ownerFilter.value;

      var filtered = rankedPlayers.filter(function(p) {
        if (posVal !== 'all' && p.pos !== posVal) return false;
        if (ownerVal !== 'all' && p.owner !== ownerVal) return false;
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
        (ownerVal !== 'all' ? ' owned by ' + YK.ownerDisplayName(ownerVal) : '');

      // Table
      if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted" style="padding:24px">No ranked players match your filters.</td></tr>';
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

        return '<tr>' +
          '<td style="text-align:center;font-weight:700;color:var(--text-muted)">' + p.rank + '</td>' +
          '<td><strong>' + YK.escapeHtml(p.player) + '</strong></td>' +
          '<td style="color:var(--text-muted)">' + YK.escapeHtml(p.pos) + '</td>' +
          '<td style="color:var(--text-muted)">' + YK.escapeHtml(p.nbaTeam) + '</td>' +
          '<td>' + ownerCell + '</td>' +
          '<td style="text-align:center">' + (p.ppg !== null ? p.ppg : '—') + '</td>' +
          '<td style="text-align:center">' + (p.rpg !== null ? p.rpg : '—') + '</td>' +
          '<td style="text-align:center">' + (p.apg !== null ? p.apg : '—') + '</td>' +
        '</tr>';
      }).join('');
    }

    posFilter.addEventListener('change', render);
    ownerFilter.addEventListener('change', render);

    render();

    // Make table sortable
    YK.makeSortable(document.getElementById('rankings-table'));
  });
})();

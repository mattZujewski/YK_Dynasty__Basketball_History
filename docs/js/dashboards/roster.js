/**
 * roster.js — Dashboard module for roster.html
 * YK Dynasty Basketball
 */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', async function () {
    const YK = window.YK;
    const grid = document.getElementById('roster-grid');

    let rosterData, seasonsData, rankingsData, statsData;
    try {
      [rosterData, seasonsData, rankingsData] = await Promise.all([
        YK.loadJSON('data/rosters_2025_26.json'),
        YK.loadJSON('data/seasons.json'),
        YK.loadJSON('data/rankings.json'),
      ]);
      statsData = await YK.loadJSON('data/player_stats.json').catch(function() { return null; });
    } catch (e) {
      console.warn('No roster data found:', e);
      grid.style.display = 'none';
      document.getElementById('no-data-msg').style.display = 'block';
      return;
    }

    const teams = rosterData.teams || {};
    const ownerKeys = Object.keys(teams);
    const playerStats = (statsData && statsData.players) || {};

    if (ownerKeys.length === 0) {
      grid.style.display = 'none';
      document.getElementById('no-data-msg').style.display = 'block';
      return;
    }

    // Dynamic subtitle
    document.getElementById('roster-subtitle').innerHTML =
      (rosterData.season || '2025&ndash;26') + ' rosters pulled from Fantrax';

    // Build standings rank map for 2025-26
    const currentSeason = seasonsData.seasons.find(s => s.year === '2025-26');
    const standingsRank = {};
    const standingsRecord = {};
    if (currentSeason) {
      currentSeason.standings.forEach(entry => {
        const owner = YK.teamToOwner(entry.team);
        if (owner) {
          standingsRank[owner] = entry.rank;
          standingsRecord[owner] = { w: entry.w, l: entry.l, pct: entry.win_pct };
        }
      });
    }

    // Build rankings lookup (accent-normalized)
    const rankMap = {};
    (rankingsData.rankings || []).forEach(r => {
      rankMap[YK.normalizeName(r.player)] = r.rank;
    });

    // Sort owners by standings rank (best first), unranked at end
    const sortedOwners = ownerKeys.slice().sort((a, b) => {
      const ra = standingsRank[a] || 99;
      const rb = standingsRank[b] || 99;
      return ra - rb;
    });

    // Stat bar
    let totalPlayers = 0;
    let rankedOnRosters = 0;
    sortedOwners.forEach(key => {
      const players = teams[key].players || [];
      totalPlayers += players.length;
      players.forEach(p => {
        if (rankMap[YK.normalizeName(p.name)] !== undefined) rankedOnRosters++;
      });
    });
    document.getElementById('stat-total-players').textContent = totalPlayers;
    document.getElementById('stat-avg-roster').textContent =
      ownerKeys.length > 0 ? (totalPlayers / ownerKeys.length).toFixed(1) : '—';
    document.getElementById('stat-ranked').textContent = rankedOnRosters;

    // Build roster cards
    let html = '';
    sortedOwners.forEach(ownerKey => {
      const team = teams[ownerKey];
      const color = YK.ownerColor(ownerKey);
      const displayName = YK.ownerDisplayName(ownerKey);
      const teamName = team.team_name || '—';
      const players = (team.players || []).slice();

      // Sort players: ranked first (by rank ascending), then unranked alphabetically
      players.sort((a, b) => {
        const ra = rankMap[YK.normalizeName(a.name)];
        const rb = rankMap[YK.normalizeName(b.name)];
        if (ra !== undefined && rb !== undefined) return ra - rb;
        if (ra !== undefined) return -1;
        if (rb !== undefined) return 1;
        return a.name.localeCompare(b.name);
      });

      const rec = standingsRecord[ownerKey];
      const recordStr = rec ? rec.w + '-' + rec.l + ' (' + (rec.pct * 100).toFixed(1) + '%)' : '';

      html += '<div class="roster-card" style="border-top:3px solid ' + color + '">';
      html += '<div class="roster-card-header">';
      html += '<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:' + color + ';margin-right:8px;vertical-align:middle"></span>';
      html += '<strong>' + displayName + '</strong>';
      html += '<span style="color:var(--text-muted);font-size:0.82rem;margin-left:8px">' + teamName + '</span>';
      if (rec) {
        html += '<span style="margin-left:auto;font-size:0.78rem;font-weight:700;color:var(--brand-green)">' + recordStr + '</span>';
      } else {
        html += '<span style="margin-left:auto"></span>';
      }
      html += '<span class="badge badge-active" style="margin-left:10px;font-size:0.72rem">' + players.length + '</span>';
      html += '</div>';
      html += '<div class="roster-card-body">';

      if (players.length === 0) {
        html += '<div style="color:var(--text-muted);padding:12px;text-align:center;font-style:italic">No player data available</div>';
      } else {
        html += '<table class="roster-player-table">';
        html += '<thead><tr><th>Player</th><th>Pos</th><th>Team</th><th style="text-align:center">PPG</th><th style="text-align:center">RPG</th><th style="text-align:center">APG</th><th>Status</th></tr></thead>';
        html += '<tbody>';
        players.forEach(p => {
          const rank = rankMap[YK.normalizeName(p.name)];
          const rankBadge = rank !== undefined
            ? ' <span style="background:rgba(232,184,75,0.18);color:#c7960a;font-size:0.68rem;font-weight:800;padding:1px 5px;border-radius:99px;margin-left:4px">#' + rank + '</span>'
            : '';
          const ps = playerStats[p.name];
          const ppg = ps ? ps.stats.ppg : '—';
          const rpg = ps ? ps.stats.rpg : '—';
          const apg = ps ? ps.stats.apg : '—';
          html += '<tr>';
          html += '<td><strong>' + YK.escapeHtml(p.name) + '</strong>' + rankBadge + '</td>';
          html += '<td style="color:var(--text-muted)">' + YK.escapeHtml(p.pos || '—') + '</td>';
          html += '<td style="color:var(--text-muted)">' + YK.escapeHtml(p.nbaTeam || '—') + '</td>';
          html += '<td style="text-align:center;font-size:0.82rem">' + ppg + '</td>';
          html += '<td style="text-align:center;font-size:0.82rem">' + rpg + '</td>';
          html += '<td style="text-align:center;font-size:0.82rem">' + apg + '</td>';
          html += '<td>' + YK.statusBadge(p.status) + '</td>';
          html += '</tr>';
        });
        html += '</tbody></table>';
      }

      html += '</div></div>';
    });

    grid.innerHTML = html;
  });
})();

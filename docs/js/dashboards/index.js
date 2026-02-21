/**
 * index.js — Dashboard module for index.html
 * YK Dynasty Basketball
 */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', async function () {
    const YK = window.YK;

    let seasonsData, tradesData, rankingsData;
    try {
      [seasonsData, tradesData, rankingsData] = await Promise.all([
        YK.loadJSON('data/seasons.json'),
        YK.loadJSON('data/trades.json'),
        YK.loadJSON('data/rankings.json'),
      ]);
    } catch (e) {
      console.error('Failed to load data:', e);
      return;
    }

    const seasons = seasonsData.seasons;

    // Dynamic subtitle
    document.getElementById('index-subtitle').innerHTML =
      'Fantrax NBA Dynasty League &middot; Est. 2020 &middot; ' + seasons.length + ' Seasons';

    // Dynamic stat bar
    const champCount = seasons.filter(function(s) { return s.champion; }).length;
    document.getElementById('stat-bar').innerHTML =
      '<div class="stat-card">' +
        '<span class="stat-label">Seasons</span>' +
        '<span class="stat-value">' + seasons.length + '</span>' +
      '</div>' +
      '<div class="stat-card">' +
        '<span class="stat-label">Franchises</span>' +
        '<span class="stat-value gold">10</span>' +
      '</div>' +
      '<div class="stat-card">' +
        '<span class="stat-label">Total Trades</span>' +
        '<span class="stat-value">' + tradesData.length + '</span>' +
      '</div>' +
      '<div class="stat-card">' +
        '<span class="stat-label">Champions</span>' +
        '<span class="stat-value gold">' + champCount + '</span>' +
      '</div>';

    document.getElementById('card-trade-tag').textContent = tradesData.length + ' Trades';

    // --- Owner Overview Table ---
    // Count trades per owner
    var tradeCounts = {};
    tradesData.forEach(function(trade) {
      var owners = new Set();
      (trade.give || []).concat(trade.get || []).forEach(function(item) {
        var owner = YK.parseOwner(item);
        if (owner && YK.OWNERS_ALPHA.includes(owner)) owners.add(owner);
      });
      owners.forEach(function(o) { tradeCounts[o] = (tradeCounts[o] || 0) + 1; });
    });

    // Aggregate W/L/Titles by owner
    var ownerStats = {};
    YK.OWNERS_ALPHA.forEach(function(o) {
      ownerStats[o] = { w: 0, l: 0, titles: 0, pct: 0 };
    });

    seasons.forEach(function(season) {
      season.standings.forEach(function(entry) {
        var owner = YK.teamToOwner(entry.team);
        if (!owner || !ownerStats[owner]) return;
        ownerStats[owner].w += entry.w;
        ownerStats[owner].l += entry.l;
        if (season.champion === entry.team) ownerStats[owner].titles++;
      });
    });

    Object.keys(ownerStats).forEach(function(o) {
      var s = ownerStats[o];
      s.pct = (s.w + s.l) > 0 ? s.w / (s.w + s.l) : 0;
    });

    // Sort by win%
    var sortedOverview = YK.OWNERS_ALPHA.slice().sort(function(a, b) {
      return ownerStats[b].pct - ownerStats[a].pct || ownerStats[b].w - ownerStats[a].w;
    });

    var overviewTbody = document.getElementById('owner-overview-tbody');
    overviewTbody.innerHTML = sortedOverview.map(function(owner) {
      var s = ownerStats[owner];
      var color = YK.ownerColor(owner);
      var displayName = YK.ownerDisplayName(owner);
      var tc = tradeCounts[owner] || 0;
      return '<tr class="clickable" data-owner="' + displayName + '" data-w="' + s.w + '" data-l="' + s.l + '" data-pct="' + s.pct.toFixed(3) + '" data-titles="' + s.titles + '" data-trades="' + tc + '" onclick="window.location.href=\'team.html?owner=' + owner + '\'">' +
        '<td>' +
          '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + color + ';margin-right:7px;vertical-align:middle"></span>' +
          '<strong>' + displayName + '</strong>' +
          (s.titles > 0 ? ' <span class="badge badge-champ">' + s.titles + 'x</span>' : '') +
        '</td>' +
        '<td style="text-align:center;font-weight:600">' + s.w + '</td>' +
        '<td style="text-align:center">' + s.l + '</td>' +
        '<td style="text-align:center;font-weight:700;color:var(--brand-green)">' + (s.pct * 100).toFixed(1) + '%</td>' +
        '<td style="text-align:center">' + (s.titles > 0 ? s.titles : '&mdash;') + '</td>' +
        '<td style="text-align:center">' + tc + '</td>' +
      '</tr>';
    }).join('');

    document.getElementById('owner-overview-section').style.display = 'block';
    YK.makeSortable(document.getElementById('owner-overview-table'));

    // Champion table
    var champTbody = document.getElementById('champ-tbody');
    var champs = seasons.filter(function(s) { return s.champion; });
    champTbody.innerHTML = champs.map(function(s) {
      var winner = s.standings.find(function(t) { return t.team === s.champion; });
      var owner = YK.teamToOwner(s.champion);
      var ownerDisplay = owner ? YK.ownerDisplayName(owner) : '&mdash;';
      var color = owner ? YK.ownerColor(owner) : '#888';
      return '<tr>' +
        '<td><strong>' + s.year + '</strong></td>' +
        '<td><span class="badge badge-champ">' + s.champion + '</span></td>' +
        '<td>' +
          '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + color + ';margin-right:6px;vertical-align:middle"></span>' +
          ownerDisplay +
        '</td>' +
        '<td>' + (winner ? winner.w + '-' + winner.l : '&mdash;') + '</td>' +
        '<td>' + (winner ? winner.fpts.toLocaleString() : '&mdash;') + '</td>' +
      '</tr>';
    }).join('');

    // Season standings switcher
    var filterBar = document.getElementById('season-filter-bar');
    var standingsTbody = document.getElementById('standings-tbody');

    function renderStandings(season) {
      var s = seasons.find(function(x) { return x.year === season; });
      if (!s) return;
      standingsTbody.innerHTML = s.standings.map(function(t) {
        var isChamp = t.team === s.champion;
        var owner = YK.teamToOwner(t.team);
        var ownerDisplay = owner ? YK.ownerDisplayName(owner) : '&mdash;';
        var color = owner ? YK.ownerColor(owner) : '#888';
        return '<tr data-rank="' + t.rank + '" data-team="' + t.team + '" data-owner="' + ownerDisplay + '" data-w="' + t.w + '" data-l="' + t.l + '" data-pct="' + t.win_pct + '" data-fpts="' + t.fpts + '">' +
          '<td style="text-align:center;font-weight:700">' + t.rank + '</td>' +
          '<td>' +
            (isChamp ? '<span style="color:var(--brand-gold);margin-right:4px">&#x1F3C6;</span>' : '') +
            '<strong>' + t.team + '</strong>' +
            (s.in_progress && t.rank === 1 ? ' <span class="badge badge-active" style="margin-left:6px">IN PROGRESS</span>' : '') +
          '</td>' +
          '<td>' +
            '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + color + ';margin-right:6px;vertical-align:middle"></span>' +
            ownerDisplay +
          '</td>' +
          '<td style="text-align:center">' + t.w + '</td>' +
          '<td style="text-align:center">' + t.l + '</td>' +
          '<td style="text-align:center;font-weight:600">' + (t.win_pct * 100).toFixed(1) + '%</td>' +
          '<td style="text-align:right">' + t.fpts.toLocaleString() + '</td>' +
        '</tr>';
      }).join('');
    }

    seasons.forEach(function(s, i) {
      var btn = document.createElement('button');
      btn.className = 'filter-btn' + (i === seasons.length - 1 ? ' active' : '');
      btn.textContent = s.year;
      btn.addEventListener('click', function() {
        filterBar.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        renderStandings(s.year);
      });
      filterBar.appendChild(btn);
    });

    renderStandings(seasons[seasons.length - 1].year);
    YK.makeSortable(document.getElementById('standings-table'));

    // Dynasty rankings (top 20)
    var rankingsTbody = document.getElementById('rankings-tbody');
    var rankingsArr = Array.isArray(rankingsData) ? rankingsData : (rankingsData.rankings || []);
    rankingsTbody.innerHTML = rankingsArr.slice(0, 20).map(function(r) {
      var name = r.player_name || r.player;
      var owner = r.owned_by || null;
      var ownerBadge = owner
        ? ' <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:' + YK.ownerColor(owner) + ';margin-left:6px;vertical-align:middle"></span> <span style="color:var(--text-muted);font-size:0.75rem">' + YK.ownerDisplayName(owner) + '</span>'
        : ' <span style="color:var(--text-muted);font-size:0.7rem;font-style:italic;margin-left:6px">FA</span>';
      return '<tr>' +
        '<td style="text-align:center;font-weight:700;color:var(--brand-green)">' + r.rank + '</td>' +
        '<td>' + YK.escapeHtml(name) + ownerBadge + '</td>' +
      '</tr>';
    }).join('');
  });
})();

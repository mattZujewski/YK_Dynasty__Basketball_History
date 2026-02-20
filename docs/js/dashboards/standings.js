/**
 * standings.js — Dashboard module for standings.html
 * YK Dynasty Basketball
 */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', async function () {
    const YK = window.YK;
    YK.applyChartDefaults();

    let seasonsData, ownersData;
    try {
      [seasonsData, ownersData] = await Promise.all([
        YK.loadJSON('data/seasons.json'),
        YK.loadJSON('data/owners.json'),
      ]);
    } catch (e) {
      console.error('Failed to load data:', e);
      return;
    }

    const seasons = seasonsData.seasons;

    // Build team history map from owners.json: owner canonical → [{team, season}]
    const ownerTeamHistory = {};
    (ownersData.owners || []).forEach(function(ownerObj) {
      const canonical = YK.resolveOwner(ownerObj.id);
      const teams = ownerObj.teams || {};
      const history = [];
      Object.keys(teams).sort().forEach(function(yr) {
        history.push({ team: teams[yr], season: yr });
      });
      ownerTeamHistory[canonical] = history;
    });

    // Format team history for display: "TeamName (YY-YY)" format
    function formatTeamHistory(owner) {
      const history = ownerTeamHistory[owner];
      if (!history || history.length === 0) return '—';

      // Group consecutive seasons with same team name
      var groups = [];
      var current = null;
      history.forEach(function(h) {
        if (current && current.team === h.team) {
          current.endYear = h.season;
        } else {
          if (current) groups.push(current);
          current = { team: h.team, startYear: h.season, endYear: h.season };
        }
      });
      if (current) groups.push(current);

      return groups.map(function(g) {
        var startShort = g.startYear.split('-')[0].slice(-2);
        var endShort = g.endYear.split('-')[1];
        if (g.startYear === g.endYear) {
          return g.team + " ('" + startShort + '-' + endShort + ')';
        }
        return g.team + " ('" + startShort + '-' + endShort + ')';
      }).join(', ');
    }

    // --- All-Time Aggregation by OWNER ---
    var ownerMap = {};

    seasons.forEach(function(season) {
      season.standings.forEach(function(entry) {
        var owner = YK.teamToOwner(entry.team);
        if (!owner) return;

        if (!ownerMap[owner]) {
          ownerMap[owner] = { owner: owner, w: 0, l: 0, fpts: 0, seasons: 0, titles: 0, teams: new Set() };
        }
        ownerMap[owner].w += entry.w;
        ownerMap[owner].l += entry.l;
        ownerMap[owner].fpts += entry.fpts;
        ownerMap[owner].seasons += 1;
        ownerMap[owner].teams.add(entry.team);
        if (season.champion === entry.team) ownerMap[owner].titles += 1;
      });
    });

    var allOwners = Object.values(ownerMap).map(function(t) {
      t.pct = t.w + t.l > 0 ? t.w / (t.w + t.l) : 0;
      t.teamsArr = Array.from(t.teams);
      return t;
    }).sort(function(a, b) { return b.pct - a.pct || b.w - a.w; });

    // Render all-time table (10 rows — one per owner)
    var alltimeTbody = document.getElementById('alltime-tbody');
    alltimeTbody.innerHTML = allOwners.map(function(t, i) {
      var color = YK.ownerColor(t.owner);
      var displayName = YK.ownerDisplayName(t.owner);
      var teamHistory = formatTeamHistory(t.owner);
      return '<tr data-rank="' + (i+1) + '" data-owner="' + displayName + '" data-teams="' + teamHistory + '" data-seasons="' + t.seasons + '" data-w="' + t.w + '" data-l="' + t.l + '" data-pct="' + t.pct.toFixed(3) + '" data-fpts="' + t.fpts + '" data-titles="' + t.titles + '">' +
        '<td style="text-align:center;font-weight:700">' + (i + 1) + '</td>' +
        '<td>' +
          '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + color + ';margin-right:7px;vertical-align:middle"></span>' +
          '<strong>' + displayName + '</strong>' +
          (t.titles > 0 ? ' <span class="badge badge-champ">' + t.titles + 'x Champ</span>' : '') +
        '</td>' +
        '<td style="color:var(--text-muted);font-size:0.78rem">' + teamHistory + '</td>' +
        '<td style="text-align:center">' + t.seasons + '</td>' +
        '<td style="text-align:center;font-weight:600">' + t.w + '</td>' +
        '<td style="text-align:center">' + t.l + '</td>' +
        '<td style="text-align:center;font-weight:700;color:var(--brand-green)">' + (t.pct * 100).toFixed(1) + '%</td>' +
        '<td style="text-align:right">' + t.fpts.toLocaleString() + '</td>' +
        '<td style="text-align:center">' + (t.titles > 0 ? t.titles : '&mdash;') + '</td>' +
      '</tr>';
    }).join('');

    YK.makeSortable(document.getElementById('alltime-table'));

    // Insight
    if (allOwners.length > 0) {
      var top = allOwners[0];
      document.getElementById('alltime-insight').innerHTML =
        '<strong>' + YK.ownerDisplayName(top.owner) + '</strong> holds the best all-time record at ' +
        '<strong>' + top.w + '-' + top.l + '</strong> (' + (top.pct * 100).toFixed(1) + '%) across ' + top.seasons + ' season' + (top.seasons > 1 ? 's' : '') + '.' +
        (top.titles > 0 ? ' They\'ve won <strong>' + top.titles + '</strong> championship' + (top.titles > 1 ? 's' : '') + '.' : '');
    }

    // --- Win% Bar Chart (by owner) ---
    var chartLabels = allOwners.map(function(t) { return YK.ownerDisplayName(t.owner); });
    var chartData = allOwners.map(function(t) { return +(t.pct * 100).toFixed(1); });
    var chartColors = allOwners.map(function(t) { return YK.ownerColor(t.owner); });

    new Chart(document.getElementById('chart-winpct').getContext('2d'), {
      type: 'bar',
      data: {
        labels: chartLabels,
        datasets: [{
          data: chartData,
          backgroundColor: chartColors,
          borderColor: chartColors,
          borderWidth: 1,
          borderRadius: 4,
        }],
      },
      options: {
        ...YK.barOptions({ yLabel: 'Win %' }),
        scales: {
          ...YK.barOptions({ yLabel: 'Win %' }).scales,
          x: {
            ...YK.barOptions({}).scales.x,
            ticks: { maxRotation: 45, font: { size: 10 } },
          },
          y: {
            ...YK.barOptions({ yLabel: 'Win %' }).scales.y,
            max: 100,
          },
        },
      },
    });

    // --- Season-by-Season Detail (with owner + GB columns) ---
    var filterBar = document.getElementById('season-detail-filter');
    var detailTbody = document.getElementById('season-detail-tbody');

    function renderSeasonDetail(season) {
      var s = seasons.find(function(x) { return x.year === season; });
      if (!s) return;

      // Calculate GB: leader is rank 1
      var leader = s.standings.find(function(t) { return t.rank === 1; });
      var leaderW = leader ? leader.w : 0;
      var leaderL = leader ? leader.l : 0;

      detailTbody.innerHTML = s.standings.map(function(t) {
        var isChamp = t.team === s.champion;
        var owner = YK.teamToOwner(t.team);
        var ownerDisplay = owner ? YK.ownerDisplayName(owner) : '&mdash;';
        var color = owner ? YK.ownerColor(owner) : '#888';

        // GB formula
        var gb = t.rank === 1 ? '&mdash;' : ((leaderW - t.w + t.l - leaderL) / 2).toFixed(1);

        return '<tr data-rank="' + t.rank + '" data-team="' + t.team + '" data-owner="' + ownerDisplay + '" data-w="' + t.w + '" data-l="' + t.l + '" data-pct="' + t.win_pct + '" data-gb="' + (t.rank === 1 ? 0 : gb) + '" data-fpts="' + t.fpts + '">' +
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
          '<td style="text-align:center;color:var(--text-muted)">' + gb + '</td>' +
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
        renderSeasonDetail(s.year);
      });
      filterBar.appendChild(btn);
    });

    renderSeasonDetail(seasons[seasons.length - 1].year);
    YK.makeSortable(document.getElementById('season-detail-table'));
  });
})();

/**
 * standings.js — Dashboard module for standings.html
 * YK Dynasty Basketball
 */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', async function () {
    const YK = window.YK;
    YK.applyChartDefaults();

    let seasonsData, ownersData, playoffsData;
    try {
      [seasonsData, ownersData, playoffsData] = await Promise.all([
        YK.loadJSON('data/seasons.json'),
        YK.loadJSON('data/owners.json'),
        YK.loadJSON('data/playoffs.json'),
      ]);
    } catch (e) {
      console.error('Failed to load data:', e);
      return;
    }

    const seasons = seasonsData.seasons;

    // Build team history map from owners.json: owner canonical → [{team, season}]
    const ownerTeamHistory = {};
    (ownersData.owners || []).forEach(function(ownerObj) {
      const canonical = ownerObj.id.charAt(0).toUpperCase() + ownerObj.id.slice(1);
      const teams = ownerObj.teams || {};
      const history = [];
      Object.keys(teams).sort().forEach(function(yr) {
        history.push({ team: teams[yr], season: yr });
      });
      ownerTeamHistory[canonical] = history;
    });

    // Get current team name for display (most recent season)
    function getCurrentTeamName(owner) {
      const history = ownerTeamHistory[owner];
      if (!history || history.length === 0) return '\u2014';
      return history[history.length - 1].team;
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
      var teamName = getCurrentTeamName(t.owner);
      return '<tr data-rank="' + (i+1) + '" data-owner="' + displayName + '" data-teams="' + teamName + '" data-seasons="' + t.seasons + '" data-w="' + t.w + '" data-l="' + t.l + '" data-pct="' + t.pct.toFixed(3) + '" data-fpts="' + t.fpts + '" data-titles="' + t.titles + '">' +
        '<td style="text-align:center;font-weight:700">' + (i + 1) + '</td>' +
        '<td>' +
          '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + color + ';margin-right:7px;vertical-align:middle"></span>' +
          '<strong>' + displayName + '</strong>' +
          (t.titles > 0 ? ' <span class="badge badge-champ">' + t.titles + 'x Champ</span>' : '') +
        '</td>' +
        '<td style="font-size:0.82rem">' + teamName + '</td>' +
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

    // --- Playoff Brackets ---
    var playoffs = playoffsData.playoffs || [];
    var playoffFilter = document.getElementById('playoff-filter');
    var bracketContainer = document.getElementById('playoff-bracket-container');

    function renderPlayoffBracket(year) {
      var p = playoffs.find(function(x) { return x.year === year; });
      if (!p) { bracketContainer.innerHTML = ''; return; }

      var html = '';
      if (p.champion) {
        html += '<div class="champion-banner" style="margin-top:16px">' +
          '<div class="trophy">&#x1F3C6;</div>' +
          '<div class="champ-info">' +
            '<h2>' + YK.ownerDisplayName(p.champion) + ' &mdash; Year ' + (playoffs.indexOf(p) + 1) + ' Champion</h2>' +
            '<p>';
        if (p.runner_up) html += 'Runner-up: ' + YK.ownerDisplayName(p.runner_up);
        if (p.third) html += ' &middot; 3rd: ' + YK.ownerDisplayName(p.third);
        if (p.payouts) html += ' &middot; Payouts: $' + p.payouts['1st'] + ' / $' + p.payouts['2nd'] + ' / $' + p.payouts['3rd'];
        html += '</p></div></div>';
      } else if (p.in_progress) {
        html += '<div style="margin-top:16px;padding:12px 16px;background:rgba(42,157,143,0.08);border-left:3px solid var(--brand-green);border-radius:0 6px 6px 0;font-size:0.85rem;color:var(--text-secondary)">' +
          '<strong>Playoffs in progress</strong></div>';
      }

      html += '<div class="playoff-rounds" style="margin-top:16px">';
      (p.rounds || []).forEach(function(round) {
        html += '<div class="playoff-round" style="margin-bottom:16px">' +
          '<h3 style="font-size:0.85rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">' + round.name + '</h3>';
        (round.matchups || []).forEach(function(m) {
          var hColor = YK.ownerColor(m.higher_seed.owner);
          var lColor = YK.ownerColor(m.lower_seed.owner);
          var hDisplay = YK.ownerDisplayName(m.higher_seed.owner);
          var lDisplay = YK.ownerDisplayName(m.lower_seed.owner);
          var hWin = m.winner === m.higher_seed.owner;
          var lWin = m.winner === m.lower_seed.owner;
          var ongoing = m.winner === null;

          html += '<div class="playoff-matchup">' +
            '<div class="playoff-team' + (hWin ? ' playoff-winner' : '') + '">' +
              '<span class="playoff-seed">' + m.higher_seed.seed + '</span>' +
              '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + hColor + ';margin-right:6px"></span>' +
              '<span class="playoff-name">' + hDisplay + '</span>' +
              (hWin ? ' <span class="badge badge-champ" style="font-size:0.65rem;padding:1px 6px">W</span>' : '') +
            '</div>' +
            '<div class="playoff-vs">vs</div>' +
            '<div class="playoff-team' + (lWin ? ' playoff-winner' : '') + '">' +
              '<span class="playoff-seed">' + m.lower_seed.seed + '</span>' +
              '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + lColor + ';margin-right:6px"></span>' +
              '<span class="playoff-name">' + lDisplay + '</span>' +
              (lWin ? ' <span class="badge badge-champ" style="font-size:0.65rem;padding:1px 6px">W</span>' : '') +
            '</div>' +
            (ongoing ? '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px;font-style:italic">Ongoing</div>' : '') +
          '</div>';
        });
        html += '</div>';
      });
      html += '</div>';

      bracketContainer.innerHTML = html;
    }

    if (playoffFilter && playoffs.length > 0) {
      playoffs.forEach(function(p, i) {
        var btn = document.createElement('button');
        btn.className = 'filter-btn' + (i === playoffs.length - 1 ? ' active' : '');
        btn.textContent = p.year;
        btn.addEventListener('click', function() {
          playoffFilter.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
          btn.classList.add('active');
          renderPlayoffBracket(p.year);
        });
        playoffFilter.appendChild(btn);
      });
      renderPlayoffBracket(playoffs[playoffs.length - 1].year);
    }

    // --- Career Playoff Totals ---
    var careerTotals = playoffsData.career_totals || [];
    var careerTbody = document.getElementById('career-playoff-tbody');

    if (careerTbody && careerTotals.length > 0) {
      careerTbody.innerHTML = careerTotals.map(function(t, i) {
        var color = YK.ownerColor(t.owner);
        var display = YK.ownerDisplayName(t.owner);
        return '<tr data-rank="' + (i+1) + '" data-owner="' + display + '" data-rings="' + t.rings + '" data-finals="' + t.finals + '" data-apps="' + t.playoff_apps + '" data-byes="' + t.byes + '">' +
          '<td style="text-align:center;font-weight:700">' + (i + 1) + '</td>' +
          '<td>' +
            '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + color + ';margin-right:7px;vertical-align:middle"></span>' +
            '<strong>' + display + '</strong>' +
            (t.rings > 0 ? ' <span class="badge badge-champ">' + t.rings + 'x Champ</span>' : '') +
          '</td>' +
          '<td style="text-align:center;font-weight:700;color:var(--brand-gold)">' + (t.rings > 0 ? t.rings : '&mdash;') + '</td>' +
          '<td style="text-align:center">' + (t.finals > 0 ? t.finals : '&mdash;') + '</td>' +
          '<td style="text-align:center">' + (t.playoff_apps > 0 ? t.playoff_apps : '&mdash;') + '</td>' +
          '<td style="text-align:center">' + (t.byes > 0 ? t.byes : '&mdash;') + '</td>' +
        '</tr>';
      }).join('');
      YK.makeSortable(document.getElementById('career-playoff-table'));
    }
  });
})();

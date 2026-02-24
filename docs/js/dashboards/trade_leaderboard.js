/**
 * trade_leaderboard.js — Dashboard module for trade-leaderboard.html
 * YK Dynasty Basketball
 *
 * Data source: data/trade_leaderboard.json
 * Structure:
 *   { generated, overall: [{owner, wins, losses, win_pct, total_margin, avg_margin}],
 *     seasons: { "2023-24": [...], "2024-25": [...], "2025-26": [...] } }
 */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', async function () {
    const YK = window.YK;
    YK.applyChartDefaults();

    let lbData;
    try {
      lbData = await YK.loadJSON('data/trade_leaderboard.json');
    } catch (e) {
      console.error('Failed to load trade_leaderboard.json:', e);
      document.getElementById('overall-tbody').innerHTML =
        '<tr><td colspan="7" class="text-center text-muted" style="padding:24px">Failed to load data.</td></tr>';
      return;
    }

    const overall  = lbData.overall  || [];
    const seasons  = lbData.seasons  || {};
    const sortedSeasonKeys = Object.keys(seasons).sort();

    // ── Summary stat cards ──────────────────────────────────────────────── //
    var totalTrades = overall.reduce(function(s, o) { return s + o.wins + o.losses; }, 0) / 2;
    var topTrader = overall.length > 0
      ? overall.slice().sort(function(a, b) { return b.win_pct - a.win_pct || b.wins - a.wins; })[0]
      : null;
    var bestMargin = overall.length > 0
      ? overall.slice().sort(function(a, b) { return b.avg_margin - a.avg_margin; })[0]
      : null;

    var cardsEl = document.getElementById('summary-cards');
    function makeCard(label, value, subtext) {
      var card = document.createElement('div');
      card.className = 'stat-card';
      card.innerHTML =
        '<div class="stat-label">' + label + '</div>' +
        '<div class="stat-value">' + value + '</div>' +
        (subtext ? '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px">' + subtext + '</div>' : '');
      return card;
    }
    cardsEl.appendChild(makeCard('Trades Graded', Math.round(totalTrades), 'unique 2-party + multi-party'));
    cardsEl.appendChild(makeCard('Seasons Covered', sortedSeasonKeys.length, sortedSeasonKeys.join(', ') || '—'));
    if (topTrader) {
      cardsEl.appendChild(makeCard(
        'Best Win Rate',
        YK.ownerDisplayName(topTrader.owner) + ' — ' + (topTrader.win_pct * 100).toFixed(1) + '%',
        topTrader.wins + 'W ' + topTrader.losses + 'L'
      ));
    }
    if (bestMargin) {
      cardsEl.appendChild(makeCard(
        'Highest Avg Margin',
        YK.ownerDisplayName(bestMargin.owner) + ' +' + bestMargin.avg_margin.toFixed(1),
        'avg dynasty value per win'
      ));
    }

    // ── Helper: render a standings table body ───────────────────────────── //
    function renderStandings(tbodyId, rows) {
      var tbody = document.getElementById(tbodyId);
      if (!rows || rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted" style="padding:12px">No data</td></tr>';
        return;
      }

      // Sort by win_pct desc, then total_margin desc
      var sorted = rows.slice().sort(function(a, b) {
        return (b.win_pct - a.win_pct) || (b.total_margin - a.total_margin);
      });

      tbody.innerHTML = sorted.map(function(row, i) {
        var color       = YK.ownerColor(row.owner);
        var displayName = YK.ownerDisplayName(row.owner);
        var total       = row.wins + row.losses;
        var pctStr      = total > 0 ? (row.win_pct * 100).toFixed(1) + '%' : '—';
        var marginStr   = row.total_margin >= 0
          ? '+' + row.total_margin.toFixed(1)
          : row.total_margin.toFixed(1);
        var avgStr      = row.wins > 0
          ? (row.avg_margin >= 0 ? '+' : '') + row.avg_margin.toFixed(1)
          : '—';
        var rankBadge   = i === 0
          ? '<span style="color:var(--brand-gold);font-weight:900">&#x1F947;</span> '
          : (i === 1 ? '<span style="color:var(--text-muted)">&#x1F948;</span> ' : '');

        return '<tr data-rank="' + (i+1) + '"' +
          ' data-owner="' + displayName + '"' +
          ' data-wins="' + row.wins + '"' +
          ' data-losses="' + row.losses + '"' +
          ' data-win_pct="' + row.win_pct.toFixed(3) + '"' +
          ' data-total_margin="' + row.total_margin.toFixed(1) + '"' +
          ' data-avg_margin="' + row.avg_margin.toFixed(1) + '"' +
          '>' +
          '<td style="text-align:center;font-weight:700">' + rankBadge + (i+1) + '</td>' +
          '<td>' +
            '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;' +
              'background:' + color + ';margin-right:7px;vertical-align:middle"></span>' +
            '<strong>' + displayName + '</strong>' +
          '</td>' +
          '<td style="text-align:center;font-weight:600;color:var(--brand-green)">' + row.wins + '</td>' +
          '<td style="text-align:center;color:var(--text-muted)">' + row.losses + '</td>' +
          '<td style="text-align:center;font-weight:700">' + pctStr + '</td>' +
          '<td style="text-align:right;font-weight:600">' + marginStr + '</td>' +
          '<td style="text-align:right;color:var(--text-muted)">' + avgStr + '</td>' +
        '</tr>';
      }).join('');
    }

    // ── Overall table ───────────────────────────────────────────────────── //
    renderStandings('overall-tbody', overall);
    YK.makeSortable(document.getElementById('overall-table'));

    if (overall.length > 0) {
      var topRow = overall.slice().sort(function(a, b) {
        return (b.win_pct - a.win_pct) || (b.wins - a.wins);
      })[0];
      var insightEl = document.getElementById('overall-insight');
      insightEl.innerHTML =
        '<strong>' + YK.ownerDisplayName(topRow.owner) + '</strong> leads all-time with a ' +
        '<strong>' + (topRow.win_pct * 100).toFixed(1) + '% trade win rate</strong>' +
        ' (' + topRow.wins + 'W&ndash;' + topRow.losses + 'L), ' +
        'averaging <strong>+' + topRow.avg_margin.toFixed(1) + '</strong> dynasty value per graded trade.';
    }

    // ── Win% Bar Chart ──────────────────────────────────────────────────── //
    var chartSorted = overall.slice().sort(function(a, b) {
      return (b.win_pct - a.win_pct) || (b.wins - a.wins);
    });
    var chartLabels = chartSorted.map(function(r) { return YK.ownerDisplayName(r.owner); });
    var chartData   = chartSorted.map(function(r) { return +(r.win_pct * 100).toFixed(1); });
    var chartColors = chartSorted.map(function(r) { return YK.ownerColor(r.owner); });

    var barOpts = YK.barOptions({ yLabel: 'Win %' });
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
        ...barOpts,
        scales: {
          ...barOpts.scales,
          x: {
            ...barOpts.scales.x,
            ticks: { maxRotation: 45, font: { size: 10 } },
          },
          y: {
            ...barOpts.scales.y,
            min: 0,
            max: 100,
            ticks: {
              ...((barOpts.scales.y || {}).ticks || {}),
              callback: function(val) { return val + '%'; },
            },
          },
        },
      },
    });

    // ── Season-by-Season tabs ───────────────────────────────────────────── //
    var seasonFilter = document.getElementById('season-filter');

    function renderSeasonTable(seasonKey) {
      renderStandings('season-tbody', seasons[seasonKey] || []);
      YK.makeSortable(document.getElementById('season-table'));
    }

    sortedSeasonKeys.forEach(function(key, i) {
      var btn = document.createElement('button');
      btn.className = 'filter-btn' + (i === sortedSeasonKeys.length - 1 ? ' active' : '');
      btn.textContent = key;
      btn.addEventListener('click', function() {
        seasonFilter.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        renderSeasonTable(key);
      });
      seasonFilter.appendChild(btn);
    });

    if (sortedSeasonKeys.length > 0) {
      renderSeasonTable(sortedSeasonKeys[sortedSeasonKeys.length - 1]);
    }
  });
})();

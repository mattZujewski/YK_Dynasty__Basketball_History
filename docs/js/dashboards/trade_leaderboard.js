/**
 * trade_leaderboard.js — Dashboard module for trade-leaderboard.html
 * YK Dynasty Basketball
 *
 * Data sources:
 *   data/trade_leaderboard.json  (season keys reference)
 *   data/trade_details.json      (primary — for dynamic standings + drill-down)
 */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', async function () {
    const YK = window.YK;
    YK.applyChartDefaults();

    let lbData, detailsData;
    try {
      var results = await Promise.all([
        YK.loadJSON('data/trade_leaderboard.json'),
        YK.loadJSON('data/trade_details.json').catch(function() { return { trades: [] }; }),
      ]);
      lbData      = results[0];
      detailsData = results[1];
    } catch (e) {
      console.error('Failed to load leaderboard data:', e);
      document.getElementById('overall-tbody').innerHTML =
        '<tr><td colspan="7" class="text-center text-muted" style="padding:24px">Failed to load data.</td></tr>';
      return;
    }

    // All non-collusion trades from trade_details.json
    const allDetailTrades = (detailsData.trades || []).filter(function(t) {
      return !t.is_collusion;
    });

    // ── Season filter ────────────────────────────────────────────────────── //
    var filterSeasons = [];
    var _sfb = YK.buildSeasonFilterBar('season-filter-bar', function(activeSeasons) {
      filterSeasons = activeSeasons;
      var subset    = getSeasonSubset();
      var standings = computeStandings(subset);
      rebuildSummaryCards(subset, standings);
      renderStandings('overall-tbody', standings);
      rebuildChart(standings);
      updateInsight(standings);
    });

    function getSeasonSubset() {
      if (filterSeasons.length === 0) return allDetailTrades;
      return allDetailTrades.filter(function(t) {
        var s = (t.season || '').replace(/^20/, '');
        return filterSeasons.includes(s);
      });
    }

    // ── computeStandings: derive W/L/margin from trade_details ─────────── //
    function computeStandings(tradeSet) {
      var map = {};
      tradeSet.forEach(function(t) {
        (t.sides || []).forEach(function(s) {
          var r = map[s.owner] || (map[s.owner] = {
            owner: s.owner, wins: 0, losses: 0, total_margin: 0
          });
          if (s.is_winner) {
            r.wins++;
            r.total_margin += (t.win_margin || 0);
          } else {
            r.losses++;
          }
        });
      });
      return Object.values(map).map(function(r) {
        var tot = r.wins + r.losses;
        return {
          owner:        r.owner,
          wins:         r.wins,
          losses:       r.losses,
          win_pct:      tot > 0 ? r.wins / tot : 0,
          total_margin: r.total_margin,
          avg_margin:   r.wins > 0 ? r.total_margin / r.wins : 0,
        };
      });
    }

    // ── Summary stat cards ──────────────────────────────────────────────── //
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

    function rebuildSummaryCards(subset, standings) {
      cardsEl.innerHTML = '';
      var uniqueSeasons = new Set(subset.map(function(t) { return t.season; }));
      var topTrader = standings.length > 0
        ? standings.slice().sort(function(a, b) { return (b.win_pct - a.win_pct) || (b.wins - a.wins); })[0]
        : null;
      var bestMargin = standings.length > 0
        ? standings.slice().sort(function(a, b) { return b.avg_margin - a.avg_margin; })[0]
        : null;

      cardsEl.appendChild(makeCard('Trades Graded', subset.length, 'non-collusion trades'));
      cardsEl.appendChild(makeCard('Seasons', uniqueSeasons.size, '2021\u201322 to present'));
      if (topTrader) {
        cardsEl.appendChild(makeCard(
          'Best Win Rate',
          YK.ownerDisplayName(topTrader.owner) + ' \u2014 ' + (topTrader.win_pct * 100).toFixed(1) + '%',
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
    }

    // ── Render standings table with drill-down ──────────────────────────── //
    function renderStandings(tbodyId, rows) {
      var tbody = document.getElementById(tbodyId);
      if (!rows || rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted" style="padding:12px">No data</td></tr>';
        return;
      }

      var sorted = rows.slice().sort(function(a, b) {
        return (b.win_pct - a.win_pct) || (b.total_margin - a.total_margin);
      });

      tbody.innerHTML = sorted.map(function(row, i) {
        var color       = YK.ownerColor(row.owner);
        var displayName = YK.ownerDisplayName(row.owner);
        var total       = row.wins + row.losses;
        var pctStr      = total > 0 ? (row.win_pct * 100).toFixed(1) + '%' : '\u2014';
        var marginStr   = row.total_margin >= 0
          ? '+' + row.total_margin.toFixed(1)
          : row.total_margin.toFixed(1);
        var avgStr      = row.wins > 0
          ? (row.avg_margin >= 0 ? '+' : '') + row.avg_margin.toFixed(1)
          : '\u2014';
        var rankBadge   = i === 0
          ? '<span style="color:var(--brand-gold);font-weight:900">&#x1F947;</span> '
          : (i === 1 ? '<span style="color:var(--text-muted)">&#x1F948;</span> ' : '');

        var safeOwner = YK.escapeHtml(row.owner);

        return '<tr class="standings-row" data-owner-key="' + safeOwner + '">' +
          '<td data-label="" style="text-align:center;font-weight:700">' + rankBadge + (i+1) + '</td>' +
          '<td data-label="Owner">' +
            '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;' +
              'background:' + color + ';margin-right:7px;vertical-align:middle"></span>' +
            '<strong>' + displayName + '</strong>' +
            '<span class="drill-arrow">&#x25BC;</span>' +
          '</td>' +
          '<td data-label="W" style="text-align:center;font-weight:600;color:var(--brand-green)">' + row.wins + '</td>' +
          '<td data-label="L" style="text-align:center;color:var(--text-muted)">' + row.losses + '</td>' +
          '<td data-label="Win %" style="text-align:center;font-weight:700">' + pctStr + '</td>' +
          '<td data-label="Total +" style="text-align:right;font-weight:600">' + marginStr + '</td>' +
          '<td data-label="Avg +" style="text-align:right;color:var(--text-muted)">' + avgStr + '</td>' +
        '</tr>' +
        '<tr class="drill-row" id="drill-' + safeOwner + '">' +
          '<td colspan="7" style="padding:0">' +
            buildDrillDown(row.owner, getSeasonSubset()) +
          '</td>' +
        '</tr>';
      }).join('');
    }

    // ── Drill-down content for one owner ────────────────────────────────── //
    function buildDrillDown(owner, tradeSet) {
      var ownerTrades = tradeSet
        .filter(function(t) {
          return (t.sides || []).some(function(s) { return s.owner === owner; });
        })
        .sort(function(a, b) { return b.trade_id - a.trade_id; });

      if (ownerTrades.length === 0) {
        return '<div class="drill-inner">No graded trades found for this owner in the selected seasons.</div>';
      }

      var items = ownerTrades.map(function(t) {
        var side = (t.sides || []).find(function(s) { return s.owner === owner; }) || {};
        var opp  = (t.sides || [])
          .filter(function(s) { return s.owner !== owner; })
          .map(function(s) { return YK.ownerDisplayName(s.owner); })
          .join(', ');
        var isWin     = !!side.is_winner;
        var marginStr = (t.win_margin || 0).toFixed(1);

        // Top received assets (sorted by dynasty value, top 3)
        var topAssets = (side.assets || [])
          .slice().sort(function(a, b) { return (b.value || 0) - (a.value || 0); })
          .slice(0, 3)
          .map(function(a) { return YK.escapeHtml(a.name); })
          .join(', ');

        return '<div class="drill-item">' +
          '<div class="drill-item-row">' +
            '<span style="color:var(--text-muted);font-size:0.75rem">#' + t.trade_id + '</span>' +
            '<span style="color:var(--text-muted)">' + (t.season || '\u2014') + '</span>' +
            '<span>vs ' + YK.escapeHtml(opp) + '</span>' +
            '<span class="drill-item-result ' + (isWin ? 'win' : 'loss') + '">' +
              (isWin ? 'W' : 'L') + ' +' + marginStr +
            '</span>' +
            '<a href="trade-cards.html#trade-' + t.trade_id + '" title="View trade card">\u2192 Card</a>' +
          '</div>' +
          (topAssets ? '<div class="drill-assets">Received: ' + topAssets + '</div>' : '') +
        '</div>';
      }).join('');

      return '<div class="drill-inner">' +
        '<strong>' + YK.ownerDisplayName(owner) + '</strong> \u2014 ' +
        ownerTrades.length + ' graded trade' + (ownerTrades.length !== 1 ? 's' : '') +
        '<div class="drill-grid">' + items + '</div>' +
      '</div>';
    }

    // ── Click handler for drill-down rows ───────────────────────────────── //
    document.getElementById('overall-tbody').addEventListener('click', function(e) {
      var tr = e.target.closest('tr[data-owner-key]');
      if (!tr) return;
      var owner    = tr.dataset.ownerKey;
      var drillRow = document.getElementById('drill-' + owner);
      if (!drillRow) return;

      var isOpen = drillRow.classList.toggle('open');
      var arrow  = tr.querySelector('.drill-arrow');
      if (arrow) arrow.innerHTML = isOpen ? '&#x25B2;' : '&#x25BC;';
    });

    // ── Win% Bar Chart ──────────────────────────────────────────────────── //
    var winPctChart = null;

    function rebuildChart(standings) {
      var chartSorted = standings.slice().sort(function(a, b) {
        return (b.win_pct - a.win_pct) || (b.wins - a.wins);
      });
      var chartLabels = chartSorted.map(function(r) { return YK.ownerDisplayName(r.owner); });
      var chartData   = chartSorted.map(function(r) { return +(r.win_pct * 100).toFixed(1); });
      var chartColors = chartSorted.map(function(r) { return YK.ownerColor(r.owner); });

      var canvas = document.getElementById('chart-winpct');
      if (!canvas) return;

      if (winPctChart) {
        winPctChart.destroy();
        winPctChart = null;
      }

      var barOpts = YK.barOptions({ yLabel: 'Win %' });
      winPctChart = new Chart(canvas.getContext('2d'), {
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
    }

    // ── Insight text ─────────────────────────────────────────────────────── //
    function updateInsight(standings) {
      var insightEl = document.getElementById('overall-insight');
      if (!insightEl) return;
      if (standings.length === 0) { insightEl.textContent = ''; return; }
      var topRow = standings.slice().sort(function(a, b) {
        return (b.win_pct - a.win_pct) || (b.wins - a.wins);
      })[0];
      insightEl.innerHTML =
        '<strong>' + YK.ownerDisplayName(topRow.owner) + '</strong> leads with a ' +
        '<strong>' + (topRow.win_pct * 100).toFixed(1) + '% trade win rate</strong>' +
        ' (' + topRow.wins + 'W\u2013' + topRow.losses + 'L), ' +
        'averaging <strong>+' + topRow.avg_margin.toFixed(1) + '</strong> dynasty value per graded trade.';
    }

    // ── Initial render ───────────────────────────────────────────────────── //
    var initStandings = computeStandings(allDetailTrades);
    rebuildSummaryCards(allDetailTrades, initStandings);
    renderStandings('overall-tbody', initStandings);
    rebuildChart(initStandings);
    updateInsight(initStandings);
  });
})();
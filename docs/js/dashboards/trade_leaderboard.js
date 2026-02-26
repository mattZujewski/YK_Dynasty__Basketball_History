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
      updateResetBtn();
      var subset    = getSeasonSubset();
      var standings = computeStandings(subset);
      rebuildSummaryCards(subset, standings);
      renderStandings('overall-tbody', standings);
      rebuildChart(standings);
      updateInsight(standings);
    });

    // ── Reset filters ─────────────────────────────────────────────────────── //
    function updateResetBtn() {
      var btn = document.getElementById('reset-filters-btn');
      if (!btn) return;
      btn.classList.toggle('visible', filterSeasons.length > 0);
    }
    function resetAllFilters() {
      if (_sfb && typeof _sfb.reset === 'function') _sfb.reset();
      filterSeasons = [];
      var subset    = getSeasonSubset();
      var standings = computeStandings(subset);
      rebuildSummaryCards(subset, standings);
      renderStandings('overall-tbody', standings);
      rebuildChart(standings);
      updateInsight(standings);
      updateResetBtn();
    }
    var _resetBtn = document.getElementById('reset-filters-btn');
    if (_resetBtn) _resetBtn.addEventListener('click', resetAllFilters);

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

    function makeCard(label, value, subtext, valueColor, zone) {
      var card = document.createElement('div');
      card.className = 'stat-card' + (zone ? ' stat-card-' + zone : '');
      card.innerHTML =
        '<div class="stat-label">' + label + '</div>' +
        '<div class="stat-value"' + (valueColor ? ' style="color:' + valueColor + ';font-size:1.2rem"' : '') + '>' + value + '</div>' +
        (subtext ? '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px;text-align:center">' + subtext + '</div>' : '');
      return card;
    }

    function makeClickable(card, fn) {
      card.setAttribute('data-clickable', '1');
      card.style.cursor = 'pointer';
      card.addEventListener('click', fn);
      return card;
    }

    function scrollToOwnerRow(owner) {
      var row = document.querySelector('tr[data-owner-key="' + CSS.escape(owner) + '"]');
      if (!row) return;
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      row.style.outline = '2px solid var(--brand-gold)';
      row.style.transition = 'outline 0.5s';
      setTimeout(function() { row.style.outline = ''; }, 2500);
    }

    function rebuildSummaryCards(subset, standings) {
      // Task 11: Context cards (Trades Graded + Seasons) go in separate smaller row
      var ctxEl = document.getElementById('context-cards');
      if (ctxEl) {
        ctxEl.innerHTML = '';
        var uniqueSeasons = new Set(subset.map(function(t) { return t.season; }));
        var ctxCard = function(label, value, sub) {
          var d = document.createElement('div');
          d.className = 'stat-card stat-card-blue';
          d.style.cssText = 'font-size:0.85em;flex:0 0 auto;min-width:130px';
          d.innerHTML = '<div class="stat-label">' + label + '</div>' +
            '<div class="stat-value">' + value + '</div>' +
            (sub ? '<div style="font-size:0.68rem;color:var(--text-muted);margin-top:2px;text-align:center">' + sub + '</div>' : '');
          return d;
        };
        ctxEl.appendChild(ctxCard('Trades Graded', subset.length, 'non-collusion'));
        ctxEl.appendChild(ctxCard('Seasons', uniqueSeasons.size, '2021\u201322 to present'));
      }

      // Task 12: Top of the Board = only Best Win Rate + Highest Avg Margin
      cardsEl.innerHTML = '';
      var topTrader = standings.length > 0
        ? standings.slice().sort(function(a, b) { return (b.win_pct - a.win_pct) || (b.wins - a.wins); })[0]
        : null;
      var bestMargin = standings.length > 0
        ? standings.slice().sort(function(a, b) { return b.avg_margin - a.avg_margin; })[0]
        : null;

      var topSep = document.createElement('div');
      topSep.style.cssText = 'flex:1 1 100%;width:100%;font-size:0.7rem;font-weight:700;' +
        'text-transform:uppercase;letter-spacing:0.07em;color:var(--brand-green);padding:4px 0 2px;';
      topSep.innerHTML = '&#x1F3C6; Top of the Board';
      cardsEl.appendChild(topSep);

      if (topTrader) {
        // Task 14: click to scroll to owner's row in standings table
        var c = makeCard(
          'Best Win Rate',
          YK.ownerDisplayName(topTrader.owner) + ' \u2014 ' + (topTrader.win_pct * 100).toFixed(1) + '%',
          topTrader.wins + 'W ' + topTrader.losses + 'L',
          null, 'green'
        );
        makeClickable(c, function() { scrollToOwnerRow(topTrader.owner); });
        cardsEl.appendChild(c);
      }
      if (bestMargin) {
        var c2 = makeCard(
          'Highest Avg Margin',
          YK.ownerDisplayName(bestMargin.owner) + ' +' + bestMargin.avg_margin.toFixed(1),
          'avg dynasty value per win',
          null, 'green'
        );
        makeClickable(c2, function() { scrollToOwnerRow(bestMargin.owner); });
        cardsEl.appendChild(c2);
      }

      // Bottom of the Board
      var minTradesThreshold = 2;
      var qualifiedStandings = standings.filter(function(r) { return (r.wins + r.losses) >= minTradesThreshold; });
      var worstWinRate = qualifiedStandings.slice().sort(function(a, b) {
        return (a.win_pct - b.win_pct) || (a.wins - b.wins);
      })[0];
      var worstMargin = qualifiedStandings.filter(function(r) { return r.wins > 0; }).sort(function(a, b) {
        return a.avg_margin - b.avg_margin;
      })[0];

      if (worstWinRate || worstMargin) {
        var sep = document.createElement('div');
        sep.style.cssText = 'flex:1 1 100%;width:100%;font-size:0.7rem;font-weight:700;text-transform:uppercase;' +
          'letter-spacing:0.07em;color:var(--status-ir);padding:4px 0 2px;border-top:1px solid var(--border);margin-top:6px';
        sep.innerHTML = '&#x1F4C9; Bottom of the Board';
        cardsEl.appendChild(sep);
      }
      if (worstWinRate) {
        var c3 = makeCard(
          'Lowest Win Rate',
          YK.ownerDisplayName(worstWinRate.owner) + ' \u2014 ' + (worstWinRate.win_pct * 100).toFixed(1) + '%',
          worstWinRate.wins + 'W ' + worstWinRate.losses + 'L',
          '#B91C1C', 'red'
        );
        makeClickable(c3, function() { scrollToOwnerRow(worstWinRate.owner); });
        cardsEl.appendChild(c3);
      }
      if (worstMargin) {
        var c4 = makeCard(
          'Lowest Avg Margin',
          YK.ownerDisplayName(worstMargin.owner) + ' +' + worstMargin.avg_margin.toFixed(1),
          'avg dynasty value per win',
          '#B91C1C', 'red'
        );
        makeClickable(c4, function() { scrollToOwnerRow(worstMargin.owner); });
        cardsEl.appendChild(c4);
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
        var rankEmojis  = ['&#x1F947;','&#x1F948;','&#x1F949;','&#x2197;&#xFE0F;','&#x2796;','&#x2796;','&#x1F4C9;','&#x1F4C9;','&#x1F4C9;','&#x1F4A9;'];
        var rankBadge   = (rankEmojis[i] !== undefined ? '<span>' + rankEmojis[i] + '</span> ' : '');

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

      function topNames(side, n) {
        return (side.assets || [])
          .slice().sort(function(a, b) { return (b.value || 0) - (a.value || 0); })
          .slice(0, n || 2).map(function(a) { return YK.escapeHtml(a.name); }).join(', ') || '\u2014';
      }

      var items = ownerTrades.map(function(t) {
        var mySide  = (t.sides || []).find(function(s) { return s.owner === owner; }) || {};
        var oppSide = (t.sides || []).find(function(s) { return s.owner !== owner; }) || {};
        var opp     = (t.sides || [])
          .filter(function(s) { return s.owner !== owner; })
          .map(function(s) { return YK.ownerDisplayName(s.owner); })
          .join(', ');
        var isWin     = !!mySide.is_winner;
        var marginStr = (t.win_margin || 0).toFixed(1);
        var myAssets  = topNames(mySide, 2);
        var oppAssets = topNames(oppSide, 2);

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
          '<div class="drill-assets">' + myAssets + ' &rarr; ' + oppAssets + '</div>' +
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
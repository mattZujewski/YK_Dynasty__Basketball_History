// DATA SOURCE: System B only. No legacy grade imports.
/**
 * trade_leaderboard.js — Dashboard module for trade-leaderboard.html
 * YK Dynasty Basketball
 *
 * Data sources:
 *   data/trade_leaderboard.json  (season keys reference + trade activity)
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

    // All gradable trades: exclude early trades (#1-23), deprecated #20, and collusion
    const allDetailTrades = (detailsData.trades || []).filter(function(t) {
      return !t.is_collusion && t.trade_id > 23 && t.trade_id !== 20;
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
      rebuildMarginChart(standings);
      rebuildScatterChart(standings);
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
      rebuildMarginChart(standings);
      rebuildScatterChart(standings);
      updateInsight(standings);
      updateResetBtn();
    }
    var _resetBtn = document.getElementById('reset-filters-btn');
    if (_resetBtn) _resetBtn.addEventListener('click', resetAllFilters);

    function getSeasonSubset() {
      var base = allDetailTrades.filter(function(t) {
        return !t.is_multi_party;  // exclude 3-way from all leaderboard calcs
      });
      if (filterSeasons.length === 0) return base;
      return base.filter(function(t) {
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
        var rankEmojis  = ['&#x1F947;','&#x1F948;','&#x1F949;','&#x2197;&#xFE0F;','&#x2796;','&#x2796;','&#x1F4C9;','&#x1F4C9;','&#x1F4C9;','&#x1F4A9;','&#x1F4A9;','&#x1F4A9;'];
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

    // ── Total Margin Bar Chart ───────────────────────────────────────────── //
    var chartMargin = null;

    function rebuildMarginChart(standings) {
      var el = document.getElementById('chart-totalmargin');
      if (!el) return;
      var sorted = standings.slice().sort(function(a, b) { return (b.total_margin || 0) - (a.total_margin || 0); });
      var labels = sorted.map(function(s) { return YK.ownerDisplayName(s.owner); });
      var data   = sorted.map(function(s) { return +(s.total_margin || 0).toFixed(2); });
      var colors = sorted.map(function(s) { return YK.ownerColor(s.owner); });

      if (chartMargin) { chartMargin.destroy(); chartMargin = null; }

      var barOpts = YK.barOptions({ yLabel: 'Total Margin' });
      chartMargin = new Chart(el.getContext('2d'), {
        type: 'bar',
        data: { labels: labels, datasets: [{ data: data, backgroundColor: colors, borderColor: colors, borderWidth: 1, borderRadius: 4 }] },
        options: {
          ...barOpts,
          plugins: { ...barOpts.plugins, legend: { display: false } },
          scales: {
            ...barOpts.scales,
            x: { ...barOpts.scales.x, ticks: { maxRotation: 45, font: { size: 10 } } },
          },
        },
      });
    }

    // ── Win% × Total Margin Scatter ──────────────────────────────────────── //
    var chartScatter = null;

    function rebuildScatterChart(standings) {
      var el = document.getElementById('chart-scatter');
      if (!el) return;

      var datasets = standings.map(function(s) {
        return {
          label: YK.ownerDisplayName(s.owner),
          data: [{ x: +(s.win_pct * 100).toFixed(1), y: +(s.total_margin || 0).toFixed(1) }],
          backgroundColor: YK.ownerColor(s.owner),
          pointRadius: 10,
          pointHoverRadius: 13,
        };
      });

      // Tighten x-axis range: pad ±10pp around actual min/max, clamp 0–100
      var xVals = standings.map(function(s) { return s.win_pct * 100; });
      var yVals = standings.map(function(s) { return s.total_margin || 0; });
      var xMin = xVals.length ? Math.max(0,   Math.floor((Math.min.apply(null, xVals) - 10) / 10) * 10) : 0;
      var xMax = xVals.length ? Math.min(100, Math.ceil( (Math.max.apply(null, xVals) + 10) / 10) * 10) : 100;
      var medianY = 0;
      if (yVals.length) {
        var sortedY = yVals.slice().sort(function(a, b) { return a - b; });
        var mid = Math.floor(sortedY.length / 2);
        medianY = sortedY.length % 2 !== 0 ? sortedY[mid] : (sortedY[mid - 1] + sortedY[mid]) / 2;
      }

      // Name labels centered below each dot
      var dotLabels = {
        id: 'dotLabels',
        afterDatasetsDraw: function(chart) {
          var ctx = chart.ctx;
          ctx.save();
          ctx.font = '10px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#888';
          chart.data.datasets.forEach(function(ds, i) {
            var meta = chart.getDatasetMeta(i);
            if (!meta.hidden && meta.data.length) {
              var pt = meta.data[0];
              ctx.fillText(ds.label, pt.x, pt.y + 18);
            }
          });
          ctx.restore();
        },
      };

      // Quadrant divider lines at 50% Win and median Total Margin + corner labels
      var quadrantPlugin = {
        id: 'quadrantLabels',
        afterDraw: function(chart) {
          var ctx  = chart.ctx;
          var xS   = chart.scales.x;
          var yS   = chart.scales.y;

          // Draw quadrant divider lines
          ctx.save();
          ctx.setLineDash([6, 4]);
          ctx.strokeStyle = 'rgba(100,100,100,0.7)';
          ctx.lineWidth = 1;

          // Vertical line at 50% Win
          var x50 = xS.getPixelForValue(50);
          if (x50 >= xS.left && x50 <= xS.right) {
            ctx.beginPath();
            ctx.moveTo(x50, yS.top);
            ctx.lineTo(x50, yS.bottom);
            ctx.stroke();
          }

          // Horizontal line at median Total Margin
          var yMed = yS.getPixelForValue(medianY);
          if (yMed >= yS.top && yMed <= yS.bottom) {
            ctx.beginPath();
            ctx.moveTo(xS.left, yMed);
            ctx.lineTo(xS.right, yMed);
            ctx.stroke();
          }
          ctx.restore();

          // Corner labels
          ctx.save();
          ctx.font = '10px system-ui, sans-serif';
          ctx.fillStyle = 'rgba(150,150,150,0.5)';
          ctx.textAlign = 'right';
          ctx.fillText('Wins often + big margins', xS.right - 6, yS.top + 14);
          ctx.textAlign = 'left';
          ctx.fillText('Wins rarely + small margins', xS.left + 6, yS.bottom - 8);
          ctx.restore();
        },
      };

      if (chartScatter) { chartScatter.destroy(); chartScatter = null; }

      chartScatter = new Chart(el.getContext('2d'), {
        type: 'scatter',
        data: { datasets: datasets },
        options: {
          responsive: true, maintainAspectRatio: false,
          layout: { padding: { bottom: 14 } },
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: function(ctx) {
              return ctx.dataset.label + ': ' + ctx.parsed.x + '% win, +' + ctx.parsed.y + ' margin';
            }}},
          },
          scales: {
            x: {
              min: xMin, max: xMax,
              title: { display: true, text: 'Win %', color: 'var(--text-secondary)' },
              ticks: { color: 'var(--text-secondary)', callback: function(v) { return v + '%'; } },
              grid: { color: 'rgba(160,160,160,0.18)', borderDash: [4, 3] },
            },
            y: {
              title: { display: true, text: 'Total Margin', color: 'var(--text-secondary)' },
              ticks: { color: 'var(--text-secondary)' },
              grid: { color: 'rgba(160,160,160,0.18)', borderDash: [4, 3] },
            },
          },
        },
        plugins: [dotLabels, quadrantPlugin],
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

    // ── Trade Activity section ─────────────────────────────────────────── //
    function renderTradeActivity() {
      var activity = lbData.trade_activity;
      if (!activity) return;

      // Volume by owner table
      var volEl = document.getElementById('volume-by-owner');
      if (volEl && activity.volume_by_owner) {
        var vol = activity.volume_by_owner;
        var owners = Object.keys(vol).sort(function(a, b) {
          return (vol[b].total || 0) - (vol[a].total || 0);
        });
        // Collect all seasons
        var allSeasons = new Set();
        owners.forEach(function(o) {
          Object.keys(vol[o].seasons || {}).forEach(function(s) { allSeasons.add(s); });
        });
        var seasons = Array.from(allSeasons).sort();

        var html = '<div class="data-table-wrapper"><table class="data-table"><thead><tr>' +
          '<th>Owner</th><th style="text-align:center">Total</th>';
        seasons.forEach(function(s) {
          html += '<th style="text-align:center">' + s + '</th>';
        });
        html += '</tr></thead><tbody>';
        owners.forEach(function(o) {
          var color = YK.ownerColor(o);
          html += '<tr><td>' +
            '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' +
            color + ';margin-right:6px;vertical-align:middle"></span>' +
            YK.ownerDisplayName(o) + '</td>' +
            '<td style="text-align:center;font-weight:700">' + (vol[o].total || 0) + '</td>';
          seasons.forEach(function(s) {
            var ct = (vol[o].seasons || {})[s] || 0;
            html += '<td style="text-align:center;color:' + (ct === 0 ? 'var(--text-muted)' : 'inherit') + '">' +
              (ct || '\u2014') + '</td>';
          });
          html += '</tr>';
        });
        html += '</tbody></table></div>';
        volEl.innerHTML = html;
      }

      // Partner matrix heat-map table
      var matEl = document.getElementById('partner-matrix');
      if (matEl && activity.partner_matrix) {
        var pm = activity.partner_matrix;
        var pmOwners = pm.owners || [];
        var counts = pm.counts || [];
        // Find max for heat-map scaling
        var maxCount = 0;
        counts.forEach(function(row) {
          row.forEach(function(c) { if (c > maxCount) maxCount = c; });
        });

        var html = '<table class="data-table" style="font-size:0.78rem"><thead><tr><th></th>';
        pmOwners.forEach(function(o) {
          var short = YK.ownerDisplayName(o);
          if (short.length > 5) short = short.substring(0, 4) + '.';
          html += '<th style="text-align:center;writing-mode:vertical-lr;transform:rotate(180deg);' +
            'max-width:32px;padding:4px 2px;font-size:0.68rem">' + short + '</th>';
        });
        html += '</tr></thead><tbody>';
        pmOwners.forEach(function(o, i) {
          html += '<tr><td style="font-weight:600;white-space:nowrap;font-size:0.75rem">' +
            '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' +
            YK.ownerColor(o) + ';margin-right:4px"></span>' + YK.ownerDisplayName(o) + '</td>';
          (counts[i] || []).forEach(function(c, j) {
            if (i === j) {
              html += '<td style="text-align:center;background:var(--bg-primary);color:var(--text-muted)">\u2014</td>';
            } else {
              var intensity = maxCount > 0 ? c / maxCount : 0;
              var bg = 'rgba(34,197,94,' + (intensity * 0.45).toFixed(2) + ')';
              html += '<td style="text-align:center;background:' + bg + ';font-weight:' +
                (c >= 3 ? '700' : '400') + '">' + (c || '') + '</td>';
            }
          });
          html += '</tr>';
        });
        html += '</tbody></table>';
        matEl.innerHTML = html;
      }

      // Multi-party trades
      var mpEl = document.getElementById('multi-party-trades');
      var mpTrades = lbData.multi_party_trades || [];
      if (mpEl && mpTrades.length > 0) {
        var html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px">';
        mpTrades.forEach(function(t) {
          html += '<div style="border:1px solid var(--border);border-radius:var(--radius-sm);padding:8px 10px;' +
            'background:var(--bg-card);font-size:0.8rem">' +
            '<div style="font-weight:600;margin-bottom:4px">#' + t.trade_id + ' <span style="color:var(--text-muted);' +
            'font-weight:400">' + (t.season || '') + '</span></div>';
          (t.sides || []).forEach(function(s) {
            html += '<div style="display:flex;justify-content:space-between;padding:1px 0">' +
              '<span>' + YK.ownerDisplayName(s.owner) + '</span>' +
              '<span style="color:var(--text-muted)">' + (s.side_total || 0).toFixed(1) + '</span></div>';
          });
          html += '<div style="font-size:0.68rem;color:var(--text-muted);margin-top:4px;font-style:italic">' +
            'Not included in W/L records</div></div>';
        });
        html += '</div>';
        mpEl.innerHTML = html;
      } else if (mpEl) {
        mpEl.innerHTML = '<p class="text-muted" style="font-size:0.8rem">No multi-party trades found.</p>';
      }
    }

    // ── Initial render ───────────────────────────────────────────────────── //
    var initSubset   = getSeasonSubset(); // already filters multi-party
    var initStandings = computeStandings(initSubset);
    rebuildSummaryCards(initSubset, initStandings);
    renderStandings('overall-tbody', initStandings);
    rebuildChart(initStandings);
    rebuildMarginChart(initStandings);
    rebuildScatterChart(initStandings);
    updateInsight(initStandings);
    renderTradeActivity();
  });
})();
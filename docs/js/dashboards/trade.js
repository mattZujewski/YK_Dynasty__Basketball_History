/**
 * trade.js — Dashboard module for trade.html
 * YK Dynasty Basketball
 */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', async function () {
    const YK = window.YK;
    YK.applyChartDefaults();

    let trades, rankingsData;
    var gradesData;
    try {
      [trades, rankingsData] = await Promise.all([
        YK.loadJSON('data/trades.json'),
        YK.loadJSON('data/rankings.json'),
      ]);
    } catch (e) {
      console.error('Failed to load data:', e);
      return;
    }

    gradesData = await YK.loadJSON('data/trade_grades.json').catch(function() { return null; });

    var gradeMap = {};
    if (gradesData && gradesData.trades) {
      gradesData.trades.forEach(function(t) {
        gradeMap[t.trade_index] = t;
      });
    }

    // Build rank lookup
    var rankMap = {};
    var rankingsArr = Array.isArray(rankingsData) ? rankingsData : (rankingsData.rankings || []);
    rankingsArr.forEach(function(r) {
      var name = r.player_name || r.player;
      rankMap[YK.normalizeName(name)] = r.rank;
    });

    // Dynamic subtitle
    var allSeasons = [];
    var seasonSet = {};
    trades.forEach(function(t) {
      if (!seasonSet[t.season]) { seasonSet[t.season] = true; allSeasons.push(t.season); }
    });
    allSeasons.sort();
    document.getElementById('trade-subtitle').innerHTML =
      'Every trade across ' + allSeasons.length + ' seasons of YK Dynasty Basketball';

    var activeSeason = 'all';
    var activeOwner = 'all';

    // Build season filter buttons
    var filterBar = document.getElementById('season-filter-bar');
    var allBtn = document.createElement('button');
    allBtn.className = 'filter-btn active';
    allBtn.textContent = 'All';
    allBtn.addEventListener('click', function() {
      activeSeason = 'all';
      filterBar.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
      allBtn.classList.add('active');
      render();
    });
    filterBar.appendChild(allBtn);

    allSeasons.forEach(function(s) {
      var btn = document.createElement('button');
      btn.className = 'filter-btn';
      btn.textContent = s;
      btn.addEventListener('click', function() {
        activeSeason = s;
        filterBar.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        render();
      });
      filterBar.appendChild(btn);
    });

    // Build owner filter dropdown
    var ownerSelect = document.getElementById('owner-filter');
    YK.OWNERS_ALPHA.forEach(function(owner) {
      var opt = document.createElement('option');
      opt.value = owner;
      opt.textContent = YK.ownerDisplayName(owner);
      ownerSelect.appendChild(opt);
    });
    ownerSelect.addEventListener('change', function() {
      activeOwner = ownerSelect.value;
      render();
    });

    // Get filtered trades
    function getFilteredTrades() {
      var filtered = trades;
      if (activeSeason !== 'all') {
        filtered = filtered.filter(function(t) { return t.season === activeSeason; });
      }
      if (activeOwner !== 'all') {
        filtered = filtered.filter(function(t) {
          var involved = false;
          (t.give || []).concat(t.get || []).forEach(function(item) {
            if (YK.parseOwner(item) === activeOwner) involved = true;
          });
          return involved;
        });
      }
      return filtered;
    }

    // Find all owners involved in a trade
    function tradeOwners(trade) {
      var owners = new Set();
      (trade.give || []).concat(trade.get || []).forEach(function(item) {
        var o = YK.parseOwner(item);
        if (o && YK.OWNERS_ALPHA.includes(o)) owners.add(o);
      });
      return Array.from(owners);
    }

    // Count trades per canonical owner
    function countByOwner(filtered) {
      var counts = {};
      filtered.forEach(function(trade) {
        var owners = new Set();
        (trade.give || []).concat(trade.get || []).forEach(function(item) {
          var owner = YK.parseOwner(item);
          if (owner && YK.OWNERS_ALPHA.includes(owner)) owners.add(owner);
        });
        owners.forEach(function(o) { counts[o] = (counts[o] || 0) + 1; });
      });
      return counts;
    }

    var volumeChart = null;
    var seasonChart = null;

    // --- Trades by Season chart (always shows full data) ---
    function renderSeasonChart() {
      var seasonCounts = {};
      allSeasons.forEach(function(s) { seasonCounts[s] = 0; });
      trades.forEach(function(t) { seasonCounts[t.season] = (seasonCounts[t.season] || 0) + 1; });

      var labels = allSeasons;
      var data = allSeasons.map(function(s) { return seasonCounts[s]; });

      if (seasonChart) seasonChart.destroy();
      seasonChart = new Chart(document.getElementById('chart-trades-by-season').getContext('2d'), {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            data: data,
            backgroundColor: 'rgba(26,107,60,0.7)',
            borderColor: 'var(--brand-green)',
            borderWidth: 1,
            borderRadius: 4,
          }],
        },
        options: YK.barOptions({ yLabel: 'Trades' }),
      });
    }

    function render() {
      var filtered = getFilteredTrades();

      // Trade count label
      document.getElementById('trade-count').textContent =
        filtered.length + ' trade' + (filtered.length !== 1 ? 's' : '') +
        (activeSeason !== 'all' ? ' in ' + activeSeason : ' across all seasons') +
        (activeOwner !== 'all' ? ' involving ' + YK.ownerDisplayName(activeOwner) : '');

      // Render trade table
      var tbody = document.getElementById('trade-tbody');
      if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted" style="padding:24px">No trades found</td></tr>';
      } else {
        function formatTradeItem(g) {
          var owner = YK.parseOwner(g);
          var color = YK.ownerColor(owner);
          var lastName = (YK.ownerDisplayName(owner) || '').split(' ').pop();
          var asset = YK.parseAsset(g);
          var rank = rankMap[YK.normalizeName(asset)];
          var rankBadge = rank !== undefined
            ? ' <span style="background:rgba(232,184,75,0.18);color:#c7960a;font-size:0.66rem;font-weight:800;padding:1px 4px;border-radius:99px">#' + rank + '</span>'
            : '';
          return '<div style="margin-bottom:2px">' +
            '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:' + color + ';margin-right:4px;vertical-align:middle"></span>' +
            '<span style="color:var(--text-muted);font-weight:600;font-size:0.75rem">' + YK.escapeHtml(lastName) + '</span> ' +
            YK.escapeHtml(asset) + rankBadge +
          '</div>';
        }

        tbody.innerHTML = filtered.map(function(trade) {
          var giveStr = (trade.give || []).map(formatTradeItem).join('');
          var getStr = (trade.get || []).map(formatTradeItem).join('');
          var tradeIdx = trades.indexOf(trade);
          var gradeInfo = gradeMap[tradeIdx];
          var gradeHtml = '';
          if (gradeInfo) {
            var GRADE_COLORS = {'A+':'#1a6b3c','A':'#2a9d8f','B':'#4e9af1','C':'#f4a261','D':'#e76f51','F':'#e63946','INC':'#888'};
            var sideA = gradeInfo.side_a || {};
            var sideB = gradeInfo.side_b || {};
            if (sideA.grade && sideA.grade !== 'INC') {
              var cA = GRADE_COLORS[sideA.grade] || '#888';
              gradeHtml += '<span style="display:inline-block;min-width:24px;text-align:center;background:' + cA + ';color:#fff;font-size:0.68rem;font-weight:800;padding:2px 6px;border-radius:99px;margin-right:2px" title="' + YK.escapeHtml(sideA.owner) + '">' + sideA.grade + '</span>';
            }
            if (sideB.grade && sideB.grade !== 'INC') {
              var cB = GRADE_COLORS[sideB.grade] || '#888';
              gradeHtml += '<span style="display:inline-block;min-width:24px;text-align:center;background:' + cB + ';color:#fff;font-size:0.68rem;font-weight:800;padding:2px 6px;border-radius:99px" title="' + YK.escapeHtml(sideB.owner) + '">' + sideB.grade + '</span>';
            }
            if (!gradeHtml) gradeHtml = '<span style="color:var(--text-muted);font-size:0.72rem">N/A</span>';
          } else {
            gradeHtml = '<span style="color:var(--text-muted);font-size:0.72rem">&mdash;</span>';
          }
          return '<tr data-season="' + trade.season + '" data-date="' + (trade.date || '') + '">' +
            '<td><strong>' + trade.season + '</strong></td>' +
            '<td style="white-space:nowrap;color:var(--text-muted);font-size:0.8rem">' + (trade.date || '&mdash;') + '</td>' +
            '<td style="font-size:0.82rem">' + giveStr + '</td>' +
            '<td style="font-size:0.82rem">' + getStr + '</td>' +
            '<td style="text-align:center">' + gradeHtml + '</td>' +
          '</tr>';
        }).join('');
      }

      // Render volume bar chart — use display names
      var counts = countByOwner(filtered);
      var sortedOwners = Object.keys(counts).sort(function(a, b) { return counts[b] - counts[a]; });
      var labels = sortedOwners.map(function(o) { return YK.ownerDisplayName(o); });
      var data = sortedOwners.map(function(o) { return counts[o]; });
      var colors = sortedOwners.map(function(o) { return YK.ownerColor(o); });

      if (volumeChart) volumeChart.destroy();

      volumeChart = new Chart(document.getElementById('chart-trade-volume').getContext('2d'), {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            data: data,
            backgroundColor: colors,
            borderColor: colors,
            borderWidth: 1,
            borderRadius: 4,
          }],
        },
        options: {
          ...YK.barOptions({ yLabel: 'Number of Trades' }),
          scales: {
            ...YK.barOptions({ yLabel: 'Number of Trades' }).scales,
            x: {
              ...YK.barOptions({}).scales.x,
              ticks: { maxRotation: 45, font: { size: 10 } },
            },
          },
        },
      });

      // Insight
      if (sortedOwners.length > 0) {
        var topOwner = sortedOwners[0];
        document.getElementById('insight-volume').innerHTML =
          '<strong>' + YK.ownerDisplayName(topOwner) + '</strong> leads with <strong>' + counts[topOwner] + '</strong> trade participations' +
          (activeSeason !== 'all' ? ' in ' + activeSeason : ' across all seasons') + '.';
      }

      // Render trade partner matrix
      renderMatrix(filtered);
    }

    // --- Trade Partner Matrix ---
    function renderMatrix(filtered) {
      var owners = YK.OWNERS_ALPHA.slice();
      // Build matrix: matrix[a][b] = [trade objects]
      var matrix = {};
      owners.forEach(function(a) {
        matrix[a] = {};
        owners.forEach(function(b) { matrix[a][b] = []; });
      });

      filtered.forEach(function(trade) {
        var involved = tradeOwners(trade);
        // For each pair
        for (var i = 0; i < involved.length; i++) {
          for (var j = i + 1; j < involved.length; j++) {
            matrix[involved[i]][involved[j]].push(trade);
            matrix[involved[j]][involved[i]].push(trade);
          }
        }
      });

      // Find max for "hot" threshold
      var maxCount = 0;
      owners.forEach(function(a) {
        owners.forEach(function(b) {
          if (a !== b && matrix[a][b].length > maxCount) maxCount = matrix[a][b].length;
        });
      });
      var hotThreshold = Math.max(3, Math.ceil(maxCount * 0.6));

      var container = document.getElementById('matrix-container');
      var html = '<div class="trade-matrix" style="grid-template-columns: 110px repeat(' + owners.length + ', 1fr);">';

      // Header row
      html += '<div class="trade-matrix-cell header"></div>';
      owners.forEach(function(o) {
        var last = YK.ownerDisplayName(o).split(' ').pop();
        html += '<div class="trade-matrix-cell header">' + last + '</div>';
      });

      // Data rows
      owners.forEach(function(rowOwner) {
        var last = YK.ownerDisplayName(rowOwner).split(' ').pop();
        var color = YK.ownerColor(rowOwner);
        html += '<div class="trade-matrix-cell row-label">' +
          '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + color + ';margin-right:4px;vertical-align:middle"></span>' +
          last + '</div>';

        owners.forEach(function(colOwner) {
          if (rowOwner === colOwner) {
            html += '<div class="trade-matrix-cell diagonal">&mdash;</div>';
          } else {
            var count = matrix[rowOwner][colOwner].length;
            if (count === 0) {
              html += '<div class="trade-matrix-cell empty">0</div>';
            } else {
              var cls = count >= hotThreshold ? 'has-trades hot' : 'has-trades';
              html += '<div class="trade-matrix-cell ' + cls + '" data-row="' + rowOwner + '" data-col="' + colOwner + '" data-count="' + count + '">' + count + '</div>';
            }
          }
        });
      });

      html += '</div>';
      container.innerHTML = html;

      // Tooltip hover handlers
      var tooltip = document.getElementById('matrix-tooltip');
      container.querySelectorAll('.trade-matrix-cell.has-trades').forEach(function(cell) {
        cell.addEventListener('mouseenter', function(e) {
          var row = cell.dataset.row;
          var col = cell.dataset.col;
          var tradeList = matrix[row][col];
          var titleHtml = YK.ownerDisplayName(row) + ' &harr; ' + YK.ownerDisplayName(col) + ' (' + tradeList.length + ' trade' + (tradeList.length !== 1 ? 's' : '') + ')';
          var bodyHtml = tradeList.slice(0, 5).map(function(t) {
            return '<div class="tooltip-item">' + t.season + (t.date ? ' (' + t.date + ')' : '') + '</div>';
          }).join('');
          if (tradeList.length > 5) bodyHtml += '<div class="tooltip-item" style="color:var(--text-muted)">...and ' + (tradeList.length - 5) + ' more</div>';

          tooltip.querySelector('.tooltip-title').innerHTML = titleHtml;
          tooltip.querySelector('.tooltip-body').innerHTML = bodyHtml;
          tooltip.classList.add('visible');

          var rect = cell.getBoundingClientRect();
          tooltip.style.left = Math.min(rect.left, window.innerWidth - 340) + 'px';
          tooltip.style.top = (rect.bottom + 8) + 'px';
        });
        cell.addEventListener('mouseleave', function() {
          tooltip.classList.remove('visible');
        });
      });
    }

    renderSeasonChart();
    render();
    YK.makeSortable(document.getElementById('trade-table'));
  });
})();

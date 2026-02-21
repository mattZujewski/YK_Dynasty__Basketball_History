/**
 * stats.js — Dashboard module for stats.html (Trade Analysis)
 * YK Dynasty Basketball
 */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', async function () {
    var YK = window.YK;

    var tradesData, rosterData, statsData, rankingsData, movementData;
    try {
      [tradesData, rosterData, rankingsData] = await Promise.all([
        YK.loadJSON('data/trades.json'),
        YK.loadJSON('data/rosters_2025_26.json'),
        YK.loadJSON('data/rankings.json'),
      ]);
      statsData = await YK.loadJSON('data/player_stats.json').catch(function() { return null; });
      movementData = await YK.loadJSON('data/player_movement.json').catch(function() { return null; });
    } catch (e) {
      console.error('Failed to load data:', e);
      return;
    }

    var stats = (statsData && statsData.players) || {};
    var rankingsArr = Array.isArray(rankingsData) ? rankingsData : (rankingsData.rankings || []);

    // Build rank lookup
    var rankMap = {};
    rankingsArr.forEach(function(r) {
      var name = r.player_name || r.player;
      rankMap[YK.normalizeName(name)] = r.rank;
    });

    // Build player → stats lookup by normalized name
    var statsNorm = {};
    Object.keys(stats).forEach(function(name) {
      statsNorm[YK.normalizeName(name)] = stats[name];
    });

    // Helper: check if trade item is a pick
    function isPick(asset) {
      var lower = asset.toLowerCase();
      return /(?:1st|2nd)\s*(?:round|rd)/i.test(lower) || lower.includes('pick') || lower.includes('swap');
    }

    // Analyze each trade: score = sum of ranks of all involved ranked players
    var tradeAnalysis = tradesData.map(function(trade, idx) {
      var players = [];
      var giveItems = (trade.give || []).map(function(item) {
        var owner = YK.parseOwner(item);
        var asset = YK.parseAsset(item);
        var norm = YK.normalizeName(asset);
        var rank = rankMap[norm];
        var playerStat = statsNorm[norm];
        if (!isPick(asset)) {
          players.push({ name: asset, rank: rank, stats: playerStat, side: 'give', owner: owner });
        }
        return { owner: owner, asset: asset, rank: rank, stats: playerStat, isPick: isPick(asset) };
      });
      var getItems = (trade.get || []).map(function(item) {
        var owner = YK.parseOwner(item);
        var asset = YK.parseAsset(item);
        var norm = YK.normalizeName(asset);
        var rank = rankMap[norm];
        var playerStat = statsNorm[norm];
        if (!isPick(asset)) {
          players.push({ name: asset, rank: rank, stats: playerStat, side: 'get', owner: owner });
        }
        return { owner: owner, asset: asset, rank: rank, stats: playerStat, isPick: isPick(asset) };
      });

      var rankedCount = players.filter(function(p) { return p.rank !== undefined; }).length;
      var totalRankScore = 0;
      players.forEach(function(p) {
        if (p.rank !== undefined) totalRankScore += (50 - p.rank);
      });

      return {
        index: idx,
        trade: trade,
        giveItems: giveItems,
        getItems: getItems,
        players: players,
        rankedCount: rankedCount,
        totalRankScore: totalRankScore,
      };
    });

    // Populate trade selector
    var tradeSelect = document.getElementById('trade-select');
    tradesData.forEach(function(trade, idx) {
      var opt = document.createElement('option');
      opt.value = idx;
      var owners = new Set();
      (trade.give || []).concat(trade.get || []).forEach(function(item) {
        owners.add(YK.parseOwner(item));
      });
      var ownerNames = Array.from(owners).map(function(o) {
        return (YK.ownerDisplayName(o) || o).split(' ').pop();
      });
      opt.textContent = trade.season + (trade.date ? ' (' + trade.date + ')' : '') + ' — ' + ownerNames.join(' \u2194 ');
      tradeSelect.appendChild(opt);
    });

    // Stat bar
    var statsBar = document.getElementById('stats-bar');
    var totalTrades = tradesData.length;
    var tradesWithRanked = tradeAnalysis.filter(function(t) { return t.rankedCount > 0; }).length;
    var totalPlayersTraded = 0;
    tradeAnalysis.forEach(function(t) { totalPlayersTraded += t.players.length; });

    statsBar.innerHTML =
      '<div class="stat-card"><span class="stat-label">Total Trades</span><span class="stat-value">' + totalTrades + '</span></div>' +
      '<div class="stat-card"><span class="stat-label">With Ranked Players</span><span class="stat-value">' + tradesWithRanked + '</span></div>' +
      '<div class="stat-card"><span class="stat-label">Players Moved</span><span class="stat-value">' + totalPlayersTraded + '</span></div>' +
      '<div class="stat-card"><span class="stat-label">Ranked Players</span><span class="stat-value">' + rankingsArr.length + '</span></div>';

    // Render biggest trades
    var biggestTrades = tradeAnalysis.slice().sort(function(a, b) {
      return b.totalRankScore - a.totalRankScore;
    }).filter(function(t) { return t.rankedCount >= 1; }).slice(0, 8);

    var bigGrid = document.getElementById('biggest-trades-grid');
    bigGrid.innerHTML = biggestTrades.map(function(ta) {
      var trade = ta.trade;
      var owners = new Set();
      ta.giveItems.concat(ta.getItems).forEach(function(item) { owners.add(item.owner); });
      var ownerArr = Array.from(owners);
      var borderColor = ownerArr.length > 0 ? YK.ownerColor(ownerArr[0]) : 'var(--border)';

      var topPlayer = ta.players.filter(function(p) { return p.rank !== undefined; }).sort(function(a, b) { return a.rank - b.rank; })[0];

      var rankedNames = ta.players.filter(function(p) { return p.rank !== undefined; })
        .sort(function(a, b) { return a.rank - b.rank; })
        .map(function(p) { return '#' + p.rank + ' ' + p.name; })
        .join(', ');

      return '<div class="roster-card" style="border-top:3px solid ' + borderColor + ';cursor:pointer" data-trade-idx="' + ta.index + '">' +
        '<div class="roster-card-header">' +
          '<strong>' + trade.season + '</strong>' +
          '<span style="margin-left:auto;color:var(--text-muted);font-size:0.78rem">' + (trade.date || '') + '</span>' +
        '</div>' +
        '<div style="padding:12px 18px;font-size:0.82rem">' +
          '<div style="margin-bottom:6px">' +
            ownerArr.map(function(o) {
              return '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + YK.ownerColor(o) + ';margin-right:3px;vertical-align:middle"></span>' +
                '<span style="font-weight:600">' + (YK.ownerDisplayName(o) || o).split(' ').pop() + '</span>';
            }).join(' <span style="color:var(--text-muted)">\u2194</span> ') +
          '</div>' +
          '<div style="color:var(--text-muted);font-size:0.78rem;margin-top:4px">' +
            '<span style="background:rgba(232,184,75,0.18);color:#c7960a;font-size:0.7rem;font-weight:700;padding:1px 6px;border-radius:99px;margin-right:4px">' + ta.rankedCount + ' ranked</span>' +
            rankedNames +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    // Click handlers for biggest trade cards
    bigGrid.querySelectorAll('.roster-card[data-trade-idx]').forEach(function(card) {
      card.addEventListener('click', function() {
        var idx = parseInt(card.dataset.tradeIdx);
        tradeSelect.value = idx;
        showTradeDetail(idx);
      });
    });

    // Trade detail view
    var detailDiv = document.getElementById('trade-detail');
    var bigSection = document.getElementById('biggest-trades-section');

    function showTradeDetail(idx) {
      var ta = tradeAnalysis[idx];
      if (!ta) { detailDiv.style.display = 'none'; return; }

      detailDiv.style.display = 'block';
      bigSection.style.display = 'none';

      var trade = ta.trade;
      var html = '';

      // Trade header
      var owners = new Set();
      ta.giveItems.concat(ta.getItems).forEach(function(item) { owners.add(item.owner); });
      var ownerArr = Array.from(owners);

      html += '<div class="team-profile-header">';
      if (ownerArr.length > 0) {
        html += '<div class="color-bar" style="background:linear-gradient(180deg,' + ownerArr.map(function(o) { return YK.ownerColor(o); }).join(',') + ')"></div>';
      }
      html += '<div class="profile-info" style="padding-left:14px">';
      html += '<div class="profile-name">' + trade.season + ' Trade</div>';
      html += '<div class="profile-meta">' + (trade.date || 'No date') + ' &middot; ';
      html += ownerArr.map(function(o) {
        return '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + YK.ownerColor(o) + ';margin-right:3px;vertical-align:middle"></span>' + YK.ownerDisplayName(o);
      }).join(' \u2194 ');
      html += '</div></div>';
      html += '<div class="profile-record" style="text-align:center">';
      html += '<div class="big-num" style="font-size:1.4rem">' + ta.rankedCount + '</div>';
      html += '<div class="rec-label">Ranked Players</div>';
      html += '</div>';
      html += '</div>';

      // Trade value comparison: Give vs Get
      function renderSide(items, label) {
        var sideHtml = '<div class="chart-section" style="flex:1;min-width:300px">';
        sideHtml += '<h2>' + label + '</h2>';
        sideHtml += '<div class="data-table-wrapper"><table class="data-table">';
        sideHtml += '<thead><tr><th>Owner</th><th>Asset</th><th>Rank</th><th>PPG</th><th>RPG</th><th>APG</th></tr></thead>';
        sideHtml += '<tbody>';

        items.forEach(function(item) {
          var color = YK.ownerColor(item.owner);
          var lastName = (YK.ownerDisplayName(item.owner) || '').split(' ').pop();
          var rankBadge = item.rank !== undefined
            ? '<span style="background:rgba(232,184,75,0.18);color:#c7960a;font-size:0.72rem;font-weight:800;padding:2px 6px;border-radius:99px">#' + item.rank + '</span>'
            : '<span style="color:var(--text-muted)">&mdash;</span>';

          var ppg = '—', rpg = '—', apg = '—';
          if (item.stats && item.stats.stats) {
            ppg = item.stats.stats.ppg;
            rpg = item.stats.stats.rpg;
            apg = item.stats.stats.apg;
          }

          sideHtml += '<tr>';
          sideHtml += '<td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + color + ';margin-right:4px;vertical-align:middle"></span>' + YK.escapeHtml(lastName) + '</td>';
          sideHtml += '<td><strong>' + YK.escapeHtml(item.asset) + '</strong>';
          if (item.isPick) sideHtml += ' <span style="color:var(--text-muted);font-size:0.72rem">(pick)</span>';
          sideHtml += '</td>';
          sideHtml += '<td style="text-align:center">' + rankBadge + '</td>';
          sideHtml += '<td style="text-align:center">' + ppg + '</td>';
          sideHtml += '<td style="text-align:center">' + rpg + '</td>';
          sideHtml += '<td style="text-align:center">' + apg + '</td>';
          sideHtml += '</tr>';
        });

        sideHtml += '</tbody></table></div></div>';
        return sideHtml;
      }

      html += '<div style="display:flex;gap:16px;flex-wrap:wrap">';
      html += renderSide(ta.giveItems, '\u2B05\uFE0F Give');
      html += renderSide(ta.getItems, '\u27A1\uFE0F Get');
      html += '</div>';

      // Trade Value Meter
      var giveScore = 0, getScore = 0;
      ta.giveItems.forEach(function(item) {
        if (item.rank !== undefined) giveScore += (50 - item.rank);
        if (item.stats && item.stats.stats) giveScore += item.stats.stats.ppg;
      });
      ta.getItems.forEach(function(item) {
        if (item.rank !== undefined) getScore += (50 - item.rank);
        if (item.stats && item.stats.stats) getScore += item.stats.stats.ppg;
      });
      var totalScore = giveScore + getScore;
      var givePct = totalScore > 0 ? Math.round((giveScore / totalScore) * 100) : 50;
      var getPct = 100 - givePct;

      if (totalScore > 0) {
        html += '<div class="chart-section">';
        html += '<h2>Trade Value Meter</h2>';
        html += '<p class="chart-description">Relative value based on dynasty rank + PPG</p>';
        html += '<div style="display:flex;align-items:center;gap:12px;margin-top:12px">';
        html += '<span style="font-weight:700;font-size:0.82rem;min-width:40px;text-align:right">Give</span>';
        html += '<div style="flex:1;height:24px;border-radius:12px;overflow:hidden;display:flex;background:var(--bg-card);border:1px solid var(--border)">';
        html += '<div style="width:' + givePct + '%;background:' + (ownerArr[0] ? YK.ownerColor(ownerArr[0]) : '#888') + ';transition:width 0.4s"></div>';
        html += '<div style="width:' + getPct + '%;background:' + (ownerArr[1] ? YK.ownerColor(ownerArr[1]) : '#aaa') + ';transition:width 0.4s"></div>';
        html += '</div>';
        html += '<span style="font-weight:700;font-size:0.82rem;min-width:40px">Get</span>';
        html += '</div>';
        html += '<div style="display:flex;justify-content:space-between;margin-top:6px;font-size:0.78rem;color:var(--text-muted)">';
        html += '<span>' + givePct + '% (' + giveScore.toFixed(0) + ' pts)</span>';
        html += '<span>' + getPct + '% (' + getScore.toFixed(0) + ' pts)</span>';
        html += '</div>';
        html += '</div>';
      }

      // Note if trade has notes
      if (trade.notes) {
        html += '<div class="chart-section">';
        html += '<h2>Notes</h2>';
        html += '<p style="padding:0 4px;color:var(--text-muted);font-size:0.88rem">' + YK.escapeHtml(trade.notes) + '</p>';
        html += '</div>';
      }

      detailDiv.innerHTML = html;
    }

    tradeSelect.addEventListener('change', function() {
      var val = tradeSelect.value;
      if (val === '') {
        detailDiv.style.display = 'none';
        bigSection.style.display = 'block';
      } else {
        showTradeDetail(parseInt(val));
      }
    });
  });
})();

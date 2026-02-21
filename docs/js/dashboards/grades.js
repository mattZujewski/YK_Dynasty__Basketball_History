/**
 * grades.js — Dashboard module for grades.html (Trade Grades)
 * YK Dynasty Basketball
 */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', async function () {
    var YK = window.YK;

    var gradesData, tradesData, pickLedgerData;
    try {
      [gradesData, tradesData] = await Promise.all([
        YK.loadJSON('data/trade_grades.json'),
        YK.loadJSON('data/trades.json'),
      ]);
      pickLedgerData = await YK.loadJSON('data/pick_ledger.json').catch(function() { return null; });
    } catch (e) {
      console.error('Failed to load data:', e);
      return;
    }

    var gradesList = gradesData.trades || [];
    var meta = gradesData.meta || {};
    var picks = (pickLedgerData && pickLedgerData.picks) || {};

    // Grade colors and values
    var GRADE_COLORS = {
      'A+': '#1a6b3c', 'A': '#2a9d8f', 'B': '#4e9af1',
      'C': '#f4a261', 'D': '#e76f51', 'F': '#e63946', 'INC': '#888'
    };
    var GRADE_VALUES = { 'A+': 4.3, 'A': 4.0, 'B': 3.0, 'C': 2.0, 'D': 1.0, 'F': 0.0 };

    function gradeBadge(grade) {
      var color = GRADE_COLORS[grade] || '#888';
      return '<span style="display:inline-block;min-width:28px;text-align:center;background:' + color + ';color:#fff;font-size:0.72rem;font-weight:800;padding:3px 8px;border-radius:99px">' + YK.escapeHtml(grade) + '</span>';
    }

    function confidenceBadge(conf) {
      var colors = { high: '#2a9d8f', medium: '#f4a261', low: '#e76f51', incomplete: '#888' };
      var color = colors[conf] || '#888';
      return '<span style="font-size:0.68rem;color:' + color + ';font-weight:600">' + conf + '</span>';
    }

    // ── Summary Stats ──
    var statsBar = document.getElementById('grade-stats-bar');
    var graded = gradesList.filter(function(t) { return t.grade_confidence !== 'incomplete'; }).length;
    var incomplete = gradesList.length - graded;
    var highConf = gradesList.filter(function(t) { return t.grade_confidence === 'high'; }).length;

    statsBar.innerHTML =
      '<div class="stat-card"><span class="stat-label">Total Trades</span><span class="stat-value">' + gradesList.length + '</span></div>' +
      '<div class="stat-card"><span class="stat-label">Fully Graded</span><span class="stat-value" style="color:var(--brand-green)">' + graded + '</span></div>' +
      '<div class="stat-card"><span class="stat-label">High Confidence</span><span class="stat-value">' + highConf + '</span></div>' +
      '<div class="stat-card"><span class="stat-label">Incomplete</span><span class="stat-value" style="color:var(--text-muted)">' + incomplete + '</span></div>';

    // ── Owner Report Cards ──
    var ownerStats = {};
    gradesList.forEach(function(t) {
      ['side_a', 'side_b'].forEach(function(side) {
        var s = t[side];
        var owner = s.owner;
        if (!ownerStats[owner]) {
          ownerStats[owner] = { wins: 0, losses: 0, even: 0, grades: [], totalDelta: 0, count: 0 };
        }
        var g = s.grade;
        if (g !== 'INC') {
          var val = GRADE_VALUES[g];
          if (val !== undefined) {
            ownerStats[owner].grades.push(val);
            ownerStats[owner].totalDelta += s.received_delta;
            ownerStats[owner].count++;
          }
        }
      });
      // Determine winner/loser
      var sa = t.side_a;
      var sb = t.side_b;
      if (sa.grade !== 'INC' && sb.grade !== 'INC') {
        if (sa.received_delta > sb.received_delta + 1) {
          if (ownerStats[sa.owner]) ownerStats[sa.owner].wins++;
          if (ownerStats[sb.owner]) ownerStats[sb.owner].losses++;
        } else if (sb.received_delta > sa.received_delta + 1) {
          if (ownerStats[sb.owner]) ownerStats[sb.owner].wins++;
          if (ownerStats[sa.owner]) ownerStats[sa.owner].losses++;
        } else {
          if (ownerStats[sa.owner]) ownerStats[sa.owner].even++;
          if (ownerStats[sb.owner]) ownerStats[sb.owner].even++;
        }
      }
    });

    var ownerGrid = document.getElementById('owner-report-grid');
    var ownerArr = Object.keys(ownerStats).sort(function(a, b) {
      var avgA = ownerStats[a].grades.length > 0 ? ownerStats[a].grades.reduce(function(s, v) { return s + v; }, 0) / ownerStats[a].grades.length : 0;
      var avgB = ownerStats[b].grades.length > 0 ? ownerStats[b].grades.reduce(function(s, v) { return s + v; }, 0) / ownerStats[b].grades.length : 0;
      return avgB - avgA;
    });

    ownerGrid.innerHTML = ownerArr.map(function(owner) {
      var os = ownerStats[owner];
      var avg = os.grades.length > 0 ? os.grades.reduce(function(s, v) { return s + v; }, 0) / os.grades.length : 0;
      var avgGrade;
      if (avg >= 4.0) avgGrade = 'A';
      else if (avg >= 3.0) avgGrade = 'B';
      else if (avg >= 2.0) avgGrade = 'C';
      else if (avg >= 1.0) avgGrade = 'D';
      else avgGrade = 'F';
      var color = YK.ownerColor(owner);
      var avgDelta = os.count > 0 ? (os.totalDelta / os.count) : 0;

      return '<div class="roster-card" style="border-top:3px solid ' + color + '">' +
        '<div class="roster-card-header">' +
          '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + color + ';margin-right:6px"></span>' +
          '<strong>' + YK.ownerDisplayName(owner) + '</strong>' +
          '<span style="margin-left:auto">' + gradeBadge(avgGrade) + '</span>' +
        '</div>' +
        '<div style="padding:12px 18px;font-size:0.82rem">' +
          '<div style="display:flex;gap:14px;margin-bottom:6px">' +
            '<span><strong>' + avg.toFixed(1) + '</strong> <span style="color:var(--text-muted);font-size:0.72rem">avg GPA</span></span>' +
            '<span><strong>' + avgDelta.toFixed(1) + '</strong> <span style="color:var(--text-muted);font-size:0.72rem">avg \u0394 FPts/g</span></span>' +
          '</div>' +
          '<div style="font-size:0.78rem;color:var(--text-muted)">' +
            '<span style="color:#2a9d8f;font-weight:600">' + os.wins + 'W</span> / ' +
            '<span style="color:#e63946;font-weight:600">' + os.losses + 'L</span> / ' +
            '<span>' + os.even + 'E</span>' +
            ' &middot; ' + os.count + ' graded trades' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    // ── Most Lopsided Trades ──
    var notableGrid = document.getElementById('notable-trades-grid');
    var lopsided = gradesList.filter(function(t) {
      return t.grade_confidence !== 'incomplete';
    }).sort(function(a, b) {
      return Math.abs(b.side_a.received_delta - b.side_b.received_delta) -
             Math.abs(a.side_a.received_delta - a.side_b.received_delta);
    }).slice(0, 8);

    notableGrid.innerHTML = lopsided.map(function(t) {
      var sa = t.side_a;
      var sb = t.side_b;
      var winnerSide = sa.received_delta >= sb.received_delta ? sa : sb;
      var loserSide = sa.received_delta >= sb.received_delta ? sb : sa;
      var winColor = YK.ownerColor(winnerSide.owner);
      var gap = Math.abs(sa.received_delta - sb.received_delta).toFixed(1);

      return '<div class="roster-card" style="border-top:3px solid ' + winColor + ';cursor:pointer" data-trade-idx="' + t.trade_index + '">' +
        '<div class="roster-card-header">' +
          '<strong>' + t.season + '</strong>' +
          '<span style="margin-left:auto;color:var(--text-muted);font-size:0.72rem">\u0394 ' + gap + '</span>' +
        '</div>' +
        '<div style="padding:12px 18px;font-size:0.82rem">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
            '<div>' +
              '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + YK.ownerColor(sa.owner) + ';margin-right:3px;vertical-align:middle"></span>' +
              '<strong>' + (YK.ownerDisplayName(sa.owner) || sa.owner).split(' ').pop() + '</strong> ' +
              gradeBadge(sa.grade) +
            '</div>' +
            '<span style="color:var(--text-muted);font-size:0.72rem">\u2194</span>' +
            '<div>' +
              '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + YK.ownerColor(sb.owner) + ';margin-right:3px;vertical-align:middle"></span>' +
              '<strong>' + (YK.ownerDisplayName(sb.owner) || sb.owner).split(' ').pop() + '</strong> ' +
              gradeBadge(sb.grade) +
            '</div>' +
          '</div>' +
          '<div style="font-size:0.75rem;color:var(--text-muted)">' + YK.escapeHtml(t.summary) + '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    // Click handler for notable trade cards
    notableGrid.querySelectorAll('.roster-card[data-trade-idx]').forEach(function(card) {
      card.addEventListener('click', function() {
        showTradeDetail(parseInt(card.dataset.tradeIdx));
      });
    });

    // ── Populate Filters ──
    var filterOwner = document.getElementById('filter-owner');
    var filterSeason = document.getElementById('filter-season');
    var filterGrade = document.getElementById('filter-grade');
    var filterConf = document.getElementById('filter-confidence');

    var allOwners = new Set();
    var allSeasons = new Set();
    gradesList.forEach(function(t) {
      allOwners.add(t.side_a.owner);
      allOwners.add(t.side_b.owner);
      allSeasons.add(t.season);
    });
    Array.from(allOwners).sort().forEach(function(o) {
      var opt = document.createElement('option');
      opt.value = o;
      opt.textContent = YK.ownerDisplayName(o) || o;
      filterOwner.appendChild(opt);
    });
    Array.from(allSeasons).sort().forEach(function(s) {
      var opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      filterSeason.appendChild(opt);
    });

    // ── Trade Log ──
    function renderTradeLog() {
      var ownerFilter = filterOwner.value;
      var seasonFilter = filterSeason.value;
      var gradeFilter = filterGrade.value;
      var confFilter = filterConf.value;

      var filtered = gradesList.filter(function(t) {
        if (seasonFilter && t.season !== seasonFilter) return false;
        if (confFilter && t.grade_confidence !== confFilter) return false;
        if (ownerFilter && t.side_a.owner !== ownerFilter && t.side_b.owner !== ownerFilter) return false;
        if (gradeFilter && t.side_a.grade !== gradeFilter && t.side_b.grade !== gradeFilter) return false;
        return true;
      });

      document.getElementById('trade-count-label').textContent = 'Showing ' + filtered.length + ' of ' + gradesList.length + ' trades';

      var html = '<table class="data-table">';
      html += '<thead><tr><th>Season</th><th>Side A</th><th>Grade</th><th></th><th>Side B</th><th>Grade</th><th>\u0394</th><th>Conf</th></tr></thead>';
      html += '<tbody>';

      filtered.forEach(function(t) {
        var sa = t.side_a;
        var sb = t.side_b;
        var colA = YK.ownerColor(sa.owner);
        var colB = YK.ownerColor(sb.owner);
        var gap = Math.abs(sa.received_delta - sb.received_delta).toFixed(1);

        html += '<tr style="cursor:pointer" class="trade-row" data-trade-idx="' + t.trade_index + '">';
        html += '<td><strong>' + t.season + '</strong></td>';
        html += '<td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + colA + ';margin-right:3px;vertical-align:middle"></span>' + (YK.ownerDisplayName(sa.owner) || sa.owner).split(' ').pop() + '</td>';
        html += '<td style="text-align:center">' + gradeBadge(sa.grade) + '</td>';
        html += '<td style="text-align:center;color:var(--text-muted)">\u2194</td>';
        html += '<td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + colB + ';margin-right:3px;vertical-align:middle"></span>' + (YK.ownerDisplayName(sb.owner) || sb.owner).split(' ').pop() + '</td>';
        html += '<td style="text-align:center">' + gradeBadge(sb.grade) + '</td>';
        html += '<td style="text-align:center;font-weight:600;font-size:0.78rem">' + gap + '</td>';
        html += '<td style="text-align:center">' + confidenceBadge(t.grade_confidence) + '</td>';
        html += '</tr>';
      });

      html += '</tbody></table>';
      document.getElementById('trade-log').innerHTML = html;

      // Click handlers
      document.querySelectorAll('.trade-row').forEach(function(row) {
        row.addEventListener('click', function() {
          showTradeDetail(parseInt(row.dataset.tradeIdx));
        });
      });
    }

    [filterOwner, filterSeason, filterGrade, filterConf].forEach(function(el) {
      el.addEventListener('change', renderTradeLog);
    });

    // ── Trade Detail ──
    var detailDiv = document.getElementById('trade-detail');

    function showTradeDetail(tradeIdx) {
      var t = gradesList.find(function(g) { return g.trade_index === tradeIdx; });
      if (!t) { detailDiv.style.display = 'none'; return; }

      detailDiv.style.display = 'block';
      detailDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });

      var sa = t.side_a;
      var sb = t.side_b;
      var html = '<div class="chart-section">';

      // Header
      html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">';
      html += '<h2>' + t.season + ' Trade Detail</h2>';
      html += '<button class="btn-ghost btn-sm" id="close-detail">&times; Close</button>';
      html += '</div>';

      // Summary
      html += '<p class="chart-insight">' + YK.escapeHtml(t.summary) + '</p>';

      // Two-column layout
      html += '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:16px">';

      // Side A detail
      html += renderSideDetail(sa, 'Side A');
      // Side B detail
      html += renderSideDetail(sb, 'Side B');

      html += '</div>';

      // Pick components
      if (t.pick_components && t.pick_components.length > 0) {
        html += '<div style="margin-top:16px">';
        html += '<h3 style="font-size:0.88rem;margin-bottom:8px">\uD83C\uDFAF Pick Components</h3>';
        html += '<div style="display:flex;flex-wrap:wrap;gap:6px">';
        t.pick_components.forEach(function(pc) {
          var recColor = YK.ownerColor(pc.received_by);
          html += '<span style="background:var(--bg-card);border:1px solid var(--border);padding:4px 10px;border-radius:8px;font-size:0.78rem">';
          html += '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:' + recColor + ';margin-right:4px;vertical-align:middle"></span>';
          html += YK.escapeHtml(pc.pick) + ' \u2192 ' + (YK.ownerDisplayName(pc.received_by) || pc.received_by).split(' ').pop();
          html += '</span>';
        });
        html += '</div></div>';
      }

      html += '</div>';
      detailDiv.innerHTML = html;

      document.getElementById('close-detail').addEventListener('click', function() {
        detailDiv.style.display = 'none';
      });
    }

    function renderSideDetail(side, label) {
      var color = YK.ownerColor(side.owner);
      var html = '<div style="flex:1;min-width:300px">';
      html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">';
      html += '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + color + '"></span>';
      html += '<strong>' + YK.ownerDisplayName(side.owner) + '</strong>';
      html += gradeBadge(side.grade);
      html += '<span style="color:var(--text-muted);font-size:0.78rem;margin-left:auto">' + (side.received_delta >= 0 ? '+' : '') + side.received_delta.toFixed(1) + ' FPts/g</span>';
      html += '</div>';

      if (side.received_players && side.received_players.length > 0) {
        html += '<table class="data-table" style="font-size:0.8rem">';
        html += '<thead><tr><th>Player</th><th>Pre FPg</th><th>Post FPg</th><th>\u0394</th><th>Rank</th></tr></thead>';
        html += '<tbody>';
        side.received_players.forEach(function(p) {
          var deltaStr = p.delta !== null ? (p.delta >= 0 ? '+' : '') + p.delta.toFixed(1) : '\u2014';
          var deltaColor = p.delta > 0 ? '#2a9d8f' : p.delta < 0 ? '#e63946' : 'var(--text-muted)';
          var rankStr = p.dynasty_rank ? '#' + p.dynasty_rank : '\u2014';
          html += '<tr>';
          html += '<td><strong>' + YK.escapeHtml(p.player) + '</strong>';
          if (p.status !== 'graded') {
            html += ' <span style="font-size:0.65rem;color:var(--text-muted)">(' + p.status.replace(/_/g, ' ') + ')</span>';
          }
          html += '</td>';
          html += '<td style="text-align:center">' + (p.pre_fpg !== null ? p.pre_fpg.toFixed(1) : '\u2014') + '</td>';
          html += '<td style="text-align:center">' + (p.post_fpg !== null ? p.post_fpg.toFixed(1) : '\u2014') + '</td>';
          html += '<td style="text-align:center;color:' + deltaColor + ';font-weight:600">' + deltaStr + '</td>';
          html += '<td style="text-align:center;color:var(--text-muted)">' + rankStr + '</td>';
          html += '</tr>';
        });
        html += '</tbody></table>';
      } else {
        html += '<p style="color:var(--text-muted);font-size:0.82rem;padding:8px 0">No player data for this side.</p>';
      }

      // Show what they gave/received
      html += '<div style="margin-top:8px;font-size:0.75rem;color:var(--text-muted)">';
      html += '<div><strong>Gave:</strong> ' + (side.gave || []).map(function(g) { return YK.escapeHtml(g); }).join(', ') + '</div>';
      html += '<div><strong>Got:</strong> ' + (side.received || []).map(function(g) { return YK.escapeHtml(g); }).join(', ') + '</div>';
      html += '</div>';

      html += '</div>';
      return html;
    }

    // Initial render
    renderTradeLog();
  });
})();

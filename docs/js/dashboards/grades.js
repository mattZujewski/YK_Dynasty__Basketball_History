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

    /** Get the display grade for a side (prefer combined_grade) */
    function sideGrade(side) {
      return side.combined_grade || side.grade || 'INC';
    }

    /** Get the GPA for a side (prefer combined_gpa) */
    function sideGpa(side) {
      if (side.combined_gpa !== undefined && side.combined_gpa !== null) return side.combined_gpa;
      var g = side.grade;
      return g && GRADE_VALUES[g] !== undefined ? GRADE_VALUES[g] : null;
    }

    function gradeBadge(grade) {
      var color = GRADE_COLORS[grade] || '#888';
      return '<span style="display:inline-block;min-width:28px;text-align:center;background:' + color + ';color:#fff;font-size:0.72rem;font-weight:800;padding:3px 8px;border-radius:99px">' + YK.escapeHtml(grade) + '</span>';
    }

    function confidenceBadge(conf) {
      var colors = { high: '#2a9d8f', medium: '#f4a261', low: '#e76f51', incomplete: '#888' };
      var color = colors[conf] || '#888';
      return '<span style="font-size:0.68rem;color:' + color + ';font-weight:600">' + conf + '</span>';
    }

    function basisBadge(basis) {
      var labels = { players_only: 'Players', picks_only: 'Picks', mixed: 'Mixed', incomplete: 'Inc' };
      var colors = { players_only: '#4e9af1', picks_only: '#f4a261', mixed: '#2a9d8f', incomplete: '#888' };
      var label = labels[basis] || basis || '';
      var color = colors[basis] || '#888';
      return '<span style="font-size:0.62rem;color:' + color + ';font-weight:600;text-transform:uppercase;letter-spacing:0.5px">' + label + '</span>';
    }

    // ── Summary Stats ──
    var statsBar = document.getElementById('grade-stats-bar');
    var gradedCount = 0;
    gradesList.forEach(function(t) {
      if (sideGrade(t.side_a) !== 'INC') gradedCount++;
      if (sideGrade(t.side_b) !== 'INC') gradedCount++;
    });
    var totalSides = gradesList.length * 2;
    var incompleteSides = totalSides - gradedCount;
    var combinedStats = meta.combined_stats || {};
    var mixedCount = combinedStats.mixed_sides || 0;
    var pickOnlyCount = combinedStats.pick_only_sides || 0;

    statsBar.innerHTML =
      '<div class="stat-card"><span class="stat-label">Total Trades</span><span class="stat-value">' + gradesList.length + '</span></div>' +
      '<div class="stat-card"><span class="stat-label">Graded Sides</span><span class="stat-value" style="color:var(--brand-green)">' + gradedCount + '</span></div>' +
      '<div class="stat-card"><span class="stat-label">Mixed (P+Picks)</span><span class="stat-value">' + mixedCount + '</span></div>' +
      '<div class="stat-card"><span class="stat-label">Pick-Only</span><span class="stat-value">' + pickOnlyCount + '</span></div>' +
      '<div class="stat-card"><span class="stat-label">Incomplete</span><span class="stat-value" style="color:var(--text-muted)">' + incompleteSides + '</span></div>';

    // ── Owner Report Cards (from meta.owner_report_cards) ──
    var ownerReport = meta.owner_report_cards || {};
    var ownerGrid = document.getElementById('owner-report-grid');

    // Also compute win/loss/even from combined grades
    var ownerWLE = {};
    gradesList.forEach(function(t) {
      var sa = t.side_a;
      var sb = t.side_b;
      var gA = sideGrade(sa);
      var gB = sideGrade(sb);
      [sa.owner, sb.owner].forEach(function(o) {
        if (!ownerWLE[o]) ownerWLE[o] = { wins: 0, losses: 0, even: 0 };
      });
      if (gA !== 'INC' && gB !== 'INC') {
        var gpaA = sideGpa(sa);
        var gpaB = sideGpa(sb);
        if (gpaA !== null && gpaB !== null) {
          if (gpaA > gpaB + 0.3) {
            ownerWLE[sa.owner].wins++;
            ownerWLE[sb.owner].losses++;
          } else if (gpaB > gpaA + 0.3) {
            ownerWLE[sb.owner].wins++;
            ownerWLE[sa.owner].losses++;
          } else {
            ownerWLE[sa.owner].even++;
            ownerWLE[sb.owner].even++;
          }
        }
      }
    });

    var ownerArr = Object.keys(ownerReport).sort(function(a, b) {
      var gpaA = ownerReport[a].avg_gpa || 0;
      var gpaB = ownerReport[b].avg_gpa || 0;
      return gpaB - gpaA;
    });

    ownerGrid.innerHTML = ownerArr.map(function(owner) {
      var r = ownerReport[owner];
      var wle = ownerWLE[owner] || { wins: 0, losses: 0, even: 0 };
      var color = YK.ownerColor(owner);
      var avgGrade = r.avg_grade || 'N/A';
      var avgGpa = r.avg_gpa || 0;

      return '<div class="roster-card" style="border-top:3px solid ' + color + '">' +
        '<div class="roster-card-header">' +
          '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + color + ';margin-right:6px"></span>' +
          '<strong>' + YK.ownerDisplayName(owner) + '</strong>' +
          '<span style="margin-left:auto">' + gradeBadge(avgGrade) + '</span>' +
        '</div>' +
        '<div style="padding:12px 18px;font-size:0.82rem">' +
          '<div style="display:flex;gap:14px;margin-bottom:6px">' +
            '<span><strong>' + avgGpa.toFixed(2) + '</strong> <span style="color:var(--text-muted);font-size:0.72rem">avg GPA</span></span>' +
            '<span><strong>' + r.total_sides + '</strong> <span style="color:var(--text-muted);font-size:0.72rem">trades</span></span>' +
          '</div>' +
          '<div style="font-size:0.78rem;color:var(--text-muted)">' +
            '<span style="color:#2a9d8f;font-weight:600">' + wle.wins + 'W</span> / ' +
            '<span style="color:#e63946;font-weight:600">' + wle.losses + 'L</span> / ' +
            '<span>' + wle.even + 'E</span>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    // ── Most Lopsided Trades ──
    var notableGrid = document.getElementById('notable-trades-grid');
    var lopsided = gradesList.filter(function(t) {
      return sideGrade(t.side_a) !== 'INC' || sideGrade(t.side_b) !== 'INC';
    }).sort(function(a, b) {
      var gapA = Math.abs((sideGpa(a.side_a) || 0) - (sideGpa(a.side_b) || 0));
      var gapB = Math.abs((sideGpa(b.side_a) || 0) - (sideGpa(b.side_b) || 0));
      return gapB - gapA;
    }).slice(0, 8);

    notableGrid.innerHTML = lopsided.map(function(t) {
      var sa = t.side_a;
      var sb = t.side_b;
      var gA = sideGrade(sa);
      var gB = sideGrade(sb);
      var gpaA = sideGpa(sa) || 0;
      var gpaB = sideGpa(sb) || 0;
      var winnerSide = gpaA >= gpaB ? sa : sb;
      var winColor = YK.ownerColor(winnerSide.owner);
      var gap = Math.abs(gpaA - gpaB).toFixed(1);

      return '<div class="roster-card" style="border-top:3px solid ' + winColor + ';cursor:pointer" data-trade-idx="' + t.trade_index + '">' +
        '<div class="roster-card-header">' +
          '<strong>' + t.season + '</strong>' +
          '<span style="margin-left:auto;color:var(--text-muted);font-size:0.72rem">\u0394 ' + gap + ' GPA</span>' +
        '</div>' +
        '<div style="padding:12px 18px;font-size:0.82rem">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
            '<div>' +
              '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + YK.ownerColor(sa.owner) + ';margin-right:3px;vertical-align:middle"></span>' +
              '<strong>' + (YK.ownerDisplayName(sa.owner) || sa.owner).split(' ').pop() + '</strong> ' +
              gradeBadge(gA) +
            '</div>' +
            '<span style="color:var(--text-muted);font-size:0.72rem">\u2194</span>' +
            '<div>' +
              '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + YK.ownerColor(sb.owner) + ';margin-right:3px;vertical-align:middle"></span>' +
              '<strong>' + (YK.ownerDisplayName(sb.owner) || sb.owner).split(' ').pop() + '</strong> ' +
              gradeBadge(gB) +
            '</div>' +
          '</div>' +
          '<div style="font-size:0.75rem;color:var(--text-muted)">' + YK.escapeHtml(t.summary) + '</div>' +
        '</div>' +
      '</div>';
    }).join('');

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
        if (gradeFilter) {
          var gA = sideGrade(t.side_a);
          var gB = sideGrade(t.side_b);
          if (gA !== gradeFilter && gB !== gradeFilter) return false;
        }
        return true;
      });

      document.getElementById('trade-count-label').textContent = 'Showing ' + filtered.length + ' of ' + gradesList.length + ' trades';

      var html = '<table class="data-table">';
      html += '<thead><tr><th>Season</th><th>Side A</th><th>Grade</th><th></th><th>Side B</th><th>Grade</th><th>Basis</th><th>Conf</th></tr></thead>';
      html += '<tbody>';

      filtered.forEach(function(t) {
        var sa = t.side_a;
        var sb = t.side_b;
        var colA = YK.ownerColor(sa.owner);
        var colB = YK.ownerColor(sb.owner);
        var gA = sideGrade(sa);
        var gB = sideGrade(sb);
        var basisA = sa.grade_basis || '';
        var basisB = sb.grade_basis || '';
        var basis = basisA === basisB ? basisA : (basisA || basisB);

        html += '<tr style="cursor:pointer" class="trade-row" data-trade-idx="' + t.trade_index + '">';
        html += '<td><strong>' + t.season + '</strong></td>';
        html += '<td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + colA + ';margin-right:3px;vertical-align:middle"></span>' + (YK.ownerDisplayName(sa.owner) || sa.owner).split(' ').pop() + '</td>';
        html += '<td style="text-align:center">' + gradeBadge(gA) + '</td>';
        html += '<td style="text-align:center;color:var(--text-muted)">\u2194</td>';
        html += '<td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + colB + ';margin-right:3px;vertical-align:middle"></span>' + (YK.ownerDisplayName(sb.owner) || sb.owner).split(' ').pop() + '</td>';
        html += '<td style="text-align:center">' + gradeBadge(gB) + '</td>';
        html += '<td style="text-align:center">' + basisBadge(basis) + '</td>';
        html += '<td style="text-align:center">' + confidenceBadge(t.grade_confidence) + '</td>';
        html += '</tr>';
      });

      html += '</tbody></table>';
      document.getElementById('trade-log').innerHTML = html;

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

    /** Build a human-readable asset name from raw item string */
    function assetLabel(item) {
      var parts = item.split(' ', 1);
      var rest = item.substring(parts[0].length).trim();
      // strip position prefix like "SF/PF "
      rest = rest.replace(/^[A-Z]{1,2}\/[A-Z]{1,2}\s+/, '');
      return rest || item;
    }

    function showTradeDetail(tradeIdx) {
      var t = gradesList.find(function(g) { return g.trade_index === tradeIdx; });
      if (!t) { detailDiv.style.display = 'none'; return; }

      // Also get raw trade data for source/date info
      var rawTrade = tradesData[tradeIdx] || {};

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

      // ── Trade Summary Section ──
      var colA = YK.ownerColor(sa.owner);
      var colB = YK.ownerColor(sb.owner);
      var nameA = YK.ownerDisplayName(sa.owner) || sa.owner;
      var nameB = YK.ownerDisplayName(sb.owner) || sb.owner;
      var gA = sideGrade(sa);
      var gB = sideGrade(sb);
      var gpaA = sideGpa(sa);
      var gpaB = sideGpa(sb);

      // Determine verdict
      var verdict = '';
      var verdictColor = 'var(--text-muted)';
      if (gA !== 'INC' && gB !== 'INC' && gpaA !== null && gpaB !== null) {
        var diff = gpaA - gpaB;
        if (diff > 0.3) {
          verdict = nameA.split(' ').pop() + ' wins';
          verdictColor = colA;
        } else if (diff < -0.3) {
          verdict = nameB.split(' ').pop() + ' wins';
          verdictColor = colB;
        } else {
          verdict = 'Even trade';
          verdictColor = '#f4a261';
        }
      } else {
        verdict = 'Incomplete data';
      }

      html += '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:20px">';

      // Trade parties header
      html += '<div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:16px;flex-wrap:wrap">';
      html += '<div style="display:flex;align-items:center;gap:6px">';
      html += '<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:' + colA + '"></span>';
      html += '<strong style="font-size:1.05rem">' + YK.escapeHtml(nameA) + '</strong>';
      html += gradeBadge(gA);
      html += '</div>';
      html += '<span style="color:var(--text-muted);font-size:1.1rem;font-weight:700">\u2194</span>';
      html += '<div style="display:flex;align-items:center;gap:6px">';
      html += '<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:' + colB + '"></span>';
      html += '<strong style="font-size:1.05rem">' + YK.escapeHtml(nameB) + '</strong>';
      html += gradeBadge(gB);
      html += '</div>';
      html += '</div>';

      // Asset exchange visual
      html += '<div style="display:flex;gap:20px;flex-wrap:wrap;margin-bottom:14px">';

      // Side A sends → Side B receives
      // Note: sa.gave items from trade_grades.json are already clean (no owner prefix)
      html += '<div style="flex:1;min-width:200px">';
      html += '<div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted);margin-bottom:6px">';
      html += '<span style="color:' + colA + ';font-weight:700">' + nameA.split(' ').pop() + '</span> sends \u2192</div>';
      html += '<div style="display:flex;flex-wrap:wrap;gap:4px">';
      (sa.gave || []).forEach(function(item) {
        html += '<span style="background:var(--bg-main);border:1px solid var(--border);padding:3px 8px;border-radius:6px;font-size:0.78rem">' + YK.escapeHtml(item) + '</span>';
      });
      if (!sa.gave || sa.gave.length === 0) html += '<span style="color:var(--text-muted);font-size:0.78rem">\u2014</span>';
      html += '</div></div>';

      // Side B sends → Side A receives
      html += '<div style="flex:1;min-width:200px">';
      html += '<div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted);margin-bottom:6px">';
      html += '<span style="color:' + colB + ';font-weight:700">' + nameB.split(' ').pop() + '</span> sends \u2192</div>';
      html += '<div style="display:flex;flex-wrap:wrap;gap:4px">';
      (sb.gave || []).forEach(function(item) {
        html += '<span style="background:var(--bg-main);border:1px solid var(--border);padding:3px 8px;border-radius:6px;font-size:0.78rem">' + YK.escapeHtml(item) + '</span>';
      });
      if (!sb.gave || sb.gave.length === 0) html += '<span style="color:var(--text-muted);font-size:0.78rem">\u2014</span>';
      html += '</div></div>';

      html += '</div>';

      // Verdict + meta row
      html += '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;border-top:1px solid var(--border);padding-top:12px">';
      html += '<div style="font-weight:700;font-size:0.9rem;color:' + verdictColor + '">' + verdict + '</div>';
      html += '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">';
      if (t.date || rawTrade.date) {
        html += '<span style="font-size:0.75rem;color:var(--text-muted)">' + YK.escapeHtml(t.date || rawTrade.date) + '</span>';
      }
      html += '<span style="font-size:0.72rem">' + confidenceBadge(t.grade_confidence) + '</span>';
      if (rawTrade.fantrax_confirmed) {
        html += '<span style="font-size:0.65rem;color:#2a9d8f;font-weight:600;border:1px solid #2a9d8f;padding:1px 6px;border-radius:99px">\u2713 Fantrax</span>';
      }
      if (rawTrade.source === 'fantrax_csv_only') {
        html += '<span style="font-size:0.65rem;color:#f4a261;font-weight:600;border:1px solid #f4a261;padding:1px 6px;border-radius:99px">CSV only</span>';
      }
      html += '</div></div>';

      html += '</div>';

      // Summary text
      html += '<p class="chart-insight">' + YK.escapeHtml(t.summary) + '</p>';

      // Two-column layout
      html += '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:16px">';
      html += renderSideDetail(sa);
      html += renderSideDetail(sb);
      html += '</div>';

      html += '</div>';
      detailDiv.innerHTML = html;

      document.getElementById('close-detail').addEventListener('click', function() {
        detailDiv.style.display = 'none';
      });
    }

    function renderSideDetail(side) {
      var color = YK.ownerColor(side.owner);
      var grade = sideGrade(side);
      var gpa = sideGpa(side);
      var basis = side.grade_basis || '';

      var html = '<div style="flex:1;min-width:300px">';
      html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">';
      html += '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + color + '"></span>';
      html += '<strong>' + YK.ownerDisplayName(side.owner) + '</strong>';
      html += gradeBadge(grade);
      if (basis) html += basisBadge(basis);
      if (gpa !== null) {
        html += '<span style="color:var(--text-muted);font-size:0.72rem;margin-left:auto">GPA ' + gpa.toFixed(2) + '</span>';
      }
      html += '</div>';

      // Player details
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
      }

      // Pick grade details
      if (side.pick_grades && side.pick_grades.length > 0) {
        html += '<div style="margin-top:10px">';
        html += '<div style="font-size:0.78rem;font-weight:600;margin-bottom:4px">Pick Grades:</div>';
        html += '<div style="display:flex;flex-wrap:wrap;gap:4px">';
        side.pick_grades.forEach(function(pg) {
          var slotLabel = pg.slot ? '#' + pg.slot : '';
          var statusLabel = pg.status === 'projected' ? ' (proj)' : '';
          html += '<span style="background:var(--bg-card);border:1px solid var(--border);padding:3px 8px;border-radius:6px;font-size:0.72rem">';
          html += gradeBadge(pg.grade) + ' ';
          html += '<span style="color:var(--text-muted)">' + YK.escapeHtml(pg.pick_id) + ' ' + slotLabel + statusLabel + '</span>';
          html += '</span>';
        });
        html += '</div></div>';
      } else if (side.received_picks && side.received_picks.length > 0 && !(side.pick_grades && side.pick_grades.length > 0)) {
        html += '<div style="margin-top:8px;font-size:0.75rem;color:var(--text-muted)">';
        html += '<strong>Picks received:</strong> ' + side.received_picks.map(function(p) { return YK.escapeHtml(p); }).join(', ');
        html += '</div>';
      }

      if (!side.received_players || side.received_players.length === 0) {
        if (!side.pick_grades || side.pick_grades.length === 0) {
          html += '<p style="color:var(--text-muted);font-size:0.82rem;padding:8px 0">No grading data for this side.</p>';
        }
      }

      // Gave/Got summary
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

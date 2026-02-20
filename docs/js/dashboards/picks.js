/**
 * picks.js — Dashboard module for picks.html
 * YK Dynasty Basketball
 */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', async function () {
    const YK = window.YK;

    let picksData;
    try {
      picksData = await YK.loadJSON('data/picks.json');
    } catch (e) {
      console.error('Failed to load picks:', e);
      return;
    }

    const years = Object.keys(picksData).sort();

    // Dynamic subtitle
    if (years.length > 0) {
      document.getElementById('picks-subtitle').innerHTML =
        'Who owns which picks from ' + years[0] + '&ndash;' + years[years.length - 1];
    }

    // Use canonical 10 owners from YK, sorted alphabetically
    const owners = YK.OWNERS_ALPHA.slice();

    // Build grid
    const container = document.getElementById('pick-grid-container');

    let gridHTML = '<div class="pick-grid" style="grid-template-columns: 180px repeat(' + years.length + ', 1fr);">';

    // Header row
    gridHTML += '<div class="pick-cell header">Owner</div>';
    years.forEach(function(yr) {
      gridHTML += '<div class="pick-cell header" style="text-align:center">' + yr + '</div>';
    });

    // Owner rows
    owners.forEach(function(owner) {
      const color = YK.ownerColor(owner);
      const displayName = YK.ownerDisplayName(owner);
      const isDelaney = owner === 'Delaney';
      const highlightClass = isDelaney ? ' owner-highlight' : '';

      gridHTML += '<div class="pick-cell owner-name' + highlightClass + '">';
      gridHTML += '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + color + ';margin-right:6px;vertical-align:middle"></span>';
      gridHTML += displayName;
      gridHTML += '</div>';

      years.forEach(function(yr) {
        const picks = (picksData[yr] && picksData[yr][owner]) || [];
        if (picks.length === 0) {
          gridHTML += '<div class="pick-cell pick-content' + highlightClass + '" style="text-align:center;color:var(--text-muted)">&mdash;</div>';
        } else {
          const pickItems = picks.map(function(p) {
            const is1st = p.toLowerCase().includes('1st');
            const cls = is1st ? 'pick-1st' : 'pick-2nd';
            const colorCls = YK.classifyPick(p, owner);
            return '<div class="pick-item ' + cls + ' ' + colorCls + '">' + YK.escapeHtml(p) + '</div>';
          }).join('');
          gridHTML += '<div class="pick-cell pick-content' + highlightClass + '">' + pickItems + '</div>';
        }
      });
    });

    // Summary row
    gridHTML += '<div class="pick-cell summary-row" style="font-weight:700;background:var(--bg-primary);border-top:2px solid var(--border-strong)">TOTAL</div>';
    years.forEach(function(yr) {
      let yearTotal = 0;
      owners.forEach(function(owner) {
        yearTotal += ((picksData[yr] && picksData[yr][owner]) || []).length;
      });
      gridHTML += '<div class="pick-cell summary-row" style="text-align:center;font-weight:700;background:var(--bg-primary);border-top:2px solid var(--border-strong)">' + yearTotal + '</div>';
    });

    gridHTML += '</div>';
    container.innerHTML = gridHTML;

    // Stat bar
    let totalPicks = 0;
    let total1st = 0;
    let total2nd = 0;
    years.forEach(function(yr) {
      Object.values(picksData[yr] || {}).forEach(function(picks) {
        picks.forEach(function(p) {
          totalPicks++;
          if (p.toLowerCase().includes('1st')) total1st++;
          else total2nd++;
        });
      });
    });

    document.getElementById('pick-stats').innerHTML =
      '<div class="stat-card">' +
        '<span class="stat-label">Years Tracked</span>' +
        '<span class="stat-value">' + years.length + '</span>' +
      '</div>' +
      '<div class="stat-card">' +
        '<span class="stat-label">Total Picks</span>' +
        '<span class="stat-value gold">' + totalPicks + '</span>' +
      '</div>' +
      '<div class="stat-card">' +
        '<span class="stat-label">1st Rounders</span>' +
        '<span class="stat-value">' + total1st + '</span>' +
      '</div>' +
      '<div class="stat-card">' +
        '<span class="stat-label">2nd Rounders</span>' +
        '<span class="stat-value gold">' + total2nd + '</span>' +
      '</div>';

    // Hoarder table
    var ownerTotals = {};
    owners.forEach(function(owner) {
      ownerTotals[owner] = { total: 0, firsts: 0, seconds: 0 };
      years.forEach(function(yr) {
        var picks = (picksData[yr] && picksData[yr][owner]) || [];
        picks.forEach(function(p) {
          ownerTotals[owner].total++;
          if (p.toLowerCase().includes('1st')) ownerTotals[owner].firsts++;
          else ownerTotals[owner].seconds++;
        });
      });
    });

    var sortedHoarders = owners.slice().sort(function(a, b) { return ownerTotals[b].total - ownerTotals[a].total; });

    var hoarderTbody = document.getElementById('hoarder-tbody');
    hoarderTbody.innerHTML = sortedHoarders.map(function(owner) {
      var t = ownerTotals[owner];
      var color = YK.ownerColor(owner);
      var displayName = YK.ownerDisplayName(owner);
      return '<tr data-owner="' + displayName + '" data-total="' + t.total + '" data-firsts="' + t.firsts + '" data-seconds="' + t.seconds + '">' +
        '<td>' +
          '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + color + ';margin-right:7px;vertical-align:middle"></span>' +
          '<strong>' + displayName + '</strong>' +
        '</td>' +
        '<td style="text-align:center;font-weight:700;font-size:1.1rem">' + t.total + '</td>' +
        '<td style="text-align:center"><span class="pick-1st">' + t.firsts + '</span></td>' +
        '<td style="text-align:center">' + t.seconds + '</td>' +
      '</tr>';
    }).join('');

    // Insight
    var topHoarder = sortedHoarders[0];
    if (topHoarder) {
      var t = ownerTotals[topHoarder];
      document.getElementById('hoarder-insight').innerHTML =
        '<strong>' + YK.ownerDisplayName(topHoarder) + '</strong> controls a league-high <strong>' + t.total + '</strong> picks across ' +
        years[0] + '&ndash;' + years[years.length - 1] + ', ' +
        'including <strong>' + t.firsts + '</strong> first-round picks.';
    }

    document.getElementById('hoarder-section').style.display = 'block';
    YK.makeSortable(document.getElementById('hoarder-table'));
  });
})();

/**
 * tvot.js — Trade Value Over Time dashboard
 * YK Dynasty Basketball
 *
 * Data sources:
 *   data/trade_value_over_time.json
 *   data/trade_details.json  (optional — for asset previews in rows)
 */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', async function () {
    const YK = window.YK;

    let data, detailsData;
    try {
      var results = await Promise.all([
        YK.loadJSON('data/trade_value_over_time.json'),
        YK.loadJSON('data/trade_details.json').catch(function() { return { trades: [] }; }),
      ]);
      data        = results[0];
      detailsData = results[1];
    } catch (e) {
      console.error('Failed to load trade_value_over_time.json:', e);
      document.getElementById('tvot-tbody').innerHTML =
        '<tr><td colspan="8" class="text-center text-muted" style="padding:24px">Failed to load data.</td></tr>';
      return;
    }

    // Build details lookup: trade_id → { owner: [top2AssetNames] }
    var detailsById = {};
    // Also build season lookup: trade_id → season string
    // (TVOT JSON has empty season at top level; trade_details has correct seasons)
    var seasonById = {};
    ((detailsData && detailsData.trades) || []).forEach(function(t) {
      var topAssets = {};
      (t.sides || []).forEach(function(s) {
        var sorted = (s.assets || []).slice().sort(function(a, b) { return (b.value||0) - (a.value||0); });
        topAssets[s.owner] = sorted.slice(0, 2).map(function(a) { return a.name; });
      });
      detailsById[t.trade_id] = topAssets;
      if (t.season) seasonById[t.trade_id] = t.season;
    });

    const trades = data.trades || [];

    // ── Season filter ────────────────────────────────────────────────────── //
    var filterSeasons = []; // [] = show all
    var _sfb = YK.buildSeasonFilterBar('season-filter-bar', function(activeSeasons) {
      filterSeasons = activeSeasons;
      var subset = getSeasonSubset();
      rebuildSummaryCards(subset);
      applyFiltersAndSort();
    });

    function getSeasonSubset() {
      if (filterSeasons.length === 0) return trades;
      return trades.filter(function(t) {
        // TVOT JSON has empty top-level season; use trade_details season as source
        var szn = seasonById[t.trade_id] || t.season || '';
        var s = szn.replace(/^20/, '');
        return filterSeasons.includes(s);
      });
    }

    // ── Summary cards ─────────────────────────────────────────────────────── //
    var cardsEl = document.getElementById('summary-cards');
    function makeCard(label, value, sub) {
      var d = document.createElement('div');
      d.className = 'stat-card';
      d.innerHTML = '<div class="stat-label">' + label + '</div>' +
        '<div class="stat-value">' + value + '</div>' +
        (sub ? '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px">' + sub + '</div>' : '');
      return d;
    }

    function rebuildSummaryCards(subset) {
      cardsEl.innerHTML = '';

      var flipped  = subset.filter(function(t) { return t.winner_changed; });
      var flipPct  = subset.length > 0 ? (flipped.length / subset.length * 100) : 0;
      var avgSwing = subset.length > 0
        ? subset.reduce(function(s, t) { return s + (t.biggest_swing || 0); }, 0) / subset.length
        : 0;

      var maxSwingTrade = subset.slice().sort(function(a, b) {
        return (b.biggest_swing || 0) - (a.biggest_swing || 0);
      })[0];

      var ownerFlipCount = {};
      flipped.forEach(function(t) {
        (t.receivers || []).forEach(function(r) {
          ownerFlipCount[r] = (ownerFlipCount[r] || 0) + 1;
        });
      });
      var topFlipOwner = Object.keys(ownerFlipCount).sort(function(a, b) {
        return ownerFlipCount[b] - ownerFlipCount[a];
      })[0];

      // Update headline numbers
      var bigEl = document.getElementById('flip-pct-big');
      var subEl = document.getElementById('flip-sub-text');
      if (bigEl) bigEl.textContent = Math.round(flipPct) + '%';
      if (subEl) subEl.textContent =
        flipped.length + ' of ' + subset.length + ' analyzed trades changed winners over multiple seasons';

      cardsEl.appendChild(makeCard('Trades Analyzed', subset.length, 'all seasons 2021\u201322 to present'));
      cardsEl.appendChild(makeCard('Flipped Winners', flipped.length, Math.round(flipPct) + '% of analyzed trades'));
      cardsEl.appendChild(makeCard('Avg Swing', '+' + avgSwing.toFixed(1), 'dynasty value shift per trade'));
      if (maxSwingTrade) {
        cardsEl.appendChild(makeCard(
          'Biggest Swing',
          '+' + (maxSwingTrade.biggest_swing || 0).toFixed(1),
          'Trade #' + maxSwingTrade.trade_id + ' (' + (maxSwingTrade.season || '\u2014') + ')'
        ));
      }
      if (topFlipOwner) {
        cardsEl.appendChild(makeCard(
          'Most Trades Flipped',
          YK.ownerDisplayName(topFlipOwner),
          ownerFlipCount[topFlipOwner] + ' trades changed in their favor (or against)'
        ));
      }
    }

    // Initial summary cards
    rebuildSummaryCards(trades);

    // ── Owner filter dropdown ───────────────────────────────────────────── //
    var allOwners = new Set();
    trades.forEach(function(t) {
      (t.receivers || []).forEach(function(r) { allOwners.add(r); });
    });
    var ownerSelect = document.getElementById('owner-select');
    Array.from(allOwners).sort().forEach(function(o) {
      var opt = document.createElement('option');
      opt.value = o;
      opt.textContent = YK.ownerDisplayName(o);
      ownerSelect.appendChild(opt);
    });

    // ── State ──────────────────────────────────────────────────────────── //
    var filterFlip  = 'all';   // 'all' | 'flipped' | 'stable'
    var filterOwner = '';
    var sortBy      = 'swing'; // 'swing' | 'recent' | 'margin'
    var expandedIds = new Set();

    // ── Render ─────────────────────────────────────────────────────────── //
    function applyFiltersAndSort() {
      var base = getSeasonSubset();
      var filtered = base.filter(function(t) {
        if (filterFlip === 'flipped' && !t.winner_changed) return false;
        if (filterFlip === 'stable' && t.winner_changed) return false;
        if (filterOwner && !(t.receivers || []).includes(filterOwner)) return false;
        return true;
      });

      filtered.sort(function(a, b) {
        if (sortBy === 'swing')  return (b.biggest_swing || 0) - (a.biggest_swing || 0);
        if (sortBy === 'recent') return b.trade_id - a.trade_id;
        if (sortBy === 'margin') return Math.abs(b.current_margin || 0) - Math.abs(a.current_margin || 0);
        return 0;
      });

      var countEl = document.getElementById('tvot-count');
      if (countEl) {
        countEl.textContent = 'Showing ' + filtered.length + ' of ' + base.length + ' trades';
      }

      renderTable(filtered);
    }

    function renderTable(tradeList) {
      var tbody = document.getElementById('tvot-tbody');
      if (tradeList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted" style="padding:16px">No trades match filter.</td></tr>';
        return;
      }

      var rows = tradeList.map(function(t) {
        var isCollusion = (t.trade_id === 99 || t.trade_id === 111);
        var firstWinner = t.first_winner || '\u2014';
        var lastWinner  = t.last_winner  || '\u2014';
        var flippedHere = t.winner_changed;
        var swing       = t.biggest_swing || 0;
        var owners      = (t.receivers || []);
        var isOpen      = expandedIds.has(t.trade_id);
        var tradeTopAssets = detailsById[t.trade_id] || {};

        var ownerDots = owners.map(function(o) {
          var assetPreview = (tradeTopAssets[o] || []);
          var previewHtml = assetPreview.length
            ? '<span class="tvot-asset-preview">(' + assetPreview.map(YK.escapeHtml).join(', ') + ')</span>'
            : '';
          return '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' +
            YK.ownerColor(o) + ';margin-right:3px;vertical-align:middle"></span>' +
            YK.ownerDisplayName(o) + previewHtml;
        }).join('<span style="color:var(--text-muted);margin:0 4px">vs</span>');

        var firstWinColor = YK.ownerColor(firstWinner);
        var lastWinColor  = YK.ownerColor(lastWinner);

        var flipBadge = isCollusion
          ? '<span class="badge-collusion">&#x26A0; Collusion</span>'
          : (flippedHere
            ? '<span class="badge-flipped">&#x26A1; Flipped</span>'
            : '<span class="badge-stable">&#x2713; Stable</span>');

        var swingStr = swing > 0 ? '+' + swing.toFixed(1) : swing.toFixed(1);
        var rowStyle = isCollusion ? 'opacity:0.6;' : (flippedHere ? 'background:rgba(232,184,75,0.06);' : '');

        return '<tr class="tvot-trade-row" id="tvot-row-' + t.trade_id + '" data-id="' + t.trade_id + '" style="cursor:pointer;' + rowStyle + '">' +
          '<td style="font-weight:700;color:var(--text-muted);font-size:0.8rem">#' + t.trade_id + '</td>' +
          '<td style="font-size:0.8rem">' + (t.season || '\u2014') + '</td>' +
          '<td class="trade-owners-cell">' + ownerDots + (t.is_multi_party ? '<span class="multi-badge">3-way</span>' : '') + '</td>' +
          '<td>' +
            '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + firstWinColor + ';margin-right:5px;vertical-align:middle"></span>' +
            YK.ownerDisplayName(firstWinner) +
          '</td>' +
          '<td>' +
            '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + lastWinColor + ';margin-right:5px;vertical-align:middle"></span>' +
            YK.ownerDisplayName(lastWinner) +
          '</td>' +
          '<td>' + flipBadge + '</td>' +
          '<td style="text-align:right;font-weight:600">' +
            '<span data-tooltip="Largest single-season swing in dynasty value.">' +
            swingStr + '</span>' +
          '</td>' +
          '<td style="text-align:center">' +
            '<button class="expand-btn" data-id="' + t.trade_id + '">' + (isOpen ? '\u25B2' : '\u25BC') + '</button>' +
          '</td>' +
        '</tr>' +
        '<tr class="tvot-detail-row' + (isOpen ? ' open' : '') + '" id="tvot-detail-' + t.trade_id + '">' +
          '<td colspan="8" style="padding:0">' +
            buildTimeline(t) +
          '</td>' +
        '</tr>';
      }).join('');

      tbody.innerHTML = rows;
    }

    function buildTimeline(trade) {
      var owners   = trade.receivers || [];
      var results  = trade.eval_results || [];
      if (results.length === 0) return '<div style="padding:10px;color:var(--text-muted);font-size:0.8rem">No timeline data available.</div>';

      // Color bar — shows Y# label and margin per year segment
      var colorBar = '<div class="tvot-colorbar">' +
        results.map(function(r, i) {
          var isFlip = (i > 0 && r.winner !== results[i-1].winner);
          var totalsArr = Object.values(r.totals || {});
          var margin = totalsArr.length >= 2
            ? Math.abs(totalsArr[0] - totalsArr[1])
            : 0;
          var tipText = 'Y' + (i+1) + (r.season ? ' (' + r.season + ')' : '') +
            ': ' + YK.ownerDisplayName(r.winner || '\u2014') + ' +' + margin.toFixed(0);
          return '<div class="tvot-colorbar-seg' + (isFlip ? ' flip-point' : '') + '"' +
            ' style="background:' + YK.ownerColor(r.winner || '') + '"' +
            ' title="' + YK.escapeHtml(tipText) + '">' +
            '<div class="tvot-seg-year">Y' + (i+1) + '</div>' +
            '<div class="tvot-seg-margin">+' + margin.toFixed(0) + '</div>' +
            '</div>';
        }).join('') +
        '</div>';

      var periods = results.map(function(r, i) {
        return r.label || ('Y' + (i + 1));
      });

      var headers = '<th style="min-width:100px">Owner</th>' +
        periods.map(function(p, i) {
          var shortLabel = 'Y' + (i + 1);
          var szn = results[i].season || '';
          return '<th title="' + YK.escapeHtml(p) + '">' + shortLabel + (szn ? ' <span style="font-weight:400;opacity:0.7">(' + szn + ')</span>' : '') + '</th>';
        }).join('') +
        '<th>Link</th>';

      var ownerRows = owners.map(function(owner) {
        var cells = results.map(function(r, i) {
          var total  = (r.totals || {})[owner];
          var isWin  = (r.winner === owner);
          var prevWin = i > 0 ? (results[i-1].winner === owner) : null;
          var justFlipped = (i > 0 && isWin && !prevWin) || (i > 0 && !isWin && prevWin !== null && prevWin);
          var cls = isWin ? (justFlipped ? 'flip-cell' : 'winner-cell') : '';
          var valStr = total != null ? total.toFixed(1) : '\u2014';
          return '<td class="' + cls + '">' + valStr + (isWin ? ' &#x2714;' : '') + '</td>';
        }).join('');
        var dot = '<span class="tvot-owner-dot" style="background:' + YK.ownerColor(owner) + '"></span>';
        return '<tr>' +
          '<td>' + dot + YK.ownerDisplayName(owner) + '</td>' +
          cells +
          '<td></td>' +
        '</tr>';
      }).join('');

      var tradeCardsLink = '<a href="trade-cards.html#trade-' + trade.trade_id +
        '" style="font-size:0.75rem;color:var(--brand-green);white-space:nowrap" title="View Trade Card">&#x1F0CF; Card</a>';

      var overallRow = '<tr style="background:var(--bg-primary);font-size:0.78rem;color:var(--text-muted)">' +
        '<td>Winner</td>' +
        results.map(function(r) {
          return '<td><strong>' + YK.ownerDisplayName(r.winner || '\u2014') + '</strong></td>';
        }).join('') +
        '<td>' + tradeCardsLink + '</td>' +
      '</tr>';

      return '<div class="tvot-detail-inner">' +
        colorBar +
        '<table class="tvot-timeline-table">' +
          '<thead><tr>' + headers + '</tr></thead>' +
          '<tbody>' + ownerRows + overallRow + '</tbody>' +
        '</table>' +
        (trade.is_multi_party ? '<p style="font-size:0.72rem;color:var(--text-muted);margin:6px 0 0">Multi-team trade \u2014 values show what each owner received.</p>' : '') +
      '</div>';
    }

    // ── Event listeners ─────────────────────────────────────────────────── //
    document.querySelectorAll('[data-flip]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        document.querySelectorAll('[data-flip]').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        filterFlip = btn.dataset.flip;
        applyFiltersAndSort();
      });
    });

    document.querySelectorAll('[data-sortby]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        document.querySelectorAll('[data-sortby]').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        sortBy = btn.dataset.sortby;
        applyFiltersAndSort();
      });
    });

    ownerSelect.addEventListener('change', function() {
      filterOwner = ownerSelect.value;
      applyFiltersAndSort();
    });

    document.getElementById('tvot-tbody').addEventListener('click', function(e) {
      var btn = e.target.closest('.expand-btn');
      var row = e.target.closest('.tvot-trade-row');
      var id  = (btn || row) ? parseInt((btn || row).dataset.id) : null;
      if (!id) return;

      var detailRow = document.getElementById('tvot-detail-' + id);
      if (!detailRow) return;

      var isOpen = detailRow.classList.contains('open');
      if (isOpen) {
        detailRow.classList.remove('open');
        expandedIds.delete(id);
      } else {
        detailRow.classList.add('open');
        expandedIds.add(id);
      }
      if (btn) btn.textContent = isOpen ? '\u25BC' : '\u25B2';
    });

    // ── Initial render ──────────────────────────────────────────────────── //
    applyFiltersAndSort();

    // ── Hash deep-link ──────────────────────────────────────────────────── //
    var _hash = window.location.hash;
    if (_hash && _hash.startsWith('#trade-')) {
      var _tid = parseInt(_hash.slice('#trade-'.length));
      if (_tid) {
        expandedIds.add(_tid);
        applyFiltersAndSort();
        setTimeout(function() {
          var el = document.getElementById('tvot-row-' + _tid);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 150);
      }
    }
  });
})();

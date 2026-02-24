/**
 * trade_cards.js — Trade Cards dashboard
 * YK Dynasty Basketball
 *
 * Data sources:
 *   data/trade_details.json
 *   data/trade_value_over_time.json  (optional — for TVOT mini-bar)
 */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', async function () {
    const YK = window.YK;

    let data, tvotData;
    try {
      var results = await Promise.all([
        YK.loadJSON('data/trade_details.json'),
        YK.loadJSON('data/trade_value_over_time.json').catch(function() { return { trades: [] }; }),
      ]);
      data     = results[0];
      tvotData = results[1];
    } catch (e) {
      console.error('Failed to load trade_details.json:', e);
      document.getElementById('all-trades-list').innerHTML =
        '<p class="text-muted" style="padding:16px">Failed to load data.</p>';
      return;
    }

    const trades = data.trades || [];
    const nonCollusion = trades.filter(function (t) { return !t.is_collusion; });

    // Build TVOT lookup: trade_id → eval_results[]
    var tvotById = {};
    ((tvotData && tvotData.trades) || []).forEach(function(t) {
      tvotById[t.trade_id] = t.eval_results || [];
    });

    // ── Headline stats ───────────────────────────────────────────────────── //
    const avgMargin = nonCollusion.length > 0
      ? nonCollusion.reduce(function (s, t) { return s + (t.win_margin || 0); }, 0) / nonCollusion.length
      : 0;

    // Owner with most wins
    var ownerWins = {};
    nonCollusion.forEach(function (t) {
      if (t.winner) ownerWins[t.winner] = (ownerWins[t.winner] || 0) + 1;
    });
    var topWinOwner = Object.keys(ownerWins).sort(function (a, b) {
      return ownerWins[b] - ownerWins[a];
    })[0];

    // Closest trade (smallest win_margin, non-collusion)
    var closestTrade = nonCollusion.slice().sort(function (a, b) {
      return (a.win_margin || 999) - (b.win_margin || 999);
    })[0];

    // ── Stat cards ──────────────────────────────────────────────────────── //
    var cardsEl = document.getElementById('summary-cards');
    function makeCard(label, value, sub) {
      var d = document.createElement('div');
      d.className = 'stat-card';
      d.innerHTML = '<div class="stat-label">' + label + '</div>' +
        '<div class="stat-value">' + value + '</div>' +
        (sub ? '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px">' + sub + '</div>' : '');
      return d;
    }
    cardsEl.appendChild(makeCard('Trades Graded', nonCollusion.length, '2021–22 to present'));
    cardsEl.appendChild(makeCard('Avg Win Margin', '+' + avgMargin.toFixed(1), 'dynasty value gap per trade'));
    if (topWinOwner) {
      cardsEl.appendChild(makeCard(
        'Most Trade Wins',
        YK.ownerDisplayName(topWinOwner),
        ownerWins[topWinOwner] + ' trade wins'
      ));
    }
    if (closestTrade) {
      cardsEl.appendChild(makeCard(
        'Closest Trade',
        '#' + closestTrade.trade_id,
        'margin: ' + (closestTrade.win_margin || 0).toFixed(1) + ' (' + (closestTrade.season || '—') + ')'
      ));
    }

    // ── Populate filters ─────────────────────────────────────────────────── //
    var allSeasons = new Set();
    var allOwners  = new Set();
    trades.forEach(function (t) {
      if (t.season) allSeasons.add(t.season);
      (t.sides || []).forEach(function (s) { allOwners.add(s.owner); });
    });

    var seasonSelect = document.getElementById('season-select');
    Array.from(allSeasons).sort().forEach(function (s) {
      var opt = document.createElement('option');
      opt.value = s; opt.textContent = s;
      seasonSelect.appendChild(opt);
    });

    var ownerSelect = document.getElementById('owner-filter-select');
    Array.from(allOwners).sort().forEach(function (o) {
      var opt = document.createElement('option');
      opt.value = o; opt.textContent = YK.ownerDisplayName(o);
      ownerSelect.appendChild(opt);
    });

    // ── Featured sections ─────────────────────────────────────────────────── //
    var sortedByMargin = nonCollusion.slice().sort(function (a, b) {
      return (b.win_margin || 0) - (a.win_margin || 0);
    });
    var sortedByClose = nonCollusion.slice().sort(function (a, b) {
      return (a.win_margin || 999) - (b.win_margin || 999);
    });

    renderFeatured(sortedByMargin.slice(0, 5), 'top-wins-grid');
    renderFeatured(sortedByClose.slice(0, 5), 'closest-grid');

    // ── State ────────────────────────────────────────────────────────────── //
    var filterSeason   = '';
    var filterOwner    = '';
    var filterCollusion = 'show'; // 'show' | 'hide'
    var sortBy         = 'margin'; // 'margin' | 'recent' | 'fair'

    // ── Initial full list render ──────────────────────────────────────────── //
    applyFiltersAndSort();

    // ── Hash deep-link: scroll to & highlight a specific card ────────────── //
    var _hash = window.location.hash;
    if (_hash && _hash.startsWith('#trade-')) {
      setTimeout(function() {
        var el = document.getElementById(_hash.slice(1));
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.style.outline = '2px solid var(--brand-green)';
          el.style.transition = 'outline 0.5s';
          setTimeout(function() { el.style.outline = ''; }, 2500);
        }
      }, 150);
    }

    // ── Event listeners ───────────────────────────────────────────────────── //
    seasonSelect.addEventListener('change', function () {
      filterSeason = seasonSelect.value;
      applyFiltersAndSort();
    });
    ownerSelect.addEventListener('change', function () {
      filterOwner = ownerSelect.value;
      applyFiltersAndSort();
    });

    document.querySelectorAll('[data-sortby]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('[data-sortby]').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        sortBy = btn.dataset.sortby;
        applyFiltersAndSort();
      });
    });

    document.querySelectorAll('[data-collusion]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('[data-collusion]').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        filterCollusion = btn.dataset.collusion;
        applyFiltersAndSort();
      });
    });

    // ── Helpers ───────────────────────────────────────────────────────────── //
    function applyFiltersAndSort() {
      var filtered = trades.filter(function (t) {
        if (filterCollusion === 'hide' && t.is_collusion) return false;
        if (filterSeason && t.season !== filterSeason) return false;
        if (filterOwner) {
          var owners = (t.sides || []).map(function (s) { return s.owner; });
          if (!owners.includes(filterOwner)) return false;
        }
        return true;
      });

      filtered.sort(function (a, b) {
        if (sortBy === 'margin') return (b.win_margin || 0) - (a.win_margin || 0);
        if (sortBy === 'recent') return b.trade_id - a.trade_id;
        if (sortBy === 'fair')   return (a.win_margin || 999) - (b.win_margin || 999);
        return 0;
      });

      var countEl = document.getElementById('cards-count');
      if (countEl) {
        countEl.textContent = 'Showing ' + filtered.length + ' of ' + trades.length + ' trades';
      }
      // Also update inline H2 count
      var inlineCount = document.getElementById('cards-count-inline');
      if (inlineCount) {
        inlineCount.textContent = '(' + trades.length + ' trades)';
      }

      var listEl = document.getElementById('all-trades-list');
      if (filtered.length === 0) {
        listEl.innerHTML = '<p class="text-muted" style="padding:16px">No trades match filter.</p>';
        return;
      }

      var grid = document.createElement('div');
      grid.className = 'trade-cards-grid';
      filtered.forEach(function (t) {
        var card = buildCard(t);
        grid.appendChild(card);
      });
      listEl.innerHTML = '';
      listEl.appendChild(grid);
    }

    function renderFeatured(tradeList, containerId) {
      var container = document.getElementById(containerId);
      if (!container) return;
      container.innerHTML = '';
      if (tradeList.length === 0) {
        container.innerHTML = '<p class="text-muted" style="padding:12px">No data.</p>';
        return;
      }
      var grid = document.createElement('div');
      grid.className = 'trade-cards-grid';
      tradeList.forEach(function (t) {
        grid.appendChild(buildCard(t));
      });
      container.appendChild(grid);
    }

    function buildCard(trade) {
      var card = document.createElement('div');
      card.className = 'trade-card' + (trade.is_collusion ? ' collusion-card' : '');
      card.id = 'trade-' + trade.trade_id;

      var sides     = trade.sides || [];
      var winnerSide = sides.find(function (s) { return s.is_winner; }) || sides[0] || {};
      var loserSides = sides.filter(function (s) { return !s.is_winner; });

      // ── Header ──
      var badges = '';
      if (trade.is_collusion) {
        badges += '<span class="collusion-tag">&#x26A0; Collusion</span>';
      }
      if (trade.is_multi_party) {
        badges += '<span style="font-size:0.7rem;background:rgba(74,181,241,0.12);color:#2a6ba8;padding:1px 6px;border-radius:4px;margin-left:4px">3-way</span>';
      }

      var headerHtml = '<div class="trade-card-header">' +
        '<span class="trade-id">#' + trade.trade_id + '</span>' +
        '<span>' + (trade.season || '—') + '</span>' +
        (trade.date ? '<span>' + trade.date + '</span>' : '') +
        badges +
        '</div>';

      // ── Sides ──
      var sidesHtml = '<div class="trade-card-sides">';

      if (trade.is_multi_party && sides.length > 2) {
        // Multi-party: render all sides in a column layout
        sides.sort(function (a, b) { return (b.side_total || 0) - (a.side_total || 0); });
        sides.forEach(function (side, i) {
          var sideClass = side.is_winner ? 'winner-side' : 'loser-side';
          sidesHtml += buildSideHtml(side, sideClass, trade.is_collusion);
          if (i < sides.length - 1) {
            sidesHtml += '<div class="trade-vs-divider"><span class="trade-vs-label">vs</span></div>';
          }
        });
      } else {
        // Standard 2-party trade
        var side1 = winnerSide;
        var side2 = loserSides[0] || {};
        sidesHtml += buildSideHtml(side1, 'winner-side', trade.is_collusion);
        sidesHtml += '<div class="trade-vs-divider"><span class="trade-vs-label">vs</span></div>';
        sidesHtml += buildSideHtml(side2, 'loser-side', trade.is_collusion);
      }

      sidesHtml += '</div>';

      // ── Footer ──
      var margin = trade.win_margin || 0;

      // TVOT mini-bar (if data available)
      var tvotPeriods = tvotById[trade.trade_id] || [];
      var footerInner = '';

      if (tvotPeriods.length > 0) {
        var miniBar = '<div class="tvot-mini-bar">';
        tvotPeriods.forEach(function(r, i) {
          var isFlip = (i > 0 && r.winner !== tvotPeriods[i-1].winner);
          var segColor = YK.ownerColor(r.winner || '');
          var tipText = 'Y' + (i+1) + (r.season ? ' (' + r.season + ')' : '') + ': ' + YK.ownerDisplayName(r.winner || '—') + ' leads';
          miniBar += '<div class="tvot-mini-seg' + (isFlip ? ' flip-point' : '') + '"' +
            ' style="background:' + segColor + '"' +
            ' title="' + YK.escapeHtml(tipText) + '">' +
            'Y' + (i+1) +
            '</div>';
        });
        miniBar += '</div>';
        footerInner = miniBar;
      } else {
        // Fallback: plain margin bar
        var winnerTotal = winnerSide.side_total || 0;
        var loserTotal  = loserSides.length > 0 ? (loserSides[0].side_total || 0) : 0;
        var combined    = winnerTotal + loserTotal;
        var barPct      = combined > 0 ? Math.min(100, (margin / combined) * 100) : 0;
        footerInner = '<div class="margin-bar-track">' +
          '<div class="margin-bar-fill" style="width:' + barPct.toFixed(1) + '%"></div>' +
          '</div>';
      }

      var marginLabel = '<div class="margin-label">' +
        '<span data-tooltip="Dynasty value combines production, age, durability, and star power. Higher = more valuable.">' +
        'Margin: +' + margin.toFixed(1) + '</span>' +
        '</div>';

      var tvotLink = '<a class="tvot-link" href="trade-value-over-time.html#trade-' + trade.trade_id +
        '" title="View how this trade\'s value shifted over time">&#x2197; TVOT</a>';

      var footerHtml = '<div class="trade-card-footer">' +
        '<div class="margin-bar-wrap">' +
          footerInner +
          marginLabel +
        '</div>' +
        tvotLink +
        (trade.is_collusion ? '<span class="collusion-tag">Flagged</span>' : '') +
      '</div>';

      card.innerHTML = headerHtml + sidesHtml + footerHtml;
      return card;
    }

    function buildSideHtml(side, sideClass, isCollusion) {
      if (!side || !side.owner) return '<div class="trade-side ' + sideClass + '"></div>';

      var owner    = side.owner;
      var total    = side.side_total || 0;
      var isWinner = side.is_winner && !isCollusion;
      var assets   = side.assets || [];

      var dot = '<span class="owner-dot" style="background:' + YK.ownerColor(owner) + '"></span>';
      var winBadge = isWinner ? '<span class="winner-badge">&#x2714; Winner</span>' : '';

      var assetRows = assets.map(function (a) {
        var valStr  = (a.value != null && a.value > 0) ? a.value.toFixed(1) : null;
        var ageStr  = (a.age != null) ? ' &bull; age ' + a.age : '';
        var typeTag = a.asset_type === 'pick'
          ? '<span style="font-size:0.65rem;opacity:0.6;margin-left:3px">(pick)</span>'
          : '';
        return '<li>' +
          '<span class="asset-name">' + YK.escapeHtml(a.name) + typeTag + '</span>' +
          (valStr
            ? '<span class="asset-val">' + valStr + ageStr + '</span>'
            : '<span class="asset-zero">(no value)</span>') +
        '</li>';
      }).join('');

      if (assets.length === 0) {
        assetRows = '<li><span class="asset-zero">No assets listed</span></li>';
      }

      return '<div class="trade-side ' + sideClass + '">' +
        '<div class="trade-side-owner">' + dot + YK.ownerDisplayName(owner) + winBadge + '</div>' +
        '<div class="trade-side-total">' + total.toFixed(1) + ' pts</div>' +
        '<div class="asset-list-header"><span>Asset</span><span>Dynasty Value</span></div>' +
        '<ul class="asset-list">' + assetRows + '</ul>' +
      '</div>';
    }
  });
})();

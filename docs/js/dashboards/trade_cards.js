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

    // Build TVOT lookup: trade_id → eval_results[]
    var tvotById = {};
    ((tvotData && tvotData.trades) || []).forEach(function(t) {
      tvotById[t.trade_id] = t.eval_results || [];
    });

    // ── Season filter ────────────────────────────────────────────────────── //
    var filterSeasons = []; // [] = show all
    var _sfb = YK.buildSeasonFilterBar('season-filter-bar', function(activeSeasons) {
      filterSeasons = activeSeasons;
      var subset = getSeasonSubset();
      buildSummaryCards(subset);
      applyFiltersAndSort();
    });

    function getSeasonSubset() {
      if (filterSeasons.length === 0) return trades;
      return trades.filter(function(t) {
        var s = (t.season || '').replace(/^20/, ''); // "2022-23" → "22-23"
        return filterSeasons.includes(s);
      });
    }

    // ── Summary cards ────────────────────────────────────────────────────── //
    var cardsEl = document.getElementById('summary-cards');

    function makeCard(label, value, sub, valueColor) {
      var d = document.createElement('div');
      d.className = 'stat-card';
      d.innerHTML = '<div class="stat-label">' + label + '</div>' +
        '<div class="stat-value"' + (valueColor ? ' style="color:' + valueColor + '"' : '') + '>' + value + '</div>' +
        (sub ? '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px;text-align:center">' + sub + '</div>' : '');
      return d;
    }

    function buildSummaryCards(tradeSubset) {
      cardsEl.innerHTML = '';
      var nonCollusion = tradeSubset.filter(function(t) { return !t.is_collusion; });

      // Compute per-owner stats
      var ownerWins  = {}, ownerLosses = {}, ownerCount = {};
      nonCollusion.forEach(function(t) {
        (t.sides || []).forEach(function(s) {
          ownerCount[s.owner] = (ownerCount[s.owner] || 0) + 1;
          if (s.is_winner) ownerWins[s.owner]  = (ownerWins[s.owner]  || 0) + 1;
          else             ownerLosses[s.owner] = (ownerLosses[s.owner] || 0) + 1;
        });
      });
      var topWin   = Object.keys(ownerWins).sort(function(a,b){ return ownerWins[b]-ownerWins[a]; })[0];
      var topLoss  = Object.keys(ownerLosses).sort(function(a,b){ return ownerLosses[b]-ownerLosses[a]; })[0];
      var topCount = Object.keys(ownerCount).sort(function(a,b){ return ownerCount[b]-ownerCount[a]; })[0];

      // Lopsided / Closest
      var sortedDesc = nonCollusion.slice().sort(function(a,b){ return (b.win_margin||0)-(a.win_margin||0); });
      var lopsided  = sortedDesc[0];
      var closest   = sortedDesc[sortedDesc.length - 1];

      // Biggest Comeback: winner_changed + biggest_swing, within current subset
      var nonCollusionIds = new Set(nonCollusion.map(function(t){ return t.trade_id; }));
      var comeback = null, bigSwing = 0;
      ((tvotData && tvotData.trades) || []).forEach(function(t) {
        if (t.winner_changed && (t.biggest_swing||0) > bigSwing && nonCollusionIds.has(t.trade_id)) {
          bigSwing  = t.biggest_swing;
          comeback  = t;
        }
      });

      function makeClickable(card, fn) {
        card.setAttribute('data-clickable', '1');
        card.addEventListener('click', fn);
        return card;
      }

      // 1. Most Trade Wins
      if (topWin) {
        var c = makeCard('Most Trade Wins', YK.ownerDisplayName(topWin), ownerWins[topWin] + ' wins');
        makeClickable(c, function(){ scrollToTradesAndFilterOwner(topWin); });
        cardsEl.appendChild(c);
      }

      // 2. Most Trade Losses
      if (topLoss) {
        var c = makeCard('Most Trade Losses', YK.ownerDisplayName(topLoss), ownerLosses[topLoss] + ' losses');
        c.querySelector('.stat-value').style.color = '#B91C1C';
        makeClickable(c, function(){ scrollToTradesAndFilterOwner(topLoss); });
        cardsEl.appendChild(c);
      }

      // 3. Most Lopsided Trade
      if (lopsided) {
        var winSide = (lopsided.sides||[]).find(function(s){ return s.is_winner; }) || {};
        var c = makeCard(
          'Most Lopsided Trade',
          '#' + lopsided.trade_id,
          YK.ownerDisplayName(winSide.owner||'\u2014') + ' +' + (lopsided.win_margin||0).toFixed(1)
        );
        makeClickable(c, function(){ scrollToTrade(lopsided.trade_id); });
        cardsEl.appendChild(c);
      }

      // 4. Closest Trade
      if (closest) {
        var winSide2 = (closest.sides||[]).find(function(s){ return s.is_winner; }) || {};
        var c = makeCard(
          'Closest Trade',
          '#' + closest.trade_id,
          YK.ownerDisplayName(winSide2.owner||'\u2014') + ' +' + (closest.win_margin||0).toFixed(1)
        );
        makeClickable(c, function(){ scrollToTrade(closest.trade_id); });
        cardsEl.appendChild(c);
      }

      // 5. Most Trades Overall
      if (topCount) {
        var c = makeCard('Most Trades', YK.ownerDisplayName(topCount), ownerCount[topCount] + ' trades');
        makeClickable(c, function(){ scrollToTradesAndFilterOwner(topCount); });
        cardsEl.appendChild(c);
      }

      // 6. Biggest Comeback
      if (comeback) {
        var c = makeCard(
          'Biggest Comeback',
          '#' + comeback.trade_id,
          YK.ownerDisplayName(comeback.last_winner||'\u2014') + ' swung +' + (comeback.biggest_swing||0).toFixed(1)
        );
        makeClickable(c, function(){ scrollToTrade(comeback.trade_id); });
        cardsEl.appendChild(c);
      }
    }

    function scrollToTrade(tradeId) {
      if (filterOwner) {
        filterOwner = '';
        var os = document.getElementById('owner-filter-select');
        if (os) os.value = '';
        applyFiltersAndSort();
      }
      setTimeout(function() {
        var el = document.getElementById('trade-' + tradeId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.style.outline = '2px solid var(--brand-gold)';
          el.style.boxShadow = '0 0 0 5px rgba(202,138,4,0.15)';
          el.style.transition = 'outline 0.5s, box-shadow 0.5s';
          setTimeout(function() { el.style.outline = ''; el.style.boxShadow = ''; }, 2500);
        }
      }, 150);
    }

    function scrollToTradesAndFilterOwner(owner) {
      filterOwner = owner;
      var os = document.getElementById('owner-filter-select');
      if (os) os.value = owner;
      applyFiltersAndSort();
      setTimeout(function() {
        var sec = document.getElementById('all-trades-section');
        if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }

    // Initial summary cards
    buildSummaryCards(trades);

    // ── Populate filters ─────────────────────────────────────────────────── //
    var allSeasons = new Set();
    var allOwners  = new Set();
    trades.forEach(function(t) {
      if (t.season) allSeasons.add(t.season);
      (t.sides || []).forEach(function(s) { allOwners.add(s.owner); });
    });

    var seasonSelect = document.getElementById('season-select');
    Array.from(allSeasons).sort().forEach(function(s) {
      var opt = document.createElement('option');
      opt.value = s; opt.textContent = s;
      seasonSelect.appendChild(opt);
    });

    var ownerSelect = document.getElementById('owner-filter-select');
    Array.from(allOwners).sort().forEach(function(o) {
      var opt = document.createElement('option');
      opt.value = o; opt.textContent = YK.ownerDisplayName(o);
      ownerSelect.appendChild(opt);
    });

    // ── Featured sections ─────────────────────────────────────────────────── //
    var nonCollusionAll = trades.filter(function(t) { return !t.is_collusion; });
    var sortedByMargin = nonCollusionAll.slice().sort(function(a, b) {
      return (b.win_margin || 0) - (a.win_margin || 0);
    });
    var sortedByClose = nonCollusionAll.slice().sort(function(a, b) {
      return (a.win_margin || 999) - (b.win_margin || 999);
    });

    renderFeatured(sortedByMargin.slice(0, 5), 'top-wins-grid');
    renderFeatured(sortedByClose.slice(0, 5), 'closest-grid');

    // ── Collapsible featured sections ─────────────────────────────────────── //
    document.querySelectorAll('.section-toggle').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var target = document.getElementById(btn.dataset.target);
        if (!target) return;
        var collapsed = target.classList.toggle('grid-collapsed');
        btn.textContent = collapsed ? '\u25BA Expand' : '\u25BC Collapse';
      });
    });

    // ── State ────────────────────────────────────────────────────────────── //
    var filterSeason    = '';
    var filterOwner     = '';
    var filterCollusion = 'hide'; // 'show' | 'hide' — default hidden
    var sortBy          = 'margin'; // 'margin' | 'recent' | 'fair'

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
    seasonSelect.addEventListener('change', function() {
      filterSeason = seasonSelect.value;
      applyFiltersAndSort();
    });
    ownerSelect.addEventListener('change', function() {
      filterOwner = ownerSelect.value;
      applyFiltersAndSort();
    });

    document.querySelectorAll('[data-sortby]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        document.querySelectorAll('[data-sortby]').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        sortBy = btn.dataset.sortby;
        applyFiltersAndSort();
      });
    });

    // ── Collusion checkbox ───────────────────────────────────────────────── //
    var collusionCb = document.getElementById('collusion-cb');
    if (collusionCb) {
      collusionCb.addEventListener('change', function() {
        filterCollusion = collusionCb.checked ? 'show' : 'hide';
        applyFiltersAndSort();
      });
    }

    // ── Helpers ───────────────────────────────────────────────────────────── //
    function applyFiltersAndSort() {
      var base = getSeasonSubset();
      var filtered = base.filter(function(t) {
        if (filterCollusion === 'hide' && t.is_collusion) return false;
        if (filterSeason && t.season !== filterSeason) return false;
        if (filterOwner) {
          var owners = (t.sides || []).map(function(s) { return s.owner; });
          if (!owners.includes(filterOwner)) return false;
        }
        return true;
      });

      filtered.sort(function(a, b) {
        if (sortBy === 'margin') return (b.win_margin || 0) - (a.win_margin || 0);
        if (sortBy === 'recent') return b.trade_id - a.trade_id;
        if (sortBy === 'fair')   return (a.win_margin || 999) - (b.win_margin || 999);
        return 0;
      });

      var countEl = document.getElementById('cards-count');
      if (countEl) {
        countEl.textContent = 'Showing ' + filtered.length + ' of ' + trades.length + ' trades';
      }
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
      filtered.forEach(function(t) {
        grid.appendChild(buildCard(t));
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
      // Append directly to container — it already has trade-cards-grid class in HTML
      tradeList.forEach(function(t) {
        container.appendChild(buildCard(t));
      });
    }

    function buildCard(trade) {
      var sides      = trade.sides || [];
      var partyCount = sides.length;
      var isMultiParty = partyCount > 2;

      var card = document.createElement('div');
      card.className = 'trade-card' +
        (trade.is_collusion ? ' collusion-card' : '') +
        (isMultiParty ? ' multi-party-card' : '');
      card.id = 'trade-' + trade.trade_id;

      var winnerSide = sides.find(function(s) { return s.is_winner; }) || sides[0] || {};
      var loserSides = sides.filter(function(s) { return !s.is_winner; });

      // ── Header badges: use sides.length for party count ──
      var partyLabel = partyCount <= 2 ? '2-way' : partyCount + '-way';
      var partyClass = partyCount <= 2 ? 'party-tag-2' : 'party-tag-multi';
      var badges = '';
      if (trade.is_collusion) {
        badges += '<span class="collusion-tag">&#x26A0; Collusion</span>';
      }
      badges += '<span class="party-tag ' + partyClass + '">' + partyLabel + '</span>';

      var headerHtml = '<div class="trade-card-header">' +
        '<span class="trade-id">#' + trade.trade_id + '</span>' +
        '<span>' + (trade.season || '\u2014') + '</span>' +
        (trade.date ? '<span>' + String(trade.date).slice(0, 10) + '</span>' : '') +
        badges +
        '</div>';

      // ── TVOT data for this trade ──
      var tvotPeriods = tvotById[trade.trade_id] || [];

      // ── Sides ──
      var sidesHtml = '<div class="trade-card-sides">';

      if (isMultiParty) {
        // Multi-party: no winner/loser styling, no winner badge
        sides.forEach(function(side, i, arr) {
          sidesHtml += buildSideHtml(side, '', trade.is_collusion, tvotPeriods, true);
          if (i < arr.length - 1) {
            sidesHtml += '<div class="trade-vs-divider"><span class="trade-vs-label">vs</span></div>';
          }
        });
      } else {
        sidesHtml += buildSideHtml(winnerSide, 'winner-side', trade.is_collusion, tvotPeriods, false);
        sidesHtml += '<div class="trade-vs-divider"><span class="trade-vs-label">vs</span></div>';
        sidesHtml += buildSideHtml(loserSides[0] || {}, 'loser-side', trade.is_collusion, tvotPeriods, false);
      }

      sidesHtml += '</div>';

      // ── Footer ──
      var margin = trade.win_margin || 0;
      var tvotLink = '<a class="tvot-link" href="trade-value-over-time.html#trade-' + trade.trade_id +
        '" title="View how this trade\'s value shifted over time">&#x2197; TVOT</a>';

      // Multi-party trades: simplified footer
      if (isMultiParty && !trade.is_collusion) {
        var footerHtml = '<div class="trade-card-footer">' +
          '<div style="font-size:0.75rem;color:var(--text-muted);font-style:italic">' +
          partyCount + '-way trade \u2014 individual grades coming soon' +
          '</div>' +
          tvotLink +
          '</div>';
        card.innerHTML = headerHtml + sidesHtml + footerHtml;
        return card;
      }

      var footerInner = '';

      if (tvotPeriods.length > 0) {
        var miniBar = '<div class="tvot-mini-bar">';
        tvotPeriods.forEach(function(r, i) {
          var isFlip = (i > 0 && r.winner !== tvotPeriods[i - 1].winner);
          var segColor = YK.ownerColor(r.winner || '');
          var tipText = 'Y' + (i + 1) + (r.season ? ' (' + r.season + ')' : '') +
            ': ' + YK.ownerDisplayName(r.winner || '\u2014') + ' leads';
          miniBar += '<div class="tvot-mini-seg' + (isFlip ? ' flip-point' : '') + '"' +
            ' style="background:' + segColor + '"' +
            ' title="' + YK.escapeHtml(tipText) + '">' +
            'Y' + (i + 1) +
            '</div>';
        });
        miniBar += '</div>';
        footerInner = miniBar;
      } else {
        var winnerTotal = winnerSide.side_total || 0;
        var loserTotal  = loserSides.length > 0 ? (loserSides[0].side_total || 0) : 0;
        var combined    = winnerTotal + loserTotal;
        var barPct      = combined > 0 ? Math.min(100, (margin / combined) * 100) : 0;
        footerInner = '<div class="margin-bar-track">' +
          '<div class="margin-bar-fill" style="width:' + barPct.toFixed(1) + '%"></div>' +
          '</div>';
      }

      // C6 — TVOT margin label (Y1 → current)
      var marginLabel = '<div class="margin-label">';
      if (tvotPeriods.length >= 1) {
        var y1 = tvotPeriods[0];
        var yn = tvotPeriods[tvotPeriods.length - 1];
        function getMargin(r) {
          var vals = Object.values(r.totals || {});
          return vals.length >= 2 ? Math.abs(vals[0] - vals[1]) : 0;
        }
        var y1Margin = getMargin(y1);
        var ynMargin = getMargin(yn);
        marginLabel += '<span style="font-size:0.65rem;color:var(--text-muted)">' +
          'Y1: ' + YK.ownerDisplayName(y1.winner || '\u2014') + ' +' + y1Margin.toFixed(0) +
          (tvotPeriods.length > 1
            ? ' \u2192 Now: ' + YK.ownerDisplayName(yn.winner || '\u2014') + ' +' + ynMargin.toFixed(0)
            : '') +
          '</span>';
      } else {
        marginLabel += '<span data-tooltip="Dynasty value combines production, age, durability, and star power.">' +
          'Margin: +' + margin.toFixed(1) + '</span>';
      }
      marginLabel += '</div>';

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

    function buildSideHtml(side, sideClass, isCollusion, tvotPeriods, isMultiParty) {
      if (!side || !side.owner) return '<div class="trade-side ' + sideClass + '"></div>';

      var owner    = side.owner;
      var total    = side.side_total || 0;
      var isWinner = side.is_winner && !isCollusion && !isMultiParty;
      var assets   = side.assets || [];

      var dot = '<span class="owner-dot" style="background:' + YK.ownerColor(owner) + '"></span>';

      // C5 — Winner history from TVOT
      var tvotArr    = tvotPeriods || [];
      var initWinner = tvotArr.length > 0 ? tvotArr[0].winner : null;
      var currWinner = tvotArr.length > 0 ? tvotArr[tvotArr.length - 1].winner : null;
      var flipped    = initWinner && currWinner && initWinner !== currWinner;

      var winBadge     = '';
      var winnerHistory = '';
      if (isWinner) {
        if (flipped && owner === currWinner) {
          winBadge = '<span class="winner-flipped-badge">&#x2714; Winner</span>';
          winnerHistory = '<div class="winner-history winner-flipped-text">&#x21C4; Flipped from ' +
            YK.ownerDisplayName(initWinner) + '</div>';
        } else {
          winBadge = '<span class="winner-badge">&#x2714; Winner</span>';
          if (initWinner) {
            winnerHistory = '<div class="winner-history winner-stable">Leading since Y1</div>';
          }
        }
      } else if (flipped && owner === initWinner) {
        winnerHistory = '<div class="winner-history winner-flipped-text">Was leading at Y1 \u2192 now trailing</div>';
      }

      var assetRows = assets.map(function(a) {
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
        winnerHistory +
        '<div class="asset-list-header"><span>Asset</span><span>Dynasty Value</span></div>' +
        '<ul class="asset-list">' + assetRows + '</ul>' +
        '</div>';
    }
  });
})();
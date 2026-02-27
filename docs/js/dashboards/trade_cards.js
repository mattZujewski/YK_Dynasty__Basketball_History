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

    // Multi-party note: count and display hidden 3-way trades
    var multiPartyCount = trades.filter(function(t) { return t.is_multi_party && !t.is_collusion; }).length;
    var mpNote = document.getElementById('multi-party-note');
    if (mpNote && multiPartyCount > 0) {
      mpNote.textContent = multiPartyCount + ' multi-party trades are hidden — grading coming soon.';
      mpNote.style.display = '';
    }

    // Build TVOT lookup: trade_id → eval_results[]
    var tvotById = {};
    ((tvotData && tvotData.trades) || []).forEach(function(t) {
      tvotById[t.trade_id] = t.eval_results || [];
    });

    // ── Season filter ────────────────────────────────────────────────────── //
    var filterSeasons = []; // [] = show all
    var _sfb = YK.buildSeasonFilterBar('season-filter-bar', function(activeSeasons) {
      filterSeasons = activeSeasons;
      // Update sticky pill text when season changes
      if (stickyPill) {
        if (filterSeasons.length > 0) {
          stickyPill.textContent = 'Viewing: ' + filterSeasons.join(', ');
        } else {
          stickyPill.classList.remove('visible');
        }
      }
      updateResetBtn();
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

    // ── Sticky season pill ───────────────────────────────────────────────── //
    var stickyPill = document.getElementById('sticky-season');
    var sfbEl = document.getElementById('season-filter-bar');
    if (stickyPill && sfbEl && window.IntersectionObserver) {
      var _sfbObs = new IntersectionObserver(function(entries) {
        var isVisible = entries[0].isIntersecting;
        if (!isVisible && filterSeasons.length > 0) {
          stickyPill.textContent = 'Viewing: ' + filterSeasons.join(', ');
          stickyPill.classList.add('visible');
        } else {
          stickyPill.classList.remove('visible');
        }
      }, { threshold: 0 });
      _sfbObs.observe(sfbEl);
    }

    // ── Summary cards ────────────────────────────────────────────────────── //
    var cardsEl = document.getElementById('summary-cards');

    function makeCard(label, value, sub, valueColor, zone) {
      var d = document.createElement('div');
      d.className = 'stat-card' + (zone ? ' stat-card-' + zone : '');
      d.innerHTML = '<div class="stat-label">' + label + '</div>' +
        '<div class="stat-value"' + (valueColor ? ' style="color:' + valueColor + '"' : '') + '>' + value + '</div>' +
        (sub ? '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px;text-align:center">' + sub + '</div>' : '');
      return d;
    }

    function buildSummaryCards(tradeSubset) {
      cardsEl.innerHTML = '';
      // D4: exclude 2020-21 from all featured stats
      var nonCollusion = tradeSubset.filter(function(t) {
        return !t.is_collusion && t.season !== '2020-21' && !t.is_multi_party;
      });

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

      // 1. Most Trade Wins → green
      if (topWin) {
        var c = makeCard('Most Trade Wins', YK.ownerDisplayName(topWin), ownerWins[topWin] + ' wins', null, 'green');
        makeClickable(c, function(){ scrollToTradesAndFilterOwner(topWin); });
        cardsEl.appendChild(c);
      }

      // 2. Most Trade Losses → red
      if (topLoss) {
        var c = makeCard('Most Trade Losses', YK.ownerDisplayName(topLoss), ownerLosses[topLoss] + ' losses', '#B91C1C', 'red');
        makeClickable(c, function(){ scrollToTradesAndFilterOwner(topLoss); });
        cardsEl.appendChild(c);
      }

      // 3. Most Lopsided Trade → gold
      if (lopsided) {
        var winSide = (lopsided.sides||[]).find(function(s){ return s.is_winner; }) || {};
        var c = makeCard(
          'Most Lopsided Trade',
          '#' + lopsided.trade_id,
          YK.ownerDisplayName(winSide.owner||'\u2014') + ' +' + (lopsided.win_margin||0).toFixed(1),
          null, 'gold'
        );
        makeClickable(c, function(){ scrollToTrade(lopsided.trade_id); });
        cardsEl.appendChild(c);
      }

      // 4. Closest Trade → gold
      if (closest) {
        var winSide2 = (closest.sides||[]).find(function(s){ return s.is_winner; }) || {};
        var c = makeCard(
          'Closest Trade',
          '#' + closest.trade_id,
          YK.ownerDisplayName(winSide2.owner||'\u2014') + ' +' + (closest.win_margin||0).toFixed(1),
          null, 'gold'
        );
        makeClickable(c, function(){ scrollToTrade(closest.trade_id); });
        cardsEl.appendChild(c);
      }

      // 5. Most Trades Overall → blue
      if (topCount) {
        var c = makeCard('Most Trades', YK.ownerDisplayName(topCount), ownerCount[topCount] + ' trades', null, 'blue');
        makeClickable(c, function(){ scrollToTradesAndFilterOwner(topCount); });
        cardsEl.appendChild(c);
      }

      // 6. Biggest Comeback → gold
      if (comeback) {
        var c = makeCard(
          'Biggest Comeback',
          '#' + comeback.trade_id,
          YK.ownerDisplayName(comeback.last_winner||'\u2014') + ' swung +' + (comeback.biggest_swing||0).toFixed(1),
          null, 'gold'
        );
        makeClickable(c, function(){ scrollToTrade(comeback.trade_id); });
        cardsEl.appendChild(c);
      }
    }

    // ── Reset all filters ────────────────────────────────────────────────── //
    function updateResetBtn() {
      var btn = document.getElementById('reset-filters-btn');
      if (!btn) return;
      var hasFilter = filterSeasons.length > 0 || selectedOwners.length > 0 || collusionMode;
      btn.classList.toggle('visible', hasFilter);
    }

    function resetAllFilters() {
      if (collusionMode) exitCollusionMode();
      selectedOwners = [];
      buildOwnerPills();
      // Reset season bar to "All"
      if (_sfb && typeof _sfb.reset === 'function') _sfb.reset();
      filterSeasons = [];
      applyFiltersAndSort();
    }

    var _resetBtn = document.getElementById('reset-filters-btn');
    if (_resetBtn) _resetBtn.addEventListener('click', resetAllFilters);

    function scrollToTrade(tradeId) {
      // Reset all filters so the card is guaranteed to be visible
      resetAllFilters();
      setTimeout(function() {
        var el = document.getElementById('trade-' + tradeId);
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.style.outline = '2px solid var(--brand-gold)';
        el.style.boxShadow = '0 0 0 5px rgba(202,138,4,0.15)';
        el.style.transition = 'outline 0.5s, box-shadow 0.5s';
        setTimeout(function() { el.style.outline = ''; el.style.boxShadow = ''; }, 2500);
      }, 250);
    }

    function scrollToTradesAndFilterOwner(owner) {
      selectedOwners = [owner];
      buildOwnerPills();
      applyFiltersAndSort();
      setTimeout(function() {
        var sec = document.getElementById('all-trades-section');
        if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }

    // Initial summary cards (exclude 2020-21)
    buildSummaryCards(trades.filter(function(t) { return t.season !== '2020-21'; }));

    // ── Collect all owners ────────────────────────────────────────────────── //
    var allOwners  = new Set();
    trades.forEach(function(t) {
      if (t.season === '2020-21') return; // D4: skip 2020-21 entirely
      if (t.is_collusion) return;
      (t.sides || []).forEach(function(s) { allOwners.add(s.owner); });
    });

    // ── Multi-select owner pill bar ──────────────────────────────────────── //
    var selectedOwners = []; // [] = all; [x] = trades by x; [x,y] = trades between both

    function buildOwnerPills() {
      var bar = document.getElementById('owner-pills-bar');
      if (!bar) return;
      bar.innerHTML = '';
      var owners = Array.from(allOwners).sort(function(a,b) {
        return YK.ownerDisplayName(a).localeCompare(YK.ownerDisplayName(b));
      });
      // Grid wrapper for 5-per-row layout on desktop
      var grid = document.createElement('div');
      grid.className = 'owner-pills-grid';
      owners.forEach(function(o) {
        var isSelected = selectedOwners.includes(o);
        var isDisabled = !isSelected && selectedOwners.length >= 2;
        var pill = document.createElement('span');
        pill.className = 'owner-pill' + (isSelected ? ' selected' : '') + (isDisabled ? ' disabled' : '');
        pill.innerHTML = '<span class="owner-pill-dot" style="background:' + YK.ownerColor(o) + '"></span>' +
          YK.escapeHtml(YK.ownerDisplayName(o));
        pill.addEventListener('click', function() {
          if (collusionMode || isDisabled) return;
          var idx = selectedOwners.indexOf(o);
          if (idx >= 0) selectedOwners.splice(idx, 1);
          else selectedOwners.push(o);
          buildOwnerPills();
          applyFiltersAndSort();
        });
        grid.appendChild(pill);
      });
      bar.appendChild(grid);
      if (selectedOwners.length > 0) {
        var clr = document.createElement('button');
        clr.className = 'owner-pill-clear';
        clr.textContent = 'Clear';
        clr.addEventListener('click', function() {
          selectedOwners = [];
          buildOwnerPills();
          applyFiltersAndSort();
        });
        bar.appendChild(clr);
      }
    }

    buildOwnerPills();

    // ── Featured sections ─────────────────────────────────────────────────── //
    // D4: exclude 2020-21, collusion, and multi-party from featured sections
    var nonCollusionAll = trades.filter(function(t) {
      return !t.is_collusion && t.season !== '2020-21' && !t.is_multi_party;
    });
    var sortedByMargin = nonCollusionAll.slice().sort(function(a, b) {
      return (b.win_margin || 0) - (a.win_margin || 0);
    });
    var sortedByClose = nonCollusionAll.slice().sort(function(a, b) {
      return (a.win_margin || 999) - (b.win_margin || 999);
    });

    renderFeatured(sortedByMargin.slice(0, 5), 'top-wins-grid');
    renderFeatured(sortedByClose.slice(0, 5), 'closest-grid');
    renderComebacks();

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
    var sortBy      = 'margin'; // 'margin' | 'recent' | 'fair'

    // ── Collusion 🕵️ mode ────────────────────────────────────────────────── //
    var collusionMode = false;

    function enterCollusionMode() {
      collusionMode = true;
      var btn = document.getElementById('collusion-icon-btn');
      var banner = document.getElementById('collusion-banner');
      if (btn) btn.classList.add('active');
      if (banner) banner.style.display = 'flex';
      applyFiltersAndSort();
    }
    function exitCollusionMode() {
      collusionMode = false;
      var btn = document.getElementById('collusion-icon-btn');
      var banner = document.getElementById('collusion-banner');
      if (btn) btn.classList.remove('active');
      if (banner) banner.style.display = 'none';
      applyFiltersAndSort();
    }

    var _collusionBtn = document.getElementById('collusion-icon-btn');
    if (_collusionBtn) {
      _collusionBtn.addEventListener('click', function() {
        if (collusionMode) exitCollusionMode(); else enterCollusionMode();
      });
    }
    var _collusionExit = document.getElementById('collusion-banner-exit');
    if (_collusionExit) _collusionExit.addEventListener('click', exitCollusionMode);

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

    // ── Sort button listeners ─────────────────────────────────────────────── //
    document.querySelectorAll('[data-sortby]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        document.querySelectorAll('[data-sortby]').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        sortBy = btn.dataset.sortby;
        applyFiltersAndSort();
      });
    });

    // ── Helpers ───────────────────────────────────────────────────────────── //
    function applyFiltersAndSort() {
      var listEl = document.getElementById('all-trades-list');

      if (collusionMode) {
        // Override: show only collusion trades
        updateResetBtn();
        var colTrades = trades.filter(function(t) { return t.is_collusion; });
        listEl.classList.add('collusion-mode-active');
        var grid2 = document.createElement('div');
        grid2.className = 'trade-cards-grid';
        colTrades.forEach(function(t) { grid2.appendChild(buildCard(t)); });
        listEl.innerHTML = '';
        listEl.appendChild(grid2);
        var labelEl2 = document.getElementById('all-trades-label');
        if (labelEl2) labelEl2.textContent = 'Collusion Flagged Trades';
        var inlineCount2 = document.getElementById('cards-count-inline');
        if (inlineCount2) inlineCount2.textContent = '(' + colTrades.length + ')';
        return;
      }

      // Normal mode
      if (listEl) listEl.classList.remove('collusion-mode-active');

      var base = getSeasonSubset();
      var filtered = base.filter(function(t) {
        if (t.is_collusion) return false;       // always hide collusion in normal mode
        if (t.season === '2020-21') return false; // D4: hide 2020-21
        if (t.is_multi_party) return false;     // hide 3-way trades (grading coming soon)
        // Owner pill multi-select
        if (selectedOwners.length >= 1) {
          var tradeOwners = (t.sides || []).map(function(s) { return s.owner; });
          if (selectedOwners.length === 1) {
            if (!tradeOwners.includes(selectedOwners[0])) return false;
          } else {
            if (!selectedOwners.every(function(o) { return tradeOwners.includes(o); })) return false;
          }
        }
        return true;
      });

      filtered.sort(function(a, b) {
        if (sortBy === 'margin') return (b.win_margin || 0) - (a.win_margin || 0);
        if (sortBy === 'recent') return b.trade_id - a.trade_id;
        if (sortBy === 'fair')   return (a.win_margin || 999) - (b.win_margin || 999);
        return 0;
      });

      // Update reset button visibility
      updateResetBtn();

      // Update dynamic header (task 5)
      var totalNonColl = trades.filter(function(t) { return !t.is_collusion && t.season !== '2020-21' && !t.is_multi_party; }).length;
      var labelEl = document.getElementById('all-trades-label');
      var inlineCount = document.getElementById('cards-count-inline');
      if (selectedOwners.length === 2) {
        if (labelEl) labelEl.textContent =
          YK.ownerDisplayName(selectedOwners[0]) + ' vs ' + YK.ownerDisplayName(selectedOwners[1]);
        if (inlineCount) inlineCount.textContent = '(' + filtered.length + ' trade' + (filtered.length !== 1 ? 's' : '') + ')';
      } else {
        if (labelEl) labelEl.textContent = 'All Trade Grades';
        if (inlineCount) {
          if (selectedOwners.length === 1 || filterSeasons.length > 0) {
            inlineCount.textContent = '\u2014 Showing ' + filtered.length + ' of ' + totalNonColl + ' trades';
          } else {
            inlineCount.textContent = '(' + totalNonColl + ' trades)';
          }
        }
      }

      var countEl = document.getElementById('cards-count');
      if (countEl) {
        countEl.textContent = '';
      }

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

    function renderComebacks() {
      var el = document.getElementById('comebacks-list');
      var countEl = document.getElementById('comebacks-count');
      if (!el) return;

      var nonCollusionIds = new Set(nonCollusionAll.map(function(t) { return t.trade_id; }));

      // Use TVOT data (has winner_changed + biggest_swing); filter to non-collusion 2-party trades
      var comebacks = ((tvotData && tvotData.trades) || [])
        .filter(function(t) { return t.winner_changed && t.biggest_swing && nonCollusionIds.has(t.trade_id); })
        .sort(function(a, b) { return (b.biggest_swing || 0) - (a.biggest_swing || 0); })
        .slice(0, 5);

      if (countEl) countEl.textContent = '(' + comebacks.length + ')';
      el.innerHTML = '';

      comebacks.forEach(function(tvot) {
        // Look up full trade details (sides) from trade_details
        var t = trades.find(function(tr) { return tr.trade_id === tvot.trade_id; }) || {};
        var sides = t.sides || [];
        var firstWin = sides.find(function(s) { return s.owner === tvot.first_winner; });
        var lastWin  = sides.find(function(s) { return s.owner === tvot.last_winner;  });

        var div = document.createElement('div');
        div.className = 'comeback-item';
        div.innerHTML =
          '<div class="comeback-header">' +
            '<span class="comeback-id">Trade #' + tvot.trade_id + '</span>' +
            '<span class="comeback-swing">&#x1F4C9; &#x2B06;&#xFE0F; +' + (tvot.biggest_swing || 0).toFixed(1) + '</span>' +
          '</div>' +
          '<div class="comeback-parties">' +
            YK.escapeHtml(YK.ownerDisplayName(tvot.first_winner || '')) + ' (early) &#x2192; ' +
            YK.escapeHtml(YK.ownerDisplayName(tvot.last_winner || '')) + ' (now)' +
          '</div>' +
          '<div class="comeback-assets">' +
            (firstWin ? (firstWin.assets || []).slice(0, 2).map(function(a) { return YK.escapeHtml(a.name); }).join(', ') : '') +
            ' &#x2194; ' +
            (lastWin ? (lastWin.assets || []).slice(0, 2).map(function(a) { return YK.escapeHtml(a.name); }).join(', ') : '') +
          '</div>' +
          '<a class="comeback-link" href="#trade-' + tvot.trade_id + '">View &#x2192;</a>';

        var link = div.querySelector('.comeback-link');
        if (link) {
          (function(tid) {
            link.addEventListener('click', function(e) {
              e.preventDefault();
              scrollToTrade(tid);
            });
          })(tvot.trade_id);
        }

        el.appendChild(div);
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

      // ── TVOT data for this trade ── (capped at 5 segments Y1–Y5)
      var tvotPeriods = (tvotById[trade.trade_id] || []).slice(0, 5);

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
        // D6: mini-bar with year label + margin number per segment
        var miniBar = '<div class="tvot-mini-bar">';
        tvotPeriods.forEach(function(r, i) {
          var isFlip = (i > 0 && r.winner !== tvotPeriods[i - 1].winner);
          var segColor = YK.ownerColor(r.winner || '');
          var tipText = 'Y' + (i + 1) + (r.season ? ' (' + r.season + ')' : '') +
            ': ' + YK.ownerDisplayName(r.winner || '\u2014') + ' leads';
          var totalsArr = Object.values(r.totals || {});
          var segMargin = totalsArr.length >= 2 ? Math.abs(totalsArr[0] - totalsArr[1]) : 0;
          miniBar += '<div class="tvot-mini-seg' + (isFlip ? ' flip-point' : '') + '"' +
            ' style="background:' + segColor + '"' +
            ' title="' + YK.escapeHtml(tipText) + '">' +
            '<span class="tvot-mini-yr">Y' + (i + 1) + '</span>' +
            '<span class="tvot-mini-margin">+' + segMargin.toFixed(0) + '</span>' +
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

      // TVOT margin label (Y1 → current)
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

      // Winner history from TVOT
      var tvotArr    = tvotPeriods || [];
      var initWinner = tvotArr.length > 0 ? tvotArr[0].winner : null;
      var currWinner = tvotArr.length > 0 ? tvotArr[tvotArr.length - 1].winner : null;
      var flipped    = initWinner && currWinner && initWinner !== currWinner;

      // Task 9: ONE status indicator per side — either winner badge OR flip text, not both
      var winBadge     = '';
      var winnerHistory = '';
      if (isWinner) {
        if (flipped && owner === currWinner) {
          // Flipped winner: single orange badge with context
          winBadge = '<span class="winner-flipped-badge">&#x21C4; Flipped</span>';
          winnerHistory = '<div class="winner-history winner-flipped-text">Flipped from ' +
            YK.ownerDisplayName(initWinner) + '</div>';
        } else {
          // Stable winner: single green badge
          winBadge = '<span class="winner-badge">&#x2714; Winner</span>';
          if (tvotArr.length > 0) {
            winnerHistory = '<div class="winner-history winner-stable">Leading since Y1</div>';
          }
        }
      }
      // Note: loser "Was leading Y1" removed — flip visible via mini-bar and winner badge

      var assetRows = assets.map(function(a) {
        var valStr = (a.value != null && a.value > 0) ? a.value.toFixed(1) : null;
        var fpgStr = (a.fpg != null && a.fpg > 0) ? (+a.fpg).toFixed(1) : null;
        var ageStr = (a.age != null) ? ' \u00b7 age ' + a.age : '';

        // Task 6: pick display — show pick description first, then player in parens
        var namePart;
        if (a.asset_type === 'pick' && a.pick_desc) {
          namePart = YK.escapeHtml(a.pick_desc) +
            '<br><span style="font-size:0.65rem;opacity:0.72">' +
            YK.escapeHtml(a.name) + ageStr + '</span>';
        } else {
          // Task 8: age on name line
          namePart = YK.escapeHtml(a.name) +
            (ageStr ? '<span style="opacity:0.62;font-size:0.73em">' + ageStr + '</span>' : '');
        }

        // Task 8: FP/G next to dynasty value on value line
        var valPart;
        if (valStr) {
          var valContent = '';
          if (fpgStr) valContent += '<span style="font-size:0.63rem;opacity:0.7;font-weight:400">' + fpgStr + ' FP/G \u00b7 </span>';
          valContent += valStr;
          valPart = '<span class="asset-val">' + valContent + '</span>';
        } else {
          valPart = '<span class="asset-zero">(no value)</span>';
        }

        return '<li><span class="asset-name">' + namePart + '</span>' + valPart + '</li>';
      }).join('');

      if (assets.length === 0) {
        assetRows = '<li><span class="asset-zero">No assets listed</span></li>';
      }

      return '<div class="trade-side ' + sideClass + '">' +
        '<div class="trade-side-owner">' + dot + YK.ownerDisplayName(owner) + winBadge + '</div>' +
        '<div class="trade-side-total">' + total.toFixed(1) + ' pts</div>' +
        winnerHistory +
        '<div class="asset-list-header"><span>Asset</span><span>Cur. Dynasty Value</span></div>' +
        '<ul class="asset-list">' + assetRows + '</ul>' +
        '</div>';
    }
  });
})();

/**
 * core.js — Shared utilities, owner mappings & Chart.js defaults
 * YK Dynasty Basketball
 */

window.YK = window.YK || {};

(function (YK) {
  'use strict';

  // ── Owner abbreviation → canonical owner name ──────────────────
  // TRAG + HALE = same person (Ryan HaleTrager)
  // VLAND + KELL + BADEN = same franchise slot (currently Sam Baden)
  // PETE + DIME = same person (Kelvin Peterson)
  const OWNER_ABBREVS = {
    TRAG:  'HaleTrager',  HALE:  'HaleTrager',
    JOWK:  'Jowkar',
    DELA:  'Delaney',
    GREEN: 'Green',
    BERK:  'Berke',
    PETE:  'Peterson',     DIME:  'Peterson',
    MOSS:  'Moss',
    ZJEW:  'Zujewski',
    GOLD:  'Gold',
    KELL:  'Baden',        VLAND: 'Baden',       BADEN: 'Baden',    FLAGGS: 'Baden',
  };

  // Display name variants found in trade logs → canonical name
  const OWNER_ALT_NAMES = {
    'Kelvin':        'Peterson',
    'Peterson':      'Peterson',
    'AlwaysDroppin': 'Peterson',
    'Jowkar':        'Jowkar',
    'Delaney':       'Delaney',
    'Green':         'Green',
    'Max':           'Green',
    'Logan':         'Berke',
    'Berke':         'Berke',
    'Moss':          'Moss',
    'Trager':        'HaleTrager',
    'Hale':          'HaleTrager',
    'HaleTrager':    'HaleTrager',
    'Vlandis':       'Baden',
    'Kelley':        'Baden',
    'Baden':         'Baden',
    'Zujewski':      'Zujewski',
    'Franz':         'Zujewski',
    'Gold':          'Gold',
  };

  // Canonical 10 owners sorted alphabetically
  const OWNERS_ALPHA = [
    'Baden', 'Berke', 'Delaney', 'Gold', 'Green',
    'HaleTrager', 'Jowkar', 'Moss', 'Peterson', 'Zujewski',
  ];

  // Owner display names (friendlier for UI)
  // Includes aliases for transitional-slot and dual-abbrev owners so ownerDisplayName()
  // can do a direct dict lookup without resolveOwner() — preserving historical names.
  const OWNER_DISPLAY = {
    'Baden':       'Sam Baden',
    'Berke':       'Logan Berke',
    'Delaney':     'David Delaney',
    'Gold':        'Sam Gold',
    'Green':       'Max Green',
    'HaleTrager':  'Ryan Trager',
    'Trager':      'Ryan Trager',       // alias
    'Jowkar':      'Nick Jowkar',
    'Kelley':      'Brendan Kelley',    // transitional slot 2022-25
    'Moss':        'Max Moss',
    'Peterson':    'Kelvin Peterson',
    'Vlandis':     'Spencer Vlandis',   // transitional slot 2020-23
    'Zujewski':    'Matthew Zujewski',
  };

  // Team name → canonical owner mapping (all seasons, verified against Fantrax)
  const TEAM_TO_OWNER = {
    'Always Droppin Dimes': 'Peterson',
    'Ball Don\'t Lie':      'Jowkar',
    'BKs Whoppers':         'Baden',
    'Burner account':       'Berke',
    'Charlotte Wobnets':    'Baden',    // Vlandis franchise (2022-23)
    'Flaming Flaggs':       'Baden',
    'Freshly Washed Kings': 'Delaney',
    'Giddey Up':            'Gold',     // Confirmed by Fantrax shortName "Gold"
    'Ice Trae':             'Green',
    'Kelvin got No Dimes':  'Berke',    // Confirmed by Fantrax shortName "Berke"
    'Kentucky Fried Guards':'Gold',
    'Lob Land':             'HaleTrager', // 2022-23
    'No Shaime':            'Gold',       // 2023-24
    'Only Franz':           'Zujewski',
    'Pure Sweat Farm':      'Moss',
    'Pure Sweat Fam':       'Moss',
    'Twin Towers':          'HaleTrager',
  };

  // Owner color palette — 10 owners in OWNERS_ALPHA order:
  // Baden, Berke, Delaney, Gold, Green, HaleTrager, Jowkar, Moss, Peterson, Zujewski
  const OWNER_COLORS_RAW = [
    '#475569', // Baden      — Slate
    '#9F1239', // Berke      — Maroon
    '#EA580C', // Delaney    — Orange
    '#D97706', // Gold       — Amber
    '#16A34A', // Green      — Green
    '#2563EB', // HaleTrager — Blue (Ryan Trager)
    '#DC2626', // Jowkar     — Crimson
    '#B45309', // Moss       — Copper
    '#7C3AED', // Peterson   — Purple
    '#0891B2', // Zujewski   — Turquoise
  ];

  function ownerColor(name) {
    const canonical = resolveOwner(name);
    const idx = OWNERS_ALPHA.indexOf(canonical);
    return idx >= 0 ? OWNER_COLORS_RAW[idx] : '#888';
  }

  function ownerColorAlpha(name, alpha = 0.18) {
    const hex = ownerColor(name);
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  // Resolve any abbreviation, alt name, or canonical name → canonical owner
  function resolveOwner(abbrevOrName) {
    if (OWNER_ABBREVS[abbrevOrName]) return OWNER_ABBREVS[abbrevOrName];
    if (OWNER_ALT_NAMES[abbrevOrName]) return OWNER_ALT_NAMES[abbrevOrName];
    if (OWNERS_ALPHA.includes(abbrevOrName)) return abbrevOrName;
    return abbrevOrName;
  }

  // Resolve team name → canonical owner
  function teamToOwner(teamName) {
    return TEAM_TO_OWNER[teamName] || null;
  }

  // Get display name for any owner key, alias, or canonical name.
  // Direct dict lookup — does NOT call resolveOwner() so historical names
  // (Vlandis, Kelley) show their own display name instead of mapping to Baden.
  // ownerColor() still calls resolveOwner() so all transitional-slot owners
  // share the same Baden color.
  function ownerDisplayName(nameOrAlias) {
    return OWNER_DISPLAY[nameOrAlias] || nameOrAlias;
  }

  // ── Season filter bar helper ─────────────────────────────────────────────
  // Renders season pill buttons inside containerId.
  // onChange(activeSeasons) called on each change; [] means "All".
  // Returns { getActive() } object.
  function buildSeasonFilterBar(containerId, onChange) {
    var container = document.getElementById(containerId);
    if (!container) return { getActive: function() { return []; } };

    var seasons = ['21-22', '22-23', '23-24', '24-25', '25-26'];
    var active = []; // [] = All

    var html = '<div class="season-filter-bar">' +
      '<span class="season-filter-label">Season:</span>' +
      '<button class="sfb-btn active" data-sfb="all">All</button>';
    seasons.forEach(function(s) {
      html += '<button class="sfb-btn" data-sfb="' + s + '">' + s + '</button>';
    });
    html += '<button class="sfb-btn sfb-disabled" data-sfb="20-21" disabled' +
      ' data-tooltip="Coming Soon \u2014 2020-21 trades not yet graded">20-21</button>' +
      '</div>';

    container.innerHTML = html;

    function updateButtons() {
      container.querySelectorAll('.sfb-btn[data-sfb]').forEach(function(btn) {
        var val = btn.dataset.sfb;
        if (val === '20-21') return;
        if (val === 'all') {
          btn.classList.toggle('active', active.length === 0);
        } else {
          btn.classList.toggle('active', active.includes(val));
        }
      });
    }

    container.addEventListener('click', function(e) {
      var btn = e.target.closest('.sfb-btn');
      if (!btn || btn.disabled || btn.classList.contains('sfb-disabled')) return;
      var val = btn.dataset.sfb;
      if (val === 'all') {
        active = [];
      } else {
        var idx = active.indexOf(val);
        if (idx >= 0) {
          active.splice(idx, 1);
        } else {
          active.push(val);
        }
        if (active.length === 0) active = [];
      }
      updateButtons();
      if (typeof onChange === 'function') onChange(active.slice());
    });

    return { getActive: function() { return active.slice(); } };
  }

  // CSS var reader
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  // Chart.js global defaults
  function applyChartDefaults() {
    if (typeof Chart === 'undefined') return;
    const textColor   = cssVar('--text-primary')   || '#1a1a2e';
    const mutedColor  = cssVar('--text-muted')     || '#8892a4';
    const borderColor = cssVar('--border')         || '#e2e8f0';
    const bgCard      = cssVar('--bg-card')        || '#ffffff';

    Chart.defaults.color             = textColor;
    Chart.defaults.borderColor       = borderColor;
    Chart.defaults.font.family       = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    Chart.defaults.font.size         = 12;
    Chart.defaults.plugins.tooltip.backgroundColor = bgCard;
    Chart.defaults.plugins.tooltip.titleColor       = textColor;
    Chart.defaults.plugins.tooltip.bodyColor        = textColor;
    Chart.defaults.plugins.tooltip.borderColor      = borderColor;
    Chart.defaults.plugins.tooltip.borderWidth      = 1;
    Chart.defaults.plugins.tooltip.padding          = 10;
    Chart.defaults.plugins.tooltip.cornerRadius     = 6;
    Chart.defaults.plugins.tooltip.displayColors    = true;
    Chart.defaults.plugins.legend.labels.color      = textColor;
    Chart.defaults.plugins.legend.labels.boxWidth   = 12;
    Chart.defaults.plugins.legend.labels.padding    = 14;
    Chart.defaults.scale = Chart.defaults.scale || {};
    Chart.defaults.scale.grid = { color: borderColor };
    Chart.defaults.scale.ticks = Object.assign({}, Chart.defaults.scale.ticks, { color: mutedColor });
    ['category', 'linear', 'logarithmic', 'time', 'timeseries', 'radialLinear'].forEach(type => {
      try {
        const sd = Chart.defaults.scales[type] = Chart.defaults.scales[type] || {};
        sd.ticks = Object.assign({ padding: 3 }, sd.ticks, { color: mutedColor });
      } catch (_) {}
    });
  }

  document.addEventListener('themechange', applyChartDefaults);

  // Standard chart options
  function barOptions({ title, xLabel, yLabel, stacked = false } = {}) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: stacked },
        title: title ? { display: true, text: title, font: { size: 14, weight: '700' }, padding: { bottom: 12 } } : { display: false },
      },
      scales: {
        x: {
          stacked,
          title: xLabel ? { display: true, text: xLabel } : { display: false },
          grid: { display: false },
        },
        y: {
          stacked,
          beginAtZero: true,
          ticks: { precision: 0 },
          title: yLabel ? { display: true, text: yLabel } : { display: false },
        },
      },
    };
  }

  // Sortable table helper
  function makeSortable(tableEl) {
    const ths = tableEl.querySelectorAll('th[data-sort]');
    let currentCol = null, asc = true;

    ths.forEach(th => {
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => {
        const col = th.dataset.sort;
        if (col === currentCol) { asc = !asc; } else { asc = false; currentCol = col; }
        ths.forEach(h => h.classList.remove('sort-asc', 'sort-desc'));
        th.classList.add(asc ? 'sort-asc' : 'sort-desc');

        const tbody = tableEl.querySelector('tbody');
        const rows = Array.from(tbody.querySelectorAll('tr'));
        rows.sort((a, b) => {
          const av = a.dataset[col] ?? a.cells[th.cellIndex]?.textContent ?? '';
          const bv = b.dataset[col] ?? b.cells[th.cellIndex]?.textContent ?? '';
          const an = parseFloat(av), bn = parseFloat(bv);
          if (!isNaN(an) && !isNaN(bn)) return asc ? an - bn : bn - an;
          return asc ? av.localeCompare(bv) : bv.localeCompare(av);
        });
        rows.forEach(r => tbody.appendChild(r));
      });
    });
  }

  // JSON loader with cache
  const _cache = {};
  async function loadJSON(url) {
    if (_cache[url]) return _cache[url];
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
    const data = await res.json();
    _cache[url] = data;
    return data;
  }

  // ── Shared utility functions (extracted from inline scripts) ─────

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function parseOwner(str) {
    var parts = str.trim().split(/\s+/);
    return resolveOwner(parts[0]);
  }

  function parseAsset(str) {
    var parts = str.trim().split(/\s+/).slice(1);
    // Strip position prefix if present (e.g., "SF/PF Deandre Hunter" → "Deandre Hunter")
    if (parts.length > 1 && /^(?:PG|SG|SF|PF|C)(?:\/(?:PG|SG|SF|PF|C))?$/i.test(parts[0])) {
      parts = parts.slice(1);
    }
    return parts.join(' ');
  }

  function classifyPick(pickStr, holderOwner) {
    var isSwap = pickStr.includes('*') || pickStr.toLowerCase().includes('swap');
    if (isSwap) return 'pick-swap';
    var match = pickStr.match(/(?:1st|2nd)\s+Round\s+(\w+)/i);
    if (match) {
      var original = resolveOwner(match[1]);
      if (original === holderOwner) return 'pick-own';
      return 'pick-acquired';
    }
    return 'pick-own';
  }

  function statusBadge(status) {
    if (!status) return '';
    switch (status.toUpperCase()) {
      case 'ACTIVE':          return '<span class="badge badge-active">Active</span>';
      case 'RESERVE':         return '<span class="badge badge-reserve">Reserve</span>';
      case 'INJURED_RESERVE': return '<span class="badge badge-ir">IR</span>';
      case 'MINORS':          return '<span class="badge badge-minors">Minors</span>';
      default:                return '<span class="badge">' + escapeHtml(status) + '</span>';
    }
  }

  function normalizeName(str) {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  // Expose public API
  Object.assign(YK, {
    OWNERS_ALPHA,
    OWNER_ABBREVS,
    OWNER_ALT_NAMES,
    OWNER_COLORS_RAW,
    OWNER_DISPLAY,
    TEAM_TO_OWNER,
    ownerColor,
    ownerColorAlpha,
    resolveOwner,
    teamToOwner,
    ownerDisplayName,
    buildSeasonFilterBar,
    cssVar,
    applyChartDefaults,
    barOptions,
    makeSortable,
    loadJSON,
    escapeHtml,
    parseOwner,
    parseAsset,
    classifyPick,
    statusBadge,
    normalizeName,
  });

  if (typeof Chart !== 'undefined') {
    applyChartDefaults();
  } else {
    document.addEventListener('DOMContentLoaded', applyChartDefaults);
  }

})(window.YK);

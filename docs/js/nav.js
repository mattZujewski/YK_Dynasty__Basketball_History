/**
 * nav.js — Navigation bar injection + dark mode
 * YK Dynasty Basketball
 */

(function () {
  'use strict';

  const saved = localStorage.getItem('yk_theme');
  if (saved === 'dark') document.documentElement.classList.add('dark');

  function buildNav() {
    const path       = window.location.pathname;
    const isIndex    = path.endsWith('index.html') || path.endsWith('/') || path === '';
    const isTrade    = path.includes('trade.html') && !path.includes('trade-leaderboard.html');
    const isPicks    = path.includes('picks.html');
    const isStandings= path.includes('standings.html');
    const isRoster   = path.includes('roster.html');
    const isTeam     = path.includes('team.html');
    const isPlayers  = path.includes('players.html');
    const isRankings = path.includes('rankings.html');
    const isStats    = path.includes('stats.html');
    const isGrades   = path.includes('grades.html');
    const isTradeLeaderboard = path.includes('trade-leaderboard.html');
    const isTvot       = path.includes('trade-value-over-time.html');
    const isTradeCards = path.includes('trade-cards.html');
    const isAnyTrade   = isTrade || isGrades || isTradeLeaderboard || isTvot || isTradeCards;

    function activeClass(flag) { return flag ? ' nav-active' : ''; }

    const base = (() => {
      const parts = path.split('/').filter(Boolean);
      if (parts[parts.length - 1] && parts[parts.length - 1].includes('.html')) parts.pop();
      return parts.length === 0 ? '' : './';
    })();

    const html = `
<nav id="dotp-nav" aria-label="Main navigation">
  <a class="nav-logo" href="${base}index.html">\u{1F3C0} YK Dynasty</a>
  <div class="nav-links">
    <a class="nav-link${activeClass(isIndex)}"     href="${base}index.html">Home</a>
    <a class="nav-link${activeClass(isStandings)}" href="${base}standings.html">Standings</a>
    <div class="nav-dropdown-wrap">
      <button class="nav-dropdown-btn${activeClass(isAnyTrade)}">Trades <span style="font-size:0.7em;opacity:0.7">&#x25BC;</span></button>
      <div class="nav-dropdown-menu">
        <a class="${isTrade ? 'nav-active' : ''}" href="${base}trade.html">&#x1F4C4; Trade Log</a>
        <a class="${isGrades ? 'nav-active' : ''}" href="${base}grades.html">&#x1F393; Trade Grades</a>
        <a class="${isTradeCards ? 'nav-active' : ''}" href="${base}trade-cards.html">&#x1F0CF; Trade Cards</a>
        <a class="${isTvot ? 'nav-active' : ''}" href="${base}trade-value-over-time.html">&#x23F3; TVOT</a>
        <a class="${isTradeLeaderboard ? 'nav-active' : ''}" href="${base}trade-leaderboard.html">&#x1F4CA; Trade Leaderboard</a>
      </div>
    </div>
    <a class="nav-link${activeClass(isRoster)}"    href="${base}roster.html">Rosters</a>
    <a class="nav-link${activeClass(isPicks)}"     href="${base}picks.html">Picks</a>
    <a class="nav-link${activeClass(isTeam)}"      href="${base}team.html">Teams</a>
    <a class="nav-link${activeClass(isPlayers)}"   href="${base}players.html">Players</a>
    <a class="nav-link${activeClass(isRankings)}"  href="${base}rankings.html">Rankings</a>
    <a class="nav-link${activeClass(isStats)}"     href="${base}stats.html">Stats</a>
  </div>
  <span class="nav-spacer"></span>
  <span class="nav-meta" id="nav-data-date">2025-26</span>
  <button id="dark-mode-toggle" aria-label="Toggle dark mode">\u{1F319}</button>
  <button class="nav-hamburger" aria-label="Toggle menu" aria-expanded="false">&#x2630;</button>
</nav>`;

    const container = document.createElement('div');
    container.innerHTML = html.trim();
    const nav = container.firstChild;
    document.body.insertBefore(nav, document.body.firstChild);

    function updateToggle() {
      const btn = document.getElementById('dark-mode-toggle');
      if (btn) btn.textContent = document.documentElement.classList.contains('dark') ? '\u2600\uFE0F' : '\u{1F319}';
    }
    updateToggle();

    document.getElementById('dark-mode-toggle')?.addEventListener('click', () => {
      const isDark = document.documentElement.classList.toggle('dark');
      localStorage.setItem('yk_theme', isDark ? 'dark' : 'light');
      updateToggle();
      document.dispatchEvent(new CustomEvent('themechange', { detail: { dark: isDark } }));
    });

    // ── Mobile nav ────────────────────────────────────────────────────────
    const hamburger  = nav.querySelector('.nav-hamburger');
    const navLinks   = nav.querySelector('.nav-links');
    const tradesBtn  = nav.querySelector('.nav-dropdown-btn');
    const tradesMenu = nav.querySelector('.nav-dropdown-menu');
    const tradeChevron = tradesBtn ? tradesBtn.querySelector('span') : null;

    if (hamburger) {
      hamburger.addEventListener('click', function() {
        const isOpen = navLinks.classList.toggle('mobile-open');
        hamburger.textContent = isOpen ? '\u00D7' : '\u2630'; // ✕ or ☰
        hamburger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        if (!isOpen && tradesMenu) {
          tradesMenu.classList.remove('mobile-open');
          if (tradeChevron) tradeChevron.textContent = '\u25BC';
        }
      });
    }

    if (tradesBtn && tradesMenu) {
      tradesBtn.addEventListener('click', function(e) {
        if (window.innerWidth > 768) return; // desktop: hover handles it
        e.stopPropagation();
        const isOpen = tradesMenu.classList.toggle('mobile-open');
        if (tradeChevron) tradeChevron.textContent = isOpen ? '\u25B2' : '\u25BC';
      });
    }

    // Close mobile nav when any link is tapped
    if (navLinks) {
      navLinks.addEventListener('click', function(e) {
        if (window.innerWidth > 768) return;
        const link = e.target.closest('a');
        if (link) {
          navLinks.classList.remove('mobile-open');
          if (tradesMenu) tradesMenu.classList.remove('mobile-open');
          if (hamburger) hamburger.textContent = '\u2630';
        }
      });
    }

    // ── Footer ────────────────────────────────────────────────────────────
    if (!document.getElementById('yk-footer')) {
      var footer = document.createElement('footer');
      footer.id = 'yk-footer';
      footer.innerHTML = '<a href="' + base + 'references.html">About This Analysis</a>' +
        '<span style="margin:0 12px;opacity:0.4">·</span>' +
        '<span>YK Dynasty Basketball</span>';
      document.body.appendChild(footer);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildNav);
  } else {
    buildNav();
  }
})();

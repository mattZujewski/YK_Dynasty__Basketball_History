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
    const isTrade    = path.includes('trade.html');
    const isPicks    = path.includes('picks.html');
    const isStandings= path.includes('standings.html');
    const isRoster   = path.includes('roster.html');
    const isTeam     = path.includes('team.html');

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
    <a class="nav-link${activeClass(isTrade)}"     href="${base}trade.html">Trades</a>
    <a class="nav-link${activeClass(isRoster)}"    href="${base}roster.html">Rosters</a>
    <a class="nav-link${activeClass(isPicks)}"     href="${base}picks.html">Picks</a>
    <a class="nav-link${activeClass(isTeam)}"      href="${base}team.html">Teams</a>
  </div>
  <span class="nav-spacer"></span>
  <span class="nav-meta" id="nav-data-date">2025-26</span>
  <button id="dark-mode-toggle" aria-label="Toggle dark mode">\u{1F319}</button>
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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildNav);
  } else {
    buildNav();
  }
})();

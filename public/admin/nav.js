/**
 * Shared Admin Navigation Component
 *
 * Injects a consistent top nav bar into every admin page.
 * Self-contained: does not depend on app.js being loaded first.
 *
 * Usage: include <script src="nav.js"></script> in any admin page,
 * then call AdminNav.init('dashboard'|'analytics'|'jobs') after DOM ready.
 */

(function () {
  const TOKEN_KEY = 'admin_jwt_token';

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
  }

  function doLogout() {
    clearToken();
    window.location.href = '/admin';
  }

  function injectStyles() {
    if (document.getElementById('admin-nav-styles')) return;
    const style = document.createElement('style');
    style.id = 'admin-nav-styles';
    style.textContent = `
      .admin-nav {
        background: #2c3e50;
        color: white;
        display: flex;
        align-items: center;
        padding: 0 20px;
        height: 56px;
        box-shadow: 0 2px 6px rgba(0,0,0,0.2);
        position: sticky;
        top: 0;
        z-index: 1000;
        gap: 0;
      }
      .admin-nav .nav-brand {
        display: flex;
        align-items: center;
        gap: 10px;
        font-weight: 700;
        font-size: 16px;
        color: white;
        margin-right: 30px;
        text-decoration: none;
        flex-shrink: 0;
      }
      .admin-nav .nav-badge {
        background: #3498db;
        color: white;
        border-radius: 6px;
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        font-weight: 700;
      }
      .admin-nav .nav-links {
        display: flex;
        align-items: center;
        gap: 4px;
        flex: 1;
      }
      .admin-nav .nav-link {
        color: rgba(255,255,255,0.75);
        text-decoration: none;
        padding: 8px 14px;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 500;
        transition: all 0.15s ease;
        white-space: nowrap;
      }
      .admin-nav .nav-link:hover {
        background: rgba(255,255,255,0.12);
        color: white;
      }
      .admin-nav .nav-link.active {
        background: #3498db;
        color: white;
      }
      .admin-nav .nav-logout {
        background: rgba(255,255,255,0.1);
        color: rgba(255,255,255,0.85);
        border: none;
        padding: 7px 14px;
        border-radius: 6px;
        font-size: 14px;
        cursor: pointer;
        transition: all 0.15s ease;
        flex-shrink: 0;
        margin-left: 10px;
      }
      .admin-nav .nav-logout:hover {
        background: rgba(220,53,69,0.7);
        color: white;
      }
      body {
        padding-top: 0 !important;
      }
    `;
    document.head.appendChild(style);
  }

  function buildNav(activePage) {
    injectStyles();

    const pages = [
      { id: 'dashboard', label: 'Dashboard', href: '/admin' },
      { id: 'analytics', label: 'Analytics', href: '/admin/analytics.html' },
      { id: 'jobs', label: 'Jobs', href: '/admin/jobs.html' },
    ];

    const linksHTML = pages.map(p =>
      `<a href="${p.href}" class="nav-link${activePage === p.id ? ' active' : ''}">${p.label}</a>`
    ).join('');

    const nav = document.createElement('nav');
    nav.className = 'admin-nav';
    nav.id = 'admin-nav';
    nav.innerHTML = `
      <a href="/admin" class="nav-brand">
        <span class="nav-badge">S</span>
        Sneaker Admin
      </a>
      <div class="nav-links">${linksHTML}</div>
      <button class="nav-logout" id="navLogoutBtn">Logout</button>
    `;

    document.body.insertBefore(nav, document.body.firstChild);

    document.getElementById('navLogoutBtn').addEventListener('click', doLogout);
  }

  /**
   * Initialize the nav bar for a given page.
   * @param {string} activePage - 'dashboard', 'analytics', or 'jobs'
   */
  function init(activePage) {
    if (!getToken()) return;
    if (document.getElementById('admin-nav')) return; // already injected
    buildNav(activePage);
  }

  window.AdminNav = { init, doLogout, getToken, clearToken };
})();

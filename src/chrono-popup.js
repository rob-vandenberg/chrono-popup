import { LitElement, html, css } from 'https://unpkg.com/lit@2.0.0/index.js?module';
import { styleMap }              from 'https://unpkg.com/lit@2.0.0/directives/style-map.js?module';

// chrono-popup.js
//
// NOT a card in the "place it on a dashboard" sense. There is no
// window.customCards entry, no getConfigElement(), no config schema for a
// placed instance - none of that applies here.
//
// It is a JS resource: loading it registers one singleton overlay host on
// document.body and one document-level "ll-custom" listener. Any tap_action
// (fire-dom-event) anywhere on any card can then open a popup that renders
// a Home Assistant *subview* - a dashboard view the user designs themselves
// in the normal HA dashboard editor - inline inside a lightweight window
// frame (header, title, close button). This exists to replace the
// hand-assembled layout-card/conditional/grid-area YAML people currently
// have to write to get a custom popup layout via browser_mod.popup, with
// "design it visually as a real view, then point the popup at it".
//
// All view types (panel, masonry, sections, sidebar) are supported -
// layout is delegated entirely to HA's own <hui-view> element rather than
// reimplemented here, the same technique used by the third-party
// embedded-view-card. <hui-view> is an internal HA frontend component,
// not a documented/stable public API - subject to change by HA core.
//
// View visibility rules (view.visible / visibility / users) are respected
// before rendering, same as HA's own dashboard: a view hidden from the
// current user stays hidden here too.
//
// Usage, from any card's tap_action:
//
//   tap_action:
//     action: fire-dom-event
//     chrono-popup:
//       data:
//         title: "Hello, world!"
//         view: "/dashboard-test/uren-panel"
//         dismissable: true
//         styles:
//           width: 640px
//           height: 580px
//           background: "#000000"
//           border-radius: 50px
//
// `view` is "/<dashboard url_path>/<view path>". Both segments are
// required in v1 - the default (unnamed) dashboard is not yet supported,
// only dashboards with an explicit url_path.
//
// Recognized top-level keys: title, view, styles, dismissable. Anything
// else is not read - console.warn()'d instead of failing silently. All
// visual sizing/appearance (including what used to be named width/height/
// background/radius shorthand fields) lives under styles: now.

// ─── Version ────────────────────────────────────────────────────────────
const CARD_VERSION = '0.1.6';

// ─── Version History ────────────────────────────────────────────────────
// v0.1.6: Removed width/height/background/radius as named top-level keys.
//         All CSS, including these, now lives under styles: only. The
//         four values still default to the same auto/580px/90vw/etc.
//         base, just as fixed values in the styleMap() call rather than
//         reading from _opts. Added console.warn() for any unrecognized
//         top-level key (recognized: title, view, styles, dismissable) -
//         previously these failed silently.
// v0.1.5: Default popup sizing changed from fixed width:640px/height:480px
//         to width:auto/height:auto with min-width:580px, max-width:90vw,
//         min-height:533px, max-height:90vh, so the popup fits its
//         content by default. data.width/data.height (px shorthand) and
//         styles (all six properties individually) still override.
// v0.1.4: Added "styles" - a flat map of arbitrary CSS properties (incl.
//         "--custom-properties") applied to the popup frame, spread on
//         top of the width/height/background/radius defaults so user
//         values always win on conflict.
// v0.1.3: Renamed the "page" config field to "view" - more accurately
//         describes what it points to (a dashboard view, disambiguated
//         by its dashboard). _resolvePage -> _resolveView. No behavior
//         change beyond the field name.
// v0.1.2: Renamed from chrono-popup-card to chrono-popup - it's a JS
//         resource, not a placeable card (no window.customCards entry,
//         no config schema for an instance). No functional changes.
// v0.1.1: Replaced panel-only <hui-card> rendering with <hui-view>, so all
//         view types (panel, masonry, sections, sidebar) are supported.
//         Added per-user view visibility check (view.visible/visibility/
//         users), ported from the same rule shape HA's own dashboard and
//         embedded-view-card use.
// v0.1.0: Initial version. fire-dom-event trigger, lovelace/config fetch,
//         panel-view-only rendering via <hui-card>, close via button /
//         backdrop click / Escape.

console.info(
  `%c CHRONO-%cPOPUP %c v${CARD_VERSION} `,
  'background-color: #101010; color: #FFFFFF; font-weight: bold; padding: 2px 0 2px 4px; border-radius: 3px 0 0 3px;',
  'background-color: #101010; color: #4676d3; font-weight: bold; padding: 2px 0 2px 0;',
  'background-color: #1E1E1E; color: #FFFFFF; font-weight: bold; padding: 2px 4px; border-radius: 0 3px 3px 0;'
);

const EVENT_KEY = 'chrono-popup';

// ─── Host ───────────────────────────────────────────────────────────────
// One instance lives on document.body for the lifetime of the page. It is
// not addressed by id/entity - it simply reacts to whichever "chrono-popup"
// ll-custom event most recently arrived. Only one popup is shown at a
// time in v1; a new trigger while one is already open replaces it.
class ChronoPopupHost extends LitElement {
  static properties = {
    _open:    { state: true },
    _loading: { state: true },
    _error:   { state: true },
    _opts:    { state: true }, // { title, dismissable, styles } - width/height/background/radius are fixed defaults, override only via styles
    _view:    { state: true }, // { lovelace, index, viewConfig } for <hui-view>, once resolved
  };

  constructor() {
    super();
    this._open = false;
    this._loading = false;
    this._error = null;
    this._opts = {};
    this._view = null;
    this._onKeydown = this._onKeydown.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('keydown', this._onKeydown);
  }

  disconnectedCallback() {
    document.removeEventListener('keydown', this._onKeydown);
    super.disconnectedCallback();
  }

  _onKeydown(ev) {
    if (ev.key === 'Escape' && this._open) this.close();
  }

  // Singleton hass access. This element is not part of any dashboard's
  // card tree, so HA never sets .hass on it directly - the standard
  // workaround for singleton/global elements is reading it off the live
  // <home-assistant> element in the DOM at the moment it's actually
  // needed, rather than trying to keep a subscription alive.
  _getHass() {
    const ha = document.querySelector('home-assistant');
    return ha ? ha.hass : undefined;
  }

  static KNOWN_KEYS = ['title', 'view', 'styles', 'dismissable'];

  async open(data = {}) {
    for (const key of Object.keys(data)) {
      if (!ChronoPopupHost.KNOWN_KEYS.includes(key)) {
        console.warn(
          `chrono-popup: unrecognized key "${key}" in event_data (view: "${data.view || '?'}"). ` +
          `Recognized keys: ${ChronoPopupHost.KNOWN_KEYS.join(', ')}. CSS goes under "styles:".`
        );
      }
    }

    this._opts = {
      title: data.title ?? '',
      dismissable: data.dismissable !== false, // backdrop-click-to-close, on by default
      styles: (data.styles && typeof data.styles === 'object') ? data.styles : {},
    };
    this._error = null;
    this._view = null;
    this._open = true;
    this._loading = true;

    try {
      this._view = await this._resolveView(data.view);
    } catch (err) {
      this._error = err.message || String(err);
    } finally {
      this._loading = false;
    }
  }

  close() {
    this._open = false;
  }

  async _resolveView(view) {
    if (!view || typeof view !== 'string') {
      throw new Error('chrono-popup: "view" is required, e.g. "/my-dashboard/my-view"');
    }
    const parts = view.split('/').filter(Boolean);
    if (parts.length < 2) {
      throw new Error(
        `chrono-popup: "view" must include both a dashboard and a view, e.g. "/my-dashboard/my-view" (got "${view}")`
      );
    }
    const [dashboardPath, viewPath] = parts;

    const hass = this._getHass();
    if (!hass) {
      throw new Error('chrono-popup: could not access hass - is Home Assistant fully loaded?');
    }

    let config;
    try {
      config = await hass.callWS({ type: 'lovelace/config', url_path: dashboardPath });
    } catch (err) {
      throw new Error(`chrono-popup: could not load dashboard "${dashboardPath}" (${err.message || err})`);
    }

    const views = Array.isArray(config.views) ? config.views : [];
    const viewConfig = views.find((v) => v.path === viewPath);
    if (!viewConfig) {
      throw new Error(`chrono-popup: view "${viewPath}" not found in dashboard "${dashboardPath}"`);
    }
    if (!this._isViewVisibleToUser(viewConfig, hass)) {
      throw new Error(`chrono-popup: view "${viewPath}" is not visible to the current user`);
    }

    return {
      lovelace: { config, urlPath: dashboardPath, editMode: false },
      index: views.indexOf(viewConfig),
      viewConfig,
    };
  }

  // Same rule shape HA's own dashboard (and embedded-view-card) use:
  // view.visible / visibility / users, each entry a user id string or an
  // object carrying one. No rules present -> visible to everyone. Can't
  // determine the current user id -> fail open, matching HA's own
  // behavior rather than blocking access we can't actually evaluate.
  _isViewVisibleToUser(view, hass) {
    const uid = hass?.user?.id || null;
    if (!uid || !view) return true;

    const raw =
      (Array.isArray(view.visible) && view.visible.length ? view.visible : null) ||
      (Array.isArray(view.visibility) && view.visibility.length ? view.visibility : null) ||
      (Array.isArray(view.users) && view.users.length ? view.users : null);

    if (!raw) return true;

    for (const r of raw) {
      if (typeof r === 'string' && r === uid) return true;
      if (r && typeof r === 'object') {
        if (typeof r.user === 'string' && r.user === uid) return true;
        if (Array.isArray(r.user) && r.user.includes(uid)) return true;
        if (Array.isArray(r.users) && r.users.includes(uid)) return true;
      }
    }
    return false;
  }

  static styles = css`
    :host {
      display: contents;
    }
    .backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .frame {
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
      max-width: 96vw;
      max-height: 96vh;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 8px 8px 16px;
      flex: 0 0 auto;
      background: rgba(0, 0, 0, 0.15);
    }
    .title {
      font-size: 1.1em;
      font-weight: 500;
      color: var(--primary-text-color, #fff);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .close-btn {
      background: none;
      border: none;
      cursor: pointer;
      color: var(--primary-text-color, #fff);
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
    }
    .close-btn:hover {
      background: rgba(255, 255, 255, 0.1);
    }
    .close-btn svg {
      width: 20px;
      height: 20px;
      fill: currentColor;
    }
    .body {
      position: relative;
      flex: 1 1 auto;
      overflow: auto;
    }
    .body hui-view {
      display: contents;
      margin: 0;
      padding: 0;
    }
    .status {
      padding: 24px;
      color: var(--primary-text-color, #fff);
    }
    .status.error {
      color: var(--error-color, #ff5252);
    }
  `;

  render() {
    if (!this._open) return html``;

    const { title, dismissable, styles } = this._opts;

    return html`
      <div
        class="backdrop"
        @click=${(ev) => {
          if (dismissable && ev.target === ev.currentTarget) this.close();
        }}
      >
        <div
          class="frame"
          style=${styleMap({
            width: 'auto',
            minWidth: '580px',
            maxWidth: '90vw',
            height: 'auto',
            minHeight: '533px',
            maxHeight: '90vh',
            background: 'var(--card-background-color, #1c1c1c)',
            borderRadius: '12px',
            ...styles,
          })}
        >
          <div class="header">
            <span class="title">${title}</span>
            <button class="close-btn" @click=${() => this.close()} aria-label="Close">
              <svg viewBox="0 0 24 24">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
          </div>
          <div class="body">
            ${this._loading ? html`<div class="status">Loading…</div>` : ''}
            ${this._error ? html`<div class="status error">${this._error}</div>` : ''}
            ${!this._loading && !this._error && this._view
              ? html`<hui-view
                  .hass=${this._getHass()}
                  .narrow=${false}
                  .lovelace=${this._view.lovelace}
                  .index=${this._view.index}
                  .isStrategyView=${false}
                  .viewConfig=${this._view.viewConfig}
                ></hui-view>`
              : ''}
          </div>
        </div>
      </div>
    `;
  }
}

if (!customElements.get('chrono-popup-host')) {
  customElements.define('chrono-popup-host', ChronoPopupHost);
}

// ─── Singleton wiring ───────────────────────────────────────────────────
// Runs once per module load. Guards against duplicate resource loads the
// same way the rest of the chrono-* family does (customElements.get check
// above already covers the element definition; this covers the listener
// and the DOM node).
if (!window.__chronoPopupHostInstalled) {
  window.__chronoPopupHostInstalled = true;

  const host = document.createElement('chrono-popup-host');
  document.body.appendChild(host);

  document.addEventListener('ll-custom', (ev) => {
    const detail = ev.detail && ev.detail[EVENT_KEY];
    if (!detail) return;
    host.open(detail.data || {});
  });
}

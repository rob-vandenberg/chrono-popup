import { LitElement, html, css } from 'https://unpkg.com/lit@2.0.0/index.js?module';
import { styleMap }              from 'https://unpkg.com/lit@2.0.0/directives/style-map.js?module';
import { subscribeEntities }     from 'https://unpkg.com/home-assistant-js-websocket@9.6.0/dist/index.js';

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
const CARD_VERSION = '0.1.16';

// ─── Version History ────────────────────────────────────────────────────
// v0.1.16: title font-size 1.25rem -> 1.4rem, compensating for a 14px
//          document root (14 * 1.4 = ~19.6px, targeting 20px). Tied to
//          this specific root size - revisit if it doesn't hold on
//          other installs.
// v0.1.15: border-radius default 12px -> var(--ha-dialog-border-radius,
//          28px), matching browser_mod's popup dialog.
// v0.1.14: Title styling matched to MDC dialog title / browser_mod:
//          font-size 1.25em -> 1.25rem, added line-height 2rem and
//          letter-spacing 0.0125em.
// v0.1.13: Header restyle - close button moved to top-left (before title
//          in markup), title font-size 1.1em -> 1.25em, header layout
//          space-between -> flex-start+gap so title sits right after the
//          button, header background rgba(0,0,0,0.15) -> theme-aware
//          var(--card-background-color).
// v0.1.12: New baseline provided by user.

// ─── Version History ────────────────────────────────────────────────────
// v0.1.11: Reverted 0.1.9's imperative <hui-view> construction back to
//          the simpler declarative binding - tested and confirmed 0.1.10
//          (the mount-point fix) was the actual cause, 0.1.9 wasn't
//          needed. Removed updated(), _attachedView, .view-container.
// v0.1.10: Fixed the thermostat card (and likely other built-in cards
//          relying on similarly deep, lazily-registered components)
//          failing to render inside the popup. Root cause: the popup
//          host lived on document.body, outside the scoped custom
//          element registry boundary ha-panel-lovelace establishes for
//          real Lovelace content - confirmed via HA's actual source for
//          the failing component (ha-state-control-climate-temperature),
//          which showed .hass itself was undefined on it despite being
//          set correctly on its parent. The host now relocates into
//          ha-panel-lovelace's own shadow root on open(), so everything
//          we render shares the same registry scope as a normal
//          dashboard page. KNOWN RISK, not yet confirmed either way:
//          the backdrop's position:fixed could theoretically be trapped
//          by a transformed ancestor somewhere in that tree - watch for
//          mispositioning/clipping specifically, separate from this fix.
// v0.1.9: Fixed a race where some cards (confirmed: the thermostat card's
//         +/- stepper control) could throw on first render because .hass
//         wasn't guaranteed to be set before the element connected and
//         rendered. <hui-view> is now built imperatively - created, every
//         property set directly, then appended to the DOM - mirroring
//         embedded-view-card's proven sequence, instead of being bound
//         declaratively inside the html`` template where creation and
//         property-setting happen as part of the same commit.
// v0.1.8: Fixed content not updating live (e.g. conditional cards not
//         reacting to a toggle) - the popup sat outside Lovelace's normal
//         hass-propagation tree, so it only ever had a snapshot from
//         open() time. Now subscribes to subscribeEntities (from
//         home-assistant-js-websocket, the same batched mechanism HA's
//         own frontend uses) while open, and pushes a fresh hass onto the
//         live <hui-view> on each update. Unsubscribes on close.
// v0.1.7: Extracted inline hardcoded defaults into named constants near
//         the top of the file (KNOWN_DATA_KEYS, DEFAULT_STYLES), matching
//         the DEFAULT_CONFIG/DEFAULT_FIELD convention used across the
//         chrono-* family. No behavior change - values are unchanged,
//         only where they're defined.
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

// ─── Constants ────────────────────────────────────────────────────────────

const EVENT_KEY = 'chrono-popup';

const KNOWN_DATA_KEYS = ['title', 'view', 'styles', 'dismissable'];

const DEFAULT_STYLES = {
  width:        'auto',
  minWidth:     '580px',
  maxWidth:     '90vw',
  height:       'auto',
  minHeight:    '533px',
  maxHeight:    '90vh',
  background:   'var(--card-background-color, #1c1c1c)',
  borderRadius: 'var(--ha-dialog-border-radius, 28px)',
};

// Locates ha-panel-lovelace's own shadow root - the scoped custom element
// registry boundary the whole real Lovelace tree (hui-view, hui-section,
// hui-card, and every card/control inside them) is built within. HA's
// frontend gives each Lovelace panel instance its own isolated registry
// via a scoped-custom-element-registry mechanism (visible directly in
// browser stack traces as scoped-custom-element-registry.ts) - elements
// created outside that boundary, like our popup was on document.body,
// don't share it, which is what caused specific built-in components
// (confirmed: the thermostat card's temperature stepper) to fail while
// simpler third-party cards worked fine.
function findLovelacePanelRoot() {
  return document
    .querySelector('home-assistant')?.shadowRoot
    ?.querySelector('home-assistant-main')?.shadowRoot
    ?.querySelector('ha-panel-lovelace')?.shadowRoot || null;
}

// ─── Host ───────────────────────────────────────────────────────────────
// One instance is created on document.body initially, then relocated into
// ha-panel-lovelace's own shadow root on first open() - see
// findLovelacePanelRoot() above for why. It is
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
    this._hassUnsub = null; // unsubscribe fn for the live entity-updates subscription, while a popup is open
    this._onKeydown = this._onKeydown.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('keydown', this._onKeydown);
  }

  disconnectedCallback() {
    document.removeEventListener('keydown', this._onKeydown);
    this._unsubscribeFromUpdates();
    super.disconnectedCallback();
  }

  _onKeydown(ev) {
    if (ev.key === 'Escape' && this._open) this.close();
  }

  // Singleton hass access. This element is not part of any dashboard's
  // card tree, so HA never sets .hass on it directly - the standard
  // workaround for singleton/global elements is reading it off the live
  // <home-assistant> element in the DOM whenever it's needed. This alone
  // only gives us a snapshot at open() time, though - see
  // _subscribeToUpdates below for how we stay live after that.
  _getHass() {
    const ha = document.querySelector('home-assistant');
    return ha ? ha.hass : undefined;
  }

  // Placed cards get a fresh .hass pushed to them automatically on every
  // state update, because Lovelace propagates it down the card tree. We
  // sit outside that tree, so nothing does this for us - a popup opened
  // once and never touched again would keep showing whatever hass looked
  // like at open() time forever, breaking things like conditional cards.
  //
  // subscribeEntities is the same batched entity-update mechanism HA's
  // own frontend entrypoint uses to build hass.states in the first place
  // (see home-assistant-js-websocket) - it collapses bursts of
  // simultaneous state_changed events into one callback rather than
  // firing once per raw event. We use it purely as a "something changed"
  // signal; on each callback we just re-read the real, already-updated
  // hass from _getHass() and push it onto the live <hui-view>, rather
  // than reconstructing our own separate state tree.
  async _subscribeToUpdates(hass) {
    this._unsubscribeFromUpdates();
    if (!hass?.connection) return;
    try {
      this._hassUnsub = await subscribeEntities(hass.connection, () => {
        const huiView = this.renderRoot?.querySelector('hui-view');
        if (huiView) huiView.hass = this._getHass();
      });
    } catch (err) {
      console.warn('chrono-popup: could not subscribe to entity updates - popup content will not update live', err);
    }
  }

  _unsubscribeFromUpdates() {
    if (typeof this._hassUnsub === 'function') {
      try { this._hassUnsub(); } catch (err) { /* connection already gone - nothing to clean up */ }
    }
    this._hassUnsub = null;
  }

  async open(data = {}) {
    // Relocate into ha-panel-lovelace's own shadow root, if we can find
    // it and aren't already there - see findLovelacePanelRoot() above.
    // Done here rather than at module-load time because this resource
    // can load before any Lovelace panel exists yet; by the time open()
    // runs, the trigger itself is a card on that panel, so it's
    // guaranteed to exist. Falls back to wherever we already are
    // (document.body, from initial singleton setup) if not found.
    const lovelaceRoot = findLovelacePanelRoot();
    if (lovelaceRoot && this.parentNode !== lovelaceRoot) {
      lovelaceRoot.appendChild(this);
    }

    for (const key of Object.keys(data)) {
      if (!KNOWN_DATA_KEYS.includes(key)) {
        console.warn(
          `chrono-popup: unrecognized key "${key}" in event_data (view: "${data.view || '?'}"). ` +
          `Recognized keys: ${KNOWN_DATA_KEYS.join(', ')}. CSS goes under "styles:".`
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

    const hass = this._getHass();
    if (hass) this._subscribeToUpdates(hass);

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
    this._unsubscribeFromUpdates();
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
      justify-content: flex-start;
      gap: 8px;
      padding: 8px 8px 8px 16px;
      flex: 0 0 auto;
      background: var(--card-background-color);
    }
    .title {
      font-size: 1.4rem;
      line-height: 2rem;
      letter-spacing: 0.0125em;
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
            ...DEFAULT_STYLES,
            ...styles,
          })}
        >
          <div class="header">
            <button class="close-btn" @click=${() => this.close()} aria-label="Close">
              <svg viewBox="0 0 24 24">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
            <span class="title">${title}</span>
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

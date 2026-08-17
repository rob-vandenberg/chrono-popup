import { LitElement, html, css } from 'https://unpkg.com/lit@2.0.0/index.js?module';
import { subscribeEntities }     from 'https://unpkg.com/home-assistant-js-websocket@9.6.0/dist/index.js';

// Chrono Popup is a Home Assistant resource (not a dashboard card) that
// lets you show any dashboard view or subview inside a popup window. You
// open it by attaching a fire-dom-event action to something like
// tap_action, pointing it at the view you want to show. This way you can
// design your popups visually, using the normal Home Assistant dashboard
// editor, instead of writing custom popup layout YAML by hand. Example:
// 
//  tap_action:
//    action: fire-dom-event
//    chrono-popup:
//      data:
//        title: Living room
//        view: /dashboard-popups/thermostat

// ─── Version ────────────────────────────────────────────────────────────
const CARD_VERSION = '1.4.56';

// ─── Version History ────────────────────────────────────────────────────
// v1.4.56: Fixed view theme not applying inside popup - wrapped <hui-view> in HA's own <hui-view-container>, passing viewConfig.theme, matching native dashboard behavior.
// v1.3.54: Comment-only pass - condensed the intro block and every version-history entry to one line each; no code/logic changes.
// v1.3.52: Removed .frame padding; increased hui-sections-view default padding (wrapper/container) to 16px.
// v1.3.51: Added --frame-padding; made hui-sections-view default padding user-adjustable via --sections-wrapper-padding/--sections-container-padding (set under "body").
// v1.3.50: Migrated styles: from styleMap to adoptedStyleSheets (CSSStyleSheet + static styles = css, var()-driven), matching chrono-hvac-card/chrono-slider-card.
// v1.2.48: Added default padding for hui-sections-view's internal .wrapper/.container via a scoped adoptedStyleSheets injection.
// v1.2.47: DEFAULT_FRAME_STYLES.minWidth 480px -> 240px, for narrower popups on mobile.
// v1.2.46: Fixed title misalignment under content-box sizing; added HEADER_CONTENT_BOX_HEIGHT_PX; close button inset 19px -> 18px.
// v1.2.45: Decoupled header total height from the button/title alignment point via BUTTON_CENTER_OFFSET_PX; close button inset 16px -> 19px.
// v1.2.44: Fixed header side padding being reserved on both sides regardless of alignment; added computeHeaderPadding().
// v1.2.43: Fixed title misalignment vs. close button; extracted CLOSE_BUTTON_SIZE_PX/CLOSE_BUTTON_INSET_TOP_PX; derived HEADER_MIN_HEIGHT from them.
// v1.2.42: Fixed close button being covered by body content; added z-index: 999.
// v1.2.41: Added close-align/title-align options; close button moved out of .header to independent absolute positioning.
// v0.1.40: Modified default padding for sections views.
// v0.1.35: Popup now anchors from the top instead of centering vertically.
// v0.1.34: Added validation for styles.target values and for extra view path segments.
// v0.1.30: Replaced panel/non-panel padding with per-view-type padding constants.
// v0.1.28: Adjusted panel/non-panel body padding and DEFAULT_FRAME_STYLES min-width/min-height.
// v0.1.27: Extracted the 16px panel-padding literal into named constants (no behavior change).
// v0.1.26: .body gets default 16px padding only for panel-type views.
// v0.1.25: Extracted remaining default visual values into DEFAULT_*_STYLES constants, merged via styleMap for every target.
// v0.1.24: Redistributed close-button's old internal cushion into explicit header padding/gap.
// v0.1.23: Reverted header padding to the original v0.1.0 value.
// v0.1.22: close-button default size 48px -> 24px, matching the icon; icon now scales with the button.
// v0.1.21: styles: is now nested by target instead of applying only to the frame.
// v0.1.20: header padding 8px -> 8px 8px 0 8px, closing the header-to-content gap.
// v0.1.19: Full header rewrite matching HA/browser_mod dialog conventions; fixed SVG sizing bug.
// v0.1.18: close-btn svg 20px -> 24px, matching browser_mod's close icon.
// v0.1.16: title font-size 1.25rem -> 1.4rem.
// v0.1.15: border-radius default 12px -> var(--ha-dialog-border-radius, 28px).
// v0.1.14: Title styling matched to MDC dialog title/browser_mod (font-size, line-height, letter-spacing).
// v0.1.13: Header restyle - close button moved to top-left, title font-size increased, layout/background updated.
// v0.1.11: Reverted 0.1.9's imperative <hui-view> construction back to declarative binding.
// v0.1.10: Fixed built-in cards failing to render by relocating the host into ha-panel-lovelace's shadow root.
// v0.1.9: Fixed a race causing some cards to throw on first render by building <hui-view> imperatively.
// v0.1.8: Added live entity-update subscription so popup content updates live instead of only at open().
// v0.1.7: Extracted inline hardcoded defaults into named constants.
// v0.1.6: Removed width/height/background/radius as top-level keys (styles: only); added unrecognized-key warning.
// v0.1.5: Default popup sizing changed to auto-fit-content with min/max constraints.
// v0.1.4: Added "styles" - a flat map of CSS properties applied to the popup frame.
// v0.1.3: Renamed "page" config field to "view".
// v0.1.2: Renamed from chrono-popup-card to chrono-popup (JS resource, not a placeable card).
// v0.1.1: Replaced panel-only <hui-card> rendering with <hui-view>, supporting all view types; added view visibility check.
// v0.1.0: Initial version - fire-dom-event trigger, lovelace/config fetch, panel-view rendering, close via button/backdrop/Escape.

console.info(
  `%c CHRONO-%cPOPUP %c v${CARD_VERSION} `,
  'background-color: #101010; color: #FFFFFF; font-weight: bold; padding: 2px 0 2px 4px; border-radius: 3px 0 0 3px;',
  'background-color: #101010; color: #4676d3; font-weight: bold; padding: 2px 0 2px 0;',
  'background-color: #1E1E1E; color: #FFFFFF; font-weight: bold; padding: 2px 4px; border-radius: 0 3px 3px 0;'
);

// ─── Constants ────────────────────────────────────────────────────────────

const EVENT_KEY = 'chrono-popup';

const KNOWN_DATA_KEYS = ['title', 'view', 'styles', 'dismissable', 'close-align', 'title-align'];

// Close button footprint, used both to size/position the button itself
// (absolute against .frame) and, together with the header padding
// constants below, to keep the button and title vertically aligned
// while letting the header's total height be tuned independently.
// Also interpolated directly into static styles (Section: Styles) as the
// CSS var() fallback for the button's own width/height/top, so the JS
// math and the CSS default can never drift apart into two different
// numbers.
const CLOSE_BUTTON_SIZE_PX = 24;
const CLOSE_BUTTON_INSET_TOP_PX = 18;

// Only panel views lack their own built-in spacing (masonry and sections
// both self-pad) - this applies as .body's default padding, only when
// the resolved view's type is "panel".
// Per-view-type default .body padding. Real HA view types are masonry,
// sections, panel, sidebar - unmatched/unknown types fall back to
// DEFAULT_LAYOUT_PADDING. NOTE: this literal string is also duplicated as
// the static-CSS var() fallback for --body-padding (Section: Styles) -
// keep both in sync if changed.
const DEFAULT_LAYOUT_PADDING = '0px 0px 12px 0px';
const PANEL_LAYOUT_PADDING = '4px 24px 24px 24px';
const SECTIONS_LAYOUT_PADDING = '0px 0px 0px 0px';
const MASONRY_LAYOUT_PADDING = '0px 0px 12px 0px';
const SIDEBAR_LAYOUT_PADDING = '0px 0px 0px 0px';

const LAYOUT_PADDING_BY_TYPE = {
  panel: PANEL_LAYOUT_PADDING,
  sections: SECTIONS_LAYOUT_PADDING,
  masonry: MASONRY_LAYOUT_PADDING,
  sidebar: SIDEBAR_LAYOUT_PADDING,
};

// .wrapper and .container below are HA's own elements, internal to
// hui-sections-view (rendered when a "sections"-type view is shown) -
// not ours, and not reachable via styles:. Their own padding is driven
// by --ha-view-sections-column-gap / --ha-view-sections-row-gap, but
// those same variables also control the grid's card-to-card gap, so
// setting them just to fix padding would also shrink that gap as a
// side effect. These two constants are injected directly into that
// specific <hui-sections-view> instance's own shadow root instead (see
// applySectionsDefaultCss below), scoped to just the view shown inside
// this popup - other sections views elsewhere on the dashboard are
// untouched. These are the var() fallback defaults - user-adjustable via
// --sections-wrapper-padding / --sections-container-padding, set under
// the "body" styles: target (see the constructor).
const SECTIONS_WRAPPER_PADDING = '0px 16px';
const SECTIONS_CONTAINER_PADDING = '0px 0px 16px';

// Valid values for close-align / title-align, each defaulting to
// "left". Invalid supplied values fall back to "left" via
// resolveAlignOption() below, with a console.warn().
const CLOSE_ALIGN_VALUES = ['left', 'right', 'hidden'];
const TITLE_ALIGN_VALUES = ['left', 'right', 'center', 'hidden'];

const TITLE_ALIGN_JUSTIFY_CONTENT = {
  left: 'flex-start',
  right: 'flex-end',
  center: 'center',
};

// Close button footprint, used both to position the button itself
// (absolute against .frame) and to size .header's reserved side
// padding so title text never runs underneath it.
//
// CLOSE_BUTTON_SIZE_PX / CLOSE_BUTTON_INSET_TOP_PX are declared earlier,
// in the Version-adjacent Constants block above.
const CLOSE_BUTTON_INSET_SIDE_PX = 20;
const CLOSE_BUTTON_INSET_TOP = `${CLOSE_BUTTON_INSET_TOP_PX}px`;
const CLOSE_BUTTON_INSET_SIDE = `${CLOSE_BUTTON_INSET_SIDE_PX}px`;

// Reserved-side header padding = the button's own side inset + its
// width + a small gap so the title's ellipsis doesn't run flush
// against it. Normal-side padding = just the side inset, same value
// used for the button-hidden case, kept as a separate constant so the
// two meanings (reserved vs. normal) don't accidentally end up as the
// same literal by coincidence.
const HEADER_TITLE_BUTTON_GAP_PX = 16;
const HEADER_SIDE_RESERVED_PX = CLOSE_BUTTON_INSET_SIDE_PX + CLOSE_BUTTON_SIZE_PX + HEADER_TITLE_BUTTON_GAP_PX;
const HEADER_SIDE_RESERVED = `${HEADER_SIDE_RESERVED_PX}px`;
const HEADER_SIDE_NORMAL = `${CLOSE_BUTTON_INSET_SIDE_PX}px`;

// NOTE: this literal string is also duplicated as the static-CSS var()
// fallback for --header-padding (Section: Styles) - keep both in sync
// if changed.
const HEADER_PADDING_NO_BUTTON = '20px 20px 12px 20px';

// Vertical geometry, button-shown case. Two independent knobs:
//  - HEADER_TOTAL_HEIGHT_PX: how tall the header box is overall (and
//    therefore how far the body sits below the button/title).
//  - BUTTON_CENTER_OFFSET_PX: where the button's (and therefore the
//    title's) vertical center sits, from the frame top - fixed to the
//    button's own inset + half its height, so the two can never drift
//    apart (this is what v1.2.43 fixed).
// HEADER_PADDING_BOTTOM_PX is a free choice (0, i.e. the header's
// bottom edge sits as close to the button/title's own center as the
// alignment math allows).
//
// IMPORTANT: this file sets no box-sizing anywhere, so the CSS default
// (content-box) applies. Under content-box, min-height sizes the
// CONTENT area only - padding is added ON TOP of it, not included in
// it. v1.2.45 set min-height directly to HEADER_TOTAL_HEIGHT_PX, which
// under content-box actually produced a real total of
// padding-top + HEADER_TOTAL_HEIGHT_PX + padding-bottom (62px, not
// 50px), and threw off the title's centering by the same amount
// (fixed here in v1.2.46). HEADER_CONTENT_BOX_HEIGHT_PX is the correct
// value for min-height - solved so that, once padding is added on top
// of it, the title's center still lands on BUTTON_CENTER_OFFSET_PX and
// the real total still equals HEADER_TOTAL_HEIGHT_PX.
const HEADER_TOTAL_HEIGHT_PX = 50;
const BUTTON_CENTER_OFFSET_PX = CLOSE_BUTTON_INSET_TOP_PX + CLOSE_BUTTON_SIZE_PX / 2;
const HEADER_PADDING_BOTTOM_PX = 0;
const HEADER_CONTENT_BOX_HEIGHT_PX = 2 * (HEADER_TOTAL_HEIGHT_PX - HEADER_PADDING_BOTTOM_PX - BUTTON_CENTER_OFFSET_PX);
const HEADER_PADDING_TOP_PX = HEADER_TOTAL_HEIGHT_PX - HEADER_PADDING_BOTTOM_PX - HEADER_CONTENT_BOX_HEIGHT_PX;
const HEADER_MIN_HEIGHT = `${HEADER_CONTENT_BOX_HEIGHT_PX}px`;

// ─── Helpers ──────────────────────────────────────────────────────────────

// Converts a snake_case string to kebab-case. Used for both the styles:
// target key (-> class name) and its property names, since CSS text
// treats them identically syntactically. Matches chrono-hvac-card's
// chToKebab exactly.
function toKebabCase(str) {
  return String(str).replace(/_/g, '-');
}

// Converts config.styles (a flat { target: { property: value } } object)
// into a single ready-to-inject CSS text block. No validation of target
// names or property names against anything - any key the user writes is
// translated as-is, matching chrono-hvac-card's chBuildUserStylesCss. One
// reserved key, 'host', targets the popup's own :host instead of a
// literal class. A target whose value isn't a plain object is skipped
// with a console.warn (format-error protection, not name validation -
// we don't block typos in the target name itself, only malformed values).
function buildUserStylesCss(stylesConfig) {
  let cssText = '';
  for (const [target, props] of Object.entries(stylesConfig)) {
    if (!props || typeof props !== 'object' || Array.isArray(props)) {
      console.warn(`chrono-popup: styles.${target} must be an object, got ${typeof props}. Ignoring.`);
      continue;
    }
    const declarations = Object.entries(props)
      .map(([prop, value]) => `${toKebabCase(prop)}: ${value};`)
      .join(' ');
    const selector = target === 'host' ? ':host' : `.${toKebabCase(target)}`;
    cssText += `${selector} { ${declarations} }\n`;
  }
  return cssText;
}

// Recursively searches a DOM/shadow tree for the first element with the
// given tag name, crossing into any open shadow roots it encounters.
// Used instead of a fixed shadowRoot.querySelector(...) chain because
// the exact nesting depth between <hui-view> and view-type elements
// like <hui-sections-view> is internal to HA and not guaranteed to
// stay the same across frontend versions - this only assumes the tag
// name and HA's convention of open shadow roots (both hold true today;
// card-mod itself depends on the same convention).
function findElementInShadowTree(root, tagName) {
  if (!root) return null;
  const upperTag = tagName.toUpperCase();
  const queue = [root];
  while (queue.length) {
    const current = queue.shift();
    const children = current.children ? Array.from(current.children) : [];
    for (const child of children) {
      if (child.tagName === upperTag) return child;
      if (child.shadowRoot) queue.push(child.shadowRoot);
      queue.push(child);
    }
  }
  return null;
}

// Appends sheet to target's adoptedStyleSheets if not already present -
// matches the reusable-CSSStyleSheet + append-not-replace pattern used
// in chrono-hvac-card / chrono-slider-card, adapted for an externally
// located shadow root rather than the component's own renderRoot. The
// .includes() guard is needed here (unlike a one-time firstUpdated())
// because this runs on every render/live-update cycle against a
// dynamically-located element.
function appendStyleSheetOnce(shadowRoot, sheet) {
  if (!shadowRoot) return;
  if (!shadowRoot.adoptedStyleSheets.includes(sheet)) {
    shadowRoot.adoptedStyleSheets = [...shadowRoot.adoptedStyleSheets, sheet];
  }
}

// Finds the <hui-sections-view> instance inside this popup (if the
// current view resolved to type "sections") and applies
// SECTIONS_WRAPPER_PADDING / SECTIONS_CONTAINER_PADDING to just that
// instance. Safe to call repeatedly - appendStyleSheetOnce is a no-op
// once already applied to a given shadow root.
function applySectionsDefaultCss(hostRoot, sheet) {
  const sectionsView = findElementInShadowTree(hostRoot, 'hui-sections-view');
  if (sectionsView?.shadowRoot) {
    appendStyleSheetOnce(sectionsView.shadowRoot, sheet);
  }
}

// Reserves header side padding only where the button actually needs
// it - never both sides just because a button exists:
//  - title-align: center -> both sides reserved (the title's own box
//    is centered on the frame width per align-items regardless of
//    which side has more/less space, so reserving both sides keeps
//    that centering symmetric without separate frame-width math)
//  - title on the SAME side as the button -> that side reserved only
//  - title on the OPPOSITE side from the button -> no reservation;
//    the title and button are on opposite edges and can't overlap
// Only called when the close button is shown - closeAlign is
// therefore always 'left' or 'right' here, never 'hidden'.
function computeHeaderPadding(titleAlign, closeAlign) {
  let left = HEADER_SIDE_NORMAL;
  let right = HEADER_SIDE_NORMAL;

  if (titleAlign === 'center') {
    left = HEADER_SIDE_RESERVED;
    right = HEADER_SIDE_RESERVED;
  } else if (titleAlign === closeAlign) {
    if (closeAlign === 'left') {
      left = HEADER_SIDE_RESERVED;
    } else {
      right = HEADER_SIDE_RESERVED;
    }
  }

  return `${HEADER_PADDING_TOP_PX}px ${right} ${HEADER_PADDING_BOTTOM_PX}px ${left}`;
}

// Builds the one inline style="" string applied to .frame each render -
// CSS custom-property declarations only (never real visual properties
// directly), so the static CSS's own var(--name, fallback) rules are
// what actually paint, and the user's own adoptedStyleSheets override
// still wins cascade ties against them exactly like every other
// property. This is what lets computed-per-render values (header
// padding, header min-height, header justify-content, close-button
// position, body padding) stay just as user-overridable as the plain
// static defaults, without a second, separately recompiled stylesheet.
function buildComputedFrameVarsCss(showCloseButton, titleAlign, closeAlign, viewType) {
  const headerPadding = showCloseButton ? computeHeaderPadding(titleAlign, closeAlign) : HEADER_PADDING_NO_BUTTON;
  const bodyPadding = LAYOUT_PADDING_BY_TYPE[viewType] ?? DEFAULT_LAYOUT_PADDING;
  const justifyContent = TITLE_ALIGN_JUSTIFY_CONTENT[titleAlign] ?? 'flex-start';

  const decls = [
    `--header-padding: ${headerPadding}`,
    `--header-justify-content: ${justifyContent}`,
    `--body-padding: ${bodyPadding}`,
  ];

  if (showCloseButton) {
    decls.push(`--header-min-height: ${HEADER_MIN_HEIGHT}`);
    decls.push(`--close-button-top: ${CLOSE_BUTTON_INSET_TOP}`);
    if (closeAlign === 'right') {
      decls.push(`--close-button-right: ${CLOSE_BUTTON_INSET_SIDE}`);
    } else {
      decls.push(`--close-button-left: ${CLOSE_BUTTON_INSET_SIDE}`);
    }
  }

  return decls.join('; ');
}

// Validates a close-align/title-align value against its allowed list.
// Missing value -> default, silently. Present but invalid -> default,
// with a console.warn() naming the bad value and the valid options.
function resolveAlignOption(rawValue, validValues, fieldName) {
  const DEFAULT_ALIGN = 'left';
  if (rawValue == null) return DEFAULT_ALIGN;
  if (validValues.includes(rawValue)) return rawValue;
  console.warn(
    `chrono-popup: invalid ${fieldName} "${rawValue}". Valid values: ${validValues.join(', ')}. Falling back to "${DEFAULT_ALIGN}".`
  );
  return DEFAULT_ALIGN;
}

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
    _opts:    { state: true }, // { title, dismissable, closeAlign, titleAlign }
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

    // Created once, content replaced whenever styles: config changes (in
    // open()). Appended to adoptedStyleSheets once, in firstUpdated().
    this._userStyleSheet = new CSSStyleSheet();

    // Created once, content never changes - see applySectionsDefaultCss.
    this._sectionsStyleSheet = new CSSStyleSheet();
    this._sectionsStyleSheet.replaceSync(
      `.wrapper { padding: var(--sections-wrapper-padding, ${SECTIONS_WRAPPER_PADDING}); }\n` +
      `.container { padding: var(--sections-container-padding, ${SECTIONS_CONTAINER_PADDING}); }`
    );
  }

  // Appended after Lit's own static-style sheets (already present in
  // adoptedStyleSheets by this point) so styles: overrides win cascade
  // ties against them, on any property, not just ones the built-in
  // styles leave undeclared. Matches chrono-hvac-card's firstUpdated().
  firstUpdated() {
    this.renderRoot.adoptedStyleSheets = [
      ...this.renderRoot.adoptedStyleSheets,
      this._userStyleSheet,
    ];
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

  // Runs after every render. Cheap and idempotent (appendStyleSheetOnce
  // no-ops once already applied to a given shadow root) - covers the
  // initial render, since _subscribeToUpdates's callback only fires on
  // a later entity change, not immediately at open().
  updated() {
    if (this._open) {
      applySectionsDefaultCss(this.renderRoot, this._sectionsStyleSheet);
    }
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
        applySectionsDefaultCss(this.renderRoot, this._sectionsStyleSheet);
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

    const rawStyles = (data.styles && typeof data.styles === 'object' && !Array.isArray(data.styles)) ? data.styles : {};
    this._userStyleSheet.replaceSync(buildUserStylesCss(rawStyles));

    this._opts = {
      title: data.title ?? '',
      dismissable: data.dismissable !== false, // backdrop-click-to-close, on by default
      closeAlign: resolveAlignOption(data['close-align'], CLOSE_ALIGN_VALUES, 'close-align'),
      titleAlign: resolveAlignOption(data['title-align'], TITLE_ALIGN_VALUES, 'title-align'),
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
    if (parts.length > 2) {
      console.warn(
        `chrono-popup: "view" contains extra path segments; only the first dashboard and view are used. Got "${view}"`
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
  // object carrying one. No rules present -> visible to everyone. If we
  // can't determine the current user id, we treat the view as visible
  // rather than blocking it based on missing user info.
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

  // ─── Styles ──────────────────────────────────────────────────────────
  // All default visual styling lives here, as real CSS with real class
  // selectors - not JS objects merged at render time. Lit compiles and
  // auto-adopts this before firstUpdated() runs. Every cosmetic/spacing/
  // sizing property is written as var(--kebab-name, fallback), matching
  // chrono-hvac-card's own static styles exactly. Structural rules
  // (position, display, flex layout, z-index, the ellipsis-truncation
  // trio on .title) are intentionally left plain, not var'd - per
  // project convention, vars are reserved for visual styling values
  // (font/padding/margin/border/background/etc.), not for values whose
  // role is purely structural or computed. Every property here, var'd or
  // not, remains fully overridable by the user's own styles: config -
  // that comes from cascade order (this sheet -> computed vars on .frame
  // -> the user's own sheet, appended last in firstUpdated()), not from
  // which properties happen to use var().
  static styles = css`
    :host {
      display: contents;
    }
    .overlay {
      position: fixed;
      inset: 0;
      z-index: 1000;
      display: flex;
      justify-content: center;
      background: var(--overlay-background, rgba(0, 0, 0, 0.6));
      align-items: var(--overlay-align-items, flex-start);
    }
    .frame {
      position: relative;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      width: var(--frame-width, auto);
      min-width: var(--frame-min-width, 240px);
      max-width: var(--frame-max-width, 90vw);
      height: var(--frame-height, auto);
      min-height: var(--frame-min-height, 10%);
      max-height: var(--frame-max-height, 90vh);
      margin-top: var(--frame-margin-top, 10vh);
      background: var(--frame-background, var(--card-background-color, #1c1c1c));
      border-radius: var(--frame-border-radius, var(--ha-dialog-border-radius, 28px));
      box-shadow: var(--frame-box-shadow, 0 8px 32px rgba(0, 0, 0, 0.5));
    }
    .header {
      display: flex;
      align-items: center;
      flex: 0 0 auto;
      gap: var(--header-gap, 16px);
      background: var(--header-background, var(--card-background-color));
      padding: var(--header-padding, 20px 20px 12px 20px);
      min-height: var(--header-min-height, auto);
      justify-content: var(--header-justify-content, flex-start);
    }
    .title {
      font-size: var(--title-font-size, 24px);
      line-height: var(--title-line-height, 2rem);
      letter-spacing: var(--title-letter-spacing, 0.0125em);
      font-weight: var(--title-font-weight, 400);
      color: var(--title-color, var(--primary-text-color, #fff));
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-left: var(--title-margin-left, 4px);
    }
    .close-button {
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
      position: absolute;
      z-index: 999;
      top: var(--close-button-top, ${CLOSE_BUTTON_INSET_TOP_PX}px);
      left: var(--close-button-left, auto);
      right: var(--close-button-right, auto);
      background: var(--close-button-background, none);
      border: var(--close-button-border, none);
      color: var(--close-button-color, var(--primary-text-color, #fff));
      width: var(--close-button-size, ${CLOSE_BUTTON_SIZE_PX}px);
      height: var(--close-button-size, ${CLOSE_BUTTON_SIZE_PX}px);
      padding: var(--close-button-padding, 0);
      border-radius: var(--close-button-border-radius, 50%);
    }
    .close-button:hover {
      background: var(--close-button-hover-background, rgba(255, 255, 255, 0.1));
    }
    .close-button svg {
      display: block;
      flex-shrink: 0;
      width: 100%;
      height: 100%;
      fill: currentColor;
    }
    .body {
      position: relative;
      flex: 1 1 auto;
      overflow: var(--body-overflow, auto);
      padding: var(--body-padding, 0px 0px 12px 0px);
    }
    .body hui-view-container {
      display: contents;
    }
    .body hui-view {
      display: contents;
      margin: 0;
      padding: 0;
    }
    .status {
      color: var(--status-color, var(--primary-text-color, #fff));
      padding: var(--status-padding, 24px);
    }
    .status.error {
      color: var(--status-error-color, var(--error-color, #ff5252));
    }
  `;

  render() {
    if (!this._open) return html``;

    const { title, dismissable, closeAlign, titleAlign } = this._opts;
    const showCloseButton = closeAlign !== 'hidden';
    const showHeader = !!title && titleAlign !== 'hidden';
    const frameVarsCss = buildComputedFrameVarsCss(showCloseButton, titleAlign, closeAlign, this._view?.viewConfig?.type);

    return html`
      <div
        class="overlay"
        @click=${(ev) => {
          if (dismissable && ev.target === ev.currentTarget) this.close();
        }}
      >
        <div class="frame" style=${frameVarsCss}>
          ${showCloseButton ? html`
            <button
              class="close-button"
              @click=${() => this.close()}
              aria-label="Close"
            >
              <svg viewBox="0 0 24 24">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
          ` : ''}
          ${showHeader ? html`
            <div class="header">
              <span class="title">${title}</span>
            </div>
          ` : ''}
          <div class="body">
            ${this._loading ? html`<div class="status">Loading…</div>` : ''}
            ${this._error ? html`<div class="status error">${this._error}</div>` : ''}
            ${!this._loading && !this._error && this._view
              ? html`<hui-view-container
                  .hass=${this._getHass()}
                  .theme=${this._view.viewConfig?.theme}
                >
                  <hui-view
                    .hass=${this._getHass()}
                    .narrow=${false}
                    .lovelace=${this._view.lovelace}
                    .index=${this._view.index}
                    .isStrategyView=${false}
                    .viewConfig=${this._view.viewConfig}
                  ></hui-view>
                </hui-view-container>`
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

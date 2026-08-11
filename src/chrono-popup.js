import { LitElement, html, css } from 'https://unpkg.com/lit@2.0.0/index.js?module';
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
//           frame:
//             width: 640px
//             height: 580px
//             background: "#000000"
//             border-radius: 50px
//           header:
//             padding: 8px 8px 0 8px
//
// `view` is "/<dashboard url_path>/<view path>". Both segments are
// required in v1 - the default (unnamed) dashboard is not yet supported,
// only dashboards with an explicit url_path.
//
// Recognized top-level keys: title, view, styles, dismissable,
// close-align, title-align. Anything else is not read -
// console.warn()'d instead of failing silently.
//
// close-align: "left" (default) | "right" | "hidden" - position of the
// close button, or hide it entirely. Always takes zero vertical space.
// title-align: "left" (default) | "right" | "center" | "hidden" - only
// title-holding element that takes vertical space; "hidden" collapses
// the header to zero height even if title text is set.
// styles: is nested by target - each key is translated directly to a CSS
// class selector of the same name (kebab-case) and injected via
// adoptedStyleSheets, e.g. styles.close-button -> .close-button { ... }.
// One reserved key, "host", targets the popup's own :host instead of a
// literal class. Any target name is accepted - there is no fixed
// allowlist - matching the same styles: architecture used across the
// chrono-* plugin family (chrono-hvac-card, chrono-slider-card).

// ─── Version ────────────────────────────────────────────────────────────
const CARD_VERSION = '1.3.52';

// ─── Version History ────────────────────────────────────────────────────
// v1.3.52: Removed --frame-padding / .frame padding entirely (reverted to
//          pre-1.3.51 - no declared padding on .frame). Increased the
//          hui-sections-view default padding: SECTIONS_WRAPPER_PADDING
//          '0px 8px' -> '0px 16px', SECTIONS_CONTAINER_PADDING
//          '8px 0px' -> '16px 0px'. --sections-wrapper-padding /
//          --sections-container-padding (added in v1.3.51) still work
//          the same way, just with new fallback defaults.
// v1.3.51: Added --frame-padding (default 8px) to .frame - previously had
//          no padding at all. Also made the hui-sections-view default
//          padding (SECTIONS_WRAPPER_PADDING / SECTIONS_CONTAINER_PADDING)
//          user-adjustable via --sections-wrapper-padding /
//          --sections-container-padding, set under the existing "body"
//          styles: target (CSS custom properties inherit through shadow
//          boundaries, so this reaches hui-sections-view's own .wrapper/
//          .container from .body without needing a new styles: target).
// v1.3.50: Migrated styles: from styleMap (inline style="" attributes) to
//          adoptedStyleSheets (real CSS via a CSSStyleSheet, appended
//          after Lit's own static styles), matching the architecture used
//          in chrono-hvac-card / chrono-slider-card. All default visual
//          styling now lives in one real static styles = css block, with
//          var(--name, fallback) on every cosmetic/spacing/sizing
//          property. styles: is no longer validated against a fixed
//          STYLE_TARGETS allowlist - matching chrono-hvac-card, any
//          target name (or the reserved "host" -> :host) is accepted and
//          translated directly to CSS; a console.warn is still emitted if
//          a given styles.<target> value isn't an object (format-error
//          protection, not name validation). Computed per-render values
//          (header padding, header min-height, header justify-content,
//          close-button position, body padding) are now applied as CSS
//          custom properties set inline on .frame - not full inline
//          style="" properties - and read by the static CSS via var().
//          This keeps them just as user-overridable via cascade as every
//          other property, without needing a second, separately
//          recompiled stylesheet. .close-button:hover background and
//          .status/.status.error color are now var-driven too - both
//          were previously impossible under styleMap's inline-beats-class
//          specificity problem. Removed the now-unused styleMap import
//          and the seven DEFAULT_*_STYLES JS objects (folded into static
//          styles). applySectionsDefaultCss / _sectionsStyleSheet are
//          unchanged - they already used this exact pattern.
// v1.2.48: Added hard-coded default padding for hui-sections-view's own
//          internal .wrapper/.container elements (HA's, not ours - not
//          reachable via styles:). Applied per-instance, scoped to just
//          the sections view shown inside this popup - other sections
//          views on the dashboard are untouched. Mechanism: locates the
//          specific <hui-sections-view> instance via
//          findElementInShadowTree() (crosses open shadow roots by tag
//          name, not a fixed depth path, since HA's exact nesting isn't
//          a stable public contract) and appends one reusable
//          CSSStyleSheet to its shadowRoot.adoptedStyleSheets, matching
//          the pattern already used in chrono-hvac-card /
//          chrono-slider-card (single sheet, created once, appended
//          not replaced, content set via replaceSync). No config option
//          - hard default, not opt-in. Re-checked on every render and
//          on every live entity update (both idempotent) so it
//          self-heals if HA ever recreates the element.
// v1.2.47: DEFAULT_FRAME_STYLES.minWidth: 480px -> 240px, to allow
//          narrower popups on small/custom mobile themes without the
//          old default forcing a wider frame than styles.frame.width
//          requested.
// v1.2.46: Fixed title rendering ~6px below the close button again,
//          for a different reason than v1.2.43. Root cause this time:
//          the file sets no box-sizing anywhere, so the CSS default
//          (content-box) applies - under content-box, min-height sizes
//          the content area only, and padding is added ON TOP of it.
//          v1.2.45 set the header's min-height directly to the desired
//          TOTAL height (50px), which under content-box actually
//          produced a real total of padding-top + 50 + padding-bottom
//          (62px), and shifted the title's center down by the same
//          gap. Added HEADER_CONTENT_BOX_HEIGHT_PX, solved separately
//          from HEADER_TOTAL_HEIGHT_PX so that once padding is added
//          on top of it, both the true total and the title's center
//          come out correct. Also corrected close button top inset:
//          19px -> 18px (v1.2.45 applied a 3px downshift; 2px was
//          intended).
// v1.2.45: Decoupled the header's total height from the button/title
//          alignment point - v1.2.43's symmetric min-height approach
//          forced both to be the same number, which couldn't express
//          "move the button/title down 3px AND bring the header 6px
//          closer to the body" (a net header total of 50px, down from
//          56px) as two independent adjustments. Close button top
//          inset: 16px -> 19px. Header vertical padding is now solved
//          from BUTTON_CENTER_OFFSET_PX (button's own alignment point)
//          and HEADER_TOTAL_HEIGHT_PX (50px) as two separate knobs,
//          instead of one shared value - padding-top 0 -> 12px,
//          padding-bottom stays 0px. Title still centers exactly on
//          the button regardless of header height, and the header
//          total can now be tuned on its own without moving the
//          button/title.
// v1.2.44: Fixed header side padding being reserved on BOTH sides for
//          every close-align/title-align combination - that was only
//          ever meant to apply to title-align: center. Replaced the
//          fixed HEADER_PADDING_BUTTON_RESERVED constant with
//          computeHeaderPadding(), which reserves space only on the
//          side the button actually occupies: both sides for center,
//          one side when title and button share a side, neither side
//          when they're on opposite edges (e.g. title-align: left +
//          close-align: right now renders fully flush left, as
//          intended). DEFAULT_TITLE_STYLES: fontSize 1.4rem -> 24px,
//          fontWeight 500 -> 400.
// v1.2.43: Fixed title rendering below the close button's vertical
//          center when a title is shown. Cause: .header's old
//          asymmetric padding (20px top / 12px bottom) was a leftover
//          from the pre-1.2.41 design, when the button lived inside
//          .header and the padding was shaped around it - once the
//          button moved to independent absolute positioning, that
//          padding kept its old shape but lost any relationship to
//          where the button actually sits, so the two drifted apart.
//          Fix: CLOSE_BUTTON_SIZE_PX / CLOSE_BUTTON_INSET_TOP_PX
//          extracted as shared numeric constants; HEADER_MIN_HEIGHT is
//          now derived from them (2 * inset + size) rather than being
//          a second, independently-chosen number. .header's vertical
//          padding dropped to 0 (button-shown case) and given that
//          min-height instead, so align-items: center places the
//          title's vertical center at exactly the same point as the
//          button's, by construction - not by coincidence, and it
//          can't drift again even if button size/inset change later.
//          Side effect (desired): header is shorter than before, since
//          min-height (56px) is less than the old padding-driven total.
// v1.2.42: Fixed close button getting visually covered by body content
//          (e.g. thermostat card's dial) when the header is collapsed -
//          .close-button and .body are both position:relative/absolute
//          with z-index:auto, which stacks by DOM order, and .body comes
//          after .close-button in markup. Added explicit z-index: 999 to
//          .close-button so it always paints above body content,
//          regardless of what's rendered inside the view.
// v1.2.41: Added close-align (left/right/hidden, default left) and
//          title-align (left/right/center/hidden, default left) data
//          options. Close button moved out of .header entirely - now
//          rendered independently, absolutely positioned against
//          .frame, so it no longer takes vertical space and is never
//          affected by whether a title is present. .header itself now
//          renders only when title is non-empty AND title-align !==
//          'hidden' - collapses to zero height otherwise. When the
//          close button is shown, .header reserves symmetric padding
//          on BOTH sides for its footprint (not just the occupied
//          side), so title-align: center/right and close-align: left
//          combinations never need overlap-specific math - ellipsis
//          truncation stays correct regardless of which side the
//          button is on. .frame given static position:relative (kept
//          out of styles.frame so a user override can't break the
//          button's positioning).
// v0.1.40: Modified default padding for sections views
// v0.1.35: Popup now anchors from the top instead of centering vertically
//          - .overlay's align-items: center (hardcoded) -> alignItems:
//          'flex-start' (DEFAULT_OVERLAY_STYLES, overridable). Added
//          DEFAULT_FRAME_STYLES.marginTop: '10vh' - relative like a
//          percentage, but physically can't push the popup off-screen
//          the way a negative margin-top from center could.
// v0.1.34: Added validation for styles.target values in open(); logs a
//          warning when a styles target exists but is not an object. Also
//          added a warning when the supplied view path contains extra
//          slash-delimited segments beyond dashboard/view.
// v0.1.30: Replaced panel/non-panel two-value padding with per-view-type
//          constants (DEFAULT_LAYOUT_PADDING, PANEL_LAYOUT_PADDING,
//          SECTIONS_LAYOUT_PADDING, MASONRY_LAYOUT_PADDING,
//          SIDEBAR_LAYOUT_PADDING) via a lookup table keyed by
//          viewConfig.type, falling back to DEFAULT_LAYOUT_PADDING for
//          any unmatched/unknown type.
// v0.1.28: PANEL_VIEW_BODY_PADDING '16px' -> '0px 12px 16px 12px',
//          NON_PANEL_VIEW_BODY_PADDING '0' -> '0px 0px 0px 0px'.
//          DEFAULT_FRAME_STYLES: minWidth 580px -> 540px, minHeight
//          533px -> 10% (matching browser_mod's own classic-style
//          --mdc-dialog-min-height: 10% default, confirmed via source).
// v0.1.27: Fixed 0.1.26 - the 16px panel-padding value was hardcoded
//          inline in render(), not in the Constants section. Extracted
//          to PANEL_VIEW_BODY_PADDING and NON_PANEL_VIEW_BODY_PADDING.
//          No behavior change.
// v0.1.26: .body gets a default 16px padding only when the resolved
//          view's type is "panel" - confirmed via real HA source that
//          panel is the only view type with zero built-in spacing;
//          masonry and sections both already self-pad. styles.body still
//          overrides either way.
// v0.1.25: Extracted every remaining default visual value out of static
//          CSS into named DEFAULT_*_STYLES constants (Constants section),
//          matching the DEFAULT_FRAME_STYLES pattern - now merged via
//          styleMap for every target (overlay, frame, header, title,
//          close-button, body, status), not just frame. Removed dead
//          max-width:96vw/max-height:96vh from .frame (always overridden
//          by DEFAULT_FRAME_STYLES' inline 90vw/90vh anyway - unreachable
//          leftover). TWO EXCEPTIONS, cannot be moved: .close-button:hover
//          (pseudo-class, no inline equivalent) and .status/.status.error
//          color (inline styles beat class selectors regardless of order,
//          so moving color to a default would permanently override the
//          error-red state - kept as class rules instead).
// v0.1.24: Redistributed the old close-button's internal 12px cushion
//          (from its 48px box vs 24px icon) into explicit header
//          padding/gap, to visually match the pre-0.1.22 header exactly
//          while keeping the button's actual size at 24px. padding
//          8px 8px 8px 16px -> 20px 8px 12px 20px, gap 4px -> 16px.
//          Total header height unchanged (56px), so .body's position
//          and the v0.1.20 gap fix are unaffected.
// v0.1.23: header padding 8px 8px 0 8px -> 8px 8px 8px 16px, reverted to
//          the original v0.1.0 value now that close-button no longer
//          provides its own built-in spacing (24px, not 48px). NOTE:
//          this restores the 8px bottom padding that v0.1.20 specifically
//          removed to close the header-to-content gap - that gap is back.
// v0.1.22: close-button default size 48px -> 24px, matching the icon
//          exactly (no extra bounding box). Icon SVG now sized at 100%
//          of the button instead of a fixed 24px, so any styles.close-button
//          width/height override scales the icon along with the box,
//          instead of leaving it fixed size inside a bigger button.
// v0.1.21: styles: is now nested by target instead of applying only to
//          the frame. Valid keys: overlay, frame, header, title,
//          close-button, body, status - each optional, each applied to
//          its own element. Renamed .backdrop -> .overlay and
//          .close-btn -> .close-button (CSS + markup) to match. Frame's
//          previous auto-sizing defaults moved to DEFAULT_FRAME_STYLES,
//          merged under styles.frame specifically now.
// v0.1.20: header padding 8px -> 8px 8px 0 8px, removing our own
//          contribution to the header-to-content gap. Actually applied
//          this time - previously only described, never written.
// v0.1.19: Full header rewrite matching HA/browser_mod dialog header
//          conventions. Fixed the 20x24 SVG sizing bug: default inline
//          SVG display + flex shrink was compressing width only - added
//          display:block + flex-shrink:0. Close button 32px -> 48px
//          (real HA icon-button touch target), header padding matched
//          to MDC convention, title margin-left:4px for spacing.
// v0.1.18: close-btn svg 20px -> 24px, matching browser_mod's close icon.
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
const SECTIONS_CONTAINER_PADDING = '16px 0px';

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

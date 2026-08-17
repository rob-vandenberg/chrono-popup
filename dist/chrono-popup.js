import{LitElement,html,css}from"https://unpkg.com/lit@2.0.0/index.js?module";import{subscribeEntities}from"https://unpkg.com/home-assistant-js-websocket@9.6.0/dist/index.js";const CARD_VERSION="1.4.56";console.info("%c CHRONO-%cPOPUP %c v1.4.56 ","background-color: #101010; color: #FFFFFF; font-weight: bold; padding: 2px 0 2px 4px; border-radius: 3px 0 0 3px;","background-color: #101010; color: #4676d3; font-weight: bold; padding: 2px 0 2px 0;","background-color: #1E1E1E; color: #FFFFFF; font-weight: bold; padding: 2px 4px; border-radius: 0 3px 3px 0;");const EVENT_KEY="chrono-popup",KNOWN_DATA_KEYS=["title","view","styles","dismissable","close-align","title-align"],CLOSE_BUTTON_SIZE_PX=24,CLOSE_BUTTON_INSET_TOP_PX=18,DEFAULT_LAYOUT_PADDING="0px 0px 12px 0px",PANEL_LAYOUT_PADDING="4px 24px 24px 24px",SECTIONS_LAYOUT_PADDING="0px 0px 0px 0px",MASONRY_LAYOUT_PADDING="0px 0px 12px 0px",SIDEBAR_LAYOUT_PADDING="0px 0px 0px 0px",LAYOUT_PADDING_BY_TYPE={panel:"4px 24px 24px 24px",sections:"0px 0px 0px 0px",masonry:"0px 0px 12px 0px",sidebar:"0px 0px 0px 0px"},SECTIONS_WRAPPER_PADDING="0px 16px",SECTIONS_CONTAINER_PADDING="0px 0px 16px",CLOSE_ALIGN_VALUES=["left","right","hidden"],TITLE_ALIGN_VALUES=["left","right","center","hidden"],TITLE_ALIGN_JUSTIFY_CONTENT={left:"flex-start",right:"flex-end",center:"center"},CLOSE_BUTTON_INSET_SIDE_PX=20,CLOSE_BUTTON_INSET_TOP="18px",CLOSE_BUTTON_INSET_SIDE="20px",HEADER_TITLE_BUTTON_GAP_PX=16,HEADER_SIDE_RESERVED_PX=60,HEADER_SIDE_RESERVED="60px",HEADER_SIDE_NORMAL="20px",HEADER_PADDING_NO_BUTTON="20px 20px 12px 20px",HEADER_TOTAL_HEIGHT_PX=50,BUTTON_CENTER_OFFSET_PX=30,HEADER_PADDING_BOTTOM_PX=0,HEADER_CONTENT_BOX_HEIGHT_PX=40,HEADER_PADDING_TOP_PX=10,HEADER_MIN_HEIGHT="40px";function toKebabCase(e){return String(e).replace(/_/g,"-")}function buildUserStylesCss(e){let t="";for(const[o,s]of Object.entries(e)){if(!s||"object"!=typeof s||Array.isArray(s)){console.warn(`chrono-popup: styles.${o} must be an object, got ${typeof s}. Ignoring.`);continue}const e=Object.entries(s).map(([e,t])=>`${toKebabCase(e)}: ${t};`).join(" ");t+=`${"host"===o?":host":`.${toKebabCase(o)}`} { ${e} }\n`}return t}function findElementInShadowTree(e,t){if(!e)return null;const o=t.toUpperCase(),s=[e];for(;s.length;){const e=s.shift(),t=e.children?Array.from(e.children):[];for(const e of t){if(e.tagName===o)return e;e.shadowRoot&&s.push(e.shadowRoot),s.push(e)}}return null}function appendStyleSheetOnce(e,t){e&&(e.adoptedStyleSheets.includes(t)||(e.adoptedStyleSheets=[...e.adoptedStyleSheets,t]))}function applySectionsDefaultCss(e,t){const o=findElementInShadowTree(e,"hui-sections-view");o?.shadowRoot&&appendStyleSheetOnce(o.shadowRoot,t)}function computeHeaderPadding(e,t){let o="20px",s="20px";return"center"===e?(o="60px",s="60px"):e===t&&("left"===t?o="60px":s="60px"),`10px ${s} 0px ${o}`}function buildComputedFrameVarsCss(e,t,o,s){const i=[`--header-padding: ${e?computeHeaderPadding(t,o):"20px 20px 12px 20px"}`,`--header-justify-content: ${TITLE_ALIGN_JUSTIFY_CONTENT[t]??"flex-start"}`,`--body-padding: ${LAYOUT_PADDING_BY_TYPE[s]??"0px 0px 12px 0px"}`];return e&&(i.push("--header-min-height: 40px"),i.push("--close-button-top: 18px"),"right"===o?i.push("--close-button-right: 20px"):i.push("--close-button-left: 20px")),i.join("; ")}function resolveAlignOption(e,t,o){const s="left";return null==e?s:t.includes(e)?e:(console.warn(`chrono-popup: invalid ${o} "${e}". Valid values: ${t.join(", ")}. Falling back to "${s}".`),s)}function findLovelacePanelRoot(){return document.querySelector("home-assistant")?.shadowRoot?.querySelector("home-assistant-main")?.shadowRoot?.querySelector("ha-panel-lovelace")?.shadowRoot||null}class ChronoPopupHost extends LitElement{static properties={_open:{state:!0},_loading:{state:!0},_error:{state:!0},_opts:{state:!0},_view:{state:!0}};constructor(){super(),this._open=!1,this._loading=!1,this._error=null,this._opts={},this._view=null,this._hassUnsub=null,this._onKeydown=this._onKeydown.bind(this),this._userStyleSheet=new CSSStyleSheet,this._sectionsStyleSheet=new CSSStyleSheet,this._sectionsStyleSheet.replaceSync(".wrapper { padding: var(--sections-wrapper-padding, 0px 16px); }\n.container { padding: var(--sections-container-padding, 0px 0px 16px); }")}firstUpdated(){this.renderRoot.adoptedStyleSheets=[...this.renderRoot.adoptedStyleSheets,this._userStyleSheet]}connectedCallback(){super.connectedCallback(),document.addEventListener("keydown",this._onKeydown)}disconnectedCallback(){document.removeEventListener("keydown",this._onKeydown),this._unsubscribeFromUpdates(),super.disconnectedCallback()}_onKeydown(e){"Escape"===e.key&&this._open&&this.close()}updated(){this._open&&applySectionsDefaultCss(this.renderRoot,this._sectionsStyleSheet)}_getHass(){const e=document.querySelector("home-assistant");return e?e.hass:void 0}async _subscribeToUpdates(e){if(this._unsubscribeFromUpdates(),e?.connection)try{this._hassUnsub=await subscribeEntities(e.connection,()=>{const e=this.renderRoot?.querySelector("hui-view");e&&(e.hass=this._getHass()),applySectionsDefaultCss(this.renderRoot,this._sectionsStyleSheet)})}catch(e){console.warn("chrono-popup: could not subscribe to entity updates - popup content will not update live",e)}}_unsubscribeFromUpdates(){if("function"==typeof this._hassUnsub)try{this._hassUnsub()}catch(e){}this._hassUnsub=null}async open(e={}){const t=findLovelacePanelRoot();t&&this.parentNode!==t&&t.appendChild(this);for(const t of Object.keys(e))KNOWN_DATA_KEYS.includes(t)||console.warn(`chrono-popup: unrecognized key "${t}" in event_data (view: "${e.view||"?"}"). Recognized keys: ${KNOWN_DATA_KEYS.join(", ")}. CSS goes under "styles:".`);const o=e.styles&&"object"==typeof e.styles&&!Array.isArray(e.styles)?e.styles:{};this._userStyleSheet.replaceSync(buildUserStylesCss(o)),this._opts={title:e.title??"",dismissable:!1!==e.dismissable,closeAlign:resolveAlignOption(e["close-align"],CLOSE_ALIGN_VALUES,"close-align"),titleAlign:resolveAlignOption(e["title-align"],TITLE_ALIGN_VALUES,"title-align")},this._error=null,this._view=null,this._open=!0,this._loading=!0;const s=this._getHass();s&&this._subscribeToUpdates(s);try{this._view=await this._resolveView(e.view)}catch(e){this._error=e.message||String(e)}finally{this._loading=!1}}close(){this._open=!1,this._unsubscribeFromUpdates()}async _resolveView(e){if(!e||"string"!=typeof e)throw new Error('chrono-popup: "view" is required, e.g. "/my-dashboard/my-view"');const t=e.split("/").filter(Boolean);if(t.length<2)throw new Error(`chrono-popup: "view" must include both a dashboard and a view, e.g. "/my-dashboard/my-view" (got "${e}")`);t.length>2&&console.warn(`chrono-popup: "view" contains extra path segments; only the first dashboard and view are used. Got "${e}"`);const[o,s]=t,i=this._getHass();if(!i)throw new Error("chrono-popup: could not access hass - is Home Assistant fully loaded?");let r;try{r=await i.callWS({type:"lovelace/config",url_path:o})}catch(e){throw new Error(`chrono-popup: could not load dashboard "${o}" (${e.message||e})`)}const n=Array.isArray(r.views)?r.views:[],a=n.find(e=>e.path===s);if(!a)throw new Error(`chrono-popup: view "${s}" not found in dashboard "${o}"`);if(!this._isViewVisibleToUser(a,i))throw new Error(`chrono-popup: view "${s}" is not visible to the current user`);return{lovelace:{config:r,urlPath:o,editMode:!1},index:n.indexOf(a),viewConfig:a}}_isViewVisibleToUser(e,t){const o=t?.user?.id||null;if(!o||!e)return!0;const s=(Array.isArray(e.visible)&&e.visible.length?e.visible:null)||(Array.isArray(e.visibility)&&e.visibility.length?e.visibility:null)||(Array.isArray(e.users)&&e.users.length?e.users:null);if(!s)return!0;for(const e of s){if("string"==typeof e&&e===o)return!0;if(e&&"object"==typeof e){if("string"==typeof e.user&&e.user===o)return!0;if(Array.isArray(e.user)&&e.user.includes(o))return!0;if(Array.isArray(e.users)&&e.users.includes(o))return!0}}return!1}static styles=css`
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
      top: var(--close-button-top, ${18}px);
      left: var(--close-button-left, auto);
      right: var(--close-button-right, auto);
      background: var(--close-button-background, none);
      border: var(--close-button-border, none);
      color: var(--close-button-color, var(--primary-text-color, #fff));
      width: var(--close-button-size, ${24}px);
      height: var(--close-button-size, ${24}px);
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
  `;render(){if(!this._open)return html``;const{title:e,dismissable:t,closeAlign:o,titleAlign:s}=this._opts,i="hidden"!==o,r=!!e&&"hidden"!==s,n=buildComputedFrameVarsCss(i,s,o,this._view?.viewConfig?.type);return html`
      <div
        class="overlay"
        @click=${e=>{t&&e.target===e.currentTarget&&this.close()}}
      >
        <div class="frame" style=${n}>
          ${i?html`
            <button
              class="close-button"
              @click=${()=>this.close()}
              aria-label="Close"
            >
              <svg viewBox="0 0 24 24">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
          `:""}
          ${r?html`
            <div class="header">
              <span class="title">${e}</span>
            </div>
          `:""}
          <div class="body">
            ${this._loading?html`<div class="status">Loading…</div>`:""}
            ${this._error?html`<div class="status error">${this._error}</div>`:""}
            ${this._loading||this._error||!this._view?"":html`<hui-view-container
                  .hass=${this._getHass()}
                  .theme=${this._view.viewConfig?.theme}
                >
                  <hui-view
                    .hass=${this._getHass()}
                    .narrow=${!1}
                    .lovelace=${this._view.lovelace}
                    .index=${this._view.index}
                    .isStrategyView=${!1}
                    .viewConfig=${this._view.viewConfig}
                  ></hui-view>
                </hui-view-container>`}
          </div>
        </div>
      </div>
    `}}if(customElements.get("chrono-popup-host")||customElements.define("chrono-popup-host",ChronoPopupHost),!window.__chronoPopupHostInstalled){window.__chronoPopupHostInstalled=!0;const e=document.createElement("chrono-popup-host");document.body.appendChild(e),document.addEventListener("ll-custom",t=>{const o=t.detail&&t.detail[EVENT_KEY];o&&e.open(o.data||{})})}
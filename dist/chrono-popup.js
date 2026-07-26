import{LitElement,html,css}from"https://unpkg.com/lit@2.0.0/index.js?module";import{styleMap}from"https://unpkg.com/lit@2.0.0/directives/style-map.js?module";import{subscribeEntities}from"https://unpkg.com/home-assistant-js-websocket@9.6.0/dist/index.js";const CARD_VERSION="0.1.23";console.info("%c CHRONO-%cPOPUP %c v0.1.23 ","background-color: #101010; color: #FFFFFF; font-weight: bold; padding: 2px 0 2px 4px; border-radius: 3px 0 0 3px;","background-color: #101010; color: #4676d3; font-weight: bold; padding: 2px 0 2px 0;","background-color: #1E1E1E; color: #FFFFFF; font-weight: bold; padding: 2px 4px; border-radius: 0 3px 3px 0;");const EVENT_KEY="chrono-popup",KNOWN_DATA_KEYS=["title","view","styles","dismissable"],STYLE_TARGETS=["overlay","frame","header","title","close-button","body","status"],DEFAULT_FRAME_STYLES={width:"auto",minWidth:"580px",maxWidth:"90vw",height:"auto",minHeight:"533px",maxHeight:"90vh",background:"var(--card-background-color, #1c1c1c)",borderRadius:"var(--ha-dialog-border-radius, 28px)"};function findLovelacePanelRoot(){return document.querySelector("home-assistant")?.shadowRoot?.querySelector("home-assistant-main")?.shadowRoot?.querySelector("ha-panel-lovelace")?.shadowRoot||null}class ChronoPopupHost extends LitElement{static properties={_open:{state:!0},_loading:{state:!0},_error:{state:!0},_opts:{state:!0},_view:{state:!0}};constructor(){super(),this._open=!1,this._loading=!1,this._error=null,this._opts={},this._view=null,this._hassUnsub=null,this._onKeydown=this._onKeydown.bind(this)}connectedCallback(){super.connectedCallback(),document.addEventListener("keydown",this._onKeydown)}disconnectedCallback(){document.removeEventListener("keydown",this._onKeydown),this._unsubscribeFromUpdates(),super.disconnectedCallback()}_onKeydown(e){"Escape"===e.key&&this._open&&this.close()}_getHass(){const e=document.querySelector("home-assistant");return e?e.hass:void 0}async _subscribeToUpdates(e){if(this._unsubscribeFromUpdates(),e?.connection)try{this._hassUnsub=await subscribeEntities(e.connection,()=>{const e=this.renderRoot?.querySelector("hui-view");e&&(e.hass=this._getHass())})}catch(e){console.warn("chrono-popup: could not subscribe to entity updates - popup content will not update live",e)}}_unsubscribeFromUpdates(){if("function"==typeof this._hassUnsub)try{this._hassUnsub()}catch(e){}this._hassUnsub=null}async open(e={}){const t=findLovelacePanelRoot();t&&this.parentNode!==t&&t.appendChild(this);for(const t of Object.keys(e))KNOWN_DATA_KEYS.includes(t)||console.warn(`chrono-popup: unrecognized key "${t}" in event_data (view: "${e.view||"?"}"). Recognized keys: ${KNOWN_DATA_KEYS.join(", ")}. CSS goes under "styles:".`);const s=e.styles&&"object"==typeof e.styles?e.styles:{},o={};for(const e of STYLE_TARGETS)o[e]=s[e]&&"object"==typeof s[e]?s[e]:{};this._opts={title:e.title??"",dismissable:!1!==e.dismissable,styles:o},this._error=null,this._view=null,this._open=!0,this._loading=!0;const i=this._getHass();i&&this._subscribeToUpdates(i);try{this._view=await this._resolveView(e.view)}catch(e){this._error=e.message||String(e)}finally{this._loading=!1}}close(){this._open=!1,this._unsubscribeFromUpdates()}async _resolveView(e){if(!e||"string"!=typeof e)throw new Error('chrono-popup: "view" is required, e.g. "/my-dashboard/my-view"');const t=e.split("/").filter(Boolean);if(t.length<2)throw new Error(`chrono-popup: "view" must include both a dashboard and a view, e.g. "/my-dashboard/my-view" (got "${e}")`);const[s,o]=t,i=this._getHass();if(!i)throw new Error("chrono-popup: could not access hass - is Home Assistant fully loaded?");let r;try{r=await i.callWS({type:"lovelace/config",url_path:s})}catch(e){throw new Error(`chrono-popup: could not load dashboard "${s}" (${e.message||e})`)}const n=Array.isArray(r.views)?r.views:[],a=n.find(e=>e.path===o);if(!a)throw new Error(`chrono-popup: view "${o}" not found in dashboard "${s}"`);if(!this._isViewVisibleToUser(a,i))throw new Error(`chrono-popup: view "${o}" is not visible to the current user`);return{lovelace:{config:r,urlPath:s,editMode:!1},index:n.indexOf(a),viewConfig:a}}_isViewVisibleToUser(e,t){const s=t?.user?.id||null;if(!s||!e)return!0;const o=(Array.isArray(e.visible)&&e.visible.length?e.visible:null)||(Array.isArray(e.visibility)&&e.visibility.length?e.visibility:null)||(Array.isArray(e.users)&&e.users.length?e.users:null);if(!o)return!0;for(const e of o){if("string"==typeof e&&e===s)return!0;if(e&&"object"==typeof e){if("string"==typeof e.user&&e.user===s)return!0;if(Array.isArray(e.user)&&e.user.includes(s))return!0;if(Array.isArray(e.users)&&e.users.includes(s))return!0}}return!1}static styles=css`
    :host {
      display: contents;
    }
    .overlay {
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
      gap: 4px;
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
      margin-left: 4px;
    }
    .close-button {
      background: none;
      border: none;
      cursor: pointer;
      color: var(--primary-text-color, #fff);
      width: 24px;
      height: 24px;
      padding: 0;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
    }
    .close-button:hover {
      background: rgba(255, 255, 255, 0.1);
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
  `;render(){if(!this._open)return html``;const{title:e,dismissable:t,styles:s}=this._opts;return html`
      <div
        class="overlay"
        style=${styleMap(s.overlay)}
        @click=${e=>{t&&e.target===e.currentTarget&&this.close()}}
      >
        <div
          class="frame"
          style=${styleMap({...DEFAULT_FRAME_STYLES,...s.frame})}
        >
          <div class="header" style=${styleMap(s.header)}>
            <button class="close-button" style=${styleMap(s["close-button"])} @click=${()=>this.close()} aria-label="Close">
              <svg viewBox="0 0 24 24">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
            <span class="title" style=${styleMap(s.title)}>${e}</span>
          </div>
          <div class="body" style=${styleMap(s.body)}>
            ${this._loading?html`<div class="status" style=${styleMap(s.status)}>Loading…</div>`:""}
            ${this._error?html`<div class="status error" style=${styleMap(s.status)}>${this._error}</div>`:""}
            ${this._loading||this._error||!this._view?"":html`<hui-view
                  .hass=${this._getHass()}
                  .narrow=${!1}
                  .lovelace=${this._view.lovelace}
                  .index=${this._view.index}
                  .isStrategyView=${!1}
                  .viewConfig=${this._view.viewConfig}
                ></hui-view>`}
          </div>
        </div>
      </div>
    `}}if(customElements.get("chrono-popup-host")||customElements.define("chrono-popup-host",ChronoPopupHost),!window.__chronoPopupHostInstalled){window.__chronoPopupHostInstalled=!0;const e=document.createElement("chrono-popup-host");document.body.appendChild(e),document.addEventListener("ll-custom",t=>{const s=t.detail&&t.detail[EVENT_KEY];s&&e.open(s.data||{})})}
import{LitElement,html,css}from"https://unpkg.com/lit@2.0.0/index.js?module";import{styleMap}from"https://unpkg.com/lit@2.0.0/directives/style-map.js?module";const CARD_VERSION="0.1.4";console.info("%c CHRONO-%cPOPUP %c v0.1.4 ","background-color: #101010; color: #FFFFFF; font-weight: bold; padding: 2px 0 2px 4px; border-radius: 3px 0 0 3px;","background-color: #101010; color: #4676d3; font-weight: bold; padding: 2px 0 2px 0;","background-color: #1E1E1E; color: #FFFFFF; font-weight: bold; padding: 2px 4px; border-radius: 0 3px 3px 0;");const EVENT_KEY="chrono-popup";class ChronoPopupHost extends LitElement{static properties={_open:{state:!0},_loading:{state:!0},_error:{state:!0},_opts:{state:!0},_view:{state:!0}};constructor(){super(),this._open=!1,this._loading=!1,this._error=null,this._opts={},this._view=null,this._onKeydown=this._onKeydown.bind(this)}connectedCallback(){super.connectedCallback(),document.addEventListener("keydown",this._onKeydown)}disconnectedCallback(){document.removeEventListener("keydown",this._onKeydown),super.disconnectedCallback()}_onKeydown(e){"Escape"===e.key&&this._open&&this.close()}_getHass(){const e=document.querySelector("home-assistant");return e?e.hass:void 0}async open(e={}){this._opts={title:e.title??"",width:e.width??640,height:e.height??480,background:e.background??"var(--card-background-color, #1c1c1c)",radius:e.radius??12,dismissable:!1!==e.dismissable,styles:e.styles&&"object"==typeof e.styles?e.styles:{}},this._error=null,this._view=null,this._open=!0,this._loading=!0;try{this._view=await this._resolveView(e.view)}catch(e){this._error=e.message||String(e)}finally{this._loading=!1}}close(){this._open=!1}async _resolveView(e){if(!e||"string"!=typeof e)throw new Error('chrono-popup: "view" is required, e.g. "/my-dashboard/my-view"');const t=e.split("/").filter(Boolean);if(t.length<2)throw new Error(`chrono-popup: "view" must include both a dashboard and a view, e.g. "/my-dashboard/my-view" (got "${e}")`);const[o,i]=t,s=this._getHass();if(!s)throw new Error("chrono-popup: could not access hass - is Home Assistant fully loaded?");let r;try{r=await s.callWS({type:"lovelace/config",url_path:o})}catch(e){throw new Error(`chrono-popup: could not load dashboard "${o}" (${e.message||e})`)}const n=Array.isArray(r.views)?r.views:[],a=n.find(e=>e.path===i);if(!a)throw new Error(`chrono-popup: view "${i}" not found in dashboard "${o}"`);if(!this._isViewVisibleToUser(a,s))throw new Error(`chrono-popup: view "${i}" is not visible to the current user`);return{lovelace:{config:r,urlPath:o,editMode:!1},index:n.indexOf(a),viewConfig:a}}_isViewVisibleToUser(e,t){const o=t?.user?.id||null;if(!o||!e)return!0;const i=(Array.isArray(e.visible)&&e.visible.length?e.visible:null)||(Array.isArray(e.visibility)&&e.visibility.length?e.visibility:null)||(Array.isArray(e.users)&&e.users.length?e.users:null);if(!i)return!0;for(const e of i){if("string"==typeof e&&e===o)return!0;if(e&&"object"==typeof e){if("string"==typeof e.user&&e.user===o)return!0;if(Array.isArray(e.user)&&e.user.includes(o))return!0;if(Array.isArray(e.users)&&e.users.includes(o))return!0}}return!1}static styles=css`
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
  `;render(){if(!this._open)return html``;const{title:e,width:t,height:o,background:i,radius:s,dismissable:r,styles:n}=this._opts;return html`
      <div
        class="backdrop"
        @click=${e=>{r&&e.target===e.currentTarget&&this.close()}}
      >
        <div
          class="frame"
          style=${styleMap({width:`${t}px`,height:`${o}px`,background:i,borderRadius:`${s}px`,...n})}
        >
          <div class="header">
            <span class="title">${e}</span>
            <button class="close-btn" @click=${()=>this.close()} aria-label="Close">
              <svg viewBox="0 0 24 24">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
          </div>
          <div class="body">
            ${this._loading?html`<div class="status">Loading…</div>`:""}
            ${this._error?html`<div class="status error">${this._error}</div>`:""}
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
    `}}if(customElements.get("chrono-popup-host")||customElements.define("chrono-popup-host",ChronoPopupHost),!window.__chronoPopupHostInstalled){window.__chronoPopupHostInstalled=!0;const e=document.createElement("chrono-popup-host");document.body.appendChild(e),document.addEventListener("ll-custom",t=>{const o=t.detail&&t.detail[EVENT_KEY];o&&e.open(o.data||{})})}
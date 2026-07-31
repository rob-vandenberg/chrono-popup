  
 <div align="center">

  [![](https://img.shields.io/badge/HACS-Custom-orange.svg?style=for-the-badge)](https://github.com/hacs/integration)
  [![](https://img.shields.io/badge/License-AGPL_3.0-blue.svg?style=for-the-badge)](https://www.gnu.org/licenses/agpl-3.0)
  [![](https://img.shields.io/badge/Version-1.2.41-brightgreen.svg?style=for-the-badge)](#)

  <img src="art/header.svg" width="780" alt="Chrono Popup Banner">

  <img src="art/banner.png" width="800" alt="Chrono Popup in action">

  <p align="center">
    <strong>Show any Home Assistant dashboard view as a popup.<br>
            Design it visually, in the normal dashboard editor.<br>
            No custom layout code needed.</strong>
  </p>

  <p align="center">
    <a href="#introduction">Introduction</a> •
    <a href="#key-features">Key Features</a> •
    <a href="#installation">Installation</a> •
    <a href="#usage">Usage</a> •
    <a href="#license">License</a>
  </p>

</div>

---

**Chrono Popup** shows a dashboard **view** as a popup. You build the view visually, using HA's own dashboard editor - the same way you'd build any other page. Then you point the popup at it.

Chrono Popup is not a card. You don't add it to a dashboard, and it won't show up in the card picker. It's a resource: a small file that runs in the background. Once it's installed, any card can open a popup using its tap action.

---

## 📋 Table of Contents

- [Introduction](#introduction)
- [Key Features](#key-features)
- [Installation](#installation)
  - [HACS (Recommended)](#hacs-recommended)
  - [Manual Installation](#manual-installation)
- [Uninstallation](#uninstallation)
- [Usage](#usage)
  - [Opening a Popup](#opening-a-popup)
  - [Options](#options)
  - [Finding the view Path](#finding-the-view-path)
  - [Styling the Popup](#styling-the-popup)
- [Limitations](#limitations)
- [License](#license)
- [Support](#support)

---

## 🚀 Key Features

### 🖼️ Design Popups Visually
Build the popup's content as a normal view, using HA's own editor. No layout code needed.

### 🧩 Any View Type
Works with every view type: panel, masonry, sections, and sidebar. Whatever layout the view uses normally is what you'll see in the popup.

### 🔄 Genuinely Live
Cards inside the popup update live, the same as they would on a normal dashboard page.

### 📐 Auto-Sizing by Default
The popup sizes itself to fit its content. You don't need to set a width or height unless you want to.

### 🎨 One Place for All Styling
Change how the popup looks - size, color, spacing - using a single `styles:` block with normal CSS. You can also choose where the close button and title go, or hide either one.

### 🚫 Nothing Else to Install
Chrono Popup handles everything itself: opening the popup, showing it, and loading the view. Nothing else needs to be installed.

### 🔒 Respects View Visibility
If a view is hidden from a user in the dashboard editor, it stays hidden in the popup too.

---

## 📦 Installation

### HACS (Recommended)

1. Open **HACS** in your Home Assistant instance.
2. Navigate to **Frontend** and click the three-dot menu in the top right corner.
3. Select **Custom repositories**.
4. Enter `https://github.com/rob-vandenberg/chrono-popup` and select **Lovelace** as the category.
5. Click **Add**. The repository will appear in the list.
6. Search for `Chrono Popup` and click **Download**.
7. Reload your browser.

Chrono Popup is a resource, not a card - there's nothing to add to a dashboard afterward. Once it's loaded, any card's tap action can open a popup.

### Manual Installation

1. Download `chrono-popup.js` from the [latest release](https://github.com/rob-vandenberg/chrono-popup/releases/latest).
2. Copy it to your Home Assistant `config/www/` folder.
3. In Home Assistant, go to **Settings → Dashboards → Resources**.
4. Click **Add Resource**.
5. Enter `/local/chrono-popup.js` as the URL and select **JavaScript Module**.
6. Click **Create** and reload your browser.

---

## 🗑️ Uninstallation

### Via HACS
1. Open **HACS → Frontend**.
2. Find **Chrono Popup** and click the three-dot menu.
3. Select **Remove**.
4. Reload your browser.

### Manual
1. Delete `chrono-popup.js` from `config/www/`.
2. Remove the resource entry from **Settings → Dashboards → Resources**.

---

<img src="art/popup-example.png" width="800" alt="Chrono Popup showing a subview">

---

## ⚙️ Usage

### Opening a Popup

Add a `tap_action` to any card. Set the action to `fire-dom-event`, then add a `chrono-popup` block with your settings inside `data`.

The simplest possible example:

```yaml
tap_action:
  action: fire-dom-event
  chrono-popup:
    data:
      view: "/dashboard-popup/thermostat"
```

This opens the view at `/dashboard-popup/thermostat` as a popup. Nothing else is required.

Here's a fuller example, using more of the available options:

```yaml
tap_action:
  action: fire-dom-event
  chrono-popup:
    data:
      title: "Thermostat"
      view: "/dashboard-popup/thermostat"
      dismissable: true
      close-align: right
      title-align: center
      styles:
        frame:
          width: 640px
          height: 580px
          background: "#000000"
          border-radius: 50px
```

### Options

These go under `data:`.

| Key | Type | Default | What it does |
| :--- | :--- | :--- | :--- |
| `title` | text | (none) | Text shown at the top of the popup. Leave it out and the header disappears. |
| `view` | text | required | Which view to show. See [Finding the view Path](#finding-the-view-path) below. |
| `dismissable` | `true`/`false` | `true` | If `true`, clicking outside the popup closes it. |
| `close-align` | text | `left` | Where the close button sits: `left`, `right`, or `hidden`. |
| `title-align` | text | `left` | Where the title sits: `left`, `right`, `center`, or `hidden`. |
| `styles` | settings | (none) | Changes how the popup looks. See [Styling the Popup](#styling-the-popup) below. |

Using a key that isn't in this list, or a value that isn't valid, won't break the popup - it's just ignored, and a warning is written to the browser console.

### Finding the view Path

Go to the dashboard page you want to show in the popup. Look at your browser's address bar.

For example, if the address bar shows:

```
http://homeassistant.local:8123/dashboard-popup/thermostat
```

Then everything after your Home Assistant address is the view path:

```yaml
view: "/dashboard-popup/thermostat"
```

The default (unnamed) dashboard doesn't have a path, so it isn't supported. Your dashboard needs its own path first.

### Styling the Popup

Use `styles:` to change how the popup looks - size, color, spacing, anything CSS can do.

A simple example:

```yaml
styles:
  frame:
    width: 600px
    background: "#222222"
  title:
    color: "#ffffff"
    font-size: 1.5rem
```

This makes the popup 600px wide with a dark background, and the title bigger and white.

`styles:` is split into targets - one for each part of the popup:

| Target | What it changes |
| :--- | :--- |
| `overlay` | The dark background behind the popup |
| `frame` | The popup window itself |
| `header` | The bar at the top, when a title is shown |
| `title` | The title text |
| `close-button` | The close button |
| `body` | The area where your view is shown |
| `status` | The loading/error text, before the view loads |

Every target already looks fine by default. You only need to set the properties you want to change.

If there's no title (or `title-align: hidden`), the header disappears completely - it doesn't just look empty, it takes up no space at all. The close button doesn't depend on the header: it's always shown (unless you set `close-align: hidden`), and never takes up space of its own.

CSS custom properties (like `--my-color`) work in `styles:` too, and are the only way to reach into the cards inside your view.

---

## ⚠️ Limitations

- Only dashboards with their own path work. The default (unnamed) dashboard is not supported.
- Only real Lovelace views work. Auto-generated panels, like Music Assistant or Areas, don't.
- Only one popup shows at a time. Opening a new one closes the old one.
- Automations and scripts can't open a popup directly. It has to come from a tap action in the browser.

---

## ⚖️ License

**GNU Affero General Public License v3.0 (AGPL-3.0)**

This project is licensed under the AGPL-3.0. You are free to use, modify, and distribute this software, provided that any modifications or derivative works that are made available — including over a network — are also distributed under the same license.

Full license text: [https://www.gnu.org/licenses/agpl-3.0](https://www.gnu.org/licenses/agpl-3.0)

Copyright © 2026 Rob Vandenberg. All rights reserved.

---

## ☕ Support

If you find this project useful and wish to support its continued development, please consider a contribution.

[![](https://img.shields.io/badge/Buy_Me_A_Coffee-Support-yellow.svg?style=for-the-badge)](https://www.buymeacoffee.com/)

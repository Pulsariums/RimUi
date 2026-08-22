# RimWorld Forge

> Desktop mod manager for RimWorld — **Tauri 2 + TypeScript + Rust**.
> Profiles, smart sorting, SteamCMD workshop integration, 6 languages.

**🌍 Language:** [🇬🇧 English](README.md) · [🇹🇷 Türkçe](README.tr.md) · [🇩🇪 Deutsch](README.de.md) · [🇫🇷 Français](README.fr.md) · [🇪🇸 Español](README.es.md) · [🇷🇺 Русский](README.ru.md)

> 💡 GitHub shows the localized README based on your browser language. No localized file found? You'll see this English version — pick yours above.

## ✨ Features

- **Shelf-based UI** — Drag & drop between Library ↔ Active mods
- **Smart sorting** — RimSort 4-Tier + Kahn's algorithm (dependency resolution, cycle detection)
- **Profiles (Presets)** — Save / Apply / Duplicate, Default-Preset separation, right-click menu
- **Preset import / export** — RimSort (.rmod), RimPy (.json), ModsConfig.xml, plain text (.txt)
- **Missing mod detection** — `broken` / `missing` health indicators + one-click "Clean Missing"
- **Undo / Redo** — 30-step persistent history (configurable)
- **SteamCMD integration** — Workshop browse (scrape), batch download queue, updates
- **Localization** — Türkçe, English, Deutsch, Français, Español, Русский
- **Separate windows** — SteamCMD and Settings open in their own windows

## 📸 Screenshots

| Description | File |
|---|---|
| Main screen (command center + shelves + inspector) | `docs/screenshots/main.png` |
| Consistency conflict modal | `docs/screenshots/consistency.png` |
| Preset context menu (Clean Missing) | `docs/screenshots/preset-menu.png` |
| SteamCMD — Browse + detail gallery | `docs/screenshots/steamcmd.png` |
| Download queue + progress | `docs/screenshots/queue.png` |
| Settings window (language + paths) | `docs/screenshots/settings.png` |

<!-- 📸 Images not added yet: place them in docs/screenshots/. -->

## 🚀 Setup (Developer)

```bash
npm install          # dependencies
npm run tauri dev    # development mode
npm run build        # frontend build only
npm run tauri build  # distributable NSIS package
```

## ⚙️ Requirements

- **Node.js 18+** and **Rust (stable)**
- [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/) (Windows: WebView2, MSVC)
- **SteamCMD** (optional) — `steamcmd.exe` for download/update
- Steam Workshop data is fetched **without an API key** (scrape)

## 🎮 Usage Guide

1. **Path detection** — On first launch RimWorld and `ModsConfig.xml` paths are auto-detected (Steam / Heroic / custom path)
2. **Add mods** — Drag from the library to the active shelf or double-click
3. **Sort** — Command center `⤵ SORT` button, or `LAUNCH` auto-sorts
4. **Profiles** — `+` creates a new preset; right-click to manage / "Clean Missing"
5. **SteamCMD** — Command center `[STEAMCMD]` → Browse → click a card → "Add to Queue" → "Download Selected"

## 🧠 Architecture

```
src/                → TypeScript (frontend)
  components/       → mod-list, shared
  store/            → modStore, profileStore, settingsStore
  services/         → modService, i18nService, windowManager
  windows/          → steamcmd, settings (separate windows)
src-tauri/src/      → Rust (backend)
  mod_engine/       → xml_parser, sorter, dependency, fs_watcher
  data_store/       → cache (SQLite), profile (JSON)
  steamcmd.rs       → SteamCMD download/update (force_install_dir)
  workshop.rs       → Steam Workshop scrape (search + details)
```

## 🛠 SteamCMD & Steam Workshop

- **Browse / preview / description** → Steam community page is **scraped** (no key required)
- **Download / update** → `steamcmd +login anonymous +force_install_dir <Mods> +workshop_download_item 294100 <id>`
  - Mods are downloaded **directly** into the RimWorld `Mods` folder (no copy step)
- Add the `steamcmd.exe` path in **Settings → Folder Paths**

## 🌍 Localization

`src/i18n/{tr,en,de,fr,es,ru}.json` — the selected language is stored persistently; all windows update instantly.

## 📄 License

MIT



# RimWorld Forge

> Desktop-Mod-Manager für RimWorld — **Tauri 2 + TypeScript + Rust**.
> Profile, intelligentes Sortieren, SteamCMD-Workshop-Integration, 6 Sprachen.

**🌍 Sprache / Language:** [🇬🇧 English](README.md) · [🇹🇷 Türkçe](README.tr.md) · [🇩🇪 Deutsch](README.de.md) · [🇫🇷 Français](README.fr.md) · [🇪🇸 Español](README.es.md) · [🇷🇺 Русский](README.ru.md)

> 💡 GitHub zeigt das lokalisierte README automatisch anhand der Browsersprache an. Kein passendes gefunden? Dann erscheint die englische Version — oben deine Sprache wählen.

## ✨ Funktionen

- **Regalbasierte Oberfläche** — Drag & Drop zwischen Bibliothek ↔ aktiven Mods
- **Intelligentes Sortieren** — RimSort 4-Tier + Kahn-Algorithmus (Abhängigkeitsauflösung, Zykluserkennung)
- **Profile (Presets)** — Speichern / Anwenden / Duplizieren, Default-Preset-Trennung, Rechtsklick-Menü
- **Preset Import / Export** — RimSort (.rmod), RimPy (.json), ModsConfig.xml, reiner Text (.txt)
- **Fehlende Mods erkennen** — `beschädigt` / `fehlend` Statusanzeigen + "Fehlende bereinigen"
- **Rückgängig / Wiederholen** — 30 Schritte persistent (einstellbar)
- **SteamCMD-Integration** — Workshop durchsuchen (Scrape), Stapel-Download-Warteschlange, Updates
- **Mehrsprachig** — Türkçe, English, Deutsch, Français, Español, Русский
- **Getrennte Fenster** — SteamCMD und Einstellungen in eigenen Fenstern

## 📸 Screenshots

| Beschreibung | Datei |
|---|---|
| Hauptbildschirm (Kommandozentrale + Regale + Inspektor) | `docs/screenshots/main.png` |
| Konsistenzkonflikt-Modal | `docs/screenshots/consistency.png` |
| Preset-Rechtsklickmenü (Fehlende bereinigen) | `docs/screenshots/preset-menu.png` |
| SteamCMD — Entdecken + Detailgalerie | `docs/screenshots/steamcmd.png` |
| Download-Warteschlange + Fortschritt | `docs/screenshots/queue.png` |
| Einstellungen (Sprache + Pfade) | `docs/screenshots/settings.png` |

<!-- 📸 Bilder noch nicht hinzugefügt: in docs/screenshots/ ablegen. -->

## 🚀 Einrichtung (Entwickler)

```bash
npm install          # Abhängigkeiten
npm run tauri dev    # Entwicklungsmodus
npm run build        # nur Frontend bauen
npm run tauri build  # verteilbares NSIS-Paket
```

## ⚙️ Anforderungen

- **Node.js 18+** und **Rust (stable)**
- [Tauri v2 Voraussetzungen](https://v2.tauri.app/start/prerequisites/) (Windows: WebView2, MSVC)
- **SteamCMD** (optional) — `steamcmd.exe` für Download/Update
- Steam-Workshop-Daten werden **ohne API-Schlüssel** abgerufen (Scrape)

## 🎮 Bedienungsanleitung

1. **Pfaderkennung** — Beim ersten Start werden RimWorld- und `ModsConfig.xml`-Pfade automatisch erkannt (Steam / Heroic / eigener Pfad)
2. **Mods hinzufügen** — Aus der Bibliothek auf das aktive Regal ziehen oder doppelklicken
3. **Sortieren** — Kommandozentrale `⤵ SORTIEREN` oder `START` sortiert automatisch
4. **Profile** — `+` erstellt ein neues Preset; per Rechtsklick verwalten / "Fehlende bereinigen"
5. **SteamCMD** — Kommandozentrale `[STEAMCMD]` → Entdecken → Karte anklicken → "Zur Warteschlange" → "Ausgewählte herunterladen"

## 🧠 Architektur

```
src/                → TypeScript (Frontend)
  components/       → mod-list, shared
  store/            → modStore, profileStore, settingsStore
  services/         → modService, i18nService, windowManager
  windows/          → steamcmd, settings (eigene Fenster)
src-tauri/src/      → Rust (Backend)
  mod_engine/       → xml_parser, sorter, dependency, fs_watcher
  data_store/       → cache (SQLite), profile (JSON)
  steamcmd.rs       → SteamCMD Download/Update (force_install_dir)
  workshop.rs       → Steam-Workshop-Scrape (Suche + Details)
```

## 🛠 SteamCMD & Steam Workshop

- **Suchen / Vorschau / Beschreibung** → Steam-Community-Seite wird **gescraped** (kein Schlüssel nötig)
- **Download / Update** → `steamcmd +login anonymous +force_install_dir <Mods> +workshop_download_item 294100 <id>`
  - Mods werden **direkt** in den RimWorld-Ordner `Mods` geladen (kein Kopierschritt)
- `steamcmd.exe`-Pfad unter **Einstellungen → Ordnerpfade** hinzufügen

## 🌍 Mehrsprachigkeit

`src/i18n/{tr,en,de,fr,es,ru}.json` — die gewählte Sprache wird dauerhaft gespeichert; alle Fenster aktualisieren sofort.

## 📄 Lizenz

MIT

# RimWorld Forge

> Gestionnaire de mods de bureau pour RimWorld — **Tauri 2 + TypeScript + Rust**.
> Profils, tri intelligent, intégration SteamCMD, 6 langues.

**🌍 Langue / Language:** [🇬🇧 English](README.md) · [🇹🇷 Türkçe](README.tr.md) · [🇩🇪 Deutsch](README.de.md) · [🇫🇷 Français](README.fr.md) · [🇪🇸 Español](README.es.md) · [🇷🇺 Русский](README.ru.md)

> 💡 GitHub affiche automatiquement le README localisé selon la langue du navigateur. Aucun trouvé ? La version anglaise s'affiche — choisis la tienne ci-dessus.

## ✨ Fonctionnalités

- **Interface en étagères** — Glisser-déposer entre Bibliothèque ↔ mods actifs
- **Tri intelligent** — RimSort 4-Tier + algorithme de Kahn (résolution des dépendances, détection de cycles)
- **Profils (Presets)** — Enregistrer / Appliquer / Dupliquer, séparation Default-Preset, menu contextuel
- **Import / export de presets** — RimSort (.rmod), RimPy (.json), ModsConfig.xml, texte brut (.txt)
- **Détection des mods manquants** — indicateurs `cassé` / `manquant` + "Nettoyer les manquants" en un clic
- **Annuler / Rétablir** — historique persistant de 30 étapes (réglable)
- **Intégration SteamCMD** — Explorer le Workshop (scrape), file de téléchargement groupé, mises à jour
- **Multilingue** — Türkçe, English, Deutsch, Français, Español, Русский
- **Fenêtres séparées** — SteamCMD et Paramètres dans leurs propres fenêtres

## 📸 Captures d'écran

| Description | Fichier |
|---|---|
| Écran principal (centre de commande + étagères + inspecteur) | `docs/screenshots/main.png` |
| Modale de conflit de cohérence | `docs/screenshots/consistency.png` |
| Menu contextuel de preset (Nettoyer les manquants) | `docs/screenshots/preset-menu.png` |
| SteamCMD — Explorer + galerie de détails | `docs/screenshots/steamcmd.png` |
| File de téléchargement + progression | `docs/screenshots/queue.png` |
| Paramètres (langue + chemins) | `docs/screenshots/settings.png` |

<!-- 📸 Images non ajoutées : placez-les dans docs/screenshots/. -->

## 🚀 Installation (Développeur)

```bash
npm install          # dépendances
npm run tauri dev    # mode développement
npm run build        # compilation frontend uniquement
npm run tauri build  # package NSIS distribuable
```

## ⚙️ Prérequis

- **Node.js 18+** et **Rust (stable)**
- [Prérequis Tauri v2](https://v2.tauri.app/start/prerequisites/) (Windows : WebView2, MSVC)
- **SteamCMD** (optionnel) — `steamcmd.exe` pour téléchargement/mise à jour
- Les données du Workshop sont récupérées **sans clé API** (scrape)

## 🎮 Guide d'utilisation

1. **Détection des chemins** — Au premier lancement, RimWorld et `ModsConfig.xml` sont détectés automatiquement (Steam / Heroic / chemin personnalisé)
2. **Ajouter des mods** — Glissez depuis la bibliothèque vers l'étagère active ou double-cliquez
3. **Tri** — Bouton `⤵ TRIER` du centre de commande, ou `LANCER` trie automatiquement
4. **Profils** — `+` crée un nouveau preset ; clic droit pour gérer / "Nettoyer les manquants"
5. **SteamCMD** — Centre de commande `[STEAMCMD]` → Explorer → cliquer sur une carte → "Ajouter à la file" → "Télécharger la sélection"

## 🧠 Architecture

```
src/                → TypeScript (frontend)
  components/       → mod-list, shared
  store/            → modStore, profileStore, settingsStore
  services/         → modService, i18nService, windowManager
  windows/          → steamcmd, settings (fenêtres séparées)
src-tauri/src/      → Rust (backend)
  mod_engine/       → xml_parser, sorter, dependency, fs_watcher
  data_store/       → cache (SQLite), profile (JSON)
  steamcmd.rs       → téléchargement/mise à jour SteamCMD (force_install_dir)
  workshop.rs       → scrape du Workshop Steam (recherche + détails)
```

## 🛠 SteamCMD & Steam Workshop

- **Recherche / aperçu / description** → la page de la communauté Steam est **scrapée** (aucune clé requise)
- **Téléchargement / mise à jour** → `steamcmd +login anonymous +force_install_dir <Mods> +workshop_download_item 294100 <id>`
  - Les mods sont téléchargés **directement** dans le dossier RimWorld `Mods` (pas de copie)
- Ajoutez le chemin `steamcmd.exe` dans **Paramètres → Chemins de dossiers**

## 🌍 Multilingue

`src/i18n/{tr,en,de,fr,es,ru}.json` — la langue choisie est conservée ; toutes les fenêtres se mettent à jour instantanément.

## 📄 Licence

MIT

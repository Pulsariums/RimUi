# RimWorld Forge

> Gestor de mods de escritorio para RimWorld — **Tauri 2 + TypeScript + Rust**.
> Perfiles, ordenación inteligente, integración con SteamCMD, 6 idiomas.

**🌍 Idioma / Language:** [🇬🇧 English](README.md) · [🇹🇷 Türkçe](README.tr.md) · [🇩🇪 Deutsch](README.de.md) · [🇫🇷 Français](README.fr.md) · [🇪🇸 Español](README.es.md) · [🇷🇺 Русский](README.ru.md)

> 💡 GitHub muestra automáticamente el README localizado según el idioma del navegador. ¿No encontró ninguno? Verás la versión en inglés — elige la tuya arriba.

## ✨ Funciones

- **Interfaz de estantes** — Arrastrar y soltar entre Biblioteca ↔ mods activos
- **Ordenación inteligente** — RimSort 4-Tier + algoritmo de Kahn (resolución de dependencias, detección de ciclos)
- **Perfiles (Presets)** — Guardar / Aplicar / Duplicar, separación Default-Preset, menú contextual
- **Importar / exportar presets** — RimSort (.rmod), RimPy (.json), ModsConfig.xml, texto plano (.txt)
- **Detección de mods faltantes** — indicadores `roto` / `faltante` + "Limpiar faltantes" con un clic
- **Deshacer / Rehacer** — historial persistente de 30 pasos (configurable)
- **Integración SteamCMD** — Explorar el Workshop (scrape), cola de descarga masiva, actualizaciones
- **Multilingüe** — Türkçe, English, Deutsch, Français, Español, Русский
- **Ventanas separadas** — SteamCMD y Ajustes en ventanas propias

## 📸 Capturas de pantalla

| Descripción | Archivo |
|---|---|
| Pantalla principal (centro de comando + estantes + inspector) | `docs/screenshots/main.png` |
| Modal de conflicto de consistencia | `docs/screenshots/consistency.png` |
| Menú contextual de preset (Limpiar faltantes) | `docs/screenshots/preset-menu.png` |
| SteamCMD — Explorar + galería de detalles | `docs/screenshots/steamcmd.png` |
| Cola de descarga + progreso | `docs/screenshots/queue.png` |
| Ventana de ajustes (idioma + rutas) | `docs/screenshots/settings.png` |

<!-- 📸 Imágenes aún no añadidas: colócalas en docs/screenshots/. -->

## 🚀 Configuración (Desarrollador)

```bash
npm install          # dependencias
npm run tauri dev    # modo desarrollo
npm run build        # compilar solo frontend
npm run tauri build  # paquete NSIS distribuible
```

## ⚙️ Requisitos

- **Node.js 18+** y **Rust (stable)**
- [Prerrequisitos de Tauri v2](https://v2.tauri.app/start/prerequisites/) (Windows: WebView2, MSVC)
- **SteamCMD** (opcional) — `steamcmd.exe` para descargar/actualizar
- Los datos del Workshop se obtienen **sin clave API** (scrape)

## 🎮 Guía de uso

1. **Detección de rutas** — Al primer inicio, RimWorld y `ModsConfig.xml` se detectan automáticamente (Steam / Heroic / ruta personalizada)
2. **Añadir mods** — Arrastra desde la biblioteca al estante activo o haz doble clic
3. **Ordenar** — Botón `⤵ ORDENAR` del centro de comando, o `INICIAR` ordena automáticamente
4. **Perfiles** — `+` crea un nuevo preset; clic derecho para gestionar / "Limpiar faltantes"
5. **SteamCMD** — Centro de comando `[STEAMCMD]` → Explorar → clic en una tarjeta → "Añadir a la cola" → "Descargar selección"

## 🧠 Arquitectura

```
src/                → TypeScript (frontend)
  components/       → mod-list, shared
  store/            → modStore, profileStore, settingsStore
  services/         → modService, i18nService, windowManager
  windows/          → steamcmd, settings (ventanas separadas)
src-tauri/src/      → Rust (backend)
  mod_engine/       → xml_parser, sorter, dependency, fs_watcher
  data_store/       → cache (SQLite), profile (JSON)
  steamcmd.rs       → descarga/actualización SteamCMD (force_install_dir)
  workshop.rs       → scrape del Workshop de Steam (búsqueda + detalles)
```

## 🛠 SteamCMD y Steam Workshop

- **Explorar / vista previa / descripción** → se hace **scrape** de la página de la comunidad de Steam (sin clave)
- **Descargar / actualizar** → `steamcmd +login anonymous +force_install_dir <Mods> +workshop_download_item 294100 <id>`
  - Los mods se descargan **directamente** en la carpeta RimWorld `Mods` (sin copiar)
- Añade la ruta de `steamcmd.exe` en **Ajustes → Rutas de carpetas**

## 🌍 Multilingüe

`src/i18n/{tr,en,de,fr,es,ru}.json` — el idioma elegido se guarda de forma persistente; todas las ventanas se actualizan al instante.

## 📄 Licencia

MIT

# RimWorld Forge

> Десктопный менеджер модов для RimWorld — **Tauri 2 + TypeScript + Rust**.
> Профили, умная сортировка, интеграция со SteamCMD, 6 языков.

**🌍 Язык / Language:** [🇬🇧 English](README.md) · [🇹🇷 Türkçe](README.tr.md) · [🇩🇪 Deutsch](README.de.md) · [🇫🇷 Français](README.fr.md) · [🇪🇸 Español](README.es.md) · [🇷🇺 Русский](README.ru.md)

> 💡 GitHub автоматически показывает локализованный README по языку браузера. Не нашёл подходящий? Отобразится английская версия — выбери свою выше.

## ✨ Возможности

- **Интерфейс-полки** — Перетаскивание между Библиотекой ↔ активными модами
- **Умная сортировка** — RimSort 4-Tier + алгоритм Кана (разрешение зависимостей, обнаружение циклов)
- **Профили (Пресеты)** — Сохранить / Применить / Дублировать, разделение Default-Preset, контекстное меню
- **Импорт / экспорт пресетов** — RimSort (.rmod), RimPy (.json), ModsConfig.xml, простой текст (.txt)
- **Обнаружение потерянных модов** — индикаторы `сломан` / `потерян` + «Очистить потерянные» в один клик
- **Отмена / Повтор** — постоянная история на 30 шагов (настраивается)
- **Интеграция SteamCMD** — просмотр мастерской (scrape), очередь массовой загрузки, обновления
- **Многоязычность** — Türkçe, English, Deutsch, Français, Español, Русский
- **Отдельные окна** — SteamCMD и Настройки в своих окнах

## 📸 Скриншоты

| Описание | Файл |
|---|---|
| Главный экран (командный центр + полки + инспектор) | `docs/screenshots/main.png` |
| Модальное окно конфликта консистентности | `docs/screenshots/consistency.png` |
| Контекстное меню пресета (Очистить потерянные) | `docs/screenshots/preset-menu.png` |
| SteamCMD — Обзор + галерея деталей | `docs/screenshots/steamcmd.png` |
| Очередь загрузки + прогресс | `docs/screenshots/queue.png` |
| Окно настроек (язык + пути) | `docs/screenshots/settings.png` |

<!-- 📸 Изображения ещё не добавлены: положите их в docs/screenshots/. -->

## 🚀 Установка (Разработчик)

```bash
npm install          # зависимости
npm run tauri dev    # режим разработки
npm run build        # сборка только frontend
npm run tauri build  # распространяемый пакет NSIS
```

## ⚙️ Требования

- **Node.js 18+** и **Rust (stable)**
- [Предварительные требования Tauri v2](https://v2.tauri.app/start/prerequisites/) (Windows: WebView2, MSVC)
- **SteamCMD** (опционально) — `steamcmd.exe` для загрузки/обновления
- Данные мастерской Steam получаются **без ключа API** (scrape)

## 🎮 Руководство по использованию

1. **Определение путей** — При первом запуске пути RimWorld и `ModsConfig.xml` определяются автоматически (Steam / Heroic / свой путь)
2. **Добавление модов** — Перетащите из библиотеки на активную полку или сделайте двойной клик
3. **Сортировка** — Кнопка `⤵ СОРТИРОВАТЬ` в командном центре, или `ЗАПУСК` сортирует автоматически
4. **Профили** — `+` создаёт новый пресет; правый клик для управления / «Очистить потерянные»
5. **SteamCMD** — Командный центр `[STEAMCMD]` → Обзор → клик по карточке → «В очередь» → «Скачать выбранные»

## 🧠 Архитектура

```
src/                → TypeScript (frontend)
  components/       → mod-list, shared
  store/            → modStore, profileStore, settingsStore
  services/         → modService, i18nService, windowManager
  windows/          → steamcmd, settings (отдельные окна)
src-tauri/src/      → Rust (backend)
  mod_engine/       → xml_parser, sorter, dependency, fs_watcher
  data_store/       → cache (SQLite), profile (JSON)
  steamcmd.rs       → загрузка/обновление SteamCMD (force_install_dir)
  workshop.rs       → scrape мастерской Steam (поиск + детали)
```

## 🛠 SteamCMD и мастерская Steam

- **Просмотр / превью / описание** → страница сообщества Steam **скрапится** (ключ не нужен)
- **Загрузка / обновление** → `steamcmd +login anonymous +force_install_dir <Mods> +workshop_download_item 294100 <id>`
  - Моды загружаются **напрямую** в папку RimWorld `Mods` (без копирования)
- Добавьте путь к `steamcmd.exe` в **Настройки → Пути к папкам**

## 🌍 Многоязычность

`src/i18n/{tr,en,de,fr,es,ru}.json` — выбранный язык сохраняется; все окна обновляются мгновенно.

## 📄 Лицензия

MIT

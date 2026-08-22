# RimWorld Forge

> RimWorld için masaüstü mod yöneticisi — **Tauri 2 + TypeScript + Rust**.
> Profiller, akıllı sıralama, SteamCMD atölye entegrasyonu, 6 dil.

**🌍 Dil / Language:** [🇬🇧 English](README.md) · [🇹🇷 Türkçe](README.tr.md) · [🇩🇪 Deutsch](README.de.md) · [🇫🇷 Français](README.fr.md) · [🇪🇸 Español](README.es.md) · [🇷🇺 Русский](README.ru.md)

> 💡 GitHub, tarayıcı diline göre yerelleştirilmiş README'yi otomatik gösterir. Eşleşen sürüm yoksa İngilizce görünür — yukarıdan kendi dilini seçebilirsin.

## ✨ Özellikler

- **Raf tabanlı arayüz** — Kütüphane ↔ Aktif modlar arasında sürükle-bırak
- **Akıllı sıralama** — RimSort 4-Tier + Kahn algoritması (bağımlılık çözümü, döngü tespiti)
- **Profiller (Preset)** — Kaydet / Uygula / Çoğalt, Default-Preset ayrımı, sağ tık menüsü
- **Preset içe / dışa aktarma** — RimSort (.rmod), RimPy (.json), ModsConfig.xml, düz metin (.txt)
- **Kayıp mod tespiti** — `bozuk` / `kayıp` sağlık göstergeleri + tek tıkla "Kayıpları Temizle"
- **Geri Al / İleri Al** — 30 adımlık kalıcı geçmiş (ayarlanabilir)
- **SteamCMD entegrasyonu** — Workshop'ta keşfet (scrape), toplu indirme kuyruğu, güncelleme
- **Çok dillilik** — Türkçe, English, Deutsch, Français, Español, Русский
- **Ayrı pencereler** — SteamCMD ve Ayarlar ayrı pencerelerde

## 📸 Ekran Görüntüleri

| Açıklama | Dosya |
|---|---|
| Ana ekran (komut merkezi + raflar + detay paneli) | `docs/screenshots/main.png` |
| Tutarlılık çakışması modalı | `docs/screenshots/consistency.png` |
| Preset sağ tık menüsü (Kayıpları Temizle) | `docs/screenshots/preset-menu.png` |
| SteamCMD — Keşfet + detay galerisi | `docs/screenshots/steamcmd.png` |
| İndirme kuyruğu + ilerleme | `docs/screenshots/queue.png` |
| Ayarlar penceresi (dil + yollar) | `docs/screenshots/settings.png` |

<!-- 📸 Görseller henüz eklenmedi: docs/screenshots/ klasörüne koyun. -->

## 🚀 Kurulum (Geliştirici)

```bash
npm install          # bağımlılıklar
npm run tauri dev    # geliştirme modu
npm run build        # yalnızca frontend derleme
npm run tauri build  # dağıtılabilir NSIS paketi
```

## ⚙️ Gereksinimler

- **Node.js 18+** ve **Rust (stable)**
- [Tauri v2 ön koşulları](https://v2.tauri.app/start/prerequisites/) (Windows: WebView2, MSVC)
- **SteamCMD** (opsiyonel) — indirme/güncelleme için `steamcmd.exe`
- Steam Workshop verileri **API anahtarı gerektirmeden** (scrape) çekilir

## 🎮 Kullanım Kılavuzu

1. **Yol tespiti** — İlk açılışta RimWorld ve `ModsConfig.xml` yolları otomatik bulunur (Steam / Heroic / özel yol)
2. **Mod ekleme** — Kütüphaneden aktif rafa sürükle veya çift tıkla
3. **Sıralama** — Komut merkezi `⤵ SIRALA` butonu veya `BAŞLAT` otomatik sıralar
4. **Profil** — `+` ile yeni preset; sağ tık ile yönet / "Kayıpları Temizle"
5. **SteamCMD** — Komut merkezi `[STEAMCMD]` → Keşfet → kart'a tıkla → "Kuyruğa Ekle" → "Seçilenleri İndir"

## 🧠 Mimari

```
src/                → TypeScript (frontend)
  components/       → mod-list, shared
  store/            → modStore, profileStore, settingsStore
  services/         → modService, i18nService, windowManager
  windows/          → steamcmd, settings (ayrı pencereler)
src-tauri/src/      → Rust (backend)
  mod_engine/       → xml_parser, sorter, dependency, fs_watcher
  data_store/       → cache (SQLite), profile (JSON)
  steamcmd.rs       → SteamCMD indirme/güncelleme (force_install_dir)
  workshop.rs       → Steam Workshop scrape (arama + detay)
```

## 🛠 SteamCMD & Steam Workshop

- **Tarama / görsel / açıklama** → Steam topluluk sayfası **scrape** edilir (anahtar gerektirmez)
- **İndirme / güncelleme** → `steamcmd +login anonymous +force_install_dir <Mods> +workshop_download_item 294100 <id>`
  - Modlar **doğrudan** RimWorld `Mods` klasörüne iner (kopyalama adımı yok)
- `steamcmd.exe` yolunu **Ayarlar → Klasör Yolları**'na ekleyin

## 🌍 Çok Dillilik

`src/i18n/{tr,en,de,fr,es,ru}.json` — seçilen dil kalıcı saklanır; tüm pencereler anlık güncellenir.

## 📄 Lisans

MIT

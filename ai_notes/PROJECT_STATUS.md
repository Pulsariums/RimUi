# Proje Durum Panosu (Notion Style) & Kullanıcı Emirleri

## 1. Kullanıcı Emirleri (Kelimesi Kelimesine / Word-for-Word)

> "naber"
> "selam"
> "selam"
> "selam"
> "rimworld nedir"
> "hedefimiz rimworld modlu oynamaya yardım eden araçların daha iyisini yapmak. arayüz tercihimizi yaapacaz ialtyapıyı planlayacaz bunun için ilk aşama araştırma aşamasıdır. kıytırık araştırma yapmayacaksın. önce mevcut araçları bualcaksın açık kaynaklarsa veri edineceksin dökümanlarını okyacaksın mevcut araçlara alternatifleri bualcaksın. mevucta araçlar hakkındaki kullanıcı sohbetlerini bulacaksın ."
> "olabilecek en hafif arayüzü tasarlayacaz altyapıda rust kullanacağız. indirem boyutu küçük olmalı toplam gereksini m ve tek exe dosyası rahat çalışmalı. qt avalonia pyside 6 vb her arayüz tercihii tart. kalite indirme boyutu falan diye . bu şey hem linuxda hem windwsta çalışacak. steam cmd desteği de oalcak kendi içinde. diğer tüm rimworld mod yöneticilerinde olan çeyler de oalcak"
> "ama web wiew meselesi beni korkutuyor. çalışmama durumları riskleri neler"
> "Modern ve Şık (Tauri) - Modern görünüm, yüksek kalite, %99 stabilite."
> "hazırlığı yapalım önce plan dosyaalrını derle gereksiz bilgileri ayıkla. ve tekil bir dosyaya indirge ai notes adlı bir klasöre koy. sonra aşama aşama yol haritamızı yazacaz. ama ai notesde yeni dosyaada yazacaz. genişletmeye alt görevlere sahip bişi olmalı. yol haritamızda programda olacak her özellik arayüz arka plan her özellik ve özelliğin işleyiişi bağlantıları olacak. ekstra fikşrklerin ve notlarını da yazacksın"
> "temel kuralları genişlet bundan daha fazla vizyoumuz var. tüm özellik yapı mimari her şeyi"
> "fazlalık dosyaları belirle dosay kalabalığı istemiyorum"
> "göreve başla ilk planı yap. alt işlerde 20 30 işi aynı anda yap hiç sorun değil gemma kullan"
> "sıradaki işe geçmeden öcne planyapalım alt görev yapıldı sanırım"
> "planını ve durumu benime mirlerimi kelimesi kelimesine ai notes kısmında yaz başka süreçten devamedecez. görevleri notiondaki gibi gruplaara durumlara ayaıracaz"
> "dur durumu özet geç bide aia notesde kod ayz a kuralları koymuştum oku"
> "analize devam et"
> "sıkıtnı var bunun başlamasına sebep oaln emsleyi çöz yine süt çubuk falan yok. css html ile çozmeye çalışmayı bırak. bu bir uygulama tauri kısmından galelt emsleleri dış mesleleri."
> "sana 2 görsel attım görlsellerden neyi hatalı yaptığını analyabilirsin"
> "hallet şu işi"
> "eskisinden iyi olsafad buyuk sorunalr avr. 1. sorunsen o sürüklenebilir olam oalayını fully anlış analamışsın o arama kısmının olduğu eyr sağ tarafı uzatınca altta kalıyor gridlere eklenmemiş. ki o orada olmamalı sürüklenebilir kısım en sütte en en üstte yukarda olnalı normal oalrak bir cubuk olmalı. ikonalr beğeneim o ikonalrı kullan. . dur şu an kdo ayzma . gridlerin yapısı ver birbiriyle yükseklikerl ive etkileşimleri ve içerillerini listele"
> "hepsini çöz"
> "be gerzek soldaki sidevar ve sağdaki ksıım hala titlebar ın üstünde nasıl olab,lir .en son doğruluk kontrolü yapmadın diye olyu obu. sohebt geçmişine güvenme"
> "durumu analiz et ai notesde eski sohbet yorunalrım emirlerimi anımsa . yeni sohbete geçeceğim için ihtiyacı oalcak ehr veriyi yaz"

---

## 2. Mevcut Proje Durumu (Güncel - 05.07.2026)

### 🟢 Çözülen Kritik Sorunlar

#### A. Sonsuz Tauri Yeniden Derleme Döngüsü (Infinite Rebuild Loop)
- **Sebep:** `src-tauri/mods_cache.db` SQLite dosyası, geliştirme sırasında `src-tauri/` içine yazılıyordu ve Tauri watcher'ı tetikliyordu.
- **Çözüm:** [`src-tauri/src/data_store/cache.rs`](src-tauri/src/data_store/cache.rs) içinde `CacheEngine::new()` metodu, göreceli yolları otomatik olarak `%LOCALAPPDATA%/RimWorldModHelper/` dizinine yönlendirecek şekilde değiştirildi. Mutlak yollar dokunulmadan bırakıldı.

#### B. Pencere Kontrolleri Tıklanamıyor (Window Controls Unresponsive)
- **Sebep:** `<header>` elementinde `data-tauri-drag-region` bulunuyordu, bu da tüm tıklama olaylarını işletim sistemi sürükleme mekanizmasına yönlendiriyordu.
- **Çözüm:** Sürükleme bölgesi, `z-0` katmanında `absolute` bir arka plan `div`'ine taşındı. Etkileşimli öğeler `z-10 relative pointer-events-auto` ile üst katmana alındı.

#### C. Flexbox Çökmesi / Mod Listesi Boş Görünüyor (UI Squeezing)
- **Sebep:** `flex-grow-0 flex-shrink-0` kullanılan paneller boş olduğunda `0px`'e çöküyordu.
- **Çözüm:** [`index.html`](index.html) içinde `ui-library-pane` ve `ui-active-pane` elementlerine `style="flex-basis: 50%"` eklendi.

#### D. TypeScript Derleme Hataları
- **Çözüm:** Kullanılmayan importlar (`ModMetadata` içinde [`ModList.ts`](src/components/mod-list/ModList.ts), `modList` içinde [`main.ts`](src/main.ts)) temizlendi. `npm run build` sıfır hata ile tamamlanıyor.

#### E. UI Hiyerarşisi ve Grid Düzeni (En Son Düzeltme)
- **Sebep:** TitleBar (sürükleme alanı + pencere kontrolleri) ile CommandBar (arama, butonlar) aynı hiyerarşideydi. Sol sidebar ve sağ inspector paneli TitleBar'ın üstünde kalıyordu.
- **Çözüm:**
  1. [`index.html`](index.html:29) içinde `#app-shell` artık `flex-col` yapıda. En üstte global `#ui-title-bar` (tüm genişlikte, sadece sürükleme + min/max/close).
  2. TitleBar'ın altında `flex flex-1 overflow-hidden` ile ana içerik alanı (sidebar + commandbar + workspace + inspector).
  3. [`#ui-command-bar`](index.html:59) artık `grid grid-cols-[200px_1fr_auto]` yapısında: sol (profil bilgisi), orta (genişleyen arama çubuğu), sağ (aksiyon butonları - SteamCMD, Ayarlar, Run).
  4. Pencere kontrolleri (`btn-window-min`, `btn-window-max`, `btn-window-close`) artık sadece `#ui-title-bar` içinde, diğer butonlardan tamamen izole.
  5. [`src/styles.css`](src/styles.css:195) içine shimmer animasyonu ve title-bar hover efektleri eklendi.

---

## 3. Mevcut Layout Hiyerarşisi (Güncel)

```
#app-shell (flex-col, h-screen)
│
├── #ui-title-bar (h-8, GLOBAL - tüm genişlikte)
│   ├── [data-tauri-drag-region] (absolute, z-0)
│   ├── Sol: Uygulama Kimliği (pointer-events-none)
│   └── Sağ: Pencere Kontrolleri (min/max/close)
│
└── [flex flex-1 overflow-hidden] (ANA İÇERİK)
    │
    ├── #ui-preset-strip (w-12, sol sidebar)
    │   └── Profil slotları, + butonu
    │
    ├── #ui-main-container (flex-col, flex-1)
    │   ├── #ui-command-bar (h-16, grid: [200px 1fr auto])
    │   │   ├── Sol: Profil bilgisi + indikatör
    │   │   ├── Orta: Arama çubuğu (max-w-xl, genişleyen)
    │   │   └── Sağ: SteamCMD, Ayarlar, Run butonları
    │   │
    │   └── #ui-workspace (flex, flex-1)
    │       ├── #ui-library-pane (sol raf, flex-basis:50%)
    │       ├── #left-right-splitter (ayraç)
    │       └── #ui-active-pane (sağ raf, flex-basis:50%)
    │
    ├── #main-inspector-splitter (ayraç)
    │
    └── #ui-inspector (w-80, sağ detay paneli)
```

---

## 4. Notion Tarzı Görev Veritabanı (Notion-Style Task Board)

### 📋 GRUP A: Altyapı ve Hazırlık (Infrastructure & Base Setup)
| Görev Adı | Durum (Status) | Öncelik (Priority) | Sorumlu | Notlar |
| :--- | :---: | :---: | :---: | :--- |
| Tauri Proje Kurulumu | 🟢 Tamamlandı (Done) | Yüksek | Rust Core | Vite + Vanilla TS kurulumu yapıldı. |
| Cargo.toml Optimizasyonu | 🟢 Tamamlandı (Done) | Yüksek | Rust Core | LTO, opt-level="z" ve strip aktif. |
| Rust-JS Köprü Kurulumu | 🟢 Tamamlandı (Done) | Yüksek | Tauri Bridge | Invoke ve Event mekanizmaları kuruldu. |

### 🧠 GRUP B: Çekirdek Mod Motoru (Core Mod Engine)
| Görev Adı | Durum (Status) | Öncelik (Priority) | Sorumlu | Notlar |
| :--- | :---: | :---: | :---: | :--- |
| `About.xml` Ayrıştırıcı | 🟢 Tamamlandı (Done) | En Yüksek | xml_parser.rs | `quick-xml` ile sıfır kopya parser yazıldı. |
| `ModsConfig.xml` Ayrıştırıcı | 🟢 Tamamlandı (Done) | En Yüksek | xml_parser.rs | Aktif mod sırasını okuma. |
| Bağımlılık Grafiği (DAG) | 🟢 Tamamlandı (Done) | En Yüksek | dependency.rs | `petgraph` dairesel referans kontrolü dahil. |
| Topluluk Sıralama Kuralları | 🟢 Tamamlandı (Done) | Yüksek | sorter.rs | RimPy kuralları ve kategori/alfabetik fallback. |
| Atomik Dosya Yazıcı | 🟢 Tamamlandı (Done) | Yüksek | orchestrator.rs | `.tmp` üzerinden güvenli yazma ve yedekleme. |
| SQLite Meta-veri Önbelleği | 🟢 Tamamlandı (Done) | Yüksek | cache.rs | `rusqlite` ile dosya modifikasyon zamanı takibi. |
| Profil Kayıt/Yükleme | 🟢 Tamamlandı (Done) | Orta | profile.rs | JSON profilleri okuma/yazma. |

### 🔌 GRUP C: SteamCMD ve Dosya Entegrasyonu (SteamCMD & FS Integration)
| Görev Adı | Durum (Status) | Öncelik (Priority) | Sorumlu | Notlar |
| :--- | :---: | :---: | :---: | :--- |
| SteamCMD JIT İndirici | 🟡 Devam Ediyor (In Progress) | Yüksek | SteamCMD Mgr | Eksikse otomatik indirme katmanı yazılıyor. |
| Asenkron CLI Wrapper | ⚪ Başlanmadı (To Do) | Yüksek | SteamCMD Mgr | `tokio::process` ile CLI çıktısını okuma. |
| Regex İlerleme Ayrıştırıcı | ⚪ Başlanmadı (To Do) | Orta | SteamCMD Mgr | İndirme yüzdesini JS tarafına gönderme. |
| VFS / Symlink - Junction | ⚪ Başlanmadı (To Do) | En Yüksek | FS Wrapper | Win'de Junction, Linux'ta Symlink kullanımı. |
| Temiz Kurulum (Mod Purge) | ⚪ Başlanmadı (To Do) | Orta | FS Wrapper | Tüm linkleri temizleyip vanilla oyuna dönme. |

### 🪓 GRUP D: Gelişmiş Çakışma Analizi (Advanced Conflict Analysis)
| Görev Adı | Durum (Status) | Öncelik (Priority) | Sorumlu | Notlar |
| :--- | :---: | :---: | :---: | :--- |
| XML Patch Derin Tarayıcı | ⚪ Başlanmadı (To Do) | En Yüksek | Conflict Engine| `Patches/` klasöründeki XML'leri okuma. |
| Node Hedef Takipçisi | ⚪ Başlanmadı (To Do) | En Yüksek | Conflict Engine| Hangi XPath düğümlerinin etkilendiğini bulma. |
| XML Çakışma Karşılaştırıcı | ⚪ Başlanmadı (To Do) | Yüksek | Conflict Engine| Çakışan modları tespit edip Diff verisi oluşturma. |
| Manuel Öncelik Ezme (Override) | ⚪ Başlanmadı (To Do) | Orta | Conflict Engine| Kullanıcının çakışma durumunda "Kazanan" seçmesi. |

### 🎨 GRUP E: Kullanıcı Arayüzü (User Interface)
| Görev Adı | Durum (Status) | Öncelik (Priority) | Sorumlu | Notlar |
| :--- | :---: | :---: | :---: | :--- |
| Sanal Liste (Virtualized List) | 🟢 Tamamlandı (Done) | En Yüksek | Frontend | 1000+ mod için 60 FPS performans sağlandı. |
| Sürükle-Bırak Sıralama | 🟢 Tamamlandı (Done) | Yüksek | Frontend | Drag-and-drop ile elle sıralama sistemi. |
| Gösterge Paneli (Dashboard) | 🟢 Tamamlandı (Done) | Orta | Frontend | Özet istatistikler ve hızlı işlem butonları. |
| Yan Detay Paneli | 🟢 Tamamlandı (Done) | Düşük | Frontend | Seçilen modun About.xml detayları ve logları. |
| Çakışma Çözüm Arayüzü (Diff) | ⚪ Başlanmadı (To Do) | Yüksek | Frontend | XML dosyalarını yan yana gösteren görsel diff. |
| Ayarlar & Profil Yönetimi | 🟢 Tamamlandı (Done) | Orta | Frontend | Yol tanımlamaları ve JSON profil aktarımları. |

### 📦 GRUP F: Cila ve Dağıtım (Polish & Distribution)
| Görev Adı | Durum (Status) | Öncelik (Priority) | Sorumlu | Notlar |
| :--- | :---: | :---: | :---: | :--- |
| RAM & CPU Profiling | ⚪ Başlanmadı (To Do) | Orta | - | Peak yük altında bellek tüketim optimizasyonu. |
| Strip & Asset Sıkıştırma | ⚪ Başlanmadı (To Do) | Orta | Release Script | İkonların ve CSS/HTML kodlarının sıkıştırılması. |
| Portable EXE / AppImage | ⚪ Başlanmadı (To Do) | Yüksek | CI/CD | Windows için tek çalışabilir dosya, Linux için paket. |

---

## 5. Kodlama Standartları (AI Talimatları)

Detaylı standartlar için [`ai_notes/coding_standards.md`](ai_notes/coding_standards.md) dosyasına bakın.

---

## 6. Kritik Uyarılar ve Yapılacaklar

### ⚠️ Hala Çözülmemiş / Dikkat Edilmesi Gerekenler

1. **TitleBar Hiyerarşisi (ÇÖZÜLDÜ):** `#ui-title-bar` artık global seviyede, tüm genişlikte ve en üstte. Sidebar ve inspector paneli onun altında.
2. **DB Yolu (ÇÖZÜLDÜ):** Göreceli yollar `%LOCALAPPDATA%/RimWorldModHelper/`'e yönlendiriliyor.
3. **Pencere Kontrolleri (ÇÖZÜLDÜ):** TitleBar içinde, diğer butonlardan izole.
4. **Grid Düzeni (ÇÖZÜLDÜ):** CommandBar `grid-cols-[200px_1fr_auto]` yapısında.
5. **Derleme (ÇÖZÜLDÜ):** `npm run build` sıfır hata ile tamamlanıyor.

### 📝 Bir Sonraki Adım İçin Öneriler
1. **SteamCMD Hub UI:** `btn-open-steamcmd` butonuna tıklandığında SteamCmdHub bileşenini açma.
2. **Mod Arama Filtreleme:** `mod-search` input'u çalışıyor ancak geliştirilebilir (debounce, gelişmiş filtreler).
3. **Profil Yönetimi:** Profil silme/çoğaltma/yeniden adlandırma context menu ile çalışıyor, ancak profil verilerinin kalıcı kaydı (backend) henüz tam entegre değil.
4. **Çakışma Çözüm Arayüzü:** GRUP D'deki XML çakışma analizi ve görsel diff arayüzü henüz başlanmadı.

---

## 7. Önemli Dosya Referansları

| Dosya | Açıklama |
| :--- | :--- |
| [`index.html`](index.html) | Ana HTML yapısı, layout hiyerarşisi |
| [`src/main.ts`](src/main.ts) | Uygulama giriş noktası, App sınıfı, event listener'lar |
| [`src/styles.css`](src/styles.css) | Endüstriyel tema, CSS değişkenleri, animasyonlar |
| [`src-tauri/src/lib.rs`](src-tauri/src/lib.rs) | Tauri komutları, Rust-Frontend köprüsü |
| [`src-tauri/src/data_store/cache.rs`](src-tauri/src/data_store/cache.rs) | SQLite cache motoru, yol yönlendirme mantığı |
| [`src-tauri/tauri.conf.json`](src-tauri/tauri.conf.json) | Tauri yapılandırması, pencere ayarları (`decorations: false`) |
| [`src/components/mod-list/ModList.ts`](src/components/mod-list/ModList.ts) | Mod listesi render, sürükle-bırak |
| [`src/store/modStore.ts`](src/store/modStore.ts) | Mod durum yönetimi (filtreleme, sıralama, gruplama) |
| [`src/store/settingsStore.ts`](src/store/settingsStore.ts) | Ayarlar durum yönetimi (yollar, db_path) |
| [`ai_notes/coding_standards.md`](ai_notes/coding_standards.md) | Kodlama standartları ve AI talimatları |
| [`ai_notes/detailed_plan.md`](ai_notes/detailed_plan.md) | Mimari kararlar, webview riskleri, ek fikirler ve notlar |

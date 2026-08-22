# 🪟 Çoklu Pencere Mimarisi Planı (Multi-Window Architecture)

Bu doküman, mevcut tek pencere yapısının Tauri v2 ve Vite 6 kullanılarak çoklu pencere mimarisine dönüştürülmesi için gerekli olan teknik stratejiyi ve uygulama adımlarını içerir.

## 🎯 Hedefler
- Mevcut "overlay/modal" yapılarını (`SteamCmdHub` ve `SettingsModal`) bağımsız Tauri pencerelerine taşımak.
- Vite üzerinden çoklu giriş noktası (Multi-Page App - MPA) yapılandırması kurmak.
- Her pencere için Singleton pattern uygulayarak mükerrer pencere açılımını önlemek.
- Endüstriyel tasarım dilini (`slate` + `#0f172a`) tüm pencerelerde korumak.

---

## 🛠️ Teknik Strateji

### 1. Vite Multi-Page Yapılandırması
Vite varsayılan olarak tek bir `index.html` bekler. Çoklu pencere için `vite.config.ts` içerisinde `rollupOptions.input` tanımlanarak farklı HTML giriş noktaları oluşturulacaktır.

**Giriş Noktaları:**
- `index.html` $\rightarrow$ Ana Uygulama Penceresi
- `settings.html` $\rightarrow$ Ayarlar Penceresi
- `steamcmd.html` $\rightarrow$ SteamCMD / Mod Yönetim Penceresi

### 2. Tauri Pencere Yönetimi (Window Management)
Pencereler `tauri.conf.json` içerisinde statik olarak tanımlanmak yerine, `@tauri-apps/api/webviewWindow` API'si kullanılarak dinamik olarak yönetilecektir.

**Singleton Stratejisi:**
Bir `WindowManager` servis katmanı oluşturulacaktır. Bu servis:
1. İstenen pencere etiketine (`label`) sahip bir pencerenin açık olup olmadığını kontrol eder.
2. Pencere açıksa: `window.setFocus()` ile pencereyi ön plana getirir.
3. Pencere kapalıysa: `new WebviewWindow(options)` ile yeni pencereyi oluşturur.

---

## 📁 Dosya Yapısı Değişiklikleri

### Yeni Oluşturulacak Dosyalar
```text
/
├── index.html                 # Ana pencere (Mevcut)
├── settings.html              # Ayarlar penceresi HTML giriş noktası
├── steamcmd.html              # SteamCMD penceresi HTML giriş noktası
└── src/
    └── windows/
        ├── window-manager.ts  # Singleton pencere yönetim servisi
        ├── settings/
        │   ├── main.ts        # Ayarlar penceresi entry point
        │   ├── settings-window.ts # Ana konteyner
        │   └── components/    # Sidebar, General, Paths, Advanced, About
        └── steamcmd/
            ├── main.ts        # SteamCMD penceresi entry point
            ├── steamcmd-window.ts # Ana konteyner
            └── components/    # SearchBar, FilterChips, ModTable, DetailPanel
```

### Değiştirilecek Dosyalar
- `vite.config.ts`: `rollupOptions` eklenerek MPA yapılandırması yapılacak.
- `src-tauri/tauri.conf.json`: Mevcut pencere ayarları optimize edilecek, gerekirse `capabilities` güncellenecek.
- `src/components/shared/SettingsModal.ts` $\rightarrow$ `src/windows/settings/` altına taşınacak ve refactor edilecek.
- `src/components/steamcmd/SteamCmdHub.ts` $\rightarrow$ `src/windows/steamcmd/` altına taşınacak ve yeniden yazılacak.

---

## 🚀 Uygulama Adımları (Bağımlılık Sırasına Göre)

### Adım 1: Altyapı ve Vite Yapılandırması
1. `settings.html` ve `steamcmd.html` dosyalarının kök dizine oluşturulması.
2. `vite.config.ts` dosyasında `build.rollupOptions.input` kısmına bu dosyaların eklenmesi.
3. Yeni HTML dosyalarının içine ilgili `.ts` entry point'lerinin (`src/windows/.../main.ts`) bağlanması.

### Adım 2: Window Manager Servisi
1. `src/windows/window-manager.ts` dosyasının oluşturulması.
2. `openWindow(label: string, options: WindowOptions)` metodunun implementasyonu.
3. Singleton mantığının (açıksa focusla, kapalıysa yarat) kurulması.

### Adım 3: Ayarlar Penceresi (Settings Window)
1. `src/windows/settings/main.ts` ile başlatma mantığının kurulması.
2. **Layout Tasarımı:**
   - Sol: Sabit genişlikte `Sidebar` (General, Paths, Advanced, About).
   - Sağ: Seçili sekmeye göre değişen `ContentArea`.
3. Mevcut `SettingsModal` mantığının bu yapıya taşınması.
4. Boyutlandırma: `700x550`, `resizable: true`.

### Adım 4: SteamCMD Penceresi (SteamCMD Window)
1. `src/windows/steamcmd/main.ts` ile başlatma mantığının kurulması.
2. **İç Yapı Tasarımı:**
   - Üst: `Search Bar` + `Filter Chips` (Kategoriler, Versiyonlar).
   - Orta: `Mod List Table` (Sıralanabilir kolonlar).
   - Yan/Alt: `Detail Panel` (Seçili modun detayları, açıklama, versiyon geçmişi).
3. `SteamCmdHub`'ın modal yapısından tamamen kurtarılıp genişletilmiş bir dashboard'a dönüştürülmesi.
4. Boyutlandırma: `900x650`, `resizable: true`.

### Adım 5: Ana Pencere Entegrasyonu
1. Ana penceredeki `[AYAR]` butonunun `WindowManager.openWindow('settings')` fonksiyonunu çağırması.
2. Ana penceredeki `[STEAMCMD]` butonunun `WindowManager.openWindow('steamcmd')` fonksiyonunu çağırması.
3. Mevcut modal/overlay tetikleyicilerinin temizlenmesi.

---

## 🎨 Tasarım ve UX Kılavuzu

### Renk Paleti
- **Background:** `#0f172a` (Slate 950)
- **Surface/Card:** `#1e293b` (Slate 800)
- **Border:** `#334155` (Slate 700)
- **Accent:** Mevcut endüstriyel mavi/slate tonları.
- **Text:** `slate-200` (Primary), `slate-400` (Secondary).

### Pencere Davranışları
| Pencere | Boyut | Decorations | Resizable | Singleton |
| :--- | :--- | :--- | :--- | :--- |
| Ana Pencere | 1020x720 | False | True | Yes |
| Ayarlar | 700x550 | True | True | Yes |
| SteamCMD | 900x650 | True | True | Yes |

---

## ⚠️ Kritik Uyarılar
- **Z-Index & Focus:** `WebviewWindow` API kullanırken pencerelerin odaklanma sırasına dikkat edilmelidir.
- **State Paylaşımı:** Pencereler arası state yönetimi için mevcut `store/` yapısı (Zustand/Custom Store) kullanılmaya devam edilmelidir. Tauri v2'de her pencere ayrı bir JS context'ine sahip olduğu için, store'ların `localStorage` veya Tauri'nin `state` yönetim mekanizmasıyla senkronize olduğundan emin olunmalıdır.
- **Vite HMR:** Çoklu sayfa yapısında HMR'ın her pencere için doğru çalıştığını doğrulamak gerekir.

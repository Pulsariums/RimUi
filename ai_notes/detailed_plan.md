# RimWorld Mod Yöneticisi: Detaylı Yol Haritası ve Mimari Plan

Bu belge, RimWorld Mod Yöneticisi projesinin mimari kararlarını ve ileriye dönük notlarını içerir. Güncel görev durumu için [`PROJECT_STATUS.md`](PROJECT_STATUS.md)'ye bakın.

---

## Hedef ve Temel Kurallar

- **Hedef:** RimWorld modlu oynama deneyimini zenginleştiren, hafif, hızlı, platformlar arası (Windows/Linux), tekil çalıştırılabilir, webview risklerini minimize eden bir araç.
- **Minimalizm & Performans:** Rust backend + saf TypeScript frontend (framework yok), ultra küçük boyut/RAM/CPU.
- **Platform Bağımsızlığı:** Windows + Linux (Tauri + Rust).
- **UX:** Modern, RimWorld temalı karanlık mod, sezgisel arayüz.
- **Güvenilirlik:** Atomik dosya işlemleri, yedekleme, sağlam hata yönetimi.
- **Topluluk:** RimPy sıralama kuralları entegrasyonu.

---

## Mimari Genel Bakış (Architectural Overview)

### A. Frontend (Arayüz)
*   **Teknoloji:** Saf TypeScript, Vite, HTML, CSS (Vanilla JS felsefesi).
*   **Çerçeve (Framework):** Yok (Tauri'nin webview motorunu kullanacak).
*   **Durum Yönetimi:** `src/store/` altında kendi basit, reaktif durum yönetimi (modStore, profileStore, settingsStore).
*   **İletişim:** `src/services/tauriBridge.ts` üzerinden Rust backend ile (`@tauri-apps/api/tauri` `invoke` ve `emit/listen` mekanizmaları).
*   **Bileşenler:** Sanal liste (virtual list) tabanlı, sürükle-bırak destekli mod listesi, dinamik profil seçici, ayar ve hata/çakışma gösterim modalları.

### B. Backend (Mod Motoru)
*   **Teknoloji:** Rust (performans, güvenlik, sistem entegrasyonu).
*   **Ana Modüller:**
    *   `mod_engine/xml_parser.rs`: `About.xml` ve `ModsConfig.xml` için hızlı, zero-copy XML ayrıştırma.
    *   `mod_engine/dependency.rs`: `petgraph` kullanarak mod bağımlılık grafiği (DAG) oluşturma ve döngüsel bağımlılık tespiti.
    *   `mod_engine/sorter.rs`: RimPy kuralları, kategori ve alfabetik sıralama algoritmaları.
    *   `mod_engine/orchestrator.rs`: `ModsConfig.xml`'i güvenli (atomik) bir şekilde güncelleme, yedekleme ve geri yükleme.
    *   `data_store/cache.rs`: Dosya değiştirme zamanına (modification timestamp) dayalı SQLite tabanlı meta-veri önbelleği.
    *   `data_store/profile.rs`: Mod profillerini (aktif mod listesi, sıralama) JSON formatında kaydetme/yükleme.
    *   `steamcmd_manager/`: SteamCMD ile entegrasyon (indir, güncelle, atölye modlarını yönet).
    *   `conflict_resolver/`: XML yama (patch) dosyalarını analiz ederek mod çakışmalarını tespit etme ve çözüm önerileri sunma.

### C. Webview Riskleri
Kullanıcının webview ile ilgili endişeleri anlaşılmıştır. Tauri, webview teknolojisini kullanmasına rağmen, doğrudan Electron gibi Chromium tabanlı büyük bir tarayıcı motorunu paketlemek yerine, işletim sisteminin kendi webview bileşenini (Windows'ta WebView2, Linux'ta WebKitGTK) kullanır. Bu yaklaşım şu avantajları sağlar:
*   **Daha Küçük Boyut:** Uygulama boyutu önemli ölçüde küçülür, çünkü tarayıcı motoru zaten işletim sisteminde mevcuttur.
*   **Daha Az Kaynak Tüketimi:** İşletim sisteminin optimize edilmiş bileşenleri kullanıldığı için RAM ve CPU tüketimi daha düşüktür.
*   **Daha İyi Güvenlik:** İşletim sistemi webview bileşenleri genellikle daha sık güncellenir ve güvenlik yamaları daha hızlı gelir.
*   **%99 Stabilite:** Tauri'nin vaat ettiği yüksek stabilite, bu yerel webview entegrasyonundan kaynaklanır.
*   **Çözüm:** Tauri'nin bu avantajları, potansiyel riskleri minimize etmek için önemli bir temel oluşturur. Geliştirme sürecinde, webview ile ilgili olası sorunları (örneğin, belirli Linux dağıtımlarındaki WebKitGTK sürüm farklılıkları) ele almak için kapsamlı testler ve geri dönüş mekanizmaları (örneğin, hata mesajları veya alternatif webview kütüphanelerine geçiş imkanı) düşünülecektir.

---

## 3. Ek Fikirler ve Notlar (Additional Ideas & Notes)

### A. Geliştirici Tarafı
*   **Modüler Yapı:** Backend'de her bir ana özelliğin (XML parser, sıralayıcı, SteamCMD entegrasyonu, çakışma çözücü) ayrı bir Rust crate'i veya modülü olarak tasarlanması, test edilebilirliği ve bakımı kolaylaştırır.
*   **Test Kapsamı:** Özellikle backend'de kritik algoritmalar (sıralama, bağımlılık çözme, XML işleme) için kapsamlı unit ve entegrasyon testleri yazmak.
*   **Hata İzleme:** Üretim ortamında oluşan hataları toplamak için küçük, gizlilik odaklı bir hata raporlama sistemi entegre edilebilir (opsiyonel).

### B. Kullanıcı Tarafı
*   **Kullanıcı Rehberleri:** Uygulama içinde veya bir Wiki'de detaylı kullanım kılavuzları, çakışma çözüm ipuçları, SteamCMD entegrasyonu hakkında bilgiler sunulması.
*   **Mod Koleksiyonları:** Kullanıcıların mod listelerini başkalarıyla paylaşmak için basit bir dışa aktarma/içe aktarma özelliği.
*   **Performans İzleme (Gelişmiş):** Oyun içindeki modların yarattığı FPS düşüşü veya yüklenme süresi gibi metrikleri izleyebilen (RimWorld modları ile entegre bir eklenti vasıtasıyla) daha gelişmiş bir sistem. Bu çok ileri bir özellik olup, başlangıçta düşünülmeyebilir.
*   **RimWorld Versiyon Uyumluluğu:** Modların hangi RimWorld versiyonlarıyla uyumlu olduğunu otomatik olarak kontrol etme (About.xml'deki `supportedVersions` alanından).
*   **Otomatik Mod Temizliği:** Eski veya bozuk mod dosyalarını tespit edip kullanıcıya temizleme önerisi sunma.

### C. Gelecek Vizyonu
*   **Çevrimiçi Mod Veritabanı Entegrasyonu:** Steam Atölyesi dışındaki mod kaynakları (örneğin, GitHub, forumlar) ile entegrasyon, bu modların takibi ve güncellenmesi.
*   **AI Destekli Mod Önerileri:** Kullanıcının oynama stiline veya favori modlarına göre yeni modlar önerebilen basit bir yapay zeka entegrasyonu.
*   **Gelişmiş Mod Oluşturma Araçları:** Basit XML düzenleme veya mod paketleme için entegre araçlar.

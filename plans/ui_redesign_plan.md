# Arayüz Yeniden Tasarım Planı (UI Redesign Plan) - Kapsamlı Versiyon

Bu belge, RimWorld Mod Helper'ın sadece görsel değil, aynı zamanda işlevsel mimarisini yeniden tanımlar. Uygulama, "düzenleme" odaklı bir araçtan, "yönetim ve optimizasyon" odaklı bir ekosisteme dönüştürülmektedir.

## 1. Fonksiyonel Ağaç Yapısı ve İşlevsel Detaylar

Sistem, hiyerarşik bir sahiplik ve yönetim modeline dayanır.

- **RimWorld Mod Helper**
    - **Sistem ve Altyapı (Infrastructure)**
        - 📂 **Akıllı Yol Tespiti**:
            - Sadece dosya yolu bulmakla kalmaz, yolun yazılabilir olduğunu ve `ModsConfig.xml`'in geçerli bir XML olduğunu doğrular.
        - 🔄 **Ekosistem Yedekleme**:
            - Profil yapılandırmaları + Grup tanımlamaları + Uygulama ayarlarını tek bir paket (`.json`) olarak dışa aktarma/içe aktarma.
    - **Profil ve Raf (Grup) Yönetimi**
        - 👤 **Profil Yaşam Döngüsü**:
            - **Yeni Profil**: Tamamen boş bir sayfa açar. Varsayılan olarak grup içermez.
            - **Profil Çoğaltma (Duplicate)** $\leftarrow$ *TEMEL ÖZELLİK*: Mevcut bir profilin tüm mod listesini ve grup (raf) yapılandırmasını birebir kopyalar. Bu, farklı mod varyasyonlarını (rotasyonları) hızlıca denemek için kullanılır.
            - **Profil Düzenleme/Silme**: İsim değişikliği ve veri temizliği.
        - 📁 **Raf (Group) Sistemi**:
            - **Sahiplik**: Raf, belirli bir profile aittir. A profilindeki "Savaş Modları" rafı, B profilinde mevcut değildir.
            - **Çift Yönlü Görünüm**: Raflar hem "Aktif Modlar" hem de "Pasif Modlar" listesinde görünür. Bir mod raf içindeyse, aktif veya pasif olmasına bakılmaksızın o rafın altında listelenir.
            - **Sıkıştırma/Genişletme**: Raflar, içeriğini gizleyebilen (collapse) veya gösterebilen (expand) dinamik konteynerlardır.
    - **Mod Motoru ve Akıllı Sıralama**
        - 🔍 **Veri Madenciliği (Scanning)**: Mod klasöründeki tüm meta verilerin SQLite üzerinden hızlıca önbelleğe alınması.
        - 📏 **Görünmez Sıralama (Background Sorting)** $\leftarrow$ *FELSEFE DEĞİŞİKLİĞİ*:
            - **UI'da Sıralama**: Kullanıcının arayüzdeki mod sırası önemsizdir. Arayüz sadece "Hangi modlar aktif?" ve "Hangi mod hangi grupta?" sorularına yanıt verir.
            - **Arka Plan Motoru**: Topolojik sıralama ve topluluk kuralları tamamen arka planda çalışır.
            - **Doğrulama**: Oyun başlatılacağı an, aktif modların bağımlılık zinciri son bir kez kontrol edilir. Eğer çözülemeyen bir döngü veya eksik bağımlılık varsa, kullanıcıya "Sıralama Hatası" bildirilir.
        - 🛠️ **Konfigürasyon Yazımı**: `ModsConfig.xml` dosyasına atomik ve güvenli yazma.
    - **Harici Araçlar**
        - 📦 **SteamCMD Hub**:
            - SteamCMD'nin yolunu tanımlama.
            - Mod ID'leri üzerinden otomatik indirme/güncelleme.
            - Aktif profildeki "eksik" modları tespit edip tek tıkla yükleme.
    - **Ayarlar**
        - Tema (Dark/Light/RimWorld), Dil seçimi ve uygulama davranış ayarları.

---

## 2. UI/UX Betimlemeli Tasarım

Yeni arayüz, kullanıcıyı karmaşadan kurtarıp "raf" mantığıyla modlarını organize etmesini sağlar.

### 🗺️ Genel Layout: Sidebar Dashboard
Sol tarafta sabit bir navigasyon menüsü, sağ tarafta ise seçili sayfaya göre değişen geniş bir içerik alanı.

### 📦 Mod Listesi: "The Shelf" (Raf Sistemi)
Bu ekran uygulamanın kalbidir ve şu şekilde betimlenir:
- **Ekran İkiye Bölünmüş**: Sol panel "Aktifler", sağ panel "Pasifler".
- **Raf Görünümü**: 
    - Modlar düz bir liste değil, "Raflar" (Groups) içinde durur.
    - Bir raf; üstte başlığı olan, altında modların sıralandığı bir kutudur.
    - **Etkileşim**: Raf başlığına tıklandığında, raf "küçülür" (Sadece başlık görünür, yükseklik minimuma iner) veya "genişler" (İçindeki tüm modlar görünür).
    - **Sürükle-Bırak**: Modlar raflar arasında veya aktif/pasif paneller arasında taşınabilir. Rafın kendisi de bir bütün olarak karşı panele taşınabilir (Raf içindeki tüm modları aynı anda aktif/pasif yapar).

### 👤 Profil Merkezi: "Rotation Hub"
- **Profil Kartları**: Her profil, mod sayısı ve grup sayısını gösteren bir karttır.
- **Hızlı Rotasyon**: Her kartın üzerinde "Çoğalt" (Duplicate) butonu bulunur. Kullanıcı "Combat_Build_V1" profilini çoğaltıp "Combat_Build_V2" yaparak sadece 1-2 mod değiştirip farkı gözlemleyebilir.

### 🚀 Başlatma ve Doğrulama Akışı
- **Başlat Butonu**: Ana panelde belirgin bir "RimWorld'ü Başlat" butonu.
- **Süreç**: `Butona Tıkla` $\rightarrow$ `Sıralamayı Arka Planda Doğrula` $\rightarrow$ `Hata Yoksa ModsConfig.xml'i Yaz` $\rightarrow$ `Oyunu Çalıştır`.

---

## 3. Görsel Kimlik ve UI Spesifikasyonları (Visual Identity)

Sıradan bir uygulama görünümünden çıkıp "Endüstriyel Yönetim Aracı" estetiğine geçiş yapılır.

### 🎨 Renk Paleti & Temalandırma
- **Ana Arkaplan**: `slate-950` (#020617) - Derin uzay siyahı.
- **Panel Arkaplanları**: `slate-900/50` ile `slate-800` arası geçişler. Cam efekti (`backdrop-blur-xl`) kullanımı.
- **Vurgu Rengi (Accent)**: `orange-600` (#ea580c) - RimWorld'ün endüstriyel ve sıcak tonlarını anımsatır. Kritik butonlarda ve aktif durumlarda kullanılır.
- **Başarı/Onay**: `emerald-500` (#10b981) - Güvenli ve geçerli durumlar için.
- **Hata/Kritik**: `red-500` (#ef4444) - Sıralama hataları ve silme işlemleri için.
- **Yazı Renkleri**: `slate-100` (Ana metin), `slate-400` (Yardımcı metin), `slate-500` (Pasif/Placeholder).

### 🔘 Komponent Stil Rehberi
- **Butonlar**:
    - `rounded-xl` (12px) köşe yumuşatma.
    - Hover durumunda `shadow-lg shadow-orange-900/20` ile derinlik hissi.
    - Aktif butonlarda `ring-2 ring-orange-500` ile net odaklanma.
- **Konteynerlar (Raflar)**:
    - `border-slate-800` ince çerçeveler.
    - `shadow-inner` ile içeri gömülü hissi veren panel yapıları.
    - Geçişler: `duration-300 ease-in-out` ile yumuşak genişleme/daralma.
- **İkonografi**:
    - Tüm kritik aksiyonlar için `Lottie` animasyonları kullanılır (Örn: Kaydet $\rightarrow$ disk ikonu, Tara $\rightarrow$ büyüteç).
    - İkonlar `w-5 h-5` standart boyutunda ve metinle aynı hizada olur.

## 4. Entegrasyon Matrisi (İşlevsel İlişkiler)

Sistemin parçaları arasındaki veri ve tetikleme akışı şu şekildedir:

| Modül | Tetikleyici $\rightarrow$ Hedef | Etki / İlişki |
| :--- | :--- | :--- |
| **Profil** | $\rightarrow$ **Mod Store** | Profil değiştiğinde `ModStore` içindeki aktif mod listesi ve **Raf (Group)** tanımları tamamen yenilenir. |
| **Raf** | $\rightarrow$ **Mod Store** | Bir modun rafa eklenmesi/çıkarılması `ModStore.groups` yapısını günceller ve anında UI'a yansır. |
| **SteamCMD** | $\rightarrow$ **Profil** | Hub, aktif profildeki mod listesini okur ve eksik olanları "Yükle" listesine ekler. |
| **Sıralama** | $\rightarrow$ **Launch** | "Başlat" butonuna basıldığında, arka plandaki `validate_sorting` sonucu `true` ise oyun başlatılır, `false` ise hata modalı açılır. |
| **Ayarlar** | $\rightarrow$ **Sistem** | Yol değişikliği yapıldığında tüm `ModService` ve `ProfileService` işlemleri yeni yollarla yeniden başlatılır. |

---

## 5. Teknik Uygulama Detayları

### 💾 Veri Yapısı Değişiklikleri
- **`ModProfile` (src/types/profile.ts)**: `groups` dizisinin sahipliği kesinleştirilecek. Profil kopyalama işlemi sırasında bu dizi de derin kopyalanacak.
- **`ModStore` (src/store/modStore.ts)**: 
    - `reorderMods` gibi manuel sıralama fonksiyonları UI'dan kaldırılacak veya ikincil plana itilecek.
    - Raf (Group) yönetimi için `expand/collapse` durumları store seviyesinde tutulacak.

### 🛠️ Component Refaktörü
- **`ModList.ts`**: Mevcut "Shelf" mantığı, betimlenen "daraltılabilir/genişletilebilir" yapıya göre yeniden yazılacak.
- **`ProfileManager.ts`**: "Profil Çoğaltma" mantığı ve yeni kart tasarımı eklenecek.
- **`ModItem.ts`**: Sadece mod bilgisini ve aktiflik durumunu gösteren, sıralama kontrolleri içermeyen sade bir yapıya dönecek.

### ⚙️ Backend (Rust) Genişletme
- **Sıralama Kontrolü**: `sort_mods` komutu, sadece sıralamakla kalmayıp, sıralamanın "geçerli" (valid) olup olmadığını dönen bir kontrol mekanizmasına dönüştürülecek.
- **SteamCMD**: `std::process::Command` kullanılarak SteamCMD CLI ile etkileşime giren yeni modüller eklenecek.

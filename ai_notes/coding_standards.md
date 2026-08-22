# Kodlama Standartları ve AI Talimatları

Bu belge, projeye eklenen her yeni özelliğin ve bileşenin uyması gereken teknik standartları tanımlar. AI modelleri kod üretirken bu kuralları temel almalıdır.

## 1. Frontend Mimari (TypeScript)

### Bileşen Yapısı
- **Sınıf Tabanlı:** Tüm UI bileşenleri bir `class` olarak tanımlanmalıdır.
- **Options Deseni:** Constructor, bileşen konfigürasyonu için bir `interface` (örn: `ComponentNameOptions`) almalıdır.
- **DOM Yönetimi:** Herhangi bir framework (React, Vue vb.) kullanılmaz. Elementler saf JavaScript/TypeScript ile `document.createElement` kullanılarak oluşturulur.
- **Element Erişimi:** Oluşturulan ana HTML elementi `public element: HTMLElement` (veya spesifik tipi) olarak tanımlanmalı ve dışarıya açılmalıdır. Bu, üst bileşenlerin elementi kolayca ekleyebilmesini sağlar.
- **İlklendirme:** DOM oluşturma ve başlangıç konfigürasyonu mantığı `private create...()` metodunda toplanmalıdır.

### Tip Güvenliği
- **Union Types:** Varyasyonlar (boyut, tip, durum) için genel `string` tipi yerine kesin union tipler kullanılmalıdır.
  - Örnek: `type ButtonSize = "sm" | "md" | "lg";`
- **Interface Kullanımı:** Tüm seçenekler ve veri modelleri için `interface` tanımlanmalıdır.

## 2. Stil ve Görsel Dil (CSS)

### Dosya Yapısı
- **Eşleşen Dosyalar:** Her `.ts` bileşen dosyasına karşılık gelen aynı isimde bir `.css` dosyası olmalıdır (Örn: `Button.ts` $\rightarrow$ `Button.css`).
- **Import:** CSS dosyası, ilgili `.ts` dosyasının en üstünde `import "./ComponentName.css";` şeklinde import edilmelidir.

### Temalandırma ve CSS Değişkenleri
- **Hard-coded Renk Yasaktır:** Renkler, kenarlıklar ve gölgeler için asla sabit renk kodları (#fff, red vb.) kullanılmamalıdır. Bunun yerine mutlaka `var(--color-...)` şeklinde global CSS değişkenleri kullanılmalıdır.
- **Industrial Tema:** Görsel dil RimWorld'ün endüstriyel ve mekanik temasına (koyu gri, pas rengi, metalik tonlar) uygun olmalıdır.

### Varyasyon Yönetimi
- **Base + Modifier Yaklaşımı:** 
  - Temel stiller (layout, font, transition) için bir ana sınıf tanımlanmalıdır (Örn: `.btn-industrial`).
  - Renk, boyut veya durum gibi özelleştirmeler için modifier sınıflar eklenmelidir (Örn: `.btn-primary`, `.btn-sm`, `.btn-danger`).
  - TypeScript tarafında bu sınıflar, `options` değerlerine göre dinamik olarak `classList.add()` ile eklenmelidir.

## 3. Genel Kurallar
- **Performans:** Gereksiz DOM manipülasyonundan kaçınılmalıdır.
- **İsimlendirme:** Kod içi isimlendirmeler (değişken, fonksiyon, sınıf) açıklayıcı ve İngilizce olmalıdır.
- **Modülerlik:** Her bileşen sadece kendi sorumluluğunu üstlenmelidir (Single Responsibility Principle).
- **Hata Yönetimi:** Kritik işlemler `try-catch` blokları ile sarmalanmalı ve kullanıcıya `Toast` veya `Modal` üzerinden geri bildirim verilmelidir.
- **Dosya Boyutu Sınırı:** Hiçbir dosya (kod veya not) 200 satırı geçmemelidir. Sınır yaklaşıldığında dosya mantıksal parçalara ayrılmalı ve alt klasörler kullanılarak organize edilmelidir.

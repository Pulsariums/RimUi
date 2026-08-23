//! Steam Workshop verilerini Steam topluluk sayfalarını scrape ederek çeker.
//! Anahtar (API key) gerektirmez.
//!
//! Steam, workshop browse sayfasını React ile hashed class isimleriyle render
//! eder (`.workshopItem` gibi eski sınıflar artık yok). Bu yüzden burada class
//! isimlerine DEĞİL, stabil yapısal kalıplara güvenilir:
//!   - item linki:  sharedfiles/filedetails/?id=<NUMARIK_ID>
//!   - başlık:      <img ... alt="BAŞLIK">
//!   - yazar:       >By YAZAR</a>
//!   - önizleme:    <img ... src="steamusercontent/...">
//!
//! Detay tarafı eski layout'u korur (filedetails sayfası):
//!   - yazar adı:   friendBlockContent
//!   - ekran görüntüleri: #highlight_strip img

use regex::Regex;
use serde::{Deserialize, Serialize};

const APP_ID: &str = "294100";
const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkshopItem {
    pub id: String,
    pub title: String,
    pub author: String,
    pub preview_url: String,
    /// Modun desteklediği en yüksek RimWorld sürümü (ör. "1.6"). Etikette yoksa boş.
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkshopDetails {
    pub id: String,
    pub title: String,
    pub description: String,
    pub preview_url: String,
    pub screenshots: Vec<String>,
    pub author: String,
    /// Modun desteklediği en yüksek RimWorld sürümü (ör. "1.6"). Etikette yoksa boş.
    pub version: String,
    pub file_size: u64,
    pub time_updated: u64,
    pub subscriptions: u64,
    pub favorites: u64,
    pub score: f64,
    pub votes_up: u64,
    pub votes_down: u64,
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(UA)
        .build()
        .map_err(|e| format!("HTTP istemcisi oluşturulamadı: {e}"))
}

/// HTML varlıklarını çöz (href/src metinlerindeki &amp; vb.)
fn decode_entities(s: &str) -> String {
    s.replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
}

/// Önizleme URL'ini büyüt (küçük thumb'lar yerine daha net görsel)
fn normalize_img(src: &str) -> String {
    decode_entities(src)
        .replace("imw=288&imh=162", "imw=636&imh=358")
        .replace("imw=268&imh=151", "imw=636&imh=358")
        .replace("imw=512&imh=288", "imw=636&imh=358")
}

/// GetPublishedFileDetails `tags` dizisinden en yüksek RimWorld sürüm etiketini
/// bulur (örn. "1.2", "1.5", "1.6"). Steam, RimWorld modlarının desteklediği
/// sürümleri etiket olarak döndürür; sürüm etiketi yoksa boş döner.
fn version_from_tags(tags: &serde_json::Value) -> String {
    let Ok(re) = Regex::new(r"^(\d+)\.(\d+)$") else {
        return String::new();
    };
    let mut best: Option<(u32, u32)> = None;
    if let Some(arr) = tags.as_array() {
        for t in arr {
            if let Some(tag) = t["tag"].as_str() {
                if let Some(caps) = re.captures(tag.trim()) {
                    let major: u32 = caps[1].parse().unwrap_or(0);
                    let minor: u32 = caps[2].parse().unwrap_or(0);
                    if best.map_or(true, |b| (major, minor) > b) {
                        best = Some((major, minor));
                    }
                }
            }
        }
    }
    best.map(|(maj, min)| format!("{maj}.{min}"))
        .unwrap_or_default()
}

/// Verilen workshop ID'lerinin sürüm bilgisini tek bir GetPublishedFileDetails
/// isteğiyle toplu çeker (API tek istekte 100'e kadar ID kabul eder).
/// Başarısız isteğe kadar elde edilen sonuçları döndürür.
async fn fetch_versions(
    client: &reqwest::Client,
    ids: &[String],
) -> std::collections::HashMap<String, String> {
    let mut map = std::collections::HashMap::new();
    for chunk in ids.chunks(30) {
        let mut form: Vec<(String, String)> = vec![("itemcount".into(), chunk.len().to_string())];
        for (i, id) in chunk.iter().enumerate() {
            form.push((format!("publishedfileids[{i}]"), id.clone()));
        }
        let resp = match client
            .post("https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/")
            .form(&form)
            .send()
            .await
        {
            Ok(r) => r,
            Err(_) => return map,
        };
        let json: serde_json::Value = match resp.json().await {
            Ok(j) => j,
            Err(_) => return map,
        };
        if let Some(details) = json["response"]["publishedfiledetails"].as_array() {
            for d in details {
                let id = d["publishedfileid"].as_str().unwrap_or("");
                if id.is_empty() {
                    continue;
                }
                let v = version_from_tags(&d["tags"]);
                if !v.is_empty() {
                    map.insert(id.to_string(), v);
                }
            }
        }
    }
    map
}

pub async fn search_workshop(query: &str, page: u32, section: &str, sort: &str) -> Result<Vec<WorkshopItem>, String> {
    let client = client()?;
    let section = if section.trim().is_empty() { "readytouseitems" } else { section.trim() };
    let sort = if sort.trim().is_empty() { "textsearch" } else { sort.trim() };
    let resp = client
        .get("https://steamcommunity.com/workshop/browse/")
        .query(&[
            ("appid", APP_ID),
            ("searchtext", query),
            ("browsesort", sort),
            ("actualsort", sort),
            ("section", section),
            ("p", &page.to_string()),
            ("count", "30"),
        ])
        .send()
        .await
        .map_err(|e| format!("Arama isteği başarısız: {e}"))?;

    let html = resp.text().await.map_err(|e| format!("Yanıt okunamadı: {e}"))?;
    let mut items = parse_search_items(&html);
    if !items.is_empty() {
        // Kartlarda "desteklediği son sürüm" gösterimi için sürüm etiketlerini
        // toplu API çağrısıyla çek (tek istek, maks. 30 ID).
        let ids: Vec<String> = items.iter().map(|i| i.id.clone()).collect();
        let versions = fetch_versions(&client, &ids).await;
        for item in &mut items {
            if let Some(v) = versions.get(&item.id) {
                item.version.clone_from(v);
            }
        }
    }
    Ok(items)
}

/// Yeni React layout'unu yapısal kalıplarla ayrıştırır.
fn parse_search_items(html: &str) -> Vec<WorkshopItem> {
    let Ok(link_re) = Regex::new(r#"sharedfiles/filedetails/\?id=(\d+)"#) else {
        return Vec::new();
    };
    let Ok(img_re) = Regex::new(r#"<img[^>]*src="([^"]+)"[^>]*>"#) else {
        return Vec::new();
    };
    let Ok(alt_re) = Regex::new(r#"<img[^>]*alt="([^"]+)"[^>]*>"#) else {
        return Vec::new();
    };
    let Ok(author_re) = Regex::new(r">By\s+([^<]+)</a>") else {
        return Vec::new();
    };

    let matches: Vec<_> = link_re.captures_iter(html).collect();
    let mut items = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for (i, cap) in matches.iter().enumerate() {
        let start = cap.get(0).map(|m| m.start()).unwrap_or(0);
        let end = matches
            .get(i + 1)
            .and_then(|n| n.get(0))
            .map(|m| m.start())
            .unwrap_or(html.len());
        let block = &html[start..end.min(html.len())];

        let id = cap.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
        if id.is_empty() || !seen.insert(id.clone()) {
            continue;
        }

        let title = alt_re
            .captures(block)
            .and_then(|c| c.get(1))
            .map(|m| decode_entities(m.as_str()).trim().to_string())
            .unwrap_or_default();
        let author = author_re
            .captures(block)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str().trim().to_string())
            .unwrap_or_default();
        let preview_url = img_re
            .captures(block)
            .and_then(|c| c.get(1))
            .map(|m| normalize_img(m.as_str()))
            .unwrap_or_default();

        items.push(WorkshopItem {
            id,
            title,
            author,
            preview_url,
            // Sürüm, arama sonrası toplu API çağrısıyla doldurulur (search_workshop)
            version: String::new(),
        });
    }

    items
}

pub async fn get_workshop_details(id: &str) -> Result<WorkshopDetails, String> {
    let client = client()?;

    // 1) GetPublishedFileDetails — anahtarsız POST (temiz JSON)
    let resp = client
        .post("https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/")
        .form(&[("itemcount", "1"), ("publishedfileids[0]", id)])
        .send()
        .await
        .map_err(|e| format!("Detay isteği başarısız: {e}"))?;

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Detay JSON'u okunamadı: {e}"))?;

    let d = &json["response"]["publishedfiledetails"][0];
    if d.is_null() {
        return Err("Mod bulunamadı (Steam detay yanıtı boş).".to_string());
    }

    // 2) Yazar adı — filedetails sayfasından (creator yalnızca sayısal SteamID verir)
    let author = fetch_author_name(&client, id).await;
    let author = if author.is_empty() {
        d["creator"].as_str().unwrap_or("").to_string()
    } else {
        author
    };

    // 3) Ekran görüntüleri — filedetails sayfasından (best effort)
    let screenshots = fetch_screenshots(&client, id).await;

    Ok(WorkshopDetails {
        id: d["publishedfileid"].as_str().unwrap_or(id).to_string(),
        title: d["title"].as_str().unwrap_or("").to_string(),
        description: d["description"].as_str().unwrap_or("").to_string(),
        preview_url: d["preview_url"].as_str().unwrap_or("").to_string(),
        screenshots,
        author,
        version: version_from_tags(&d["tags"]),
        file_size: d["file_size"].as_str().and_then(|s| s.parse().ok()).unwrap_or(0),
        time_updated: d["time_updated"].as_u64().unwrap_or(0),
        subscriptions: d["subscriptions"].as_u64().unwrap_or(0),
        favorites: d["favorited"].as_u64().unwrap_or(0),
        score: d["vote_data"]["score"].as_f64().unwrap_or(0.0),
        votes_up: d["vote_data"]["votes_up"].as_u64().unwrap_or(0),
        votes_down: d["vote_data"]["votes_down"].as_u64().unwrap_or(0),
    })
}

/// Kurulu bir modun package_id / adı → nümerik workshop ID'sini bulur.
/// (SteamCMD yalnızca nümerik workshop ID ile indirme yapar.)
pub async fn resolve_workshop_id(package_id: &str, name: &str) -> Result<String, String> {
    let queries = [package_id, name];
    for q in queries.iter().filter(|q| !q.trim().is_empty()) {
        let items = search_workshop(q, 1, "readytouseitems", "textsearch").await?;
        if let Some(first) = items.first() {
            return Ok(first.id.clone());
        }
    }
    Err(format!("'{}' için atölyede sonuç bulunamadı.", package_id))
}

/// Google Translate'in tarayıcı arayüzünün kullandığı anahtarsız ucu ile çevirir.
/// Dili otomatik algılar (`sl=auto`).
///
/// Google tek istek başına yaklaşık 5000 karakter kabul eder; bu yüzden uzun
/// metinler en yüksek parça boyutundan (4800) parçalara bölünerek çevrilir.
pub async fn translate_text(text: &str, target: &str) -> Result<String, String> {
    let client = client()?;
    let target = if target.trim().is_empty() { "tr" } else { target.trim() };

    const MAX_CHUNK: usize = 4800;
    let chunks = split_chunks(text, MAX_CHUNK);

    let mut parts: Vec<String> = Vec::with_capacity(chunks.len());
    let mut any_success = false;
    for chunk in chunks {
        match translate_chunk(&client, &chunk, target).await {
            Ok(t) => {
                parts.push(t);
                any_success = true;
            }
            Err(e) => {
                eprintln!("Çeviri parçası başarısız: {e}");
                parts.push(chunk); // Çevrilemediyse orijinal parçayı koru
            }
        }
    }

    let out = parts.join("\n\n").trim().to_string();
    if out.is_empty() {
        return Err("Çeviri boş döndü (Google Translate erişilemez olabilir).".to_string());
    }
    if !any_success {
        return Err("Çeviri yapılamadı (Google Translate erişilemez olabilir).".to_string());
    }
    Ok(out)
}

/// Tek bir parçayı çevirir. POST kullanılır (GET'teki URL uzunluk sınırı sorun olmaz).
async fn translate_chunk(client: &reqwest::Client, chunk: &str, target: &str) -> Result<String, String> {
    let resp = client
        .post("https://translate.googleapis.com/translate_a/single")
        .form(&[
            ("client", "gtx"),
            ("sl", "auto"),
            ("tl", target),
            ("dt", "t"),
            ("q", chunk),
        ])
        .send()
        .await
        .map_err(|e| format!("Çeviri isteği başarısız: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Çeviri servisi HTTP {} döndürdü.", resp.status().as_u16()));
    }

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Çeviri yanıtı okunamadı: {e}"))?;

    let mut out = String::new();
    if let Some(arr) = json[0].as_array() {
        for seg in arr {
            if let Some(s) = seg[0].as_str() {
                out.push_str(s);
            }
        }
    }

    let out = out.trim().to_string();
    if out.is_empty() {
        return Err("Çeviri boş döndü (Google Translate erişilemez olabilir).".to_string());
    }
    Ok(out)
}

/// Metni `max` karaktere kadar parçalara böler; mümkünse satır sonlarından böler.
/// UTF-8 güvenlidir (çok baytlı karakterleri ortadan bölmez).
fn split_chunks(text: &str, max: usize) -> Vec<String> {
    let mut chunks = Vec::new();
    let bytes = text.len();
    let mut start = 0usize;
    while start < bytes {
        let mut end = (start + max).min(bytes);
        // char sınırına hizala (Türkçe karakterler 2 bayt olabilir)
        while end < bytes && !text.is_char_boundary(end) {
            end -= 1;
        }
        if end < bytes && end - start > 1 {
            // Satır sonuna göre bölmeyi dene (paragraf/kelime ortası kesilmesin)
            if let Some(rel) = text[start..end].rfind('\n') {
                if rel > 0 {
                    end = start + rel + 1;
                }
            }
        }
        chunks.push(text[start..end].to_string());
        start = end;
    }
    chunks
}

async fn fetch_author_name(client: &reqwest::Client, id: &str) -> String {
    let url = format!("https://steamcommunity.com/sharedfiles/filedetails/?id={id}");
    let html = match client.get(&url).send().await {
        Ok(r) => match r.text().await {
            Ok(t) => t,
            Err(_) => return String::new(),
        },
        Err(_) => return String::new(),
    };

    if let Ok(re) = Regex::new(r#"(?s)friendBlockContent">\s*([^<]+)"#) {
        if let Some(cap) = re.captures(&html) {
            if let Some(m) = cap.get(1) {
                let name = m.as_str().trim().to_string();
                if !name.is_empty() {
                    return name;
                }
            }
        }
    }
    String::new()
}

async fn fetch_screenshots(client: &reqwest::Client, id: &str) -> Vec<String> {
    let url = format!("https://steamcommunity.com/sharedfiles/filedetails/?id={id}");
    let html = match client.get(&url).send().await {
        Ok(r) => match r.text().await {
            Ok(t) => t,
            Err(_) => return Vec::new(),
        },
        Err(_) => return Vec::new(),
    };

    let doc = scraper::Html::parse_document(&html);
    let selectors = [
        "#highlight_strip img",
        ".highlight_strip_screenshot img",
        "a.highlight_screenshot_link img",
    ];

    let mut shots = Vec::new();
    for sel in selectors {
        if let Ok(sel) = scraper::Selector::parse(sel) {
            for img in doc.select(&sel) {
                if let Some(src) = img.value().attr("src") {
                    let cleaned = normalize_img(src);
                    if cleaned.starts_with("https://") && !shots.contains(&cleaned) {
                        shots.push(cleaned);
                    }
                }
            }
        }
        if !shots.is_empty() {
            break;
        }
    }

    shots
}

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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkshopDetails {
    pub id: String,
    pub title: String,
    pub description: String,
    pub preview_url: String,
    pub screenshots: Vec<String>,
    pub author: String,
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
    Ok(parse_search_items(&html))
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
/// Dili otomatik algılar (`sl=auto`). Erişilemezse Err döner — arayüz bu durumda
/// tarayıcıda Google Translate'i açarak devam eder.
pub async fn translate_text(text: &str, target: &str) -> Result<String, String> {
    let client = client()?;
    let target = if target.trim().is_empty() { "tr" } else { target.trim() };
    let resp = client
        .get("https://translate.googleapis.com/translate_a/single")
        .query(&[
            ("client", "gtx"),
            ("sl", "auto"),
            ("tl", target),
            ("dt", "t"),
            ("q", text),
        ])
        .send()
        .await
        .map_err(|e| format!("Çeviri isteği başarısız: {e}"))?;

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

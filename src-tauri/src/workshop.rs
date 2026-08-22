//! Steam Workshop verilerini (arama + detay) Steam topluluk sayfasını
//! scrape ederek çeker. Anahtar (API key) gerektirmez.
//!
//! - `search_workshop`: workshop/browse HTML'ini parse eder (kart listesi)
//! - `get_workshop_details`: GetPublishedFileDetails (anahtarsız POST) + filedetails sayfası

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

fn text_of(node: scraper::ElementRef) -> String {
    node.text().collect::<Vec<_>>().join("").trim().to_string()
}

pub async fn search_workshop(query: &str, page: u32) -> Result<Vec<WorkshopItem>, String> {
    let client = client()?;
    let resp = client
        .get("https://steamcommunity.com/workshop/browse/")
        .query(&[
            ("appid", APP_ID),
            ("searchtext", query),
            ("browsesort", "textsearch"),
            ("actualsort", "textsearch"),
            ("section", "readytouseitems"),
            ("p", &page.to_string()),
            ("count", "30"),
        ])
        .send()
        .await
        .map_err(|e| format!("Arama isteği başarısız: {e}"))?;

    let html = resp.text().await.map_err(|e| format!("Yanıt okunamadı: {e}"))?;
    let doc = scraper::Html::parse_document(&html);

    let item_sel = scraper::Selector::parse(".workshopItem").map_err(|e| e.to_string())?;
    let title_sel = scraper::Selector::parse(".workshopItemTitle").map_err(|e| e.to_string())?;
    let img_sel = scraper::Selector::parse(".workshopItemPreviewImage").map_err(|e| e.to_string())?;
    let author_sel = scraper::Selector::parse(".workshopItemAuthorName").map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    for el in doc.select(&item_sel) {
        let id = el.value().attr("data-publishedfileid").unwrap_or("").to_string();
        if id.is_empty() {
            continue;
        }
        let title = el.select(&title_sel).next().map(text_of).unwrap_or_default();
        let preview_url = el
            .select(&img_sel)
            .next()
            .and_then(|n| n.value().attr("src"))
            .unwrap_or("")
            .to_string();
        let author = el.select(&author_sel).next().map(text_of).unwrap_or_default();
        items.push(WorkshopItem {
            id,
            title,
            author,
            preview_url,
        });
    }

    Ok(items)
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

    let mut details = WorkshopDetails {
        id: d["publishedfileid"].as_str().unwrap_or(id).to_string(),
        title: d["title"].as_str().unwrap_or("").to_string(),
        description: d["description"].as_str().unwrap_or("").to_string(),
        preview_url: d["preview_url"].as_str().unwrap_or("").to_string(),
        screenshots: Vec::new(),
        author: d["creator"].as_str().unwrap_or("").to_string(),
        file_size: d["file_size"].as_str().and_then(|s| s.parse().ok()).unwrap_or(0),
        time_updated: d["time_updated"].as_u64().unwrap_or(0),
        subscriptions: d["subscriptions"].as_u64().unwrap_or(0),
        favorites: d["favorited"].as_u64().unwrap_or(0),
        score: d["vote_data"]["score"].as_f64().unwrap_or(0.0),
        votes_up: d["vote_data"]["votes_up"].as_u64().unwrap_or(0),
        votes_down: d["vote_data"]["votes_down"].as_u64().unwrap_or(0),
    };

    // 2) Ekran görüntüleri — filedetails sayfasından (best effort)
    details.screenshots = fetch_screenshots(&client, id).await;

    Ok(details)
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
                    let cleaned = src
                        .replace("imw=268&imh=151&", "")
                        .replace("imw=512&imh=288&", "");
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

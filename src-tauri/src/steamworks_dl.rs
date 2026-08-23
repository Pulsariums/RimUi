//! Steam client üzerinden (steamworks SDK) workshop indirme.
//!
//! Kullanıcının açık Steam oturumunu kullanır — uygulamamız hesap soramaz,
//! API key gerekmez, ekstra motor indirmesi yoktur (~310 KB SDK dll'i hariç).
//!
//! Akış: UGC::download_item → callback pump + progress polling →
//! Steam kütüphanesindeki klasörden Mods köküne KOPYALAMA
//! (taşımıyoruz; Steam'in kendi kaydı bozulmasın).

use std::path::Path;
use std::time::{Duration, Instant};
use tauri::Emitter;
use steamworks::{Client, PublishedFileId};

const APP_ID: u32 = 294100;

/// steam.exe çalışıyor mu? (hızlı ön kontrol)
pub fn steam_running() -> bool {
    let out = std::process::Command::new("tasklist")
        .args(["/FI", "IMAGENAME eq steam.exe", "/NH"])
        .output();
    match out {
        Ok(o) => {
            let s = String::from_utf8_lossy(&o.stdout).to_lowercase();
            s.contains("steam.exe")
        }
        Err(_) => false,
    }
}

/// SteamAPI, app id'yi exe yanındaki steam_appid.txt'ten okur.
fn ensure_appid_file() -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| format!("Exe yolu okunamadı: {e}"))?;
    let dir = exe.parent().ok_or_else(|| "Exe klasörü bulunamadı".to_string())?;
    let f = dir.join("steam_appid.txt");
    if !f.exists() {
        std::fs::write(&f, APP_ID.to_string())
            .map_err(|e| format!("steam_appid.txt yazılamadı: {e}"))?;
    }
    Ok(())
}

pub fn download_mod(window: tauri::Window, mod_id: String, install_dir: String) -> Result<(), String> {
    if install_dir.trim().is_empty() {
        return Err("RimWorld Mods klasörü ayarlı değil (Ayarlar → Yol).".into());
    }
    ensure_appid_file()?;

    let emit = |progress: f32, message: &str| {
        let _ = window.emit(
            "steamcmd-progress",
            crate::steamcmd::ProgressPayload {
                progress,
                speed: String::new(),
                message: message.to_string(),
            },
        );
    };

    emit(0.0, "Steam'e bağlanılıyor...");
    let client = Client::init_app(APP_ID).map_err(|e| {
        format!(
            "Steam bağlantısı kurulamadı ({e:?}). Steam açık ve giriş yapılmış olmalı."
        )
    })?;

    let id_num: u64 = mod_id.parse().map_err(|_| format!("Geçersiz mod ID: {mod_id}"))?;
    let id = PublishedFileId(id_num);

    emit(1.0, "Öğe kontrol ediliyor...");

    // Zaten Steam'de kuruluysa doğrudan kopyala (yeniden indirmeden).
    if let Some(info) = client.ugc().item_install_info(id) {
        emit(96.0, "Steam'de kurulu — Mods klasörüne kopyalanıyor...");
        copy_from_steam(Path::new(&info.folder), &install_dir, &mod_id)?;
        emit(100.0, "Tamamlandı");
        return Ok(());
    }

    if !client.ugc().download_item(id, true) {
        return Err("İndirme başlatılamadı (öğe mevcut değil veya erişilemiyor).".into());
    }
    emit(3.0, "İndirme başladı...");

    let start = Instant::now();
    loop {
        // Callback pump — steamworks bunu düzenli çağırmayı bekler.
        client.run_callbacks();

        if let Some(info) = client.ugc().item_download_info(id) {
            let (done, total) = info;
            if total > 0 {
                let pct = ((done as f32 / total as f32) * 95.0).clamp(3.0, 95.0);
                let mbs = done as f32 / 1_048_576.0;
                let tot = total as f32 / 1_048_576.0;
                emit(pct, &format!("İndiriliyor {mbs:.1}/{tot:.1} MB"));
            }
        }

        if let Some(info) = client.ugc().item_install_info(id) {
            emit(97.0, "Mods klasörüne kopyalanıyor...");
            copy_from_steam(Path::new(&info.folder), &install_dir, &mod_id)?;
            emit(100.0, "Tamamlandı");
            return Ok(());
        }

        if start.elapsed() > Duration::from_secs(60 * 30) {
            return Err("İndirme zaman aşımına uğradı (30 dk).".into());
        }

        std::thread::sleep(Duration::from_millis(250));
    }
}

/// Steam kütüphanesindeki kurulu klasörden Mods'a kopyalar (Steam kaydını bozmadan).
fn copy_from_steam(folder: &Path, install_dir: &str, mod_id: &str) -> Result<(), String> {
    if !folder.exists() {
        return Err(format!("Steam kurulum klasörü bulunamadı: {}", folder.display()));
    }
    let target = Path::new(install_dir).join(mod_id);
    if target.exists() {
        std::fs::remove_dir_all(&target).map_err(|e| format!("Eski mod klasörü silinemedi: {e}"))?;
    }
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Mods klasörü oluşturulamadı: {e}"))?;
    }
    crate::steamcmd::copy_dir_all_pub(folder, &target)
        .map_err(|e| format!("Steam kütüphanesinden kopyalanamadı: {e}"))
}
use std::process::Command;
use tauri::Emitter;
use std::path::Path;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct SteamCmdResult {
    pub success: bool,
    pub output: String,
    pub error: Option<String>,
}

pub struct SteamCmdManager {
    pub executable_path: String,
}

impl SteamCmdManager {
    pub fn new(path: String) -> Self {
        Self { executable_path: path }
    }

    pub fn is_installed(&self) -> bool {
        Path::new(&self.executable_path).exists()
    }

    pub fn download_mod(&self, window: tauri::Window, mod_id: String, install_dir: String) -> Result<String, String> {
        use std::io::{BufRead, BufReader};
        use std::process::Stdio;

        #[derive(Clone, serde::Serialize)]
        struct ProgressPayload {
            progress: f32,
            speed: String,
            message: String,
        }

        // SteamCMD command for downloading a mod:
        // steamcmd +login anonymous +workshop_download_item <app_id> <mod_id> +quit
        // RimWorld App ID is 294100
        let app_id = "294100";
        
        let mut cmd = Command::new(&self.executable_path);
        cmd.arg("+login").arg("anonymous");
        if !install_dir.is_empty() {
            cmd.arg("+force_install_dir").arg(&install_dir);
        }
        let mut child = cmd
            .arg("+workshop_download_item")
            .arg(app_id)
            .arg(&mod_id)
            .arg("+quit")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("SteamCMD çalıştırılamadı: {}", e))?;

        let stdout = child.stdout.take().ok_or("Stdout capture failed")?;
        let reader = BufReader::new(stdout);
        let mut full_output = String::new();

        for line in reader.lines() {
            let line = line.map_err(|e| format!("Reading stdout failed: {}", e))?;
            full_output.push_str(&line);
            full_output.push('\n');

            // Parse progress from SteamCMD output: [===>      ] 30% (1.2 MB/s)
            if let Some(cap) = line.find('%') {
                let _progress_part = &line[..cap + 1];
                let speed_part = if line.contains('(') && line.contains(')') {
                    let start = line.find('(').unwrap();
                    let end = line.find(')').unwrap();
                    &line[start + 1..end]
                } else {
                    "0 KB/s"
                };

                let progress_val = line
                    .split_whitespace()
                    .find(|s| s.contains('%'))
                    .and_then(|s| s.trim_end_matches('%').parse::<f32>().ok())
                    .unwrap_or(0.0);

                window.emit("steamcmd-progress", ProgressPayload {
                    progress: progress_val,
                    speed: speed_part.to_string(),
                    message: line.clone(),
                }).map_err(|e| format!("Event emit failed: {}", e))?;
            }
        }

        let status = child.wait().map_err(|e| format!("Wait failed: {}", e))?;

        if status.success() {
            Ok(full_output)
        } else {
            // Try to read stderr if command failed
            let stderr = child.stderr.take().map(|s| {
                let mut err_out = String::new();
                let mut reader = BufReader::new(s);
                let mut line = String::new();
                while reader.read_line(&mut line).unwrap_or(0) > 0 {
                    err_out.push_str(&line);
                    line.clear();
                }
                err_out
            }).unwrap_or_else(|| "Unknown error".to_string());
            
            Err(stderr)
        }
    }

    pub fn update_mods(&self, mod_ids: Vec<String>, window: tauri::Window, install_dir: String) -> Result<Vec<(String, bool)>, String> {
        let mut results = Vec::new();
        for id in mod_ids {
            match self.download_mod(window.clone(), id.clone(), install_dir.clone()) {
                Ok(_) => results.push((id, true)),
                Err(e) => {
                    eprintln!("Mod {} güncellenirken hata oluştu: {}", id, e);
                    results.push((id, false));
                }
            }
        }
        Ok(results)
    }
}

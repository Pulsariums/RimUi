use std::path::PathBuf;

fn main() {
    tauri_build::build();

    // steamworks runtime DLL'ini hedef çıktı klasörüne kopyala
    // (SteamAPI_InitEx bu dll'i exe'nin yanında arar).
    let manifest = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let dll = manifest.join("binaries").join("steam_api64.dll");
    if dll.exists() {
        let out_dir = PathBuf::from(std::env::var("OUT_DIR").unwrap());
        // OUT_DIR = target/<profile>/build/<pkg>/out → 4 üst = target/<profile>
        if let Some(profile_dir) = out_dir.ancestors().nth(4) {
            let dest = profile_dir.join("steam_api64.dll");
            let _ = std::fs::copy(&dll, &dest);
        }
    }
}

import { ModMetadata, ModsConfig, CommunityRules } from "../types";
import { safeInvoke } from "./tauriBridge";
import { settingsStore } from "../store/settingsStore";

export interface DetectedPaths {
  mods_path: string | null;
  config_path: string | null;
  executable_path: string | null;
}

export interface WorkshopItem {
  id: string;
  title: string;
  author: string;
  preview_url: string;
}

export interface WorkshopDetails {
  id: string;
  title: string;
  description: string;
  preview_url: string;
  screenshots: string[];
  author: string;
  file_size: number;
  time_updated: number;
  subscriptions: number;
  favorites: number;
  score: number;
  votes_up: number;
  votes_down: number;
}

export class ModService {
  /**
   * Detects typical RimWorld and ModsConfig.xml paths on Windows.
   */
  static async detectRimworldPaths(): Promise<DetectedPaths> {
    return safeInvoke<DetectedPaths>("detect_rimworld_paths");
  }

  /**
   * Scans a directory for RimWorld mods.
   */
  static async scanMods(modsDir: string, dbPath: string): Promise<ModMetadata[]> {
    return safeInvoke<ModMetadata[]>("scan_mods", { modsDir, dbPath });
  }

  /**
   * Performs an advanced sort on the provided mods.
   */
  static async sortMods(mods: ModMetadata[], communityRules?: CommunityRules): Promise<ModMetadata[]> {
    return safeInvoke<ModMetadata[]>("sort_mods", { mods, communityRules });
  }

  /**
   * Reads the active mods configuration from ModsConfig.xml.
   */
  static async readModsConfig(path: string): Promise<ModsConfig> {
    return safeInvoke<ModsConfig>("read_mods_config", { path });
  }

  /**
   * Saves the active mods configuration to ModsConfig.xml atomically.
   */
  static async saveModsConfig(path: string, config: ModsConfig): Promise<void> {
    return safeInvoke<void>("save_mods_config", { path, config });
  }

  /**
   * Exports all application data to a JSON file.
   */
  static async exportAppData(path: string, data: any): Promise<void> {
    return safeInvoke<void>("export_app_data", { path, data });
  }

  /**
   * Imports all application data from a JSON file.
   */
  static async importAppData(path: string): Promise<any> {
    return safeInvoke<any>("import_app_data", { path });
  }

  static async downloadMod(modId: string): Promise<void> {
    const { steamcmd_path, rimworld_mods_path } = settingsStore.getSettings();
    if (!steamcmd_path) throw new Error("SteamCMD yolu ayarlı değil (Ayarlar → Klasör Yolları).");
    if (!rimworld_mods_path) throw new Error("RimWorld Mods yolu ayarlı değil.");
    return safeInvoke<void>("download_mod", { steamcmdPath: steamcmd_path, installDir: rimworld_mods_path, modId });
  }

  static async updateMods(modIds: string[]): Promise<void> {
    const { steamcmd_path, rimworld_mods_path } = settingsStore.getSettings();
    if (!steamcmd_path) throw new Error("SteamCMD yolu ayarlı değil (Ayarlar → Klasör Yolları).");
    if (!rimworld_mods_path) throw new Error("RimWorld Mods yolu ayarlı değil.");
    return safeInvoke<void>("update_mods", { steamcmdPath: steamcmd_path, installDir: rimworld_mods_path, modIds });
  }

  /** Steam Workshop'ta arama (topluluk sayfası scrape, anahtar gerektirmez) */
  static async searchWorkshop(query: string, page = 1): Promise<WorkshopItem[]> {
    return safeInvoke<WorkshopItem[]>("workshop_search", { query, page });
  }

  /** Mod detayı + ekran görüntüleri (scrape) */
  static async getWorkshopDetails(id: string): Promise<WorkshopDetails> {
    return safeInvoke<WorkshopDetails>("workshop_details", { id });
  }

  static async validateSorting(mods: ModMetadata[]): Promise<boolean> {
    return safeInvoke<boolean>("validate_sorting", { mods });
  }

  /**
   * ModsConfig.xml ve harici kaynak dışında bir klasörden mod tara
   * (harici kaynak ekleme akışı için).
   */
  static async scanModsFromPath(path: string): Promise<ModMetadata[]> {
    return safeInvoke<ModMetadata[]>("scan_mods_from_path", { path });
  }

  /**
   * Harici bir modu RimWorld/Mods klasörüne taşır.
   */
  static async moveModToRimworld(sourcePath: string, targetDir: string): Promise<string> {
    return safeInvoke<string>("move_mod_to_rimworld", { sourcePath, targetDir });
  }

  /**
   * RimSort 4-Tier + Kahn's Algorithm ile aktif modları sıralar.
   * Sıralı package_id listesi döndürür; bağımlılık döngüsünde hata fırlatır.
   */
  static async sortModsRimworld(activeMods: ModMetadata[]): Promise<string[]> {
    const depsGraph: Record<string, string[]> = {};
    const revDepsGraph: Record<string, string[]> = {};

    for (const mod of activeMods) {
      const id = mod.package_id.toLowerCase();
      depsGraph[id] = mod.dependencies.map(d => d.toLowerCase());
    }

    // Ters graf: bir moda bağımlı olan modları topla
    for (const mod of activeMods) {
      const id = mod.package_id.toLowerCase();
      for (const dep of (mod.dependencies || [])) {
        const depId = dep.toLowerCase();
        if (!revDepsGraph[depId]) revDepsGraph[depId] = [];
        if (!revDepsGraph[depId].includes(id)) revDepsGraph[depId].push(id);
      }
    }

    return safeInvoke<string[]>("sort_mods_rimworld", {
      activePackageIds: Object.keys(depsGraph),
      depsGraph,
      revDepsGraph
    });
  }

  /**
   * SQLite mod önbelleğini siler (bir sonraki taramada yeniden oluşturulur).
   */
  static async clearModsCache(dbPath: string): Promise<void> {
    return safeInvoke<void>("clear_mods_cache", { dbPath });
  }

  static async deleteMod(modId: string): Promise<void> {
    const { rimworld_mods_path } = settingsStore.getSettings();
    if (!rimworld_mods_path) throw new Error("RimWorld Mods yolu ayarlı değil.");
    return safeInvoke<void>("delete_mod", { modId, path: rimworld_mods_path });
  }

  static async launchGame(exePath: string): Promise<void> {
    return safeInvoke<void>("launch_game", { path: exePath });
  }
}

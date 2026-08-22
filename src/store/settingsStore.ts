import { AppSettings, ExtraModSource } from "../types";

type Listener<T> = (data: T) => void;

/** Ayar şeması sürümü — bu değer yükselirse MIGRATIONS'a yeni adım eklenir */
const CURRENT_SCHEMA_VERSION = 1;

/** Sürüm → migration fonksiyonları (sırayla uygulanır) */
const MIGRATIONS: Record<number, (s: AppSettings) => void> = {
  // v0 → v1: İlk şema. Eski kayıtlarda bulunmayan alanları tamamla.
  0: (s) => {
    if (!s.extraModSources) s.extraModSources = [];
    if (!s.historyLimit) s.historyLimit = 30;
  }
};

class SettingsStore {
  private settings: AppSettings = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    rimworld_mods_path: "",
    rimworld_config_path: "",
    db_path: "C:\\Users\\Pulsar\\AppData\\Local\\RimWorldModHelper\\mods_cache.db",
    rimworld_exe_path: "",
    extraModSources: [],
    historyLimit: 30
  };

  private listeners: Listener<AppSettings>[] = [];

  constructor() {
    this.loadFromLocalStorage();
  }

  public subscribe(listener: Listener<AppSettings>) {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter(l => l !== listener); };
  }

  public setSettings(newSettings: AppSettings) {
    this.settings = { ...newSettings };
    this.saveToLocalStorage();
    this.notify();
  }

  public getSettings() {
    return this.settings;
  }

  // ============================================================
  // Extra Mod Source (Harici Kaynak) Yönetimi
  // ============================================================

  public getExtraModSources(): ExtraModSource[] {
    return this.settings.extraModSources || [];
  }

  public addExtraModSource(path: string, name?: string): void {
    const sources = this.getExtraModSources();
    const source: ExtraModSource = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      path,
      enabled: true,
      name: name || path.split('\\').pop() || path.split('/').pop() || 'Harici Kaynak'
    };
    sources.push(source);
    this.settings.extraModSources = sources;
    this.saveToLocalStorage();
    this.notify();
    // Modları yeniden tara
    this.scanExtraSources();
  }

  public removeExtraModSource(id: string): void {
    this.settings.extraModSources = (this.settings.extraModSources || []).filter(s => s.id !== id);
    this.saveToLocalStorage();
    this.notify();
    this.scanExtraSources();
  }

  public toggleExtraModSource(id: string): void {
    const sources = this.getExtraModSources();
    const source = sources.find(s => s.id === id);
    if (source) {
      source.enabled = !source.enabled;
      this.settings.extraModSources = sources;
      this.saveToLocalStorage();
      this.notify();
      this.scanExtraSources();
    }
  }

  public async scanExtraSources(): Promise<void> {
    const { modStore } = await import("../store/modStore");
    const { ModService } = await import("../services/modService");
    const enabledSources = (this.settings.extraModSources || []).filter(s => s.enabled);

    let externalMods: import("../types/mod").ModMetadata[] = [];

    for (const source of enabledSources) {
      try {
        const mods = await ModService.scanModsFromPath(source.path);
        externalMods.push(...mods.map(m => ({ ...m, isExternal: true })));
      } catch (err) {
        console.error(`[SettingsStore] Kaynak taranamadı: ${source.path}`, err);
      }
    }

    // Mevcut mod listesine harici modları ekle (kütüphaneye)
    if (externalMods.length > 0) {
      modStore.addExternalMods(externalMods);
    }
  }

  /**
   * localStorage'daki ayarları yeniden yükler ve aboneleri bilgilendirir.
   * Ayarlar penceresi gibi aynı origin'i paylaşan başka bir pencereden
   * yapılan değişikliklerin ana pencereye yansımasını sağlar.
   */
  public reloadFromStorage(): void {
    this.loadFromLocalStorage();
    this.notify();
  }

  private saveToLocalStorage() {
    localStorage.setItem("app_settings", JSON.stringify(this.settings));
  }

  private loadFromLocalStorage() {
    const saved = localStorage.getItem("app_settings");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as AppSettings;
        // Migration: yüklü sürümden güncel sürüme kadar sırayla uygula
        const oldVersion = typeof parsed.schemaVersion === "number" ? parsed.schemaVersion : 0;
        let version = oldVersion;
        while (version < CURRENT_SCHEMA_VERSION) {
          const migrate = MIGRATIONS[version];
          if (migrate) migrate(parsed);
          version++;
        }
        parsed.schemaVersion = CURRENT_SCHEMA_VERSION;
        this.settings = parsed;
        // Migration yapıldıysa şemayı geri yaz
        if (oldVersion !== CURRENT_SCHEMA_VERSION) {
          this.saveToLocalStorage();
        }
      } catch (e) {
        console.error("Failed to parse settings from localStorage", e);
      }
    }
  }

  private notify() {
    this.listeners.forEach(l => l(this.settings));
  }
}

export const settingsStore = new SettingsStore();

import "../../styles.css";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { open } from "@tauri-apps/plugin-dialog";
import { ModService } from "../../services/modService";
import { settingsStore } from "../../store/settingsStore";
import { profileStore } from "../../store/profileStore";
import { Toast } from "../../components/shared/Toast";
import { i18n } from "../../services/i18nService";

class SettingsApp {
  private activeTab: string = "";

  constructor() {
    this.setupTitleBar();
    this.setupTabs();
    this.switchTab("general");

    // Dil değişince içeriği yeniden render et (tab içerikleri de çevrilir)
    document.addEventListener("lang-changed", () => {
      i18n.applyI18n();
      const tab = this.activeTab;
      this.activeTab = "";
      if (tab) this.switchTab(tab);
    });
    // Başka pencereden dil değişirse (ana pencere gibi) bu pencere de güncellensin
    window.addEventListener("storage", (e) => {
      if (e.key === "app_lang") i18n.setLanguage(e.newValue || "tr");
    });
  }

  private setupTitleBar() {
    const appWindow = getCurrentWebviewWindow();
    document.getElementById("btn-window-min")?.addEventListener("click", () => appWindow.minimize());
    document.getElementById("btn-window-max")?.addEventListener("click", () => appWindow.toggleMaximize());
    document.getElementById("btn-window-close")?.addEventListener("click", () => appWindow.close());
  }

  private setupTabs() {
    document.querySelectorAll(".settings-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = (btn as HTMLElement).dataset.tab;
        if (tab) this.switchTab(tab);
      });
    });
  }

  private switchTab(tab: string) {
    if (this.activeTab === tab) return; // Aynı sekmeyse tekrar render etme
    this.activeTab = tab;
    document.querySelectorAll(".settings-tab").forEach((b) => b.classList.remove("active", "text-slate-100", "bg-slate-800"));
    const activeBtn = document.querySelector(`.settings-tab[data-tab="${tab}"]`) as HTMLElement;
    if (activeBtn) {
      activeBtn.classList.add("active", "text-slate-100", "bg-slate-800");
    }
    this.renderContent(tab);
  }

  private renderContent(tab: string) {
    const content = document.getElementById("settings-content");
    if (!content) return;

    switch (tab) {
      case "general":
        content.innerHTML = `
          <h2 class="text-sm font-mono font-bold uppercase tracking-widest text-slate-400 border-b border-slate-800 pb-3 mb-6">GENEL AYARLAR</h2>
          <div class="space-y-6">
            <div>
              <label class="block text-xs font-mono text-slate-500 mb-2">UYGULAMA DİLİ</label>
              <select id="select-language" class="w-full max-w-xs bg-slate-900 border border-slate-700/40 px-3 py-2 text-xs font-mono text-slate-300 rounded focus:outline-none focus:border-slate-500">
                <option value="tr">Türkçe</option>
                <option value="en">English</option>
                <option value="de">Deutsch</option>
                <option value="fr">Français</option>
                <option value="es">Español</option>
                <option value="ru">Русский</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-mono text-slate-500 mb-2">SIRALAMA MOTORU</label>
              <select class="w-full max-w-xs bg-slate-900 border border-slate-700/40 px-3 py-2 text-xs font-mono text-slate-300 rounded focus:outline-none focus:border-slate-500">
                <option value="auto">Otomatik (Topolojik + Community)</option>
              </select>
            </div>
          </div>
        `;
        setTimeout(() => {
          const langSelect = document.getElementById("select-language") as HTMLSelectElement | null;
          if (langSelect) {
            langSelect.value = i18n.getCurrentLang();
            langSelect.addEventListener("change", () => i18n.setLanguage(langSelect.value));
          }
        }, 0);
        break;

      case "paths":
        content.innerHTML = `
          <h2 class="text-sm font-mono font-bold uppercase tracking-widest text-slate-400 border-b border-slate-800 pb-3 mb-6">KLASÖR YOLLARI</h2>
          <div class="space-y-5">
            <div>
              <label class="block text-xs font-mono text-slate-500 mb-2">RIMWORLD MODS KLASÖRÜ</label>
              <div class="flex space-x-2">
                <input type="text" id="path-mods" class="flex-1 bg-slate-900 border border-slate-700/40 px-3 py-2 text-xs font-mono text-slate-300 rounded focus:outline-none focus:border-slate-500" />
                <button id="btn-browse-mods" class="px-3 py-2 bg-slate-800 border border-slate-700/50 text-[10px] font-mono hover:bg-slate-700 rounded transition-colors text-slate-400 hover:text-slate-100">GÖZAT</button>
              </div>
            </div>
            <div>
              <label class="block text-xs font-mono text-slate-500 mb-2">MODSCONFIG.XML YOLU</label>
              <div class="flex space-x-2">
                <input type="text" id="path-config" class="flex-1 bg-slate-900 border border-slate-700/40 px-3 py-2 text-xs font-mono text-slate-300 rounded focus:outline-none focus:border-slate-500" />
                <button id="btn-browse-config" class="px-3 py-2 bg-slate-800 border border-slate-700/50 text-[10px] font-mono hover:bg-slate-700 rounded transition-colors text-slate-400 hover:text-slate-100">GÖZAT</button>
              </div>
            </div>
            <div>
              <label class="block text-xs font-mono text-slate-500 mb-2">VERİTABANI YOLU</label>
              <input type="text" id="path-db" class="w-full bg-slate-900 border border-slate-700/40 px-3 py-2 text-xs font-mono text-slate-300 rounded focus:outline-none focus:border-slate-500" />
            </div>
            <div>
              <label class="block text-xs font-mono text-slate-500 mb-2">STEAMCMD.EXE YOLU</label>
              <div class="flex space-x-2">
                <input type="text" id="path-steamcmd" class="flex-1 bg-slate-900 border border-slate-700/40 px-3 py-2 text-xs font-mono text-slate-300 rounded focus:outline-none focus:border-slate-500" placeholder="steamcmd.exe (boşsa otomatik yönetilir)" />
                <button id="btn-auto-steamcmd" class="px-3 py-2 bg-rust/80 border border-rust/60 text-[10px] font-mono font-bold hover:bg-rust rounded transition-colors text-white whitespace-nowrap">OTOMATİK KUR</button>
                <button id="btn-browse-steamcmd" class="px-3 py-2 bg-slate-800 border border-slate-700/50 text-[10px] font-mono hover:bg-slate-700 rounded transition-colors text-slate-400 hover:text-slate-100">GÖZAT</button>
              </div>
            </div>
            <div class="flex space-x-2">
              <button id="btn-detect-paths" class="px-4 py-2 bg-slate-800 border border-slate-700/50 text-[10px] font-mono hover:bg-slate-700 rounded transition-colors text-slate-400 hover:text-slate-100">OTOMATİK TESPİT ET</button>
              <button id="btn-save-paths" class="px-4 py-2 bg-amber-600/80 border border-amber-700/50 text-[10px] font-mono hover:bg-amber-600 rounded transition-colors text-slate-100">KAYDET</button>
            </div>
          </div>
        `;
        setTimeout(() => {
          this.bindPathControls();
        }, 0);
        break;

      case "advanced":
        content.innerHTML = `
          <h2 class="text-sm font-mono font-bold uppercase tracking-widest text-slate-400 border-b border-slate-800 pb-3 mb-6">GELİŞMİŞ AYARLAR</h2>
          <div class="space-y-5">
            <div>
              <label class="block text-xs font-mono text-slate-500 mb-2">ÖNBELLEĞİ TEMİZLE</label>
              <p class="text-[10px] text-slate-600 mb-3">Mod önbelleğini sıfırlar. Bir sonraki taramada yeniden oluşturulur.</p>
              <button id="btn-clear-cache" class="px-4 py-2 bg-slate-800 border border-slate-700/50 text-[10px] font-mono hover:bg-slate-700 rounded transition-colors text-slate-400 hover:text-slate-100">ÖNBELLEĞİ TEMİZLE</button>
            </div>
            <div>
              <label class="block text-xs font-mono text-slate-500 mb-2">GEÇMİŞ (VERSİYON) LİMİTİ</label>
              <p class="text-[10px] text-slate-600 mb-3">Her profil için tutulacak geçmiş adımı. 30 modu tek seferde sürüklemek tek adım sayılır.</p>
              <select id="select-history-limit" class="w-full max-w-xs bg-slate-900 border border-slate-700/40 px-3 py-2 text-xs font-mono text-slate-300 rounded focus:outline-none focus:border-amber-500">
                <option value="10">10 adım</option>
                <option value="20">20 adım</option>
                <option value="30">30 adım</option>
                <option value="50">50 adım</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-mono text-slate-500 mb-2">AKTİF PROFİL GEÇMİŞİ</label>
              <p id="history-info" class="text-[10px] text-slate-600 mb-3"></p>
              <button id="btn-clear-history" class="px-4 py-2 bg-red-900/30 border border-red-800/50 text-[10px] font-mono hover:bg-red-900/60 rounded transition-colors text-red-400 hover:text-red-300">GEÇMİŞİ TEMİZLE</button>
            </div>
          </div>
        `;
        setTimeout(() => {
          // Geçmiş limiti
          const limitSelect = document.getElementById("select-history-limit") as HTMLSelectElement | null;
          if (limitSelect) {
            limitSelect.value = String(settingsStore.getSettings().historyLimit ?? 30);
            limitSelect.addEventListener("change", () => {
              const next = { ...settingsStore.getSettings() };
              next.historyLimit = parseInt(limitSelect.value, 10) || 30;
              settingsStore.setSettings(next);
              Toast.show(`Geçmiş limiti ${next.historyLimit} adım olarak ayarlandı.`, "success");
            });
          }
          // Geçmiş temizle
          document.getElementById("btn-clear-history")?.addEventListener("click", () => {
            const profile = profileStore.getActiveProfile();
            if (!profile) {
              Toast.show("Aktif profil yok.", "error");
              return;
            }
            profileStore.clearHistory(profile.name);
            profileStore.setRedoHistory(profile.name, []);
            Toast.show(`"${profile.name}" profilinin geçmişi temizlendi.`, "success");
          });
          // Geçmiş bilgisi
          const info = document.getElementById("history-info");
          if (info) {
            const profile = profileStore.getActiveProfile();
            if (profile) {
              const n = (profile.history || []).length;
              const r = (profile.redo_history || []).length;
              const limit = settingsStore.getSettings().historyLimit ?? 30;
              info.textContent = `"${profile.name}" → ${n}/${limit} adım geçmiş, ${r} adım redo.`;
            } else {
              info.textContent = "Aktif profil bulunamadı.";
            }
          }
          document.getElementById("btn-clear-cache")?.addEventListener("click", () => this.handleClearCache());
        }, 0);
        break;

      case "about":
        content.innerHTML = `
          <h2 class="text-sm font-mono font-bold uppercase tracking-widest text-slate-400 border-b border-slate-800 pb-3 mb-6">HAKKINDA</h2>
          <div class="space-y-3 text-xs font-mono text-slate-500">
            <p><span class="text-slate-400">Uygulama:</span> RimWorld Forge</p>
            <p><span class="text-slate-400">Versiyon:</span> v1.0.4</p>
            <p><span class="text-slate-400">Altyapı:</span> Tauri v2 + Vite 6 + Tailwind v4</p>
            <p><span class="text-slate-400">Geliştirici:</span> Pulsar</p>
          </div>
        `;
        break;
    }
  }

  private async bindPathControls() {
    const settings = this.getSettings();

    const modsInput = document.getElementById("path-mods") as HTMLInputElement | null;
    const configInput = document.getElementById("path-config") as HTMLInputElement | null;
    const dbInput = document.getElementById("path-db") as HTMLInputElement | null;
    const steamcmdInput = document.getElementById("path-steamcmd") as HTMLInputElement | null;

    if (modsInput) modsInput.value = settings.rimworld_mods_path || "";
    if (configInput) configInput.value = settings.rimworld_config_path || "";
    if (dbInput) dbInput.value = settings.db_path || "";
    if (steamcmdInput) steamcmdInput.value = settings.steamcmd_path || "";

    document.getElementById("btn-browse-steamcmd")?.addEventListener("click", async () => {
      const selected = await open({
        directory: false,
        multiple: false,
        title: "steamcmd.exe Seç",
        filters: [{ name: "EXE", extensions: ["exe"] }]
      });
      if (selected && typeof selected === "string" && steamcmdInput) steamcmdInput.value = selected;
    });

    // SteamCMD'yi tek tıkla indir/kur ve yolu ayarlara işle
    const autoBtn = document.getElementById("btn-auto-steamcmd") as HTMLButtonElement | null;
    const { listen } = await import("@tauri-apps/api/event");
    void listen<{ progress: number; speed: string; message: string }>("steamcmd-progress", (ev) => {
      if (autoBtn && !autoBtn.disabled && ev.payload.message) {
        autoBtn.textContent = ev.payload.progress > 0 ? `%${Math.round(ev.payload.progress)}` : "...";
      }
    }).catch(() => {});
    autoBtn?.addEventListener("click", async () => {
      if (!autoBtn || autoBtn.disabled) return;
      autoBtn.disabled = true;
      autoBtn.textContent = "KURULUYOR...";
      try {
        const path = await ModService.steamcmdSetup();
        if (steamcmdInput) steamcmdInput.value = path;
        settingsStore.setSettings({ ...this.getSettings(), steamcmd_path: path });
        Toast.show("SteamCMD kuruldu ve ayarlara işlendi.", "success");
      } catch (e) {
        Toast.show("SteamCMD kurulumu başarısız: " + e, "error");
      } finally {
        autoBtn.disabled = false;
        autoBtn.textContent = "OTOMATİK KUR";
      }
    });

    document.getElementById("btn-browse-mods")?.addEventListener("click", async () => {
      const selected = await open({ directory: true, multiple: false, title: "RimWorld Mods Klasörünü Seç" });
      if (selected && typeof selected === "string" && modsInput) modsInput.value = selected;
    });

    document.getElementById("btn-browse-config")?.addEventListener("click", async () => {
      const selected = await open({
        directory: false,
        multiple: false,
        title: "ModsConfig.xml Seç",
        filters: [{ name: "XML", extensions: ["xml"] }]
      });
      if (selected && typeof selected === "string" && configInput) configInput.value = selected;
    });

    document.getElementById("btn-detect-paths")?.addEventListener("click", async () => {
      try {
        const detected = await ModService.detectRimworldPaths();
        if (modsInput && detected.mods_path) modsInput.value = detected.mods_path;
        if (configInput && detected.config_path) configInput.value = detected.config_path;
        Toast.show("Yollar tespit edildi.", "success");
      } catch (e) {
        console.error("Otomatik tespit hatası:", e);
        Toast.show("Otomatik tespit başarısız oldu.", "error");
      }
    });

    document.getElementById("btn-save-paths")?.addEventListener("click", () => {
      const next: any = { ...settings };
      if (modsInput) next.rimworld_mods_path = modsInput.value.trim();
      if (configInput) next.rimworld_config_path = configInput.value.trim();
      if (dbInput) next.db_path = dbInput.value.trim();
      if (steamcmdInput) next.steamcmd_path = steamcmdInput.value.trim();
      settingsStore.setSettings(next);
      Toast.show("Ayarlar kaydedildi.", "success");
    });
  }

  private async handleClearCache() {
    const settings = this.getSettings();
    if (!settings.db_path) {
      Toast.show("Veritabanı yolu ayarlı değil.", "error");
      return;
    }
    try {
      await ModService.clearModsCache(settings.db_path);
      Toast.show("Önbellek temizlendi.", "success");
    } catch (e) {
      Toast.show("Önbellek temizlenemedi: " + e, "error");
    }
  }

  private getSettings(): any {
    // localStorage'dan ayarları oku (ana pencere ile aynı origin paylaşıldığı için çalışır)
    try {
      const saved = localStorage.getItem("app_settings");
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error("Ayarlar okunamadı:", e);
    }
    return {};
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new SettingsApp();
});

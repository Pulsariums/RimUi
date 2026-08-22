import { settingsStore } from "../../store/settingsStore";
import { open } from "@tauri-apps/plugin-dialog";
import { ModService } from "../../services/modService";
import { Toast } from "./Toast";
import { i18n } from "../../services/i18nService";

export class SettingsPanel {
  private container: HTMLElement;

  constructor(containerId: string) {
    this.container = document.getElementById(containerId) as HTMLElement;
    if (!this.container) throw new Error(`Container ${containerId} not found`);

    this.render();
  }

  private render() {
    const settings = settingsStore.getSettings();
    
    this.container.innerHTML = `
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 p-6 bg-slate-950 rounded-2xl shadow-xl">
        <!-- Dosya Yolları Ayarları -->
        <section class="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 shadow-lg backdrop-blur-sm">
          <div class="flex items-center space-x-4 mb-6">
            <div class="lottie-icon w-8 h-8 text-orange-400" data-lottie-path="assets/lottie/folder_open.json"></div>
            <div>
              <h2 class="text-2xl font-bold text-slate-100">Dosya Yolları</h2>
              <p class="text-slate-400">RimWorld ve Mod dosyalarının konumlarını yapılandırın.</p>
            </div>
          </div>
          
          <div class="space-y-5">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-800/50 rounded-xl border border-slate-700 shadow-sm">
              <div class="mb-3 sm:mb-0 sm:mr-4">
                <label for="set-mods-path" class="block text-slate-200 text-sm font-medium">RimWorld Mods Klasörü</label>
                <p class="text-slate-400 text-xs mt-1">Modların yüklü olduğu ana klasör.</p>
              </div>
              <div class="flex flex-col sm:flex-row items-stretch sm:items-center space-y-2 sm:space-y-0 sm:space-x-2 w-full sm:w-auto">
                <input type="text" id="set-mods-path" value="${settings.rimworld_mods_path || ''}" placeholder="C:/RimWorld/Mods" class="flex-1 min-w-[250px] bg-slate-950 text-slate-200 border border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all duration-200">
                <button id="btn-browse-mods" class="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 border border-slate-600/50 focus:outline-none focus:ring-2 focus:ring-slate-500 transition-all duration-200 text-sm font-medium flex-shrink-0 shadow-sm">
                  <div class="lottie-icon w-5 h-5 mr-2" data-lottie-path="assets/lottie/folder_open.json"></div><span>Gözat</span>
                </button>
              </div>
            </div>
 
            <div class="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-800/50 rounded-xl border border-slate-700 shadow-sm">
              <div class="mb-3 sm:mb-0 sm:mr-4">
                <label for="set-config-path" class="block text-slate-200 text-sm font-medium">ModsConfig.xml Yolu</label>
                <p class="text-slate-400 text-xs mt-1">Aktif mod listesinin tutulduğu XML dosyası.</p>
              </div>
              <div class="flex flex-col sm:flex-row items-stretch sm:items-center space-y-2 sm:space-y-0 sm:space-x-2 w-full sm:w-auto">
                <input type="text" id="set-config-path" value="${settings.rimworld_config_path || ''}" placeholder="ModsConfig.xml" class="flex-1 min-w-[250px] bg-slate-950 text-slate-200 border border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all duration-200">
                <button id="btn-browse-config" class="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 border border-slate-600/50 focus:outline-none focus:ring-2 focus:ring-slate-500 transition-all duration-200 text-sm font-medium flex-shrink-0 shadow-sm">
                  <div class="lottie-icon w-5 h-5 mr-2" data-lottie-path="assets/lottie/file_alt.json"></div><span>Gözat</span>
                </button>
              </div>
            </div>
 
            <div class="flex items-center justify-between p-4 bg-slate-800/50 rounded-xl border border-slate-700 shadow-sm">
              <div>
                <span class="block text-slate-200 text-sm font-medium">${i18n.t('detect_paths_title')}</span>
                <p class="text-slate-400 text-xs mt-1">${i18n.t('detect_paths_desc')}</p>
              </div>
              <button id="btn-detect-paths" class="btn-detect-paths px-4 py-2 bg-slate-800 text-slate-200 rounded-lg hover:bg-slate-700 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-500 transition-all duration-200 text-sm font-medium flex-shrink-0 shadow-sm">
                <div class="detect-spinner lottie-icon w-5 h-5 mr-2 hidden" data-lottie-path="assets/lottie/spinner.json">
                  <svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
                <div class="detect-icon lottie-icon w-5 h-5 mr-2" data-lottie-path="assets/lottie/search.json"></div>
                <span class="detect-label">${i18n.t('detect_paths_button')}</span>
              </button>
            </div>
          </div>
        </section>
 
        <!-- Veri & Yedekleme Ayarları -->
        <section class="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 shadow-lg backdrop-blur-sm">
          <div class="flex items-center space-x-4 mb-5">
            <div class="lottie-icon w-8 h-8 text-rust-light" data-lottie-path="assets/lottie/database.json"></div>
            <div>
              <h2 class="text-2xl font-bold text-slate-100">Veri & Yedekleme</h2>
              <p class="text-slate-400">Ayarlarınızı ve profillerinizi yedekleyin veya geri yükleyin.</p>
            </div>
          </div>
          
          <div class="space-y-5">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-800/50 rounded-xl border border-slate-700 shadow-sm">
              <div class="mb-3 sm:mb-0 sm:mr-4">
                <label for="set-db-path" class="block text-slate-200 text-sm font-medium">Veritabanı Yolu</label>
                <p class="text-slate-400 text-xs mt-1">Mod önbelleğinin saklandığı SQLite dosyası.</p>
              </div>
              <div class="flex-1">
                <input type="text" id="set-db-path" value="${settings.db_path}" class="w-full bg-slate-950 text-slate-200 border border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all duration-200" readonly>
              </div>
            </div>
 
            <div class="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-800/50 rounded-xl border border-slate-700 shadow-sm">
              <div class="mb-3 sm:mb-0 sm:mr-4">
                <span class="block text-slate-200 text-sm font-medium">Veri Yönetimi</span>
                <p class="text-slate-400 text-xs mt-1">Tüm uygulama verilerini dışa aktarın veya içe aktarın.</p>
              </div>
              <div class="flex space-x-2 flex-shrink-0">
                <button id="btn-import-settings" class="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 border border-slate-600/50 focus:outline-none focus:ring-2 focus:ring-slate-500 transition-all duration-200 text-sm font-medium shadow-sm">
                  <div class="lottie-icon w-5 h-5 mr-2" data-lottie-path="assets/lottie/download.json"></div><span>İçe Aktar</span>
                </button>
                <button id="btn-export-settings" class="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 border border-slate-600/50 focus:outline-none focus:ring-2 focus:ring-slate-500 transition-all duration-200 text-sm font-medium shadow-sm">
                  <div class="lottie-icon w-5 h-5 mr-2" data-lottie-path="assets/lottie/upload.json"></div><span>Dışa Aktar</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- Harici Kaynaklar (Extra Mod Source) -->
        <section class="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 shadow-lg backdrop-blur-sm lg:col-span-2">
          <div class="flex items-center space-x-4 mb-5">
            <div class="lottie-icon w-8 h-8 text-amber-400" data-lottie-path="assets/lottie/folder_open.json"></div>
            <div>
              <h2 class="text-2xl font-bold text-slate-100">${i18n.t('extra_mod_sources_title') || 'Harici Kaynaklar'}</h2>
              <p class="text-slate-400">${i18n.t('extra_mod_sources_desc') || 'Modları Downloads gibi başka klasörlerden kullanmak için kaynak ekleyin. Harici kaynaktaki modlar aktifleştirilince RimWorld/Mods klasörüne taşınır.'}</p>
            </div>
          </div>
          
          <div class="space-y-3 mb-4" id="extra-source-list">
            ${this.renderExtraSourceList()}
          </div>

          <div class="flex items-center gap-3 p-4 bg-slate-800/30 rounded-xl border border-dashed border-slate-700/50">
            <button id="btn-add-extra-source" class="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-opacity-75 transition-all duration-200 text-sm font-medium flex-shrink-0 shadow-sm">
              <svg class="w-5 h-5 mr-2 inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M12 4v16m8-8H4" stroke-linecap="round" stroke-linejoin="round"/></svg>
              <span>Klasör Ekle</span>
            </button>
            <span class="text-slate-500 text-xs italic">Modların bulunduğu bir klasör seçin (her alt klasör bir mod olarak algılanır)</span>
          </div>
        </section>

        <!-- Kaydetme Düğmesi -->
        <div class="flex justify-end p-4 bg-slate-900/60 border border-slate-800 rounded-2xl shadow-lg mt-6 lg:col-span-2 backdrop-blur-sm">
          <button id="btn-settings-save" class="px-6 py-3 bg-orange-600 text-white rounded-xl hover:bg-orange-700 hover:shadow-lg hover:shadow-orange-900/30 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all duration-200 text-base font-bold shadow-md">
            <div class="lottie-icon w-6 h-6 mr-2" data-lottie-path="assets/lottie/save.json"></div><span>Tüm Değişiklikleri Kaydet</span>
          </button>
        </div>
      </div>
    `;

    this.initEventListeners();
  }

  private initEventListeners() {
    this.container.querySelector("#btn-browse-mods")?.addEventListener("click", () => this.handleBrowseMods());
    this.container.querySelector("#btn-browse-config")?.addEventListener("click", () => this.handleBrowseConfig());
    this.container.querySelector("#btn-detect-paths")?.addEventListener("click", () => this.handleDetect());
    this.container.querySelector("#btn-import-settings")?.addEventListener("click", () => this.handleImport());
    this.container.querySelector("#btn-export-settings")?.addEventListener("click", () => this.handleExport());
    this.container.querySelector("#btn-settings-save")?.addEventListener("click", () => this.handleSave());
    this.container.querySelector("#btn-add-extra-source")?.addEventListener("click", () => this.handleAddExtraSource());

    // Extra source toggle/silme event'leri (delegation ile)
    this.container.querySelector("#extra-source-list")?.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      const toggleBtn = target.closest("[data-extra-toggle]") as HTMLElement;
      const removeBtn = target.closest("[data-extra-remove]") as HTMLElement;

      if (toggleBtn) {
        const id = toggleBtn.dataset.extraToggle;
        if (id) {
          settingsStore.toggleExtraModSource(id);
          this.render(); // UI'ı güncelle
        }
      }

      if (removeBtn) {
        const id = removeBtn.dataset.extraRemove;
        if (id) {
          settingsStore.removeExtraModSource(id);
          this.render(); // UI'ı güncelle
          Toast.show("Kaynak kaldırıldı.", "info");
        }
      }
    });
  }

  private async handleBrowseMods() {
    try {
      const selected = await open({ directory: true, multiple: false, title: "RimWorld Mods Klasörünü Seçin" });
      if (selected && typeof selected === "string") {
        (this.container.querySelector("#set-mods-path") as HTMLInputElement).value = selected;
      }
    } catch (e) { console.error(e); }
  }

  private async handleBrowseConfig() {
    try {
      const selected = await open({ multiple: false, title: "ModsConfig.xml Dosyasını Seçin", filters: [{ name: 'XML', extensions: ['xml'] }] });
      if (selected && typeof selected === "string") {
        (this.container.querySelector("#set-config-path") as HTMLInputElement).value = selected;
      }
    } catch (e) { console.error(e); }
  }

  private async handleDetect() {
    const btn = this.container.querySelector("#btn-detect-paths") as HTMLButtonElement;
    const spinner = btn?.querySelector(".detect-spinner") as HTMLElement;
    const icon = btn?.querySelector(".detect-icon") as HTMLElement;
    const label = btn?.querySelector(".detect-label") as HTMLElement;

    if (btn) btn.disabled = true;
    if (spinner) spinner.classList.remove("hidden");
    if (icon) icon.classList.add("hidden");
    if (label) label.textContent = i18n.t("detect_paths_scanning");

    try {
      const detected = await ModService.detectRimworldPaths();

      if (detected.mods_path || detected.config_path) {
        if (detected.mods_path) {
          (this.container.querySelector("#set-mods-path") as HTMLInputElement).value = detected.mods_path;
        }
        if (detected.config_path) {
          (this.container.querySelector("#set-config-path") as HTMLInputElement).value = detected.config_path;
        }
        Toast.show(i18n.t("detect_paths_success"), "success");
      } else {
        Toast.show(i18n.t("detect_paths_not_found"), "error");
      }
    } catch (e) {
      console.error("Detect paths error:", e);
      Toast.show(i18n.t("detect_paths_error"), "error");
    } finally {
      if (btn) btn.disabled = false;
      if (spinner) spinner.classList.add("hidden");
      if (icon) icon.classList.remove("hidden");
      if (label) label.textContent = i18n.t("detect_paths_button");
    }
  }

  private handleSave() {
    const modsPath = (this.container.querySelector("#set-mods-path") as HTMLInputElement).value;
    const configPath = (this.container.querySelector("#set-config-path") as HTMLInputElement).value;
    const dbPath = (this.container.querySelector("#set-db-path") as HTMLInputElement).value;
    const currentSettings = settingsStore.getSettings();

    settingsStore.setSettings({
      rimworld_mods_path: modsPath,
      rimworld_config_path: configPath,
      db_path: dbPath,
      rimworld_exe_path: currentSettings.rimworld_exe_path || "",
      steamcmd_path: currentSettings.steamcmd_path || ""
    });

    Toast.show("Ayarlar başarıyla kaydedildi.", "success");
  }

  private async handleImport() {
    try {
      const path = await open({ multiple: false, title: "Ayarlar Dosyasını Seçin", filters: [{ name: 'JSON', extensions: ['json'] }] });
      if (!path || typeof path !== "string") return;
      const data = await ModService.importAppData(path);
      if (data && data.rimworld_mods_path) {
        settingsStore.setSettings({
          rimworld_mods_path: data.rimworld_mods_path,
          rimworld_config_path: data.rimworld_config_path,
          db_path: data.db_path,
          rimworld_exe_path: data.rimworld_exe_path || "",
          steamcmd_path: data.steamcmd_path || ""
        });
        this.render();
        Toast.show("Ayarlar başarıyla içe aktarıldı!", "success");
      }
    } catch (e) {
      Toast.show("İçe aktarma hatası.", "error");
    }
  }

  private async handleExport() {
    try {
      const path = await open({ directory: false, multiple: false, title: "Ayarları Kaydet", filters: [{ name: 'JSON', extensions: ['json'] }] });
      if (!path || typeof path !== "string") return;
      const settings = settingsStore.getSettings();
      const exportData = {
        rimworld_mods_path: settings.rimworld_mods_path,
        rimworld_config_path: settings.rimworld_config_path,
        db_path: settings.db_path,
        profiles: []
      };
      await ModService.exportAppData(path, exportData);
      Toast.show("Ayarlar başarıyla dışa aktarıldı!", "success");
    } catch (e) {
      Toast.show("Dışa aktarma hatası.", "error");
    }
  }

  private renderExtraSourceList(): string {
      const sources = settingsStore.getExtraModSources();
      
      if (sources.length === 0) {
        return `<div class="text-slate-500 text-xs italic p-4 text-center">Henüz harici kaynak eklenmemiş.</div>`;
      }
  
      return sources.map(source => `
        <div class="flex items-center justify-between p-3 bg-slate-800/40 rounded-lg border border-slate-700/40 ${source.enabled ? '' : 'opacity-50'}">
          <div class="flex items-center gap-3 flex-1 min-w-0">
            <div class="w-2 h-2 rounded-full flex-shrink-0 ${source.enabled ? 'bg-emerald-500' : 'bg-slate-600'}"></div>
            <div class="flex-1 min-w-0">
              <div class="text-slate-200 text-sm font-medium truncate">${this.escapeHtml(source.name)}</div>
              <div class="text-slate-500 text-xs truncate font-mono">${this.escapeHtml(source.path)}</div>
            </div>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0 ml-2">
            <label class="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" class="sr-only peer" ${source.enabled ? 'checked' : ''} data-extra-toggle="${source.id}">
              <div class="w-8 h-4 bg-slate-700 rounded-full peer peer-checked:bg-amber-600 peer-focus:ring-1 peer-focus:ring-amber-500 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-4"></div>
            </label>
            <button data-extra-remove="${source.id}" class="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors" title="Kaldır">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div>
        </div>
      `).join('');
  }

  private async handleAddExtraSource(): Promise<void> {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Mod Klasörünü Seç'
      });
      if (selected && typeof selected === "string") {
        settingsStore.addExtraModSource(selected);
        this.render();
        Toast.show("Harici kaynak eklendi. Modlar taranıyor...", "success");
      }
    } catch (e) {
      console.error("Klasör seçme hatası:", e);
      Toast.show("Klasör seçilemedi.", "error");
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

import { modStore } from "../../store";
import { profileStore } from "../../store/profileStore";
import { settingsStore } from "../../store/settingsStore";
import { ModService } from "../../services/modService";
import { AnimationService } from "../../services/animationService";
import { Toast } from "../shared/Toast";
import type { ModMetadata } from "../../types";

export class Dashboard {
  private container: HTMLElement;

  constructor(containerId: string) {
    this.container = document.getElementById(containerId) as HTMLElement;
    if (!this.container) throw new Error(`Container ${containerId} not found`);
    this.render();

    // Store değişikliklerinde Dashboard'u otomatik güncelle
    modStore.subscribe(() => this.render());
    modStore.subscribeActiveMods(() => this.render());
    profileStore.subscribe(() => this.render());
  }

  private async handleQuickScan() {
    try {
      Toast.show("Hızlı tarama başlatılıyor...", "info");
      const settings = settingsStore.getSettings();
      if (!settings.rimworld_mods_path) {
        Toast.show("Lütfen önce klasör yollarını ayarlayın.", "error");
        return;
      }
      const mods = await ModService.scanMods(settings.rimworld_mods_path, settings.db_path);
      modStore.setMods(mods);
      this.render();
      Toast.show(`${mods.length} mod tarandı.`, "success");
    } catch (err: any) {
      Toast.show(`Tarama hatası: ${err.toString()}`, "error");
    }
  }

  private async handleUpdateMods() {
    const activeIds = modStore.getActiveProfileMods();
    if (activeIds.length === 0) {
      Toast.show("Güncellenecek aktif mod yok.", "info");
      return;
    }
    try {
      Toast.show(`${activeIds.length} mod güncelleniyor...`, "info");
      await ModService.updateMods(activeIds);
      Toast.show("Modlar güncellendi.", "success");
    } catch (err: any) {
      Toast.show(`Güncelleme hatası: ${err.toString()}`, "error");
    }
  }

  private async handleValidate() {
    const activeIds = modStore.getActiveProfileMods();
    const activeMetas = activeIds
      .map(id => modStore.findMod(id))
      .filter((m): m is ModMetadata => !!m);
    if (activeMetas.length === 0) {
      Toast.show("Doğrulanacak aktif mod yok.", "info");
      return;
    }
    try {
      const valid = await ModService.validateSorting(activeMetas);
      Toast.show(valid ? "Sıralama geçerli." : "Sıralama geçersiz.", valid ? "success" : "warning");
    } catch (err: any) {
      Toast.show(`Doğrulama hatası: ${err.toString()}`, "error");
    }
  }

  private render() {
    const settings = settingsStore.getSettings();
    const mods = modStore.getMods();
    const activeProfile = profileStore.getActiveProfile();
    const activeMods = modStore.getActiveProfileMods();
    
    const hasModsPath = !!settings.rimworld_mods_path;
    const hasConfigPath = !!settings.rimworld_config_path;

    this.container.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <!-- System Health Card -->
        <div class="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl shadow-xl backdrop-blur-sm flex flex-col justify-between">
          <div>
            <h3 class="text-lg font-bold text-slate-100 mb-4 flex items-center">
              <div class="lottie-icon w-6 h-6 mr-2" data-lottie-path="assets/lottie/system.json"></div>
              Sistem Sağlığı
            </h3>
            <div class="space-y-3">
              <div class="flex justify-between items-center p-3 bg-slate-950/50 rounded-xl border border-slate-800">
                <span class="text-slate-400 text-sm">Mods Klasörü</span>
                <span class="text-xs font-bold ${hasModsPath ? 'text-emerald-400' : 'text-red-400'}">
                  ${hasModsPath ? '✓ Bağlı' : '✗ Eksik'}
                </span>
              </div>
              <div class="flex justify-between items-center p-3 bg-slate-950/50 rounded-xl border border-slate-800">
                <span class="text-slate-400 text-sm">Config Dosyası</span>
                <span class="text-xs font-bold ${hasConfigPath ? 'text-emerald-400' : 'text-red-400'}">
                  ${hasConfigPath ? '✓ Bağlı' : '✗ Eksik'}
                </span>
              </div>
              <div class="flex justify-between items-center p-3 bg-slate-950/50 rounded-xl border border-slate-800">
                <span class="text-slate-400 text-sm">SteamCMD</span>
                <span class="text-xs font-bold text-emerald-400">✓ Hazır</span>
              </div>
            </div>
          </div>
          <button id="btn-dash-scan" class="mt-6 w-full py-3 px-4 bg-slate-800 text-slate-200 rounded-xl hover:bg-slate-700 transition-all duration-200 font-bold text-sm flex items-center justify-center space-x-2 border border-slate-700">
            <div class="lottie-icon w-4 h-4 mr-2" data-lottie-path="assets/lottie/scan.json"></div>
            <span>Hızlı Tarama Yap</span>
          </button>
        </div>

        <!-- Profile Summary Card -->
        <div class="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl shadow-xl backdrop-blur-sm flex flex-col justify-between">
          <div>
            <h3 class="text-lg font-bold text-slate-100 mb-4 flex items-center">
              <div class="lottie-icon w-6 h-6 mr-2" data-lottie-path="assets/lottie/user.json"></div>
              Aktif Profil
            </h3>
            <div class="p-4 bg-orange-600/10 border border-orange-600/30 rounded-2xl text-center mb-4">
              <span class="text-2xl font-black text-orange-500">${activeProfile ? activeProfile.name : 'Profil Seçilmedi'}</span>
            </div>
            <div class="grid grid-cols-3 gap-3">
              <div class="p-3 bg-slate-950/50 rounded-xl border border-slate-800 text-center">
                <span class="block text-slate-500 text-xs uppercase font-bold mb-1">Toplam Mod</span>
                <span class="text-xl font-bold text-slate-200">${mods.length}</span>
              </div>
              <div class="p-3 bg-slate-950/50 rounded-xl border border-slate-800 text-center">
                <span class="block text-slate-500 text-xs uppercase font-bold mb-1">Aktif</span>
                <span class="text-xl font-bold text-emerald-400">${activeMods.length}</span>
              </div>
              <div class="p-3 bg-slate-950/50 rounded-xl border border-slate-800 text-center">
                <span class="block text-slate-500 text-xs uppercase font-bold mb-1">Pasif</span>
                <span class="text-xl font-bold text-red-400">${mods.length - activeMods.length}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Quick Actions Card -->
        <div class="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl shadow-xl backdrop-blur-sm">
          <h3 class="text-lg font-bold text-slate-100 mb-4 flex items-center">
            <div class="lottie-icon w-6 h-6 mr-2" data-lottie-path="assets/lottie/bolt.json"></div>
            Hızlı İşlemler
          </h3>
          <div class="space-y-3">
            <button id="btn-dash-update" class="w-full py-3 px-4 bg-slate-800 text-slate-200 rounded-xl hover:bg-slate-700 transition-all duration-200 text-sm font-medium flex items-center justify-between border border-slate-700 group">
              <span class="flex items-center">
                <div class="lottie-icon w-4 h-4 mr-2" data-lottie-path="assets/lottie/refresh.json"></div>
                Tüm Modları Güncelle
              </span>
              <span class="opacity-0 group-hover:opacity-100 transition-opacity text-orange-500">→</span>
            </button>
            <button id="btn-dash-validate" class="w-full py-3 px-4 bg-slate-800 text-slate-200 rounded-xl hover:bg-slate-700 transition-all duration-200 text-sm font-medium flex items-center justify-between border border-slate-700 group">
              <span class="flex items-center">
                <div class="lottie-icon w-4 h-4 mr-2" data-lottie-path="assets/lottie/check.json"></div>
                Sıralamayı Doğrula
              </span>
              <span class="opacity-0 group-hover:opacity-100 transition-opacity text-orange-500">→</span>
            </button>
          </div>
        </div>
      </div>
    `;

    document.getElementById("btn-dash-scan")?.addEventListener("click", () => this.handleQuickScan());
    document.getElementById("btn-dash-update")?.addEventListener("click", () => this.handleUpdateMods());
    document.getElementById("btn-dash-validate")?.addEventListener("click", () => this.handleValidate());
    
    AnimationService.loadAll();
  }
}

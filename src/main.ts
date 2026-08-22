import { debugConsole } from "./services/debugConsole";
import { settingsStore } from "./store/settingsStore";
import { profileStore } from "./store/profileStore";
import { modStore } from "./store/modStore";
import { ModService } from "./services/modService";
import { ModList } from "./components/mod-list/ModList";
import { ModDetailPanel } from "./components/mod-list/ModDetailPanel";
import { Toast } from "./components/shared/Toast";
import { i18n } from "./services/i18nService";
import { windowManager } from "./services/windowManager";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import type { ModsConfig, ModMetadata, HistoryEntry, ModProfile, ModGroup } from "./types";

class App {
  private detailPanel: ModDetailPanel;

  constructor() {
    debugConsole.init();
    this.detailPanel = new ModDetailPanel("ui-inspector-content");
    this.initApp();
  }

  private async initApp() {
    console.log("Uygulama baslatildi. Arayuz sifirdan insa edilecek.");

    const currentSettings = settingsStore.getSettings();
    
    // Varsayılan yollar
    if (!currentSettings.rimworld_mods_path || currentSettings.rimworld_mods_path.includes("Steam") || currentSettings.db_path === "mods_cache.db") {
      const detectedHeroicMods = "C:\\Users\\Pulsar\\Games\\Heroic\\RimWorld\\Mods";
      const detectedHeroicConfig = "C:\\Users\\Pulsar\\AppData\\LocalLow\\Ludeon Studios\\RimWorld by Ludeon Studios\\Config\\ModsConfig.xml";
      const absoluteDbPath = "C:\\Users\\Pulsar\\AppData\\Local\\RimWorldModHelper\\mods_cache.db";
      const detectedHeroicExe = "C:\\Users\\Pulsar\\Games\\Heroic\\RimWorld\\RimWorldWin64.exe";
      
      settingsStore.setSettings({
        rimworld_mods_path: detectedHeroicMods,
        rimworld_config_path: detectedHeroicConfig,
        db_path: absoluteDbPath,
        rimworld_exe_path: detectedHeroicExe,
        steamcmd_path: currentSettings.steamcmd_path || ""
      });
      console.log("Pulsar'in Heroic RimWorld kurulumu otomatik olarak ayarlandi:", detectedHeroicMods);
    }

    // 🔴 ÖNCE: Profil listesini dinle ve UI'i güncelle (scan_mods'tan önce!)
    profileStore.subscribeList((profileNames: string[]) => {
      this.renderPresets(profileNames);
    });

    // Varsayılan profilleri ayarla — depo boşsa yalnızca Default olsun
    // (eski seed listesi "Varsayilan/Endustriyel Modpack/Orta Cag" yanlıştı:
    //  gerçek varsayılan "Default"dur ve loadFromStorage zaten onu üretir.)
    const currentProfiles = profileStore.getProfiles();
    if (currentProfiles.length === 0) {
      profileStore.addProfile(profileStore.getDefaultName());
    } else {
      this.renderPresets(profileStore.getProfileNames());
    }

    // SONRA: Modları tara (chunked - kademeli UI yükleme)
    const finalSettings = settingsStore.getSettings();
    if (finalSettings.rimworld_mods_path && finalSettings.db_path) {
      // ÖNCE: Tutarlılık kontrolü için ModsConfig.xml'i oku (modlardan bağımsız)
      const performConsistencyCheck = async () => {
        if (!finalSettings.rimworld_config_path) return;
        try {
          const config = await ModService.readModsConfig(finalSettings.rimworld_config_path);
          console.log("[DEBUG main.ts] ModsConfig.xml okundu - aktif mod sayisi:", config.active_mods.length);

          const diskMods = config.active_mods.map(m => m.toLowerCase());

          const lastSelected = profileStore.getLastSelectedName();
          const lastProfile = lastSelected
            ? profileStore.getProfiles().find(p => p.name === lastSelected)
            : undefined;

          const isConsistent = lastProfile &&
            JSON.stringify([...lastProfile.active_mods].sort()) === JSON.stringify([...diskMods].sort());

          if (isConsistent) {
            if (lastProfile) modStore.loadWorkspaceFromProfile(lastProfile);
            console.log("[DEBUG main.ts] Tutarli profil yuklendi:", lastProfile?.name);
          } else if (lastProfile && !lastProfile.isDefault) {
            // 🔴 Çakışma: kullanıcıya SOR (sessizce Default'a atlama)
            const useDisk = await this.showConsistencyModal(lastProfile.name, diskMods, lastProfile.active_mods);
            if (useDisk) {
              lastProfile.active_mods = diskMods;
              profileStore.saveActiveToProfile(lastProfile.name, diskMods);
              modStore.loadWorkspaceFromProfile(lastProfile);
            } else {
              modStore.loadWorkspaceFromProfile(lastProfile);
            }
          } else {
            // Default (veya profil yok): diski Default'a yansıt
            const defaultProfile = profileStore.getProfiles().find(p => p.isDefault);
            if (defaultProfile) {
              profileStore.selectProfile(defaultProfile.name);
              defaultProfile.active_mods = diskMods;
              modStore.loadWorkspaceFromProfile(defaultProfile);
              profileStore.saveActiveToProfile(defaultProfile.name, diskMods);
            }
          }

          const selectedName = profileStore.getSelectedName();
          const label = document.getElementById("active-profile-label");
          if (label) label.innerText = `PROFIL: ${selectedName?.toUpperCase() || 'DEFAULT'}`;
        } catch (err) {
          console.warn("[DEBUG main.ts] ModsConfig.xml okunamadi:", err);
        }
      };

      // Tutarlılık kontrolünü hemen yap (workspace yüklensin)
      performConsistencyCheck();

      // Modları chunk chunk yükle (Rust tek seferde gönderir, frontend kademeli işler)
      ModService.scanMods(finalSettings.rimworld_mods_path, finalSettings.db_path)
        .then(mods => {
          console.log("[DEBUG main.ts] scanMods sonucu - toplam mod:", mods.length);
          
          const chunkSize = 100;
          let index = 0;
          this.updateLoadingProgress(0, mods.length);

          const loadNextChunk = () => {
            const chunk = mods.slice(index, index + chunkSize);
            if (chunk.length === 0) {
              console.log(`[DEBUG main.ts] Tum modlar yuklendi (${mods.length})`);
              
              // dead_mods kontrolü
              const allLoadedMods = modStore.getMods();
              const loadedIds = new Set(allLoadedMods.map(m => m.package_id.toLowerCase()));
              const selectedProfile = profileStore.getActiveProfile();
              if (selectedProfile?.dead_mods) {
                selectedProfile.dead_mods.forEach(id => {
                  if (!loadedIds.has(id.toLowerCase())) {
                    modStore.markModAsDead(id.toLowerCase());
                  }
                });
              }

              // Gerçek yükleme bitti — per-panel göstergeleri kapat
              this.updateLoadingProgress(mods.length, mods.length);
              this.hideShelfLoading();
              return;
            }
            modStore.addModsChunk(chunk);
            index += chunkSize;
            this.updateLoadingProgress(Math.min(index, mods.length), mods.length);
            setTimeout(loadNextChunk, 0); // UI'a nefes aldır
          };

          // İlk chunk'ı hemen yükle, sonrakiler setTimeout ile
          const firstChunk = mods.slice(0, chunkSize);
          modStore.addModsChunk(firstChunk);
          index = chunkSize;
          this.updateLoadingProgress(Math.min(index, mods.length), mods.length);
          if (mods.length > chunkSize) {
            setTimeout(loadNextChunk, 0);
          }
        })
        .catch(err => {
          console.error("[DEBUG main.ts] Modlar taranirken hata:", err);
          this.hideShelfLoading();
        });
    } else {
      // Yollar ayarlı değil — per-panel göstergeleri kapat, kullanıcı ayarlardan yapacak
      this.hideShelfLoading();
    }

    // Not: "mods_chunk" event dinleyicisi kaldırıldı — Rust tarafı bu event'i
    // hiç emit etmiyor; tarama tek seferde döndürülüp frontend'te chunk'lara ayrılıyor.

    // RimSort Watchdog
    this.setupModsConfigWatcher();

    // Ayarlar penceresinden yapılan değişiklikleri ana pencereye yansıt
    this.setupSettingsSync();

    new ModList("ui-active-shelves", "ui-library-shelves", this.detailPanel);

    // Dil değişince tüm arayüz metinlerini güncelle + başlangıçta uygula
    document.addEventListener('lang-changed', () => {
      i18n.applyI18n();
      this.renderPresets(profileStore.getProfileNames());
      this.updatePresetActionButtons();
    });
    i18n.applyI18n();

    // Workspace değişince preset ışıklarını ve aksiyon butonlarını güncelle (senkron durumu)
    modStore.subscribeActiveMods(() => {
      this.renderPresets(profileStore.getProfileNames());
      this.updatePresetActionButtons();
      this.updateUndoRedoButtons();
    });
    this.updatePresetActionButtons();

    await this.setupUIListeners();
    this.setupSplitters();
  }

  /** Gerçek tarama ilerlemesini raf başlıklarındaki çubuklara yansıt (tam ekran yok) */
  private updateLoadingProgress(loaded: number, total: number): void {
    const safeLoaded = Math.max(0, Math.min(loaded, total));
    const pct = total > 0 ? Math.round((safeLoaded / total) * 100) : 0;
    const countText = `${safeLoaded} / ${total} MOD`;

    // Kütüphane + aktif raf başlıklarındaki çubuklar
    const bars: Array<[string, string, string]> = [
      ["library-loading", "library-loading-bar", "library-loading-count"],
      ["active-loading", "active-loading-bar", "active-loading-count"]
    ];
    for (const [barId, fillId, countId] of bars) {
      const bar = document.getElementById(barId);
      if (bar) bar.style.display = "flex";
      const fill = document.getElementById(fillId);
      if (fill) fill.style.width = `${pct}%`;
      const count = document.getElementById(countId);
      if (count) count.textContent = countText;
    }

    // Detay paneli yükleme göstergesi
    const insp = document.getElementById("inspector-loading");
    if (insp) insp.style.display = "flex";
  }

  /** Yükleme bittiğinde per-panel göstergeleri kaldır */
  private hideShelfLoading(): void {
    for (const id of ["library-skeleton", "active-skeleton"]) {
      const el = document.getElementById(id);
      if (el) el.remove();
    }
    const insp = document.getElementById("inspector-loading");
    if (insp) insp.style.display = "none";
    // İlerleme çubuklarını kısa gecikmeyle gizle (kullanıcı son yüzdeyi görür)
    setTimeout(() => {
      for (const id of ["library-loading", "active-loading"]) {
        const el = document.getElementById(id);
        if (el) el.style.display = "none";
      }
    }, 500);
  }

  // Ayarlar penceresi aynı origin'i paylaştığı için localStorage 'storage' event'i
  // diğer pencerede setItem yapıldığında tetiklenir.
  private setupSettingsSync() {
    window.addEventListener("storage", (e) => {
      if (e.key === "app_settings") {
        settingsStore.reloadFromStorage();
        console.log("[main.ts] Ayarlar penceresinden güncelleme alındı.");
      }
    });
  }

  // RimSort Watchdog: ModsConfig.xml değişikliklerini dinle
  private setupModsConfigWatcher() {
    listen<ModsConfig>("mods-config-changed", (event) => {
      const config = event.payload;
      console.log("ModsConfig.xml degisti (watchdog), aktif modlar:", config.active_mods.length);

      const allMods = modStore.getMods();
      const validActiveMods = config.active_mods.filter(id =>
        allMods.some(m => m.package_id.toLowerCase() === id.toLowerCase())
      );
      
      modStore.setActiveProfileMods(validActiveMods);

      // Aktif profili de güncelle — tutarlılık zinciri (profil eski kalmamalı)
      const activeProfile = profileStore.getActiveProfile();
      if (activeProfile) {
        profileStore.saveActiveToProfile(activeProfile.name, validActiveMods);
      }

      Toast.show(
        `ModsConfig.xml degisti: ${validActiveMods.length} mod aktif`,
        "info"
      );
    }).catch(err => {
      console.warn("mods-config-changed event listener kurulamadi:", err);
    });
  }

  // ModsConfig.xml'e kaydet (BAŞLAT butonu için)
  private async saveWorkspaceToModsConfig() {
    const settings = settingsStore.getSettings();
    if (!settings.rimworld_config_path) {
      Toast.show("ModsConfig.xml yolu ayarlanmamis. Lutfen once ayarlari yapilandirin.", "error");
      return false;
    }

    // RimSort 4-Tier + Kahn's Algorithm ile aktif sırayı bağımlılık temelli düzenle
    let activeMods = modStore.getActiveProfileMods();
    const activeMetas = activeMods
      .map(id => modStore.findMod(id))
      .filter((m): m is ModMetadata => !!m);

    if (activeMetas.length > 0) {
      try {
        const sortedIds = await ModService.sortModsRimworld(activeMetas);
        if (sortedIds.length > 0) {
          modStore.setActiveProfileMods(sortedIds);
          activeMods = sortedIds;
        }
      } catch (err: any) {
        console.warn("Otomatik siralama yapilamadi, mevcut siralama korunuyor:", err);
        Toast.show("Otomatik siralama yapilamadi (dongu olabilir); mevcut siralama kullanildi.", "warning");
      }
    }

    let currentVersion: string | undefined;
    let currentKnownExpansions: string[] = [];
    
    try {
      const currentConfig = await ModService.readModsConfig(settings.rimworld_config_path);
      currentVersion = currentConfig.version;
      currentKnownExpansions = currentConfig.known_expansions || [];
    } catch {
      console.warn("Mevcut ModsConfig.xml okunamadi, varsayilan degerlerle kaydediliyor");
    }

    try {
      await ModService.saveModsConfig(settings.rimworld_config_path, {
        active_mods: activeMods,
        version: currentVersion,
        known_expansions: currentKnownExpansions
      });
      Toast.show("Mod siralamasi ModsConfig.xml'e kaydedildi.", "success");
      return true;
    } catch (err: any) {
      Toast.show("Kaydetme hatasi: " + err.toString(), "error");
      return false;
    }
  }

  /**
   * "UYGULA" — workspace'i sıralar, ModsConfig.xml'e yazar ve Default profiline işler.
   * Default'un geçmişine yeni bir 'apply' adımı ekler (30 limit).
   */
  private async handleApplyToGame(): Promise<boolean> {
    const saved = await this.saveWorkspaceToModsConfig();
    if (!saved) return false;

    const workspace = modStore.getActiveProfileMods();
    const defaultProfile = profileStore.getProfiles().find(p => p.isDefault);
    if (defaultProfile) {
      profileStore.saveActiveToProfile(
        defaultProfile.name,
        workspace,
        modStore.getGroupsForProfile()
      );
      profileStore.recordSnapshot(defaultProfile.name, 'apply', workspace);
    }
    Toast.show(i18n.t('toast_applied'), "success");
    this.renderPresets(profileStore.getProfileNames());
    this.updatePresetActionButtons();
    return true;
  }

  /**
   * "PRESETE KAYDET" — workspace'i aktif presete yazar ve preset'in kendi
   * geçmişine 'preset_save' adımı ekler (kayıtlı son hali olur).
   */
  private handleSavePreset(): void {
    const activeProfile = profileStore.getActiveProfile();
    if (!activeProfile || activeProfile.isDefault) {
      Toast.show(i18n.t('toast_no_active_preset'), "info");
      return;
    }
    const workspace = modStore.getActiveProfileMods();
    profileStore.saveActiveToProfile(
      activeProfile.name,
      workspace,
      modStore.getGroupsForProfile()
    );
    profileStore.recordSnapshot(activeProfile.name, 'preset_save', workspace);
    Toast.show(i18n.t('toast_preset_saved').replace('{name}', activeProfile.name).replace('{count}', String(workspace.length)), "success");
    this.renderPresets(profileStore.getProfileNames());
    this.updatePresetActionButtons();
  }

  /**
   * "KAYDET & UYGULA" — presete kaydeder + Default'a yeni aşama olarak uygular.
   */
  private async handleSaveAndApplyPreset(): Promise<void> {
    const activeProfile = profileStore.getActiveProfile();
    if (!activeProfile || activeProfile.isDefault) {
      Toast.show(i18n.t('toast_no_active_preset'), "info");
      return;
    }
    this.handleSavePreset();
    const ok = await this.handleApplyToGame();
    if (ok) {
      Toast.show(i18n.t('toast_preset_applied').replace('{name}', activeProfile.name), "success");
    }
  }

  /** Workspace ile profilin kayıtlı içeriği birebir eşleşiyor mu? */
  private isWorkspaceSynced(profile: ModProfile | undefined): boolean {
    if (!profile) return false;
    const saved = (profile.active_mods || []).map(id => id.toLowerCase());
    const workspace = modStore.getActiveProfileMods().map(id => id.toLowerCase());
    if (saved.length !== workspace.length) return false;
    for (let i = 0; i < saved.length; i++) {
      if (saved[i] !== workspace[i]) return false;
    }
    return true;
  }

  /** Preset aksiyon butonları — sadece Default dışındaki aktif profilde görünür */
  private updatePresetActionButtons(): void {
    const activeProfile = profileStore.getActiveProfile();
    const isDefault = !activeProfile || activeProfile.isDefault || activeProfile.name === 'Default';
    const btnSave = document.getElementById('btn-save-preset') as HTMLElement | null;
    const btnApply = document.getElementById('btn-save-apply-preset') as HTMLElement | null;
    if (btnSave) btnSave.style.display = isDefault ? 'none' : '';
    if (btnApply) btnApply.style.display = isDefault ? 'none' : '';
  }

  private getPresetColor(name: string): string {
    const colors = [
      "#b35d2d",
      "#4a7a4a",
      "#2a5a8a",
      "#7a2a8a",
      "#8b2e2e",
      "#7a7a2a",
      "#2a8a8a"
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  }

  private renderPresets(profiles: string[]) {
    const container = document.getElementById("preset-container");
    if (!container) return;
    container.innerHTML = "";

    const activeProfileName = profileStore.getSelectedName();

    profiles.forEach(profileName => {
      const wrapper = document.createElement("div");
      wrapper.className = "preset-btn-wrapper";

      const btn = document.createElement("button");
      btn.className = "preset-btn";
      // Açıklama + mod sayısı tooltip'i
      const profileData = profileStore.getProfiles().find(p => p.name === profileName);
      const modCount = profileData?.active_mods?.length ?? 0;
      const desc = profileData?.description?.trim();
      btn.title = desc
        ? `${profileName} — ${desc} (${modCount} mod)`
        : `${profileName} (${modCount} mod)`;

      const firstLetter = profileName.charAt(0).toUpperCase();
      const color = this.getPresetColor(profileName);

      btn.style.borderLeft = `3px solid ${color}`;

      const letterSpan = document.createElement("span");
      letterSpan.className = "font-mono font-bold";
      letterSpan.style.color = color;
      letterSpan.innerText = firstLetter;

      const nameSpan = document.createElement("span");
      nameSpan.className = "preset-name-tag text-slate-300";
      nameSpan.innerText = profileName;

      btn.appendChild(letterSpan);
      btn.appendChild(nameSpan);

      // Sağlık göstergesi (sağlıksız preset'lerde renkli nokta)
      if (profileData && profileData.health && profileData.health !== 'normal') {
        const healthDot = document.createElement("span");
        healthDot.className = "preset-health-dot";
        healthDot.style.marginLeft = "auto";
        healthDot.style.marginRight = "4px";
        healthDot.style.width = "6px";
        healthDot.style.height = "6px";
        healthDot.style.borderRadius = "50%";
        healthDot.style.flexShrink = "0";
        healthDot.style.display = "none"; /* hidden by default, shown on hover */
        if (profileData.health === 'has_kayip') {
          healthDot.style.backgroundColor = "#f9a825";
          healthDot.style.boxShadow = "0 0 4px #f9a825";
          btn.title = `${profileName} (${i18n.t('preset_kayip')})`;
        } else if (profileData.health === 'bozuk') {
          healthDot.style.backgroundColor = "#8b2e2e";
          healthDot.style.boxShadow = "0 0 4px #8b2e2e";
          btn.title = `${profileName} (${i18n.t('preset_bozuk')})`;
        }
        btn.appendChild(healthDot);
      }

      // Aktif preset göstergesi — yeşil: senkron (kullanımda), sarı: değiştirildi
      if (activeProfileName === profileName) {
        const synced = this.isWorkspaceSynced(profileData);
        const activeDot = document.createElement("span");
        activeDot.className = "preset-active-dot";
        activeDot.style.width = "8px";
        activeDot.style.height = "8px";
        activeDot.style.borderRadius = "50%";
        activeDot.style.marginLeft = "auto";
        activeDot.style.marginRight = "4px";
        activeDot.style.flexShrink = "0";
        activeDot.style.backgroundColor = synced ? "#34d399" : "#fbbf24";
        activeDot.style.boxShadow = synced ? "0 0 6px #34d399" : "0 0 6px #fbbf24";
        activeDot.title = synced
          ? i18n.t('preset_in_use_synced')
          : i18n.t('preset_in_use_modified');
        btn.appendChild(activeDot);
        btn.title = `${profileName} (${i18n.t('preset_in_use')}${synced ? '' : ` - ${i18n.t('preset_modified')}`})`;
        btn.classList.add('preset-active');
      }

      // Tıklayınca profili yükle
      btn.addEventListener("click", () => {
        profileStore.selectProfile(profileName);
        const profile = profileStore.getProfiles().find(p => p.name === profileName);
        if (profile) {
          modStore.loadWorkspaceFromProfile(profile);
        }
        const label = document.getElementById("active-profile-label");
        if (label) label.innerText = `PROFIL: ${profileName.toUpperCase()}`;
      });

      // Sağ tık menüsü
      btn.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        this.showPresetContextMenu(e, profileName);
      });

      wrapper.appendChild(btn);
      container.appendChild(wrapper);
    });
  }

  // Özel Sağ Tık Menüsünü Göster
  private showPresetContextMenu(e: MouseEvent, profileName: string) {
    const existingMenu = document.getElementById("active-context-menu");
    if (existingMenu) existingMenu.remove();

    const menu = document.createElement("div");
    menu.id = "active-context-menu";
    menu.className = "industrial-context-menu";
    menu.style.left = `${Math.min(e.clientX + 5, window.innerWidth - 170)}px`;
    menu.style.top = `${Math.min(e.clientY, window.innerHeight - 140)}px`;

    // Aktifleştir
    const activateItem = this.menuItem(
      '<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>',
      i18n.t('preset_activate'),
      () => {
        menu.remove();
        profileStore.selectProfile(profileName);
        const profile = profileStore.getProfiles().find(p => p.name === profileName);
        if (profile) {
          modStore.loadWorkspaceFromProfile(profile);
        }
        const label = document.getElementById("active-profile-label");
        if (label) label.innerText = `PROFIL: ${profileName.toUpperCase()}`;
        Toast.show(`${profileName} aktif edildi`, "success");
      }
    );
    menu.appendChild(activateItem);

    // İsim Değiştir
    const renameItem = this.menuItem(
      '<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>',
      i18n.t('preset_rename'),
      () => {
        menu.remove();
        this.showRenamePopup(profileName);
      }
    );

    // Çoğalt
    const duplicateItem = this.menuItem(
      '<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>',
      i18n.t('preset_duplicate'),
      () => {
        // Çoğalt — kaynağın içeriğini birebir kopyala (eski davranış boş preset üretiyordu)
        const src = profileStore.getProfiles().find(p => p.name === profileName);
        profileStore.addProfile(
          `${profileName} - KOPYA`,
          src ? [...src.active_mods] : [],
          src?.groups ? src.groups.map(g => ({ ...g, modIds: [...g.modIds] })) : [],
          src?.description
        );
        menu.remove();
      }
    );

    // Sil
    const deleteItem = this.menuItem(
      '<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>',
      i18n.t('profile_delete_btn'),
      () => {
        menu.remove();
        this.showConfirmPopup(profileName);
      },
      true
    );

    menu.appendChild(renameItem);
    menu.appendChild(duplicateItem);

    // Kayıpları Temizle — yalnızca sağlıksız (has_kayip/bozuk) profillerde
    const profileData = profileStore.getProfiles().find(p => p.name === profileName);
    if (profileData && (profileData.health === 'has_kayip' || profileData.health === 'bozuk')) {
      const cleanItem = this.menuItem(
        '<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>',
        i18n.t('preset_clean_missing'),
        () => {
          menu.remove();
          profileStore.cleanMissing(profileName);
          const p = profileStore.getProfiles().find(x => x.name === profileName);
          if (p && profileStore.getSelectedName() === profileName) {
            modStore.loadWorkspaceFromProfile(p);
          }
          Toast.show(i18n.t('toast_clean_missing'), "success");
        }
      );
      menu.appendChild(cleanItem);
    }

    menu.appendChild(deleteItem);
    document.body.appendChild(menu);

    const closeMenu = (event: MouseEvent) => {
      if (!menu.contains(event.target as Node)) {
        menu.remove();
        document.removeEventListener("mousedown", closeMenu);
      }
    };
    setTimeout(() => document.addEventListener("mousedown", closeMenu), 10);
  }

  private menuItem(svg: string, label: string, onClick: () => void, danger = false): HTMLElement {
    const item = document.createElement("div");
    item.className = `context-menu-item${danger ? " danger" : ""}`;
    item.innerHTML = svg + `<span>${label}</span>`;
    item.addEventListener("click", onClick);
    return item;
  }

  private showRenamePopup(profileName: string) {
    const overlay = document.createElement("div");
    overlay.className = "industrial-popup-overlay";
    overlay.innerHTML = `
      <div class="industrial-popup">
        <h3>${i18n.t('popup_rename_title')}</h3>
        <input type="text" id="rename-input" value="${profileName}" autofocus />
        <div class="industrial-popup-actions">
          <button class="btn-cancel" id="rename-cancel">${i18n.t('popup_cancel')}</button>
          <button class="btn-confirm" id="rename-confirm">${i18n.t('popup_save')}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const input = overlay.querySelector("#rename-input") as HTMLInputElement;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);

    const close = () => overlay.remove();
    overlay.querySelector("#rename-cancel")?.addEventListener("click", close);
    overlay.querySelector("#rename-confirm")?.addEventListener("click", () => {
      const val = input.value.trim();
      if (val) {
        profileStore.renameProfile(profileName, val);
      }
      close();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") (overlay.querySelector("#rename-confirm") as HTMLButtonElement)?.click();
      if (e.key === "Escape") close();
    });
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  }

  private showConfirmPopup(profileName: string) {
    const overlay = document.createElement("div");
    overlay.className = "industrial-popup-overlay";
    overlay.innerHTML = `
      <div class="industrial-popup">
        <h3>${i18n.t('popup_delete_title')}</h3>
        <p style="color:#b0b5bd;font-size:11px;font-family:'Courier New',monospace;margin:0 0 14px 0;">${i18n.t('popup_delete_confirm').replace('{name}', profileName)}</p>
        <div class="industrial-popup-actions">
          <button class="btn-cancel" id="confirm-cancel">${i18n.t('popup_cancel')}</button>
          <button class="btn-confirm" id="confirm-yes" style="background:#8b2e2e;border-color:#a43b3b;color:#fff;">${i18n.t('popup_delete_yes')}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector("#confirm-cancel")?.addEventListener("click", close);
    overlay.querySelector("#confirm-yes")?.addEventListener("click", () => {
      profileStore.removeProfile(profileName);
      close();
    });
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  }

  /** Yeni preset modalı — site tarzı prompt() yerine endüstriyel modal */
  private showNewPresetModal() {
    const overlay = document.createElement("div");
    overlay.className = "industrial-popup-overlay";
    overlay.innerHTML = `
      <div class="industrial-popup preset-modal" role="dialog" aria-modal="true">
        <h3>${i18n.t('preset_modal_title')}</h3>
        <div class="preset-modal-body">
          <div class="preset-modal-field">
            <label for="preset-modal-name">${i18n.t('preset_modal_name')}</label>
            <input type="text" id="preset-modal-name" autofocus placeholder="örn: Kombo Modpack" />
          </div>
          <div class="preset-modal-field">
            <label>${i18n.t('preset_modal_source')}</label>
            <div class="preset-modal-options">
              <label class="preset-modal-radio">
                <input type="radio" name="preset-source" value="current" checked />
                <span>
                  <span class="preset-radio-title">${i18n.t('preset_modal_source_current')}</span>
                  <span class="preset-radio-sub">${i18n.t('preset_modal_source_current_sub')}</span>
                </span>
              </label>
              <label class="preset-modal-radio">
                <input type="radio" name="preset-source" value="default" />
                <span>
                  <span class="preset-radio-title">${i18n.t('preset_modal_source_default')}</span>
                  <span class="preset-radio-sub">${i18n.t('preset_modal_source_default_sub')}</span>
                </span>
              </label>
              <label class="preset-modal-radio">
                <input type="radio" name="preset-source" value="empty" />
                <span>
                  <span class="preset-radio-title">${i18n.t('preset_modal_source_empty')}</span>
                  <span class="preset-radio-sub">${i18n.t('preset_modal_source_empty_sub')}</span>
                </span>
              </label>
            </div>
          </div>
          <div class="preset-modal-field">
            <label for="preset-modal-desc">${i18n.t('preset_modal_desc')}</label>
            <input type="text" id="preset-modal-desc" placeholder="${i18n.t('preset_modal_desc_ph')}" />
          </div>
        </div>
        <div class="industrial-popup-actions">
          <button class="btn-cancel" id="preset-modal-cancel">${i18n.t('popup_cancel')}</button>
          <button class="btn-confirm" id="preset-modal-confirm">${i18n.t('popup_create')}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const nameInput = overlay.querySelector("#preset-modal-name") as HTMLInputElement;
    nameInput.focus();

    const close = () => overlay.remove();
    const getSource = (): string =>
      (overlay.querySelector('input[name="preset-source"]:checked') as HTMLInputElement)?.value || "current";

    overlay.querySelector("#preset-modal-cancel")?.addEventListener("click", close);
    overlay.querySelector("#preset-modal-confirm")?.addEventListener("click", () => {
      const name = nameInput.value.trim();
      if (!name) {
        Toast.show(i18n.t('preset_modal_name_req'), "error");
        nameInput.focus();
        return;
      }
      if (profileStore.getProfileNames().includes(name)) {
        Toast.show(i18n.t('preset_modal_name_exists'), "error");
        return;
      }

      const source = getSource();
      const desc = (overlay.querySelector("#preset-modal-desc") as HTMLInputElement).value.trim();

      let mods: string[];
      let groups: ModGroup[];
      if (source === "default") {
        const def = profileStore.getProfiles().find(p => p.isDefault);
        mods = def ? [...def.active_mods] : [];
        groups = def?.groups ? def.groups.map(g => ({ ...g, modIds: [...g.modIds] })) : [];
      } else if (source === "empty") {
        mods = [];
        groups = [];
      } else {
        // current (varsayılan)
        mods = modStore.getActiveProfileMods();
        groups = modStore.getGroupsForProfile();
      }

      profileStore.addProfile(name, mods, groups, desc);
      close();
      Toast.show(i18n.t('toast_preset_created').replace('{name}', name), "success");
    });
    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") (overlay.querySelector("#preset-modal-confirm") as HTMLButtonElement)?.click();
      if (e.key === "Escape") close();
    });
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  }

  /** Tutarlılık çakışmasında kullanıcıya seçenek sunar — true = disk, false = profil */
  private showConsistencyModal(profileName: string, diskMods: string[], profileMods: string[]): Promise<boolean> {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "industrial-popup-overlay";
      overlay.innerHTML = `
        <div class="industrial-popup" style="min-width:430px;">
          <h3>${i18n.t('consistency_title')}</h3>
          <p style="color:#b0b5bd;font-size:12px;font-family:'Inter',sans-serif;margin:0 0 14px 0;line-height:1.5;">${i18n.t('consistency_desc').replace('{name}', profileName)}</p>
          <div class="consistency-counts">
            <div class="consistency-row">
              <span class="consistency-label">${i18n.t('consistency_disk')}</span>
              <span class="consistency-value">${diskMods.length} ${i18n.t('consistency_mods')}</span>
            </div>
            <div class="consistency-row">
              <span class="consistency-label">${i18n.t('consistency_profile')}</span>
              <span class="consistency-value">${profileMods.length} ${i18n.t('consistency_mods')}</span>
            </div>
          </div>
          <div class="industrial-popup-actions">
            <button class="btn-cancel" id="cc-profile">${i18n.t('consistency_use_profile')}</button>
            <button class="btn-confirm" id="cc-disk">${i18n.t('consistency_use_disk')}</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);

      const done = (val: boolean) => { overlay.remove(); resolve(val); };
      overlay.querySelector("#cc-profile")?.addEventListener("click", () => done(false));
      overlay.querySelector("#cc-disk")?.addEventListener("click", () => done(true));
      overlay.addEventListener("click", (e) => { if (e.target === overlay) done(false); });
    });
  }

  private setupUndoRedo() {
    document.addEventListener('keydown', (e) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;
      
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        this.handleUndo();
      } else if (e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        this.handleRedo();
      } else if (e.key === 'y') {
        e.preventDefault();
        this.handleRedo();
      }
    });
  }

  /** Kalıcı redo yığınına push et (geçmiş limitiyle sınırlı) */
  private pushRedo(entry: HistoryEntry): void {
    const profile = profileStore.getActiveProfile();
    if (!profile) return;
    const limit = Math.max(1, profileStore.getHistoryLimit());
    const next = [...(profile.redo_history || []), entry].slice(-limit);
    profileStore.setRedoHistory(profile.name, next);
  }

  /** Kalıcı redo yığınından pop al */
  private popRedo(): HistoryEntry | undefined {
    const profile = profileStore.getActiveProfile();
    if (!profile || !profile.redo_history || profile.redo_history.length === 0) return undefined;
    const entry = profile.redo_history[profile.redo_history.length - 1];
    profileStore.setRedoHistory(profile.name, profile.redo_history.slice(0, -1));
    return entry;
  }

  private handleUndo() {
    const profile = profileStore.getActiveProfile();
    if (!profile || !profile.history || profile.history.length === 0) {
      Toast.show(i18n.t('toast_undo_empty'), "info");
      return;
    }
    
    // Son history entry'i pop et
    const lastEntry = profile.history.pop()!;
    
    // Mevcut state'i kalıcı redo yığınına push'la
    const currentEntry: HistoryEntry = {
      type: lastEntry.type,
      changed_ids: lastEntry.changed_ids,
      old_active_mods: [...(profile.active_mods || [])],
      new_active_mods: lastEntry.old_active_mods,
      timestamp: Date.now()
    };
    this.pushRedo(currentEntry);

    // Undo: eski hale dön
    const deadMods = lastEntry.old_active_mods.filter(id =>
      !modStore.getMods().some(m => m.package_id.toLowerCase() === id && !m.isDead)
    );
    
    profileStore.saveActiveToProfile(
      profile.name,
      lastEntry.old_active_mods,
      profile.groups,
      deadMods,
      deadMods.length > 0 ? "has_kayip" : "normal",
      profile.history // zaten pop ettik
    );
    modStore.loadWorkspaceFromProfile(profile);
    Toast.show(i18n.t('toast_undone'), "info");
  }

  private handleRedo() {
    const profile = profileStore.getActiveProfile();
    const redoEntry = this.popRedo();
    if (!profile || !redoEntry) {
      Toast.show(i18n.t('toast_redo_empty'), "info");
      return;
    }

    // Mevcut state'i history'ye geri push'la (undo'yu bozmamak için)
    const currentHistory = profile.history || [];
    const revertEntry: HistoryEntry = {
      type: redoEntry.type,
      changed_ids: redoEntry.changed_ids,
      old_active_mods: [...(profile.active_mods || [])],
      new_active_mods: redoEntry.new_active_mods,
      timestamp: Date.now()
    };
    const newHistory = [...currentHistory, revertEntry].slice(-100);

    // Redo: yeni hale geç
    const deadMods = redoEntry.new_active_mods.filter((id: string) =>
      !modStore.getMods().some(m => m.package_id.toLowerCase() === id && !m.isDead)
    );

    profileStore.saveActiveToProfile(
      profile.name,
      redoEntry.new_active_mods,
      profile.groups,
      deadMods,
      deadMods.length > 0 ? "has_kayip" : "normal",
      newHistory
    );
    modStore.loadWorkspaceFromProfile(profile);
    Toast.show(i18n.t('toast_redone'), "info");
  }

  /** Undo/Redo butonlarının aktif/disabled durumunu günceller */
  private updateUndoRedoButtons(): void {
    const profile = profileStore.getActiveProfile();
    const undoBtn = document.getElementById("btn-undo") as HTMLButtonElement | null;
    const redoBtn = document.getElementById("btn-redo") as HTMLButtonElement | null;
    if (undoBtn) undoBtn.disabled = !profile || !profile.history || profile.history.length === 0;
    if (redoBtn) redoBtn.disabled = !profile || !profile.redo_history || profile.redo_history.length === 0;
  }

  /** Aktif modları bağımlılık sırasına göre sıralar (oyunu başlatmaz) */
  private async handleSortMods(): Promise<void> {
    const activeIds = modStore.getActiveProfileMods();
    if (activeIds.length === 0) {
      Toast.show(i18n.t('toast_no_active_mods'), "info");
      return;
    }
    const metas = activeIds
      .map(id => modStore.findMod(id))
      .filter((m): m is ModMetadata => !!m);
    try {
      const sorted = await ModService.sortModsRimworld(metas);
      if (sorted.length > 0) {
        modStore.setActiveProfileMods(sorted);
        Toast.show(i18n.t('toast_sorted'), "success");
      }
    } catch (err: any) {
      Toast.show(i18n.t('toast_sorted_fail'), "warning");
    }
  }

  /** Aktif modları SteamCMD ile günceller */
  private async handleUpdateMods(): Promise<void> {
    const activeIds = modStore.getActiveProfileMods();
    if (activeIds.length === 0) {
      Toast.show(i18n.t('toast_no_active_mods'), "info");
      return;
    }
    try {
      await ModService.updateMods(activeIds);
      Toast.show(i18n.t('toast_batch_updated').replace('{n}', String(activeIds.length)), "success");
    } catch (err: any) {
      Toast.show(err.toString(), "error");
    }
  }

  /** Aktif mod sıralamasının bağımlılık geçerliliğini kontrol eder */
  private async handleValidateSorting(): Promise<void> {
    const activeIds = modStore.getActiveProfileMods();
    const metas = activeIds
      .map(id => modStore.findMod(id))
      .filter((m): m is ModMetadata => !!m);
    if (metas.length === 0) {
      Toast.show(i18n.t('toast_no_active_mods'), "info");
      return;
    }
    try {
      const valid = await ModService.validateSorting(metas);
      Toast.show(valid ? i18n.t('toast_validated') : i18n.t('toast_validated_fail'), valid ? "success" : "warning");
    } catch (err: any) {
      Toast.show(err.toString(), "error");
    }
  }

  private setupDefaultRefreshButton() {
    const profileLabel = document.getElementById("active-profile-label");
    if (!profileLabel) return;
    
    // Profil label'ına tıklanabilir yenileme işlevi ekle (sadece Default'ta)
    profileLabel.style.cursor = 'pointer';
    profileLabel.title = 'Default profili diske gore yenile';
    profileLabel.addEventListener('dblclick', async () => {
      const settings = settingsStore.getSettings();
      if (!settings.rimworld_config_path) return;
      
      const activeProfile = profileStore.getActiveProfile();
      if (!activeProfile?.isDefault) {
        Toast.show("Sadece Default profili yenilenebilir", "info");
        return;
      }
      
      try {
        const config = await ModService.readModsConfig(settings.rimworld_config_path);
        const diskMods = config.active_mods.map(m => m.toLowerCase());
        activeProfile.active_mods = diskMods;
        modStore.loadWorkspaceFromProfile(activeProfile);
        profileStore.saveActiveToProfile(activeProfile.name, diskMods);
        Toast.show("Default profil diske gore guncellendi", "success");
      } catch (err) {
        Toast.show("ModsConfig.xml okunamadi: " + err, "error");
      }
    });
  }

  private async setupUIListeners() {
    const btnSaveConfig = document.getElementById("btn-save-config");
    const btnOpenSteamcmd = document.getElementById("btn-open-steamcmd");
    const btnOpenSettings = document.getElementById("btn-open-settings");
    const btnLaunchGame = document.getElementById("btn-launch-game");
    const btnAddPreset = document.getElementById("btn-add-preset");

    const btnWindowMin = document.getElementById("btn-window-min");
    const btnWindowMax = document.getElementById("btn-window-max");
    const btnWindowClose = document.getElementById("btn-window-close");
    const appWindow = getCurrentWindow();

    // Undo/Redo setup
    this.setupUndoRedo();
    
    // Default yenileme butonu
    this.setupDefaultRefreshButton();

    // Komut merkezi araç butonları (undo/redo/sort/update/validate)
    document.getElementById("btn-undo")?.addEventListener("click", () => this.handleUndo());
    document.getElementById("btn-redo")?.addEventListener("click", () => this.handleRedo());
    document.getElementById("btn-sort")?.addEventListener("click", () => this.handleSortMods());
    document.getElementById("btn-update")?.addEventListener("click", () => this.handleUpdateMods());
    document.getElementById("btn-validate")?.addEventListener("click", () => this.handleValidateSorting());
    this.updateUndoRedoButtons();

    // UYGULA butonu — workspace'i ModsConfig.xml'e yaz + Default'a işle (geçmiş adımı ekler)
    if (btnSaveConfig) {
      btnSaveConfig.addEventListener("click", () => {
        this.handleApplyToGame();
      });
    }

    // Preset aksiyon butonları — sadece Default dışındaki aktif profilde görünür
    const btnSavePreset = document.getElementById("btn-save-preset");
    const btnSaveApplyPreset = document.getElementById("btn-save-apply-preset");
    if (btnSavePreset) {
      btnSavePreset.addEventListener("click", () => this.handleSavePreset());
    }
    if (btnSaveApplyPreset) {
      btnSaveApplyPreset.addEventListener("click", () => this.handleSaveAndApplyPreset());
    }

    if (btnOpenSteamcmd) {
      btnOpenSteamcmd.addEventListener("click", () => {
        console.log("[SteamCMD] butona tiklandi");
        windowManager.open("steamcmd");
      });
    }

    if (btnOpenSettings) {
      btnOpenSettings.addEventListener("click", () => {
        console.log("[Ayarlar] butona tiklandi");
        windowManager.open("settings");
      });
    }

    // BAŞLAT butonu yeni mantık
    if (btnLaunchGame) {
      btnLaunchGame.addEventListener("click", async () => {
        console.log("Oyun baslatiliyor...");
        // 1. Workspace'i sırala + ModsConfig.xml'e yaz + Default'a işle
        const saved = await this.handleApplyToGame();
        if (!saved) return;
        
        // 2. Oyunu başlat
        const settings = settingsStore.getSettings();
        if (settings.rimworld_exe_path) {
          try {
            await ModService.launchGame(settings.rimworld_exe_path);
          } catch (err) {
            console.error("Oyun baslatilamadi:", err);
            Toast.show("Oyun baslatilamadi: " + err, "error");
          }
        } else {
          Toast.show("RimWorld exe yolu ayarlanmamis.", "error");
        }
      });
    }

    if (btnAddPreset) {
      btnAddPreset.addEventListener("click", () => this.showNewPresetModal());
    }

    if (btnWindowMin) {
      btnWindowMin.addEventListener("click", () => appWindow.minimize());
    }
    if (btnWindowMax) {
      btnWindowMax.addEventListener("click", () => appWindow.toggleMaximize());
    }
    if (btnWindowClose) {
      btnWindowClose.addEventListener("click", () => appWindow.close());
    }
  }

  private setupSplitters() {
    const uiWorkspace = document.getElementById("ui-workspace");
    const uiMainContainer = document.getElementById("ui-main-container");
    const leftRightSplitter = document.getElementById("left-right-splitter");
    const mainInspectorSplitter = document.getElementById("main-inspector-splitter");
    const libraryPane = document.getElementById("ui-library-pane");
    const activePane = document.getElementById("ui-active-pane");
    const inspectorPane = document.getElementById("ui-inspector");

    let isDragging = false;
    let activeSplitter: HTMLElement | null = null;
    let splitterRaf: number | null = null;

    const startDragging = (_e: MouseEvent, splitter: HTMLElement) => {
      isDragging = true;
      activeSplitter = splitter;
      document.body.style.cursor = splitter.id === "left-right-splitter" ? "ew-resize" : "ew-resize";
      document.body.classList.add("select-none");
    };

    const drag = (e: MouseEvent) => {
      if (!isDragging || !activeSplitter) return;
      if (splitterRaf !== null) return;
      splitterRaf = requestAnimationFrame(() => {
        splitterRaf = null;
        if (activeSplitter!.id === "left-right-splitter" && uiWorkspace && libraryPane && activePane) {
          const totalWidth = uiWorkspace.offsetWidth;
          const newLibraryWidth = e.clientX - uiWorkspace.getBoundingClientRect().left;
          const minWidth = 200;
          if (newLibraryWidth > minWidth && (totalWidth - newLibraryWidth - activeSplitter!.offsetWidth) > minWidth) {
            libraryPane.style.flexBasis = `${newLibraryWidth}px`;
            activePane.style.flexBasis = `${totalWidth - newLibraryWidth - activeSplitter!.offsetWidth}px`;
          }
        } else if (activeSplitter!.id === "main-inspector-splitter" && uiMainContainer && inspectorPane) {
          const appShell = document.getElementById("app-shell");
          if (!appShell) return;
          const totalWidth = appShell.offsetWidth;
          const newMainWidth = e.clientX - uiMainContainer.getBoundingClientRect().left;
          const minWidth = 200;
          const maxInspectorWidth = 380;
          const newInspectorWidth = totalWidth - newMainWidth - activeSplitter!.offsetWidth;
          if (newMainWidth > minWidth && newInspectorWidth > minWidth && newInspectorWidth <= maxInspectorWidth) {
            uiMainContainer.style.flexBasis = `${newMainWidth}px`;
            inspectorPane.style.flexBasis = `${newInspectorWidth}px`;
          }
        }
      });
    };

    const stopDragging = () => {
      isDragging = false;
      activeSplitter = null;
      if (splitterRaf !== null) { cancelAnimationFrame(splitterRaf); splitterRaf = null; }
      document.body.style.cursor = "default";
      document.body.classList.remove("select-none");
    };

    leftRightSplitter?.addEventListener("mousedown", (e) => startDragging(e, leftRightSplitter));
    mainInspectorSplitter?.addEventListener("mousedown", (e) => startDragging(e, mainInspectorSplitter));

    document.addEventListener("mousemove", drag);
    document.addEventListener("mouseup", stopDragging);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  new App();
});

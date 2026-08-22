import "../../styles.css";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { listen } from "@tauri-apps/api/event";
import { modStore, MODS_CACHE_KEY } from "../../store";
import { ModService } from "../../services/modService";

interface ModInfo {
  name: string;
  package_id: string;
  downloaded: boolean;
  description?: string;
  author?: string;
  version?: string;
}

class SteamCmdApp {
  private mods: ModInfo[] = [];
  private searchQuery = "";
  private sortBy = "name";
  private filterBy = "all";

  constructor() {
    this.setupTitleBar();
    this.setupEventListeners();
    this.loadMods();
    this.setupProgressListener();
  }

  private setupTitleBar() {
    const appWindow = getCurrentWebviewWindow();
    document.getElementById("btn-window-min")?.addEventListener("click", () => appWindow.minimize());
    document.getElementById("btn-window-max")?.addEventListener("click", () => appWindow.toggleMaximize());
    document.getElementById("btn-window-close")?.addEventListener("click", () => appWindow.close());
  }

  private setupEventListeners() {
    const searchInput = document.getElementById("mod-search-input") as HTMLInputElement;
    searchInput?.addEventListener("input", (e) => {
      this.searchQuery = (e.target as HTMLInputElement).value.toLowerCase();
      this.render();
    });

    const sortSelect = document.getElementById("sort-select") as HTMLSelectElement;
    sortSelect?.addEventListener("change", (e) => {
      this.sortBy = (e.target as HTMLSelectElement).value;
      this.render();
    });

    const filterSelect = document.getElementById("filter-select") as HTMLSelectElement;
    filterSelect?.addEventListener("change", (e) => {
      this.filterBy = (e.target as HTMLSelectElement).value;
      this.render();
    });
  }

  private async loadMods() {
    try {
      let storeMods = modStore.getMods();
      // Ana pencere ile aynı origin paylaşıldığı için, ana pencerede yüklenen
      // mod listesi localStorage önbelleğinden (modStore) okunabilir.
      if (storeMods.length === 0) {
        try {
          const cached = localStorage.getItem(MODS_CACHE_KEY);
          if (cached) storeMods = JSON.parse(cached);
        } catch (e) {
          console.warn("Mod önbelleği okunamadı:", e);
        }
      }

      this.mods = storeMods.map((m: any) => ({
        name: m.name || m.package_id,
        package_id: m.package_id,
        downloaded: !!m.downloaded,
        description: m.description || "",
        author: m.author || "",
        version: m.version || "",
      }));
    } catch (e) {
      console.error("Modlar yüklenirken hata:", e);
    }
    this.render();
  }

  /**
   * Rust tarafından yayınlanan steamcmd-progress event'ini dinler ve
   * indirme ilerlemesini liste üzerinde gösterir.
   */
  private setupProgressListener() {
    listen<{ progress: number; speed: string; message: string }>("steamcmd-progress", (event) => {
      this.renderProgress(event.payload);
    }).catch((err) => console.warn("steamcmd-progress dinlenemiyor:", err));
  }

  private renderProgress(payload: { progress: number; speed: string; message: string }) {
    let bar = document.getElementById("steamcmd-progress");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "steamcmd-progress";
      bar.className = "mb-3 shrink-0 bg-slate-900 border border-slate-800 rounded p-3";
      bar.innerHTML = `
        <div class="flex justify-between text-[10px] font-mono mb-1">
          <span class="text-slate-400">İNDİRİLİYOR...</span>
          <span class="text-slate-500" id="steamcmd-progress-info">%0</span>
        </div>
        <div class="h-2 bg-slate-800 rounded-full overflow-hidden">
          <div id="steamcmd-progress-bar" class="h-full bg-amber-600 transition-all duration-200" style="width: 0%"></div>
        </div>
      `;
      const listContainer = document.getElementById("mod-list-container");
      listContainer?.parentElement?.insertBefore(bar, listContainer);
    }

    const fill = document.getElementById("steamcmd-progress-bar") as HTMLElement;
    const info = document.getElementById("steamcmd-progress-info");
    if (fill) fill.style.width = `${Math.min(100, payload.progress)}%`;
    if (info) info.textContent = `%${Math.round(payload.progress)} (${payload.speed})`;
  }

  private getFilteredAndSorted(): ModInfo[] {
    let result = [...this.mods];

    // Filtrele
    if (this.searchQuery) {
      result = result.filter(
        (m) =>
          m.name.toLowerCase().includes(this.searchQuery) ||
          m.package_id.toLowerCase().includes(this.searchQuery)
      );
    }

    if (this.filterBy === "downloaded") {
      result = result.filter((m) => m.downloaded);
    } else if (this.filterBy === "pending") {
      result = result.filter((m) => !m.downloaded);
    }

    // Sırala
    switch (this.sortBy) {
      case "name":
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "name-desc":
        result.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case "id":
        result.sort((a, b) => a.package_id.localeCompare(b.package_id));
        break;
      case "id-desc":
        result.sort((a, b) => b.package_id.localeCompare(a.package_id));
        break;
    }

    return result;
  }

  private render() {
    const container = document.getElementById("mod-list-content");
    if (!container) return;

    const filtered = this.getFilteredAndSorted();

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="flex items-center justify-center h-full">
          <div class="text-center text-slate-600">
            <p class="text-xs font-mono">MOD BULUNAMADI</p>
            <p class="text-[10px] mt-2 text-slate-700">Arama kriterlerine uygun mod yok.</p>
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <table class="w-full text-left text-xs font-mono">
        <thead class="bg-slate-800/50 text-slate-500 uppercase text-[10px] tracking-wider sticky top-0">
          <tr>
            <th class="px-4 py-3 w-8"></th>
            <th class="px-4 py-3">MOD ADI</th>
            <th class="px-4 py-3 text-slate-600">PACKAGE ID</th>
            <th class="px-4 py-3 text-right w-24">DURUM</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-800/50">
          ${filtered
            .map(
              (mod) => `
            <tr class="hover:bg-slate-800/30 transition-colors cursor-pointer mod-row" data-id="${mod.package_id}">
              <td class="px-4 py-3">
                <div class="w-1.5 h-1.5 rounded-full ${mod.downloaded ? "bg-emerald-500" : "bg-slate-600"}"></div>
              </td>
              <td class="px-4 py-3 text-slate-200 font-medium">${mod.name}</td>
              <td class="px-4 py-3 text-slate-600">${mod.package_id}</td>
              <td class="px-4 py-3 text-right">
                <span class="text-[10px] ${mod.downloaded ? "text-emerald-500" : "text-slate-600"}">${mod.downloaded ? "İNDİRİLDİ" : "BEKLEMEDE"}</span>
              </td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    `;

    // Her satıra tıklanınca detay göster
    container.querySelectorAll(".mod-row").forEach((row) => {
      row.addEventListener("click", (e) => {
        const id = (e.currentTarget as HTMLElement).dataset.id;
        if (id) this.showModDetail(id);
      });
    });
  }

  private showModDetail(packageId: string) {
    const mod = this.mods.find((m) => m.package_id === packageId);
    if (!mod) return;

    // Mevcut seçimi temizle
    document.querySelectorAll(".mod-row.selected").forEach((r) => r.classList.remove("selected", "bg-slate-700/30"));

    // Seçili satırı işaretle
    const row = document.querySelector(`.mod-row[data-id="${packageId}"]`);
    row?.classList.add("selected", "bg-slate-700/30");

    // Detay paneli
    let detailEl = document.getElementById("mod-detail-panel");
    if (!detailEl) {
      detailEl = document.createElement("div");
      detailEl.id = "mod-detail-panel";
      detailEl.className = "border-t border-slate-800 bg-slate-900 p-4 shrink-0";
      const container = document.getElementById("mod-list-container");
      container?.appendChild(detailEl);
    }

    detailEl.innerHTML = `
      <div class="flex justify-between items-start">
        <div>
          <h3 class="text-sm font-mono font-bold text-slate-200">${mod.name}</h3>
          <p class="text-[10px] font-mono text-slate-500 mt-1">${mod.package_id}</p>
        </div>
        <button id="btn-detail-close" class="text-slate-600 hover:text-slate-400 transition-colors">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="mt-4 grid grid-cols-3 gap-4 text-[10px] font-mono">
        <div>
          <span class="text-slate-600">Yazar</span>
          <p class="text-slate-400">${mod.author || "Bilinmiyor"}</p>
        </div>
        <div>
          <span class="text-slate-600">Versiyon</span>
          <p class="text-slate-400">${mod.version || "Bilinmiyor"}</p>
        </div>
        <div>
          <span class="text-slate-600">Durum</span>
          <p class="${mod.downloaded ? "text-emerald-500" : "text-slate-500"}">${mod.downloaded ? "İndirilmiş" : "Beklemede"}</p>
        </div>
      </div>
      ${mod.description ? `<p class="mt-4 text-[10px] font-mono text-slate-500 leading-relaxed">${mod.description}</p>` : ""}
      <div class="mt-4 flex space-x-2">
        ${!mod.downloaded ? `<button class="download-btn px-4 py-2 bg-slate-700 hover:bg-slate-600 text-[10px] font-mono rounded transition-colors text-slate-200" data-id="${mod.package_id}">İNDİR</button>` : ""}
      </div>
    `;

    document.getElementById("btn-detail-close")?.addEventListener("click", () => {
      detailEl?.remove();
    });

    detailEl.querySelector(".download-btn")?.addEventListener("click", async (e) => {
      const id = (e.currentTarget as HTMLElement).dataset.id;
      if (id) {
        try {
          await ModService.downloadMod(id);
          // Durumu güncelle
          const found = this.mods.find((m) => m.package_id === id);
          if (found) found.downloaded = true;
          this.render();
          detailEl?.remove();
        } catch (err: any) {
          console.error("İndirme hatası:", err);
        }
      }
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new SteamCmdApp();
});

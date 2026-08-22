import "../../styles.css";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { listen } from "@tauri-apps/api/event";
import { modStore, MODS_CACHE_KEY } from "../../store";
import { ModService, WorkshopItem, WorkshopDetails } from "../../services/modService";
import { i18n } from "../../services/i18nService";

interface InstalledMod {
  id: string;
  name: string;
  author: string;
  version: string;
}

class SteamCmdApp {
  private installed: InstalledMod[] = [];
  private results: WorkshopItem[] = [];
  private queue = new Map<string, WorkshopItem>();
  private downloading = false;
  private searching = false;

  constructor() {
    this.setupTitleBar();
    this.setupTabs();
    this.setupListeners();
    this.loadInstalled();
    this.setupProgressListener();
    i18n.applyI18n();
    document.addEventListener("lang-changed", () => {
      i18n.applyI18n();
      this.renderAll();
    });
  }

  private setupTitleBar() {
    const appWindow = getCurrentWebviewWindow();
    document.getElementById("btn-window-min")?.addEventListener("click", () => appWindow.minimize());
    document.getElementById("btn-window-max")?.addEventListener("click", () => appWindow.toggleMaximize());
    document.getElementById("btn-window-close")?.addEventListener("click", () => appWindow.close());
  }

  private setupTabs() {
    document.querySelectorAll<HTMLElement>(".scmd-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.dataset.tab;
        if (tab) this.switchTab(tab);
      });
    });
  }

  private switchTab(tab: string) {
    document.querySelectorAll(".scmd-tab").forEach((b) => b.classList.toggle("active", (b as HTMLElement).dataset.tab === tab));
    document.querySelectorAll<HTMLElement>(".scmd-panel").forEach((p) => {
      p.classList.toggle("hidden", p.id !== `tab-${tab}`);
    });
    if (tab === "installed") this.renderInstalled();
    if (tab === "updates") this.renderUpdates();
    if (tab === "queue") this.renderQueue();
  }

  private setupListeners() {
    const searchInput = document.getElementById("ws-search") as HTMLInputElement | null;
    const searchBtn = document.getElementById("ws-search-btn");
    searchBtn?.addEventListener("click", () => this.search(searchInput?.value || ""));
    searchInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.search(searchInput.value);
    });

    document.getElementById("btn-download-queue")?.addEventListener("click", () => this.downloadQueue());
    document.getElementById("btn-clear-queue")?.addEventListener("click", () => {
      this.queue.clear();
      this.renderQueue();
    });
    document.getElementById("btn-update-all")?.addEventListener("click", () => this.updateAll());
  }

  private async search(query: string) {
    const q = query.trim();
    if (!q || this.searching) return;
    this.searching = true;
    const resultsEl = document.getElementById("ws-results");
    if (resultsEl) resultsEl.innerHTML = `<div class="scmd-empty">${i18n.t("scmd_loading")}</div>`;
    try {
      this.results = await ModService.searchWorkshop(q);
      this.renderResults();
    } catch (err) {
      if (resultsEl) resultsEl.innerHTML = `<div class="scmd-empty text-red-400">${i18n.t("scmd_error_scrape")}</div>`;
      console.error("Workshop arama hatası:", err);
    } finally {
      this.searching = false;
    }
  }

  private renderResults() {
    const el = document.getElementById("ws-results");
    if (!el) return;
    if (this.results.length === 0) {
      el.innerHTML = `<div class="scmd-empty">${i18n.t("scmd_empty_results")}</div>`;
      return;
    }
    el.innerHTML = this.results
      .map((item) => {
        const inQueue = this.queue.has(item.id);
        const img = item.preview_url
          ? `<img src="${item.preview_url}" loading="lazy" onerror="this.parentElement.classList.add('no-img');this.remove();" />`
          : `<div class="ws-noimg">NO IMG</div>`;
        return `
        <div class="ws-card" data-id="${item.id}">
          <div class="ws-card-img">${img}</div>
          <div class="ws-card-body">
            <div class="ws-card-title" title="${this.escapeAttr(item.title)}">${this.escapeHtml(item.title) || item.id}</div>
            <div class="ws-card-author">${this.escapeHtml(item.author)}</div>
            <div class="ws-card-actions">
              <button class="ws-btn ws-btn-detail" data-detail="${item.id}">${i18n.t("scmd_detail")}</button>
              <button class="ws-btn ws-btn-add ${inQueue ? "added" : ""}" data-add="${item.id}">${inQueue ? i18n.t("scmd_queued") : i18n.t("scmd_add_queue")}</button>
            </div>
          </div>
        </div>`;
      })
      .join("");
    el.querySelectorAll<HTMLElement>("[data-add]").forEach((b) =>
      b.addEventListener("click", () => this.addToQueue(b.dataset.add || ""))
    );
    el.querySelectorAll<HTMLElement>("[data-detail]").forEach((b) =>
      b.addEventListener("click", () => this.showDetail(b.dataset.detail || ""))
    );
  }

  private addToQueue(id: string) {
    const item = this.results.find((r) => r.id === id);
    if (!item) return;
    this.queue.set(id, item);
    this.renderResults();
    this.updateBadge();
  }

  private updateBadge() {
    const badge = document.getElementById("queue-badge");
    if (badge) badge.textContent = String(this.queue.size);
  }

  private async showDetail(id: string) {
    const detailEl = document.getElementById("ws-detail");
    if (!detailEl) return;
    detailEl.classList.remove("hidden");
    detailEl.innerHTML = `<div class="scmd-empty">${i18n.t("scmd_detail_loading")}</div>`;
    try {
      const d: WorkshopDetails = await ModService.getWorkshopDetails(id);
      const images = [d.preview_url, ...d.screenshots].filter(Boolean);
      const gallery = images.length
        ? `<div class="ws-gallery">${images
            .map((src, i) => `<img src="${src}" class="${i === 0 ? "active" : ""}" data-shot="${i}" loading="lazy" onerror="this.remove();" />`)
            .join("")}</div>`
        : "";
      const desc = d.description.replace(/<script[\s\S]*?<\/script>/gi, "");
      detailEl.innerHTML = `
        <div class="p-3 space-y-3">
          ${gallery}
          <h3 class="text-sm font-mono font-bold text-slate-200 leading-snug">${this.escapeHtml(d.title) || d.id}</h3>
          <div class="text-[10px] font-mono text-slate-500">${this.escapeHtml(d.author)}</div>
          <div class="grid grid-cols-3 gap-2 text-center">
            <div class="ws-stat"><b>${d.score.toFixed(1)}</b><span>${i18n.t("scmd_rating")}</span></div>
            <div class="ws-stat"><b>${this.fmt(d.subscriptions)}</b><span>${i18n.t("scmd_subscriptions")}</span></div>
            <div class="ws-stat"><b>${this.fmtSize(d.file_size)}</b><span>${i18n.t("scmd_size")}</span></div>
          </div>
          <div class="ws-desc">${desc || i18n.t("scmd_no_desc")}</div>
          <div class="flex gap-2 pt-1">
            <button id="detail-queue" class="ws-btn ws-btn-add flex-1">${i18n.t("scmd_add_queue")}</button>
            <button id="detail-install" class="ws-btn ws-btn-primary flex-1">${i18n.t("scmd_install_now")}</button>
          </div>
        </div>`;
      detailEl.querySelector("#detail-queue")?.addEventListener("click", () => {
        this.queue.set(id, { id, title: d.title, author: d.author, preview_url: d.preview_url });
        this.updateBadge();
      });
      detailEl.querySelector("#detail-install")?.addEventListener("click", async () => {
        try { await ModService.downloadMod(id); this.onDownloaded(); } catch (err) { this.toast(String(err)); }
      });
      detailEl.querySelectorAll("[data-shot]").forEach((img) =>
        img.addEventListener("click", () => {
          detailEl.querySelectorAll(".ws-gallery img").forEach((x) => x.classList.remove("active"));
          (img as HTMLElement).classList.add("active");
        })
      );
    } catch (err) {
      detailEl.innerHTML = `<div class="scmd-empty text-red-400">${i18n.t("scmd_error_scrape")}</div>`;
      console.error("Detay hatası:", err);
    }
  }

  private renderQueue() {
    const el = document.getElementById("queue-list");
    if (!el) return;
    if (this.queue.size === 0) {
      el.innerHTML = `<div class="scmd-empty">${i18n.t("scmd_empty_queue")}</div>`;
      return;
    }
    el.innerHTML = [...this.queue.values()]
      .map(
        (item, i) => `
        <div class="ws-queue-row">
          <span class="ws-queue-idx">${i + 1}</span>
          <img src="${item.preview_url}" onerror="this.remove();" />
          <div class="flex-1 min-w-0">
            <div class="ws-card-title truncate">${this.escapeHtml(item.title) || item.id}</div>
            <div class="ws-card-author">${item.id}</div>
          </div>
          <button class="ws-btn ws-btn-danger" data-rm="${item.id}">✕</button>
        </div>`
      )
      .join("");
    el.querySelectorAll<HTMLElement>("[data-rm]").forEach((b) =>
      b.addEventListener("click", () => {
        this.queue.delete(b.dataset.rm || "");
        this.renderQueue();
        this.updateBadge();
      })
    );
  }

  private async downloadQueue() {
    if (this.downloading) return;
    const ids = [...this.queue.keys()];
    if (ids.length === 0) { this.toast(i18n.t("scmd_empty_queue")); return; }
    this.downloading = true;
    const btn = document.getElementById("btn-download-queue") as HTMLButtonElement | null;
    if (btn) btn.disabled = true;
    for (const id of ids) {
      this.showProgressBar(true, `İndiriliyor: ${id}`);
      try {
        await ModService.downloadMod(id);
        this.queue.delete(id);
        this.onDownloaded();
      } catch (err) {
        this.toast(`${id}: ${err}`);
      }
      this.renderQueue();
      this.updateBadge();
    }
    this.showProgressBar(false, "");
    this.downloading = false;
    if (btn) btn.disabled = false;
  }

  private async updateAll() {
    if (this.downloading) return;
    const ids = this.installed.map((m) => m.id);
    if (ids.length === 0) { this.toast(i18n.t("scmd_no_installed")); return; }
    this.downloading = true;
    this.showProgressBar(true, i18n.t("scmd_updating"));
    try {
      await ModService.updateMods(ids);
      this.toast(i18n.t("scmd_update_done"));
    } catch (err) {
      this.toast(String(err));
    }
    this.showProgressBar(false, "");
    this.downloading = false;
  }

  private onDownloaded() {
    this.toast(i18n.t("scmd_download_done"));
  }

  private loadInstalled() {
    try {
      let storeMods = modStore.getMods();
      if (storeMods.length === 0) {
        const cached = localStorage.getItem(MODS_CACHE_KEY);
        if (cached) storeMods = JSON.parse(cached);
      }
      this.installed = (storeMods as any[])
        .map((m) => ({ id: m.package_id, name: m.name || m.package_id, author: m.author || "", version: m.version || "" }))
        .filter((m) => !!m.id);
    } catch (e) {
      console.error("Modlar yüklenirken hata:", e);
    }
  }

  private renderInstalled() {
    const el = document.getElementById("installed-list");
    if (!el) return;
    if (this.installed.length === 0) {
      el.innerHTML = `<div class="scmd-empty">${i18n.t("scmd_no_installed")}</div>`;
      return;
    }
    el.innerHTML = this.installed
      .map(
        (m) => `
        <div class="ws-queue-row">
          <div class="flex-1 min-w-0">
            <div class="ws-card-title truncate">${this.escapeHtml(m.name)}</div>
            <div class="ws-card-author">${m.id}${m.version ? " · v" + this.escapeHtml(m.version) : ""}</div>
          </div>
          <span class="scmd-status ok">${i18n.t("scmd_downloaded")}</span>
        </div>`
      )
      .join("");
  }

  private renderUpdates() {
    const el = document.getElementById("updates-list");
    if (!el) return;
    if (this.installed.length === 0) {
      el.innerHTML = `<div class="scmd-empty">${i18n.t("scmd_no_installed")}</div>`;
      return;
    }
    el.innerHTML = this.installed
      .map(
        (m) => `
        <div class="ws-queue-row">
          <div class="flex-1 min-w-0">
            <div class="ws-card-title truncate">${this.escapeHtml(m.name)}</div>
            <div class="ws-card-author">${m.id}</div>
          </div>
          <button class="ws-btn ws-btn-primary" data-upd="${m.id}">${i18n.t("scmd_update")}</button>
        </div>`
      )
      .join("");
    el.querySelectorAll<HTMLElement>("[data-upd]").forEach((b) =>
      b.addEventListener("click", async () => {
        const id = b.dataset.upd || "";
        this.showProgressBar(true, `Güncelleniyor: ${id}`);
        try {
          await ModService.downloadMod(id);
          this.toast(i18n.t("scmd_update_done"));
        } catch (err) {
          this.toast(String(err));
        }
        this.showProgressBar(false, "");
      })
    );
  }

  private renderAll() {
    this.renderResults();
    this.renderQueue();
    this.renderInstalled();
    this.renderUpdates();
  }

  private setupProgressListener() {
    listen<{ progress: number; speed: string; message: string }>("steamcmd-progress", (event) => {
      this.renderProgress(event.payload);
    }).catch(() => {});
  }

  private renderProgress(payload: { progress: number; speed: string; message: string }) {
    const bar = document.getElementById("steamcmd-progress");
    if (!bar) return;
    const fill = bar.querySelector("#steamcmd-progress-bar") as HTMLElement | null;
    const info = bar.querySelector("#steamcmd-progress-info");
    if (fill) fill.style.width = `${Math.min(100, payload.progress)}%`;
    if (info) info.textContent = `%${Math.round(payload.progress)} (${payload.speed})`;
  }

  private showProgressBar(show: boolean, label: string) {
    const bar = document.getElementById("steamcmd-progress");
    if (!bar) return;
    bar.classList.toggle("hidden", !show);
    if (show) {
      bar.innerHTML = `
        <div class="flex justify-between text-[10px] font-mono mb-1">
          <span class="text-slate-400">${this.escapeHtml(label)}</span>
          <span class="text-slate-500" id="steamcmd-progress-info">%0</span>
        </div>
        <div class="h-2 bg-slate-800 rounded-full overflow-hidden">
          <div id="steamcmd-progress-bar" class="h-full bg-amber-600 transition-all duration-200" style="width: 0%"></div>
        </div>`;
    }
  }

  private toast(msg: string) {
    console.log("[SteamCMD]", msg);
  }

  private fmt(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
    return String(n);
  }

  private fmtSize(bytes: number): string {
    if (!bytes) return "-";
    const mb = bytes / 1024 / 1024;
    if (mb >= 1024) return (mb / 1024).toFixed(2) + " GB";
    return mb.toFixed(1) + " MB";
  }

  private escapeHtml(s: string): string {
    return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  private escapeAttr(s: string): string {
    return this.escapeHtml(s).replace(/"/g, "&quot;");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new SteamCmdApp();
});

import "../../styles.css";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { MODS_CACHE_KEY } from "../../store";
import { settingsStore } from "../../store/settingsStore";
import { ModService, WorkshopItem, WorkshopDetails } from "../../services/modService";
import { i18n } from "../../services/i18nService";

interface InstalledMod {
  id: string;
  name: string;
  author: string;
  version: string;
}

type QueueStatus = "queued" | "connecting" | "downloading" | "done" | "error";

interface QueueItem extends WorkshopItem {
  status: QueueStatus;
  progress: number;
}

class SteamCmdApp {
  private installed: InstalledMod[] = [];
  private results: WorkshopItem[] = [];
  private queue = new Map<string, QueueItem>();
  private currentDownloadId: string | null = null;
  private downloading = false;
  private searching = false;
  private installedLoading = false;
  private workshopIds = new Map<string, string>();
  private page = 1;
  private lastQuery = "";

  constructor() {
    this.setupTitleBar();
    this.setupTabs();
    this.setupListeners();
    this.loadWorkshopIds();
    void this.loadInstalled();
    this.setupProgressListener();
    i18n.applyI18n();
    document.addEventListener("lang-changed", () => {
      i18n.applyI18n();
      this.renderAll();
    });
    // Diğer pencerelerde dil değişince bu pencereyi de güncelle (same-origin localStorage)
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
    if (tab === "installed" || tab === "updates") {
      void this.loadInstalled().then(() => {
        if (tab === "installed") this.renderInstalled();
        else this.renderUpdates();
      });
    }
    if (tab === "queue") this.renderQueue();
  }

  private setupListeners() {
    const searchInput = document.getElementById("ws-search") as HTMLInputElement | null;
    const searchBtn = document.getElementById("ws-search-btn");
    searchBtn?.addEventListener("click", () => this.search(searchInput?.value || ""));
    searchInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.search(searchInput.value);
    });
    document.getElementById("ws-prev")?.addEventListener("click", () => void this.prevPage());
    document.getElementById("ws-next")?.addEventListener("click", () => void this.nextPage());

    document.getElementById("btn-download-queue")?.addEventListener("click", () => this.downloadQueue());
    document.getElementById("btn-clear-queue")?.addEventListener("click", () => {
      this.queue.clear();
      this.renderQueue();
    });
    document.getElementById("btn-update-all")?.addEventListener("click", () => this.updateAll());
    document.getElementById("btn-resolve-ids")?.addEventListener("click", () => void this.resolveAllIds());
    document.getElementById("ws-detail-close")?.addEventListener("click", () => this.closeDetail());
    document.querySelector(".scmd-modal-backdrop")?.addEventListener("click", () => this.closeDetail());
  }

  private async search(query: string, targetPage = 1) {
    const q = query.trim();
    if (!q || this.searching) return;
    if (query !== this.lastQuery) this.page = 1;
    this.lastQuery = query;
    this.page = Math.max(1, targetPage);
    this.searching = true;
    const resultsEl = document.getElementById("ws-results");
    if (resultsEl) resultsEl.innerHTML = `<div class="scmd-empty">${i18n.t("scmd_loading")}</div>`;
    const section = (document.getElementById("ws-section") as HTMLSelectElement | null)?.value || "readytouseitems";
    const sort = (document.getElementById("ws-sort") as HTMLSelectElement | null)?.value || "textsearch";
    try {
      this.results = await ModService.searchWorkshop(q, this.page, section, sort);
      this.renderResults();
    } catch (err) {
      if (resultsEl) resultsEl.innerHTML = `<div class="scmd-empty text-red-400">${i18n.t("scmd_error_scrape")}</div>`;
      console.error("Workshop arama hatası:", err);
    } finally {
      this.searching = false;
      this.renderPagination();
    }
  }

  private async nextPage() {
    const input = document.getElementById("ws-search") as HTMLInputElement | null;
    const q = input?.value || "";
    if (!q.trim() || this.searching) return;
    await this.search(q, this.page + 1);
    document.getElementById("ws-results")?.scrollTo({ top: 0 });
  }

  private async prevPage() {
    const input = document.getElementById("ws-search") as HTMLInputElement | null;
    const q = input?.value || "";
    if (!q.trim() || this.searching) return;
    await this.search(q, Math.max(1, this.page - 1));
    document.getElementById("ws-results")?.scrollTo({ top: 0 });
  }

  private renderPagination() {
    const el = document.getElementById("ws-pagination");
    if (!el) return;
    const hasQuery = !!((document.getElementById("ws-search") as HTMLInputElement | null)?.value.trim());
    const hasResults = this.results.length > 0;
    el.classList.toggle("hidden", !hasQuery || !hasResults);
    const prev = document.getElementById("ws-prev") as HTMLButtonElement | null;
    const next = document.getElementById("ws-next") as HTMLButtonElement | null;
    const info = document.getElementById("ws-page-info");
    if (prev) prev.disabled = this.page <= 1;
    // Backend her sayfada en fazla 30 sonuç döndürür; 30'dan az geldiyse son sayfadayız
    if (next) next.disabled = this.results.length < 30;
    if (info) info.textContent = `${i18n.t("scmd_page")} ${this.page}`;
  }

  private renderResults() {
    const el = document.getElementById("ws-results");
    if (!el) return;
    if (this.results.length === 0) {
      el.innerHTML = `<div class="scmd-empty">${i18n.t("scmd_empty_results")}</div>`;
      this.renderPagination();
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
    this.renderPagination();
  }

  private addToQueue(id: string) {
    const item = this.results.find((r) => r.id === id);
    if (!item) return;
    this.queue.set(id, { ...item, status: "queued", progress: 0 });
    this.renderResults();
    this.updateBadge();
  }

  private updateBadge() {
    const badge = document.getElementById("queue-badge");
    if (badge) {
      const pending = [...this.queue.values()].filter((i) => i.status !== "done").length;
      badge.textContent = String(pending);
    }
  }

  private async showDetail(id: string) {
    const modal = document.getElementById("ws-detail-modal");
    const titleEl = document.getElementById("ws-detail-modal-title");
    const detailEl = document.getElementById("ws-detail-content");
    if (!modal || !detailEl) return;
    modal.classList.remove("hidden");
    if (titleEl) titleEl.textContent = id;
    detailEl.innerHTML = `<div class="scmd-empty">${i18n.t("scmd_detail_loading")}</div>`;
    try {
      const d: WorkshopDetails = await ModService.getWorkshopDetails(id);
      if (titleEl) titleEl.textContent = d.title || id;
      const images = [d.preview_url, ...d.screenshots].filter(Boolean);
      const gallery = images.length
        ? `<div class="ws-gallery">${images
            .map((src, i) => `<img src="${src}" class="${i === 0 ? "active" : ""}" data-shot="${i}" loading="lazy" onerror="this.remove();" />`)
            .join("")}</div>`
        : "";
      const desc = d.description.replace(/<script[\s\S]*?<\/script>/gi, "");
      detailEl.innerHTML = `
        <div class="space-y-3">
          ${gallery}
          <div class="text-[10px] font-mono text-slate-500">${this.escapeHtml(d.author)} · ID: ${d.id}</div>
          <div class="grid grid-cols-4 gap-2 text-center">
            <div class="ws-stat"><b>${d.score.toFixed(1)}</b><span>${i18n.t("scmd_rating")}</span></div>
            <div class="ws-stat"><b>${this.fmt(d.subscriptions)}</b><span>${i18n.t("scmd_subscriptions")}</span></div>
            <div class="ws-stat"><b>${this.fmtSize(d.file_size)}</b><span>${i18n.t("scmd_size")}</span></div>
            <div class="ws-stat"><b>${this.fmtDate(d.time_updated)}</b><span>${i18n.t("scmd_updated")}</span></div>
          </div>
          <div class="ws-desc">${desc || i18n.t("scmd_no_desc")}</div>
        </div>`;
      const footEl = document.getElementById("ws-detail-foot");
      if (footEl) {
        footEl.innerHTML = `
          <div class="flex gap-2">
            <button id="detail-translate" class="ws-btn flex-1">${i18n.t("scmd_translate")}</button>
            <button id="detail-open" class="ws-btn">${i18n.t("scmd_open_workshop")}</button>
          </div>
          <div class="flex gap-2">
            <button id="detail-queue" class="ws-btn ws-btn-add flex-1">${i18n.t("scmd_add_queue")}</button>
            <button id="detail-install" class="ws-btn ws-btn-primary flex-1">${i18n.t("scmd_install_now")}</button>
          </div>`;
      }
      footEl?.querySelector("#detail-queue")?.addEventListener("click", () => {
        this.queue.set(id, { id, title: d.title, author: d.author, preview_url: d.preview_url, status: "queued", progress: 0 });
        this.updateBadge();
      });
      footEl?.querySelector("#detail-install")?.addEventListener("click", async () => {
        try { await ModService.downloadMod(id); this.onDownloaded(); } catch (err) { this.toast(String(err)); }
      });
      footEl?.querySelector("#detail-open")?.addEventListener("click", () => {
        openUrl(`https://steamcommunity.com/sharedfiles/filedetails/?id=${id}`).catch(() => {});
      });
      // ÇEVİR: dili otomatik algılar; backend başarısızsa tarayıcıda Google Translate açılır
      const translateBtn = footEl?.querySelector("#detail-translate") as HTMLElement | null;
      const descEl = detailEl.querySelector(".ws-desc") as HTMLElement | null;
      let translated = false;
      let originalDescHtml = descEl?.innerHTML || "";
      translateBtn?.addEventListener("click", async () => {
        if (!descEl || !translateBtn) return;
        if (translated) {
          translated = false;
          descEl.innerHTML = originalDescHtml;
          translateBtn.textContent = i18n.t("scmd_translate");
          return;
        }
        originalDescHtml = descEl.innerHTML;
        translateBtn.textContent = i18n.t("scmd_translating");
        try {
          const target = i18n.getCurrentLang() || "tr";
          const out = await ModService.translateText(d.description || d.title || "", target);
          descEl.textContent = out;
          translated = true;
          translateBtn.textContent = i18n.t("scmd_show_original");
        } catch (err) {
          console.error("Çeviri hatası:", err);
          descEl.innerHTML = originalDescHtml;
          translateBtn.textContent = i18n.t("scmd_translate");
          const url = `https://translate.google.com/?sl=auto&tl=${i18n.getCurrentLang() || "tr"}&text=${encodeURIComponent(d.description || d.title || "")}`;
          try { await openUrl(url); } catch (e) { console.error("Google Translate açılamadı:", e); }
        }
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
      .map((item, i) => {
        const busy = item.status === "connecting" || item.status === "downloading";
        const rmBtn = busy ? "" : `<button class="ws-btn ws-btn-danger" data-rm="${item.id}">✕</button>`;
        return `
        <div class="ws-queue-row">
          <span class="ws-queue-idx">${i + 1}</span>
          <img src="${item.preview_url}" onerror="this.remove();" />
          <div class="flex-1 min-w-0">
            <div class="ws-card-title truncate">${this.escapeHtml(item.title) || item.id}</div>
            <div class="ws-card-author">${item.id}</div>
          </div>
          ${this.statusLabel(item)}
          ${rmBtn}
        </div>`;
      })
      .join("");
    el.querySelectorAll<HTMLElement>("[data-rm]").forEach((b) =>
      b.addEventListener("click", () => {
        this.queue.delete(b.dataset.rm || "");
        this.renderQueue();
        this.updateBadge();
      })
    );
  }

  private statusLabel(item: QueueItem): string {
    const cls = `scmd-status st-${item.status}`;
    switch (item.status) {
      case "queued": return `<span class="${cls}">${i18n.t("scmd_st_queued")}</span>`;
      case "connecting": return `<span class="${cls}">${i18n.t("scmd_st_connecting")}</span>`;
      case "downloading": return `<span class="${cls}">${i18n.t("scmd_st_downloading")} %${Math.round(item.progress)}</span>`;
      case "done": return `<span class="${cls}">${i18n.t("scmd_st_done")}</span>`;
      case "error": return `<span class="${cls}">${i18n.t("scmd_st_error")}</span>`;
    }
  }

  private async downloadQueue() {
    if (this.downloading) return;
    const items = [...this.queue.values()].filter((i) => i.status !== "done");
    if (items.length === 0) { this.toast(i18n.t("scmd_empty_queue")); return; }
    this.downloading = true;
    const btn = document.getElementById("btn-download-queue") as HTMLButtonElement | null;
    if (btn) btn.disabled = true;
    for (const item of items) {
      this.currentDownloadId = item.id;
      item.status = "connecting";
      item.progress = 0;
      this.renderQueue();
      this.showProgressBar(true, `${i18n.t("scmd_st_connecting")} ${item.id}`, "connecting");
      try {
        await ModService.downloadMod(item.id);
        item.status = "done";
        item.progress = 100;
        this.onDownloaded();
      } catch (err) {
        item.status = "error";
        this.showProgressBar(true, `${item.id}: ${err}`, "error");
      }
      this.renderQueue();
      this.updateBadge();
    }
    this.currentDownloadId = null;
    this.showProgressBar(false, "");
    this.downloading = false;
    if (btn) btn.disabled = false;
  }

  private closeDetail() {
    document.getElementById("ws-detail-modal")?.classList.add("hidden");
    const content = document.getElementById("ws-detail-content");
    if (content) content.innerHTML = "";
    const foot = document.getElementById("ws-detail-foot");
    if (foot) foot.innerHTML = "";
  }

  private async updateAll() {
    if (this.downloading) return;
    if (this.installed.length === 0) { this.toast(i18n.t("scmd_no_installed")); return; }
    this.downloading = true;
    const btn = document.getElementById("btn-update-all") as HTMLButtonElement | null;
    if (btn) btn.disabled = true;
    try {
      const numericIds: string[] = [];
      for (const m of this.installed) {
        this.showProgressBar(true, `Çözülüyor: ${this.escapeHtml(m.name)}`);
        numericIds.push(await this.resolveWorkshop(m));
      }
      this.showProgressBar(true, i18n.t("scmd_updating"));
      await ModService.updateMods(numericIds);
      this.toast(i18n.t("scmd_update_done"));
    } catch (err) {
      this.toast(String(err));
    }
    this.showProgressBar(false, "");
    this.downloading = false;
    if (btn) btn.disabled = false;
  }

  private async resolveWorkshop(m: InstalledMod): Promise<string> {
    const key = m.id.toLowerCase();
    const cached = this.workshopIds.get(key);
    if (cached) return cached;
    const wid = await ModService.workshopResolve(m.id, m.name);
    this.workshopIds.set(key, wid);
    this.saveWorkshopIds();
    return wid;
  }

  private async resolveAllIds() {
    const btn = document.getElementById("btn-resolve-ids") as HTMLButtonElement | null;
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    try {
      for (const m of this.installed) {
        const key = m.id.toLowerCase();
        if (this.workshopIds.has(key)) continue;
        this.showProgressBar(true, `${i18n.t("scmd_resolving")} ${this.escapeHtml(m.name)}`);
        try {
          await this.resolveWorkshop(m);
        } catch (err) {
          console.warn(`ID çözülemedi ${m.id}:`, err);
        }
        this.showProgressBar(false, "");
        this.renderInstalled();
      }
    } finally {
      btn.disabled = false;
      this.showProgressBar(false, "");
      this.renderInstalled();
    }
  }

  private async updateMod(m: InstalledMod) {
    try {
      const wid = await this.resolveWorkshop(m);
      this.showProgressBar(true, `Güncelleniyor: ${this.escapeHtml(m.name)} (${wid})`);
      await ModService.downloadMod(wid);
      this.toast(i18n.t("scmd_update_done"));
    } catch (err) {
      this.toast(`${m.name}: ${err}`);
    } finally {
      this.showProgressBar(false, "");
    }
  }

  private onDownloaded() {
    this.toast(i18n.t("scmd_download_done"));
    // Yeni indirilen modları Kurulu listesine yansıt
    void this.loadInstalled();
  }

  private async loadInstalled() {
    this.installedLoading = true;
    this.renderInstalled();
    try {
      const { rimworld_mods_path, db_path } = settingsStore.getSettings();
      if (rimworld_mods_path) {
        const storeMods = await ModService.scanMods(rimworld_mods_path, db_path);
        this.installed = (storeMods as any[])
          .map((m) => ({ id: m.package_id, name: m.name || m.package_id, author: m.author || "", version: m.version || "" }))
          .filter((m) => !!m.id);
      } else {
        // Yol ayarlı değilse localStorage önbelleğine düş
        const cached = localStorage.getItem(MODS_CACHE_KEY);
        if (cached) {
          this.installed = (JSON.parse(cached) as any[])
            .map((m) => ({ id: m.package_id, name: m.name || m.package_id, author: m.author || "", version: m.version || "" }))
            .filter((m) => !!m.id);
        }
      }
    } catch (e) {
      console.error("Modlar yüklenirken hata:", e);
    } finally {
      this.installedLoading = false;
      this.renderInstalled();
      this.renderUpdates();
    }
  }

  private loadWorkshopIds() {
    try {
      const raw = localStorage.getItem("rimwordl_workshop_ids");
      if (raw) this.workshopIds = new Map(Object.entries(JSON.parse(raw)));
    } catch (e) {
      console.error("Workshop ID önbelleği okunamadı:", e);
    }
  }

  private saveWorkshopIds() {
    try {
      localStorage.setItem("rimwordl_workshop_ids", JSON.stringify(Object.fromEntries(this.workshopIds)));
    } catch (e) {
      console.error("Workshop ID önbelleği kaydedilemedi:", e);
    }
  }

  private renderInstalled() {
    const el = document.getElementById("installed-list");
    if (!el) return;
    if (this.installedLoading) {
      el.innerHTML = `<div class="scmd-empty">${i18n.t("scmd_loading_installed")}</div>`;
      return;
    }
    if (this.installed.length === 0) {
      el.innerHTML = `<div class="scmd-empty">${i18n.t("scmd_no_installed")}</div>`;
      return;
    }
    el.innerHTML = this.installed
      .map(
        (m) => {
          const wid = this.workshopIds.get(m.id.toLowerCase());
          return `
        <div class="ws-queue-row">
          <div class="flex-1 min-w-0">
            <div class="ws-card-title truncate">${this.escapeHtml(m.name)}</div>
            <div class="ws-card-author">${m.id}${wid ? ` → <span class="text-emerald-400">${wid}</span>` : ""}${m.version ? " · v" + this.escapeHtml(m.version) : ""}</div>
          </div>
          ${wid ? `<span class="scmd-status ok">${i18n.t("scmd_downloaded")}</span>` : ""}
        </div>`;
        }
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
        (m) => {
          const wid = this.workshopIds.get(m.id.toLowerCase());
          return `
        <div class="ws-queue-row">
          <div class="flex-1 min-w-0">
            <div class="ws-card-title truncate">${this.escapeHtml(m.name)}</div>
            <div class="ws-card-author">${m.id}${wid ? ` → <span class="text-emerald-400">${wid}</span>` : ""}</div>
          </div>
          <button class="ws-btn ws-btn-primary" data-upd="${m.id}">${i18n.t("scmd_update")}</button>
        </div>`;
        }
      )
      .join("");
    el.querySelectorAll<HTMLElement>("[data-upd]").forEach((b) =>
      b.addEventListener("click", () => {
        const m = this.installed.find((x) => x.id === b.dataset.upd);
        if (m) void this.updateMod(m);
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
    if (bar) {
      const fill = bar.querySelector("#steamcmd-progress-bar") as HTMLElement | null;
      const info = bar.querySelector("#steamcmd-progress-info");
      if (fill) fill.style.width = `${Math.min(100, payload.progress)}%`;
      if (info) info.textContent = `%${Math.round(payload.progress)} (${payload.speed})`;
    }
    // Sıradaki indirilen öğenin durumunu güncelle
    if (this.currentDownloadId) {
      const item = this.queue.get(this.currentDownloadId);
      if (item) {
        item.status = "downloading";
        item.progress = payload.progress;
        this.renderQueue();
      }
    }
  }

  private showProgressBar(show: boolean, label: string, state: "connecting" | "downloading" | "done" | "error" = "downloading") {
    const bar = document.getElementById("steamcmd-progress");
    if (!bar) return;
    bar.classList.toggle("hidden", !show);
    if (show) {
      bar.dataset.state = state;
      bar.innerHTML = `
        <div class="flex justify-between text-[10px] font-mono mb-1">
          <span class="text-slate-400">${this.escapeHtml(label)}</span>
          <span class="text-slate-500" id="steamcmd-progress-info">%0</span>
        </div>
        <div class="h-2 bg-slate-800 rounded-full overflow-hidden">
          <div id="steamcmd-progress-bar" class="h-full transition-all duration-200" style="width: 0%"></div>
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

  private fmtDate(ts: number): string {
    if (!ts) return "-";
    const d = new Date(ts * 1000);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}.${mm}.${d.getFullYear()}`;
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

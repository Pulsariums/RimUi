import { ModMetadata } from "../../types";
import { modStore } from "../../store";
import { i18n } from "../../services/i18nService";

export class ModDetailPanel {
  private container: HTMLElement;
  /** Şu anda detayı gösterilen mod (toggle sonrası paneli güncellemek için) */
  private currentMod: ModMetadata | null = null;

  constructor(containerId: string) {
    this.container = document.getElementById(containerId) as HTMLElement;
    if (!this.container) throw new Error(`Container ${containerId} not found`);

    // Store değişikliklerini dinle -> eğer bir mod seçiliyse paneli güncelle
    modStore.subscribeActiveMods(() => {
      if (this.currentMod) {
        this.showMod(this.currentMod);
      }
    });
  }

  /** Asset URL'ye dönüştür: Windows yolunu Tauri asset protokolüne çevir (v2 formatı) */
  private toAssetUrl(filePath: string): string {
    // Tauri v2 asset protokolü: http://asset.localhost/<mutlak-yol> (ters slash'lar normal slash yapılır)
    const normalized = filePath.replace(/\\/g, '/');
    return `http://asset.localhost/${encodeURI(normalized)}`;
  }

  public showMod(mod: ModMetadata) {
    this.currentMod = mod;
    const isActive = modStore.getActiveProfileMods().includes(mod.package_id);
    const statusButtonText = isActive ? i18n.t('mod_deactivate') : i18n.t('mod_activate');
    const statusButtonClass = isActive ? "bg-danger hover:bg-red-800" : "bg-rust hover:bg-rust-light";

    // Versiyon gösterimi — undefined/boş ise em dash
    const versionText = mod.version && mod.version.trim() ? mod.version : '\u2014';

    // Preview image HTML — varsa göster
    const previewHtml = mod.preview_path
      ? `<div class="mod-preview-container">
           <img src="${this.toAssetUrl(mod.preview_path)}"
                alt="${mod.name} preview"
                class="mod-preview-image"
                onerror="this.style.display='none';this.parentElement.classList.add('mod-preview-empty')" />
         </div>`
      : '';

    // DLC badge HTML
    const dlcBadgeHtml = mod.isDlc
      ? `<span class="dlc-badge">DLC</span>`
      : '';

    this.container.innerHTML = `
      ${previewHtml}
      <div class="p-3 bg-slate-800 border-b border-slate-700 flex items-start justify-between gap-2 flex-shrink-0">
        <div class="flex items-start gap-2 min-w-0 flex-1">
          <h2 class="text-base font-semibold text-slate-100 break-words hyphens-auto leading-tight">${mod.name}</h2>
          ${dlcBadgeHtml}
          <span class="shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
            isActive
              ? 'bg-rust text-white border border-rust'
              : 'bg-slate-700 text-slate-300 border border-slate-600'
          }">${isActive ? i18n.t('badge_active') : i18n.t('badge_inactive')}</span>
        </div>
        <span class="shrink-0 text-xs px-2 py-1 bg-slate-900 text-rust-light rounded-md border border-slate-700 font-mono">${versionText}</span>
      </div>
      
      <div class="p-3 space-y-3 overflow-y-auto flex-1 min-h-0">
        <div class="border-b border-slate-800 pb-2">
          <span data-i18n="detail_author" class="block text-[10px] uppercase text-slate-500 font-bold mb-0.5">${i18n.t('detail_author')}</span>
          <div class="text-slate-300 text-sm">${mod.author || "Bilinmiyor"}</div>
        </div>

        <div class="border-b border-slate-800 pb-2">
          <span data-i18n="detail_description" class="block text-[10px] uppercase text-slate-500 font-bold mb-0.5">${i18n.t('detail_description')}</span>
          <div class="text-slate-300 text-xs leading-relaxed whitespace-pre-wrap max-h-32 overflow-y-auto">${mod.description || "Açıklama bulunmuyor."}</div>
        </div>

        <div class="border-b border-slate-800 pb-2">
          <span data-i18n="detail_package_id" class="block text-[10px] uppercase text-slate-500 font-bold mb-0.5">${i18n.t('detail_package_id')}</span>
          <div class="font-mono text-[11px] text-slate-400 break-all select-all">${mod.package_id}</div>
        </div>

        <div class="border-b border-slate-800 pb-2">
          <span data-i18n="detail_supported" class="block text-[10px] uppercase text-slate-500 font-bold mb-0.5">${i18n.t('detail_supported')}</span>
          <div class="text-slate-300 text-sm">
            ${mod.supported_versions.length > 0
              ? mod.supported_versions.map(v => `<span class="inline-block bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-xs mr-1 mb-1">${v}</span>`).join("")
              : i18n.t('detail_no_info')}
          </div>
        </div>

        <div class="pb-2">
          <span data-i18n="detail_dependencies" class="block text-[10px] uppercase text-slate-500 font-bold mb-0.5">${i18n.t('detail_dependencies')}</span>
          <div class="text-slate-300 text-xs space-y-0.5">
            ${mod.dependencies.length > 0
              ? mod.dependencies.map(depId => {
                  const depMod = modStore.findMod(depId);
                  return depMod
                    ? `<a href="#" class="text-rust-light hover:underline block truncate" data-mod-id="${depId}">${depMod.name}</a>`
                    : `<span class="text-slate-600 block truncate">${depId} (${i18n.t('detail_missing')})</span>`;
                }).join("")
              : i18n.t('detail_no_deps')}
          </div>
        </div>
      </div>

      <div class="p-3 border-t border-slate-700 flex gap-2 flex-shrink-0">
        <button class="flex-1 px-3 py-2 text-xs text-white rounded-md font-semibold transition-colors duration-200 ${statusButtonClass} detail-btn-toggle-status">${statusButtonText}</button>
        ${mod.url ? `<button class="px-3 py-2 text-xs bg-slate-800 text-slate-200 rounded-md border border-slate-700 hover:bg-slate-700 transition-colors duration-200 font-semibold detail-btn-url inline-flex items-center gap-1.5">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 01-5.656-5.656l1.5-1.5M10.172 13.828a4 4 0 010-5.656l3-3a4 4 0 015.656 5.656l-1.5 1.5"/></svg>
          ${i18n.t('detail_web')}</button>` : ''}
      </div>
    `;

    this.container.querySelector(".detail-btn-url")?.addEventListener("click", () => {
      if (mod.url) window.open(mod.url, "_blank");
    });

    this.container.querySelector(".detail-btn-toggle-status")?.addEventListener("click", () => {
      modStore.toggleMod(mod.package_id);
    });

    this.container.querySelectorAll<HTMLAnchorElement>("[data-mod-id]").forEach(link => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        const modId = link.dataset.modId;
        if (modId) {
          const targetMod = modStore.findMod(modId);
          if (targetMod) {
            this.showMod(targetMod);
          }
        }
      });
    });
  }

  /** Şu anda seçili olan modu döndürür (dışarıdan toggle için) */
  public getCurrentMod(): ModMetadata | null {
    return this.currentMod;
  }

  public clear() {
    this.currentMod = null;
    this.container.innerHTML = `
      <div class="flex flex-col items-center justify-center h-full text-center p-6 text-slate-600">
        <svg class="w-10 h-10 opacity-30 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
        <p class="text-sm">Detayları görmek için bir mod seçin</p>
      </div>
    `;
  }
}

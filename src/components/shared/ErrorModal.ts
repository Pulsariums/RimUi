import { createElement } from "../../utils/dom";

import { modStore } from "../../store/modStore";

export class ErrorModal {
  private element: HTMLElement;
  private title: string;
  private messageContent: string;
  private cycle: string[] | undefined;
  private isExpanded: boolean = false;

  constructor(title: string, message: string, cycle?: string[]) {
    this.title = title;
    this.messageContent = message;
    this.cycle = cycle;
    this.element = createElement("div", "fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center p-4 z-[10001] opacity-0 transition-opacity duration-300");
    
    let cycleHtml = "";
    if (cycle && cycle.length > 0) {
      cycleHtml = `
        <div class="mt-4 p-3 bg-slate-800/60 rounded-md border border-slate-700">
          <h3 class="text-rust-light font-semibold mb-2">Tespit Edilen Döngü:</h3>
          <div class="flex flex-wrap items-center gap-2 text-slate-300 text-sm">
            ${cycle.map((id, i) => {
              const mod = modStore.findMod(id);
              const name = mod ? mod.name : id;
              return `
                <div class="flex items-center bg-slate-900 p-2 rounded border border-slate-700 transition-opacity duration-200">
                  <span class="mr-2">${name}</span>
                  <button data-action="disable-mod" data-mod-id="${id}" class="text-red-400 hover:text-red-300 focus:outline-none" title="Pasife Al">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M18.364 5.636a9 9 0 11-12.728 0m12.728 0L5.636 18.364"/></svg>
                  </button>
                </div>
                ${i < cycle.length - 1 ? '<svg class="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 5l7 7-7 7M5 12h15"/></svg>' : ''}
              `;
            }).join('')}
          </div>
          <button data-action="disable-all-cycle" class="mt-3 w-full py-2 bg-rust text-white rounded-md hover:bg-rust-light text-xs font-medium transition-colors">
            Tümünü Pasife Al
          </button>
        </div>
      `;
    }

    const shortMessage = message.length > 300 ? message.substring(0, 300) + '...' : message;

    this.element.innerHTML = `
      <div class="bg-slate-900 border border-red-900/70 rounded-lg shadow-2xl p-6 w-full max-w-lg transform scale-95 transition-transform duration-300">
        <div class="flex items-center space-x-3 mb-4">
          <svg class="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
          <h2 class="text-xl font-bold text-slate-100">${title}</h2>
        </div>
        <div class="bg-slate-800/60 p-3 rounded-md mb-4 max-h-48 overflow-auto border border-slate-700">
          <p id="error-modal-message" class="text-slate-300 text-sm whitespace-pre-wrap">${shortMessage}</p>
        </div>
        ${cycleHtml}
        <div class="flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-2 mt-6">
          ${message.length > 300 ?
            `<button id="btn-toggle-expand" class="px-4 py-2 bg-slate-700 text-white rounded-md hover:bg-slate-600 border border-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-500 transition-colors duration-200 text-sm">
              <svg id="expand-icon" class="w-3.5 h-3.5 inline-block mr-2 align-text-bottom" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0 0l-5-5M4 16v4m0 0h4m-4 0l5-5m11 5h-4m4 0v-4m0 0l-5 5"/></svg>
              <span id="expand-label">Daha Fazla Göster</span>
            </button>` : ''
          }
          <button id="btn-send-report" class="px-4 py-2 bg-slate-800 text-rust-light rounded-md hover:bg-slate-700 border border-rust/40 focus:outline-none focus:ring-2 focus:ring-rust/50 transition-colors duration-200 text-sm">
            <svg class="w-3.5 h-3.5 inline-block mr-2 align-text-bottom" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>Hata Raporu Gönder
          </button>
          <button id="btn-copy-error" class="px-4 py-2 bg-slate-700 text-white rounded-md hover:bg-slate-600 border border-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-500 transition-colors duration-200 text-sm">
            <svg class="w-3.5 h-3.5 inline-block mr-2 align-text-bottom" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"/></svg>Kopyala
          </button>
          <button id="btn-error-close" class="px-4 py-2 bg-red-700/80 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors duration-200 text-sm">
            <svg class="w-3.5 h-3.5 inline-block mr-2 align-text-bottom" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>Kapat
          </button>
        </div>
      </div>
    `;

    this.element.querySelector("#btn-error-close")?.addEventListener("click", () => this.close());
    this.element.querySelector("#btn-copy-error")?.addEventListener("click", () => this.copyError());
    this.element.querySelector("#btn-send-report")?.addEventListener("click", () => this.sendErrorReport());
    if (message.length > 300) {
      this.element.querySelector("#btn-toggle-expand")?.addEventListener("click", () => this.toggleExpand());
    }

    this.element.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      const actionButton = target.closest("[data-action]");
      if (!actionButton) return;

      const action = actionButton.getAttribute("data-action");
      if (action === "disable-mod") {
        const modId = actionButton.getAttribute("data-mod-id");
        if (modId) {
          modStore.moveModBetweenShelves(modId, false);
          actionButton.closest("div")?.classList.add("opacity-50", "pointer-events-none");
        }
      } else if (action === "disable-all-cycle") {
        if (this.cycle) {
          this.cycle.forEach(id => modStore.moveModBetweenShelves(id, false));
          this.element.querySelectorAll("[data-action='disable-mod']").forEach(btn => {
            btn.closest("div")?.classList.add("opacity-50", "pointer-events-none");
          });
        }
      }
    });
  }

  private copyError() {
    navigator.clipboard.writeText(this.messageContent);
    import("./Toast").then(({ Toast }) => {
      Toast.show("Hata mesajı panoya kopyalandı.", "success");
    });
  }

  private sendErrorReport() {
    const report = {
      title: this.title,
      message: this.messageContent,
      cycle: this.cycle,
      timestamp: new Date().toISOString(),
      system: navigator.userAgent
    };
    console.log("Sending error report:", report);
    import("./Toast").then(({ Toast }) => {
      Toast.show("Hata raporu alındı (geliştirici konsoluna yazıldı).", "info");
    });
  }

  private toggleExpand() {
    const messageElement = this.element.querySelector("#error-modal-message");
    const toggleButton = this.element.querySelector("#btn-toggle-expand");
    const expandLabel = this.element.querySelector("#expand-label");
    if (!messageElement || !toggleButton) return;

    this.isExpanded = !this.isExpanded;
    messageElement.textContent = this.isExpanded ? this.messageContent : this.messageContent.substring(0, 300) + '...';
    if (expandLabel) {
      expandLabel.textContent = this.isExpanded ? "Daha Az Göster" : "Daha Fazla Göster";
    }

    // Aç/kapa ikonunu 180° döndür (expand ↔ compress)
    const expandIcon = toggleButton.querySelector("#expand-icon");
    if (expandIcon) {
      expandIcon.classList.toggle("rotate-180", this.isExpanded);
    }

    // Yükseklik ayarı
    const contentContainer = this.element.querySelector(".bg-slate-800\\/60.p-3");
    if (contentContainer) {
      if (this.isExpanded) {
        contentContainer.classList.remove("max-h-48", "overflow-auto");
        contentContainer.classList.add("max-h-96");
      } else {
        contentContainer.classList.remove("max-h-96");
        contentContainer.classList.add("max-h-48", "overflow-auto");
      }
    }
  }

  public open() {
    document.getElementById("modal-container")?.appendChild(this.element);
    setTimeout(() => {
      this.element.classList.remove("opacity-0");
      this.element.querySelector(".max-w-lg")?.classList.remove("scale-95");
    }, 10);
  }

  public close() {
    this.element.classList.add("opacity-0");
    this.element.querySelector(".max-w-lg")?.classList.add("scale-95");
    setTimeout(() => {
      this.element.remove();
    }, 300);
  }
}

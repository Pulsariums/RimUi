/**
 * DebugConsole — F12 ile açılıp kapanan floating konsol paneli.
 * console.log/warn/error'ları yakalar ve panelde gösterir.
 * Sadece teşhis amaçlıdır, production'da devre dışı bırakılabilir.
 */

interface LogEntry {
  level: "log" | "warn" | "error" | "info";
  args: any[];
  timestamp: string;
}

class DebugConsole {
  private entries: LogEntry[] = [];
  private maxEntries = 500;
  private panel: HTMLElement | null = null;
  private isVisible = false;
  private originalConsole: Partial<typeof console> = {};

  /** Gerçek console fonksiyonlarını override et ve logları yakala */
  public init() {
    // Orijinal fonksiyonları sakla
    this.originalConsole.log = console.log.bind(console);
    this.originalConsole.warn = console.warn.bind(console);
    this.originalConsole.error = console.error.bind(console);
    this.originalConsole.info = console.info.bind(console);

    // Override
    console.log = (...args: any[]) => {
      this.addEntry("log", args);
      this.originalConsole.log?.(...args);
    };
    console.warn = (...args: any[]) => {
      this.addEntry("warn", args);
      this.originalConsole.warn?.(...args);
    };
    console.error = (...args: any[]) => {
      this.addEntry("error", args);
      this.originalConsole.error?.(...args);
    };
    console.info = (...args: any[]) => {
      this.addEntry("info", args);
      this.originalConsole.info?.(...args);
    };

    // F12 tuşu dinleyicisi
    document.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "F12") {
        e.preventDefault();
        this.toggle();
      }
    });

    // Paneli oluştur (gizli)
    this.createPanel();

    console.log("[DebugConsole] F12 ile açılıp kapanan debug konsolu hazır.");
  }

  private addEntry(level: LogEntry["level"], args: any[]) {
    this.entries.push({
      level,
      args: args.map(a => {
        try {
          return typeof a === "object" ? JSON.stringify(a, null, 2) : String(a);
        } catch {
          return String(a);
        }
      }),
      timestamp: new Date().toLocaleTimeString("tr-TR"),
    });

    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }

    // Panel açıkken otomatik scroll
    if (this.isVisible) {
      this.renderLogs();
    }
  }

  private createPanel() {
    this.panel = document.createElement("div");
    this.panel.id = "debug-console-panel";
    this.panel.style.cssText = `
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      height: 40vh;
      background: rgba(10, 10, 15, 0.95);
      border-top: 2px solid #b35d2d;
      z-index: 1200;
      display: none;
      flex-direction: column;
      font-family: 'Courier New', 'Consolas', monospace;
      font-size: 11px;
      color: #c0c5ce;
      backdrop-filter: blur(8px);
    `;

    // Toolbar
    const toolbar = document.createElement("div");
    toolbar.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 4px 12px;
      background: rgba(30, 30, 40, 0.9);
      border-bottom: 1px solid #3a3a4a;
      min-height: 32px;
    `;

    const title = document.createElement("span");
    title.style.cssText = "color: #b35d2d; font-weight: bold; font-size: 10px; letter-spacing: 1px; text-transform: uppercase;";
    title.textContent = "⚡ Debug Console [F12]";

    const controls = document.createElement("div");
    controls.style.cssText = "display: flex; gap: 6px;";

    const clearBtn = this.createToolbarBtn("Temizle", () => {
      this.entries = [];
      this.renderLogs();
    });

    const closeBtn = this.createToolbarBtn("✕", () => this.hide());

    controls.appendChild(clearBtn);
    controls.appendChild(closeBtn);
    toolbar.appendChild(title);
    toolbar.appendChild(controls);
    this.panel.appendChild(toolbar);

    // Log container
    const logContainer = document.createElement("div");
    logContainer.id = "debug-log-container";
    logContainer.style.cssText = `
      flex: 1;
      overflow-y: auto;
      padding: 4px 8px;
      line-height: 1.5;
    `;
    this.panel.appendChild(logContainer);

    document.body.appendChild(this.panel);
  }

  private createToolbarBtn(label: string, onClick: () => void): HTMLElement {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.style.cssText = `
      background: rgba(60, 60, 80, 0.5);
      border: 1px solid #4a4a5a;
      color: #c0c5ce;
      padding: 2px 10px;
      font-size: 10px;
      font-family: inherit;
      cursor: pointer;
      border-radius: 2px;
      transition: background 0.1s;
    `;
    btn.addEventListener("mouseenter", () => { btn.style.background = "rgba(179,93,45,0.3)"; });
    btn.addEventListener("mouseleave", () => { btn.style.background = "rgba(60, 60, 80, 0.5)"; });
    btn.addEventListener("click", onClick);
    return btn;
  }

  private toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  private show() {
    if (!this.panel) return;
    this.isVisible = true;
    this.panel.style.display = "flex";
    this.renderLogs();
  }

  private hide() {
    if (!this.panel) return;
    this.isVisible = false;
    this.panel.style.display = "none";
  }

  private renderLogs() {
    const container = document.getElementById("debug-log-container");
    if (!container) return;

    container.innerHTML = this.entries.map(entry => {
      const color = 
        entry.level === "error" ? "#ff6b6b" :
        entry.level === "warn" ? "#ffd93d" :
        entry.level === "info" ? "#6bcbff" :
        "#c0c5ce";
      
      const badge = entry.level.toUpperCase();
      const args = entry.args.join(" ");

      return `<div style="color: ${color}; padding: 1px 0; word-break: break-all;">
        <span style="color: #666; margin-right: 6px;">[${entry.timestamp}]</span>
        <span style="color: ${color}; font-weight: bold; margin-right: 4px;">${badge}</span>
        <span>${this.escapeHtml(args)}</span>
      </div>`;
    }).join("");

    // En alta scroll
    container.scrollTop = container.scrollHeight;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&")
      .replace(/</g, "<")
      .replace(/>/g, ">")
      .replace(/"/g, "\"");
  }
}

export const debugConsole = new DebugConsole();

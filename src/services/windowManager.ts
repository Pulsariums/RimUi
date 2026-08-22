import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

type WindowLabel = "settings" | "steamcmd";

class WindowManager {
  private windows: Map<WindowLabel, WebviewWindow | null> = new Map();

  private configs: Record<WindowLabel, { url: string; width: number; height: number; title: string }> = {
    settings: {
      url: "/settings.html",
      width: 700,
      height: 550,
      title: "RimWorld Forge - Ayarlar",
    },
    steamcmd: {
      url: "/steamcmd.html",
      width: 900,
      height: 650,
      title: "RimWorld Forge - SteamCMD",
    },
  };

  async open(label: WindowLabel): Promise<void> {
    const existing = this.windows.get(label);
    if (existing) {
      try {
        await existing.setFocus();
        return;
      } catch {
        this.windows.set(label, null);
      }
    }

    const cfg = this.configs[label];
    try {
      const webview = new WebviewWindow(label, {
        url: cfg.url,
        title: cfg.title,
        width: cfg.width,
        height: cfg.height,
        minWidth: Math.round(cfg.width * 0.6),
        minHeight: Math.round(cfg.height * 0.6),
        resizable: true,
        decorations: false,
      });

      webview.once("tauri://created", () => {
        this.windows.set(label, webview);
      });

      webview.once("tauri://error", (e) => {
        console.error(`Pencere hatasi (${label}):`, e);
        this.windows.set(label, null);
      });
    } catch (e) {
      console.error(`Pencere olusturulamadi (${label}):`, e);
    }
  }
}

export const windowManager = new WindowManager();
